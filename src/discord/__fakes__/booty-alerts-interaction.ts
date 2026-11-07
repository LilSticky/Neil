import type { InteractionReplyOptions } from "discord.js";

/**
 * The option values the Member typed for /booty-alerts, by option name. An option left out is not in the record and reads
 * as null, as discord.js reads it.
 */
export type BootyAlertsOptionValues = Readonly<Record<"mode" | "from" | "to" | "time-zone", string>>;

/**
 * A /booty-alerts interaction that records every reply it gets. Nothing reaches Discord; the options are the ones the
 * test gives, and the Member is the user id given.
 */
export class FakeBootyAlertsInteraction {
  readonly replies: InteractionReplyOptions[] = [];
  readonly user: { readonly id: string };
  readonly options: { getString(name: string, required?: false): string | null };

  constructor(
    userId: string,
    private readonly values: Partial<Record<string, string>> = {},
  ) {
    this.user = { id: userId };
    this.options = {
      getString: (name: string): string | null => this.values[name] ?? null,
    };
  }

  reply(options: InteractionReplyOptions): Promise<void> {
    this.replies.push(options);
    return Promise.resolve();
  }
}
