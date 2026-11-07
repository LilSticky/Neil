import { MessageFlags } from "discord.js";
import { parseLeadTimes, } from "../domain/events.js";
import { parseAllianceKey, } from "../domain/lookup-input.js";
import { tagOfAllianceRole } from "../domain/managed-roles.js";
import { isOfficer } from "../domain/officer.js";
/** The owner of the kingdom's list. Alliance lists are keyed by their tag. */
const KINGDOM = "kingdom";
const messages = {
    unavailable: "Event Kinds are not available right now. Please tell an Officer.",
    notAllowed: "Only Officers keep the kingdom's Event Kinds, and only an R4 or R5 keeps their Alliance's. Neil has changed nothing.",
    invalidName: "Give the Event Kind a name.",
    invalidLeadTimes: "Write the lead times like 24h, 1h, 10m: up to 3, each from 1m to 7d. Neil has changed nothing.",
    invalidSignupDeadline: "The Sign-up Deadline is one time before the start, like 2h, from 1m to 7d. Neil has changed nothing.",
    signUpWithoutDeadline: "Lead times before the Sign-up Deadline need a Sign-up Deadline first. Neil has changed nothing.",
    full: "This list already holds 25 Event Kinds. Remove one, or add under the name of one already listed.",
    added: (name, label) => `Neil has added "${name}" to the Event Kinds of ${label}.`,
    removed: (name, label) => `Neil has removed "${name}" from the Event Kinds of ${label}.`,
    notListed: (name, label) => `"${name}" is not listed for ${label}. Nothing was removed.`,
    empty: (label) => `${label} has no Event Kinds yet.`,
    listed: (label, lines) => [`Event Kinds of ${label}:`, ...lines].join("\n"),
};
/**
 * Answers /event-kinds privately. `add` records an Event Kind under its name, replacing one of the same name; `remove`
 * drops one; `list` shows a list. The Home Kingdom's list is for Officers, an Alliance's for its R4 and R5; the `list`
 * option picks one, and left out, an R4 or R5 gets their Alliance's and an Officer the kingdom's. A refusal changes
 * nothing. A failed read or write is logged and answered as unavailable; a failed reply is logged, never thrown.
 */
