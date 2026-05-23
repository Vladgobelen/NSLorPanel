// ==UserScript==
// @name         NSLorPanel
// @namespace    test
// @match        https://www.linux.org.ru/*
// @grant        none
// @inject-into  content
// @run-at       document-idle
// ==/UserScript==
(function() {
'use strict';

// ============================================================================
// 1. КОНСТАНТЫ И ТЕМИЗАЦИЯ
// ============================================================================

const THEME_COLORS = {
    'black': { btnBg: '#1a1a2e', btnBgHover: '#16213e', btnColor: '#c8c8c8', notifBg: '#cc0000', notifBgHover: '#ff0000', borderColor: '#444444' },
    'tango': { btnBg: '#2e3436', btnBgHover: '#3e4547', btnColor: '#babdb6', notifBg: '#cc0000', notifBgHover: '#ff0000', borderColor: '#555753' },
    'tango-light': { btnBg: '#d3d7cf', btnBgHover: '#c0c4bc', btnColor: '#2e3436', notifBg: '#cc0000', notifBgHover: '#ff0000', borderColor: '#888a85' },
    'tango-auto': { btnBg: '#d3d7cf', btnBgHover: '#c0c4bc', btnColor: '#2e3436', notifBg: '#cc0000', notifBgHover: '#ff0000', borderColor: '#888a85' },
    'white2': { btnBg: '#e8e8e8', btnBgHover: '#d0d0d0', btnColor: '#333333', notifBg: '#cc0000', notifBgHover: '#ff0000', borderColor: '#cccccc' },
    'waltz': { btnBg: '#ececec', btnBgHover: '#d8d8d8', btnColor: '#333333', notifBg: '#cc0000', notifBgHover: '#ff0000', borderColor: '#cccccc' },
    'zomg_ponies': { btnBg: '#ececec', btnBgHover: '#d8d8d8', btnColor: '#333333', notifBg: '#cc0000', notifBgHover: '#ff0000', borderColor: '#cccccc' }
};

const POSITIONS = ['right', 'left', 'top', 'bottom'];
const POS_LABELS = { right: 'Справа', left: 'Слева', top: 'Сверху', bottom: 'Снизу' };
const ICONS = ['🔴','🟠','🟡','🟢','🔵','🟣','⚫','⚪','🟤','🔶','🔷','🔸','🔹','🟥','🟧','🟨','🟩','🟦','🟪','⬛','⬜','🟫','❤️','❓','💚','🇦','🇧','🇨','🇩','🇪','🇫','🇬','🇭','🇮','🇯','🇰','🇱','🇲','🇳','🇴','🇵','🇶','🇷','🇸','🇹','🇺','🇻','🇼','🇽','🇾','🇿'];

const BUTTON_DEFS = {
    up: { text: '▲', title: 'Наверх', action: () => window.scrollTo({ top: 0, behavior: 'smooth' }), showSettings: true },
    forum: { text: '📋', title: 'Форум', action: (e) => { if (!e || e.button === 0) location.href = 'https://www.linux.org.ru/forum/'; }, longPressAction: 'forum' },
    tracker: { text: '☰', title: 'Трекер', action: (e) => { if (!e || e.button === 0) location.href = 'https://www.linux.org.ru/tracker/'; }, longPressAction: 'tracker' },
    notifications: { text: '🔔', title: 'Уведомления', action: (e) => { if (!e || e.button === 0) location.href = 'https://www.linux.org.ru/notifications'; }, longPressAction: 'notifications' },
    saved: { text: '💾', title: 'Сохраненные', action: (e) => { if (!e || e.button === 0) showSavedPagesModal(); }, longPressAction: 'saved' },
    myComment: { text: '💬', title: 'Мои сообщения', action: goToMyLastComment },
    mention: { text: '📢', title: 'Упоминания', action: goToLastMention },
    blacklist: { text: '🚫', title: 'Чёрный список', action: showBlacklistModal, longPressAction: 'blacklist' },
    visits: { text: '🕐', title: 'Посещения', action: showVisitsModal, longPressAction: 'visits' },
    down: { text: '▼', title: 'Вниз', action: () => window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }), showSettings: true },
    help: { text: '❓', title: 'Справка', action: showHelpModal }
};

// ============================================================================
// 2. ГЛОБАЛЬНОЕ СОСТОЯНИЕ
// ============================================================================

let trackerTableUpdated = false;
const panelContainers = { right: null, left: null, top: null, bottom: null };
let settingsBtn = null;
let addCustomBtn = null;
const allButtons = {};
let currentModal = null;
let scrollTimer = null;
let currentPageSaved = false;
let pageLoadTime = Date.now();
const isMobilePanelExpanded = { right: false, left: false, top: false, bottom: false };
let touchStartY = 0, touchStartX = 0, touchMoved = false;
const SWIPE_THRESHOLD = 40;
const mobileCollapsedContainers = { right: null, left: null, top: null, bottom: null };
const mobileExpandedContainers = { right: null, left: null, top: null, bottom: null };
let activeTooltip = null;

// ============================================================================
// 3. УТИЛИТЫ ТЕМ И МАСШТАБА
// ============================================================================

function getCurrentTheme() {
    const links = document.querySelectorAll('link[rel="stylesheet"]');
    for (let i = 0; i < links.length; i++) {
        const m = links[i].href.match(/\/([^/]+)\/combined.css/);
        if (m) return m[1];
    }
    return 'black';
}

function getThemeColors() {
    const theme = getCurrentTheme();
    return THEME_COLORS[theme] || THEME_COLORS['black'];
}

function getColor(key) {
    const c = getThemeColors();
    return c[key] || '';
}

function isDarkTheme() {
    const t = getCurrentTheme();
    return t === 'black' || t === 'tango';
}

function getScale(settings, force) {
    return (force || (settings.general.mobileView ? settings.general.mobileScale : settings.general.scale)) / 100;
}

// ============================================================================
// 4. LOCALSTORAGE: НАСТРОЙКИ И ДАННЫЕ
// ============================================================================

function getDefaultSettings() {
    return {
        general: { showBorder: false, scale: 100, modalScale: 100, mobileView: false, mobileScale: 120, orientation: 'vertical' },
        filter: { enabled: true, mode: 'cut', applyToMini: true, animateBlur: true },
        buttons: {
            profile: { right: true, left: false, top: false, bottom: false },
            up: { right: true, left: false, top: false, bottom: false },
            forum: { right: true, left: false, top: false, bottom: false },
            tracker: { right: true, left: false, top: false, bottom: false },
            notifications: { right: true, left: false, top: false, bottom: false },
            saved: { right: true, left: false, top: false, bottom: false },
            myComment: { right: true, left: false, top: false, bottom: false },
            mention: { right: true, left: false, top: false, bottom: false },
            blacklist: { right: true, left: false, top: false, bottom: false },
            visits: { right: true, left: false, top: false, bottom: false },
            down: { right: true, left: false, top: false, bottom: false },
            help: { right: false, left: true, top: false, bottom: false }
        },
        customButtons: [],
        buttonOrder: ['up','forum','tracker','notifications','saved','myComment','mention','blacklist','visits','down','help']
    };
}

function getSettings() {
    try {
        const saved = JSON.parse(localStorage.getItem('lor_panel_settings_v3'));
        if (saved && typeof saved === 'object') {
            const def = getDefaultSettings();
            // Валидация general
            if (!saved.general) saved.general = def.general;
            if (saved.general.showBorder === undefined) saved.general.showBorder = def.general.showBorder;
            if (saved.general.mobileView === undefined) saved.general.mobileView = def.general.mobileView;
            if (!saved.general.scale || saved.general.scale < 30 || saved.general.scale > 200) saved.general.scale = def.general.scale;
            if (!saved.general.modalScale || saved.general.modalScale < 30 || saved.general.modalScale > 200) saved.general.modalScale = def.general.modalScale;
            if (!saved.general.mobileScale || saved.general.mobileScale < 30 || saved.general.mobileScale > 300) saved.general.mobileScale = def.general.mobileScale;
            if (!saved.general.orientation) saved.general.orientation = def.general.orientation;
            // Валидация filter
            if (!saved.filter) saved.filter = def.filter;
            if (saved.filter.enabled === undefined) saved.filter.enabled = def.filter.enabled;
            if (!saved.filter.mode || (saved.filter.mode !== 'cut' && saved.filter.mode !== 'blur')) saved.filter.mode = def.filter.mode;
            if (saved.filter.applyToMini === undefined) saved.filter.applyToMini = def.filter.applyToMini;
            if (saved.filter.animateBlur === undefined) saved.filter.animateBlur = def.filter.animateBlur;
            // Валидация buttons
            if (!saved.buttons) saved.buttons = def.buttons;
            for (const key in def.buttons) {
                if (saved.buttons[key] === undefined) saved.buttons[key] = def.buttons[key];
                else if (typeof saved.buttons[key] === 'boolean') saved.buttons[key] = { right: saved.buttons[key], left: false, top: false, bottom: false };
            }
            // Валидация массивов
            if (!saved.customButtons) saved.customButtons = [];
            if (!saved.buttonOrder) saved.buttonOrder = def.buttonOrder.slice();
            // Добавляем отсутствующие кнопки в порядок
            let orderChanged = false;
            def.buttonOrder.forEach(k => { if (saved.buttonOrder.indexOf(k) === -1) { saved.buttonOrder.push(k); orderChanged = true; } });
            if (orderChanged) saveSettings(saved);
            return saved;
        }
    } catch(e) {}
    return getDefaultSettings();
}

function saveSettings(s) { localStorage.setItem('lor_panel_settings_v3', JSON.stringify(s)); }
function getBlacklist() { try { return JSON.parse(localStorage.getItem('lor_blacklist') || '[]'); } catch(e) { return []; } }
function saveBlacklistAndNotify(list) { localStorage.setItem('lor_blacklist', JSON.stringify(list)); window.dispatchEvent(new CustomEvent('lor-blacklist-changed', { detail: { list } })); }
function getTrackedUsers() { try { return JSON.parse(localStorage.getItem('lor_tracked_users') || '{}'); } catch(e) { return {}; } }
function saveTrackedUsers(d) { localStorage.setItem('lor_tracked_users', JSON.stringify(d)); }
function getSavedPages() { try { return JSON.parse(localStorage.getItem('lor_saved_pages') || '[]'); } catch(e) { return []; } }
function saveSavedPages(p) { localStorage.setItem('lor_saved_pages', JSON.stringify(p)); }
function getForumCache() { try { return JSON.parse(localStorage.getItem('lor_forum_cache') || '{}'); } catch(e) { return {}; } }
function saveForumCache(d) { localStorage.setItem('lor_forum_cache', JSON.stringify(d)); }
function getTrackerCache() { try { return JSON.parse(localStorage.getItem('lor_tracker_cache') || '{}'); } catch(e) { return {}; } }
function saveTrackerCache(d) { localStorage.setItem('lor_tracker_cache', JSON.stringify(d)); }

// ============================================================================
// 5. УТИЛИТЫ DOM И СТРАНИЦЫ
// ============================================================================

function getMyNick() {
    let pl = document.querySelector('a[href*="/people/"][href*="/profile"]');
    if (pl) return pl.textContent.trim();
    const own = document.querySelector('article.msg.comments-owner, article.msg.own');
    if (own) { const l = own.querySelector('a[href*="/people/"]'); if (l) return l.textContent.trim(); }
    return null;
}

function getCurrentNewsAuthor() {
    let sign = document.querySelector('.sign a[href*="/people/"]');
    if (sign) return sign.textContent.trim();
    sign = document.querySelector('article.msg .sign a[itemprop="creator"]');
    if (sign) return sign.textContent.trim();
    const authorEl = document.querySelector('a[href*="/people/"][href*="/profile"]');
    if (authorEl) return authorEl.textContent.trim();
    return null;
}

function getProfileUrl() {
    const pl = document.querySelector('a[href*="/people/"][href*="/profile"]');
    return pl ? pl.href : 'https://www.linux.org.ru/people/';
}

function getPageIdentifier() {
    return window.location.href.replace(/[?](lastmod|page)[&](lastmod|page)=\d+/g, '');
}

function getCommentCount() { return document.querySelectorAll('article.msg').length; }
function isTrackerPage() { return location.href.match(/\/tracker\/?$/) !== null; }
function sanitizeClassNick(nick) { return nick.replace(/[^a-zA-Z0-9]/g, '_'); }

// ============================================================================
// 6. UI: СОЗДАНИЕ ЭЛЕМЕНТОВ
// ============================================================================

function createButton(text, title, cb, mb, fscale) {
    const settings = getSettings(), colors = getThemeColors();
    const scale = getScale(settings, fscale);
    const size = Math.round(54 * scale), fontSize = Math.round(24 * scale);
    const btn = document.createElement('div');
    btn.textContent = text; btn.title = title;
    btn.style.cssText = `width:${size}px;height:${size}px;background:${colors.btnBg};color:${colors.btnColor};border-radius:50%;display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:${fontSize}px;user-select:none;opacity:0.7;position:relative;${mb ? 'margin-bottom:30px;' : ''}`;
    btn._cmjf = false; btn._lpt = null; btn._lptr = false; btn._mdt = 0;
    btn.onmouseenter = function() { this.style.opacity = '1'; this.style.background = colors.btnBgHover; };
    btn.onmouseleave = function() { this.style.opacity = '0.7'; this.style.background = colors.btnBg; clearTimeout(btn._lpt); btn._lptr = false; btn._cmjf = false; };
    btn.onmousedown = function(e) {
        if (e.button === 2) { btn._cmjf = true; setTimeout(() => btn._cmjf = false, 300); return; }
        if (e.button !== 0) return;
        btn._lptr = false; btn._cmjf = false; btn._mdt = Date.now();
        btn._lpt = setTimeout(() => { btn._lptr = true; btn._cmjf = true; btn.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2, clientX: e.clientX, clientY: e.clientY })); }, 500);
    };
    btn.onmouseup = function(e) { clearTimeout(btn._lpt); if (btn._lptr || btn._cmjf) { e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation(); setTimeout(() => { btn._cmjf = false; btn._lptr = false; }, 100); return false; } };
    btn.onmousemove = function(e) { if (btn._lpt && Math.abs(e.clientX - btn._mdt) > 5) { clearTimeout(btn._lpt); btn._lpt = null; btn._lptr = false; } };
    btn.addEventListener('contextmenu', function(e) { btn._cmjf = true; setTimeout(() => btn._cmjf = false, 300); });
    btn.addEventListener('click', function(e) { if (btn._cmjf || btn._lptr) { e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation(); return false; } if (cb) cb(e); }, true);
    return btn;
}

function createModal(title, width, content, zindex, id, onclose) {
    const settings = getSettings(), modalScale = settings.general.modalScale / 100, isDark = isDarkTheme();
    const overlay = document.createElement('div');
    overlay.id = id || '';
    overlay.style.cssText = `position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.6);z-index:${zindex || 100000};display:flex;align-items:center;justify-content:center;`;
    const modal = document.createElement('div');
    modal.style.cssText = `background:${isDark ? '#0a0a14' : '#fff'};border:1px solid ${isDark ? '#333' : '#ccc'};padding:${Math.round(24 * modalScale)}px;border-radius:${Math.round(8 * modalScale)}px;width:${Math.round((width || 600) * modalScale)}px;max-height:80vh;color:${isDark ? '#ccc' : '#333'};font-family:Arial,sans-serif;font-size:${Math.round(14 * modalScale)}px;box-shadow:0 0 30px rgba(0,0,0,${isDark ? '0.8' : '0.2'});display:flex;flex-direction:column;`;
    const header = document.createElement('div');
    header.style.cssText = `display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;padding-bottom:8px;border-bottom:1px solid ${isDark ? '#333' : '#ccc'};`;
    const titleEl = document.createElement('div'); titleEl.textContent = title; titleEl.style.cssText = `font-size:${Math.round(16 * modalScale)}px;font-weight:bold;`;
    header.appendChild(titleEl);
    const closeBtn = document.createElement('div'); closeBtn.textContent = '✕'; closeBtn.style.cssText = `cursor:pointer;font-size:${Math.round(18 * modalScale)}px;color:${isDark ? '#888' : '#666'};`;
    closeBtn.onclick = function() { overlay.remove(); if (onclose) onclose(); };
    header.appendChild(closeBtn); modal.appendChild(header);
    const contentDiv = document.createElement('div'); contentDiv.style.cssText = 'overflow-y:auto;flex:1;min-height:200px;';
    if (typeof content === 'string') contentDiv.innerHTML = content; else contentDiv.appendChild(content);
    modal.appendChild(contentDiv); overlay.appendChild(modal); document.body.appendChild(overlay);
    overlay.onclick = function(e) { if (e.target === overlay) { overlay.remove(); if (onclose) onclose(); } };
    return { overlay, modal, content: contentDiv, close: function() { overlay.remove(); if (onclose) onclose(); } };
}

