import type { BaseMessageOptions } from "discord.js";
import { canSendFor, utcDayOf, type DailyQuota, type RequestPurpose } from "../domain/daily-quota.js";
import {
  isDue,
  planSync,
  playerFromRoster,
  rankAfterSync,
  type SyncLink,
} from "../domain/daily-sync.js";
import type { Link } from "../domain/link.js";
import { parseAllianceKey, type AllianceKey, type KingdomNumber, type Uid } from "../domain/lookup-input.js";
import type { Alliance, LookupResult, Player } from "../domain/player.js";
import type { MemberId } from "../domain/rank-approval.js";
import type { AppliedStore } from "../storage/applied-store.js";
import type { DailySyncStore } from "../storage/daily-sync-store.js";
import type { LinkStore } from "../storage/link-store.js";
import type { ServerMembers, SyncNameAndRoles } from "./name-and-roles.js";
import { nameAndRolesNotAppliedLogLine } from "./name-and-roles-texts.js";
import type { Schedule } from "./interview-sweeper.js";

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
  readonly links: Pick<LinkStore, "all">;
  readonly applied: Pick<AppliedStore, "get">;
  readonly runs: Pick<DailySyncStore, "load" | "save">;
  readonly members: ServerMembers;
  readonly gameApi: DailySyncGameApi;
  readonly nameAndRoles: SyncNameAndRoles;
  /** The most Game API requests one run may send; from SYNC_SHARE. */
  readonly share: number;
  /** Requests kept back for Onboarding Interviews; the Daily Sync stops at this reserve like a lookup does. */
  readonly quotaReserve: number;
  readonly log: (message: BaseMessageOptions) => Promise<void>;
  readonly logError: (line: string) => void;
  readonly now: () => Date;
}

/** What one run did: the Members changed, the Members skipped, the requests sent. */
interface RunCounts {
  changed: number;
  skipped: number;
  requests: number;
}

/**
 * Runs the Daily Sync once: each Linked Member on the server is checked against the Game API, by one roster request per
 * Alliance or by a uid lookup, within the Sync Share and above the Quota Reserve. The Members not reached are left for the
 * next day, and the record of the run is saved before its summary is logged. Rejects only when Discord cannot be reached.
 */
export async function runDailySync(deps: DailySyncDeps): Promise<void> {
  const now = deps.now();
  const links = deps.links.all();
  const linkById = new Map<MemberId, Link>(links.map((link) => [link.memberId, link]));
  const syncLinks: SyncLink[] = links.map((link) => ({
    memberId: link.memberId,
    uid: link.uid,
    lastAlliance: deps.applied.get(link.memberId)?.alliance,
  }));
  const plan = planSync(syncLinks, deps.runs.load()?.leftOver ?? []);
  const pending = new Set<MemberId>([
    ...plan.rosters.flatMap((group) => group.links.map((link) => link.memberId)),
    ...plan.byUid.map((link) => link.memberId),
  ]);
  const counts: RunCounts = { changed: 0, skipped: 0, requests: 0 };
  const mayRequest = (): boolean =>
    counts.requests < deps.share && canSendFor(deps.gameApi.quotaToday(), "sync", deps.quotaReserve);

  /** Applies a Player to a Linked Member: the rank is worked out from the Link and the Alliance last applied. */
  const apply = async (link: SyncLink, player: Player): Promise<void> => {
    const current = linkById.get(link.memberId);
    if (current !== undefined) {
      const rank = rankAfterSync(current.allianceRank, link.lastAlliance, player);
      if (await deps.nameAndRoles.syncMember(link.memberId, player, rank)) counts.changed += 1;
    }
    pending.delete(link.memberId);
  };

  // The Members of each Alliance: one roster request for those on the server; the ones the roster does not give follow.
  const fallbacks: SyncLink[] = [];
  let stopped = false;
  for (const group of plan.rosters) {
    const candidates = await onServer(deps, group.links, pending, counts);
    if (candidates.length === 0) continue;
    const key = parseAllianceKey(group.alliance.tag);
    if (!key.ok) {
      fallbacks.push(...candidates);
      continue;
    }
    if (!mayRequest()) {
      stopped = true;
      break;
    }
    counts.requests += 1;
    const result: LookupResult<Alliance> = await deps.gameApi.getAlliance(group.alliance.kingdom, key.value, "sync");
    if (result.kind !== "found") {
      fallbacks.push(...candidates);
      continue;
    }
    for (const link of candidates) {
      const entry = result.value.roster.find((row) => row.uid === link.uid);
      const player = entry === undefined ? undefined : playerFromRoster(result.value, entry);
      if (player === undefined) fallbacks.push(link);
      else await apply(link, player);
    }
  }

  // The uid lookups: the Members in no Alliance at their last apply, then those the rosters did not give.
  for (const link of stopped ? [] : [...plan.byUid, ...fallbacks]) {
    const [present] = await onServer(deps, [link], pending, counts);
    if (present === undefined) continue;
    if (!mayRequest()) break;
    counts.requests += 1;
    const result = await deps.gameApi.getPlayer(link.uid, "sync");
    if (result.kind === "found") {
      await apply(link, result.value);
    } else if (result.kind === "quota-spent" || result.kind === "reserve-kept") {
      break;
    } else {
      counts.skipped += 1;
      pending.delete(link.memberId);
      await deps.log(nameAndRolesNotAppliedLogLine(link.memberId));
    }
  }

  const leftOver = [...pending];
  deps.runs.save({ day: utcDayOf(now), leftOver });
  await deps.log(summaryLine(utcDayOf(now), counts, leftOver.length));
}

/**
 * The links whose Member is on the server, in order. A Member not on it is skipped, with no request for them, and leaves
 * the run's work.
 */
async function onServer(
  deps: DailySyncDeps,
  links: readonly SyncLink[],
  pending: Set<MemberId>,
  counts: RunCounts,
): Promise<SyncLink[]> {
  const present: SyncLink[] = [];
  for (const link of links) {
    if ((await deps.members.memberOf(link.memberId)) === undefined) {
      counts.skipped += 1;
      pending.delete(link.memberId);
    } else {
      present.push(link);
    }
  }
  return present;
}

function summaryLine(day: string, counts: RunCounts, left: number): BaseMessageOptions {
  const requests = `${counts.requests.toString()} ${counts.requests === 1 ? "request" : "requests"}`;
  return {
    content: `📅 Daily Sync for ${day} (UTC): ${counts.changed.toString()} changed, ${counts.skipped.toString()} skipped, ${requests}, ${left.toString()} left.`,
    allowedMentions: { parse: [] },
  };
}

/**
 * Starts the Daily Sync: a check now and every 10 minutes after, each running the Daily Sync when it is due (the Sync hour
 * has come and today's run is not recorded). Runs never overlap. Returns the function that stops the checks.
 */
export function startDailySync(deps: DailySyncDeps, syncHourUtc: number, schedule: Schedule): () => void {
  let running = false;
  const check = (): void => {
    if (running) return;
    try {
      if (!isDue(deps.runs.load()?.day, deps.now(), syncHourUtc)) return;
    } catch (error) {
      deps.logError(`Checking the Daily Sync failed: ${reasonOf(error)}`);
      return;
    }
    running = true;
    void runDailySync(deps)
      .catch((error: unknown) => {
        deps.logError(`The Daily Sync failed: ${reasonOf(error)}`);
      })
      .finally(() => {
        running = false;
      });
  };
  check();
  return schedule(check, CHECK_EVERY_MS);
}

function reasonOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
