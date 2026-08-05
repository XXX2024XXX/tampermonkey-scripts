const STATUS_KEY = 'githubLoaderStatus';
const CONFIG_CACHE_KEY = 'githubLoaderConfigCache';

function setText(id, value) {
    document.getElementById(id).textContent = value ?? '-';
}

function formatDate(value) {
    if (!value) return '-';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleString('ja-JP');
}

async function render() {
    const stored = await chrome.storage.local.get([STATUS_KEY, CONFIG_CACHE_KEY]);
    const status = stored[STATUS_KEY] || {};
    const config = stored[CONFIG_CACHE_KEY] || {};
    const state = document.getElementById('state');

    state.textContent = status.ok === false ? 'エラー' : status.state === 'stopped' ? '停止中' : '正常';
    state.className = status.ok === false ? 'error' : status.state === 'stopped' ? 'stopped' : 'ok';

    setText('stop', config.emergencyStop === true ? 'ON' : 'OFF');
    setText('configSource', status.configSource || '-');
    setText('updatedAt', formatDate(status.updatedAt));
    setText('message', status.message || '-');

    const list = document.getElementById('results');
    list.replaceChildren();
    const results = Array.isArray(status.results) ? status.results : [];

    if (results.length === 0) {
        const item = document.createElement('li');
        item.textContent = '実行結果なし';
        list.appendChild(item);
        return;
    }

    for (const result of results) {
        const item = document.createElement('li');
        item.textContent = `${result.name || result.id}: ${result.ok ? '成功' : '失敗'}（${result.source || '-'}）`;
        item.className = result.ok ? 'ok' : 'error';
        list.appendChild(item);
    }
}

async function runNow() {
    const button = document.getElementById('runNow');
    button.disabled = true;
    button.textContent = '確認中…';

    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab?.id || !/^https?:\/\//i.test(tab.url || '')) {
            throw new Error('通常のWebページで実行してください。');
        }

        const response = await chrome.runtime.sendMessage({ type: 'RUN_NOW', tabId: tab.id, url: tab.url });
        if (!response?.ok) throw new Error(response?.error || '実行できませんでした。');
        await render();
    } catch (error) {
        setText('message', error.message);
        document.getElementById('state').textContent = 'エラー';
        document.getElementById('state').className = 'error';
    } finally {
        button.disabled = false;
        button.textContent = '今すぐ確認';
    }
}

document.getElementById('runNow').addEventListener('click', runNow);
render().catch((error) => setText('message', error.message));
