import { ButtonStyle, ComponentType, escapeMarkdown, } from "discord.js";
import { sortRoster } from "../domain/alliance-rank.js";
import { lastSeen } from "../domain/alliance-overview.js";
import { utcDayOf } from "../domain/daily-quota.js";
import { parseAllianceKey } from "../domain/lookup-input.js";
import { PICTURE_PATH_PATTERN } from "../domain/picture-path.js";
import { listedAllianceMatches, listedPlayerMatches, rankedAllianceMatches, } from "../domain/player.js";
import { clampPage, pageCount, pageOf } from "./pick-sessions.js";
const FOOTER_SOURCE = "Data from Last Asylum Tracker";
const TITLE_MAX_LENGTH = 256;
/** Discord's limits: a field's value, and everything in one embed (title, footers, field names and values). */
const FIELD_VALUE_MAX_LENGTH = 1024;
const EMBED_MAX_LENGTH = 6000;
const ROSTER_FIELD = "Roster";
const EMPTY_ROSTER_TEXT = "The tracker lists no members.";
/** Discord's limit on a select menu option's label. */
const OPTION_LABEL_MAX_LENGTH = 100;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** The accent color both cards use. */
export const CARD_COLOR = 0xb33a3a;
const TRACKER_ORIGIN = "https://lastasylumtracker.com";
const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const THOUSAND = 1_000;
/** The suffixes of compact numbers above 999, smallest first; numbers from a billion on use B. */
const COMPACT_UNITS = [
    { size: 1_000, suffix: "K" },
    { size: 1_000_000, suffix: "M" },
];
const BILLION = 1_000_000_000;
const LANGUAGE_NAMES = new Intl.DisplayNames(["en"], { type: "language" });
function twoDigits(value) {
    return value.toString().padStart(2, "0");
}
/** A number with thousands separators, as the cards show full numbers. */
function thousands(value) {
    return value.toLocaleString("en-US");
}
/** The time since a moment, as "just now", "12 min ago", "3 h ago" or "2 days ago"; never more precise than that. */
export function timeAgo(moment, now) {
    const ms = now.getTime() - moment.getTime();
    if (ms < MINUTE_MS)
        return "just now";
    if (ms < HOUR_MS)
        return `${Math.floor(ms / MINUTE_MS).toString()} min ago`;
    if (ms < DAY_MS)
        return `${Math.floor(ms / HOUR_MS).toString()} h ago`;
    const days = Math.floor(ms / DAY_MS);
    return days === 1 ? "1 day ago" : `${days.toString()} days ago`;
}
/** One decimal place at most, the ".0" dropped; `tenths` is the number times ten, rounded. */
function tenthsText(tenths) {
    const whole = Math.floor(tenths / 10).toString();
    const fraction = tenths % 10;
    return fraction === 0 ? whole : `${whole}.${fraction.toString()}`;
}
/**
 * A number in short form: below 1,000 as it is, else K, M or B with at most one decimal. The unit is chosen after
 * rounding, so 999,950 reads as 1M rather than 1000K.
 */