function createListRow(modalScale, isDark) {
    const row = document.createElement('div');
    row.style.cssText = `padding:${Math.round(12 * modalScale)}px;border-radius:${Math.round(4 * modalScale)}px;cursor:pointer;display:flex;justify-content:space-between;align-items:center;border:1px solid ${isDark ? '#2a2a3a' : '#e0e0e0'};transition:background 0.2s;`;
    row.onmouseenter = function() { this.style.background = isDark ? '#16213e' : '#e8f4f8'; };
    row.onmouseleave = function() { this.style.background = ''; };
    return row;
}

function createInput(ph, modalScale, isDark) {
    const inp = document.createElement('input'); inp.type = 'text'; inp.placeholder = ph;
    inp.style.cssText = `width:100%;padding:8px 10px;background:${isDark ? '#111' : '#f5f5f5'};color:${isDark ? '#ccc' : '#333'};border:1px solid ${isDark ? '#444' : '#ccc'};border-radius:4px;font-size:${Math.round(14 * modalScale)}px;box-sizing:border-box;`;
    return inp;
}

function createActionBtn(text, type, modalScale, isDark) {
    const btn = document.createElement('button'); btn.textContent = text;
    const styles = { primary: { bg: '#0a3d6b', color: '#ddd', border: '#1a5a9a' }, danger: { bg: '#5a1a1a', color: '#ddd', border: '#8a2a2a' }, cancel: { bg: isDark ? '#2a2a3a' : '#e0e0e0', color: isDark ? '#aaa' : '#666', border: isDark ? '#444' : '#ccc' } };
    const s = styles[type] || styles.cancel;
    btn.style.cssText = `padding:8px 20px;background:${s.bg};color:${s.color};border:1px solid ${s.border};border-radius:4px;cursor:pointer;font-size:${Math.round(13 * modalScale)}px;`;
    return btn;
}

// ============================================================================
// 7. ПАНЕЛИ: СОЗДАНИЕ И УПРАВЛЕНИЕ
// ============================================================================

function cleanupPanels() {
    POSITIONS.forEach(pos => {
        if (panelContainers[pos]) { panelContainers[pos].remove(); panelContainers[pos] = null; }
        if (mobileCollapsedContainers[pos]) { mobileCollapsedContainers[pos].remove(); mobileCollapsedContainers[pos] = null; }
        if (mobileExpandedContainers[pos]) { mobileExpandedContainers[pos].remove(); mobileExpandedContainers[pos] = null; }
        isMobilePanelExpanded[pos] = false;
    });
    settingsBtn = null; addCustomBtn = null;
}

function getOrderedButtons(settings) {
    const order = settings.buttonOrder || [], customIds = settings.customButtons.map(cb => cb.id), result = [];
    order.forEach(id => {
        if (result.indexOf(id) === -1) {
            const cfg = settings.buttons[id];
            if (cfg) {
                if (typeof cfg === 'object') { if (cfg.right || cfg.left || cfg.top || cfg.bottom) result.push(id); }
                else if (cfg) result.push(id);
            } else if (customIds.indexOf(id) !== -1) result.push(id);
        }
    });
    for (const k in settings.buttons) { if (result.indexOf(k) === -1) { const cfg = settings.buttons[k]; if (cfg && typeof cfg === 'object' && (cfg.right || cfg.left || cfg.top || cfg.bottom)) result.push(k); } }
    customIds.forEach(id => { if (result.indexOf(id) === -1) result.push(id); });
    return result;
}

function addBtnToPanel(container, btnId, pos, settings, scale) {
    const isCustom = btnId.startsWith('custom_'), custom = isCustom ? settings.customButtons.find(cb => cb.id === btnId) : null;
    if (isCustom && !custom) return;
    const def = isCustom ? null : BUTTON_DEFS[btnId];
    if (!isCustom && !def) return;
    const btn = createButton(isCustom ? custom.icon : def.text, isCustom ? custom.title : def.title, null, false, scale);
    if (isCustom) { btn.onclick = e => { if (btn._cmjf) { e.preventDefault(); e.stopPropagation(); return; } location.href = custom.url; }; }
    else {
        btn.onclick = e => { if (btn._cmjf) { e.preventDefault(); e.stopPropagation(); return; } if (def.action) def.action(e); };
        btn.addEventListener('contextmenu', function(e) { e.preventDefault(); e.stopPropagation();
            if (def.showSettings) showExtraButtons(btn, pos);
            else if (btnId === 'forum') showForumModal();
            else if (btnId === 'tracker') showTrackerModal();
            else if (btnId === 'notifications') showNotificationsModal();
            else if (btnId === 'saved') addCurrentPageToSaved();
            else if (btnId === 'blacklist') confirmAndAddToBlacklist();
            else if (btnId === 'visits') confirmAndAddToTracked();
        });
        if (def.showSettings) btn.style.position = 'relative';
    }
    container.appendChild(btn); allButtons[btnId + '_' + pos] = btn;
    if (btnId === 'notifications') updateNotificationBadge(btn);
    return btn;
}

function addDesktopPanel() {
    const settings = getSettings(), colors = getThemeColors(), scale = settings.general.scale / 100;
    const sbw = window.innerWidth - document.documentElement.clientWidth;
    const gap = Math.round(8 * scale), padding = Math.round(8 * scale);
    cleanupPanels();
    const ordered = getOrderedButtons(settings);
    const profCfg = settings.buttons['profile'] || { right: true, left: false, top: false, bottom: false };
    settings.buttons['profile'] = profCfg;
    let profPos = 'right'; POSITIONS.forEach(pos => { if (profCfg[pos]) profPos = pos; });
    const positions = {
        right: { top: '120px', transform: 'none', left: 'auto', right: '5px', bottom: 'auto', dir: 'column' },
        left:  { top: '120px', transform: 'none', left: '5px', right: 'auto', bottom: 'auto', dir: 'column' },
        top:   { top: '20px', transform: 'translateX(-50%)', left: '50%', right: 'auto', bottom: 'auto', dir: 'row' },
        bottom:{ top: 'auto', transform: 'translateX(-50%)', left: '50%', right: 'auto', bottom: '20px', dir: 'row' }
    };
    POSITIONS.forEach(pos => {
        let hasBtns = false; ordered.forEach(id => { if (id === 'profile') return; const cfg = settings.buttons[id]; if (cfg && typeof cfg === 'object' && cfg[pos]) hasBtns = true; });
        const hasProf = (pos === profPos); if (!hasBtns && !hasProf) return;
        const ps = positions[pos], container = document.createElement('div');
        container.className = 'lor-panel-container lor-panel-' + pos;
        container.style.cssText = `position:fixed !important;z-index:9999 !important;display:flex !important;gap:${gap}px !important;top:${ps.top};transform:${ps.transform};left:${ps.left};right:${ps.right};bottom:${ps.bottom};flex-direction:${ps.dir};`;
        if (settings.general.showBorder) { container.style.border = '1px solid ' + colors.borderColor; container.style.borderRadius = '12px'; container.style.padding = padding + 'px'; }
        if (hasProf) {
            const profBtn = createButton('👤', 'Профиль', null, true, settings.general.scale); profBtn.style.position = 'relative';
            profBtn.onclick = e => { if (profBtn._cmjf) { e.preventDefault(); e.stopPropagation(); return; } location.href = getProfileUrl(); };
            profBtn.addEventListener('contextmenu', e => { e.preventDefault(); e.stopPropagation(); showExtraButtons(profBtn, pos); });
            container.appendChild(profBtn); allButtons['profile_' + pos] = profBtn;
        }
        ordered.forEach(id => { if (id === 'profile') return; const cfg = settings.buttons[id]; if (!cfg || !cfg[pos]) return; addBtnToPanel(container, id, pos, settings, settings.general.scale); });
        document.body.appendChild(container); panelContainers[pos] = container;
    });
    if (settings.buttons['notifications']) setInterval(() => { POSITIONS.forEach(pos => { const key = 'notifications_' + pos; if (allButtons[key]) updateNotificationBadge(allButtons[key]); }); }, 5000);
    window.addEventListener('scroll', () => { clearTimeout(scrollTimer); scrollTimer = setTimeout(saveScrollPosition, 2000); });
    initTrackerPage();
}

function createMobilePanel() {
    const settings = getSettings(), colors = getThemeColors(), mscale = settings.general.mobileScale / 100;
    const gap = Math.round(8 * mscale), padding = Math.round(8 * mscale);
    cleanupPanels();
    const ordered = getOrderedButtons(settings);
    const profCfg = settings.buttons['profile'] || { right: true, left: false, top: false, bottom: false };
    settings.buttons['profile'] = profCfg;
    let mainPos = 'right', counts = { right: 0, left: 0, top: 0, bottom: 0 };
    ordered.forEach(id => { if (id === 'profile') return; const cfg = settings.buttons[id]; if (cfg && typeof cfg === 'object') POSITIONS.forEach(pos => { if (cfg[pos]) counts[pos]++; }); });
    POSITIONS.forEach(pos => { if (profCfg[pos]) counts[pos]++; });
    let max = 0; POSITIONS.forEach(pos => { if (counts[pos] > max) { max = counts[pos]; mainPos = pos; } });
    if (max === 0) { mainPos = 'right'; if (!profCfg.right) { settings.buttons['profile'] = { right: true, left: false, top: false, bottom: false }; saveSettings(settings); } }
    const collapsed = document.createElement('div'); collapsed.className = 'lor-mobile-collapsed lor-mobile-' + mainPos;
    collapsed.style.cssText = `position:fixed !important;z-index:9999 !important;display:flex !important;gap:${gap}px !important;`;
    if (settings.general.showBorder) { collapsed.style.border = '1px solid ' + colors.borderColor; collapsed.style.borderRadius = '12px'; collapsed.style.padding = padding + 'px'; }
    collapsed.style.flexDirection = (mainPos === 'right' || mainPos === 'left') ? 'column' : 'row';
    const upBtn = createButton('▲', 'Наверх', null, false, settings.general.mobileScale); upBtn.style.position = 'relative';
    upBtn.onclick = e => { if (upBtn._cmjf) { e.preventDefault(); e.stopPropagation(); return; } window.scrollTo({ top: 0, behavior: 'smooth' }); };
    upBtn.addEventListener('contextmenu', e => { e.preventDefault(); e.stopPropagation(); showExtraButtons(upBtn, mainPos); });
    collapsed.appendChild(upBtn);
    const notifBtn = createButton('🔔', 'Уведомления', null, false, settings.general.mobileScale);
    notifBtn.onclick = e => { if (notifBtn._cmjf) { e.preventDefault(); e.stopPropagation(); return; } location.href = 'https://www.linux.org.ru/notifications'; };
    notifBtn.addEventListener('contextmenu', e => { e.preventDefault(); e.stopPropagation(); showNotificationsModal(); });
    collapsed.appendChild(notifBtn);
    if (settings.buttons['notifications'] && settings.buttons['notifications'][mainPos]) { updateNotificationBadge(notifBtn); allButtons['notifications_' + mainPos] = notifBtn; }
    const downBtn = createButton('▼', 'Вниз', null, false, settings.general.mobileScale); downBtn.style.position = 'relative';
    downBtn.onclick = e => { if (downBtn._cmjf) { e.preventDefault(); e.stopPropagation(); return; } window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }); };
    downBtn.addEventListener('contextmenu', e => { e.preventDefault(); e.stopPropagation(); showExtraButtons(downBtn, mainPos); });
    collapsed.appendChild(downBtn);
    document.body.appendChild(collapsed); mobileCollapsedContainers[mainPos] = collapsed;
    POSITIONS.forEach(pos => {
        let hasBtns = false; ordered.forEach(id => { if (id === 'profile') return; const cfg = settings.buttons[id]; if (cfg && typeof cfg === 'object' && cfg[pos]) hasBtns = true; });
        const hasProf = profCfg && typeof profCfg === 'object' && profCfg[pos]; if (!hasBtns && !hasProf) return;
        const expanded = document.createElement('div'); expanded.className = 'lor-mobile-expanded lor-mobile-' + pos;
        expanded.style.cssText = `position:fixed !important;z-index:9999 !important;display:none !important;gap:${gap}px !important;`;
        expanded.style.flexDirection = (pos === 'right' || pos === 'left') ? 'column' : 'row';
        if (pos === 'right' || pos === 'left') { expanded.style.maxHeight = '70vh'; expanded.style.overflowY = 'auto'; } else { expanded.style.maxWidth = '90vw'; expanded.style.overflowX = 'auto'; }
        if (settings.general.showBorder) { expanded.style.border = '1px solid ' + colors.borderColor; expanded.style.borderRadius = '12px'; expanded.style.padding = padding + 'px'; }
        if (hasProf) { const profBtn = createButton('👤', 'Профиль', null, true, settings.general.mobileScale); profBtn.style.position = 'relative'; profBtn.onclick = e => { if (profBtn._cmjf) { e.preventDefault(); e.stopPropagation(); return; } location.href = getProfileUrl(); }; profBtn.addEventListener('contextmenu', e => { e.preventDefault(); e.stopPropagation(); showExtraButtons(profBtn, pos); }); expanded.appendChild(profBtn); allButtons['profile_' + pos] = profBtn; }
        ordered.forEach(id => { if (id === 'profile') return; const cfg = settings.buttons[id]; if (!cfg || !cfg[pos]) return; addBtnToPanel(expanded, id, pos, settings, settings.general.mobileScale); });
        document.body.appendChild(expanded); mobileExpandedContainers[pos] = expanded;
    });
    positionMobilePanels();
    if (settings.buttons['notifications']) setInterval(() => { POSITIONS.forEach(pos => { const key = 'notifications_' + pos; if (allButtons[key]) updateNotificationBadge(allButtons[key]); }); }, 5000);
}

function positionMobilePanels() {
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    const collapsedPos = { right: { top: '25%', transform: 'translateY(-50%)', left: 'auto', right: '0px', bottom: 'auto' }, left: { top: '25%', transform: 'translateY(-50%)', left: '0px', right: 'auto', bottom: 'auto' }, top: { top: '0px', transform: 'translateX(-50%)', left: '50%', right: 'auto', bottom: 'auto' }, bottom: { top: 'auto', transform: 'translateX(-50%)', left: '50%', right: 'auto', bottom: '0px' } };
    const expandedPos = { right: { top: '50%', transform: 'translateY(-50%)', left: 'auto', right: '5px', bottom: 'auto' }, left: { top: '50%', transform: 'translateY(-50%)', left: '5px', right: 'auto', bottom: 'auto' }, top: { top: '5px', transform: 'translateX(-50%)', left: '50%', right: 'auto', bottom: 'auto' }, bottom: { top: 'auto', transform: 'translateX(-50%)', left: '50%', right: 'auto', bottom: '5px' } };
    POSITIONS.forEach(pos => {
        const c = mobileCollapsedContainers[pos], e = mobileExpandedContainers[pos], cp = collapsedPos[pos], ep = expandedPos[pos];
        if (c) { for (const p in cp) c.style[p] = cp[p]; c.style.background = 'rgba(0,0,0,0.3)'; c.style.backdropFilter = 'blur(5px)'; c.style.webkitBackdropFilter = 'blur(5px)'; }
        if (e) { for (const p in ep) e.style[p] = ep[p]; e.style.background = 'rgba(0,0,0,0.5)'; e.style.backdropFilter = 'blur(8px)'; e.style.webkitBackdropFilter = 'blur(8px)'; }
    });
}

function rebuildPanel() { cleanupPanels(); const s = getSettings(); if (s.general.mobileView) createMobilePanel(); else addDesktopPanel(); }

// ============================================================================
// 8. МОДАЛЬНЫЕ ОКНА
// ============================================================================

