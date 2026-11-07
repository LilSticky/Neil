import { describe, expect, test } from "vitest";
import { FakeAutocompleteInteraction } from "./__fakes__/autocomplete-interaction.js";
import { handleTimeZoneAutocomplete, localMinuteOf, parseTimeZone } from "./booty-time.js";

/** Discord shows at most 25 choices. */
const MAX_CHOICES = 25;

describe("localMinuteOf: the minute of the day in a city time zone", () => {
  test("in January Europe/Lisbon is on UTC, so noon UTC is minute 720", () => {
    expect(localMinuteOf(new Date("2026-01-15T12:00:00Z"), "Europe/Lisbon")).toBe(720);
  });

  test("in July Europe/Lisbon is on summer time, one hour ahead, so noon UTC is minute 780", () => {
    expect(localMinuteOf(new Date("2026-07-15T12:00:00Z"), "Europe/Lisbon")).toBe(780);
  });

  test("a time after the local midnight is read on the next local day, from minute 0", () => {
    expect(localMinuteOf(new Date("2026-07-15T23:30:00Z"), "Europe/Lisbon")).toBe(30);
  });

  test("local midnight is minute 0, not 1440", () => {
    expect(localMinuteOf(new Date("2026-01-15T00:00:00Z"), "Europe/Lisbon")).toBe(0);
  });

  test("UTC is a time zone like any other", () => {
    expect(localMinuteOf(new Date("2026-01-01T07:45:00Z"), "UTC")).toBe(465);
  });

  test("a stored time zone that Intl rejects reads as no local minute, and does not throw", () => {
    expect(() => localMinuteOf(new Date("2026-01-15T12:00:00Z"), "Mars/Olympus")).not.toThrow();
    expect(localMinuteOf(new Date("2026-01-15T12:00:00Z"), "Mars/Olympus")).toBeUndefined();
  });
});

describe("parseTimeZone: recognising a time zone the Member typed", () => {
  test("accepts an IANA city zone such as Europe/Lisbon", () => {
    expect(parseTimeZone("Europe/Lisbon")).toEqual({ ok: true, value: "Europe/Lisbon" });
  });

  test("accepts UTC, the default, although Intl does not list it among the city zones", () => {
    expect(parseTimeZone("UTC")).toEqual({ ok: true, value: "UTC" });
  });

  test.each([
    ["a name that is not a time zone", "Mars/Olympus"],
    ["an empty name", ""],
    ["a city name without its region", "Lisbon"],
  ])("refuses %s", (_label, input) => {
    expect(parseTimeZone(input)).toEqual({ ok: false });
  });
});

describe("handleTimeZoneAutocomplete: suggestions for the time-zone option", () => {
  test("suggests the zones that contain the typed part of the name, as their IANA names", async () => {
    const interaction = new FakeAutocompleteInteraction({ name: "time-zone", value: "lisb" });

    await handleTimeZoneAutocomplete(interaction);

    expect(interaction.responses).toEqual([[{ name: "Europe/Lisbon", value: "Europe/Lisbon" }]]);
  });

  test("matches the typed part whatever its case", async () => {
    const interaction = new FakeAutocompleteInteraction({ name: "time-zone", value: "LISBON" });

    await handleTimeZoneAutocomplete(interaction);

    expect(interaction.responses[0]).toContainEqual({ name: "Europe/Lisbon", value: "Europe/Lisbon" });
  });

  test("offers at most 25 choices when more zones match", async () => {
    const interaction = new FakeAutocompleteInteraction({ name: "time-zone", value: "america" });

    await handleTimeZoneAutocomplete(interaction);

    const [choices] = interaction.responses;
    expect(choices?.length).toBe(MAX_CHOICES);
    expect(choices?.every((choice) => choice.value.toLowerCase().includes("america"))).toBe(true);
  });

  test("offers at most 25 choices when nothing is typed yet", async () => {
    const interaction = new FakeAutocompleteInteraction({ name: "time-zone", value: "" });

    await handleTimeZoneAutocomplete(interaction);

    expect(interaction.responses[0]?.length).toBe(MAX_CHOICES);
  });

  test("offers nothing when no zone matches what is typed", async () => {
    const interaction = new FakeAutocompleteInteraction({ name: "time-zone", value: "zzzz-no-such-zone" });

    await handleTimeZoneAutocomplete(interaction);

    expect(interaction.responses).toEqual([[]]);
  });
});