export function compactNumber(value) {
    if (value < THOUSAND)
        return value.toString();
    for (const { size, suffix } of COMPACT_UNITS) {
        const tenths = Math.round((value / size) * 10);
        if (tenths < 10_000)
            return `${tenthsText(tenths)}${suffix}`;
    }
    return `${tenthsText(Math.round((value / BILLION) * 10))}B`;
}
/** The English name of a language code (`ja` reads as Japanese); a code it cannot name is shown in capitals. */
export function languageName(code) {
    try {
        const name = LANGUAGE_NAMES.of(code);
        if (name !== undefined && name !== code)
            return name;
    }
    catch {
        // Intl refuses a code that is not a language tag at all; it is shown as the Game sent it.
    }
    return code.toUpperCase();
}
/** The full address of a picture the tracker serves, or undefined when the path is not a picture path. */
export function trackerPicture(path) {
    if (path === undefined || !PICTURE_PATH_PATTERN.test(path))
        return undefined;
    return `${TRACKER_ORIGIN}${path}`;
}
/** The Join Requirements as one line: "Open to all" or "By application", then the minimums above zero. */
export function joinRequirementsText(requirements) {
    const parts = [requirements.open ? "Open to all" : "By application"];
    if (requirements.minimumMight > 0)
        parts.push(`min. ${compactNumber(requirements.minimumMight)} Might`);
    if (requirements.minimumSanctuaryLevel > 0) {
        parts.push(`min. sanctuary level ${requirements.minimumSanctuaryLevel.toString()}`);
    }
    return parts.join(" · ");
}
/** The time from now until a moment, as "in 3 h 12 min", "in 59 min" or "in under a minute"; seconds are dropped. */
export function timeLeft(until, now) {
    const ms = Math.max(0, until.getTime() - now.getTime());
    if (ms < MINUTE_MS)
        return "in under a minute";
    const hours = Math.floor(ms / HOUR_MS);
    const minutes = Math.floor((ms % HOUR_MS) / MINUTE_MS);
    return hours > 0 ? `in ${hours.toString()} h ${minutes.toString()} min` : `in ${minutes.toString()} min`;
}
/** A moment as "HH:MM UTC". Formatted by hand so no locale changes it. */
export function utcTime(moment) {
    return `${twoDigits(moment.getUTCHours())}:${twoDigits(moment.getUTCMinutes())} UTC`;
}
/**
 * The card footer: the source and when the data was fetched, in UTC. Today's fetch shows the time only; an earlier
 * day shows the day and English month too.
 */
export function footerFor(fetchedAt, now) {
    const time = utcTime(fetchedAt);
    const when = utcDayOf(fetchedAt) === utcDayOf(now)
        ? time
        : `${fetchedAt.getUTCDate().toString()} ${MONTHS[fetchedAt.getUTCMonth()] ?? ""} ${time}`;
    return { text: `${FOOTER_SOURCE} · as of ${when}` };
}
/** Escapes Game API and user text for Discord markdown; discord.js leaves a lone `~` alone, so it is escaped here. */
export function escapeText(text) {
    return escapeMarkdown(text).replaceAll("~", "\\~");
}
/**
 * Fits an escaped title into Discord's 256 characters, ending with an ellipsis. It cuts after escaping, so the
 * limit counts what Discord shows, and it never leaves a backslash without the character it escapes.
 */
export function fitTitle(escaped) {
    if (escaped.length <= TITLE_MAX_LENGTH)
        return escaped;
    let kept = escaped.slice(0, TITLE_MAX_LENGTH - 1);
    const trailingBackslashes = /\\*$/.exec(kept)?.[0] ?? "";
    if (trailingBackslashes.length % 2 === 1)
        kept = kept.slice(0, -1);
    return `${kept}…`;
}
/** A select menu option's label, cut to 100 characters when longer, ending with an ellipsis. */
export function optionLabel(text) {
    if (text.length <= OPTION_LABEL_MAX_LENGTH)
        return text;
    return `${text.slice(0, OPTION_LABEL_MAX_LENGTH - 1)}…`;
}
/** A Game API text for a field: the escaped text, or Unknown when the Game left it out or sent it empty. */
function valueOrUnknown(text) {
    return text === undefined || text === "" ? "Unknown" : escapeText(text);
}
/** A field that is shown only when its value is known. */
function optionalField(name, value) {
    return value === undefined ? [] : [{ name, value, inline: true }];
}
/** The value of a Game detail when it is known, shown with `text`; undefined when the Game gave none. */
function shownWhenKnown(value, text) {
    return value === undefined ? undefined : text(value);
}
/** The author line: the Kingdom, with its badge as the icon when the Game gave a usable picture path. */
export function kingdomAuthor(kingdom, badgePath) {
    const name = `Kingdom #${kingdom.toString()}`;
    const icon = trackerPicture(badgePath);
    return icon === undefined ? { name } : { name, icon_url: icon };
}
/** The picture beside a card, when the Game gave a usable picture path. */
export function thumbnailOf(path) {
    const url = trackerPicture(path);
    return url === undefined ? undefined : { url };
}
/** A language code as its English name, escaped. */
function languageText(code) {
    return escapeText(languageName(code));
}
/** The Alliance Level as "Level 4 · 8,881,750 XP", "Level 4" without the XP, or nothing when neither is known. */
function allianceLevelText(level, xp) {
    const parts = [];
    if (level !== undefined)
        parts.push(`Level ${level.toString()}`);
    if (xp !== undefined)
        parts.push(`${thousands(xp)} XP`);
    return parts.length === 0 ? undefined : parts.join(" · ");
}
/**
 * The card's description: "Last online" with the time, or "Online now" when the details exist but the Game gave no
 * Last Online time. Nothing when the Player has no details at all.
 */
