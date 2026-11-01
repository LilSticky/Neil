import type { FakeConnectGuild } from "./connect-guild.js";

/**
 * The discord.js Client that connect creates, in tests: it is ready and logs in at once, and serves the guild the test
 * set in `served`. Nothing reaches Discord.
 */
export class FakeClient {
  /** The guild every client serves; a test sets it before connect. */
  static served: FakeConnectGuild | undefined = undefined;

  readonly guilds = {
    fetch: (): Promise<FakeConnectGuild> => {
      if (FakeClient.served === undefined) return Promise.reject(new Error("the fake client serves no guild"));
      return Promise.resolve(FakeClient.served);
    },
  };

  readonly ws = { ping: 0 };

  private readonly listeners = new Map<string, unknown>();

  on(event: string, listener: unknown): this {
    this.listeners.set(event, listener);
    return this;
  }

  login(token: string): Promise<string> {
    return Promise.resolve(token);
  }

  isReady(): boolean {
    return true;
  }

  destroy(): Promise<void> {
    return Promise.resolve();
  }
}
