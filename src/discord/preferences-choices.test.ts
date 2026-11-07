import { MessageFlags, type BaseMessageOptions } from "discord.js";
import { describe, expect, test, vi } from "vitest";
import type { Link, RankOnLink } from "../domain/link.js";
import { parseKingdom, parseUid, type KingdomNumber, type Uid } from "../domain/lookup-input.js";
import {
  EMPTY_PREFERENCES,
  type ExperienceKey,
  type GameLanguageCode,
  type InterestKey,
  type PreferenceStep,
  type Preferences,
  type RegionKey,
} from "../domain/preferences.js";
import type { MemberId, RankApproval } from "../domain/rank-approval.js";
import type { AppliedState, AppliedStore } from "../storage/applied-store.js";
import type { LinkStore } from "../storage/link-store.js";
import type { PreferencePrompt, PreferenceStore } from "../storage/preference-store.js";
import type { OnboardingChannels } from "./onboarding-channels.js";
import type { PrivateReply } from "./interview-texts.js";
import { FakeOnboardingRole, type OnboardingRoleCall } from "./__fakes__/onboarding-role.js";
import type { PreferenceRoles } from "./preferences.js";
import { createPreferenceChoices } from "./preferences-choices.js";
import {
  guestChannelsReply,
  guidesLine,
  notLinkedReply,
  notYoursReply,
  preferenceGoCustomId,
  preferenceStepMessage,
  preferencesCustomId,
  preferencesFailedReply,
  preferencesLogLine,
  type PreferenceQuestion,
} from "./preferences-texts.js";

const ALICE: MemberId = "111111111111111111";
const BOB: MemberId = "222222222222222222";
const APPROVER: MemberId = "555555555555555555";
const ALICE_THREAD = "333333333333333301";
const BOB_THREAD = "333333333333333302";
const GUIDES_FORUM = "444444444444444401";
const NOW = new Date("2026-11-04T10:00:00Z");

const R3: RankOnLink = { source: "game-api", rank: "R3" };
const R4: RankOnLink = { source: "game-api", rank: "R4" };

function uidOf(digits: string): Uid {
  const parsed = parseUid(digits);
  if (!parsed.ok) throw new Error(`the test uid ${digits} is not a valid uid`);
  return parsed.value;
}

const ALICE_UID = uidOf("145563254785");

function kingdomOf(digits: number): KingdomNumber {
  const parsed = parseKingdom(digits);
  if (!parsed.ok) throw new Error(`the test Kingdom ${digits.toString()} is not a valid Kingdom`);
  return parsed.value;
}

const HOME_KINGDOM = kingdomOf(330);

function linkOf(memberId: MemberId, allianceRank: RankOnLink): Link {
  return { memberId, uid: ALICE_UID, linkedAt: NOW, allianceRank, madeBy: { kind: "in-game-proof" } };
}

function preferencesWith(changes: Partial<Preferences>): Preferences {
  return { ...EMPTY_PREFERENCES, ...changes };
}

function languages(...codes: GameLanguageCode[]): ReadonlySet<GameLanguageCode> {
  return new Set<GameLanguageCode>(codes);
}

function interests(...keys: InterestKey[]): ReadonlySet<InterestKey> {
  return new Set<InterestKey>(keys);
}

