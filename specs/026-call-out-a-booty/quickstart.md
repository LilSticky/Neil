# Quickstart: Call out a booty

Automated: `npm run test`, `npm run typecheck`, `npm run lint`.

On the test server, after the deploy and `npm run commands:register` (see [contracts/commands.md](contracts/commands.md)):

1. As a Linked Member of an Alliance, run `/booty-alerts mode:Always`; the answer is private.
2. As a second Linked Member of that Alliance, run `/booty` in another channel: refused.
3. Run it in that Alliance's `alliance-chat`, then Cancel: nothing is posted.
4. Run it again and Confirm: the card appears, and the first Member is mentioned and notified.
5. Within a minute, run `/booty` again: refused, with a link to the card.
6. Set Only when offline on the first Member, go online, wait a minute and call again: no mention.
7. Set a window that excludes the current time in your time zone, and call again: no mention.
8. Unlink the first Member: `/booty-alerts` shows Off after a new Link.
