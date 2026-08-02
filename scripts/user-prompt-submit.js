#!/usr/bin/env node
// UserPromptSubmit: natural-language mode switching, persistent reset, and duplicate-capsule
// suppression. Exact /novice:mode slash prompts are handed to UserPromptExpansion (we emit
// nothing so old and new capsules never coexist in one turn).
// Learning hook: fail open (exit 0, no output) on any internal error.
import { readStdinJson, emitAdditionalContext, failOpen } from './lib/hookio.js';
import { getProjectConfig, setProjectMode, setProjectFocus, muteProjectTerm, unmuteProjectTerm, loadSession, saveSession } from './lib/state.js';
import { loadTerms, buildTombstone, capsuleForState, focusSegment, applyFocusSegment } from './lib/capsule.js';

const SLASH_MODE = /^\/novice:mode(\s[\s\S]*)?$/;
const SLASH_FOCUS = /^\/novice:focus(\s[\s\S]*)?$/;
const RESET_ALL = 'novice reset all';
const RESET_ONE = /^novice reset (.+)$/;
const MUTE_ONE = /^novice mute (.+)$/;
const UNMUTE_ONE = /^novice unmute (.+)$/;
const MODE_ALIAS = { 'novice 1': '1', 'novice 2': '2', 'novice 3': '3', 'novice off': 'off' };
const FOCUS_ALIAS = { 'novice focus on': true, 'novice focus off': false };

// trim → strip ONE trailing period (ASCII '.' or Korean '。') → collapse internal whitespace.
function normalizeForAlias(prompt) {
  let s = String(prompt ?? '').trim();
  s = s.replace(/[.。]$/, '');
  s = s.replace(/\s+/g, ' ').trim();
  return s;
}

// Resolve a term name or alias (case-insensitive) to its canonical term name.
function resolveTerm(raw) {
  const key = String(raw).trim().toLowerCase();
  for (const t of loadTerms().terms) {
    if (t.term.toLowerCase() === key) return t.term;
    if ((t.aliases || []).some((a) => a.toLowerCase() === key)) return t.term;
  }
  return null;
}

// Emit the current level capsule and focus capsule (whichever are active) as one payload,
// honoring the skip_next_submit handshake. Skipping requires that nothing changed since
// SessionStart injected the identical text.
function emitCurrentOrSkip(sessionId, config, session) {
  const parts = [];
  let changed = false;

  if (config.enabled) {
    const { revision, capsule } = capsuleForState(config.level, session, config.muted_terms);
    if (revision !== session.capsule_revision) changed = true;
    parts.push(capsule);
    session.capsule_revision = revision;
  } else if (session.off_tombstone_emitted !== true && session.capsule_revision != null) {
    // Disabled: one-shot tombstone if capsules were injected earlier this session.
    parts.push(buildTombstone());
    session.off_tombstone_emitted = true;
    session.capsule_revision = null;
    changed = true;
  }

  const seg = focusSegment(config.focus_enabled, session);
  if (seg.focus_revision !== session.focus_revision) changed = true;
  const focusText = applyFocusSegment(session, seg);
  if (focusText) parts.push(focusText);

  const hadSkip = session.skip_next_submit === true;
  session.skip_next_submit = false;
  if (parts.length === 0 && !changed && !hadSkip) return;
  saveSession(sessionId, session);
  if (hadSkip && !changed) return;
  if (parts.length) emitAdditionalContext('UserPromptSubmit', parts.join('\n\n'));
}

// Apply a mode change the same way the slash/expansion path does, then inject fresh state.
function applyModeChange(sessionId, cwd, session, mode) {
  const next = setProjectMode(cwd, mode);
  const parts = [];
  if (mode === 'off') {
    parts.push(buildTombstone());
    session.off_tombstone_emitted = true;
    session.capsule_revision = null;
  } else {
    const { revision, capsule } = capsuleForState(next.level, session, next.muted_terms || []);
    parts.push(capsule);
    session.capsule_revision = revision;
    session.off_tombstone_emitted = false;
  }
  // A level switch does not touch focus, but the turn still carries the active rules.
  const focusText = applyFocusSegment(session, focusSegment(next.focus_enabled === true, session));
  if (focusText) parts.push(focusText);
  emitAdditionalContext('UserPromptSubmit', parts.join('\n\n'));
  session.skip_next_submit = false;
  saveSession(sessionId, session);
}

