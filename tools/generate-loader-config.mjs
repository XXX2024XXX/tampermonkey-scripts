import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const SCRIPTS_DIR = path.join(ROOT, 'scripts');
const CONFIG_PATH = path.join(ROOT, 'extension', 'github-loader', 'config.json');
const RAW_BASE = 'https://raw.githubusercontent.com/XXX2024XXX/tampermonkey-scripts/main';

function readMetadata(source) {
    const start = source.indexOf('// ==UserScript==');
    const end = source.indexOf('// ==/UserScript==');

    if (start === -1 || end === -1 || end <= start) {
        return null;
    }

    const block = source.slice(start, end);
    const values = new Map();

    for (const line of block.split(/\r?\n/)) {
        const match = line.match(/^\s*\/\/\s*@([^\s]+)\s+(.+?)\s*$/);
        if (!match) continue;

        const key = match[1];
        const value = match[2];
        const list = values.get(key) || [];
        list.push(value);
        values.set(key, list);
    }

    return values;
}

function getFirst(metadata, key, fallback = '') {
    const values = metadata.get(key);
    return values?.[0] ?? fallback;
}

function walk(dir) {
    if (!fs.existsSync(dir)) return [];

    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const fullPath = path.join(dir, entry.name);
        return entry.isDirectory() ? walk(fullPath) : [fullPath];
    });
}

const previous = fs.existsSync(CONFIG_PATH)
    ? JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8').replace(/^\uFEFF/, ''))
    : {};

const scripts = [];
const skipped = [];

for (const fullPath of walk(SCRIPTS_DIR).filter((file) => file.endsWith('.user.js')).sort()) {
    const source = fs.readFileSync(fullPath, 'utf8').replace(/^\uFEFF/, '');
    const metadata = readMetadata(source);
    const relativePath = path.relative(ROOT, fullPath).split(path.sep).join('/');

    if (!metadata) {
        skipped.push(`${relativePath}: UserScriptヘッダーなし`);
        continue;
    }

    const loaderEnabled = getFirst(metadata, 'loader-enabled').toLowerCase() === 'true';
    const grants = metadata.get('grant') || [];
    const grantNoneOnly = grants.length === 1 && grants[0].toLowerCase() === 'none';
    const matches = [...(metadata.get('match') || []), ...(metadata.get('include') || [])];

    if (!loaderEnabled) {
        skipped.push(`${relativePath}: @loader-enabled true なし`);
        continue;
    }

    if (!grantNoneOnly) {
        skipped.push(`${relativePath}: @grant none 以外`);
        continue;
    }

    if (matches.length === 0) {
        skipped.push(`${relativePath}: @match/@include なし`);
        continue;
    }

    const id = relativePath
        .replace(/^scripts\//, '')
        .replace(/\.user\.js$/i, '')
        .replace(/[^a-zA-Z0-9_-]+/g, '-');

    scripts.push({
        id,
        name: getFirst(metadata, 'name', id),
        enabled: true,
        sourceUrl: `${RAW_BASE}/${relativePath}`,
        matches
    });
}

const config = {
    schemaVersion: 1,
    emergencyStop: previous.emergencyStop === true,
    cacheHistoryLimit: Math.max(1, Number(previous.cacheHistoryLimit || 3)),
    requestTimeoutMs: Math.max(3000, Number(previous.requestTimeoutMs || 15000)),
    generatedAt: new Date().toISOString(),
    scripts
};

fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
fs.writeFileSync(CONFIG_PATH, `\uFEFF${JSON.stringify(config, null, 2)}\n`, 'utf8');

console.log(`登録: ${scripts.length}件`);
for (const script of scripts) console.log(`  + ${script.name}`);
console.log(`除外: ${skipped.length}件`);
for (const reason of skipped) console.log(`  - ${reason}`);
