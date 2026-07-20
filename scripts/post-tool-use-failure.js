#!/usr/bin/env node
// PostToolUseFailure: records a failure fingerprint event for the batch aggregator.
// Stores only a hash fingerprint and a coarse error class — never the raw error,
// argv, or output. Atomic-create per tool_use_id; PostToolBatch is the single
// writer that aggregates and deletes these events.
// Observation hook: fail open (exit 0) on any internal error.
import path from 'node:path';
import { readStdinJson, failOpen } from './lib/hookio.js';
import { sessionEventsDir, writeJsonExclusive } from './lib/state.js';
import { computeFingerprint, TOOL_USE_ID_RE } from './lib/fingerprint.js';

// Coarse classification only — the raw error text is never persisted.
function classifyError(input) {
  const text = [input.error, input.tool_response && JSON.stringify(input.tool_response)]
    .filter((x) => typeof x === 'string')
    .join(' ')
    .toLowerCase();
  if (/timed?[ _-]?out/.test(text)) return 'timeout';
  if (/(enoent|not found|no such file|command not found|404)/.test(text)) return 'not_found';
  if (/(eacces|eperm|permission|denied|401|403)/.test(text)) return 'permission';
  if (/(syntaxerror|parse error|unexpected token|invalid syntax)/.test(text)) return 'syntax';
  return 'other';
}

function main() {
  const input = readStdinJson();
  const { session_id: sessionId, tool_name: toolName, tool_input: toolInput, tool_use_id: toolUseId } = input;
  if (typeof sessionId !== 'string' || sessionId === '') return;
  if (typeof toolUseId !== 'string' || !TOOL_USE_ID_RE.test(toolUseId)) return;

  const file = path.join(sessionEventsDir(sessionId), `${toolUseId}.json`);
  writeJsonExclusive(file, {
    schema_version: 1,
    tool_use_id: toolUseId,
    tool_name: toolName,
    status: 'failure',
    error_class: classifyError(input),
    fingerprint: computeFingerprint(toolName, toolInput),
    ts: Date.now(),
  });
}

try {
  main();
  process.exit(0);
} catch {
  failOpen();
}