export async function handleEventKinds(interaction, context) {
    let content;
    try {
        content = answerFor(interaction, context);
    }
    catch (error) {
        context.logError(`Event Kinds failed: ${errorMessage(error)}`);
        content = messages.unavailable;
    }
    try {
        await interaction.reply({ content, flags: MessageFlags.Ephemeral });
    }
    catch (error) {
        context.logError(`Replying to /event-kinds failed: ${errorMessage(error)}`);
    }
}
function answerFor(interaction, context) {
    const standing = standingOf(interaction, context);
    const subcommand = interaction.options.getSubcommand();
    if (subcommand === "add")
        return add(interaction, context, standing);
    if (subcommand === "remove")
        return remove(interaction, context, standing);
    if (subcommand === "list")
        return list(interaction, context, standing);
    throw new Error(`unknown /event-kinds subcommand ${subcommand}`);
}
function standingOf(interaction, context) {
    const roles = interaction.memberRoles();
    const officer = isOfficer(roles.map((role) => role.id), context.officerRoleIds);
    const tags = allianceTagsOf(roles);
    const rank = rankOf(context.links.linkFor(interaction.user.id)?.allianceRank);
    const managed = tags.length === 1 && (rank === "R4" || rank === "R5");
    return { officer, managedAlliance: managed ? tags[0] : undefined };
}
/** The Alliance tags the Member's Alliance roles name. A Member with none, or with several, has no Alliance Neil can tell. */
function allianceTagsOf(roles) {
    return roles.flatMap((role) => {
        const tag = tagOfAllianceRole(role.name);
        if (tag === undefined)
            return [];
        const key = parseAllianceKey(tag);
        return key.ok ? [key.value] : [];
    });
}
function rankOf(allianceRank) {
    if (allianceRank?.source === "game-api" ||
        allianceRank?.source === "rank-approval")
        return allianceRank.rank;
    return "unknown";
}
/** The list to act on: the one the Member chose, when they may manage it; else their default list, when they may manage one. */
function listFor(interaction, standing) {
    const choice = listChoiceOf(interaction.options.getString("list"));
    if (!choice.ok)
        return { ok: false, refusal: messages.notAllowed };
    const owner = ownerOf(standing, choice.value);
    return owner === undefined
        ? { ok: false, refusal: messages.notAllowed }
        : { ok: true, value: owner };
}
function listChoiceOf(raw) {
    if (raw === null)
        return { ok: true, value: undefined };
    if (raw === "kingdom" || raw === "alliance")
        return { ok: true, value: raw };
    return { ok: false };
}
function ownerOf(standing, choice) {
    if (choice === "kingdom")
        return standing.officer ? KINGDOM : undefined;
    if (choice === "alliance")
        return standing.managedAlliance;
    if (standing.managedAlliance !== undefined)
        return standing.managedAlliance;
    return standing.officer ? KINGDOM : undefined;
}
function labelOf(owner) {
    return owner === KINGDOM ? "the Home Kingdom" : `[${owner}]`;
}
function nameOf(interaction) {
    const name = (interaction.options.getString("name") ?? "").trim();
    return name.length === 0
        ? { ok: false, refusal: messages.invalidName }
        : { ok: true, value: name };
}
function add(interaction, context, standing) {
    const owner = listFor(interaction, standing);
    if (!owner.ok)
        return owner.refusal;
    const name = nameOf(interaction);
    if (!name.ok)
        return name.refusal;
    const beforeStart = parseLeadTimes(interaction.options.getString("before-start") ?? "");
    if (!beforeStart.ok)
        return messages.invalidLeadTimes;
    const signUp = signUpOf(interaction.options.getString("signup-deadline"), interaction.options.getString("before-signup"));
    if (!signUp.ok)
        return signUp.refusal;
    const kind = {
        name: name.value,
        beforeStart: beforeStart.value,
        signupOffsetMinutes: signUp.value.signupOffsetMinutes,
        beforeSignup: signUp.value.beforeSignup,
    };
    const result = context.events.addKind(owner.value, kind);
    if (!result.ok)
        return messages.full;
    return messages.added(name.value, labelOf(owner.value));
}
/** The Sign-up Deadline: one lead time before the start, with the lead times before it; both left out, there is none. */
function signUpOf(deadline, before) {
    if (deadline === null) {
        if (before !== null)
            return { ok: false, refusal: messages.signUpWithoutDeadline };
        return {
            ok: true,
            value: { signupOffsetMinutes: undefined, beforeSignup: [] },
        };
    }
    const offset = parseLeadTimes(deadline);
    if (!offset.ok || offset.value.length !== 1)
        return { ok: false, refusal: messages.invalidSignupDeadline };
    if (before === null)
        return {
            ok: true,
            value: { signupOffsetMinutes: offset.value[0], beforeSignup: [] },
        };
    const beforeSignup = parseLeadTimes(before);
    if (!beforeSignup.ok)
        return { ok: false, refusal: messages.invalidLeadTimes };
    return {
        ok: true,
        value: {
            signupOffsetMinutes: offset.value[0],
            beforeSignup: beforeSignup.value,
        },
    };
}
function remove(interaction, context, standing) {
    const owner = listFor(interaction, standing);
    if (!owner.ok)
        return owner.refusal;
    const name = nameOf(interaction);
    if (!name.ok)
        return name.refusal;
    const listed = context.events
        .listKinds(owner.value)
        .some((kind) => sameName(kind.name, name.value));
    if (!listed)
        return messages.notListed(name.value, labelOf(owner.value));
    context.events.removeKind(owner.value, name.value);
    return messages.removed(name.value, labelOf(owner.value));
}
function list(interaction, context, standing) {
    const owner = listFor(interaction, standing);
    if (!owner.ok)
        return owner.refusal;
    const kinds = context.events.listKinds(owner.value);
    if (kinds.length === 0)
        return messages.empty(labelOf(owner.value));
    return messages.listed(labelOf(owner.value), kinds.map((kind) => `- ${describe(kind)}`));
}
function sameName(a, b) {
    return a.toLowerCase() === b.toLowerCase();
}
/** One Event Kind as a line: its name, the lead times of its start reminders and, if any, its Sign-up Deadline. */
function describe(kind) {
    const starts = `${kind.beforeStart.map(formatLead).join(", ")} before the start`;
    if (kind.signupOffsetMinutes === undefined)
        return `**${kind.name}**: ${starts}`;
    const deadline = `Sign-up Deadline ${formatLead(kind.signupOffsetMinutes)} before the start`;
    const reminders = kind.beforeSignup.length === 0
        ? ""
        : ` (reminders ${kind.beforeSignup.map(formatLead).join(", ")} before it)`;
    return `**${kind.name}**: ${starts}; ${deadline}${reminders}`;
}
/** A lead time in minutes as the Member typed it: whole hours as h, otherwise minutes as m. */
function formatLead(minutes) {
    return minutes % 60 === 0
        ? `${(minutes / 60).toString()}h`
        : `${minutes.toString()}m`;
}
function errorMessage(error) {
    return error instanceof Error ? error.message : String(error);
}
//# sourceMappingURL=event-kinds.js.map