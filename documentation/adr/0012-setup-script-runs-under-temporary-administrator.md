# 12. The setup script runs under temporary Administrator

Date: 2026-11-06

## Status

Accepted

## Context

Slice 020's script creates roles, categories, channels and permission overwrites from the Server Layout. Neil lacks Manage
Channels, and Discord lets a bot set only the overwrite permissions it holds itself, so the script needs more than Neil's
usual rights. Constitution V asks that the bot requests only the permissions it needs, and running Neil must keep no channel
rights (specs 013, 016, 017).

Three ways were put to the user on 2026-11-06: Neil's token with the listed permissions granted for the run, a separate setup
application, or temporary Administrator. The first was recommended. The user chose temporary Administrator, knowing it departs
from principle V: it is one permission for the owner to give and to take off, instead of a list.

## Decision

We will run the setup script with Neil's token while the server owner gives Neil's role Administrator for the run, and takes
it off afterwards.

The script is the owner's tool, not Neil acting. It uses REST only and never logs in as a running bot. A real run refuses to
start without Administrator; the dry run needs no such rights. The last line of a real run tells the owner to take it off.

Running Neil gains no rights and no code that changes channels. Principle V records this one exception.

## Consequences

- The owner has one permission to give and take off, and no list to keep up with the layout.
- While the grant is on, a leaked token controls the whole server, and Neil itself runs with Administrator if it is running.
- Nothing forces the owner to take it off: Neil doesn't check. The reminder is all there is.
- Administrator also hides mistakes in Neil's channel permissions during the run, so the owner tests after taking it off.
- Any other use of Administrator needs a new ADR.
