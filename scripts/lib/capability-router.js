// Capability router for external-service setup.
//
// PRD §4.3: capability priority is CLI → allowlisted 공식 MCP → visible Chrome → guided manual.
// This module is the deterministic decision/validation layer — it picks the path, validates an
// MCP server candidate against the allowlist, judges Chrome availability, and downgrades safely.
//
// What it does NOT do (by design / platform reality): it does not spawn MCP servers, invoke MCP
// tools, or drive Chrome. Those side effects stay model-driven (the model calls an allowlisted
// MCP tool; the PreToolUse gate still guards it) and user-driven (login/CAPTCHA/MFA/final submit
// happen in visible Chrome by the user). The router produces the plan and the refusals.
import fs from 'node:fs';
import path from 'node:path';
import { pluginRoot } from './secrets.js';

let cached = null;
export function loadCapabilities(env = process.env) {
  if (cached) return cached;
  const file = path.join(pluginRoot(env), 'config', 'service-capabilities.json');
  cached = JSON.parse(fs.readFileSync(file, 'utf8'));
  return cached;
}

// ---- MCP candidate validation (two acceptance paths) ----
//
// candidate: what the runtime reports about an available MCP server plus the tools the model
//   wants to use:
//   { service_id?, server, transport, publisher, tools:[baseName],
//     provenance:{verified},   // for the static-allowlist path
//     registered:boolean,      // server is registered/connected in the user's Claude runtime
//     userConsent:boolean }    // user explicitly approved using this server for this task
//
// Path 1 — static allowlist (pre-reviewed in service-capabilities.json): auto-usable, no
//   per-use consent required. Strongest: server/transport/publisher/tools all pinned.
// Path 2 — runtime-registered + explicit user consent: the user already added the server to
//   their Claude config (that registration IS the provenance) AND explicitly consented to use
//   it now. Limited to the tools the user consented to. Destructive tool calls are still
//   blocked by the PreToolUse safety gate, and nothing is auto-installed.
export function validateMcpCandidate(candidate, allowlist = [], capability = null) {
  if (!candidate || typeof candidate !== 'object') return { allowed: false, reason: 'no-candidate' };

  // Path 1: static allowlist.
  const entry = Array.isArray(allowlist)
    ? allowlist.find((e) => e.server === candidate.server && (!candidate.service_id || e.service_id === candidate.service_id))
    : null;
  if (entry) {
    if (entry.transport !== candidate.transport) return { allowed: false, reason: 'transport-mismatch' };
    if (entry.publisher !== candidate.publisher) return { allowed: false, reason: 'publisher-mismatch' };
    if (candidate.provenance?.verified !== true) return { allowed: false, reason: 'provenance-unverified' };
    if (capability && Array.isArray(entry.capabilities) && !entry.capabilities.includes(capability)) {
      return { allowed: false, reason: 'capability-not-served' };
    }
    const wanted = Array.isArray(candidate.tools) ? candidate.tools : [];
    const allowedSet = new Set(entry.tools || []);
    const rejectedTool = wanted.find((t) => !allowedSet.has(t));
    if (rejectedTool) return { allowed: false, reason: `tool-not-allowlisted:${rejectedTool}` };
    return { allowed: true, basis: 'allowlist', entry, tools: wanted };
  }

  // Path 2: runtime-registered + explicit user consent.
  const registered = candidate.registered === true;
  const consented = candidate.userConsent === true;
  if (registered && consented) {
    return { allowed: true, basis: 'user-consent', tools: Array.isArray(candidate.tools) ? candidate.tools : [] };
  }
  if (registered && !consented) return { allowed: false, reason: 'registered-no-consent' };
  if (consented && !registered) return { allowed: false, reason: 'consented-not-registered' };

  return { allowed: false, reason: 'not-in-allowlist-and-no-consent' };
}

// ---- Chrome availability ----
//
// chromeEnv: { available: boolean (official Claude in Chrome connected), thirdPartyProvider: boolean }
export function chromeDecision(chromeEnv, policy = {}) {
  if (!chromeEnv || chromeEnv.available !== true) return { usable: false, reason: 'chrome-not-connected' };
  if (chromeEnv.thirdPartyProvider === true) return { usable: false, reason: 'third-party-provider' };
  return {
    usable: true,
    mode: policy.mode ?? 'visible-only',
    user_completes: policy.user_completes ?? ['login', 'captcha', 'mfa', 'final-submit'],
    reason: 'ok',
  };
}

