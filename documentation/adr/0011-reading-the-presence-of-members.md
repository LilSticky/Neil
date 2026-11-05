# 11. Reading the presence of Members

Date: 2026-11-05

## Status

Accepted

## Context

Slice 018 starts an Onboarding Interview when a Member who is not Linked comes online, and when Neil starts and sees such
a Member online. Discord tells a bot who is online only through the `GuildPresences` privileged intent. The constitution
(principle V) asks that the bot requests only the intents it needs, and that personal data is kept to what a feature needs.
[ADR 7](0007-personal-data-of-links-and-interviews.md) says that a change to what is stored needs a new ADR.

With the intent, Discord sends Neil the online status of every Member, Linked or not, and also their activities. The user
accepted this for the slice on 2026-11-05. The alternative was to start Interviews only when Neil starts, which needs no
new intent but leaves a Member waiting until the next restart.

## Decision

We will request the `GuildPresences` intent and use it only to decide whether a Member came online, or is online at
startup.

We will not store a Member's online status or when they were online, nor log, show or send it anywhere. It stays in the
memory of discord.js and is gone when Neil stops. We will not read activities.

ADR 7 stays as it is; this ADR adds no stored data.

## Consequences

- The intent must be switched on in the Developer Portal before the deploy; without it Neil cannot log in.
- Neil receives an update for each status change of every Member, far more events than today. Most are dropped at once.
- A Member who came online while Neil was disconnected is noticed only the next time they come online or Neil starts.
- Discord asks a bot in 100 or more servers to apply for this intent; Neil serves one server.
- Storing or showing anything about presence needs a new ADR.
