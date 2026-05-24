// ==UserScript==
// @name         NSLorPanel Markdown Toolbar
// @namespace    test
// @match        https://www.linux.org.ru/*
// @match        https://linux.org.ru/*
// @grant        none
// @inject-into  page
// @run-at       document-end
// @version      9.16
// ==/UserScript==
(function() {
    'use strict';

    let savedPageSelection = '';
    let lastVisualRange = null;

    document.addEventListener('mouseup', function() {
        const sel = window.getSelection();
        const va = document.querySelector('#lor-visual-area');
        if (va && !va.contains(sel.anchorNode)) {
            savedPageSelection = sel.toString().trim();
        }
    });

    document.addEventListener('selectionchange', function() {
        const sel = window.getSelection();
        if (sel.rangeCount === 0) return;
        const range = sel.getRangeAt(0);
        const va = document.querySelector('#lor-visual-area');
        if (va && va.contains(range.commonAncestorContainer)) {
            lastVisualRange = range.cloneRange();
        }
    });

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

    const CFG = {
        scale: mainCfg.modalScale,
        theme: THEME_MAP[themeName] || THEME_MAP.black,
        accent: '#4a90d9',
        enabled: (() => {
            try { return JSON.parse(localStorage.getItem(CFG_KEY_MD))?.enabled ?? true; }
            catch(e) { return true; }
        })()
    };

    const px = (v) => `${Math.round(v * CFG.scale)}px`;

    function md2html(md) {
        let html = md;
        html = html.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        html = html.replace(/```(\w*)\n?([\s\S]*?)```/g, function(m, lang, code) {
            const cls = lang ? ' class="' + lang + '"' : '';
            return '<pre><code' + cls + '>' + code.trim() + '</code></pre>';
        });
        let lines = html.split('\n');
        let result = [];
        let stack = [];
        let inTable = false;
        let tableRows = [];
        for (let i = 0; i < lines.length; i++) {
            let line = lines[i];
            if (line.match(/^\|\s.*\s\|$/) && (line.match(/\|/g) || []).length >= 2) {
                if (!inTable) { inTable = true; tableRows = []; }
                let cells = line.split('|').filter((c, idx, arr) => {
                    if (idx === 0 && line.trim().startsWith('|')) return false;
                    if (idx === arr.length - 1 && line.trim().endsWith('|')) return false;
                    return true;
                });
                tableRows.push(cells.map(c => c.trim()));
                continue;
            } else if (inTable) {
                if (line.match(/^\|\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|$/)) continue;
                let tableHtml = '<table>';
                tableRows.forEach((row, idx) => {
                    tableHtml += '<tr>';
                    row.forEach(cell => {
                        if (cell.match(/^:?-+:?$/)) return;
                        let tag = idx === 0 ? 'th' : 'td';
                        tableHtml += `<${tag}>${cell}</${tag}>`;
                    });
                    tableHtml += '</tr>';
                });
                tableHtml += '</table>';
                result.push(tableHtml + '<br>');
                inTable = false; tableRows = [];
                continue;
            }
            let quoteMatch = line.match(/^((&gt; ?)+)(.*)/);
            if (quoteMatch && quoteMatch[3].trim()) {
                let level = (quoteMatch[1].match(/&gt;/g) || []).length;
                while (stack.length > level) { result.push('</blockquote>'); stack.pop(); }
                while (stack.length < level) { result.push('<blockquote>'); stack.push(1); }
                result.push(quoteMatch[3] + '<br>');
                continue;
            }
            while (stack.length > 0) { result.push('</blockquote>'); stack.pop(); }
            if (line.match(/^###### (.+)$/)) result.push('<h6>' + line.replace(/^###### /, '') + '</h6>');
            else if (line.match(/^##### (.+)$/)) result.push('<h5>' + line.replace(/^##### /, '') + '</h5>');
            else if (line.match(/^#### (.+)$/)) result.push('<h4>' + line.replace(/^#### /, '') + '</h4>');
            else if (line.match(/^### (.+)$/)) result.push('<h3>' + line.replace(/^### /, '') + '</h3>');
            else if (line.match(/^## (.+)$/)) result.push('<h2>' + line.replace(/^## /, '') + '</h2>');
            else if (line.match(/^# (.+)$/)) result.push('<h1>' + line.replace(/^# /, '') + '</h1>');
            else if (line.match(/^    (.+)$/)) result.push('<pre>' + line.replace(/^    /, '') + '</pre>');
            else if (line.match(/^\* (.+)$/)) result.push('<li>' + line.replace(/^\* /, '') + '</li>');
            else if (line.match(/^\d+\. (.+)$/)) result.push('<li>' + line.replace(/^\d+\. /, '') + '</li>');
            else if (line.match(/^---$/)) result.push('<hr>');
            else if (line.trim()) result.push(line + '<br>');
            else result.push('<br>');
        }
        while (stack.length > 0) { result.push('</blockquote>'); stack.pop(); }
        if (inTable) {
            result.push('<table><tr><td>' + tableRows.map(r => r.join(' | ')).join('</td></tr><tr><td>') + '</td></tr></table><br>');
        }
        html = result.join('');
        html = html.replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2">$1</a>');
        html = html.replace(/@(\w+)/g, '<a href="https://www.linux.org.ru/people/$1/profile" class="mention">@$1</a>');
        html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
        html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
        html = html.replace(/__(.+?)__/g, '<strong>$1</strong>');
        html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
        html = html.replace(/_(.+?)_/g, '<em>$1</em>');
        html = html.replace(/~~(.+?)~~/g, '<del>$1</del>');
        html = html.replace(/`(.+?)`/g, '<code>$1</code>');
        return html;
    }

    function html2md(html) {
        let div = document.createElement('div');
        div.innerHTML = html;
        function processNode(node, depth) {
            if (node.nodeType === 3) return node.textContent;
            if (node.nodeType !== 1) return '';
            let tag = node.tagName.toLowerCase();
            if (tag === 'br') return '\n';
            if (tag === 'strong' || tag === 'b') return '**' + processChildren(node, depth) + '**';
            if (tag === 'em' || tag === 'i') return '*' + processChildren(node, depth) + '*';
            if (tag === 'del' || tag === 'strike') return '~~' + processChildren(node, depth) + '~~';
            if (tag === 'code') {
                if (node.parentElement && node.parentElement.tagName.toLowerCase() === 'pre') return processChildren(node, depth);
                return '`' + processChildren(node, depth) + '`';
            }
            if (tag === 'a' && node.classList.contains('mention')) {
                return '@' + processChildren(node, depth).replace(/^@/, '');
            }
            if (tag === 'a') return '[' + processChildren(node, depth) + '](' + node.getAttribute('href') + ')';
            if (tag === 'span' && node.className === 'mention') return '@' + processChildren(node, depth).replace('@', '');
            if (tag === 'blockquote') {
                let myDepth = depth + 1;
                let content = processChildren(node, myDepth).trim();
                let prefix = '>'.repeat(myDepth) + ' ';
                let lines = content.split('\n');
                let res = lines.map(line => {
                    if (!line.trim()) return '';
                    if (line.match(/^>+/)) return line;
                    return prefix + line;
                }).filter(line => line !== '');
                return res.join('\n') + '\n';
            }
            if (tag === 'h1') return '# ' + processChildren(node, depth) + '\n\n';
            if (tag === 'h2') return '## ' + processChildren(node, depth) + '\n\n';
            if (tag === 'h3') return '### ' + processChildren(node, depth) + '\n\n';
            if (tag === 'h4') return '#### ' + processChildren(node, depth) + '\n\n';
            if (tag === 'h5') return '##### ' + processChildren(node, depth) + '\n\n';
            if (tag === 'h6') return '###### ' + processChildren(node, depth) + '\n\n';
            if (tag === 'li') return '* ' + processChildren(node, depth) + '\n';
            if (tag === 'pre') {
                let code = node.querySelector('code');
                let lang = code ? code.className : '';
                let content = (code || node).textContent;
                if (lang) return '```' + lang + '\n' + content + '\n```\n\n';
                return '```\n' + content + '\n```\n\n';
            }
            if (tag === 'hr') return '---\n';
            if (tag === 'table') {
                let rows = node.querySelectorAll('tr');
                let md = '';
                rows.forEach((row, i) => {
                    let cells = row.querySelectorAll('th, td');
                    let cellTexts = Array.from(cells).map(c => processNode(c, depth).trim());
                    md += '| ' + cellTexts.join(' | ') + ' |\n';
                    if (i === 0) md += '|' + Array.from(cells).map(() => ' --- ').join('|') + '|\n';
                });
                return md + '\n';
            }
            return processChildren(node, depth);
        }
        function processChildren(node, depth) {
            let content = '';
            for (let child of node.childNodes) content += processNode(child, depth);
            return content;
        }
        return processNode(div, 0).replace(/\n{3,}/g, '\n\n').trim();
    }

    const TextOps = {
        getLines(textarea, start, end) {
            const full = textarea.value;
            const selected = full.substring(start, end);
            if (!selected.includes('\n')) return [{ text: selected, start, end, fullLine: false }];
            const before = full.substring(0, start);
            const after = full.substring(end);
            const lineStart = before.lastIndexOf('\n') + 1;
            const lineEnd = full.indexOf('\n', end) === -1 ? full.length : full.indexOf('\n', end);
            const fullBlock = full.substring(lineStart, lineEnd);
            const lines = fullBlock.split('\n');
            return lines.map((line, i) => {
                let acc = lineStart;
                for (let j = 0; j < i; j++) acc += lines[j].length + 1;
                return { text: line, start: acc, end: acc + line.length, fullLine: true };
            });
        },
        applyToEachLine(textarea, start, end, prefixFn) {
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
            const clean = template.replace(cursorMark, '');
            textarea.setRangeText(clean, start, start, 'end');
            if (template.includes(cursorMark)) {
                const pos = start + template.indexOf(cursorMark);
                textarea.setSelectionRange(pos, pos);
            }
        }
    };

    const BTN_DEFS = [
        {i:'↩', t:'Отменить (Ctrl+Z)', action:'undo'},
        {i:'↪', t:'Повторить (Ctrl+Y)', action:'redo'},
        {sep:1},
        {i:'𝐁', t:'Жирный (Ctrl+B)', md:{type:'wrap', patterns:[{p:'**',s:'**'}, {p:'__',s:'__'}]}, visual:{cmd:'bold'}, hotkey:{key:'b',ctrl:true}},
        {i:'𝘐', t:'Курсив (Ctrl+I)', md:{type:'wrap', patterns:[{p:'*',s:'*'}, {p:'_',s:'_'}]}, visual:{cmd:'italic'}, hotkey:{key:'i',ctrl:true}},
        {i:'𝓑𝘐', t:'Жирный курсив', md:{type:'wrap', patterns:[{p:'***',s:'***'}]}, visual:{cmd:'boldItalic'}},
        {i:'𝓢', t:'Зачёркнутый', md:{type:'wrap', patterns:[{p:'~~',s:'~~'}]}, visual:{cmd:'strikeThrough'}},
        {i:'⌨', t:'Код в строке', md:{type:'wrap', patterns:[{p:'`',s:'`'}]}, visual:{cmd:'code'}},
        {sep:1},
        {i:'↩', t:'Прервать тег', md:{type:'break-tag'}, visual:{cmd:'break-tag'}},
        {sep:1},
        {i:'❝', t:'Цитата', md:{type:'quote', quotePrefix: '> '}, visual:{cmd:'blockquote'}},
        {i:'❝❝', t:'Вложенная цитата', md:{type:'quote', quotePrefix: '>> '}, visual:{cmd:'indent'}},
        {i:'</>', t:'Блок кода', md:{type:'code-block'}, visual:{cmd:'insertCodeBlock'}},
        {i:'</>🔤', t:'Блок кода с языком', md:{type:'code-block-lang'}, visual:{cmd:'insertCodeBlockLang'}},
        {i:'#', t:'Заголовок 1', md:{type:'line-prefix', prefix:'# '}, visual:{cmd:'formatBlock', arg:1}},
        {i:'##', t:'Заголовок 2', md:{type:'line-prefix', prefix:'## '}, visual:{cmd:'formatBlock', arg:2}},
        {i:'###', t:'Заголовок 3', md:{type:'line-prefix', prefix:'### '}, visual:{cmd:'formatBlock', arg:3}},
        {i:'####', t:'Заголовок 4', md:{type:'line-prefix', prefix:'#### '}, visual:{cmd:'formatBlock', arg:4}},
        {i:'#####', t:'Заголовок 5', md:{type:'line-prefix', prefix:'##### '}, visual:{cmd:'formatBlock', arg:5}},
        {i:'######', t:'Заголовок 6', md:{type:'line-prefix', prefix:'###### '}, visual:{cmd:'formatBlock', arg:6}},
        {sep:1},
        {i:'🔗', t:'Ссылка', md:{type:'smart-wrap', p:'[', s:'](url)', placeholder:'текст', cursorOn:'text'}, visual:{cmd:'createLink'}},
        {i:'@', t:'Упоминание', md:{type:'smart-wrap', p:'@', s:'', placeholder:'ник', cursorAfter:true}, visual:{cmd:'insertMention'}},
        {sep:1},
        {i:'•', t:'Маркированный список', md:{type:'line-prefix', prefix:'* ', multiline:true}, visual:{cmd:'insertUnorderedList'}},
        {i:'1.', t:'Нумерованный список', md:{type:'line-prefix', prefixFn:(n) => `${n}. `, multiline:true}, visual:{cmd:'insertOrderedList'}},
        {sep:1},
        {i:'▦L', t:'Таблица (←:→)', md:{type:'template', template:'| Left | Center | Right |\n|:-----|:------:|------:|\n| %CURSOR% | B | C |\n'}, visual:{cmd:'insertTableAlign'}},
        {i:'▦', t:'Таблица', md:{type:'template', template:'| Заголовок 1 | Заголовок 2 |\n|---------------|---------------|\n| %CURSOR% | Ячейка 2 |\n'}, visual:{cmd:'insertTable'}},
        {sep:1},
        {i:'—', t:'Горизонтальная линия', md:{type:'template', template:'\n---\n%CURSOR%\n'}, visual:{cmd:'insertHorizontalRule'}},
        {i:'␣', t:'Pre-formatted', md:{type:'line-prefix', prefix:'    ', multiline:true}, visual:{cmd:'formatBlock', arg:'pre'}}
    ];

    // === HISTORY MANAGER (FIXED) ===
    const historyManager = (() => {
        const stack = [], visualStack = [], maxLen = 50;
        let idx = -1, visualIdx = -1;
        let ta = null, visualArea = null;
        let debounce = null, visualDebounce = null;
        let skipNextInput = false, skipNextVisualInput = false;
        const hotkeys = [];

        function pushState() {
            if (!ta) return;
            if (idx >= 0 && stack[idx] === ta.value) return;
            stack.splice(idx + 1);
            stack.push(ta.value);
            if (stack.length > maxLen) stack.shift();
            idx = stack.length - 1;
            updateUI();
        }

        function pushVisualState() {
            if (!visualArea) return;
            const content = visualArea.innerHTML;
            if (visualIdx >= 0 && visualStack[visualIdx] === content) return;
            visualStack.splice(visualIdx + 1);
            visualStack.push(content);
            if (visualStack.length > maxLen) visualStack.shift();
            visualIdx = visualStack.length - 1;
            updateUI();
        }

        function restoreState(newIdx) {
            idx = newIdx;
            if (ta) {
                ta.value = stack[idx];
                ta.dispatchEvent(new Event('input', { bubbles: true }));
            }
            if (visualArea && visualArea.offsetParent !== null) {
                visualArea.innerHTML = md2html(ta.value);
            }
            updateUI();
        }

        function restoreVisualState(newIdx) {
            visualIdx = newIdx;
            if (visualArea) {
                visualArea.innerHTML = visualStack[visualIdx];
                syncTextarea(visualArea);
            }
            updateUI();
        }

        function updateUI() {
            document.querySelectorAll('.lor-toolbar').forEach(toolbar => {
                const u = toolbar.querySelector('button[title*="Отменить"]');
                const r = toolbar.querySelector('button[title*="Повторить"]');
                if (!u || !r) return;
                const isVisualActive = visualArea && visualArea.offsetParent !== null;
                const canUndo = isVisualActive ? visualIdx > 0 : idx > 0;
                const canRedo = isVisualActive ? visualIdx < visualStack.length - 1 : idx < stack.length - 1;
                u.style.opacity = canUndo ? '1' : '0.4';
                u.style.pointerEvents = canUndo ? 'auto' : 'none';
                r.style.opacity = canRedo ? '1' : '0.4';
                r.style.pointerEvents = canRedo ? 'auto' : 'none';
            });
        }

        document.addEventListener('keydown', function(e) {
            const activeEl = document.activeElement;
            const isVisualActive = visualArea && visualArea.offsetParent !== null;
            const target = isVisualActive ? visualArea : ta;
            if (activeEl !== target) return;
            const key = e.key.toLowerCase();
            if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && key === 'z') {
                e.preventDefault();
                if (isVisualActive) undoVisual(); else undo();
                return;
            }
            if ((e.ctrlKey || e.metaKey) && !e.altKey && (key === 'y' || (e.shiftKey && key === 'z'))) {
                e.preventDefault();
                if (isVisualActive) redoVisual(); else redo();
                return;
            }
            if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey) {
                for (const { config, handler } of hotkeys) {
                    if (config.key === key && config.ctrl === true) {
                        e.preventDefault(); handler(); return;
                    }
                }
            }
        }, true);

        return {
            init: function(textarea, va) {
                ta = textarea;
                visualArea = va;
                stack.length = 0; visualStack.length = 0;
                idx = -1; visualIdx = -1;
                pushState();
                if (va) pushVisualState();
                ta.addEventListener('input', () => {
                    if (skipNextInput) { skipNextInput = false; return; }
                    clearTimeout(debounce);
                    debounce = setTimeout(pushState, 200);
                }, true);
                if (va) {
                    va.addEventListener('input', () => {
                        if (skipNextVisualInput) { skipNextVisualInput = false; return; }
                        clearTimeout(visualDebounce);
                        visualDebounce = setTimeout(pushVisualState, 200);
                    }, true);
                }
                updateUI();
            },
            registerHotkey: function(def, handler) {
                if (def.hotkey) hotkeys.push({ config: def.hotkey, handler });
            },
            undo: function() { if (idx > 0) restoreState(idx - 1); },
            redo: function() { if (idx < stack.length - 1) restoreState(idx + 1); },
            undoVisual: function() { if (visualIdx > 0) restoreVisualState(visualIdx - 1); },
            redoVisual: function() { if (visualIdx < visualStack.length - 1) restoreVisualState(visualIdx + 1); },
            pushAfterAction: function() {
                skipNextInput = true;
                if (visualArea && visualArea.offsetParent !== null) skipNextVisualInput = true;
                pushState();
                if (visualArea) pushVisualState();
            },
            getTextarea: function() { return ta; },
            getVisualArea: function() { return visualArea; }
        };
    })();

    function syncTextarea(visualArea) {
        const ta = historyManager.getTextarea();
        if (ta) {
            ta.value = html2md(visualArea.innerHTML);
            ta.dispatchEvent(new Event('input', { bubbles: true }));
        }
    }

    function insertBlockAtCursor(visualArea, content, wrapperFn) {
        let range = lastVisualRange;
        if (!range || !visualArea.contains(range.commonAncestorContainer)) {
            range = document.createRange();
            range.selectNodeContents(visualArea);
            range.collapse(false);
        }
        const node = wrapperFn(content);
        range.deleteContents();
        range.insertNode(node);
        range.setStartAfter(node);
        range.collapse(true);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
        syncTextarea(visualArea);
        visualArea.focus();
    }

    function insertNodeAtCursor(visualArea, node) {
        let range = lastVisualRange;
        if (!range || !visualArea.contains(range.commonAncestorContainer)) {
            range = document.createRange();
            range.selectNodeContents(visualArea);
            range.collapse(false);
        }
        range.deleteContents();
        range.insertNode(node);
        const newRange = document.createRange();
        newRange.setStartAfter(node);
        newRange.collapse(true);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(newRange);
        syncTextarea(visualArea);
        visualArea.focus();
    }

    function setHeader(visualArea, level) {
        const sel = window.getSelection();
        if (!sel.rangeCount) return;
        let node = sel.anchorNode;
        if (node.nodeType === 3) node = node.parentNode;
        let block = node;
        while (block && block !== visualArea) {
            const tag = block.tagName;
            if (['P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE', 'PRE'].includes(tag)) break;
            block = block.parentNode;
        }
        if (!block || block === visualArea) {
            document.execCommand('formatBlock', false, 'p');
            block = sel.anchorNode.parentNode;
            while (block && block !== visualArea && !['P', 'DIV'].includes(block.tagName)) block = block.parentNode;
        }
        const targetTag = `H${level}`;
        if (block.tagName === targetTag) {
            const p = document.createElement('p');
            p.innerHTML = block.innerHTML || '\u00A0';
            block.replaceWith(p);
            block = p;
        } else {
            const h = document.createElement(targetTag);
            h.innerHTML = block.innerHTML || '\u00A0';
            block.replaceWith(h);
            block = h;
        }
        const range = document.createRange();
        range.selectNodeContents(block);
        range.collapse(false);
        sel.removeAllRanges();
        sel.addRange(range);
        syncTextarea(visualArea);
    }

    function executeMarkdownAction(textarea, def) {
        if (!def.md) return;
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const selected = textarea.value.substring(start, end);
        const md = def.md;
        switch(md.type) {
            case 'wrap': {
                const result = TextOps.toggleWrap(textarea, start, end, md.patterns, md.placeholder);
                textarea.setSelectionRange(result.start, result.end);
                break;
            }
            case 'smart-wrap': {
                const sel = selected || md.placeholder;
                let wrapped = md.p + sel + md.s;
                textarea.setRangeText(wrapped, start, end, 'select');
                if (md.cursorOn === 'text') {
                    textarea.setSelectionRange(start + md.p.length, start + md.p.length + sel.length);
                } else if (md.cursorAfter) {
                    textarea.setSelectionRange(start + wrapped.length, start + wrapped.length);
                }
                break;
            }
            case 'line-prefix': {
                const res = TextOps.applyToEachLine(textarea, start, end, md.prefixFn || md.prefix);
                if (md.prefixFn) textarea.setSelectionRange(res.newStart, res.newStart);
                break;
            }
            case 'quote': {
                const qPrefix = md.quotePrefix || '> ';
                const pageSel = savedPageSelection || window.getSelection().toString().trim();
                savedPageSelection = '';
                if (pageSel && pageSel !== selected) {
                    const quoted = pageSel.split('\n').map(l => qPrefix + l).join('\n');
                    textarea.value += (textarea.value.trim() ? '\n\n' : '') + quoted + '\n';
                    textarea.focus();
                    textarea.scrollTop = textarea.scrollHeight;
                } else {
                    TextOps.applyToEachLine(textarea, start, end, qPrefix);
                }
                break;
            }
            case 'code-block': {
                if (selected.trim()) {
                    const trimmed = selected.trim();
                    if (trimmed.startsWith('```') && trimmed.endsWith('```')) {
                        const lines = trimmed.split('\n');
                        if (lines.length >= 3) {
                            const inner = lines.slice(1, lines.length - 1).join('\n');
                            textarea.setRangeText(inner, start, end, 'select');
                        }
                    } else {
                        textarea.setRangeText('```\n' + selected + '\n```', start, end, 'select');
                    }
                } else {
                    TextOps.insertTemplate(textarea, start, '```\n%CURSOR%\n```');
                }
                break;
            }
            case 'code-block-lang': {
                const lang = prompt('Язык разметки:', '');
                const langPart = lang ? lang.trim() : '';
                if (selected.trim()) {
                    textarea.setRangeText('```' + langPart + '\n' + selected + '\n```', start, end, 'select');
                } else {
                    TextOps.insertTemplate(textarea, start, '```' + langPart + '\n%CURSOR%\n```');
                }
                break;
            }
            case 'block-wrap': {
                if (selected.trim()) {
                    textarea.setRangeText(md.open + selected + md.close, start, end, 'select');
                } else {
                    TextOps.insertTemplate(textarea, start, md.open + '%CURSOR%' + md.close);
                }
                break;
            }
            case 'template': {
                TextOps.insertTemplate(textarea, start, md.template);
                break;
            }
            case 'break-tag': {
                const before = textarea.value.substring(0, start);
                const after = textarea.value.substring(end);
                textarea.value = before + '\n\n' + after;
                textarea.setSelectionRange(before.length + 2, before.length + 2);
                textarea.focus();
                break;
            }
        }
    }

    function executeVisualAction(visualArea, def) {
        if (!def.visual || Object.keys(def.visual).length === 0) return;
        const v = def.visual;
        if (v.cmd === 'insertMention') {
            const sel = window.getSelection();
            let username = sel.toString().trim();
            if (!username) {
                username = prompt('Никнейм пользователя:', '');
                if (!username) return;
            }
            username = username.replace(/^@/, '').trim();
            if (!username) return;
            const link = document.createElement('a');
            link.href = `https://www.linux.org.ru/people/${encodeURIComponent(username)}/profile`;
            link.textContent = '@' + username;
            link.className = 'mention';
            link.style.cssText = `color:${CFG.accent};text-decoration:none;font-weight:500;`;
            link.addEventListener('mouseenter', function() { this.style.textDecoration = 'underline'; });
            link.addEventListener('mouseleave', function() { this.style.textDecoration = 'none'; });
            if (sel.rangeCount) {
                const range = sel.getRangeAt(0);
                range.deleteContents();
                range.insertNode(link);
                const newRange = document.createRange();
                newRange.setStartAfter(link);
                newRange.collapse(true);
                sel.removeAllRanges();
                sel.addRange(newRange);
            }
            syncTextarea(visualArea);
            visualArea.focus();
            return;
        }
        if (v.cmd === 'insertTable' || v.cmd === 'insertTableAlign') {
            const isAlign = v.cmd === 'insertTableAlign';
            const table = document.createElement('table');
            table.style.cssText = 'border-collapse:collapse;margin:0.5em 0;width:100%;max-width:100%;';
            const thead = document.createElement('thead');
            const tbody = document.createElement('tbody');
            if (isAlign) {
                const headerRow = document.createElement('tr');
                const headers = [
                    {text: 'Left', align: 'left'},
                    {text: 'Center', align: 'center'},
                    {text: 'Right', align: 'right'}
                ];
                headers.forEach(h => {
                    const th = document.createElement('th');
                    th.textContent = h.text;
                    th.style.cssText = `border:1px solid ${CFG.theme.border};padding:0.5em;text-align:${h.align};background:${CFG.theme.btnH};`;
                    headerRow.appendChild(th);
                });
                thead.appendChild(headerRow);
                const bodyRow = document.createElement('tr');
                for (let i = 0; i < 3; i++) {
                    const td = document.createElement('td');
                    td.style.cssText = `border:1px solid ${CFG.theme.border};padding:0.5em;`;
                    if (i === 0) td.innerHTML = '<br>';
                    bodyRow.appendChild(td);
                }
                tbody.appendChild(bodyRow);
            } else {
                const headerRow = document.createElement('tr');
                ['Заголовок 1', 'Заголовок 2'].forEach(text => {
                    const th = document.createElement('th');
                    th.textContent = text;
                    th.style.cssText = `border:1px solid ${CFG.theme.border};padding:0.5em;background:${CFG.theme.btnH};`;
                    headerRow.appendChild(th);
                });
                thead.appendChild(headerRow);
                const bodyRow = document.createElement('tr');
                for (let i = 0; i < 2; i++) {
                    const td = document.createElement('td');
                    td.style.cssText = `border:1px solid ${CFG.theme.border};padding:0.5em;`;
                    if (i === 0) td.innerHTML = '<br>';
                    bodyRow.appendChild(td);
                }
                tbody.appendChild(bodyRow);
            }
            table.appendChild(thead);
            table.appendChild(tbody);
            insertNodeAtCursor(visualArea, table);
            return;
        }
        if (v.cmd === 'break-tag') {
            const sel = window.getSelection();
            let node = sel.anchorNode;
            while (node && node.nodeType === 3) node = node.parentElement;
            const inlineTags = ['STRONG', 'B', 'EM', 'I', 'DEL', 'STRIKE', 'CODE'];
            let tag = null;
            let current = node;
            while (current && current !== visualArea) {
                if (inlineTags.includes(current.tagName)) {
                    tag = current;
                    break;
                }
                current = current.parentElement;
            }
            if (tag) {
                let insertAfter = tag;
                while (insertAfter.parentElement && inlineTags.includes(insertAfter.parentElement.tagName)) {
                    insertAfter = insertAfter.parentElement;
                }
                const br = document.createElement('br');
                if (insertAfter.nextSibling) insertAfter.parentNode.insertBefore(br, insertAfter.nextSibling);
                else insertAfter.parentNode.appendChild(br);
                const range = document.createRange();
                range.setStartAfter(br); range.collapse(true);
                sel.removeAllRanges(); sel.addRange(range);
            }
            visualArea.focus();
            syncTextarea(visualArea);
            return;
        }
        if (v.cmd === 'boldItalic') {
            document.execCommand('bold', false, null);
            document.execCommand('italic', false, null);
            syncTextarea(visualArea); visualArea.focus(); return;
        }
        if (v.cmd === 'code') {
            const sel = window.getSelection();
            if (sel.rangeCount) {
                const range = sel.getRangeAt(0);
                const code = document.createElement('code');
                code.textContent = range.toString() || 'код';
                range.deleteContents(); range.insertNode(code);
                range.selectNodeContents(code); sel.removeAllRanges(); sel.addRange(range);
            }
            syncTextarea(visualArea); visualArea.focus(); return;
        }
        if (v.cmd === 'createLink') {
            const url = prompt('URL:', 'https://');
            if (url) document.execCommand('createLink', false, url);
            syncTextarea(visualArea); visualArea.focus(); return;
        }
        if (v.cmd === 'insertCodeBlock' || v.cmd === 'insertCodeBlockLang') {
            const isLang = v.cmd === 'insertCodeBlockLang';
            const lang = isLang ? prompt('Язык программирования:', '') : '';
            const sel = window.getSelection();
            if (sel.rangeCount) {
                const text = sel.toString() || 'код';
                const pre = document.createElement('pre');
                const code = document.createElement('code');
                if (isLang && lang) code.className = lang.trim();
                code.textContent = text;
                pre.appendChild(code);
                const range = sel.getRangeAt(0);
                range.deleteContents(); range.insertNode(pre);
                range.selectNodeContents(code); sel.removeAllRanges(); sel.addRange(range);
            }
            syncTextarea(visualArea); visualArea.focus(); return;
        }
        if (v.cmd === 'blockquote') {
            if (savedPageSelection) {
                insertBlockAtCursor(visualArea, savedPageSelection, (t) => {
                    const bq = document.createElement('blockquote');
                    bq.textContent = t;
                    return bq;
                });
                savedPageSelection = '';
            } else {
                const sel = window.getSelection();
                if (sel.rangeCount && visualArea.contains(sel.getRangeAt(0).commonAncestorContainer)) {
                    const range = sel.getRangeAt(0);
                    try { range.surroundContents(document.createElement('blockquote')); } catch(e) {}
                } else {
                    insertBlockAtCursor(visualArea, '\u00A0', (t) => {
                        const bq = document.createElement('blockquote');
                        bq.textContent = t;
                        return bq;
                    });
                }
                syncTextarea(visualArea);
            }
            visualArea.focus();
            return;
        }
        if (v.cmd === 'indent') {
            if (savedPageSelection) {
                insertBlockAtCursor(visualArea, savedPageSelection, (t) => {
                    const outer = document.createElement('blockquote');
                    const inner = document.createElement('blockquote');
                    inner.textContent = t;
                    outer.appendChild(inner);
                    return outer;
                });
                savedPageSelection = '';
            } else {
                const sel = window.getSelection();
                const text = (sel.rangeCount) ? sel.toString() : 'текст';
                insertBlockAtCursor(visualArea, text || '\u00A0', (t) => {
                    const outer = document.createElement('blockquote');
                    const inner = document.createElement('blockquote');
                    inner.textContent = t;
                    outer.appendChild(inner);
                    return outer;
                });
            }
            visualArea.focus();
            return;
        }
        if (v.cmd === 'formatBlock' && v.arg !== undefined) {
            if (typeof v.arg === 'number' && v.arg >= 1 && v.arg <= 6) {
                setHeader(visualArea, v.arg);
            } else if (v.arg === 'pre') {
                document.execCommand('formatBlock', false, 'pre');
                syncTextarea(visualArea);
            } else {
                document.execCommand('formatBlock', false, v.arg);
                syncTextarea(visualArea);
            }
            visualArea.focus();
            return;
        }
        if (v.cmd === 'formatBlock' && v.arg) {
            document.execCommand(v.cmd, false, v.arg);
        } else if (v.cmd) {
            document.execCommand(v.cmd, false, null);
        }
        syncTextarea(visualArea);
        visualArea.focus();
    }

    function buildToolbar(container, insertBefore, onAction) {
        const panel = document.createElement('div');
        panel.className = 'lor-toolbar';
        panel.style.cssText = [
            'display:flex', 'flex-wrap:wrap', `gap:${px(6)}`, 'align-items:center',
            `padding:${px(8)} ${px(12)}`, `margin:0 0 ${px(10)} 0`,
            `background:${CFG.theme.panelBg}`, `border:1px solid ${CFG.theme.border}`,
            `border-radius:${px(6)}`, 'box-sizing:border-box', 'width:100%', 'order:-1'
        ].join(';');
        BTN_DEFS.forEach(def => {
            if (def.sep) {
                const sep = document.createElement('div');
                sep.style.cssText = `width:1px;height:${px(24)};background:${CFG.theme.sep};margin:0 ${px(4)};flex-shrink:0;`;
                panel.appendChild(sep);
                return;
            }
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.textContent = def.i;
            btn.title = def.t;
            btn.style.cssText = [
                `min-width:${px(28)}`, `height:${px(28)}`, `padding:0 ${px(7)}`,
                `background:${CFG.theme.btn}`, `color:${CFG.theme.txt}`,
                `border:1px solid ${CFG.theme.border}`, `border-radius:${px(4)}`,
                'cursor:pointer', `font-size:${px(14)}`, 'font-weight:500',
                'display:flex', 'align-items:center', 'justify-content:center', 'user-select:none',
                'transition:background .12s ease'
            ].join(';');
            if (def.action === 'undo') {
                btn.style.opacity = '0.4';
                btn.style.pointerEvents = 'none';
                btn.addEventListener('click', () => {
                    const va = historyManager.getVisualArea();
                    if (va && va.offsetParent !== null) historyManager.undoVisual();
                    else historyManager.undo();
                });
            } else if (def.action === 'redo') {
                btn.style.opacity = '0.4';
                btn.style.pointerEvents = 'none';
                btn.addEventListener('click', () => {
                    const va = historyManager.getVisualArea();
                    if (va && va.offsetParent !== null) historyManager.redoVisual();
                    else historyManager.redo();
                });
            } else {
                btn.addEventListener('mouseenter', () => {
                    btn.style.background = CFG.theme.btnH;
                    btn.style.borderColor = CFG.accent;
                });
                btn.addEventListener('mouseleave', () => {
                    btn.style.background = CFG.theme.btn;
                    btn.style.borderColor = CFG.theme.border;
                });
                btn.addEventListener('click', (e) => {
                    e.preventDefault();
                    onAction(def);
                    btn.style.background = CFG.accent;
                    btn.style.color = '#fff';
                    setTimeout(() => {
                        btn.style.background = CFG.theme.btn;
                        btn.style.color = CFG.theme.txt;
                    }, 150);
                });
                if (def.hotkey) historyManager.registerHotkey(def, () => onAction(def));
            }
            panel.appendChild(btn);
        });
        container.insertBefore(panel, insertBefore);
        return panel;
    }

    function setupVisualEditor(textarea) {
        const formatGroup = textarea.closest('[data-format-mode]');
        if (!formatGroup) return;
        const nav = formatGroup.querySelector('.markup-tabs__nav');
        const panelsContainer = formatGroup.querySelector('.markup-tabs__content');
        if (!nav || !panelsContainer) return;
        if (nav.querySelector('[data-tab="visual"]')) return;

        const styleId = 'lor-visual-editor-styles';
        if (!document.getElementById(styleId)) {
            const style = document.createElement('style');
            style.id = styleId;
            style.textContent = `
                #lor-visual-area h1 { font-size: 2em; margin: 0.5em 0; font-weight: bold; }
                #lor-visual-area h2 { font-size: 1.75em; margin: 0.4em 0; font-weight: bold; }
                #lor-visual-area h3 { font-size: 1.5em; margin: 0.3em 0; font-weight: bold; }
                #lor-visual-area h4 { font-size: 1.25em; margin: 0.3em 0; font-weight: bold; }
                #lor-visual-area h5 { font-size: 1.1em; margin: 0.2em 0; font-weight: bold; }
                #lor-visual-area h6 { font-size: 1em; margin: 0.2em 0; font-weight: bold; opacity: 0.8; }
                #lor-visual-area p, #lor-visual-area div { margin: 0.5em 0; }
                #lor-visual-area blockquote { border-left: 3px solid ${CFG.accent}; padding-left: 1em; margin: 0.5em 0; opacity: 0.9; }
                #lor-visual-area pre { background: rgba(128,128,128,0.1); padding: 0.5em; border-radius: 4px; overflow-x: auto; }
                #lor-visual-area table { border-collapse: collapse; width: 100%; margin: 0.5em 0; }
                #lor-visual-area th, #lor-visual-area td { border: 1px solid ${CFG.theme.border}; padding: 0.5em; }
                #lor-visual-area a.mention { color: ${CFG.accent}; text-decoration: none; font-weight: 500; }
                #lor-visual-area a.mention:hover { text-decoration: underline; }
            `;
            document.head.appendChild(style);
        }

        const visualTab = document.createElement('li');
        visualTab.className = 'markup-tabs__tab';
        visualTab.dataset.tab = 'visual';
        visualTab.textContent = 'Визуальный редактор';
        nav.appendChild(visualTab);

        const visualPanel = document.createElement('div');
        visualPanel.className = 'markup-tabs__panel';
        visualPanel.dataset.panel = 'visual';

        const visualArea = document.createElement('div');
        visualArea.id = 'lor-visual-area';
        visualArea.contentEditable = 'true';
        visualArea.style.cssText = [
            'width:100%', 'min-height:250px', `padding:${px(10)}`,
            `border:1px solid ${CFG.theme.border}`, `border-radius:${px(4)}`,
            'outline:none', 'white-space:pre-wrap', 'word-wrap:break-word',
            'box-sizing:border-box', `background:${CFG.theme.bg}`, `color:${CFG.theme.txt}`,
            `font-size:${px(14)}`, 'line-height:1.5'
        ].join(';');

        visualPanel.appendChild(visualArea);
        panelsContainer.appendChild(visualPanel);
        historyManager.init(textarea, visualArea);
        buildToolbar(visualPanel, visualArea, (def) => executeVisualAction(visualArea, def));

        visualArea.addEventListener('keydown', function(e) {
            if (e.key !== 'Enter') return;
            const sel = window.getSelection();
            if (!sel.rangeCount) return;
            let node = sel.anchorNode;
            if (node.nodeType === 3) node = node.parentNode;
            let block = node;
            while (block && block !== visualArea) {
                const tag = block.tagName;
                if (['P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE', 'PRE', 'LI'].includes(tag)) break;
                block = block.parentNode;
            }
            if (!block || block === visualArea) return;
            let atEnd = false;
            if (sel.anchorNode.nodeType === 3) {
                atEnd = sel.anchorOffset >= sel.anchorNode.textContent.length;
            } else {
                atEnd = true;
            }
            if (block.tagName.match(/^H[1-6]$/)) {
                const p = document.createElement('p');
                p.innerHTML = '<br>';
                if (block.nextSibling) block.parentNode.insertBefore(p, block.nextSibling);
                else block.parentNode.appendChild(p);
                const range = document.createRange();
                range.setStart(p, 0);
                range.collapse(true);
                sel.removeAllRanges();
                sel.addRange(range);
                e.preventDefault();
            } else if (block.tagName === 'BLOCKQUOTE') {
                const text = block.textContent || '';
                if (text.trim() === '' || atEnd) {
                    const br = document.createElement('br');
                    block.parentNode.insertBefore(br, block.nextSibling);
                    const range = document.createRange();
                    range.setStartAfter(br); range.collapse(true);
                    sel.removeAllRanges(); sel.addRange(range);
                    e.preventDefault();
                } else {
                    document.execCommand('insertLineBreak');
                }
            } else if (block.tagName === 'LI') {
                const text = block.textContent || '';
                if (text.trim() === '' || atEnd) {
                    const list = block.parentElement;
                    const p = document.createElement('p');
                    p.innerHTML = '<br>';
                    if (list.nextSibling) {
                        list.parentNode.insertBefore(p, list.nextSibling);
                    } else {
                        list.parentNode.appendChild(p);
                    }
                    const range = document.createRange();
                    range.setStart(p, 0);
                    range.collapse(true);
                    sel.removeAllRanges();
                    sel.addRange(range);
                    e.preventDefault();
                } else {
                    document.execCommand('insertLineBreak');
                }
            } else {
                document.execCommand('insertLineBreak');
            }
            visualArea.focus();
            syncTextarea(visualArea);
        });

        visualArea.addEventListener('input', function() {
            syncTextarea(visualArea);
        });

        nav.addEventListener('click', function(e) {
            const tab = e.target.closest('.markup-tabs__tab');
            if (!tab || tab.dataset.tab !== 'visual') return;
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
            nav.querySelectorAll('.markup-tabs__tab').forEach(t => t.classList.remove('active'));
            panelsContainer.querySelectorAll('.markup-tabs__panel').forEach(p => p.classList.remove('active'));
            tab.classList.add('active');
            visualPanel.classList.add('active');
            visualArea.innerHTML = md2html(textarea.value);
            historyManager.pushAfterAction();
            setTimeout(() => {
                const range = document.createRange();
                const sel = window.getSelection();
                range.selectNodeContents(visualArea);
                range.collapse(false);
                sel.removeAllRanges();
                sel.addRange(range);
                visualArea.focus();
            }, 50);
        }, true);
    }

    function init() {
        if (!CFG.enabled) return;
        document.querySelectorAll('textarea[name="text"], textarea.form-control, textarea[name="msg"]').forEach(ta => {
            if (ta.dataset.mdInit) return;
            ta.dataset.mdInit = '1';
            const parent = ta.parentElement;
            if (!parent) return;
            if (getComputedStyle(parent).flexDirection === 'row') parent.style.flexDirection = 'column';
            buildToolbar(parent, ta, (def) => {
                executeMarkdownAction(ta, def);
                historyManager.pushAfterAction();
            });
            setupVisualEditor(ta);
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => setTimeout(init, 500));
    } else {
        setTimeout(init, 500);
    }

    const domObs = new MutationObserver(() => {
        if (CFG.enabled) {
            document.querySelectorAll('textarea[name="text"], textarea.form-control, textarea[name="msg"]').forEach(ta => {
                if (!ta.dataset.mdInit) {
                    ta.dataset.mdInit = '1';
                    const parent = ta.parentElement;
                    if (parent) {
                        if (getComputedStyle(parent).flexDirection === 'row') parent.style.flexDirection = 'column';
                        buildToolbar(parent, ta, (def) => {
                            executeMarkdownAction(ta, def);
                            historyManager.pushAfterAction();
                        });
                        setupVisualEditor(ta);
                    }
                }
            });
        }
    });
    domObs.observe(document.body || document.documentElement, { childList: true, subtree: true });
})();