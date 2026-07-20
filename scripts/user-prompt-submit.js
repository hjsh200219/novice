#!/usr/bin/env node
// UserPromptSubmit: natural-language mode switching, persistent reset, and duplicate-capsule
// suppression. Exact /novice:mode slash prompts are handed to UserPromptExpansion (we emit
// nothing so old and new capsules never coexist in one turn).
// Learning hook: fail open (exit 0, no output) on any internal error.
import { readStdinJson, emitAdditionalContext, failOpen } from './lib/hookio.js';
import { getProjectConfig, setProjectMode, loadSession, saveSession } from './lib/state.js';
import { loadTerms, buildTombstone, capsuleForState } from './lib/capsule.js';

const SLASH_MODE = /^\/novice:mode(\s[\s\S]*)?$/;
const RESET_ALL = 'novice reset all';
const RESET_ONE = /^novice reset (.+)$/;
const MODE_ALIAS = { 'novice 1': '1', 'novice 2': '2', 'novice 3': '3', 'novice off': 'off' };

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

// Emit the current capsule (enabled) or nothing, honoring the skip_next_submit handshake.
function emitCurrentOrSkip(sessionId, config, session) {
  if (config.enabled) {
    const { revision, capsule } = capsuleForState(config.level, session);
    if (session.skip_next_submit === true && revision === session.capsule_revision) {
      session.skip_next_submit = false;
      saveSession(sessionId, session);
      return;
    }
    emitAdditionalContext('UserPromptSubmit', capsule);
    session.capsule_revision = revision;
    session.skip_next_submit = false;
    saveSession(sessionId, session);
    return;
  }
  // Disabled: one-shot tombstone if capsules were injected earlier this session.
  if (session.off_tombstone_emitted !== true && session.capsule_revision != null) {
    emitAdditionalContext('UserPromptSubmit', buildTombstone());
    session.off_tombstone_emitted = true;
    session.capsule_revision = null;
    session.skip_next_submit = false;
    saveSession(sessionId, session);
  }
}

// Apply a mode change the same way the slash/expansion path does, then inject fresh state.
function applyModeChange(sessionId, cwd, session, mode) {
  const next = setProjectMode(cwd, mode);
  if (mode === 'off') {
    emitAdditionalContext('UserPromptSubmit', buildTombstone());
    session.off_tombstone_emitted = true;
    session.capsule_revision = null;
    session.skip_next_submit = false;
    saveSession(sessionId, session);
    return;
  }
  const { revision, capsule } = capsuleForState(next.level, session);
  emitAdditionalContext('UserPromptSubmit', capsule);
  session.capsule_revision = revision;
  session.off_tombstone_emitted = false;
  session.skip_next_submit = false;
  saveSession(sessionId, session);
}

function main() {
  const input = readStdinJson();
  const sessionId = input.session_id;
  const cwd = input.cwd || process.cwd();
  if (typeof sessionId !== 'string' || sessionId === '') return;

  const rawTrimmed = String(input.prompt ?? '').trim();

  // (b) Exact slash command → expansion owns this turn.
  if (SLASH_MODE.test(rawTrimmed)) return;

  const session = loadSession(sessionId);
  const normalized = normalizeForAlias(input.prompt);
  const key = normalized.toLowerCase();

  // (c) Natural-language mode aliases → same writer as the slash path.
  if (Object.prototype.hasOwnProperty.call(MODE_ALIAS, key)) {
    applyModeChange(sessionId, cwd, session, MODE_ALIAS[key]);
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

  // (d)/(e) Ordinary prompt.
  emitCurrentOrSkip(sessionId, getProjectConfig(cwd), session);
}

try {
  main();
  process.exit(0);
} catch {
  failOpen();
}
