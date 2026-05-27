// ==UserScript==
// @name         NSLorPanel Markdown Toolbar
// @namespace    test
// @match        https://www.linux.org.ru/*
// @match        https://linux.org.ru/*
// @grant        none
// @inject-into  page
// @run-at       document-end
// @version      9.20
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
const CFG_KEY_MD = 'lor_md_toolbar_settings_v2';
const CFG_KEY_MAIN = 'lor_panel_settings_v3';
function getMainConfig() {
    try {
        const main = JSON.parse(localStorage.getItem(CFG_KEY_MAIN));
        if (!main || typeof main.general !== 'object') return null;
        return {
            modalScale: Math.min(300, Math.max(30, main.general.modalScale || 100)) / 100,
            isDark: main.general.isDark !== undefined ? main.general.isDark : null
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
function isDarkTheme() {
    const t = detectTheme();
    return t === 'black' || t === 'tango';
}
const mainCfg = getMainConfig() || { modalScale: 1.0 };
const themeName = mainCfg.isDark !== null ? (mainCfg.isDark ? 'black' : 'white2') : detectTheme();
const THEME_MAP = {
    black: { isDark: true, txt: '#c8c8c8', bg: '#1a1a2e', border: '#444', btn: '#1a1a2e', btnH: '#16213e', sep: '#2a2a3a', panelBg: '#1a1a2e' },
    tango: { isDark: true, txt: '#babdb6', bg: '#2e3436', border: '#555', btn: '#2e3436', btnH: '#3e4547', sep: '#3e4547', panelBg: '#2e3436' },
    'tango-light': { isDark: false, txt: '#2e3436', bg: '#d3d7cf', border: '#888', btn: '#d3d7cf', btnH: '#c0c4bc', sep: '#b0b0b0', panelBg: '#d3d7cf' },
    'tango-auto': { isDark: false, txt: '#2e3436', bg: '#d3d7cf', border: '#888', btn: '#d3d7cf', btnH: '#c0c4bc', sep: '#b0b0b0', panelBg: '#d3d7cf' },
    white2: { isDark: false, txt: '#333333', bg: '#e8e8e8', border: '#ccc', btn: '#e8e8e8', btnH: '#d0d0d0', sep: '#d0d0d0', panelBg: '#e8e8e8' },
    waltz: { isDark: false, txt: '#333333', bg: '#ececec', border: '#ccc', btn: '#ececec', btnH: '#d8d8d8', sep: '#d8d8d8', panelBg: '#ececec' },
    zomg_ponies: { isDark: false, txt: '#333333', bg: '#ececec', border: '#ccc', btn: '#ececec', btnH: '#d8d8d8', sep: '#d8d8d8', panelBg: '#ececec' }
};
function getMdSettings() {
    try { return JSON.parse(localStorage.getItem(CFG_KEY_MD)) || {}; } catch(e) { return {}; }
}
function saveMdSettings(settings) {
    try { localStorage.setItem(CFG_KEY_MD, JSON.stringify(settings)); } catch(e) {}
}
const CFG = {
    scale: mainCfg.modalScale,
    theme: THEME_MAP[themeName] || THEME_MAP.black,
    accent: '#4a90d9'
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
            tableHtml += '</table><br>';
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
        if (tag === 'a' && node.classList.contains('mention')) return '@' + processChildren(node, depth).replace(/^@/, '');
        if (tag === 'a') return '[' + processChildren(node, depth) + '](' + node.getAttribute('href') + ')';
        if (tag === 'span' && node.className === 'mention') return '@' + processChildren(node, depth).replace('@', '');
        if (tag === 'blockquote') {
            let myDepth = depth + 1;
            let content = processChildren(node, myDepth).trim();
            let prefix = ' >'.repeat(myDepth) + ' ';
            let lines = content.split('\n');
            let res = lines.map(line => {
                if (!line.trim()) return '';
                if (line.match(/^ >+/)) return line;
                return prefix + line;
            }).filter(line => line !== '');
            return res.join('\n') + '\n';
        }
        if (tag === 'h1') return '# ' + processChildren(node, depth) + '\n';
        if (tag === 'h2') return '## ' + processChildren(node, depth) + '\n';
        if (tag === 'h3') return '### ' + processChildren(node, depth) + '\n';
        if (tag === 'h4') return '#### ' + processChildren(node, depth) + '\n';
        if (tag === 'h5') return '##### ' + processChildren(node, depth) + '\n';
        if (tag === 'h6') return '###### ' + processChildren(node, depth) + '\n';
        if (tag === 'li') return '* ' + processChildren(node, depth) + '\n';
        if (tag === 'pre') {
            let code = node.querySelector('code');
            let lang = code ? code.className : '';
            let content = (code || node).textContent;
            if (lang) return '```' + lang + '\n' + content + '\n```\n';
            return '```\n' + content + '\n```\n';
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
    return processNode(div, 0).replace(/\n{3,}/g, '\n').trim();
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
    {i:'↩', t:'Отменить (Ctrl+Z)', action:'undo', id:'undo'},
    {i:'↪', t:'Повторить (Ctrl+Y)', action:'redo', id:'redo'},
    {sep:1},
    {i:'𝐁', t:'Жирный (Ctrl+B)', md:{type:'wrap', patterns:[{p:'**',s:'**'}, {p:'__',s:'__'}]}, visual:{cmd:'bold'}, hotkey:{key:'b',ctrl:true}, id:'bold'},
    {i:'𝘐', t:'Курсив (Ctrl+I)', md:{type:'wrap', patterns:[{p:'*',s:'*'}, {p:'_',s:'_'}]}, visual:{cmd:'italic'}, hotkey:{key:'i',ctrl:true}, id:'italic'},
    {i:'𝓑𝘐', t:'Жирный курсив', md:{type:'wrap', patterns:[{p:'***',s:'***'}]}, visual:{cmd:'boldItalic'}, id:'boldItalic'},
    {i:'𝓢', t:'Зачёркнутый', md:{type:'wrap', patterns:[{p:'~~',s:'~~'}]}, visual:{cmd:'strikeThrough'}, id:'strike'},
    {i:'⌨', t:'Код в строке', md:{type:'wrap', patterns:[{p:'`',s:'`'}]}, visual:{cmd:'code'}, id:'inlineCode'},
    {sep:1},
    {i:'↩', t:'Прервать тег', md:{type:'break-tag'}, visual:{cmd:'break-tag'}, id:'breakTag'},
    {sep:1},
    {i:'❝', t:'Цитата', md:{type:'quote', quotePrefix:' > '}, visual:{cmd:'blockquote'}, id:'quote'},
    {i:'❝❝', t:'Вложенная цитата', md:{type:'quote', quotePrefix:' > > '}, visual:{cmd:'indent'}, id:'nestedQuote'},
    {i:'</>', t:'Блок кода', md:{type:'code-block'}, visual:{cmd:'insertCodeBlock'}, id:'codeBlock'},
    {i:'</>🔤', t:'Блок кода с языком', md:{type:'code-block-lang'}, visual:{cmd:'insertCodeBlockLang'}, id:'codeBlockLang'},
    {i:'#', t:'Заголовок 1', md:{type:'line-prefix', prefix:'# '}, visual:{cmd:'formatBlock', arg:1}, id:'h1'},
    {i:'##', t:'Заголовок 2', md:{type:'line-prefix', prefix:'## '}, visual:{cmd:'formatBlock', arg:2}, id:'h2'},
    {i:'###', t:'Заголовок 3', md:{type:'line-prefix', prefix:'### '}, visual:{cmd:'formatBlock', arg:3}, id:'h3'},
    {i:'####', t:'Заголовок 4', md:{type:'line-prefix', prefix:'#### '}, visual:{cmd:'formatBlock', arg:4}, id:'h4'},
    {i:'#####', t:'Заголовок 5', md:{type:'line-prefix', prefix:'##### '}, visual:{cmd:'formatBlock', arg:5}, id:'h5'},
    {i:'######', t:'Заголовок 6', md:{type:'line-prefix', prefix:'###### '}, visual:{cmd:'formatBlock', arg:6}, id:'h6'},
    {sep:1},
    {i:'🔗', t:'Ссылка', md:{type:'smart-wrap', p:'[', s:'](url)', placeholder:'текст', cursorOn:'text'}, visual:{cmd:'createLink'}, id:'link'},
    {i:'@', t:'Упоминание', md:{type:'smart-wrap', p:'@', s:'', placeholder:'ник', cursorAfter:true}, visual:{cmd:'insertMention'}, id:'mention'},
    {sep:1},
    {i:'•', t:'Маркированный список', md:{type:'line-prefix', prefix:'* ', multiline:true}, visual:{cmd:'insertUnorderedList'}, id:'unorderedList'},
    {i:'1.', t:'Нумерованный список', md:{type:'line-prefix', prefixFn:(n) => `${n}. `, multiline:true}, visual:{cmd:'insertOrderedList'}, id:'orderedList'},
    {sep:1},
    {i:'▦L', t:'Таблица (←:→)', md:{type:'template', template:'| Left | Center | Right |\n|:-----|:------:|------:|\n| %CURSOR% | B | C |\n'}, visual:{cmd:'insertTableAlign'}, id:'tableAlign'},
    {i:'▦', t:'Таблица', md:{type:'template', template:'| Заголовок 1 | Заголовок 2 |\n|---------------|---------------|\n| %CURSOR% | Ячейка 2 |\n'}, visual:{cmd:'insertTable'}, id:'table'},
    {sep:1},
    {i:'—', t:'Горизонтальная линия', md:{type:'template', template:'\n---\n%CURSOR%\n'}, visual:{cmd:'insertHorizontalRule'}, id:'hr'},
    {i:'␣', t:'Pre-formatted', md:{type:'line-prefix', prefix:'    ', multiline:true}, visual:{cmd:'formatBlock', arg:'pre'}, id:'pre'},
    {sep:1},
    {i:'⚙', t:'Настройки панели', action:'settings', id:'settings'},
    {i:'📋', t:'Шаблоны комментариев', action:'templates', id:'templates'}
];
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
            ta = textarea; visualArea = va;
            stack.length = 0; visualStack.length = 0; idx = -1; visualIdx = -1;
            pushState(); if (va) pushVisualState();
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
            pushState(); if (visualArea) pushVisualState();
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
        range = document.createRange(); range.selectNodeContents(visualArea); range.collapse(false);
    }
    const node = wrapperFn(content);
    range.deleteContents(); range.insertNode(node);
    range.setStartAfter(node); range.collapse(true);
    const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(range);
    syncTextarea(visualArea); visualArea.focus();
}
function insertNodeAtCursor(visualArea, node) {
    let range = lastVisualRange;
    if (!range || !visualArea.contains(range.commonAncestorContainer)) {
        range = document.createRange(); range.selectNodeContents(visualArea); range.collapse(false);
    }
    range.deleteContents(); range.insertNode(node);
    const newRange = document.createRange(); newRange.setStartAfter(node); newRange.collapse(true);
    const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(newRange);
    syncTextarea(visualArea); visualArea.focus();
}
function setHeader(visualArea, level) {
    const sel = window.getSelection(); if (!sel.rangeCount) return;
    let node = sel.anchorNode; if (node.nodeType === 3) node = node.parentNode;
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
        const p = document.createElement('p'); p.innerHTML = block.innerHTML || '\u00A0';
        block.replaceWith(p); block = p;
    } else {
        const h = document.createElement(targetTag); h.innerHTML = block.innerHTML || '\u00A0';
        block.replaceWith(h); block = h;
    }
    const range = document.createRange(); range.selectNodeContents(block); range.collapse(false);
    sel.removeAllRanges(); sel.addRange(range);
    syncTextarea(visualArea);
}
function executeMarkdownAction(textarea, def) {
    if (!def.md) return;
    const start = textarea.selectionStart; const end = textarea.selectionEnd;
    const selected = textarea.value.substring(start, end); const md = def.md;
    switch(md.type) {
        case 'wrap': { const result = TextOps.toggleWrap(textarea, start, end, md.patterns, md.placeholder); textarea.setSelectionRange(result.start, result.end); break; }
        case 'smart-wrap': { const sel = selected || md.placeholder; let wrapped = md.p + sel + md.s; textarea.setRangeText(wrapped, start, end, 'select'); if (md.cursorOn === 'text') textarea.setSelectionRange(start + md.p.length, start + md.p.length + sel.length); else if (md.cursorAfter) textarea.setSelectionRange(start + wrapped.length, start + wrapped.length); break; }
        case 'line-prefix': { const res = TextOps.applyToEachLine(textarea, start, end, md.prefixFn || md.prefix); if (md.prefixFn) textarea.setSelectionRange(res.newStart, res.newStart); break; }
        case 'quote': { const qPrefix = md.quotePrefix || ' > '; const pageSel = savedPageSelection || window.getSelection().toString().trim(); savedPageSelection = ''; if (pageSel && pageSel !== selected) { const quoted = pageSel.split('\n').map(l => qPrefix + l).join('\n'); textarea.value += (textarea.value.trim() ? '\n' : '') + quoted + '\n'; textarea.focus(); textarea.scrollTop = textarea.scrollHeight; } else { TextOps.applyToEachLine(textarea, start, end, qPrefix); } break; }
        case 'code-block': { if (selected.trim()) { const trimmed = selected.trim(); if (trimmed.startsWith('```') && trimmed.endsWith('```')) { const lines = trimmed.split('\n'); if (lines.length >= 3) { const inner = lines.slice(1, lines.length - 1).join('\n'); textarea.setRangeText(inner, start, end, 'select'); } } else { textarea.setRangeText('```\n' + selected + '\n```', start, end, 'select'); } } else { TextOps.insertTemplate(textarea, start, '```\n%CURSOR%\n```'); } break; }
        case 'code-block-lang': { const lang = prompt('Язык разметки:', ''); const langPart = lang ? lang.trim() : ''; if (selected.trim()) { textarea.setRangeText('```' + langPart + '\n' + selected + '\n```', start, end, 'select'); } else { TextOps.insertTemplate(textarea, start, '```' + langPart + '\n%CURSOR%\n```'); } break; }
        case 'block-wrap': { if (selected.trim()) textarea.setRangeText(md.open + selected + md.close, start, end, 'select'); else TextOps.insertTemplate(textarea, start, md.open + '%CURSOR%' + md.close); break; }
        case 'template': { TextOps.insertTemplate(textarea, start, md.template); break; }
        case 'break-tag': { const before = textarea.value.substring(0, start); const after = textarea.value.substring(end); textarea.value = before + '\n' + after; textarea.setSelectionRange(before.length + 2, before.length + 2); textarea.focus(); break; }
    }
}
function executeVisualAction(visualArea, def) {
    if (!def.visual || Object.keys(def.visual).length === 0) return;
    const v = def.visual;
    if (v.cmd === 'insertMention') {
        const sel = window.getSelection(); let username = sel.toString().trim();
        if (!username) { username = prompt('Никнейм пользователя:', ''); if (!username) return; }
        username = username.replace(/^@/, '').trim(); if (!username) return;
        const link = document.createElement('a');
        link.href = `https://www.linux.org.ru/people/${encodeURIComponent(username)}/profile`;
        link.textContent = '@' + username; link.className = 'mention';
        link.style.cssText = `color:${CFG.accent};text-decoration:none;font-weight:500;`;
        link.addEventListener('mouseenter', function() { this.style.textDecoration = 'underline'; });
        link.addEventListener('mouseleave', function() { this.style.textDecoration = 'none'; });
        if (sel.rangeCount) { const range = sel.getRangeAt(0); range.deleteContents(); range.insertNode(link); const newRange = document.createRange(); newRange.setStartAfter(link); newRange.collapse(true); sel.removeAllRanges(); sel.addRange(newRange); }
        syncTextarea(visualArea); visualArea.focus(); return;
    }
    if (v.cmd === 'insertTable' || v.cmd === 'insertTableAlign') {
        const isAlign = v.cmd === 'insertTableAlign';
        const table = document.createElement('table');
        table.style.cssText = 'border-collapse:collapse;margin:0.5em 0;width:100%;max-width:100%;';
        const thead = document.createElement('thead'), tbody = document.createElement('tbody');
        if (isAlign) {
            const headerRow = document.createElement('tr');
            [{text:'Left',align:'left'},{text:'Center',align:'center'},{text:'Right',align:'right'}].forEach(h => {
                const th = document.createElement('th'); th.textContent = h.text;
                th.style.cssText = `border:1px solid ${CFG.theme.border};padding:0.5em;text-align:${h.align};background:${CFG.theme.btnH};`; headerRow.appendChild(th);
            });
            thead.appendChild(headerRow);
            const bodyRow = document.createElement('tr');
            for (let i = 0; i < 3; i++) { const td = document.createElement('td'); td.style.cssText = `border:1px solid ${CFG.theme.border};padding:0.5em;`; if (i === 0) td.innerHTML = '<br>'; bodyRow.appendChild(td); }
            tbody.appendChild(bodyRow);
        } else {
            const headerRow = document.createElement('tr');
            ['Заголовок 1', 'Заголовок 2'].forEach(text => {
                const th = document.createElement('th'); th.textContent = text;
                th.style.cssText = `border:1px solid ${CFG.theme.border};padding:0.5em;background:${CFG.theme.btnH};`; headerRow.appendChild(th);
            });
            thead.appendChild(headerRow);
            const bodyRow = document.createElement('tr');
            for (let i = 0; i < 2; i++) { const td = document.createElement('td'); td.style.cssText = `border:1px solid ${CFG.theme.border};padding:0.5em;`; if (i === 0) td.innerHTML = '<br>'; bodyRow.appendChild(td); }
            tbody.appendChild(bodyRow);
        }
        table.appendChild(thead); table.appendChild(tbody); insertNodeAtCursor(visualArea, table); return;
    }
    if (v.cmd === 'break-tag') {
        const sel = window.getSelection(); let node = sel.anchorNode; while (node && node.nodeType === 3) node = node.parentElement;
        const inlineTags = ['STRONG', 'B', 'EM', 'I', 'DEL', 'STRIKE', 'CODE']; let tag = null, current = node;
        while (current && current !== visualArea) { if (inlineTags.includes(current.tagName)) { tag = current; break; } current = current.parentElement; }
        if (tag) {
            let insertAfter = tag; while (insertAfter.parentElement && inlineTags.includes(insertAfter.parentElement.tagName)) insertAfter = insertAfter.parentElement;
            const br = document.createElement('br'); if (insertAfter.nextSibling) insertAfter.parentNode.insertBefore(br, insertAfter.nextSibling); else insertAfter.parentNode.appendChild(br);
            const range = document.createRange(); range.setStartAfter(br); range.collapse(true); sel.removeAllRanges(); sel.addRange(range);
        }
        visualArea.focus(); syncTextarea(visualArea); return;
    }
    if (v.cmd === 'boldItalic') { document.execCommand('bold', false, null); document.execCommand('italic', false, null); syncTextarea(visualArea); visualArea.focus(); return; }
    if (v.cmd === 'code') {
        const sel = window.getSelection(); if (sel.rangeCount) { const range = sel.getRangeAt(0); const code = document.createElement('code'); code.textContent = range.toString() || 'код'; range.deleteContents(); range.insertNode(code); range.selectNodeContents(code); sel.removeAllRanges(); sel.addRange(range); }
        syncTextarea(visualArea); visualArea.focus(); return;
    }
    if (v.cmd === 'createLink') { const url = prompt('URL:', 'https://'); if (url) document.execCommand('createLink', false, url); syncTextarea(visualArea); visualArea.focus(); return; }
    if (v.cmd === 'insertCodeBlock' || v.cmd === 'insertCodeBlockLang') {
        const isLang = v.cmd === 'insertCodeBlockLang'; const lang = isLang ? prompt('Язык программирования:', '') : '';
        const sel = window.getSelection();
        if (sel.rangeCount) { const text = sel.toString() || 'код'; const pre = document.createElement('pre'), code = document.createElement('code'); if (isLang && lang) code.className = lang.trim(); code.textContent = text; pre.appendChild(code); const range = sel.getRangeAt(0); range.deleteContents(); range.insertNode(pre); range.selectNodeContents(code); sel.removeAllRanges(); sel.addRange(range); }
        syncTextarea(visualArea); visualArea.focus(); return;
    }
    if (v.cmd === 'blockquote') {
        if (savedPageSelection) { insertBlockAtCursor(visualArea, savedPageSelection, (t) => { const bq = document.createElement('blockquote'); bq.textContent = t; return bq; }); savedPageSelection = ''; }
        else { const sel = window.getSelection(); if (sel.rangeCount && visualArea.contains(sel.getRangeAt(0).commonAncestorContainer)) { const range = sel.getRangeAt(0); try { range.surroundContents(document.createElement('blockquote')); } catch(e) {} } else { insertBlockAtCursor(visualArea, '\u00A0', (t) => { const bq = document.createElement('blockquote'); bq.textContent = t; return bq; }); } syncTextarea(visualArea); }
        visualArea.focus(); return;
    }
    if (v.cmd === 'indent') {
        if (savedPageSelection) { insertBlockAtCursor(visualArea, savedPageSelection, (t) => { const outer = document.createElement('blockquote'); const inner = document.createElement('blockquote'); inner.textContent = t; outer.appendChild(inner); return outer; }); savedPageSelection = ''; }
        else { const sel = window.getSelection(); const text = (sel.rangeCount) ? sel.toString() : 'текст'; insertBlockAtCursor(visualArea, text || '\u00A0', (t) => { const outer = document.createElement('blockquote'); const inner = document.createElement('blockquote'); inner.textContent = t; outer.appendChild(inner); return outer; }); }
        visualArea.focus(); return;
    }
    if (v.cmd === 'formatBlock' && v.arg !== undefined) {
        if (typeof v.arg === 'number' && v.arg >= 1 && v.arg <= 6) setHeader(visualArea, v.arg);
        else if (v.arg === 'pre') { document.execCommand('formatBlock', false, 'pre'); syncTextarea(visualArea); }
        else { document.execCommand('formatBlock', false, v.arg); syncTextarea(visualArea); }
        visualArea.focus(); return;
    }
    if (v.cmd === 'formatBlock' && v.arg) document.execCommand(v.cmd, false, v.arg); else if (v.cmd) document.execCommand(v.cmd, false, null);
    syncTextarea(visualArea); visualArea.focus();
}
function mdCreateInput(ph, modalScale, isDark) {
    const inp = document.createElement('input'); inp.type = 'text'; inp.placeholder = ph;
    inp.style.cssText = `width:100%;padding:8px 10px;background:${isDark ? '#111' : '#f5f5f5'};color:${isDark ? '#ccc' : '#333'};border:1px solid ${isDark ? '#444' : '#ccc'};border-radius:4px;font-size:${Math.round(14 * modalScale)}px;box-sizing:border-box;`;
    return inp;
}
function mdCreateActionBtn(text, type, modalScale, isDark) {
    const btn = document.createElement('button'); btn.textContent = text;
    const styles = { primary: { bg: '#0a3d6b', color: '#ddd', border: '#1a5a9a' }, danger: { bg: '#5a1a1a', color: '#ddd', border: '#8a2a2a' }, cancel: { bg: isDark ? '#2a2a3a' : '#e0e0e0', color: isDark ? '#aaa' : '#666', border: isDark ? '#444' : '#ccc' } };
    const s = styles[type] || styles.cancel;
    btn.style.cssText = `padding:8px 20px;background:${s.bg};color:${s.color};border:1px solid ${s.border};border-radius:4px;cursor:pointer;font-size:${Math.round(13 * modalScale)}px;`;
    return btn;
}

function createModal(title, width, content, zindex, id, onclose) {
    const modalScale = CFG.scale;
    const isDark = CFG.theme.isDark;
    const overlay = document.createElement('div');
    overlay.id = id || '';
    overlay.style.cssText = `position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.6);z-index:${zindex || 100000};display:flex;align-items:center;justify-content:center;padding:10px;box-sizing:border-box;`;
    const modal = document.createElement('div');
    modal.style.cssText = `background:${isDark ? '#0a0a14' : '#fff'};border:1px solid ${isDark ? '#333' : '#ccc'};padding:${Math.round(24 * modalScale)}px;border-radius:${Math.round(8 * modalScale)}px;width:100%;max-width:${Math.round((width || 600) * modalScale)}px;max-height:85vh;box-sizing:border-box;color:${isDark ? '#ccc' : '#333'};font-family:Arial,sans-serif;font-size:${Math.round(14 * modalScale)}px;box-shadow:0 0 30px rgba(0,0,0,${isDark ? '0.8' : '0.2'});display:flex;flex-direction:column;overflow:hidden;`;
    const header = document.createElement('div');
    header.style.cssText = `display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;padding-bottom:8px;border-bottom:1px solid ${isDark ? '#333' : '#ccc'};flex-shrink:0;`;
    const titleEl = document.createElement('div');
    titleEl.textContent = title;
    titleEl.style.cssText = `font-size:${Math.round(16 * modalScale)}px;font-weight:bold;word-break:break-word;flex:1;`;
    header.appendChild(titleEl);
    const closeBtn = document.createElement('div');
    closeBtn.textContent = '✕';
    closeBtn.style.cssText = `cursor:pointer;font-size:${Math.round(20 * modalScale)}px;color:${isDark ? '#888' : '#666'};flex-shrink:0;margin-left:12px;padding:0 4px;`;
    const contentDiv = document.createElement('div');
    contentDiv.style.cssText = 'overflow-y:auto;flex:1;min-height:0;padding-right:4px;';
    if (typeof content === 'string') contentDiv.innerHTML = content;
    else contentDiv.appendChild(content);
    const closeFn = function() { overlay.remove(); if (onclose) onclose(); };
    closeBtn.onclick = closeFn;
    header.appendChild(closeBtn);
    modal.appendChild(header);
    modal.appendChild(contentDiv);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    overlay.onclick = function(e) { if (e.target === overlay) closeFn(); };
    overlay._closeLorModal = closeFn;
    return { overlay, modal, content: contentDiv, close: closeFn };
}

function openSettingsModal(textarea, onAction) {
    if (document.getElementById('lor-md-settings-overlay')) return;
    const modalScale = CFG.scale;
    const isDark = CFG.theme.isDark;
    const mdSettings = getMdSettings();
    const btnVisibility = mdSettings.buttonVisibility || {};
    const visibleDefs = BTN_DEFS.filter(def => !def.sep && def.id && def.id !== 'settings' && def.id !== 'templates');

    const content = document.createElement('div');
    content.style.cssText = 'overflow-y:auto;flex:1;min-height:200px;';

    const grid = document.createElement('div');
    grid.style.cssText = `display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:${Math.round(8 * modalScale)}px;`;

    visibleDefs.forEach(def => {
        const isVisible = btnVisibility[def.id] !== false;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.dataset.id = def.id;
        btn.title = def.t;
        btn.style.cssText = `padding:${Math.round(8 * modalScale)}px ${Math.round(10 * modalScale)}px;background:${isVisible ? (isDark ? '#1a1a2e' : '#f0f4f8') : (isDark ? '#0d0d1a' : '#f9f9f9')};border:1px solid ${isDark ? '#2a2a3a' : '#e0e0e0'};border-radius:4px;color:${isDark ? '#ccc' : '#333'};cursor:pointer;text-align:left;font-size:${Math.round(12 * modalScale)}px;display:flex;align-items:center;gap:${Math.round(6 * modalScale)}px;transition:background .12s ease;min-height:${Math.round(36 * modalScale)}px;position:relative;`;

        const iconSpan = document.createElement('span');
        iconSpan.textContent = def.i;
        iconSpan.style.cssText = `font-size:${Math.round(16 * modalScale)}px;flex-shrink:0;`;
        const textSpan = document.createElement('span');
        textSpan.textContent = def.t.replace(/\s*\(.*?\)/g, '');
        textSpan.style.cssText = `flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;`;
        const statusSpan = document.createElement('span');
        statusSpan.textContent = isVisible ? '✓' : '○';
        statusSpan.style.cssText = `margin-left:auto;font-size:${Math.round(10 * modalScale)}px;opacity:0.7;`;

        btn.appendChild(iconSpan);
        btn.appendChild(textSpan);
        btn.appendChild(statusSpan);
        grid.appendChild(btn);

        btn.onclick = function() {
            const id = this.dataset.id;
            const settings = getMdSettings();
            if (!settings.buttonVisibility) settings.buttonVisibility = {};
            const current = settings.buttonVisibility[id] !== false;
            settings.buttonVisibility[id] = !current;
            saveMdSettings(settings);
            statusSpan.textContent = !current ? '✓' : '○';
            this.style.background = !current ? (isDark ? '#1a1a2e' : '#f0f4f8') : (isDark ? '#0d0d1a' : '#f9f9f9');
            document.querySelectorAll('.lor-toolbar').forEach(t => t.remove());
            document.querySelectorAll('textarea[data-md-init]').forEach(ta => {
                const parent = ta.parentElement;
                if (parent) {
                    buildToolbar(parent, ta, (def) => {
                        executeMarkdownAction(ta, def);
                        historyManager.pushAfterAction();
                    });
                }
            });
        };
        btn.onmouseenter = function() {
            const id = this.dataset.id;
            const settings = getMdSettings();
            const isVisible = (settings.buttonVisibility || {})[id] !== false;
            if (!isVisible) this.style.borderColor = CFG.accent;
        };
        btn.onmouseleave = function() { this.style.borderColor = isDark ? '#2a2a3a' : '#e0e0e0'; };
    });

    content.appendChild(grid);
    createModal('Настройки панели', 650, content, 100000, 'lor-md-settings-overlay');
}

function openTemplatesModal(textarea) {
    if (document.getElementById('lor-md-templates-overlay')) return;
    function px(v, s) { return Math.round(v * s) + 'px'; }
    function createInput(ph, s, d) {
        const inp = document.createElement('input'); inp.type = 'text'; inp.placeholder = ph;
        inp.style.cssText = 'width:100%;padding:8px 10px;background:' + (d ? '#111' : '#f5f5f5') + ';color:' + (d ? '#ccc' : '#333') + ';border:1px solid ' + (d ? '#444' : '#ccc') + ';border-radius:4px;font-size:' + px(14, s) + ';box-sizing:border-box;';
        return inp;
    }
    function createActionBtn(text, type, s, d) {
        const btn = document.createElement('button'); btn.textContent = text;
        const styles = { primary: { bg: '#0a3d6b', color: '#ddd', border: '#1a5a9a' }, danger: { bg: '#5a1a1a', color: '#ddd', border: '#8a2a2a' }, cancel: { bg: d ? '#2a2a3a' : '#e0e0e0', color: d ? '#aaa' : '#666', border: d ? '#444' : '#ccc' } };
        const st = styles[type] || styles.cancel;
        btn.style.cssText = 'padding:8px 20px;background:' + st.bg + ';color:' + st.color + ';border:1px solid ' + st.border + ';border-radius:4px;cursor:pointer;font-size:' + px(13, s) + ';';
        return btn;
    }
    function createListRow(s, d) {
        const row = document.createElement('div');
        row.style.cssText = 'padding:' + px(12, s) + ';border-radius:' + px(4, s) + ';cursor:pointer;display:flex;justify-content:space-between;align-items:center;border:1px solid ' + (d ? '#2a2a3a' : '#e0e0e0') + ';transition:background 0.2s;';
        row.onmouseenter = function() { this.style.background = d ? '#16213e' : '#e8f4f8'; };
        row.onmouseleave = function() { this.style.background = ''; };
        return row;
    }
    function createModal(title, width, content, zindex, id, onclose, s, d) {
        const overlay = document.createElement('div'); overlay.id = id || '';
        overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.6);z-index:' + (zindex || 100000) + ';display:flex;align-items:center;justify-content:center;padding:10px;box-sizing:border-box;';
        const modal = document.createElement('div');
        modal.style.cssText = 'background:' + (d ? '#0a0a14' : '#fff') + ';border:1px solid ' + (d ? '#333' : '#ccc') + ';padding:' + px(24, s) + ';border-radius:' + px(8, s) + ';width:100%;max-width:' + px(width || 600, s) + ';max-height:85vh;box-sizing:border-box;color:' + (d ? '#ccc' : '#333') + ';font-family:Arial,sans-serif;font-size:' + px(14, s) + ';box-shadow:0 0 30px rgba(0,0,0,' + (d ? '0.8' : '0.2') + ');display:flex;flex-direction:column;overflow:hidden;';
        const header = document.createElement('div');
        header.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;padding-bottom:8px;border-bottom:1px solid ' + (d ? '#333' : '#ccc') + ';flex-shrink:0;';
        const titleEl = document.createElement('div'); titleEl.textContent = title;
        titleEl.style.cssText = 'font-size:' + px(16, s) + ';font-weight:bold;word-break:break-word;flex:1;';
        header.appendChild(titleEl);
        const closeBtn = document.createElement('div'); closeBtn.textContent = '✕';
        closeBtn.style.cssText = 'cursor:pointer;font-size:' + px(20, s) + ';color:' + (d ? '#888' : '#666') + ';flex-shrink:0;margin-left:12px;padding:0 4px;';
        const contentDiv = document.createElement('div'); contentDiv.style.cssText = 'overflow-y:auto;flex:1;min-height:0;padding-right:4px;';
        if (typeof content === 'string') contentDiv.innerHTML = content; else contentDiv.appendChild(content);
        const closeFn = function() { overlay.remove(); if (onclose) onclose(); };
        closeBtn.onclick = closeFn; header.appendChild(closeBtn); modal.appendChild(header); modal.appendChild(contentDiv); overlay.appendChild(modal); document.body.appendChild(overlay);
        overlay.onclick = function(e) { if (e.target === overlay) closeFn(); }; overlay._closeLorModal = closeFn;
        return { overlay, modal, header, content: contentDiv, close: closeFn };
    }
    let modalScale = 1.0, isDark = false;
    try {
        const main = JSON.parse(localStorage.getItem('lor_panel_settings_v3'));
        if (main && main.general) {
            modalScale = Math.min(300, Math.max(30, main.general.modalScale || 100)) / 100;
            if (main.general.isDark !== undefined) isDark = main.general.isDark;
            else { const links = document.querySelectorAll('link[rel="stylesheet"]'); for (let i = 0; i < links.length; i++) { const m = links[i].href.match(/\/([^/]+)\/combined\.css/); if (m) { isDark = (m[1] === 'black' || m[1] === 'tango'); break; } } }
        }
    } catch(e) {}
    const mdSettingsKey = 'lor_md_toolbar_settings_v2';
    function getMdSettings() { try { return JSON.parse(localStorage.getItem(mdSettingsKey)) || {}; } catch(e) { return {}; } }
    function saveMdSettings(s) { try { localStorage.setItem(mdSettingsKey, JSON.stringify(s)); } catch(e) {} }
    const formContainer = document.createElement('div');
    formContainer.style.cssText = 'margin-bottom:16px;display:none;flex-direction:column;gap:8px;transition:max-height 0.3s ease,opacity 0.3s ease;overflow:hidden;';
    const nameInput = createInput('Название шаблона', modalScale, isDark);
    const contentInput = createInput('Текст шаблона (Markdown)', modalScale, isDark);
    contentInput.style.cssText += 'font-family:monospace;white-space:pre-wrap;resize:vertical;min-height:' + px(60, modalScale) + ';';
    const addBtn = createActionBtn('Добавить', 'primary', modalScale, isDark);
    formContainer.appendChild(nameInput); formContainer.appendChild(contentInput); formContainer.appendChild(addBtn);
    const toggleBtn = document.createElement('button');
    toggleBtn.textContent = '▶'; toggleBtn.title = 'Добавить шаблон';
    toggleBtn.style.cssText = 'padding:' + px(4, modalScale) + ' ' + px(8, modalScale) + ';background:' + (isDark ? '#1a1a2e' : '#f0f4f8') + ';color:' + (isDark ? '#ccc' : '#333') + ';border:1px solid ' + (isDark ? '#2a2a3a' : '#e0e0e0') + ';border-radius:4px;cursor:pointer;font-size:' + px(14, modalScale) + ';margin-right:8px;display:flex;align-items:center;gap:' + px(4, modalScale) + ';flex-shrink:0;';
    toggleBtn.onmouseenter = function() { this.style.borderColor = '#4a90d9'; };
    toggleBtn.onmouseleave = function() { this.style.borderColor = isDark ? '#2a2a3a' : '#e0e0e0'; };
    let formVisible = false;
    toggleBtn.onclick = function() {
        formVisible = !formVisible; toggleBtn.textContent = formVisible ? '◀' : '▶'; toggleBtn.title = formVisible ? 'Скрыть форму' : 'Добавить шаблон';
        formContainer.style.display = formVisible ? 'flex' : 'none'; if (formVisible) nameInput.focus();
    };
    const listEl = document.createElement('ul');
    listEl.style.cssText = 'list-style:none;padding:0;margin:0;background:' + (isDark ? '#0d0d1a' : '#f9f9f9') + ';border:1px solid ' + (isDark ? '#2a2a3a' : '#e0e0e0') + ';border-radius:4px;max-height:' + px(250, modalScale) + ';overflow-y:auto;';
    const closeBtn = createActionBtn('Закрыть', 'cancel', modalScale, isDark);
    const content = document.createElement('div');
    content.appendChild(toggleBtn); content.appendChild(formContainer);
    const headerDiv = document.createElement('div');
    headerDiv.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:6px;padding:4px 8px;background:' + (isDark ? '#1a1a2e' : '#f0f4f8') + ';border-radius:4px;';
    const nameChip = document.createElement('span'); nameChip.textContent = 'Название ▲';
    nameChip.style.cssText = 'cursor:pointer;font-weight:bold;color:#4a90d9;font-size:' + px(12, modalScale) + ';padding:2px 8px;border:1px solid #4a90d9;border-radius:3px;';
    let nameSortDir = 1;
    nameChip.onclick = function() { nameSortDir *= -1; nameChip.textContent = 'Название ' + (nameSortDir > 0 ? '▲' : '▼'); render(); };
    headerDiv.appendChild(nameChip);
    const lbl = document.createElement('div'); lbl.style.cssText = 'font-size:' + px(13, modalScale) + ';color:' + (isDark ? '#888' : '#666') + ';margin-bottom:6px;'; lbl.textContent = 'Сохранённые шаблоны:';
    content.appendChild(lbl); content.appendChild(headerDiv); content.appendChild(listEl);
    const closeDiv = document.createElement('div'); closeDiv.style.cssText = 'text-align:right;margin-top:16px;'; closeDiv.appendChild(closeBtn); content.appendChild(closeDiv);
    const modal = createModal('Шаблоны комментариев', 600, content, 100000, 'lor-md-templates-overlay', null, modalScale, isDark);
    if (modal.header) {
        const titleEl = modal.header.querySelector('div[style*="font-weight:bold"]');
        if (titleEl) modal.header.insertBefore(toggleBtn, titleEl); else modal.header.insertBefore(toggleBtn, modal.header.firstChild);
    }
    const mdSettings = getMdSettings(); let templates = mdSettings.templates || [];
    function removeTemplate(id) { const settings = getMdSettings(); settings.templates = settings.templates.filter(t => t.id !== id); saveMdSettings(settings); templates = settings.templates || []; render(); }
    function render() {
        listEl.innerHTML = '';
        let sorted = templates.slice().sort(function(a, b) { return nameSortDir * (a.name || '').localeCompare(b.name || '', 'ru'); });
        if (sorted.length === 0) { const empty = document.createElement('li'); empty.textContent = 'список пуст'; empty.style.cssText = 'padding:10px;color:' + (isDark ? '#555' : '#999') + ';text-align:center;font-style:italic;'; listEl.appendChild(empty); }
        else {
            sorted.forEach(tpl => {
                const li = createListRow(modalScale, isDark); li.style.cssText += 'padding:8px 10px;';
                const left = document.createElement('div'); left.style.cssText = 'flex:1;overflow:hidden;';
                const nl = document.createElement('div'); nl.textContent = tpl.name; nl.style.cssText = 'font-weight:bold;color:' + (isDark ? '#ccc' : '#333') + ';cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;'; left.appendChild(nl);
                const preview = document.createElement('div'); preview.style.cssText = 'font-size:' + px(11, modalScale) + ';color:' + (isDark ? '#888' : '#666') + ';margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;'; preview.textContent = (tpl.content || '').substring(0, 60) + (tpl.content.length > 60 ? '…' : ''); left.appendChild(preview); li.appendChild(left);
                const actions = document.createElement('div'); actions.style.cssText = 'display:flex;gap:4px;align-items:center;';
                const useBtn = document.createElement('span'); useBtn.textContent = '✓'; useBtn.title = 'Вставить'; useBtn.style.cssText = 'color:#4CAF50;cursor:pointer;font-size:' + px(16, modalScale) + ';padding:0 4px;';
                useBtn.onclick = () => { const start = textarea.selectionStart; if (typeof TextOps !== 'undefined' && TextOps.insertTemplate) TextOps.insertTemplate(textarea, start, tpl.content); else textarea.setRangeText(tpl.content, start, start, 'end'); textarea.focus(); if (typeof historyManager !== 'undefined' && historyManager.pushAfterAction) historyManager.pushAfterAction(); modal.close(); };
                actions.appendChild(useBtn);
                const delBtn = document.createElement('span'); delBtn.textContent = '✕'; delBtn.title = 'Удалить шаблон'; delBtn.style.cssText = 'color:' + (isDark ? '#888' : '#999') + ';cursor:pointer;font-size:' + px(16, modalScale) + ';padding:0 4px;'; delBtn.onclick = () => { if (confirm('Удалить шаблон "' + tpl.name + '"?')) removeTemplate(tpl.id); };
                actions.appendChild(delBtn); li.appendChild(actions);
                li.onclick = e => { if (e.target !== delBtn && e.target !== useBtn) useBtn.onclick(); };
                listEl.appendChild(li);
            });
        }
    }
    render();
    addBtn.onclick = () => {
        const name = nameInput.value.trim(); const text = contentInput.value;
        if (!name || !text) {
            nameInput.style.borderColor = !name ? '#cc0000' : (isDark ? '#444' : '#ccc'); contentInput.style.borderColor = !text ? '#cc0000' : (isDark ? '#444' : '#ccc');
            setTimeout(() => { nameInput.style.borderColor = isDark ? '#444' : '#ccc'; contentInput.style.borderColor = isDark ? '#444' : '#ccc'; }, 1500); return;
        }
        const settings = getMdSettings(); if (!settings.templates) settings.templates = [];
        const newTpl = { name, content: text, id: Date.now() }; settings.templates.push(newTpl); saveMdSettings(settings); templates.push(newTpl);
        nameInput.value = ''; contentInput.value = ''; render();
    };
    contentInput.addEventListener('keydown', e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); addBtn.click(); } });
    nameInput.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); contentInput.focus(); } });
    closeBtn.onclick = modal.close;
    let touchStartY = 0, touchMoved = false; const SWIPE_THRESHOLD = 40;
    content.addEventListener('touchstart', e => { if (e.touches.length === 1) { touchStartY = e.touches[0].clientY; touchMoved = false; } }, { passive: true });
    content.addEventListener('touchmove', e => { if (e.touches.length === 1) { const dy = e.touches[0].clientY - touchStartY; if (Math.abs(dy) > 10) touchMoved = true; } }, { passive: true });
    content.addEventListener('touchend', e => { if (!touchMoved) return; const dy = (e.changedTouches[0] ? e.changedTouches[0].clientY : touchStartY) - touchStartY; if (dy < -SWIPE_THRESHOLD) modal.close(); touchMoved = false; });
    document.addEventListener('keydown', function onEsc(e) { if (e.key === 'Escape') { modal.close(); document.removeEventListener('keydown', onEsc); } });
}

