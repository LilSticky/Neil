import { MessageFlags } from "discord.js";
const messages = {
    unavailable: "Event Invitations are not available right now. Please tell an Officer.",
    notLinked: "Only a Linked Member can choose Event Invitations. Neil has changed nothing.",
    invalidChoice: "Choose on or off. Neil has changed nothing.",
    shown: (on) => on
        ? "Your Event Invitations are on: you are mentioned in them."
        : "Your Event Invitations are off: you are not mentioned in them.",
    switched: (on) => `Neil has switched your Event Invitations ${on ? "on" : "off"}. Reminders for Events you marked Interested still come.`,
};
/**
 * Answers /event-invitations privately. Without the `invitations` option it shows the Member's choice; with `on` or `off`
 * it switches the choice. Only a Linked Member may choose, and a refusal changes nothing. A failed read or write is logged
 * and answered as unavailable; a failed reply is logged, never thrown.
 */
export async function handleEventInvitations(interaction, context) {
    let content;
    try {
        content = answerFor(interaction, context);
    }
    catch (error) {
        context.logError(`Event Invitations failed: ${errorMessage(error)}`);
        content = messages.unavailable;
    }
    try {
        await interaction.reply({ content, flags: MessageFlags.Ephemeral });
    }
    catch (error) {
        context.logError(`Replying to /event-invitations failed: ${errorMessage(error)}`);
    }
}
function answerFor(interaction, context) {
    const memberId = interaction.user.id;
    if (context.links.linkFor(memberId) === undefined)
        return messages.notLinked;
    const choice = interaction.options.getString("invitations");
    if (choice === null)
        return messages.shown(!context.events.hasInvitationsOff(memberId));
    if (choice === "off") {
        context.events.setInvitationsOff(memberId);
        return messages.switched(false);
    }
    if (choice === "on") {
        context.events.clearInvitationsOff(memberId);
        return messages.switched(true);
    }
    return messages.invalidChoice;
}
function errorMessage(error) {
    return error instanceof Error ? error.message : String(error);
}
//# sourceMappingURL=event-invitations.js.map