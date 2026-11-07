/*
 * Contract for src/domain/setup-plan.ts (slice 020, data-model.md "Server state" and "Setup plan", research R3, R4, R6).
 * Names the implementer must export:
 *
 *   interface ServerRole { id: string; name: string; hasPermissions: boolean; managed: boolean; position: number }
 *   interface ServerOverwrite { targetId: string; allow: Permission[]; deny: Permission[] }
 *     // targetId: a role id, the guild's @everyone id (everyoneId) or a member id (botUserId for Neil)
 *   interface ServerChannel {
 *     id: string; name: string; kind: "category" | ChannelType; parentId: string | undefined; overwrites: ServerOverwrite[];
 *   }
 *   interface ServerState {
 *     everyoneId: string; botUserId: string; botTopPosition: number; hasCommunity: boolean; botIsAdministrator: boolean;
 *     roles: ServerRole[]; channels: ServerChannel[];
 *   }
 *   type SetupStep =
 *     | { kind: "create-role"; name: string }
 *     | { kind: "create-category"; name: string; overwrites: WantedOverwrite[] }
 *     | { kind: "create-channel"; name: string; categoryName: string; type: ChannelType;
 *         overwrites: WantedOverwrite[]; fallbackFrom?: "forum" | "announcement" }
 *     | { kind: "correct-overwrites"; id: string; name: string; hidesFromEveryone: boolean; overwrites: WantedOverwrite[] };
 *     // correct-overwrites: only the targets whose named allow or deny is missing, each with its full wanted allow and deny
 *   type SetupFinding =
 *     | { kind: "outside-layout"; name: string }
 *     | { kind: "extra-overwrite"; name: string; target: string }
 *     | { kind: "wrong-type"; name: string; expected: ChannelType; actual: "category" | ChannelType }
 *     | { kind: "other-category"; name: string; categoryName: string | undefined }
 *     | { kind: "duplicate-name"; name: string }
 *     | { kind: "external-role-missing"; name: string }
 *     | { kind: "role-has-permissions"; name: string }
 *     | { kind: "role-above-neil"; name: string }
 *     | { kind: "fallback-to-text"; name: string; from: "forum" | "announcement" }
 *     | { kind: "hides-from-everyone"; name: string };
 *   interface SetupPlan { steps: SetupStep[]; findings: SetupFinding[] }
 *   function planSetup(layout: ServerLayout, server: ServerState, homeKingdom: number): SetupPlan;
 *     // reads nothing but its arguments; the [TAG] roles of server.roles give the Alliance areas (expandLayout)
 *
 * Other names used: ServerLayout, WantedOverwrite, Permission, ChannelType from ./server-layout.ts.
 */
import { describe, expect, test } from "vitest";
import { expandLayout, type ChannelType, type Permission, type ServerLayout, type WantedOverwrite } from "./server-layout.js";
import {
  planSetup,
  type ServerChannel,
  type ServerOverwrite,
  type ServerRole,
  type ServerState,
  type SetupPlan,
} from "./setup-plan.js";

const HOME_KINGDOM = 330;
const EVERYONE_ID = "guild";
const BOT_ID = "neil-user";

const layout: ServerLayout = {
  roles: ["Moderator", "King", "Onboarding", "Doctor", "R5", "#<Home Kingdom>", "PvP"],
  externalRoles: ["Interaction Bot"],
  languages: ["English", "Italian"],
  translations: [],
  categories: [
    {
      name: "Hangout",
      seenBy: ["#<Home Kingdom>"],
      channels: [
        { name: "general", type: "text", description: "A test channel." },
        { name: "rules", type: "text", description: "A test channel.", mode: "read-only" },
        { name: "tactics", type: "forum", description: "A test channel.", seenBy: ["R5"] },
        { name: "kvk-announcements", type: "announcement", description: "A test channel.", mode: "only-king-posts", translated: true },
        { name: "onboarding", type: "text", description: "A test channel.", overwrites: { Neil: { allow: ["ViewChannel"], deny: [] } } },
      ],
    },
  ],
  allianceArea: {
    channels: [
      { name: "alliance-chat", type: "text", description: "A test channel." },
      { name: "alliance-voice", type: "voice", description: "A test channel." },
    ],
  },
};

