import { describe, expect, test, vi } from "vitest";
import { sharedMemberListing } from "./member-listing.js";

/** The error discord.js rejects a rate limited Request Guild Members with, as far as Neil reads it. */
function rateLimited(retryAfterSeconds: number): Error {
  return Object.assign(new Error("Request with opcode 8 was rate limited."), {
    data: { opcode: 8, retry_after: retryAfterSeconds },
  });
}

function setUp(list: () => Promise<string>) {
  let clock = new Date("2026-11-05T09:00:00Z");
  const sleep = vi.fn(() => Promise.resolve());
  const fetchList = vi.fn(list);
  const listing = sharedMemberListing({ list: fetchList, now: () => clock, sleep });
  return {
    listing,
    fetchList,
    sleep,
    advance: (ms: number) => {
      clock = new Date(clock.getTime() + ms);
    },
  };
}

describe("sharedMemberListing", () => {
  test("a second listing right after the first is the same answer, with one request", async () => {
    const { listing, fetchList, advance } = setUp(() => Promise.resolve("members"));

    await listing();
    advance(29_000);

    await expect(listing()).resolves.toBe("members");
    expect(fetchList).toHaveBeenCalledTimes(1);
  });

  test("two listings at the same moment share one request", async () => {
    const { listing, fetchList } = setUp(() => Promise.resolve("members"));

    await Promise.all([listing(), listing()]);

    expect(fetchList).toHaveBeenCalledTimes(1);
  });

  test("a listing after the window asks Discord again", async () => {
    const { listing, fetchList, advance } = setUp(() => Promise.resolve("members"));

    await listing();
    advance(36_000);
    await listing();

    expect(fetchList).toHaveBeenCalledTimes(2);
  });

  test("a rate limited listing waits as long as Discord says, plus a second, and asks once more", async () => {
    const fetchList = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(rateLimited(28.791))
      .mockResolvedValueOnce("members");
    const { listing, sleep } = setUp(fetchList);

    await expect(listing()).resolves.toBe("members");

    expect(sleep).toHaveBeenCalledExactlyOnceWith(29_791);
  });

  test("a listing rate limited twice fails, and the next listing asks again", async () => {
    const fetchList = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(rateLimited(1))
      .mockRejectedValueOnce(rateLimited(1))
      .mockResolvedValueOnce("members");
    const { listing } = setUp(fetchList);

    await expect(listing()).rejects.toThrow("rate limited");
    await expect(listing()).resolves.toBe("members");
  });

  test("any other failure is not retried and is not kept", async () => {
    const fetchList = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error("Members timed out"))
      .mockResolvedValueOnce("members");
    const { listing, sleep } = setUp(fetchList);

    await expect(listing()).rejects.toThrow("Members timed out");
    expect(sleep).not.toHaveBeenCalled();
    await expect(listing()).resolves.toBe("members");
  });

  test("the window starts when the listing is answered, so a listing that waited is still reused after it", async () => {
    let clock = new Date("2026-11-05T09:00:00Z");
    const fetchList = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(rateLimited(29))
      .mockResolvedValueOnce("members");
    const listing = sharedMemberListing({
      list: fetchList,
      now: () => clock,
      sleep: (ms) => {
        clock = new Date(clock.getTime() + ms);
        return Promise.resolve();
      },
    });

    await listing();
    clock = new Date(clock.getTime() + 20_000);
    await listing();

    expect(fetchList).toHaveBeenCalledTimes(2);
  });
});
