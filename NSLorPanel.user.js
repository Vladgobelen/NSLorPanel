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

var trackerTableUpdated = false;
var panelContainers = { right: null, left: null, top: null, bottom: null };
var settingsBtn = null;
var addCustomBtn = null;
var allButtons = {};
var currentModal = null;
var scrollTimer = null;
var currentPageSaved = false;
var pageLoadTime = Date.now();

var isMobilePanelExpanded = { right: false, left: false, top: false, bottom: false };
var touchStartY = 0;
var touchStartX = 0;
var touchMoved = false;
var SWIPE_THRESHOLD = 40;
var mobileCollapsedContainers = { right: null, left: null, top: null, bottom: null };
var mobileExpandedContainers = { right: null, left: null, top: null, bottom: null };

function getDefaultSettings() {
    return {
        general: {
            showBorder: false,
            scale: 100,
            modalScale: 100,
            mobileView: false,
            mobileScale: 120,
            orientation: 'vertical'
        },
        filter: {
            enabled: true,
            mode: 'cut',
            applyToMini: true,
            animateBlur: true
        },
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
        buttonOrder: ['up', 'forum', 'tracker', 'notifications', 'saved', 'myComment', 'mention', 'blacklist', 'visits', 'down', 'help']
    };
}

function getSettings() {
    try {
        var saved = JSON.parse(localStorage.getItem('lor_panel_settings_v3'));
        if (saved && typeof saved === 'object') {
            var defaults = getDefaultSettings();
            if (!saved.general) saved.general = defaults.general;
            if (!saved.filter) saved.filter = defaults.filter;
            if (!saved.buttons) saved.buttons = defaults.buttons;
            if (!saved.customButtons) saved.customButtons = [];
            if (!saved.buttonOrder) saved.buttonOrder = defaults.buttonOrder.slice();
            if (saved.general.showBorder === undefined) saved.general.showBorder = defaults.general.showBorder;
            if (saved.general.mobileView === undefined) saved.general.mobileView = defaults.general.mobileView;
            if (!saved.general.scale || saved.general.scale < 30 || saved.general.scale > 200) saved.general.scale = defaults.general.scale;
            if (!saved.general.modalScale || saved.general.modalScale < 30 || saved.general.modalScale > 200) saved.general.modalScale = defaults.general.modalScale;
            if (!saved.general.mobileScale || saved.general.mobileScale < 30 || saved.general.mobileScale > 300) saved.general.mobileScale = defaults.general.mobileScale;
            if (!saved.general.orientation) saved.general.orientation = defaults.general.orientation;
            if (saved.filter.enabled === undefined) saved.filter.enabled = defaults.filter.enabled;
            if (!saved.filter.mode || (saved.filter.mode !== 'cut' && saved.filter.mode !== 'blur')) saved.filter.mode = defaults.filter.mode;
            if (saved.filter.applyToMini === undefined) saved.filter.applyToMini = defaults.filter.applyToMini;
            if (saved.filter.animateBlur === undefined) saved.filter.animateBlur = defaults.filter.animateBlur;
            for (var key in defaults.buttons) {
                if (saved.buttons[key] === undefined) {
                    saved.buttons[key] = defaults.buttons[key];
                } else if (typeof saved.buttons[key] === 'boolean') {
                    saved.buttons[key] = { right: saved.buttons[key], left: false, top: false, bottom: false };
                }
            }
            var orderChanged = false;
            defaults.buttonOrder.forEach(function(k) {
                if (saved.buttonOrder.indexOf(k) === -1) {
                    saved.buttonOrder.push(k);
                    orderChanged = true;
                }
            });
            if (orderChanged) saveSettings(saved);
            return saved;
        } else {
            var oldSaved = JSON.parse(localStorage.getItem('lor_panel_settings'));
            if (oldSaved && typeof oldSaved === 'object') {
                var migrated = migrateOldSettings(oldSaved);
                saveSettings(migrated);
                return migrated;
            }
        }
    } catch(e) {}
    return getDefaultSettings();
}

function migrateOldSettings(old) {
    var defaults = getDefaultSettings();
    var migrated = {
        general: old.general || defaults.general,
        buttons: {},
        customButtons: old.customButtons || [],
        buttonOrder: old.buttonOrder || defaults.buttonOrder.slice()
    };
    for (var key in defaults.buttons) {
        if (old.buttons && old.buttons[key] !== undefined) {
            if (typeof old.buttons[key] === 'boolean') {
                migrated.buttons[key] = { right: old.buttons[key], left: false, top: false, bottom: false };
            } else {
                migrated.buttons[key] = old.buttons[key];
            }
        } else {
            migrated.buttons[key] = defaults.buttons[key];
        }
    }
    return migrated;
}

function saveSettings(settings) {
    localStorage.setItem('lor_panel_settings_v3', JSON.stringify(settings));
}

function getBlacklist() {
    try { return JSON.parse(localStorage.getItem('lor_blacklist') || '[]'); } catch(e) { return []; }
}

function saveBlacklistAndNotify(list) {
    localStorage.setItem('lor_blacklist', JSON.stringify(list));
    window.dispatchEvent(new CustomEvent('lor-blacklist-changed', { detail: { list: list } }));
}

function getTrackedUsers() {
    try { return JSON.parse(localStorage.getItem('lor_tracked_users') || '{}'); } catch(e) { return {}; }
}

function saveTrackedUsers(data) {
    localStorage.setItem('lor_tracked_users', JSON.stringify(data));
}

function fetchLastVisit(nick, callback) {
    fetch(new URL('/people/' + nick + '/profile', window.location.origin).href)
        .then(function(r) {
            if (!r.ok) {
                throw new Error('HTTP ' + r.status);
            }
            return r.text();
        })
        .then(function(html) {
            var visitText = parseLastVisitFromProfile(html);
            if (callback) callback(visitText);
        })
        .catch(function(err) {
            console.log('NSLorPanel: ошибка загрузки профиля ' + nick + ' - ' + err.message);
            if (callback) callback('ошибка загрузки');
        });
}

function parseLastVisitFromProfile(html) {
    var idx = html.indexOf('Последнее посещение');
    if (idx === -1) return 'неизвестно';
    var snippet = html.substring(idx, idx + 200);
    var timeMatch = snippet.match(/<time[^>]*>([^<]+)<\/time>/);
    if (timeMatch) return timeMatch[1].trim();
    var match = html.match(/<b>Последнее посещение:<\/b>\s*<time[^>]*>([^<]+)<\/time>/);
    if (match) return match[1].trim();
    return 'неизвестно';
}

function getSavedPages() {
    try { return JSON.parse(localStorage.getItem('lor_saved_pages') || '[]'); } catch(e) { return []; }
}

function saveSavedPages(pages) {
    localStorage.setItem('lor_saved_pages', JSON.stringify(pages));
}

function getForumCache() {
    try { return JSON.parse(localStorage.getItem('lor_forum_cache') || '{}'); } catch(e) { return {}; }
}

function saveForumCache(data) {
    localStorage.setItem('lor_forum_cache', JSON.stringify(data));
}

function getTrackerCache() {
    try { return JSON.parse(localStorage.getItem('lor_tracker_cache') || '{}'); } catch(e) { return {}; }
}

function saveTrackerCache(data) {
    localStorage.setItem('lor_tracker_cache', JSON.stringify(data));
}

function getMyNick() {
    var pl = document.querySelector('a[href*="/people/"][href*="/profile"]');
    if (pl) return pl.textContent.trim();
    var own = document.querySelector('article.msg.comments-owner, article.msg.own');
    if (own) {
        var l = own.querySelector('a[href*="/people/"]');
        if (l) return l.textContent.trim();
    }
    return null;
}

function getCurrentNewsAuthor() {
    var sign = document.querySelector('.sign a[href*="/people/"]');
    if (sign) return sign.textContent.trim();
    var firstSign = document.querySelector('article.msg .sign a[itemprop="creator"]');
    if (firstSign) return firstSign.textContent.trim();
    var authorEl = document.querySelector('a[href*="/people/"][href*="/profile"]');
    if (authorEl) return authorEl.textContent.trim();
    return null;
}

function goToMyLastComment() {
    var nick = getMyNick();
    if (!nick) { alert('Не удалось определить ник.'); return; }
    var last = null;
    document.querySelectorAll('article.msg').forEach(function(c) {
        var a = c.querySelector('a[href*="/people/"]');
        if (a && a.textContent.trim() === nick) last = c;
    });
    if (last) {
        last.scrollIntoView({ behavior: 'smooth', block: 'start' });
        last.style.outline = '3px solid #4a90d9';
        setTimeout(function() { last.style.outline = ''; }, 3000);
    } else {
        alert('Ваших комментариев на этой странице нет.');
    }
}

function goToLastMention() {
    var nick = getMyNick();
    if (!nick) { alert('Не удалось определить ник.'); return; }
    var last = null;
    document.querySelectorAll('article.msg').forEach(function(c) {
        var a = c.querySelector('a[href*="/people/"]');
        var author = a ? a.textContent.trim() : '';
        if (author !== nick && c.textContent.includes(nick)) last = c;
    });
    if (last) {
        last.scrollIntoView({ behavior: 'smooth', block: 'start' });
        last.style.outline = '3px solid #ff6600';
        setTimeout(function() { last.style.outline = ''; }, 3000);
    } else {
        alert('Упоминаний вас на этой странице нет.');
    }
}

function scrollToLastMod() {
    var lastmod = new URL(location.href).searchParams.get('lastmod');
    if (!lastmod) return;
    var el = document.getElementById('comment-' + lastmod);
    if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        el.style.outline = '3px solid #4a90d9';
        setTimeout(function() { el.style.outline = ''; }, 3000);
    }
}

function getProfileUrl() {
    var pl = document.querySelector('a[href*="/people/"][href*="/profile"]');
    if (pl) return pl.href;
    return 'https://www.linux.org.ru/people/';
}

function updateNotificationBadge(btn) {
    var countEl = document.getElementById('main_events_count');
    var raw = countEl ? countEl.textContent : '(0)';
    var count = parseInt(raw.replace(/[^0-9]/g, '')) || 0;
    btn.textContent = count > 0 ? count : '🔔';
    var settings = getSettings();
    var scale = (settings.general.mobileView ? settings.general.mobileScale : settings.general.scale) / 100;
    var fontSize = Math.round(24 * scale);
    btn.style.fontSize = count > 0 ? Math.round(28 * scale) + 'px' : fontSize + 'px';
    btn.style.fontWeight = 'bold';
}

function getCommentCount() {
    return document.querySelectorAll('article.msg').length;
}

function getPageIdentifier() {
    var url = window.location.href;
    return url.replace(/[?&](lastmod|page)=\d+/g, '');
}

function confirmAndAddToBlacklist() {
    var author = getCurrentNewsAuthor();
    if (!author) { alert('Не удалось определить автора.'); return; }
    if (confirm('Добавить автора "' + author + '" в чёрный список?')) {
        var blacklist = getBlacklist();
        if (blacklist.indexOf(author) === -1) {
            blacklist.push(author);
            saveBlacklistAndNotify(blacklist);
            alert('Автор "' + author + '" добавлен в чёрный список.');
        } else {
            alert('Автор "' + author + '" уже в чёрном списке.');
        }
    }
}

function confirmAndAddToTracked() {
    var author = getCurrentNewsAuthor();
    if (!author) { alert('Не удалось определить автора.'); return; }
    var tracked = getTrackedUsers();
    if (tracked[author]) {
        alert('Пользователь "' + author + '" уже отслеживается.');
        return;
    }
    if (confirm('Добавить пользователя "' + author + '" в список отслеживаемых?')) {
        tracked[author] = { lastVisit: 'загрузка...', checked: 0 };
        saveTrackedUsers(tracked);
        alert('Пользователь "' + author + '" добавлен в список отслеживаемых.');
    }
}

