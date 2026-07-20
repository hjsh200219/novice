// Safety-gate analysis (L2 lib). Minimal deny-only core for the PreToolUse hook.
//
// Philosophy (PRD §4.5): the gate blocks ONLY on positively-identified, catastrophic,
// irreversible actions and on secret VALUES exposed on a command line / in a commit.
// Everything else — including any command whose grammar we cannot fully parse — returns
// null (no opinion) and is delegated to Claude Code's native permission prompt. There is
// no "ask" tier: we never second-guess unparseable shell, which is what produced constant
// false confirmations on benign piped/redirected commands.
//
// Returns { decision: 'deny', reason } or null. The hook wrapper (scripts/pre-tool-use.js)
// owns stdin/stdout and fail-closed behavior on malformed input.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { scanText } from './secrets.js';
import { tokenizeShell, isPowershellCommand, parseGit, baseName } from './grammar.js';

const SPLIT_GUIDANCE = '명령이나 파일을 더 작은 단위로 나눠 다시 시도하세요.';

function git(cwd, args) {
  return execFileSync('git', ['-C', cwd, ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
    timeout: 5000,
    maxBuffer: 16 * 1024 * 1024,
  });
}

function deny(reason) {
  return { decision: 'deny', reason };
}

// ---- protected branches ----

function branchPatternToRegex(pattern) {
  const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\\*/g, '.+');
  return new RegExp(`^${escaped}$`);
}

function isProtectedBranch(branch, rules, extra) {
  if (typeof branch !== 'string' || branch === '') return false;
  const patterns = [...rules.protected_branches.builtin, ...(extra || [])];
  return patterns.some((p) => branchPatternToRegex(p).test(branch));
}

// ---- target classification (deploy CLIs / MCP) ----

function classifyTargetFromArgv(argv, rules) {
  const joined = argv.join(' ');
  for (const [cls, hints] of Object.entries(rules.target_flag_hints)) {
    for (const hint of hints) {
      if (hint.includes(' ')) {
        if (joined.includes(hint)) return cls;
      } else if (argv.includes(hint)) {
        return cls;
      }
    }
  }
  return 'unknown';
}

function classifyTargetFromValues(toolInput) {
  const values = [];
  (function collect(v) {
    if (typeof v === 'string') values.push(v);
    else if (Array.isArray(v)) v.forEach(collect);
    else if (v && typeof v === 'object') Object.values(v).forEach(collect);
  })(toolInput);
  const joined = values.join(' ');
  if (/\bprod(uction)?\b/i.test(joined)) return 'production';
  if (/\b(preview|staging)\b/i.test(joined)) return 'staging';
  if (/\b(dev|development|local)\b/i.test(joined)) return 'development';
  return 'unknown';
}

function safeRealpath(p) {
  try {
    return fs.realpathSync(p);
  } catch {
    return null;
  }
}

// ---- rm: deny only when the target is home / root / project root / parent / '*' ----

function checkRm(argv, cwd) {
  const targets = [];
  for (const t of argv.slice(1)) {
    if (t === '--') continue;
    if (t.startsWith('-')) continue; // flags (recursive-only rm of a normal path is allowed)
    targets.push(t);
  }
  const home = os.homedir();
  const cwdReal = safeRealpath(cwd) ?? path.resolve(cwd);
  for (const raw of targets) {
    const stripped = raw.replace(/\/\*$/, '');
    if (raw === '*' || stripped === '' || stripped === '/' || stripped === '~' || stripped === '$HOME' || stripped === '.' || stripped === '..') {
      return deny(`'rm ${raw}'은 홈·프로젝트 전체 또는 상위 디렉토리를 삭제할 수 있어 차단했어요. 삭제 대상을 구체적인 파일·폴더 경로로 지정하세요.`);
    }
    const resolved = path.resolve(cwd, stripped.replace(/^~(?=\/|$)/, home).replace(/^\$HOME(?=\/|$)/, home));
    const resolvedReal = safeRealpath(resolved) ?? resolved;
    if (resolvedReal === path.parse(resolvedReal).root || resolvedReal === home || resolvedReal === cwdReal || cwdReal.startsWith(resolvedReal + path.sep)) {
      return deny(`'rm' 대상(${raw})이 홈 디렉토리·프로젝트 루트·상위 경로를 가리켜 차단했어요. 복구가 어려운 삭제예요.`);
    }
  }
  return null;
}

// ---- git: deny force-push to a protected branch and secret-bearing commits ----

function currentBranch(cwd) {
  try {
    const b = git(cwd, ['rev-parse', '--abbrev-ref', 'HEAD']).trim();
    return b === 'HEAD' ? null : b;
  } catch {
    return null;
  }
}

