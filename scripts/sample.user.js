// ==UserScript==
// @name         Sample Userscript
// @namespace    https://github.com/XXX2024XXX/tampermonkey-scripts
// @version      1.2
// @description  Tampermonkey自動更新確認用のサンプルスクリプト
// @match        https://example.com/*
// @grant        none
// @updateURL    https://raw.githubusercontent.com/XXX2024XXX/tampermonkey-scripts/main/scripts/sample.user.js
// @downloadURL  https://raw.githubusercontent.com/XXX2024XXX/tampermonkey-scripts/main/scripts/sample.user.js
// ==/UserScript==

(() => {
    'use strict';

    const version = typeof GM_info !== 'undefined' && GM_info.script
        ? GM_info.script.version
        : '不明';

    const notice = document.createElement('div');
    notice.textContent = `Tampermonkey 自動更新テスト：バージョン ${version}`;
    notice.style.cssText = [
        'position:fixed',
        'top:16px',
        'right:16px',
        'z-index:2147483647',
        'padding:12px 16px',
        'background:#ffffff',
        'border:2px solid #222222',
        'border-radius:8px',
        'box-shadow:0 4px 16px rgba(0,0,0,.25)',
        'font-size:16px',
        'font-family:sans-serif',
        'color:#111111'
    ].join(';');

    document.documentElement.appendChild(notice);
    console.log(`[Sample Userscript] version ${version}`);
})();