function showBlacklistModal() {
    if (document.getElementById('lor-blacklist-overlay')) return;
    var isDark = isDarkTheme();
    var settings = getSettings();
    var modalScale = settings.general.modalScale / 100;
    var overlay = document.createElement('div');
    overlay.id = 'lor-blacklist-overlay';
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.6);z-index:99999;display:flex;align-items:center;justify-content:center;';
    var modal = document.createElement('div');
    modal.style.cssText = 'background:' + (isDark ? '#0a0a14' : '#ffffff') + ';border:1px solid ' + (isDark ? '#333' : '#ccc') + ';padding:' + Math.round(24 * modalScale) + 'px;border-radius:' + Math.round(8 * modalScale) + 'px;width:' + Math.round(420 * modalScale) + 'px;color:' + (isDark ? '#ccc' : '#333') + ';font-family:Arial,sans-serif;font-size:' + Math.round(14 * modalScale) + 'px;box-shadow:0 0 20px rgba(0,0,0,' + (isDark ? '0.8' : '0.2') + ');';
    modal.innerHTML = '<div style="font-size:' + Math.round(16 * modalScale) + 'px;font-weight:bold;margin-bottom:16px;padding-bottom:8px;border-bottom:1px solid ' + (isDark ? '#333' : '#ccc') + ';">Чёрный список авторов</div>' +
        '<div style="margin-bottom:12px;"><input type="text" id="lor-blacklist-input" placeholder="Введите ник автора" style="width:100%;padding:8px 10px;background:' + (isDark ? '#111' : '#f5f5f5') + ';color:' + (isDark ? '#ccc' : '#333') + ';border:1px solid ' + (isDark ? '#444' : '#ccc') + ';border-radius:4px;font-size:' + Math.round(14 * modalScale) + 'px;box-sizing:border-box;"></div>' +
        '<div style="display:flex;gap:8px;margin-bottom:16px;"><button id="lor-blacklist-add" style="padding:8px 16px;background:#0a3d6b;color:#ddd;border:1px solid #1a5a9a;border-radius:4px;cursor:pointer;font-size:' + Math.round(13 * modalScale) + 'px;">Добавить</button><button id="lor-blacklist-remove" style="padding:8px 16px;background:#5a1a1a;color:#ddd;border:1px solid #8a2a2a;border-radius:4px;cursor:pointer;font-size:' + Math.round(13 * modalScale) + 'px;">Исключить</button></div>' +
        '<div style="font-size:' + Math.round(13 * modalScale) + 'px;color:' + (isDark ? '#888' : '#666') + ';margin-bottom:6px;">Авторы в списке:</div>' +
        '<ul id="lor-blacklist-list" style="list-style:none;padding:0;margin:0 0 16px 0;max-height:' + Math.round(200 * modalScale) + 'px;overflow-y:auto;background:' + (isDark ? '#0d0d1a' : '#f9f9f9') + ';border:1px solid ' + (isDark ? '#2a2a3a' : '#e0e0e0') + ';border-radius:4px;"></ul>' +
        '<div style="text-align:right;"><button id="lor-blacklist-close" style="padding:8px 20px;background:' + (isDark ? '#2a2a3a' : '#e0e0e0') + ';color:' + (isDark ? '#aaa' : '#666') + ';border:1px solid ' + (isDark ? '#444' : '#ccc') + ';border-radius:4px;cursor:pointer;font-size:' + Math.round(13 * modalScale) + 'px;">Закрыть</button></div>';
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    document.getElementById('lor-blacklist-close').onclick = function() { overlay.remove(); };
    overlay.onclick = function(e) { if (e.target === overlay) overlay.remove(); };
    var blacklist = getBlacklist();
    var listEl = document.getElementById('lor-blacklist-list');
    function removeNick(nick) {
        var idx = blacklist.indexOf(nick);
        if (idx !== -1) {
            blacklist.splice(idx, 1);
            saveBlacklistAndNotify(blacklist);
            renderList();
        }
    }
    function renderList() {
        listEl.innerHTML = '';
        if (blacklist.length === 0) {
            var empty = document.createElement('li');
            empty.textContent = 'список пуст';
            empty.style.cssText = 'padding:10px;color:' + (isDark ? '#555' : '#999') + ';text-align:center;font-style:italic;';
            listEl.appendChild(empty);
        } else {
            blacklist.forEach(function(nick) {
                var li = document.createElement('li');
                li.style.cssText = 'padding:7px 10px;border-bottom:1px solid ' + (isDark ? '#1a1a2e' : '#e8e8e8') + ';color:' + (isDark ? '#ccc' : '#333') + ';display:flex;justify-content:space-between;align-items:center;';
                var nameSpan = document.createElement('span');
                nameSpan.textContent = nick;
                var closeBtn = document.createElement('span');
                closeBtn.textContent = '✕';
                closeBtn.style.cssText = 'color:' + (isDark ? '#888' : '#999') + ';cursor:pointer;font-size:16px;padding:0 4px;';
                closeBtn.onclick = function() { removeNick(nick); };
                li.appendChild(nameSpan);
                li.appendChild(closeBtn);
                listEl.appendChild(li);
            });
        }
    }
    renderList();
    document.getElementById('lor-blacklist-add').onclick = function() {
        var input = document.getElementById('lor-blacklist-input');
        var nick = input.value.trim();
        if (nick && blacklist.indexOf(nick) === -1) {
            blacklist.push(nick);
            saveBlacklistAndNotify(blacklist);
            renderList();
            input.value = '';
        }
    };
    document.getElementById('lor-blacklist-remove').onclick = function() {
        var input = document.getElementById('lor-blacklist-input');
        removeNick(input.value.trim());
        input.value = '';
    };
}

function showVisitsModal() {
    if (document.getElementById('lor-visits-overlay')) return;
    var isDark = isDarkTheme();
    var settings = getSettings();
    var modalScale = settings.general.modalScale / 100;
    var overlay = document.createElement('div');
    overlay.id = 'lor-visits-overlay';
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.6);z-index:99999;display:flex;align-items:center;justify-content:center;';
    var modal = document.createElement('div');
    modal.style.cssText = 'background:' + (isDark ? '#0a0a14' : '#ffffff') + ';border:1px solid ' + (isDark ? '#333' : '#ccc') + ';padding:' + Math.round(24 * modalScale) + 'px;border-radius:' + Math.round(8 * modalScale) + 'px;width:' + Math.round(550 * modalScale) + 'px;color:' + (isDark ? '#ccc' : '#333') + ';font-family:Arial,sans-serif;font-size:' + Math.round(14 * modalScale) + 'px;box-shadow:0 0 20px rgba(0,0,0,' + (isDark ? '0.8' : '0.2') + ');';
    modal.innerHTML = '<div style="font-size:' + Math.round(16 * modalScale) + 'px;font-weight:bold;margin-bottom:16px;padding-bottom:8px;border-bottom:1px solid ' + (isDark ? '#333' : '#ccc') + ';">🕐 Отслеживание пользователей</div>' +
        '<div style="margin-bottom:12px;"><input type="text" id="lor-visits-input" placeholder="Введите ник пользователя" style="width:100%;padding:8px 10px;background:' + (isDark ? '#111' : '#f5f5f5') + ';color:' + (isDark ? '#ccc' : '#333') + ';border:1px solid ' + (isDark ? '#444' : '#ccc') + ';border-radius:4px;font-size:' + Math.round(14 * modalScale) + 'px;box-sizing:border-box;"></div>' +
        '<div style="display:flex;gap:8px;margin-bottom:16px;"><button id="lor-visits-add" style="padding:8px 16px;background:#0a3d6b;color:#ddd;border:1px solid #1a5a9a;border-radius:4px;cursor:pointer;font-size:' + Math.round(13 * modalScale) + 'px;">Добавить</button><button id="lor-visits-refresh" style="padding:8px 16px;background:#1a5a3a;color:#ddd;border:1px solid #2a8a4a;border-radius:4px;cursor:pointer;font-size:' + Math.round(13 * modalScale) + 'px;">Обновить все</button></div>' +
        '<div style="font-size:' + Math.round(13 * modalScale) + 'px;color:' + (isDark ? '#888' : '#666') + ';margin-bottom:6px;">Отслеживаемые пользователи:</div>' +
        '<ul id="lor-visits-list" style="list-style:none;padding:0;margin:0 0 16px 0;max-height:' + Math.round(300 * modalScale) + 'px;overflow-y:auto;background:' + (isDark ? '#0d0d1a' : '#f9f9f9') + ';border:1px solid ' + (isDark ? '#2a2a3a' : '#e0e0e0') + ';border-radius:4px;"></ul>' +
        '<div style="text-align:right;"><button id="lor-visits-close" style="padding:8px 20px;background:' + (isDark ? '#2a2a3a' : '#e0e0e0') + ';color:' + (isDark ? '#aaa' : '#666') + ';border:1px solid ' + (isDark ? '#444' : '#ccc') + ';border-radius:4px;cursor:pointer;font-size:' + Math.round(13 * modalScale) + 'px;">Закрыть</button></div>';
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    document.getElementById('lor-visits-close').onclick = function() { overlay.remove(); };
    overlay.onclick = function(e) { if (e.target === overlay) overlay.remove(); };
    var listEl = document.getElementById('lor-visits-list');
    function removeUser(nick) {
        var tracked = getTrackedUsers();
        delete tracked[nick];
        saveTrackedUsers(tracked);
        renderList();
    }
    function renderList() {
        var tracked = getTrackedUsers();
        var nicks = Object.keys(tracked);
        listEl.innerHTML = '';
        if (nicks.length === 0) {
            var empty = document.createElement('li');
            empty.textContent = 'список пуст';
            empty.style.cssText = 'padding:10px;color:' + (isDark ? '#555' : '#999') + ';text-align:center;font-style:italic;';
            listEl.appendChild(empty);
        } else {
            nicks.forEach(function(nick) {
                var data = tracked[nick];
                var li = document.createElement('li');
                li.style.cssText = 'padding:8px 10px;border-bottom:1px solid ' + (isDark ? '#1a1a2e' : '#e8e8e8') + ';color:' + (isDark ? '#ccc' : '#333') + ';display:flex;justify-content:space-between;align-items:center;';
                var leftDiv = document.createElement('div');
                leftDiv.style.cssText = 'flex:1;';
                var nameLink = document.createElement('a');
                nameLink.textContent = nick;
                nameLink.href = '/people/' + nick + '/profile';
                nameLink.style.cssText = 'color:#4a90d9;text-decoration:none;font-weight:bold;cursor:pointer;';
                nameLink.onclick = function(e) { if (e.button === 0) { overlay.remove(); } };
                nameLink.onmouseenter = function() { this.style.textDecoration = 'underline'; };
                nameLink.onmouseleave = function() { this.style.textDecoration = 'none'; };
                leftDiv.appendChild(nameLink);
                var visitDiv = document.createElement('div');
                visitDiv.style.cssText = 'font-size:' + Math.round(12 * modalScale) + 'px;color:' + (isDark ? '#888' : '#666') + ';margin-top:2px;';
                visitDiv.textContent = 'Последнее посещение: ' + (data.lastVisit || 'загрузка...');
                visitDiv.className = 'lor-visit-text-' + nick.replace(/[^a-zA-Z0-9]/g, '_');
                leftDiv.appendChild(visitDiv);
                li.appendChild(leftDiv);
                var closeBtn = document.createElement('span');
                closeBtn.textContent = '✕';
                closeBtn.style.cssText = 'color:' + (isDark ? '#888' : '#999') + ';cursor:pointer;font-size:18px;padding:0 4px;margin-left:10px;';
                closeBtn.title = 'Удалить из отслеживания';
                closeBtn.onclick = function() { removeUser(nick); };
                li.appendChild(closeBtn);
                listEl.appendChild(li);
            });
        }
        loadAllVisits();
    }
    function loadAllVisits() {
        var tracked = getTrackedUsers();
        var nicks = Object.keys(tracked);
        if (nicks.length === 0) return;
        nicks.forEach(function(nick) {
            fetchLastVisit(nick, function(visitText) {
                tracked[nick] = { lastVisit: visitText, checked: Date.now() };
                saveTrackedUsers(tracked);
                var visitEl = document.querySelector('.lor-visit-text-' + nick.replace(/[^a-zA-Z0-9]/g, '_'));
                if (visitEl) {
                    visitEl.textContent = 'Последнее посещение: ' + visitText;
                }
            });
        });
    }
    renderList();
    document.getElementById('lor-visits-add').onclick = function() {
        var input = document.getElementById('lor-visits-input');
        var nick = input.value.trim();
        if (!nick) return;
        var tracked = getTrackedUsers();
        if (tracked[nick]) {
            alert('Пользователь "' + nick + '" уже отслеживается.');
            return;
        }
        tracked[nick] = { lastVisit: 'загрузка...', checked: 0 };
        saveTrackedUsers(tracked);
        renderList();
        input.value = '';
    };
    document.getElementById('lor-visits-refresh').onclick = function() {
        var tracked = getTrackedUsers();
        var nicks = Object.keys(tracked);
        if (nicks.length === 0) return;
        nicks.forEach(function(nick) {
            tracked[nick] = { lastVisit: 'загрузка...', checked: 0 };
            var visitEl = document.querySelector('.lor-visit-text-' + nick.replace(/[^a-zA-Z0-9]/g, '_'));
            if (visitEl) {
                visitEl.textContent = 'Последнее посещение: загрузка...';
            }
        });
        saveTrackedUsers(tracked);
        loadAllVisits();
    };
    document.getElementById('lor-visits-input').addEventListener('keydown', function(e) {
        if (e.key === 'Enter') document.getElementById('lor-visits-add').click();
    });
}

var activeTooltip = null;

function showVisitTooltip(link, nick) {
    hideVisitTooltip();
    var settings = getSettings();
    var modalScale = settings.general.modalScale / 100;
    var tooltip = document.createElement('div');
    tooltip.className = 'lor-visit-tooltip';
    tooltip.style.cssText = 'position:fixed;z-index:99999;background:#1a1a2e;color:#ccc;padding:' + Math.round(6 * modalScale) + 'px ' + Math.round(10 * modalScale) + 'px;border-radius:' + Math.round(6 * modalScale) + 'px;font-size:' + Math.round(12 * modalScale) + 'px;white-space:nowrap;pointer-events:none;border:1px solid #444;box-shadow:0 2px 8px rgba(0,0,0,0.5);';
    tooltip.textContent = 'Загрузка...';
    document.body.appendChild(tooltip);
    activeTooltip = tooltip;
    function positionTooltip() {
        if (!activeTooltip) return;
        var rect = link.getBoundingClientRect();
        activeTooltip.style.left = rect.left + 'px';
        activeTooltip.style.top = (rect.bottom + 5) + 'px';
        var tr = activeTooltip.getBoundingClientRect();
        var tooltipHeight = tr.height;
        activeTooltip.style.top = (rect.top - tooltipHeight - 5) + 'px';
    }
    positionTooltip();
    fetchLastVisit(nick, function(visitText) {
        if (activeTooltip) {
            activeTooltip.textContent = 'Последнее посещение: ' + visitText;
            positionTooltip();
        }
    });
    var scrollHandler = function() { positionTooltip(); };
    window.addEventListener('scroll', scrollHandler, { passive: true });
    activeTooltip._scrollHandler = scrollHandler;
}

function hideVisitTooltip() {
    if (activeTooltip) {
        if (activeTooltip._scrollHandler) {
            window.removeEventListener('scroll', activeTooltip._scrollHandler);
        }
        activeTooltip.remove();
        activeTooltip = null;
    }
}