function buildToolbar(container, insertBefore, onAction) {
    const panel = document.createElement('div'); panel.className = 'lor-toolbar';
    panel.style.cssText = `display:flex;flex-wrap:wrap;gap:${px(6)};align-items:center;padding:${px(8)} ${px(12)};margin:0 0 ${px(10)} 0;background:${CFG.theme.panelBg};border:1px solid ${CFG.theme.border};border-radius:${px(6)};box-sizing:border-box;width:100%;order:-1;`;
    const mdSettings = getMdSettings(); const btnVisibility = mdSettings.buttonVisibility || {};
    const activeDefs = BTN_DEFS.filter(def => { if (def.sep) return true; if (!def.id) return true; if (def.id === 'settings' || def.id === 'templates') return true; return btnVisibility[def.id] !== false; });
    activeDefs.forEach(def => {
        if (def.sep) { const sep = document.createElement('div'); sep.style.cssText = `width:1px;height:${px(24)};background:${CFG.theme.sep};margin:0 ${px(4)};flex-shrink:0;`; panel.appendChild(sep); return; }
        const btn = document.createElement('button'); btn.type = 'button'; btn.textContent = def.i; btn.title = def.t;
        btn.style.cssText = `min-width:${px(28)};height:${px(28)};padding:0 ${px(7)};background:${CFG.theme.btn};color:${CFG.theme.txt};border:1px solid ${CFG.theme.border};border-radius:${px(4)};cursor:pointer;font-size:${px(14)};font-weight:500;display:flex;align-items:center;justify-content:center;user-select:none;transition:background .12s ease;`;
        if (def.action === 'undo') {
            btn.style.opacity = '0.4'; btn.style.pointerEvents = 'none';
            btn.addEventListener('click', () => { const va = historyManager.getVisualArea(); if (va && va.offsetParent !== null) historyManager.undoVisual(); else historyManager.undo(); });
        } else if (def.action === 'redo') {
            btn.style.opacity = '0.4'; btn.style.pointerEvents = 'none';
            btn.addEventListener('click', () => { const va = historyManager.getVisualArea(); if (va && va.offsetParent !== null) historyManager.redoVisual(); else historyManager.redo(); });
        } else if (def.action === 'settings') {
            btn.addEventListener('mouseenter', () => { btn.style.background = CFG.theme.btnH; btn.style.borderColor = CFG.accent; });
            btn.addEventListener('mouseleave', () => { btn.style.background = CFG.theme.btn; btn.style.borderColor = CFG.theme.border; });
            btn.addEventListener('click', (e) => { e.preventDefault(); const ta = historyManager.getTextarea(); if (ta) openSettingsModal(ta, onAction); btn.style.background = CFG.accent; btn.style.color = '#fff'; setTimeout(() => { btn.style.background = CFG.theme.btn; btn.style.color = CFG.theme.txt; }, 150); });
        } else if (def.action === 'templates') {
            btn.addEventListener('mouseenter', () => { btn.style.background = CFG.theme.btnH; btn.style.borderColor = CFG.accent; });
            btn.addEventListener('mouseleave', () => { btn.style.background = CFG.theme.btn; btn.style.borderColor = CFG.theme.border; });
            btn.addEventListener('click', (e) => { e.preventDefault(); const ta = historyManager.getTextarea(); if (ta) openTemplatesModal(ta); btn.style.background = CFG.accent; btn.style.color = '#fff'; setTimeout(() => { btn.style.background = CFG.theme.btn; btn.style.color = CFG.theme.txt; }, 150); });
        } else {
            btn.addEventListener('mouseenter', () => { btn.style.background = CFG.theme.btnH; btn.style.borderColor = CFG.accent; });
            btn.addEventListener('mouseleave', () => { btn.style.background = CFG.theme.btn; btn.style.borderColor = CFG.theme.border; });
            btn.addEventListener('click', (e) => { e.preventDefault(); onAction(def); btn.style.background = CFG.accent; btn.style.color = '#fff'; setTimeout(() => { btn.style.background = CFG.theme.btn; btn.style.color = CFG.theme.txt; }, 150); });
            if (def.hotkey) historyManager.registerHotkey(def, () => onAction(def));
        }
        panel.appendChild(btn);
    });
    container.insertBefore(panel, insertBefore); return panel;
}
function setupVisualEditor(textarea) {
    const formatGroup = textarea.closest('[data-format-mode]'); if (!formatGroup) return;
    const nav = formatGroup.querySelector('.markup-tabs__nav'); const panelsContainer = formatGroup.querySelector('.markup-tabs__content'); if (!nav || !panelsContainer) return;
    if (nav.querySelector('[data-tab="visual"]')) return;
    const styleId = 'lor-visual-editor-styles';
    if (!document.getElementById(styleId)) {
        const style = document.createElement('style'); style.id = styleId;
        style.textContent = `#lor-visual-area h1 { font-size: 2em; margin: 0.5em 0; font-weight: bold; } #lor-visual-area h2 { font-size: 1.75em; margin: 0.4em 0; font-weight: bold; } #lor-visual-area h3 { font-size: 1.5em; margin: 0.3em 0; font-weight: bold; } #lor-visual-area h4 { font-size: 1.25em; margin: 0.3em 0; font-weight: bold; } #lor-visual-area h5 { font-size: 1.1em; margin: 0.2em 0; font-weight: bold; } #lor-visual-area h6 { font-size: 1em; margin: 0.2em 0; font-weight: bold; opacity: 0.8; } #lor-visual-area p, #lor-visual-area div { margin: 0.5em 0; } #lor-visual-area blockquote { border-left: 3px solid ${CFG.accent}; padding-left: 1em; margin: 0.5em 0; opacity: 0.9; } #lor-visual-area pre { background: rgba(128,128,128,0.1); padding: 0.5em; border-radius: 4px; overflow-x: auto; } #lor-visual-area table { border-collapse: collapse; width: 100%; margin: 0.5em 0; } #lor-visual-area th, #lor-visual-area td { border: 1px solid ${CFG.theme.border}; padding: 0.5em; } #lor-visual-area a.mention { color: ${CFG.accent}; text-decoration: none; font-weight: 500; } #lor-visual-area a.mention:hover { text-decoration: underline; }`;
        document.head.appendChild(style);
    }
    const visualTab = document.createElement('li'); visualTab.className = 'markup-tabs__tab'; visualTab.dataset.tab = 'visual'; visualTab.textContent = 'Визуальный редактор'; nav.appendChild(visualTab);
    const visualPanel = document.createElement('div'); visualPanel.className = 'markup-tabs__panel'; visualPanel.dataset.panel = 'visual';
    const visualArea = document.createElement('div'); visualArea.id = 'lor-visual-area'; visualArea.contentEditable = 'true';
    visualArea.style.cssText = `width:100%;min-height:250px;padding:${px(10)};border:1px solid ${CFG.theme.border};border-radius:${px(4)};outline:none;white-space:pre-wrap;word-wrap:break-word;box-sizing:border-box;background:${CFG.theme.bg};color:${CFG.theme.txt};font-size:${px(14)};line-height:1.5;`;
    visualPanel.appendChild(visualArea); panelsContainer.appendChild(visualPanel); historyManager.init(textarea, visualArea);
    buildToolbar(visualPanel, visualArea, (def) => executeVisualAction(visualArea, def));
    visualArea.addEventListener('keydown', function(e) {
        if (e.key !== 'Enter') return; const sel = window.getSelection(); if (!sel.rangeCount) return;
        let node = sel.anchorNode; if (node.nodeType === 3) node = node.parentNode; let block = node;
        while (block && block !== visualArea) { const tag = block.tagName; if (['P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE', 'PRE', 'LI'].includes(tag)) break; block = block.parentNode; }
        if (!block || block === visualArea) return;
        let atEnd = false;
        if (sel.anchorNode.nodeType === 3) atEnd = sel.anchorOffset >= sel.anchorNode.textContent.length; else atEnd = true;
        if (block.tagName.match(/^H[1-6]$/)) {
            const p = document.createElement('p'); p.innerHTML = '<br>';
            if (block.nextSibling) block.parentNode.insertBefore(p, block.nextSibling); else block.parentNode.appendChild(p);
            const range = document.createRange(); range.setStart(p, 0); range.collapse(true); sel.removeAllRanges(); sel.addRange(range); e.preventDefault();
        } else if (block.tagName === 'BLOCKQUOTE') {
            const text = block.textContent || '';
            if (text.trim() === '' || atEnd) { const br = document.createElement('br'); block.parentNode.insertBefore(br, block.nextSibling); const range = document.createRange(); range.setStartAfter(br); range.collapse(true); sel.removeAllRanges(); sel.addRange(range); e.preventDefault(); }
            else document.execCommand('insertLineBreak');
        } else if (block.tagName === 'LI') {
            const text = block.textContent || '';
            if (text.trim() === '' || atEnd) { const list = block.parentElement; const p = document.createElement('p'); p.innerHTML = '<br>'; if (list.nextSibling) list.parentNode.insertBefore(p, list.nextSibling); else list.parentNode.appendChild(p); const range = document.createRange(); range.setStart(p, 0); range.collapse(true); sel.removeAllRanges(); sel.addRange(range); e.preventDefault(); }
            else document.execCommand('insertLineBreak');
        } else { document.execCommand('insertLineBreak'); }
        visualArea.focus(); syncTextarea(visualArea);
    });
    visualArea.addEventListener('input', function() { syncTextarea(visualArea); });
    nav.addEventListener('click', function(e) {
        const tab = e.target.closest('.markup-tabs__tab'); if (!tab || tab.dataset.tab !== 'visual') return;
        e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
        nav.querySelectorAll('.markup-tabs__tab').forEach(t => t.classList.remove('active'));
        panelsContainer.querySelectorAll('.markup-tabs__panel').forEach(p => p.classList.remove('active'));
        tab.classList.add('active'); visualPanel.classList.add('active');
        visualArea.innerHTML = md2html(textarea.value); historyManager.pushAfterAction();
        setTimeout(() => { const range = document.createRange(); const sel = window.getSelection(); range.selectNodeContents(visualArea); range.collapse(false); sel.removeAllRanges(); sel.addRange(range); visualArea.focus(); }, 50);
    }, true);
}
function init() {
    const mdSettings = getMdSettings();
    if (mdSettings.enabled === false) return;

    const textareas = document.querySelectorAll('textarea[name="text"], textarea.form-control, textarea[name="msg"]');
    textareas.forEach(ta => {
        if (ta.dataset.mdInit) return;
        ta.dataset.mdInit = '1';

        const parent = ta.parentElement;
        if (!parent) return;

        if (getComputedStyle(parent).flexDirection === 'row') {
            parent.style.flexDirection = 'column';
        }

        buildToolbar(parent, ta, (def) => {
            executeMarkdownAction(ta, def);
            historyManager.pushAfterAction();
        });
        setupVisualEditor(ta);
    });
}
if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', () => setTimeout(init, 500)); } else { setTimeout(init, 500); }
window.addEventListener('storage', function(e) { if (e.key === CFG_KEY_MD) { document.querySelectorAll('.lor-toolbar').forEach(t => t.remove()); init(); } });
const domObs = new MutationObserver(() => {
    const mdSettings = getMdSettings(); if (mdSettings.enabled) {
        document.querySelectorAll('textarea[name="text"], textarea.form-control, textarea[name="msg"]').forEach(ta => {
            if (!ta.dataset.mdInit) {
                ta.dataset.mdInit = '1'; const parent = ta.parentElement;
                if (parent) { if (getComputedStyle(parent).flexDirection === 'row') parent.style.flexDirection = 'column'; buildToolbar(parent, ta, (def) => { executeMarkdownAction(ta, def); historyManager.pushAfterAction(); }); setupVisualEditor(ta); }
            }
        });
    }
});
domObs.observe(document.body || document.documentElement, { childList: true, subtree: true });
})();