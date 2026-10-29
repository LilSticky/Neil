// Wraps a session up gracefully before the Claude plan usage runs out.
// Hooks never see the usage; only the status line does. So the status line records it per session,
// and the PostToolUse hook tells the session to wrap up once the 5-hour or 7-day window is nearly used.
//
//   node usage-guard.mjs statusline   status line: records the usage, prints model and usage
//   node usage-guard.mjs post-tool    PostToolUse hook: asks for a wrap-up once, at the threshold
//
// Threshold: NEIL_USAGE_WRAP_UP (used percentage, default 95).
import {readFileSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

const THRESHOLD = Number(process.env.NEIL_USAGE_WRAP_UP ?? 95);
const WRAP_UP = `Plan usage is at {pct}% ({window} window). Wrap up gracefully now, before the limit cuts the session off:
1. Finish or stop the current step; do not start new work or new subagents.
2. Commit the work in progress (WIP commits are fine; tick the done tasks in tasks.md).
3. Update documentation/STATUS.md: what is done, what is half done, and the one next step to resume with.
4. Push the branch, then stop and tell the user in one line that the session wrapped up and why.`;

const readStdin = () => {
  try {
    return JSON.parse(readFileSync(0, 'utf8'));
  } catch {
    return {};
  }
};
const stateFile = (sessionId) => join(tmpdir(), `neil-usage-${sessionId}.json`);
const readState = (sessionId) => {
  try {
    return JSON.parse(readFileSync(stateFile(sessionId), 'utf8'));
  } catch {
    return {};
  }
};
const writeState = (sessionId, state) => writeFileSync(stateFile(sessionId), JSON.stringify(state));

/** The fullest rate-limit window, or `null` when the session has none (not a Pro/Max subscription). */
function fullest(rateLimits) {
  const windows = [
    ['5-hour', rateLimits?.five_hour?.used_percentage],
    ['7-day', rateLimits?.seven_day?.used_percentage],
  ].filter(([, pct]) => typeof pct === 'number');
  if (windows.length === 0) return null;
  const [window, pct] = windows.reduce((a, b) => (b[1] > a[1] ? b : a));
  return {window, pct};
}

function statusline() {
  const input = readStdin();
  const usage = fullest(input.rate_limits);
  if (input.session_id && usage) writeState(input.session_id, {...readState(input.session_id), ...usage});
  const parts = [input.model?.display_name ?? 'Claude'];
  if (typeof input.context_window?.used_percentage === 'number') parts.push(`ctx ${Math.round(input.context_window.used_percentage)}%`);
  const five = input.rate_limits?.five_hour?.used_percentage;
  const seven = input.rate_limits?.seven_day?.used_percentage;
  if (typeof five === 'number') parts.push(`5h ${Math.round(five)}%`);
  if (typeof seven === 'number') parts.push(`7d ${Math.round(seven)}%`);
  if (usage && usage.pct >= THRESHOLD) parts.push('WRAP UP');
  process.stdout.write(parts.join(' · '));
}

function postTool() {
  const {session_id: sessionId} = readStdin();
  if (!sessionId) return;
  const state = readState(sessionId);
  if (typeof state.pct !== 'number' || state.pct < THRESHOLD || state.warned) return;
  writeState(sessionId, {...state, warned: true});
  const context = WRAP_UP.replace('{pct}', String(Math.round(state.pct))).replace('{window}', state.window);
  process.stdout.write(JSON.stringify({hookSpecificOutput: {hookEventName: 'PostToolUse', additionalContext: context}}));
}

const mode = process.argv[2];
if (mode === 'statusline') statusline();
else if (mode === 'post-tool') postTool();
