import { MessageFlags } from "discord.js";
import { parseBootyTime, parseBootyWindow } from "../domain/booty.js";
import { parseTimeZone } from "./booty-time.js";
import { bootyAlertsMessages } from "./booty-texts.js";
/** What a Member has never recorded: Off, the whole day, in UTC. */
const WHOLE_DAY_START = 0;
const WHOLE_DAY_END = 0;
const DEFAULT_TIME_ZONE = "UTC";
const MODES = ["off", "always", "online", "offline"];
/**
 * Answers /booty-alerts privately: the Booty Alerts shown when no option is given, or the Booty Alerts that the options
 * leave after the change. Options left out keep what is recorded. Invalid input is refused and nothing changes. A failed
 * read or save is logged and answered as unavailable; a failed reply is logged, never thrown.
 */
export async function handleBootyAlerts(interaction, context) {
    let content;
    try {
        content = answerFor(interaction, context);
    }
    catch (error) {
        context.logError(`Booty Alerts failed: ${errorMessage(error)}`);
        content = bootyAlertsMessages.unavailable;
    }
    try {
        await interaction.reply({ content, flags: MessageFlags.Ephemeral });
    }
    catch (error) {
        context.logError(`Replying to /booty-alerts failed: ${errorMessage(error)}`);
    }
}
function answerFor(interaction, context) {
    const memberId = interaction.user.id;
    if (context.links.linkFor(memberId) === undefined)
        return bootyAlertsMessages.notLinked;
    const typed = readTyped(interaction);
    if (!typed.ok)
        return typed.refusal;
    const stored = context.bootyAlerts.get(memberId);
    const { mode, startMinute, endMinute, timeZone } = typed.value;
    if (mode === undefined && startMinute === undefined && endMinute === undefined && timeZone === undefined) {
        return bootyAlertsMessages.shown(stored);
    }
    const base = stored ?? {
        mode: "off",
        window: windowOf(WHOLE_DAY_START, WHOLE_DAY_END),
        timeZone: DEFAULT_TIME_ZONE,
    };
    const next = {
        mode: mode ?? base.mode,
        window: windowOf(startMinute ?? base.window.startMinute, endMinute ?? base.window.endMinute),
        timeZone: timeZone ?? base.timeZone,
    };
    context.bootyAlerts.save(memberId, next);
    return bootyAlertsMessages.recorded(next);
}
/** Checks every option the Member typed; the first one that does not read is the refusal, and nothing is recorded. */
function readTyped(interaction) {
    const mode = optional(interaction.options.getString("mode"), parseMode);
    if (!mode.ok)
        return { ok: false, refusal: bootyAlertsMessages.invalidMode };
    const start = optional(interaction.options.getString("from"), parseBootyTime);
    if (!start.ok)
        return { ok: false, refusal: bootyAlertsMessages.invalidStart };
    const end = optional(interaction.options.getString("to"), parseBootyTime);
    if (!end.ok)
        return { ok: false, refusal: bootyAlertsMessages.invalidEnd };
    const timeZone = optional(interaction.options.getString("time-zone"), parseTimeZone);
    if (!timeZone.ok)
        return { ok: false, refusal: bootyAlertsMessages.invalidTimeZone };
    return {
        ok: true,
        value: { mode: mode.value, startMinute: start.value, endMinute: end.value, timeZone: timeZone.value },
    };
}
/** The value of an option the Member typed, read by parse; undefined when it was left out. */
function optional(input, parse) {
    if (input === null)
        return { ok: true, value: undefined };
    return parse(input);
}
function parseMode(input) {
    const mode = MODES.find((candidate) => candidate === input);
    return mode === undefined ? { ok: false } : { ok: true, value: mode };
}
/** The Booty Alerts window from two minutes after midnight; both come from checked input, so the domain accepts them. */
function windowOf(startMinute, endMinute) {
    const window = parseBootyWindow(startMinute, endMinute);
    if (!window.ok)
        throw new Error(`no Booty Alerts window from ${startMinute.toString()} to ${endMinute.toString()}`);
    return window.value;
}
function errorMessage(error) {
    return error instanceof Error ? error.message : String(error);
}
//# sourceMappingURL=booty.js.map