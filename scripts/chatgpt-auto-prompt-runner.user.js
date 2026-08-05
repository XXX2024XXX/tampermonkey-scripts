// ==UserScript==
// @name         16 G ボタン/クリック＋自動監視 → 連続プロンプト自動実行 ChatGPT プロンプト連続自動実行
// @namespace    local.chatgpt.prompt.runner
// @version      3.2.0
// @description  ChatGPTの回答終了を安定して検知し、登録したプロンプトを順番に自動送信します。
// @updateURL    https://raw.githubusercontent.com/XXX2024XXX/tampermonkey-scripts/main/scripts/chatgpt-auto-prompt-runner.user.js
// @downloadURL  https://raw.githubusercontent.com/XXX2024XXX/tampermonkey-scripts/main/scripts/chatgpt-auto-prompt-runner.user.js
// @author       User
// @match        https://chatgpt.com/*
// @match        https://chat.openai.com/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(() => {
  'use strict';

  const VERSION = '3.2.0';
  const CONFIG = {
    panelId: 'cgpt-auto-runner-main',
    styleId: 'cgpt-auto-runner-style',
    promptStorageKey: 'cgptAutoRunner.prompts.v3',
    positionStorageKey: 'cgptAutoRunner.position.v3',
    maximumPrompts: 100,
    checkInterval: 500,
    stableTime: 3500,
    minimumResponseTime: 1800,
    completionGraceTime: 1400,
    sendTimeout: 30000,
    minimumRandomWait: 3000,
    maximumRandomWait: 8000
  };

  const state = {
    prompts: [], currentIndex: 0, running: false, paused: false, waiting: false,
    responseStarted: false, generatingObserved: false, lastGeneratingAt: 0,
    sentAt: 0, assistantCountBeforeSend: 0, assistantTextBeforeSend: '',
    lastAssistantText: '', lastTextChangedAt: 0, monitorTimer: null,
    nextSendTimer: null, status: '停止中', initialized: false
  };

  const normalizeText = (value) => String(value || '').replace(/\s+/g, ' ').trim();
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const isVisible = (element) => {
    if (!(element instanceof Element)) return false;
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity || 1) !== 0 && rect.width > 0 && rect.height > 0;
  };

  const ChatGPTAdapter = {
    getComposer() {
      const selectors = [
        '#prompt-textarea',
        'textarea[data-id="root"]',
        'textarea[placeholder]',
        'div.ProseMirror[contenteditable="true"]',
        'div[contenteditable="true"][data-lexical-editor="true"]',
        'div[contenteditable="true"][role="textbox"]',
        'div[contenteditable="true"][data-placeholder]',
        'main form [contenteditable="true"]'
      ];
      for (const selector of selectors) {
        const found = [...document.querySelectorAll(selector)].find(isVisible);
        if (found) return found;
      }
      return null;
    },
    getSendButton() {
      const selectors = [
        'button[data-testid="send-button"]',
        'button[data-testid="composer-send-button"]',
        'button[aria-label*="送信"]',
        'button[aria-label*="Send"]',
        'form button[type="submit"]'
      ];
      for (const selector of selectors) {
        const found = [...document.querySelectorAll(selector)].find(isVisible);
        if (found) return found;
      }
      const form = this.getComposer()?.closest('form');
      if (!form) return null;
      return [...form.querySelectorAll('button')].find((button) => {
        if (!isVisible(button)) return false;
        return /送信|send/i.test(normalizeText(`${button.getAttribute('aria-label') || ''} ${button.textContent || ''}`));
      }) || null;
    },
    getStopButton() {
      const selectors = [
        'button[data-testid="stop-button"]',
        'button[data-testid="composer-stop-button"]',
        'button[aria-label*="生成を停止"]',
        'button[aria-label*="応答を停止"]',
        'button[aria-label*="Stop"]'
      ];
      for (const selector of selectors) {
        const found = [...document.querySelectorAll(selector)].find(isVisible);
        if (found) return found;
      }
      return [...document.querySelectorAll('button')].find((button) => {
        if (!isVisible(button)) return false;
        return /生成を停止|応答を停止|stop generating|stop responding/i.test(normalizeText(`${button.getAttribute('aria-label') || ''} ${button.textContent || ''}`));
      }) || null;
    },
    isGenerating() {
      if (this.getStopButton()) return true;
      return [...document.querySelectorAll('[data-is-streaming="true"], [data-message-author-role="assistant"][data-is-streaming="true"]')].some(isVisible);
    },
    isInputReady() {
      const composer = this.getComposer();
      if (!composer || !isVisible(composer) || this.isGenerating()) return false;
      if (composer.disabled || composer.readOnly || composer.getAttribute('aria-disabled') === 'true') return false;
      return composer.isContentEditable || composer.getAttribute('contenteditable') === 'true' || composer instanceof HTMLTextAreaElement || composer instanceof HTMLInputElement;
    },
    isSendReady() {
      const button = this.getSendButton();
      return Boolean(this.isInputReady() && button && isVisible(button) && !button.disabled && button.getAttribute('aria-disabled') !== 'true' && !this.isGenerating());
    },
    getAssistantMessages() {
      const roleMessages = [...document.querySelectorAll('[data-message-author-role="assistant"]')].filter(isVisible);
      if (roleMessages.length) return roleMessages;
      return [...document.querySelectorAll('article')].filter((article) => isVisible(article) && normalizeText(article.textContent));
    },
    getAssistantCount() {
      return this.getAssistantMessages().length;
    },
    getLastAssistantText() {
      const messages = this.getAssistantMessages();
      const last = messages[messages.length - 1];
      return normalizeText(last?.innerText || last?.textContent || '');
    },
    detectError() {
      const patterns = [/ネットワークエラー/i, /network error/i, /エラーが発生/i, /something went wrong/i, /問題が発生/i, /応答を生成できません/i, /failed to get response/i];
      const candidates = [...document.querySelectorAll('[role="alert"], [data-testid*="error"], main [class*="error"]')];
      for (const element of candidates) {
        if (!isVisible(element)) continue;
        const text = normalizeText(element.innerText || element.textContent || '');
        if (text && patterns.some((pattern) => pattern.test(text))) return text.slice(0, 200);
      }
      return '';
    },
    async setPrompt(text) {
      if (!this.isInputReady()) throw new Error('ChatGPTの入力欄が使用可能ではありません');
      const composer = this.getComposer();
      composer.focus();
      if (composer instanceof HTMLTextAreaElement || composer instanceof HTMLInputElement) {
        const prototype = composer instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
        const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
        if (setter) setter.call(composer, text); else composer.value = text;
        composer.dispatchEvent(new Event('input', { bubbles: true }));
        composer.dispatchEvent(new Event('change', { bubbles: true }));
      } else {
        composer.textContent = '';
        composer.dispatchEvent(new InputEvent('beforeinput', { bubbles: true, inputType: 'insertText', data: text }));
        try { document.execCommand('insertText', false, text); } catch { composer.textContent = text; }
        if (!normalizeText(composer.innerText || composer.textContent || '')) composer.textContent = text;
        composer.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }));
      }
      await sleep(350);
      const entered = normalizeText(composer.value || composer.innerText || composer.textContent || '');
      if (!entered) throw new Error('入力処理後も入力欄が空です');
    },
    async submitPrompt() {
      if (!this.isSendReady()) throw new Error('送信ボタンが使用可能ではありません');
      const button = this.getSendButton();
      if (!button) throw new Error('送信ボタンが見つかりません');
      button.click();
    }
  };

  const randomWait = () => Math.floor(CONFIG.minimumRandomWait + Math.random() * (CONFIG.maximumRandomWait - CONFIG.minimumRandomWait + 1));
  const defaultPrompts = () => ['テスト1', 'テスト2', 'テスト3'];

  function loadPrompts() {
    try {
      const saved = JSON.parse(localStorage.getItem(CONFIG.promptStorageKey) || 'null');
      if (Array.isArray(saved)) return saved.slice(0, CONFIG.maximumPrompts).map((item) => String(item ?? ''));
    } catch {}
    return defaultPrompts();
  }

  function syncPromptsFromScreen() {
    const inputs = [...document.querySelectorAll(`#${CONFIG.panelId} .runner-input`)];
    if (inputs.length) state.prompts = inputs.map((input) => input.value);
  }

  function savePrompts() {
    syncPromptsFromScreen();
    localStorage.setItem(CONFIG.promptStorageKey, JSON.stringify(state.prompts));
    showNotice('保存しました');
  }

  function createStyles() {
    if (document.getElementById(CONFIG.styleId)) return;
    const style = document.createElement('style');
    style.id = CONFIG.styleId;
    style.textContent = `
      #${CONFIG.panelId}{position:fixed;z-index:2147483647;top:70px;right:18px;width:430px;height:430px;min-width:340px;min-height:250px;max-width:95vw;max-height:90vh;display:flex;flex-direction:column;overflow:hidden;resize:both;color:#eee;background:rgba(25,25,28,.98);border:1px solid #55555d;border-radius:10px;box-shadow:0 12px 35px rgba(0,0,0,.45);font-family:system-ui,-apple-system,"Segoe UI",sans-serif;font-size:12px}
      #${CONFIG.panelId} *{box-sizing:border-box}
      #${CONFIG.panelId} .runner-header{display:flex;align-items:center;gap:8px;padding:8px 10px;background:#303036;border-bottom:1px solid #4a4a50;cursor:move;user-select:none}
      #${CONFIG.panelId} .runner-title{flex:1;font-weight:700}
      #${CONFIG.panelId} .runner-count{min-width:58px;text-align:right;font-weight:700}
      #${CONFIG.panelId} .runner-status{padding:3px 8px;border:1px solid #66666d;border-radius:999px;white-space:nowrap}
      #${CONFIG.panelId} .runner-toolbar{display:grid;grid-template-columns:repeat(6,1fr);gap:5px;padding:7px;border-bottom:1px solid #44444a}
      #${CONFIG.panelId} .runner-subtoolbar{display:flex;align-items:center;gap:8px;padding:7px;border-bottom:1px solid #44444a}
      #${CONFIG.panelId} button{padding:6px 5px;color:#fff;background:#3c3c43;border:1px solid #626269;border-radius:6px;cursor:pointer;font-size:12px}
      #${CONFIG.panelId} button:hover{background:#515158}
      #${CONFIG.panelId} button:disabled{opacity:.45;cursor:not-allowed}
      #${CONFIG.panelId} .runner-list{flex:1;min-height:100px;padding:6px;overflow:auto}
      #${CONFIG.panelId} .runner-row{display:grid;grid-template-columns:30px 1fr 28px 28px 28px;align-items:center;gap:4px;margin-bottom:5px}
      #${CONFIG.panelId} .runner-number{padding-right:3px;color:#c7c7ce;text-align:right}
      #${CONFIG.panelId} .runner-input{width:100%;min-height:32px;max-height:100px;padding:6px;resize:vertical;color:#fff;background:#202024;border:1px solid #55555c;border-radius:5px;font:inherit}
      #${CONFIG.panelId} .runner-input.current{outline:2px solid #b6b6bd;outline-offset:1px}
      #${CONFIG.panelId} .runner-small-button{padding:4px 0}
      #${CONFIG.panelId} .runner-notice{min-height:26px;padding:6px 9px;color:#ddd;background:#16161a;border-top:1px solid #44444a}
    `;
    document.documentElement.appendChild(style);
  }

  function createPanel() {
    if (document.getElementById(CONFIG.panelId)) return;
    const panel = document.createElement('section');
    panel.id = CONFIG.panelId;
    panel.innerHTML = `
      <div class="runner-header"><span class="runner-title">ChatGPT 自動プロンプト v${VERSION}</span><span class="runner-count">0 / 0</span><span class="runner-status">停止中</span></div>
      <div class="runner-toolbar"><button type="button" data-action="start">開始</button><button type="button" data-action="stop">停止</button><button type="button" data-action="resume">再開</button><button type="button" data-action="clear">クリア</button><button type="button" data-action="save">保存</button><button type="button" data-action="load">読込</button></div>
      <div class="runner-subtoolbar"><button type="button" data-action="add">行を追加</button><span>最大100件・空欄は飛ばします</span></div>
      <div class="runner-list"></div><div class="runner-notice">準備完了 v${VERSION}</div>`;
    document.documentElement.appendChild(panel);
    restorePanelPosition(panel);
    enableDragging(panel, panel.querySelector('.runner-header'));
    bindPanelEvents(panel);
  }

  function bindPanelEvents(panel) {
    panel.addEventListener('click', (event) => {
      const button = event.target.closest('button[data-action]');
      if (!button) return;
      const action = button.dataset.action;
      const row = button.closest('.runner-row');
      const index = row ? Number(row.dataset.index) : -1;
      if (action === 'start') startExecution();
      if (action === 'stop') stopExecution('停止しました');
      if (action === 'resume') resumeExecution();
      if (action === 'clear') clearPrompts();
      if (action === 'save') savePrompts();
      if (action === 'load') loadPromptsIntoScreen();
      if (action === 'add') addPrompt();
      if (action === 'up') movePrompt(index, -1);
      if (action === 'down') movePrompt(index, 1);
      if (action === 'delete') deletePrompt(index);
    });
    panel.addEventListener('input', (event) => {
      if (!event.target.matches('.runner-input')) return;
      const row = event.target.closest('.runner-row');
      state.prompts[Number(row.dataset.index)] = event.target.value;
      updateScreen();
    });
    window.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') stopExecution('ESCキーで停止しました');
    }, true);
  }

  function enableDragging(panel, handle) {
    let dragging = false, startMouseX = 0, startMouseY = 0, startLeft = 0, startTop = 0;
    handle.addEventListener('mousedown', (event) => {
      if (event.button !== 0) return;
      const rect = panel.getBoundingClientRect();
      dragging = true; startMouseX = event.clientX; startMouseY = event.clientY; startLeft = rect.left; startTop = rect.top;
      panel.style.left = `${rect.left}px`; panel.style.top = `${rect.top}px`; panel.style.right = 'auto';
      event.preventDefault();
    });
    window.addEventListener('mousemove', (event) => {
      if (!dragging) return;
      const maxLeft = Math.max(0, innerWidth - panel.offsetWidth);
      const maxTop = Math.max(0, innerHeight - panel.offsetHeight);
      panel.style.left = `${Math.min(maxLeft, Math.max(0, startLeft + event.clientX - startMouseX))}px`;
      panel.style.top = `${Math.min(maxTop, Math.max(0, startTop + event.clientY - startMouseY))}px`;
    });
    window.addEventListener('mouseup', () => { if (dragging) { dragging = false; savePanelPosition(panel); } });
    new ResizeObserver(() => savePanelPosition(panel)).observe(panel);
  }

  function savePanelPosition(panel) {
    const rect = panel.getBoundingClientRect();
    localStorage.setItem(CONFIG.positionStorageKey, JSON.stringify({ left: Math.round(rect.left), top: Math.round(rect.top), width: Math.round(rect.width), height: Math.round(rect.height) }));
  }

  function restorePanelPosition(panel) {
    try {
      const saved = JSON.parse(localStorage.getItem(CONFIG.positionStorageKey) || '{}');
      if (Number.isFinite(saved.left) && Number.isFinite(saved.top)) {
        panel.style.left = `${Math.max(0, saved.left)}px`; panel.style.top = `${Math.max(0, saved.top)}px`; panel.style.right = 'auto';
      }
      if (Number.isFinite(saved.width)) panel.style.width = `${saved.width}px`;
      if (Number.isFinite(saved.height)) panel.style.height = `${saved.height}px`;
    } catch {}
  }

  function renderPromptRows() {
    const list = document.querySelector(`#${CONFIG.panelId} .runner-list`);
    if (!list) return;
    list.innerHTML = '';
    state.prompts.forEach((prompt, index) => {
      const row = document.createElement('div');
      row.className = 'runner-row'; row.dataset.index = String(index);
      row.innerHTML = `<span class="runner-number">${index + 1}</span><textarea class="runner-input" rows="1" maxlength="12000"></textarea><button type="button" class="runner-small-button" data-action="up">↑</button><button type="button" class="runner-small-button" data-action="down">↓</button><button type="button" class="runner-small-button" data-action="delete">×</button>`;
      row.querySelector('.runner-input').value = prompt;
      list.appendChild(row);
    });
    updateScreen();
  }

  function addPrompt() {
    if (state.running) return showNotice('実行中は追加できません');
    syncPromptsFromScreen();
    if (state.prompts.length >= CONFIG.maximumPrompts) return showNotice('最大100件です');
    state.prompts.push(''); renderPromptRows();
  }

  function deletePrompt(index) {
    if (state.running) return showNotice('実行中は削除できません');
    syncPromptsFromScreen(); state.prompts.splice(index, 1);
    if (!state.prompts.length) state.prompts.push('');
    state.currentIndex = Math.min(state.currentIndex, state.prompts.length - 1); renderPromptRows();
  }

  function movePrompt(index, movement) {
    if (state.running) return showNotice('実行中は順番変更できません');
    syncPromptsFromScreen();
    const destination = index + movement;
    if (index < 0 || destination < 0 || destination >= state.prompts.length) return;
    [state.prompts[index], state.prompts[destination]] = [state.prompts[destination], state.prompts[index]];
    renderPromptRows();
  }

  function clearPrompts() {
    stopExecution('停止しました'); state.prompts = defaultPrompts(); state.currentIndex = 0; state.paused = false; renderPromptRows(); showNotice('テスト1・2・3に戻しました');
  }

  function loadPromptsIntoScreen() {
    if (state.running) return showNotice('実行中は読込できません');
    state.prompts = loadPrompts(); state.currentIndex = 0; state.paused = false; renderPromptRows(); showNotice('読み込みました');
  }

  function findNextPromptIndex(startIndex) {
    for (let index = Math.max(0, startIndex); index < state.prompts.length; index += 1) if (normalizeText(state.prompts[index])) return index;
    return -1;
  }

  function getExecutableIndexes() {
    return state.prompts.map((prompt, index) => ({ index, prompt: normalizeText(prompt) })).filter((item) => item.prompt).map((item) => item.index);
  }

  function getProgress() {
    const indexes = getExecutableIndexes();
    if (!indexes.length) return { current: 0, total: 0 };
    if (state.status === '完了') return { current: indexes.length, total: indexes.length };
    const completed = indexes.filter((index) => index < state.currentIndex).length;
    return { current: Math.min(indexes.length, completed + (indexes.includes(state.currentIndex) ? 1 : 0)), total: indexes.length };
  }

  async function startExecution() {
    if (state.running) return showNotice('すでに実行中です');
    syncPromptsFromScreen(); savePrompts();
    const firstIndex = findNextPromptIndex(0);
    if (firstIndex === -1) { setStatus('停止中'); return showNotice('送信するプロンプトがありません'); }
    clearTimers(); state.currentIndex = firstIndex; state.running = true; state.paused = false; state.waiting = false;
    setStatus('実行中'); showNotice('開始しました'); await sendCurrentPrompt();
  }

  function stopExecution(message = '停止しました') {
    if (!state.running && !state.paused) return;
    clearTimers(); state.running = false; state.paused = true; state.waiting = false; state.responseStarted = false; state.generatingObserved = false; state.lastGeneratingAt = 0;
    setStatus('停止中'); showNotice(message);
  }

  async function resumeExecution() {
    if (state.running) return showNotice('すでに実行中です');
    syncPromptsFromScreen();
    let nextIndex = findNextPromptIndex(state.currentIndex);
    if (nextIndex === -1) nextIndex = findNextPromptIndex(0);
    if (nextIndex === -1) return showNotice('再開するプロンプトがありません');
    clearTimers(); state.currentIndex = nextIndex; state.running = true; state.paused = false; state.waiting = false;
    setStatus('実行中'); showNotice('再開しました'); await sendCurrentPrompt();
  }

  async function waitUntil(predicate, timeout, errorMessage, interval = 400) {
    const started = Date.now();
    while (Date.now() - started < timeout) {
      if (!state.running) throw new Error('停止しました');
      if (predicate()) return;
      await sleep(interval);
    }
    throw new Error(errorMessage);
  }

  async function sendCurrentPrompt() {
    if (!state.running) return;
    const index = findNextPromptIndex(state.currentIndex);
    if (index === -1) return finishExecution();
    state.currentIndex = index; updateScreen();
    const existingError = ChatGPTAdapter.detectError();
    if (existingError) return stopBecauseOfError(existingError);
    const prompt = state.prompts[index];
    state.assistantCountBeforeSend = ChatGPTAdapter.getAssistantCount();
    state.assistantTextBeforeSend = ChatGPTAdapter.getLastAssistantText();
    state.lastAssistantText = state.assistantTextBeforeSend;
    state.lastTextChangedAt = Date.now(); state.responseStarted = false; state.generatingObserved = false; state.lastGeneratingAt = 0; state.sentAt = Date.now();
    try {
      showNotice(`${index + 1}番を送信準備中`);
      await waitUntil(() => ChatGPTAdapter.isInputReady(), CONFIG.sendTimeout, '入力欄が使用可能になりません', 500);
      await ChatGPTAdapter.setPrompt(prompt);
      await waitUntil(() => ChatGPTAdapter.isSendReady(), CONFIG.sendTimeout, '送信ボタンが使用可能になりません', 350);
      await ChatGPTAdapter.submitPrompt();
      state.sentAt = Date.now(); showNotice('応答待ち'); startResponseMonitoring();
    } catch (error) { stopBecauseOfError(error?.message || String(error)); }
  }

  function startResponseMonitoring() {
    if (state.monitorTimer) clearInterval(state.monitorTimer);
    state.monitorTimer = setInterval(checkResponseState, CONFIG.checkInterval);
  }

  function checkResponseState() {
    if (!state.running || state.waiting) return;
    const errorText = ChatGPTAdapter.detectError();
    if (errorText) return stopBecauseOfError(errorText);
    const assistantCount = ChatGPTAdapter.getAssistantCount();
    const assistantText = ChatGPTAdapter.getLastAssistantText();
    const now = Date.now();
    const responseChanged = assistantCount > state.assistantCountBeforeSend || (assistantText && assistantText !== state.assistantTextBeforeSend);
    if (responseChanged && !state.responseStarted) { state.responseStarted = true; state.lastTextChangedAt = now; }
    if (assistantText !== state.lastAssistantText) { state.lastAssistantText = assistantText; state.lastTextChangedAt = now; }
    const generating = ChatGPTAdapter.isGenerating();
    const stopButtonAbsent = !ChatGPTAdapter.getStopButton();
    const inputReady = ChatGPTAdapter.isInputReady();
    if (generating) { state.generatingObserved = true; state.responseStarted = true; state.lastGeneratingAt = now; }
    const textStable = state.responseStarted && now - state.lastTextChangedAt >= CONFIG.stableTime;
    const minimumTimePassed = now - state.sentAt >= CONFIG.minimumResponseTime;
    const generationEnded = state.generatingObserved && !generating && stopButtonAbsent && inputReady && now - state.lastGeneratingAt >= CONFIG.completionGraceTime;
    const stableAnswerEnded = responseChanged && !generating && stopButtonAbsent && inputReady && textStable;
    if (minimumTimePassed && (generationEnded || stableAnswerEnded)) handleResponseFinished();
  }

  function handleResponseFinished() {
    if (!state.running || state.waiting) return;
    if (state.monitorTimer) { clearInterval(state.monitorTimer); state.monitorTimer = null; }
    state.waiting = true;
    const nextIndex = findNextPromptIndex(state.currentIndex + 1);
    if (nextIndex === -1) return finishExecution();
    state.currentIndex = nextIndex;
    const waitTime = randomWait();
    setStatus('待機中'); showNotice(`${(waitTime / 1000).toFixed(1)}秒待機`);
    state.nextSendTimer = setTimeout(async () => {
      if (!state.running) return;
      state.waiting = false; setStatus('実行中'); showNotice('次を送信します'); await sendCurrentPrompt();
    }, waitTime);
  }

  function finishExecution() {
    clearTimers(); state.running = false; state.paused = false; state.waiting = false; state.responseStarted = false; state.generatingObserved = false; state.lastGeneratingAt = 0;
    setStatus('完了'); showNotice('すべて完了しました'); playToneSequence([{ frequency: 660, duration: 140 }, { frequency: 880, duration: 160 }, { frequency: 1040, duration: 260 }]);
  }

  function stopBecauseOfError(message) {
    clearTimers(); state.running = false; state.paused = true; state.waiting = false; state.responseStarted = false; state.generatingObserved = false; state.lastGeneratingAt = 0;
    setStatus('停止中'); showNotice(`エラー: ${normalizeText(message).slice(0, 120)}`); playToneSequence([{ frequency: 320, duration: 180 }, { frequency: 220, duration: 280 }]);
  }

  function clearTimers() {
    if (state.monitorTimer) clearInterval(state.monitorTimer);
    if (state.nextSendTimer) clearTimeout(state.nextSendTimer);
    state.monitorTimer = null; state.nextSendTimer = null;
  }

  function setStatus(status) { state.status = status; updateScreen(); }
  function showNotice(message) { const notice = document.querySelector(`#${CONFIG.panelId} .runner-notice`); if (notice) notice.textContent = message; }

  function updateScreen() {
    const panel = document.getElementById(CONFIG.panelId);
    if (!panel) return;
    const progress = getProgress();
    panel.querySelector('.runner-status').textContent = state.status;
    panel.querySelector('.runner-count').textContent = `${progress.current} / ${progress.total}`;
    panel.querySelector('[data-action="start"]').disabled = state.running;
    panel.querySelector('[data-action="stop"]').disabled = !state.running;
    panel.querySelector('[data-action="resume"]').disabled = state.running || !state.paused;
    panel.querySelector('[data-action="add"]').disabled = state.running || state.prompts.length >= CONFIG.maximumPrompts;
    panel.querySelectorAll('.runner-row').forEach((row, index) => {
      row.querySelector('[data-action="up"]').disabled = state.running || index === 0;
      row.querySelector('[data-action="down"]').disabled = state.running || index === state.prompts.length - 1;
      row.querySelector('[data-action="delete"]').disabled = state.running;
      row.querySelector('.runner-input').classList.toggle('current', (state.running || state.paused) && index === state.currentIndex);
    });
  }

  function playToneSequence(tones) {
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      const audioContext = new AudioContextClass();
      let startTime = audioContext.currentTime;
      for (const tone of tones) {
        const oscillator = audioContext.createOscillator();
        const gain = audioContext.createGain();
        oscillator.type = 'sine'; oscillator.frequency.value = tone.frequency;
        gain.gain.setValueAtTime(0.0001, startTime);
        gain.gain.exponentialRampToValueAtTime(0.12, startTime + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, startTime + tone.duration / 1000);
        oscillator.connect(gain); gain.connect(audioContext.destination);
        oscillator.start(startTime); oscillator.stop(startTime + tone.duration / 1000 + 0.03);
        startTime += tone.duration / 1000 + 0.05;
      }
      setTimeout(() => audioContext.close(), 2500);
    } catch {}
  }

  function initialize() {
    if (state.initialized) return;
    state.initialized = true; state.prompts = loadPrompts(); createStyles(); createPanel(); renderPromptRows(); updateScreen();
  }

  const pageObserver = new MutationObserver(() => {
    if (!document.getElementById(CONFIG.panelId)) { createPanel(); renderPromptRows(); updateScreen(); }
  });

  initialize();
  pageObserver.observe(document.documentElement, { childList: true, subtree: true });
})();