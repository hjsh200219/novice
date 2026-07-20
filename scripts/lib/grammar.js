// Finite lexical grammar for the PreToolUse safety gate.
//
// This is NOT a general shell parser. It recognizes a single command plus an
// argv vector (whitespace split, single/double quotes as literals, backslash
// escapes, flags, `--`, path arguments) and nothing else. Any control operator,
// redirect, substitution, heredoc, eval, nested shell, or UNQUOTED glob makes a
// command "unsupported" — the caller then falls back to token-based classification.
//
// Keeping the grammar finite is a safety decision: we never try to reason about
// shell constructs whose runtime effect we cannot bound.

// Shells/interpreters whose `-c`/`-Command` form embeds an unparsed sub-command.
const SHELL_INTERPRETERS = new Set([
  'bash', 'sh', 'zsh', 'dash', 'ksh', 'csh', 'tcsh', 'fish', 'ash', 'mksh', 'rbash',
  'powershell', 'pwsh',
]);
const NESTED_COMMAND_FLAGS = new Set(['-c', '-Command', '-command', '-EncodedCommand', '/c', '/C']);

export function baseName(p) {
  if (typeof p !== 'string' || p === '') return '';
  const parts = p.split(/[\\/]/);
  return parts[parts.length - 1] || p;
}

function isSpecialEscapeTarget(ch) {
  // Characters where a leading backslash means "literal this shell-special char".
  return ch === ' ' || ch === '\t' || ch === ';' || ch === '&' || ch === '|' ||
    ch === '<' || ch === '>' || ch === '(' || ch === ')' || ch === '"' || ch === "'" ||
    ch === '`' || ch === '$' || ch === '*' || ch === '?' || ch === '[' || ch === ']' ||
    ch === '{' || ch === '}' || ch === '\\' || ch === '#';
}

// Tokenize a single command line into argv, or report why it is unsupported.
// Returns { supported: true, argv } or { supported: false, reason, argv? }.
export function tokenizeShell(command) {
  if (typeof command !== 'string') return { supported: false, reason: 'not-a-string' };
  if (command.trim() === '') return { supported: false, reason: 'empty' };

  const argv = [];
  let cur = '';
  let hasCur = false;
  let sawUnquotedGlob = false;
  let i = 0;
  const n = command.length;

  const pushCur = () => { if (hasCur) { argv.push(cur); cur = ''; hasCur = false; } };

  while (i < n) {
    const ch = command[i];

    if (ch === '\n' || ch === '\r') return { supported: false, reason: 'newline' };

    if (ch === ' ' || ch === '\t') { pushCur(); i++; continue; }

    // control operators / redirects / subshell / substitution
    if (ch === ';') return { supported: false, reason: 'control-operator:semicolon' };
    if (ch === '&') return { supported: false, reason: 'control-operator:ampersand' };
    if (ch === '|') return { supported: false, reason: 'control-operator:pipe' };
    if (ch === '<') return { supported: false, reason: 'redirect-or-heredoc:lt' };
    if (ch === '>') return { supported: false, reason: 'redirect:gt' };
    if (ch === '`') return { supported: false, reason: 'command-substitution:backtick' };
    if (ch === '(' || ch === ')') return { supported: false, reason: 'subshell' };

    if (ch === '$') {
      const next = command[i + 1];
      if (next === '(') return { supported: false, reason: 'command-substitution:dollar-paren' };
      if (next === '{') return { supported: false, reason: 'parameter-expansion:dollar-brace' };
      // bare $VAR — keep as a literal token char (e.g. rm '$HOME' deny-list, or benign cd $HOME)
      cur += ch; hasCur = true; i++; continue;
    }

    if (ch === "'") {
      hasCur = true; i++;
      let closed = false;
      while (i < n) {
        if (command[i] === "'") { closed = true; i++; break; }
        cur += command[i]; i++;
      }
      if (!closed) return { supported: false, reason: 'unterminated-single-quote' };
      continue;
    }

    if (ch === '"') {
      hasCur = true; i++;
      let closed = false;
      while (i < n) {
        const c = command[i];
        if (c === '"') { closed = true; i++; break; }
        if (c === '\\') {
          const nx = command[i + 1];
          if (nx === '"' || nx === '\\' || nx === '$' || nx === '`') { cur += nx; i += 2; continue; }
          cur += c; i++; continue; // keep backslash literally (e.g. Windows path)
        }
        if (c === '$') {
          const nx = command[i + 1];
          if (nx === '(') return { supported: false, reason: 'command-substitution:dollar-paren' };
          if (nx === '{') return { supported: false, reason: 'parameter-expansion:dollar-brace' };
          cur += c; i++; continue;
        }
        if (c === '`') return { supported: false, reason: 'command-substitution:backtick' };
        cur += c; i++;
      }
      if (!closed) return { supported: false, reason: 'unterminated-double-quote' };
      continue;
    }

    if (ch === '\\') {
      const nx = command[i + 1];
      if (nx === undefined) { cur += '\\'; hasCur = true; i++; continue; }
      if (isSpecialEscapeTarget(nx)) { cur += nx; hasCur = true; i += 2; continue; }
      cur += '\\'; hasCur = true; i++; continue; // preserve backslash (Windows path etc.)
    }

    if (ch === '*' || ch === '?' || ch === '[' || ch === ']' || ch === '{' || ch === '}') {
      sawUnquotedGlob = true; cur += ch; hasCur = true; i++; continue;
    }

    cur += ch; hasCur = true; i++;
  }
  pushCur();

  if (argv.length === 0) return { supported: false, reason: 'empty' };

  const base = baseName(argv[0]);
  if (base === 'eval') return { supported: false, reason: 'eval', argv };
  if (SHELL_INTERPRETERS.has(base) && argv.slice(1).some((a) => NESTED_COMMAND_FLAGS.has(a))) {
    return { supported: false, reason: 'nested-shell', argv };
  }

  if (sawUnquotedGlob) return { supported: false, reason: 'unquoted-glob', argv };

  return { supported: true, argv };
}

