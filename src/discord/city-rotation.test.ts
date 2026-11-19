import { MessageFlags, type APIEmbed, type BaseMessageOptions, type InteractionReplyOptions } from "discord.js";
import { describe, expect, test } from "vitest";
import type { KnownAlliance } from "../domain/alliance-match.js";
import type { CityRotationMode } from "../domain/city-rotation.js";
import type { Editor } from "../domain/exile.js";
import type { KingdomNumber, Uid } from "../domain/lookup-input.js";
import type { Alliance, LookupResult } from "../domain/player.js";
import { kingdomOf, uidOf } from "../domain/__fixtures__/players.js";
import { EMPTY_CITY_ROTATION, type CityRotationState } from "../storage/city-rotation-store.js";
import {
  createCityRotation,
  type CityRotation,
  type CityRotationServer,
  type RotationButton,
  type RotationCommand,
} from "./city-rotation.js";
import { confirmHandoverRow } from "./city-rotation-texts.js";

const HOME = kingdomOf(330);
/** Friday 2026-11-20 at 12:00 Server Time, the Royal City siege. */
const FRIDAY = new Date("2026-11-20T14:00:00.000Z");
const NEXT_FRIDAY = new Date("2026-11-27T14:00:00.000Z");
const WEDNESDAY = new Date("2026-11-18T12:00:00.000Z");
const MODERATOR_ROLE = "900000000000000001";
const OFFICER = "500000000000000005";
const R5_NML = "100000000000000001";
const R5_ABC = "100000000000000002";
const R5_XYZ = "100000000000000003";
const R5_OUTSIDE = "100000000000000004";
const R4_NML = "100000000000000006";
const UNRANKED_NML = "100000000000000007";
const UNLINKED = "100000000000000008";
const XYZ_LEADER = uidOf("145563254785");
const ANNOUNCEMENTS = "700000000000000001";
const LEADERS = "700000000000000002";
const KINGDOM_NEWS = "700000000000000003";

function unix(moment: Date): string {
  return Math.floor(moment.getTime() / 1000).toString();
}

function known(tag: string, name: string, kingdom: KingdomNumber = HOME): KnownAlliance {
  return { kingdom, tag, name, lastSeen: WEDNESDAY };
}

const KNOWN = [
  known("NML", "No Man's Land"),
  known("ABC", "Alpha Bravo"),
  known("XYZ", "Ex Why Zed"),
  known("QQQ", "Quiet Quarter"),
  known("FAR", "Far Away", kingdomOf(331)),
];

function r5(tag: string): Editor {
  return { allianceRank: { source: "game-api", rank: "R5" }, allianceKingdom: HOME, allianceTag: tag };
}

const EDITORS: Readonly<Record<string, Editor>> = {
  [R5_NML]: r5("NML"),
  [R5_ABC]: r5("ABC"),
  [R5_XYZ]: r5("XYZ"),
  [R5_OUTSIDE]: r5("QQQ"),
  [R4_NML]: { ...r5("NML"), allianceRank: { source: "game-api", rank: "R4" } },
  [UNRANKED_NML]: { ...r5("NML"), allianceRank: { source: "unknown" } },
};

function allianceXyz(leaderUid: Uid | undefined): Alliance {
  return {
    tag: "XYZ",
    name: "Ex Why Zed",
    kingdom: HOME,
    might: 1,
    memberCount: 1,
    capacity: 100,
    leaderName: "Zed",
    leaderUid,
    roster: [],
  };
}

class FakeServer implements CityRotationServer {
  announcements: string | undefined = ANNOUNCEMENTS;
  leaders: string | undefined = LEADERS;
  kingdomNews: string | undefined = KINGDOM_NEWS;
  readonly posts: { channelId: string; message: BaseMessageOptions; id: string }[] = [];
  readonly edits: { channelId: string; messageId: string; message: BaseMessageOptions }[] = [];
  readonly pins: string[] = [];
  readonly logs: string[] = [];
  readonly gone = new Set<string>();
  refusePin = false;
  refusePost = false;
  private nextId = 800000000000000001n;

  announcementsChannelId(): string | undefined {
    return this.announcements;
  }
  leadersChannelId(): string | undefined {
    return this.leaders;
  }
  kingdomAnnouncementsChannelId(): string | undefined {
    return this.kingdomNews;
  }
  openPrivateThread(): Promise<{ readonly threadId: string; readonly notAdded: readonly string[] }> {
    return Promise.reject(new Error("The City Rotation opens no threads."));
  }
  post(channelId: string, message: BaseMessageOptions): Promise<string> {
    if (this.refusePost) return Promise.reject(new Error("Missing Permissions"));
    const id = this.nextId.toString();
    this.nextId += 1n;
    this.posts.push({ channelId, message, id });
    return Promise.resolve(id);
  }
  edit(channelId: string, messageId: string, message: BaseMessageOptions): Promise<boolean> {
    if (this.gone.has(messageId)) return Promise.resolve(false);
    this.edits.push({ channelId, messageId, message });
    return Promise.resolve(true);
  }
  pin(_channelId: string, messageId: string): Promise<void> {
    if (this.refusePin) return Promise.reject(new Error("Missing Permissions"));
    this.pins.push(messageId);
    return Promise.resolve();
  }
  log(line: string): Promise<void> {
    this.logs.push(line);
    return Promise.resolve();
  }
  postsIn(channelId: string): { message: BaseMessageOptions; id: string }[] {
    return this.posts.filter((post) => post.channelId === channelId);
  }
}

class Setup {
  state: CityRotationState = EMPTY_CITY_ROTATION;
  now = WEDNESDAY;
  readonly server = new FakeServer();
  readonly reads: { kingdom: number; key: string; purpose: string; freshness: string | undefined }[] = [];
  readResult: LookupResult<Alliance> = { kind: "found", value: allianceXyz(XYZ_LEADER), asOf: undefined };
  readonly linked = new Map<string, string>([[XYZ_LEADER, R5_XYZ]]);
  readonly errors: string[] = [];
  /** The Holding Alliances the King Move was told of, in order. */
  readonly handovers: string[] = [];

