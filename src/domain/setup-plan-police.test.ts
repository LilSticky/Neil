// Neil Police's overwrites in the setup plan (issue #127): on the test server, every category and channel hidden from
// @everyone gets an overwrite letting Police's role see it and read its history.
import { describe, expect, it } from "vitest";
import { POLICE_TARGET, type ServerLayout, type WantedOverwrite } from "./server-layout.js";
import { planSetup, type ServerChannel, type ServerOverwrite, type ServerState, type SetupStep } from "./setup-plan.js";

const HOME_KINGDOM = 330;
const EVERYONE_ID = "guild";
const BOT_ID = "neil-user";
const POLICE_ROLE_ID = "400000000000000000";
const POLICE_ALLOW = ["ViewChannel", "ReadMessageHistory"];

const layout: ServerLayout = {
  roles: ["Moderator", "King", "#<Home Kingdom>"],
  externalRoles: [],
  languages: [],
  translations: [],
  categories: [
    {
      name: "Officers",
      seenBy: ["Moderator", "King"],
      channels: [
        { name: "moderators", type: "text", description: "Where Officers talk." },
        {
          name: "neil-log",
          type: "text",
          description: "What Neil did.",
          mode: "read-only",
          overwrites: { Neil: { allow: ["ViewChannel", "SendMessages"], deny: [] } },
        },
      ],
    },
    {
      name: "Info",
      seenBy: ["#<Home Kingdom>"],
      channels: [{ name: "news", type: "announcement", description: "News for all.", seenBy: ["@everyone"] }],
    },
  ],
  allianceArea: { channels: [] },
};

const ROLES = ["Moderator", "King", "#330"].map((name, index) => ({
  id: `role-${name}`,
  name,
  permissions: 0n,
  managed: false,
  position: index + 1,
}));
const POLICE_ROLE = { id: POLICE_ROLE_ID, name: "Police", permissions: 0n, managed: false, position: 1 };

function emptyServer(withPolice = true): ServerState {
  return {
    everyoneId: EVERYONE_ID,
    botUserId: BOT_ID,
    botTopPosition: 50,
    hasCommunity: true,
    botIsAdministrator: true,
    roles: withPolice ? [...ROLES, POLICE_ROLE] : [...ROLES],
    channels: [],
  };
}

function idOf(target: string): string {
  if (target === "@everyone") return EVERYONE_ID;
  if (target === "Neil") return BOT_ID;
  if (target === POLICE_TARGET) return POLICE_ROLE_ID;
  return `role-${target}`;
}

function toServer(overwrites: readonly WantedOverwrite[]): ServerOverwrite[] {
  return overwrites.map((overwrite) => ({ targetId: idOf(overwrite.target), allow: [...overwrite.allow], deny: [...overwrite.deny] }));
}

/** The server as a real run of the plan would leave it: every created category and channel, with its overwrites, topic and description. */
function serverAfter(steps: readonly SetupStep[]): ServerState {
  const channels: ServerChannel[] = [];
  for (const step of steps) {
    if (step.kind === "create-category") {
      channels.push({
        id: `cat-${step.name}`,
        name: step.name,
        kind: "category",
        parentId: undefined,
        overwrites: toServer(step.overwrites),
        topic: undefined,
        description: undefined,
        pinsReadable: true,
        forum: undefined,
      });
    }
    if (step.kind === "create-channel") {
      const description = steps.find(
        (other): other is Extract<SetupStep, { kind: "post-description" }> => other.kind === "post-description" && other.name === step.name,
      );
      channels.push({
        id: `chan-${step.name}`,
        name: step.name,
        kind: step.type,
        parentId: `cat-${step.categoryName}`,
        overwrites: toServer(step.overwrites),
        topic: step.topic,
        description: description === undefined ? undefined : { messageId: `msg-${step.name}`, text: description.content },
        pinsReadable: true,
        forum: undefined,
      });
    }
  }
  return { ...emptyServer(), channels };
}

function createdOverwrites(steps: readonly SetupStep[], name: string): WantedOverwrite[] {
  const step = steps.find((candidate) => (candidate.kind === "create-category" || candidate.kind === "create-channel") && candidate.name === name);
  if (step === undefined || (step.kind !== "create-category" && step.kind !== "create-channel")) throw new Error(`no create step for ${name}`);
  return step.overwrites;
}