function checkGit(argv, cwd, rules, extraProtected) {
  const parsed = parseGit(argv);

  if (parsed.sub === 'push') {
    if (!parsed.force) return null;
    const target = parsed.targetBranch ?? currentBranch(cwd);
    if (isProtectedBranch(target, rules, extraProtected)) {
      return deny(`보호된 branch(${target})로의 force push는 원격 기록을 영구히 덮어써서 차단했어요. 새 branch에 push하거나 force 없이 push하세요.`);
    }
    return null;
  }

  if (parsed.sub === 'commit') {
    return checkGitCommit(parsed, cwd, rules);
  }

  return null;
}

function stagedFiles(cwd) {
  const out = git(cwd, ['diff', '--cached', '--name-only', '-z']);
  return out.split('\0').filter(Boolean);
}

function trackedModifiedFiles(cwd) {
  const out = git(cwd, ['diff', '--name-only', '-z', 'HEAD']);
  return out.split('\0').filter(Boolean);
}

// Scan the commit's candidate files for secret VALUES; deny if any is found.
// Anything we cannot scan (exotic options, unborn HEAD, oversize, read error) returns
// null — the gate blocks only on a positive secret detection, never on inability to scan.
function checkGitCommit(parsed, cwd, rules) {
  if (parsed.exotic) return null;
  try {
    git(cwd, ['rev-parse', '--verify', 'HEAD']);
  } catch {
    return null; // unborn HEAD
  }

  const caps = rules.input_caps;
  const skipExt = new Set(rules.scan_file_extensions_skip);
  let files;
  let readContent;
  try {
    if (parsed.pathspec.length > 0) {
      files = parsed.pathspec.map((p) => p);
      readContent = (f) => {
        const abs = path.resolve(cwd, f);
        const st = fs.statSync(abs);
        if (!st.isFile()) return null;
        if (st.size > caps.single_file_bytes) return null;
        return { content: fs.readFileSync(abs, 'utf8') };
      };
    } else if (parsed.allFlag) {
      files = trackedModifiedFiles(cwd);
      readContent = (f) => {
        const abs = path.resolve(cwd, f);
        let st;
        try {
          st = fs.statSync(abs);
        } catch {
          return null; // deleted file
        }
        if (!st.isFile()) return null;
        if (st.size > caps.single_file_bytes) return null;
        return { content: fs.readFileSync(abs, 'utf8') };
      };
    } else {
      files = stagedFiles(cwd);
      readContent = (f) => {
        let size;
        try {
          size = Number(git(cwd, ['cat-file', '-s', `:0:${f}`]).trim());
        } catch {
          return null; // deleted from index
        }
        if (size > caps.single_file_bytes) return null;
        return { content: git(cwd, ['show', `:0:${f}`]) };
      };
    }

    let total = 0;
    for (const f of files) {
      if (skipExt.has(path.extname(f).toLowerCase())) continue;
      const r = readContent(f);
      if (r == null) continue;
      total += Buffer.byteLength(r.content, 'utf8');
      if (total > caps.total_candidate_bytes) return null;
      const findings = scanText(r.content, rules);
      if (findings.length > 0) {
        const ids = [...new Set(findings.map((x) => x.id))].join(', ');
        return deny(
          `commit 대상 파일(${f})에서 비밀값 패턴(${ids})이 발견되어 차단했어요. ` +
            '해당 값을 파일에서 제거하고 environment variable(환경변수)로 옮긴 뒤 다시 commit하세요. 오탐이라면 값 형태를 바꾸거나 fixture 표기를 추가하세요.',
        );
      }
    }
    return null;
  } catch {
    return null; // scan error → no opinion
  }
}

// ---- deploy CLIs: deny production/unknown destructive verbs and secret-bearing deploy args ----

function checkDeployCli(svc, argv, cwd, rules) {
  const svcRules = rules.deploy_clis[svc];
  const operands = argv.slice(1).filter((t) => !t.startsWith('-'));
  const subcommand = operands.join(' ');
  const target = classifyTargetFromArgv(argv, rules);

  for (const [verb, actions] of Object.entries(svcRules.destructive_verbs ?? {})) {
    if (subcommand === verb || subcommand.startsWith(`${verb} `)) {
      const effectiveTarget = target === 'preview' ? 'preview' : target;
      const action = actions[effectiveTarget] ?? actions.unknown ?? 'deny';
      if (action === 'deny') {
        return deny(
          `'${svc} ${verb}'는 ${describeTarget(effectiveTarget)}의 리소스를 삭제·초기화할 수 있어 차단했어요. ` +
            '정말 필요하면 해당 서비스 콘솔에서 대상과 백업을 확인하고 직접 실행하세요.',
        );
      }
      return null; // non-deny destructive verbs are delegated to Claude Code's native prompt
    }
  }

  // Deploy args that point at an env file get a secret scan (deny on a real secret value).
  if (svcRules.secret_scan_on_deploy) {
    for (const t of argv.slice(1)) {
      if (/^\.?env(\..+)?$/i.test(baseName(t))) {
        const verdict = scanEnvFileArg(t, cwd, rules);
        if (verdict) return verdict;
      }
    }
  }
  return null;
}

