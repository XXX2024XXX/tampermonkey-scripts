// ==UserScript==
// @name         ChatGPT 作成ファイル自動ダウンロード
// @namespace    https://github.com/XXX2024XXX/tampermonkey-scripts
// @version      1.0.5
// @description  ChatGPTが新しく作成したダウンロード可能なファイルだけを検知し、自動で1回だけダウンロードします。
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

    const VERSION = '1.0.5';
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
            'nav, aside, header, form, textarea, [contenteditable="true"], [data-testid="composer"], #cgpt-auto-file-status'
        ));
    }

    function getHref(element) {
        return normalize(element.getAttribute('href') || element.href || '');
    }

    function getDownloadName(element) {
        return normalize(
            element.getAttribute('download') ||
            element.textContent ||
            element.getAttribute('aria-label') ||
            'ChatGPT作成ファイル'
        );
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

    function showStatus(text, success = true) {
        let status = document.getElementById('cgpt-auto-file-status');
        if (!status) {
            status = document.createElement('div');
            status.id = 'cgpt-auto-file-status';
            status.style.cssText = [
                'position:fixed',
                'right:14px',
                'bottom:14px',
                'z-index:2147483647',
                'max-width:360px',
                'padding:10px 14px',
                'border-radius:10px',
                'color:#fff',
                'font:700 13px system-ui,sans-serif',
                'box-shadow:0 5px 18px rgba(0,0,0,.3)',
                'transition:opacity .2s ease'
            ].join(';');
            document.body.append(status);
        }

        status.textContent = `${text} v${VERSION}`;
        status.style.background = success ? '#107c41' : '#8b1e1e';
        status.style.opacity = '1';
        clearTimeout(status._hideTimer);
        status._hideTimer = setTimeout(() => {
            status.style.opacity = '0';
        }, 3500);
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

                    const fileName = getDownloadName(link).slice(0, 120);
                    showStatus(`自動ダウンロード：${fileName}`);

                    try {
                        GM_notification({
                            title: 'ChatGPT 自動ダウンロード',
                            text: `${fileName} を検知してダウンロードしました`,
                            timeout: 3000,
                            silent: true
                        });
                    } catch (_) {
                    }
                } catch (error) {
                    knownFiles.delete(key);
                    queuedFiles.delete(key);
                    showStatus('ダウンロードに失敗しました', false);
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
        showStatus('新しい作成ファイルを待機中');
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
