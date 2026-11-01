import { describe, expect, test } from "vitest";
import { cleanDisplayName } from "./recommended-player.js";

describe("cleanDisplayName", () => {
  test("removes bracketed parts, then keeps the part before the first |", () => {
    expect(cleanDisplayName("[NML|R5] drlol | #331")).toBe("drlol");
  });

  test("removes a parenthesised rank tag and keeps the spaces inside the name", () => {
    expect(cleanDisplayName("(R4) Dr Lol")).toBe("Dr Lol");
  });

  test("removes emoji around the name", () => {
    expect(cleanDisplayName("🔥drlol🔥")).toBe("drlol");
  });

  test("returns undefined when only separators are left", () => {
    expect(cleanDisplayName("|||")).toBeUndefined();
  });

  test("keeps the part after the first | when the part before it is empty", () => {
    expect(cleanDisplayName("| drlol | #331")).toBe("drlol");
  });

  test.each([
    ["round brackets", "(R4)drlol", "drlol"],
    ["square brackets", "[R4]drlol", "drlol"],
    ["curly brackets", "{R4}drlol", "drlol"],
    ["angle brackets", "<R4>drlol", "drlol"],
    ["full-width lenticular brackets", "【R4】drlol", "drlol"],
  ])("removes %s with their contents", (_label, input, expected) => {
    expect(cleanDisplayName(input)).toBe(expected);
  });

  test("returns undefined for an empty display name", () => {
    expect(cleanDisplayName("")).toBeUndefined();
  });

  test("keeps a name of 32 characters", () => {
    const name = "A".repeat(32);

    expect(cleanDisplayName(name)).toBe(name);
  });

  test("returns undefined for a name longer than 32 characters", () => {
    expect(cleanDisplayName("A".repeat(33))).toBeUndefined();
  });

  test("keeps letters with accents", () => {
    expect(cleanDisplayName("Zoë Ñandú")).toBe("Zoë Ñandú");
  });

  test("keeps non-Latin letters", () => {
    expect(cleanDisplayName("Дракон")).toBe("Дракон");
    expect(cleanDisplayName("李四")).toBe("李四");
  });
});
