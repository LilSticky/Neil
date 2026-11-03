import type { BaseMessageOptions } from "discord.js";
import { canSendFor, utcDayOf, type DailyQuota, type RequestPurpose } from "../domain/daily-quota.js";
import {
  isDue,
  planSync,
  playerFromRoster,
  rankAfterSync,
  type AllianceRef,
  type LastAlliance,
  type SyncLink,
  type SyncStep,
} from "../domain/daily-sync.js";
import { parseAllianceKey, type AllianceKey, type KingdomNumber, type Uid } from "../domain/lookup-input.js";
import type { Alliance, LookupResult, Player } from "../domain/player.js";
import type { MemberId } from "../domain/rank-approval.js";
import type { AppliedStore } from "../storage/applied-store.js";
import type { DailySyncStore } from "../storage/daily-sync-store.js";
import type { LinkStore } from "../storage/link-store.js";
import type { ServerMember, ServerMembers, SyncNameAndRoles } from "./name-and-roles.js";
import { nameAndRolesNotAppliedLogLine } from "./name-and-roles-texts.js";
import type { Schedule } from "./interview-sweeper.js";
import type { Unlink } from "./unlink.js";

/** How often the Daily Sync checks whether it is due: a run missed at its hour starts at the next check. */
const CHECK_EVERY_MS = 10 * 60_000;

/** The part of the Game API client the Daily Sync uses: the rosters, the uid lookups and the Daily Quota figures. */
export interface DailySyncGameApi {
  getAlliance(kingdom: KingdomNumber, key: AllianceKey, purpose: RequestPurpose): Promise<LookupResult<Alliance>>;
  getPlayer(uid: Uid, purpose: RequestPurpose): Promise<LookupResult<Player>>;
  quotaToday(): DailyQuota;
}

/** What a Daily Sync run needs: the stores, the server, the Game API, the name and roles, the Sync Share and the log. */
export interface DailySyncDeps {
  readonly links: Pick<LinkStore, "all" | "linkFor">;
  readonly applied: Pick<AppliedStore, "get">;
  readonly runs: Pick<DailySyncStore, "load" | "save">;
  readonly members: ServerMembers;
  readonly gameApi: DailySyncGameApi;
  readonly nameAndRoles: SyncNameAndRoles;
  /** Ends the Link of a Linked Member who is not on the server any more, as missing. */
  readonly unlink: Unlink;
  /** The most Game API requests one run may send, retries included; from SYNC_SHARE. */
  readonly share: number;
  /** Requests kept back for Onboarding Interviews; the Daily Sync stops at this reserve like a lookup does. */
  readonly quotaReserve: number;
  /** Aborted to stop the run: it sends no further request, saves what is left over and logs its summary. */
  readonly signal?: AbortSignal;
  readonly log: (message: BaseMessageOptions) => Promise<void>;
  readonly logError: (line: string) => void;
  readonly now: () => Date;
}

/** What one run did: the Members changed and skipped. The requests are counted from the Daily Quota. */
interface RunCounts {
  changed: number;
  skipped: number;
}

/** A Linked Member on the server, fetched once for the run. */
interface PresentMember {
  readonly link: SyncLink;
  readonly server: ServerMember;
}

/**
 * Runs the Daily Sync once: each Linked Member on the server is checked against the Game API, by one roster request per
 * Alliance or by a uid lookup, within the Sync Share and above the Quota Reserve. The day is recorded before the first
 * request, and the Members not reached are left over for the next day. Stops at an outage (unavailable, try-again or
 * not prepared) or an abort, and logs its summary. Rejects only when Discord cannot be reached.
 */
