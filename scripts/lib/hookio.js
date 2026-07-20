// Hook stdin/stdout contract helpers.
// Command hooks receive one JSON payload on stdin and answer with JSON on stdout.
// Exit code 2 is the blocking/deny path for safety hooks (fail closed).
import fs from 'node:fs';

export const STDIN_MAX_BYTES = 1024 * 1024;

export function readStdinJson(maxBytes = STDIN_MAX_BYTES) {
  const buf = fs.readFileSync(0);
  if (buf.length > maxBytes) {
    const err = new Error('hook input exceeds size cap');
    err.code = 'E_INPUT_CAP';
    throw err;
  }
  return JSON.parse(buf.toString('utf8'));
}

export function emit(obj) {
  process.stdout.write(JSON.stringify(obj));
}

export function emitAdditionalContext(hookEventName, text) {
  emit({ hookSpecificOutput: { hookEventName, additionalContext: text } });
}

export function emitPreToolDecision(decision, reason) {
  emit({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: decision,
      permissionDecisionReason: reason,
    },
  });
}

export function emitBlock(reason) {
  emit({ decision: 'block', reason });
}

// Fail-closed exit for safety hooks: stderr message + exit 2.
export function failClosed(message) {
  process.stderr.write(String(message ?? 'novice safety hook error'));
  process.exit(2);
}

// Fail-open exit for non-safety hooks: never block the turn on a learning-layer bug.
export function failOpen() {
  process.exit(0);
}
