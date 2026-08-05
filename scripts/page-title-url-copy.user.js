// ==UserScript==
// @name         ページタイトル＋URLコピー（F8）
// @namespace    https://github.com/XXX2024XXX/tampermonkey-scripts
// @version      1.0
// @description  F8キーで現在のページタイトルとURLをクリップボードへコピーし、画面右上へ結果を表示します。
// @loader-enabled true
// @match        http://*/*
// @match        https://*/*
// @grant        none
// @updateURL    https://raw.githubusercontent.com/XXX2024XXX/tampermonkey-scripts/main/scripts/page-title-url-copy.user.js
// @downloadURL  https://raw.githubusercontent.com/XXX2024XXX/tampermonkey-scripts/main/scripts/page-title-url-copy.user.js
// ==/UserScript==

(() => {
    'use strict';

    const NOTICE_ID = 'page-title-url-copy-notice';

    function showNotice(message, isError = false) {
        document.getElementById(NOTICE_ID)?.remove();

        const notice = document.createElement('div');
        notice.id = NOTICE_ID;
        notice.textContent = message;
        notice.style.cssText = [
            'position:fixed',
            'top:16px',
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
            showNotice('F8：ページタイトルとURLをコピーしました');
        } catch {
            const textarea = document.createElement('textarea');
            textarea.value = text;
            textarea.style.position = 'fixed';
            textarea.style.left = '-9999px';
            textarea.style.top = '0';
            document.body.appendChild(textarea);
            textarea.focus();
            textarea.select();

            const copied = document.execCommand('copy');
            textarea.remove();

            if (copied) {
                showNotice('F8：ページタイトルとURLをコピーしました');
                return;
            }

            showNotice('コピーできませんでした', true);
        }
    }

    window.addEventListener('keydown', (event) => {
        if (event.key !== 'F8' || event.repeat) {
            return;
        }

        event.preventDefault();
        copyCurrentPage();
    }, true);
})();