function server(overrides: Partial<ServerState> = {}): ServerState {
  return {
    everyoneId: EVERYONE_ID,
    botUserId: BOT_ID,
    botTopPosition: 50,
    hasCommunity: true,
    botIsAdministrator: true,
    roles: [],
    channels: [],
    ...overrides,
  };
}

function role(name: string, overrides: Partial<ServerRole> = {}): ServerRole {
  return { id: `role-${name}`, name, hasPermissions: false, managed: false, position: 10, ...overrides };
}

function categoryId(name: string): string {
  return `cat-${name}`;
}

function category(name: string, overwrites: ServerOverwrite[] = []): ServerChannel {
  return { id: categoryId(name), name, kind: "category", parentId: undefined, overwrites };
}

function channel(
  name: string,
  kind: ChannelType,
  parentCategory: string | undefined,
  overwrites: ServerOverwrite[] = [],
): ServerChannel {
  const parentId = parentCategory === undefined ? undefined : categoryId(parentCategory);
  return { id: `chan-${parentCategory ?? "top"}-${name}`, name, kind, parentId, overwrites };
}

function everyoneOverwrite(deny: Permission[] = ["ViewChannel"], allow: Permission[] = []): ServerOverwrite {
  return { targetId: EVERYONE_ID, allow, deny };
}

function roleOverwrite(name: string, allow: Permission[], deny: Permission[] = []): ServerOverwrite {
  return { targetId: `role-${name}`, allow, deny };
}

/** A server the layout already describes exactly: every role, category and channel with its wanted overwrites. */
function fittingServer(): ServerState {
  const expandedLayout = expandLayout(layout, HOME_KINGDOM, []);
  const idOf = (target: string): string => {
    if (target === "@everyone") return EVERYONE_ID;
    if (target === "Neil") return BOT_ID;
    return `role-${target}`;
  };
  const toServer = (overwrites: readonly WantedOverwrite[]): ServerOverwrite[] =>
    overwrites.map((overwrite) => ({ targetId: idOf(overwrite.target), allow: overwrite.allow, deny: overwrite.deny }));
  const roles: ServerRole[] = [
    ...expandedLayout.roles.map((name) => role(name)),
    ...expandedLayout.externalRoles.map((name) => role(name, { managed: true })),
  ];
  const channels: ServerChannel[] = [];
  for (const expandedCategory of expandedLayout.categories) {
    channels.push(category(expandedCategory.name, toServer(expandedCategory.overwrites)));
    for (const expandedChannel of expandedCategory.channels) {
      channels.push(channel(expandedChannel.name, expandedChannel.type, expandedCategory.name, toServer(expandedChannel.overwrites)));
    }
  }
  return server({ roles, channels });
}

/** A server with the Hangout category, its Kingdom role and the given extra channels, for tests that add one thing. */
function serverWithHangout(extra: ServerChannel[] = [], extraRoles: ServerRole[] = []): ServerState {
  return server({
    roles: [role("#330"), ...extraRoles],
    channels: [category("Hangout", [everyoneOverwrite(), roleOverwrite("#330", ["ViewChannel"])]), ...extra],
  });
}

function correctionFor(plan: SetupPlan, name: string): WantedOverwrite[] | undefined {
  for (const step of plan.steps) {
    if (step.kind === "correct-overwrites" && step.name === name) return step.overwrites;
  }
  return undefined;
}