function onlineText(details, now) {
    if (details === undefined)
        return undefined;
    const seen = lastSeen(details);
    return seen.kind === "online" ? "Online now" : `Last online ${timeAgo(seen.at, now)}`;
}
/** The public card for a Player. Every Game API text is escaped, so names cannot format or ping. */
export function renderPlayerCard(player, fetchedAt, now) {
    const details = player.details;
    const alliance = player.alliance === undefined
        ? "No alliance"
        : `[${escapeText(player.alliance.tag)}] ${escapeText(player.alliance.name)}`;
    const fields = [
        { name: "Might", value: thousands(player.might), inline: true },
        ...optionalField("Kills", shownWhenKnown(details?.kills, thousands)),
        ...optionalField("Likes", shownWhenKnown(details?.likes, thousands)),
        { name: "Sanctuary level", value: player.sanctuaryLevel.toString(), inline: true },
        ...optionalField("VIP Level", shownWhenKnown(details?.vipLevel, (level) => level.toString())),
        ...optionalField("Language", shownWhenKnown(details?.language, languageText)),
        { name: "Alliance", value: alliance, inline: true },
    ];
    if (player.alliance !== undefined) {
        const rank = player.allianceRank === "unknown" ? "Unknown" : player.allianceRank;
        fields.push({ name: "Alliance Rank", value: rank, inline: true });
    }
    fields.push(...optionalField("Location", shownWhenKnown(details?.location, (location) => `X:${location.x.toString()} Y:${location.y.toString()}`)));
    const thumbnail = thumbnailOf(details?.avatarPath);
    const lastOnline = onlineText(details, now);
    return {
        title: fitTitle(escapeText(player.name)),
        color: CARD_COLOR,
        author: kingdomAuthor(player.kingdom, details?.kingdomBadgePath),
        ...(thumbnail === undefined ? {} : { thumbnail }),
        ...(lastOnline === undefined ? {} : { description: lastOnline }),
        fields,
        footer: footerFor(fetchedAt, now),
    };
}
/**
 * The characters Discord counts toward an embed's limit: the title, the author name, the description, the footer and
 * every field's name and value.
 */
export function embedCharacters(embed) {
    const texts = [
        embed.title ?? "",
        embed.author?.name ?? "",
        embed.description ?? "",
        embed.footer?.text ?? "",
        ...(embed.fields ?? []).flatMap((field) => [field.name, field.value]),
    ];
    return texts.reduce((total, text) => total + text.length, 0);
}
/** One roster row as the card shows it: the escaped name, then the might in short form when the Game gave it. */
function rosterRow(entry) {
    const name = escapeText(entry.name);
    return entry.might === undefined ? name : `${name} · ${compactNumber(entry.might)}`;
}
/** An Alliance Rank as a field or menu label: R1–R5, or Unknown. */
function rankLabel(rank) {
    return rank === "unknown" ? "Unknown" : rank;
}
/**
 * The roster rows that fit in `budget` characters, as fields in order: one field per rank, continued past 1,024
 * characters. Stops at the first row that does not fit; `shown` counts the rows taken.
 */
