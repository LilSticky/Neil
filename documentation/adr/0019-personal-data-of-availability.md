# 19. Personal data of Availability

Date: 2026-11-16

## Status

Accepted

## Context

Slice 036 lets every Linked Member of a Home Kingdom Alliance answer the week's Availability Poll: whether they fight in the Raid,
and as which Fighter Class (Whale, Dolphin, Seal or Small Fry). Neil suggests the class from the Member's Troop Bracket and Might.
The constitution (principle V) asks that personal data is kept to what a feature needs, and that what is stored, and for how long,
is documented in an ADR. Whether someone fights, and how strong they are, is personal data a Member may not want shown to all.

## Decision

We will store, per Member who answers, one row per Raid in `availability_answers`: the Member id, the Alliance tag of the card they
answered on, whether they are available, the Fighter Class when they are, and when they answered. A new answer replaces the old one.

We will delete a Raid's answers when its poll closes, at the Raid start or when the War Council cancels the Raid; only the counts
written on the cards remain. We will also delete a Member's answers when their Link ends, also when they leave the server.

We will show an answer only to the Member who gave it, in a private reply. Everyone else, the War Council and the Alliance leaders
included, sees counts per Alliance and for the Kingdom, never names. No card, summary or log line mentions anybody.

We will read the Member's Troop Bracket and Might from Neil's cached copy of their Linked Player (an uncharged lookup) to suggest the
class, and will not store either. The polls (`availability_polls`) and their cards (`availability_cards`) hold no personal data.

## Consequences

- Nothing is stored for a Member who never answers.
- Nobody can tell from Neil who said they will fight, or as what; the War Council plans with counts only. If it ever needs names,
  that is a new decision.
- After the Raid start the answers are gone, so Neil cannot compare a Member's answer with what they did, or reuse it next week.
- The `#neil-log` lines name the Raid, the number of Alliances and the Kingdom totals, never a Member.
- An error line in the console may say that a poll answer failed, without the answer itself.