// ---- PowerShell routing ----

// Detect a PowerShell command line: canonical Verb-Noun capitalization
// (Remove-Item, Get-ChildItem) or a case-insensitive hit in the known cmdlet
// rule lists (so `remove-item` still routes here). Lowercase dashed Unix
// commands (apt-get, docker-compose) stay on the Bash grammar.
export function isPowershellCommand(command, knownCmdlets = []) {
  if (typeof command !== 'string') return false;
  const first = command.trimStart().split(/[\s;|&<>(){}]/, 1)[0];
  if (!first || !first.includes('-')) return false;
  if (/^[A-Z][a-z]+-[A-Z][A-Za-z]+$/.test(first)) return true;
  const lower = first.toLowerCase();
  return knownCmdlets.some((c) => c.toLowerCase() === lower);
}

// ---- Git subgrammar (commit / push / reset / clean) ----

const GLOBAL_WITH_VALUE = new Set(['-C', '-c', '--git-dir', '--work-tree', '--namespace', '--exec-path']);

export function parseGit(argv) {
  let i = 1;
  const globalOpts = [];
  while (i < argv.length && argv[i].startsWith('-')) {
    const t = argv[i];
    globalOpts.push(t);
    if (GLOBAL_WITH_VALUE.has(t)) { i++; if (i < argv.length) globalOpts.push(argv[i]); }
    i++;
  }
  const sub = argv[i];
  const rest = argv.slice(i + 1);
  if (sub === 'commit') return parseGitCommit(rest, globalOpts);
  if (sub === 'push') return parseGitPush(rest, globalOpts);
  if (sub === 'reset') return parseGitReset(rest, globalOpts);
  if (sub === 'clean') return parseGitClean(rest, globalOpts);
  return { sub: sub ?? null, flags: rest.filter((x) => x.startsWith('-')), pathspec: [], options: {}, globalOpts, exotic: false };
}

const COMMIT_ALLOWED_SHORT = new Set(['a', 'm', 'q', 'v', 's']);