  service(mode: CityRotationMode = "rotation"): CityRotation {
    return createCityRotation({
      store: {
        load: () => this.state,
        update: (change) => {
          this.state = change(this.state);
          return this.state;
        },
      },
      knownAlliances: { all: () => KNOWN },
      links: { memberForUid: (uid) => this.linked.get(uid) },
      editorOf: (memberId) => EDITORS[memberId],
      gameApi: {
        getAlliance: (kingdom, key, purpose, ...rest) => {
          this.reads.push({ kingdom, key, purpose, freshness: rest[0] });
          return Promise.resolve(this.readResult);
        },
      },
      server: this.server,
      homeKingdom: HOME,
      mode,
      officerRoleIds: [MODERATOR_ROLE, "900000000000000002"],
      now: () => this.now,
      logError: (line) => {
        this.errors.push(line);
      },
      onHandover: (tag) => {
        this.handovers.push(tag);
        return Promise.resolve();
      },
    });
  }
}

class FakeCommand implements RotationCommand {
  readonly replies: InteractionReplyOptions[] = [];
  readonly user: { readonly id: string };
  readonly options: { getString(name: string): string | null; getInteger(name: string): number | null };

  constructor(
    memberId: string,
    values: Readonly<Record<string, string | number>> = {},
    private readonly roles: readonly string[] = [],
  ) {
    this.user = { id: memberId };
    this.options = {
      getString: (name) => {
        const value = values[name];
        return typeof value === "string" ? value : null;
      },
      getInteger: (name) => {
        const value = values[name];
        return typeof value === "number" ? value : null;
      },
    };
  }
  memberRoleIds(): readonly string[] {
    return this.roles;
  }
  reply(options: InteractionReplyOptions): Promise<unknown> {
    this.replies.push(options);
    return Promise.resolve();
  }
  get text(): string {
    const reply = this.replies[0];
    return typeof reply?.content === "string" ? reply.content : "";
  }
}

class FakeButton implements RotationButton {
  readonly replies: InteractionReplyOptions[] = [];
  readonly updates: { content: string }[] = [];
  readonly user: { readonly id: string };

  constructor(
    readonly customId: string,
    memberId: string,
    private readonly roles: readonly string[] = [],
  ) {
    this.user = { id: memberId };
  }
  memberRoleIds(): readonly string[] {
    return this.roles;
  }
  reply(options: InteractionReplyOptions): Promise<unknown> {
    this.replies.push(options);
    return Promise.resolve();
  }
  update(options: { readonly content: string }): Promise<unknown> {
    this.updates.push({ content: options.content });
    return Promise.resolve();
  }
}

function embedOf(message: InteractionReplyOptions | BaseMessageOptions | undefined): APIEmbed {
  const embed = message?.embeds?.[0];
  if (embed === undefined || !("description" in embed) || typeof embed.description !== "string") {
    throw new Error("no embed with a description");
  }
  return embed;
}

function rotationState(order: string[], holding: string, extra: Partial<CityRotationState> = {}): CityRotationState {
  return { ...EMPTY_CITY_ROTATION, order, holding, ...extra };
}

function buttonIdOf(siegeAt: Date, tag: string): string {
  return confirmHandoverRow(siegeAt, tag).components[0]?.custom_id ?? "";
}

describe("/rotation show", () => {
  test("answers privately with the holder, the next holder, the order and the next siege as two Discord timestamps", async () => {
    const setup = new Setup();
    setup.state = rotationState(["NML", "ABC", "XYZ"], "ABC");
    const command = new FakeCommand(R4_NML);

    await setup.service().show(command);

    expect(command.replies[0]?.flags).toBe(MessageFlags.Ephemeral);
    const embed = embedOf(command.replies[0]);
    expect(embed.description).toContain("**Holding Alliance**: [ABC] Alpha Bravo");
    expect(embed.description).toContain("**Next Holding Alliance**: [XYZ] Ex Why Zed");
    expect(embed.description).toContain("1. [NML] No Man's Land\n2. [ABC] Alpha Bravo\n3. [XYZ] Ex Why Zed");
    expect(embed.description).toContain(`**Next Royal City siege**: <t:${unix(FRIDAY)}:F> (<t:${unix(FRIDAY)}:R>)`);
    expect(embed.title).not.toContain("<t:");
    expect(setup.reads).toEqual([]);
  });

  test("says no City Rotation is set yet", async () => {
    const setup = new Setup();
    const command = new FakeCommand(R4_NML);

    await setup.service().show(command);

    expect(embedOf(command.replies[0]).description).toContain("No City Rotation is set yet");
  });

  test("in Contested shows the Holding Alliance and no next holder or order", async () => {
    const setup = new Setup();
    setup.state = rotationState(["NML", "ABC"], "ABC");
    const command = new FakeCommand(R4_NML);

    await setup.service("contested").show(command);

    const { description } = embedOf(command.replies[0]);
    expect(description).toContain("**Holding Alliance**: [ABC] Alpha Bravo");
    expect(description).not.toContain("Next Holding Alliance");
    expect(description).not.toContain("**Order**");
  });
});

