import test from 'node:test';
import assert from 'node:assert/strict';
import { tokenizeShell, isPowershellCommand, parseGit, baseName } from '../../scripts/lib/grammar.js';

test('tokenizes plain argv with flags, --, and paths', () => {
  const r = tokenizeShell('git commit -m "fix: login bug" -- src/app.js');
  assert.equal(r.supported, true);
  assert.deepEqual(r.argv, ['git', 'commit', '-m', 'fix: login bug', '--', 'src/app.js']);
});

test('single and double quotes are literal; escapes handled', () => {
  assert.deepEqual(tokenizeShell("echo 'hello world'").argv, ['echo', 'hello world']);
  assert.deepEqual(tokenizeShell('echo "a b" c\\ d').argv, ['echo', 'a b', 'c d']);
  assert.deepEqual(tokenizeShell('rm "file with *"').argv, ['rm', 'file with *'], 'quoted glob stays literal');
  assert.equal(tokenizeShell('rm "file with *"').supported, true);
});

test('every control operator and substitution is unsupported with a reason', () => {
  const cases = [
    ['ls; rm -rf /', 'control-operator:semicolon'],
    ['npm run build && npm test', 'control-operator:ampersand'],
    ['cat a | grep b', 'control-operator:pipe'],
    ['echo x > file', 'redirect:gt'],
    ['cat < file', 'redirect-or-heredoc:lt'],
    ['echo `whoami`', 'command-substitution:backtick'],
    ['echo $(rm -rf /)', 'command-substitution:dollar-paren'],
    ['echo ${HOME:-x}', 'parameter-expansion:dollar-brace'],
    ['(cd /tmp)', 'subshell'],
    ['ls\nrm -rf /', 'newline'],
    ["echo 'unterminated", 'unterminated-single-quote'],
  ];
  for (const [cmd, reason] of cases) {
    const r = tokenizeShell(cmd);
    assert.equal(r.supported, false, cmd);
    assert.equal(r.reason, reason, cmd);
  }
});

test('eval, nested shell, and unquoted glob are unsupported', () => {
  assert.equal(tokenizeShell('eval rm -rf /').reason, 'eval');
  assert.equal(tokenizeShell('bash -c "rm -rf /"').reason, 'nested-shell');
  assert.equal(tokenizeShell('pwsh -Command Remove-Item x').reason, 'nested-shell');
  assert.equal(tokenizeShell('rm -rf *').reason, 'unquoted-glob');
  assert.equal(tokenizeShell('ls src/[abc].js').reason, 'unquoted-glob');
});

test('baseName strips directories on both separators', () => {
  assert.equal(baseName('/usr/bin/git'), 'git');
  assert.equal(baseName('C:\\tools\\git.exe'), 'git.exe');
  assert.equal(baseName('git'), 'git');
});

// ---- PowerShell grammar ----

test('isPowershellCommand: Verb-Noun capitalization or known cmdlet, not Unix dashed commands', () => {
  const known = ['Remove-Item', 'Stop-Process'];
  assert.equal(isPowershellCommand('Remove-Item -Recurse C:\\app', known), true);
  assert.equal(isPowershellCommand('Get-ChildItem'), true);
  assert.equal(isPowershellCommand('remove-item x', known), true, 'lowercase known cmdlet still routes');
  assert.equal(isPowershellCommand('apt-get install -y gh'), false);
  assert.equal(isPowershellCommand('docker-compose up'), false);
  assert.equal(isPowershellCommand('create-react-app my-app'), false);
  assert.equal(isPowershellCommand('git status'), false);
});

// ---- git subgrammar ----

test('parseGit commit: plain, -am, --all, pathspec, exotic', () => {
  const plain = parseGit(['git', 'commit', '-m', 'msg']);
  assert.equal(plain.sub, 'commit');
  assert.equal(plain.allFlag, false);
  assert.deepEqual(plain.pathspec, []);
  assert.equal(plain.exotic, false);

  const am = parseGit(['git', 'commit', '-am', 'msg']);
  assert.equal(am.allFlag, true);
  assert.equal(am.exotic, false);

  const all = parseGit(['git', 'commit', '--all', '--message', 'msg']);
  assert.equal(all.allFlag, true);

  const pathspec = parseGit(['git', 'commit', '-m', 'msg', '--', 'a.js', 'b.js']);
  assert.deepEqual(pathspec.pathspec, ['a.js', 'b.js']);

  const bare = parseGit(['git', 'commit', '-m', 'msg', 'src/x.js']);
  assert.deepEqual(bare.pathspec, ['src/x.js']);

  assert.equal(parseGit(['git', 'commit', '--amend']).exotic, true);
  assert.equal(parseGit(['git', '-C', '/x', 'commit', '-m', 'm']).exotic, true, 'global opts → exotic');
});

test('parseGit push: force detection incl. combined shorts and force-with-lease', () => {
  assert.equal(parseGit(['git', 'push']).force, false);
  assert.equal(parseGit(['git', 'push', '--force']).force, true);
  assert.equal(parseGit(['git', 'push', '-f']).force, true);
  assert.equal(parseGit(['git', 'push', '--force-with-lease']).force, true);
  const withTarget = parseGit(['git', 'push', '--force', 'origin', 'main']);
  assert.equal(withTarget.targetBranch, 'main');
  const refspec = parseGit(['git', 'push', '-f', 'origin', 'feat:release/x']);
  assert.equal(refspec.targetBranch, 'release/x', 'refspec dst side wins');
  assert.equal(parseGit(['git', 'push', '--mirror']).exotic, true);
});

test('parseGit reset and clean', () => {
  assert.equal(parseGit(['git', 'reset', '--hard']).mode, 'hard');
  assert.equal(parseGit(['git', 'reset', '--soft', 'HEAD~1']).mode, 'soft');
  assert.equal(parseGit(['git', 'reset']).mode, 'mixed');
  assert.equal(parseGit(['git', 'reset', '--patch']).exotic, true);

  const clean = parseGit(['git', 'clean', '-fdx']);
  assert.equal(clean.force, true);
  assert.equal(clean.dirs, true);
  assert.equal(clean.ignored, true);
  assert.equal(parseGit(['git', 'clean', '-n']).dryRun, true);
});
