import { describe, expect, test } from "vitest";
import type { KnownAlliance } from "../domain/alliance-match.js";
import { parseKingdom, type KingdomNumber } from "../domain/lookup-input.js";
import { FakeAutocompleteInteraction } from "./__fakes__/autocomplete-interaction.js";
import { handleAllianceAutocomplete } from "./alliance-autocomplete.js";

const NOW = new Date("2026-11-02T12:00:00Z");
const DAY_MS = 86_400_000;

function kingdomOf(number: number): KingdomNumber {
  const parsed = parseKingdom(number);
  if (!parsed.ok) throw new Error(`test Kingdom ${number.toString()} must parse`);
  return parsed.value;
}

const HOME_KINGDOM = kingdomOf(330);

/** A Known Alliance of the Home Kingdom, last seen the given number of days before NOW. */
function known(tag: string, name: string, daysAgo = 0): KnownAlliance {
  return { kingdom: HOME_KINGDOM, tag, name, lastSeen: new Date(NOW.getTime() - daysAgo * DAY_MS) };
}

const NO_MANS_LAND = known("NML", "No Man's Land", 1);
const NIGHT_MARES = known("NMA", "Night Mares", 2);

/** The autocomplete context over the given Known Alliances; the store's read may be made to fail. */
function contextWith(alliances: readonly KnownAlliance[] | Error) {
  const logged: string[] = [];
  const context = {
    knownAlliances: {
      all: (): KnownAlliance[] => {
        if (alliances instanceof Error) throw alliances;
        return [...alliances];
      },
    },
    now: () => NOW,
    logError: (message: string) => {
      logged.push(message);
    },
  };
  return { context, logged };
}

describe("handleAllianceAutocomplete for the name option", () => {
  test("suggests the Known Alliances matching a part of the name, as [TAG] Name, with the full name as value", async () => {
    const interaction = new FakeAutocompleteInteraction({ name: "name", value: "man" });
    const { context } = contextWith([NIGHT_MARES, NO_MANS_LAND]);

    await handleAllianceAutocomplete(interaction, context);

    expect(interaction.responses).toEqual([[{ name: "[NML] No Man's Land", value: "No Man's Land" }]]);
  });

  test("finds the Alliance by a near spelling with apostrophes and spaces ignored", async () => {
    const interaction = new FakeAutocompleteInteraction({ name: "name", value: "No Mna's Land" });
    const { context } = contextWith([NIGHT_MARES, NO_MANS_LAND]);

    await handleAllianceAutocomplete(interaction, context);

    expect(interaction.responses).toEqual([[{ name: "[NML] No Man's Land", value: "No Man's Land" }]]);
  });

  test("suggests the most recently seen Known Alliances, at most 25, when nothing is typed yet", async () => {
    const alliances = Array.from({ length: 30 }, (_, index) =>
      known(`A${index.toString().padStart(2, "0")}`, `Alliance ${index.toString().padStart(2, "0")}`),
    ).map((alliance, index) => ({ ...alliance, lastSeen: new Date(NOW.getTime() - index * 3_600_000) }));
    const interaction = new FakeAutocompleteInteraction({ name: "name", value: "" });
    const { context } = contextWith(alliances);

    await handleAllianceAutocomplete(interaction, context);

    const [choices] = interaction.responses;
    expect(choices).toHaveLength(25);
    expect(choices?.[0]).toEqual({ name: "[A00] Alliance 00", value: "Alliance 00" });
    expect(choices?.[24]).toEqual({ name: "[A24] Alliance 24", value: "Alliance 24" });
  });

  test("answers an empty list when no Known Alliance matches what is typed", async () => {
    const interaction = new FakeAutocompleteInteraction({ name: "name", value: "zzzz" });
    const { context } = contextWith([NIGHT_MARES, NO_MANS_LAND]);

    await handleAllianceAutocomplete(interaction, context);

    expect(interaction.responses).toEqual([[]]);
  });

  test("cuts a label longer than 100 characters to 100", async () => {
    const wolves = known("WLF", `Wolves ${"x".repeat(120)}`);
    const interaction = new FakeAutocompleteInteraction({ name: "name", value: "wolves" });
    const { context } = contextWith([wolves]);

    await handleAllianceAutocomplete(interaction, context);

    const [choices] = interaction.responses;
    expect(choices).toHaveLength(1);
    expect(choices?.[0]?.name.length).toBeLessThanOrEqual(100);
    expect(choices?.[0]?.name.startsWith("[WLF] Wolves")).toBe(true);
  });
});

describe("handleAllianceAutocomplete for the tag option", () => {
  test("suggests the tag as value, labelled [TAG] Name, best match first", async () => {
    const interaction = new FakeAutocompleteInteraction({ name: "tag", value: "nm" });
    const { context } = contextWith([NIGHT_MARES, NO_MANS_LAND]);

    await handleAllianceAutocomplete(interaction, context);

    expect(interaction.responses).toEqual([
      [
        { name: "[NML] No Man's Land", value: "NML" },
        { name: "[NMA] Night Mares", value: "NMA" },
      ],
    ]);
  });
});

describe("handleAllianceAutocomplete when the Known Alliances cannot be read", () => {
  test("answers an empty list and logs the failure", async () => {
    const interaction = new FakeAutocompleteInteraction({ name: "name", value: "man" });
    const { context, logged } = contextWith(new Error("a Known Alliance in neil.db is corrupt"));

    await handleAllianceAutocomplete(interaction, context);

    expect(interaction.responses).toEqual([[]]);
    expect(logged).toHaveLength(1);
  });
});