describe("planSetup: roles", () => {
  test("a layout role missing from the server gets a create-role step", () => {
    const plan = planSetup(layout, server(), HOME_KINGDOM);
    expect(plan.steps).toContainEqual(expect.objectContaining({ kind: "create-role", name: "PvP" }));
  });

  test("a layout role the server already has gets no create-role step", () => {
    const plan = planSetup(layout, server({ roles: [role("PvP")] }), HOME_KINGDOM);
    expect(plan.steps).not.toContainEqual(expect.objectContaining({ kind: "create-role", name: "PvP" }));
  });

  test("a role name carried by two roles is skipped and reported as duplicate-name", () => {
    const plan = planSetup(layout, server({ roles: [role("PvP", { id: "a" }), role("PvP", { id: "b" })] }), HOME_KINGDOM);
    expect(plan.steps).not.toContainEqual(expect.objectContaining({ kind: "create-role", name: "PvP" }));
    expect(plan.findings).toContainEqual(expect.objectContaining({ kind: "duplicate-name", name: "PvP" }));
  });

  test("a layout role that holds permissions is reported as role-has-permissions", () => {
    const plan = planSetup(layout, server({ roles: [role("PvP", { hasPermissions: true })] }), HOME_KINGDOM);
    expect(plan.findings).toContainEqual(expect.objectContaining({ kind: "role-has-permissions", name: "PvP" }));
  });

  test("Moderator and King holding permissions are not reported as role-has-permissions", () => {
    const plan = planSetup(
      layout,
      server({ roles: [role("Moderator", { hasPermissions: true }), role("King", { hasPermissions: true })] }),
      HOME_KINGDOM,
    );
    expect(plan.findings).not.toContainEqual(expect.objectContaining({ kind: "role-has-permissions", name: "Moderator" }));
    expect(plan.findings).not.toContainEqual(expect.objectContaining({ kind: "role-has-permissions", name: "King" }));
  });

  test("a bot's managed role holding permissions is not reported as role-has-permissions", () => {
    const plan = planSetup(
      layout,
      server({ roles: [role("Interaction Bot", { managed: true, hasPermissions: true })] }),
      HOME_KINGDOM,
    );
    expect(plan.findings).not.toContainEqual(
      expect.objectContaining({ kind: "role-has-permissions", name: "Interaction Bot" }),
    );
  });

  test("a layout role above Neil's top role is reported as role-above-neil", () => {
    const plan = planSetup(layout, server({ roles: [role("PvP", { position: 60 })] }), HOME_KINGDOM);
    expect(plan.findings).toContainEqual(expect.objectContaining({ kind: "role-above-neil", name: "PvP" }));
  });

  test("a missing external role is reported as external-role-missing", () => {
    const plan = planSetup(layout, server(), HOME_KINGDOM);
    expect(plan.findings).toContainEqual(expect.objectContaining({ kind: "external-role-missing", name: "Interaction Bot" }));
  });

  test("a missing external role is never created", () => {
    const plan = planSetup(layout, server(), HOME_KINGDOM);
    expect(plan.steps).not.toContainEqual(expect.objectContaining({ kind: "create-role", name: "Interaction Bot" }));
  });
});