function parseGitCommit(rest, globalOpts) {
  let allFlag = false;
  let message = false;
  let exotic = false;
  let sawDashDash = false;
  const pathspec = [];
  for (let k = 0; k < rest.length; k++) {
    const t = rest[k];
    if (sawDashDash) { pathspec.push(t); continue; }
    if (t === '--') { sawDashDash = true; continue; }
    if (t.startsWith('--')) {
      if (t === '--all') { allFlag = true; continue; }
      if (t === '--message') { message = true; if (k + 1 < rest.length) k++; continue; }
      if (t.startsWith('--message=')) { message = true; continue; }
      if (t === '--quiet' || t === '--verbose' || t === '--signoff' || t === '--no-verify') continue;
      exotic = true; continue; // --amend, --fixup, --squash, --file, --reuse-message, ...
    }
    if (t.startsWith('-') && t.length > 1) {
      let hasMessage = false;
      for (const c of t.slice(1)) {
        if (c === 'a') allFlag = true;
        else if (c === 'm') { message = true; hasMessage = true; }
        else if (!COMMIT_ALLOWED_SHORT.has(c)) exotic = true;
      }
      if (hasMessage && k + 1 < rest.length) k++;
      continue;
    }
    pathspec.push(t); // bare operand → explicit pathspec commit
  }
  return {
    sub: 'commit', allFlag, message, pathspec,
    exotic: exotic || globalOpts.length > 0, globalOpts,
    flags: rest.filter((x) => x.startsWith('-')),
  };
}

const PUSH_RECOGNIZED = new Set([
  '-u', '--set-upstream', '--tags', '--follow-tags', '-n', '--dry-run',
  '-v', '--verbose', '-q', '--quiet', '--porcelain', '--progress', '--no-verify', '--atomic',
]);

function parseGitPush(rest, globalOpts) {
  let force = false;
  let exotic = false;
  const operands = [];
  for (const t of rest) {
    if (t.startsWith('-')) {
      if (t === '--force' || t === '-f' || t === '--force-with-lease' || t.startsWith('--force-with-lease=')) { force = true; continue; }
      if (PUSH_RECOGNIZED.has(t)) continue;
      if (/^-[a-z]+$/i.test(t) && !t.startsWith('--') && /f/.test(t.slice(1))) { force = true; continue; }
      exotic = true; continue; // --mirror, --delete, --receive-pack, ...
    }
    operands.push(t);
  }
  const remote = operands[0] ?? null;
  const branch = operands[1] ?? null;
  const targetBranch = branch && branch.includes(':') ? branch.split(':').pop() : branch;
  return {
    sub: 'push', force, remote, branch, targetBranch,
    exotic: exotic || globalOpts.length > 0, globalOpts,
    flags: rest.filter((x) => x.startsWith('-')),
  };
}

const RESET_MODES = new Set(['--hard', '--soft', '--mixed', '--keep', '--merge']);

function parseGitReset(rest, globalOpts) {
  let mode = 'mixed';
  let exotic = false;
  const operands = [];
  for (const t of rest) {
    if (t.startsWith('-')) {
      if (RESET_MODES.has(t)) { mode = t.slice(2); continue; }
      if (t === '-q' || t === '--quiet') continue;
      exotic = true; continue;
    }
    operands.push(t);
  }
  return {
    sub: 'reset', mode, ref: operands[0] ?? null,
    exotic: exotic || globalOpts.length > 0, globalOpts,
    flags: rest.filter((x) => x.startsWith('-')),
  };
}

function parseGitClean(rest, globalOpts) {
  let force = false;
  let dirs = false;
  let ignored = false;
  let dryRun = false;
  let exotic = false;
  const operands = [];
  for (const t of rest) {
    if (t.startsWith('-')) {
      if (t === '--force') { force = true; continue; }
      if (t === '--dry-run') { dryRun = true; continue; }
      if (t.startsWith('--')) { if (t !== '--quiet') exotic = true; continue; }
      for (const c of t.slice(1)) {
        if (c === 'f') force = true;
        else if (c === 'd') dirs = true;
        else if (c === 'x' || c === 'X') ignored = true;
        else if (c === 'n') dryRun = true;
        else if (c !== 'q') exotic = true;
      }
      continue;
    }
    operands.push(t);
  }
  return {
    sub: 'clean', force, dirs, ignored, dryRun,
    exotic: exotic || globalOpts.length > 0, globalOpts,
    flags: rest.filter((x) => x.startsWith('-')),
  };
}
