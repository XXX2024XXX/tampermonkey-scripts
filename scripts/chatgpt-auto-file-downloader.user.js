// ==UserScript==
// @name         ChatGPT 作成ファイル自動ダウンロード
// @namespace    https://github.com/XXX2024XXX/tampermonkey-scripts
// @version      1.0.11
// @description  ChatGPTが新しく作成したダウンロード可能なファイルだけを検知し、ファイル名と種類を1行表示して自動で1回だけダウンロードします。
// @author       XXX2024XXX
// @match        https://chatgpt.com/*
// @match        https://chat.openai.com/*
// @updateURL    https://raw.githubusercontent.com/XXX2024XXX/tampermonkey-scripts/main/scripts/chatgpt-auto-file-downloader.user.js
// @downloadURL  https://raw.githubusercontent.com/XXX2024XXX/tampermonkey-scripts/main/scripts/chatgpt-auto-file-downloader.user.js
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    const DOWNLOAD_DELAY_MS = 900;
    const FILE_EXTENSION_PATTERN = /\.(?:zip|7z|rar|pdf|docx?|xlsx?|xlsm|pptx?|csv|tsv|txt|md|json|xml|ya?ml|js|mjs|cjs|ts|tsx|jsx|html?|css|py|java|c|cpp|h|hpp|cs|go|rs|php|rb|sh|bat|cmd|ps1|ahk|user\.js|png|jpe?g|webp|gif|svg|mp3|wav|m4a|mp4|webm)(?:[?#]|$)/i;
    const EXACT_FILE_URL_PATTERN = /(?:sandbox:\/\/mnt\/data\/|\/mnt\/data\/|\/backend-api\/files\/|files\.oaiusercontent\.com\/)/i;

    const knownFiles = new Set();
    const queuedFiles = new Set();
    let downloadQueue = Promise.resolve();

    function normalize(value) {
        return String(value || '').replace(/\s+/g, ' ').trim();
    }

    function isAssistantOutput(element) {
        return Boolean(element.closest(
            '[data-message-author-role="assistant"], article[data-testid^="conversation-turn-"], [data-testid="conversation-turn"]'
        ));
    }

    function isExcluded(element) {
        return Boolean(element.closest(
            'nav, aside, header, form, textarea, [contenteditable="true"], [data-testid="composer"], #cgpt-auto-file-popup'
        ));
    }

    function getHref(element) {
        return normalize(element.getAttribute('href') || element.href || '');
    }

    function decodeFileName(value) {
        try {
            return decodeURIComponent(value);
        } catch (_) {
            return value;
        }
    }

    function getDownloadName(element) {
        const downloadName = normalize(element.getAttribute('download') || '');
        if (downloadName) return decodeFileName(downloadName);

        const text = normalize(element.textContent || '');
        const textMatch = text.match(/[^\\/:*?"<>|]+\.(?:zip|7z|rar|pdf|docx?|xlsx?|xlsm|pptx?|csv|tsv|txt|md|json|xml|ya?ml|js|mjs|cjs|ts|tsx|jsx|html?|css|py|java|c|cpp|h|hpp|cs|go|rs|php|rb|sh|bat|cmd|ps1|ahk|user\.js|png|jpe?g|webp|gif|svg|mp3|wav|m4a|mp4|webm)/i);
        if (textMatch) return decodeFileName(textMatch[0]);

        const href = getHref(element);
        const cleanHref = href.split('#')[0].split('?')[0];
        const hrefName = cleanHref.substring(cleanHref.lastIndexOf('/') + 1);
        if (hrefName && FILE_EXTENSION_PATTERN.test(hrefName)) return decodeFileName(hrefName);

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

    function isRealGeneratedFileLink(element) {
        if (!(element instanceof HTMLAnchorElement)) return false;
        if (!isAssistantOutput(element) || isExcluded(element)) return false;

        const href = getHref(element);
        const downloadName = normalize(element.getAttribute('download') || '');
        const text = normalize(element.textContent || '');

        if (!href || href.startsWith('javascript:')) return false;

        const exactChatGptFileUrl = EXACT_FILE_URL_PATTERN.test(href);
        const explicitDownloadFile = Boolean(downloadName) && FILE_EXTENSION_PATTERN.test(downloadName);
        const sandboxTextLink = /sandbox:\/\/mnt\/data\//i.test(element.getAttribute('href') || '');
        const generatedFileWithExtension = exactChatGptFileUrl && FILE_EXTENSION_PATTERN.test(`${href} ${text} ${downloadName}`);

        return exactChatGptFileUrl || explicitDownloadFile || sandboxTextLink || generatedFileWithExtension;
    }

    function getFileKey(element) {
        return `${getHref(element)}|${normalize(element.getAttribute('download') || '')}|${normalize(element.textContent || '')}`;
    }

    function collectFileLinks(root = document) {
        const links = [];

        if (root instanceof HTMLAnchorElement && isRealGeneratedFileLink(root)) {
            links.push(root);
        }

        if (root.querySelectorAll) {
            for (const link of root.querySelectorAll('a[href], a[download]')) {
                if (isRealGeneratedFileLink(link)) links.push(link);
            }
        }

        return Array.from(new Set(links));
    }

    function showDetectedPopup(displayName) {
        document.getElementById('cgpt-auto-file-popup')?.remove();

        const popup = document.createElement('div');
        popup.id = 'cgpt-auto-file-popup';
        popup.textContent = `${displayName} を検知しました`;
        popup.style.cssText = [
            'position:fixed',
            'left:50%',
            'top:50%',
            'transform:translate(-50%,-50%)',
            'z-index:2147483647',
            'max-width:calc(100vw - 40px)',
            'padding:18px 24px',
            'border-radius:12px',
            'background:#fff',
            'color:#111',
            'font:800 20px/1.5 system-ui,sans-serif',
            'text-align:center',
            'word-break:break-all',
            'box-shadow:0 14px 45px rgba(0,0,0,.38)'
        ].join(';');

        document.body.append(popup);
        setTimeout(() => popup.remove(), 3000);
    }

    function clickFileLink(link) {
        return new Promise((resolve) => {
            setTimeout(() => {
                const key = getFileKey(link);

                if (!document.contains(link) || knownFiles.has(key)) {
                    queuedFiles.delete(key);
                    resolve();
                    return;
                }

                try {
                    knownFiles.add(key);
                    queuedFiles.delete(key);

                    const fileName = getDownloadName(link).slice(0, 180);
                    const displayName = formatDetectedName(fileName);
                    showDetectedPopup(displayName);

                    link.dispatchEvent(new MouseEvent('mousedown', {
                        bubbles: true,
                        cancelable: true,
                        view: window
                    }));
                    link.dispatchEvent(new MouseEvent('mouseup', {
                        bubbles: true,
                        cancelable: true,
                        view: window
                    }));
                    link.click();
                } catch (error) {
                    knownFiles.delete(key);
                    queuedFiles.delete(key);
                    console.error('[ChatGPT Auto File Downloader]', error);
                }

                resolve();
            }, DOWNLOAD_DELAY_MS);
        });
    }

    function queueNewFile(link) {
        const key = getFileKey(link);
        if (!key || knownFiles.has(key) || queuedFiles.has(key)) return;

        queuedFiles.add(key);
        downloadQueue = downloadQueue.then(() => clickFileLink(link));
    }

    function registerExistingFiles() {
        for (const link of collectFileLinks(document)) {
            knownFiles.add(getFileKey(link));
        }
    }

    const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
            for (const node of mutation.addedNodes) {
                if (!(node instanceof Element)) continue;
                for (const link of collectFileLinks(node)) {
                    queueNewFile(link);
                }
            }

            if (mutation.type === 'attributes' && mutation.target instanceof HTMLAnchorElement) {
                if (isRealGeneratedFileLink(mutation.target)) {
                    queueNewFile(mutation.target);
                }
            }
        }
    });

    registerExistingFiles();

    observer.observe(document.documentElement, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['href', 'download']
    });
})();
