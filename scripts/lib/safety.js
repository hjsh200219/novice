// Safety-gate analysis (L2 lib). Pure-ish decision logic for the PreToolUse hook:
// destructive commands, git history damage, secret commit/deploy, destructive MCP.
// Returns { decision: 'deny'|'ask', reason } or null (no opinion). The hook wrapper
// (scripts/pre-tool-use.js) owns stdin/stdout and fail-closed behavior.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { scanText } from './secrets.js';
import { tokenizeShell, tokenizePowershell, isPowershellCommand, parseGit, baseName } from './grammar.js';

const SPLIT_GUIDANCE = '명령이나 파일을 더 작은 단위로 나눠 다시 시도하세요.';

function git(cwd, args) {
  return execFileSync('git', ['-C', cwd, ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
    timeout: 5000,
    maxBuffer: 16 * 1024 * 1024,
  });
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

// ---- decision helpers ----

function deny(reason) {
  return { decision: 'deny', reason };
}

function ask(reason) {
  return { decision: 'ask', reason };
}

function safeRealpath(p) {
  try {
    return fs.realpathSync(p);
  } catch {
    return null;
  }
}

// ---- rm ----

function checkRm(argv, cwd) {
  let recursive = false;
  const targets = [];
  for (const t of argv.slice(1)) {
    if (t === '--') continue;
    if (t.startsWith('--')) {
      if (t === '--recursive') recursive = true;
      continue;
    }
    if (t.startsWith('-') && t.length > 1) {
      if (/[rR]/.test(t.slice(1))) recursive = true;
      continue;
    }
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
  if (recursive && targets.length > 0) {
    return ask(`폴더를 통째로 삭제해요: ${targets.join(', ')}. Git에 없는(untracked) 파일은 복구할 수 없어요. 계속할까요?`);
  }
  return null;
}

// ---- git ----

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
    if (target == null) {
      return ask('force push 대상 branch를 확인할 수 없어요. force push는 원격 기록을 덮어씁니다. 계속할까요?');
    }
    return ask(`branch '${target}'에 force push하면 원격의 기존 기록을 덮어써요. 계속할까요?`);
  }

  if (parsed.sub === 'reset') {
    if (parsed.exotic) return ask('git reset의 지원하지 않는 옵션 조합이라 자동 검증을 못 했어요. 계속할까요?');
    if (parsed.mode === 'hard') {
      return ask(`git reset --hard는 commit하지 않은 변경을 모두 버려요 (대상: ${parsed.ref ?? 'HEAD'}). 되돌릴 수 없어요. 계속할까요?`);
    }
    return null;
  }

  if (parsed.sub === 'clean') {
    if (parsed.dryRun) return null;
    if (parsed.force) {
      const extras = [parsed.dirs ? '폴더 포함(-d)' : null, parsed.ignored ? '.gitignore된 파일 포함(-x)' : null].filter(Boolean);
      return ask(`git clean -f는 Git이 추적하지 않는 파일을 삭제해요${extras.length ? ` — ${extras.join(', ')}` : ''}. 삭제 후 복구할 수 없어요. 계속할까요?`);
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

function checkGitCommit(parsed, cwd, rules) {
  if (parsed.exotic) {
    return ask('git commit의 지원하지 않는 옵션 조합이라 commit 내용을 자동 검사하지 못했어요. 시크릿이 없는지 직접 확인 후 진행하세요.');
  }

  try {
    git(cwd, ['rev-parse', '--verify', 'HEAD']);
  } catch {
    return ask('첫 commit(unborn HEAD)이라 자동 시크릿 검사가 제한돼요. .env 같은 비밀값 파일이 포함되지 않았는지 확인 후 진행하세요.');
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
        if (st.size > caps.single_file_bytes) return { oversize: true };
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
        if (st.size > caps.single_file_bytes) return { oversize: true };
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
        if (size > caps.single_file_bytes) return { oversize: true };
        return { content: git(cwd, ['show', `:0:${f}`]) };
      };
    }

    let total = 0;
    for (const f of files) {
      if (skipExt.has(path.extname(f).toLowerCase())) continue;
      const r = readContent(f);
      if (r == null) continue;
      if (r.oversize) {
        return deny(`commit 대상 파일(${f})이 1MiB 스캔 상한을 넘어 시크릿 검사를 못 했어요. ${SPLIT_GUIDANCE}`);
      }
      total += Buffer.byteLength(r.content, 'utf8');
      if (total > caps.total_candidate_bytes) {
        return deny(`commit 검사 대상이 총 5MiB 상한을 넘었어요. ${SPLIT_GUIDANCE}`);
      }
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
    return ask('commit 대상 파일을 검사하는 중 오류가 나서 시크릿 검사를 완료하지 못했어요. 비밀값이 없는지 직접 확인 후 진행하세요.');
  }
}

// ---- deploy CLIs ----

function checkDeployCli(svc, argv, cwd, rules) {
  const svcRules = rules.deploy_clis[svc];
  const operands = argv.slice(1).filter((t) => !t.startsWith('-'));
  const subcommand = operands.join(' ');
  const target = classifyTargetFromArgv(argv, rules);

  for (const [verb, actions] of Object.entries(svcRules.destructive_verbs ?? {})) {
    if (subcommand === verb || subcommand.startsWith(`${verb} `)) {
      const effectiveTarget = target === 'preview' ? 'preview' : target;
      const action = actions[effectiveTarget] ?? actions.unknown ?? 'deny';
      const what = `${svc} ${verb}`;
      if (action === 'deny') {
        return deny(
          `'${what}'는 ${describeTarget(effectiveTarget)}의 리소스를 삭제·초기화할 수 있어 차단했어요. ` +
            '정말 필요하면 해당 서비스 콘솔에서 대상과 백업을 확인하고 직접 실행하세요.',
        );
      }
      return ask(`'${what}' — 대상 환경: ${describeTarget(effectiveTarget)}. 삭제·초기화된 데이터는 이 플러그인이 복구할 수 없어요. 계속할까요?`);
    }
  }

  // Deploy verb: production deploys get a confirmation; env-file style args get scanned.
  if (svcRules.secret_scan_on_deploy) {
    for (const t of argv.slice(1)) {
      if (/^\.?env(\..+)?$/i.test(baseName(t))) {
        const verdict = scanEnvFileArg(t, cwd, rules);
        if (verdict) return verdict;
      }
    }
    const isDeploy = operands.length === 0 || operands[0] === 'deploy';
    if (isDeploy && target === 'production') {
      return ask('production(실서비스 환경)으로 배포해요. preview deployment로 먼저 확인하는 것을 권해요. 계속할까요?');
    }
  }
  return null;
}

function scanEnvFileArg(fileArg, cwd, rules) {
  try {
    const abs = path.resolve(cwd, fileArg);
    const st = fs.statSync(abs);
    if (!st.isFile()) return null;
    if (st.size > rules.input_caps.single_file_bytes) {
      return deny(`배포 인자로 넘긴 파일(${fileArg})이 스캔 상한을 넘었어요. ${SPLIT_GUIDANCE}`);
    }
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

// ---- unsupported-syntax fallback ----

// Shared by Bash and PowerShell grammars: dangerous token present → deny, else ask.
function unsupportedFallback(command, rules, reason) {
  const lower = command.toLowerCase();
  // Boundary allows _ and - so tokens match inside SECRET_KEY / --force-with-lease style words.
  const dangerous = rules.dangerous_tokens.filter((t) => {
    const re = new RegExp(`(?:^|[^a-z0-9])${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:$|[^a-z0-9])`, 'i');
    return re.test(lower);
  });
  if (dangerous.length > 0) {
    return deny(
      `지원하지 않는 shell 문법(${reason})에 위험 요소(${dangerous.slice(0, 3).join(', ')})가 섞여 있어 차단했어요. ` +
        '한 번에 한 명령씩, pipe·리다이렉트 없이 나눠 실행하세요.',
    );
  }
  return ask(`지원하지 않는 shell 문법(${reason})이라 자동 안전 검증을 못 했어요. 명령 내용을 확인하고 진행하세요.`);
}

// ---- PowerShell ----

function analyzePowershell(command, rules) {
  const tokenized = tokenizePowershell(command);
  if (!tokenized.supported) return unsupportedFallback(command, rules, `powershell:${tokenized.reason}`);

  const argv = tokenized.argv;
  const name = argv[0].toLowerCase(); // PowerShell cmdlet names are case-insensitive
  if (rules.shell_rules.powershell_dangerous_deny.some((c) => c.toLowerCase() === name)) {
    return deny(`'${argv[0]}'은 디스크·파티션을 복구 불가능하게 파괴할 수 있어 이 플러그인에서는 차단해요.`);
  }
  if (rules.shell_rules.powershell_dangerous_ask.some((c) => c.toLowerCase() === name)) {
    return ask(`'${argv[0]}'은 파일·프로세스 상태를 바꿔요. 대상을 확인하고 진행하세요: ${argv.slice(1).join(' ')}`);
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

  // Raw-argv secret exposure beats everything else: never allow secrets on a command line.
  const rawFindings = scanText(command, rules);
  if (rawFindings.length > 0) {
    const ids = [...new Set(rawFindings.map((x) => x.id))].join(', ');
    return deny(
      `명령 인자에 비밀값 패턴(${ids})이 노출되어 차단했어요. ` +
        '값은 대화·명령줄·shell history에 남으면 안 돼요. 해당 서비스의 대화형 입력이나 env 설정 화면을 사용하세요.',
    );
  }

  // PowerShell cmdlets get the PowerShell finite grammar (backtick escapes,
  // backslash paths); everything else stays on the Bash grammar.
  const psKnown = [...rules.shell_rules.powershell_dangerous_deny, ...rules.shell_rules.powershell_dangerous_ask];
  if (isPowershellCommand(command, psKnown)) {
    return analyzePowershell(command, rules);
  }

  const tokenized = tokenizeShell(command);
  if (!tokenized.supported) return unsupportedFallback(command, rules, tokenized.reason);

  const argv = tokenized.argv;
  const base = baseName(argv[0]);

  if (base === 'rm') return checkRm(argv, cwd);
  if (rules.shell_rules.dangerous_commands_deny.includes(base)) {
    return deny(`'${base}'는 디스크·파일을 복구 불가능하게 파괴할 수 있어 이 플러그인에서는 차단해요.`);
  }
  if (rules.shell_rules.dangerous_commands_ask.includes(base)) {
    return ask(`'${base}'는 파일·프로세스 상태를 바꿔요. 대상을 확인하고 진행하세요: ${argv.slice(1).join(' ')}`);
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
  const summary = `외부 도구 '${toolName}' — 대상 환경: ${describeTarget(effective)}`;
  if (action === 'deny') {
    return deny(`${summary}. 원격 리소스를 삭제·초기화하는 작업은 ${describeTarget(effective)}에서 차단해요. 필요하면 서비스 콘솔에서 직접 실행하세요.`);
  }
  return ask(`${summary}. 삭제·초기화된 원격 데이터는 이 플러그인이 복구할 수 없어요. 계속할까요?`);
}