// Toggle the focus dial, then inject the focus capsule (on) or its tombstone (off).
// The level capsule is left to the normal per-turn path so the payload stays minimal.
function applyFocusChange(sessionId, cwd, session, on) {
  setProjectFocus(cwd, on);
  const seg = focusSegment(on, session);
  const text = applyFocusSegment(session, seg);
  session.skip_next_submit = false;
  saveSession(sessionId, session);
  if (text) emitAdditionalContext('UserPromptSubmit', text);
}

function main() {
  const input = readStdinJson();
  const sessionId = input.session_id;
  const cwd = input.cwd || process.cwd();
  if (typeof sessionId !== 'string' || sessionId === '') return;

  const rawTrimmed = String(input.prompt ?? '').trim();

  // (b) Exact slash command → expansion owns this turn.
  if (SLASH_MODE.test(rawTrimmed) || SLASH_FOCUS.test(rawTrimmed)) return;

  const session = loadSession(sessionId);
  const normalized = normalizeForAlias(input.prompt);
  const key = normalized.toLowerCase();

  // (c) Natural-language mode aliases → same writer as the slash path.
  if (Object.prototype.hasOwnProperty.call(MODE_ALIAS, key)) {
    applyModeChange(sessionId, cwd, session, MODE_ALIAS[key]);
    return;
  }

  // (c) Natural-language focus aliases → same writer as the slash path.
  if (Object.prototype.hasOwnProperty.call(FOCUS_ALIAS, key)) {
    applyFocusChange(sessionId, cwd, session, FOCUS_ALIAS[key]);
    return;
  }

  // (c) Persistent reset — reset all.
  if (key === RESET_ALL) {
    session.term_counts = {};
    session.reset_terms = [];
    saveSession(sessionId, session);
    emitCurrentOrSkip(sessionId, getProjectConfig(cwd), session);
    return;
  }

  // (c) Persistent reset — reset one term (only when it resolves to a known term/alias).
  const one = key.match(RESET_ONE);
  if (one) {
    const term = resolveTerm(one[1]);
    if (term) {
      if (session.term_counts) delete session.term_counts[term];
      const rs = new Set(session.reset_terms || []);
      rs.add(term);
      session.reset_terms = [...rs];
      saveSession(sessionId, session);
      emitCurrentOrSkip(sessionId, getProjectConfig(cwd), session);
      return;
    }
    // Unknown target → treat as an ordinary prompt (fall through).
  }

  // (c) Mute one term — force-fade it permanently across sessions (project-scoped).
  const mute = key.match(MUTE_ONE);
  if (mute) {
    const term = resolveTerm(mute[1]);
    if (term) {
      muteProjectTerm(cwd, term);
      emitCurrentOrSkip(sessionId, getProjectConfig(cwd), session);
      return;
    }
    // Unknown target → treat as an ordinary prompt (fall through).
  }

  // (c) Unmute one term — undo a previous mute (explanations resume per the fade rule).
  const unmute = key.match(UNMUTE_ONE);
  if (unmute) {
    const term = resolveTerm(unmute[1]);
    if (term) {
      unmuteProjectTerm(cwd, term);
      emitCurrentOrSkip(sessionId, getProjectConfig(cwd), session);
      return;
    }
    // Unknown target → treat as an ordinary prompt (fall through).
  }

  // (d)/(e) Ordinary prompt.
  emitCurrentOrSkip(sessionId, getProjectConfig(cwd), session);
}

try {
  main();
  process.exit(0);
} catch {
  failOpen();
}