describe("planSetup: categories and channels", () => {
  test("a missing category gets a create-category step", () => {
    const plan = planSetup(layout, server(), HOME_KINGDOM);
    expect(plan.steps).toContainEqual(expect.objectContaining({ kind: "create-category", name: "Hangout" }));
  });

  test("a created category carries its wanted overwrites, including @everyone's deny", () => {
    const plan = planSetup(layout, server(), HOME_KINGDOM);
    expect(plan.steps).toContainEqual(
      expect.objectContaining({
        kind: "create-category",
        name: "Hangout",
        overwrites: expect.arrayContaining([expect.objectContaining({ target: "@everyone", deny: ["ViewChannel"] })]) as unknown,
      }),
    );
  });

  test("a missing channel gets a create-channel step in its category, with its type", () => {
    const plan = planSetup(layout, server(), HOME_KINGDOM);
    expect(plan.steps).toContainEqual(
      expect.objectContaining({ kind: "create-channel", name: "general", categoryName: "Hangout", type: "text" }),
    );
  });

  test("a created channel's overwrites are written in full, including the wanted @everyone deny", () => {
    const plan = planSetup(layout, server(), HOME_KINGDOM);
    expect(plan.steps).toContainEqual(
      expect.objectContaining({
        kind: "create-channel",
        name: "general",
        overwrites: expect.arrayContaining([expect.objectContaining({ target: "@everyone", deny: ["ViewChannel"] })]) as unknown,
      }),
    );
  });

  test("an existing category with the layout name gets no create-category step", () => {
    const plan = planSetup(layout, serverWithHangout(), HOME_KINGDOM);
    expect(plan.steps).not.toContainEqual(expect.objectContaining({ kind: "create-category", name: "Hangout" }));
  });

  test("an existing channel in its category gets no create-channel step", () => {
    const plan = planSetup(layout, serverWithHangout([channel("general", "text", "Hangout")]), HOME_KINGDOM);
    expect(plan.steps).not.toContainEqual(expect.objectContaining({ kind: "create-channel", name: "general" }));
  });

  test("an existing channel of the layout name in another category is matched, not created, and reported as other-category", () => {
    const misc = category("Misc");
    const plan = planSetup(layout, server({ channels: [misc, channel("general", "text", "Misc")] }), HOME_KINGDOM);
    expect(plan.steps).not.toContainEqual(expect.objectContaining({ kind: "create-channel", name: "general" }));
    expect(plan.findings).toContainEqual(
      expect.objectContaining({ kind: "other-category", name: "general", categoryName: "Misc" }),
    );
  });

  test("an existing channel in another category still gets its overwrites put right", () => {
    const misc = category("Misc");
    const plan = planSetup(
      layout,
      server({ roles: [role("#330")], channels: [misc, channel("general", "text", "Misc")] }),
      HOME_KINGDOM,
    );
    expect(plan.steps).toContainEqual(expect.objectContaining({ kind: "correct-overwrites", name: "general" }));
  });

  test("a layout channel of the wrong type is not changed and is reported as wrong-type", () => {
    const plan = planSetup(layout, serverWithHangout([channel("general", "voice", "Hangout")]), HOME_KINGDOM);
    expect(plan.steps).not.toContainEqual(expect.objectContaining({ kind: "correct-overwrites", name: "general" }));
    expect(plan.findings).toContainEqual(
      expect.objectContaining({ kind: "wrong-type", name: "general", expected: "text", actual: "voice" }),
    );
  });

  test("an Alliance channel is matched only within its [TAG] category, so a same-named one in another category is not used", () => {
    const plan = planSetup(
      layout,
      server({
        roles: [role("[ABC]")],
        channels: [category("[ABC]"), category("Hangout"), channel("alliance-chat", "text", "Hangout")],
      }),
      HOME_KINGDOM,
    );
    expect(plan.steps).toContainEqual(
      expect.objectContaining({ kind: "create-channel", name: "alliance-chat", categoryName: "[ABC]", type: "text" }),
    );
  });

  test("a [TAG] role gets an Alliance area: its category and both channels are created", () => {
    const plan = planSetup(layout, server({ roles: [role("[ABC]")] }), HOME_KINGDOM);
    expect(plan.steps).toContainEqual(expect.objectContaining({ kind: "create-category", name: "[ABC]" }));
    expect(plan.steps).toContainEqual(
      expect.objectContaining({ kind: "create-channel", name: "alliance-chat", categoryName: "[ABC]", type: "text" }),
    );
    expect(plan.steps).toContainEqual(
      expect.objectContaining({ kind: "create-channel", name: "alliance-voice", categoryName: "[ABC]", type: "voice" }),
    );
  });

  test("a duplicate channel name is skipped, neither created nor corrected, and reported as duplicate-name", () => {
    const plan = planSetup(
      layout,
      serverWithHangout([channel("general", "text", "Hangout"), { ...channel("general", "text", "Hangout"), id: "other" }]),
      HOME_KINGDOM,
    );
    expect(plan.steps).not.toContainEqual(expect.objectContaining({ kind: "create-channel", name: "general" }));
    expect(plan.steps).not.toContainEqual(expect.objectContaining({ kind: "correct-overwrites", name: "general" }));
    expect(plan.findings).toContainEqual(expect.objectContaining({ kind: "duplicate-name", name: "general" }));
  });

  test("a duplicate category name is skipped, neither created nor corrected, and reported as duplicate-name", () => {
    const plan = planSetup(
      layout,
      server({ channels: [category("Hangout"), { ...category("Hangout"), id: "cat-2" }] }),
      HOME_KINGDOM,
    );
    expect(plan.steps).not.toContainEqual(expect.objectContaining({ kind: "create-category", name: "Hangout" }));
    expect(plan.steps).not.toContainEqual(expect.objectContaining({ kind: "correct-overwrites", name: "Hangout" }));
    expect(plan.findings).toContainEqual(expect.objectContaining({ kind: "duplicate-name", name: "Hangout" }));
  });
});

