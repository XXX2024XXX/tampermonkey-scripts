// ==UserScript==
// @name         2
// @namespace    https://github.com/XXX2024XXX/tampermonkey-scripts
// @version      1.3
// @description  Tampermonkeyの1クリック更新を10回確認するテスト用スクリプト
// @author       XXX2024XXX
// @match        https://example.com/*
// @updateURL    https://raw.githubusercontent.com/XXX2024XXX/tampermonkey-scripts/main/scripts/update-test.user.js
// @downloadURL  https://raw.githubusercontent.com/XXX2024XXX/tampermonkey-scripts/main/scripts/update-test.user.js
// @grant        none
// ==/UserScript==

(() => {
    'use strict';

    const oldPanel = document.getElementById('tm-update-test-panel');
    if (oldPanel) oldPanel.remove();

    const panel = document.createElement('div');
    panel.id = 'tm-update-test-panel';
    panel.textContent = 'Tampermonkey更新テスト：2回目';
    Object.assign(panel.style, {
        position: 'fixed',
        top: '20px',
        right: '20px',
        zIndex: '2147483647',
        padding: '14px 18px',
        background: '#ffffff',
        color: '#111111',
        border: '2px solid #111111',
        borderRadius: '10px',
        fontSize: '18px',
        fontWeight: '700',
        boxShadow: '0 4px 14px rgba(0,0,0,0.25)'
    });

    document.body.appendChild(panel);
})();