function showBlacklistModal() {
    if (document.getElementById('lor-blacklist-overlay')) return;
    const settings = getSettings(), modalScale = settings.general.modalScale / 100, isDark = isDarkTheme();
    const listEl = document.createElement('ul'); listEl.id = 'lor-blacklist-list'; listEl.style.cssText = `list-style:none;padding:0;margin:0 0 16px 0;max-height:${Math.round(200 * modalScale)}px;overflow-y:auto;background:${isDark ? '#0d0d1a' : '#f9f9f9'};border:1px solid ${isDark ? '#2a2a3a' : '#e0e0e0'};border-radius:4px;`;
    const input = createInput('Введите ник автора', modalScale, isDark); input.id = 'lor-blacklist-input';
    const addBtn = createActionBtn('Добавить', 'primary', modalScale, isDark); addBtn.id = 'lor-blacklist-add';
    const removeBtn = createActionBtn('Исключить', 'danger', modalScale, isDark); removeBtn.id = 'lor-blacklist-remove';
    const closeBtn = createActionBtn('Закрыть', 'cancel', modalScale, isDark); closeBtn.id = 'lor-blacklist-close';
    const content = document.createElement('div');
    content.innerHTML = `<div style="font-size:${Math.round(16 * modalScale)}px;font-weight:bold;margin-bottom:16px;padding-bottom:8px;border-bottom:1px solid ${isDark ? '#333' : '#ccc'};">Чёрный список авторов</div>`;
    const inpDiv = document.createElement('div'); inpDiv.style.cssText = 'margin-bottom:12px;'; inpDiv.appendChild(input); content.appendChild(inpDiv);
    const btnsDiv = document.createElement('div'); btnsDiv.style.cssText = 'display:flex;gap:8px;margin-bottom:16px;'; btnsDiv.appendChild(addBtn); btnsDiv.appendChild(removeBtn); content.appendChild(btnsDiv);
    const lbl = document.createElement('div'); lbl.style.cssText = `font-size:${Math.round(13 * modalScale)}px;color:${isDark ? '#888' : '#666'};margin-bottom:6px;`; lbl.textContent = 'Авторы в списке:'; content.appendChild(lbl);
    content.appendChild(listEl); const closeDiv = document.createElement('div'); closeDiv.style.cssText = 'text-align:right;'; closeDiv.appendChild(closeBtn); content.appendChild(closeDiv);
    const modal = createModal('Чёрный список', 420, content, 99999, 'lor-blacklist-overlay');
    let blacklist = getBlacklist();
    function render() {
        listEl.innerHTML = '';
        if (blacklist.length === 0) { const empty = document.createElement('li'); empty.textContent = 'список пуст'; empty.style.cssText = `padding:10px;color:${isDark ? '#555' : '#999'};text-align:center;font-style:italic;`; listEl.appendChild(empty); }
        else { blacklist.forEach(nick => { const li = document.createElement('li'); li.style.cssText = `padding:7px 10px;border-bottom:1px solid ${isDark ? '#1a1a2e' : '#e8e8e8'};color:${isDark ? '#ccc' : '#333'};display:flex;justify-content:space-between;align-items:center;`; const ns = document.createElement('span'); ns.textContent = nick; const cb = document.createElement('span'); cb.textContent = '✕'; cb.style.cssText = `color:${isDark ? '#888' : '#999'};cursor:pointer;font-size:16px;padding:0 4px;`; cb.onclick = () => { const idx = blacklist.indexOf(nick); if (idx !== -1) { blacklist.splice(idx, 1); saveBlacklistAndNotify(blacklist); render(); } }; li.appendChild(ns); li.appendChild(cb); listEl.appendChild(li); }); }
    }
    render();
    addBtn.onclick = () => { const nick = input.value.trim(); if (nick && blacklist.indexOf(nick) === -1) { blacklist.push(nick); saveBlacklistAndNotify(blacklist); render(); input.value = ''; } };
    removeBtn.onclick = () => { const nick = input.value.trim(); const idx = blacklist.indexOf(nick); if (idx !== -1) { blacklist.splice(idx, 1); saveBlacklistAndNotify(blacklist); render(); input.value = ''; } };
    closeBtn.onclick = modal.close;
}

function showVisitsModal() {
    if (document.getElementById('lor-visits-overlay')) return;
    const settings = getSettings(), modalScale = settings.general.modalScale / 100, isDark = isDarkTheme();
    const listEl = document.createElement('ul'); listEl.id = 'lor-visits-list'; listEl.style.cssText = `list-style:none;padding:0;margin:0 0 16px 0;max-height:${Math.round(300 * modalScale)}px;overflow-y:auto;background:${isDark ? '#0d0d1a' : '#f9f9f9'};border:1px solid ${isDark ? '#2a2a3a' : '#e0e0e0'};border-radius:4px;`;
    const input = createInput('Введите ник пользователя', modalScale, isDark); input.id = 'lor-visits-input';
    const addBtn = createActionBtn('Добавить', 'primary', modalScale, isDark); addBtn.id = 'lor-visits-add';
    const refreshBtn = createActionBtn('Обновить все', 'primary', modalScale, isDark); refreshBtn.id = 'lor-visits-refresh';
    const closeBtn = createActionBtn('Закрыть', 'cancel', modalScale, isDark); closeBtn.id = 'lor-visits-close';
    const content = document.createElement('div');
    content.innerHTML = `<div style="font-size:${Math.round(16 * modalScale)}px;font-weight:bold;margin-bottom:16px;padding-bottom:8px;border-bottom:1px solid ${isDark ? '#333' : '#ccc'};">🕐 Отслеживание пользователей</div>`;
    const inpDiv = document.createElement('div'); inpDiv.style.cssText = 'margin-bottom:12px;'; inpDiv.appendChild(input); content.appendChild(inpDiv);
    const btnsDiv = document.createElement('div'); btnsDiv.style.cssText = 'display:flex;gap:8px;margin-bottom:16px;'; btnsDiv.appendChild(addBtn); btnsDiv.appendChild(refreshBtn); content.appendChild(btnsDiv);
    const lbl = document.createElement('div'); lbl.style.cssText = `font-size:${Math.round(13 * modalScale)}px;color:${isDark ? '#888' : '#666'};margin-bottom:6px;`; lbl.textContent = 'Отслеживаемые пользователи:'; content.appendChild(lbl);
    content.appendChild(listEl); const closeDiv = document.createElement('div'); closeDiv.style.cssText = 'text-align:right;'; closeDiv.appendChild(closeBtn); content.appendChild(closeDiv);
    const modal = createModal('Отслеживание пользователей', 550, content, 99999, 'lor-visits-overlay');
    function removeUser(nick) { const tracked = getTrackedUsers(); delete tracked[nick]; saveTrackedUsers(tracked); render(); }
    function render() {
        const tracked = getTrackedUsers(), nicks = Object.keys(tracked); listEl.innerHTML = '';
        if (nicks.length === 0) { const empty = document.createElement('li'); empty.textContent = 'список пуст'; empty.style.cssText = `padding:10px;color:${isDark ? '#555' : '#999'};text-align:center;font-style:italic;`; listEl.appendChild(empty); }
        else { nicks.forEach(nick => { const data = tracked[nick]; const li = document.createElement('li'); li.style.cssText = `padding:8px 10px;border-bottom:1px solid ${isDark ? '#1a1a2e' : '#e8e8e8'};color:${isDark ? '#ccc' : '#333'};display:flex;justify-content:space-between;align-items:center;`; const left = document.createElement('div'); left.style.cssText = 'flex:1;'; const nl = document.createElement('a'); nl.textContent = nick; nl.href = '/people/' + nick + '/profile'; nl.style.cssText = 'color:#4a90d9;text-decoration:none;font-weight:bold;cursor:pointer;'; nl.onclick = e => { if (e.button === 0) modal.close(); }; nl.onmouseenter = () => { this.style.textDecoration = 'underline'; }; nl.onmouseleave = () => { this.style.textDecoration = 'none'; }; left.appendChild(nl); const vd = document.createElement('div'); vd.style.cssText = `font-size:${Math.round(12 * modalScale)}px;color:${isDark ? '#888' : '#666'};margin-top:2px;`; vd.textContent = 'Последнее посещение: ' + (data.lastVisit || 'загрузка...'); vd.className = 'lor-vt-' + sanitizeClassNick(nick); left.appendChild(vd); li.appendChild(left); const cb = document.createElement('span'); cb.textContent = '✕'; cb.style.cssText = `color:${isDark ? '#888' : '#999'};cursor:pointer;font-size:18px;padding:0 4px;margin-left:10px;`; cb.title = 'Удалить из отслеживания'; cb.onclick = () => { removeUser(nick); }; li.appendChild(cb); listEl.appendChild(li); }); }
        loadAll();
    }
    function loadAll() { const tracked = getTrackedUsers(), nicks = Object.keys(tracked); if (nicks.length === 0) return; nicks.forEach(nick => { fetchLastVisit(nick, vt => { tracked[nick] = { lastVisit: vt, checked: Date.now() }; saveTrackedUsers(tracked); const el = document.querySelector('.lor-vt-' + sanitizeClassNick(nick)); if (el) el.textContent = 'Последнее посещение: ' + vt; }); }); }
    render();
    addBtn.onclick = () => { const nick = input.value.trim(); if (!nick) return; const tracked = getTrackedUsers(); if (tracked[nick]) { alert('Пользователь "' + nick + '" уже отслеживается.'); return; } tracked[nick] = { lastVisit: 'загрузка...', checked: 0 }; saveTrackedUsers(tracked); render(); input.value = ''; };
    refreshBtn.onclick = () => { const tracked = getTrackedUsers(), nicks = Object.keys(tracked); if (nicks.length === 0) return; nicks.forEach(nick => { tracked[nick] = { lastVisit: 'загрузка...', checked: 0 }; const el = document.querySelector('.lor-vt-' + sanitizeClassNick(nick)); if (el) el.textContent = 'Последнее посещение: загрузка...'; }); saveTrackedUsers(tracked); loadAll(); };
    input.addEventListener('keydown', e => { if (e.key === 'Enter') addBtn.click(); });
    closeBtn.onclick = modal.close;
}

function showHelpModal() {
    if (document.getElementById('lor-help-overlay')) return;
    const settings = getSettings(), modalScale = settings.general.modalScale / 100, isDark = isDarkTheme();
    const content = document.createElement('div'); content.style.cssText = 'overflow-y:auto;flex:1;min-height:200px;padding-right:8px;';
    const sections = [
        { title: '📌 Четыре панели', content: 'Теперь доступно 4 независимые панели: <b>справа, слева, сверху и снизу</b>. Каждая кнопка может быть включена на любой комбинации панелей.' },
        { title: '📱 Мобильный вид', content: 'При включении мобильного вида панель сворачивается в три кнопки: ▲ 🔔 ▼. <b>Свайп вниз</b> — разворачивает, <b>свайп вверх</b> — сворачивает.' },
        { title: '📋 Кнопка "Форум"', content: '<b>ЛКМ:</b> Переход на форум.<br><b>ПКМ:</b> Список разделов с количеством новых тем.' },
        { title: '☰ Кнопка "Трекер"', content: '<b>ЛКМ:</b> Переход в трекер.<br><b>ПКМ:</b> Список тем с количеством сообщений.' },
        { title: '🔔 Кнопка "Уведомления"', content: '<b>ЛКМ:</b> Страница уведомлений.<br><b>ПКМ:</b> Список уведомлений.<br><b>Цифра:</b> Количество непрочитанных.' },
        { title: '💾 Кнопка "Сохраненные"', content: '<b>ЛКМ:</b> Список сохранённых страниц.<br><b>ПКМ:</b> Сохранить текущую страницу.' },
        { title: '💬 Кнопка "Мои сообщения"', content: '<b>ЛКМ:</b> Прокрутка к вашему последнему комментарию.' },
        { title: '🚫 Кнопка "Чёрный список"', content: '<b>ЛКМ:</b> Управление списком.<br><b>ПКМ на новости:</b> Добавить автора в список.' },
        { title: '🕐 Кнопка "Посещения"', content: '<b>ЛКМ:</b> Список отслеживаемых пользователей.<br><b>ПКМ на новости:</b> Добавить автора в список.' },
        { title: '⚙ Настройки', content: 'Кнопка настроек появляется при ПКМ на кнопку профиля. Можно настроить масштаб, мобильный вид, отображение кнопок.' }
    ];
    sections.forEach(sec => { const sd = document.createElement('div'); sd.style.cssText = 'margin-bottom:20px;'; const st = document.createElement('div'); st.textContent = sec.title; st.style.cssText = `font-weight:bold;margin-bottom:6px;color:#4a90d9;font-size:${Math.round(15 * modalScale)}px;`; sd.appendChild(st); const sc = document.createElement('div'); sc.innerHTML = sec.content; sc.style.cssText = `font-size:${Math.round(13 * modalScale)}px;line-height:1.6;padding-left:12px;border-left:2px solid ${isDark ? '#2a2a3a' : '#e0e0e0'};`; sd.appendChild(sc); content.appendChild(sd); });
    createModal('❓ Справка', 600, content, 100010, 'lor-help-overlay');
}

