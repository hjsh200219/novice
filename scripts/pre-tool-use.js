#!/usr/bin/env node
// PreToolUse safety gate: destructive commands, git history damage, secret
// commit/deploy, and destructive MCP tools. Runs regardless of novice level/off
// while the plugin is enabled.
//
// This hook is a thin wrapper: stdin/stdout I/O + fail-closed behavior. The
// analysis lives in scripts/lib/safety.js (Bash/PowerShell grammar, git subgrammar,
// secret scan, target classification).
//
// Deny-only: safety.js emits a deny decision solely for positively-identified
// catastrophic actions and exposed secret values; everything else (including any
// command it cannot fully parse) gets no opinion and is delegated to Claude Code's
// native permission prompt. There is no "ask" tier.
//
// FAIL CLOSED: invalid JSON stdin, internal exceptions, and input-cap overflows
// deny the tool call (exit 2 or an explicit deny decision).
import { readStdinJson, emitPreToolDecision, failClosed } from './lib/hookio.js';
import { getProjectConfig } from './lib/state.js';
import { loadSafetyRules } from './lib/secrets.js';
import { analyzeBash, analyzeMcp } from './lib/safety.js';

function main() {
  let input;
  try {
    input = readStdinJson();
  } catch (err) {
    failClosed(`novice safety gate: invalid hook input (${err.code ?? 'parse error'})`);
    return;
  }

  const rules = loadSafetyRules();
  const cwd = typeof input.cwd === 'string' && input.cwd !== '' ? input.cwd : process.cwd();
  const toolName = input.tool_name;

  let verdict = null;
  if (toolName === 'Bash') {
    let extraProtected = [];
    try {
      extraProtected = getProjectConfig(cwd).protected_branches_extra;
    } catch {
      // config unavailable → builtin protected branches only
    }
    verdict = analyzeBash(input.tool_input?.command, cwd, rules, extraProtected);
  } else if (typeof toolName === 'string' && /^mcp__/.test(toolName)) {
    verdict = analyzeMcp(toolName, input.tool_input ?? {}, rules);
  }

  if (verdict) {
    emitPreToolDecision(verdict.decision, verdict.reason);
  }
  process.exit(0);
}

try {
  main();
} catch (err) {
  failClosed(`novice safety gate: internal error (${err?.message ?? 'unknown'})`);
}