describe("planSetup: Community fallback", () => {
  test("without Community a forum is created as a plain text channel, noting what it replaces", () => {
    const plan = planSetup(layout, server({ hasCommunity: false }), HOME_KINGDOM);
    expect(plan.steps).toContainEqual(
      expect.objectContaining({ kind: "create-channel", name: "tactics", type: "text", fallbackFrom: "forum" }),
    );
  });

  test("without Community the fallback to text is reported", () => {
    const plan = planSetup(layout, server({ hasCommunity: false }), HOME_KINGDOM);
    expect(plan.findings).toContainEqual(
      expect.objectContaining({ kind: "fallback-to-text", name: "tactics", from: "forum" }),
    );
  });

  test("with Community a forum is created as a forum, with no fallback", () => {
    const plan = planSetup(layout, server({ hasCommunity: true }), HOME_KINGDOM);
    expect(plan.steps).toContainEqual(expect.objectContaining({ kind: "create-channel", name: "tactics", type: "forum" }));
    expect(plan.steps).not.toContainEqual(expect.objectContaining({ fallbackFrom: "forum" }));
  });

  test("without Community an existing text channel counts as the forum: no create and no wrong-type", () => {
    const plan = planSetup(
      layout,
      { ...serverWithHangout([channel("tactics", "text", "Hangout")]), hasCommunity: false },
      HOME_KINGDOM,
    );
    expect(plan.steps).not.toContainEqual(expect.objectContaining({ kind: "create-channel", name: "tactics" }));
    expect(plan.findings).not.toContainEqual(expect.objectContaining({ kind: "wrong-type", name: "tactics" }));
  });

  test("with Community an existing text channel for a forum is reported as wrong-type and not created", () => {
    const plan = planSetup(layout, serverWithHangout([channel("tactics", "text", "Hangout")]), HOME_KINGDOM);
    expect(plan.steps).not.toContainEqual(expect.objectContaining({ kind: "create-channel", name: "tactics" }));
    expect(plan.findings).toContainEqual(
      expect.objectContaining({ kind: "wrong-type", name: "tactics", expected: "forum", actual: "text" }),
    );
  });
});

