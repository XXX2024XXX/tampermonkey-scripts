const CONFIG_URL = 'https://raw.githubusercontent.com/XXX2024XXX/tampermonkey-scripts/main/extension/github-loader/config.json';
const CONFIG_CACHE_KEY = 'githubLoaderConfigCache';
const SCRIPT_CACHE_KEY = 'githubLoaderScriptCache';
const STATUS_KEY = 'githubLoaderStatus';
const DEFAULT_TIMEOUT_MS = 15000;
const DEFAULT_HISTORY_LIMIT = 3;

function nowIso() {
    return new Date().toISOString();
}

async function saveStatus(status) {
    await chrome.storage.local.set({
        [STATUS_KEY]: {
            ...status,
            updatedAt: nowIso()
        }
    });
}

async function fetchText(url, timeoutMs) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const separator = url.includes('?') ? '&' : '?';
        const response = await fetch(`${url}${separator}t=${Date.now()}`, {
            cache: 'no-store',
            signal: controller.signal
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const text = await response.text();
        if (!text.trim()) {
            throw new Error('取得内容が空です。');
        }

        return text;
    } finally {
        clearTimeout(timeoutId);
    }
}

function validateConfig(config) {
    if (!config || typeof config !== 'object') {
        throw new Error('config.jsonの形式が不正です。');
    }

    if (!Array.isArray(config.scripts)) {
        throw new Error('config.jsonのscriptsが配列ではありません。');
    }

    return {
        schemaVersion: Number(config.schemaVersion || 1),
        emergencyStop: config.emergencyStop === true,
        cacheHistoryLimit: Math.max(1, Number(config.cacheHistoryLimit || DEFAULT_HISTORY_LIMIT)),
        requestTimeoutMs: Math.max(3000, Number(config.requestTimeoutMs || DEFAULT_TIMEOUT_MS)),
        scripts: config.scripts
    };
}

async function loadConfig() {
    try {
        const text = await fetchText(CONFIG_URL, DEFAULT_TIMEOUT_MS);
        const config = validateConfig(JSON.parse(text));
        await chrome.storage.local.set({ [CONFIG_CACHE_KEY]: config });
        return { config, source: 'GitHub最新版' };
    } catch (error) {
        const stored = await chrome.storage.local.get(CONFIG_CACHE_KEY);
        const cached = stored[CONFIG_CACHE_KEY];

        if (!cached) {
            throw new Error(`設定取得失敗: ${error.message}`);
        }

        return { config: validateConfig(cached), source: '前回設定' };
    }
}

function urlMatches(url, patterns) {
    if (!Array.isArray(patterns) || patterns.length === 0) {
        return false;
    }

    return patterns.some((pattern) => {
        try {
            const escaped = pattern
                .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
                .replace(/\*/g, '.*');
            return new RegExp(`^${escaped}$`, 'i').test(url);
        } catch {
            return false;
        }
    });
}

function validateScriptEntry(entry) {
    if (!entry || typeof entry !== 'object') {
        return null;
    }

    if (entry.enabled !== true || !entry.id || !entry.sourceUrl) {
        return null;
    }

    return {
        id: String(entry.id),
        name: String(entry.name || entry.id),
        sourceUrl: String(entry.sourceUrl),
        matches: Array.isArray(entry.matches) ? entry.matches.map(String) : []
    };
}

async function getScriptCache() {
    const stored = await chrome.storage.local.get(SCRIPT_CACHE_KEY);
    return stored[SCRIPT_CACHE_KEY] || {};
}

async function saveScriptVersion(scriptId, versionData, historyLimit) {
    const cache = await getScriptCache();
    const history = Array.isArray(cache[scriptId]) ? cache[scriptId] : [];
    const nextHistory = [versionData, ...history]
        .filter((item, index, array) => array.findIndex((candidate) => candidate.code === item.code) === index)
        .slice(0, historyLimit);

    cache[scriptId] = nextHistory;
    await chrome.storage.local.set({ [SCRIPT_CACHE_KEY]: cache });
}

async function getLatestCachedVersion(scriptId) {
    const cache = await getScriptCache();
    const history = cache[scriptId];
    return Array.isArray(history) && history.length > 0 ? history[0] : null;
}

async function ensureUserScriptsAvailable() {
    if (!chrome.userScripts?.execute) {
        throw new Error('拡張機能の詳細画面で「ユーザースクリプトを許可」を有効にしてください。');
    }
}

async function executeCode(tabId, code) {
    await ensureUserScriptsAvailable();
    await chrome.userScripts.execute({
        target: { tabId, allFrames: false },
        js: [{ code }],
        world: 'USER_SCRIPT'
    });
}

async function runScript(tabId, entry, config) {
    try {
        const code = await fetchText(entry.sourceUrl, config.requestTimeoutMs);
        await executeCode(tabId, code);
        await saveScriptVersion(entry.id, {
            code,
            fetchedAt: nowIso(),
            sourceUrl: entry.sourceUrl
        }, config.cacheHistoryLimit);

        return { id: entry.id, name: entry.name, ok: true, source: 'GitHub最新版' };
    } catch (error) {
        const cached = await getLatestCachedVersion(entry.id);
        if (!cached?.code) {
            return { id: entry.id, name: entry.name, ok: false, source: 'なし', error: error.message };
        }

        try {
            await executeCode(tabId, cached.code);
            return { id: entry.id, name: entry.name, ok: true, source: '前回正常版', warning: error.message };
        } catch (cachedError) {
            return { id: entry.id, name: entry.name, ok: false, source: '実行失敗', error: cachedError.message };
        }
    }
}

async function handlePage(tabId, url) {
    const { config, source: configSource } = await loadConfig();

    if (config.emergencyStop) {
        await saveStatus({
            ok: true,
            state: 'stopped',
            configSource,
            url,
            message: '緊急停止中のため実行しませんでした。',
            results: []
        });
        return;
    }

    const targets = config.scripts
        .map(validateScriptEntry)
        .filter(Boolean)
        .filter((entry) => urlMatches(url, entry.matches));

    const results = [];
    for (const entry of targets) {
        results.push(await runScript(tabId, entry, config));
    }

    await saveStatus({
        ok: results.every((result) => result.ok),
        state: targets.length === 0 ? 'no-match' : 'completed',
        configSource,
        url,
        message: targets.length === 0 ? '対象スクリプトはありません。' : `${targets.length}件を処理しました。`,
        results
    });
}

chrome.webNavigation.onCommitted.addListener((details) => {
    if (details.frameId !== 0 || !/^https?:\/\//i.test(details.url)) {
        return;
    }

    handlePage(details.tabId, details.url).catch(async (error) => {
        await saveStatus({
            ok: false,
            state: 'error',
            url: details.url,
            message: error.message,
            results: []
        });
    });
});

chrome.runtime.onInstalled.addListener(() => {
    saveStatus({
        ok: true,
        state: 'installed',
        message: '本番ローダー基盤を初期化しました。',
        results: []
    });
});
