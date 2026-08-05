// ==UserScript==
// @name         ChatGPT 作成ファイル検知テスト
// @namespace    https://github.com/XXX2024XXX/tampermonkey-scripts
// @version      1.0.4
// @description  ChatGPTの回答に表示されたダウンロード可能なファイルを複数の方法で検知し、OKポップアップで通知します。
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

    const VERSION = '1.0.4';
    const SCAN_DELAY_MS = 350;
    const PERIODIC_SCAN_MS = 1500;
    const detected = new Set();
    let scanTimer = null;

    const FILE_EXTENSIONS = /\.(?:zip|7z|rar|pdf|docx?|xlsx?|xlsm|pptx?|csv|tsv|txt|md|json|xml|ya?ml|js|mjs|cjs|ts|tsx|jsx|html?|css|py|java|c|cpp|h|hpp|cs|go|rs|php|rb|sh|bat|cmd|ps1|ahk|user\.js|png|jpe?g|webp|gif|svg|mp3|wav|m4a|mp4|webm)(?:[?#\s]|$)/i;
    const FILE_PATH_PATTERN = /(?:sandbox:\/\/mnt\/data\/|\/mnt\/data\/|backend-api\/files|files\.oaiusercontent\.com|\/files\/[^\s]+)/i;
    const DOWNLOAD_WORD_PATTERN = /(?:ダウンロード|download|添付ファイル|保存する)/i;

    function normalizeText(value) {
        return String(value || '').replace(/\s+/g, ' ').trim();
    }

    function getCandidateText(element) {
        const values = [
            element.getAttribute?.('href'),
            element.href,
            element.getAttribute?.('download'),
            element.getAttribute?.('aria-label'),
            element.getAttribute?.('data-testid'),
            element.getAttribute?.('title'),
            element.getAttribute?.('data-state'),
            element.textContent
        ];
        return normalizeText(values.filter(Boolean).join(' '));
    }

    function isExcludedArea(element) {
        return Boolean(element.closest(
            'nav, aside, header, form, textarea, [contenteditable="true"], [data-testid="composer"], #cgpt-file-detected-popup, #cgpt-file-detector-indicator'
        ));
    }

    function isVisible(element) {
        if (!(element instanceof Element)) return false;
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
    }

    function hasFileSignal(element) {
        const text = getCandidateText(element);
        if (!text) return false;

        return Boolean(
            element.hasAttribute?.('download') ||
            FILE_EXTENSIONS.test(text) ||
            FILE_PATH_PATTERN.test(text) ||
            DOWNLOAD_WORD_PATTERN.test(text)
        );
    }

    function isFileCandidate(element) {
        if (!(element instanceof Element)) return false;
        if (isExcludedArea(element)) return false;
        if (!isVisible(element)) return false;
        if (!hasFileSignal(element)) return false;

        const tag = element.tagName;
        const role = element.getAttribute('role');
        const clickable = tag === 'A' || tag === 'BUTTON' || role === 'link' || role === 'button' || element.hasAttribute('download');

        if (clickable) return true;

        const childClickable = element.querySelector?.('a[href],a[download],button,[role="link"],[role="button"]');
        return Boolean(childClickable);
    }

    function getBestClickable(element) {
        if (element.matches('a[href],a[download],button,[role="link"],[role="button"]')) return element;
        return element.querySelector('a[href],a[download],button,[role="link"],[role="button"]') || element;
    }

    function getCandidateKey(element) {
        const clickable = getBestClickable(element);
        const href = normalizeText(clickable.getAttribute?.('href') || clickable.href || '');
        const download = normalizeText(clickable.getAttribute?.('download') || '');
        const text = normalizeText(clickable.textContent || element.textContent || '');
        return `${href}|${download}|${text.slice(0, 240)}`;
    }

    function getDisplayName(element) {
        const clickable = getBestClickable(element);
        return normalizeText(
            clickable.getAttribute?.('download') ||
            clickable.textContent ||
            clickable.getAttribute?.('aria-label') ||
            element.textContent ||
            'ダウンロード可能なファイル'
        ).slice(0, 180);
    }

    function showDetectedPopup(element) {
        document.getElementById('cgpt-file-detected-popup')?.remove();

        const overlay = document.createElement('div');
        overlay.id = 'cgpt-file-detected-popup';
        overlay.style.cssText = 'position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.38)';

        const box = document.createElement('div');
        box.style.cssText = 'width:min(390px,calc(100vw - 36px));padding:24px;border-radius:14px;background:#fff;color:#111;font-family:system-ui,sans-serif;text-align:center;box-shadow:0 12px 40px rgba(0,0,0,.38)';

        const title = document.createElement('div');
        title.textContent = 'ファイルを検知しました';
        title.style.cssText = 'font-size:22px;font-weight:800;margin-bottom:10px';

        const detail = document.createElement('div');
        detail.textContent = getDisplayName(element);
        detail.style.cssText = 'font-size:14px;line-height:1.55;word-break:break-all;margin-bottom:18px';

        const okButton = document.createElement('button');
        okButton.type = 'button';
        okButton.textContent = 'OK';
        okButton.style.cssText = 'min-width:130px;padding:11px 24px;border:0;border-radius:9px;background:#10a37f;color:#fff;font-size:17px;font-weight:800;cursor:pointer';
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

    function collectCandidates() {
        const selector = [
            'a[href]',
            'a[download]',
            'button',
            '[role="link"]',
            '[role="button"]',
            '[data-testid*="download" i]',
            '[aria-label*="ダウンロード"]',
            '[aria-label*="download" i]',
            '[title*="ダウンロード"]',
            '[title*="download" i]'
        ].join(',');

        const direct = Array.from(document.querySelectorAll(selector));
        const textMatches = Array.from(document.querySelectorAll('main *')).filter((element) => {
            if (element.children.length > 4) return false;
            return hasFileSignal(element);
        });

        return Array.from(new Set([...direct, ...textMatches]));
    }

    function scan(force = false) {
        const candidates = collectCandidates();
        let found = false;

        for (const candidate of candidates) {
            if (!isFileCandidate(candidate)) continue;

            const key = getCandidateKey(candidate);
            if (!force && detected.has(key)) continue;

            detected.add(key);
            showDetectedPopup(candidate);
            setIndicator('検知：OK', true);
            found = true;
            break;
        }

        if (!found && force) {
            setIndicator('未検知', false);
            showMiniMessage('ファイルは見つかりませんでした');
        }
    }

    function scheduleScan() {
        clearTimeout(scanTimer);
        scanTimer = setTimeout(() => scan(false), SCAN_DELAY_MS);
    }

    function setIndicator(text, success = false) {
        const indicator = document.getElementById('cgpt-file-detector-indicator');
        if (!indicator) return;
        indicator.textContent = `${text} v${VERSION}`;
        indicator.style.background = success ? '#107c41' : '#555';
    }

    function showMiniMessage(text) {
        let message = document.getElementById('cgpt-file-detector-message');
        if (!message) {
            message = document.createElement('div');
            message.id = 'cgpt-file-detector-message';
            message.style.cssText = 'position:fixed;right:14px;bottom:58px;z-index:2147483646;padding:9px 12px;border-radius:8px;background:#222;color:#fff;font:13px system-ui,sans-serif;box-shadow:0 4px 14px rgba(0,0,0,.3)';
            document.body.append(message);
        }
        message.textContent = text;
        clearTimeout(message._timer);
        message._timer = setTimeout(() => message.remove(), 2500);
    }

    function createIndicator() {
        if (document.getElementById('cgpt-file-detector-indicator')) return;

        const indicator = document.createElement('button');
        indicator.id = 'cgpt-file-detector-indicator';
        indicator.type = 'button';
        indicator.textContent = `検知待機中 v${VERSION}`;
        indicator.title = '押すと現在の画面を強制的に再検査します';
        indicator.style.cssText = 'position:fixed;right:14px;bottom:14px;z-index:2147483646;border:1px solid rgba(255,255,255,.25);border-radius:10px;padding:9px 12px;font-size:13px;font-weight:700;cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,.3);color:#fff;background:#555';
        indicator.addEventListener('click', () => {
            setIndicator('再検査中');
            scan(true);
        });

        document.body.append(indicator);
    }

    const observer = new MutationObserver(() => {
        createIndicator();
        scheduleScan();
    });

    createIndicator();
    observer.observe(document.documentElement, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['href', 'download', 'aria-label', 'title', 'data-testid']
    });

    scheduleScan();
    setInterval(() => scan(false), PERIODIC_SCAN_MS);
})();