describe("planSetup: overwrites of existing channels", () => {
  test("a channel whose wanted overwrites are all present gets no correction", () => {
    const plan = planSetup(
      layout,
      serverWithHangout([channel("general", "text", "Hangout", [everyoneOverwrite(), roleOverwrite("#330", ["ViewChannel"])])]),
      HOME_KINGDOM,
    );
    expect(plan.steps).not.toContainEqual(expect.objectContaining({ kind: "correct-overwrites", name: "general" }));
  });

  test("a missing named allow gets a correction carrying the wanted allow and deny of that target", () => {
    const plan = planSetup(
      layout,
      serverWithHangout([channel("general", "text", "Hangout", [everyoneOverwrite()])]),
      HOME_KINGDOM,
    );
    expect(plan.steps).toContainEqual(
      expect.objectContaining({
        kind: "correct-overwrites",
        name: "general",
        overwrites: expect.arrayContaining([expect.objectContaining({ target: "#330", allow: ["ViewChannel"], deny: [] })]) as unknown,
      }),
    );
  });

  test("a missing named deny gets a correction", () => {
    const plan = planSetup(
      layout,
      serverWithHangout([
        channel("rules", "text", "Hangout", [everyoneOverwrite(), roleOverwrite("#330", ["ViewChannel"])]),
      ]),
      HOME_KINGDOM,
    );
    expect(plan.steps).toContainEqual(
      expect.objectContaining({
        kind: "correct-overwrites",
        name: "rules",
        overwrites: expect.arrayContaining([expect.objectContaining({ target: "#330", deny: ["SendMessages"] })]) as unknown,
      }),
    );
  });

  test("a named permission that is present, with unnamed extra permissions, needs no correction", () => {
    const plan = planSetup(
      layout,
      serverWithHangout([
        channel("general", "text", "Hangout", [
          everyoneOverwrite(),
          roleOverwrite("#330", ["ViewChannel", "SendMessages"]),
        ]),
      ]),
      HOME_KINGDOM,
    );
    expect(plan.steps).not.toContainEqual(expect.objectContaining({ kind: "correct-overwrites", name: "general" }));
  });

  test("a correction lists only the targets the layout names, not an extra overwrite beside them", () => {
    const plan = planSetup(
      layout,
      serverWithHangout([
        channel("general", "text", "Hangout", [everyoneOverwrite(), { targetId: "member-x", allow: ["ViewChannel"], deny: [] }]),
      ]),
      HOME_KINGDOM,
    );
    expect(correctionFor(plan, "general")?.map((overwrite) => overwrite.target)).toEqual(["#330"]);
  });

  test("an extra overwrite on a layout channel is reported as extra-overwrite and not corrected", () => {
    const plan = planSetup(
      layout,
      serverWithHangout([
        channel("general", "text", "Hangout", [
          everyoneOverwrite(),
          roleOverwrite("#330", ["ViewChannel"]),
          { targetId: "member-x", allow: ["ViewChannel"], deny: [] },
        ]),
      ]),
      HOME_KINGDOM,
    );
    expect(plan.findings).toContainEqual(expect.objectContaining({ kind: "extra-overwrite", name: "general" }));
    expect(plan.steps).not.toContainEqual(expect.objectContaining({ kind: "correct-overwrites", name: "general" }));
  });

  test("an existing layout channel that @everyone can see is reported as hides-from-everyone", () => {
    const plan = planSetup(
      layout,
      serverWithHangout([channel("general", "text", "Hangout", [roleOverwrite("#330", ["ViewChannel"])])]),
      HOME_KINGDOM,
    );
    expect(plan.findings).toContainEqual(expect.objectContaining({ kind: "hides-from-everyone", name: "general" }));
  });

  test("the correction of a channel @everyone can see says it hides from everyone", () => {
    const plan = planSetup(
      layout,
      serverWithHangout([channel("general", "text", "Hangout", [roleOverwrite("#330", ["ViewChannel"])])]),
      HOME_KINGDOM,
    );
    expect(plan.steps).toContainEqual(
      expect.objectContaining({ kind: "correct-overwrites", name: "general", hidesFromEveryone: true }),
    );
  });

  test("an existing layout channel @everyone already denies is not reported as hides-from-everyone", () => {
    const plan = planSetup(
      layout,
      serverWithHangout([channel("general", "text", "Hangout", [everyoneOverwrite(), roleOverwrite("#330", ["ViewChannel"])])]),
      HOME_KINGDOM,
    );
    expect(plan.findings).not.toContainEqual(expect.objectContaining({ kind: "hides-from-everyone", name: "general" }));
  });
});

describe("planSetup: channels and categories outside the layout", () => {
  test("a channel outside the layout is reported as outside-layout and not touched", () => {
    const plan = planSetup(layout, serverWithHangout([channel("random", "text", "Hangout")]), HOME_KINGDOM);
    expect(plan.findings).toContainEqual(expect.objectContaining({ kind: "outside-layout", name: "random" }));
    expect(plan.steps).not.toContainEqual(expect.objectContaining({ name: "random" }));
  });

  test("a category outside the layout is reported as outside-layout", () => {
    const plan = planSetup(layout, serverWithHangout([category("Old")]), HOME_KINGDOM);
    expect(plan.findings).toContainEqual(expect.objectContaining({ kind: "outside-layout", name: "Old" }));
  });
});

describe("planSetup: a server that already fits", () => {
  test("a server the layout already describes gives no steps", () => {
    const plan = planSetup(layout, fittingServer(), HOME_KINGDOM);
    expect(plan.steps).toEqual([]);
  });
});