/** The store the choices write to: records every write, in the shared trace, and can be made to fail one write. */
class FakeChoicesStore
  implements Pick<PreferenceStore, "get" | "setLanguages" | "setRegion" | "setInterests" | "setExperience" | "prompt" | "closePrompt">
{
  /** Every write asked for, by method name, in order. */
  readonly writes: string[] = [];
  failOn: string | undefined = undefined;
  private readonly stored = new Map<MemberId, Preferences>();
  private readonly prompts = new Map<MemberId, PreferencePrompt>();

  constructor(private readonly trace: string[]) {}

  set(memberId: MemberId, preferences: Preferences): void {
    this.stored.set(memberId, preferences);
  }

  openPrompt(memberId: MemberId, threadId: string): void {
    this.prompts.set(memberId, { threadId, postedAt: NOW });
  }

  get(memberId: MemberId): Preferences {
    return this.stored.get(memberId) ?? EMPTY_PREFERENCES;
  }

  setLanguages(memberId: MemberId, value: ReadonlySet<GameLanguageCode>): void {
    this.write("setLanguages", memberId, { languages: new Set(value) });
  }

  setRegion(memberId: MemberId, value: RegionKey | undefined): void {
    this.write("setRegion", memberId, { region: value });
  }

  setInterests(memberId: MemberId, value: ReadonlySet<InterestKey>): void {
    this.write("setInterests", memberId, { interests: new Set(value) });
  }

  setExperience(memberId: MemberId, value: ExperienceKey | undefined): void {
    this.write("setExperience", memberId, { experience: value });
  }

  prompt(memberId: MemberId): PreferencePrompt | undefined {
    return this.prompts.get(memberId);
  }

  closePrompt(memberId: MemberId): void {
    this.trace.push("store.closePrompt");
    this.prompts.delete(memberId);
  }

  private write(method: string, memberId: MemberId, changes: Partial<Preferences>): void {
    if (this.failOn === method) throw new Error(`${method} refused`);
    this.writes.push(method);
    this.trace.push(`store.${method}`);
    this.set(memberId, { ...this.get(memberId), ...changes });
  }
}

/** The Preference Roles as the choices use them: records every apply and forget. */
class FakeRoles implements PreferenceRoles {
  readonly applied: MemberId[] = [];

  constructor(private readonly trace: string[]) {}

  apply(memberId: MemberId): Promise<void> {
    this.trace.push("roles.apply");
    this.applied.push(memberId);
    return Promise.resolve();
  }

  forget(): Promise<void> {
    return Promise.reject(new Error("the choices never forget the Preference Roles"));
  }
}

/** The Links and the pending Rank Approvals, as the choices look them up. */
class FakeLinks implements Pick<LinkStore, "linkFor" | "pendingFor"> {
  private readonly links = new Map<MemberId, Link>();
  private readonly pending = new Map<MemberId, RankApproval>();

  link(link: Link): void {
    this.links.set(link.memberId, link);
  }

  pendingApproval(memberId: MemberId): void {
    this.pending.set(memberId, {
      state: "pending",
      id: 1,
      linkedMemberId: memberId,
      threadId: ALICE_THREAD,
      approver: { kind: "member", memberId: APPROVER },
      askedAt: NOW,
    });
  }

  linkFor(memberId: MemberId): Link | undefined {
    return this.links.get(memberId);
  }

  pendingFor(memberId: MemberId): RankApproval | undefined {
    return this.pending.get(memberId);
  }
}

/** The onboarding channels as the choices use them: records log lines and deleted threads; can refuse a delete. */
class FakeChannels implements Pick<OnboardingChannels, "log" | "deleteThread"> {
  readonly logs: BaseMessageOptions[] = [];
  readonly deleted: string[] = [];
  failDelete = false;

  constructor(private readonly trace: string[]) {}

  log(message: BaseMessageOptions): Promise<void> {
    this.logs.push(message);
    return Promise.resolve();
  }

  deleteThread(threadId: string): Promise<void> {
    this.trace.push("channels.deleteThread");
    if (this.failDelete) return Promise.reject(new Error("Discord refused to delete the thread"));
    this.deleted.push(threadId);
    return Promise.resolve();
  }
}

/** A press on a Preferences component, as the choices see it: its answers recorded, with the trace of the update. */
class FakePress {
  readonly replies: { readonly content: string; readonly components?: unknown }[] = [];
  readonly updates: BaseMessageOptions[] = [];

  constructor(
    private readonly trace: string[],
    readonly customId: string,
    readonly user: { readonly id: MemberId },
    readonly values?: readonly string[] | undefined,
  ) {}

