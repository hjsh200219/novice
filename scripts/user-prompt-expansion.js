#!/usr/bin/env node
// UserPromptExpansion: deterministic handler for the /novice:mode and /novice:focus
// slash commands. Valid args update project state and inject the fresh capsule (or the
// matching OFF tombstone). Invalid args block the expansion (state untouched) and show
// the allowed values. Empty args are a read-only status query.
// Learning hook: fail open (exit 0, no output) on any internal error.
import { readStdinJson, emitAdditionalContext, emitBlock, failOpen } from './lib/hookio.js';
import { getProjectConfig, setProjectMode, setProjectFocus, loadSession, saveSession } from './lib/state.js';
// setProjectMode preserves muted_terms; re-read via getProjectConfig for the capsule.
import { buildTombstone, capsuleForState, focusSegment, applyFocusSegment } from './lib/capsule.js';

const VALID_ARGS = new Set(['1', '2', '3', 'off']);
const VALID_FOCUS_ARGS = new Map([['on', true], ['off', false]]);

function statusText(config) {
  const state = config.enabled ? `Level ${config.level}` : 'off';
  return [
    `[novice 상태] 현재 mode: ${state}`,
    `focus(응답 형태 규칙): ${config.focus_enabled ? 'on' : 'off'}`,
    '적용 범위: 현재 프로젝트 (프로젝트별로 저장된다)',
    '안전 게이트: novice off와 무관하게 플러그인이 활성화된 동안 항상 유지된다.',
    '전환: /novice:mode 1|2|3|off, /novice:focus on|off',
  ].join('\n');
}

function focusStatusText(config) {
  return [
    `[novice focus 상태] 현재: ${config.focus_enabled ? 'on' : 'off'}`,
    'focus는 응답 형태(행동 우선·번호 목록·서론 금지)를 강제하며, novice level과 별개 다이얼이다.',
    '적용 범위: 현재 프로젝트 (프로젝트별로 저장된다)',
    '전환: /novice:focus on|off',
  ].join('\n');
}

function handleMode(sessionId, cwd, args) {
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
  const parts = [];
  if (args === 'off') {
    parts.push(buildTombstone());
    session.off_tombstone_emitted = true;
    session.capsule_revision = null;
  } else {
    const { revision, capsule } = capsuleForState(next.level, session, next.muted_terms || []);
    parts.push(capsule);
    session.capsule_revision = revision;
    session.off_tombstone_emitted = false;
  }
  const focusText = applyFocusSegment(session, focusSegment(next.focus_enabled === true, session));
  if (focusText) parts.push(focusText);
  emitAdditionalContext('UserPromptExpansion', parts.join('\n\n'));
  session.skip_next_submit = false;
  saveSession(sessionId, session);
}

function handleFocus(sessionId, cwd, args) {
  if (args === '') {
    emitAdditionalContext('UserPromptExpansion', focusStatusText(getProjectConfig(cwd)));
    return;
  }

  if (!VALID_FOCUS_ARGS.has(args)) {
    emitBlock('사용할 수 있는 값: /novice:focus on|off — 예: /novice:focus on');
    return;
  }

  const on = VALID_FOCUS_ARGS.get(args);
  setProjectFocus(cwd, on);
  if (typeof sessionId !== 'string' || sessionId === '') return;

  const session = loadSession(sessionId);
  const text = applyFocusSegment(session, focusSegment(on, session));
  session.skip_next_submit = false;
  saveSession(sessionId, session);
  if (text) emitAdditionalContext('UserPromptExpansion', text);
}

function main() {
  const input = readStdinJson();
  const sessionId = input.session_id;
  const cwd = input.cwd || process.cwd();
  const args = String(input.command_args ?? '').trim();

  if (input.command_name === 'novice:mode') return handleMode(sessionId, cwd, args);
  if (input.command_name === 'novice:focus') return handleFocus(sessionId, cwd, args);
}

try {
  main();
  process.exit(0);
} catch {
  failOpen();
}
