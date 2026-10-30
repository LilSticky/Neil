import { describe, expect, test } from "vitest";
import { isOfficer } from "./officer.js";

const MODERATOR = "role-moderator";
const KING = "role-king";
const PLAYER_ROLE = "role-player";

describe("isOfficer", () => {
  test("is true when the Member has the Moderator role", () => {
    expect(isOfficer([PLAYER_ROLE, MODERATOR], [MODERATOR, KING])).toBe(true);
  });

  test("is true when the Member has the King role", () => {
    expect(isOfficer([KING], [MODERATOR, KING])).toBe(true);
  });

  test("is true when the Member has both Officer roles", () => {
    expect(isOfficer([MODERATOR, KING], [MODERATOR, KING])).toBe(true);
  });

  test("is false when the Member has none of the Officer roles", () => {
    expect(isOfficer([PLAYER_ROLE], [MODERATOR, KING])).toBe(false);
  });

  test("is false when the Member has no roles at all", () => {
    expect(isOfficer([], [MODERATOR, KING])).toBe(false);
  });

  test("is false when no Officer role IDs are configured", () => {
    expect(isOfficer([MODERATOR], [])).toBe(false);
  });
});