  reply(message: { readonly content: string; readonly components?: unknown }): Promise<void> {
    this.replies.push(message);
    return Promise.resolve();
  }

  update(options: BaseMessageOptions): Promise<void> {
    this.trace.push("press.update");
    this.updates.push(options);
    return Promise.resolve();
  }
}

/** The Applied States the choices read: records the roles last applied to a Member, as their Applied State holds them. */
class FakeApplied implements Pick<AppliedStore, "get"> {
  private readonly states = new Map<MemberId, AppliedState>();

  record(memberId: MemberId, roles: readonly string[]): void {
    this.states.set(memberId, { memberId, nickname: "Vex", roles, appliedAt: NOW, complete: true });
  }

  get(memberId: MemberId): AppliedState | undefined {
    return this.states.get(memberId);
  }
}

function setUp() {
  const trace: string[] = [];
  const store = new FakeChoicesStore(trace);
  const roles = new FakeRoles(trace);
  const links = new FakeLinks();
  const applied = new FakeApplied();
  const channels = new FakeChannels(trace);
  const logError = vi.fn<(line: string) => void>();
  const onboardingRole = new FakeOnboardingRole();
  const choices = createPreferenceChoices({
    roles,
    preferences: store,
    links,
    rankApprovals: links,
    applied,
    homeKingdom: HOME_KINGDOM,
    channels,
    onboardingRole,
    guidesForumId: GUIDES_FORUM,
    logError,
  });
  /** A Linked Member at the given rank, with nothing chosen yet unless preferences are given. */
  const linkAlice = (allianceRank: RankOnLink = R3): void => {
    links.link(linkOf(ALICE, allianceRank));
  };
  const selectOf = (question: PreferenceQuestion, values: readonly string[], userId: MemberId = ALICE): FakePress =>
    new FakePress(trace, preferencesCustomId(question, ALICE), { id: userId }, values);
  const doneOf = (userId: MemberId = ALICE): FakePress =>
    new FakePress(trace, preferencesCustomId("done", ALICE), { id: userId });
  const goOf = (step: PreferenceStep, userId: MemberId = ALICE): FakePress =>
    new FakePress(trace, preferenceGoCustomId(step, ALICE), { id: userId });
  return { trace, store, roles, links, applied, channels, onboardingRole, logError, choices, linkAlice, selectOf, doneOf, goOf };
}

