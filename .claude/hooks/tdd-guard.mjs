#!/usr/bin/env node
// TDD guards for Claude Code hooks.
//
//   node .claude/hooks/tdd-guard.mjs pre-edit  (PreToolUse on Edit|Write|MultiEdit)
//     Blocks edits to production code while no test file is changed in the working tree,
//     so a failing test must exist before implementation (red before green).
//
//   node .claude/hooks/tdd-guard.mjs stop      (Stop)
//     Runs lint and unit tests when this session changed code, and keeps the turn going while
//     they fail, so nothing is reported done while red. Other sessions may share the working
//     tree, so only files this session edited count (recorded by pre-edit, per session_id).
//     Output is trimmed to the failures; red is reported once per state of the changed code.
//
// Exit code 2 blocks the action; stderr is fed back to Claude.
import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';

/** Folder holding, per session, the code paths that session edited. */
const SESSION_DIR = join(tmpdir(), 'neil-tdd-guard');

/** Directories holding production code that falls under TDD. */
const GUARDED_DIRS = ['src/'];
/** Production code file types. */
const GUARDED_EXTENSIONS = ['.ts', '.js', '.mjs'];
/** Files that are tests themselves, or test-only helpers (fakes, fixtures). */
const TEST_FILE = /(\.(test|spec)\.ts$)|(^src\/(.+\/)?(__fakes__|__fixtures__)\/)/;
/** Files exempt from the guard: generated or declaration-only files. */
const EXEMPT = [/\.d\.ts$/];

/** @returns {Promise<Record<string, unknown>>} */
async function readInput() {
  let raw = '';
  for await (const chunk of process.stdin) raw += chunk;
  return raw ? JSON.parse(raw) : {};
}

/** @param {string} cwd @returns {string[]} changed and untracked paths, repo-relative with forward slashes */
function changedFiles(cwd) {
  const out = execSync('git status --porcelain --untracked-files=all', { cwd, encoding: 'utf8' });
  return out
    .split('\n')
    .filter(Boolean)
    .map((line) => line.slice(3).split(' -> ').pop().replace(/^"|"$/g, ''));
}

/** @param {string} path */
function isGuarded(path) {
  return (
    GUARDED_DIRS.some((dir) => path.startsWith(dir)) &&
    GUARDED_EXTENSIONS.some((ext) => path.endsWith(ext)) &&
    !TEST_FILE.test(path) &&
    !EXEMPT.some((pattern) => pattern.test(path))
  );
}

/** @param {unknown} sessionId @returns {string | null} */
function sessionFile(sessionId) {
  return typeof sessionId === 'string' && /^[\w-]+$/.test(sessionId) ? join(SESSION_DIR, `${sessionId}.json`) : null;
}

/** @param {unknown} sessionId @returns {string[]} code paths this session edited */
function editedBySession(sessionId) {
  const file = sessionFile(sessionId);
  if (file === null) return [];
  try {
    const paths = JSON.parse(readFileSync(file, 'utf8'));
    return Array.isArray(paths) ? paths.filter((path) => typeof path === 'string') : [];
  } catch {
    return [];
  }
}

/** @param {unknown} sessionId @param {string} path */
function recordEdit(sessionId, path) {
  const file = sessionFile(sessionId);
  const paths = editedBySession(sessionId);
  if (file === null || paths.includes(path)) return;
  mkdirSync(SESSION_DIR, { recursive: true });
  writeFileSync(file, JSON.stringify([...paths, path]));
}

/** @param {Record<string, any>} input */
function preEdit(input) {
  const cwd = input.cwd ?? process.cwd();
  const filePath = input.tool_input?.file_path;
  if (typeof filePath !== 'string') return 0;

  const path = relative(cwd, resolve(cwd, filePath)).replace(/\\/g, '/');
  if (TEST_FILE.test(path) || isGuarded(path)) recordEdit(input.session_id, path);
  if (!isGuarded(path)) return 0;

  const changedTests = changedFiles(cwd).filter((file) => TEST_FILE.test(file));
  if (changedTests.length > 0) return 0;

  process.stderr.write(
    `TDD guard: blocked edit to production file "${path}" because no test file is changed in the working tree.\n` +
      'Write or extend a failing test first (*.test.ts, Vitest), run it and confirm it fails ' +
      'for the expected reason, then implement. Use the test-first agent or the tdd skill.\n',
  );
  return 2;
}

