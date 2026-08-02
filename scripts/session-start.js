#!/usr/bin/env node
// SessionStart: restore the current novice state after startup/resume/clear/compact.
// Active project → inject one capsule + glossary and prime skip_next_submit so the
// immediately following UserPromptSubmit does not duplicate the same capsule_revision.
// Off project that previously injected capsules → inject one OFF tombstone.
// Learning hook: fail open (exit 0, no output) on any internal error.
import { readStdinJson, emitAdditionalContext, failOpen } from './lib/hookio.js';
import { getProjectConfig, loadSession, saveSession } from './lib/state.js';
import { loadTerms, buildGlossary, glossaryRevision, buildTombstone, capsuleForState, focusSegment, applyFocusSegment } from './lib/capsule.js';

function main() {
  const input = readStdinJson();
  const sessionId = input.session_id;
  const cwd = input.cwd || process.cwd();
  if (typeof sessionId !== 'string' || sessionId === '') return;

  const config = getProjectConfig(cwd);
  const session = loadSession(sessionId);
  const parts = [];

  if (config.enabled) {
    const { revision, capsule } = capsuleForState(config.level, session, config.muted_terms);
    const terms = loadTerms();
    parts.push(capsule, buildGlossary(terms));
    session.capsule_revision = revision;
    session.glossary_revision = glossaryRevision(terms);
    session.off_tombstone_emitted = false;
  } else if (session.capsule_revision != null && session.off_tombstone_emitted !== true) {
    // Disabled: only speak once, and only if a capsule was previously injected this session.
    parts.push(buildTombstone());
    session.off_tombstone_emitted = true;
    session.capsule_revision = null;
  }

  // focus is an independent dial: it neither implies nor is implied by config.enabled.
  const focusText = applyFocusSegment(session, focusSegment(config.focus_enabled, session));
  if (focusText) parts.push(focusText);

  if (parts.length === 0) return;
  emitAdditionalContext('SessionStart', parts.join('\n\n'));
  // Prime the handshake so the immediately following UserPromptSubmit does not repeat
  // the identical payload.
  session.skip_next_submit = true;
  saveSession(sessionId, session);
}

try {
  main();
  process.exit(0);
} catch {
  failOpen();
}