describe("a select change", () => {
  test("saves the languages picked as a set", async () => {
    const { store, linkAlice, selectOf, choices } = setUp();
    linkAlice();

    await choices.press(selectOf("languages", ["de", "en"]));

    expect(store.get(ALICE).languages).toEqual(languages("de", "en"));
    expect(store.writes).toEqual(["setLanguages"]);
  });

  test("saves the interests picked as a set", async () => {
    const { store, linkAlice, selectOf, choices } = setUp();
    linkAlice();

    await choices.press(selectOf("interests", ["pvp", "recruitment"]));

    expect(store.get(ALICE).interests).toEqual(interests("pvp", "recruitment"));
    expect(store.writes).toEqual(["setInterests"]);
  });

  test("ignores the old Trading value: an Interest no longer offered is not saved", async () => {
    const { store, linkAlice, selectOf, choices } = setUp();
    linkAlice();

    await choices.press(selectOf("interests", ["pvp", "trading"]));

    expect(store.get(ALICE).interests).toEqual(interests("pvp"));
  });

  test("saves an emptied region as no region", async () => {
    const { store, linkAlice, selectOf, choices } = setUp();
    linkAlice();
    store.set(ALICE, preferencesWith({ region: "americas" }));

    await choices.press(selectOf("region", []));

    expect(store.get(ALICE).region).toBeUndefined();
    expect(store.writes).toEqual(["setRegion"]);
  });

  test("saves the experience picked", async () => {
    const { store, linkAlice, selectOf, choices } = setUp();
    linkAlice();

    await choices.press(selectOf("experience", ["veteran"]));

    expect(store.get(ALICE).experience).toBe("veteran");
    expect(store.writes).toEqual(["setExperience"]);
  });

  test("ignores values that are not in the domain lists", async () => {
    const { store, linkAlice, selectOf, choices } = setUp();
    linkAlice();

    await choices.press(selectOf("languages", ["de", "klingon"]));

    expect(store.get(ALICE).languages).toEqual(languages("de"));
  });

  test("applies the Preference Roles at the Member's Alliance Rank", async () => {
    const { roles, linkAlice, selectOf, choices } = setUp();
    linkAlice(R4);

    await choices.press(selectOf("interests", ["nap"]));

    expect(roles.applied).toEqual([ALICE]);
  });

  test("logs one Preferences line after the change", async () => {
    const { channels, linkAlice, selectOf, choices } = setUp();
    linkAlice();

    await choices.press(selectOf("languages", ["en"]));

    expect(channels.logs).toEqual([preferencesLogLine(ALICE, preferencesWith({ languages: languages("en") }))]);
  });

  test("re-renders the same step with the new answer, not the four-menu message", async () => {
    const { linkAlice, selectOf, choices } = setUp();
    linkAlice();
    const press = selectOf("languages", ["en"]);

    await choices.press(press);

    expect(press.updates).toEqual([
      preferenceStepMessage({
        memberId: ALICE,
        step: "languages",
        preferences: preferencesWith({ languages: languages("en") }),
        rank: "R3",
        playerLanguage: undefined,
        guidesForumId: GUIDES_FORUM,
      }),
    ]);
  });

  test("re-renders the Interests step when an Interest is picked there", async () => {
    const { linkAlice, selectOf, choices } = setUp();
    linkAlice();
    const press = selectOf("interests", ["pvp"]);

    await choices.press(press);

    expect(press.updates).toEqual([
      preferenceStepMessage({
        memberId: ALICE,
        step: "interests",
        preferences: preferencesWith({ interests: interests("pvp") }),
        rank: "R3",
        playerLanguage: undefined,
        guidesForumId: GUIDES_FORUM,
      }),
    ]);
  });

  test("shows the guides line when Veteran is picked", async () => {
    const { linkAlice, selectOf, choices } = setUp();
    linkAlice();
    const press = selectOf("experience", ["veteran"]);

    await choices.press(press);

    expect(press.updates[0]?.content).toContain(guidesLine("veteran", GUIDES_FORUM));
  });

  test("shows the guides line when New is picked", async () => {
    const { linkAlice, selectOf, choices } = setUp();
    linkAlice();
    const press = selectOf("experience", ["new"]);

    await choices.press(press);

    expect(press.updates[0]?.content).toContain(guidesLine("new", GUIDES_FORUM));
  });
});

describe("a go press", () => {
  test("shows that step built from the stored answers", async () => {
    const { store, linkAlice, goOf, choices } = setUp();
    linkAlice(R3);
    const preferences = preferencesWith({ languages: languages("de"), interests: interests("pvp") });
    store.set(ALICE, preferences);
    const press = goOf("region");

    await choices.press(press);

    expect(press.replies).toEqual([]);
    expect(press.updates).toEqual([
      preferenceStepMessage({
        memberId: ALICE,
        step: "region",
        preferences,
        rank: "R3",
        playerLanguage: undefined,
        guidesForumId: GUIDES_FORUM,
      }),
    ]);
  });

  test("changes nothing: no save, no Preference Role change, no log line", async () => {
    const { store, roles, channels, linkAlice, goOf, choices, trace } = setUp();
    linkAlice(R3);
    store.set(ALICE, preferencesWith({ languages: languages("de") }));

    await choices.press(goOf("interests"));

    expect(store.writes).toEqual([]);
    expect(roles.applied).toEqual([]);
    expect(channels.logs).toEqual([]);
    expect(trace).toEqual(["press.update"]);
  });
});