describe("/rotation set", () => {
  test("lets an R5 of an Alliance in the new order set the first City Rotation, with Known spelling, and logs it", async () => {
    const setup = new Setup();
    const command = new FakeCommand(R5_NML, { order: "nml, abc xyz", holding: "abc" });

    await setup.service().set(command);

    expect(setup.state.order).toEqual(["NML", "ABC", "XYZ"]);
    expect(setup.state.holding).toBe("ABC");
    expect(command.replies[0]?.flags).toBe(MessageFlags.Ephemeral);
    expect(command.text).toContain("[ABC] Alpha Bravo");
    expect(setup.server.logs).toContainEqual(
      `<@${R5_NML}> set the City Rotation: none (holding none) → [NML] → [ABC] → [XYZ] (holding [ABC]).`,
    );
  });

  test("takes the first tag as the Holding Alliance by default", async () => {
    const setup = new Setup();

    await setup.service().set(new FakeCommand(R5_ABC, { order: "ABC NML" }));

    expect(setup.state.holding).toBe("ABC");
  });

  test("lets an R5 in the current order change it, clearing a waiting Handover, and logs old and new", async () => {
    const setup = new Setup();
    setup.state = rotationState(["NML", "ABC"], "NML", {
      handover: { expected: "ABC", leaderUid: undefined, siegeAt: FRIDAY, messageId: undefined },
    });

    await setup.service().set(new FakeCommand(R5_ABC, { order: "XYZ QQQ" }));

    expect(setup.state.order).toEqual(["XYZ", "QQQ"]);
    expect(setup.state.handover).toBeUndefined();
    expect(setup.server.logs).toContainEqual(
      `<@${R5_ABC}> set the City Rotation: [NML] → [ABC] (holding [NML]) → [XYZ] → [QQQ] (holding [XYZ]).`,
    );
  });

  test.each([
    ["an R5 outside the current order", R5_OUTSIDE],
    ["an R4", R4_NML],
    ["a Member without a Link", "100000000000000099"],
  ])("refuses %s and changes nothing", async (_label, memberId) => {
    const setup = new Setup();
    const before = rotationState(["NML", "ABC"], "NML");
    setup.state = before;
    const command = new FakeCommand(memberId, { order: "QQQ NML" });

    await setup.service().set(command);

    expect(setup.state).toBe(before);
    expect(command.text).toContain("Only a Member Linked to the R5");
    expect(setup.server.logs).toEqual([]);
  });

  test("refuses unknown tags and Alliances of another Kingdom, naming them", async () => {
    const setup = new Setup();
    const command = new FakeCommand(R5_NML, { order: "NML, FOO, FAR" });

    await setup.service().set(command);

    expect(setup.state).toBe(EMPTY_CITY_ROTATION);
    expect(command.text).toContain("[FOO], [FAR]");
  });

  test.each([
    ["a single tag", "NML", "at least 2"],
    ["a duplicate", "NML ABC nml", "named twice"],
    ["eleven tags", "NML ABC XYZ QQQ NML ABC XYZ QQQ NML ABC XYZ", "at most 10"],
  ])("refuses %s", async (_label, order, text) => {
    const setup = new Setup();
    const command = new FakeCommand(R5_NML, { order });

    await setup.service().set(command);

    expect(setup.state).toBe(EMPTY_CITY_ROTATION);
    expect(command.text).toContain(text);
  });

  test("refuses a holder that is not in the order", async () => {
    const setup = new Setup();
    const command = new FakeCommand(R5_NML, { order: "NML ABC", holding: "XYZ" });

    await setup.service().set(command);

    expect(command.text).toContain("[XYZ] is not in the order");
  });

  test("is refused in Contested, with a note that an Officer names the Holding Alliance", async () => {
    const setup = new Setup();
    const command = new FakeCommand(R5_NML, { order: "NML ABC" });

    await setup.service("contested").set(command);

    expect(setup.state).toBe(EMPTY_CITY_ROTATION);
    expect(command.text).toContain("Contested");
    expect(command.text).toContain("/rotation holder");
  });
});

describe("/rotation holder", () => {
  test("lets an Officer name the Holding Alliance, ending a waiting Handover, and logs it", async () => {
    const setup = new Setup();
    setup.state = rotationState(["NML", "ABC", "XYZ"], "NML", {
      handover: { expected: "ABC", leaderUid: undefined, siegeAt: FRIDAY, messageId: undefined },
    });
    const command = new FakeCommand(OFFICER, { tag: "xyz" }, [MODERATOR_ROLE]);

    await setup.service().holder(command);

    expect(setup.state.holding).toBe("XYZ");
    expect(setup.state.handover).toBeUndefined();
    expect(command.replies[0]?.flags).toBe(MessageFlags.Ephemeral);
    expect(setup.server.logs).toContainEqual(`Officer <@${OFFICER}> named [XYZ] the Holding Alliance.`);
  });

  test("refuses a Member who is not an Officer", async () => {
    const setup = new Setup();
    setup.state = rotationState(["NML", "ABC"], "NML");
    const command = new FakeCommand(R5_NML, { tag: "ABC" });

    await setup.service().holder(command);

    expect(setup.state.holding).toBe("NML");
    expect(command.text).toBe("Only Officers may name the Holding Alliance.");
  });

  test("in Rotation refuses a tag outside the order", async () => {
    const setup = new Setup();
    setup.state = rotationState(["NML", "ABC"], "NML");
    const command = new FakeCommand(OFFICER, { tag: "QQQ" }, [MODERATOR_ROLE]);

    await setup.service().holder(command);

    expect(setup.state.holding).toBe("NML");
    expect(command.text).toContain("not in the City Rotation");
  });

  test("in Contested names any Known Alliance and keeps the stored order", async () => {
    const setup = new Setup();
    setup.state = rotationState(["NML", "ABC"], "NML");

    await setup.service("contested").holder(new FakeCommand(OFFICER, { tag: "QQQ" }, [MODERATOR_ROLE]));

    expect(setup.state.holding).toBe("QQQ");
    expect(setup.state.order).toEqual(["NML", "ABC"]);
    expect(setup.handovers).toEqual(["QQQ"]);
  });

  test("in Rotation is a correction, not a Handover: no King Move", async () => {
    const setup = new Setup();
    setup.state = rotationState(["NML", "ABC"], "NML");

    await setup.service().holder(new FakeCommand(OFFICER, { tag: "ABC" }, [MODERATOR_ROLE]));

    expect(setup.state.holding).toBe("ABC");
    expect(setup.handovers).toEqual([]);
  });

  test("refuses an unknown tag", async () => {
    const setup = new Setup();
    const command = new FakeCommand(OFFICER, { tag: "FOO" }, [MODERATOR_ROLE]);

    await setup.service("contested").holder(command);

    expect(setup.state.holding).toBeUndefined();
    expect(command.text).toContain("[FOO]");
  });
});

