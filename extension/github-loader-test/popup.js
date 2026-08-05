const STATUS_KEY = 'loaderStatus';

async function showStatus() {
    const stored = await chrome.storage.local.get(STATUS_KEY);
    const status = stored[STATUS_KEY];
    const statusElement = document.getElementById('status');

    if (!status) {
        statusElement.textContent = '記録なし';
        statusElement.className = 'error';
        return;
    }

    statusElement.textContent = status.ok ? '正常' : 'エラー';
    statusElement.className = status.ok ? 'ok' : 'error';
    document.getElementById('source').textContent = status.source || '-';
    document.getElementById('version').textContent = status.version || '-';
    document.getElementById('updatedAt').textContent = status.updatedAt || '-';
    document.getElementById('message').textContent = status.message || '-';
}

showStatus().catch((error) => {
    const statusElement = document.getElementById('status');
    statusElement.textContent = '表示エラー';
    statusElement.className = 'error';
    document.getElementById('message').textContent = error.message;
});