describe("a select change by a Guest, or by a Member the Applied State does not place", () => {
  test("a known Guest's select menu press gets the Guest refusal, and stores, gives and logs nothing", async () => {
    const { store, roles, channels, applied, linkAlice, selectOf, choices, trace } = setUp();
    linkAlice(R3);
    applied.record(ALICE, ["#12", "NML"]);
    const press = selectOf("languages", ["de"]);

    await choices.press(press);

    expect(press.replies).toEqual([guestChannelsReply()]);
    expect(press.updates).toEqual([]);
    expect(store.writes).toEqual([]);
    expect(roles.applied).toEqual([]);
    expect(channels.logs).toEqual([]);
    expect(trace).toEqual([]);
  });

  test("a known Guest pressing Done still closes the open prompt and deletes its thread", async () => {
    const { store, channels, applied, linkAlice, doneOf, choices } = setUp();
    linkAlice(R3);
    applied.record(ALICE, ["#12", "NML"]);
    store.openPrompt(ALICE, ALICE_THREAD);

    await choices.press(doneOf());

    expect(store.prompt(ALICE)).toBeUndefined();
    expect(channels.deleted).toEqual([ALICE_THREAD]);
  });

  test("a Linked Member with no Applied State pressing a select menu is saved and not refused", async () => {
    const { store, roles, linkAlice, selectOf, choices } = setUp();
    linkAlice(R3);
    const press = selectOf("languages", ["de"]);

    await choices.press(press);

    expect(press.replies).toEqual([]);
    expect(press.updates).toHaveLength(1);
    expect(store.writes).toEqual(["setLanguages"]);
    expect(store.get(ALICE).languages).toEqual(languages("de"));
    expect(roles.applied).toEqual([ALICE]);
  });
});

describe("a press by another Member", () => {
  test("replies that the choices belong to another Member and changes nothing", async () => {
    const { store, roles, channels, linkAlice, selectOf, choices, trace } = setUp();
    linkAlice();
    const press = selectOf("languages", ["de"], BOB);

    await choices.press(press);

    expect(press.replies).toEqual([notYoursReply()]);
    expect(press.updates).toEqual([]);
    expect(store.writes).toEqual([]);
    expect(roles.applied).toEqual([]);
    expect(channels.logs).toEqual([]);
    expect(trace).toEqual([]);
  });

  test("answers Done of another Member without closing their prompt or deleting their thread", async () => {
    const { store, channels, linkAlice, doneOf, choices } = setUp();
    linkAlice();
    store.openPrompt(ALICE, ALICE_THREAD);
    const press = doneOf(BOB);

    await choices.press(press);

    expect(press.replies).toEqual([notYoursReply()]);
    expect(store.prompt(ALICE)).toBeDefined();
    expect(channels.deleted).toEqual([]);
  });
});

describe("a Member who is not Linked", () => {
  test("replies that onboarding must be finished and changes nothing", async () => {
    const { store, roles, channels, selectOf, choices } = setUp();
    const press = selectOf("languages", ["de"]);

    await choices.press(press);

    expect(press.replies).toEqual([notLinkedReply()]);
    expect(press.updates).toEqual([]);
    expect(store.writes).toEqual([]);
    expect(roles.applied).toEqual([]);
    expect(channels.logs).toEqual([]);
  });
});

describe("a go press by a Guest, or by a Member who is not Linked", () => {
  test("a known Guest's go press gets the Guest refusal, and shows no step and changes nothing", async () => {
    const { store, roles, channels, applied, linkAlice, goOf, choices, trace } = setUp();
    linkAlice(R3);
    applied.record(ALICE, ["#12", "NML"]);
    const press = goOf("region");

    await choices.press(press);

    expect(press.replies).toEqual([guestChannelsReply()]);
    expect(press.updates).toEqual([]);
    expect(store.writes).toEqual([]);
    expect(roles.applied).toEqual([]);
    expect(channels.logs).toEqual([]);
    expect(trace).toEqual([]);
  });

  test("a Member who is not Linked and presses a go button gets the not-linked reply, and shows no step and changes nothing", async () => {
    const { store, roles, channels, goOf, choices, trace } = setUp();
    const press = goOf("interests");

    await choices.press(press);

    expect(press.replies).toEqual([notLinkedReply()]);
    expect(press.updates).toEqual([]);
    expect(store.writes).toEqual([]);
    expect(roles.applied).toEqual([]);
    expect(channels.logs).toEqual([]);
    expect(trace).toEqual([]);
  });
});