function showSettingsModal() {
    if (document.getElementById('lor-settings-overlay')) return;
    var settings = getSettings();
    var isDark = isDarkTheme();
    var modalScale = settings.general.modalScale / 100;
    var overlay = document.createElement('div');
    overlay.id = 'lor-settings-overlay';
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:' + (isDark ? 'rgba(0,0,0,0.7)' : 'rgba(0,0,0,0.3)') + ';z-index:100000;display:flex;align-items:center;justify-content:center;';
    var modal = document.createElement('div');
    modal.style.cssText = 'background:' + (isDark ? '#0a0a14' : '#ffffff') + ';border:1px solid ' + (isDark ? '#333' : '#ccc') + ';padding:' + Math.round(24 * modalScale) + 'px;border-radius:' + Math.round(8 * modalScale) + 'px;width:' + Math.round(600 * modalScale) + 'px;color:' + (isDark ? '#ccc' : '#333') + ';font-family:Arial,sans-serif;font-size:' + Math.round(14 * modalScale) + 'px;box-shadow:0 0 30px rgba(0,0,0,' + (isDark ? '0.8' : '0.2') + ');max-height:90vh;display:flex;flex-direction:column;';
    var title = document.createElement('div');
    title.style.cssText = 'font-size:' + Math.round(18 * modalScale) + 'px;font-weight:bold;margin-bottom:16px;padding-bottom:8px;border-bottom:1px solid ' + (isDark ? '#333' : '#ccc') + ';';
    title.textContent = 'Настройки панели';
    modal.appendChild(title);
    var tabs = document.createElement('div');
    tabs.style.cssText = 'display:flex;gap:0;margin-bottom:16px;border-bottom:1px solid ' + (isDark ? '#333' : '#ccc') + ';flex-wrap:wrap;';
    var tabGeneral = document.createElement('div');
    tabGeneral.id = 'lor-settings-tab-general';
    tabGeneral.textContent = 'Общие';
    tabGeneral.style.cssText = 'padding:8px 16px;cursor:pointer;border-bottom:2px solid #4a90d9;color:#4a90d9;font-weight:bold;font-size:' + Math.round(14 * modalScale) + 'px;';
    tabs.appendChild(tabGeneral);
    var tabButtons = document.createElement('div');
    tabButtons.id = 'lor-settings-tab-buttons';
    tabButtons.textContent = 'Кнопки';
    tabButtons.style.cssText = 'padding:8px 16px;cursor:pointer;border-bottom:2px solid transparent;color:' + (isDark ? '#888' : '#666') + ';font-size:' + Math.round(14 * modalScale) + 'px;';
    tabs.appendChild(tabButtons);
    var tabFilter = document.createElement('div');
    tabFilter.id = 'lor-settings-tab-filter';
    tabFilter.textContent = 'Фильтрация';
    tabFilter.style.cssText = 'padding:8px 16px;cursor:pointer;border-bottom:2px solid transparent;color:' + (isDark ? '#888' : '#666') + ';font-size:' + Math.round(14 * modalScale) + 'px;';
    tabs.appendChild(tabFilter);
    var tabHelp = document.createElement('div');
    tabHelp.id = 'lor-settings-tab-help';
    tabHelp.textContent = 'Справка';
    tabHelp.style.cssText = 'padding:8px 16px;cursor:pointer;border-bottom:2px solid transparent;color:' + (isDark ? '#888' : '#666') + ';font-size:' + Math.round(14 * modalScale) + 'px;';
    tabs.appendChild(tabHelp);
    modal.appendChild(tabs);
    var content = document.createElement('div');
    content.id = 'lor-settings-tab-content';
    content.style.cssText = 'flex:1;overflow-y:auto;min-height:200px;max-height:60vh;';
    modal.appendChild(content);
    var footer = document.createElement('div');
    footer.style.cssText = 'text-align:right;margin-top:16px;padding-top:12px;border-top:1px solid ' + (isDark ? '#333' : '#ccc') + ';';
    var saveBtn = document.createElement('button');
    saveBtn.id = 'lor-settings-save';
    saveBtn.textContent = 'Сохранить';
    saveBtn.style.cssText = 'padding:8px 20px;background:#0a3d6b;color:#ddd;border:1px solid #1a5a9a;border-radius:4px;cursor:pointer;font-size:' + Math.round(13 * modalScale) + 'px;margin-right:8px;';
    footer.appendChild(saveBtn);
    var cancelBtn = document.createElement('button');
    cancelBtn.id = 'lor-settings-cancel';
    cancelBtn.textContent = 'Отмена';
    cancelBtn.style.cssText = 'padding:8px 20px;background:' + (isDark ? '#2a2a3a' : '#e0e0e0') + ';color:' + (isDark ? '#aaa' : '#666') + ';border:1px solid ' + (isDark ? '#444' : '#ccc') + ';border-radius:4px;cursor:pointer;font-size:' + Math.round(13 * modalScale) + 'px;';
    footer.appendChild(cancelBtn);
    modal.appendChild(footer);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    var currentTab = 'general';

    function renderGeneralTab() {
        content.innerHTML = '';
        var mobileDiv = document.createElement('div');
        mobileDiv.style.cssText = 'margin-bottom:16px;';
        var mobileLabel = document.createElement('label');
        mobileLabel.style.cssText = 'display:flex;align-items:center;gap:8px;cursor:pointer;';
        var mobileCheck = document.createElement('input');
        mobileCheck.type = 'checkbox';
        mobileCheck.id = 'lor-setting-mobile-view';
        mobileCheck.checked = settings.general.mobileView;
        mobileCheck.style.cssText = 'width:16px;height:16px;';
        mobileLabel.appendChild(mobileCheck);
        var mobileText = document.createElement('span');
        mobileText.textContent = 'Мобильный вид (свайп-панель)';
        mobileLabel.appendChild(mobileText);
        mobileDiv.appendChild(mobileLabel);
        content.appendChild(mobileDiv);
        var borderDiv = document.createElement('div');
        borderDiv.style.cssText = 'margin-bottom:16px;';
        var borderLabel = document.createElement('label');
        borderLabel.style.cssText = 'display:flex;align-items:center;gap:8px;cursor:pointer;';
        var borderCheck = document.createElement('input');
        borderCheck.type = 'checkbox';
        borderCheck.id = 'lor-setting-border';
        borderCheck.checked = settings.general.showBorder;
        borderCheck.style.cssText = 'width:16px;height:16px;';
        borderLabel.appendChild(borderCheck);
        var borderText = document.createElement('span');
        borderText.textContent = 'Отображать рамку панели';
        borderLabel.appendChild(borderText);
        borderDiv.appendChild(borderLabel);
        content.appendChild(borderDiv);
        var scaleDiv = document.createElement('div');
        scaleDiv.style.cssText = 'margin-bottom:16px;';
        var scaleLabel = document.createElement('label');
        scaleLabel.style.cssText = 'display:block;margin-bottom:8px;';
        var scaleText = document.createElement('span');
        scaleText.textContent = 'Масштаб панели:';
        scaleLabel.appendChild(scaleText);
        var scaleSelect = document.createElement('select');
        scaleSelect.id = 'lor-setting-scale';
        scaleSelect.style.cssText = 'padding:6px 10px;background:' + (isDark ? '#111' : '#f5f5f5') + ';color:' + (isDark ? '#ccc' : '#333') + ';border:1px solid ' + (isDark ? '#444' : '#ccc') + ';border-radius:4px;font-size:' + Math.round(14 * modalScale) + 'px;margin-top:4px;';
        for (var s = 30; s <= 200; s += 10) {
            var opt = document.createElement('option');
            opt.value = s;
            opt.textContent = s + '%';
            if (settings.general.scale === s) opt.selected = true;
            scaleSelect.appendChild(opt);
        }
        scaleLabel.appendChild(scaleSelect);
        scaleDiv.appendChild(scaleLabel);
        content.appendChild(scaleDiv);
        var mobScaleDiv = document.createElement('div');
        mobScaleDiv.style.cssText = 'margin-bottom:16px;';
        var mobScaleLabel = document.createElement('label');
        mobScaleLabel.style.cssText = 'display:block;margin-bottom:8px;';
        var mobScaleText = document.createElement('span');
        mobScaleText.textContent = 'Масштаб в мобильном виде:';
        mobScaleLabel.appendChild(mobScaleText);
        var mobScaleSelect = document.createElement('select');
        mobScaleSelect.id = 'lor-setting-mobile-scale';
        mobScaleSelect.style.cssText = 'padding:6px 10px;background:' + (isDark ? '#111' : '#f5f5f5') + ';color:' + (isDark ? '#ccc' : '#333') + ';border:1px solid ' + (isDark ? '#444' : '#ccc') + ';border-radius:4px;font-size:' + Math.round(14 * modalScale) + 'px;margin-top:4px;';
        for (var ms = 30; ms <= 300; ms += 10) {
            var mopt = document.createElement('option');
            mopt.value = ms;
            mopt.textContent = ms + '%';
            if (settings.general.mobileScale === ms) mopt.selected = true;
            mobScaleSelect.appendChild(mopt);
        }
        mobScaleLabel.appendChild(mobScaleSelect);
        mobScaleDiv.appendChild(mobScaleLabel);
        content.appendChild(mobScaleDiv);
        var modalScaleDiv = document.createElement('div');
        modalScaleDiv.style.cssText = 'margin-bottom:16px;';
        var modalScaleLabel = document.createElement('label');
        modalScaleLabel.style.cssText = 'display:block;margin-bottom:8px;';
        var modalScaleText = document.createElement('span');
        modalScaleText.textContent = 'Масштаб модальных окон:';
        modalScaleLabel.appendChild(modalScaleText);
        var modalScaleSelect = document.createElement('select');
        modalScaleSelect.id = 'lor-setting-modal-scale';
        modalScaleSelect.style.cssText = 'padding:6px 10px;background:' + (isDark ? '#111' : '#f5f5f5') + ';color:' + (isDark ? '#ccc' : '#333') + ';border:1px solid ' + (isDark ? '#444' : '#ccc') + ';border-radius:4px;font-size:' + Math.round(14 * modalScale) + 'px;margin-top:4px;';
        for (var mms = 30; mms <= 200; mms += 10) {
            var mmopt = document.createElement('option');
            mmopt.value = mms;
            mmopt.textContent = mms + '%';
            if (settings.general.modalScale === mms) mmopt.selected = true;
            modalScaleSelect.appendChild(mmopt);
        }
        modalScaleLabel.appendChild(modalScaleSelect);
        modalScaleDiv.appendChild(modalScaleLabel);
        content.appendChild(modalScaleDiv);
    }

    function renderButtonsTab() {
        content.innerHTML = '';
        var btnNames = {
            up: '▲ Наверх', forum: '📋 Форум', tracker: '☰ Трекер', notifications: '🔔 Уведомления',
            saved: '💾 Сохраненные', myComment: '💬 Мои сообщения', mention: '📢 Упоминания',
            blacklist: '🚫 Чёрный список', visits: '🕐 Посещения', down: '▼ Вниз', help: '❓ Справка'
        };
        var allButtonIds = settings.buttonOrder.slice();
        for (var key in settings.buttons) {
            if (allButtonIds.indexOf(key) === -1 && key !== 'profile') allButtonIds.push(key);
        }
        settings.customButtons.forEach(function(cb) {
            if (allButtonIds.indexOf(cb.id) === -1) allButtonIds.push(cb.id);
        });
        for (var name in btnNames) {
            if (allButtonIds.indexOf(name) === -1) allButtonIds.push(name);
        }
        var headerDiv = document.createElement('div');
        headerDiv.style.cssText = 'display:flex;align-items:center;margin-bottom:8px;padding:0 8px;font-weight:bold;font-size:' + Math.round(12 * modalScale) + 'px;color:' + (isDark ? '#aaa' : '#666') + ';';
        var nameHeader = document.createElement('span');
        nameHeader.textContent = 'Кнопка';
        nameHeader.style.cssText = 'flex:1;';
        headerDiv.appendChild(nameHeader);
        var posLabels = ['Справа', 'Слева', 'Сверху', 'Снизу'];
        var posKeys = ['right', 'left', 'top', 'bottom'];
        posKeys.forEach(function(pos, index) {
            var posSpan = document.createElement('span');
            posSpan.textContent = posLabels[index];
            posSpan.style.cssText = 'width:55px;text-align:center;font-size:' + Math.round(11 * modalScale) + 'px;';
            headerDiv.appendChild(posSpan);
        });
        var actionsHeader = document.createElement('span');
        actionsHeader.style.cssText = 'width:60px;text-align:center;font-size:' + Math.round(11 * modalScale) + 'px;';
        actionsHeader.textContent = 'Действ.';
        headerDiv.appendChild(actionsHeader);
        content.appendChild(headerDiv);
        var separator = document.createElement('div');
        separator.style.cssText = 'border-bottom:1px solid ' + (isDark ? '#333' : '#ccc') + ';margin-bottom:8px;';
        content.appendChild(separator);
        var profileConfig = settings.buttons['profile'];
        if (!profileConfig || typeof profileConfig !== 'object') {
            profileConfig = { right: true, left: false, top: false, bottom: false };
            settings.buttons['profile'] = profileConfig;
        }
        var profilePosition = 'right';
        posKeys.forEach(function(pos) { if (profileConfig[pos]) profilePosition = pos; });
        var profileDiv = document.createElement('div');
        profileDiv.style.cssText = 'margin-bottom:10px;display:flex;align-items:center;gap:4px;padding:8px 8px;border-radius:4px;background:' + (isDark ? '#1a1a2e' : '#f0f4f8') + ';border:1px solid #4a90d9;';
        var profileLabel = document.createElement('label');
        profileLabel.style.cssText = 'flex:1;display:flex;align-items:center;gap:4px;font-weight:bold;';
        var profileSpan = document.createElement('span');
        profileSpan.textContent = '👤 Профиль';
        profileSpan.style.cssText = 'color:#4a90d9;';
        profileLabel.appendChild(profileSpan);
        profileDiv.appendChild(profileLabel);
        posKeys.forEach(function(pos, index) {
            var radio = document.createElement('input');
            radio.type = 'radio';
            radio.name = 'lor-profile-position';
            radio.className = 'lor-setting-profile-radio';
            radio.setAttribute('data-pos', pos);
            radio.checked = (pos === profilePosition);
            radio.style.cssText = 'width:14px;height:14px;margin:0;cursor:pointer;accent-color:#4a90d9;';
            radio.title = 'Профиль ' + posLabels[index];
            radio.onchange = function() {
                if (this.checked) {
                    posKeys.forEach(function(p) { settings.buttons['profile'][p] = false; });
                    settings.buttons['profile'][pos] = true;
                }
            };
            var radioWrapper = document.createElement('div');
            radioWrapper.style.cssText = 'width:55px;display:flex;justify-content:center;';
            radioWrapper.appendChild(radio);
            profileDiv.appendChild(radioWrapper);
        });
        var profileActions = document.createElement('div');
        profileActions.style.cssText = 'width:60px;';
        profileDiv.appendChild(profileActions);
        content.appendChild(profileDiv);
        var profileHint = document.createElement('div');
        profileHint.style.cssText = 'margin-bottom:12px;padding:4px 8px;font-size:' + Math.round(11 * modalScale) + 'px;color:' + (isDark ? '#888' : '#666') + ';font-style:italic;';
        profileHint.textContent = 'Профиль всегда отображается ровно на одной панели';
        content.appendChild(profileHint);
        var separator2 = document.createElement('div');
        separator2.style.cssText = 'border-bottom:1px solid ' + (isDark ? '#333' : '#ccc') + ';margin-bottom:10px;';
        content.appendChild(separator2);
        allButtonIds.forEach(function(btnId) {
            if (btnId === 'profile') return;
            var isCustom = btnId.startsWith('custom_');
            var customBtn = null;
            if (isCustom) {
                customBtn = settings.customButtons.find(function(cb) { return cb.id === btnId; });
                if (!customBtn) return;
            } else if (!btnNames[btnId]) return;
            var btnConfig = settings.buttons[btnId];
            if (!btnConfig || typeof btnConfig !== 'object') {
                btnConfig = { right: false, left: false, top: false, bottom: false };
                settings.buttons[btnId] = btnConfig;
            }
            var isActive = btnConfig.right || btnConfig.left || btnConfig.top || btnConfig.bottom;
            var div = document.createElement('div');
            div.style.cssText = 'margin-bottom:8px;display:flex;align-items:center;gap:4px;padding:6px 8px;border-radius:4px;' + (isActive ? '' : 'opacity:0.7;');
            var label = document.createElement('label');
            label.style.cssText = 'flex:1;display:flex;align-items:center;gap:4px;cursor:pointer;';
            var span = document.createElement('span');
            span.textContent = isCustom && customBtn ? customBtn.icon + ' ' + customBtn.title : btnNames[btnId] || btnId;
            if (!isActive) span.style.textDecoration = 'line-through';
            label.appendChild(span);
            div.appendChild(label);
            posKeys.forEach(function(pos, index) {
                var cb = document.createElement('input');
                cb.type = 'checkbox';
                cb.className = 'lor-setting-btn';
                cb.setAttribute('data-key', btnId);
                cb.setAttribute('data-pos', pos);
                cb.checked = btnConfig[pos] || false;
                cb.style.cssText = 'width:14px;height:14px;margin:0;cursor:pointer;';
                cb.title = posLabels[index];
                cb.onchange = function() {
                    settings.buttons[btnId][pos] = this.checked;
                    var nowActive = settings.buttons[btnId].right || settings.buttons[btnId].left || settings.buttons[btnId].top || settings.buttons[btnId].bottom;
                    if (nowActive) { div.style.opacity = '1'; span.style.textDecoration = 'none'; }
                    else { div.style.opacity = '0.7'; span.style.textDecoration = 'line-through'; }
                };
                var cbWrapper = document.createElement('div');
                cbWrapper.style.cssText = 'width:55px;display:flex;justify-content:center;';
                cbWrapper.appendChild(cb);
                div.appendChild(cbWrapper);
            });
            var actionsDiv = document.createElement('div');
            actionsDiv.style.cssText = 'width:60px;display:flex;gap:4px;justify-content:center;';
            var upBtn = document.createElement('button');
            upBtn.textContent = '^';
            upBtn.title = 'Поднять выше';
            upBtn.style.cssText = 'padding:2px 8px;background:' + (isDark ? '#1a2a3a' : '#e0e0e0') + ';color:' + (isDark ? '#aaa' : '#666') + ';border:1px solid ' + (isDark ? '#333' : '#ccc') + ';border-radius:3px;cursor:pointer;font-size:' + Math.round(12 * modalScale) + 'px;line-height:1;';
            upBtn.onmouseenter = function() { this.style.background = isDark ? '#2a3a4a' : '#d0d0d0'; };
            upBtn.onmouseleave = function() { this.style.background = isDark ? '#1a2a3a' : '#e0e0e0'; };
            upBtn.onclick = function(e) {
                e.stopPropagation();
                moveButtonUp(btnId, settings);
                saveSettings(settings);
                renderButtonsTab();
            };
            actionsDiv.appendChild(upBtn);
            if (isCustom) {
                var delBtn = document.createElement('button');
                delBtn.textContent = '×';
                delBtn.title = 'Удалить кнопку';
                delBtn.style.cssText = 'padding:2px 8px;background:#5a1a1a;color:#ddd;border:1px solid #8a2a2a;border-radius:3px;cursor:pointer;font-size:' + Math.round(12 * modalScale) + 'px;line-height:1;';
                delBtn.onmouseenter = function() { this.style.background = '#7a2a2a'; };
                delBtn.onmouseleave = function() { this.style.background = '#5a1a1a'; };
                delBtn.onclick = function(e) {
                    e.stopPropagation();
                    if (confirm('Удалить кнопку "' + customBtn.title + '"?')) {
                        settings.customButtons = settings.customButtons.filter(function(cb) { return cb.id !== btnId; });
                        settings.buttonOrder = settings.buttonOrder.filter(function(id) { return id !== btnId; });
                        if (settings.buttons.hasOwnProperty(btnId)) delete settings.buttons[btnId];
                        saveSettings(settings);
                        renderButtonsTab();
                    }
                };
                actionsDiv.appendChild(delBtn);
            }
            div.appendChild(actionsDiv);
            content.appendChild(div);
        });
        var hint = document.createElement('div');
        hint.style.cssText = 'margin-top:12px;padding:8px;font-size:' + Math.round(11 * modalScale) + 'px;color:' + (isDark ? '#666' : '#999') + ';text-align:center;border-top:1px solid ' + (isDark ? '#333' : '#ccc') + ';';
        hint.innerHTML = 'Отметьте чекбоксами, на каких панелях отображать кнопки.<br>Профиль всегда на одной панели (выберите радиокнопкой).';
        content.appendChild(hint);
    }

    function renderFilterTab() {
        content.innerHTML = '';
        var enabledDiv = document.createElement('div');
        enabledDiv.style.cssText = 'margin-bottom:16px;';
        var enabledLabel = document.createElement('label');
        enabledLabel.style.cssText = 'display:flex;align-items:center;gap:8px;cursor:pointer;';
        var enabledCheck = document.createElement('input');
        enabledCheck.type = 'checkbox';
        enabledCheck.id = 'lor-filter-enabled';
        enabledCheck.checked = settings.filter.enabled;
        enabledCheck.style.cssText = 'width:16px;height:16px;';
        enabledLabel.appendChild(enabledCheck);
        var enabledText = document.createElement('span');
        enabledText.textContent = 'Включить фильтрацию новостей по чёрному списку';
        enabledLabel.appendChild(enabledText);
        enabledDiv.appendChild(enabledLabel);
        content.appendChild(enabledDiv);
        var modeDiv = document.createElement('div');
        modeDiv.style.cssText = 'margin-bottom:16px;';
        var modeTitle = document.createElement('div');
        modeTitle.textContent = 'Режим обработки:';
        modeTitle.style.cssText = 'font-weight:bold;margin-bottom:8px;';
        modeDiv.appendChild(modeTitle);
        var cutLabel = document.createElement('label');
        cutLabel.style.cssText = 'display:flex;align-items:center;gap:8px;cursor:pointer;margin-bottom:6px;';
        var cutRadio = document.createElement('input');
        cutRadio.type = 'radio';
        cutRadio.name = 'lor-filter-mode';
        cutRadio.value = 'cut';
        cutRadio.checked = settings.filter.mode === 'cut';
        cutRadio.style.cssText = 'width:16px;height:16px;';
        cutLabel.appendChild(cutRadio);
        var cutText = document.createElement('span');
        cutText.innerHTML = '<b>Вырезать</b> новости (скрывать) + бесконечная лента';
        cutLabel.appendChild(cutText);
        modeDiv.appendChild(cutLabel);
        var blurLabel = document.createElement('label');
        blurLabel.style.cssText = 'display:flex;align-items:center;gap:8px;cursor:pointer;';
        var blurRadio = document.createElement('input');
        blurRadio.type = 'radio';
        blurRadio.name = 'lor-filter-mode';
        blurRadio.value = 'blur';
        blurRadio.checked = settings.filter.mode === 'blur';
        blurRadio.style.cssText = 'width:16px;height:16px;';
        blurLabel.appendChild(blurRadio);
        var blurText = document.createElement('span');
        blurText.innerHTML = '<b>Размывать</b> новости (blur) — без бесконечной ленты';
        blurLabel.appendChild(blurText);
        modeDiv.appendChild(blurLabel);
        content.appendChild(modeDiv);
        var miniDiv = document.createElement('div');
        miniDiv.style.cssText = 'margin-bottom:16px;';
        var miniLabel = document.createElement('label');
        miniLabel.style.cssText = 'display:flex;align-items:center;gap:8px;cursor:pointer;';
        var miniCheck = document.createElement('input');
        miniCheck.type = 'checkbox';
        miniCheck.id = 'lor-filter-mini';
        miniCheck.checked = settings.filter.applyToMini;
        miniCheck.style.cssText = 'width:16px;height:16px;';
        miniLabel.appendChild(miniCheck);
        var miniText = document.createElement('span');
        miniText.textContent = 'Проверять авторов мини-новостей (через загрузку страницы)';
        miniLabel.appendChild(miniText);
        miniDiv.appendChild(miniLabel);
        content.appendChild(miniDiv);
        var animateDiv = document.createElement('div');
        animateDiv.style.cssText = 'margin-bottom:16px;';
        var animateLabel = document.createElement('label');
        animateLabel.style.cssText = 'display:flex;align-items:center;gap:8px;cursor:pointer;';
        var animateCheck = document.createElement('input');
        animateCheck.type = 'checkbox';
        animateCheck.id = 'lor-filter-animate';
        animateCheck.checked = settings.filter.animateBlur;
        animateCheck.style.cssText = 'width:16px;height:16px;';
        animateLabel.appendChild(animateCheck);
        var animateText = document.createElement('span');
        animateText.textContent = 'Анимировать появление/исчезновение блюра';
        animateLabel.appendChild(animateText);
        animateDiv.appendChild(animateLabel);
        content.appendChild(animateDiv);
        var hint = document.createElement('div');
        hint.style.cssText = 'margin-top:20px;padding:10px;font-size:' + Math.round(12 * modalScale) + 'px;color:' + (isDark ? '#888' : '#666') + ';background:' + (isDark ? '#1a1a2e' : '#f5f5f5') + ';border-radius:4px;';
        hint.innerHTML = '<b>Примечание:</b> Режим «Вырезать» включает бесконечную ленту новостей. ' +
            'Режим «Размывать» только скрывает контент визуально, лента не подгружается. ' +
            'Настройки применяются сразу после сохранения.';
        content.appendChild(hint);
    }

    function renderHelpTab() {
        content.innerHTML = '';
        var helpSections = [
            { title: '📌 Четыре панели', content: 'Теперь доступно 4 независимые панели: <b>справа, слева, сверху и снизу</b>. Каждая кнопка может быть включена на любой комбинации панелей. Настройка производится во вкладке "Кнопки" (чекбоксы Справа/Слева/Сверху/Снизу). Панель не создаётся, если на ней нет активных кнопок (кроме профиля).' },
            { title: '📱 Мобильный вид', content: 'При включении мобильного вида панель сворачивается в три кнопки: ▲ 🔔 ▼. <b>Свайп вниз</b> по области панели — разворачивает все кнопки. <b>Свайп вверх</b> по любой иконке — сворачивает обратно. В мобильном виде работает отдельный масштаб.' },
            { title: '📋 Кнопка "Форум"', content: '<b>ЛКМ:</b> Переход на главную страницу форума.<br><b>ПКМ (долгое нажатие):</b> Открывает модальное окно со списком разделов форума. Для каждого раздела показывается количество новых тем за сутки. Если количество изменилось по сравнению с предыдущей проверкой, раздел подсвечивается зелёным и показывает количество новых тем.<br><b>ЛКМ по разделу:</b> Переход в раздел.<br><b>Колесо по разделу:</b> Открыть раздел в новой вкладке.' },
            { title: '☰ Кнопка "Трекер"', content: '<b>ЛКМ:</b> Переход на главную страницу трекера.<br><b>ПКМ (долгое нажатие):</b> Открывает модальное окно со списком последних тем трекера. Для каждой темы показывается количество сообщений. Если количество изменилось, тема подсвечивается зелёным и показывает количество новых сообщений.<br><b>ЛКМ по теме:</b> Переход в тему.<br><b>Колесо по теме:</b> Открыть тему в новой вкладке.' },
            { title: '🔔 Кнопка "Уведомления"', content: '<b>ЛКМ:</b> Переход на страницу уведомлений.<br><b>ПКМ (долгое нажатие):</b> Открывает модальное окно со списком всех уведомлений. Показываются категории (Новости, Форум, Трекер), теги и время.<br><b>ЛКМ по уведомлению:</b> Переход по ссылке.<br><b>Колесо по уведомлению:</b> Открыть в новой вкладке.<br><b>Цифра на кнопке:</b> Количество непрочитанных уведомлений.' },
            { title: '💾 Кнопка "Сохраненные"', content: '<b>ЛКМ:</b> Открывает модальное окно со списком сохранённых страниц. Для каждой страницы автоматически проверяется наличие новых комментариев. При обнаружении новых комментариев страница подсвечивается зелёным и показывает количество новых сообщений.<br><b>ПКМ (долгое нажатие):</b> Сохраняет текущую страницу. Запоминается URL, заголовок, количество комментариев и позиция скролла. При первом заходе на сохранённую страницу после перезагрузки автоматически восстанавливается позиция скролла. Позиция обновляется автоматически при скролле через 2 секунды после остановки.<br><b>ЛКМ по сохранённой странице:</b> Переход на страницу.<br><b>Колесо по сохранённой странице:</b> Открыть в новой вкладке.<br><b>ПКМ по сохранённой странице:</b> Удалить из списка.' },
            { title: '💬 Кнопка "Мои сообщения"', content: '<b>ЛКМ:</b> Прокручивает страницу к вашему последнему комментарию и подсвечивает его синей рамкой на 3 секунды.' },
            { title: '📢 Кнопка "Упоминания"', content: '<b>ЛКМ:</b> Прокручивает страницу к последнему упоминанию вашего ника и подсвечивает его оранжевой рамкой на 3 секунды.' },
            { title: '🚫 Кнопка "Чёрный список"', content: '<b>ЛКМ:</b> Открывает модальное окно управления чёрным списком авторов. Можно добавлять и удалять ники.<br><b>ПКМ (долгое нажатие) на странице новости:</b> Автоматически добавляет автора текущей новости в чёрный список.' },
            { title: '🕐 Кнопка "Посещения"', content: '<b>ЛКМ:</b> Открывает модальное окно со списком отслеживаемых пользователей и датами их последних посещений. Имена кликабельны — ведут в профиль.<br><b>ПКМ (долгое нажатие):</b> Добавляет автора текущей новости/темы в список отслеживаемых. В модальном окне можно вручную добавить/удалить пользователей и обновить данные.<br><b>Наведение на ник в "Ответ на":</b> Показывает всплывающую подсказку с датой последнего посещения пользователя (загружается с его профиля).' },
            { title: '❓ Кнопка "Справка"', content: 'Открывает окно справки по всем функциям. По умолчанию находится только на левой панели.' },
            { title: '➕ Пользовательские кнопки', content: 'Вы можете добавить свои кнопки с произвольными ссылками. Нажмите ПКМ на кнопку профиля, затем на "+" и введите URL, название и выберите иконку. Кнопка появится на панели. В настройках можно изменить порядок кнопок или удалить пользовательские.' },
            { title: '👤 Кнопка "Профиль"', content: '<b>ЛКМ:</b> Переход в ваш профиль.<br><b>ПКМ:</b> Показывает кнопку настроек (⚙) и кнопку добавления (+).' },
            { title: '⚙ Настройки', content: 'Кнопка настроек появляется при ПКМ на кнопку профиля. В настройках можно:<br>• Включить мобильный вид со свайп-панелью<br>• Выбрать ориентацию панели (вертикально/горизонтально)<br>• Включить/отключить отображение рамки панели<br>• Настроить масштаб панели (30-200%)<br>• Настроить масштаб мобильной панели (30-300%)<br>• Настроить масштаб модальных окон (30-200%)<br>• Выбрать, на каких панелях (справа/слева/сверху/снизу) отображать каждую кнопку<br>• Изменить порядок кнопок (кнопка ^)<br>• Удалить пользовательские кнопки (кнопка -)<br>• Настроить режим фильтрации новостей (вырезать/блюрить)' },
            { title: '📊 Новые комментарии в трекере', content: 'На странице трекера добавляется колонка "Новых", которая показывает количество новых комментариев в темах с момента последнего посещения. Данные сохраняются в localStorage и обновляются при каждом заходе на страницу. Темы с новыми комментариями подсвечиваются зелёным фоном.' },
            { title: '🎨 Темы оформления', content: 'Панель и все модальные окна автоматически подстраиваются под текущую тему сайта (black, tango, tango-light, white2, waltz, zomg_ponies). Цвета фона, текста и границ соответствуют выбранной теме.' },
            { title: '🖱 Долгое нажатие мыши', content: 'На десктопе: удержание левой кнопки мыши на любой иконке панели в течение 500 мс эмулирует нажатие правой кнопки мыши (контекстное меню / альтернативное действие). Если начать движение мыши во время удержания (более 5px), долгое нажатие отменяется.' }
        ];
        helpSections.forEach(function(section) {
            var sectionDiv = document.createElement('div');
            sectionDiv.style.cssText = 'margin-bottom:' + Math.round(20 * modalScale) + 'px;';
            var sectionTitle = document.createElement('div');
            sectionTitle.textContent = section.title;
            sectionTitle.style.cssText = 'font-size:' + Math.round(16 * modalScale) + 'px;font-weight:bold;margin-bottom:' + Math.round(8 * modalScale) + 'px;color:#4a90d9;';
            sectionDiv.appendChild(sectionTitle);
            var sectionContent = document.createElement('div');
            sectionContent.innerHTML = section.content;
            sectionContent.style.cssText = 'font-size:' + Math.round(13 * modalScale) + 'px;line-height:1.6;color:' + (isDark ? '#bbb' : '#444') + ';padding-left:' + Math.round(8 * modalScale) + 'px;border-left:2px solid ' + (isDark ? '#2a2a3a' : '#e0e0e0') + ';';
            sectionDiv.appendChild(sectionContent);
            content.appendChild(sectionDiv);
        });
        var footerHelp = document.createElement('div');
        footerHelp.style.cssText = 'margin-top:' + Math.round(20 * modalScale) + 'px;padding-top:' + Math.round(12 * modalScale) + 'px;border-top:1px solid ' + (isDark ? '#333' : '#ccc') + ';font-size:' + Math.round(12 * modalScale) + 'px;color:' + (isDark ? '#666' : '#999') + ';text-align:center;';
        footerHelp.textContent = 'NSLorPanel v5.0 • Все данные хранятся в localStorage вашего браузера';
        content.appendChild(footerHelp);
    }

    renderGeneralTab();

    tabGeneral.onclick = function() {
        currentTab = 'general';
        tabGeneral.style.borderBottomColor = '#4a90d9'; tabGeneral.style.color = '#4a90d9'; tabGeneral.style.fontWeight = 'bold';
        tabButtons.style.borderBottomColor = 'transparent'; tabButtons.style.color = isDark ? '#888' : '#666'; tabButtons.style.fontWeight = 'normal';
        tabFilter.style.borderBottomColor = 'transparent'; tabFilter.style.color = isDark ? '#888' : '#666'; tabFilter.style.fontWeight = 'normal';
        tabHelp.style.borderBottomColor = 'transparent'; tabHelp.style.color = isDark ? '#888' : '#666'; tabHelp.style.fontWeight = 'normal';
        renderGeneralTab();
    };
    tabButtons.onclick = function() {
        currentTab = 'buttons';
        tabButtons.style.borderBottomColor = '#4a90d9'; tabButtons.style.color = '#4a90d9'; tabButtons.style.fontWeight = 'bold';
        tabGeneral.style.borderBottomColor = 'transparent'; tabGeneral.style.color = isDark ? '#888' : '#666'; tabGeneral.style.fontWeight = 'normal';
        tabFilter.style.borderBottomColor = 'transparent'; tabFilter.style.color = isDark ? '#888' : '#666'; tabFilter.style.fontWeight = 'normal';
        tabHelp.style.borderBottomColor = 'transparent'; tabHelp.style.color = isDark ? '#888' : '#666'; tabHelp.style.fontWeight = 'normal';
        renderButtonsTab();
    };
    tabFilter.onclick = function() {
        currentTab = 'filter';
        tabFilter.style.borderBottomColor = '#4a90d9'; tabFilter.style.color = '#4a90d9'; tabFilter.style.fontWeight = 'bold';
        tabGeneral.style.borderBottomColor = 'transparent'; tabGeneral.style.color = isDark ? '#888' : '#666'; tabGeneral.style.fontWeight = 'normal';
        tabButtons.style.borderBottomColor = 'transparent'; tabButtons.style.color = isDark ? '#888' : '#666'; tabButtons.style.fontWeight = 'normal';
        tabHelp.style.borderBottomColor = 'transparent'; tabHelp.style.color = isDark ? '#888' : '#666'; tabHelp.style.fontWeight = 'normal';
        renderFilterTab();
    };
    tabHelp.onclick = function() {
        currentTab = 'help';
        tabHelp.style.borderBottomColor = '#4a90d9'; tabHelp.style.color = '#4a90d9'; tabHelp.style.fontWeight = 'bold';
        tabGeneral.style.borderBottomColor = 'transparent'; tabGeneral.style.color = isDark ? '#888' : '#666'; tabGeneral.style.fontWeight = 'normal';
        tabButtons.style.borderBottomColor = 'transparent'; tabButtons.style.color = isDark ? '#888' : '#666'; tabButtons.style.fontWeight = 'normal';
        tabFilter.style.borderBottomColor = 'transparent'; tabFilter.style.color = isDark ? '#888' : '#666'; tabFilter.style.fontWeight = 'normal';
        renderHelpTab();
    };

    saveBtn.onclick = function() {
        var mobileViewCheck = document.getElementById('lor-setting-mobile-view');
        var borderCheck = document.getElementById('lor-setting-border');
        var scaleSelect = document.getElementById('lor-setting-scale');
        var mobileScaleSelect = document.getElementById('lor-setting-mobile-scale');
        var modalScaleSelect = document.getElementById('lor-setting-modal-scale');
        if (mobileViewCheck) settings.general.mobileView = mobileViewCheck.checked;
        if (borderCheck) settings.general.showBorder = borderCheck.checked;
        if (scaleSelect) { var val = parseInt(scaleSelect.value); if (val >= 30 && val <= 200) settings.general.scale = val; }
        if (mobileScaleSelect) { var mval = parseInt(mobileScaleSelect.value); if (mval >= 30 && mval <= 300) settings.general.mobileScale = mval; }
        if (modalScaleSelect) { var mmval = parseInt(modalScaleSelect.value); if (mmval >= 30 && mmval <= 200) settings.general.modalScale = mmval; }
        var btnChecks = document.querySelectorAll('.lor-setting-btn');
        btnChecks.forEach(function(cb) {
            var key = cb.getAttribute('data-key'); var pos = cb.getAttribute('data-pos');
            if (!settings.buttons[key] || typeof settings.buttons[key] !== 'object') settings.buttons[key] = { right: false, left: false, top: false, bottom: false };
            settings.buttons[key][pos] = cb.checked;
        });
        var filterEnabled = document.getElementById('lor-filter-enabled');
        var filterMode = document.querySelector('input[name="lor-filter-mode"]:checked');
        var filterMini = document.getElementById('lor-filter-mini');
        var filterAnimate = document.getElementById('lor-filter-animate');
        if (filterEnabled) settings.filter.enabled = filterEnabled.checked;
        if (filterMode) settings.filter.mode = filterMode.value;
        if (filterMini) settings.filter.applyToMini = filterMini.checked;
        if (filterAnimate) settings.filter.animateBlur = filterAnimate.checked;
        saveSettings(settings);
        window.dispatchEvent(new CustomEvent('lor-filter-settings-changed', { detail: { settings: settings.filter } }));
        overlay.remove();
        rebuildPanel();
    };
    cancelBtn.onclick = function() { overlay.remove(); };
    overlay.onclick = function(e) { if (e.target === overlay) overlay.remove(); };
}

