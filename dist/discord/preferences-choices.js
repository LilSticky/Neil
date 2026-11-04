import { MessageFlags } from "discord.js";
import { EXPERIENCES, GAME_LANGUAGES, REGIONS, allianceRankOf, interestOptions, } from "../domain/preferences.js";
import { notLinkedReply, notYoursReply, parsePreferencesCustomId, preferencesFailedReply, preferencesLogLine, preferencesMessage, savedMessage, } from "./preferences-texts.js";
/** Builds the handler of the Preferences message's presses and of /channels. */
export function createPreferenceChoices(deps) {
    return {
        async press(press) {
            const tracked = trackAnswer(press);
            try {
                await handlePress(deps, tracked.press);
            }
            catch (error) {
                deps.logError(`A Preferences press by ${press.user.id} failed: ${reasonOf(error)}`);
                if (!tracked.answered())
                    await replyFailed(deps, press);
            }
        },
        async showChannels(command) {
            try {
                await answerChannels(deps, command);
            }
            catch (error) {
                deps.logError(`/channels by ${command.user.id} failed: ${reasonOf(error)}`);
            }
        },
    };
}
async function handlePress(deps, press) {
    const parsed = parsePreferencesCustomId(press.customId);
    if (parsed === undefined)
        throw new Error(`the custom id ${press.customId} is not one of the Preferences message`);
    const { question, memberId } = parsed;
    if (memberId !== press.user.id) {
        await press.reply(notYoursReply());
        return;
    }
    const link = deps.links.linkFor(memberId);
    if (link === undefined) {
        await press.reply(notLinkedReply());
        return;
    }
    if (question === "done") {
        await finish(deps, press, memberId);
        return;
    }
    await change(deps, press, { memberId, rank: link.allianceRank, question });
}
/** /channels: a Linked Member gets their Preferences message, privately, and nothing changes. */
async function answerChannels(deps, command) {
    const memberId = command.user.id;
    const link = deps.links.linkFor(memberId);
    if (link === undefined) {
        await command.reply(notLinkedReply());
        return;
    }
    const message = messageFor(deps, memberId, deps.preferences.get(memberId), allianceRankOf(link.allianceRank));
    await command.reply({ ...message, flags: MessageFlags.Ephemeral });
}
/**
 * Done: the message is answered first, then the thread goes, unless a Rank Approval waits, and only then the prompt closes:
 * a thread that cannot be deleted leaves the prompt open, so that the next sweep retries it.
 */
async function finish(deps, press, memberId) {
    await press.update(savedMessage());
    const prompt = deps.preferences.prompt(memberId);
    if (prompt === undefined)
        return;
    if (deps.rankApprovals.pendingFor(memberId) === undefined)
        await deps.channels.deleteThread(prompt.threadId);
    deps.preferences.closePrompt(memberId);
}
/** The press as the handler sees it, and whether it has been answered: a reply or an update, once made, counts. */
function trackAnswer(press) {
    let answered = false;
    return {
        press: {
            customId: press.customId,
            user: press.user,
            values: press.values,
            reply: (message) => {
                answered = true;
                return press.reply(message);
            },
            update: (options) => {
                answered = true;
                return press.update(options);
            },
        },
        answered: () => answered,
    };
}
/** A press that failed before it was answered gets a private error, so that Discord does not show it as failed. */
async function replyFailed(deps, press) {
    try {
        await press.reply(preferencesFailedReply());
    }
    catch (error) {
        deps.logError(`Answering a failed Preferences press by ${press.user.id} failed: ${reasonOf(error)}`);
    }
}
/** A select change: saves the answer, answers the press with the new Preferences, then applies the roles and logs. */
async function change(deps, press, target) {
    const { memberId, rank, question } = target;
    const values = press.values ?? [];
    const alliance = allianceRankOf(rank);
    switch (question) {
        case "languages":
            deps.preferences.setLanguages(memberId, languagesPicked(values));
            break;
        case "region":
            deps.preferences.setRegion(memberId, regionPicked(values));
            break;
        case "interests":
            deps.preferences.setInterests(memberId, interestsPicked(values, alliance));
            break;
        case "experience":
            deps.preferences.setExperience(memberId, experiencePicked(values));
            break;
    }
    const preferences = deps.preferences.get(memberId);
    await press.update(messageFor(deps, memberId, preferences, alliance));
    await deps.roles.apply(memberId);
    await deps.channels.log(preferencesLogLine(memberId, preferences));
}
/** The Preferences message as the presses and /channels show it; the Member's playing language is not looked up here. */
function messageFor(deps, memberId, preferences, rank) {
    return preferencesMessage({
        memberId,
        preferences,
        rank,
        playerLanguage: undefined,
        guidesForumId: deps.guidesForumId,
    });
}
function languagesPicked(values) {
    return new Set(GAME_LANGUAGES.map((language) => language.code).filter((code) => values.includes(code)));
}
function regionPicked(values) {
    return REGIONS.find((region) => values.includes(region.key))?.key;
}
function interestsPicked(values, rank) {
    return new Set(interestOptions(rank)
        .map((interest) => interest.key)
        .filter((key) => values.includes(key)));
}
function experiencePicked(values) {
    return EXPERIENCES.find((experience) => values.includes(experience.key))?.key;
}
function reasonOf(error) {
    return error instanceof Error ? error.message : String(error);
}
//# sourceMappingURL=preferences-choices.js.map