function rosterFields(entries, budget) {
    const fields = [];
    let used = 0;
    let shown = 0;
    for (const entry of entries) {
        const row = rosterRow(entry);
        const current = fields.at(-1);
        const sameRank = current !== undefined && current.rank === entry.allianceRank;
        if (current !== undefined && sameRank && current.value.length + 1 + row.length <= FIELD_VALUE_MAX_LENGTH) {
            if (used + 1 + row.length > budget)
                break;
            current.value = `${current.value}\n${row}`;
            used += 1 + row.length;
        }
        else {
            const label = rankLabel(entry.allianceRank);
            const name = sameRank ? `${label} (cont.)` : label;
            if (used + name.length + row.length > budget)
                break;
            fields.push({ rank: entry.allianceRank, name, value: row });
            used += name.length + row.length;
        }
        shown += 1;
    }
    return { fields: fields.map(({ name, value }) => ({ name, value })), shown };
}
/** The note that replaces the rows left out of a card; the menu below still covers all of them. */
function rosterNote(hidden) {
    return `… and ${hidden.toString()} more, see the menu below`;
}
/**
 * The roster fields of a card's page: an empty roster reads so; otherwise the rows of the page that fit under Discord's
 * embed limit, with a note counting the rest of the page when some do not. `fixed` is what the rest of the embed takes.
 */
function rosterSection(shown, fixed) {
    if (shown.length === 0)
        return [{ name: ROSTER_FIELD, value: EMPTY_ROSTER_TEXT }];
    const everything = rosterFields(shown, EMBED_MAX_LENGTH - fixed);
    if (everything.shown === shown.length)
        return everything.fields;
    // The reserve is for the note at its longest, when every row is left out.
    const reserve = ROSTER_FIELD.length + rosterNote(shown.length).length;
    const fitted = rosterFields(shown, EMBED_MAX_LENGTH - fixed - reserve);
    const hidden = shown.length - fitted.shown;
    return [...fitted.fields, { name: ROSTER_FIELD, value: rosterNote(hidden) }];
}
/**
 * The public card for an Alliance. Its roster section lists only the rows of one page of the roster menu (25 per page,
 * in menu order; a page past the last one is clamped), so the card follows the menu's page. The Alliance fields are the
 * same on every page. Every Game API text is escaped; a missing Leader reads Unknown.
 */