/** @param {string} command @param {string} cwd @returns {string | null} output on failure, null on success */
function run(command, cwd) {
  try {
    execSync(command, { cwd, encoding: 'utf8', stdio: 'pipe' });
    return null;
  } catch (error) {
    const output = `${error.stdout ?? ''}${error.stderr ?? ''}`;
    // An empty unit test suite is not red (e.g. only fakes changed so far).
    if (output.includes('No tests found matching')) return null;
    return summarize(output);
  }
}

/** Lines that only cost tokens: stack frames, serialized error objects, npm banners, blanks. */
const NOISE = /node_modules|^\s*at |^\s*(method|file|line|column):|^\s*[{}[\],]+\s*$|^\s*$|^> |^npm (ERR|error)!/;
/** Keep at most this many lines of a failure. */
const MAX_FAILURE_LINES = 25;

/** @param {string} output @returns {string} the failing tests and first error lines, without noise */
function summarize(output) {
  const lines = output.split('\n').filter((line) => !NOISE.test(line));
  const omitted = lines.length - MAX_FAILURE_LINES;
  return lines.slice(0, MAX_FAILURE_LINES).join('\n') + (omitted > 0 ? `\n… ${omitted} more lines` : '');
}

/** @param {string[]} files @param {string} cwd @returns {string} hash of the files' current contents */
function fingerprint(files, cwd) {
  const hash = createHash('sha256');
  for (const file of [...files].sort()) {
    hash.update(file);
    try {
      hash.update(readFileSync(join(cwd, file)));
    } catch {
      hash.update('<deleted>');
    }
  }
  return hash.digest('hex');
}

/** @param {unknown} sessionId @returns {string | null} file holding the fingerprint of the last red report */
function lastRedFile(sessionId) {
  const file = sessionFile(sessionId);
  return file === null ? null : file.replace(/\.json$/, '.red');
}

/** @param {Record<string, any>} input */
function stop(input) {
  // Do not block a second time in a row; Claude already got the failure and may need to hand back to the user.
  if (input.stop_hook_active) return 0;

  const cwd = input.cwd ?? process.cwd();
  const edited = editedBySession(input.session_id);
  const changedCode = changedFiles(cwd).filter(
    (file) => (isGuarded(file) || TEST_FILE.test(file)) && edited.includes(file),
  );
  if (changedCode.length === 0) return 0;

  // Red was already reported for exactly this code; don't rerun and repeat it (e.g. a red phase on purpose).
  const redFile = lastRedFile(input.session_id);
  const current = fingerprint(changedCode, cwd);
  if (redFile !== null && readText(redFile) === current) return 0;

  for (const command of ['npm run lint', 'npm run test']) {
    const failure = run(command, cwd);
    if (failure !== null) {
      if (redFile !== null) writeFileSync(redFile, current);
      process.stderr.write(
        `TDD guard: "${command}" fails. Do not report the task as done while red. ` +
          'Fix it, or tell the user explicitly that it is still red and why (e.g. you are in the red phase on purpose).\n\n' +
          failure,
      );
      return 2;
    }
  }
  if (redFile !== null) rmSync(redFile, { force: true });
  return 0;
}

/** @param {string} file @returns {string | null} */
function readText(file) {
  try {
    return readFileSync(file, 'utf8');
  } catch {
    return null;
  }
}

const mode = process.argv[2];
const input = await readInput();
process.exit(mode === 'pre-edit' ? preEdit(input) : mode === 'stop' ? stop(input) : 0);
