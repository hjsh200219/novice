#!/usr/bin/env node
// Common bootstrap engine: resolve → preflight → plan → approve → apply → verify → recover.
// One engine for every provider — the differences live in versioned manifest data.
// Automation boundary: detect → install → login → auth verify. Nothing beyond.
//
// Invariants:
// - exec-form argv only; no shell strings, no curl|bash.
// - preflight is strictly read-only (detect/version_check/auth_status argv only).
// - install and login each require their own explicit approval before apply.
// - plaintext credential fallback aborts auto-login when the manifest says so.
// - audit state stores service id, manifest revision, step names, exit statuses — never
//   argv text, stdout/stderr, or credential values.
import path from 'node:path';
import { validateManifest, loadTier1Manifest, buildAdHocManifest } from './lib/manifest.js';
import { dataDir, writeJsonAtomic, readJsonSafe, assertSafeId } from './lib/state.js';

function auditPath(sessionId, serviceId, env) {
  return path.join(
    dataDir(env),
    'sessions',
    assertSafeId(sessionId, 'session id'),
    'bootstrap',
    `${assertSafeId(serviceId, 'service id')}.json`,
  );
}

function matchSuccess(spec, result) {
  if (!spec) return result.code === 0;
  if (spec.exit_code !== undefined && result.code !== spec.exit_code) return false;
  if (spec.exit_code_not !== undefined && result.code === spec.exit_code_not) return false;
  if (spec.stdout_regex && !new RegExp(spec.stdout_regex).test(result.stdout ?? '')) return false;
  return true;
}