export function renderAllianceCard(alliance, fetchedAt, now, page = 0) {
    const details = alliance.details;
    const fields = [
        { name: "Might", value: thousands(alliance.might), inline: true },
        ...optionalField("Kingdom Might Rank", shownWhenKnown(details?.kingdomMightRank, (rank) => `#${rank.toString()} in Kingdom #${alliance.kingdom.toString()}`)),
        {
            name: "Members",
            value: `${alliance.memberCount.toString()}/${alliance.capacity.toString()}`,
            inline: true,
        },
        {
            name: "Leader",
            value: valueOrUnknown(alliance.leaderName),
            inline: true,
        },
        ...optionalField("Alliance Level", allianceLevelText(details?.level, details?.xp)),
        ...optionalField("Gift Level", shownWhenKnown(details?.giftLevel, (level) => level.toString())),
        ...optionalField("Language", shownWhenKnown(details?.language, languageText)),
    ];
    const thumbnail = thumbnailOf(details?.badgePath);
    const joinRequirements = shownWhenKnown(details?.joinRequirements, joinRequirementsText);
    const embed = {
        title: fitTitle(`[${escapeText(alliance.tag)}] ${escapeText(alliance.name)}`),
        color: CARD_COLOR,
        author: kingdomAuthor(alliance.kingdom, details?.kingdomBadgePath),
        ...(thumbnail === undefined ? {} : { thumbnail }),
        ...(joinRequirements === undefined ? {} : { description: `**Join Requirements:** ${joinRequirements}` }),
        fields,
        footer: footerFor(fetchedAt, now),
    };
    const shown = pageOf(sortRoster(alliance.roster), page);
    return { ...embed, fields: [...fields, ...rosterSection(shown, embedCharacters(embed))] };
}
/** The Player pick list's note when matches were left out. */
const PLAYER_PICK_LIMIT_NOTE = "Only the first 25 are listed; add a kingdom to narrow it.";
/** Texts Neil sends privately when a lookup does not give a card. Interpolated input is escaped. */
export const lookupMessages = {
    giveUidOrName: "Give a uid, or a name (and optionally a kingdom).",
    invalidUid: "That doesn't look like a uid. A uid is a number: in the game, tap your profile picture (top left), then the feather next to your name; the number under the picture is your uid.",
    invalidPlayerName: "Give the player's complete in-game name (up to 32 characters).",
    invalidKingdom: "The kingdom must be a number from 1 to 9999.",
    invalidAlliance: "Give the alliance's tag (up to 40 characters).",
    playerNotFound: (uid) => `No player has the uid ${escapeText(uid)}.`,
    playerNotPrepared: (uid) => `Couldn't find a player with the uid ${escapeText(uid)}. Check the uid; if it's right, the tracker may be busy, so try again later.`,
    playerNameNotFound: (name, kingdom) => {
        const inKingdom = kingdom === undefined ? "" : ` in kingdom #${kingdom.toString()}`;
        return `No player is named "${escapeText(name)}"${inKingdom}. The name must be complete; a uid always works.`;
    },
    playerNameNotPrepared: (name) => `Couldn't find a player named "${escapeText(name)}". Check the name; if it's right, the tracker may be busy, so try again later.`,
    allianceNotFound: (key, kingdom) => `No alliance "${escapeText(key)}" in kingdom #${kingdom.toString()}.`,
    quotaSpent: (resetsAt, now) => `Lookups are paused: Neil has used today's Daily Quota of Game API requests. They work again at 00:00 UTC (${timeLeft(resetsAt, now)}).`,
    reserveKept: (resetsAt, now) => `Lookups are paused for today: the rest of the Daily Quota is kept for interviewing new members. They work again at 00:00 UTC (${timeLeft(resetsAt, now)}).`,
    tryAgain: "The game tracker is busy right now. Try again in a moment.",
    unavailable: "Lookups are not working right now. Please tell an Officer.",
    showing: (label) => `Showing ${escapeText(label)}.`,
    giveKingdomAndTagOrName: "Give the kingdom and the alliance tag, or the alliance's exact full name.",
    allianceNameNotFound: (key) => `No alliance is named "${escapeText(key)}", and none I know is close. Try the tag, or start typing and pick a suggestion.`,
};
/** A Player match as the pick list labels it: its name and Kingdom. */
export function playerPickLabel(match) {
    return `${match.name ?? "Unknown"} · kingdom #${match.kingdom.toString()}`;
}
/**
 * The private pick list for an ambiguous Player name: a select menu of the pickable matches, valued by their index
 * in the list, under the session id the pick handler looks up.
 */
export function renderPlayerPickList(name, matches, sessionId) {
    const { listed, leftOut } = listedPlayerMatches(matches);
    const note = leftOut > 0 ? `\n${PLAYER_PICK_LIMIT_NOTE}` : "";
    const options = listed.map((match, index) => ({
        label: optionLabel(match.name ?? "Unknown"),
        description: `Kingdom #${match.kingdom.toString()}`,
        value: index.toString(),
    }));
    return {
        content: `Several players are named "${escapeText(name)}". Pick one:${note}`,
        components: [
            {
                type: ComponentType.ActionRow,
                components: [{ type: ComponentType.StringSelect, custom_id: `pick:${sessionId}:select`, options }],
            },
        ],
    };
}
/** The Alliance pick list's note when matches were left out. */
const ALLIANCE_PICK_LIMIT_NOTE = "Only the first 25 are listed; use the kingdom and tag.";
/** An Alliance match as the pick list labels it: its tag, name and Kingdom. */
export function alliancePickLabel(match) {
    return `[${match.tag}] ${match.name ?? "Unknown"} · kingdom #${match.kingdom.toString()}`;
}
/**
 * The private pick list for an ambiguous Alliance name: a select menu of the pickable matches, valued by their index
 * in the list, under the session id the pick handler looks up.
 */