function makeReplyNicksClickable() {
    var replyTitles = document.querySelectorAll('article.msg div.title');
    replyTitles.forEach(function(title) {
        if (title.getAttribute('data-lor-processed')) return;
        title.setAttribute('data-lor-processed', '1');
        var textContent = title.textContent;
        if (textContent.indexOf('Ответ на:') === -1) return;
        var timeEl = title.querySelector('time');
        if (!timeEl) return;
        var walker = document.createTreeWalker(title, NodeFilter.SHOW_TEXT, null, false);
        var textNodes = [];
        var node;
        while (node = walker.nextNode()) {
            textNodes.push(node);
        }
        for (var i = 0; i < textNodes.length; i++) {
            var nodeText = textNodes[i].textContent;
            var fromIndex = nodeText.indexOf('от ');
            if (fromIndex !== -1) {
                var afterFrom = nodeText.substring(fromIndex + 3).trim();
                var nickMatch = afterFrom.match(/^([a-zA-Zа-яА-ЯёЁ0-9_-]+)/);
                if (nickMatch) {
                    var nick = nickMatch[1];
                    var link = document.createElement('a');
                    link.href = '/people/' + nick + '/profile';
                    link.textContent = nick;
                    link.style.cssText = 'color:#4a90d9;text-decoration:none;cursor:pointer;';

                    // Переменные для отслеживания состояния
                    var longPressTimer = null;
                    var longPressTriggered = false;
                    var touchMoved = false;
                    var mouseMoved = false;
                    var startX = 0;
                    var startY = 0;
                    var tooltipShown = false;
                    var isLinkClicked = false;

                    // Предотвращаем переход по ссылке при длительном нажатии
                    link.addEventListener('click', function(e) {
                        if (longPressTriggered || isLinkClicked) {
                            e.preventDefault();
                            e.stopPropagation();
                            e.stopImmediatePropagation();
                            isLinkClicked = false;
                            return false;
                        }
                        // Разрешаем нормальный переход
                    }, true); // Фаза захвата для приоритета

                    // Обработка для десктопа (мышь)
                    link.addEventListener('mousedown', function(e) {
                        if (e.button !== 0) return; // Только левая кнопка

                        longPressTriggered = false;
                        mouseMoved = false;
                        isLinkClicked = false;
                        startX = e.clientX;
                        startY = e.clientY;

                        longPressTimer = setTimeout(function() {
                            longPressTriggered = true;
                            isLinkClicked = true;
                            showVisitTooltip(link, nick);
                            tooltipShown = true;

                            // Автоматически скрываем тултип через 3 секунды
                            setTimeout(function() {
                                hideVisitTooltip();
                                tooltipShown = false;
                            }, 3000);
                        }, 500);
                    });

                    link.addEventListener('mousemove', function(e) {
                        if (longPressTimer) {
                            var deltaX = Math.abs(e.clientX - startX);
                            var deltaY = Math.abs(e.clientY - startY);
                            if (deltaX > 10 || deltaY > 10) {
                                clearTimeout(longPressTimer);
                                longPressTimer = null;
                                mouseMoved = true;
                            }
                        }
                    });

                    link.addEventListener('mouseup', function(e) {
                        clearTimeout(longPressTimer);
                        longPressTimer = null;

                        if (longPressTriggered) {
                            e.preventDefault();
                            e.stopPropagation();
                            e.stopImmediatePropagation();
                            longPressTriggered = false;
                            return false;
                        }
                    });

                    link.addEventListener('mouseleave', function() {
                        clearTimeout(longPressTimer);
                        longPressTimer = null;

                        if (!tooltipShown) {
                            hideVisitTooltip();
                        }

                        if (!longPressTriggered) {
                            this.style.textDecoration = 'none';
                        }
                    });

                    // Показываем тултип при наведении (без длительного нажатия)
                    link.addEventListener('mouseenter', function(e) {
                        this.style.textDecoration = 'underline';
                        if (!longPressTriggered && !tooltipShown) {
                            showVisitTooltip(e.target, nick);
                            tooltipShown = true;
                        }
                    });

                    // Обработка для мобильных устройств (тач)
                    link.addEventListener('touchstart', function(e) {
                        touchMoved = false;
                        longPressTriggered = false;
                        isLinkClicked = false;
                        tooltipShown = false;
                        startX = e.touches[0].clientX;
                        startY = e.touches[0].clientY;

                        longPressTimer = setTimeout(function() {
                            longPressTriggered = true;
                            isLinkClicked = true;
                            touchMoved = true;
                            showVisitTooltip(link, nick);
                            tooltipShown = true;

                            // Автоматически скрываем тултип через 3 секунды
                            setTimeout(function() {
                                hideVisitTooltip();
                                tooltipShown = false;
                            }, 3000);
                        }, 500);
                    }, { passive: true });

                    link.addEventListener('touchmove', function(e) {
                        if (longPressTimer) {
                            var deltaX = Math.abs(e.touches[0].clientX - startX);
                            var deltaY = Math.abs(e.touches[0].clientY - startY);
                            if (deltaX > 10 || deltaY > 10) {
                                clearTimeout(longPressTimer);
                                longPressTimer = null;
                                touchMoved = true;
                            }
                        }
                    }, { passive: true });

                    link.addEventListener('touchend', function(e) {
                        clearTimeout(longPressTimer);
                        longPressTimer = null;

                        if (longPressTriggered) {
                            e.preventDefault();
                            e.stopPropagation();
                            longPressTriggered = false;
                        } else if (!touchMoved) {
                            hideVisitTooltip();
                        }
                        touchMoved = false;
                    });

                    link.addEventListener('touchcancel', function(e) {
                        clearTimeout(longPressTimer);
                        longPressTimer = null;
                        longPressTriggered = false;
                        isLinkClicked = false;
                        hideVisitTooltip();
                    });

                    // Предотвращаем стандартное контекстное меню
                    link.addEventListener('contextmenu', function(e) {
                        if (longPressTriggered) {
                            e.preventDefault();
                            e.stopPropagation();
                        }
                    });

                    var beforeNick = nodeText.substring(0, fromIndex + 3 + afterFrom.indexOf(nick));
                    var afterNick = nodeText.substring(fromIndex + 3 + afterFrom.indexOf(nick) + nick.length);
                    var beforeTextNode = document.createTextNode(beforeNick);
                    var afterTextNode = document.createTextNode(afterNick);
                    var parent = textNodes[i].parentNode;
                    parent.insertBefore(beforeTextNode, textNodes[i]);
                    parent.insertBefore(link, textNodes[i]);
                    parent.insertBefore(afterTextNode, textNodes[i]);
                    parent.removeChild(textNodes[i]);
                }
                break;
            }
        }
    });
}

function saveScrollPosition() {
    if (Date.now() - pageLoadTime < 2000) return;
    var pageId = getPageIdentifier();
    var savedPages = getSavedPages();
    var found = savedPages.find(function(p) { return p.url === pageId; });
    if (found) {
        found.scrollPosition = window.pageYOffset || document.documentElement.scrollTop;
        found.lastChecked = new Date().toISOString();
        saveSavedPages(savedPages);
    }
}

function getCurrentTheme() {
    var links = document.querySelectorAll('link[rel="stylesheet"]');
    for (var i = 0; i < links.length; i++) {
        var match = links[i].href.match(/\/([^/]+)\/combined\.css/);
        if (match) return match[1];
    }
    return 'black';
}

function getThemeColors() {
    var theme = getCurrentTheme();
    var themes = {
        'black': { btnBg: '#1a1a2e', btnBgHover: '#16213e', btnColor: '#c8c8c8', notifBg: '#cc0000', notifBgHover: '#ff0000', borderColor: '#444444' },
        'tango': { btnBg: '#2e3436', btnBgHover: '#3e4547', btnColor: '#babdb6', notifBg: '#cc0000', notifBgHover: '#ff0000', borderColor: '#555753' },
        'tango-light': { btnBg: '#d3d7cf', btnBgHover: '#c0c4bc', btnColor: '#2e3436', notifBg: '#cc0000', notifBgHover: '#ff0000', borderColor: '#888a85' },
        'tango-auto': { btnBg: '#d3d7cf', btnBgHover: '#c0c4bc', btnColor: '#2e3436', notifBg: '#cc0000', notifBgHover: '#ff0000', borderColor: '#888a85' },
        'white2': { btnBg: '#e8e8e8', btnBgHover: '#d0d0d0', btnColor: '#333333', notifBg: '#cc0000', notifBgHover: '#ff0000', borderColor: '#cccccc' },
        'waltz': { btnBg: '#ececec', btnBgHover: '#d8d8d8', btnColor: '#333333', notifBg: '#cc0000', notifBgHover: '#ff0000', borderColor: '#cccccc' },
        'zomg_ponies': { btnBg: '#ececec', btnBgHover: '#d8d8d8', btnColor: '#333333', notifBg: '#cc0000', notifBgHover: '#ff0000', borderColor: '#cccccc' }
    };
    return themes[theme] || themes['black'];
}

function isDarkTheme() {
    var theme = getCurrentTheme();
    return theme === 'black' || theme === 'tango';
}

function highlightButton(btnId) {
    ['right', 'left', 'top', 'bottom'].forEach(function(pos) {
        var key = btnId + '_' + pos;
        if (allButtons[key]) {
            allButtons[key].style.background = '#4CAF50';
            setTimeout(function() {
                if (allButtons[key]) {
                    var colors = getThemeColors();
                    allButtons[key].style.background = colors.btnBg;
                }
            }, 3000);
        }
    });
}

function flashSavedButton(text, color) {
    ['right', 'left', 'top', 'bottom'].forEach(function(pos) {
        var key = 'saved_' + pos;
        if (allButtons[key]) {
            var btn = allButtons[key];
            var originalText = btn.textContent;
            btn.textContent = text;
            btn.style.color = color;
            setTimeout(function() {
                btn.textContent = originalText;
                btn.style.color = '';
            }, 1500);
        }
    });
}

function showHelpModal() {
    if (document.getElementById('lor-help-overlay')) return;
    var isDark = isDarkTheme();
    var settings = getSettings();
    var modalScale = settings.general.modalScale / 100;
    var overlay = document.createElement('div');
    overlay.id = 'lor-help-overlay';
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.6);z-index:100010;display:flex;align-items:center;justify-content:center;';
    var modal = document.createElement('div');
    modal.style.cssText = 'background:' + (isDark ? '#0a0a14' : '#ffffff') + ';border:1px solid ' + (isDark ? '#333' : '#ccc') + ';padding:' + Math.round(24 * modalScale) + 'px;border-radius:' + Math.round(8 * modalScale) + 'px;width:' + Math.round(600 * modalScale) + 'px;max-height:80vh;color:' + (isDark ? '#ccc' : '#333') + ';font-family:Arial,sans-serif;font-size:' + Math.round(14 * modalScale) + 'px;box-shadow:0 0 30px rgba(0,0,0,' + (isDark ? '0.8' : '0.2') + ');display:flex;flex-direction:column;';
    var header = document.createElement('div');
    header.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;padding-bottom:8px;border-bottom:1px solid ' + (isDark ? '#333' : '#ccc') + ';';
    var titleEl = document.createElement('div');
    titleEl.textContent = '❓ Справка по панели NSLorPanel';
    titleEl.style.cssText = 'font-size:' + Math.round(18 * modalScale) + 'px;font-weight:bold;';
    header.appendChild(titleEl);
    var closeBtn = document.createElement('div');
    closeBtn.textContent = '✕';
    closeBtn.style.cssText = 'cursor:pointer;font-size:' + Math.round(20 * modalScale) + 'px;color:' + (isDark ? '#888' : '#666') + ';';
    closeBtn.onclick = function() { overlay.remove(); };
    header.appendChild(closeBtn);
    modal.appendChild(header);
    var content = document.createElement('div');
    content.style.cssText = 'overflow-y:auto;flex:1;min-height:200px;padding-right:8px;';
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
        { title: '❓ Кнопка "Справка"', content: 'Открывает это окно справки. По умолчанию находится только на левой панели.' },
        { title: '➕ Пользовательские кнопки', content: 'Вы можете добавить свои кнопки с произвольными ссылками. Нажмите ПКМ на кнопку профиля, затем на "+" и введите URL, название и выберите иконку. Кнопка появится на панели. В настройках можно изменить порядок кнопок или удалить пользовательские.' },
        { title: '👤 Кнопка "Профиль"', content: '<b>ЛКМ:</b> Переход в ваш профиль.<br><b>ПКМ:</b> Показывает кнопку настроек (⚙) и кнопку добавления (+).' },
        { title: '⚙ Настройки', content: 'Кнопка настроек появляется при ПКМ на кнопку профиля. В настройках можно: <br>• Включить мобильный вид со свайп-панелью <br>• Включить/отключить отображение рамки панели <br>• Настроить масштаб панели (30-200%) <br>• Настроить масштаб мобильной панели (30-300%) <br>• Настроить масштаб модальных окон (30-200%) <br>• Выбрать, на каких панелях (справа/слева/сверху/снизу) отображать каждую кнопку <br>• Изменить порядок кнопок (кнопка ^) <br>• Удалить пользовательские кнопки (кнопка -)' },
        { title: '🖱 Долгое нажатие мыши', content: 'На десктопе: удержание левой кнопки мыши на любой иконке панели в течение 500 мс эмулирует нажатие правой кнопки мыши (контекстное меню / альтернативное действие). Если начать движение мыши во время удержания (более 5px), долгое нажатие отменяется.' }
    ];
    helpSections.forEach(function(section) {
        var sectionDiv = document.createElement('div');
        sectionDiv.style.cssText = 'margin-bottom:20px;';
        var sectionTitle = document.createElement('div');
        sectionTitle.textContent = section.title;
        sectionTitle.style.cssText = 'font-weight:bold;margin-bottom:6px;color:#4a90d9;font-size:' + Math.round(15 * modalScale) + 'px;';
        sectionDiv.appendChild(sectionTitle);
        var sectionContent = document.createElement('div');
        sectionContent.innerHTML = section.content;
        sectionContent.style.cssText = 'font-size:' + Math.round(13 * modalScale) + 'px;line-height:1.6;padding-left:12px;border-left:2px solid ' + (isDark ? '#2a2a3a' : '#e0e0e0') + ';';
        sectionDiv.appendChild(sectionContent);
        content.appendChild(sectionDiv);
    });
    modal.appendChild(content);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    overlay.onclick = function(e) { if (e.target === overlay) overlay.remove(); };
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
            { title: '⚙ Настройки', content: 'Кнопка настроек появляется при ПКМ на кнопку профиля. В настройках можно: <br>• Включить мобильный вид со свайп-панелью <br>• Выбрать ориентацию панели (вертикально/горизонтально) <br>• Включить/отключить отображение рамки панели <br>• Настроить масштаб панели (30-200%) <br>• Настроить масштаб мобильной панели (30-300%) <br>• Настроить масштаб модальных окон (30-200%) <br>• Выбрать, на каких панелях (справа/слева/сверху/снизу) отображать каждую кнопку <br>• Изменить порядок кнопок (кнопка ^) <br>• Удалить пользовательские кнопки (кнопка -) <br>• Настроить режим фильтрации новостей (вырезать/блюрить)' },
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
    function moveButtonUp(btnId, settings) {
        var order = settings.buttonOrder || [];
        var idx = order.indexOf(btnId);
        if (idx > 0) {
            var temp = order[idx - 1];
            if (temp !== 'profile') { order[idx - 1] = btnId; order[idx] = temp; }
        } else if (idx === -1) { order.unshift(btnId); }
        settings.buttonOrder = order;
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

function showAddCustomButtonModal() {
    if (document.getElementById('lor-add-custom-overlay')) return;
    var isDark = isDarkTheme();
    var settings = getSettings();
    var modalScale = settings.general.modalScale / 100;
    var icons = ['🔴', '🟠', '🟡', '🟢', '🔵', '🟣', '⚫', '⚪', '🟤', '🔶', '🔷', '🔸', '🔹', '🟥', '🟧', '🟨', '🟩', '🟦', '🟪', '⬛', '⬜', '🟫', '❤️', '💙', '💚', '🇦', '🇧', '🇨', '🇩', '🇪', '🇫', '🇬', '🇭', '🇮', '🇯', '🇰', '🇱', '🇲', '🇳', '🇴', '🇵', '🇶', '🇷', '🇸', '🇹', '🇺', '🇻', '🇼', '🇽', '🇾', '🇿'];
    var overlay = document.createElement('div');
    overlay.id = 'lor-add-custom-overlay';
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.6);z-index:100001;display:flex;align-items:center;justify-content:center;';
    var modal = document.createElement('div');
    modal.style.cssText = 'background:' + (isDark ? '#0a0a14' : '#ffffff') + ';border:1px solid ' + (isDark ? '#333' : '#ccc') + ';padding:' + Math.round(24 * modalScale) + 'px;border-radius:' + Math.round(8 * modalScale) + 'px;width:' + Math.round(450 * modalScale) + 'px;color:' + (isDark ? '#ccc' : '#333') + ';font-family:Arial,sans-serif;font-size:' + Math.round(14 * modalScale) + 'px;box-shadow:0 0 20px rgba(0,0,0,' + (isDark ? '0.8' : '0.2') + ');';
    modal.innerHTML = '<div style="font-size:' + Math.round(16 * modalScale) + 'px;font-weight:bold;margin-bottom:16px;padding-bottom:8px;border-bottom:1px solid ' + (isDark ? '#333' : '#ccc') + ';">Добавить кнопку</div>' +
        '<div style="margin-bottom:12px;"><label style="display:block;margin-bottom:4px;font-size:' + Math.round(13 * modalScale) + 'px;">Ссылка (URL):</label><input type="text" id="lor-custom-url" placeholder="https://example.com" style="width:100%;padding:8px 10px;background:' + (isDark ? '#111' : '#f5f5f5') + ';color:' + (isDark ? '#ccc' : '#333') + ';border:1px solid ' + (isDark ? '#444' : '#ccc') + ';border-radius:4px;font-size:' + Math.round(14 * modalScale) + 'px;box-sizing:border-box;"></div>' +
        '<div style="margin-bottom:12px;"><label style="display:block;margin-bottom:4px;font-size:' + Math.round(13 * modalScale) + 'px;">Название:</label><input type="text" id="lor-custom-title" placeholder="Моя кнопка" style="width:100%;padding:8px 10px;background:' + (isDark ? '#111' : '#f5f5f5') + ';color:' + (isDark ? '#ccc' : '#333') + ';border:1px solid ' + (isDark ? '#444' : '#ccc') + ';border-radius:4px;font-size:' + Math.round(14 * modalScale) + 'px;box-sizing:border-box;"></div>' +
        '<div style="margin-bottom:16px;"><label style="display:block;margin-bottom:4px;font-size:' + Math.round(13 * modalScale) + 'px;">Иконка:</label><select id="lor-custom-icon" style="width:100%;padding:8px 10px;background:' + (isDark ? '#111' : '#f5f5f5') + ';color:' + (isDark ? '#ccc' : '#333') + ';border:1px solid ' + (isDark ? '#444' : '#ccc') + ';border-radius:4px;font-size:' + Math.round(18 * modalScale) + 'px;box-sizing:border-box;">' +
        icons.map(function(icon) { return '<option value="' + icon + '">' + icon + '</option>'; }).join('') + '</select></div>' +
        '<div style="text-align:right;"><button id="lor-custom-add" style="padding:8px 20px;background:#0a3d6b;color:#ddd;border:1px solid #1a5a9a;border-radius:4px;cursor:pointer;font-size:' + Math.round(13 * modalScale) + 'px;margin-right:8px;">Добавить</button><button id="lor-custom-cancel" style="padding:8px 20px;background:' + (isDark ? '#2a2a3a' : '#e0e0e0') + ';color:' + (isDark ? '#aaa' : '#666') + ';border:1px solid ' + (isDark ? '#444' : '#ccc') + ';border-radius:4px;cursor:pointer;font-size:' + Math.round(13 * modalScale) + 'px;">Отмена</button></div>';
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    function addCustomButton() {
        var url = document.getElementById('lor-custom-url').value.trim();
        var title = document.getElementById('lor-custom-title').value.trim();
        var icon = document.getElementById('lor-custom-icon').value;
        if (!url) { alert('Введите URL'); return; }
        if (!title) title = url;
        var settings = getSettings();
        var customId = 'custom_' + Date.now();
        settings.customButtons.push({ id: customId, url: url, title: title, icon: icon });
        settings.buttons[customId] = { right: true, left: false, top: false, bottom: false };
        if (settings.buttonOrder.indexOf(customId) === -1) settings.buttonOrder.push(customId);
        saveSettings(settings);
        overlay.remove();
        rebuildPanel();
    }
    document.getElementById('lor-custom-add').onclick = addCustomButton;
    document.getElementById('lor-custom-cancel').onclick = function() { overlay.remove(); };
    document.getElementById('lor-custom-url').addEventListener('keydown', function(e) { if (e.key === 'Enter') addCustomButton(); });
    document.getElementById('lor-custom-title').addEventListener('keydown', function(e) { if (e.key === 'Enter') addCustomButton(); });
    overlay.onclick = function(e) { if (e.target === overlay) overlay.remove(); };
}