describe("Done", () => {
  test("closes the open prompt and deletes its thread", async () => {
    const { store, channels, linkAlice, doneOf, choices } = setUp();
    linkAlice();
    store.openPrompt(ALICE, ALICE_THREAD);

    await choices.press(doneOf());

    expect(store.prompt(ALICE)).toBeUndefined();
    expect(channels.deleted).toEqual([ALICE_THREAD]);
  });

  test("with no menu touched, gives no Preference Role and logs no error", async () => {
    const { store, roles, logError, linkAlice, doneOf, choices } = setUp();
    linkAlice();
    store.openPrompt(ALICE, ALICE_THREAD);

    await choices.press(doneOf());

    expect(store.writes).toEqual([]);
    expect(roles.applied).toEqual([]);
    expect(logError).not.toHaveBeenCalled();
  });

  test("answers the press before the thread is deleted", async () => {
    const { store, trace, linkAlice, doneOf, choices } = setUp();
    linkAlice();
    store.openPrompt(ALICE, ALICE_THREAD);

    await choices.press(doneOf());

    expect(trace.indexOf("press.update")).toBeGreaterThanOrEqual(0);
    expect(trace.indexOf("press.update")).toBeLessThan(trace.indexOf("channels.deleteThread"));
  });

  test("deletes the thread before it closes the prompt", async () => {
    const { store, trace, linkAlice, doneOf, choices } = setUp();
    linkAlice();
    store.openPrompt(ALICE, ALICE_THREAD);

    await choices.press(doneOf());

    expect(trace.indexOf("channels.deleteThread")).toBeGreaterThanOrEqual(0);
    expect(trace.indexOf("channels.deleteThread")).toBeLessThan(trace.indexOf("store.closePrompt"));
  });

  test("keeps the thread while a Rank Approval is pending, and still closes the prompt", async () => {
    const { store, links, channels, linkAlice, doneOf, choices } = setUp();
    linkAlice();
    links.pendingApproval(ALICE);
    store.openPrompt(ALICE, ALICE_THREAD);

    await choices.press(doneOf());

    expect(store.prompt(ALICE)).toBeUndefined();
    expect(channels.deleted).toEqual([]);
  });

  test("takes the Onboarding Role off the Member when the thread is deleted", async () => {
    const { store, onboardingRole, linkAlice, doneOf, choices } = setUp();
    linkAlice();
    store.openPrompt(ALICE, ALICE_THREAD);

    await choices.press(doneOf());

    expect(onboardingRole.calls).toEqual([{ kind: "takeOff", memberId: ALICE }]);
  });

  test("takes the Onboarding Role off before the thread is deleted", async () => {
    const { store, channels, onboardingRole, linkAlice, doneOf, choices } = setUp();
    linkAlice();
    store.openPrompt(ALICE, ALICE_THREAD);
    let deletedWhenTakenOff: readonly string[] | undefined;
    onboardingRole.onCall = (call: OnboardingRoleCall) => {
      if (call.kind === "takeOff") deletedWhenTakenOff = [...channels.deleted];
    };

    await choices.press(doneOf());

    expect(deletedWhenTakenOff).toEqual([]);
    expect(channels.deleted).toEqual([ALICE_THREAD]);
  });

  test("keeps the Onboarding Role while a Rank Approval is pending, and the thread stays open", async () => {
    const { store, links, onboardingRole, linkAlice, doneOf, choices } = setUp();
    linkAlice();
    links.pendingApproval(ALICE);
    store.openPrompt(ALICE, ALICE_THREAD);

    await choices.press(doneOf());

    expect(onboardingRole.calls).toEqual([]);
  });

  test("without an open prompt, only updates the message to a saved text without components", async () => {
    const { channels, linkAlice, doneOf, choices } = setUp();
    linkAlice();
    const press = doneOf();

    await choices.press(press);

    expect(press.updates).toHaveLength(1);
    expect(press.updates[0]?.content).toBeTruthy();
    expect(press.updates[0]?.components ?? []).toEqual([]);
    expect(channels.deleted).toEqual([]);
  });

  test("deletes only the thread of its own prompt", async () => {
    const { store, channels, linkAlice, doneOf, choices } = setUp();
    linkAlice();
    store.openPrompt(ALICE, ALICE_THREAD);
    store.openPrompt(BOB, BOB_THREAD);

    await choices.press(doneOf());

    expect(channels.deleted).toEqual([ALICE_THREAD]);
    expect(store.prompt(BOB)).toEqual({ threadId: BOB_THREAD, postedAt: NOW });
  });
});

