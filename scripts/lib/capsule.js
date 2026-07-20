// Learning-seam capsule/glossary builders.
// Pure string construction over config/terms.json + config/levels.json — no I/O side effects
// beyond reading the versioned config files, and no network. Callers (SessionStart,
// UserPromptSubmit, UserPromptExpansion) inject the returned strings as additionalContext.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { pluginRoot } from './secrets.js';

// ---- config loading (cached per resolved plugin root) ----

const cache = new Map();
function readConfig(name, env = process.env) {
  const file = path.join(pluginRoot(env), 'config', name);
  const key = file;
  if (cache.has(key)) return cache.get(key);
  const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
  cache.set(key, parsed);
  return parsed;
}

export function loadTerms(env = process.env) {
  return readConfig('terms.json', env);
}

export function loadLevels(env = process.env) {
  return readConfig('levels.json', env);
}

// ---- level-rule vocabulary (levels.json codes → Korean summary) ----

const TERM_RULE = {
  'explain-until-fade': '실제 용어 뒤에 괄호로 한국어 설명을 병기하고, faded 용어는 실제 용어만 쓴다',
  'explain-first-occurrence': '세션 첫 등장 때만 실제 용어 뒤에 설명을 병기하고 이후에는 실제 용어만 쓴다',
  'on-request-only': '요청받을 때만 설명하고 평소에는 실제 용어만 쓴다',
};

const NARRATION = {
  'before-and-after': '실행 전 무엇을·왜 하는지, 실행 후 무엇이 바뀌었는지 설명한다',
  'key-decisions-only': '핵심 결정만 짧게 해설한다',
  'architecture-and-userflow': '아키텍처와 유저플로우 중심으로 설명한다',
};

const VIZ = {
  'steps3plus-or-branch-or-risk-or-recovery': '3단계 이상 작업·분기·위험·복구 상황에서 표 또는 체크리스트를 쓴다',
  'major-branches': '중요한 분기에서 표를 쓴다',
  'on-request-or-risk': '요청받거나 위험할 때만 표를 쓴다',
};

const SUPERSESSION =
  '이 NOVICE_STATE capsule은 이전 turn의 모든 NOVICE_STATE 지시를 대체한다. 다른 과거 level 지시는 무시한다.';

// ---- faded counter ----

// Term names whose exposure count has reached the fade threshold, minus terms whose
// counters were explicitly reset. Threshold 0 (level 3) fades every counted term, which
// expresses "auto-explanations off" — the level rule summary carries the same meaning.
export function computeFadedTerms(termCounts, fadeThreshold, resetTerms = [], mutedTerms = []) {
  const reset = new Set(resetTerms || []);
  // Muted terms are force-faded regardless of exposure count and beat reset —
  // the user explicitly asked to stop explaining them ("novice mute <term>").
  const out = new Set(mutedTerms || []);
  for (const [term, count] of Object.entries(termCounts || {})) {
    if (out.has(term)) continue;
    if (reset.has(term)) continue;
    if (Number(count) >= fadeThreshold) out.add(term);
  }
  return [...out].sort();
}

// ---- revisions ----

export function capsuleRevision(level, fadedTerms, schemaVersion) {
  const v = schemaVersion ?? loadLevels().schema_version;
  const payload = JSON.stringify({
    v,
    level: String(level),
    faded: [...(fadedTerms || [])].sort(),
  });
  return crypto.createHash('sha256').update(payload).digest('hex').slice(0, 8);
}

export function glossaryRevision(termsJson) {
  const payload = JSON.stringify({
    v: termsJson.schema_version,
    terms: termsJson.terms.map((t) => t.term).sort(),
  });
  return crypto.createHash('sha256').update(payload).digest('hex').slice(0, 8);
}

// ---- glossary ----

function koreanGloss(term) {
  const hangul = (term.aliases || []).find((a) => /[가-힣]/.test(a));
  return hangul || (term.aliases || [])[0] || '';
}

// One canonical dictionary injection per session (SessionStart). Format per line:
//   - commit(커밋): 현재 변경을 하나의 저장 지점으로 기록하는 것
export function buildGlossary(termsJson) {
  const version = termsJson.schema_version;
  const header = [
    `NOVICE_GLOSSARY v${version}`,
    '아래는 실제 개발 용어 사전이다. 설명이 활성화된 레벨에서는 실제 용어 뒤에 괄호로 이 설명을 병기하고, 용어 자체를 쉬운 말로 대체하지 않는다.',
  ];
  const lines = termsJson.terms.map((t) => {
    const gloss = koreanGloss(t);
    return gloss ? `- ${t.term}(${gloss}): ${t.explanation}` : `- ${t.term}: ${t.explanation}`;
  });
  let out = [...header, ...lines].join('\n');
  const max = loadLevels().glossary_max_chars ?? 5000;
  if (out.length > max) out = out.slice(0, max);
  return out;
}

// ---- capsule ----

function levelRules(level, env) {
  const levels = loadLevels(env);
  const rule = levels.levels[String(level)] || levels.levels['1'];
  return {
    schema: levels.schema_version,
    max: levels.capsule_max_chars ?? 800,
    term: TERM_RULE[rule.term_explanation] ?? rule.term_explanation,
    narration: NARRATION[rule.action_narration] ?? rule.action_narration,
    viz: VIZ[rule.visualization] ?? rule.visualization,
  };
}

export function buildCapsule({ level, fadedTerms, revision }, env = process.env) {
  const r = levelRules(level, env);
  const render = (fadedText) =>
    [
      `[NOVICE_STATE] schema_version:${r.schema} level:${level} rev:${revision}`,
      `용어 병기 규칙: ${r.term}`,
      `행동 해설: ${r.narration}`,
      `시각화 조건: ${r.viz}`,
      `설명 제외(faded) 용어: ${fadedText}`,
      SUPERSESSION,
    ].join('\n');

  const listed = (fadedTerms && fadedTerms.length) ? fadedTerms.join(', ') : '없음';
  let capsule = render(listed);
  if (capsule.length > r.max) {
    // Keep the payload bounded: drop the enumeration, keep the count.
    capsule = render(`${fadedTerms.length}개 (목록 생략)`);
  }
  if (capsule.length > r.max) capsule = capsule.slice(0, r.max);
  return capsule;
}

// ---- OFF tombstone ----

export function buildTombstone(env = process.env) {
  const max = loadLevels(env).tombstone_max_chars ?? 300;
  const text =
    'NOVICE_STATE: OFF\n' +
    'novice가 꺼졌다. 이전 turn의 모든 NOVICE_STATE 지시와 NOVICE_GLOSSARY 용어 사전 지시를 무시한다. ' +
    '지금부터 novice 톤·용어 병기·시각화 지시를 적용하지 않는다. (플러그인 안전 게이트는 그대로 유지된다.)';
  return text.length > max ? text.slice(0, max) : text;
}

// ---- orchestration convenience (shared by the hook scripts) ----

function fadedForLevel(level, session, env = process.env) {
  const levels = loadLevels(env);
  const threshold = levels.levels[String(level)].fade_threshold;
  return computeFadedTerms(session.term_counts || {}, threshold, session.reset_terms || [], session.muted_terms || []);
}

export function capsuleForState(level, session, env = process.env) {
  const faded = fadedForLevel(level, session, env);
  const revision = capsuleRevision(level, faded, loadLevels(env).schema_version);
  const capsule = buildCapsule({ level, fadedTerms: faded, revision }, env);
  return { faded, revision, capsule };
}