function hideExtraButtons() {
    if (settingsBtn) { settingsBtn.style.opacity = '0'; settingsBtn.style.pointerEvents = 'none'; }
    if (addCustomBtn) { addCustomBtn.style.opacity = '0'; addCustomBtn.style.pointerEvents = 'none'; }
}

function showExtraButtons(btn, panelPosition) {
    var colors = getThemeColors();
    var settings = getSettings();
    var scale = settings.general.scale / 100;
    var size = Math.round(44 * scale);
    var fontSize = Math.round(22 * scale);
    if (settingsBtn) { settingsBtn.remove(); settingsBtn = null; }
    if (addCustomBtn) { addCustomBtn.remove(); addCustomBtn = null; }
    btn.style.position = 'relative';
    settingsBtn = document.createElement('div');
    settingsBtn.textContent = '⚙';
    settingsBtn.title = 'Настройки';
    settingsBtn.style.cssText = 'position:absolute;width:' + size + 'px;height:' + size + 'px;background:' + colors.btnBg + ';color:' + colors.btnColor + ';border-radius:50%;display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:' + fontSize + 'px;z-index:10001;';
    addCustomBtn = document.createElement('div');
    addCustomBtn.textContent = '+';
    addCustomBtn.title = 'Добавить кнопку';
    addCustomBtn.style.cssText = 'position:absolute;width:' + size + 'px;height:' + size + 'px;background:' + colors.btnBg + ';color:' + colors.btnColor + ';border-radius:50%;display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:' + fontSize + 'px;z-index:10001;';
    if (panelPosition === 'left') {
        settingsBtn.style.right = -(size + 10) + 'px'; settingsBtn.style.top = '0px';
        addCustomBtn.style.right = -(size + 10) + 'px'; addCustomBtn.style.top = (size + 10) + 'px';
    } else if (panelPosition === 'top') {
        settingsBtn.style.top = 'auto'; settingsBtn.style.bottom = -(size + 10) + 'px'; settingsBtn.style.left = '0px';
        addCustomBtn.style.top = 'auto'; addCustomBtn.style.bottom = -(size + 10) + 'px'; addCustomBtn.style.left = (size + 10) + 'px';
    } else if (panelPosition === 'bottom') {
        settingsBtn.style.top = -(size + 10) + 'px'; settingsBtn.style.left = '0px';
        addCustomBtn.style.top = -(size + 10) + 'px'; addCustomBtn.style.left = (size + 10) + 'px';
    } else {
        settingsBtn.style.left = -(size + 10) + 'px'; settingsBtn.style.top = '0px';
        addCustomBtn.style.left = -(size + 10) + 'px'; addCustomBtn.style.top = (size + 10) + 'px';
    }
    settingsBtn.addEventListener('click', function(e) { e.stopPropagation(); e.preventDefault(); showSettingsModal(); hideExtraButtons(); });
    btn.appendChild(settingsBtn);
    addCustomBtn.addEventListener('click', function(e) { e.stopPropagation(); e.preventDefault(); showAddCustomButtonModal(); hideExtraButtons(); });
    btn.appendChild(addCustomBtn);
}

function createButton(text, title, callback, marginBottom, forceScale) {
    var settings = getSettings();
    var colors = getThemeColors();
    var scale = (forceScale || (settings.general.mobileView ? settings.general.mobileScale : settings.general.scale)) / 100;
    var size = Math.round(54 * scale);
    var fontSize = Math.round(24 * scale);
    var btn = document.createElement('div');
    btn.textContent = text;
    btn.title = title;
    btn.style.cssText = 'width:' + size + 'px;height:' + size + 'px;background:' + colors.btnBg + ';color:' + colors.btnColor + ';border-radius:50%;display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:' + fontSize + 'px;user-select:none;opacity:0.7;position:relative;' + (marginBottom ? 'margin-bottom:30px;' : '');

    btn._contextMenuJustFired = false;
    btn._longPressTimer = null;
    btn._longPressTriggered = false;
    btn._mouseDownTime = 0;

    btn.onmouseenter = function() {
        this.style.opacity = '1';
        this.style.background = colors.btnBgHover;
    };

    btn.onmouseleave = function() {
        this.style.opacity = '0.7';
        this.style.background = colors.btnBg;
        clearTimeout(btn._longPressTimer);
        btn._longPressTriggered = false;
        btn._contextMenuJustFired = false;
    };

    btn.onmousedown = function(e) {
        if (e.button === 2) {
            btn._contextMenuJustFired = true;
            setTimeout(function() { btn._contextMenuJustFired = false; }, 300);
            return;
        }
        if (e.button !== 0) return;

        btn._longPressTriggered = false;
        btn._contextMenuJustFired = false;
        btn._mouseDownTime = Date.now();

        btn._longPressTimer = setTimeout(function() {
            btn._longPressTriggered = true;
            btn._contextMenuJustFired = true;
            var evt = new MouseEvent('contextmenu', {
                bubbles: true,
                cancelable: true,
                button: 2,
                clientX: e.clientX,
                clientY: e.clientY
            });
            btn.dispatchEvent(evt);
        }, 500);
    };

    btn.onmouseup = function(e) {
        clearTimeout(btn._longPressTimer);

        // Если был длинный клик, предотвращаем обычный клик
        if (btn._longPressTriggered || btn._contextMenuJustFired) {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();

            // Сбрасываем флаг через некоторое время
            setTimeout(function() {
                btn._contextMenuJustFired = false;
                btn._longPressTriggered = false;
            }, 100);
            return false;
        }
    };

    btn.onmousemove = function(e) {
        if (btn._longPressTimer && Math.abs(e.clientX - btn._mouseDownTime ? e.clientX : 0) > 5) {
            clearTimeout(btn._longPressTimer);
            btn._longPressTimer = null;
            btn._longPressTriggered = false;
        }
    };

    // Перехватываем contextmenu для установки флага
    btn.addEventListener('contextmenu', function(e) {
        btn._contextMenuJustFired = true;
        setTimeout(function() { btn._contextMenuJustFired = false; }, 300);
    });

    // Используем захват фазы для перехвата клика
    btn.addEventListener('click', function(e) {
        // Если только что было контекстное меню или длинный клик
        if (btn._contextMenuJustFired || btn._longPressTriggered) {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
            return false;
        }

        if (callback) callback(e);
    }, true); // true = фаза захвата

    return btn;
}

function parseForumSections(html) {
    var doc = new DOMParser().parseFromString(html, 'text/html');
    var sections = [];
    var allLinks = doc.querySelectorAll('a[href*="/forum/"]');
    allLinks.forEach(function(link) {
        var href = link.href;
        if (href.match(/\/forum\/[^\/]+\/$/) && !sections.find(function(s) { return s.url === href; })) {
            var parent = link.closest('li');
            var text = parent ? parent.textContent : link.textContent;
            var countMatch = text.match(/\((\d+)\s+за\s+сутки\)/);
            var count = countMatch ? parseInt(countMatch[1]) : 0;
            sections.push({ url: href, title: link.textContent.trim(), description: parent ? (parent.querySelector('em') ? parent.querySelector('em').textContent : '') : '', dailyCount: count });
        }
    });
    return sections;
}

function parseTrackerTopics(html) {
    var doc = new DOMParser().parseFromString(html, 'text/html');
    var topics = [];
    var rows = doc.querySelectorAll('table.message-table tbody tr');
    rows.forEach(function(row) {
        if (row.querySelector('th')) return;
        var cells = row.querySelectorAll('td');
        if (cells.length >= 4) {
            var groupLink = cells[0].querySelector('a');
            var topicLink = cells[1].querySelector('a');
            var countText = cells[3].textContent.trim();
            var count = parseInt(countText) || 0;
            if (topicLink) {
                var tags = [];
                cells[1].querySelectorAll('.tag').forEach(function(tag) { tags.push(tag.textContent.trim()); });
                var fullTitle = topicLink.textContent.trim();
                var titleParts = fullTitle.split('\n').map(function(p) { return p.trim(); }).filter(function(p) { return p; });
                var mainTitle = titleParts[titleParts.length - 1] || fullTitle;
                topics.push({ url: topicLink.href, title: mainTitle, tags: tags, group: groupLink ? groupLink.textContent.trim() : cells[0].textContent.trim(), messageCount: count });
            }
        }
    });
    return topics;
}

function parseNotifications(html) {
    var doc = new DOMParser().parseFromString(html, 'text/html');
    var notifications = [];
    var rows = doc.querySelectorAll('table.message-table tbody tr');
    rows.forEach(function(row) {
        var link = row.querySelector('td:nth-child(2) a');
        var timeEl = row.querySelector('time');
        if (link) {
            var tags = [];
            link.querySelectorAll('.tag').forEach(function(tag) { tags.push(tag.textContent.trim()); });
            var fullText = row.textContent.trim();
            var categoryMatch = fullText.match(/\((Новости|Форум|Трекер|Галерея|Статьи)\)/);
            var category = categoryMatch ? categoryMatch[1] : '';
            notifications.push({ url: link.href, title: link.textContent.trim(), tags: tags, category: category, time: timeEl ? timeEl.textContent.trim() : '' });
        }
    });
    return notifications;
}

