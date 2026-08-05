// ==UserScript==
// @name         F5 5回更新テスト
// @namespace    https://github.com/XXX2024XXX/tampermonkey-scripts
// @version      1.1
// @description  同じページでF5するたびに1から5まで増える数字を表示し、Tampermonkeyへの自動反映を確認します。
// @loader-enabled true
// @match        http://*/*
// @match        https://*/*
// @grant        none
// @updateURL    https://raw.githubusercontent.com/XXX2024XXX/tampermonkey-scripts/main/scripts/f5-five-step-test.user.js
// @downloadURL  https://raw.githubusercontent.com/XXX2024XXX/tampermonkey-scripts/main/scripts/f5-five-step-test.user.js
// ==/UserScript==

(() => {
    'use strict';

    const STORAGE_KEY = 'github_loader_f5_five_step_test_v1';
    const PANEL_ID = 'github-loader-f5-five-step-panel';
    const MAX_COUNT = 5;

    document.getElementById(PANEL_ID)?.remove();

    let count = Number.parseInt(localStorage.getItem(STORAGE_KEY) || '0', 10);
    if (!Number.isFinite(count) || count < 0) {
        count = 0;
    }

    count = Math.min(count + 1, MAX_COUNT);
    localStorage.setItem(STORAGE_KEY, String(count));

    const panel = document.createElement('div');
    panel.id = PANEL_ID;
    panel.style.cssText = [
        'position:fixed',
        'top:16px',
        'left:16px',
        'z-index:2147483647',
        'min-width:210px',
        'padding:14px',
        'border:3px solid #111',
        'border-radius:12px',
        'background:#fff',
        'color:#111',
        'font-family:Arial,sans-serif',
        'box-shadow:0 6px 22px rgba(0,0,0,.28)',
        'text-align:center'
    ].join(';');

    const title = document.createElement('div');
    title.textContent = 'F5 更新テスト v1.1';
    title.style.cssText = 'font-size:16px;font-weight:900;margin-bottom:6px';

    const number = document.createElement('div');
    number.textContent = String(count);
    number.style.cssText = 'font-size:52px;font-weight:900;line-height:1.1';

    const message = document.createElement('div');
    message.textContent = count >= MAX_COUNT
        ? '5回完了'
        : `次にF5すると ${count + 1}`;
    message.style.cssText = 'margin-top:6px;font-size:14px;font-weight:700';

    const resetButton = document.createElement('button');
    resetButton.type = 'button';
    resetButton.textContent = '0に戻す';
    resetButton.style.cssText = [
        'margin-top:10px',
        'padding:7px 14px',
        'border:2px solid #111',
        'border-radius:8px',
        'background:#fff',
        'color:#111',
        'font-size:13px',
        'font-weight:800',
        'cursor:pointer'
    ].join(';');

    resetButton.addEventListener('click', () => {
        localStorage.setItem(STORAGE_KEY, '0');
        number.textContent = '0';
        message.textContent = 'F5すると 1';
    });

    panel.append(title, number, message, resetButton);
    (document.body || document.documentElement).appendChild(panel);
})();
