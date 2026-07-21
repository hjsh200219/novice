// Bootstrap manifest loading and validation (2-tier).
// Tier 1: reviewed manifests shipped in config/bootstrap-manifests/.
// Tier 2: ad-hoc manifests built from officially sourced provenance, same schema,
// executable only after the user has seen and approved the evidence.
import fs from 'node:fs';
import path from 'node:path';
import { pluginRoot } from './secrets.js';
import { baseName, unwrapCommandArgv } from './grammar.js';

const SHELL_META = /[|;&><`]/;
const FORBIDDEN_ARGV0 = new Set([
  'curl', 'wget', 'sh', 'bash', 'zsh', 'dash', 'ksh', 'csh', 'tcsh', 'fish', 'ash', 'mksh', 'rbash',
  'pwsh', 'powershell', 'cmd', 'eval',
]);

function executableName(token) {
  return baseName(token).toLowerCase().replace(/\.(?:exe|cmd|bat)$/, '');
}

function checkArgv(argv, label, errors) {
  if (!Array.isArray(argv) || argv.length === 0 || argv.some((t) => typeof t !== 'string')) {
    errors.push(`${label}: argv must be a non-empty string array (exec-form)`);
    return;
  }
  for (const token of argv) {
    if (SHELL_META.test(token)) errors.push(`${label}: shell metacharacter in argv token: ${token}`);
  }
  const normalized = unwrapCommandArgv(argv);
  if (normalized == null) {
    errors.push(`${label}: wrapper form cannot be safely resolved`);
    return;
  }
  const base = executableName(normalized[0]);
  if (FORBIDDEN_ARGV0.has(base)) {
    errors.push(`${label}: remote-script/shell interpreter argv[0] is forbidden: ${normalized[0]}`);
  }
}

export function validateManifest(manifest) {
  const errors = [];
  if (!manifest || typeof manifest !== 'object') {
    return { valid: false, errors: ['manifest must be an object'] };
  }

  for (const field of ['service_id', 'binary', 'docs_url']) {
    if (typeof manifest[field] !== 'string' || manifest[field] === '') {
      errors.push(`missing required string field: ${field}`);
    }
  }
  if (typeof manifest.docs_url === 'string' && !manifest.docs_url.startsWith('https://')) {
    errors.push('docs_url must be https');
  }

  if (!Array.isArray(manifest.installers) || manifest.installers.length === 0) {
    errors.push('installers[] required');
  } else {
    manifest.installers.forEach((inst, i) => {
      if (!Array.isArray(inst.os) || inst.os.length === 0) errors.push(`installers[${i}]: os[] required`);
      if (typeof inst.package_manager !== 'string') errors.push(`installers[${i}]: package_manager required`);
      if (typeof inst.package_coordinate !== 'string' || inst.package_coordinate === '') {
        errors.push(`installers[${i}]: fixed package_coordinate required`);
      }
      if (typeof inst.min_version !== 'string') errors.push(`installers[${i}]: min_version required`);
      checkArgv(inst.argv, `installers[${i}].argv`, errors);
      if (inst.upgrade_argv !== undefined) checkArgv(inst.upgrade_argv, `installers[${i}].upgrade_argv`, errors);
    });
    // preflight/verify compare the binary on PATH against a single minimum, so
    // per-installer minimums must not diverge (the fallback installer's minimum
    // would silently apply on unmatched platforms).
    const minimums = new Set(manifest.installers.map((i) => i.min_version));
    if (minimums.size > 1) {
      errors.push('installers: min_version must be identical across all installers');
    }
  }

  for (const probe of ['detect', 'version_check', 'auth_status']) {
    if (!manifest[probe] || typeof manifest[probe] !== 'object') {
      errors.push(`${probe} required`);
    } else {
      checkArgv(manifest[probe].argv, `${probe}.argv`, errors);
      if (!manifest[probe].success) errors.push(`${probe}.success required`);
    }
  }

  if (!manifest.login || typeof manifest.login !== 'object') {
    errors.push('login required');
  } else {
    checkArgv(manifest.login.argv, 'login.argv', errors);
    if (manifest.login.interactive !== true) errors.push('login.interactive must be true (credential values are never piped)');
  }
  if (!manifest.logout || typeof manifest.logout !== 'object') {
    errors.push('logout required');
  } else {
    checkArgv(manifest.logout.argv, 'logout.argv', errors);
  }

  const cs = manifest.credential_store;
  if (!cs || typeof cs !== 'object') {
    errors.push('credential_store required');
  } else {
    for (const f of ['secure_storage', 'plaintext_fallback', 'abort_auto_login_on_plaintext']) {
      if (typeof cs[f] !== 'boolean') errors.push(`credential_store.${f} must be boolean`);
    }
  }

  if (!manifest.uninstall || typeof manifest.uninstall !== 'object' || Object.keys(manifest.uninstall).length === 0) {
    errors.push('uninstall required');
  } else {
    for (const [pm, argv] of Object.entries(manifest.uninstall)) checkArgv(argv, `uninstall.${pm}`, errors);
  }

  if (!Array.isArray(manifest.side_effects)) errors.push('side_effects[] required');

  const np = manifest.noninteractive_policy;
  if (!np || typeof np !== 'object' || !['guided_manual', 'deny'].includes(np.login)) {
    errors.push('noninteractive_policy.login must be guided_manual|deny');
  }

  return { valid: errors.length === 0, errors };
}

export function loadTier1Manifest(serviceId, env = process.env) {
  const root = pluginRoot(env);
  const capsFile = path.join(root, 'config', 'service-capabilities.json');
  let manifestRel = null;
  try {
    const caps = JSON.parse(fs.readFileSync(capsFile, 'utf8'));
    manifestRel = caps.services?.[serviceId]?.manifest ?? null;
  } catch {
    return null;
  }
  if (!manifestRel) return null;
  try {
    const manifest = JSON.parse(fs.readFileSync(path.join(root, 'config', manifestRel), 'utf8'));
    const { valid, errors } = validateManifest(manifest);
    if (!valid) throw new Error(`tier 1 manifest invalid: ${errors.join('; ')}`);
    return manifest;
  } catch (err) {
    if (String(err.message).startsWith('tier 1 manifest invalid')) throw err;
    return null;
  }
}

// Tier 2: build an ad-hoc manifest from researched official provenance.
// The engine refuses to execute it unless provenance.confirmed_by_user is true —
// the caller must have shown docs_url, package coordinate, and exact argv on screen.
export function buildAdHocManifest(input) {
  if (!input || typeof input !== 'object') {
    return { ok: false, reason: 'input required' };
  }
  const prov = input.provenance;
  if (!prov || typeof prov.docs_url !== 'string' || !prov.docs_url.startsWith('https://')) {
    return { ok: false, reason: 'official provenance (https docs_url) required — guided manual로 낮추세요' };
  }
  let host;
  try {
    host = new URL(prov.docs_url).host;
  } catch {
    host = '';
  }
  if (!host) {
    return { ok: false, reason: 'provenance docs_url host unresolvable — guided manual로 낮추세요' };
  }
  const manifest = { ...input.manifest, tier: 2, docs_url: prov.docs_url };
  const { valid, errors } = validateManifest(manifest);
  if (!valid) return { ok: false, reason: `ad-hoc manifest invalid: ${errors.join('; ')}` };
  if (prov.confirmed_by_user !== true) {
    return {
      ok: false,
      reason: 'user has not confirmed the provenance evidence — 근거(문서 URL·coordinate·argv)를 화면에 제시하고 승인받으세요',
      manifest,
      requiresUserApproval: true,
    };
  }
  return { ok: true, manifest, requiresUserApproval: true };
}