function policeOverwrite(overwrites: readonly WantedOverwrite[]): WantedOverwrite | undefined {
  return overwrites.find((overwrite) => overwrite.target === POLICE_TARGET);
}

describe("planSetup with Neil Police's role (issue #127)", () => {
  it("gives Police View Channel and Read Message History on every category and channel hidden from @everyone", () => {
    const { steps } = planSetup(layout, emptyServer(), HOME_KINGDOM, POLICE_ROLE_ID);
    for (const name of ["Officers", "moderators", "neil-log", "Info"]) {
      expect(policeOverwrite(createdOverwrites(steps, name)), name).toEqual({ target: POLICE_TARGET, allow: POLICE_ALLOW, deny: [] });
    }
  });

  it("gives Police nothing on a channel @everyone sees", () => {
    const { steps } = planSetup(layout, emptyServer(), HOME_KINGDOM, POLICE_ROLE_ID);
    expect(policeOverwrite(createdOverwrites(steps, "news"))).toBeUndefined();
  });

  it("plans exactly as today without Police's role id", () => {
    expect(planSetup(layout, emptyServer(), HOME_KINGDOM, undefined)).toEqual(planSetup(layout, emptyServer(), HOME_KINGDOM));
    const { steps } = planSetup(layout, emptyServer(), HOME_KINGDOM);
    for (const step of steps) {
      if (step.kind === "create-category" || step.kind === "create-channel") expect(policeOverwrite(step.overwrites)).toBeUndefined();
    }
  });

  it("keeps topics and descriptions the same with and without Police", () => {
    const pick = (steps: readonly SetupStep[]): unknown[] =>
      steps.flatMap((step): unknown[] => {
        if (step.kind === "create-channel") return [{ name: step.name, topic: step.topic }];
        if (step.kind === "post-description") return [{ name: step.name, content: step.content }];
        return [];
      });
    const withPolice = planSetup(layout, emptyServer(), HOME_KINGDOM, POLICE_ROLE_ID).steps;
    const without = planSetup(layout, emptyServer(), HOME_KINGDOM).steps;
    expect(pick(withPolice)).toEqual(pick(without));
  });

  it("plans nothing and finds no extra overwrite when the server already has Police's overwrites", () => {
    const after = serverAfter(planSetup(layout, emptyServer(), HOME_KINGDOM, POLICE_ROLE_ID).steps);
    const plan = planSetup(layout, after, HOME_KINGDOM, POLICE_ROLE_ID);
    expect(plan.steps).toEqual([]);
    expect(plan.findings).toEqual([]);
  });

  it("corrects a channel whose Police overwrite lacks Read Message History", () => {
    const after = serverAfter(planSetup(layout, emptyServer(), HOME_KINGDOM, POLICE_ROLE_ID).steps);
    const channels = after.channels.map((channel) =>
      channel.name !== "neil-log"
        ? channel
        : {
            ...channel,
            overwrites: channel.overwrites.map((overwrite) =>
              overwrite.targetId === POLICE_ROLE_ID ? { ...overwrite, allow: ["ViewChannel" as const] } : overwrite,
            ),
          },
    );
    const plan = planSetup(layout, { ...after, channels }, HOME_KINGDOM, POLICE_ROLE_ID);
    expect(plan.steps).toEqual([
      {
        kind: "correct-overwrites",
        id: "chan-neil-log",
        name: "neil-log",
        hidesFromEveryone: false,
        overwrites: [{ target: POLICE_TARGET, allow: POLICE_ALLOW, deny: [] }],
      },
    ]);
  });

  it("reports a Police role that is not on the server and plans no Police overwrite", () => {
    const plan = planSetup(layout, emptyServer(false), HOME_KINGDOM, POLICE_ROLE_ID);
    expect(plan.findings).toContainEqual({ kind: "police-role-missing", roleId: POLICE_ROLE_ID });
    for (const step of plan.steps) {
      if (step.kind === "create-category" || step.kind === "create-channel") expect(policeOverwrite(step.overwrites)).toBeUndefined();
    }
  });
});
