import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import type { BaseMessageOptions } from "discord.js";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { openDatabase } from "../storage/database.js";
import { EventStore } from "../storage/event-store.js";
import { ShieldStore } from "../storage/shield-store.js";
import { FakeLinkStore } from "./__fakes__/link-store.js";
import type { RaidMember } from "./raid-server.js";
import { createShieldReminders, type ShieldReminders, type ShieldServer } from "./shield-reminders.js";
import { packLines } from "./shield-texts.js";

const ALICE = "111111111111111111"; // Linked, [NML]
const BOB = "222222222222222222"; // Linked, [NML]
const CAROL = "333333333333333333"; // Linked, [NML], Shield Reminders Off
const DAN = "444444444444444444"; // not Linked, [NML]
const ERIN = "555555555555555555"; // Linked, [ABC]
const OFFICER = "999999999999999999";

const WEEK = "2026-11-21";
const DEADLINE = new Date("2026-11-21T02:00:00Z");
/** 12 hours before the Shield Deadline: Friday 12:00 Server Time. */
const TWELVE_HOURS_BEFORE = new Date("2026-11-20T14:00:00Z");
const FOUR_HOURS_BEFORE = new Date("2026-11-20T22:00:00Z");

const NML = { id: "70000000000000001", name: "[NML]" };
const ABC = { id: "70000000000000002", name: "[ABC]" };

interface Post {
  readonly channelId: string;
  readonly message: BaseMessageOptions;
}

class FakeShieldServer implements ShieldServer {
  memberList: RaidMember[] = [];
  tags: string[] = ["ABC", "NML"];
  readonly channels = new Map<string, string>([
    ["NML/alliance-chat", "chat-nml"],
    ["NML/alliance-leaders", "leaders-nml"],
    ["ABC/alliance-chat", "chat-abc"],
    ["ABC/alliance-leaders", "leaders-abc"],
  ]);
  readonly posts: Post[] = [];
  readonly logs: string[] = [];
  failingChannel: string | undefined;

  members(): Promise<readonly RaidMember[]> {
    return Promise.resolve(this.memberList);
  }

  allianceTags(): readonly string[] {
    return this.tags;
  }

  allianceChannelId(tag: string, name: string): string | undefined {
    return this.channels.get(`${tag}/${name}`);
  }

  post(channelId: string, message: BaseMessageOptions): Promise<unknown> {
    if (channelId === this.failingChannel) return Promise.reject(new Error("Missing Access"));
    this.posts.push({ channelId, message });
    return Promise.resolve();
  }

  log(line: string): Promise<void> {
    this.logs.push(line);
    return Promise.resolve();
  }

  postsIn(channelId: string): BaseMessageOptions[] {
    return this.posts.filter((post) => post.channelId === channelId).map((post) => post.message);
  }
}

function contentOf(message: BaseMessageOptions | undefined): string {
  return typeof message?.content === "string" ? message.content : "";
}

