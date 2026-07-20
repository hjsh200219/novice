#!/usr/bin/env node
// SessionStart: restore the current novice state after startup/resume/clear/compact.
// Active project → inject one capsule + glossary and prime skip_next_submit so the
// immediately following UserPromptSubmit does not duplicate the same capsule_revision.
// Off project that previously injected capsules → inject one OFF tombstone.
// Learning hook: fail open (exit 0, no output) on any internal error.
import { readStdinJson, emitAdditionalContext, failOpen } from './lib/hookio.js';
import { getProjectConfig, loadSession, saveSession } from './lib/state.js';
import { loadTerms, buildGlossary, glossaryRevision, buildTombstone, capsuleForState } from './lib/capsule.js';

function main() {
  const input = readStdinJson();
  const sessionId = input.session_id;
  const cwd = input.cwd || process.cwd();
  if (typeof sessionId !== 'string' || sessionId === '') return;

  const config = getProjectConfig(cwd);
  const session = loadSession(sessionId);

  if (config.enabled) {
    const { revision, capsule } = capsuleForState(config.level, session, config.muted_terms);
    const terms = loadTerms();
    const glossary = buildGlossary(terms);
    emitAdditionalContext('SessionStart', `${capsule}\n\n${glossary}`);
    session.capsule_revision = revision;
    session.glossary_revision = glossaryRevision(terms);
    session.skip_next_submit = true;
    session.off_tombstone_emitted = false;
    saveSession(sessionId, session);
    return;
  }

  // Disabled: only speak once, and only if a capsule was previously injected this session.
  if (session.capsule_revision != null && session.off_tombstone_emitted !== true) {
    emitAdditionalContext('SessionStart', buildTombstone());
    session.off_tombstone_emitted = true;
    session.capsule_revision = null;
    session.skip_next_submit = false;
    saveSession(sessionId, session);
  }
}

try {
  main();
  process.exit(0);
} catch {
  failOpen();
}
