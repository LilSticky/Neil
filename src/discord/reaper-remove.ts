import { mayChangeReaper, type Editor } from "../domain/exile.js";
import { parseUid, type KingdomNumber } from "../domain/lookup-input.js";
import type { MemberId } from "../domain/rank-approval.js";
import type { ReaperStore } from "../storage/reaper-store.js";
import type { AutocompleteChoice, FocusedOption } from "./alliance-autocomplete.js";
import { answer, replyPrivately } from "./lookup.js";
import type { OnboardingChannels } from "./onboarding-channels.js";
import type { ReaperInteraction } from "./reaper.js";
import { reaperMessages } from "./reaper-texts.js";

/** Discord shows at most 25 choices. */
const MAX_CHOICES = 25;
/** Discord takes at most 100 characters of a choice's label. */
const MAX_LABEL_LENGTH = 100;

/** What /reaper remove needs: the Editor check, REAPER, the log channel and the error log. */
export interface ReaperRemoveContext {
  readonly editorOf: (memberId: MemberId) => Editor | undefined;
  readonly homeKingdom: KingdomNumber;
  readonly reaper: Pick<ReaperStore, "find" | "remove">;
  readonly channels: Pick<OnboardingChannels, "log">;
  readonly logError: (message: string) => void;
}

/** The part of a discord.js chat-input interaction of /reaper that remove uses. */
export type ReaperRemoveInteraction = Pick<ReaperInteraction, "user" | "options" | "reply">;

/** What the autocomplete of the exile option of /reaper remove needs: REAPER only. */
export interface ReaperAutocompleteContext {
  readonly reaper: Pick<ReaperStore, "all">;
}

/** The part of a discord.js autocomplete interaction of /reaper remove that its suggestions use. */
export interface ReaperAutocompleteInteraction {
  readonly options: { getFocused(getFull: true): FocusedOption };
  respond(choices: readonly AutocompleteChoice[]): Promise<void>;
}

/**
 * Answers /reaper remove, privately: only Home Kingdom R5s, and only an Exile that is in REAPER. A removal is confirmed
 * privately and logged with the R5. The find and the remove run without an await between them.
 */
export async function handleReaperRemove(interaction: ReaperRemoveInteraction, context: ReaperRemoveContext): Promise<void> {
  await answer("/reaper remove", context, async () => {
    const editor = context.editorOf(interaction.user.id);
    if (editor === undefined || !mayChangeReaper(editor, context.homeKingdom)) {
      await replyPrivately(interaction, reaperMessages.refused);
      return;
    }
    const uid = parseUid(interaction.options.getString("exile") ?? "");
    const exile = uid.ok ? context.reaper.find(uid.value) : undefined;
    if (!uid.ok || exile === undefined) {
      await replyPrivately(interaction, reaperMessages.notAnExile);
      return;
    }

    context.reaper.remove(uid.value);
    const logged = reaperMessages.removeLog(exile.name, exile.uid, exile.kingdom, interaction.user.id);
    await answer("the log line of a REAPER change", context, () => context.channels.log({ content: logged }));
    await replyPrivately(interaction, reaperMessages.removed(exile.name));
  });
}

/**
 * Answers the autocomplete of the exile option of /reaper remove from REAPER, without a Game API request. Nothing typed
 * offers every Exile, newest first; otherwise the Exiles whose name contains what is typed, ignoring case. The value is
 * the uid.
 */
export async function handleReaperAutocomplete(
  interaction: ReaperAutocompleteInteraction,
  context: ReaperAutocompleteContext,
): Promise<void> {
  const focused = interaction.options.getFocused(true);
  const typed = String(focused.value).trim().toLowerCase();
  const choices = context.reaper
    .all()
    .filter((exile) => exile.name.toLowerCase().includes(typed))
    .slice(0, MAX_CHOICES)
    .map((exile) => ({
      name: cutLabel(reaperMessages.exileChoice(exile.name, exile.kingdom)),
      value: exile.uid,
    }));
  await interaction.respond(choices);
}

/** The label cut to 100 characters, at a whole code point so no surrogate pair is split. */
function cutLabel(text: string): string {
  let cut = "";
  for (const character of text) {
    if (cut.length + character.length > MAX_LABEL_LENGTH) break;
    cut += character;
  }
  return cut;
}
