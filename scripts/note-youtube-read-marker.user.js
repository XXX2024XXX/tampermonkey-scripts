// ==UserScript==
// @name         note・YouTube 既読未読切替＋一言メモ
// @namespace    local.note.youtube.read.marker
// @version      1.9.7
// @description  note記事とYouTube動画を手動で既読・未読に切り替え、一言メモを保存します。操作パネルは移動・最小化・位置保存に対応します。
// @author       You
// @match        https://note.com/*
// @match        https://*.note.com/*
// @match        https://note.mutsukiabe.com/*
// @match        https://www.youtube.com/*
// @match        https://m.youtube.com/*
// @match        https://youtu.be/*
// @run-at       document-idle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @grant        GM_registerMenuCommand
// @updateURL    https://raw.githubusercontent.com/XXX2024XXX/tampermonkey-scripts/main/scripts/note-youtube-read-marker.user.js
// @downloadURL  https://raw.githubusercontent.com/XXX2024XXX/tampermonkey-scripts/main/scripts/note-youtube-read-marker.user.js
// ==/UserScript==

(() => {
    'use strict';

    const VERSION = '1.9.7';
    const NOTE_KEY = 'note_read_marker_shared_v110';
    const YOUTUBE_KEY = 'youtube_read_marker_shared_v120';
    const PANEL_KEY = 'note_youtube_panel_state_v196';
    const DRAFT_KEY = 'note_youtube_draft_v196';
    const MAX_MEMO = 120;

    const ID = {
        style: 'rm196-style',
        panel: 'rm196-panel',
        header: 'rm196-header',
        title: 'rm196-title',
        minimize: 'rm196-minimize',
        body: 'rm196-body',
        read: 'rm196-read',
        readMemo: 'rm196-read-memo',
        input: 'rm196-input',
        save: 'rm196-save',
        notice: 'rm196-notice'
    };

    let lastUrl = location.href;
    let scanTimer = 0;
    let dragging = false;
    let dragOffsetX = 0;
    let dragOffsetY = 0;

    const log = (...args) => {
        try {
            console.log(`[既読未読メモ v${VERSION}]`, ...args);
        } catch {
        }
    };

    const gmGet = (key, fallback) => {
        try {
            return GM_getValue(key, fallback);
        } catch (error) {
            log('読込エラー', error);
            return fallback;
        }
    };

    const gmSet = (key, value) => {
        try {
            GM_setValue(key, value);
            return true;
        } catch (error) {
            log('保存エラー', error);
            return false;
        }
    };

    const gmDelete = (key) => {
        try {
            GM_deleteValue(key);
        } catch (error) {
            log('削除エラー', error);
        }
    };

    const isNote = () =>
        location.hostname === 'note.com' ||
        location.hostname.endsWith('.note.com') ||
        location.hostname === 'note.mutsukiabe.com';

    const isYouTube = () =>
        ['www.youtube.com', 'm.youtube.com', 'youtu.be'].includes(location.hostname);

    const normalizeNoteUrl = (value) => {
        try {
            const url = new URL(value, location.href);
            url.search = '';
            url.hash = '';
            url.pathname = url.pathname.replace(/\/+$/, '') || '/';
            return `${url.origin}${url.pathname}`;
        } catch {
            return '';
        }
    };

    const getNoteId = (value) => {
        try {
            return new URL(normalizeNoteUrl(value)).pathname
                .match(/\/n\/(n[a-zA-Z0-9_-]+)/)?.[1] || '';
        } catch {
            return '';
        }
    };

    const getYouTubeId = (value) => {
        try {
            const url = new URL(value, location.href);
            const host = url.hostname.replace(/^www\./, '');

            if (host === 'youtu.be') {
                return url.pathname.split('/').filter(Boolean)[0] || '';
            }

            if (!['youtube.com', 'm.youtube.com'].includes(host)) {
                return '';
            }

            if (url.pathname === '/watch') {
                return url.searchParams.get('v') || '';
            }

            return url.pathname.match(/^\/(?:shorts|live|embed)\/([^/?#]+)/)?.[1] || '';
        } catch {
            return '';
        }
    };

    const currentTarget = () => {
        if (isNote()) {
            const id = getNoteId(location.href);
            return id ? { type: 'note', id } : null;
        }

        if (isYouTube()) {
            const id = getYouTubeId(location.href);
            return id ? { type: 'youtube', id } : null;
        }

        return null;
    };

    const mapKey = (type) =>
        type === 'note' ? NOTE_KEY : YOUTUBE_KEY;

    const loadMap = (type) => {
        const value = gmGet(mapKey(type), {});
        return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    };

    const saveMap = (type, map) =>
        gmSet(mapKey(type), map);

    const getRecord = (type, id) =>
        loadMap(type)[id] || null;

    const draftKey = (type, id) =>
        `${type}:${id}`;

    const loadDrafts = () => {
        const value = gmGet(DRAFT_KEY, {});
        return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    };

    const getDraft = (type, id) =>
        String(loadDrafts()[draftKey(type, id)] || '');

    const setDraft = (type, id, memo) => {
        const drafts = loadDrafts();
        drafts[draftKey(type, id)] = String(memo || '').slice(0, MAX_MEMO);
        gmSet(DRAFT_KEY, drafts);
    };

    const clearDraft = (type, id) => {
        const drafts = loadDrafts();
        delete drafts[draftKey(type, id)];
        gmSet(DRAFT_KEY, drafts);
    };

    const markRead = (type, id, memo) => {
        const map = loadMap(type);
        const old = map[id] || {};

        map[id] = {
            ...old,
            url: type === 'note'
                ? normalizeNoteUrl(location.href)
                : `https://www.youtube.com/watch?v=${id}`,
            readAt: old.readAt || Date.now(),
            updatedAt: Date.now(),
            memo: String(memo || '').trim().slice(0, MAX_MEMO),
            version: VERSION
        };

        return saveMap(type, map);
    };

    const markUnread = (type, id) => {
        const map = loadMap(type);
        delete map[id];
        return saveMap(type, map);
    };

    const showNotice = (text) => {
        document.getElementById(ID.notice)?.remove();

        const notice = document.createElement('div');
        notice.id = ID.notice;
        notice.textContent = text;
        (document.body || document.documentElement).appendChild(notice);

        window.setTimeout(() => notice.remove(), 2200);
    };

    const addStyles = () => {
        if (document.getElementById(ID.style)) {
            return;
        }

        const style = document.createElement('style');
        style.id = ID.style;
        style.textContent = `
            #${ID.panel}{
                position:fixed!important;
                z-index:2147483647!important;
                width:min(320px,calc(100vw - 20px))!important;
                border:3px solid #f00!important;
                border-radius:11px!important;
                background:#fff!important;
                overflow:hidden!important;
                box-shadow:0 6px 22px rgba(0,0,0,.3)!important;
                box-sizing:border-box!important;
                font-family:Arial,sans-serif!important
            }
            #${ID.header}{
                display:flex!important;
                align-items:center!important;
                justify-content:space-between!important;
                min-height:36px!important;
                padding:5px 7px 5px 11px!important;
                background:#f00!important;
                color:#fff!important;
                cursor:move!important;
                user-select:none!important;
                box-sizing:border-box!important
            }
            #${ID.title}{
                font-size:14px!important;
                font-weight:900!important;
                pointer-events:none!important
            }
            #${ID.minimize}{
                display:flex!important;
                align-items:center!important;
                justify-content:center!important;
                width:28px!important;
                height:26px!important;
                padding:0!important;
                border:2px solid #fff!important;
                border-radius:6px!important;
                background:#fff!important;
                color:#f00!important;
                font-size:18px!important;
                font-weight:900!important;
                cursor:pointer!important
            }
            #${ID.body}{
                display:block!important;
                padding:10px!important;
                box-sizing:border-box!important
            }
            #${ID.panel}[data-minimized="true"]{
                width:86px!important;
                border-width:2px!important;
                border-radius:8px!important
            }
            #${ID.panel}[data-minimized="true"] #${ID.header}{
                min-height:25px!important;
                padding:2px 3px 2px 6px!important
            }
            #${ID.panel}[data-minimized="true"] #${ID.title}{
                font-size:10px!important
            }
            #${ID.panel}[data-minimized="true"] #${ID.minimize}{
                width:20px!important;
                height:19px!important;
                border-width:1px!important;
                border-radius:4px!important;
                font-size:13px!important
            }
            #${ID.panel}[data-minimized="true"] #${ID.body}{
                display:none!important
            }
            #${ID.read}{
                display:none!important;
                width:100%!important;
                padding:10px!important;
                border:3px solid #f00!important;
                border-radius:9px!important;
                background:#fff!important;
                color:#f00!important;
                font-size:21px!important;
                font-weight:900!important;
                cursor:pointer!important;
                box-sizing:border-box!important
            }
            #${ID.read}[data-visible="true"]{
                display:block!important
            }
            #${ID.readMemo}{
                display:block!important;
                margin-top:6px!important;
                color:#111!important;
                font-size:15px!important;
                line-height:1.4!important;
                overflow-wrap:anywhere!important
            }
            #${ID.input}{
                display:block!important;
                width:100%!important;
                min-height:62px!important;
                padding:8px!important;
                border:2px solid #888!important;
                border-radius:8px!important;
                background:#fff!important;
                color:#111!important;
                font-size:14px!important;
                line-height:1.4!important;
                resize:vertical!important;
                box-sizing:border-box!important
            }
            #${ID.save}{
                display:block!important;
                width:100%!important;
                min-height:45px!important;
                margin-top:7px!important;
                padding:8px 12px!important;
                border:3px solid #f00!important;
                border-radius:9px!important;
                background:#f00!important;
                color:#fff!important;
                font-size:15px!important;
                font-weight:900!important;
                cursor:pointer!important;
                box-sizing:border-box!important
            }
            #${ID.notice}{
                position:fixed!important;
                right:16px!important;
                bottom:16px!important;
                z-index:2147483647!important;
                padding:11px 14px!important;
                border:3px solid #f00!important;
                border-radius:9px!important;
                background:#fff!important;
                color:#f00!important;
                font-size:15px!important;
                font-weight:900!important;
                box-shadow:0 6px 20px rgba(0,0,0,.3)!important
            }
        `;

        document.head.appendChild(style);
    };

    const clampPanel = (panel, left, top) => {
        const rect = panel.getBoundingClientRect();

        return {
            left: Math.min(
                Math.max(5, left),
                Math.max(5, innerWidth - rect.width - 5)
            ),
            top: Math.min(
                Math.max(5, top),
                Math.max(5, innerHeight - rect.height - 5)
            )
        };
    };

    const savePanelState = () => {
        const panel = document.getElementById(ID.panel);

        if (!panel) {
            return;
        }

        const rect = panel.getBoundingClientRect();

        gmSet(PANEL_KEY, {
            left: Math.round(rect.left),
            top: Math.round(rect.top),
            minimized: panel.dataset.minimized === 'true'
        });
    };

    const restorePanelState = (panel) => {
        const state = gmGet(PANEL_KEY, {});

        panel.dataset.minimized =
            String(Boolean(state?.minimized));

        requestAnimationFrame(() => {
            const rect =
                panel.getBoundingClientRect();

            const left =
                Number.isFinite(Number(state?.left))
                    ? Number(state.left)
                    : Math.round(
                        (innerWidth - rect.width) / 2
                    );

            const top =
                Number.isFinite(Number(state?.top))
                    ? Number(state.top)
                    : Math.round(
                        (innerHeight - rect.height) / 2
                    );

            const position =
                clampPanel(panel, left, top);

            panel.style.left =
                `${position.left}px`;

            panel.style.top =
                `${position.top}px`;

            const button =
                document.getElementById(ID.minimize);

            if (button) {
                button.textContent =
                    panel.dataset.minimized === 'true'
                        ? '□'
                        : '－';
            }
        });
    };
const updatePanel = () => {
        const target = currentTarget();
        const panel = document.getElementById(ID.panel);

        if (!target) {
            panel?.remove();
            return;
        }

        if (!panel) {
            ensurePanel();
            return;
        }

        const title = document.getElementById(ID.title);
        const readButton = document.getElementById(ID.read);
        const readMemo = document.getElementById(ID.readMemo);
        const input = document.getElementById(ID.input);
        const saveButton = document.getElementById(ID.save);

        if (!title || !readButton || !readMemo || !input || !saveButton) {
            panel.remove();
            ensurePanel();
            return;
        }

        const record = getRecord(target.type, target.id);

        if (record) {
            title.textContent = '既読メモ';
            readButton.dataset.visible = 'true';
            readMemo.textContent = String(record.memo || '');
            readMemo.style.display = record.memo ? 'block' : 'none';
            input.style.display = 'none';
            saveButton.style.display = 'none';
        } else {
            title.textContent = '未読メモ';
            readButton.dataset.visible = 'false';
            readMemo.textContent = '';
            input.style.display = 'block';
            saveButton.style.display = 'block';

            if (document.activeElement !== input) {
                input.value = getDraft(target.type, target.id);
            }
        }
    };

    const setCurrentRead = () => {
        try {
            const target = currentTarget();
            const input = document.getElementById(ID.input);

            if (!target || !input) {
                showNotice('このページでは保存できません');
                return;
            }

            const memo = input.value.trim().slice(0, MAX_MEMO);

            if (!markRead(target.type, target.id, memo)) {
                showNotice('保存できませんでした');
                return;
            }

            clearDraft(target.type, target.id);
            updatePanel();
            showNotice(memo ? '既読とメモを保存しました' : '既読にしました');
            log('既読保存', target, memo);
        } catch (error) {
            log('既読処理エラー', error);
            showNotice('処理中にエラーが発生しました');
        }
    };

    const setCurrentUnread = () => {
        try {
            const target = currentTarget();

            if (!target) {
                return;
            }

            const record = getRecord(target.type, target.id);
            const memo = String(record?.memo || '').slice(0, MAX_MEMO);

            setDraft(target.type, target.id, memo);
            markUnread(target.type, target.id);
            updatePanel();
            showNotice(memo ? '未読に戻しました。文字は残しています' : '未読に戻しました');
            log('未読へ戻す', target, memo);
        } catch (error) {
            log('未読処理エラー', error);
            showNotice('処理中にエラーが発生しました');
        }
    };

    const toggleMinimize = () => {
        const panel = document.getElementById(ID.panel);
        const button = document.getElementById(ID.minimize);

        if (!panel || !button) {
            return;
        }

        const minimized = panel.dataset.minimized !== 'true';
        panel.dataset.minimized = String(minimized);
        button.textContent = minimized ? '□' : '－';

        requestAnimationFrame(() => {
            const rect = panel.getBoundingClientRect();
            const position = clampPanel(panel, rect.left, rect.top);
            panel.style.left = `${position.left}px`;
            panel.style.top = `${position.top}px`;
            savePanelState();
        });
    };

    const ensurePanel = () => {
        const target = currentTarget();

        if (!target) {
            document.getElementById(ID.panel)?.remove();
            return;
        }

        let panel = document.getElementById(ID.panel);

        if (!panel) {
            panel = document.createElement('div');
            panel.id = ID.panel;
            panel.dataset.minimized = 'false';

            const header = document.createElement('div');
            header.id = ID.header;

            const title = document.createElement('span');
            title.id = ID.title;

            const minimize = document.createElement('button');
            minimize.id = ID.minimize;
            minimize.type = 'button';
            minimize.textContent = '－';

            minimize.addEventListener('click', (event) => {
                event.preventDefault();
                event.stopPropagation();
                toggleMinimize();
            });

            header.append(title, minimize);

            const body = document.createElement('div');
            body.id = ID.body;

            const readButton = document.createElement('button');
            readButton.id = ID.read;
            readButton.type = 'button';
            readButton.dataset.visible = 'false';
            readButton.textContent = '既読';

            const readMemo = document.createElement('span');
            readMemo.id = ID.readMemo;
            readButton.appendChild(readMemo);

            readButton.addEventListener('click', (event) => {
                event.preventDefault();
                event.stopPropagation();
                setCurrentUnread();
            });

            const input = document.createElement('textarea');
            input.id = ID.input;
            input.maxLength = MAX_MEMO;
            input.rows = 2;
            input.placeholder = '例：あとで確認する';

            input.addEventListener('input', () => {
                const now = currentTarget();

                if (now) {
                    setDraft(now.type, now.id, input.value);
                }
            });

            const saveButton = document.createElement('button');
            saveButton.id = ID.save;
            saveButton.type = 'button';
            saveButton.textContent = '未読 → 既読にする';

            saveButton.addEventListener('click', (event) => {
                event.preventDefault();
                event.stopPropagation();
                setCurrentRead();
            });

            body.append(readButton, input, saveButton);
            panel.append(header, body);

            (document.body || document.documentElement).appendChild(panel);

            header.addEventListener('mousedown', (event) => {
                if (
                    event.button !== 0 ||
                    event.target.closest(`#${ID.minimize}`)
                ) {
                    return;
                }

                const rect = panel.getBoundingClientRect();

                dragging = true;
                dragOffsetX = event.clientX - rect.left;
                dragOffsetY = event.clientY - rect.top;

                event.preventDefault();
            });

            restorePanelState(panel);
        }

        updatePanel();
    };

    document.addEventListener('mousemove', (event) => {
        if (!dragging) {
            return;
        }

        const panel = document.getElementById(ID.panel);

        if (!panel) {
            dragging = false;
            return;
        }

        const position = clampPanel(
            panel,
            event.clientX - dragOffsetX,
            event.clientY - dragOffsetY
        );

        panel.style.left = `${position.left}px`;
        panel.style.top = `${position.top}px`;
    });

    document.addEventListener('mouseup', () => {
        if (!dragging) {
            return;
        }

        dragging = false;
        savePanelState();
    });

    const refresh = () => {
        addStyles();
        ensurePanel();
    };

    const scheduleRefresh = (delay = 120) => {
        clearTimeout(scanTimer);
        scanTimer = window.setTimeout(refresh, delay);
    };

    const observer = new MutationObserver(() => {
        if (
            currentTarget() &&
            !document.getElementById(ID.panel)
        ) {
            scheduleRefresh(50);
        }
    });

    observer.observe(document.documentElement, {
        childList: true,
        subtree: true
    });

    document.addEventListener(
        'yt-navigate-finish',
        () => scheduleRefresh(50)
    );

    document.addEventListener(
        'yt-page-data-updated',
        () => scheduleRefresh(80)
    );

    window.addEventListener(
        'popstate',
        () => scheduleRefresh(50)
    );

    window.setInterval(() => {
        if (location.href !== lastUrl) {
            lastUrl = location.href;
            scheduleRefresh(50);
        }
    }, 400);

    window.addEventListener('resize', () => {
        const panel = document.getElementById(ID.panel);

        if (!panel) {
            return;
        }

        const rect = panel.getBoundingClientRect();
        const position = clampPanel(panel, rect.left, rect.top);

        panel.style.left = `${position.left}px`;
        panel.style.top = `${position.top}px`;

        savePanelState();
    });

    GM_registerMenuCommand(
        '現在ページを既読にする',
        setCurrentRead
    );

    GM_registerMenuCommand(
        '現在ページを未読に戻す',
        setCurrentUnread
    );

    GM_registerMenuCommand(
        'パネル位置を中央へ戻す',
        () => {
            gmSet(PANEL_KEY, {
                left: null,
                top: null,
                minimized: false
            });

            document.getElementById(ID.panel)?.remove();
            ensurePanel();

            showNotice('パネルを中央へ戻しました');
        }
    );

    GM_registerMenuCommand(
        'noteの既読記録をすべて削除',
        () => {
            if (
                !confirm(
                    'noteの既読記録とメモをすべて削除しますか？'
                )
            ) {
                return;
            }

            gmDelete(NOTE_KEY);
            refresh();

            showNotice('noteの既読記録を削除しました');
        }
    );

    GM_registerMenuCommand(
        'YouTubeの既読記録をすべて削除',
        () => {
            if (
                !confirm(
                    'YouTubeの既読記録とメモをすべて削除しますか？'
                )
            ) {
                return;
            }

            gmDelete(YOUTUBE_KEY);
            refresh();

            showNotice('YouTubeの既読記録を削除しました');
        }
    );

    const start = () => {
        refresh();

        [300, 800, 1600, 3000].forEach((delay) => {
            window.setTimeout(refresh, delay);
        });

        log('起動', location.href, currentTarget());
    };

    if (document.readyState === 'loading') {
        document.addEventListener(
            'DOMContentLoaded',
            start,
            { once: true }
        );
    } else {
        start();
    }
})();