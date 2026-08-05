// ==UserScript==
// @name         OK表示テスト
// @namespace    https://github.com/XXX2024XXX/tampermonkey-scripts
// @version      1.4
// @description  GitHub更新とTampermonkey自動更新の確認用に、画面右上へ更新テスト結果を表示します。
// @match        http://*/*
// @match        https://*/*
// @grant        none
// @updateURL    https://raw.githubusercontent.com/XXX2024XXX/tampermonkey-scripts/main/scripts/ok-test.user.js
// @downloadURL  https://raw.githubusercontent.com/XXX2024XXX/tampermonkey-scripts/main/scripts/ok-test.user.js
// ==/UserScript==

(() => {
    'use strict';

    const notice = document.createElement('div');
    notice.textContent = '更新テスト2：v1.4';
    notice.style.cssText = [
        'position:fixed',
        'top:16px',
        'right:16px',
        'z-index:2147483647',
        'padding:12px 18px',
        'border:2px solid #111',
        'border-radius:10px',
        'background:#fff',
        'color:#111',
        'font:700 24px sans-serif',
        'box-shadow:0 4px 16px rgba(0,0,0,.25)'
    ].join(';');

    (document.body || document.documentElement).appendChild(notice);
})();
