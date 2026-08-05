// ==UserScript==
// @name         Tampermonkey コピペ不要マネージャー
// @namespace    https://github.com/XXX2024XXX/tampermonkey-scripts
// @version      1.0
// @description  GitHubに追加された新しいユーザースクリプトを通知し、コードを貼り付けずにTampermonkeyのインストール画面を開きます。
// @author       You
// @match        http://*/*
// @match        https://*/*
// @run-at       document-idle
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @connect      raw.githubusercontent.com
// @updateURL    https://raw.githubusercontent.com/XXX2024XXX/tampermonkey-scripts/main/scripts/tampermonkey-copyless-manager.user.js
// @downloadURL  https://raw.githubusercontent.com/XXX2024XXX/tampermonkey-scripts/main/scripts/tampermonkey-copyless-manager.user.js
// ==/UserScript==

(() => {
    'use strict';

    const CATALOG_URL = 'https://raw.githubusercontent.com/XXX2024XXX/tampermonkey-scripts/main/tampermonkey-catalog.json';
    const CHECK_INTERVAL = 6 * 60 * 60 * 1000;
    const KEY_LAST_CHECK = 'tm_copyless_last_check';
    const KEY_KNOWN = 'tm_copyless_known_scripts';
    const PANEL_ID = 'tm-copyless-manager-panel';

    function requestJson(url) {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'GET',
                url: `${url}?t=${Date.now()}`,
                timeout: 15000,
                headers: { 'Cache-Control': 'no-cache' },
                onload: (response) => {
                    if (response.status < 200 || response.status >= 300) {
                        reject(new Error(`HTTP ${response.status}`));
                        return;
                    }
                    try {
                        resolve(JSON.parse(String(response.responseText || '').replace(/^\uFEFF/, '')));
                    } catch (error) {
                        reject(error);
                    }
                },
                onerror: () => reject(new Error('通信エラー')),
                ontimeout: () => reject(new Error('タイムアウト'))
            });
        });
    }

    function normalizeCatalog(value) {
        if (!value || !Array.isArray(value.scripts)) return [];
        return value.scripts.filter((item) =>
            item && typeof item.id === 'string' && typeof item.name === 'string' && typeof item.installUrl === 'string'
        );
    }

    function openInstall(url) {
        window.open(url, '_blank', 'noopener,noreferrer');
    }

    function closePanel() {
        document.getElementById(PANEL_ID)?.remove();
    }

    function showPanel(items, message = '') {
        closePanel();

        const panel = document.createElement('div');
        panel.id = PANEL_ID;
        panel.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:2147483647;width:min(420px,calc(100vw - 32px));max-height:75vh;overflow:auto;padding:14px;border:3px solid #111;border-radius:12px;background:#fff;color:#111;box-shadow:0 8px 30px #0005;font-family:Arial,sans-serif';

        const header = document.createElement('div');
        header.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:10px';

        const title = document.createElement('strong');
        title.textContent = 'Tampermonkey コピペ不要マネージャー';

        const close = document.createElement('button');
        close.type = 'button';
        close.textContent = '×';
        close.style.cssText = 'width:34px;height:30px;border:1px solid #777;border-radius:6px;background:#fff;font-size:20px;cursor:pointer';
        close.addEventListener('click', closePanel);

        header.append(title, close);
        panel.appendChild(header);

        if (message) {
            const info = document.createElement('div');
            info.textContent = message;
            info.style.cssText = 'margin-bottom:10px;padding:8px;border-radius:7px;background:#f3f3f3;line-height:1.5';
            panel.appendChild(info);
        }

        if (items.length === 0) {
            const empty = document.createElement('div');
            empty.textContent = '新しいスクリプトはありません。';
            panel.appendChild(empty);
        }

        for (const item of items) {
            const row = document.createElement('div');
            row.style.cssText = 'margin-top:9px;padding:10px;border:1px solid #bbb;border-radius:8px';

            const name = document.createElement('div');
            name.textContent = item.name;
            name.style.cssText = 'font-weight:700;margin-bottom:7px;overflow-wrap:anywhere';

            const button = document.createElement('button');
            button.type = 'button';
            button.textContent = 'Tampermonkeyへインストール';
            button.style.cssText = 'width:100%;padding:9px;border:0;border-radius:7px;background:#168821;color:#fff;font-weight:700;cursor:pointer';
            button.addEventListener('click', () => {
                const known = new Set(GM_getValue(KEY_KNOWN, []));
                known.add(item.id);
                GM_setValue(KEY_KNOWN, [...known]);
                openInstall(item.installUrl);
                row.remove();
            });

            row.append(name, button);
            panel.appendChild(row);
        }

        (document.body || document.documentElement).appendChild(panel);
    }

    async function check(force = false) {
        const now = Date.now();
        const lastCheck = Number(GM_getValue(KEY_LAST_CHECK, 0));
        if (!force && now - lastCheck < CHECK_INTERVAL) return;

        GM_setValue(KEY_LAST_CHECK, now);

        try {
            const catalog = normalizeCatalog(await requestJson(CATALOG_URL));
            const known = new Set(GM_getValue(KEY_KNOWN, []));
            const fresh = catalog.filter((item) => !known.has(item.id));

            if (force || fresh.length > 0) {
                showPanel(fresh, fresh.length > 0 ? `新しいスクリプトが${fresh.length}件あります。コードの貼り付けは不要です。` : '確認が完了しました。');
            }
        } catch (error) {
            if (force) showPanel([], `確認失敗：${error.message}`);
        }
    }

    GM_registerMenuCommand('新しいスクリプトを今すぐ確認', () => check(true));
    GM_registerMenuCommand('既知リストをリセット', () => {
        GM_setValue(KEY_KNOWN, []);
        GM_setValue(KEY_LAST_CHECK, 0);
        check(true);
    });

    window.setTimeout(() => check(false), 1500);
})();