function showForumModal() {
    if (currentModal) { currentModal.remove(); currentModal = null; }
    var isDark = isDarkTheme();
    var settings = getSettings();
    var modalScale = settings.general.modalScale / 100;
    var overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.6);z-index:100002;display:flex;align-items:center;justify-content:center;';
    var modal = document.createElement('div');
    modal.style.cssText = 'background:' + (isDark ? '#0a0a14' : '#ffffff') + ';border:1px solid ' + (isDark ? '#333' : '#ccc') + ';padding:' + Math.round(24 * modalScale) + 'px;border-radius:' + Math.round(8 * modalScale) + 'px;width:' + Math.round(600 * modalScale) + 'px;max-height:80vh;color:' + (isDark ? '#ccc' : '#333') + ';font-family:Arial,sans-serif;font-size:' + Math.round(14 * modalScale) + 'px;box-shadow:0 0 30px rgba(0,0,0,' + (isDark ? '0.8' : '0.2') + ');display:flex;flex-direction:column;';
    var header = document.createElement('div');
    header.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;padding-bottom:8px;border-bottom:1px solid ' + (isDark ? '#333' : '#ccc') + ';';
    var titleEl = document.createElement('div');
    titleEl.textContent = 'Разделы форума';
    titleEl.style.cssText = 'font-size:' + Math.round(16 * modalScale) + 'px;font-weight:bold;';
    header.appendChild(titleEl);
    var closeBtn = document.createElement('div');
    closeBtn.textContent = '✕';
    closeBtn.style.cssText = 'cursor:pointer;font-size:' + Math.round(18 * modalScale) + 'px;color:' + (isDark ? '#888' : '#666') + ';';
    closeBtn.onclick = function() { overlay.remove(); currentModal = null; };
    header.appendChild(closeBtn);
    modal.appendChild(header);
    var content = document.createElement('div');
    content.style.cssText = 'overflow-y:auto;flex:1;min-height:200px;text-align:center;';
    content.textContent = 'Загрузка...';
    modal.appendChild(content);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    currentModal = overlay;
    overlay.onclick = function(e) { if (e.target === overlay) { overlay.remove(); currentModal = null; } };
    fetch('https://www.linux.org.ru/forum/').then(function(r) { return r.text(); }).then(function(html) {
        var sections = parseForumSections(html);
        var cache = getForumCache();
        var hasChanges = false;
        content.innerHTML = '';
        content.style.textAlign = 'left';
        if (sections.length === 0) { content.textContent = 'Не удалось загрузить разделы'; content.style.textAlign = 'center'; return; }
        var list = document.createElement('div');
        list.style.cssText = 'display:flex;flex-direction:column;gap:' + Math.round(8 * modalScale) + 'px;';
        sections.forEach(function(section) {
            var row = document.createElement('div');
            var oldCount = cache[section.url] || 0;
            var newCount = section.dailyCount;
            var diff = newCount - oldCount;
            if (diff > 0) { hasChanges = true; row.style.background = isDark ? '#1a3a1a' : '#e8f5e8'; row.style.borderColor = '#4CAF50'; }
            row.style.cssText = 'padding:' + Math.round(12 * modalScale) + 'px;border-radius:' + Math.round(4 * modalScale) + 'px;cursor:pointer;display:flex;justify-content:space-between;align-items:center;border:1px solid ' + (isDark ? '#2a2a3a' : '#e0e0e0') + ';transition:background 0.2s;';
            var infoDiv = document.createElement('div');
            infoDiv.style.cssText = 'flex:1;';
            var titleDiv = document.createElement('div');
            titleDiv.textContent = section.title;
            titleDiv.style.cssText = 'font-weight:bold;margin-bottom:' + Math.round(4 * modalScale) + 'px;';
            infoDiv.appendChild(titleDiv);
            if (section.description) { var descDiv = document.createElement('div'); descDiv.textContent = section.description; descDiv.style.cssText = 'font-size:' + Math.round(12 * modalScale) + 'px;color:' + (isDark ? '#888' : '#666') + ';'; infoDiv.appendChild(descDiv); }
            row.appendChild(infoDiv);
            var countDiv = document.createElement('div');
            countDiv.style.cssText = 'text-align:right;margin-left:' + Math.round(12 * modalScale) + 'px;';
            var countText = document.createElement('div');
            countText.textContent = newCount + ' за сутки';
            countText.style.cssText = 'font-size:' + Math.round(14 * modalScale) + 'px;font-weight:bold;';
            countDiv.appendChild(countText);
            if (diff > 0) { var newText = document.createElement('div'); newText.textContent = '+' + diff + ' новых'; newText.style.cssText = 'font-size:' + Math.round(11 * modalScale) + 'px;color:#4CAF50;font-weight:bold;'; countDiv.appendChild(newText); }
            row.appendChild(countDiv);
            row.onmouseenter = function() { if (!diff > 0) { this.style.background = isDark ? '#16213e' : '#e8f4f8'; } };
            row.onmouseleave = function() { if (!diff > 0) { this.style.background = ''; } };
            row.onclick = function(e) { if (e.button === 0) { location.href = section.url; overlay.remove(); currentModal = null; } };
            row.onmousedown = function(e) { if (e.button === 1) { e.preventDefault(); window.open(section.url, '_blank'); } };
            row.onauxclick = function(e) { if (e.button === 1) { e.preventDefault(); } };
            cache[section.url] = newCount;
            list.appendChild(row);
        });
        content.appendChild(list);
        saveForumCache(cache);
        if (hasChanges) { highlightButton('forum'); }
    });
}

function showTrackerModal() {
    if (currentModal) { currentModal.remove(); currentModal = null; }
    var isDark = isDarkTheme();
    var settings = getSettings();
    var modalScale = settings.general.modalScale / 100;
    var overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.6);z-index:100002;display:flex;align-items:center;justify-content:center;';
    var modal = document.createElement('div');
    modal.style.cssText = 'background:' + (isDark ? '#0a0a14' : '#ffffff') + ';border:1px solid ' + (isDark ? '#333' : '#ccc') + ';padding:' + Math.round(24 * modalScale) + 'px;border-radius:' + Math.round(8 * modalScale) + 'px;width:' + Math.round(700 * modalScale) + 'px;max-height:80vh;color:' + (isDark ? '#ccc' : '#333') + ';font-family:Arial,sans-serif;font-size:' + Math.round(14 * modalScale) + 'px;box-shadow:0 0 30px rgba(0,0,0,' + (isDark ? '0.8' : '0.2') + ');display:flex;flex-direction:column;';
    var header = document.createElement('div');
    header.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;padding-bottom:8px;border-bottom:1px solid ' + (isDark ? '#333' : '#ccc') + ';';
    var titleEl = document.createElement('div');
    titleEl.textContent = 'Трекер';
    titleEl.style.cssText = 'font-size:' + Math.round(16 * modalScale) + 'px;font-weight:bold;';
    header.appendChild(titleEl);
    var closeBtn = document.createElement('div');
    closeBtn.textContent = '✕';
    closeBtn.style.cssText = 'cursor:pointer;font-size:' + Math.round(18 * modalScale) + 'px;color:' + (isDark ? '#888' : '#666') + ';';
    closeBtn.onclick = function() { overlay.remove(); currentModal = null; };
    header.appendChild(closeBtn);
    modal.appendChild(header);
    var content = document.createElement('div');
    content.style.cssText = 'overflow-y:auto;flex:1;min-height:200px;text-align:center;';
    content.textContent = 'Загрузка...';
    modal.appendChild(content);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    currentModal = overlay;
    overlay.onclick = function(e) { if (e.target === overlay) { overlay.remove(); currentModal = null; } };
    fetch('https://www.linux.org.ru/tracker/').then(function(r) { return r.text(); }).then(function(html) {
        var topics = parseTrackerTopics(html);
        var cache = getTrackerCache();
        var hasChanges = false;
        var newCache = {};
        content.innerHTML = '';
        content.style.textAlign = 'left';
        if (topics.length === 0) { content.textContent = 'Не удалось загрузить темы'; content.style.textAlign = 'center'; return; }
        var list = document.createElement('div');
        list.style.cssText = 'display:flex;flex-direction:column;gap:' + Math.round(8 * modalScale) + 'px;';
        topics.forEach(function(topic) {
            var row = document.createElement('div');
            var cleanUrl = topic.url.replace(/[?&]lastmod=\d+/g, '');
            var cachedData = cache[cleanUrl];
            var oldCount = (cachedData && typeof cachedData === 'object') ? cachedData.count : (cachedData || 0);
            var newCount = topic.messageCount;
            var diff = newCount - oldCount;
            newCache[cleanUrl] = { count: newCount, date: Date.now() };
            if (diff > 0 && oldCount > 0) { hasChanges = true; row.style.background = isDark ? '#1a3a1a' : '#e8f5e8'; row.style.borderColor = '#4CAF50'; }
            row.style.cssText = 'padding:' + Math.round(12 * modalScale) + 'px;border-radius:' + Math.round(4 * modalScale) + 'px;cursor:pointer;display:flex;justify-content:space-between;align-items:center;border:1px solid ' + (isDark ? '#2a2a3a' : '#e0e0e0') + ';transition:background 0.2s;';
            var infoDiv = document.createElement('div');
            infoDiv.style.cssText = 'flex:1;';
            if (topic.group) { var groupDiv = document.createElement('div'); groupDiv.textContent = topic.group; groupDiv.style.cssText = 'font-size:' + Math.round(11 * modalScale) + 'px;color:#4a90d9;margin-bottom:' + Math.round(4 * modalScale) + 'px;'; infoDiv.appendChild(groupDiv); }
            var titleDiv = document.createElement('div');
            titleDiv.textContent = topic.title;
            titleDiv.style.cssText = 'font-weight:bold;margin-bottom:' + Math.round(4 * modalScale) + 'px;';
            infoDiv.appendChild(titleDiv);
            if (topic.tags.length > 0) { var tagsDiv = document.createElement('div'); tagsDiv.style.cssText = 'display:flex;gap:4px;flex-wrap:wrap;'; topic.tags.forEach(function(tag) { var tagSpan = document.createElement('span'); tagSpan.textContent = tag; tagSpan.style.cssText = 'font-size:' + Math.round(10 * modalScale) + 'px;padding:2px 6px;background:' + (isDark ? '#1a1a2e' : '#f0f0f0') + ';border-radius:3px;'; tagsDiv.appendChild(tagSpan); }); infoDiv.appendChild(tagsDiv); }
            row.appendChild(infoDiv);
            var statsDiv = document.createElement('div');
            statsDiv.style.cssText = 'text-align:right;margin-left:' + Math.round(12 * modalScale) + 'px;min-width:' + Math.round(80 * modalScale) + 'px;';
            var countText = document.createElement('div');
            countText.textContent = newCount + ' сообщ.';
            countText.style.cssText = 'font-size:' + Math.round(14 * modalScale) + 'px;font-weight:bold;';
            statsDiv.appendChild(countText);
            if (diff > 0 && oldCount > 0) { var newText = document.createElement('div'); newText.textContent = '+' + diff + ' новых'; newText.style.cssText = 'font-size:' + Math.round(11 * modalScale) + 'px;color:#4CAF50;font-weight:bold;'; statsDiv.appendChild(newText); } else if (oldCount > 0) { var noNewText = document.createElement('div'); noNewText.textContent = '0 новых'; noNewText.style.cssText = 'font-size:' + Math.round(11 * modalScale) + 'px;color:' + (isDark ? '#666' : '#999') + ';'; statsDiv.appendChild(noNewText); } else { var noDataText = document.createElement('div'); noDataText.textContent = '—'; noDataText.style.cssText = 'font-size:' + Math.round(11 * modalScale) + 'px;color:' + (isDark ? '#666' : '#999') + ';'; statsDiv.appendChild(noDataText); }
            row.appendChild(statsDiv);
            row.onmouseenter = function() { if (!(diff > 0 && oldCount > 0)) { this.style.background = isDark ? '#16213e' : '#e8f4f8'; } };
            row.onmouseleave = function() { if (!(diff > 0 && oldCount > 0)) { this.style.background = ''; } };
            row.onclick = function(e) { if (e.button === 0) { location.href = topic.url; overlay.remove(); currentModal = null; } };
            row.onmousedown = function(e) { if (e.button === 1) { e.preventDefault(); window.open(topic.url, '_blank'); } };
            row.onauxclick = function(e) { if (e.button === 1) { e.preventDefault(); } };
            list.appendChild(row);
        });
        content.appendChild(list);
        saveTrackerCache(newCache);
        if (hasChanges) { highlightButton('tracker'); }
    });
}

