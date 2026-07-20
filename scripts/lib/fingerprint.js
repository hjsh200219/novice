// Shared tool-call fingerprinting for the PostToolUse/PostToolUseFailure event hooks.
// Fingerprints are short hashes — the raw tool input is never persisted.
import crypto from 'node:crypto';

export const TOOL_USE_ID_RE = /^[A-Za-z0-9_-]+$/;

function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`;
}

export function computeFingerprint(toolName, toolInput) {
  const payload = `${toolName}\n${stableStringify(toolInput ?? null)}`;
  return crypto.createHash('sha256').update(payload).digest('hex').slice(0, 16);
}
