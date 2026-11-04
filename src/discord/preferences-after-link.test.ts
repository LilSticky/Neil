import { mkdtempSync, rmSync } from "node:fs";
import type { DatabaseSync } from "node:sqlite";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { BaseMessageOptions } from "discord.js";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import type { RankOnLink } from "../domain/link.js";
import { parseKingdom, parseUid, type KingdomNumber, type Uid } from "../domain/lookup-input.js";
import type { Player } from "../domain/player.js";
import { EMPTY_PREFERENCES, type GameLanguageCode } from "../domain/preferences.js";
import type { MemberId } from "../domain/rank-approval.js";
import { openDatabase } from "../storage/database.js";
import { createPreferenceStore, type PreferenceStore } from "../storage/preference-store.js";
import type { OnboardingChannels } from "./onboarding-channels.js";
import { createPreferencesAfterLink } from "./preferences-after-link.js";
import { preferencesMessage } from "./preferences-texts.js";

function uidOf(digits: string): Uid {
  const parsed = parseUid(digits);
  if (!parsed.ok) throw new Error(`the test uid ${digits} is not a valid uid`);
  return parsed.value;
}

function kingdomOf(number: number): KingdomNumber {
  const parsed = parseKingdom(number);
  if (!parsed.ok) throw new Error(`the test Kingdom ${number.toString()} is not a valid Kingdom`);
  return parsed.value;
}

const NOW = new Date("2026-10-31T10:00:00Z");
const MEMBER: MemberId = "111111111111111111";
const THREAD = "666666666666666666";
const RANK: RankOnLink = { source: "game-api", rank: "R4" };
const NO_ALLIANCE: RankOnLink = { source: "no-alliance" };

/** A Player whose game Language is the given code; the other details are not read here. */
function playerIn(language: string | undefined): Player {
  return {
    uid: uidOf("145563254785"),
    name: "Vex",
    kingdom: kingdomOf(330),
    might: 15_902_728,
    sanctuaryLevel: 42,
    alliance: { tag: "NML", name: "Neil's Men", leaderUid: undefined },
    allianceRank: "R4",
    details: {
      kills: undefined,
      vipLevel: undefined,
      likes: undefined,
      lastOnlineAt: undefined,
      language,
      location: undefined,
      avatarPath: undefined,
      kingdomBadgePath: undefined,
    },
  };
}

/** The channels as the Preferences message uses them: records each post with the Languages stored at that moment. */
class FakeChannels implements Pick<OnboardingChannels, "post"> {
  readonly posts: {
    readonly threadId: string;
    readonly message: BaseMessageOptions;
    readonly languagesAtPost: readonly GameLanguageCode[];
  }[] = [];
  refusePosts = false;

  constructor(private readonly store: PreferenceStore) {}

  post(threadId: string, message: BaseMessageOptions): Promise<string> {
    if (this.refusePosts) return Promise.reject(new Error(`Discord refused the post to ${threadId}`));
    this.posts.push({ threadId, message, languagesAtPost: [...this.store.get(MEMBER).languages] });
    return Promise.resolve("message-1");
  }
}

describe("createPreferencesAfterLink", () => {
  let dataDir: string;
  let db: DatabaseSync;
  let store: PreferenceStore;
  let channels: FakeChannels;

  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), "neil-preferences-after-link-"));
    db = openDatabase(dataDir);
    store = createPreferenceStore(db, () => undefined);
    channels = new FakeChannels(store);
  });

  afterEach(() => {
    db.close();
    rmSync(dataDir, { recursive: true, force: true });
  });

  function serviceWith(): ReturnType<typeof createPreferencesAfterLink> {
    return createPreferencesAfterLink({ preferences: store, channels, guidesForumId: undefined, now: () => NOW });
  }

  test("stores the Player's game Language for a Member with no Preferences, before the message is posted, so it shows preselected", async () => {
    await serviceWith().postAfterLink(MEMBER, THREAD, playerIn("fr-FR"), RANK);

    expect(channels.posts).toEqual([
      {
        threadId: THREAD,
        message: preferencesMessage({
          memberId: MEMBER,
          preferences: { ...EMPTY_PREFERENCES, languages: new Set<GameLanguageCode>(["fr"]) },
          rank: "R4",
          playerLanguage: "fr-FR",
          guidesForumId: undefined,
        }),
        languagesAtPost: ["fr"],
      },
    ]);
    expect(store.get(MEMBER).languages).toEqual(new Set<GameLanguageCode>(["fr"]));
  });

  test("stores no Language for a Member who already has Preferences", async () => {
    store.setRegion(MEMBER, "americas");

    await serviceWith().postAfterLink(MEMBER, THREAD, playerIn("fr"), RANK);

    expect(store.get(MEMBER).languages).toEqual(new Set<GameLanguageCode>());
    expect(channels.posts).toHaveLength(1);
    expect(channels.posts[0]?.languagesAtPost).toEqual([]);
  });

  test("opens the Preferences prompt for the Member in the thread, at the time it is posted", async () => {
    await serviceWith().postAfterLink(MEMBER, THREAD, playerIn(undefined), RANK);

    expect(store.prompt(MEMBER)).toEqual({ threadId: THREAD, postedAt: NOW });
  });

  test("when the message cannot be posted, the call rejects and no prompt is opened", async () => {
    channels.refusePosts = true;

    await expect(serviceWith().postAfterLink(MEMBER, THREAD, playerIn("fr"), RANK)).rejects.toThrow();

    expect(store.prompt(MEMBER)).toBeUndefined();
  });

  test("a Linked Member with no Alliance is posted the Interests without NaP discussions, as for a Member with no rank", async () => {
    await serviceWith().postAfterLink(MEMBER, THREAD, playerIn(undefined), NO_ALLIANCE);

    expect(channels.posts).toEqual([
      {
        threadId: THREAD,
        message: preferencesMessage({
          memberId: MEMBER,
          preferences: EMPTY_PREFERENCES,
          rank: undefined,
          playerLanguage: undefined,
          guidesForumId: undefined,
        }),
        languagesAtPost: [],
      },
    ]);
  });
});
