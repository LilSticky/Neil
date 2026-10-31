# Contract: Onboarding Interview, `/interview`, Rank Approval and the log channel

All texts escape Player Names and usernames. `allowedMentions` names exactly who is pinged; nothing else
pings. `{help}` is the uid help text below.

## `/interview`

No options. Always answered privately.

| Situation | Answer |
|-----------|--------|
| no Link, no open Interview | opens one; `Your interview is waiting in {thread}.` |
| open Interview | `Your interview is already open: {thread}.` |
| Linked | `You're already linked to {Player Name} (uid {uid}).` |
| bot account | ignored (cannot happen for a slash command) |

## Join and leave (`guildMemberAdd`, `guildMemberRemove`)

- Join, not a bot, no Link, no open Interview → open an Interview (no other message).
- Join with a Link or an open Interview → nothing.
- Leave → open Interview abandoned (left); pending Rank Approval for their Link cancelled.

## Thread messages

Thread name: `Interview – {username}` (cut to 100 characters).

| When | Message | Components |
|------|---------|------------|
| started / asked again | `Welcome, {member}! Tell me who you are in the game: press the button and enter your uid.`<br>`{help}` | button `Give my uid` |
| uid help `{help}` | `In the game, tap your profile picture in the top left, then the feather next to your name. The number under the picture is your uid; the button next to it copies it.` | – |
| malformed | `That isn't a uid: it's only digits, like 145563254785.` + `{help}` | `Give my uid` |
| checking (second submit) | private: `One moment, I'm still looking that up.` | – |
| found | card: Player Name, uid, Kingdom, Alliance `[TAG] Name` or `no alliance`, Alliance Rank or `rank unknown`; `Is this you?` | buttons `That's me`, `That's not me` |
| not found | `I couldn't find a player with uid {uid}. Check the number.` + attempts left + `{help}` | `Give my uid` |
| already Linked | `That player is already linked to another member. If it's yours, an Officer can help.` + attempts left | `Give my uid` |
| rejected | `Okay, let's try again.` + attempts left + `{help}` | `Give my uid` |
| unavailable | `The game tracker isn't answering right now. Try again in a few minutes.` | `Give my uid` |
| quota spent | `I can't look players up again until 00:00 UTC ({relative time}). I'll ping you here then.` | – |
| quota reset | `{member}, I can look players up again.` + ask | `Give my uid` |
| linked | `Done, {member}: you're linked to {Player Name} (uid {uid}).` | buttons removed |
| handed off | `{Moderator role} {King role}: {member} couldn't be linked after 5 tries. Please help here.`<br>`An Officer will help you, {member}. You can also start again later with /interview.` | buttons removed |
| abandoned (timed out) | `No answer for {timeout}, so this interview is closed. Run /interview to start again.` | thread locked, archived |
| abandoned (left) | `{username} left the server; this interview is closed.` | thread locked, archived |
| button of someone else | private: `This interview belongs to someone else.` | – |
| button on ended Interview | private: `This interview has ended. Run /interview to start a new one.` | – |

"Attempts left": `{n} tries left.` (shown when 1–4 remain).

## Modal

`interview:modal:{id}`, title `Your uid`, one short text input `uid` (1–32 characters, placeholder
`145563254785`). Accepts digits after trimming spaces and a leading `#`.

## Rank Approval (in the thread)

| When | Message | Components |
|------|---------|------------|
| asked, member | `{approver}, the tracker shows no rank for {Player Name} in [TAG]. Which rank do they have?` (approver added to the thread) | buttons `R1`–`R5` |
| asked, officers | `{Moderator role} {King role}: the tracker shows no rank for {Player Name} in [TAG], and their R5 isn't linked here. Which rank do they have?` | buttons `R1`–`R5` |
| approved | `{approver} set {Player Name}'s rank to {rank}.` | buttons removed, thread archived |
| not allowed | private: `You can't approve this rank.` | – |
| cancelled (member left) | `{username} left the server; the rank approval is cancelled.` | buttons removed, thread archived |

## Log channel

One line each; pings only where noted.

- Link: `🔗 {member} linked to {Player Name} (uid {uid}, #{kingdom}, [TAG], {rank or rank unknown or no alliance}).`
  + ` {leader member}` (pinged) when the Alliance's leader is Linked and on the server.
- Refused: `⛔ {member} gave uid {uid}, which is already linked.`
- Hand-off: `🙋 {member} was handed off after 5 failed tries: {thread}.`
- Abandoned: `💤 {member}'s interview closed ({timed out | left}).`
- Rank Approval: `🎖️ {approver} set {member}'s rank to {rank}.` / cancelled: `🎖️ Rank approval for {member} cancelled (left).`

## Configuration

| Variable | Rule | Default |
|----------|------|---------|
| `DISCORD_ONBOARDING_CHANNEL_ID` | Discord ID; a text channel where Neil may create private threads | required |
| `DISCORD_LOG_CHANNEL_ID` | Discord ID; a text channel where Neil may send messages | required |
| `INTERVIEW_TIMEOUT_MINUTES` | whole number ≥ 1 | 1440 |