function showNotificationsModal() {
    if (currentModal) { currentModal.remove(); currentModal = null; }
    var isDark = isDarkTheme();
    var settings = getSettings();
    var modalScale = settings.general.modalScale / 100;
    var overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.6);z-index:100002;display:flex;align-items:center;justify-content:center;';
    var modal = document.createElement('div');
    modal.style.cssText = 'background:' + (isDark ? '#0a0a14' : '#ffffff') + ';border:1px solid ' + (isDark ? '#333' : '#ccc') + ';padding:' + Math.round(24 * modalScale) + 'px;border-radius:' + Math.round(8 * modalScale) + 'px;width:' + Math.round(700 * modalScale) + 'px;max-height:80vh;color:' + (isDark ? '#ccc' : '#333') + ';font-family:Arial,sans-serif;font-size:' + Math.round(14 * modalScale) + 'px;box-shadow:0 0 30px rgba(0,0,0,' + (isDark ? '0.8' : '0.2') + ');display:flex;flex-direction:column;';
    var header = document.createElement('div');
    header.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;padding-bottom:8px;border-bottom:1px solid ' + (isDark ? '#333' : '#ccc') + ';';
    var titleEl = document.createElement('div');
    titleEl.textContent = 'Уведомления';
    titleEl.style.cssText = 'font-size:' + Math.round(16 * modalScale) + 'px;font-weight:bold;';
    header.appendChild(titleEl);
    var closeBtn = document.createElement('div');
    closeBtn.textContent = '✕';
    closeBtn.style.cssText = 'cursor:pointer;font-size:' + Math.round(18 * modalScale) + 'px;color:' + (isDark ? '#888' : '#666') + ';';
    closeBtn.onclick = function() { overlay.remove(); currentModal = null; };
    header.appendChild(closeBtn);
    modal.appendChild(header);
    var content = document.createElement('div');
    content.style.cssText = 'overflow-y:auto;flex:1;min-height:200px;text-align:center;';
    content.textContent = 'Загрузка...';
    modal.appendChild(content);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    currentModal = overlay;
    overlay.onclick = function(e) { if (e.target === overlay) { overlay.remove(); currentModal = null; } };
    fetch('https://www.linux.org.ru/notifications').then(function(r) { return r.text(); }).then(function(html) {
        var notifications = parseNotifications(html);
        content.innerHTML = '';
        content.style.textAlign = 'left';
        if (notifications.length === 0) { content.textContent = 'Нет уведомлений'; content.style.textAlign = 'center'; return; }
        var list = document.createElement('div');
        list.style.cssText = 'display:flex;flex-direction:column;gap:' + Math.round(8 * modalScale) + 'px;';
        notifications.forEach(function(notif) {
            var row = document.createElement('div');
            row.style.cssText = 'padding:' + Math.round(12 * modalScale) + 'px;border-radius:' + Math.round(4 * modalScale) + 'px;cursor:pointer;display:flex;justify-content:space-between;align-items:center;border:1px solid ' + (isDark ? '#2a2a3a' : '#e0e0e0') + ';transition:background 0.2s;';
            var infoDiv = document.createElement('div');
            infoDiv.style.cssText = 'flex:1;';
            if (notif.category) { var catDiv = document.createElement('div'); catDiv.textContent = notif.category; catDiv.style.cssText = 'font-size:' + Math.round(11 * modalScale) + 'px;color:#4a90d9;margin-bottom:' + Math.round(4 * modalScale) + 'px;'; infoDiv.appendChild(catDiv); }
            var titleDiv = document.createElement('div');
            titleDiv.textContent = notif.title;
            titleDiv.style.cssText = 'font-weight:bold;';
            infoDiv.appendChild(titleDiv);
            if (notif.tags.length > 0) { var tagsDiv = document.createElement('div'); tagsDiv.style.cssText = 'display:flex;gap:4px;flex-wrap:wrap;margin-top:' + Math.round(4 * modalScale) + 'px;'; notif.tags.forEach(function(tag) { var tagSpan = document.createElement('span'); tagSpan.textContent = tag; tagSpan.style.cssText = 'font-size:' + Math.round(10 * modalScale) + 'px;padding:2px 6px;background:' + (isDark ? '#1a1a2e' : '#f0f0f0') + ';border-radius:3px;'; tagsDiv.appendChild(tagSpan); }); infoDiv.appendChild(tagsDiv); }
            row.appendChild(infoDiv);
            if (notif.time) { var timeDiv = document.createElement('div'); timeDiv.textContent = notif.time; timeDiv.style.cssText = 'font-size:' + Math.round(12 * modalScale) + 'px;color:' + (isDark ? '#888' : '#666') + ';margin-left:' + Math.round(12 * modalScale) + 'px;white-space:nowrap;'; row.appendChild(timeDiv); }
            row.onmouseenter = function() { this.style.background = isDark ? '#16213e' : '#e8f4f8'; };
            row.onmouseleave = function() { this.style.background = ''; };
            row.onclick = function(e) { if (e.button === 0) { location.href = notif.url; overlay.remove(); currentModal = null; } };
            row.onmousedown = function(e) { if (e.button === 1) { e.preventDefault(); window.open(notif.url, '_blank'); } };
            row.onauxclick = function(e) { if (e.button === 1) { e.preventDefault(); } };
            list.appendChild(row);
        });
        content.appendChild(list);
    });
}

function updateSavedPageData() {
    var pageId = getPageIdentifier();
    var savedPages = getSavedPages();
    var foundIndex = savedPages.findIndex(function(p) { return p.url === pageId; });
    if (foundIndex !== -1) {
        currentPageSaved = true;
        var savedPosition = savedPages[foundIndex].scrollPosition;
        if (!sessionStorage.getItem('scroll_restored_' + pageId) && savedPosition > 0) {
            setTimeout(function() {
                window.scrollTo({ top: savedPosition, behavior: 'smooth' });
                sessionStorage.setItem('scroll_restored_' + pageId, 'true');
                var currentCommentCount = getCommentCount();
                var currentScrollPosition = window.pageYOffset || document.documentElement.scrollTop;
                savedPages[foundIndex].commentCount = currentCommentCount;
                savedPages[foundIndex].scrollPosition = currentScrollPosition;
                savedPages[foundIndex].lastChecked = new Date().toISOString();
                saveSavedPages(savedPages);
            }, 1500);
        } else if (sessionStorage.getItem('scroll_restored_' + pageId)) {
            var currentCommentCount = getCommentCount();
            var currentScrollPosition = window.pageYOffset || document.documentElement.scrollTop;
            savedPages[foundIndex].commentCount = currentCommentCount;
            savedPages[foundIndex].scrollPosition = currentScrollPosition;
            savedPages[foundIndex].lastChecked = new Date().toISOString();
            saveSavedPages(savedPages);
        }
    } else { currentPageSaved = false; }
}

function addCurrentPageToSaved() {
    var pageId = getPageIdentifier();
    var savedPages = getSavedPages();
    var foundIndex = savedPages.findIndex(function(p) { return p.url === pageId; });
    var title = document.title.replace(' - Linux.org.ru', '').trim();
    var currentCommentCount = getCommentCount();
    var currentScrollPosition = window.pageYOffset || document.documentElement.scrollTop;
    if (foundIndex !== -1) {
        savedPages[foundIndex].commentCount = currentCommentCount;
        savedPages[foundIndex].scrollPosition = currentScrollPosition;
        savedPages[foundIndex].lastChecked = new Date().toISOString();
        saveSavedPages(savedPages);
        currentPageSaved = true;
        flashSavedButton('↻', '#4a90d9');
        sessionStorage.removeItem('scroll_restored_' + pageId);
    } else {
        savedPages.push({ url: pageId, title: title, commentCount: currentCommentCount, scrollPosition: currentScrollPosition, lastChecked: new Date().toISOString() });
        saveSavedPages(savedPages);
        currentPageSaved = true;
        flashSavedButton('✓', '#4CAF50');
    }
}

function showSavedPagesModal() {
    if (currentModal) { currentModal.remove(); currentModal = null; }
    var isDark = isDarkTheme();
    var settings = getSettings();
    var modalScale = settings.general.modalScale / 100;
    var savedPages = getSavedPages();
    var overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.6);z-index:100003;display:flex;align-items:center;justify-content:center;';
    var modal = document.createElement('div');
    modal.style.cssText = 'background:' + (isDark ? '#0a0a14' : '#ffffff') + ';border:1px solid ' + (isDark ? '#333' : '#ccc') + ';padding:' + Math.round(24 * modalScale) + 'px;border-radius:' + Math.round(8 * modalScale) + 'px;width:' + Math.round(700 * modalScale) + 'px;max-height:80vh;color:' + (isDark ? '#ccc' : '#333') + ';font-family:Arial,sans-serif;font-size:' + Math.round(14 * modalScale) + 'px;box-shadow:0 0 30px rgba(0,0,0,' + (isDark ? '0.8' : '0.2') + ');display:flex;flex-direction:column;';
    var header = document.createElement('div');
    header.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;padding-bottom:8px;border-bottom:1px solid ' + (isDark ? '#333' : '#ccc') + ';';
    var title = document.createElement('div');
    title.textContent = 'Сохраненные страницы';
    title.style.cssText = 'font-size:' + Math.round(16 * modalScale) + 'px;font-weight:bold;';
    header.appendChild(title);
    var closeBtn = document.createElement('div');
    closeBtn.textContent = '✕';
    closeBtn.style.cssText = 'cursor:pointer;font-size:' + Math.round(18 * modalScale) + 'px;color:' + (isDark ? '#888' : '#666') + ';';
    closeBtn.onclick = function() { overlay.remove(); currentModal = null; };
    header.appendChild(closeBtn);
    modal.appendChild(header);
    var content = document.createElement('div');
    content.style.cssText = 'overflow-y:auto;flex:1;min-height:200px;';
    modal.appendChild(content);
    if (savedPages.length === 0) { content.innerHTML = '<div style="text-align:center;padding:20px;color:' + (isDark ? '#666' : '#999') + ';">Нет сохраненных страниц</div>'; }
    else {
        var list = document.createElement('div');
        list.style.cssText = 'display:flex;flex-direction:column;gap:' + Math.round(8 * modalScale) + 'px;';
        savedPages.forEach(function(page, index) {
            var row = document.createElement('div');
            row.style.cssText = 'padding:' + Math.round(12 * modalScale) + 'px;border-radius:' + Math.round(4 * modalScale) + 'px;cursor:pointer;display:flex;justify-content:space-between;align-items:center;border:1px solid ' + (isDark ? '#2a2a3a' : '#e0e0e0') + ';';
            var infoDiv = document.createElement('div');
            infoDiv.style.cssText = 'flex:1;';
            var titleDiv = document.createElement('div');
            titleDiv.textContent = page.title;
            titleDiv.style.cssText = 'font-weight:bold;margin-bottom:' + Math.round(4 * modalScale) + 'px;';
            infoDiv.appendChild(titleDiv);
            var urlDiv = document.createElement('div');
            urlDiv.textContent = page.url;
            urlDiv.style.cssText = 'font-size:' + Math.round(11 * modalScale) + 'px;color:' + (isDark ? '#666' : '#999') + ';word-break:break-all;';
            infoDiv.appendChild(urlDiv);
            row.appendChild(infoDiv);
            var countDiv = document.createElement('div');
            countDiv.style.cssText = 'text-align:right;margin-left:' + Math.round(12 * modalScale) + 'px;min-width:' + Math.round(80 * modalScale) + 'px;';
            var savedCount = document.createElement('div');
            savedCount.textContent = page.commentCount + ' сообщ.';
            savedCount.style.cssText = 'font-size:' + Math.round(13 * modalScale) + 'px;';
            countDiv.appendChild(savedCount);
            var newCountDiv = document.createElement('div');
            newCountDiv.style.cssText = 'font-size:' + Math.round(11 * modalScale) + 'px;color:#888;';
            newCountDiv.textContent = 'Проверка...';
            countDiv.appendChild(newCountDiv);
            row.appendChild(countDiv);
            fetch(page.url).then(function(r) { return r.text(); }).then(function(html) {
                var doc = new DOMParser().parseFromString(html, 'text/html');
                var currentComments = doc.querySelectorAll('article.msg');
                var diff = currentComments.length - page.commentCount;
                if (diff > 0) { row.style.background = isDark ? '#1a3a1a' : '#e8f5e8'; row.style.borderColor = '#4CAF50'; newCountDiv.textContent = '+' + diff + ' новых'; newCountDiv.style.color = '#4CAF50'; newCountDiv.style.fontWeight = 'bold'; savedCount.textContent = currentComments.length + ' сообщ.'; }
                else { newCountDiv.textContent = 'без изменений'; }
            }).catch(function() { newCountDiv.textContent = 'ошибка'; });
            row.onclick = function(e) { if (e.button === 0) { location.href = page.url; overlay.remove(); currentModal = null; } };
            row.onmousedown = function(e) { if (e.button === 1) { e.preventDefault(); window.open(page.url, '_blank'); } };
            row.onauxclick = function(e) { if (e.button === 1) { e.preventDefault(); } };
            row.oncontextmenu = function(e) { e.preventDefault(); e.stopPropagation(); if (confirm('Удалить страницу "' + page.title + '" из сохраненных?')) { savedPages.splice(index, 1); saveSavedPages(savedPages); overlay.remove(); currentModal = null; showSavedPagesModal(); } };
            list.appendChild(row);
        });
        content.appendChild(list);
    }
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    currentModal = overlay;
    overlay.onclick = function(e) { if (e.target === overlay) { overlay.remove(); currentModal = null; } };
}

function expandMobilePanel(pos) {
    if (isMobilePanelExpanded[pos]) return;
    isMobilePanelExpanded[pos] = true;
    if (mobileCollapsedContainers[pos]) mobileCollapsedContainers[pos].style.display = 'none';
    if (mobileExpandedContainers[pos]) {
        mobileExpandedContainers[pos].style.display = 'flex';
        mobileExpandedContainers[pos].scrollTop = 0;
        mobileExpandedContainers[pos].scrollLeft = 0;
    }
}

function collapseMobilePanel(pos) {
    if (!isMobilePanelExpanded[pos]) return;
    isMobilePanelExpanded[pos] = false;
    if (mobileExpandedContainers[pos]) mobileExpandedContainers[pos].style.display = 'none';
    if (mobileCollapsedContainers[pos]) mobileCollapsedContainers[pos].style.display = 'flex';
}

