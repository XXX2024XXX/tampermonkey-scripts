// ==UserScript==
// @name         ページタイトル＋URLコピー（F8）
// @namespace    https://github.com/XXX2024XXX/tampermonkey-scripts
// @version      1.2
// @description  F8キーまたは画面ボタンで現在のページタイトルとURLをクリップボードへコピーし、結果を表示します。
// @loader-enabled true
// @match        http://*/*
// @match        https://*/*
// @grant        none
// @updateURL    https://raw.githubusercontent.com/XXX2024XXX/tampermonkey-scripts/main/scripts/page-title-url-copy.user.js
// @downloadURL  https://raw.githubusercontent.com/XXX2024XXX/tampermonkey-scripts/main/scripts/page-title-url-copy.user.js
// ==/UserScript==

(() => {
    'use strict';

    const ROOT_ID = 'page-title-url-copy-root';
    const NOTICE_ID = 'page-title-url-copy-notice';

    document.getElementById(ROOT_ID)?.remove();
    document.getElementById(NOTICE_ID)?.remove();

    function showNotice(message, isError = false) {
        document.getElementById(NOTICE_ID)?.remove();

        const notice = document.createElement('div');
        notice.id = NOTICE_ID;
        notice.textContent = message;
        notice.style.cssText = [
            'position:fixed',
            'top:72px',
            'right:16px',
            'z-index:2147483647',
            'max-width:min(420px,calc(100vw - 32px))',
            'padding:12px 16px',
            `border:2px solid ${isError ? '#b00020' : '#111'}`,
            'border-radius:10px',
            'background:#fff',
            `color:${isError ? '#b00020' : '#111'}`,
            'font:700 15px/1.5 sans-serif',
            'box-shadow:0 4px 16px rgba(0,0,0,.25)',
            'word-break:break-word'
        ].join(';');

        (document.body || document.documentElement).appendChild(notice);
        window.setTimeout(() => notice.remove(), 2500);
    }

    async function copyCurrentPage() {
        const title = document.title.trim() || 'タイトルなし';
        const text = `${title}\n${location.href}`;

        try {
            await navigator.clipboard.writeText(text);
            showNotice('コピー成功：ページタイトル＋URL');
            return;
        } catch {
        }

        try {
            const textarea = document.createElement('textarea');
            textarea.value = text;
            textarea.setAttribute('readonly', '');
            textarea.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0';
            (document.body || document.documentElement).appendChild(textarea);
            textarea.focus();
            textarea.select();
            textarea.setSelectionRange(0, textarea.value.length);

            const copied = document.execCommand('copy');
            textarea.remove();

            if (copied) {
                showNotice('コピー成功：ページタイトル＋URL');
                return;
            }
        } catch {
        }

        showNotice('コピーできませんでした', true);
    }

    function createReadyButton() {
        const button = document.createElement('button');
        button.id = ROOT_ID;
        button.type = 'button';
        button.textContent = 'F8準備OK・クリックでもコピー';
        button.style.cssText = [
            'position:fixed',
            'right:16px',
            'bottom:16px',
            'z-index:2147483647',
            'padding:9px 13px',
            'border:2px solid #006400',
            'border-radius:9px',
            'background:#fff',
            'color:#006400',
            'font:700 13px sans-serif',
            'box-shadow:0 4px 14px rgba(0,0,0,.2)',
            'cursor:pointer'
        ].join(';');
        button.addEventListener('click', copyCurrentPage);
        (document.body || document.documentElement).appendChild(button);
    }

    function handleF8(event) {
        const isF8 = event.key === 'F8' || event.code === 'F8' || event.keyCode === 119;
        if (!isF8 || event.repeat) {
            return;
        }

        event.preventDefault();
        event.stopPropagation();
        copyCurrentPage();
    }

    window.addEventListener('keydown', handleF8, true);
    document.addEventListener('keydown', handleF8, true);

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', createReadyButton, { once: true });
    } else {
        createReadyButton();
    }
})();
