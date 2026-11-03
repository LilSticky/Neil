# Discovery: Interview a new member (slice 005)

**Date**: 2026-10-31 · **Input**: ROADMAP row 005, [initial discovery](../../documentation/discovery/initial.md),
[DICTIONARY](../../documentation/DICTIONARY.md), [GAME-API](../../documentation/GAME-API.md), slice 004 spec
(Quota Reserve).

Everything below is a **proposal** until the user decides. Nothing here is in the dictionary yet.

Scope line: 005 ends when a Member is **Linked** (or the Interview ends without a Link). Nicknames and
roles are slice 006; Home Kingdom and Guest are only needed there (see Proposed defaults).

## 1. Proposed dictionary entries

Replace the *(proposed)* Onboarding Interview entry and add three entries under `# Onboarding`:

```markdown
## Onboarding Interview
* The automated conversation Neil runs with a Member in a private thread, to learn which Player they are
* Ends with a Link, with a hand-off to an Officer, or abandoned (the Member left or stopped answering)
* A Member has at most one open Onboarding Interview

## In-game Proof
* Evidence that a Member controls a Player: the Member gives the Player's uid, read in the game from their own profile
* A Player Name is not In-game Proof; it only helps a Member find their uid

## Link
* The confirmed pairing of one Member and one Player, made from In-game Proof and the Member's confirmation ("that's me")
* A Member has at most one Link, and a Player at most one

## Rank Approval
* The confirmation of a Linked Player's Alliance Rank by hand, when the Game API lists no rank for them
* Given by the Member Linked to the Alliance's R5; if there is none, by an Officer; never by the Linked Member themselves
```

Clarifications of existing entries (also need approval):

- **Player**: "Identified by a player ID from the game" -> "Identified by its **uid**, the player ID from the
  game". Code, GAME-API.md, the help text and the Discord texts all say "uid"; today "player ID" and "uid"
  are two words for one concept.
- **Alliance Rank**: add "None when the Player is in no Alliance". Today "Unknown" covers both "in an
  Alliance, but the roster has no row/rank" and "in no Alliance", and only the first needs a Rank Approval.

Not proposed for 005: Home Kingdom, Guest, Troop Bracket, Managed Role (all slice 006). "Interview thread",
"attempt" and "hand-off" stay plain words, not dictionary terms, unless the user wants them.

## 2. Interview state machine

Two aggregates are proposed: the **Onboarding Interview** (one per Member, owns the conversation) and the
**Links** (all Links together, guards uniqueness of Member and Player). Rank Approval is a follow-up on a
Link, not a state of the Interview, so a confirmed identity is locked in at once and no one else can claim
the uid while an approver is away.

```
States
  AwaitingUid            Neil has asked for the uid (help text: profile picture -> feather -> number)
  CheckingUid            one Game API request (purpose: Onboarding Interview) is in flight
  AwaitingConfirmation   Neil shows the Player found (Player Name, Kingdom, Alliance, Alliance Rank)
  PausedForQuota         only if Q5 = pause: Daily Quota spent, waits for 00:00 UTC
  Linked                 end: a Link exists
  HandedOff              end: an Officer is asked to finish by hand
  Abandoned              end: Member left, or timed out

Events (past tense) and transitions
  Interview started        (Member joined | started by command, Q3)  -> AwaitingUid
  Uid given                AwaitingUid          -> CheckingUid           [uid is a whole number]
  Uid malformed            AwaitingUid          -> AwaitingUid           [not a number; no request, no attempt]
  Uid already linked       CheckingUid|AwaitingUid -> AwaitingUid        [refused; counts as an attempt, Q4]
  Player not found         CheckingUid          -> AwaitingUid           [404 or "maybe unknown" 502; attempt]
  Game API unavailable     CheckingUid          -> AwaitingUid           [503/504 after retries; no attempt; "try again shortly"]
  Daily Quota spent        CheckingUid          -> PausedForQuota | AwaitingUid (Q5)
  Quota reset              PausedForQuota       -> AwaitingUid           [Member pinged]
  Player found             CheckingUid          -> AwaitingConfirmation
  Player rejected          AwaitingConfirmation -> AwaitingUid           ["that's not me"; attempt, Q4]
  Player confirmed         AwaitingConfirmation -> Linked                [Links re-checks uniqueness here]
     -> emits Player linked (rank from Game API | rank unknown | no Alliance)
  Attempts exhausted       AwaitingUid          -> HandedOff             [Q4]
  Member left              any open state       -> Abandoned
  Interview timed out      any open state       -> Abandoned             [Q2]

Rank Approval (follow-up, only for "Player linked, rank unknown")
  Rank Approval requested  -> Pending   [approver: Member Linked to the Alliance's R5, else an Officer, Q1]
  Rank approved (R1-R5, by approver) -> Approved   [stored on the Link with who approved and when]
  Linked Member left       Pending -> Cancelled
```

## 3. Invariants for 005

1. A Member has at most one open Onboarding Interview.
2. A Member has at most one Link; a Player has at most one Link. Checked again at "Player confirmed", not
   only at "Uid given" (two Members may give the same uid at the same time).
3. A Link is made only from a uid the Member typed themselves and the Member's own confirmation; never from
   a Player Name, a pick list, or someone else's answer.
4. Only the interviewed Member can answer their Interview (buttons, modals); others get a short private note.
5. The Alliance Rank on a Link comes from the Game API (`rank_label`) or from a Rank Approval, never from the
   Member's own claim. A Player in no Alliance has no Alliance Rank and needs no Rank Approval.
6. A Rank Approval is given only by the Member Linked to the Alliance's R5, else by an Officer, and never
   by the Linked Member themselves.