export function createEngine({
  exec,
  platform = process.platform,
  interactive = true,
  env = process.env,
  now = () => new Date().toISOString(),
} = {}) {
  if (typeof exec !== 'function') throw new Error('createEngine requires an injected exec(argv)');

  async function run(argv) {
    if (!Array.isArray(argv) || argv.some((t) => typeof t !== 'string')) {
      throw new Error('engine only executes exec-form argv arrays');
    }
    return exec(argv);
  }

  function audit(sessionId, manifest, step, exitStatus) {
    if (!sessionId) return;
    try {
      const file = auditPath(sessionId, manifest.service_id, env);
      const current = readJsonSafe(file, {
        service_id: manifest.service_id,
        manifest_revision: manifest.manifest_revision ?? null,
        tier: manifest.tier ?? null,
        steps: [],
      });
      current.steps.push({ step, exit_status: exitStatus, at: now() });
      writeJsonAtomic(file, current);
    } catch {
      // audit is best-effort; it must never carry more than step/exit metadata anyway
    }
  }

  return {
    resolve(serviceId, adHocInput = null) {
      const tier1 = loadTier1Manifest(serviceId, env);
      if (tier1) return { tier: 1, manifest: tier1 };
      if (adHocInput) {
        const built = buildAdHocManifest(adHocInput);
        if (built.ok) return { tier: 2, manifest: built.manifest, requiresUserApproval: true };
        return { mode: 'guided_manual', reason: built.reason };
      }
      return {
        mode: 'guided_manual',
        reason: `'${serviceId}'는 검토된 manifest에 없어요. 공식 문서 URL과 package coordinate를 조사해 사용자 승인을 받거나 guided manual로 진행하세요.`,
      };
    },

    async preflight(manifest, { plaintextDetected = false } = {}) {
      const detect = await run(manifest.detect.argv);
      const installed = matchSuccess(manifest.detect.success, detect);
      let versionOk = false;
      let authenticated = false;
      if (installed) {
        const version = await run(manifest.version_check.argv);
        versionOk = matchSuccess(manifest.version_check.success, version);
        const auth = await run(manifest.auth_status.argv);
        authenticated = matchSuccess(manifest.auth_status.success, auth);
      }
      const cs = manifest.credential_store;
      const plaintextRisk = plaintextDetected || cs.secure_storage === false;
      return {
        installed,
        version_ok: versionOk,
        authenticated,
        interactive,
        credential_store: cs,
        plaintext_risk: plaintextRisk,
        abort_login: plaintextRisk && cs.abort_auto_login_on_plaintext === true,
      };
    },

    plan(manifest, preflight) {
      const steps = [];
      if (!preflight.installed || !preflight.version_ok) {
        const installer = manifest.installers.find((i) => i.os.includes(platform)) ?? manifest.installers[0];
        steps.push({
          kind: 'install',
          approval_required: true,
          argv: installer.argv,
          disclosure:
            `설치: ${manifest.binary} — package coordinate '${installer.package_coordinate}' (${installer.package_manager})\n` +
            `공식 근거: ${manifest.docs_url}\n` +
            `전역 변경: ${(installer.global_changes ?? []).join(', ') || '없음'}\n` +
            `되돌리기: ${JSON.stringify(manifest.uninstall[installer.package_manager] ?? Object.values(manifest.uninstall)[0])}`,
        });
      }
      if (!preflight.authenticated) {
        if (!preflight.interactive) {
          steps.push({
            kind: manifest.noninteractive_policy.login === 'deny' ? 'denied_login' : 'guided_manual',
            policy: manifest.noninteractive_policy.login,
            guidance: `비대화형 환경이라 자동 로그인하지 않아요. ${manifest.noninteractive_policy.reason}`,
          });
        } else if (preflight.abort_login) {
          steps.push({
            kind: 'aborted_login',
            reason: 'plaintext credential fallback',
            guidance:
              `이 환경에서는 인증 정보가 평문으로 저장될 수 있어 자동 로그인을 중단했어요.\n` +
              `저장 위치: ${manifest.credential_store.plaintext_fallback_location ?? manifest.credential_store.storage}\n` +
              `직접 로그인한 경우 제거: ${JSON.stringify(manifest.logout.argv)}\n${manifest.credential_store.abort_note ?? ''}`,
          });
        } else {
          steps.push({
            kind: 'login',
            approval_required: true,
            argv: manifest.login.argv,
            disclosure:
              `로그인: ${JSON.stringify(manifest.login.argv)}\n` +
              `인증 저장: ${manifest.credential_store.storage}\n` +
              `사용자가 직접 완료: ${(manifest.login.user_completes ?? []).join(', ')}\n` +
              `되돌리기(logout): ${JSON.stringify(manifest.logout.argv)}`,
          });
        }
      }
      return { service_id: manifest.service_id, steps };
    },

    async apply(manifest, plan, approvals = {}, sessionId = null) {
      const results = [];
      for (const step of plan.steps) {
        if (step.kind === 'guided_manual' || step.kind === 'aborted_login' || step.kind === 'denied_login') {
          results.push({ step: step.kind, ok: false, skipped: true, guidance: step.guidance });
          continue;
        }
        if (step.approval_required && approvals[step.kind] !== true) {
          results.push({ step: step.kind, ok: false, skipped: true, reason: 'approval_missing' });
          continue;
        }
        const result = await run(step.argv);
        audit(sessionId, manifest, step.kind, result.code);
        const ok = result.code === 0;
        results.push({ step: step.kind, ok, exit_status: result.code });
        if (!ok) break; // stop on first failure; recover() reports the rest
      }
      return results;
    },

    async verify(manifest) {
      const version = await run(manifest.version_check.argv);
      const auth = await run(manifest.auth_status.argv);
      return {
        installed_ok: matchSuccess(manifest.version_check.success, version),
        auth_ok: matchSuccess(manifest.auth_status.success, auth),
      };
    },

    recover(manifest, sessionId = null) {
      const auditState = sessionId
        ? readJsonSafe(auditPath(sessionId, manifest.service_id, env), { steps: [] })
        : { steps: [] };
      return {
        completed_steps: auditState.steps,
        remaining_side_effects: manifest.side_effects,
        retry_guidance: '완료된 단계는 재실행 시 preflight가 건너뛰어요. 실패한 단계만 다시 승인해 진행하세요.',
        logout_argv: manifest.logout.argv,
        uninstall_options: manifest.uninstall,
        auto_cleanup: false,
      };
    },
  };
}

// Full state-machine convenience wrapper.
export async function runBootstrap(engine, serviceId, { approvals = {}, adHocInput = null, sessionId = null, plaintextDetected = false } = {}) {
  const resolved = engine.resolve(serviceId, adHocInput);
  if (resolved.mode === 'guided_manual') return { phase: 'resolve', ...resolved };

  const manifest = resolved.manifest;
  const { valid, errors } = validateManifest(manifest);
  if (!valid) return { phase: 'resolve', mode: 'guided_manual', reason: `manifest invalid: ${errors.join('; ')}` };

  const preflight = await engine.preflight(manifest, { plaintextDetected });
  const plan = engine.plan(manifest, preflight);
  if (plan.steps.length === 0) {
    const verified = await engine.verify(manifest);
    return { phase: 'verify', tier: resolved.tier, already_complete: true, preflight, verified };
  }
  const applied = await engine.apply(manifest, plan, approvals, sessionId);
  const failed = applied.some((r) => r.ok === false && r.skipped !== true);
  const verified = failed ? null : await engine.verify(manifest);
  return {
    phase: failed ? 'recover' : 'verify',
    tier: resolved.tier,
    preflight,
    plan,
    applied,
    verified,
    recover: failed ? engine.recover(manifest, sessionId) : null,
  };
}