function scanEnvFileArg(fileArg, cwd, rules) {
  try {
    const abs = path.resolve(cwd, fileArg);
    const st = fs.statSync(abs);
    if (!st.isFile()) return null;
    if (st.size > rules.input_caps.single_file_bytes) return null;
    const findings = scanText(fs.readFileSync(abs, 'utf8'), rules);
    if (findings.length > 0) {
      const ids = [...new Set(findings.map((x) => x.id))].join(', ');
      return deny(`배포 인자 파일(${fileArg})에서 비밀값 패턴(${ids})이 발견되어 차단했어요. 값은 서비스의 env 설정 화면·대화형 명령으로 직접 입력하세요.`);
    }
    return null;
  } catch {
    return null;
  }
}

function describeTarget(cls) {
  return {
    production: 'production(실서비스)',
    staging: 'preview/staging(테스트 환경)',
    preview: 'preview/staging(테스트 환경)',
    development: 'development(개발 환경)',
    unknown: '알 수 없는 환경(unknown)',
  }[cls] ?? cls;
}

// ---- PowerShell: deny only the catastrophic disk/format cmdlets ----

function analyzePowershell(command, rules) {
  const argv = command.trim().split(/\s+/);
  const name = argv[0].toLowerCase();
  if (rules.shell_rules.powershell_dangerous_deny.some((c) => c.toLowerCase() === name)) {
    return deny(`'${argv[0]}'은 디스크·파티션을 복구 불가능하게 파괴할 수 있어 이 플러그인에서는 차단해요.`);
  }
  return null;
}

// ---- Bash pipeline (public) ----

export function analyzeBash(command, cwd, rules, extraProtected) {
  if (typeof command !== 'string') {
    return deny('명령이 문자열이 아니라 검증할 수 없어 차단했어요.');
  }
  if (Buffer.byteLength(command, 'utf8') > rules.input_caps.command_bytes) {
    return deny(`명령이 64KiB 입력 상한을 넘어 검사 없이 실행할 수 없어요. ${SPLIT_GUIDANCE}`);
  }

  // Raw-argv secret exposure beats everything: a secret VALUE on the command line is denied
  // regardless of grammar (this scan does not need the command to be parseable).
  const rawFindings = scanText(command, rules);
  if (rawFindings.length > 0) {
    const ids = [...new Set(rawFindings.map((x) => x.id))].join(', ');
    return deny(
      `명령 인자에 비밀값 패턴(${ids})이 노출되어 차단했어요. ` +
        '값은 대화·명령줄·shell history에 남으면 안 돼요. 해당 서비스의 대화형 입력이나 env 설정 화면을 사용하세요.',
    );
  }

  const psKnown = rules.shell_rules.powershell_dangerous_deny;
  if (isPowershellCommand(command, psKnown)) {
    return analyzePowershell(command, rules);
  }

  const tokenized = tokenizeShell(command);
  if (!tokenized.supported) return null; // unparseable grammar → no opinion (delegate to CC native)

  const argv = tokenized.argv;
  const base = baseName(argv[0]);

  if (base === 'rm') return checkRm(argv, cwd);
  if (rules.shell_rules.dangerous_commands_deny.includes(base)) {
    return deny(`'${base}'는 디스크·파일을 복구 불가능하게 파괴할 수 있어 이 플러그인에서는 차단해요.`);
  }
  if (base === 'git') return checkGit(argv, cwd, rules, extraProtected);
  if (Object.prototype.hasOwnProperty.call(rules.deploy_clis, base)) {
    return checkDeployCli(base, argv, cwd, rules);
  }
  return null;
}

// ---- MCP pipeline (public) ----

export function analyzeMcp(toolName, toolInput, rules) {
  const parts = toolName.split('__');
  const bareName = (parts[2] ?? parts[parts.length - 1] ?? '').toLowerCase();
  const destructive = rules.mcp_rules.destructive_name_patterns.some((p) => bareName.includes(p));
  if (!destructive) return null;

  const target = classifyTargetFromValues(toolInput);
  const effective = target === 'preview' ? 'staging' : target;
  const action = rules.mcp_rules.action[effective] ?? 'deny';
  if (action === 'deny') {
    return deny(
      `외부 도구 '${toolName}' — 대상 환경: ${describeTarget(effective)}. ` +
        `원격 리소스를 삭제·초기화하는 작업은 ${describeTarget(effective)}에서 차단해요. 필요하면 서비스 콘솔에서 직접 실행하세요.`,
    );
  }
  return null; // non-production destructive MCP is delegated to Claude Code's native prompt
}