7. Every Game API request of an Interview carries the Onboarding Interview purpose and goes through the
   cached, quota-counting client; one uid given costs at most one request (cached for 10 minutes).
8. An Interview ends in exactly one end state (Linked, HandedOff, Abandoned) and accepts no answers after.
9. Interview state and Links survive a restart (storage); an Interview is never silently lost.
10. Links are personal data: what is stored (Member id, uid, rank source, approver, timestamps) and for how
    long needs an ADR (constitution V).

## 4. Open questions (decide before `/speckit-specify`)

**Q1. Rank Approval: in 005, and who counts as "the Alliance's R5 on Discord"?**
- A (recommended): in 005. The R5 is the Member Linked to the Alliance's `leader_id`, read from the same
  `/players/{uid}` answer that showed the rank was unknown (no extra request). If that Member is not
  Linked or not on the server, an Officer approves. The approver picks R1-R5 with buttons in the thread.
- B: in 005, but only Officers approve; the R5 path comes later (with "Keep roles in sync").
- C: move Rank Approval to 006, where a rank first has an effect; 005 stores "rank unknown" on the Link.
- D: as A, but anyone Linked whose Player has `rank_label` R5 in that Alliance counts (stale if ranks change).

**Q2. A Member stops answering or leaves mid-Interview.**
- A (recommended): the Interview is Abandoned after 24 hours without an answer (configurable) and when the
  Member leaves; Neil locks and archives the thread (kept for Officers to read) and logs it.
- B: no timeout; only leaving abandons it; the thread stays open.
- C: as A, but the thread is deleted on leave/timeout (less clutter, nothing for Officers to read).

**Q3. Who gets an Interview besides new joiners (already on the server, joined while Neil was offline,
timed out, rejoined)?**
- A (recommended): new joins start one automatically; any Member without a Link can start their own with a
  command (covers existing Members, missed joins and restarts after a timeout). A Member who rejoins and
  still has a Link gets no Interview (Links outlive leaving until "Say goodbye").
- B: as A, but only an Officer can start one for a Member (`/interview @member`), not the Member.
- C: only new joins in 005; everything else waits for a later slice.
- D: at startup Neil interviews every Member without a Link (thread and quota burst; not recommended).

**Q4. Limit on failed uids ("not found", "already linked", "that's not me").**
- A (recommended): 5 failed attempts per Interview, then HandedOff: Neil mentions the Officers in the
  thread and stops asking. Malformed input and Game API outages do not count.
- B: 3 attempts, then the Interview ends (Abandoned); the Member may start again later (needs Q3 A/B).
- C: no limit, but at most one uid per 30 seconds.

**Q5. The Daily Quota is spent during an Interview (the Quota Reserve is already used up).**
- A (recommended): PausedForQuota; Neil tells the Member when it resumes (00:00 UTC), and at reset
  mentions the Member in the thread and asks for the uid again. The pause does not count toward the
  timeout (Q2).
- B: tell the Member to try again after 00:00 UTC; the Interview stays in AwaitingUid (timeout runs on).
- C: hand off to an Officer at once.

**Q6. In-game Proof is weaker since slice 004: `/alliance` shows every Player's uid to any Member.**
Anyone can now read a stranger's uid and claim that Player. Initial discovery decided the uid counts as
proof because it is obscure; 004 made it public on the server.
- A (recommended): accept it for 005, but state it in the dictionary entry, log every Link to the log
  channel so Officers can spot a wrong one, and keep "Correct a link" (Later) as the remedy. When the Link
  is to an Alliance with a Linked R5, that R5 is told.
- B: every Link needs a confirmation by the Alliance's R5 (else an Officer), like Rank Approval (slower,
  stronger).
- C: remove uids from the `/alliance` card and pick lists again (rework slice 004).
- D: find a second in-game proof (needs game knowledge we do not have; e.g. something the Player changes
  in-game that the Game API shows). Ask the user what exists.

## Proposed defaults (no question unless the user objects)

- **Player in no Alliance**: Linked like anyone; no Alliance Rank, so no Rank Approval.
- **Guests** (Player outside the Home Kingdom): interviewed and Linked the same way; Home Kingdom and Guest
  only matter for names and roles (006). Their Alliance's R5 is unlikely to be Linked, so an Officer
  approves an unknown rank (follows from Q1 A).
- **Already linked uid**: refused with an error to the Member (decided 2026-10-29); the Member who holds the
  Link is not told, Officers see it in the log channel.
- **Until Linked**, what a Member may see on the server is unchanged by 005 (no "unverified" role); access
  rules are a 006 or later question.
- **Officers** may read every Interview thread but cannot answer for the Member.

## Decisions (user, 2026-10-31)

- **Q1**: A. Rank Approval is in 005; the Member Linked to the Alliance's leader approves, else an Officer.
- **Q2**: A. Abandoned after 24 hours without an answer (configurable) or when the Member leaves; thread
  locked and archived.
- **Q3**: A. New joins start automatically; any Member without a Link starts their own with a command.
- **Q4**: A. 5 failed attempts, then HandedOff (Officers mentioned in the thread).
- **Q5**: A. PausedForQuota until 00:00 UTC; the pause does not count toward the timeout.
- **Q6**: A. The uid stays In-game Proof; every Link is posted to a log channel and the Alliance's Linked R5
  is told; "Correct a link" (Later) is the remedy.
- **Dictionary**: Onboarding Interview, In-game Proof, Link, Rank Approval and the Player clarification are
  approved. The Alliance Rank addition ("None when in no Alliance") is **rejected**: it reads as if Discord
  showed no rank, while Discord shows only R4 and R5 anyway (a slice 006 concern). A Player in no Alliance
  simply has no Alliance Rank and needs no Rank Approval.
