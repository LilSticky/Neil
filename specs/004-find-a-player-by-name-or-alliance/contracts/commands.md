# Contract: `/player`, `/alliance`, `/quota` and their components

Changes to slice 003's [lookup-changes](../../003-look-up-players-within-the-daily-quota/contracts/lookup-changes.md)
and [quota-command](../../003-look-up-players-within-the-daily-quota/contracts/quota-command.md). Everything not
named here stays. All texts escape Game API and Member input; no message mentions anyone.

## `/player`

| Option | Type | Required | Notes |
|--------|------|----------|-------|
| `uid` | string ≤ 32 | no | the number under the profile picture |
| `name` | string ≤ 32 | no | the complete in-game name |
| `kingdom` | integer 1–9999 | no | only with `name`; ignored with `uid` |

| Input | Answer |
|-------|--------|
| exactly `uid` (± `kingdom`) | slice 002/003 flow |
| exactly `name` (± `kingdom`) | name flow below |
| both or neither | private: `Give a uid, or a name (and optionally a kingdom).` |
| invalid name | private: `Give the player's complete in-game name (up to 32 characters).` |

Name flow: public thinking placeholder → `found` card (as uid) · `ambiguous` → placeholder removed, private
pick list · `not-found` → private `No player is named "{name}"{ in kingdom #K}. The name must be complete; a uid always works.` ·
`not-prepared` → private `Couldn't find a player named "{name}". Check the name; if it's right, the tracker may be busy, so try again later.` ·
other failures as for uid.

## `/alliance`

| Option | Type | Required | Notes |
|--------|------|----------|-------|
| `kingdom` | integer 1–9999 | no | with `alliance` |
| `alliance` | string ≤ 40 | no | the tag, with `kingdom` |
| `name` | string ≤ 40 | no | the exact full name, alone |

| Input | Answer |
|-------|--------|
| `kingdom` + `alliance` | tag flow (slice 002/003), card now with roster |
| `name` alone | name flow: `found` card · `ambiguous` private pick list · `not-found` private `No alliance is named exactly "{name}". Use the full name, or the kingdom and tag; approximate names are not supported.` |
| anything else | private: `Give the kingdom and the alliance tag, or the alliance's exact full name.` |

A tag lookup that answers `ambiguous` now also gets the private pick list (it used to be a text list).

## Alliance card

Slice 003's card plus roster fields:

- One field group per rank present, in the order R5, R4, R3, R2, R1, Unknown; field name `R5`, continued
  fields `R5 (cont.)`; each row `{name} · {uid}`; each field ≤ 1,024 characters.
- When the embed would pass 6,000 characters: the remaining rows become `… and {n} more, see the menu below`.
- Empty roster: one field `Roster` = `The tracker lists no members.` and no menu.
- Components (when the roster is not empty): row 1 a select menu `Look up a member…` with the page's ≤ 25
  Players (label `{rank} · {name}`, description `uid {uid}`, value = index on the page); row 2 (only when
  more than 25) buttons `◀ Previous`, `Page {p}/{n}` (disabled), `Next ▶`. Custom ids: the menu
  `pick:{id}:select:{p}` (the page it shows), the buttons `pick:{id}:page:{n}`, the disabled indicator `pick:{id}:info`.
  Option labels stay within 100 characters; a longer one is cut and ends with `…`.

## Pick list (several matches)

Private message: `Several players are named "{name}". Pick one:` (or `Several alliances are named "{name}". Pick one:`),
a select menu of ≤ 25 pickable matches (label `{name} · kingdom #{k}` / `[{tag}] {name} · kingdom #{k}`), and,
if more, `Only the first 25 are listed; add a kingdom to narrow it.` (Players) /
`Only the first 25 are listed; use the kingdom and tag.` (Alliances).

## Component answers

| Case | Answer |
|------|--------|
| not the owner | private: `Only the Member who ran this command can use this menu. Run /player or /alliance yourself.` |
| session unknown or older than 15 min | private: `This menu has expired. Run the command again.` |
| roster page button | the message is updated to that page; no Game API request |
| pick from a pick list | private message updated to `Showing {label}.` without components; card posted publicly as a follow-up |
| pick from the roster menu | Player card posted publicly as a reply; Alliance card unchanged |
| pick fails | the same private texts as the command (by uid / by Kingdom and tag) |

## Reserve message

`reserve-kept`, private: `Lookups are paused for today: the rest of the Daily Quota is kept for interviewing new members. They work again at 00:00 UTC ({time left}).`

## `/quota`

After the `Used · Remaining · Limit` line: `Quota Reserve: {reserve} (for Onboarding Interviews) · Left for lookups: {n}`.
