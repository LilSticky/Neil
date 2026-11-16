import type { BaseMessageOptions } from "discord.js";
import type { PostedCard } from "../../storage/raid-store.js";
import type { CardEdit, RaidMember, RaidServer } from "../raid-server.js";

/** A message the fake server took: where it went, and the message. */
export interface FakePost {
  readonly channelId: string;
  readonly messageId: string;
  readonly message: BaseMessageOptions;
}

export const WAR_COUNCIL_ROLE_ID = "900000000000000000";

function member(id: string, ...names: string[]): RaidMember {
  return { id, roles: names.map((name) => ({ id: name === "War Council" ? WAR_COUNCIL_ROLE_ID : `role-${name}`, name })) };
}

/** The Members of the fake server: NML's R5, R4 and an R3, ABC's R5, XYZ's R4, and a War Council holder. */
export const RAID_MEMBERS: readonly RaidMember[] = [
  member("101", "[NML]", "R5"),
  member("102", "[NML]", "R4"),
  member("103", "[NML]", "R3"),
  member("201", "[ABC]", "R5"),
  member("301", "[XYZ]", "R4"),
  member("900", "War Council"),
];

/** A Discord server for the Raid, in memory: channels by name, posts and edits recorded, and the log. */
export class FakeRaidServer implements RaidServer {
  readonly posts: FakePost[] = [];
  readonly edits: { readonly card: PostedCard; readonly edit: CardEdit }[] = [];
  readonly logs: string[] = [];
  readonly gone = new Set<string>();
  readonly channels = new Map<string, string>([
    ["kvk-announcements", "800000000000000001"],
    ["kvk-leaders", "800000000000000002"],
  ]);
  readonly allianceChats = new Map<string, string>([
    ["NML", "c-nml"],
    ["ABC", "c-abc"],
    ["XYZ", "c-xyz"],
  ]);
  tags: readonly string[] = ["ABC", "NML", "XYZ"];
  memberList: readonly RaidMember[] = RAID_MEMBERS;
  private nextId = 1;

  members(): Promise<readonly RaidMember[]> {
    return Promise.resolve(this.memberList);
  }

  allianceTags(): readonly string[] {
    return this.tags;
  }

  channelIdNamed(name: string): string | undefined {
    return this.channels.get(name);
  }

  allianceChatId(tag: string): string | undefined {
    return this.allianceChats.get(tag);
  }

  post(channelId: string, message: BaseMessageOptions): Promise<PostedCard> {
    const messageId = (1_000_000_000_000_000 + this.nextId++).toString();
    this.posts.push({ channelId, messageId, message });
    return Promise.resolve({ channelId, messageId });
  }

  edit(card: PostedCard, edit: CardEdit): Promise<boolean> {
    if (this.gone.has(card.messageId)) return Promise.resolve(false);
    this.edits.push({ card, edit });
    return Promise.resolve(true);
  }

  log(line: string): Promise<void> {
    this.logs.push(line);
    return Promise.resolve();
  }

  postsIn(channelId: string): FakePost[] {
    return this.posts.filter((post) => post.channelId === channelId);
  }
}
