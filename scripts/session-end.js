#!/usr/bin/env node
// SessionEnd: session cache lifecycle. `/clear` deletes the session state;
// resumable sessions are kept until the 30-day TTL sweep.
// Learning hook: fail open (exit 0, no output) on any internal error.
import { readStdinJson, failOpen } from './lib/hookio.js';
import { deleteSession, cleanupExpiredSessions } from './lib/state.js';

function main() {
  const input = readStdinJson();
  if (input.reason === 'clear' && typeof input.session_id === 'string' && input.session_id !== '') {
    deleteSession(input.session_id);
  }
  cleanupExpiredSessions();
}

try {
  main();
  process.exit(0);
} catch {
  failOpen();
}
