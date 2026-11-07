import type { InteractionReplyOptions } from "discord.js";
import type { EventRole } from "../events.js";

/**
 * The option values the Member typed for /event-kinds, by option name. An option left out is not in the record and reads
 * as null, as discord.js reads it.
 */
export type EventKindsOptionValues = Partial<Record<string, string>>;

/**
 * A /event-kinds interaction that records every reply it gets. Nothing reaches Discord; the subcommand, the options and
 * the caller's roles are the ones the test gives.
 */
export class FakeEventKindsInteraction {
  readonly replies: InteractionReplyOptions[] = [];
  readonly user: { readonly id: string };
  readonly options: {
    getSubcommand(): string;
    getString(name: string, required?: false): string | null;
  };

  constructor(
    userId: string,
    private readonly roles: readonly EventRole[],
    subcommand: string,
    values: EventKindsOptionValues = {},
  ) {
    this.user = { id: userId };
    this.options = {
      getSubcommand: (): string => subcommand,
      getString: (name: string): string | null => values[name] ?? null,
    };
  }

  memberRoles(): readonly EventRole[] {
    return this.roles;
  }

  reply(options: InteractionReplyOptions): Promise<void> {
    this.replies.push(options);
    return Promise.resolve();
  }
}
