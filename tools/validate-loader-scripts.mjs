import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const SCRIPTS_DIR = path.join(ROOT, 'scripts');
const SUPPORTED_GRANTS = new Set(['none']);
const FORBIDDEN_PATTERNS = [
  /\bGM_[A-Za-z0-9_]+\b/g,
  /\bGM\.[A-Za-z0-9_]+\b/g
];

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(fullPath) : [fullPath];
  });
}

function readMetadata(source) {
  const start = source.indexOf('// ==UserScript==');
  const end = source.indexOf('// ==/UserScript==');
  if (start === -1 || end === -1 || end <= start) return null;

  const values = new Map();
  for (const line of source.slice(start, end).split(/\r?\n/)) {
    const match = line.match(/^\s*\/\/\s*@([^\s]+)\s+(.+?)\s*$/);
    if (!match) continue;
    const list = values.get(match[1]) || [];
    list.push(match[2]);
    values.set(match[1], list);
  }
  return values;
}

const errors = [];
const checked = [];

for (const fullPath of walk(SCRIPTS_DIR).filter((file) => file.endsWith('.user.js')).sort()) {
  const source = fs.readFileSync(fullPath, 'utf8').replace(/^\uFEFF/, '');
  const metadata = readMetadata(source);
  const relativePath = path.relative(ROOT, fullPath).split(path.sep).join('/');
  if (!metadata) continue;

  const enabled = String(metadata.get('loader-enabled')?.[0] || '').toLowerCase() === 'true';
  if (!enabled) continue;

  checked.push(relativePath);
  const grants = metadata.get('grant') || [];
  if (grants.length !== 1 || !SUPPORTED_GRANTS.has(grants[0].toLowerCase())) {
    errors.push(`${relativePath}: loader対応は @grant none のみ許可`);
  }

  for (const pattern of FORBIDDEN_PATTERNS) {
    const found = [...source.matchAll(pattern)].map((match) => match[0]);
    if (found.length > 0) {
      errors.push(`${relativePath}: 非対応APIを検出 ${[...new Set(found)].join(', ')}`);
    }
  }
}

console.log(`loader対応確認: ${checked.length}件`);
for (const file of checked) console.log(`  OK候補: ${file}`);

if (errors.length > 0) {
  console.error('loader互換エラー:');
  for (const error of errors) console.error(`  - ${error}`);
  process.exit(1);
}

console.log('loader互換チェック完了');
