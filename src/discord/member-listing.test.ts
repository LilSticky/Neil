import { describe, expect, test, vi } from "vitest";
import { listEveryMember } from "./member-listing.js";

interface Member {
  readonly id: string;
}

/** Answers pages of `size` from the Members, after the given id, as Discord does. */
function pagesOf(members: readonly Member[], size: number) {
  return vi.fn((after: string | undefined) => {
    const start = after === undefined ? 0 : members.findIndex((member) => member.id === after) + 1;
    return Promise.resolve(members.slice(start, start + size));
  });
}

function membersUpTo(count: number): Member[] {
  return Array.from({ length: count }, (_, index) => ({ id: (index + 1).toString() }));
}

describe("listEveryMember", () => {
  test("is empty when the server gives no Member", async () => {
    await expect(listEveryMember(pagesOf([], 1000))).resolves.toEqual([]);
  });

  test("asks once when the first page is not full", async () => {
    const listPage = pagesOf(membersUpTo(3), 1000);

    await expect(listEveryMember(listPage)).resolves.toHaveLength(3);

    expect(listPage).toHaveBeenCalledTimes(1);
    expect(listPage).toHaveBeenCalledWith(undefined, 1000);
  });

  test("goes on after the last Member of a full page, until a page is not full", async () => {
    const listPage = pagesOf(membersUpTo(2500), 1000);

    const members = await listEveryMember(listPage);

    expect(members).toEqual(membersUpTo(2500));
    expect(listPage.mock.calls.map(([after]) => after)).toEqual([undefined, "1000", "2000"]);
  });

  test("stops on an empty page when the Members exactly fill the last one", async () => {
    const listPage = pagesOf(membersUpTo(1000), 1000);

    await expect(listEveryMember(listPage)).resolves.toHaveLength(1000);

    expect(listPage).toHaveBeenCalledTimes(2);
  });

  test("a failed page fails the listing", async () => {
    const listPage = vi.fn(() => Promise.reject(new Error("Discord is down")));

    await expect(listEveryMember(listPage)).rejects.toThrow("Discord is down");
  });
});