/** The /channels command as the choices see it: who ran it, and the private replies recorded. */
class FakeChannelsCommand {
  readonly replies: PrivateReply[] = [];

  constructor(readonly user: { readonly id: MemberId }) {}

  reply(message: PrivateReply): Promise<void> {
    this.replies.push(message);
    return Promise.resolve();
  }
}

describe("/channels", () => {
  test("a Linked Member gets their stored Preferences and Alliance Rank in a private message, and changes nothing", async () => {
    const { store, roles, channels, linkAlice, choices } = setUp();
    linkAlice(R4);
    const preferences = preferencesWith({
      languages: languages("it", "en"),
      region: "europe-africa",
      interests: interests("pvp", "nap"),
      experience: "veteran",
    });
    store.set(ALICE, preferences);
    const command = new FakeChannelsCommand({ id: ALICE });

    await choices.showChannels(command);

    expect(command.replies).toEqual([
      {
        ...preferenceStepMessage({
          memberId: ALICE,
          step: "languages",
          preferences,
          rank: "R4",
          playerLanguage: undefined,
          guidesForumId: GUIDES_FORUM,
        }),
        flags: MessageFlags.Ephemeral,
      },
    ]);
    expect(store.writes).toEqual([]);
    expect(roles.applied).toEqual([]);
    expect(channels.logs).toEqual([]);
  });

  test("a Member who is not Linked is told to finish onboarding first, and changes nothing", async () => {
    const { store, roles, channels, choices } = setUp();
    const command = new FakeChannelsCommand({ id: ALICE });

    await choices.showChannels(command);

    expect(command.replies).toEqual([notLinkedReply()]);
    expect(store.writes).toEqual([]);
    expect(roles.applied).toEqual([]);
    expect(channels.logs).toEqual([]);
  });
});

describe("/channels for a Guest, or for a Member the Applied State does not place", () => {
  test("a known Guest, whose Applied State holds no Home Kingdom role, is refused privately and sees no Preferences", async () => {
    const { applied, linkAlice, choices } = setUp();
    linkAlice(R3);
    applied.record(ALICE, ["#12", "NML"]);
    const command = new FakeChannelsCommand({ id: ALICE });

    await choices.showChannels(command);

    expect(command.replies).toEqual([guestChannelsReply()]);
  });

  test("a Linked Member with no Applied State is not refused and gets their Preferences message", async () => {
    const { linkAlice, choices } = setUp();
    linkAlice(R3);
    const command = new FakeChannelsCommand({ id: ALICE });

    await choices.showChannels(command);

    expect(command.replies).toEqual([
      {
        ...preferenceStepMessage({
          memberId: ALICE,
          step: "languages",
          preferences: EMPTY_PREFERENCES,
          rank: "R3",
          playerLanguage: undefined,
          guidesForumId: GUIDES_FORUM,
        }),
        flags: MessageFlags.Ephemeral,
      },
    ]);
  });

  test("a Linked Member whose Applied State holds the Home Kingdom role is not refused and gets their Preferences message", async () => {
    const { applied, linkAlice, choices } = setUp();
    linkAlice(R3);
    applied.record(ALICE, ["#330", "NML"]);
    const command = new FakeChannelsCommand({ id: ALICE });

    await choices.showChannels(command);

    expect(command.replies).toEqual([
      {
        ...preferenceStepMessage({
          memberId: ALICE,
          step: "languages",
          preferences: EMPTY_PREFERENCES,
          rank: "R3",
          playerLanguage: undefined,
          guidesForumId: GUIDES_FORUM,
        }),
        flags: MessageFlags.Ephemeral,
      },
    ]);
  });
});

