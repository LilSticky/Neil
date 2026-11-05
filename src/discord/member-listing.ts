/** The most Members Discord gives in one page. */
const PAGE_SIZE = 1000;

/**
 * Every Member of the server, page by page, each page after the last Member of the one before. This goes over REST on
 * purpose: Discord allows Request Guild Members on the gateway (opcode 8) only about once per 30 seconds, which the
 * startup sweeps ran into (#53).
 */
export async function listEveryMember<T extends { readonly id: string }>(
  listPage: (after: string | undefined, limit: number) => Promise<readonly T[]>,
): Promise<T[]> {
  const members: T[] = [];
  let after: string | undefined;
  for (;;) {
    const page = await listPage(after, PAGE_SIZE);
    members.push(...page);
    const last = page.at(-1);
    if (last === undefined || page.length < PAGE_SIZE) return members;
    after = last.id;
  }
}
