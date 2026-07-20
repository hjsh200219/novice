// Deterministic mutation operators for the safety corpus (PRD §4.5 mutation fixtures).
// Each operator produces a semantics-preserving (or strictly-equivalent-risk) variant
// of a dangerous command. The gate must judge every mutant at the same severity or
// stricter: deny → deny, ask → ask|deny. No randomness — mutants are reproducible.

const hasQuotes = (cmd) => /['"]/.test(cmd);

// Split one combined short-flag group: "rm -rf /" → "rm -r -f /".
function splitShortFlags(cmd) {
  const m = cmd.match(/(^|\s)-([a-z]{2,})(?=\s|$)/i);
  if (!m) return null;
  const split = [...m[2]].map((c) => `-${c}`).join(' ');
  return cmd.replace(m[0], `${m[1]}${split}`);
}

// Long-form flag spellings with identical semantics.
const LONG_FORMS = [
  [/(^rm\s.*)-rf\b/, '$1--recursive --force'],
  [/(^git push\s.*)-f\b/, '$1--force'],
  [/(^git push\s.*)--force\b(?!-)/, '$1-f'],
  [/(^git clean\s.*)-fd\b/, '$1--force -d'],
  [/(^git commit\s.*)-am\b/, '$1-a -m'],
];
function longForm(cmd) {
  for (const [re, replacement] of LONG_FORMS) {
    if (re.test(cmd)) return cmd.replace(re, replacement);
  }
  return null;
}

// Double every separating space (token boundaries survive tokenization).
function extraWhitespace(cmd) {
  if (hasQuotes(cmd)) return null;
  return cmd.replace(/ /g, '  ');
}

// Wrap the final operand in double quotes (quotes are literal in both grammars).
function quoteLastOperand(cmd) {
  if (hasQuotes(cmd)) return null;
  const m = cmd.match(/^(.*\s)(\S+)$/);
  if (!m || m[2].includes('*')) return null;
  return `${m[1]}"${m[2]}"`;
}

// rm only: insert the `--` end-of-options separator before the first operand.
function dashDash(cmd) {
  const m = cmd.match(/^(rm\s+(?:-\S+\s+)*)([^-\s]\S*)/);
  if (!m) return null;
  return cmd.replace(m[0], `${m[1]}-- ${m[2]}`);
}

// Home aliases the deny list treats as equivalent.
function homeAlias(cmd) {
  if (/(^|\s)~(\s|$|\/)/.test(cmd)) return cmd.replace(/(^|\s)~(?=\s|$|\/)/, "$1'$HOME'");
  return null;
}

// PowerShell cmdlets are case-insensitive.
function lowercaseCmdlet(cmd) {
  const m = cmd.match(/^([A-Z][a-z]+-[A-Z][A-Za-z]+)(\s|$)/);
  if (!m) return null;
  return cmd.replace(m[1], m[1].toLowerCase());
}

const OPERATORS = [
  ['split-short-flags', splitShortFlags],
  ['long-form-flags', longForm],
  ['extra-whitespace', extraWhitespace],
  ['quote-last-operand', quoteLastOperand],
  ['dash-dash', dashDash],
  ['home-alias', homeAlias],
  ['lowercase-cmdlet', lowercaseCmdlet],
];

export function mutateCommand(command) {
  const out = [];
  const seen = new Set([command]);
  for (const [op, fn] of OPERATORS) {
    const mutant = fn(command);
    if (mutant && !seen.has(mutant)) {
      seen.add(mutant);
      out.push({ command: mutant, op });
    }
  }
  return out;
}

// Secret-bearing content variants: quoting/spacing/prefix changes that must not
// hide a credential from the scanner.
export function mutateSecretLine(key, value) {
  return [
    `${key}=${value}`,
    `${key} = ${value}`,
    `${key}="${value}"`,
    `${key}='${value}'`,
    `export ${key}=${value}`,
    `  ${key}=${value}  `,
    `${key.toLowerCase()}=${value}`,
  ];
}
