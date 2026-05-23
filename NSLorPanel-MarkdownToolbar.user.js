// ==UserScript==
// @name         NSLorPanel Markdown Toolbar
// @namespace    test
// @match        https://www.linux.org.ru/*
// @grant        none
// @inject-into  content
// @run-at       document-idle
// @version      2.6
// ==/UserScript==
(function() {
    'use strict';

    // ========================================================================
    // 1. КОНФИГУРАЦИЯ, МАСШТАБ И ТЕМА
    // ========================================================================
    const CFG_KEY_MD = 'lor_md_toolbar_settings_v1';
    const CFG_KEY_MAIN = 'lor_panel_settings_v3';

    function getMainConfig() {
        try {
            const main = JSON.parse(localStorage.getItem(CFG_KEY_MAIN));
            if (!main || typeof main.general !== 'object') return null;
            return {
                modalScale: Math.min(300, Math.max(30, main.general.modalScale || 100)) / 100,
                isDark: main.general.isDark || null
            };
        } catch(e) { return null; }
    }

    function detectTheme() {
        const links = document.querySelectorAll('link[rel="stylesheet"]');
        for (let i = 0; i < links.length; i++) {
            const m = links[i].href.match(/\/([^/]+)\/combined\.css/);
            if (m) return m[1];
        }
        return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'black' : 'white2';
    }

    const mainCfg = getMainConfig() || { modalScale: 1.0 };
    const themeName = mainCfg.isDark !== null ? (mainCfg.isDark ? 'black' : 'white2') : detectTheme();

    const THEME_MAP = {
        black:          { isDark: true, txt: '#c8c8c8', bg: '#1a1a2e', border: '#444', btn: '#1a1a2e', btnH: '#16213e', sep: '#2a2a3a', panelBg: '#1a1a2e' },
        tango:          { isDark: true, txt: '#babdb6', bg: '#2e3436', border: '#555', btn: '#2e3436', btnH: '#3e4547', sep: '#3e4547', panelBg: '#2e3436' },
        'tango-light':  { isDark: false, txt: '#2e3436', bg: '#d3d7cf', border: '#888', btn: '#d3d7cf', btnH: '#c0c4bc', sep: '#b0b0b0', panelBg: '#d3d7cf' },
        'tango-auto':   { isDark: false, txt: '#2e3436', bg: '#d3d7cf', border: '#888', btn: '#d3d7cf', btnH: '#c0c4bc', sep: '#b0b0b0', panelBg: '#d3d7cf' },
        white2:         { isDark: false, txt: '#333333', bg: '#e8e8e8', border: '#ccc', btn: '#e8e8e8', btnH: '#d0d0d0', sep: '#d0d0d0', panelBg: '#e8e8e8' },
        waltz:          { isDark: false, txt: '#333333', bg: '#ececec', border: '#ccc', btn: '#ececec', btnH: '#d8d8d8', sep: '#d8d8d8', panelBg: '#ececec' },
        zomg_ponies:    { isDark: false, txt: '#333333', bg: '#ececec', border: '#ccc', btn: '#ececec', btnH: '#d8d8d8', sep: '#d8d8d8', panelBg: '#ececec' }
    };

    let CFG = {
        scale: mainCfg.modalScale,
        theme: THEME_MAP[themeName] || THEME_MAP.black,
        accent: '#4a90d9',
        enabled: (() => {
            try { return JSON.parse(localStorage.getItem(CFG_KEY_MD))?.enabled ?? true; }
            catch(e) { return true; }
        })()
    };

    const px = (v) => `${Math.round(v * CFG.scale)}px`;
    const isDark = CFG.theme.isDark;
    const inactiveTabColor = isDark ? '#888' : '#666';

    // ========================================================================
    // 2. УМНЫЕ ОПЕРАЦИИ С ТЕКСТОМ
    // ========================================================================
    const TextOps = {
        getLines(textarea, start, end) {
            const full = textarea.value;
            const selected = full.substring(start, end);
            if (!selected.includes('\n')) return [{ text: selected, start, end, fullLine: false }];

            const before = full.substring(0, start);
            const after = full.substring(end);
            const lineStart = before.lastIndexOf('\n') + 1;
            const lineEnd = end + (after.indexOf('\n') === -1 ? after.length : after.indexOf('\n'));
            const fullBlock = full.substring(lineStart, lineEnd);
            const lines = fullBlock.split('\n');

            return lines.map((line, i) => {
                let acc = lineStart;
                for (let j = 0; j < i; j++) acc += lines[j].length + 1;
                return { text: line, start: acc, end: acc + line.length, fullLine: true };
            });
        },

        applyToEachLine(textarea, start, end, prefixFn, isBlock = false) {
            const full = textarea.value;
            const lines = this.getLines(textarea, start, end);
            let newLines = [];
            let firstStart = lines[0].start;

            lines.forEach((line, idx) => {
                const original = line.text;
                const prefix = typeof prefixFn === 'function' ? prefixFn(idx + 1, original) : prefixFn;
                if (original.startsWith(prefix)) {
                    newLines.push(original.substring(prefix.length));
                } else {
                    newLines.push(prefix + original);
                }
            });

            const newBlock = newLines.join('\n');
            const lastLine = lines[lines.length - 1];
            textarea.setRangeText(newBlock, firstStart, lastLine.end, 'select');
            return { newStart: firstStart, newEnd: firstStart + newBlock.length };
        },

        toggleWrap(textarea, start, end, patterns, placeholder = 'текст') {
            const selected = textarea.value.substring(start, end);
            for (const {p, s} of patterns) {
                if (selected.startsWith(p) && selected.endsWith(s) && selected.length > p.length + s.length) {
                    const inner = selected.substring(p.length, selected.length - s.length);
                    textarea.setRangeText(inner, start, end, 'select');
                    return { start, end: start + inner.length };
                }
            }
            const {p, s} = patterns[0];
            const text = selected || placeholder;
            const wrapped = p + text + s;
            textarea.setRangeText(wrapped, start, end, 'select');
            return { start: start + p.length, end: start + p.length + text.length };
        },

        insertTemplate(textarea, start, template, cursorMark = '%CURSOR%') {
            const hasCursorMark = template.includes(cursorMark);
            const clean = template.replace(cursorMark, '');
            textarea.setRangeText(clean, start, start, 'end');
            if (hasCursorMark) {
                const pos = start + template.indexOf(cursorMark);
                textarea.setSelectionRange(pos, pos);
            }
            return { start, end: start + clean.length };
        }
    };

    // ========================================================================
    // 3. КОНФИГУРАЦИЯ КНОПОК
    // ========================================================================
    const BTN_DEFS = [
        {i:'↩', t:'Отменить (Ctrl+Z)', action:'undo'},
        {i:'↪', t:'Повторить (Ctrl+Y)', action:'redo'},
        {sep:1},
        {i:'𝐁', t:'Жирный (Ctrl+B)', type:'wrap', patterns:[{p:'**',s:'**'}, {p:'__',s:'__'}], hotkey:{key:'b',ctrl:true}},
        {i:'𝘐', t:'Курсив (Ctrl+I)', type:'wrap', patterns:[{p:'*',s:'*'}, {p:'_',s:'_'}], hotkey:{key:'i',ctrl:true}},
        {i:'𝓑𝘐', t:'Жирный курсив', type:'wrap', patterns:[{p:'***',s:'***'}, {p:'___',s:'___'}]},
        {i:'𝓢', t:'Зачёркнутый', type:'wrap', patterns:[{p:'~~',s:'~~'}]},
        {i:'⌨', t:'Код в строке', type:'wrap', patterns:[{p:'`',s:'`'}]},
        {sep:1},
        // 🔧 Умные цитаты: обе проверяют window.getSelection()
        {i:'❝', t:'Цитата (выдели текст на странице)', type:'quote', quotePrefix: '> '},
        {i:'❝❝', t:'Вложенная цитата (выдели текст)', type:'quote', quotePrefix: '>> '},
        {i:'</>', t:'Блок кода (toggle)', type:'code-block'},
        {i:'</>🔤', t:'Блок кода с языком (toggle)', type:'code-block-lang'},
        {i:'#', t:'Заголовок 1', type:'line-prefix', prefix:'# ', block:true},
        {i:'##', t:'Заголовок 2', type:'line-prefix', prefix:'## ', block:true},
        {i:'###', t:'Заголовок 3', type:'line-prefix', prefix:'### ', block:true},
        {i:'####', t:'Заголовок 4', type:'line-prefix', prefix:'#### ', block:true},
        {i:'#####', t:'Заголовок 5', type:'line-prefix', prefix:'##### ', block:true},
        {i:'######', t:'Заголовок 6', type:'line-prefix', prefix:'###### ', block:true},
        {i:'◐', t:'Спойлер (cut)', type:'block-wrap', open:'>>>\n', close:'\n<<<'},
        {sep:1},
        {i:'🔗', t:'Ссылка (Ctrl+K)', type:'smart-wrap', p:'[', s:'](url)', placeholder:'текст', cursorOn:'text'},
        {i:'@', t:'Упоминание', type:'smart-wrap', p:'@', s:'', placeholder:'ник', cursorAfter:true},
        {sep:1},
        {i:'•', t:'Маркированный список', type:'line-prefix', prefix:'* ', multiline:true},
        {i:'1.', t:'Нумерованный список', type:'line-prefix', prefixFn:(n) => `${n}. `, multiline:true},
        {sep:1},
        {i:'▦L', t:'Таблица (←:→)', type:'template', template:'| Left | Center | Right |\n|:-----|:------:|------:|\n| %CURSOR% | B | C |\n'},
        {i:'▦', t:'Таблица (простая)', type:'template', template:'| Заголовок 1 | Заголовок 2 |\n|---------------|---------------|\n| %CURSOR% | Ячейка 2 |\n'},
        {sep:1},
        {i:'—', t:'Горизонтальная линия', type:'template', template:'\n---\n%CURSOR%\n'},
        {i:'␣', t:'Pre-formatted (4 пробела)', type:'line-prefix', prefix:'    ', multiline:true}
    ];

    // ========================================================================
    // 4. МЕНЕДЖЕР ИСТОРИИ + ГОРЯЧИЕ КЛАВИШИ
    // ========================================================================
    const historyManager = (() => {
        const stack = [], maxLen = 50;
        let idx = -1, ta = null, debounce = null, skipNextInput = false;
        const hotkeys = new Map();

        function pushState() {
            if (!ta) return;
            if (idx >= 0 && stack[idx] === ta.value) return;
            stack.splice(idx + 1);
            stack.push(ta.value);
            if (stack.length > maxLen) stack.shift();
            idx = stack.length - 1;
            updateUI();
        }

        function restoreState(newIdx) {
            idx = newIdx;
            ta.value = stack[idx];
            ta.focus();
            ta.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
            updateUI();
        }

        function updateUI() {
            const u = document.querySelector('#lor-md-toolbar button[title*="Отменить"]');
            const r = document.querySelector('#lor-md-toolbar button[title*="Повторить"]');
            if (!u || !r) return;
            u.style.opacity = idx > 0 ? '1' : '0.4';
            u.style.pointerEvents = idx > 0 ? 'auto' : 'none';
            r.style.opacity = idx < stack.length - 1 ? '1' : '0.4';
            r.style.pointerEvents = idx < stack.length - 1 ? 'auto' : 'none';
        }

        return {
            init(textarea) {
                ta = textarea;
                stack.length = 0; idx = -1;
                pushState();
                ta.addEventListener('input', () => {
                    if (skipNextInput) { skipNextInput = false; return; }
                    clearTimeout(debounce);
                    debounce = setTimeout(pushState, 200);
                }, true);
                ta.addEventListener('keydown', (e) => {
                    const key = e.key.toLowerCase();
                    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && key === 'z') { e.preventDefault(); this.undo(); return; }
                    if ((e.ctrlKey || e.metaKey) && (key === 'y' || (e.shiftKey && key === 'z'))) { e.preventDefault(); this.redo(); return; }
                    if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey) {
                        hotkeys.forEach((handler, combo) => {
                            if (combo.key === key && combo.ctrl === ((e.ctrlKey || e.metaKey))) {
                                e.preventDefault(); handler();
                            }
                        });
                    }
                });
                this.registerHotkey = (def, handler) => { if (def.hotkey) hotkeys.set(JSON.stringify(def.hotkey), handler); };
                updateUI();
            },
            undo() { if (idx > 0) restoreState(idx - 1); },
            redo() { if (idx < stack.length - 1) restoreState(idx + 1); },
            pushAfterAction() { skipNextInput = true; pushState(); }
        };
    })();

    // ========================================================================
    // 5. ОБРАБОТЧИК КНОПОК
    // ========================================================================
    function handleButtonClick(textarea, btnDef) {
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const selected = textarea.value.substring(start, end);

        switch(btnDef.type) {
            case 'wrap':
                const result = TextOps.toggleWrap(textarea, start, end, btnDef.patterns, btnDef.placeholder);
                textarea.setSelectionRange(result.start, result.end);
                break;
            case 'smart-wrap':
                const sel = selected || btnDef.placeholder;
                let wrapped = btnDef.p + sel + btnDef.s;
                textarea.setRangeText(wrapped, start, end, 'select');
                if (btnDef.cursorOn === 'text') {
                    textarea.setSelectionRange(start + btnDef.p.length, start + btnDef.p.length + sel.length);
                } else if (btnDef.cursorOn === 'url') {
                    const urlPos = start + btnDef.p.length + sel.length + btnDef.s.indexOf('url');
                    textarea.setSelectionRange(urlPos, urlPos + 3);
                } else if (btnDef.cursorAfter) {
                    textarea.setSelectionRange(start + wrapped.length, start + wrapped.length);
                }
                break;
            case 'line-prefix':
                const res = TextOps.applyToEachLine(textarea, start, end, btnDef.prefixFn || btnDef.prefix, btnDef.block);
                if (btnDef.prefixFn) textarea.setSelectionRange(res.newStart, res.newStart);
                break;

            // 🔧 УМНЫЕ ЦИТАТЫ (❝ и ❝❝)
            case 'quote':
                const qPrefix = btnDef.quotePrefix || '> ';
                const pageSel = window.getSelection().toString().trim();
                if (pageSel) {
                    const quoted = pageSel.split('\n').map(l => qPrefix + l).join('\n');
                    const insert = (textarea.value.trim().length > 0 ? '\n\n' : '') + quoted + '\n';
                    textarea.value += insert;
                    textarea.focus();
                    textarea.scrollTop = textarea.scrollHeight;
                } else {
                    TextOps.applyToEachLine(textarea, start, end, qPrefix, false);
                }
                break;

            case 'code-block':
                if (selected.trim()) {
                    const trimmed = selected.trim();
                    if (trimmed.startsWith('```') && trimmed.endsWith('```')) {
                        const lines = trimmed.split('\n');
                        if (lines.length >= 3 && lines[0].trim() === '```' && lines[lines.length-1].trim() === '```') {
                            const inner = lines.slice(1, lines.length - 1).join('\n');
                            textarea.setRangeText(inner, start, end, 'select');
                            textarea.setSelectionRange(start, start + inner.length);
                        } else {
                            const wrapped = '```\n' + selected + '\n```';
                            textarea.setRangeText(wrapped, start, end, 'select');
                            textarea.setSelectionRange(start + wrapped.length, start + wrapped.length);
                        }
                    } else {
                        const wrapped = '```\n' + selected + '\n```';
                        textarea.setRangeText(wrapped, start, end, 'select');
                        textarea.setSelectionRange(start + wrapped.length, start + wrapped.length);
                    }
                } else {
                    TextOps.insertTemplate(textarea, start, '```\n%CURSOR%\n```');
                }
                break;
            case 'code-block-lang':
                const lang = prompt('Язык разметки (оставь пустым для обычного блока):', '');
                const langPart = (lang && lang.trim()) ? lang.trim() : '';
                if (selected.trim()) {
                    const trimmed = selected.trim();
                    if (trimmed.startsWith('```') && trimmed.endsWith('```')) {
                        const lines = trimmed.split('\n');
                        if (lines.length >= 3) {
                            const inner = lines.slice(1, lines.length - 1).join('\n');
                            textarea.setRangeText(inner, start, end, 'select');
                            textarea.setSelectionRange(start, start + inner.length);
                        } else {
                            const wrapped = '```' + langPart + '\n' + selected + '\n```';
                            textarea.setRangeText(wrapped, start, end, 'select');
                            textarea.setSelectionRange(start + wrapped.length, start + wrapped.length);
                        }
                    } else {
                        const wrapped = '```' + langPart + '\n' + selected + '\n```';
                        textarea.setRangeText(wrapped, start, end, 'select');
                        textarea.setSelectionRange(start + wrapped.length, start + wrapped.length);
                    }
                } else {
                    TextOps.insertTemplate(textarea, start, '```' + langPart + '\n%CURSOR%\n```');
                }
                break;
            case 'block-wrap':
                if (selected.trim()) {
                    const wrapped = btnDef.open + selected + btnDef.close;
                    textarea.setRangeText(wrapped, start, end, 'select');
                    textarea.setSelectionRange(start + wrapped.length, start + wrapped.length);
                } else {
                    TextOps.insertTemplate(textarea, start, btnDef.open + '%CURSOR%' + btnDef.close);
                }
                break;
            case 'template':
                TextOps.insertTemplate(textarea, start, btnDef.template);
                break;
        }
        textarea.focus();
        historyManager.pushAfterAction();
    }

    // ========================================================================
    // 6. СОЗДАНИЕ ПАНЕЛИ
    // ========================================================================
    function removeAllToolbars() {
        document.querySelectorAll('#lor-md-toolbar').forEach(el => el.remove());
        document.querySelectorAll('textarea[data-md-init="1"]').forEach(ta => ta.dataset.mdInit = '');
    }

    function buildToolbar(textarea) {
        try { const saved = JSON.parse(localStorage.getItem(CFG_KEY_MD)); if (saved && saved.enabled === false) return; } catch(e) {}
        const parent = textarea.parentElement;
        if (!parent) return;
        if (getComputedStyle(parent).flexDirection === 'row') parent.style.flexDirection = 'column';
        if (parent.querySelector('#lor-md-toolbar')) return;
        textarea.dataset.mdInit = '1';
        historyManager.init(textarea);
        const panel = document.createElement('div');
        panel.id = 'lor-md-toolbar';
        panel.style.cssText = `width:100% !important; flex:1 1 100% !important; order:-1; display:flex; flex-wrap:wrap; gap:${px(6)}; align-items:center; padding:${px(8)} ${px(12)}; margin:0 0 ${px(10)} 0; background:${CFG.theme.panelBg}; border:1px solid ${CFG.theme.border}; border-radius:${px(6)}; box-sizing:border-box;`;
        BTN_DEFS.forEach(b => {
            if (b.sep) { const s = document.createElement('div'); s.style.cssText = `width:1px; height:${px(24)}; background:${CFG.theme.sep}; margin:0 ${px(4)}; flex-shrink:0;`; panel.appendChild(s); return; }
            const el = document.createElement('button');
            el.type = 'button'; el.textContent = b.i; el.title = b.t;
            el.style.cssText = `min-width:${px(28)}; height:${px(28)}; padding:0 ${px(7)}; background:${CFG.theme.btn}; color:${CFG.theme.txt}; border:1px solid ${CFG.theme.border}; border-radius:${px(4)}; cursor:pointer; font-size:${px(14)}; font-weight:500; transition:all .12s ease; display:flex; align-items:center; justify-content:center; user-select:none;`;
            el.onmouseenter = () => { el.style.background = CFG.theme.btnH; el.style.borderColor = CFG.accent; };
            el.onmouseleave = () => { el.style.background = CFG.theme.btn; el.style.borderColor = CFG.theme.border; };
            if (b.action === 'undo') el.onclick = () => historyManager.undo();
            else if (b.action === 'redo') el.onclick = () => historyManager.redo();
            else { el.onclick = (e) => { e.preventDefault(); handleButtonClick(textarea, b); el.style.background = CFG.accent; el.style.color = '#fff'; setTimeout(() => { el.style.background = CFG.theme.btn; el.style.color = CFG.theme.txt; }, 150); }; if (b.hotkey) historyManager.registerHotkey(b, () => handleButtonClick(textarea, b)); }
            panel.appendChild(el);
        });
        parent.insertBefore(panel, textarea);
    }

    function applySettingsToPage() {
        try { const saved = JSON.parse(localStorage.getItem(CFG_KEY_MD)); CFG.enabled = saved?.enabled ?? true; } catch(e) { CFG.enabled = true; }
        if (CFG.enabled) { document.querySelectorAll('textarea[name="text"], textarea.form-control, textarea').forEach(ta => { if (!ta.dataset.mdInit) buildToolbar(ta); }); }
        else { removeAllToolbars(); }
    }

    // ========================================================================
    // 7. ИНТЕГРАЦИЯ В НАСТРОЙКИ
    // ========================================================================
    function integrateSettings() {
        const obs = new MutationObserver(() => {
            const overlay = document.getElementById('lor-settings-overlay'); if (!overlay) return;
            const generalTab = document.getElementById('lor-settings-tab-general'); if (!generalTab) return;
            const tabBar = generalTab.parentElement; if (!tabBar || tabBar.querySelector('#lor-settings-tab-markdown')) return;
            const mdTab = document.createElement('div'); mdTab.id = 'lor-settings-tab-markdown'; mdTab.textContent = 'Markdown';
            mdTab.style.cssText = `padding:8px 16px;cursor:pointer;border-bottom:2px solid transparent;color:${inactiveTabColor};font-size:${px(14)};font-weight:normal;`;
            tabBar.appendChild(mdTab);
            mdTab.onclick = function(e) {
                e.stopPropagation();
                Array.from(tabBar.children).forEach(t => { t.style.borderBottom = '2px solid transparent'; t.style.color = inactiveTabColor; t.style.fontWeight = 'normal'; });
                this.style.borderBottom = '2px solid #4a90d9'; this.style.color = '#4a90d9'; this.style.fontWeight = 'bold';
                const content = document.getElementById('lor-settings-tab-content'); if (!content) return;
                let isEnabled = true; try { const saved = JSON.parse(localStorage.getItem(CFG_KEY_MD)); isEnabled = saved?.enabled ?? true; } catch(e) {}
                content.innerHTML = `<div style="margin-bottom:${px(16)};"><label style="display:flex;align-items:center;gap:${px(8)};cursor:pointer;font-size:${px(14)};color:${CFG.theme.txt};"><input type="checkbox" id="lor-md-enabled" ${isEnabled ? 'checked' : ''} style="width:${px(16)};height:${px(16)};"><span>Включить панель форматирования</span></label></div><div style="margin-bottom:${px(14)};padding:${px(14)};font-size:${px(14)};color:${isDark ? '#888' : '#666'};background:${isDark ? '#111' : '#f5f5f5'};border-radius:${px(4)};">Умная панель: авто-нумерация, toggle-форматирование, 6 уровней заголовков, умные цитаты со страницы.<br></div>`;
                const mainSaveBtn = document.getElementById('lor-settings-save');
                if (mainSaveBtn && !mainSaveBtn.dataset.mdHooked) { mainSaveBtn.dataset.mdHooked = '1'; mainSaveBtn.addEventListener('click', () => { const checkbox = document.getElementById('lor-md-enabled'); if (checkbox) { localStorage.setItem(CFG_KEY_MD, JSON.stringify({ enabled: checkbox.checked })); applySettingsToPage(); } }, true); }
            };
            tabBar.addEventListener('click', (e) => { if (!e.target.closest('#lor-settings-tab-markdown')) { mdTab.style.borderBottom = '2px solid transparent'; mdTab.style.color = inactiveTabColor; mdTab.style.fontWeight = 'normal'; } }, true);
        });
        obs.observe(document.body, { childList: true, subtree: true });
    }

    // ========================================================================
    // 8. ИНИЦИАЛИЗАЦИЯ
    // ========================================================================
    function init() { if (CFG.enabled) { document.querySelectorAll('textarea[name="text"], textarea.form-control, textarea').forEach(ta => { if (!ta.dataset.mdInit) buildToolbar(ta); }); } integrateSettings(); }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(init, 500)); else setTimeout(init, 500);
    const domObs = new MutationObserver(() => { if (CFG.enabled) { document.querySelectorAll('textarea[name="text"], textarea.form-control, textarea').forEach(ta => { if (!ta.dataset.mdInit) buildToolbar(ta); }); } });
    domObs.observe(document.body || document.documentElement, { childList: true, subtree: true });
})();