const SOURCE_URL = 'https://raw.githubusercontent.com/XXX2024XXX/tampermonkey-scripts/main/scripts/ok-test.user.js';
const CACHE_KEY = 'cachedUserScript';
const STATUS_KEY = 'loaderStatus';

function nowText() {
    return new Date().toLocaleString('ja-JP');
}

async function saveStatus(status) {
    await chrome.storage.local.set({
        [STATUS_KEY]: {
            ...status,
            updatedAt: nowText()
        }
    });
}

function extractUserScriptBody(source) {
    const marker = '// ==/UserScript==';
    const markerIndex = source.indexOf(marker);

    if (markerIndex === -1) {
        throw new Error('UserScriptヘッダーの終了位置が見つかりません。');
    }

    const body = source.slice(markerIndex + marker.length).trim();

    if (!body) {
        throw new Error('実行コードが空です。');
    }

    return body;
}

function extractVersion(source) {
    const match = source.match(/^[ \t]*\/\/[ \t]*@version[ \t]+(.+?)\s*$/m);
    return match ? match[1].trim() : '不明';
}

async function ensureUserScriptsAvailable() {
    if (!chrome.userScripts) {
        throw new Error('拡張機能の詳細画面で「ユーザースクリプトを許可」を有効にしてください。');
    }

    await chrome.userScripts.getScripts();
}

async function fetchLatestSource() {
    const response = await fetch(`${SOURCE_URL}?t=${Date.now()}`, {
        cache: 'no-store'
    });

    if (!response.ok) {
        throw new Error(`GitHub取得エラー: HTTP ${response.status}`);
    }

    const source = await response.text();
    return {
        code: extractUserScriptBody(source),
        version: extractVersion(source)
    };
}

async function executeCode(tabId, code) {
    await ensureUserScriptsAvailable();
    await chrome.userScripts.execute({
        target: {
            tabId,
            allFrames: false
        },
        js: [{ code }],
        world: 'USER_SCRIPT'
    });
}

async function loadAndExecute(tabId) {
    try {
        const latest = await fetchLatestSource();
        await executeCode(tabId, latest.code);
        await chrome.storage.local.set({ [CACHE_KEY]: latest });
        await saveStatus({
            ok: true,
            source: 'GitHub最新版',
            version: latest.version,
            message: '最新版を取得して実行しました。'
        });
    } catch (latestError) {
        const stored = await chrome.storage.local.get(CACHE_KEY);
        const cached = stored[CACHE_KEY];

        if (!cached?.code) {
            await saveStatus({
                ok: false,
                source: 'なし',
                version: '不明',
                message: latestError.message
            });
            return;
        }

        try {
            await executeCode(tabId, cached.code);
            await saveStatus({
                ok: true,
                source: '前回正常版',
                version: cached.version || '不明',
                message: `GitHub取得失敗のため前回版を実行しました。${latestError.message}`
            });
        } catch (cachedError) {
            await saveStatus({
                ok: false,
                source: '実行失敗',
                version: cached.version || '不明',
                message: cachedError.message
            });
        }
    }
}

chrome.webNavigation.onCommitted.addListener((details) => {
    if (details.frameId !== 0 || !/^https?:\/\//i.test(details.url)) {
        return;
    }

    loadAndExecute(details.tabId);
});

chrome.runtime.onInstalled.addListener(() => {
    saveStatus({
        ok: true,
        source: '待機中',
        version: '未取得',
        message: 'Webページを開くか再読み込みしてください。'
    });
});