describe("the after-siege step", () => {
  /** A rotation set before the siege, with the siege before it already handled. */
  function beforeSiege(setup: Setup): void {
    setup.state = rotationState(["NML", "ABC", "XYZ"], "ABC", { lastHandledSiege: new Date(FRIDAY.getTime() - 7 * 86_400_000) });
  }

  test("does nothing before the siege", async () => {
    const setup = new Setup();
    beforeSiege(setup);

    await setup.service().tick();

    expect(setup.server.postsIn(LEADERS)).toEqual([]);
  });

  test("after the siege posts exactly one confirmation in nap-leaders, naming the next Alliance and its fresh R5", async () => {
    const setup = new Setup();
    beforeSiege(setup);
    setup.now = new Date(FRIDAY.getTime() + 60_000);
    const service = setup.service();

    await service.tick();
    await service.tick();
    await setup.service().tick();

    const posts = setup.server.postsIn(LEADERS);
    expect(posts).toHaveLength(1);
    expect(posts[0]?.message.content).toContain("[XYZ] Ex Why Zed");
    expect(posts[0]?.message.content).toContain(`<@${R5_XYZ}>`);
    expect(posts[0]?.message.allowedMentions).toEqual({ parse: [], users: [R5_XYZ] });
    expect(posts[0]?.message.components).toEqual([confirmHandoverRow(FRIDAY, "XYZ")]);
    expect(setup.reads).toEqual([{ kingdom: 330, key: "XYZ", purpose: "sync", freshness: "live" }]);
    expect(setup.state.handover).toEqual({ expected: "XYZ", leaderUid: XYZ_LEADER, siegeAt: FRIDAY, messageId: posts[0]?.id });
    expect(setup.state.lastHandledSiege).toEqual(FRIDAY);
    expect(setup.server.logs).toContainEqual(
      `After the Royal City siege, Neil expects [XYZ] Ex Why Zed to take the Royal City; its R5 is uid ${XYZ_LEADER}. Waiting for confirmation.`,
    );
  });

  test("makes one step for several sieges missed while Neil was off", async () => {
    const setup = new Setup();
    setup.state = rotationState(["NML", "ABC", "XYZ"], "ABC", { lastHandledSiege: new Date(FRIDAY.getTime() - 21 * 86_400_000) });
    setup.now = new Date(FRIDAY.getTime() + 3_600_000);

    await setup.service().tick();

    expect(setup.server.postsIn(LEADERS)).toHaveLength(1);
    expect(setup.reads).toHaveLength(1);
  });

  test("on the very first tick only records the last siege", async () => {
    const setup = new Setup();
    setup.state = rotationState(["NML", "ABC", "XYZ"], "ABC");
    setup.now = new Date(FRIDAY.getTime() + 60_000);

    await setup.service().tick();

    expect(setup.state.lastHandledSiege).toEqual(FRIDAY);
    expect(setup.server.postsIn(LEADERS)).toEqual([]);
    expect(setup.reads).toEqual([]);
  });

  test("with a failed read still posts, saying an Officer confirms, and mentions nobody", async () => {
    const setup = new Setup();
    beforeSiege(setup);
    setup.now = new Date(FRIDAY.getTime() + 60_000);
    setup.readResult = { kind: "try-again" };

    await setup.service().tick();

    const posts = setup.server.postsIn(LEADERS);
    expect(posts).toHaveLength(1);
    expect(posts[0]?.message.content).toContain("could not read its R5");
    expect(posts[0]?.message.allowedMentions).toEqual({ parse: [] });
    expect(setup.state.handover?.leaderUid).toBeUndefined();
    expect(setup.server.logs.some((line) => line.includes("its R5 is unknown"))).toBe(true);
  });

  test("names an R5 without a Link and says an Officer confirms", async () => {
    const setup = new Setup();
    beforeSiege(setup);
    setup.now = new Date(FRIDAY.getTime() + 60_000);
    setup.linked.clear();

    await setup.service().tick();

    const content = setup.server.postsIn(LEADERS)[0]?.message.content ?? "";
    expect(content).toContain("Zed");
    expect(content).toContain("has no Link");
  });

  test("in Contested posts one line for the Officers, with no Game API request", async () => {
    const setup = new Setup();
    beforeSiege(setup);
    setup.now = new Date(FRIDAY.getTime() + 60_000);

    await setup.service("contested").tick();

    const posts = setup.server.postsIn(LEADERS);
    expect(posts).toHaveLength(1);
    expect(posts[0]?.message.content).toContain("/rotation holder");
    expect(posts[0]?.message.allowedMentions).toEqual({ parse: [] });
    expect(setup.reads).toEqual([]);
    expect(setup.state.handover).toBeUndefined();
  });

  test("asks nothing new while a Handover still waits", async () => {
    const setup = new Setup();
    setup.state = rotationState(["NML", "ABC", "XYZ"], "ABC", {
      lastHandledSiege: FRIDAY,
      handover: { expected: "XYZ", leaderUid: undefined, siegeAt: FRIDAY, messageId: undefined },
    });
    setup.now = new Date(NEXT_FRIDAY.getTime() + 60_000);

    await setup.service().tick();

    expect(setup.server.postsIn(LEADERS)).toEqual([]);
    expect(setup.reads).toEqual([]);
    expect(setup.state.lastHandledSiege).toEqual(NEXT_FRIDAY);
  });

  test("a missing nap-leaders writes one log line and the Handover still waits", async () => {
    const setup = new Setup();
    beforeSiege(setup);
    setup.now = new Date(FRIDAY.getTime() + 60_000);
    setup.server.leaders = undefined;

    await setup.service().tick();

    expect(setup.server.logs.filter((line) => line.includes("#nap-leaders"))).toHaveLength(1);
    expect(setup.state.handover?.expected).toBe("XYZ");
  });
});