describe("a refused thread deletion on Done", () => {
  test("keeps the prompt open, so that the next sweep can retry the deletion, and logs the failure", async () => {
    const { store, channels, logError, linkAlice, doneOf, choices } = setUp();
    linkAlice();
    store.openPrompt(ALICE, ALICE_THREAD);
    channels.failDelete = true;

    await choices.press(doneOf());

    expect(store.prompt(ALICE)).toEqual({ threadId: ALICE_THREAD, postedAt: NOW });
    expect(logError).toHaveBeenCalledOnce();
  });

  test("takes the Onboarding Role off once, as the thread is due to close, so that a retry changes nothing more", async () => {
    const { store, channels, onboardingRole, linkAlice, doneOf, choices } = setUp();
    linkAlice();
    store.openPrompt(ALICE, ALICE_THREAD);
    channels.failDelete = true;

    await choices.press(doneOf());

    expect(onboardingRole.calls).toEqual([{ kind: "takeOff", memberId: ALICE }]);
  });
});

describe("a press the choices cannot read or save", () => {
  test("a press with a Preferences custom id that does not parse is answered privately with an error, and logged", async () => {
    const { logError, linkAlice, choices } = setUp();
    linkAlice();
    const press = new FakePress([], "pref:languages:not-a-snowflake", { id: ALICE }, ["de"]);

    await choices.press(press);

    expect(press.replies).toEqual([preferencesFailedReply()]);
    expect(press.updates).toEqual([]);
    expect(logError).toHaveBeenCalledOnce();
  });

  test("a save that fails before the press is answered is answered privately with an error, and logged", async () => {
    const { store, logError, linkAlice, selectOf, choices } = setUp();
    linkAlice();
    store.failOn = "setLanguages";
    const press = selectOf("languages", ["de"]);

    await choices.press(press);

    expect(press.replies).toEqual([preferencesFailedReply()]);
    expect(press.updates).toEqual([]);
    expect(logError).toHaveBeenCalledOnce();
  });

  test("a failure after the press is answered is only logged, with no second reply", async () => {
    const { store, channels, logError, linkAlice, doneOf, choices } = setUp();
    linkAlice();
    store.openPrompt(ALICE, ALICE_THREAD);
    channels.failDelete = true;
    const press = doneOf();

    await choices.press(press);

    expect(press.updates).toHaveLength(1);
    expect(press.replies).toEqual([]);
    expect(logError).toHaveBeenCalledOnce();
  });
});

describe("failures", () => {
  test("a failed save is logged, never thrown", async () => {
    const { store, logError, linkAlice, selectOf, choices } = setUp();
    linkAlice();
    store.failOn = "setLanguages";

    await expect(choices.press(selectOf("languages", ["de"]))).resolves.toBeUndefined();
    expect(logError).toHaveBeenCalledOnce();
  });

  test("a refused thread deletion is logged, never thrown", async () => {
    const { store, channels, logError, linkAlice, doneOf, choices } = setUp();
    linkAlice();
    store.openPrompt(ALICE, ALICE_THREAD);
    channels.failDelete = true;

    await expect(choices.press(doneOf())).resolves.toBeUndefined();
    expect(logError).toHaveBeenCalledOnce();
  });
});