describe("Shield Reminders", () => {
  let dataDir: string;
  let db: DatabaseSync;
  let store: ShieldStore;
  let events: EventStore;
  let links: FakeLinkStore;
  let server: FakeShieldServer;
  let clock: Date;
  let errors: string[];
  let reminders: ShieldReminders;

  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), "neil-shield-reminders-"));
    db = openDatabase(dataDir);
    store = new ShieldStore(db);
    events = new EventStore(db);
    links = new FakeLinkStore();
    for (const memberId of [ALICE, BOB, CAROL, ERIN]) links.link(memberId);
    store.setOff(CAROL, true);
    server = new FakeShieldServer();
    server.memberList = [
      { id: ALICE, roles: [NML] },
      { id: BOB, roles: [NML] },
      { id: CAROL, roles: [NML] },
      { id: DAN, roles: [NML] },
      { id: ERIN, roles: [ABC] },
    ];
    clock = TWELVE_HOURS_BEFORE;
    errors = [];
    reminders = createShieldReminders({
      shield: store,
      events,
      links,
      server,
      now: () => clock,
      logError: (line) => {
        errors.push(line);
      },
    });
  });

  afterEach(() => {
    db.close();
    rmSync(dataDir, { recursive: true, force: true });
  });

  test("an unmarked week posts nothing", async () => {
    await reminders.tick();

    expect(server.posts).toEqual([]);
    expect(store.sentLeads(WEEK)).toEqual([]);
  });

  describe("in a KvK Week", () => {
    beforeEach(() => {
      store.mark(WEEK, new Date("2026-11-16T12:00:00Z"), OFFICER);
    });

    test("posts the reminder in each Alliance's alliance-chat, mentioning only Linked holders without a confirmation or opt-out", async () => {
      store.confirm(WEEK, BOB, TWELVE_HOURS_BEFORE);

      await reminders.tick();

      const [reminder, ...more] = server.postsIn("chat-nml");
      expect(more).toEqual([]);
      expect(reminder?.allowedMentions).toEqual({ parse: [], users: [ALICE] });
      expect(contentOf(reminder)).toContain(`<@${ALICE}>`);
      expect(contentOf(reminder)).not.toContain(BOB);
      expect(contentOf(reminder)).not.toContain(CAROL);
      expect(contentOf(reminder)).not.toContain(DAN);
      expect(contentOf(reminder)).toContain(`<t:${(DEADLINE.getTime() / 1000).toString()}:F>`);
      expect(reminder?.components).toEqual([
        { type: 1, components: [{ type: 2, style: 3, label: "Shielded", custom_id: `shield:${WEEK}` }] },
      ]);
      expect(server.postsIn("chat-abc")[0]?.allowedMentions).toEqual({ parse: [], users: [ERIN] });
    });

    test("posts each lead time once", async () => {
      await reminders.tick();
      await reminders.tick();
      clock = new Date(TWELVE_HOURS_BEFORE.getTime() + 60_000);
      await reminders.tick();

      expect(server.postsIn("chat-nml")).toHaveLength(1);
      expect(store.sentLeads(WEEK)).toEqual([720]);
    });

    test("posts nothing before the first lead time", async () => {
      clock = new Date(TWELVE_HOURS_BEFORE.getTime() - 60_000);

      await reminders.tick();

      expect(server.posts).toEqual([]);
    });

    test("a confirmed Member is not mentioned again at the next lead time", async () => {
      await reminders.tick();
      store.confirm(WEEK, ALICE, TWELVE_HOURS_BEFORE);
      clock = FOUR_HOURS_BEFORE;

      await reminders.tick();

      const later = server.postsIn("chat-nml")[1];
      expect(later?.allowedMentions).toEqual({ parse: [], users: [BOB] });
      expect(store.sentLeads(WEEK)).toEqual([720, 240]);
    });

    test("lead times missed collapse into one late reminder", async () => {
      clock = new Date("2026-11-21T01:30:00Z");

      await reminders.tick();
      await reminders.tick();

      expect(server.postsIn("chat-nml")).toHaveLength(1);
      expect(store.sentLeads(WEEK)).toEqual([720, 240, 60]);
    });

    test("uses the lead times of the kingdom's Shield kind", async () => {
      events.addKind("kingdom", { name: "Shield", beforeStart: [120], signupOffsetMinutes: undefined, beforeSignup: [] });

      await reminders.tick();
      expect(server.posts).toEqual([]);

      clock = new Date("2026-11-21T00:00:00Z");
      await reminders.tick();
      expect(store.sentLeads(WEEK)).toEqual([120]);
    });

    test("an Alliance's own Shield kind has no effect", async () => {
      events.addKind("NML", { name: "Shield", beforeStart: [120], signupOffsetMinutes: undefined, beforeSignup: [] });

      await reminders.tick();

      expect(store.sentLeads(WEEK)).toEqual([720]);
    });

    test("with nobody to mention, no reminder is posted in that Alliance, but its Shield List is", async () => {
      store.confirm(WEEK, ERIN, TWELVE_HOURS_BEFORE);

      await reminders.tick();

      expect(server.postsIn("chat-abc")).toEqual([]);
      expect(contentOf(server.postsIn("leaders-abc")[0])).toContain("Everyone has confirmed.");
    });

    test("posts a Shield List in each alliance-leaders, with the unconfirmed and the opted-out apart, pinging nobody", async () => {
      store.confirm(WEEK, BOB, TWELVE_HOURS_BEFORE);

      await reminders.tick();

      const [list, ...more] = server.postsIn("leaders-nml");
      expect(more).toEqual([]);
      expect(list?.allowedMentions).toEqual({ parse: [], users: [] });
      const lines = contentOf(list).split("\n");
      expect(lines[0]).toContain("Shield List of [NML]");
      expect(lines).toContain("1 of 3 confirmed.");
      expect(lines).toContain(`Not confirmed: <@${ALICE}>`);
      expect(lines).toContain(`Not confirmed, Shield Reminders Off: <@${CAROL}>`);
      expect(contentOf(list)).not.toContain(DAN);
      expect(server.posts.map((post) => post.channelId).sort()).toEqual(["chat-abc", "chat-nml", "leaders-abc", "leaders-nml"]);
    });

    test("a missing alliance-leaders is logged, and the other Alliances still get theirs", async () => {
      server.channels.delete("ABC/alliance-leaders");
      server.channels.delete("ABC/alliance-chat");

      await reminders.tick();

      expect(server.logs).toContain("The Shield List for [ABC] was not posted: its area has no alliance-leaders.");
      expect(server.logs).toContain("The Shield Reminder for [ABC] was not posted: its area has no alliance-chat.");
      expect(server.postsIn("chat-nml")).toHaveLength(1);
      expect(server.postsIn("leaders-nml")).toHaveLength(1);
    });

    test("a failed post is logged once, never thrown, and not sent again", async () => {
      server.failingChannel = "chat-abc";

      await reminders.tick();
      await reminders.tick();

      expect(errors).toEqual([expect.stringContaining("Missing Access")]);
      expect(server.logs.filter((line) => line.includes("Missing Access"))).toHaveLength(1);
      expect(server.postsIn("leaders-abc")).toHaveLength(1);
      expect(server.postsIn("chat-nml")).toHaveLength(1);
    });
  });

  test("deletes the Shield Confirmations of weeks whose reset has passed", async () => {
    store.confirm("2026-11-14", ALICE, new Date("2026-11-13T12:00:00Z"));
    store.confirm(WEEK, BOB, TWELVE_HOURS_BEFORE);

    await reminders.tick();

    expect(store.confirmed("2026-11-14")).toEqual(new Set());
    expect(store.confirmed(WEEK)).toEqual(new Set([BOB]));
  });

  test("a long Shield List is split into messages under 2,000 characters", () => {
    const mentions = Array.from({ length: 150 }, (_, index) => `<@${(100000000000000000 + index).toString()}>`).join(" ");
    const messages = packLines(["Header", `Not confirmed: ${mentions}`]);

    expect(messages.length).toBeGreaterThan(1);
    for (const message of messages) expect(message.length).toBeLessThan(2000);
    expect(messages.join(" ").split(" ").filter((word) => word.startsWith("<@"))).toHaveLength(150);
  });
});