function showAddCustomModal() {
    if (document.getElementById('lor-add-custom-overlay')) return;
    const settings = getSettings(), modalScale = settings.general.modalScale / 100, isDark = isDarkTheme();
    const content = document.createElement('div');
    const urlInp = createInput('https://example.com', modalScale, isDark); urlInp.id = 'lor-custom-url';
    const titleInp = createInput('Моя кнопка', modalScale, isDark); titleInp.id = 'lor-custom-title';
    const iconSel = document.createElement('select'); iconSel.id = 'lor-custom-icon'; iconSel.style.cssText = `width:100%;padding:8px 10px;background:${isDark ? '#111' : '#f5f5f5'};color:${isDark ? '#ccc' : '#333'};border:1px solid ${isDark ? '#444' : '#ccc'};border-radius:4px;font-size:${Math.round(18 * modalScale)}px;box-sizing:border-box;`;
    ICONS.forEach(ic => { const o = document.createElement('option'); o.value = ic; o.textContent = ic; iconSel.appendChild(o); });
    const addBtn = createActionBtn('Добавить', 'primary', modalScale, isDark); addBtn.id = 'lor-custom-add';
    const cancelBtn = createActionBtn('Отмена', 'cancel', modalScale, isDark); cancelBtn.id = 'lor-custom-cancel';
    content.innerHTML = `<div style="font-size:${Math.round(16 * modalScale)}px;font-weight:bold;margin-bottom:16px;padding-bottom:8px;border-bottom:1px solid ${isDark ? '#333' : '#ccc'};">Добавить кнопку</div>`;
    const ud = document.createElement('div'); ud.style.cssText = 'margin-bottom:12px;'; const ul = document.createElement('label'); ul.style.cssText = `display:block;margin-bottom:4px;font-size:${Math.round(13 * modalScale)}px;`; ul.textContent = 'Ссылка (URL):'; ud.appendChild(ul); ud.appendChild(urlInp); content.appendChild(ud);
    const td = document.createElement('div'); td.style.cssText = 'margin-bottom:12px;'; const tl = document.createElement('label'); tl.style.cssText = `display:block;margin-bottom:4px;font-size:${Math.round(13 * modalScale)}px;`; tl.textContent = 'Название:'; td.appendChild(tl); td.appendChild(titleInp); content.appendChild(td);
    const id = document.createElement('div'); id.style.cssText = 'margin-bottom:16px;'; const il = document.createElement('label'); il.style.cssText = `display:block;margin-bottom:4px;font-size:${Math.round(13 * modalScale)}px;`; il.textContent = 'Иконка:'; id.appendChild(il); id.appendChild(iconSel); content.appendChild(id);
    const bd = document.createElement('div'); bd.style.cssText = 'text-align:right;'; bd.appendChild(addBtn); bd.appendChild(cancelBtn); content.appendChild(bd);
    const modal = createModal('Добавить кнопку', 450, content, 100001, 'lor-add-custom-overlay');
    function addCustom() { const url = document.getElementById('lor-custom-url').value.trim(), title = document.getElementById('lor-custom-title').value.trim(), icon = document.getElementById('lor-custom-icon').value; if (!url) { alert('Введите URL'); return; } if (!title) title = url; const settings = getSettings(), cid = 'custom_' + Date.now(); settings.customButtons.push({ id: cid, url: url, title: title, icon: icon }); settings.buttons[cid] = { right: true, left: false, top: false, bottom: false }; if (settings.buttonOrder.indexOf(cid) === -1) settings.buttonOrder.push(cid); saveSettings(settings); modal.close(); rebuildPanel(); }
    addBtn.onclick = addCustom; cancelBtn.onclick = modal.close;
    urlInp.addEventListener('keydown', e => { if (e.key === 'Enter') addCustom(); });
    titleInp.addEventListener('keydown', e => { if (e.key === 'Enter') addCustom(); });
}

