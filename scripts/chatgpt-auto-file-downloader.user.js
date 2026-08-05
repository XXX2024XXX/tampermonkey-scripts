// ==UserScript==
// @name         ChatGPT 作成ファイル自動ダウンロード
// @namespace    https://github.com/XXX2024XXX/tampermonkey-scripts
// @version      1.0.13
// @description  ChatGPTが新しく作成したファイルを回答ごとに1回だけ処理し、ダウンロード完了後にファイル名と種類を通知します。
// @author       XXX2024XXX
// @match        https://chatgpt.com/*
// @match        https://chat.openai.com/*
// @updateURL    https://raw.githubusercontent.com/XXX2024XXX/tampermonkey-scripts/main/scripts/chatgpt-auto-file-downloader.user.js
// @downloadURL  https://raw.githubusercontent.com/XXX2024XXX/tampermonkey-scripts/main/scripts/chatgpt-auto-file-downloader.user.js
// @run-at       document-idle
// @grant        GM_download
// @grant        GM_notification
// @connect      chatgpt.com
// @connect      chat.openai.com
// @connect      files.oaiusercontent.com
// ==/UserScript==

(function () {
    'use strict';

    const VERSION = '1.0.12';
    const RESPONSE_SETTLE_MS = 1400;
    const DOWNLOAD_TIMEOUT_MS = 120000;
    const POPUP_DURATION_MS = 4500;
    const FILE_EXTENSION_PATTERN = /\.(?:zip|7z|rar|pdf|docx?|xlsx?|xlsm|pptx?|csv|tsv|txt|md|json|xml|ya?ml|js|mjs|cjs|ts|tsx|jsx|html?|css|py|java|c|cpp|h|hpp|cs|go|rs|php|rb|sh|bat|cmd|ps1|ahk|user\.js|png|jpe?g|webp|gif|svg|mp3|wav|m4a|mp4|webm)(?:[?#]|$)/i;
    const FILE_NAME_PATTERN = /[^\\/:*?"<>|]+\.(?:zip|7z|rar|pdf|docx?|xlsx?|xlsm|pptx?|csv|tsv|txt|md|json|xml|ya?ml|js|mjs|cjs|ts|tsx|jsx|html?|css|py|java|c|cpp|h|hpp|cs|go|rs|php|rb|sh|bat|cmd|ps1|ahk|user\.js|png|jpe?g|webp|gif|svg|mp3|wav|m4a|mp4|webm)/i;
    const EXACT_FILE_URL_PATTERN = /(?:\/mnt\/data\/|\/backend-api\/files\/|files\.oaiusercontent\.com\/)/i;

    const completedTurns = new Set();
    const processingTurns = new Set();
    const existingTurnFiles = new Map();
    const settleTimers = new Map();
    let fallbackTurnCounter = 0;

    function normalize(value) {
        return String(value || '').replace(/\s+/g, ' ').trim();
    }

    function decodeFileName(value) {
        try {
            return decodeURIComponent(value);
        } catch (_) {
            return value;
        }
    }

    function getAssistantTurn(element) {
        return element.closest('[data-message-author-role="assistant"], article[data-testid^="conversation-turn-"], [data-testid="conversation-turn"]');
    }

    function isAssistantTurn(turn) {
        if (!turn) return false;
        if (turn.matches('[data-message-author-role="assistant"]')) return true;
        return Boolean(turn.querySelector('[data-message-author-role="assistant"]'));
    }

    function isExcluded(element) {
        return Boolean(element.closest('nav, aside, header, form, textarea, [contenteditable="true"], [data-testid="composer"], #cgpt-auto-file-popup'));
    }

    function getTurnKey(turn) {
        if (!turn.dataset.cgptDownloadTurnKey) {
            const testId = normalize(turn.getAttribute('data-testid') || '');
            const messageId = normalize(turn.getAttribute('data-message-id') || turn.id || '');
            fallbackTurnCounter += 1;
            turn.dataset.cgptDownloadTurnKey = messageId || testId || `assistant-turn-${fallbackTurnCounter}`;
        }
        return turn.dataset.cgptDownloadTurnKey;
    }

    function getHref(link) {
        const rawHref = normalize(link.getAttribute('href') || '');
        if (!rawHref || rawHref.startsWith('javascript:')) return '';

        try {
            return new URL(rawHref, location.href).href;
        } catch (_) {
            return normalize(link.href || rawHref);
        }
    }

    function getDownloadName(link) {
        const downloadName = normalize(link.getAttribute('download') || '');
        if (downloadName) return decodeFileName(downloadName);

        const text = normalize(link.textContent || '');
        const textMatch = text.match(FILE_NAME_PATTERN);
        if (textMatch) return decodeFileName(textMatch[0]);

        const href = getHref(link);
        try {
            const url = new URL(href);
            const pathName = decodeFileName(url.pathname.split('/').pop() || '');
            if (FILE_EXTENSION_PATTERN.test(pathName)) return pathName;
        } catch (_) {
        }

        return 'ChatGPT作成ファイル';
    }

    function formatDetectedName(fileName) {
        const cleanName = normalize(fileName);
        const match = cleanName.match(/^(.*?)(?:\.([a-z0-9]+))$/i);
        if (!match) return cleanName;

        const baseName = normalize(match[1]) || 'ファイル';
        const extension = match[2].toUpperCase();
        return `${baseName} ${extension}`;
    }

    function isGeneratedFileLink(link) {
        if (!(link instanceof HTMLAnchorElement)) return false;
        if (isExcluded(link)) return false;

        const turn = getAssistantTurn(link);
        if (!isAssistantTurn(turn)) return false;

        const href = getHref(link);
        const downloadName = normalize(link.getAttribute('download') || '');
        const text = normalize(link.textContent || '');

        if (!href) return false;

        const exactFileUrl = EXACT_FILE_URL_PATTERN.test(href);
        const explicitDownload = Boolean(downloadName) && FILE_EXTENSION_PATTERN.test(downloadName);
        const namedFile = FILE_EXTENSION_PATTERN.test(`${href} ${text} ${downloadName}`);

        return explicitDownload || (exactFileUrl && namedFile);
    }

    function collectTurnLinks(turn) {
        const unique = new Map();

        for (const link of turn.querySelectorAll('a[href], a[download]')) {
            if (!isGeneratedFileLink(link)) continue;
            const href = getHref(link);
            const fileName = getDownloadName(link);
            unique.set(`${href}|${fileName}`, { link, href, fileName });
        }

        return Array.from(unique.values());
    }

    function showDetectedPopup(displayNames) {
        document.getElementById('cgpt-auto-file-popup')?.remove();

        const popup = document.createElement('div');
        popup.id = 'cgpt-auto-file-popup';
        popup.style.cssText = [
            'position:fixed',
            'left:50%',
            'top:50%',
            'transform:translate(-50%,-50%)',
            'z-index:2147483647',
            'width:min(620px,calc(100vw - 40px))',
            'padding:22px 26px',
            'border-radius:14px',
            'background:#fff',
            'color:#111',
            'font:800 19px/1.6 system-ui,sans-serif',
            'text-align:center',
            'white-space:pre-wrap',
            'word-break:break-all',
            'box-shadow:0 14px 45px rgba(0,0,0,.38)'
        ].join(';');
        popup.textContent = `${displayNames.join('、')} を検知しました`;

        document.body.append(popup);
        setTimeout(() => popup.remove(), POPUP_DURATION_MS);

        try {
            GM_notification({
                title: 'ChatGPT ダウンロード完了',
                text: `${displayNames.join('、')} を検知しました`,
                timeout: POPUP_DURATION_MS,
                silent: true
            });
        } catch (_) {
        }
    }

    function downloadFile(file) {
        return new Promise((resolve, reject) => {
            let finished = false;
            const finish = (callback, value) => {
                if (finished) return;
                finished = true;
                clearTimeout(timeoutId);
                callback(value);
            };

            const timeoutId = setTimeout(() => {
                finish(reject, new Error(`ダウンロード完了を確認できませんでした: ${file.fileName}`));
            }, DOWNLOAD_TIMEOUT_MS);

            try {
                GM_download({
                    url: file.href,
                    name: file.fileName,
                    saveAs: false,
                    onload: () => finish(resolve, file.fileName),
                    onerror: (error) => finish(reject, new Error(error?.error || `ダウンロード失敗: ${file.fileName}`)),
                    ontimeout: () => finish(reject, new Error(`ダウンロード時間切れ: ${file.fileName}`))
                });
            } catch (error) {
                finish(reject, error);
            }
        });
    }

    async function processTurn(turn) {
        const turnKey = getTurnKey(turn);
        if (completedTurns.has(turnKey) || processingTurns.has(turnKey)) return;

        const files = collectTurnLinks(turn);
        if (!files.length) return;

        processingTurns.add(turnKey);

        try {
            const completedNames = [];

            for (const file of files) {
                const downloadedName = await downloadFile(file);
                completedNames.push(formatDetectedName(downloadedName));
            }

            completedTurns.add(turnKey);
            showDetectedPopup(completedNames);
        } catch (error) {
            console.error(`[ChatGPT Auto File Downloader v${VERSION}]`, error);
        } finally {
            processingTurns.delete(turnKey);
        }
    }

    function scheduleTurn(turn) {
        if (!isAssistantTurn(turn)) return;

        const turnKey = getTurnKey(turn);
        if (completedTurns.has(turnKey) || processingTurns.has(turnKey)) return;

        clearTimeout(settleTimers.get(turnKey));
        settleTimers.set(turnKey, setTimeout(() => {
            settleTimers.delete(turnKey);
            processTurn(turn);
        }, RESPONSE_SETTLE_MS));
    }

    function registerExistingFiles() {
        for (const turn of document.querySelectorAll('[data-message-author-role="assistant"], article[data-testid^="conversation-turn-"], [data-testid="conversation-turn"]')) {
            if (!isAssistantTurn(turn)) continue;
            const turnKey = getTurnKey(turn);
            const files = collectTurnLinks(turn);
            if (files.length) {
                existingTurnFiles.set(turnKey, files.map((file) => `${file.href}|${file.fileName}`));
                completedTurns.add(turnKey);
            }
        }
    }

    const observer = new MutationObserver((mutations) => {
        const affectedTurns = new Set();

        for (const mutation of mutations) {
            const targetElement = mutation.target instanceof Element ? mutation.target : mutation.target.parentElement;
            const targetTurn = targetElement ? getAssistantTurn(targetElement) : null;
            if (targetTurn) affectedTurns.add(targetTurn);

            for (const node of mutation.addedNodes) {
                if (!(node instanceof Element)) continue;

                const directTurn = node.matches('[data-message-author-role="assistant"], article[data-testid^="conversation-turn-"], [data-testid="conversation-turn"]') ? node : getAssistantTurn(node);
                if (directTurn) affectedTurns.add(directTurn);

                for (const nestedTurn of node.querySelectorAll?.('[data-message-author-role="assistant"], article[data-testid^="conversation-turn-"], [data-testid="conversation-turn"]') || []) {
                    affectedTurns.add(nestedTurn);
                }
            }
        }

        for (const turn of affectedTurns) {
            scheduleTurn(turn);
        }
    });

    registerExistingFiles();

    observer.observe(document.documentElement, {
        childList: true,
        subtree: true,
        characterData: true,
        attributes: true,
        attributeFilter: ['href', 'download']
    });
})();
