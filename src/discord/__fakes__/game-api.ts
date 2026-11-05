import { vi, type Mock } from "vitest";
import type { LookupCaller } from "../../game-api/allowance-keeper.js";
import type { ChargedLookups, ChargedResult } from "../../game-api/client.js";
import type { RequestPurpose } from "../../domain/daily-quota.js";
import type { AllianceKey, KingdomNumber, PlayerName, Uid } from "../../domain/lookup-input.js";
import type { Alliance, LookupResult, Player } from "../../domain/player.js";

/** What the fake answers. A charged lookup is refused with `allowance-spent` when `refusedUntil` is set. */
export interface GameApiAnswers {
  readonly player?: LookupResult<Player>;
  readonly alliance?: LookupResult<Alliance>;
  readonly refusedUntil?: Date | undefined;
}

type ChargedGetPlayer = (uid: Uid) => Promise<ChargedResult<Player>>;
type ChargedFindPlayer = (name: PlayerName, kingdom: KingdomNumber | undefined) => Promise<ChargedResult<Player>>;
type ChargedGetAlliance = (kingdom: KingdomNumber, key: AllianceKey) => Promise<ChargedResult<Alliance>>;
type ChargedFindAlliance = (name: AllianceKey) => Promise<ChargedResult<Alliance>>;

type GetPlayer = (uid: Uid, purpose: RequestPurpose) => Promise<LookupResult<Player>>;
type FindPlayer = (
  name: PlayerName,
  kingdom: KingdomNumber | undefined,
  purpose: RequestPurpose,
) => Promise<LookupResult<Player>>;
type GetAlliance = (kingdom: KingdomNumber, key: AllianceKey, purpose: RequestPurpose) => Promise<LookupResult<Alliance>>;
type FindAlliance = (name: AllianceKey, purpose: RequestPurpose) => Promise<LookupResult<Alliance>>;

/**
 * The Game API as the Discord handlers use it. Every method is a spy, so a test reads what was asked and by whom:
 * `chargedTo` records the caller, and the spies of `charged` record the lookups made through any caller's view. The
 * uncharged methods record the purpose they were asked for; they are never charged to a Member.
 */
export class FakeGameApi {
  /** The charged lookups, the same spies for every caller: the caller is read from `chargedTo`. */
  readonly charged: {
    readonly getPlayer: Mock<ChargedGetPlayer>;
    readonly findPlayer: Mock<ChargedFindPlayer>;
    readonly getAlliance: Mock<ChargedGetAlliance>;
    readonly findAlliance: Mock<ChargedFindAlliance>;
  };
  readonly chargedTo: Mock<(caller: LookupCaller) => ChargedLookups>;
  readonly getPlayer: Mock<GetPlayer>;
  readonly findPlayer: Mock<FindPlayer>;
  readonly getAlliance: Mock<GetAlliance>;
  readonly findAlliance: Mock<FindAlliance>;

  constructor(answers: GameApiAnswers = {}) {
    const player: LookupResult<Player> = answers.player ?? { kind: "not-found" };
    const alliance: LookupResult<Alliance> = answers.alliance ?? { kind: "not-found" };
    const refusedUntil = answers.refusedUntil;
    const charge = <T>(result: LookupResult<T>): ChargedResult<T> =>
      refusedUntil === undefined ? result : { kind: "allowance-spent", resetsAt: refusedUntil };

    this.charged = {
      getPlayer: vi.fn<ChargedGetPlayer>(() => Promise.resolve(charge(player))),
      findPlayer: vi.fn<ChargedFindPlayer>(() => Promise.resolve(charge(player))),
      getAlliance: vi.fn<ChargedGetAlliance>(() => Promise.resolve(charge(alliance))),
      findAlliance: vi.fn<ChargedFindAlliance>(() => Promise.resolve(charge(alliance))),
    };
    this.chargedTo = vi.fn<(caller: LookupCaller) => ChargedLookups>(() => this.charged);
    this.getPlayer = vi.fn<GetPlayer>(() => Promise.resolve(player));
    this.findPlayer = vi.fn<FindPlayer>(() => Promise.resolve(player));
    this.getAlliance = vi.fn<GetAlliance>(() => Promise.resolve(alliance));
    this.findAlliance = vi.fn<FindAlliance>(() => Promise.resolve(alliance));
  }
}