function showSavedPagesModal() {
    if (currentModal) { currentModal.remove(); currentModal = null; }
    const settings = getSettings(), modalScale = settings.general.modalScale / 100, isDark = isDarkTheme(), sp = getSavedPages();
    const content = document.createElement('div'); content.style.cssText = 'overflow-y:auto;flex:1;min-height:200px;';
    if (sp.length === 0) { content.innerHTML = `<div style="text-align:center;padding:20px;color:${isDark ? '#666' : '#999'};">Нет сохраненных страниц</div>`; }
    else {
        const list = document.createElement('div'); list.style.cssText = `display:flex;flex-direction:column;gap:${Math.round(8 * modalScale)}px;`;
        sp.forEach((page, idx) => {
            const row = createListRow(modalScale, isDark);
            const info = document.createElement('div'); info.style.cssText = 'flex:1;';
            const td = document.createElement('div'); td.textContent = page.title; td.style.cssText = `font-weight:bold;margin-bottom:${Math.round(4 * modalScale)}px;`; info.appendChild(td);
            const ud = document.createElement('div'); ud.textContent = page.url; ud.style.cssText = `font-size:${Math.round(11 * modalScale)}px;color:${isDark ? '#666' : '#999'};word-break:break-all;`; info.appendChild(ud);
            row.appendChild(info);
            const cd = document.createElement('div'); cd.style.cssText = `text-align:right;margin-left:${Math.round(12 * modalScale)}px;min-width:${Math.round(80 * modalScale)}px;`;
            const sc = document.createElement('div'); sc.textContent = page.commentCount + ' сообщ.'; sc.style.cssText = `font-size:${Math.round(13 * modalScale)}px;`; cd.appendChild(sc);
            const nc = document.createElement('div'); nc.style.cssText = `font-size:${Math.round(11 * modalScale)}px;color:#888;`; nc.textContent = 'Проверка...'; cd.appendChild(nc);
            row.appendChild(cd);
            fetch(page.url).then(r => r.text()).then(html => { const doc = new DOMParser().parseFromString(html, 'text/html'), cc = doc.querySelectorAll('article.msg'), diff = cc.length - page.commentCount; if (diff > 0) { row.style.background = isDark ? '#1a3a1a' : '#e8f5e8'; row.style.borderColor = '#4CAF50'; nc.textContent = '+' + diff + ' новых'; nc.style.color = '#4CAF50'; nc.style.fontWeight = 'bold'; sc.textContent = cc.length + ' сообщ.'; } else { nc.textContent = 'без изменений'; } }).catch(() => { nc.textContent = 'ошибка'; });
            row.onclick = e => { if (e.button === 0) { location.href = page.url; if (currentModal) currentModal.close(); } };
            row.onmousedown = e => { if (e.button === 1) { e.preventDefault(); window.open(page.url, '_blank'); } };
            row.onauxclick = e => { if (e.button === 1) { e.preventDefault(); } };
            row.oncontextmenu = e => { e.preventDefault(); e.stopPropagation(); if (confirm('Удалить страницу "' + page.title + '" из сохраненных?')) { sp.splice(idx, 1); saveSavedPages(sp); if (currentModal) currentModal.close(); showSavedPagesModal(); } };
            list.appendChild(row);
        });
        content.appendChild(list);
    }
    createModal('Сохраненные страницы', 700, content, 100003);
}

function showForumModal() {
    if (currentModal) { currentModal.remove(); currentModal = null; }
    const settings = getSettings(), modalScale = settings.general.modalScale / 100, isDark = isDarkTheme();
    const content = document.createElement('div'); content.style.cssText = 'overflow-y:auto;flex:1;min-height:200px;text-align:center;'; content.textContent = 'Загрузка...';
    const modal = createModal('Разделы форума', 600, content, 100002);
    fetch('https://www.linux.org.ru/forum/').then(r => r.text()).then(html => {
        const doc = new DOMParser().parseFromString(html, 'text/html'), sections = [], links = doc.querySelectorAll('a[href*="/forum/"]');
        links.forEach(lnk => { const href = lnk.href; if (href.match(/\/forum\/[^/]+\/$/) && !sections.find(s => s.url === href)) { const par = lnk.closest('li'), txt = par ? par.textContent : lnk.textContent, cm = txt.match(/((\d+)\s+за\s+сутки)/), cnt = cm ? parseInt(cm[1]) : 0; sections.push({ url: href, title: lnk.textContent.trim(), description: par ? (par.querySelector('em') ? par.querySelector('em').textContent : '') : '', dailyCount: cnt }); } });
        const cache = getForumCache(); let hasCh = false; content.innerHTML = ''; content.style.textAlign = 'left';
        if (sections.length === 0) { content.textContent = 'Не удалось загрузить разделы'; content.style.textAlign = 'center'; return; }
        const list = document.createElement('div'); list.style.cssText = `display:flex;flex-direction:column;gap:${Math.round(8 * modalScale)}px;`;
        sections.forEach(sec => {
            const row = createListRow(modalScale, isDark), old = cache[sec.url] || 0, nw = sec.dailyCount, diff = nw - old;
            if (diff > 0) { hasCh = true; row.style.background = isDark ? '#1a3a1a' : '#e8f5e8'; row.style.borderColor = '#4CAF50'; }
            const info = document.createElement('div'); info.style.cssText = 'flex:1;';
            const td = document.createElement('div'); td.textContent = sec.title; td.style.cssText = `font-weight:bold;margin-bottom:${Math.round(4 * modalScale)}px;`; info.appendChild(td);
            if (sec.description) { const dd = document.createElement('div'); dd.textContent = sec.description; dd.style.cssText = `font-size:${Math.round(12 * modalScale)}px;color:${isDark ? '#888' : '#666'};`; info.appendChild(dd); }
            row.appendChild(info);
            const cd = document.createElement('div'); cd.style.cssText = `text-align:right;margin-left:${Math.round(12 * modalScale)}px;`;
            const ct = document.createElement('div'); ct.textContent = nw + ' за сутки'; ct.style.cssText = `font-size:${Math.round(14 * modalScale)}px;font-weight:bold;`; cd.appendChild(ct);
            if (diff > 0) { const nt = document.createElement('div'); nt.textContent = '+' + diff + ' новых'; nt.style.cssText = `font-size:${Math.round(11 * modalScale)}px;color:#4CAF50;font-weight:bold;`; cd.appendChild(nt); }
            row.appendChild(cd);
            row.onclick = e => { if (e.button === 0) { location.href = sec.url; if (currentModal) currentModal.close(); } };
            row.onmousedown = e => { if (e.button === 1) { e.preventDefault(); window.open(sec.url, '_blank'); } };
            row.onauxclick = e => { if (e.button === 1) { e.preventDefault(); } };
            cache[sec.url] = nw; list.appendChild(row);
        });
        content.appendChild(list); saveForumCache(cache); if (hasCh) highlightButton('forum');
    });
}