describe("the Confirm handover button", () => {
  function waiting(setup: Setup): void {
    setup.state = rotationState(["NML", "ABC", "XYZ"], "ABC", {
      lastHandledSiege: FRIDAY,
      handover: { expected: "XYZ", leaderUid: XYZ_LEADER, siegeAt: FRIDAY, messageId: "800000000000000009" },
    });
  }

  test("the named R5's Member confirms: the expected Alliance holds, the button goes, the card is edited and logged", async () => {
    const setup = new Setup();
    waiting(setup);
    setup.state = { ...setup.state, cardMessageId: "800000000000000100" };
    const button = new FakeButton(buttonIdOf(FRIDAY, "XYZ"), R5_XYZ);

    await setup.service().confirm(button);

    expect(setup.state.holding).toBe("XYZ");
    expect(setup.state.handover).toBeUndefined();
    expect(button.updates).toHaveLength(1);
    expect(setup.server.edits.map((edit) => edit.messageId)).toEqual(["800000000000000100"]);
    expect(setup.server.logs).toContainEqual(`The R5 <@${R5_XYZ}> confirmed the Handover: [XYZ] is the Holding Alliance.`);
    expect(setup.handovers).toEqual(["XYZ"]);
  });

  test("an Officer confirms too", async () => {
    const setup = new Setup();
    waiting(setup);

    await setup.service().confirm(new FakeButton(buttonIdOf(FRIDAY, "XYZ"), OFFICER, [MODERATOR_ROLE]));

    expect(setup.state.holding).toBe("XYZ");
    expect(setup.server.logs).toContainEqual(`Officer <@${OFFICER}> confirmed the Handover: [XYZ] is the Holding Alliance.`);
  });

  test("anyone else is refused privately and nothing changes", async () => {
    const setup = new Setup();
    waiting(setup);
    const before = setup.state;
    const button = new FakeButton(buttonIdOf(FRIDAY, "XYZ"), R5_NML);

    await setup.service().confirm(button);

    expect(setup.state).toBe(before);
    expect(button.replies[0]?.flags).toBe(MessageFlags.Ephemeral);
    expect(button.replies[0]?.content).toContain("Only the R5");
    expect(setup.server.logs).toEqual([]);
    expect(setup.handovers).toEqual([]);
  });

  test("a press on a cleared or older Handover answers that it is no longer open", async () => {
    const setup = new Setup();
    setup.state = rotationState(["NML", "ABC", "XYZ"], "ABC");
    const cleared = new FakeButton(buttonIdOf(FRIDAY, "XYZ"), OFFICER, [MODERATOR_ROLE]);

    await setup.service().confirm(cleared);

    expect(cleared.replies[0]?.content).toBe("This Handover is no longer open.");
    expect(setup.state.holding).toBe("ABC");

    waiting(setup);
    const older = new FakeButton(buttonIdOf(new Date(FRIDAY.getTime() - 7 * 86_400_000), "XYZ"), OFFICER, [MODERATOR_ROLE]);
    await setup.service().confirm(older);
    expect(older.replies[0]?.content).toBe("This Handover is no longer open.");
    expect(setup.state.holding).toBe("ABC");
  });

  test("a second press after the confirmation is no longer open", async () => {
    const setup = new Setup();
    waiting(setup);
    const service = setup.service();

    await service.confirm(new FakeButton(buttonIdOf(FRIDAY, "XYZ"), R5_XYZ));
    const again = new FakeButton(buttonIdOf(FRIDAY, "XYZ"), R5_XYZ);
    await service.confirm(again);

    expect(again.replies[0]?.content).toBe("This Handover is no longer open.");
    expect(setup.server.logs.filter((line) => line.includes("confirmed"))).toHaveLength(1);
    expect(setup.handovers).toEqual(["XYZ"]);
  });
});

describe("the City Rotation card", () => {
  test("is posted with no mentions and pinned once, then edited on each change", async () => {
    const setup = new Setup();
    const service = setup.service();

    await service.refreshCard();
    await service.set(new FakeCommand(R5_NML, { order: "NML ABC" }));
    await service.holder(new FakeCommand(OFFICER, { tag: "ABC" }, [MODERATOR_ROLE]));

    const posts = setup.server.postsIn(ANNOUNCEMENTS);
    expect(posts).toHaveLength(1);
    expect(posts[0]?.message.allowedMentions).toEqual({ parse: [] });
    expect(setup.server.pins).toEqual([posts[0]?.id]);
    expect(setup.state.cardMessageId).toBe(posts[0]?.id);
    expect(setup.server.edits).toHaveLength(2);
    expect(embedOf(setup.server.edits[1]?.message).description).toContain("**Holding Alliance**: [ABC] Alpha Bravo");
  });

  test("is posted and pinned again when its message is gone", async () => {
    const setup = new Setup();
    setup.state = { ...EMPTY_CITY_ROTATION, cardMessageId: "800000000000000500" };
    setup.server.gone.add("800000000000000500");

    await setup.service().refreshCard();

    const posts = setup.server.postsIn(ANNOUNCEMENTS);
    expect(posts).toHaveLength(1);
    expect(setup.state.cardMessageId).toBe(posts[0]?.id);
    expect(setup.server.pins).toEqual([posts[0]?.id]);
  });

  test("is refreshed after the siege, so it points at the coming siege", async () => {
    const setup = new Setup();
    setup.state = rotationState(["NML", "ABC", "XYZ"], "ABC", {
      lastHandledSiege: new Date(FRIDAY.getTime() - 7 * 86_400_000),
      cardMessageId: "800000000000000100",
    });
    setup.now = new Date(FRIDAY.getTime() + 60_000);

    await setup.service().tick();

    const edit = setup.server.edits.at(-1);
    expect(embedOf(edit?.message).description).toContain(`<t:${unix(NEXT_FRIDAY)}:F>`);
    expect(embedOf(edit?.message).description).toContain("waiting for [XYZ] Ex Why Zed to confirm");
  });

  test("a missing nap-announcements writes one log line and nothing throws", async () => {
    const setup = new Setup();
    setup.server.announcements = undefined;

    await setup.service().refreshCard();

    expect(setup.server.logs).toEqual(["The City Rotation card was not posted: the server has no #nap-announcements."]);
  });

  test("a refused pin writes one log line and keeps the card", async () => {
    const setup = new Setup();
    setup.server.refusePin = true;

    await setup.service().refreshCard();

    expect(setup.server.logs).toEqual(["Pinning the City Rotation card in #nap-announcements failed: Missing Permissions"]);
    expect(setup.state.cardMessageId).toBeDefined();
  });

  test("a refused post writes one log line and nothing throws", async () => {
    const setup = new Setup();
    setup.server.refusePost = true;

    await setup.service().refreshCard();

    expect(setup.server.logs).toEqual(["Updating the City Rotation card in #nap-announcements failed: Missing Permissions"]);
    expect(setup.state.cardMessageId).toBeUndefined();
  });
});