function createMobilePanel() {
    var settings = getSettings();
    var colors = getThemeColors();
    var mobileScale = settings.general.mobileScale / 100;
    var gap = Math.round(8 * mobileScale);
    var padding = Math.round(8 * mobileScale);

    // Очищаем старые панели
    ['right', 'left', 'top', 'bottom'].forEach(function(pos) {
        if (mobileCollapsedContainers[pos]) { mobileCollapsedContainers[pos].remove(); mobileCollapsedContainers[pos] = null; }
        if (mobileExpandedContainers[pos]) { mobileExpandedContainers[pos].remove(); mobileExpandedContainers[pos] = null; }
        isMobilePanelExpanded[pos] = false;
    });
    settingsBtn = null; addCustomBtn = null; allButtons = {};

    var buttonDefs = {
        'up': { text: '▲', title: 'Наверх', action: function() { window.scrollTo({ top: 0, behavior: 'smooth' }); }, showSettings: true },
        'forum': { text: '📋', title: 'Форум', action: function(e) { if (e && e.button === 0) location.href = 'https://www.linux.org.ru/forum/'; }, longPressAction: 'forum' },
        'tracker': { text: '☰', title: 'Трекер', action: function(e) { if (e && e.button === 0) location.href = 'https://www.linux.org.ru/tracker/'; }, longPressAction: 'tracker' },
        'notifications': { text: '🔔', title: 'Уведомления', action: function(e) { if (e && e.button === 0) location.href = 'https://www.linux.org.ru/notifications'; }, longPressAction: 'notifications' },
        'saved': { text: '💾', title: 'Сохраненные', action: function(e) { if (e && e.button === 0) showSavedPagesModal(); }, longPressAction: 'saved' },
        'myComment': { text: '💬', title: 'Мои сообщения', action: goToMyLastComment },
        'mention': { text: '📢', title: 'Упоминания', action: goToLastMention },
        'blacklist': { text: '🚫', title: 'Чёрный список', action: showBlacklistModal, longPressAction: 'blacklist' },
        'visits': { text: '🕐', title: 'Посещения', action: showVisitsModal, longPressAction: 'visits' },
        'down': { text: '▼', title: 'Вниз', action: function() { window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }); }, showSettings: true },
        'help': { text: '❓', title: 'Справка', action: function() { showHelpModal(); } }
    };

    var orderedButtons = getOrderedButtons(settings);

    // Определяем позицию профиля
    var profileConfig = settings.buttons['profile'];
    if (!profileConfig || typeof profileConfig !== 'object') {
        profileConfig = { right: true, left: false, top: false, bottom: false };
        settings.buttons['profile'] = profileConfig;
    }

    // Определяем основную позицию для мобильной панели
    var mainPosition = 'right'; // По умолчанию

    // Считаем количество кнопок на каждой позиции
    var buttonCounts = { right: 0, left: 0, top: 0, bottom: 0 };

    orderedButtons.forEach(function(btnId) {
        if (btnId === 'profile') return;
        var btnConfig = settings.buttons[btnId];
        if (btnConfig && typeof btnConfig === 'object') {
            ['right', 'left', 'top', 'bottom'].forEach(function(pos) {
                if (btnConfig[pos]) buttonCounts[pos]++;
            });
        }
    });

    // Добавляем профиль к счетчику
    if (profileConfig.right) buttonCounts.right++;
    if (profileConfig.left) buttonCounts.left++;
    if (profileConfig.top) buttonCounts.top++;
    if (profileConfig.bottom) buttonCounts.bottom++;

    // Находим позицию с максимальным количеством кнопок
    var maxCount = 0;
    ['right', 'left', 'top', 'bottom'].forEach(function(pos) {
        if (buttonCounts[pos] > maxCount) {
            maxCount = buttonCounts[pos];
            mainPosition = pos;
        }
    });

    // Если нигде нет кнопок, используем правую позицию по умолчанию
    if (maxCount === 0) {
        mainPosition = 'right';
        // Активируем профиль на правой позиции для мобильного режима
        if (!profileConfig.right) {
            settings.buttons['profile'] = { right: true, left: false, top: false, bottom: false };
            saveSettings(settings);
        }
    }

    // Создаем свернутую панель только для основной позиции
    var collapsed = document.createElement('div');
    collapsed.className = 'lor-mobile-collapsed lor-mobile-' + mainPosition;
    collapsed.style.cssText = 'position:fixed !important;z-index:9999 !important;display:flex !important;gap:' + gap + 'px !important;';

    if (settings.general.showBorder) {
        collapsed.style.border = '1px solid ' + colors.borderColor;
        collapsed.style.borderRadius = '12px';
        collapsed.style.padding = padding + 'px';
    }

    if (mainPosition === 'right' || mainPosition === 'left') {
        collapsed.style.flexDirection = 'column';
    } else {
        collapsed.style.flexDirection = 'row';
    }

    // Кнопка "Вверх"
    var upBtn = createButton('▲', 'Наверх', null, false, settings.general.mobileScale);
    upBtn.style.position = 'relative';
    upBtn.addEventListener('click', function(e) {
        if (upBtn._contextMenuJustFired) {
            e.preventDefault();
            e.stopPropagation();
            return;
        }
        window.scrollTo({ top: 0, behavior: 'smooth' });
    });
    upBtn.addEventListener('contextmenu', function(e) {
        e.preventDefault();
        e.stopPropagation();
        showExtraButtons(upBtn, mainPosition);
    });
    collapsed.appendChild(upBtn);

    // Кнопка уведомлений
    var notifBtn = createButton('🔔', 'Уведомления', null, false, settings.general.mobileScale);
    notifBtn.addEventListener('click', function(e) {
        if (notifBtn._contextMenuJustFired) {
            e.preventDefault();
            e.stopPropagation();
            return;
        }
        if (e && e.button === 0) location.href = 'https://www.linux.org.ru/notifications';
    });
    notifBtn.addEventListener('contextmenu', function(e) {
        e.preventDefault();
        e.stopPropagation();
        showNotificationsModal();
    });
    collapsed.appendChild(notifBtn);

    if (settings.buttons['notifications'] && settings.buttons['notifications'][mainPosition]) {
        updateNotificationBadge(notifBtn);
        allButtons['notifications_' + mainPosition] = notifBtn;
    }

    // Кнопка "Вниз"
    var downBtn = createButton('▼', 'Вниз', null, false, settings.general.mobileScale);
    downBtn.style.position = 'relative';
    downBtn.addEventListener('click', function(e) {
        if (downBtn._contextMenuJustFired) {
            e.preventDefault();
            e.stopPropagation();
            return;
        }
        window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
    });
    downBtn.addEventListener('contextmenu', function(e) {
        e.preventDefault();
        e.stopPropagation();
        showExtraButtons(downBtn, mainPosition);
    });
    collapsed.appendChild(downBtn);

    document.body.appendChild(collapsed);
    mobileCollapsedContainers[mainPosition] = collapsed;

    // Создаем развернутые панели для всех позиций, где есть кнопки
    ['right', 'left', 'top', 'bottom'].forEach(function(pos) {
        var hasButtons = false;
        orderedButtons.forEach(function(btnId) {
            if (btnId === 'profile') return;
            var btnConfig = settings.buttons[btnId];
            if (btnConfig && typeof btnConfig === 'object' && btnConfig[pos]) hasButtons = true;
        });

        var hasProfile = false;
        if (profileConfig && typeof profileConfig === 'object') {
            hasProfile = profileConfig[pos];
        }

        if (!hasButtons && !hasProfile) return;

        var expanded = document.createElement('div');
        expanded.className = 'lor-mobile-expanded lor-mobile-' + pos;
        expanded.style.cssText = 'position:fixed !important;z-index:9999 !important;display:none !important;gap:' + gap + 'px !important;';

        if (pos === 'right' || pos === 'left') {
            expanded.style.flexDirection = 'column';
            expanded.style.maxHeight = '70vh';
            expanded.style.overflowY = 'auto';
        } else {
            expanded.style.flexDirection = 'row';
            expanded.style.maxWidth = '90vw';
            expanded.style.overflowX = 'auto';
        }

        if (settings.general.showBorder) {
            expanded.style.border = '1px solid ' + colors.borderColor;
            expanded.style.borderRadius = '12px';
            expanded.style.padding = padding + 'px';
        }

        if (hasProfile) {
            var profileBtn = createButton('👤', 'Профиль', null, true, settings.general.mobileScale);
            profileBtn.style.position = 'relative';
            profileBtn.addEventListener('click', function(e) {
                if (profileBtn._contextMenuJustFired) {
                    e.preventDefault();
                    e.stopPropagation();
                    return;
                }
                location.href = getProfileUrl();
            });
            profileBtn.addEventListener('contextmenu', function(e) {
                e.preventDefault();
                e.stopPropagation();
                showExtraButtons(profileBtn, pos);
            });
            expanded.appendChild(profileBtn);
            allButtons['profile_' + pos] = profileBtn;
        }

        orderedButtons.forEach(function(btnId) {
            if (btnId === 'profile') return;
            var btnConfig = settings.buttons[btnId];
            if (!btnConfig || !btnConfig[pos]) return;

            var isCustom = btnId.startsWith('custom_');
            if (isCustom) {
                var customBtn = settings.customButtons.find(function(cb) { return cb.id === btnId; });
                if (customBtn) {
                    var btn = createButton(customBtn.icon, customBtn.title, function() {
                        location.href = customBtn.url;
                    }, false, settings.general.mobileScale);
                    expanded.appendChild(btn);
                    allButtons[btnId + '_' + pos] = btn;
                }
            } else if (buttonDefs[btnId]) {
                var def = buttonDefs[btnId];
                var btn = createButton(def.text, def.title, null, false, settings.general.mobileScale);
                btn.addEventListener('click', function(e) {
                    if (btn._contextMenuJustFired) {
                        e.preventDefault();
                        e.stopPropagation();
                        return;
                    }
                    def.action(e);
                });
                btn.addEventListener('contextmenu', function(e) {
                    e.preventDefault();
                    e.stopPropagation();
                    if (def.showSettings) {
                        showExtraButtons(btn, pos);
                    } else if (btnId === 'forum') {
                        showForumModal();
                    } else if (btnId === 'tracker') {
                        showTrackerModal();
                    } else if (btnId === 'notifications') {
                        showNotificationsModal();
                    } else if (btnId === 'saved') {
                        addCurrentPageToSaved();
                    } else if (btnId === 'blacklist') {
                        confirmAndAddToBlacklist();
                    } else if (btnId === 'visits') {
                        confirmAndAddToTracked();
                    }
                });
                if (def.showSettings) {
                    btn.style.position = 'relative';
                }
                expanded.appendChild(btn);
                allButtons[btnId + '_' + pos] = btn;
                if (btnId === 'notifications') {
                    updateNotificationBadge(btn);
                }
            }
        });

        document.body.appendChild(expanded);
        mobileExpandedContainers[pos] = expanded;
    });

    positionMobilePanels();

    // Обновляем уведомления
    if (settings.buttons['notifications']) {
        setInterval(function() {
            ['right', 'left', 'top', 'bottom'].forEach(function(pos) {
                var key = 'notifications_' + pos;
                if (allButtons[key]) updateNotificationBadge(allButtons[key]);
            });
        }, 5000);
    }
}

function positionMobilePanels() {
    var scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;

    // Позиции для свернутых панелей - строго по краям
    var collapsedPositions = {
        right: {
            top: '25%', // Верхняя треть экрана
            transform: 'translateY(-50%)',
            left: 'auto',
            right: '0px', // Самый край
            bottom: 'auto'
        },
        left: {
            top: '25%', // Верхняя треть экрана
            transform: 'translateY(-50%)',
            left: '0px', // Самый край
            right: 'auto',
            bottom: 'auto'
        },
        top: {
            top: '0px', // Самый верх
            transform: 'translateX(-50%)',
            left: '50%',
            right: 'auto',
            bottom: 'auto'
        },
        bottom: {
            top: 'auto',
            transform: 'translateX(-50%)',
            left: '50%',
            right: 'auto',
            bottom: '0px' // Самый низ
        }
    };

    // Позиции для развернутых панелей - стандартные с небольшим отступом
    var expandedPositions = {
        right: {
            top: '50%',
            transform: 'translateY(-50%)',
            left: 'auto',
            right: '5px', // Небольшой отступ для скроллбара
            bottom: 'auto'
        },
        left: {
            top: '50%',
            transform: 'translateY(-50%)',
            left: '5px', // Небольшой отступ
            right: 'auto',
            bottom: 'auto'
        },
        top: {
            top: '5px', // Небольшой отступ сверху
            transform: 'translateX(-50%)',
            left: '50%',
            right: 'auto',
            bottom: 'auto'
        },
        bottom: {
            top: 'auto',
            transform: 'translateX(-50%)',
            left: '50%',
            right: 'auto',
            bottom: '5px' // Небольшой отступ снизу
        }
    };

    ['right', 'left', 'top', 'bottom'].forEach(function(pos) {
        var collapsed = mobileCollapsedContainers[pos];
        var expanded = mobileExpandedContainers[pos];

        if (collapsed) {
            var posStyle = collapsedPositions[pos];
            for (var prop in posStyle) {
                collapsed.style[prop] = posStyle[prop];
            }
            // Добавляем прозрачный фон для лучшей видимости на краю
            collapsed.style.background = 'rgba(0, 0, 0, 0.3)';
            collapsed.style.backdropFilter = 'blur(5px)';
            collapsed.style.webkitBackdropFilter = 'blur(5px)';
        }

        if (expanded) {
            var expPosStyle = expandedPositions[pos];
            for (var prop in expPosStyle) {
                expanded.style[prop] = expPosStyle[prop];
            }
            // Для развернутых панелей тоже добавляем фон
            expanded.style.background = 'rgba(0, 0, 0, 0.5)';
            expanded.style.backdropFilter = 'blur(8px)';
            expanded.style.webkitBackdropFilter = 'blur(8px)';
        }
    });
}

function destroyMobilePanel() {
    ['right', 'left', 'top', 'bottom'].forEach(function(pos) {
        if (mobileCollapsedContainers[pos]) { mobileCollapsedContainers[pos].remove(); mobileCollapsedContainers[pos] = null; }
        if (mobileExpandedContainers[pos]) { mobileExpandedContainers[pos].remove(); mobileExpandedContainers[pos] = null; }
        isMobilePanelExpanded[pos] = false;
    });
}

function destroyDesktopPanel() {
    ['right', 'left', 'top', 'bottom'].forEach(function(pos) {
        if (panelContainers[pos]) { panelContainers[pos].remove(); panelContainers[pos] = null; }
    });
    settingsBtn = null; addCustomBtn = null; allButtons = {};
}

function getOrderedButtons(settings) {
    var order = settings.buttonOrder || [];
    var customIds = settings.customButtons.map(function(cb) { return cb.id; });
    var result = [];
    order.forEach(function(id) {
        if (result.indexOf(id) === -1) {
            var btnConfig = settings.buttons[id];
            if (btnConfig) {
                if (typeof btnConfig === 'object') { if (btnConfig.right || btnConfig.left || btnConfig.top || btnConfig.bottom) result.push(id); }
                else if (btnConfig) result.push(id);
            } else if (customIds.indexOf(id) !== -1) result.push(id);
        }
    });
    for (var key in settings.buttons) {
        if (result.indexOf(key) === -1) {
            var btnConfig = settings.buttons[key];
            if (btnConfig && typeof btnConfig === 'object' && (btnConfig.right || btnConfig.left || btnConfig.top || btnConfig.bottom)) result.push(key);
        }
    }
    customIds.forEach(function(id) { if (result.indexOf(id) === -1) result.push(id); });
    return result;
}