function showTrackerModal() {
    if (currentModal) { currentModal.remove(); currentModal = null; }
    const settings = getSettings(), modalScale = settings.general.modalScale / 100, isDark = isDarkTheme();
    const content = document.createElement('div'); content.style.cssText = 'overflow-y:auto;flex:1;min-height:200px;text-align:center;'; content.textContent = 'Загрузка...';
    const modal = createModal('Трекер', 700, content, 100002);
    fetch('https://www.linux.org.ru/tracker/').then(r => r.text()).then(html => {
        const doc = new DOMParser().parseFromString(html, 'text/html'), topics = [], rows = doc.querySelectorAll('table.message-table tbody tr');
        rows.forEach(row => { if (row.querySelector('th')) return; const cells = row.querySelectorAll('td'); if (cells.length >= 4) { const gl = cells[0].querySelector('a'), tl = cells[1].querySelector('a'), ct = cells[3].textContent.trim(), cnt = parseInt(ct) || 0; if (tl) { const tags = []; cells[1].querySelectorAll('.tag').forEach(t => { tags.push(t.textContent.trim()); }); const ft = tl.textContent.trim(), parts = ft.split('\n').map(p => p.trim()).filter(p => p), mt = parts[parts.length - 1] || ft; topics.push({ url: tl.href, title: mt, tags: tags, group: gl ? gl.textContent.trim() : cells[0].textContent.trim(), messageCount: cnt }); } } });
        const cache = getTrackerCache(); let hasCh = false, ncache = {}; content.innerHTML = ''; content.style.textAlign = 'left';
        if (topics.length === 0) { content.textContent = 'Не удалось загрузить темы'; content.style.textAlign = 'center'; return; }
        const list = document.createElement('div'); list.style.cssText = `display:flex;flex-direction:column;gap:${Math.round(8 * modalScale)}px;`;
        topics.forEach(tp => {
            const row = createListRow(modalScale, isDark), curl = tp.url.replace(/[?&]lastmod=\d+/g, ''), cdata = cache[curl], old = (cdata && typeof cdata === 'object') ? cdata.count : (cdata || 0), nw = tp.messageCount, diff = nw - old;
            ncache[curl] = { count: nw, date: Date.now() };
            if (diff > 0 && old > 0) { hasCh = true; row.style.background = isDark ? '#1a3a1a' : '#e8f5e8'; row.style.borderColor = '#4CAF50'; }
            const info = document.createElement('div'); info.style.cssText = 'flex:1;';
            if (tp.group) { const gd = document.createElement('div'); gd.textContent = tp.group; gd.style.cssText = `font-size:${Math.round(11 * modalScale)}px;color:#4a90d9;margin-bottom:${Math.round(4 * modalScale)}px;`; info.appendChild(gd); }
            const td = document.createElement('div'); td.textContent = tp.title; td.style.cssText = `font-weight:bold;margin-bottom:${Math.round(4 * modalScale)}px;`; info.appendChild(td);
            if (tp.tags.length > 0) { const tg = document.createElement('div'); tg.style.cssText = 'display:flex;gap:4px;flex-wrap:wrap;'; tp.tags.forEach(t => { const ts = document.createElement('span'); ts.textContent = t; ts.style.cssText = `font-size:${Math.round(10 * modalScale)}px;padding:2px 6px;background:${isDark ? '#1a1a2e' : '#f0f0f0'};border-radius:3px;`; tg.appendChild(ts); }); info.appendChild(tg); }
            row.appendChild(info);
            const sd = document.createElement('div'); sd.style.cssText = `text-align:right;margin-left:${Math.round(12 * modalScale)}px;min-width:${Math.round(80 * modalScale)}px;`;
            const ct = document.createElement('div'); ct.textContent = nw + ' сообщ.'; ct.style.cssText = `font-size:${Math.round(14 * modalScale)}px;font-weight:bold;`; sd.appendChild(ct);
            if (diff > 0 && old > 0) { const nt = document.createElement('div'); nt.textContent = '+' + diff + ' новых'; nt.style.cssText = `font-size:${Math.round(11 * modalScale)}px;color:#4CAF50;font-weight:bold;`; sd.appendChild(nt); } else if (old > 0) { const zt = document.createElement('div'); zt.textContent = '0 новых'; zt.style.cssText = `font-size:${Math.round(11 * modalScale)}px;color:${isDark ? '#666' : '#999'};`; sd.appendChild(zt); } else { const nd = document.createElement('div'); nd.textContent = '—'; nd.style.cssText = `font-size:${Math.round(11 * modalScale)}px;color:${isDark ? '#666' : '#999'};`; sd.appendChild(nd); }
            row.appendChild(sd);
            row.onclick = e => { if (e.button === 0) { location.href = tp.url; if (currentModal) currentModal.close(); } };
            row.onmousedown = e => { if (e.button === 1) { e.preventDefault(); window.open(tp.url, '_blank'); } };
            row.onauxclick = e => { if (e.button === 1) { e.preventDefault(); } };
            list.appendChild(row);
        });
        content.appendChild(list); saveTrackerCache(ncache); if (hasCh) highlightButton('tracker');
    });
}

function showNotificationsModal() {
    if (currentModal) { currentModal.remove(); currentModal = null; }
    const settings = getSettings(), modalScale = settings.general.modalScale / 100, isDark = isDarkTheme();
    const content = document.createElement('div'); content.style.cssText = 'overflow-y:auto;flex:1;min-height:200px;text-align:center;'; content.textContent = 'Загрузка...';
    const modal = createModal('Уведомления', 700, content, 100002);
    fetch('https://www.linux.org.ru/notifications').then(r => r.text()).then(html => {
        const doc = new DOMParser().parseFromString(html, 'text/html'), notifs = [], rows = doc.querySelectorAll('table.message-table tbody tr');
        rows.forEach(row => { const lnk = row.querySelector('td:nth-child(2) a'), tm = row.querySelector('time'); if (lnk) { const tags = []; lnk.querySelectorAll('.tag').forEach(t => { tags.push(t.textContent.trim()); }); const ft = row.textContent.trim(), cm = ft.match(/((Новости|Форум|Трекер|Галерея|Статьи))/), cat = cm ? cm[1] : ''; notifs.push({ url: lnk.href, title: lnk.textContent.trim(), tags: tags, category: cat, time: tm ? tm.textContent.trim() : '' }); } });
        content.innerHTML = ''; content.style.textAlign = 'left';
        if (notifs.length === 0) { content.textContent = 'Нет уведомлений'; content.style.textAlign = 'center'; return; }
        const list = document.createElement('div'); list.style.cssText = `display:flex;flex-direction:column;gap:${Math.round(8 * modalScale)}px;`;
        notifs.forEach(nf => {
            const row = createListRow(modalScale, isDark), info = document.createElement('div'); info.style.cssText = 'flex:1;';
            if (nf.category) { const cd = document.createElement('div'); cd.textContent = nf.category; cd.style.cssText = `font-size:${Math.round(11 * modalScale)}px;color:#4a90d9;margin-bottom:${Math.round(4 * modalScale)}px;`; info.appendChild(cd); }
            const td = document.createElement('div'); td.textContent = nf.title; td.style.cssText = 'font-weight:bold;'; info.appendChild(td);
            if (nf.tags.length > 0) { const tg = document.createElement('div'); tg.style.cssText = 'display:flex;gap:4px;flex-wrap:wrap;margin-top:' + Math.round(4 * modalScale) + 'px;'; nf.tags.forEach(t => { const ts = document.createElement('span'); ts.textContent = t; ts.style.cssText = `font-size:${Math.round(10 * modalScale)}px;padding:2px 6px;background:${isDark ? '#1a1a2e' : '#f0f0f0'};border-radius:3px;`; tg.appendChild(ts); }); info.appendChild(tg); }
            row.appendChild(info);
            if (nf.time) { const td = document.createElement('div'); td.textContent = nf.time; td.style.cssText = `font-size:${Math.round(12 * modalScale)}px;color:${isDark ? '#888' : '#666'};margin-left:${Math.round(12 * modalScale)}px;white-space:nowrap;`; row.appendChild(td); }
            row.onclick = e => { if (e.button === 0) { location.href = nf.url; if (currentModal) currentModal.close(); } };
            row.onmousedown = e => { if (e.button === 1) { e.preventDefault(); window.open(nf.url, '_blank'); } };
            row.onauxclick = e => { if (e.button === 1) { e.preventDefault(); } };
            list.appendChild(row);
        });
        content.appendChild(list);
    });
}

// ============================================================================
// 9. ПАРСЕРЫ И ТРЕКЕР
// ============================================================================

function parseForumSections(html) {
    const doc = new DOMParser().parseFromString(html, 'text/html'), sections = [], links = doc.querySelectorAll('a[href*="/forum/"]');
    links.forEach(lnk => { const href = lnk.href; if (href.match(/\/forum\/[^/]+\/$/) && !sections.find(s => s.url === href)) { const par = lnk.closest('li'), txt = par ? par.textContent : lnk.textContent, cm = txt.match(/((\d+)\s+за\s+сутки)/), cnt = cm ? parseInt(cm[1]) : 0; sections.push({ url: href, title: lnk.textContent.trim(), description: par ? (par.querySelector('em') ? par.querySelector('em').textContent : '') : '', dailyCount: cnt }); } });
    return sections;
}

function parseTrackerTopics(html) {
    const doc = new DOMParser().parseFromString(html, 'text/html'), topics = [], rows = doc.querySelectorAll('table.message-table tbody tr');
    rows.forEach(row => { if (row.querySelector('th')) return; const cells = row.querySelectorAll('td'); if (cells.length >= 4) { const gl = cells[0].querySelector('a'), tl = cells[1].querySelector('a'), ct = cells[3].textContent.trim(), cnt = parseInt(ct) || 0; if (tl) { const tags = []; cells[1].querySelectorAll('.tag').forEach(t => { tags.push(t.textContent.trim()); }); const ft = tl.textContent.trim(), parts = ft.split('\n').map(p => p.trim()).filter(p => p), mt = parts[parts.length - 1] || ft; topics.push({ url: tl.href, title: mt, tags: tags, group: gl ? gl.textContent.trim() : cells[0].textContent.trim(), messageCount: cnt }); } } });
    return topics;
}

function parseNotifications(html) {
    const doc = new DOMParser().parseFromString(html, 'text/html'), notifs = [], rows = doc.querySelectorAll('table.message-table tbody tr');
    rows.forEach(row => { const lnk = row.querySelector('td:nth-child(2) a'), tm = row.querySelector('time'); if (lnk) { const tags = []; lnk.querySelectorAll('.tag').forEach(t => { tags.push(t.textContent.trim()); }); const ft = row.textContent.trim(), cm = ft.match(/((Новости|Форум|Трекер|Галерея|Статьи))/), cat = cm ? cm[1] : ''; notifs.push({ url: lnk.href, title: lnk.textContent.trim(), tags: tags, category: cat, time: tm ? tm.textContent.trim() : '' }); } });
    return notifs;
}

function updateTrackerTable() {
    if (trackerTableUpdated) return;
    const table = document.querySelector('table.message-table'); if (!table) return; if (!isTrackerPage()) return;
    const oldCache = getTrackerCache(); let hasCh = false; const now = Date.now(), oneDay = 24 * 60 * 60 * 1000, clean = {};
    for (const url in oldCache) { const cd = oldCache[url]; if (cd && typeof cd === 'object') { const age = now - cd.date; if (age <= oneDay) clean[url] = cd; } }
    const hr = table.querySelector('thead tr'); if (hr && !hr.querySelector('.lor-new-comments-col')) { const th = document.createElement('th'); th.className = 'lor-new-comments-col'; th.textContent = 'Новых'; th.style.cssText = 'text-align:center;color:#4CAF50;'; hr.appendChild(th); }
    const rows = table.querySelectorAll('tbody tr');
    rows.forEach(row => { if (row.querySelector('th')) return; const cells = row.querySelectorAll('td'); if (cells.length < 4) return; const tl = cells[1].querySelector('a'); if (!tl) return; const curl = tl.href.replace(/[?&]lastmod=\d+/g, ''), cc = parseInt(cells[3].textContent.trim()) || 0, cdata = clean[curl], was = cdata && typeof cdata === 'object', old = was ? cdata.count : 0, diff = cc - old, ec = row.querySelector('.lor-new-comments-col'); if (ec) ec.remove(); const td = document.createElement('td'); td.className = 'lor-new-comments-col'; td.style.cssText = 'text-align:center;font-weight:bold;'; if (!was) { td.textContent = cc; td.style.color = '#4a90d9'; td.title = 'Новая тема (всего: ' + cc + ')'; } else if (diff > 0) { td.textContent = '+' + diff; td.style.color = '#4CAF50'; td.style.background = 'rgba(76,175,80,0.15)'; td.style.borderRadius = '3px'; td.title = 'Было: ' + old + ', стало: ' + cc; hasCh = true; } else if (diff === 0) { td.textContent = '0'; td.style.color = '#888'; td.title = 'Было: ' + old + ', стало: ' + cc + ' (без изменений)'; } else { td.textContent = diff; td.style.color = '#ff6666'; td.title = 'Было: ' + old + ', стало: ' + cc; } row.appendChild(td); });
    rows.forEach(row => { if (row.querySelector('th')) return; const cells = row.querySelectorAll('td'); if (cells.length < 4) return; const tl = cells[1].querySelector('a'); if (!tl) return; const curl = tl.href.replace(/[?&]lastmod=\d+/g, ''), cc = parseInt(cells[3].textContent.trim()) || 0; clean[curl] = { count: cc, date: now }; });
    saveTrackerCache(clean); trackerTableUpdated = true; if (hasCh) highlightButton('tracker');
}

function initTrackerPage() { if (isTrackerPage() && !trackerTableUpdated) { setTimeout(() => { if (document.querySelector('table.message-table tbody tr')) updateTrackerTable(); }, 100); } }

// ============================================================================
// 10. ФУНКЦИИ ДЕЙСТВИЙ
// ============================================================================

function fetchLastVisit(nick, cb) {
    fetch(new URL('/people/' + nick + '/profile', window.location.origin).href).then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.text(); }).then(html => { const idx = html.indexOf('Последнее посещение'); if (idx === -1) { if (cb) cb('неизвестно'); return; } const snip = html.substring(idx, idx + 200); const tm = snip.match(/<time[^>]*>([^<]+)<\/time>/); if (tm) { if (cb) cb(tm[1].trim()); return; } const m = html.match(/<b>Последнее посещение:<\/b>\s*<time[^>]*>([^<]+)<\/time>/); if (cb) cb(m ? m[1].trim() : 'неизвестно'); }).catch(err => { console.log('NSLorPanel: ошибка ' + nick + ' - ' + err.message); if (cb) cb('ошибка'); });
}

function goToMyLastComment() {
    const nick = getMyNick(); if (!nick) { alert('Не удалось определить ник.'); return; }
    let last = null; document.querySelectorAll('article.msg').forEach(c => { const a = c.querySelector('a[href*="/people/"]'); if (a && a.textContent.trim() === nick) last = c; });
    if (last) { last.scrollIntoView({ behavior: 'smooth', block: 'start' }); last.style.outline = '3px solid #4a90d9'; setTimeout(() => { last.style.outline = ''; }, 3000); }
    else { alert('Ваших комментариев на этой странице нет.'); }
}

function goToLastMention() {
    const nick = getMyNick(); if (!nick) { alert('Не удалось определить ник.'); return; }
    let last = null; document.querySelectorAll('article.msg').forEach(c => { const a = c.querySelector('a[href*="/people/"]'); const author = a ? a.textContent.trim() : ''; if (author !== nick && c.textContent.includes(nick)) last = c; });
    if (last) { last.scrollIntoView({ behavior: 'smooth', block: 'start' }); last.style.outline = '3px solid #ff6600'; setTimeout(() => { last.style.outline = ''; }, 3000); }
    else { alert('Упоминаний вас на этой странице нет.'); }
}

function scrollToLastMod() {
    const lm = new URL(location.href).searchParams.get('lastmod'); if (!lm) return;
    const el = document.getElementById('comment-' + lm); if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'start' }); el.style.outline = '3px solid #4a90d9'; setTimeout(() => { el.style.outline = ''; }, 3000); }
}

function updateNotificationBadge(btn) {
    const ce = document.getElementById('main_events_count'), raw = ce ? ce.textContent : '(0)', count = parseInt(raw.replace(/[^0-9]/g, '')) || 0;
    btn.textContent = count > 0 ? count : '🔔';
    const settings = getSettings(), scale = getScale(settings), fs = Math.round(24 * scale);
    btn.style.fontSize = count > 0 ? Math.round(28 * scale) + 'px' : fs + 'px'; btn.style.fontWeight = 'bold';
}

function highlightButton(id) {
    POSITIONS.forEach(pos => { const k = id + '_' + pos; if (allButtons[k]) { allButtons[k].style.background = '#4CAF50'; setTimeout(() => { if (allButtons[k]) allButtons[k].style.background = getColor('btnBg'); }, 3000); } });
}

function flashSavedBtn(text, color) {
    POSITIONS.forEach(pos => { const k = 'saved_' + pos; if (allButtons[k]) { const b = allButtons[k], ot = b.textContent; b.textContent = text; b.style.color = color; setTimeout(() => { b.textContent = ot; b.style.color = ''; }, 1500); } });
}

function saveScrollPosition() {
    if (Date.now() - pageLoadTime < 2000) return;
    const pid = getPageIdentifier(), sp = getSavedPages(), found = sp.find(p => p.url === pid);
    if (found) { found.scrollPosition = window.pageYOffset || document.documentElement.scrollTop; found.lastChecked = new Date().toISOString(); saveSavedPages(sp); }
}