describe("changing the City Rotation together", () => {
  const ABC_LEADER = uidOf("145563254786");
  const OLD_REQUEST = "800000000000000099";

  function running(setup: Setup, extra: Partial<CityRotationState> = {}): void {
    setup.state = rotationState(["NML", "ABC", "XYZ"], "NML", { lastHandledSiege: new Date(FRIDAY.getTime() - 7 * 86_400_000), ...extra });
  }

  /** A Turn after FRIDAY's siege, waiting for ABC's R5 to confirm. */
  function openTurn(setup: Setup): void {
    running(setup, {
      lastHandledSiege: FRIDAY,
      handover: { expected: "ABC", leaderUid: ABC_LEADER, siegeAt: FRIDAY, messageId: OLD_REQUEST },
    });
    setup.now = new Date(FRIDAY.getTime() + 3_600_000);
  }

  function linesBy(setup: Setup, memberId: string): string[] {
    return setup.server.logs.filter((line) => line.includes(`<@${memberId}>`));
  }

  const SUBCOMMANDS = [
    { name: "move", values: { alliance: "XYZ", position: 1 } },
    { name: "skip", values: {} },
    { name: "leave", values: { alliance: "ABC" } },
    { name: "pause", values: {} },
    { name: "resume", values: {} },
  ] as const;

  function run(service: CityRotation, name: (typeof SUBCOMMANDS)[number]["name"], command: FakeCommand): Promise<void> {
    switch (name) {
      case "move":
        return service.move(command);
      case "skip":
        return service.skip(command);
      case "leave":
        return service.leave(command);
      case "pause":
        return service.pause(command);
      case "resume":
        return service.resume(command);
    }
  }

  describe("who may change it", () => {
    for (const { name, values } of SUBCOMMANDS) {
      for (const [who, memberId] of [
        ["no Link", UNLINKED],
        ["an R4", R4_NML],
        ["an R5 of an Alliance outside the rotation", R5_OUTSIDE],
        ["a rank not from the Game API or a Rank Approval", UNRANKED_NML],
      ] as const) {
        test(`refuses /rotation ${name} privately to ${who}, and nothing changes`, async () => {
          const setup = new Setup();
          running(setup, { paused: name === "resume" });
          const before = setup.state;
          const command = new FakeCommand(memberId, values);

          await run(setup.service(), name, command);

          expect(command.replies[0]?.flags).toBe(MessageFlags.Ephemeral);
          expect(command.text).toContain("Only a Member Linked to the R5 of an Alliance in the City Rotation");
          expect(setup.state).toEqual(before);
          expect(setup.server.logs).toEqual([]);
          expect(setup.server.posts).toEqual([]);
          expect(setup.server.edits).toEqual([]);
        });
      }

      test(`refuses /rotation ${name} privately in Contested and without an order`, async () => {
        const contested = new Setup();
        running(contested);
        const command = new FakeCommand(R5_NML, values);
        await run(contested.service("contested"), name, command);
        expect(command.text).toContain("This Kingdom is Contested");

        const empty = new Setup();
        const second = new FakeCommand(R5_NML, values);
        await run(empty.service(), name, second);
        expect(second.text).toContain("No City Rotation is set yet");
        expect([...contested.server.logs, ...empty.server.logs]).toEqual([]);
        expect(empty.state).toEqual(EMPTY_CITY_ROTATION);
      });
    }
  });

  describe("/rotation move", () => {
    test("moves an Alliance; the holder stays, next follows the new order, with one log line, one post and the card", async () => {
      const setup = new Setup();
      running(setup);
      const command = new FakeCommand(R5_ABC, { alliance: "xyz", position: 2 });

      await setup.service().move(command);

      expect(setup.state.order).toEqual(["NML", "XYZ", "ABC"]);
      expect(setup.state.holding).toBe("NML");
      expect(command.replies[0]?.flags).toBe(MessageFlags.Ephemeral);
      expect(command.text).toContain("[XYZ] Ex Why Zed is now in place 2");
      expect(setup.server.logs).toEqual([
        `<@${R5_ABC}> moved [XYZ] to place 2 of the City Rotation: [NML] → [ABC] → [XYZ] becomes [NML] → [XYZ] → [ABC]; next is [XYZ].`,
      ]);
      const news = setup.server.postsIn(KINGDOM_NEWS);
      expect(news).toHaveLength(1);
      expect(news[0]?.message.content).toContain("[XYZ] Ex Why Zed moves to place 2");
      expect(news[0]?.message.content).toContain("[XYZ] Ex Why Zed is the next Holding Alliance");
      expect(news[0]?.message.allowedMentions).toEqual({ parse: [] });
      const card = setup.server.postsIn(ANNOUNCEMENTS);
      expect(card).toHaveLength(1);
      expect(embedOf(card[0]?.message).description).toContain("**Next Holding Alliance**: [XYZ] Ex Why Zed");
      expect(card[0]?.message.allowedMentions).toEqual({ parse: [] });
      expect(setup.reads).toEqual([]);
    });

    test("refuses an Alliance outside the rotation, a place out of range and no change, writing nothing", async () => {
      for (const values of [
        { alliance: "QQQ", position: 1 },
        { alliance: "ABC", position: 4 },
        { alliance: "ABC", position: 2 },
      ]) {
        const setup = new Setup();
        running(setup);
        const before = setup.state;
        const command = new FakeCommand(R5_ABC, values);

        await setup.service().move(command);

        expect(command.replies[0]?.flags).toBe(MessageFlags.Ephemeral);
        expect(setup.state).toEqual(before);
        expect(setup.server.logs).toEqual([]);
        expect(setup.server.posts).toEqual([]);
      }
    });
  });

  describe("/rotation skip", () => {
    test("skips the next Turn: the skipped Alliance keeps its place and the one after it is next", async () => {
      const setup = new Setup();
      running(setup);
      const command = new FakeCommand(R5_XYZ);

      await setup.service().skip(command);

      expect(setup.state.order).toEqual(["NML", "ABC", "XYZ"]);
      expect(setup.state.next).toBe("XYZ");
      expect(command.text).toContain("[ABC] Alpha Bravo's Turn is skipped");
      expect(linesBy(setup, R5_XYZ)).toHaveLength(1);
      expect(setup.server.logs).toHaveLength(1);
      expect(setup.server.postsIn(KINGDOM_NEWS)[0]?.message.content).toContain("[ABC] Alpha Bravo skips its Turn");
      expect(embedOf(setup.server.postsIn(ANNOUNCEMENTS)[0]?.message).description).toContain(
        "**Next Holding Alliance**: [XYZ] Ex Why Zed",
      );
    });

    test("after a skip the next siege expects the Alliance after the skipped one", async () => {
      const setup = new Setup();
      running(setup);
      await setup.service().skip(new FakeCommand(R5_XYZ));
      setup.now = new Date(FRIDAY.getTime() + 60_000);

      await setup.service().tick();

      expect(setup.state.handover?.expected).toBe("XYZ");
      expect(setup.state.next).toBeUndefined();
    });

    test("in an open Turn asks the fresh R5 of the Alliance after the skipped one, and the old button closes", async () => {
      const setup = new Setup();
      openTurn(setup);
      const service = setup.service();

      await service.skip(new FakeCommand(R5_NML));

      expect(setup.reads).toEqual([{ kingdom: 330, key: "XYZ", purpose: "sync", freshness: "live" }]);
      const requests = setup.server.postsIn(LEADERS);
      expect(requests).toHaveLength(1);
      expect(requests[0]?.message.content).toContain(`<@${R5_XYZ}>`);
      expect(requests[0]?.message.components).toEqual([confirmHandoverRow(FRIDAY, "XYZ")]);
      expect(setup.state.handover).toEqual({ expected: "XYZ", leaderUid: XYZ_LEADER, siegeAt: FRIDAY, messageId: requests[0]?.id });
      expect(setup.server.edits.find((edit) => edit.messageId === OLD_REQUEST)?.message.components).toEqual([]);
      expect(linesBy(setup, R5_NML)).toHaveLength(1);
      expect(setup.server.logs).toHaveLength(1);

      const old = new FakeButton(buttonIdOf(FRIDAY, "ABC"), R5_ABC);
      await service.confirm(old);
      expect(old.replies[0]?.content).toBe("This Handover is no longer open.");

      await service.confirm(new FakeButton(buttonIdOf(FRIDAY, "XYZ"), R5_XYZ));
      expect(setup.state.holding).toBe("XYZ");
      expect(setup.state.handover).toBeUndefined();
    });

    test("refuses a rotation of one Alliance", async () => {
      const setup = new Setup();
      setup.state = rotationState(["NML"], "ABC", { next: "NML" });
      const command = new FakeCommand(R5_NML);

      await setup.service().skip(command);

      expect(command.text).toBe("A City Rotation of one Alliance has no Turn to skip.");
      expect(setup.server.logs).toEqual([]);
    });
  });

  describe("/rotation leave", () => {
    test("takes the Alliance out; the one after it moves up", async () => {
      const setup = new Setup();
      running(setup);
      const command = new FakeCommand(R5_NML, { alliance: "abc" });

      await setup.service().leave(command);

      expect(setup.state.order).toEqual(["NML", "XYZ"]);
      expect(setup.state.holding).toBe("NML");
      expect(setup.server.logs).toEqual([
        `<@${R5_NML}> recorded that [ABC] left the NaP: the City Rotation [NML] → [ABC] → [XYZ] becomes [NML] → [XYZ]; next is [XYZ].`,
      ]);
      expect(setup.server.postsIn(KINGDOM_NEWS)[0]?.message.content).toContain("[ABC] Alpha Bravo left the NaP");
    });

    test("a leaving Holding Alliance holds until the next Handover, and the Alliance after it is next", async () => {
      const setup = new Setup();
      running(setup);

      await setup.service().leave(new FakeCommand(R5_ABC, { alliance: "NML" }));

      expect(setup.state.order).toEqual(["ABC", "XYZ"]);
      expect(setup.state.holding).toBe("NML");
      expect(setup.server.postsIn(KINGDOM_NEWS)[0]?.message.content).toContain("It holds the Royal City until the next Handover.");
      const { description } = embedOf(setup.server.postsIn(ANNOUNCEMENTS)[0]?.message);
      expect(description).toContain("**Holding Alliance**: [NML] No Man's Land");
      expect(description).toContain("**Next Holding Alliance**: [ABC] Alpha Bravo");

      setup.now = new Date(FRIDAY.getTime() + 60_000);
      await setup.service().tick();
      expect(setup.state.handover?.expected).toBe("ABC");
    });

    test("in an open Turn for the leaving Alliance asks the fresh R5 of the Alliance after it", async () => {
      const setup = new Setup();
      openTurn(setup);

      await setup.service().leave(new FakeCommand(R5_NML, { alliance: "ABC" }));

      expect(setup.state.order).toEqual(["NML", "XYZ"]);
      expect(setup.state.handover?.expected).toBe("XYZ");
      expect(setup.state.handover?.leaderUid).toBe(XYZ_LEADER);
      expect(setup.server.postsIn(LEADERS)).toHaveLength(1);
      expect(setup.server.logs).toHaveLength(1);
    });

    test("refuses the last Alliance and an Alliance outside the rotation", async () => {
      const last = new Setup();
      last.state = rotationState(["NML"], "ABC", { next: "NML" });
      const command = new FakeCommand(R5_NML, { alliance: "NML" });
      await last.service().leave(command);
      expect(command.text).toBe("The last Alliance cannot be taken out of the City Rotation.");
      expect(last.state.order).toEqual(["NML"]);

      const outside = new Setup();
      running(outside);
      const second = new FakeCommand(R5_NML, { alliance: "QQQ" });
      await outside.service().leave(second);
      expect(second.text).toBe("[QQQ] is not in the City Rotation.");
      expect([...last.server.logs, ...outside.server.logs]).toEqual([]);
    });
  });

  describe("an open Turn", () => {
    test("stays open past ticks and the next siege until someone confirms, skips or records a leave", async () => {
      const setup = new Setup();
      openTurn(setup);
      const service = setup.service();

      setup.now = new Date(FRIDAY.getTime() + 3 * 86_400_000);
      await service.tick();
      setup.now = new Date(NEXT_FRIDAY.getTime() + 60_000);
      await service.tick();
      await service.tick();

      expect(setup.state.handover).toEqual({ expected: "ABC", leaderUid: ABC_LEADER, siegeAt: FRIDAY, messageId: OLD_REQUEST });
      expect(setup.state.order).toEqual(["NML", "ABC", "XYZ"]);
      expect(setup.server.postsIn(LEADERS)).toEqual([]);
      expect(setup.reads).toEqual([]);
    });
  });

  describe("/rotation pause and resume", () => {
    test("while paused the after-siege step names nobody and asks nobody, and the card says it is paused", async () => {
      const setup = new Setup();
      running(setup);
      const command = new FakeCommand(R5_NML);

      await setup.service().pause(command);

      expect(setup.state.paused).toBe(true);
      expect(command.text).toContain("The City Rotation is paused");
      expect(setup.server.logs).toEqual([`<@${R5_NML}> paused the City Rotation (order [NML] → [ABC] → [XYZ], unchanged).`]);
      expect(setup.server.postsIn(KINGDOM_NEWS)[0]?.message.content).toContain("the rotation is paused");
      expect(embedOf(setup.server.postsIn(ANNOUNCEMENTS)[0]?.message).description).toContain("**Paused**");

      setup.now = new Date(FRIDAY.getTime() + 60_000);
      await setup.service().tick();

      expect(setup.state.handover).toBeUndefined();
      expect(setup.state.lastHandledSiege).toEqual(FRIDAY);
      expect(setup.server.postsIn(LEADERS)).toEqual([]);
      expect(setup.reads).toEqual([]);
    });

    test("move, skip and leave still work while paused, and after resume next is the same as before", async () => {
      const setup = new Setup();
      running(setup, { paused: true });
      const service = setup.service();

      await service.move(new FakeCommand(R5_NML, { alliance: "XYZ", position: 2 }));
      await service.skip(new FakeCommand(R5_NML));
      await service.leave(new FakeCommand(R5_NML, { alliance: "QQQ" }));
      expect(setup.state.order).toEqual(["NML", "XYZ", "ABC"]);
      expect(setup.state.next).toBe("ABC");

      const resume = new FakeCommand(R5_ABC);
      await service.resume(resume);

      expect(setup.state.paused).toBe(false);
      expect(setup.state.next).toBe("ABC");
      expect(resume.text).toContain("[ABC] Alpha Bravo is the next Holding Alliance");
      expect(linesBy(setup, R5_ABC)).toEqual([
        `<@${R5_ABC}> resumed the City Rotation (order [NML] → [XYZ] → [ABC], unchanged); next is [ABC].`,
      ]);
    });

    test("refuses a double pause and resuming a running rotation, writing nothing", async () => {
      const paused = new Setup();
      running(paused, { paused: true });
      const pause = new FakeCommand(R5_NML);
      await paused.service().pause(pause);
      expect(pause.text).toBe("Nothing changes: the City Rotation is already paused.");

      const runningSetup = new Setup();
      running(runningSetup);
      const resume = new FakeCommand(R5_NML);
      await runningSetup.service().resume(resume);
      expect(resume.text).toBe("Nothing changes: the City Rotation is not paused.");
      expect([...paused.server.logs, ...runningSetup.server.logs, ...paused.server.posts, ...runningSetup.server.posts]).toEqual([]);
    });
  });

  describe("the news and the card", () => {
    test("a missing home-kingdom-announcements is logged once and does not undo the change", async () => {
      const setup = new Setup();
      running(setup);
      setup.server.kingdomNews = undefined;

      await setup.service().pause(new FakeCommand(R5_NML));

      expect(setup.state.paused).toBe(true);
      expect(setup.server.logs.filter((line) => line.includes("home-kingdom-announcements"))).toHaveLength(1);
      expect(linesBy(setup, R5_NML)).toHaveLength(1);
    });

    test("a refused post is logged once and does not undo the change", async () => {
      const setup = new Setup();
      running(setup);
      setup.server.refusePost = true;

      await setup.service().leave(new FakeCommand(R5_NML, { alliance: "ABC" }));

      expect(setup.state.order).toEqual(["NML", "XYZ"]);
      expect(setup.server.logs.filter((line) => line.includes("home-kingdom-announcements failed"))).toHaveLength(1);
    });
  });

  describe("the alliance autocomplete", () => {
    test("offers the Alliances of the rotation in order, matching the typed text", () => {
      const setup = new Setup();
      running(setup);
      const service = setup.service();

      expect(service.allianceChoices("")).toEqual([
        { name: "[NML] No Man's Land", value: "NML" },
        { name: "[ABC] Alpha Bravo", value: "ABC" },
        { name: "[XYZ] Ex Why Zed", value: "XYZ" },
      ]);
      expect(service.allianceChoices("bravo")).toEqual([{ name: "[ABC] Alpha Bravo", value: "ABC" }]);
      expect(setup.service("contested").allianceChoices("")).toEqual([]);
    });
  });
});