function addDesktopPanel() {
    var settings = getSettings();
    var colors = getThemeColors();
    var scale = settings.general.scale / 100;
    var scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    var gap = Math.round(8 * scale);
    var padding = Math.round(8 * scale);
    ['right', 'left', 'top', 'bottom'].forEach(function(pos) { if (panelContainers[pos]) { panelContainers[pos].remove(); panelContainers[pos] = null; } });
    settingsBtn = null; addCustomBtn = null; allButtons = {};
    var buttonDefs = {
        'up': { text: '▲', title: 'Наверх', action: function() { window.scrollTo({ top: 0, behavior: 'smooth' }); }, showSettings: true },
        'forum': { text: '📋', title: 'Форум', action: function(e) { if (e && e.button === 0) location.href = 'https://www.linux.org.ru/forum/'; }, longPressAction: 'forum' },
        'tracker': { text: '☰', title: 'Трекер', action: function(e) { if (e && e.button === 0) location.href = 'https://www.linux.org.ru/tracker/'; }, longPressAction: 'tracker' },
        'notifications': { text: '🔔', title: 'Уведомления', action: function(e) { if (e && e.button === 0) location.href = 'https://www.linux.org.ru/notifications'; }, longPressAction: 'notifications' },
        'saved': { text: '💾', title: 'Сохраненные', action: function(e) { if (e && e.button === 0) showSavedPagesModal(); }, longPressAction: 'saved' },
        'myComment': { text: '💬', title: 'Мои сообщения', action: goToMyLastComment },
        'mention': { text: '📢', title: 'Упоминания', action: goToLastMention },
        'blacklist': { text: '🚫', title: 'Чёрный список', action: showBlacklistModal, longPressAction: 'blacklist' },
        'visits': { text: '🕐', title: 'Посещения', action: showVisitsModal, longPressAction: 'visits' },
        'down': { text: '▼', title: 'Вниз', action: function() { window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }); }, showSettings: true },
        'help': { text: '❓', title: 'Справка', action: function() { showHelpModal(); } }
    };
    var orderedButtons = getOrderedButtons(settings);
    var profileConfig = settings.buttons['profile'];
    if (!profileConfig || typeof profileConfig !== 'object') { profileConfig = { right: true, left: false, top: false, bottom: false }; settings.buttons['profile'] = profileConfig; }
    var profilePosition = 'right';
    ['right', 'left', 'top', 'bottom'].forEach(function(pos) { if (profileConfig[pos]) profilePosition = pos; });
    var positions = {
        right: { top: '50%', transform: 'translateY(-50%)', left: 'auto', right: (scrollbarWidth + 20) + 'px', bottom: 'auto', flexDirection: 'column' },
        left: { top: '50%', transform: 'translateY(-50%)', left: '20px', right: 'auto', bottom: 'auto', flexDirection: 'column' },
        top: { top: '20px', transform: 'translateX(-50%)', left: '50%', right: 'auto', bottom: 'auto', flexDirection: 'row' },
        bottom: { top: 'auto', transform: 'translateX(-50%)', left: '50%', right: 'auto', bottom: '20px', flexDirection: 'row' }
    };
    ['right', 'left', 'top', 'bottom'].forEach(function(pos) {
        var hasButtons = false;
        orderedButtons.forEach(function(btnId) { if (btnId === 'profile') return; var btnConfig = settings.buttons[btnId]; if (btnConfig && typeof btnConfig === 'object' && btnConfig[pos]) hasButtons = true; });
        var hasProfile = (pos === profilePosition);
        if (!hasButtons && !hasProfile) return;
        var posStyle = positions[pos];
        var container = document.createElement('div');
        container.className = 'lor-panel-container lor-panel-' + pos;
        container.style.cssText = 'position:fixed !important;z-index:9999 !important;display:flex !important;gap:' + gap + 'px !important;top:' + posStyle.top + ';transform:' + posStyle.transform + ';left:' + posStyle.left + ';right:' + posStyle.right + ';bottom:' + posStyle.bottom + ';flex-direction:' + posStyle.flexDirection + ';';
        if (settings.general.showBorder) { container.style.border = '1px solid ' + colors.borderColor; container.style.borderRadius = '12px'; container.style.padding = padding + 'px'; }
        if (hasProfile) {
            var profileBtn = createButton('👤', 'Профиль', null, true, settings.general.scale);
            profileBtn.style.position = 'relative';
            profileBtn.addEventListener('click', function(e) { if (profileBtn._contextMenuJustFired) { e.preventDefault(); e.stopPropagation(); return; } location.href = getProfileUrl(); });
            profileBtn.addEventListener('contextmenu', function(e) { e.preventDefault(); e.stopPropagation(); showExtraButtons(profileBtn, pos); });
            container.appendChild(profileBtn);
            allButtons['profile_' + pos] = profileBtn;
        }
        orderedButtons.forEach(function(btnId) {
            if (btnId === 'profile') return;
            var btnConfig = settings.buttons[btnId];
            if (!btnConfig || !btnConfig[pos]) return;
            var isCustom = btnId.startsWith('custom_');
            if (isCustom) {
                var customBtn = settings.customButtons.find(function(cb) { return cb.id === btnId; });
                if (customBtn) {
                    var btn = createButton(customBtn.icon, customBtn.title, function() { location.href = customBtn.url; }, false, settings.general.scale);
                    container.appendChild(btn);
                    allButtons[btnId + '_' + pos] = btn;
                }
            } else if (buttonDefs[btnId]) {
                var def = buttonDefs[btnId];
                var btn = createButton(def.text, def.title, null, false, settings.general.scale);
                btn.addEventListener('click', function(e) { if (btn._contextMenuJustFired) { e.preventDefault(); e.stopPropagation(); return; } def.action(e); });
                btn.addEventListener('contextmenu', function(e) { e.preventDefault(); e.stopPropagation(); if (def.showSettings) { showExtraButtons(btn, pos); } else if (btnId === 'forum') { showForumModal(); } else if (btnId === 'tracker') { showTrackerModal(); } else if (btnId === 'notifications') { showNotificationsModal(); } else if (btnId === 'saved') { addCurrentPageToSaved(); } else if (btnId === 'blacklist') { confirmAndAddToBlacklist(); } else if (btnId === 'visits') { confirmAndAddToTracked(); } });
                if (def.showSettings) { btn.style.position = 'relative'; }
                container.appendChild(btn);
                allButtons[btnId + '_' + pos] = btn;
                if (btnId === 'notifications') { updateNotificationBadge(btn); }
            }
        });
        document.body.appendChild(container);
        panelContainers[pos] = container;
    });
    if (settings.buttons['notifications']) { setInterval(function() { ['right', 'left', 'top', 'bottom'].forEach(function(pos) { var key = 'notifications_' + pos; if (allButtons[key]) updateNotificationBadge(allButtons[key]); }); }, 5000); }
    window.addEventListener('scroll', function() { clearTimeout(scrollTimer); scrollTimer = setTimeout(saveScrollPosition, 2000); });
    initTrackerPage();
}

function rebuildPanel() {
    destroyDesktopPanel();
    destroyMobilePanel();
    var settings = getSettings();
    if (settings.general.mobileView) createMobilePanel(); else addDesktopPanel();
}

document.addEventListener('click', function(e) {
    var shouldHide = true;
    if (settingsBtn && settingsBtn.contains(e.target)) shouldHide = false;
    if (addCustomBtn && addCustomBtn.contains(e.target)) shouldHide = false;
    if (shouldHide) hideExtraButtons();
});

function isTrackerPage() { return location.href.match(/\/tracker\/?$/) !== null; }

function updateTrackerTable() {
    if (trackerTableUpdated) return;
    var table = document.querySelector('table.message-table');
    if (!table) return;
    if (!location.href.match(/\/tracker\/?$/)) return;
    var oldCache = getTrackerCache();
    var hasChanges = false;
    var now = Date.now();
    var oneDay = 24 * 60 * 60 * 1000;
    var cleanedCache = {};
    for (var url in oldCache) {
        var cachedData = oldCache[url];
        if (cachedData && typeof cachedData === 'object') {
            var age = now - cachedData.date;
            if (age <= oneDay) cleanedCache[url] = cachedData;
        }
    }
    var headerRow = table.querySelector('thead tr');
    if (headerRow && !headerRow.querySelector('.lor-new-comments-col')) {
        var th = document.createElement('th');
        th.className = 'lor-new-comments-col';
        th.textContent = 'Новых';
        th.style.cssText = 'text-align:center;color:#4CAF50;';
        headerRow.appendChild(th);
    }
    var rows = table.querySelectorAll('tbody tr');
    rows.forEach(function(row) {
        if (row.querySelector('th')) return;
        var cells = row.querySelectorAll('td');
        if (cells.length < 4) return;
        var topicLink = cells[1].querySelector('a');
        if (!topicLink) return;
        var cleanUrl = topicLink.href.replace(/[?&]lastmod=\d+/g, '');
        var currentCount = parseInt(cells[3].textContent.trim()) || 0;
        var cachedData = cleanedCache[cleanUrl];
        var wasInCache = cachedData && typeof cachedData === 'object';
        var oldCount = wasInCache ? cachedData.count : 0;
        var diff = currentCount - oldCount;
        var existingCol = row.querySelector('.lor-new-comments-col');
        if (existingCol) existingCol.remove();
        var td = document.createElement('td');
        td.className = 'lor-new-comments-col';
        td.style.cssText = 'text-align:center;font-weight:bold;';
        if (!wasInCache) { td.textContent = currentCount; td.style.color = '#4a90d9'; td.title = 'Новая тема (всего сообщений: ' + currentCount + ')'; }
        else if (diff > 0) { td.textContent = '+' + diff; td.style.color = '#4CAF50'; td.style.background = 'rgba(76,175,80,0.15)'; td.style.borderRadius = '3px'; td.title = 'Было: ' + oldCount + ', стало: ' + currentCount; hasChanges = true; }
        else if (diff === 0) { td.textContent = '0'; td.style.color = '#888'; td.title = 'Было: ' + oldCount + ', стало: ' + currentCount + ' (без изменений)'; }
        else { td.textContent = diff; td.style.color = '#ff6666'; td.title = 'Было: ' + oldCount + ', стало: ' + currentCount; }
        row.appendChild(td);
    });
    rows.forEach(function(row) {
        if (row.querySelector('th')) return;
        var cells = row.querySelectorAll('td');
        if (cells.length < 4) return;
        var topicLink = cells[1].querySelector('a');
        if (!topicLink) return;
        var cleanUrl = topicLink.href.replace(/[?&]lastmod=\d+/g, '');
        var currentCount = parseInt(cells[3].textContent.trim()) || 0;
        cleanedCache[cleanUrl] = { count: currentCount, date: now };
    });
    saveTrackerCache(cleanedCache);
    trackerTableUpdated = true;
    if (hasChanges) highlightButton('tracker');
}

function initTrackerPage() {
    if (isTrackerPage() && !trackerTableUpdated) {
        setTimeout(function() { if (document.querySelector('table.message-table tbody tr')) updateTrackerTable(); }, 100);
    }
}

window.addEventListener('load', function() {
    pageLoadTime = Date.now();
    setTimeout(scrollToLastMod, 1000);
    setTimeout(updateSavedPageData, 1500);
    setTimeout(makeReplyNicksClickable, 2000);
});

window.addEventListener('resize', function() { var settings = getSettings(); if (settings.general.mobileView) positionMobilePanels(); });
window.addEventListener('orientationchange', function() { setTimeout(function() { var settings = getSettings(); if (settings.general.mobileView) positionMobilePanels(); }, 300); });

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
        setTimeout(function() { rebuildPanel(); }, 500);
        setTimeout(function() { updateSavedPageData(); }, 800);
        setTimeout(function() { makeReplyNicksClickable(); }, 1000);
    });
} else {
    setTimeout(function() { rebuildPanel(); }, 500);
    setTimeout(function() { updateSavedPageData(); }, 800);
    setTimeout(function() { makeReplyNicksClickable(); }, 1000);
}

var attempts = 0;
var interval = setInterval(function() {
    if (document.body) {
        clearInterval(interval);
        rebuildPanel();
        updateSavedPageData();
        makeReplyNicksClickable();
    }
    if (++attempts > 20) clearInterval(interval);
}, 250);

var domObserver = new MutationObserver(function(mutations) {
    var hasNewContent = false;
    mutations.forEach(function(mutation) {
        if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
            for (var i = 0; i < mutation.addedNodes.length; i++) {
                var node = mutation.addedNodes[i];
                if (node.nodeType === 1) {
                    if (node.querySelectorAll && node.querySelectorAll('article.msg div.title').length > 0) {
                        hasNewContent = true;
                    }
                    if (node.classList && (node.classList.contains('msg') || node.querySelector('.title'))) {
                        hasNewContent = true;
                    }
                }
            }
        }
    });
    if (hasNewContent) {
        setTimeout(makeReplyNicksClickable, 500);
    }
});
domObserver.observe(document.body || document.documentElement, { childList: true, subtree: true });

document.addEventListener('touchstart', function(e) {
    if (e.touches.length === 1) {
        touchStartY = e.touches[0].clientY;
        touchStartX = e.touches[0].clientX;
        touchMoved = false;
        var target = e.target;
        var isInPanel = false;
        ['right', 'left', 'top', 'bottom'].forEach(function(pos) {
            if (mobileCollapsedContainers[pos] && mobileCollapsedContainers[pos].contains(target)) isInPanel = true;
            if (mobileExpandedContainers[pos] && mobileExpandedContainers[pos].contains(target)) isInPanel = true;
        });
        e.target._touchInPanel = isInPanel;
    }
}, { passive: true });

document.addEventListener('touchmove', function(e) {
    if (e.touches.length === 1) {
        var deltaY = e.touches[0].clientY - touchStartY;
        var deltaX = e.touches[0].clientX - touchStartX;
        if (Math.abs(deltaY) > 10 || Math.abs(deltaX) > 10) touchMoved = true;
        if (e.target._touchInPanel && Math.abs(deltaY) > Math.abs(deltaX)) e.preventDefault();
    }
}, { passive: false });

document.addEventListener('touchend', function(e) {
    if (!touchMoved) return;
    var settings = getSettings();
    if (!settings.general.mobileView) { touchMoved = false; return; }
    var deltaY = (e.changedTouches[0] ? e.changedTouches[0].clientY : touchStartY) - touchStartY;
    var target = e.target;
    ['right', 'left', 'top', 'bottom'].forEach(function(pos) {
        var isInPanel = false;
        if (mobileCollapsedContainers[pos] && mobileCollapsedContainers[pos].contains(target)) isInPanel = true;
        if (mobileExpandedContainers[pos] && mobileExpandedContainers[pos].contains(target)) isInPanel = true;
        if (isInPanel) {
            if (deltaY > SWIPE_THRESHOLD) expandMobilePanel(pos);
            else if (deltaY < -SWIPE_THRESHOLD) collapseMobilePanel(pos);
        }
    });
    touchMoved = false;
});

})();