// ==UserScript==
// @name         NSLorPins
// @namespace    test
// @version      1.1.0
// @description  Pinned messages module for NSLorPanel (linux.org.ru) with full scale support
// @match        https://www.linux.org.ru/*
// @grant        none
// @inject-into  content
// @run-at       document-idle
// ==/UserScript==
(function() {
    'use strict';

    const SETTINGS_KEY = 'lor_pins_settings';
    const PINS_KEY = 'lor_pinned_messages';
    const PANEL_SETTINGS_KEY = 'lor_panel_settings_v3';
    const POSITIONS = ['right', 'left', 'top', 'bottom'];
    const SCALE_LIMITS = {
        button: { min: 30, max: 300, step: 10 },
        mobileButton: { min: 30, max: 300, step: 10 },
        modal: { min: 30, max: 200, step: 10 },
        header: { min: 50, max: 200, step: 10 }
    };
    const THEME_COLORS = {
        black: { btnBg: '#1a1a2e', btnBgHover: '#16213e', btnColor: '#c8c8c8', borderColor: '#444444' },
        tango: { btnBg: '#333333', btnBgHover: '#16213e', btnColor: '#aaaaaa', borderColor: '#666666' },
        'tango-light': { btnBg: '#d3d7cf', btnBgHover: '#c0c4bc', btnColor: '#2e3436', borderColor: '#888a85' },
        'tango-auto': { btnBg: '#d3d7cf', btnBgHover: '#c0c4bc', btnColor: '#2e3436', borderColor: '#888a85' },
        white2: { btnBg: '#e8e8e8', btnBgHover: '#d0d0d0', btnColor: '#333333', borderColor: '#cccccc' },
        waltz: { btnBg: '#ececec', btnBgHover: '#d8d8d8', btnColor: '#333333', borderColor: '#cccccc' },
        zomg_ponies: { btnBg: '#ececec', btnBgHover: '#d8d8d8', btnColor: '#333333', borderColor: '#cccccc' }
    };

    let moduleSettings = loadModuleSettings();
    let panelGeneral = { scale: 100, mobileScale: 120, modalScale: 100, mobileView: false, enableAnimations: true };
    let panelSignature = '';
    let isDark = true;
    let themeColors = THEME_COLORS.black;
    let activeListRender = null;
    let activeSettingsRender = null;
    let pinsTabRescale = null;
    let toastTimer = null;
    let headerProcessTimer = null;
    let panelObserver = null;
    let headerObserver = null;
    let scaleWatcherId = null;
    const openModals = [];
    const appliedScales = { button: null, header: null, modal: null };

    function log(msg, data) {
        const prefix = '[NSLorPins]';
        if (data !== undefined) {
            console.log(prefix, msg, data);
        } else {
            console.log(prefix, msg);
        }
    }

    function clampScale(value, limits) {
        const num = parseInt(value, 10);
        if (!isFinite(num)) return limits.min;
        return Math.max(limits.min, Math.min(limits.max, num));
    }

    function normalizeScaleValue(value, limits) {
        if (value === 'auto' || value === undefined || value === null || value === '') return 'auto';
        const num = parseInt(value, 10);
        if (!isFinite(num)) return 'auto';
        if (num < limits.min || num > limits.max) return 'auto';
        return num;
    }

    function loadModuleSettings() {
        const def = {
            enabled: true,
            showPanelButton: true,
            showPinInHeaders: true,
            scales: { button: 'auto', mobileButton: 'auto', modal: 'auto', header: 'auto' }
        };
        try {
            const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY));
            if (saved && typeof saved === 'object') {
                const sc = saved.scales && typeof saved.scales === 'object' ? saved.scales : {};
                return {
                    enabled: saved.enabled !== undefined ? !!saved.enabled : def.enabled,
                    showPanelButton: saved.showPanelButton !== undefined ? !!saved.showPanelButton : def.showPanelButton,
                    showPinInHeaders: saved.showPinInHeaders !== undefined ? !!saved.showPinInHeaders : def.showPinInHeaders,
                    scales: {
                        button: normalizeScaleValue(sc.button, SCALE_LIMITS.button),
                        mobileButton: normalizeScaleValue(sc.mobileButton, SCALE_LIMITS.mobileButton),
                        modal: normalizeScaleValue(sc.modal, SCALE_LIMITS.modal),
                        header: normalizeScaleValue(sc.header, SCALE_LIMITS.header)
                    }
                };
            }
        } catch (e) {}
        return def;
    }

    function saveModuleSettings() {
        try {
            localStorage.setItem(SETTINGS_KEY, JSON.stringify(moduleSettings));
        } catch (e) {}
    }

    function readPanelGeneral() {
        const res = { scale: 100, mobileScale: 120, modalScale: 100, mobileView: false, enableAnimations: true };
        try {
            const saved = JSON.parse(localStorage.getItem(PANEL_SETTINGS_KEY));
            if (saved && saved.general) {
                const g = saved.general;
                const sc = parseInt(g.scale, 10);
                const ms = parseInt(g.mobileScale, 10);
                const mms = parseInt(g.modalScale, 10);
                if (isFinite(sc) && sc >= 30 && sc <= 300) res.scale = sc;
                if (isFinite(ms) && ms >= 30 && ms <= 300) res.mobileScale = ms;
                if (isFinite(mms) && mms >= 30 && mms <= 300) res.modalScale = mms;
                res.mobileView = !!g.mobileView;
                res.enableAnimations = g.enableAnimations !== false;
            }
        } catch (e) {}
        return res;
    }

    function signatureOf(g) {
        return g.scale + '|' + g.mobileScale + '|' + g.modalScale + '|' + (g.mobileView ? 1 : 0) + '|' + (g.enableAnimations ? 1 : 0);
    }

    function getCurrentTheme() {
        const links = document.querySelectorAll('link[rel="stylesheet"]');
        for (let i = 0; i < links.length; i++) {
            const m = links[i].href.match(/\/([^/]+)\/combined\.css/);
            if (m) return m[1];
        }
        return 'black';
    }

    function updatePanelSettings() {
        panelGeneral = readPanelGeneral();
        panelSignature = signatureOf(panelGeneral);
        const theme = getCurrentTheme();
        isDark = theme === 'black' || theme === 'tango';
        themeColors = THEME_COLORS[theme] || THEME_COLORS.black;
    }

    function resolveScale(key, fallbackPercent) {
        const value = moduleSettings.scales[key];
        if (value === 'auto') return fallbackPercent / 100;
        return value / 100;
    }

    function getButtonScale() {
        return panelGeneral.mobileView ?
            resolveScale('mobileButton', panelGeneral.mobileScale) :
            resolveScale('button', panelGeneral.scale);
    }

    function getModalScale() {
        return resolveScale('modal', panelGeneral.modalScale);
    }

    function getHeaderScale() {
        return resolveScale('header', panelGeneral.modalScale);
    }

    function effectivePercent(key) {
        const value = moduleSettings.scales[key];
        if (value !== 'auto') return value;
        if (key === 'button') return panelGeneral.scale;
        if (key === 'mobileButton') return panelGeneral.mobileScale;
        return panelGeneral.modalScale;
    }

    function setScaleValue(key, value) {
        moduleSettings.scales[key] = value === 'auto' ? 'auto' : clampScale(value, SCALE_LIMITS[key]);
        saveModuleSettings();
        applyScales();
    }

    function stepScale(key, dir) {
        const limits = SCALE_LIMITS[key];
        const next = effectivePercent(key) + dir * limits.step;
        setScaleValue(key, Math.max(limits.min, Math.min(limits.max, next)));
    }

    function applyScales(force) {
        const bs = getButtonScale();
        const hs = getHeaderScale();
        const ms = getModalScale();
        if (force || bs !== appliedScales.button) {
            refreshButtons(true);
            appliedScales.button = bs;
        }
        if (force || hs !== appliedScales.header) {
            refreshHeaderStates();
            appliedScales.header = hs;
        }
        if (force || ms !== appliedScales.modal) {
            openModals.slice().forEach(function(handle) { handle.rescale(); });
            const tab = document.getElementById('lor-pins-tab');
            if (tab) tab.style.fontSize = Math.round(14 * ms) + 'px';
            if (pinsTabRescale) pinsTabRescale();
            appliedScales.modal = ms;
        }
        updateBadges();
    }

    function getPins() {
        try {
            const raw = JSON.parse(localStorage.getItem(PINS_KEY) || '[]');
            if (!Array.isArray(raw)) return [];
            return raw.filter(function(p) { return p && typeof p === 'object' && p.id && p.url; });
        } catch (e) {
            return [];
        }
    }

    function savePins(list) {
        try {
            localStorage.setItem(PINS_KEY, JSON.stringify(list));
        } catch (e) {
            alert('NSLorPins: не удалось сохранить список (localStorage переполнен).');
        }
        refreshHeaderStates();
        updateBadges();
        if (activeListRender) activeListRender();
        if (activeSettingsRender) activeSettingsRender();
    }

    function isPinned(id) {
        return getPins().some(function(p) { return p.id === id; });
    }

    function injectStyles() {
        if (document.getElementById('lor-pins-styles')) return;
        const style = document.createElement('style');
        style.id = 'lor-pins-styles';
        style.textContent = [
            '.lor-pins-scroll { scrollbar-width: thin; scrollbar-color: #4a90d9 rgba(74,144,217,0.12); }',
            '.lor-pins-scroll::-webkit-scrollbar { width: 10px; }',
            '.lor-pins-scroll::-webkit-scrollbar-track { background: rgba(74,144,217,0.08); border-radius: 5px; }',
            '.lor-pins-scroll::-webkit-scrollbar-thumb { background: #4a90d9; border-radius: 5px; border: 2px solid transparent; background-clip: padding-box; }',
            '.lor-pins-scroll::-webkit-scrollbar-thumb:hover { background: #6aa8e8; border: 2px solid transparent; background-clip: padding-box; }',
            '.lor-pin-toggle:focus-visible { outline: 2px solid #4a90d9; outline-offset: 2px; }',
            '@keyframes lor-pins-toast-in { from { opacity: 0; transform: translateX(-50%) translateY(12px); } to { opacity: 1; transform: translateX(-50%) translateY(0); } }'
        ].join('\n');
        document.head.appendChild(style);
    }

    function formatDate(ts) {
        const d = new Date(ts);
        function p(n) { return n < 10 ? '0' + n : '' + n; }
        return p(d.getDate()) + '.' + p(d.getMonth() + 1) + '.' + d.getFullYear() + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
    }

    function makeBadge(scale) {
        const badge = document.createElement('span');
        badge.className = 'lor-pins-badge';
        badge.style.cssText = `position:absolute;top:${Math.round(-3 * scale)}px;right:${Math.round(-3 * scale)}px;min-width:${Math.round(16 * scale)}px;height:${Math.round(16 * scale)}px;padding:0 ${Math.round(4 * scale)}px;border-radius:${Math.round(8 * scale)}px;background:#4a90d9;color:#fff;font-size:${Math.round(10 * scale)}px;font-weight:bold;display:none;align-items:center;justify-content:center;box-sizing:border-box;pointer-events:none;line-height:1;`;
        return badge;
    }

    function updateBadges() {
        const count = getPins().length;
        document.querySelectorAll('#lor-pins-panel-btn, #lor-pins-own-btn').forEach(function(btn) {
            btn.title = 'Закреплённые сообщения (' + count + ') • ЛКМ — список, ПКМ — настройки';
            const badge = btn.querySelector('.lor-pins-badge');
            if (badge) {
                badge.textContent = count > 99 ? '99+' : String(count);
                badge.style.display = count > 0 ? 'flex' : 'none';
            }
        });
    }

    function makeCircleButton(text, title, scale) {
        const size = Math.round(54 * scale);
        const fontSize = Math.round(24 * scale);
        const btn = document.createElement('div');
        btn.textContent = text;
        btn.title = title;
        btn.style.cssText = `width:${size}px;height:${size}px;background:${themeColors.btnBg};color:${themeColors.btnColor};border-radius:50%;display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:${fontSize}px;user-select:none;opacity:0.7;position:relative;flex-shrink:0;transition:opacity 0.2s,background 0.2s;`;
        btn.onmouseenter = function() { this.style.opacity = '1'; this.style.background = themeColors.btnBgHover; };
        btn.onmouseleave = function() { this.style.opacity = '0.7'; this.style.background = themeColors.btnBg; };
        return btn;
    }

    function makeStepBtn(text, s) {
        const btn = document.createElement('button');
        btn.textContent = text;
        btn.style.cssText = `width:${Math.round(26 * s)}px;height:${Math.round(26 * s)}px;background:${isDark ? '#1a2a3a' : '#e8e8e8'};color:${isDark ? '#ccc' : '#444'};border:1px solid ${isDark ? '#3a4a5a' : '#ccc'};border-radius:${Math.round(4 * s)}px;cursor:pointer;font-size:${Math.round(15 * s)}px;line-height:1;display:flex;align-items:center;justify-content:center;padding:0;flex-shrink:0;`;
        btn.onmouseenter = function() { this.style.background = isDark ? '#2a3a4a' : '#d8d8d8'; };
        btn.onmouseleave = function() { this.style.background = isDark ? '#1a2a3a' : '#e8e8e8'; };
        return btn;
    }

    function attachLongPress(el, onLong) {
        let timer = null;
        let fired = false;
        let sx = 0;
        let sy = 0;
        el.addEventListener('mousedown', function(e) {
            if (e.button !== 0) return;
            fired = false;
            sx = e.clientX;
            sy = e.clientY;
            timer = setTimeout(function() { fired = true; onLong(); }, 500);
        });
        el.addEventListener('mousemove', function(e) {
            if (timer && (Math.abs(e.clientX - sx) > 8 || Math.abs(e.clientY - sy) > 8)) {
                clearTimeout(timer);
                timer = null;
            }
        });
        el.addEventListener('mouseup', function() { clearTimeout(timer); timer = null; });
        el.addEventListener('mouseleave', function() { clearTimeout(timer); timer = null; fired = false; });
        el.addEventListener('touchstart', function(e) {
            if (e.touches.length !== 1) return;
            fired = false;
            sx = e.touches[0].clientX;
            sy = e.touches[0].clientY;
            timer = setTimeout(function() { fired = true; onLong(); }, 500);
        }, { passive: true });
        el.addEventListener('touchmove', function(e) {
            if (timer && e.touches.length === 1) {
                const dx = Math.abs(e.touches[0].clientX - sx);
                const dy = Math.abs(e.touches[0].clientY - sy);
                if (dx > 10 || dy > 10) {
                    clearTimeout(timer);
                    timer = null;
                }
            }
        }, { passive: true });
        el.addEventListener('touchend', function(e) {
            clearTimeout(timer);
            timer = null;
            if (fired) e.preventDefault();
        }, { passive: false });
        el.addEventListener('touchcancel', function() { clearTimeout(timer); timer = null; fired = false; });
        el.addEventListener('click', function(e) {
            if (fired) {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                fired = false;
                return false;
            }
        }, true);
        el.addEventListener('contextmenu', function(e) {
            e.preventDefault();
            e.stopPropagation();
            onLong();
        });
    }

    function findPanelContainer() {
        for (let i = 0; i < POSITIONS.length; i++) {
            const el = document.querySelector('.lor-panel-container.lor-panel-' + POSITIONS[i]);
            if (el) return el;
        }
        for (let i = 0; i < POSITIONS.length; i++) {
            const el = document.querySelector('.lor-mobile-expanded.lor-mobile-' + POSITIONS[i]);
            if (el) return el;
        }
        for (let i = 0; i < POSITIONS.length; i++) {
            const el = document.querySelector('.lor-mobile-collapsed.lor-mobile-' + POSITIONS[i]);
            if (el) return el;
        }
        return null;
    }

    function injectPanelButton(container) {
        if (document.getElementById('lor-pins-panel-btn')) return;
        const scale = getButtonScale();
        const btn = makeCircleButton('📌', 'Закреплённые сообщения', scale);
        btn.id = 'lor-pins-panel-btn';
        btn.appendChild(makeBadge(scale));
        attachLongPress(btn, openSettingsModal);
        btn.addEventListener('click', function() { openPinsModal(); });
        container.appendChild(btn);
        updateBadges();
    }

    function removePanelButton() {
        const btn = document.getElementById('lor-pins-panel-btn');
        if (btn) btn.remove();
    }

    function createOwnButton() {
        if (document.getElementById('lor-pins-own-btn')) return;
        const scale = getButtonScale();
        const size = Math.round(50 * scale);
        const btn = document.createElement('div');
        btn.id = 'lor-pins-own-btn';
        btn.textContent = '📌';
        btn.title = 'Закреплённые сообщения';
        btn.style.cssText = `position:fixed;bottom:${Math.round(140 * scale)}px;right:${Math.round(20 * scale)}px;width:${size}px;height:${size}px;background:${themeColors.btnBg};color:${themeColors.btnColor};border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:${Math.round(24 * scale)}px;cursor:pointer;z-index:9998;opacity:0.8;transition:opacity 0.3s,transform 0.3s;box-shadow:0 2px 8px rgba(0,0,0,0.3);user-select:none;border:1px solid ${themeColors.borderColor};`;
        btn.onmouseenter = function() { this.style.opacity = '1'; this.style.transform = 'scale(1.1)'; };
        btn.onmouseleave = function() { this.style.opacity = '0.8'; this.style.transform = 'scale(1)'; };
        btn.appendChild(makeBadge(scale));
        attachLongPress(btn, openSettingsModal);
        btn.addEventListener('click', function() { openPinsModal(); });
        document.body.appendChild(btn);
        updateBadges();
    }

    function removeOwnButton() {
        const btn = document.getElementById('lor-pins-own-btn');
        if (btn) btn.remove();
    }

    function refreshButtons(force) {
        if (!moduleSettings.enabled) {
            removePanelButton();
            removeOwnButton();
            return;
        }
        const container = findPanelContainer();
        if (container) {
            removeOwnButton();
            if (moduleSettings.showPanelButton) {
                const existing = document.getElementById('lor-pins-panel-btn');
                if (!force && existing && existing.parentNode === container) {
                    updateBadges();
                    return;
                }
                removePanelButton();
                injectPanelButton(container);
            } else {
                removePanelButton();
            }
        } else {
            removePanelButton();
            if (force) removeOwnButton();
            createOwnButton();
        }
    }

    function applyEnabledState() {
        if (moduleSettings.enabled) {
            refreshButtons(true);
            if (moduleSettings.showPinInHeaders) {
                processMessageHeaders();
            } else {
                removeHeaderPins();
            }
        } else {
            removePanelButton();
            removeOwnButton();
            removeHeaderPins();
            const listOverlay = document.getElementById('lor-pins-list-overlay');
            if (listOverlay && listOverlay._closeLorModal) listOverlay._closeLorModal();
        }
        appliedScales.button = getButtonScale();
        appliedScales.header = getHeaderScale();
        updateBadges();
    }

    function extractMessageData(article) {
        const id = article.id;
        if (!id) return null;
        const isTopic = id.indexOf('topic-') === 0;
        const num = id.replace(/^(comment|topic)-/, '');
        if (!/^\d+$/.test(num)) return null;
        const params = new URLSearchParams(location.search);
        const page = params.get('page');
        let url = location.origin + location.pathname;
        if (!isTopic) {
            url += '?cid=' + num;
            if (page) url += '&page=' + page;
            url += '#comment-' + num;
        }
        const authorLink = article.querySelector('a[href*="/people/"]');
        const author = authorLink ? authorLink.textContent.trim() : 'Аноним';
        const h1 = document.querySelector('h1');
        const topic = (h1 ? h1.textContent.trim() : '') || document.title.replace(' - Linux.org.ru', '').trim();
        const bodyEl = article.querySelector('.msg_body');
        let text = bodyEl ? bodyEl.textContent : article.textContent;
        text = text.replace(/\s+/g, ' ').trim();
        if (text.length > 240) text = text.slice(0, 240) + '…';
        const timeEl = article.querySelector('time');
        const time = timeEl ? timeEl.textContent.trim() : '';
        return { id: id, url: url, author: author, topic: topic, text: text, time: time, savedAt: Date.now() };
    }

    function setPinToggleState(span, pinned, s) {
        span.dataset.pinned = pinned ? '1' : '0';
        span.textContent = pinned ? '📌 Открепить' : '📌 Закрепить';
        span.title = pinned ? 'Убрать сообщение из закреплённых' : 'Сохранить сообщение в закреплённых';
        const color = pinned ? '#4CAF50' : '#4a90d9';
        span.style.cssText = `display:inline-block;margin-left:${Math.round(8 * s)}px;padding:${Math.round(1 * s)}px ${Math.round(8 * s)}px;border:1px solid ${color};border-radius:${Math.round(10 * s)}px;color:${color};background:transparent;font-size:${Math.round(11 * s)}px;font-weight:bold;cursor:pointer;user-select:none;white-space:nowrap;vertical-align:middle;line-height:1.6;font-family:Arial,sans-serif;transition:background 0.2s;`;
    }

    function createPinToggle(article) {
        const span = document.createElement('span');
        span.className = 'lor-pin-toggle';
        span.dataset.pinId = article.id;
        span.setAttribute('role', 'button');
        span.tabIndex = 0;
        setPinToggleState(span, isPinned(article.id), getHeaderScale());
        span.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            togglePin(article);
        });
        span.addEventListener('keydown', function(e) {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                e.stopPropagation();
                togglePin(article);
            }
        });
        span.onmouseenter = function() {
            this.style.background = this.dataset.pinned === '1' ? 'rgba(76,175,80,0.15)' : 'rgba(74,144,217,0.15)';
        };
        span.onmouseleave = function() { this.style.background = 'transparent'; };
        return span;
    }

    function processMessageHeaders() {
        if (!moduleSettings.enabled || !moduleSettings.showPinInHeaders) return;
        const s = getHeaderScale();
        document.querySelectorAll('article.msg').forEach(function(article) {
            if (!article.id) return;
            if (article.dataset.lorPinProcessed) return;
            if (article.closest('.lor-comment-preview, .lor-pins-overlay')) return;
            article.dataset.lorPinProcessed = '1';
            const toggle = createPinToggle(article);
            const title = article.querySelector('div.title');
            if (title) {
                title.appendChild(toggle);
            } else {
                const bar = document.createElement('div');
                bar.className = 'lor-pin-bar';
                bar.style.cssText = 'margin:0 0 ' + Math.round(6 * s) + 'px 0;';
                bar.appendChild(toggle);
                article.insertBefore(bar, article.firstChild);
            }
        });
    }

    function removeHeaderPins() {
        document.querySelectorAll('.lor-pin-toggle, .lor-pin-bar').forEach(function(el) { el.remove(); });
        document.querySelectorAll('article.msg[data-lor-pin-processed]').forEach(function(a) {
            delete a.dataset.lorPinProcessed;
        });
    }

    function refreshHeaderStates() {
        const s = getHeaderScale();
        document.querySelectorAll('.lor-pin-toggle').forEach(function(span) {
            setPinToggleState(span, isPinned(span.dataset.pinId), s);
        });
        document.querySelectorAll('.lor-pin-bar').forEach(function(bar) {
            bar.style.marginBottom = Math.round(6 * s) + 'px';
        });
    }

    function flashArticle(article) {
        if (!panelGeneral.enableAnimations) return;
        const prev = article.style.outline;
        article.style.outline = Math.max(1, Math.round(2 * getHeaderScale())) + 'px solid #4CAF50';
        setTimeout(function() { article.style.outline = prev; }, 900);
    }

    function togglePin(article) {
        if (!moduleSettings.enabled) return;
        const data = extractMessageData(article);
        if (!data) return;
        const pins = getPins();
        const idx = pins.findIndex(function(p) { return p.id === data.id; });
        if (idx !== -1) {
            pins.splice(idx, 1);
            savePins(pins);
            showToast('Сообщение откреплено', 'Отменить', function() {
                const cur = getPins();
                if (cur.some(function(p) { return p.id === data.id; })) return;
                cur.splice(Math.min(idx, cur.length), 0, data);
                savePins(cur);
            });
        } else {
            pins.unshift(data);
            savePins(pins);
            flashArticle(article);
            showToast('📌 Сообщение закреплено', 'Открыть список', openPinsModal);
        }
    }

    function deletePin(id) {
        const pins = getPins();
        const idx = pins.findIndex(function(p) { return p.id === id; });
        if (idx === -1) return;
        const item = pins[idx];
        pins.splice(idx, 1);
        savePins(pins);
        showToast('Сообщение удалено из списка', 'Отменить', function() {
            const cur = getPins();
            if (cur.some(function(p) { return p.id === item.id; })) return;
            cur.splice(Math.min(idx, cur.length), 0, item);
            savePins(cur);
        });
    }

    function showToast(message, actionLabel, actionFn) {
        clearTimeout(toastTimer);
        const old = document.getElementById('lor-pins-toast');
        if (old) old.remove();
        updatePanelSettings();
        const s = getModalScale();
        const toast = document.createElement('div');
        toast.id = 'lor-pins-toast';
        toast.style.cssText = `position:fixed;bottom:${Math.round(24 * s)}px;left:50%;transform:translateX(-50%);z-index:100020;display:flex;align-items:center;gap:${Math.round(14 * s)}px;background:${isDark ? '#0a0a14' : '#ffffff'};color:${isDark ? '#ccc' : '#333'};border:1px solid #4a90d9;border-radius:${Math.round(8 * s)}px;padding:${Math.round(10 * s)}px ${Math.round(16 * s)}px;font-family:Arial,sans-serif;font-size:${Math.round(13 * s)}px;box-shadow:0 ${Math.round(4 * s)}px ${Math.round(20 * s)}px rgba(0,0,0,0.4);animation:lor-pins-toast-in 0.25s ease;max-width:90vw;box-sizing:border-box;`;
        const text = document.createElement('span');
        text.textContent = message;
        toast.appendChild(text);
        if (actionLabel && actionFn) {
            const action = document.createElement('span');
            action.textContent = actionLabel;
            action.style.cssText = 'color:#4a90d9;font-weight:bold;cursor:pointer;white-space:nowrap;';
            action.onclick = function() {
                clearTimeout(toastTimer);
                toast.remove();
                actionFn();
            };
            toast.appendChild(action);
        }
        const close = document.createElement('span');
        close.textContent = '✕';
        close.style.cssText = 'cursor:pointer;color:#888;padding:0 2px;';
        close.onclick = function() {
            clearTimeout(toastTimer);
            toast.remove();
        };
        toast.appendChild(close);
        document.body.appendChild(toast);
        toastTimer = setTimeout(function() {
            if (toast.parentNode) toast.remove();
        }, 5000);
    }

    function applyModalChrome(handle, s) {
        handle.modal.style.padding = Math.round(24 * s) + 'px';
        handle.modal.style.maxWidth = Math.round(handle.width * s) + 'px';
        handle.modal.style.borderRadius = Math.round(8 * s) + 'px';
        handle.modal.style.fontSize = Math.round(14 * s) + 'px';
        handle.header.style.marginBottom = Math.round(12 * s) + 'px';
        handle.header.style.paddingBottom = Math.round(8 * s) + 'px';
        handle.titleEl.style.fontSize = Math.round(16 * s) + 'px';
        handle.closeBtn.style.fontSize = Math.round(20 * s) + 'px';
        handle.closeBtn.style.marginLeft = Math.round(12 * s) + 'px';
        handle.content.style.paddingRight = Math.round(6 * s) + 'px';
        handle.content.style.paddingBottom = Math.round(4 * s) + 'px';
    }

    function openModal(title, width, id, buildContent) {
        updatePanelSettings();
        const s = getModalScale();
        const originalOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        const overlay = document.createElement('div');
        overlay.id = id;
        overlay.className = 'lor-pins-overlay';
        overlay.style.cssText = `position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.6);z-index:100005;display:flex;align-items:center;justify-content:center;padding:10px;box-sizing:border-box;`;
        const modal = document.createElement('div');
        modal.style.cssText = `background:${isDark ? '#0a0a14' : '#fff'};border:1px solid ${isDark ? '#333' : '#ccc'};width:100%;max-height:85vh;box-sizing:border-box;color:${isDark ? '#ccc' : '#333'};font-family:Arial,sans-serif;box-shadow:0 0 30px rgba(0,0,0,${isDark ? '0.8' : '0.2'});display:flex;flex-direction:column;overflow:hidden;`;
        const header = document.createElement('div');
        header.style.cssText = `display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid ${isDark ? '#333' : '#ccc'};flex-shrink:0;`;
        const titleEl = document.createElement('div');
        titleEl.textContent = title;
        titleEl.style.cssText = 'font-weight:bold;word-break:break-word;flex:1;color:#4a90d9;';
        header.appendChild(titleEl);
        const closeBtn = document.createElement('div');
        closeBtn.textContent = '✕';
        closeBtn.style.cssText = `cursor:pointer;color:${isDark ? '#888' : '#666'};flex-shrink:0;padding:0 4px;`;
        header.appendChild(closeBtn);
        const content = document.createElement('div');
        content.className = 'lor-pins-scroll';
        content.style.cssText = 'overflow-y:auto;flex:1;min-height:0;overscroll-behavior:contain;touch-action:pan-y;';
        const handle = {
            overlay: overlay,
            modal: modal,
            header: header,
            titleEl: titleEl,
            closeBtn: closeBtn,
            content: content,
            width: width,
            close: null,
            rescale: null
        };
        const closeFn = function() {
            if (!overlay.parentNode) return;
            overlay.remove();
            document.body.style.overflow = originalOverflow;
            const idx = openModals.indexOf(handle);
            if (idx !== -1) openModals.splice(idx, 1);
            if (id === 'lor-pins-list-overlay') activeListRender = null;
            if (id === 'lor-pins-settings-overlay') activeSettingsRender = null;
        };
        handle.close = closeFn;
        handle.rescale = function() {
            if (!overlay.parentNode) return;
            const ns = getModalScale();
            const scrollTop = content.scrollTop;
            const focused = content.contains(document.activeElement) ? document.activeElement : null;
            let caret = null;
            if (focused && focused.selectionStart !== undefined && focused.selectionStart !== null) {
                caret = focused.selectionStart;
            }
            applyModalChrome(handle, ns);
            content.innerHTML = '';
            buildContent(content, closeFn, handle);
            content.scrollTop = scrollTop;
            if (focused) {
                const again = content.querySelector('input[type="text"]');
                if (again) {
                    again.focus();
                    if (caret !== null && again.setSelectionRange) {
                        const pos = Math.min(caret, again.value.length);
                        again.setSelectionRange(pos, pos);
                    }
                }
            }
        };
        closeBtn.onclick = closeFn;
        overlay.onclick = function(e) { if (e.target === overlay) closeFn(); };
        modal.addEventListener('touchstart', function(e) { e.stopPropagation(); }, { passive: true });
        modal.addEventListener('touchmove', function(e) { e.stopPropagation(); }, { passive: true });
        overlay._closeLorModal = closeFn;
        modal.appendChild(header);
        modal.appendChild(content);
        overlay.appendChild(modal);
        document.body.appendChild(overlay);
        openModals.push(handle);
        applyModalChrome(handle, s);
        buildContent(content, closeFn, handle);
        appliedScales.modal = s;
        return handle;
    }

    function openPinsModal() {
        if (document.getElementById('lor-pins-list-overlay')) return;
        updatePanelSettings();
        let searchText = '';
        let sortMode = 'new';
        openModal('📌 Закреплённые сообщения', 700, 'lor-pins-list-overlay', function(content, closeFn) {
            const s = getModalScale();
            const toolbar = document.createElement('div');
            toolbar.style.cssText = `display:flex;gap:${Math.round(8 * s)}px;margin-bottom:${Math.round(8 * s)}px;flex-wrap:wrap;`;
            const searchInp = document.createElement('input');
            searchInp.type = 'text';
            searchInp.placeholder = 'Поиск: автор, тема, текст...';
            searchInp.value = searchText;
            searchInp.style.cssText = `flex:1;min-width:${Math.round(200 * s)}px;padding:${Math.round(8 * s)}px ${Math.round(10 * s)}px;background:${isDark ? '#111' : '#f5f5f5'};color:${isDark ? '#ccc' : '#333'};border:1px solid ${isDark ? '#444' : '#ccc'};border-radius:${Math.round(4 * s)}px;font-size:${Math.round(14 * s)}px;box-sizing:border-box;`;
            toolbar.appendChild(searchInp);
            const sortSel = document.createElement('select');
            sortSel.style.cssText = `padding:${Math.round(8 * s)}px ${Math.round(10 * s)}px;background:${isDark ? '#111' : '#f5f5f5'};color:${isDark ? '#ccc' : '#333'};border:1px solid ${isDark ? '#444' : '#ccc'};border-radius:${Math.round(4 * s)}px;font-size:${Math.round(13 * s)}px;box-sizing:border-box;`;
            [
                { value: 'new', text: 'Сначала новые' },
                { value: 'old', text: 'Сначала старые' },
                { value: 'author', text: 'По автору' }
            ].forEach(function(o) {
                const opt = document.createElement('option');
                opt.value = o.value;
                opt.textContent = o.text;
                sortSel.appendChild(opt);
            });
            sortSel.value = sortMode;
            toolbar.appendChild(sortSel);
            content.appendChild(toolbar);

            const scaleRow = document.createElement('div');
            scaleRow.style.cssText = `display:flex;align-items:center;gap:${Math.round(6 * s)}px;margin-bottom:${Math.round(10 * s)}px;flex-wrap:wrap;padding:${Math.round(6 * s)}px ${Math.round(8 * s)}px;background:${isDark ? '#0d0d1a' : '#f0f4f8'};border:1px solid ${isDark ? '#2a2a3a' : '#d8e0e8'};border-radius:${Math.round(6 * s)}px;`;
            const scaleLabel = document.createElement('span');
            scaleLabel.textContent = 'Масштаб окна:';
            scaleLabel.style.cssText = `font-size:${Math.round(12 * s)}px;color:${isDark ? '#888' : '#666'};`;
            scaleRow.appendChild(scaleLabel);
            const minusBtn = makeStepBtn('−', s);
            minusBtn.title = 'Уменьшить масштаб';
            minusBtn.onclick = function() { stepScale('modal', -1); };
            scaleRow.appendChild(minusBtn);
            const scaleValue = document.createElement('span');
            scaleValue.textContent = effectivePercent('modal') + '%';
            scaleValue.style.cssText = `min-width:${Math.round(48 * s)}px;text-align:center;font-weight:bold;font-size:${Math.round(13 * s)}px;color:#4a90d9;`;
            scaleRow.appendChild(scaleValue);
            const plusBtn = makeStepBtn('+', s);
            plusBtn.title = 'Увеличить масштаб';
            plusBtn.onclick = function() { stepScale('modal', 1); };
            scaleRow.appendChild(plusBtn);
            const autoBtn = document.createElement('span');
            autoBtn.textContent = moduleSettings.scales.modal === 'auto' ? 'авто (панель)' : '↺ как в панели';
            autoBtn.title = 'Брать масштаб модальных окон из настроек NSLorPanel';
            autoBtn.style.cssText = `font-size:${Math.round(11 * s)}px;padding:${Math.round(2 * s)}px ${Math.round(8 * s)}px;border:1px solid ${moduleSettings.scales.modal === 'auto' ? '#4CAF50' : '#4a90d9'};color:${moduleSettings.scales.modal === 'auto' ? '#4CAF50' : '#4a90d9'};border-radius:${Math.round(10 * s)}px;cursor:pointer;user-select:none;white-space:nowrap;`;
            autoBtn.onclick = function() { setScaleValue('modal', 'auto'); };
            scaleRow.appendChild(autoBtn);
            const countEl = document.createElement('span');
            countEl.style.cssText = `margin-left:auto;font-size:${Math.round(12 * s)}px;color:${isDark ? '#888' : '#666'};`;
            scaleRow.appendChild(countEl);
            content.appendChild(scaleRow);

            const listEl = document.createElement('div');
            listEl.style.cssText = `display:flex;flex-direction:column;gap:${Math.round(8 * s)}px;`;
            content.appendChild(listEl);
            const footer = document.createElement('div');
            footer.style.cssText = `display:flex;justify-content:space-between;align-items:center;gap:${Math.round(8 * s)}px;margin-top:${Math.round(14 * s)}px;padding-top:${Math.round(10 * s)}px;border-top:1px solid ${isDark ? '#333' : '#ccc'};flex-wrap:wrap;`;
            const clearBtn = document.createElement('button');
            clearBtn.textContent = '🗑 Очистить всё';
            clearBtn.style.cssText = `padding:${Math.round(8 * s)}px ${Math.round(16 * s)}px;background:#5a1a1a;color:#ddd;border:1px solid #8a2a2a;border-radius:${Math.round(4 * s)}px;cursor:pointer;font-size:${Math.round(13 * s)}px;`;
            footer.appendChild(clearBtn);
            const settingsBtn = document.createElement('button');
            settingsBtn.textContent = '⚙ Настройки модуля';
            settingsBtn.style.cssText = `padding:${Math.round(8 * s)}px ${Math.round(16 * s)}px;background:${isDark ? '#1a2a3a' : '#e8e8e8'};color:${isDark ? '#aaa' : '#555'};border:1px solid ${isDark ? '#3a4a5a' : '#ccc'};border-radius:${Math.round(4 * s)}px;cursor:pointer;font-size:${Math.round(13 * s)}px;`;
            footer.appendChild(settingsBtn);
            const closeBtn = document.createElement('button');
            closeBtn.textContent = 'Закрыть';
            closeBtn.style.cssText = `padding:${Math.round(8 * s)}px ${Math.round(20 * s)}px;background:${isDark ? '#2a2a3a' : '#e0e0e0'};color:${isDark ? '#aaa' : '#666'};border:1px solid ${isDark ? '#444' : '#ccc'};border-radius:${Math.round(4 * s)}px;cursor:pointer;font-size:${Math.round(13 * s)}px;`;
            footer.appendChild(closeBtn);
            content.appendChild(footer);

            function render() {
                const pins = getPins();
                let items = pins.slice();
                if (searchText) {
                    const q = searchText.toLowerCase();
                    items = items.filter(function(p) {
                        return (p.author || '').toLowerCase().includes(q) ||
                            (p.topic || '').toLowerCase().includes(q) ||
                            (p.text || '').toLowerCase().includes(q);
                    });
                }
                if (sortMode === 'new') {
                    items.sort(function(a, b) { return (b.savedAt || 0) - (a.savedAt || 0); });
                } else if (sortMode === 'old') {
                    items.sort(function(a, b) { return (a.savedAt || 0) - (b.savedAt || 0); });
                } else {
                    items.sort(function(a, b) { return (a.author || '').localeCompare(b.author || '', 'ru'); });
                }
                countEl.textContent = searchText ? ('Показано: ' + items.length + ' из ' + pins.length) : ('Всего: ' + pins.length);
                listEl.innerHTML = '';
                if (pins.length === 0) {
                    const empty = document.createElement('div');
                    empty.style.cssText = `text-align:center;padding:${Math.round(30 * s)}px ${Math.round(10 * s)}px;color:${isDark ? '#666' : '#999'};`;
                    empty.innerHTML = `<div style="font-size:${Math.round(32 * s)}px;margin-bottom:${Math.round(10 * s)}px;">📌</div><div style="font-size:${Math.round(14 * s)}px;margin-bottom:${Math.round(6 * s)}px;">Нет закреплённых сообщений</div><div style="font-size:${Math.round(12 * s)}px;">Нажмите «📌 Закрепить» в заголовке любого сообщения на сайте.</div>`;
                    listEl.appendChild(empty);
                    return;
                }
                if (items.length === 0) {
                    const nothing = document.createElement('div');
                    nothing.style.cssText = `text-align:center;padding:${Math.round(20 * s)}px;color:${isDark ? '#666' : '#999'};font-style:italic;font-size:${Math.round(13 * s)}px;`;
                    nothing.textContent = 'Ничего не найдено по запросу.';
                    listEl.appendChild(nothing);
                    return;
                }
                items.forEach(function(p) {
                    const row = document.createElement('div');
                    row.setAttribute('role', 'link');
                    row.tabIndex = 0;
                    row.style.cssText = `padding:${Math.round(12 * s)}px;border-radius:${Math.round(6 * s)}px;cursor:pointer;display:flex;align-items:flex-start;gap:${Math.round(10 * s)}px;border:1px solid ${isDark ? '#2a2a3a' : '#e0e0e0'};background:${isDark ? '#0d0d1a' : '#f9f9f9'};transition:background 0.2s,border-color 0.2s;`;
                    row.onmouseenter = function() {
                        this.style.background = isDark ? '#16213e' : '#e8f4f8';
                        this.style.borderColor = '#4a90d9';
                    };
                    row.onmouseleave = function() {
                        this.style.background = isDark ? '#0d0d1a' : '#f9f9f9';
                        this.style.borderColor = isDark ? '#2a2a3a' : '#e0e0e0';
                    };
                    const info = document.createElement('div');
                    info.style.cssText = 'flex:1;min-width:0;';
                    const topicLine = document.createElement('div');
                    topicLine.textContent = p.topic || '';
                    topicLine.style.cssText = `font-size:${Math.round(11 * s)}px;color:#4a90d9;margin-bottom:${Math.round(3 * s)}px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;`;
                    info.appendChild(topicLine);
                    const authorLine = document.createElement('div');
                    authorLine.style.cssText = `font-size:${Math.round(14 * s)}px;font-weight:bold;margin-bottom:${Math.round(3 * s)}px;`;
                    authorLine.textContent = p.author || 'Аноним';
                    if (p.time) {
                        const timeSpan = document.createElement('span');
                        timeSpan.textContent = ' • ' + p.time;
                        timeSpan.style.cssText = `font-weight:normal;font-size:${Math.round(12 * s)}px;color:${isDark ? '#888' : '#666'};`;
                        authorLine.appendChild(timeSpan);
                    }
                    info.appendChild(authorLine);
                    const snippet = document.createElement('div');
                    snippet.textContent = p.text || '';
                    snippet.style.cssText = `font-size:${Math.round(12 * s)}px;line-height:1.5;color:${isDark ? '#aaa' : '#555'};word-break:break-word;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;`;
                    info.appendChild(snippet);
                    const meta = document.createElement('div');
                    meta.textContent = 'Сохранено: ' + formatDate(p.savedAt || Date.now());
                    meta.style.cssText = `font-size:${Math.round(10 * s)}px;color:${isDark ? '#666' : '#999'};margin-top:${Math.round(4 * s)}px;`;
                    info.appendChild(meta);
                    row.appendChild(info);
                    const delBtn = document.createElement('span');
                    delBtn.textContent = '✕';
                    delBtn.title = 'Удалить из списка';
                    delBtn.style.cssText = `color:${isDark ? '#888' : '#999'};cursor:pointer;font-size:${Math.round(18 * s)}px;padding:${Math.round(2 * s)}px ${Math.round(8 * s)}px;flex-shrink:0;border-radius:${Math.round(4 * s)}px;transition:color 0.2s,background 0.2s;`;
                    delBtn.onmouseenter = function() { this.style.color = '#ff5555'; this.style.background = 'rgba(255,85,85,0.1)'; };
                    delBtn.onmouseleave = function() { this.style.color = isDark ? '#888' : '#999'; this.style.background = 'transparent'; };
                    delBtn.onclick = function(e) {
                        e.preventDefault();
                        e.stopPropagation();
                        deletePin(p.id);
                    };
                    row.appendChild(delBtn);
                    row.onclick = function(e) { if (e.button === 0) location.href = p.url; };
                    row.onkeydown = function(e) { if (e.key === 'Enter') location.href = p.url; };
                    row.onmousedown = function(e) { if (e.button === 1) { e.preventDefault(); window.open(p.url, '_blank'); } };
                    row.onauxclick = function(e) { if (e.button === 1) e.preventDefault(); };
                    listEl.appendChild(row);
                });
            }

            searchInp.oninput = function() { searchText = this.value.trim(); render(); };
            sortSel.onchange = function() { sortMode = this.value; render(); };
            clearBtn.onclick = function() {
                const pins = getPins();
                if (pins.length === 0) return;
                if (confirm('Удалить все закреплённые сообщения (' + pins.length + ')?')) {
                    savePins([]);
                }
            };
            settingsBtn.onclick = function() { openSettingsModal(); };
            closeBtn.onclick = closeFn;
            activeListRender = render;
            render();
            if (!panelGeneral.mobileView && !searchText) searchInp.focus();
        });
    }

    function renderSettingsContent(container) {
        updatePanelSettings();
        const s = getModalScale();
        container.innerHTML = '';
        const title = document.createElement('div');
        title.textContent = '📌 Закреплённые сообщения';
        title.style.cssText = `font-size:${Math.round(18 * s)}px;font-weight:bold;margin-bottom:${Math.round(12 * s)}px;padding-bottom:${Math.round(8 * s)}px;border-bottom:1px solid ${isDark ? '#333' : '#ccc'};color:#4a90d9;`;
        container.appendChild(title);
        const desc = document.createElement('div');
        desc.textContent = 'Отдельный модуль: сохраняет выбранные сообщения в список. ЛКМ по кнопке 📌 — список, ПКМ или долгое нажатие — эти настройки.';
        desc.style.cssText = `margin-bottom:${Math.round(16 * s)}px;color:${isDark ? '#888' : '#666'};font-size:${Math.round(13 * s)}px;line-height:1.5;`;
        container.appendChild(desc);

        function addToggle(key, label, hint) {
            const row = document.createElement('label');
            row.style.cssText = `display:flex;align-items:flex-start;gap:${Math.round(10 * s)}px;padding:${Math.round(12 * s)}px ${Math.round(14 * s)}px;margin-bottom:${Math.round(10 * s)}px;background:${isDark ? '#0d0d1a' : '#f9f9f9'};border:1px solid ${isDark ? '#2a2a3a' : '#e0e0e0'};border-radius:${Math.round(8 * s)}px;cursor:pointer;`;
            const cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.checked = !!moduleSettings[key];
            cb.style.cssText = `width:${Math.round(18 * s)}px;height:${Math.round(18 * s)}px;margin-top:2px;cursor:pointer;accent-color:#4a90d9;flex-shrink:0;`;
            cb.onchange = function() {
                moduleSettings[key] = this.checked;
                saveModuleSettings();
                applyEnabledState();
            };
            const textWrap = document.createElement('div');
            const labelText = document.createElement('div');
            labelText.textContent = label;
            labelText.style.cssText = `font-weight:bold;font-size:${Math.round(14 * s)}px;color:${isDark ? '#ccc' : '#333'};`;
            const hintText = document.createElement('div');
            hintText.textContent = hint;
            hintText.style.cssText = `font-size:${Math.round(12 * s)}px;color:${isDark ? '#888' : '#666'};margin-top:2px;line-height:1.4;`;
            textWrap.appendChild(labelText);
            textWrap.appendChild(hintText);
            row.appendChild(cb);
            row.appendChild(textWrap);
            container.appendChild(row);
        }

        addToggle('enabled', 'Включить модуль', 'Главный выключатель: кнопка на панели и метки «Закрепить»');
        addToggle('showPanelButton', 'Кнопка 📌 на панели', 'ЛКМ — список закреплённых, ПКМ / долгое нажатие — настройки');
        addToggle('showPinInHeaders', 'Метки «Закрепить» в заголовках', 'Элемент «📌 Закрепить / Открепить» у каждого сообщения');

        const scaleBox = document.createElement('div');
        scaleBox.style.cssText = `padding:${Math.round(12 * s)}px ${Math.round(14 * s)}px;margin-bottom:${Math.round(12 * s)}px;background:${isDark ? '#0d0d1a' : '#f0f4f8'};border:1px solid ${isDark ? '#2a2a3a' : '#d0d8e0'};border-radius:${Math.round(8 * s)}px;`;
        const scaleTitle = document.createElement('div');
        scaleTitle.textContent = '📐 Масштаб элементов';
        scaleTitle.style.cssText = `font-size:${Math.round(15 * s)}px;font-weight:bold;color:#4a90d9;margin-bottom:${Math.round(4 * s)}px;`;
        scaleBox.appendChild(scaleTitle);
        const scaleDesc = document.createElement('div');
        scaleDesc.textContent = '«Как в панели» — значение берётся из настроек NSLorPanel и обновляется автоматически, в том числе у уже открытых окон.';
        scaleDesc.style.cssText = `font-size:${Math.round(12 * s)}px;color:${isDark ? '#888' : '#666'};line-height:1.4;margin-bottom:${Math.round(10 * s)}px;`;
        scaleBox.appendChild(scaleDesc);

        function addScaleSelect(key, label, autoHint) {
            const limits = SCALE_LIMITS[key];
            const row = document.createElement('div');
            row.style.cssText = `display:flex;align-items:center;gap:${Math.round(8 * s)}px;margin-bottom:${Math.round(8 * s)}px;flex-wrap:wrap;`;
            const lbl = document.createElement('span');
            lbl.textContent = label;
            lbl.style.cssText = `flex:1;min-width:${Math.round(150 * s)}px;font-size:${Math.round(13 * s)}px;color:${isDark ? '#ccc' : '#333'};`;
            row.appendChild(lbl);
            const sel = document.createElement('select');
            sel.style.cssText = `padding:${Math.round(6 * s)}px ${Math.round(8 * s)}px;background:${isDark ? '#111' : '#fff'};color:${isDark ? '#ccc' : '#333'};border:1px solid ${isDark ? '#444' : '#ccc'};border-radius:${Math.round(4 * s)}px;font-size:${Math.round(13 * s)}px;box-sizing:border-box;min-width:${Math.round(160 * s)}px;`;
            const autoOpt = document.createElement('option');
            autoOpt.value = 'auto';
            autoOpt.textContent = 'Как в панели — ' + autoHint + '%';
            sel.appendChild(autoOpt);
            for (let v = limits.min; v <= limits.max; v += limits.step) {
                const opt = document.createElement('option');
                opt.value = String(v);
                opt.textContent = v + '%';
                sel.appendChild(opt);
            }
            const current = moduleSettings.scales[key];
            sel.value = current === 'auto' ? 'auto' : String(current);
            sel.onchange = function() {
                setScaleValue(key, this.value === 'auto' ? 'auto' : parseInt(this.value, 10));
            };
            row.appendChild(sel);
            const now = document.createElement('span');
            now.textContent = effectivePercent(key) + '%';
            now.style.cssText = `min-width:${Math.round(46 * s)}px;text-align:right;font-size:${Math.round(12 * s)}px;font-weight:bold;color:${current === 'auto' ? '#4CAF50' : '#4a90d9'};`;
            row.appendChild(now);
            scaleBox.appendChild(row);
        }

        addScaleSelect('button', 'Кнопка на панели', panelGeneral.scale);
        addScaleSelect('mobileButton', 'Кнопка в мобильном виде', panelGeneral.mobileScale);
        addScaleSelect('modal', 'Окна модуля', panelGeneral.modalScale);
        addScaleSelect('header', 'Метки «Закрепить»', panelGeneral.modalScale);

        const resetRow = document.createElement('div');
        resetRow.style.cssText = `display:flex;align-items:center;gap:${Math.round(8 * s)}px;flex-wrap:wrap;margin-top:${Math.round(4 * s)}px;`;
        const resetBtn = document.createElement('button');
        resetBtn.textContent = '↺ Всё как в панели';
        resetBtn.style.cssText = `padding:${Math.round(6 * s)}px ${Math.round(14 * s)}px;background:${isDark ? '#1a2a3a' : '#e8e8e8'};color:${isDark ? '#aaa' : '#555'};border:1px solid ${isDark ? '#3a4a5a' : '#ccc'};border-radius:${Math.round(4 * s)}px;cursor:pointer;font-size:${Math.round(12 * s)}px;`;
        resetBtn.onclick = function() {
            moduleSettings.scales = { button: 'auto', mobileButton: 'auto', modal: 'auto', header: 'auto' };
            saveModuleSettings();
            applyScales(true);
            if (activeSettingsRender) activeSettingsRender();
        };
        resetRow.appendChild(resetBtn);
        const scaleInfo = document.createElement('span');
        scaleInfo.textContent = 'Панель: ' + panelGeneral.scale + '% • мобильный: ' + panelGeneral.mobileScale + '% • окна: ' + panelGeneral.modalScale + '%' + (panelGeneral.mobileView ? ' • мобильный вид включён' : '');
        scaleInfo.style.cssText = `font-size:${Math.round(11 * s)}px;color:${isDark ? '#777' : '#777'};`;
        resetRow.appendChild(scaleInfo);
        scaleBox.appendChild(resetRow);
        container.appendChild(scaleBox);

        const statsEl = document.createElement('div');
        statsEl.style.cssText = `margin-bottom:${Math.round(12 * s)}px;padding:${Math.round(10 * s)}px ${Math.round(14 * s)}px;background:${isDark ? '#0d0d1a' : '#f9f9f9'};border:1px solid ${isDark ? '#2a2a3a' : '#e0e0e0'};border-radius:${Math.round(6 * s)}px;font-size:${Math.round(13 * s)}px;color:${isDark ? '#aaa' : '#555'};`;
        const pins = getPins();
        let bytes = 0;
        try { bytes = (localStorage.getItem(PINS_KEY) || '').length; } catch (e) {}
        statsEl.textContent = 'В списке: ' + pins.length + ' сообщ. • ~' + Math.max(1, Math.round(bytes / 1024)) + ' КБ в localStorage';
        container.appendChild(statsEl);

        const btnRow = document.createElement('div');
        btnRow.style.cssText = `display:flex;gap:${Math.round(8 * s)}px;flex-wrap:wrap;margin-bottom:${Math.round(16 * s)}px;`;
        const openBtn = document.createElement('button');
        openBtn.textContent = '📌 Открыть список';
        openBtn.style.cssText = `padding:${Math.round(8 * s)}px ${Math.round(18 * s)}px;background:#0a3d6b;color:#ddd;border:1px solid #1a5a9a;border-radius:${Math.round(4 * s)}px;cursor:pointer;font-size:${Math.round(13 * s)}px;`;
        openBtn.onclick = openPinsModal;
        btnRow.appendChild(openBtn);
        const clearBtn = document.createElement('button');
        clearBtn.textContent = '🗑 Очистить список';
        clearBtn.style.cssText = `padding:${Math.round(8 * s)}px ${Math.round(18 * s)}px;background:#5a1a1a;color:#ddd;border:1px solid #8a2a2a;border-radius:${Math.round(4 * s)}px;cursor:pointer;font-size:${Math.round(13 * s)}px;`;
        clearBtn.onclick = function() {
            const list = getPins();
            if (list.length === 0) return;
            if (confirm('Удалить все закреплённые сообщения (' + list.length + ')?')) {
                savePins([]);
            }
        };
        btnRow.appendChild(clearBtn);
        container.appendChild(btnRow);

        const hint = document.createElement('div');
        hint.style.cssText = `padding:${Math.round(10 * s)}px;font-size:${Math.round(12 * s)}px;color:${isDark ? '#888' : '#666'};background:${isDark ? '#0d0d1a' : '#f5f5f5'};border:1px solid ${isDark ? '#2a2a3a' : '#e0e0e0'};border-radius:${Math.round(4 * s)}px;line-height:1.6;`;
        hint.innerHTML = '<b>Как пользоваться:</b><br>• Нажмите «📌 Закрепить» в заголовке сообщения — оно попадёт в список.<br>• ЛКМ по строке списка — переход к сообщению, средняя кнопка мыши — в новой вкладке.<br>• ✕ справа — удалить из списка (с возможностью отмены).<br>• Масштаб окна можно менять прямо в списке кнопками − / +.<br>• Настройки модуля сохраняются сразу, кнопка «Сохранить» панели на них не влияет.<br>• Без NSLorPanel модуль показывает собственную плавающую кнопку 📌.';
        container.appendChild(hint);
    }

    function openSettingsModal() {
        if (document.getElementById('lor-pins-settings-overlay')) return;
        openModal('📌 Настройки закрепов', 560, 'lor-pins-settings-overlay', function(content) {
            renderSettingsContent(content);
            activeSettingsRender = function() {
                if (content.isConnected) renderSettingsContent(content);
            };
        });
    }

    function injectPinsTab(overlay) {
        if (overlay.querySelector('#lor-pins-tab')) return;
        updatePanelSettings();
        const generalTab = overlay.querySelector('#lor-settings-tab-general');
        if (!generalTab) return;
        const tabsContainer = generalTab.parentNode;
        const contentContainer = overlay.querySelector('#lor-settings-tab-content');
        if (!tabsContainer || !contentContainer) return;
        const s = getModalScale();
        let pinsTabActive = false;
        const tab = document.createElement('div');
        tab.id = 'lor-pins-tab';
        tab.textContent = '📌 Закрепы';
        tab.style.cssText = `padding:${Math.round(8 * s)}px ${Math.round(16 * s)}px;cursor:pointer;border-bottom:2px solid transparent;color:${isDark ? '#888' : '#666'};font-size:${Math.round(14 * s)}px;transition:all 0.3s;`;
        tabsContainer.appendChild(tab);

        function deactivate() {
            pinsTabActive = false;
            pinsTabRescale = null;
            tab.style.borderBottomColor = 'transparent';
            tab.style.color = isDark ? '#888' : '#666';
            tab.style.fontWeight = 'normal';
        }

        Array.from(tabsContainer.children).forEach(function(t) {
            if (t === tab) return;
            t.addEventListener('click', deactivate);
        });

        tab.onclick = function() {
            Array.from(tabsContainer.children).forEach(function(t) {
                t.style.borderBottomColor = 'transparent';
                t.style.color = isDark ? '#888' : '#666';
                t.style.fontWeight = 'normal';
            });
            tab.style.borderBottomColor = '#4a90d9';
            tab.style.color = '#4a90d9';
            tab.style.fontWeight = 'bold';
            pinsTabActive = true;
            renderSettingsContent(contentContainer);
            activeSettingsRender = function() {
                if (pinsTabActive && contentContainer.isConnected) renderSettingsContent(contentContainer);
            };
            pinsTabRescale = function() {
                if (!pinsTabActive || !contentContainer.isConnected) return;
                const scrollTop = contentContainer.scrollTop;
                tab.style.fontSize = Math.round(14 * getModalScale()) + 'px';
                renderSettingsContent(contentContainer);
                contentContainer.scrollTop = scrollTop;
            };
        };
    }

    function handlePanelMutations(mutations) {
        let needButtons = false;
        let settingsOverlay = null;
        for (const m of mutations) {
            for (const node of m.addedNodes) {
                if (node.nodeType !== 1) continue;
                if (node.id === 'lor-settings-overlay') settingsOverlay = node;
                if (node.classList && (node.classList.contains('lor-panel-container') || node.classList.contains('lor-mobile-collapsed') || node.classList.contains('lor-mobile-expanded'))) {
                    needButtons = true;
                }
            }
            for (const node of m.removedNodes) {
                if (node.nodeType !== 1) continue;
                if (node.id === 'lor-pins-panel-btn') needButtons = true;
                if (node.classList && (node.classList.contains('lor-panel-container') || node.classList.contains('lor-mobile-collapsed') || node.classList.contains('lor-mobile-expanded'))) {
                    needButtons = true;
                }
            }
        }
        if (settingsOverlay) injectPinsTab(settingsOverlay);
        if (needButtons) {
            setTimeout(function() {
                refreshButtons(false);
                appliedScales.button = getButtonScale();
            }, 50);
        }
    }

    function handleHeaderMutations(mutations) {
        if (!moduleSettings.enabled || !moduleSettings.showPinInHeaders) return;
        let hasNew = false;
        for (const m of mutations) {
            for (const node of m.addedNodes) {
                if (node.nodeType !== 1) continue;
                if (node.matches && node.matches('article.msg')) { hasNew = true; break; }
                if (node.querySelector && node.querySelector('article.msg')) { hasNew = true; break; }
            }
            if (hasNew) break;
        }
        if (hasNew) {
            clearTimeout(headerProcessTimer);
            headerProcessTimer = setTimeout(processMessageHeaders, 300);
        }
    }

    function handleStorage(e) {
        if (e.key === PINS_KEY) {
            refreshHeaderStates();
            updateBadges();
            if (activeListRender) activeListRender();
            if (activeSettingsRender) activeSettingsRender();
        } else if (e.key === SETTINGS_KEY) {
            moduleSettings = loadModuleSettings();
            applyEnabledState();
            applyScales();
            if (activeSettingsRender) activeSettingsRender();
        } else if (e.key === PANEL_SETTINGS_KEY) {
            updatePanelSettings();
            applyScales();
            if (activeSettingsRender) activeSettingsRender();
        }
    }

    function handlePanelSave() {
        updatePanelSettings();
        applyScales();
        if (activeSettingsRender) activeSettingsRender();
    }

    function handleEscape(e) {
        if (e.key !== 'Escape') return;
        const overlays = document.querySelectorAll('.lor-pins-overlay');
        if (overlays.length === 0) return;
        const last = overlays[overlays.length - 1];
        if (last._closeLorModal) last._closeLorModal();
        e.preventDefault();
        e.stopImmediatePropagation();
    }

    function init() {
        updatePanelSettings();
        injectStyles();
        log('NSLorPins v1.1.0 запущен', {
            кнопка: Math.round(getButtonScale() * 100) + '%',
            окна: Math.round(getModalScale() * 100) + '%',
            метки: Math.round(getHeaderScale() * 100) + '%'
        });
        const existingOverlay = document.getElementById('lor-settings-overlay');
        if (existingOverlay) injectPinsTab(existingOverlay);
        panelObserver = new MutationObserver(handlePanelMutations);
        panelObserver.observe(document.body, { childList: true });
        headerObserver = new MutationObserver(handleHeaderMutations);
        headerObserver.observe(document.body, { childList: true, subtree: true });
        if (moduleSettings.enabled && moduleSettings.showPinInHeaders) {
            processMessageHeaders();
        }
        appliedScales.header = getHeaderScale();
        appliedScales.modal = getModalScale();
        setTimeout(function() {
            refreshButtons(true);
            appliedScales.button = getButtonScale();
        }, 1200);
        scaleWatcherId = setInterval(function() {
            const sig = signatureOf(readPanelGeneral());
            if (sig !== panelSignature) {
                updatePanelSettings();
                applyScales();
                if (activeSettingsRender) activeSettingsRender();
            }
        }, 800);
        window.addEventListener('lor-filter-settings-changed', handlePanelSave);
        window.addEventListener('storage', handleStorage);
        document.addEventListener('keydown', handleEscape, true);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();