export async function runDailySync(deps: DailySyncDeps): Promise<void> {
  const now = deps.now();
  const day = utcDayOf(now);
  const syncLinks: SyncLink[] = deps.links.all().map((link) => ({
    memberId: link.memberId,
    uid: link.uid,
    lastAlliance: lastAllianceOf(deps.applied.get(link.memberId)),
  }));
  const steps = planSync(syncLinks, deps.runs.load()?.leftOver ?? []);
  // Every planned Member is left over until reached, so a run cut short is not repeated today and its Members come first.
  const pending = new Set<MemberId>(steps.flatMap(linksOf).map((link) => link.memberId));
  deps.runs.save({ day, leftOver: [...pending] });

  const counts: RunCounts = { changed: 0, skipped: 0 };
  // Requests are counted by the Daily Quota's used figure, so a retry inside a call counts as the request it is.
  const usedAtStart = deps.gameApi.quotaToday().used;
  const requestsSent = (): number => Math.max(0, deps.gameApi.quotaToday().used - usedAtStart);
  const mayRequest = (): boolean =>
    requestsSent() < deps.share &&
    deps.signal?.aborted !== true &&
    canSendFor(deps.gameApi.quotaToday(), "sync", deps.quotaReserve);

  /** Applies the Player to a reached Member: the rank is worked out from the Link as it is now and the Alliance last applied. */
  const apply = async (present: PresentMember, player: Player): Promise<void> => {
    const { link, server } = present;
    const current = deps.links.linkFor(link.memberId);
    if (current !== undefined) {
      const rank = rankAfterSync(current.allianceRank, link.lastAlliance, player);
      if (await deps.nameAndRoles.syncMember(link.memberId, player, rank, server)) counts.changed += 1;
    }
    pending.delete(link.memberId);
  };

  /** Fetches the Member; one who is not on the server is Unlinked as missing and leaves the run. */
  const present = async (link: SyncLink): Promise<PresentMember | undefined> => {
    const server = await deps.members.memberOf(link.memberId);
    if (server !== undefined) return { link, server };
    await deps.unlink.unlink({ id: link.memberId }, "missing");
    counts.skipped += 1;
    pending.delete(link.memberId);
    return undefined;
  };

  /** Looks one Member up by uid. Returns false when the run must stop. */
  const lookUp = async (member: PresentMember): Promise<boolean> => {
    if (!mayRequest()) return false;
    const result = await deps.gameApi.getPlayer(member.link.uid, "sync");
    if (result.kind === "found") {
      await apply(member, result.value);
      return true;
    }
    if (result.kind === "not-found") {
      counts.skipped += 1;
      pending.delete(member.link.memberId);
      await deps.log(nameAndRolesNotAppliedLogLine(member.link.memberId));
      return true;
    }
    return false;
  };

  /** One roster request for the Alliance, applied to the Members on the server it lists. Returns false when the run must stop. */
  const readRoster = async (alliance: AllianceRef, links: readonly SyncLink[], fallbacks: PresentMember[]): Promise<boolean> => {
    const members: PresentMember[] = [];
    for (const link of links) {
      const member = await present(link);
      if (member !== undefined) members.push(member);
    }
    if (members.length === 0) return true;
    const key = parseAllianceKey(alliance.tag);
    if (!key.ok) {
      fallbacks.push(...members);
      return true;
    }
    if (!mayRequest()) return false;
    const result = await deps.gameApi.getAlliance(alliance.kingdom, key.value, "sync");
    if (result.kind === "not-found") {
      fallbacks.push(...members);
      return true;
    }
    if (result.kind !== "found") return false;
    for (const member of members) {
      const entry = result.value.roster.find((row) => row.uid === member.link.uid);
      const player = entry === undefined ? undefined : playerFromRoster(result.value, entry);
      if (player === undefined) fallbacks.push(member);
      else await apply(member, player);
    }
    return true;
  };

  /** A uid step: the Member is fetched, then looked up when present. Returns false when the run must stop. */
  const uidStep = async (link: SyncLink): Promise<boolean> => {
    const member = await present(link);
    return member === undefined ? true : lookUp(member);
  };

  // The steps in their planned order; the Members a roster does not give are looked up by uid after them.
  const fallbacks: PresentMember[] = [];
  let stopped = false;
  for (const step of steps) {
    const going = step.kind === "roster" ? await readRoster(step.alliance, step.links, fallbacks) : await uidStep(step.link);
    if (!going) {
      stopped = true;
      break;
    }
  }
  for (const member of stopped ? [] : fallbacks) {
    if (!(await lookUp(member))) break;
  }

  const leftOver = [...pending];
  deps.runs.save({ day, leftOver });
  const summary = { changed: counts.changed, skipped: counts.skipped, requests: requestsSent() };
  await deps.log(summaryLine(day, summary, leftOver.length));
}

/** The Alliance a Member was last applied in: none when there is no Applied State, which is unrecorded. */
function lastAllianceOf(state: { readonly alliance?: LastAlliance | undefined } | undefined): LastAlliance {
  return state === undefined ? "unrecorded" : state.alliance;
}

function linksOf(step: SyncStep): readonly SyncLink[] {
  return step.kind === "roster" ? step.links : [step.link];
}

function summaryLine(day: string, counts: { changed: number; skipped: number; requests: number }, left: number): BaseMessageOptions {
  const requests = `${counts.requests.toString()} ${counts.requests === 1 ? "request" : "requests"}`;
  return {
    content: `📅 Daily Sync for ${day} (UTC): ${counts.changed.toString()} changed, ${counts.skipped.toString()} skipped, ${requests}, ${left.toString()} left.`,
    allowedMentions: { parse: [] },
  };
}

/**
 * Starts the Daily Sync: a check now and every 10 minutes after, each running the Daily Sync when it is due (the Sync hour
 * has come and today's run is not recorded). Runs never overlap. Returns the function that stops the checks: it ends a run
 * in progress before its next request, and resolves once that run has ended.
 */
export function startDailySync(deps: DailySyncDeps, syncHourUtc: number, schedule: Schedule): () => Promise<void> {
  const stopping = new AbortController();
  let running: Promise<void> | undefined = undefined;
  const check = (): void => {
    if (running !== undefined || stopping.signal.aborted) return;
    try {
      if (!isDue(deps.runs.load()?.day, deps.now(), syncHourUtc)) return;
    } catch (error) {
      deps.logError(`Checking the Daily Sync failed: ${reasonOf(error)}`);
      return;
    }
    running = runDailySync({ ...deps, signal: stopping.signal })
      .catch((error: unknown) => {
        deps.logError(`The Daily Sync failed: ${reasonOf(error)}`);
      })
      .finally(() => {
        running = undefined;
      });
  };
  check();
  const stopTimer = schedule(check, CHECK_EVERY_MS);
  return async () => {
    stopTimer();
    stopping.abort();
    await running;
  };
}

function reasonOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
