// ==UserScript==
// @name         ChatGPT 作成ファイル自動ダウンロード
// @namespace    https://github.com/XXX2024XXX/tampermonkey-scripts
// @version      1.0.0
// @description  ChatGPTの回答に新しく表示されたダウンロード可能なファイルを検知し、自動で1回だけダウンロードします。
// @author       XXX2024XXX
// @match        https://chatgpt.com/*
// @match        https://chat.openai.com/*
// @updateURL    https://raw.githubusercontent.com/XXX2024XXX/tampermonkey-scripts/main/scripts/chatgpt-auto-file-downloader.user.js
// @downloadURL  https://raw.githubusercontent.com/XXX2024XXX/tampermonkey-scripts/main/scripts/chatgpt-auto-file-downloader.user.js
// @run-at       document-idle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_notification
// ==/UserScript==

(function () {
    'use strict';

    const STORAGE_ENABLED = 'chatgptAutoFileDownloaderEnabled';
    const STORAGE_HISTORY = 'chatgptAutoFileDownloaderHistory';
    const MAX_HISTORY = 300;
    const SCAN_DELAY_MS = 1800;
    const CLICK_INTERVAL_MS = 1400;

    let enabled = GM_getValue(STORAGE_ENABLED, true);
    let scanTimer = null;
    let clickQueue = Promise.resolve();
    const processed = new Set(GM_getValue(STORAGE_HISTORY, []));

    const FILE_EXTENSIONS = /\.(?:zip|7z|rar|pdf|docx?|xlsx?|pptx?|csv|tsv|txt|md|json|xml|ya?ml|js|mjs|cjs|ts|tsx|jsx|html?|css|py|java|c|cpp|h|hpp|cs|go|rs|php|rb|sh|bat|cmd|ps1|ahk|user\.js|png|jpe?g|webp|gif|svg|mp3|wav|m4a|mp4|webm)(?:[?#]|$)/i;

    function saveHistory() {
        const history = Array.from(processed).slice(-MAX_HISTORY);
        GM_setValue(STORAGE_HISTORY, history);
    }

    function getLinkKey(link) {
        const href = link.href || link.getAttribute('href') || '';
        const text = (link.textContent || '').trim();
        const download = link.getAttribute('download') || '';
        return `${href}|${download}|${text}`;
    }

    function isAssistantArea(link) {
        return Boolean(link.closest('[data-message-author-role="assistant"], [data-testid="conversation-turn"]'));
    }

    function looksLikeFileLink(link) {
        const href = link.href || link.getAttribute('href') || '';
        const text = (link.textContent || '').trim();
        const aria = link.getAttribute('aria-label') || '';
        const download = link.getAttribute('download') || '';
        const combined = `${href} ${text} ${aria} ${download}`;

        if (!href || href.startsWith('javascript:')) return false;
        if (link.dataset.chatgptAutoDownloaded === '1') return false;
        if (!isAssistantArea(link)) return false;

        return Boolean(
            download ||
            FILE_EXTENSIONS.test(combined) ||
            /sandbox:\/\/mnt\/data\//i.test(href) ||
            /\/backend-api\/files\//i.test(href) ||
            /\/files\//i.test(href) && /download|sandbox|attachment/i.test(combined) ||
            /ダウンロード|download/i.test(`${text} ${aria}`) && !/^https?:\/\/(?:help\.|www\.)?openai\.com/i.test(href)
        );
    }

    function showStatus(message, isError = false) {
        const status = document.getElementById('cgpt-auto-download-status');
        if (!status) return;
        status.textContent = message;
        status.style.background = isError ? '#8b1e1e' : '#202123';
        status.style.opacity = '1';
        clearTimeout(status._hideTimer);
        status._hideTimer = setTimeout(() => {
            status.style.opacity = '0';
        }, 3000);
    }

    function performDownload(link) {
        return new Promise((resolve) => {
            const key = getLinkKey(link);
            if (!enabled || processed.has(key) || !document.contains(link)) {
                resolve();
                return;
            }

            try {
                processed.add(key);
                link.dataset.chatgptAutoDownloaded = '1';
                saveHistory();

                link.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));
                link.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }));
                link.click();

                const fileName = (link.getAttribute('download') || link.textContent || 'ファイル').trim();
                showStatus(`自動ダウンロード: ${fileName}`);
                GM_notification({
                    title: 'ChatGPT 自動ダウンロード',
                    text: `${fileName} をダウンロードしました`,
                    timeout: 2500,
                    silent: true
                });
            } catch (error) {
                processed.delete(key);
                saveHistory();
                showStatus('ダウンロードに失敗しました', true);
                console.error('[ChatGPT Auto File Downloader]', error);
            }

            setTimeout(resolve, CLICK_INTERVAL_MS);
        });
    }

    function scan() {
        if (!enabled) return;

        const links = Array.from(document.querySelectorAll('a[href]')).filter(looksLikeFileLink);
        for (const link of links) {
            const key = getLinkKey(link);
            if (processed.has(key)) continue;
            clickQueue = clickQueue.then(() => performDownload(link));
        }
    }

    function scheduleScan() {
        clearTimeout(scanTimer);
        scanTimer = setTimeout(scan, SCAN_DELAY_MS);
    }

    function createUi() {
        if (document.getElementById('cgpt-auto-download-toggle')) return;

        const button = document.createElement('button');
        button.id = 'cgpt-auto-download-toggle';
        button.type = 'button';
        button.style.cssText = [
            'position:fixed',
            'right:14px',
            'bottom:14px',
            'z-index:2147483647',
            'border:1px solid rgba(255,255,255,.25)',
            'border-radius:10px',
            'padding:9px 12px',
            'font-size:13px',
            'font-weight:700',
            'cursor:pointer',
            'box-shadow:0 4px 14px rgba(0,0,0,.3)',
            'color:#fff'
        ].join(';');

        const updateButton = () => {
            button.textContent = enabled ? '自動DL：ON' : '自動DL：OFF';
            button.style.background = enabled ? '#107c41' : '#666';
        };

        button.addEventListener('click', () => {
            enabled = !enabled;
            GM_setValue(STORAGE_ENABLED, enabled);
            updateButton();
            showStatus(enabled ? '自動ダウンロードを開始しました' : '自動ダウンロードを停止しました');
            if (enabled) scheduleScan();
        });

        const status = document.createElement('div');
        status.id = 'cgpt-auto-download-status';
        status.style.cssText = [
            'position:fixed',
            'right:14px',
            'bottom:58px',
            'z-index:2147483647',
            'max-width:320px',
            'padding:9px 12px',
            'border-radius:8px',
            'background:#202123',
            'color:#fff',
            'font-size:12px',
            'pointer-events:none',
            'opacity:0',
            'transition:opacity .2s ease',
            'box-shadow:0 4px 14px rgba(0,0,0,.3)'
        ].join(';');

        updateButton();
        document.body.append(status, button);
    }

    const observer = new MutationObserver(() => {
        createUi();
        scheduleScan();
    });

    createUi();
    observer.observe(document.documentElement, { childList: true, subtree: true });
    scheduleScan();
})();
