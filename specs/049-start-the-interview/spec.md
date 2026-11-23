# Spec: Start the Interview

**Slice**: 049 · **Issue**: [#176](https://github.com/LilSticky/Neil/issues/176) · **Branch**: `049-start-the-interview`

## Why

A new, unverified account joined the #330 server, and Neil opened its Onboarding Interview at once: it created a private
thread, added the account to it and posted in it. Within seconds Discord locked the account and kept asking it to verify
a phone number. Discord support suspects a false-positive anti-spam lock caused by an application interaction. The
owner's decision: **the Member starts the Interview**. Neil no longer opens one by itself.

## User story

As a Member who just joined, I see a pinned message in `#onboarding` with a **Start Interview** button. When I press it,
Neil opens my private Interview thread and tells me privately where it is.

## Requirements

- **FR-001** When a Member joins, Neil gives the Onboarding Role (or, to a Member who is already Linked, the Doctor Role,
  as before). It opens no thread, adds them to nothing and posts nothing.
- **FR-002** Neil starts no Interview when a Member comes online, and none at startup. The startup log line about
  Interviews started at startup is gone.
- **FR-003** At startup Neil posts the **start message** in `#onboarding` and pins it, unless its own pinned copy is
  already there. It has the text below and one button **Start Interview** (`interview-start`). Mentions are off. A
  failure is logged and does not stop the startup.
- **FR-004** Pressing **Start Interview** answers privately, exactly as `/interview` does: a Linked Member is told their
  uid, a Member with an open Interview is pointed to its thread, and anyone else gets a new thread and a link to it. The
  press is deferred privately first (Discord allows three seconds).
- **FR-005** `/interview` stays unchanged.
- **FR-006** Neil needs Send Messages and Pin Messages in `#onboarding`. The setup script grants them, and the channel
  check at startup reports them if they are missing.

### Start message text

> 👋 **Welcome!** Press **Start Interview** and I'll open a private thread for you right here. There you tell me which
> Player you are, and I'll set your name and roles to match. You can also type `/interview`.

## Out of scope

- Delaying or rate-limiting the press itself.
- Changing the Interview steps once the thread is open.

## Acceptance

- Joining the server opens no thread (only the role is given).
- Coming online and restarting Neil open no thread.
- After a restart, `#onboarding` has exactly one pinned start message from Neil.
- Pressing the button gives the same private answers as `/interview`.
