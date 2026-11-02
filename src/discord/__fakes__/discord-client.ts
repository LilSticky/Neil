import type { BaseMessageOptions } from "discord.js";
import type { FakeConnectGuild } from "./connect-guild.js";

/** A private message the client delivered: the user it reached and its text. */
export interface DirectMessage {
  readonly userId: string;
  readonly content: string | undefined;
}

/**
 * The discord.js Client that connect creates, in tests: it is ready and logs in at once, and serves the guild the test
 * set in `served`. Nothing reaches Discord. Events are emitted by the test with `emit`; private messages sent through
 * `users.fetch(id).send` are recorded in `directMessages`, or refused while `refuseDirectMessages` is set.
 */
export class FakeClient {
  /** The guild every client serves; a test sets it before connect. */
  static served: FakeConnectGuild | undefined = undefined;
  /** The client connect created last; a test emits events on it. */
  static latest: FakeClient | undefined = undefined;
  /** Every private message delivered, in order. */
  static directMessages: DirectMessage[] = [];
  /** When set, every private message is refused, as Discord does for a user with closed private messages. */
  static refuseDirectMessages = false;

  readonly guilds = {
    fetch: (): Promise<FakeConnectGuild> => {
      if (FakeClient.served === undefined) return Promise.reject(new Error("the fake client serves no guild"));
      return Promise.resolve(FakeClient.served);
    },
  };

  readonly users = {
    fetch: (userId: string): Promise<{ readonly send: (message: BaseMessageOptions) => Promise<void> }> =>
      Promise.resolve({
        send: (message: BaseMessageOptions): Promise<void> => {
          if (FakeClient.refuseDirectMessages) {
            return Promise.reject(Object.assign(new Error("Cannot send messages to this user"), { code: 50007 }));
          }
          FakeClient.directMessages.push({ userId, content: message.content });
          return Promise.resolve();
        },
      }),
  };

  readonly ws = { ping: 0 };

  private readonly listeners = new Map<string, (...args: readonly unknown[]) => void>();

  constructor() {
    FakeClient.latest = this;
  }

  on(event: string, listener: (...args: readonly unknown[]) => void): this {
    this.listeners.set(event, listener);
    return this;
  }

  /** Runs the listener the code registered for the event, as Discord would when the event happens. */
  emit(event: string, ...args: readonly unknown[]): void {
    const listener = this.listeners.get(event);
    if (listener === undefined) throw new Error(`the fake client has no listener for ${event}`);
    listener(...args);
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