export function renderAlliancePickList(key, matches, sessionId) {
    const { listed, leftOut } = listedAllianceMatches(matches);
    const note = leftOut > 0 ? `\n${ALLIANCE_PICK_LIMIT_NOTE}` : "";
    const options = listed.map((match, index) => ({
        label: optionLabel(alliancePickLabel(match)),
        value: index.toString(),
    }));
    return {
        content: `Several alliances are named "${escapeText(key)}". Pick one:${note}`,
        components: [
            {
                type: ComponentType.ActionRow,
                components: [{ type: ComponentType.StringSelect, custom_id: `pick:${sessionId}:select`, options }],
            },
        ],
    };
}
/**
 * The private pick list for a name no Alliance has, while Known Alliances are close to it: a select menu of them as
 * `[TAG] Name`, under the session id the pick handler looks up. The pick handler lists the matches in the same order.
 */
export function renderCloseAlliancePickList(name, matches, sessionId) {
    const options = rankedAllianceMatches(matches).map((match, index) => ({
        label: optionLabel(`[${match.tag}] ${match.name ?? "Unknown"}`),
        value: index.toString(),
    }));
    return {
        content: `No alliance is named "${escapeText(name)}". Did you mean one of these?`,
        components: [
            {
                type: ComponentType.ActionRow,
                components: [{ type: ComponentType.StringSelect, custom_id: `pick:${sessionId}:select`, options }],
            },
        ],
    };
}
/**
 * The roster menu under an Alliance card: a select menu of the page's members (by rank and name, valued by index on
 * the page), and past one page a row of Previous, the page and Next. The roster is ordered as the card orders it.
 * An empty roster has no menu.
 */
export function renderRosterComponents(entries, page, sessionId) {
    if (entries.length === 0)
        return [];
    const ordered = sortRoster(entries);
    const pages = pageCount(ordered);
    const current = clampPage(page, ordered);
    const options = pageOf(ordered, current).map((entry, index) => ({
        label: optionLabel(entry.name),
        description: rankLabel(entry.allianceRank),
        value: index.toString(),
    }));
    const rows = [
        {
            type: ComponentType.ActionRow,
            components: [
                {
                    type: ComponentType.StringSelect,
                    custom_id: `pick:${sessionId}:select:${current.toString()}`,
                    placeholder: "Look up a member…",
                    options,
                },
            ],
        },
    ];
    if (pages > 1) {
        rows.push({
            type: ComponentType.ActionRow,
            components: [
                {
                    type: ComponentType.Button,
                    style: ButtonStyle.Secondary,
                    label: "◀ Previous",
                    custom_id: `pick:${sessionId}:page:${Math.max(0, current - 1).toString()}`,
                    disabled: current === 0,
                },
                {
                    type: ComponentType.Button,
                    style: ButtonStyle.Secondary,
                    label: `Page ${(current + 1).toString()}/${pages.toString()}`,
                    custom_id: `pick:${sessionId}:info`,
                    disabled: true,
                },
                {
                    type: ComponentType.Button,
                    style: ButtonStyle.Secondary,
                    label: "Next ▶",
                    custom_id: `pick:${sessionId}:page:${Math.min(pages - 1, current + 1).toString()}`,
                    disabled: current === pages - 1,
                },
            ],
        });
    }
    return rows;
}
/**
 * The components under an Alliance card: the roster menu and its page buttons, then an "Overview" button for any Member.
 * The button's custom id names the pick session, the Kingdom and the tag, so a press can find the Alliance again. An
 * empty roster has no components at all, and neither has an Alliance whose tag cannot be named in a custom id.
 */
export function renderAllianceComponents(alliance, page, sessionId) {
    const rows = renderRosterComponents(alliance.roster, page, sessionId);
    const key = parseAllianceKey(alliance.tag);
    if (rows.length === 0 || !key.ok)
        return rows;
    const overview = {
        type: ComponentType.Button,
        style: ButtonStyle.Secondary,
        label: "Overview",
        custom_id: `pick:${sessionId}:overview:${alliance.kingdom.toString()}:${key.value}`,
    };
    return [...rows, { type: ComponentType.ActionRow, components: [overview] }];
}
//# sourceMappingURL=lookup-cards.js.map