// ---- path resolution ----
//
// ctx: {
//   cliAvailable: boolean,        // manifest preflight ok AND user did not refuse install
//   cliRefusedOrFailed: boolean,  // user refused CLI install, or preflight failed
//   mcpCandidate: object|null,
//   chromeEnv: object|null,
// }
export function resolveCapability(serviceId, capability, ctx = {}, caps = loadCapabilities()) {
  const priority = Array.isArray(caps.capability_priority)
    ? caps.capability_priority
    : ['cli', 'mcp', 'chrome', 'guided_manual'];

  // A per-service capability may be pinned (e.g. provisioning/deploy → guided_manual).
  const pinned = caps.services?.[serviceId]?.capabilities?.[capability];
  const startIndex = pinned && priority.includes(pinned) ? priority.indexOf(pinned) : 0;

  const ordered = [];
  let chosen = null;

  for (let i = startIndex; i < priority.length; i++) {
    const p = priority[i];
    let usable = false;
    let reason = '';
    let detail = null;

    if (p === 'cli') {
      // CLI is usable when it is available (Tier 1 preflight ok) OR the user explicitly
      // consented to it (Tier 2 ad-hoc manifest confirmed_by_user), and was not refused/failed.
      usable = (ctx.cliAvailable === true || ctx.cliUserConsent === true) && ctx.cliRefusedOrFailed !== true;
      reason = usable ? 'ok' : ctx.cliRefusedOrFailed ? 'cli-refused-or-failed' : 'cli-unavailable';
    } else if (p === 'mcp') {
      const v = validateMcpCandidate(ctx.mcpCandidate, caps.mcp_allowlist, capability);
      usable = v.allowed;
      reason = v.allowed ? `ok:${v.basis}` : v.reason;
      detail = v.allowed ? { basis: v.basis, entry: v.entry ?? null, tools: v.tools } : null;
    } else if (p === 'chrome') {
      const d = chromeDecision(ctx.chromeEnv, caps.chrome_policy);
      usable = d.usable;
      reason = d.reason;
      detail = d.usable ? d : null;
    } else if (p === 'guided_manual') {
      usable = true;
      reason = 'terminal-fallback';
    }

    ordered.push({ path: p, usable, reason });
    if (usable && !chosen) chosen = { path: p, detail };
  }

  // guided_manual is always in the walk, so chosen is never null.
  return { service_id: serviceId, capability, path: chosen.path, detail: chosen.detail, ordered };
}

// Human/model-readable plan (Korean) describing what runs and who does what.
export function planCapability(serviceId, capability, ctx = {}, caps = loadCapabilities()) {
  const r = resolveCapability(serviceId, capability, ctx, caps);
  const skipped = r.ordered.filter((o) => !o.usable && o.path !== r.path).map((o) => `${o.path}(${o.reason})`);
  let guidance;
  switch (r.path) {
    case 'cli':
      guidance = 'CLI 부트스트랩(setup-service manifest 엔진)으로 진행합니다. 설치·로그인 각각 승인이 필요합니다.';
      break;
    case 'mcp': {
      const server = r.detail.entry?.server ?? ctx.mcpCandidate?.server ?? '등록된 서버';
      const source =
        r.detail.basis === 'allowlist'
          ? `allowlist에 검증된 공식 MCP(${server})`
          : `사용자가 명시적으로 동의한 등록된 MCP(${server})`;
      guidance =
        `${source}로 진행합니다. ` +
        `사용 가능한 tool: ${r.detail.tools.join(', ') || '(동의한 tool 범위)'}. ` +
        'MCP tool 호출은 모델이 수행하며 PreToolUse 안전 게이트가 계속 검사합니다.';
      break;
    }
    case 'chrome':
      guidance =
        'visible Chrome(공식 Claude in Chrome)으로 진행합니다. ' +
        `login/CAPTCHA/MFA와 최종 submit(${r.detail.user_completes.join(', ')})은 사용자가 직접 완료합니다.`;
      break;
    default:
      guidance =
        'guided manual로 안내합니다. 무엇을·왜·어느 명령/화면에서 하는지 단계별로 설명하고 사용자가 직접 실행합니다.';
  }
  return { ...r, skipped, guidance };
}