function updateSavedData() {
    const pid = getPageIdentifier(), sp = getSavedPages(), idx = sp.findIndex(p => p.url === pid);
    if (idx !== -1) {
        currentPageSaved = true; const spPos = sp[idx].scrollPosition;
        if (!sessionStorage.getItem('scroll_restored_' + pid) && spPos > 0) { setTimeout(() => { window.scrollTo({ top: spPos, behavior: 'smooth' }); sessionStorage.setItem('scroll_restored_' + pid, 'true'); const cc = getCommentCount(), cs = window.pageYOffset || document.documentElement.scrollTop; sp[idx].commentCount = cc; sp[idx].scrollPosition = cs; sp[idx].lastChecked = new Date().toISOString(); saveSavedPages(sp); }, 1500); }
        else if (sessionStorage.getItem('scroll_restored_' + pid)) { const cc = getCommentCount(), cs = window.pageYOffset || document.documentElement.scrollTop; sp[idx].commentCount = cc; sp[idx].scrollPosition = cs; sp[idx].lastChecked = new Date().toISOString(); saveSavedPages(sp); }
    } else { currentPageSaved = false; }
}

function addCurrentPageToSaved() {
    const pid = getPageIdentifier(), sp = getSavedPages(), idx = sp.findIndex(p => p.url === pid), title = document.title.replace(' - Linux.org.ru', '').trim(), cc = getCommentCount(), cs = window.pageYOffset || document.documentElement.scrollTop;
    if (idx !== -1) { sp[idx].commentCount = cc; sp[idx].scrollPosition = cs; sp[idx].lastChecked = new Date().toISOString(); saveSavedPages(sp); currentPageSaved = true; flashSavedBtn('↻', '#4a90d9'); sessionStorage.removeItem('scroll_restored_' + pid); }
    else { sp.push({ url: pid, title: title, commentCount: cc, scrollPosition: cs, lastChecked: new Date().toISOString() }); saveSavedPages(sp); currentPageSaved = true; flashSavedBtn('✓', '#4CAF50'); }
}

function confirmAndAddToBlacklist() {
    const author = getCurrentNewsAuthor(); if (!author) { alert('Не удалось определить автора.'); return; }
    if (confirm('Добавить автора "' + author + '" в чёрный список?')) { const bl = getBlacklist(); if (bl.indexOf(author) === -1) { bl.push(author); saveBlacklistAndNotify(bl); alert('Автор "' + author + '" добавлен.'); } else { alert('Автор уже в списке.'); } }
}

function confirmAndAddToTracked() {
    const author = getCurrentNewsAuthor(); if (!author) { alert('Не удалось определить автора.'); return; }
    const tr = getTrackedUsers(); if (tr[author]) { alert('Пользователь "' + author + '" уже отслеживается.'); return; }
    if (confirm('Добавить пользователя "' + author + '" в список отслеживаемых?')) { tr[author] = { lastVisit: 'загрузка...', checked: 0 }; saveTrackedUsers(tr); alert('Пользователь "' + author + '" добавлен.'); }
}

function showExtraButtons(btn, pos) {
    const colors = getThemeColors(), settings = getSettings(), scale = settings.general.scale / 100, size = Math.round(44 * scale), fs = Math.round(22 * scale);
    if (settingsBtn) { settingsBtn.remove(); settingsBtn = null; } if (addCustomBtn) { addCustomBtn.remove(); addCustomBtn = null; }
    btn.style.position = 'relative';
    settingsBtn = document.createElement('div'); settingsBtn.textContent = '⚙'; settingsBtn.title = 'Настройки';
    settingsBtn.style.cssText = `position:absolute;width:${size}px;height:${size}px;background:${colors.btnBg};color:${colors.btnColor};border-radius:50%;display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:${fs}px;z-index:10001;`;
    addCustomBtn = document.createElement('div'); addCustomBtn.textContent = '+'; addCustomBtn.title = 'Добавить кнопку';
    addCustomBtn.style.cssText = `position:absolute;width:${size}px;height:${size}px;background:${colors.btnBg};color:${colors.btnColor};border-radius:50%;display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:${fs}px;z-index:10001;`;
    if (pos === 'left') { settingsBtn.style.right = -(size + 10) + 'px'; settingsBtn.style.top = '0px'; addCustomBtn.style.right = -(size + 10) + 'px'; addCustomBtn.style.top = (size + 10) + 'px'; }
    else if (pos === 'top') { settingsBtn.style.top = 'auto'; settingsBtn.style.bottom = -(size + 10) + 'px'; settingsBtn.style.left = '0px'; addCustomBtn.style.top = 'auto'; addCustomBtn.style.bottom = -(size + 10) + 'px'; addCustomBtn.style.left = (size + 10) + 'px'; }
    else if (pos === 'bottom') { settingsBtn.style.top = -(size + 10) + 'px'; settingsBtn.style.left = '0px'; addCustomBtn.style.top = -(size + 10) + 'px'; addCustomBtn.style.left = (size + 10) + 'px'; }
    else { settingsBtn.style.left = -(size + 10) + 'px'; settingsBtn.style.top = '0px'; addCustomBtn.style.left = -(size + 10) + 'px'; addCustomBtn.style.top = (size + 10) + 'px'; }
    settingsBtn.addEventListener('click', e => { e.stopPropagation(); e.preventDefault(); showSettingsModal(); hideExtraButtons(); });
    btn.appendChild(settingsBtn);
    addCustomBtn.addEventListener('click', e => { e.stopPropagation(); e.preventDefault(); showAddCustomModal(); hideExtraButtons(); });
    btn.appendChild(addCustomBtn);
}

function hideExtraButtons() { if (settingsBtn) { settingsBtn.style.opacity = '0'; settingsBtn.style.pointerEvents = 'none'; } if (addCustomBtn) { addCustomBtn.style.opacity = '0'; addCustomBtn.style.pointerEvents = 'none'; } }

function moveButtonUp(btnId, settings) {
    const order = settings.buttonOrder || [];
    const idx = order.indexOf(btnId);
    if (idx > 0) { const temp = order[idx - 1]; if (temp !== 'profile') { order[idx - 1] = btnId; order[idx] = temp; } }
    else if (idx === -1) { order.unshift(btnId); }
    settings.buttonOrder = order;
}

// ============================================================================
// 11. ТУЛТИПЫ И ОБРАБОТКА НИКОВ
// ============================================================================

function showVisitTooltip(lnk, nick) {
    hideVisitTooltip();
    const settings = getSettings(), modalScale = settings.general.modalScale / 100;
    const tt = document.createElement('div'); tt.className = 'lor-visit-tooltip';
    tt.style.cssText = `position:fixed;z-index:99999;background:#1a1a2e;color:#ccc;padding:${Math.round(6 * modalScale)}px ${Math.round(10 * modalScale)}px;border-radius:${Math.round(6 * modalScale)}px;font-size:${Math.round(12 * modalScale)}px;white-space:nowrap;pointer-events:none;border:1px solid #444;box-shadow:0 2px 8px rgba(0,0,0,0.5);`;
    tt.textContent = 'Загрузка...'; document.body.appendChild(tt); activeTooltip = tt;
    function pos() { if (!activeTooltip) return; const r = lnk.getBoundingClientRect(); activeTooltip.style.left = r.left + 'px'; activeTooltip.style.top = (r.bottom + 5) + 'px'; const tr = activeTooltip.getBoundingClientRect(), h = tr.height; activeTooltip.style.top = (r.top - h - 5) + 'px'; }
    pos();
    fetchLastVisit(nick, vt => { if (activeTooltip) { activeTooltip.textContent = 'Последнее посещение: ' + vt; pos(); } });
    const sh = () => { pos(); };
    window.addEventListener('scroll', sh, { passive: true });
    activeTooltip._sh = sh;
}

function hideVisitTooltip() { if (activeTooltip) { if (activeTooltip._sh) window.removeEventListener('scroll', activeTooltip._sh); activeTooltip.remove(); activeTooltip = null; } }

function makeReplyNicksClickable() {
    const titles = document.querySelectorAll('article.msg div.title');
    titles.forEach(title => {
        if (title.getAttribute('data-lor-processed')) return;
        title.setAttribute('data-lor-processed', '1');
        const tc = title.textContent;
        if (tc.indexOf('Ответ на:') === -1) return;
        const te = title.querySelector('time'); if (!te) return;
        const walker = document.createTreeWalker(title, NodeFilter.SHOW_TEXT, null, false), nodes = []; let n;
        while (n = walker.nextNode()) nodes.push(n);
        for (let i = 0; i < nodes.length; i++) {
            const nt = nodes[i].textContent, fi = nt.indexOf('от ');
            if (fi !== -1) {
                const af = nt.substring(fi + 3).trim(), nm = af.match(/^([a-zA-Zа-яА-ЯёЁ0-9_-]+)/);
                if (nm) {
                    const nick = nm[1], lnk = document.createElement('a');
                    lnk.href = '/people/' + nick + '/profile'; lnk.textContent = nick;
                    lnk.style.cssText = 'color:#4a90d9;text-decoration:none;cursor:pointer;';
                    let lpt = null, ltr = false, tm = false, mm = false, sx = 0, sy = 0, tts = false, ilc = false;
                    lnk.addEventListener('click', e => { if (ltr || ilc) { e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation(); ilc = false; return false; } }, true);
                    lnk.addEventListener('mousedown', e => { if (e.button !== 0) return; ltr = false; mm = false; ilc = false; sx = e.clientX; sy = e.clientY; lpt = setTimeout(() => { ltr = true; ilc = true; showVisitTooltip(lnk, nick); tts = true; setTimeout(() => { hideVisitTooltip(); tts = false; }, 3000); }, 500); });
                    lnk.addEventListener('mousemove', e => { if (lpt) { const dx = Math.abs(e.clientX - sx), dy = Math.abs(e.clientY - sy); if (dx > 10 || dy > 10) { clearTimeout(lpt); lpt = null; mm = true; } } });
                    lnk.addEventListener('mouseup', e => { clearTimeout(lpt); lpt = null; if (ltr) { e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation(); ltr = false; return false; } });
                    lnk.addEventListener('mouseleave', () => { clearTimeout(lpt); lpt = null; if (!tts) hideVisitTooltip(); if (!ltr) this.style.textDecoration = 'none'; });
                    lnk.addEventListener('mouseenter', e => { this.style.textDecoration = 'underline'; if (!ltr && !tts) { showVisitTooltip(e.target, nick); tts = true; } });
                    lnk.addEventListener('touchstart', e => { tm = false; ltr = false; ilc = false; tts = false; sx = e.touches[0].clientX; sy = e.touches[0].clientY; lpt = setTimeout(() => { ltr = true; ilc = true; tm = true; showVisitTooltip(lnk, nick); tts = true; setTimeout(() => { hideVisitTooltip(); tts = false; }, 3000); }, 500); }, { passive: true });
                    lnk.addEventListener('touchmove', e => { if (lpt) { const dx = Math.abs(e.touches[0].clientX - sx), dy = Math.abs(e.touches[0].clientY - sy); if (dx > 10 || dy > 10) { clearTimeout(lpt); lpt = null; tm = true; } } }, { passive: true });
                    lnk.addEventListener('touchend', e => { clearTimeout(lpt); lpt = null; if (ltr) { e.preventDefault(); e.stopPropagation(); ltr = false; } else if (!tm) hideVisitTooltip(); tm = false; });
                    lnk.addEventListener('touchcancel', e => { clearTimeout(lpt); lpt = null; ltr = false; ilc = false; hideVisitTooltip(); });
                    lnk.addEventListener('contextmenu', e => { if (ltr) { e.preventDefault(); e.stopPropagation(); } });
                    const bn = nt.substring(0, fi + 3 + af.indexOf(nick)), an = nt.substring(fi + 3 + af.indexOf(nick) + nick.length), btn = document.createTextNode(bn), atn = document.createTextNode(an), par = nodes[i].parentNode;
                    par.insertBefore(btn, nodes[i]); par.insertBefore(lnk, nodes[i]); par.insertBefore(atn, nodes[i]); par.removeChild(nodes[i]);
                }
                break;
            }
        }
    });
}

// ============================================================================
// 12. ИНИЦИАЛИЗАЦИЯ И ОБРАБОТЧИКИ СОБЫТИЙ
// ============================================================================

document.addEventListener('click', e => { let hide = true; if (settingsBtn && settingsBtn.contains(e.target)) hide = false; if (addCustomBtn && addCustomBtn.contains(e.target)) hide = false; if (hide) hideExtraButtons(); });

window.addEventListener('load', () => { pageLoadTime = Date.now(); setTimeout(scrollToLastMod, 1000); setTimeout(updateSavedData, 1500); setTimeout(makeReplyNicksClickable, 2000); });
window.addEventListener('resize', () => { const s = getSettings(); if (s.general.mobileView) positionMobilePanels(); });
window.addEventListener('orientationchange', () => { setTimeout(() => { const s = getSettings(); if (s.general.mobileView) positionMobilePanels(); }, 300); });

if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', () => { setTimeout(rebuildPanel, 500); setTimeout(updateSavedData, 800); setTimeout(makeReplyNicksClickable, 1000); }); }
else { setTimeout(rebuildPanel, 500); setTimeout(updateSavedData, 800); setTimeout(makeReplyNicksClickable, 1000); }

let attempts = 0; const interval = setInterval(() => { if (document.body) { clearInterval(interval); rebuildPanel(); updateSavedData(); makeReplyNicksClickable(); } if (++attempts > 20) clearInterval(interval); }, 250);

const domObserver = new MutationObserver(mutations => { let hasNew = false; mutations.forEach(m => { if (m.type === 'childList' && m.addedNodes.length > 0) { for (let i = 0; i < m.addedNodes.length; i++) { const n = m.addedNodes[i]; if (n.nodeType === 1) { if (n.querySelectorAll && n.querySelectorAll('article.msg div.title').length > 0) hasNew = true; if (n.classList && (n.classList.contains('msg') || n.querySelector('.title'))) hasNew = true; } } } }); if (hasNew) setTimeout(makeReplyNicksClickable, 500); });
domObserver.observe(document.body || document.documentElement, { childList: true, subtree: true });

document.addEventListener('touchstart', e => { if (e.touches.length === 1) { touchStartY = e.touches[0].clientY; touchStartX = e.touches[0].clientX; touchMoved = false; const t = e.target; let inPanel = false; POSITIONS.forEach(pos => { if (mobileCollapsedContainers[pos] && mobileCollapsedContainers[pos].contains(t)) inPanel = true; if (mobileExpandedContainers[pos] && mobileExpandedContainers[pos].contains(t)) inPanel = true; }); e.target._tip = inPanel; } }, { passive: true });

document.addEventListener('touchmove', e => { if (e.touches.length === 1) { const dy = e.touches[0].clientY - touchStartY, dx = e.touches[0].clientX - touchStartX; if (Math.abs(dy) > 10 || Math.abs(dx) > 10) touchMoved = true; if (e.target._tip && Math.abs(dy) > Math.abs(dx)) e.preventDefault(); } }, { passive: false });

document.addEventListener('touchend', e => { if (!touchMoved) return; const s = getSettings(); if (!s.general.mobileView) { touchMoved = false; return; } const dy = (e.changedTouches[0] ? e.changedTouches[0].clientY : touchStartY) - touchStartY, t = e.target; POSITIONS.forEach(pos => { let inPanel = false; if (mobileCollapsedContainers[pos] && mobileCollapsedContainers[pos].contains(t)) inPanel = true; if (mobileExpandedContainers[pos] && mobileExpandedContainers[pos].contains(t)) inPanel = true; if (inPanel) { if (dy > SWIPE_THRESHOLD) expandMobilePanel(pos); else if (dy < -SWIPE_THRESHOLD) collapseMobilePanel(pos); } }); touchMoved = false; });

function expandMobilePanel(pos) { if (isMobilePanelExpanded[pos]) return; isMobilePanelExpanded[pos] = true; if (mobileCollapsedContainers[pos]) mobileCollapsedContainers[pos].style.display = 'none'; if (mobileExpandedContainers[pos]) { mobileExpandedContainers[pos].style.display = 'flex'; mobileExpandedContainers[pos].scrollTop = 0; mobileExpandedContainers[pos].scrollLeft = 0; } }
function collapseMobilePanel(pos) { if (!isMobilePanelExpanded[pos]) return; isMobilePanelExpanded[pos] = false; if (mobileExpandedContainers[pos]) mobileExpandedContainers[pos].style.display = 'none'; if (mobileCollapsedContainers[pos]) mobileCollapsedContainers[pos].style.display = 'flex'; }

})();