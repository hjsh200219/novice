#!/usr/bin/env node
// UserPromptExpansion: deterministic handler for the /novice:mode slash command.
// Valid args update project state and inject the fresh capsule (or OFF tombstone).
// Invalid args block the expansion (state untouched) and show the allowed values.
// Empty args are a read-only status query.
// Learning hook: fail open (exit 0, no output) on any internal error.
import { readStdinJson, emitAdditionalContext, emitBlock, failOpen } from './lib/hookio.js';
import { getProjectConfig, setProjectMode, loadSession, saveSession } from './lib/state.js';
import { buildTombstone, capsuleForState } from './lib/capsule.js';

const VALID_ARGS = new Set(['1', '2', '3', 'off']);

function statusText(config) {
  const state = config.enabled ? `Level ${config.level}` : 'off';
  return [
    `[novice 상태] 현재 mode: ${state}`,
    '적용 범위: 현재 프로젝트 (프로젝트별로 저장된다)',
    '안전 게이트: novice off와 무관하게 플러그인이 활성화된 동안 항상 유지된다.',
    '전환: /novice:mode 1|2|3|off',
  ].join('\n');
}

function main() {
  const input = readStdinJson();
  if (input.command_name !== 'novice:mode') return;

  const sessionId = input.session_id;
  const cwd = input.cwd || process.cwd();
  const args = String(input.command_args ?? '').trim();

  // Status query — read-only.
  if (args === '') {
    emitAdditionalContext('UserPromptExpansion', statusText(getProjectConfig(cwd)));
    return;
  }

  if (!VALID_ARGS.has(args)) {
    emitBlock('사용할 수 있는 값: /novice:mode 1|2|3|off — 예: /novice:mode 2');
    return;
  }

  const next = setProjectMode(cwd, args);
  if (typeof sessionId !== 'string' || sessionId === '') return;

  const session = loadSession(sessionId);
  if (args === 'off') {
    emitAdditionalContext('UserPromptExpansion', buildTombstone());
    session.off_tombstone_emitted = true;
    session.capsule_revision = null;
  } else {
    const { revision, capsule } = capsuleForState(next.level, session);
    emitAdditionalContext('UserPromptExpansion', capsule);
    session.capsule_revision = revision;
    session.off_tombstone_emitted = false;
  }
  session.skip_next_submit = false;
  saveSession(sessionId, session);
}

try {
  main();
  process.exit(0);
} catch {
  failOpen();
}
