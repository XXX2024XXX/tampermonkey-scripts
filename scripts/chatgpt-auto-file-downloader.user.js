// ==UserScript==
// @name         ChatGPT 作成ファイル検知テスト
// @namespace    https://github.com/XXX2024XXX/tampermonkey-scripts
// @version      1.0.3
// @description  ChatGPTの回答に表示されたダウンロード可能なファイルを検知し、OKポップアップで通知します。
// @author       XXX2024XXX
// @match        https://chatgpt.com/*
// @match        https://chat.openai.com/*
// @updateURL    https://raw.githubusercontent.com/XXX2024XXX/tampermonkey-scripts/main/scripts/chatgpt-auto-file-downloader.user.js
// @downloadURL  https://raw.githubusercontent.com/XXX2024XXX/tampermonkey-scripts/main/scripts/chatgpt-auto-file-downloader.user.js
// @run-at       document-idle
// @grant        GM_notification
// ==/UserScript==

(function () {
    'use strict';

    const VERSION = '1.0.2';
    const SCAN_DELAY_MS = 500;
    const detected = new Set();
    let scanTimer = null;

    const FILE_EXTENSIONS = /\.(?:zip|7z|rar|pdf|docx?|xlsx?|pptx?|csv|tsv|txt|md|json|xml|ya?ml|js|mjs|cjs|ts|tsx|jsx|html?|css|py|java|c|cpp|h|hpp|cs|go|rs|php|rb|sh|bat|cmd|ps1|ahk|user\.js|png|jpe?g|webp|gif|svg|mp3|wav|m4a|mp4|webm)(?:[?#]|$)/i;

    function getCandidateText(element) {
        return [
            element.getAttribute?.('href') || '',
            element.href || '',
            element.getAttribute?.('download') || '',
            element.getAttribute?.('aria-label') || '',
            element.getAttribute?.('data-testid') || '',
            element.getAttribute?.('title') || '',
            element.textContent || ''
        ].join(' ').trim();
    }

    function isInsideAssistantResponse(element) {
        return Boolean(element.closest(
            '[data-message-author-role="assistant"], article[data-testid^="conversation-turn-"], [data-testid="conversation-turn"]'
        ));
    }

    function isFileCandidate(element) {
        if (!isInsideAssistantResponse(element)) return false;

        const text = getCandidateText(element);
        if (!text) return false;

        return Boolean(
            element.hasAttribute?.('download') ||
            FILE_EXTENSIONS.test(text) ||
            /sandbox:\/\/mnt\/data\//i.test(text) ||
            /\/mnt\/data\//i.test(text) ||
            /backend-api\/files/i.test(text) ||
            /files\.oaiusercontent\.com/i.test(text) ||
            /ダウンロード|download/i.test(text)
        );
    }

    function getCandidateKey(element) {
        const turn = element.closest('[data-message-author-role="assistant"], article[data-testid^="conversation-turn-"], [data-testid="conversation-turn"]');
        const turnText = turn?.getAttribute('data-testid') || '';
        return `${turnText}|${getCandidateText(element)}`;
    }

    function showDetectedPopup(element) {
        document.getElementById('cgpt-file-detected-popup')?.remove();

        const overlay = document.createElement('div');
        overlay.id = 'cgpt-file-detected-popup';
        overlay.style.cssText = [
            'position:fixed',
            'inset:0',
            'z-index:2147483647',
            'display:flex',
            'align-items:center',
            'justify-content:center',
            'background:rgba(0,0,0,.35)'
        ].join(';');

        const box = document.createElement('div');
        box.style.cssText = [
            'width:min(360px,calc(100vw - 40px))',
            'padding:22px',
            'border-radius:14px',
            'background:#fff',
            'color:#111',
            'font-family:system-ui,sans-serif',
            'text-align:center',
            'box-shadow:0 12px 40px rgba(0,0,0,.35)'
        ].join(';');

        const title = document.createElement('div');
        title.textContent = 'ファイルを検知しました';
        title.style.cssText = 'font-size:22px;font-weight:800;margin-bottom:10px';

        const detail = document.createElement('div');
        const rawName = (
            element.getAttribute?.('download') ||
            element.textContent ||
            element.getAttribute?.('aria-label') ||
            'ダウンロード可能なファイル'
        ).trim();
        detail.textContent = rawName.slice(0, 160);
        detail.style.cssText = 'font-size:14px;line-height:1.5;word-break:break-all;margin-bottom:18px';

        const okButton = document.createElement('button');
        okButton.type = 'button';
        okButton.textContent = 'OK';
        okButton.style.cssText = [
            'min-width:120px',
            'padding:10px 22px',
            'border:0',
            'border-radius:9px',
            'background:#10a37f',
            'color:#fff',
            'font-size:17px',
            'font-weight:800',
            'cursor:pointer'
        ].join(';');
        okButton.addEventListener('click', () => overlay.remove());

        box.append(title, detail, okButton);
        overlay.append(box);
        document.body.append(overlay);
        okButton.focus();

        try {
            GM_notification({
                title: 'ChatGPT ファイル検知',
                text: 'ダウンロード可能なファイルを検知しました',
                timeout: 3000,
                silent: true
            });
        } catch (_) {
        }
    }

    function scan() {
        const candidates = document.querySelectorAll(
            'a[href], a[download], button, [role="link"], [data-testid*="download"], [aria-label*="ダウンロード"], [aria-label*="download" i]'
        );

        for (const element of candidates) {
            if (!isFileCandidate(element)) continue;

            const key = getCandidateKey(element);
            if (detected.has(key)) continue;

            detected.add(key);
            showDetectedPopup(element);
            setIndicator('検知：OK', true);
            break;
        }
    }

    function scheduleScan() {
        clearTimeout(scanTimer);
        scanTimer = setTimeout(scan, SCAN_DELAY_MS);
    }

    function setIndicator(text, success = false) {
        const indicator = document.getElementById('cgpt-file-detector-indicator');
        if (!indicator) return;
        indicator.textContent = `${text} v${VERSION}`;
        indicator.style.background = success ? '#107c41' : '#555';
    }

    function createIndicator() {
        if (document.getElementById('cgpt-file-detector-indicator')) return;

        const indicator = document.createElement('button');
        indicator.id = 'cgpt-file-detector-indicator';
        indicator.type = 'button';
        indicator.textContent = `検知待機中 v${VERSION}`;
        indicator.title = '押すと画面を再検査します';
        indicator.style.cssText = [
            'position:fixed',
            'right:14px',
            'bottom:14px',
            'z-index:2147483646',
            'border:1px solid rgba(255,255,255,.25)',
            'border-radius:10px',
            'padding:9px 12px',
            'font-size:13px',
            'font-weight:700',
            'cursor:pointer',
            'box-shadow:0 4px 14px rgba(0,0,0,.3)',
            'color:#fff',
            'background:#555'
        ].join(';');
        indicator.addEventListener('click', () => {
            detected.clear();
            setIndicator('再検査中');
            scan();
        });

        document.body.append(indicator);
    }

    const observer = new MutationObserver(() => {
        createIndicator();
        scheduleScan();
    });

    createIndicator();
    observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true });
    scheduleScan();
    setInterval(scan, 2000);
})();
