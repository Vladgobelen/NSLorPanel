// ==UserScript==
// @name         LOR News Filter
// @namespace    test
// @match        *://www.linux.org.ru/*
// @grant        none
// @inject-into  content
// @run-at       document-idle
// ==/UserScript==

(function() {
    'use strict';

    var currentOffset = 0;
    var PAGE_SIZE = 20;
    var isLoading = false;
    var noMoreNews = false;
    var anchorParent = null;
    var anchorNext = null;
    var newsInitialized = false;
    var loadedIds = {};
    var panelContainer = null;
    var settingsBtn = null;
    var allButtons = {};
    var currentModal = null;
    var scrollTimer = null;
    var currentPageSaved = false;

    function getDefaultSettings() {
        return {
            general: {
                showBorder: false,
                scale: 100,
                modalScale: 100
            },
            buttons: {
                up: true,
                forum: true,
                tracker: true,
                notifications: true,
                saved: true,
                myComment: true,
                mention: true,
                blacklist: true,
                down: true
            }
        };
    }

    function getSettings() {
        try {
            var saved = JSON.parse(localStorage.getItem('lor_panel_settings'));
            if (saved && typeof saved === 'object') {
                var defaults = getDefaultSettings();
                if (!saved.general) saved.general = defaults.general;
                if (!saved.buttons) saved.buttons = defaults.buttons;
                if (saved.general.showBorder === undefined) saved.general.showBorder = defaults.general.showBorder;
                if (!saved.general.scale || saved.general.scale < 30 || saved.general.scale > 200) saved.general.scale = defaults.general.scale;
                if (!saved.general.modalScale || saved.general.modalScale < 30 || saved.general.modalScale > 200) saved.general.modalScale = defaults.general.modalScale;
                for (var key in defaults.buttons) {
                    if (saved.buttons[key] === undefined) saved.buttons[key] = defaults.buttons[key];
                }
                return saved;
            }
        } catch(e) {}
        return getDefaultSettings();
    }

    function saveSettings(settings) {
        localStorage.setItem('lor_panel_settings', JSON.stringify(settings));
    }

    function getBlacklist() {
        try { return JSON.parse(localStorage.getItem('lor_blacklist') || '[]'); } catch(e) { return []; }
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
        } else alert('Ваших комментариев на этой странице нет.');
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
        } else alert('Упоминаний вас на этой странице нет.');
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
        var scale = settings.general.scale / 100;
        var fontSize = Math.round(24 * scale);
        btn.style.fontSize = count > 0 ? Math.round(28 * scale) + 'px' : fontSize + 'px';
        btn.style.fontWeight = 'bold';
    }

    function getCommentCount() {
        var comments = document.querySelectorAll('article.msg');
        return comments.length;
    }

    function getPageIdentifier() {
        var url = window.location.href;
        var cleanUrl = url.replace(/[?&](lastmod|page)=\d+/g, '');
        return cleanUrl;
    }

    function isTopicPage() {
        return window.location.href.match(/\/(news|forum|tracker)\/.*\/comments/) !== null ||
               window.location.href.match(/\/news\/.*\/page\d+/) !== null;
    }

    function updateSavedPageData() {
        if (!isTopicPage()) {
            currentPageSaved = false;
            return;
        }

        var pageId = getPageIdentifier();
        var savedPages = getSavedPages();
        var found = savedPages.find(function(p) { return p.url === pageId; });

        if (found) {
            currentPageSaved = true;
            found.scrollPosition = window.pageYOffset || document.documentElement.scrollTop;
            found.commentCount = getCommentCount();
            found.lastChecked = new Date().toISOString();
            saveSavedPages(savedPages);

            if (found.scrollPosition > 0 && !sessionStorage.getItem('scroll_restored_' + pageId)) {
                setTimeout(function() {
                    window.scrollTo({ top: found.scrollPosition, behavior: 'smooth' });
                    sessionStorage.setItem('scroll_restored_' + pageId, 'true');
                }, 1000);
            }
        } else {
            currentPageSaved = false;
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
                localStorage.setItem('lor_blacklist', JSON.stringify(blacklist));
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
                localStorage.setItem('lor_blacklist', JSON.stringify(blacklist));
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

    function saveAnchor() {
        var existing = document.querySelectorAll('article.news, article.mini-news');
        if (existing.length > 0) {
            var last = existing[existing.length - 1];
            anchorParent = last.parentNode;
            anchorNext = last.nextSibling;
        } else {
            anchorParent = document.querySelector('#bd');
            anchorNext = null;
        }
    }

    function appendArticles(articles) {
        saveAnchor();
        if (!anchorParent) return;
        articles.forEach(function(art) {
            if (art.id && loadedIds[art.id]) return;
            if (art.id) loadedIds[art.id] = true;
            var clone = document.importNode(art, true);
            if (anchorNext) {
                anchorParent.insertBefore(clone, anchorNext);
            } else {
                anchorParent.appendChild(clone);
            }
        });
    }

    function loadNextPage() {
        if (isLoading || noMoreNews) return;
        isLoading = true;
        fetch('https://www.linux.org.ru/news/?offset=' + currentOffset)
            .then(function(r) { return r.text(); })
            .then(function(html) {
                var doc = new DOMParser().parseFromString(html, 'text/html');
                var articles = doc.querySelectorAll('article.news, article.mini-news');
                if (articles.length === 0) { noMoreNews = true; isLoading = false; return; }
                var blacklist = getBlacklist();
                var miniToCheck = [];
                var regular = [];
                articles.forEach(function(art) {
                    if (art.classList.contains('mini-news')) {
                        miniToCheck.push(art);
                    } else {
                        var author = art.querySelector('.sign a[href*="/people/"]');
                        if (author && blacklist.indexOf(author.textContent.trim()) !== -1) return;
                        regular.push(art);
                    }
                });
                appendArticles(regular);
                currentOffset += PAGE_SIZE;
                if (miniToCheck.length === 0) { isLoading = false; return; }
                var checked = 0;
                var approvedMini = [];
                miniToCheck.forEach(function(mini) {
                    var link = mini.querySelector('a[href*="/news/"]');
                    if (!link) { checked++; if (checked >= miniToCheck.length) done(); return; }
                    fetch(link.href)
                        .then(function(r) { return r.text(); })
                        .then(function(html2) {
                            var doc2 = new DOMParser().parseFromString(html2, 'text/html');
                            var author = doc2.querySelector('.sign a[href*="/people/"]');
                            if (!author || blacklist.indexOf(author.textContent.trim()) === -1) {
                                approvedMini.push(mini);
                            }
                            checked++;
                            if (checked >= miniToCheck.length) done();
                        });
                });
                function done() {
                    appendArticles(approvedMini);
                    isLoading = false;
                }
            });
    }

    function onScroll() {
        if (isLoading || noMoreNews) return;
        var articles = document.querySelectorAll('article.news, article.mini-news');
        if (articles.length === 0) return;
        var trigger = articles[Math.floor(articles.length * 0.6)];
        if (!trigger) return;
        var rect = trigger.getBoundingClientRect();
        if (rect.top < window.innerHeight) loadNextPage();

        clearTimeout(scrollTimer);
        scrollTimer = setTimeout(updateSavedPageData, 1000);
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

    function showSettingsModal() {
        if (document.getElementById('lor-settings-overlay')) return;
        var settings = getSettings();
        var isDark = isDarkTheme();
        var modalScale = settings.general.modalScale / 100;

        var overlay = document.createElement('div');
        overlay.id = 'lor-settings-overlay';
        overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:' + (isDark ? 'rgba(0,0,0,0.7)' : 'rgba(0,0,0,0.3)') + ';z-index:100000;display:flex;align-items:center;justify-content:center;';

        var modal = document.createElement('div');
        modal.style.cssText = 'background:' + (isDark ? '#0a0a14' : '#ffffff') + ';border:1px solid ' + (isDark ? '#333' : '#ccc') + ';padding:' + Math.round(24 * modalScale) + 'px;border-radius:' + Math.round(8 * modalScale) + 'px;width:' + Math.round(460 * modalScale) + 'px;color:' + (isDark ? '#ccc' : '#333') + ';font-family:Arial,sans-serif;font-size:' + Math.round(14 * modalScale) + 'px;box-shadow:0 0 30px rgba(0,0,0,' + (isDark ? '0.8' : '0.2') + ');';

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

        var tabHelp = document.createElement('div');
        tabHelp.id = 'lor-settings-tab-help';
        tabHelp.textContent = 'Справка';
        tabHelp.style.cssText = 'padding:8px 16px;cursor:pointer;border-bottom:2px solid transparent;color:' + (isDark ? '#888' : '#666') + ';font-size:' + Math.round(14 * modalScale) + 'px;';
        tabs.appendChild(tabHelp);

        modal.appendChild(tabs);

        var content = document.createElement('div');
        content.id = 'lor-settings-tab-content';
        content.style.cssText = 'min-height:200px;max-height:60vh;overflow-y:auto;';
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

            for (var ms = 30; ms <= 200; ms += 10) {
                var mopt = document.createElement('option');
                mopt.value = ms;
                mopt.textContent = ms + '%';
                if (settings.general.modalScale === ms) mopt.selected = true;
                modalScaleSelect.appendChild(mopt);
            }

            modalScaleLabel.appendChild(modalScaleSelect);
            modalScaleDiv.appendChild(modalScaleLabel);
            content.appendChild(modalScaleDiv);
        }

        function renderButtonsTab() {
            content.innerHTML = '';
            var btnNames = {
                up: '▲ Наверх',
                forum: '📋 Форум',
                tracker: '☰ Трекер',
                notifications: '🔔 Уведомления',
                saved: '💾 Сохраненные',
                myComment: '💬 Мои сообщения',
                mention: '📢 Упоминания',
                blacklist: '🚫 Чёрный список',
                down: '▼ Вниз'
            };

            for (var key in btnNames) {
                var div = document.createElement('div');
                div.style.cssText = 'margin-bottom:10px;';

                var label = document.createElement('label');
                label.style.cssText = 'display:flex;align-items:center;gap:8px;cursor:pointer;';

                var cb = document.createElement('input');
                cb.type = 'checkbox';
                cb.className = 'lor-setting-btn';
                cb.setAttribute('data-key', key);
                cb.checked = settings.buttons[key];
                cb.style.cssText = 'width:16px;height:16px;';
                label.appendChild(cb);

                var span = document.createElement('span');
                span.textContent = btnNames[key];
                label.appendChild(span);

                div.appendChild(label);
                content.appendChild(div);
            }
        }

        function renderHelpTab() {
            content.innerHTML = '';

            var helpSections = [
                {
                    title: '📋 Кнопка "Форум"',
                    content: '<b>ЛКМ:</b> Переход на главную страницу форума.<br>' +
                             '<b>ПКМ:</b> Открывает модальное окно со списком разделов форума. ' +
                             'Для каждого раздела показывается количество новых тем за сутки. ' +
                             'Если количество изменилось по сравнению с предыдущей проверкой, ' +
                             'раздел подсвечивается зелёным и показывает количество новых тем.<br>' +
                             '<b>ЛКМ по разделу:</b> Переход в раздел.<br>' +
                             '<b>Колесо по разделу:</b> Открыть раздел в новой вкладке.'
                },
                {
                    title: '☰ Кнопка "Трекер"',
                    content: '<b>ЛКМ:</b> Переход на главную страницу трекера.<br>' +
                             '<b>ПКМ:</b> Открывает модальное окно со списком последних тем трекера. ' +
                             'Для каждой темы показывается количество сообщений. ' +
                             'Если количество изменилось, тема подсвечивается зелёным ' +
                             'и показывает количество новых сообщений.<br>' +
                             '<b>ЛКМ по теме:</b> Переход в тему.<br>' +
                             '<b>Колесо по теме:</b> Открыть тему в новой вкладке.'
                },
                {
                    title: '🔔 Кнопка "Уведомления"',
                    content: '<b>ЛКМ:</b> Переход на страницу уведомлений.<br>' +
                             '<b>ПКМ:</b> Открывает модальное окно со списком всех уведомлений. ' +
                             'Показываются категории (Новости, Форум, Трекер), теги и время.<br>' +
                             '<b>ЛКМ по уведомлению:</b> Переход по ссылке.<br>' +
                             '<b>Колесо по уведомлению:</b> Открыть в новой вкладке.<br>' +
                             '<b>Цифра на кнопке:</b> Количество непрочитанных уведомлений.'
                },
                {
                    title: '💾 Кнопка "Сохраненные"',
                    content: '<b>ЛКМ:</b> Открывает модальное окно со списком сохранённых страниц. ' +
                             'Для каждой страницы автоматически проверяется наличие новых комментариев. ' +
                             'При обнаружении новых комментариев страница подсвечивается зелёным ' +
                             'и показывает количество новых сообщений.<br>' +
                             '<b>ПКМ:</b> Сохраняет текущую страницу. Запоминается URL, заголовок, ' +
                             'количество комментариев и позиция скролла. ' +
                             'При повторном заходе на сохранённую страницу автоматически ' +
                             'восстанавливается позиция скролла.<br>' +
                             '<b>ЛКМ по сохранённой странице:</b> Переход на страницу.<br>' +
                             '<b>Колесо по сохранённой странице:</b> Открыть в новой вкладке.<br>' +
                             '<b>ПКМ по сохранённой странице:</b> Удалить из списка.'
                },
                {
                    title: '💬 Кнопка "Мои сообщения"',
                    content: '<b>ЛКМ:</b> Прокручивает страницу к вашему последнему комментарию ' +
                             'и подсвечивает его синей рамкой на 3 секунды.'
                },
                {
                    title: '📢 Кнопка "Упоминания"',
                    content: '<b>ЛКМ:</b> Прокручивает страницу к последнему упоминанию вашего ника ' +
                             'и подсвечивает его оранжевой рамкой на 3 секунды.'
                },
                {
                    title: '🚫 Кнопка "Чёрный список"',
                    content: '<b>ЛКМ:</b> Открывает модальное окно управления чёрным списком авторов. ' +
                             'Можно добавлять и удалять ники. Все новости и мини-новости от авторов ' +
                             'из чёрного списка автоматически скрываются.'
                },
                {
                    title: '👤 Кнопка "Профиль"',
                    content: '<b>ЛКМ:</b> Переход в ваш профиль.<br>' +
                             '<b>ПКМ:</b> Показывает кнопку настроек (⚙).'
                },
                {
                    title: '⚙ Настройки',
                    content: 'Кнопка настроек появляется при ПКМ на кнопку профиля. ' +
                             'В настройках можно:<br>' +
                             '• Включить/отключить отображение рамки панели<br>' +
                             '• Настроить масштаб панели (30-200%)<br>' +
                             '• Настроить масштаб модальных окон (30-200%)<br>' +
                             '• Выбрать, какие кнопки отображать на панели'
                },
                {
                    title: '📰 Бесконечная лента новостей',
                    content: 'На странице новостей автоматически подгружаются следующие страницы ' +
                             'при прокрутке вниз. Новости от авторов из чёрного списка скрываются. ' +
                             'Для мини-новостей выполняется проверка автора через загрузку полной новости.'
                },
                {
                    title: '🎨 Темы оформления',
                    content: 'Панель и все модальные окна автоматически подстраиваются под текущую ' +
                             'тему сайта (black, tango, tango-light, white2, waltz, zomg_ponies). ' +
                             'Цвета фона, текста и границ соответствуют выбранной теме.'
                }
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
            footerHelp.textContent = 'NSLorPanel v1.0 • Все данные хранятся в localStorage вашего браузера';
            content.appendChild(footerHelp);
        }

        renderGeneralTab();

        tabGeneral.onclick = function() {
            currentTab = 'general';
            tabGeneral.style.borderBottomColor = '#4a90d9';
            tabGeneral.style.color = '#4a90d9';
            tabGeneral.style.fontWeight = 'bold';
            tabButtons.style.borderBottomColor = 'transparent';
            tabButtons.style.color = isDark ? '#888' : '#666';
            tabButtons.style.fontWeight = 'normal';
            tabHelp.style.borderBottomColor = 'transparent';
            tabHelp.style.color = isDark ? '#888' : '#666';
            tabHelp.style.fontWeight = 'normal';
            renderGeneralTab();
        };

        tabButtons.onclick = function() {
            currentTab = 'buttons';
            tabButtons.style.borderBottomColor = '#4a90d9';
            tabButtons.style.color = '#4a90d9';
            tabButtons.style.fontWeight = 'bold';
            tabGeneral.style.borderBottomColor = 'transparent';
            tabGeneral.style.color = isDark ? '#888' : '#666';
            tabGeneral.style.fontWeight = 'normal';
            tabHelp.style.borderBottomColor = 'transparent';
            tabHelp.style.color = isDark ? '#888' : '#666';
            tabHelp.style.fontWeight = 'normal';
            renderButtonsTab();
        };

        tabHelp.onclick = function() {
            currentTab = 'help';
            tabHelp.style.borderBottomColor = '#4a90d9';
            tabHelp.style.color = '#4a90d9';
            tabHelp.style.fontWeight = 'bold';
            tabGeneral.style.borderBottomColor = 'transparent';
            tabGeneral.style.color = isDark ? '#888' : '#666';
            tabGeneral.style.fontWeight = 'normal';
            tabButtons.style.borderBottomColor = 'transparent';
            tabButtons.style.color = isDark ? '#888' : '#666';
            tabButtons.style.fontWeight = 'normal';
            renderHelpTab();
        };

        saveBtn.onclick = function() {
            var borderCheck = document.getElementById('lor-setting-border');
            var scaleSelect = document.getElementById('lor-setting-scale');
            var modalScaleSelect = document.getElementById('lor-setting-modal-scale');

            if (borderCheck) settings.general.showBorder = borderCheck.checked;
            if (scaleSelect) {
                var val = parseInt(scaleSelect.value);
                if (val >= 30 && val <= 200) settings.general.scale = val;
            }
            if (modalScaleSelect) {
                var mval = parseInt(modalScaleSelect.value);
                if (mval >= 30 && mval <= 200) settings.general.modalScale = mval;
            }

            if (currentTab === 'buttons' || document.querySelector('.lor-setting-btn')) {
                var btnChecks = document.querySelectorAll('.lor-setting-btn');
                btnChecks.forEach(function(cb) {
                    settings.buttons[cb.getAttribute('data-key')] = cb.checked;
                });
            }

            saveSettings(settings);
            overlay.remove();
            rebuildPanel();
        };

        cancelBtn.onclick = function() {
            overlay.remove();
        };

        overlay.onclick = function(e) {
            if (e.target === overlay) overlay.remove();
        };
    }

    function hideSettingsButton() {
        if (settingsBtn) {
            settingsBtn.style.opacity = '0';
            settingsBtn.style.pointerEvents = 'none';
        }
    }

    function showSettingsButton(profileBtn) {
        if (!settingsBtn) {
            settingsBtn = document.createElement('div');
            settingsBtn.textContent = '⚙';
            settingsBtn.title = 'Настройки';
            var colors = getThemeColors();
            var settings = getSettings();
            var scale = settings.general.scale / 100;
            var size = Math.round(40 * scale);
            var fontSize = Math.round(20 * scale);
            settingsBtn.style.cssText = 'position:absolute;right:calc(100% + 10px);top:50%;transform:translateY(-50%);width:' + size + 'px;height:' + size + 'px;background:' + colors.btnBg + ';color:' + colors.btnColor + ';border-radius:50%;display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:' + fontSize + 'px;z-index:10001;transition:opacity 0.2s;';
            settingsBtn.onmouseenter = function() {
                this.style.background = colors.btnBgHover;
            };
            settingsBtn.onmouseleave = function() {
                this.style.background = colors.btnBg;
            };
            settingsBtn.onclick = function(e) {
                e.stopPropagation();
                e.preventDefault();
                showSettingsModal();
                hideSettingsButton();
            };
            profileBtn.style.position = 'relative';
            profileBtn.appendChild(settingsBtn);
        }
        settingsBtn.style.opacity = '1';
        settingsBtn.style.pointerEvents = 'auto';
    }

    function createButton(text, title, callback, marginBottom) {
        var settings = getSettings();
        var colors = getThemeColors();
        var scale = settings.general.scale / 100;
        var size = Math.round(54 * scale);
        var fontSize = Math.round(24 * scale);

        var btn = document.createElement('div');
        btn.textContent = text;
        btn.title = title;
        btn.style.cssText = 'width:' + size + 'px;height:' + size + 'px;background:' + colors.btnBg + ';color:' + colors.btnColor + ';border-radius:50%;display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:' + fontSize + 'px;user-select:none;opacity:0.7;position:relative;' + (marginBottom ? 'margin-bottom:30px;' : '');
        btn.onmouseenter = function() { this.style.opacity = '1'; this.style.background = colors.btnBgHover; };
        btn.onmouseleave = function() { this.style.opacity = '0.7'; this.style.background = colors.btnBg; };
        btn.onclick = callback;
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

                sections.push({
                    url: href,
                    title: link.textContent.trim(),
                    description: parent ? (parent.querySelector('em') ? parent.querySelector('em').textContent : '') : '',
                    dailyCount: count
                });
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
                    cells[1].querySelectorAll('.tag').forEach(function(tag) {
                        tags.push(tag.textContent.trim());
                    });

                    var fullTitle = topicLink.textContent.trim();
                    var titleParts = fullTitle.split('\n').map(function(p) { return p.trim(); }).filter(function(p) { return p; });
                    var mainTitle = titleParts[titleParts.length - 1] || fullTitle;

                    topics.push({
                        url: topicLink.href,
                        title: mainTitle,
                        tags: tags,
                        group: groupLink ? groupLink.textContent.trim() : cells[0].textContent.trim(),
                        messageCount: count
                    });
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
                link.querySelectorAll('.tag').forEach(function(tag) {
                    tags.push(tag.textContent.trim());
                });

                var fullText = row.textContent.trim();
                var categoryMatch = fullText.match(/\((Новости|Форум|Трекер|Галерея|Статьи)\)/);
                var category = categoryMatch ? categoryMatch[1] : '';

                notifications.push({
                    url: link.href,
                    title: link.textContent.trim(),
                    tags: tags,
                    category: category,
                    time: timeEl ? timeEl.textContent.trim() : ''
                });
            }
        });

        return notifications;
    }

    function showForumModal() {
        if (currentModal) {
            currentModal.remove();
            currentModal = null;
        }

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

        overlay.onclick = function(e) {
            if (e.target === overlay) {
                overlay.remove();
                currentModal = null;
            }
        };

        fetch('https://www.linux.org.ru/forum/')
            .then(function(r) { return r.text(); })
            .then(function(html) {
                var sections = parseForumSections(html);
                var cache = getForumCache();
                var hasChanges = false;

                content.innerHTML = '';
                content.style.textAlign = 'left';

                if (sections.length === 0) {
                    content.textContent = 'Не удалось загрузить разделы';
                    content.style.textAlign = 'center';
                    return;
                }

                var list = document.createElement('div');
                list.style.cssText = 'display:flex;flex-direction:column;gap:' + Math.round(8 * modalScale) + 'px;';

                sections.forEach(function(section) {
                    var row = document.createElement('div');
                    var oldCount = cache[section.url] || 0;
                    var newCount = section.dailyCount;
                    var diff = newCount - oldCount;

                    if (diff > 0) {
                        hasChanges = true;
                        row.style.background = isDark ? '#1a3a1a' : '#e8f5e8';
                        row.style.borderColor = '#4CAF50';
                    }

                    row.style.cssText = 'padding:' + Math.round(12 * modalScale) + 'px;border-radius:' + Math.round(4 * modalScale) + 'px;cursor:pointer;display:flex;justify-content:space-between;align-items:center;border:1px solid ' + (isDark ? '#2a2a3a' : '#e0e0e0') + ';transition:background 0.2s;';

                    var infoDiv = document.createElement('div');
                    infoDiv.style.cssText = 'flex:1;';

                    var titleDiv = document.createElement('div');
                    titleDiv.textContent = section.title;
                    titleDiv.style.cssText = 'font-weight:bold;margin-bottom:' + Math.round(4 * modalScale) + 'px;';
                    infoDiv.appendChild(titleDiv);

                    if (section.description) {
                        var descDiv = document.createElement('div');
                        descDiv.textContent = section.description;
                        descDiv.style.cssText = 'font-size:' + Math.round(12 * modalScale) + 'px;color:' + (isDark ? '#888' : '#666') + ';';
                        infoDiv.appendChild(descDiv);
                    }

                    row.appendChild(infoDiv);

                    var countDiv = document.createElement('div');
                    countDiv.style.cssText = 'text-align:right;margin-left:' + Math.round(12 * modalScale) + 'px;';

                    var countText = document.createElement('div');
                    countText.textContent = newCount + ' за сутки';
                    countText.style.cssText = 'font-size:' + Math.round(14 * modalScale) + 'px;font-weight:bold;';
                    countDiv.appendChild(countText);

                    if (diff > 0) {
                        var newText = document.createElement('div');
                        newText.textContent = '+' + diff + ' новых';
                        newText.style.cssText = 'font-size:' + Math.round(11 * modalScale) + 'px;color:#4CAF50;font-weight:bold;';
                        countDiv.appendChild(newText);
                    }

                    row.appendChild(countDiv);

                    row.onmouseenter = function() {
                        if (!diff > 0) {
                            this.style.background = isDark ? '#16213e' : '#e8f4f8';
                        }
                    };
                    row.onmouseleave = function() {
                        if (!diff > 0) {
                            this.style.background = '';
                        }
                    };

                    row.onclick = function(e) {
                        if (e.button === 0) {
                            location.href = section.url;
                            overlay.remove();
                            currentModal = null;
                        }
                    };

                    row.onmousedown = function(e) {
                        if (e.button === 1) {
                            e.preventDefault();
                            window.open(section.url, '_blank');
                        }
                    };

                    row.onauxclick = function(e) {
                        if (e.button === 1) {
                            e.preventDefault();
                        }
                    };

                    cache[section.url] = newCount;

                    list.appendChild(row);
                });

                content.appendChild(list);

                saveForumCache(cache);

                if (hasChanges && allButtons['forum']) {
                    allButtons['forum'].style.background = '#4CAF50';
                    setTimeout(function() {
                        if (allButtons['forum']) {
                            var colors = getThemeColors();
                            allButtons['forum'].style.background = colors.btnBg;
                        }
                    }, 3000);
                }
            });
    }

    function showTrackerModal() {
        if (currentModal) {
            currentModal.remove();
            currentModal = null;
        }

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

        overlay.onclick = function(e) {
            if (e.target === overlay) {
                overlay.remove();
                currentModal = null;
            }
        };

        fetch('https://www.linux.org.ru/tracker/')
            .then(function(r) { return r.text(); })
            .then(function(html) {
                var topics = parseTrackerTopics(html);
                var cache = getTrackerCache();
                var hasChanges = false;

                content.innerHTML = '';
                content.style.textAlign = 'left';

                if (topics.length === 0) {
                    content.textContent = 'Не удалось загрузить темы';
                    content.style.textAlign = 'center';
                    return;
                }

                var list = document.createElement('div');
                list.style.cssText = 'display:flex;flex-direction:column;gap:' + Math.round(8 * modalScale) + 'px;';

                topics.forEach(function(topic) {
                    var row = document.createElement('div');
                    var cleanUrl = topic.url.replace(/[?&]lastmod=\d+/g, '');
                    var oldCount = cache[cleanUrl] || 0;
                    var newCount = topic.messageCount;
                    var diff = newCount - oldCount;

                    if (diff > 0 && oldCount > 0) {
                        hasChanges = true;
                        row.style.background = isDark ? '#1a3a1a' : '#e8f5e8';
                        row.style.borderColor = '#4CAF50';
                    }

                    row.style.cssText = 'padding:' + Math.round(12 * modalScale) + 'px;border-radius:' + Math.round(4 * modalScale) + 'px;cursor:pointer;display:flex;justify-content:space-between;align-items:center;border:1px solid ' + (isDark ? '#2a2a3a' : '#e0e0e0') + ';transition:background 0.2s;';

                    var infoDiv = document.createElement('div');
                    infoDiv.style.cssText = 'flex:1;';

                    if (topic.group) {
                        var groupDiv = document.createElement('div');
                        groupDiv.textContent = topic.group;
                        groupDiv.style.cssText = 'font-size:' + Math.round(11 * modalScale) + 'px;color:#4a90d9;margin-bottom:' + Math.round(4 * modalScale) + 'px;';
                        infoDiv.appendChild(groupDiv);
                    }

                    var titleDiv = document.createElement('div');
                    titleDiv.textContent = topic.title;
                    titleDiv.style.cssText = 'font-weight:bold;margin-bottom:' + Math.round(4 * modalScale) + 'px;';
                    infoDiv.appendChild(titleDiv);

                    if (topic.tags.length > 0) {
                        var tagsDiv = document.createElement('div');
                        tagsDiv.style.cssText = 'display:flex;gap:4px;flex-wrap:wrap;';
                        topic.tags.forEach(function(tag) {
                            var tagSpan = document.createElement('span');
                            tagSpan.textContent = tag;
                            tagSpan.style.cssText = 'font-size:' + Math.round(10 * modalScale) + 'px;padding:2px 6px;background:' + (isDark ? '#1a1a2e' : '#f0f0f0') + ';border-radius:3px;';
                            tagsDiv.appendChild(tagSpan);
                        });
                        infoDiv.appendChild(tagsDiv);
                    }

                    row.appendChild(infoDiv);

                    var countDiv = document.createElement('div');
                    countDiv.style.cssText = 'text-align:right;margin-left:' + Math.round(12 * modalScale) + 'px;min-width:' + Math.round(60 * modalScale) + 'px;';

                    var countText = document.createElement('div');
                    countText.textContent = newCount + ' сообщ.';
                    countText.style.cssText = 'font-size:' + Math.round(14 * modalScale) + 'px;font-weight:bold;';
                    countDiv.appendChild(countText);

                    if (diff > 0 && oldCount > 0) {
                        var newText = document.createElement('div');
                        newText.textContent = '+' + diff + ' новых';
                        newText.style.cssText = 'font-size:' + Math.round(11 * modalScale) + 'px;color:#4CAF50;font-weight:bold;';
                        countDiv.appendChild(newText);
                    }

                    row.appendChild(countDiv);

                    row.onmouseenter = function() {
                        if (!(diff > 0 && oldCount > 0)) {
                            this.style.background = isDark ? '#16213e' : '#e8f4f8';
                        }
                    };
                    row.onmouseleave = function() {
                        if (!(diff > 0 && oldCount > 0)) {
                            this.style.background = '';
                        }
                    };

                    row.onclick = function(e) {
                        if (e.button === 0) {
                            location.href = topic.url;
                            overlay.remove();
                            currentModal = null;
                        }
                    };

                    row.onmousedown = function(e) {
                        if (e.button === 1) {
                            e.preventDefault();
                            window.open(topic.url, '_blank');
                        }
                    };

                    row.onauxclick = function(e) {
                        if (e.button === 1) {
                            e.preventDefault();
                        }
                    };

                    cache[cleanUrl] = newCount;

                    list.appendChild(row);
                });

                content.appendChild(list);

                saveTrackerCache(cache);

                if (hasChanges && allButtons['tracker']) {
                    allButtons['tracker'].style.background = '#4CAF50';
                    setTimeout(function() {
                        if (allButtons['tracker']) {
                            var colors = getThemeColors();
                            allButtons['tracker'].style.background = colors.btnBg;
                        }
                    }, 3000);
                }
            });
    }

    function showNotificationsModal() {
        if (currentModal) {
            currentModal.remove();
            currentModal = null;
        }

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

        overlay.onclick = function(e) {
            if (e.target === overlay) {
                overlay.remove();
                currentModal = null;
            }
        };

        fetch('https://www.linux.org.ru/notifications')
            .then(function(r) { return r.text(); })
            .then(function(html) {
                var notifications = parseNotifications(html);

                content.innerHTML = '';
                content.style.textAlign = 'left';

                if (notifications.length === 0) {
                    content.textContent = 'Нет уведомлений';
                    content.style.textAlign = 'center';
                    return;
                }

                var list = document.createElement('div');
                list.style.cssText = 'display:flex;flex-direction:column;gap:' + Math.round(8 * modalScale) + 'px;';

                notifications.forEach(function(notif) {
                    var row = document.createElement('div');
                    row.style.cssText = 'padding:' + Math.round(12 * modalScale) + 'px;border-radius:' + Math.round(4 * modalScale) + 'px;cursor:pointer;display:flex;justify-content:space-between;align-items:center;border:1px solid ' + (isDark ? '#2a2a3a' : '#e0e0e0') + ';transition:background 0.2s;';

                    var infoDiv = document.createElement('div');
                    infoDiv.style.cssText = 'flex:1;';

                    if (notif.category) {
                        var catDiv = document.createElement('div');
                        catDiv.textContent = notif.category;
                        catDiv.style.cssText = 'font-size:' + Math.round(11 * modalScale) + 'px;color:#4a90d9;margin-bottom:' + Math.round(4 * modalScale) + 'px;';
                        infoDiv.appendChild(catDiv);
                    }

                    var titleDiv = document.createElement('div');
                    titleDiv.textContent = notif.title;
                    titleDiv.style.cssText = 'font-weight:bold;';
                    infoDiv.appendChild(titleDiv);

                    if (notif.tags.length > 0) {
                        var tagsDiv = document.createElement('div');
                        tagsDiv.style.cssText = 'display:flex;gap:4px;flex-wrap:wrap;margin-top:' + Math.round(4 * modalScale) + 'px;';
                        notif.tags.forEach(function(tag) {
                            var tagSpan = document.createElement('span');
                            tagSpan.textContent = tag;
                            tagSpan.style.cssText = 'font-size:' + Math.round(10 * modalScale) + 'px;padding:2px 6px;background:' + (isDark ? '#1a1a2e' : '#f0f0f0') + ';border-radius:3px;';
                            tagsDiv.appendChild(tagSpan);
                        });
                        infoDiv.appendChild(tagsDiv);
                    }

                    row.appendChild(infoDiv);

                    if (notif.time) {
                        var timeDiv = document.createElement('div');
                        timeDiv.textContent = notif.time;
                        timeDiv.style.cssText = 'font-size:' + Math.round(12 * modalScale) + 'px;color:' + (isDark ? '#888' : '#666') + ';margin-left:' + Math.round(12 * modalScale) + 'px;white-space:nowrap;';
                        row.appendChild(timeDiv);
                    }

                    row.onmouseenter = function() {
                        this.style.background = isDark ? '#16213e' : '#e8f4f8';
                    };
                    row.onmouseleave = function() {
                        this.style.background = '';
                    };

                    row.onclick = function(e) {
                        if (e.button === 0) {
                            location.href = notif.url;
                            overlay.remove();
                            currentModal = null;
                        }
                    };

                    row.onmousedown = function(e) {
                        if (e.button === 1) {
                            e.preventDefault();
                            window.open(notif.url, '_blank');
                        }
                    };

                    row.onauxclick = function(e) {
                        if (e.button === 1) {
                            e.preventDefault();
                        }
                    };

                    list.appendChild(row);
                });

                content.appendChild(list);
            });
    }

    function updateSavedPageData() {
        if (!isTopicPage()) {
            currentPageSaved = false;
            return;
        }

        var pageId = getPageIdentifier();
        var savedPages = getSavedPages();
        var foundIndex = savedPages.findIndex(function(p) { return p.url === pageId; });

        if (foundIndex !== -1) {
            currentPageSaved = true;
            var currentCommentCount = getCommentCount();
            var currentScrollPosition = window.pageYOffset || document.documentElement.scrollTop;

            // Автоматически обновляем данные при заходе на сохраненную страницу
            savedPages[foundIndex].commentCount = currentCommentCount;
            savedPages[foundIndex].scrollPosition = currentScrollPosition;
            savedPages[foundIndex].lastChecked = new Date().toISOString();
            saveSavedPages(savedPages);

            // Восстанавливаем позицию скролла при первом заходе
            if (!sessionStorage.getItem('scroll_restored_' + pageId)) {
                var savedPosition = savedPages[foundIndex].scrollPosition;
                if (savedPosition > 0) {
                    setTimeout(function() {
                        window.scrollTo({ top: savedPosition, behavior: 'smooth' });
                        sessionStorage.setItem('scroll_restored_' + pageId, 'true');
                    }, 1000);
                } else {
                    sessionStorage.setItem('scroll_restored_' + pageId, 'true');
                }
            }
        } else {
            currentPageSaved = false;
        }
    }

    function addCurrentPageToSaved() {
        var currentUrl = window.location.href;
        var pageId = getPageIdentifier();
        var savedPages = getSavedPages();
        var foundIndex = savedPages.findIndex(function(p) { return p.url === pageId; });

        var title = document.title || currentUrl;
        title = title.replace(' - Linux.org.ru', '').trim();
        var currentCommentCount = getCommentCount();
        var currentScrollPosition = window.pageYOffset || document.documentElement.scrollTop;

        var savedBtn = allButtons['saved'];

        if (foundIndex !== -1) {
            // Обновляем существующую
            savedPages[foundIndex].commentCount = currentCommentCount;
            savedPages[foundIndex].scrollPosition = currentScrollPosition;
            savedPages[foundIndex].lastChecked = new Date().toISOString();
            saveSavedPages(savedPages);
            currentPageSaved = true;

            if (savedBtn) {
                var originalText = savedBtn.textContent;
                savedBtn.textContent = '↻';
                savedBtn.style.color = '#4a90d9';
                setTimeout(function() {
                    savedBtn.textContent = originalText;
                    savedBtn.style.color = '';
                }, 1500);
            }

            sessionStorage.removeItem('scroll_restored_' + pageId);
        } else {
            // Добавляем новую
            savedPages.push({
                url: pageId,
                title: title,
                commentCount: currentCommentCount,
                scrollPosition: currentScrollPosition,
                lastChecked: new Date().toISOString()
            });

            saveSavedPages(savedPages);
            currentPageSaved = true;

            if (savedBtn) {
                var originalText = savedBtn.textContent;
                savedBtn.textContent = '✓';
                savedBtn.style.color = '#4CAF50';
                setTimeout(function() {
                    savedBtn.textContent = originalText;
                    savedBtn.style.color = '';
                }, 1500);
            }

            sessionStorage.removeItem('scroll_restored_' + pageId);
        }
    }

    function showSavedPagesModal() {
        if (currentModal) {
            currentModal.remove();
            currentModal = null;
        }

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

        if (savedPages.length === 0) {
            content.innerHTML = '<div style="text-align:center;padding:20px;color:' + (isDark ? '#666' : '#999') + ';">Нет сохраненных страниц</div>';
        } else {
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

                fetch(page.url)
                    .then(function(r) { return r.text(); })
                    .then(function(html) {
                        var doc = new DOMParser().parseFromString(html, 'text/html');
                        var currentComments = doc.querySelectorAll('article.msg');
                        var diff = currentComments.length - page.commentCount;

                        if (diff > 0) {
                            row.style.background = isDark ? '#1a3a1a' : '#e8f5e8';
                            row.style.borderColor = '#4CAF50';
                            newCountDiv.textContent = '+' + diff + ' новых';
                            newCountDiv.style.color = '#4CAF50';
                            newCountDiv.style.fontWeight = 'bold';
                            savedCount.textContent = currentComments.length + ' сообщ.';
                        } else {
                            newCountDiv.textContent = 'без изменений';
                        }
                    })
                    .catch(function() {
                        newCountDiv.textContent = 'ошибка';
                    });

                row.onclick = function(e) {
                    if (e.button === 0) {
                        location.href = page.url;
                        overlay.remove();
                        currentModal = null;
                    }
                };

                row.onmousedown = function(e) {
                    if (e.button === 1) {
                        e.preventDefault();
                        window.open(page.url, '_blank');
                    }
                };

                row.onauxclick = function(e) {
                    if (e.button === 1) {
                        e.preventDefault();
                    }
                };

                row.oncontextmenu = function(e) {
                    e.preventDefault();
                    e.stopPropagation();

                    if (confirm('Удалить страницу "' + page.title + '" из сохраненных?')) {
                        savedPages.splice(index, 1);
                        saveSavedPages(savedPages);
                        overlay.remove();
                        currentModal = null;
                        showSavedPagesModal();
                    }
                };

                list.appendChild(row);
            });

            content.appendChild(list);
        }

        overlay.appendChild(modal);
        document.body.appendChild(overlay);
        currentModal = overlay;

        overlay.onclick = function(e) {
            if (e.target === overlay) {
                overlay.remove();
                currentModal = null;
            }
        };
    }

    function rebuildPanel() {
        if (panelContainer) {
            panelContainer.remove();
            panelContainer = null;
            settingsBtn = null;
            allButtons = {};
        }
        addPanel();
    }

    function addPanel() {
        if (document.querySelector('.lor-panel-container')) return;
        var settings = getSettings();
        var colors = getThemeColors();
        var scale = settings.general.scale / 100;
        var scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
        var gap = Math.round(8 * scale);
        var padding = Math.round(8 * scale);

        panelContainer = document.createElement('div');
        panelContainer.className = 'lor-panel-container';
        panelContainer.style.cssText = 'position:fixed !important;top:50% !important;transform:translateY(-50%) !important;z-index:9999 !important;display:flex !important;flex-direction:column !important;gap:' + gap + 'px !important;right:' + (scrollbarWidth + 20) + 'px !important;' +
            (settings.general.showBorder ? 'border:1px solid ' + colors.borderColor + ';border-radius:12px;padding:' + padding + 'px;' : '');

        var profileBtn = createButton('👤', 'Профиль', function(e) {
            location.href = getProfileUrl();
        }, true);
        profileBtn.addEventListener('contextmenu', function(e) {
            e.preventDefault();
            e.stopPropagation();
            showSettingsButton(profileBtn);
        });
        panelContainer.appendChild(profileBtn);
        allButtons['profile'] = profileBtn;

        var buttonDefs = [
            { key: 'up', text: '▲', title: 'Наверх', action: function() { window.scrollTo({ top: 0, behavior: 'smooth' }); } },
            { key: 'forum', text: '📋', title: 'Форум (ПКМ - разделы)', action: function(e) {
                if (e && e.button === 0) location.href = 'https://www.linux.org.ru/forum/';
            }},
            { key: 'tracker', text: '☰', title: 'Трекер (ПКМ - темы)', action: function(e) {
                if (e && e.button === 0) location.href = 'https://www.linux.org.ru/tracker/';
            }},
            { key: 'notifications', text: '🔔', title: 'Уведомления (ПКМ - список)', action: function(e) {
                if (e && e.button === 0) location.href = 'https://www.linux.org.ru/notifications';
            }},
            { key: 'saved', text: '💾', title: 'Сохраненные (ПКМ - сохранить страницу)', action: function(e) {
                if (e && e.button === 0) showSavedPagesModal();
            }},
            { key: 'myComment', text: '💬', title: 'К моему последнему сообщению', action: goToMyLastComment },
            { key: 'mention', text: '📢', title: 'К последнему упоминанию меня', action: goToLastMention },
            { key: 'blacklist', text: '🚫', title: 'Чёрный список', action: showBlacklistModal },
            { key: 'down', text: '▼', title: 'Вниз', action: function() { window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }); } }
        ];

        buttonDefs.forEach(function(def) {
            if (settings.buttons[def.key]) {
                var btn = createButton(def.text, def.title, function(e) {
                    if (def.key === 'forum' || def.key === 'tracker' || def.key === 'notifications') {
                        if (e && e.button === 0) def.action(e);
                    } else if (def.key === 'saved') {
                        def.action(e);
                    } else {
                        def.action(e);
                    }
                }, false);

                if (def.key === 'forum') {
                    btn.addEventListener('contextmenu', function(e) {
                        e.preventDefault();
                        e.stopPropagation();
                        showForumModal();
                    });
                }

                if (def.key === 'tracker') {
                    btn.addEventListener('contextmenu', function(e) {
                        e.preventDefault();
                        e.stopPropagation();
                        showTrackerModal();
                    });
                }

                if (def.key === 'notifications') {
                    btn.addEventListener('contextmenu', function(e) {
                        e.preventDefault();
                        e.stopPropagation();
                        showNotificationsModal();
                    });
                }

                if (def.key === 'saved') {
                    btn.addEventListener('contextmenu', function(e) {
                        e.preventDefault();
                        e.stopPropagation();
                        addCurrentPageToSaved();
                    });
                }

                panelContainer.appendChild(btn);
                allButtons[def.key] = btn;
                if (def.key === 'notifications') {
                    updateNotificationBadge(btn);
                }
            }
        });

        document.body.appendChild(panelContainer);

        if (settings.buttons['notifications'] && allButtons['notifications']) {
            setInterval(function() {
                if (allButtons['notifications']) {
                    updateNotificationBadge(allButtons['notifications']);
                }
            }, 5000);
        }
    }

    document.addEventListener('click', function(e) {
        if (settingsBtn && !settingsBtn.contains(e.target)) {
            hideSettingsButton();
        }
    });

    function isNewsPage() {
        return location.pathname === '/news/' || location.pathname === '/news';
    }

    function initNewsPage() {
        if (newsInitialized) return;
        if (!isNewsPage()) return;
        var blacklist = getBlacklist();
        if (blacklist.length === 0) return;
        newsInitialized = true;

        var existing = document.querySelectorAll('article.news, article.mini-news');
        existing.forEach(function(art) {
            if (art.id) loadedIds[art.id] = true;
        });

        document.querySelectorAll('article.news').forEach(function(art) {
            var a = art.querySelector('.sign a[href*="/people/"]');
            if (a && blacklist.indexOf(a.textContent.trim()) !== -1) {
                art.remove();
            }
        });

        document.querySelectorAll('article.mini-news').forEach(function(mini) {
            var link = mini.querySelector('a[href*="/news/"]');
            if (!link) return;
            fetch(link.href)
                .then(function(r) { return r.text(); })
                .then(function(html) {
                    var doc = new DOMParser().parseFromString(html, 'text/html');
                    var author = doc.querySelector('.sign a[href*="/people/"]');
                    if (author && blacklist.indexOf(author.textContent.trim()) !== -1) {
                        mini.remove();
                    }
                });
        });

        currentOffset = PAGE_SIZE;
        saveAnchor();
        loadNextPage();
        window.addEventListener('scroll', onScroll);
    }

    window.addEventListener('load', function() {
        setTimeout(scrollToLastMod, 1000);
        setTimeout(updateSavedPageData, 1500);
    });

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() {
            setTimeout(addPanel, 500);
            setTimeout(function() {
                if (!newsInitialized) initNewsPage();
                updateSavedPageData();
            }, 800);
        });
    } else {
        setTimeout(addPanel, 500);
        setTimeout(function() {
            if (!newsInitialized) initNewsPage();
            updateSavedPageData();
        }, 800);
    }

    var attempts = 0;
    var interval = setInterval(function() {
        if (document.body) {
            clearInterval(interval);
            addPanel();
            if (!newsInitialized) initNewsPage();
            updateSavedPageData();
        }
        if (++attempts > 20) clearInterval(interval);
    }, 250);

})();