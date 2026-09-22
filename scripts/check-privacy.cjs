// Deliberately report file/rule only, never the matched secret.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const allowed = require('./release-files.json');
const ignoredDirs = new Set(['.git', 'node_modules']);
function walk(dir) {
  return fs.readdirSync(dir, {withFileTypes:true}).flatMap(entry => {
    const full = path.join(dir, entry.name);
    if (entry.isSymbolicLink()) throw Error('Symbolic links are not allowed in release files');
    return entry.isDirectory() ? (ignoredDirs.has(entry.name) ? [] : walk(full)) : [path.relative(root, full).replaceAll('\\','/')];
  });
}
const rules = [
  ['credential-like string', /\b(?:sk-|tvly-)[A-Za-z0-9_-]{24,}/],
  ['GitHub token', /\b(?:gh[pousr]_|github_pat_)[A-Za-z0-9_]{20,}/],
  ['private key', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ['personal Windows path', /[A-Z]:[\\/]Users[\\/][^\s"']+/i],
  ['personal Unix path', /\/(?:Users|home)\/[a-z0-9._-]+\//i]
];
let failed = false;
const files = walk(root);
for (const name of files) {
  if (!allowed.includes(name)) { console.error('Unexpected release file:', name); failed = true; continue; }
  // The scanner contains its own signatures, not user data.
  if (name === 'scripts/check-privacy.cjs') continue;
  const text = fs.readFileSync(path.join(root, name), 'utf8');
  for (const [label, regex] of rules) if (regex.test(text)) { console.error(name + ': ' + label); failed = true; }
}
for (const name of allowed) if (!files.includes(name)) { console.error('Missing release file:', name); failed = true; }
if (failed) process.exitCode = 1;
else console.log('PASS: release file allowlist and common privacy signatures (' + files.length + ' files). Manual review still required.');
