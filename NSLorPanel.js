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

    function getDefaultSettings() {
        return {
            general: {
                showBorder: false,
                scale: 100
            },
            buttons: {
                up: true,
                forum: true,
                tracker: true,
                notifications: true,
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
                if (!saved.general.scale || saved.general.scale < 30 || saved.general.scale > 150) saved.general.scale = defaults.general.scale;
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

    function showBlacklistModal() {
        if (document.getElementById('lor-blacklist-overlay')) return;
        var isDark = isDarkTheme();
        var overlay = document.createElement('div');
        overlay.id = 'lor-blacklist-overlay';
        overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.6);z-index:99999;display:flex;align-items:center;justify-content:center;';
        var modal = document.createElement('div');
        modal.style.cssText = 'background:' + (isDark ? '#0a0a14' : '#ffffff') + ';border:1px solid ' + (isDark ? '#333' : '#ccc') + ';padding:24px;border-radius:8px;width:420px;color:' + (isDark ? '#ccc' : '#333') + ';font-family:Arial,sans-serif;font-size:14px;box-shadow:0 0 20px rgba(0,0,0,' + (isDark ? '0.8' : '0.2') + ');';
        modal.innerHTML = '<div style="font-size:16px;font-weight:bold;margin-bottom:16px;padding-bottom:8px;border-bottom:1px solid ' + (isDark ? '#333' : '#ccc') + ';">Чёрный список авторов</div>' +
            '<div style="margin-bottom:12px;"><input type="text" id="lor-blacklist-input" placeholder="Введите ник автора" style="width:100%;padding:8px 10px;background:' + (isDark ? '#111' : '#f5f5f5') + ';color:' + (isDark ? '#ccc' : '#333') + ';border:1px solid ' + (isDark ? '#444' : '#ccc') + ';border-radius:4px;font-size:14px;box-sizing:border-box;"></div>' +
            '<div style="display:flex;gap:8px;margin-bottom:16px;"><button id="lor-blacklist-add" style="padding:8px 16px;background:#0a3d6b;color:#ddd;border:1px solid #1a5a9a;border-radius:4px;cursor:pointer;font-size:13px;">Добавить</button><button id="lor-blacklist-remove" style="padding:8px 16px;background:#5a1a1a;color:#ddd;border:1px solid #8a2a2a;border-radius:4px;cursor:pointer;font-size:13px;">Исключить</button></div>' +
            '<div style="font-size:13px;color:' + (isDark ? '#888' : '#666') + ';margin-bottom:6px;">Авторы в списке:</div>' +
            '<ul id="lor-blacklist-list" style="list-style:none;padding:0;margin:0 0 16px 0;max-height:200px;overflow-y:auto;background:' + (isDark ? '#0d0d1a' : '#f9f9f9') + ';border:1px solid ' + (isDark ? '#2a2a3a' : '#e0e0e0') + ';border-radius:4px;"></ul>' +
            '<div style="text-align:right;"><button id="lor-blacklist-close" style="padding:8px 20px;background:' + (isDark ? '#2a2a3a' : '#e0e0e0') + ';color:' + (isDark ? '#aaa' : '#666') + ';border:1px solid ' + (isDark ? '#444' : '#ccc') + ';border-radius:4px;cursor:pointer;font-size:13px;">Закрыть</button></div>';
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

        var overlay = document.createElement('div');
        overlay.id = 'lor-settings-overlay';
        overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:' + (isDark ? 'rgba(0,0,0,0.7)' : 'rgba(0,0,0,0.3)') + ';z-index:100000;display:flex;align-items:center;justify-content:center;';

        var modal = document.createElement('div');
        modal.style.cssText = 'background:' + (isDark ? '#0a0a14' : '#ffffff') + ';border:1px solid ' + (isDark ? '#333' : '#ccc') + ';padding:24px;border-radius:8px;width:460px;color:' + (isDark ? '#ccc' : '#333') + ';font-family:Arial,sans-serif;font-size:14px;box-shadow:0 0 30px rgba(0,0,0,' + (isDark ? '0.8' : '0.2') + ');';

        var title = document.createElement('div');
        title.style.cssText = 'font-size:18px;font-weight:bold;margin-bottom:16px;padding-bottom:8px;border-bottom:1px solid ' + (isDark ? '#333' : '#ccc') + ';';
        title.textContent = 'Настройки панели';
        modal.appendChild(title);

        var tabs = document.createElement('div');
        tabs.style.cssText = 'display:flex;gap:0;margin-bottom:16px;border-bottom:1px solid ' + (isDark ? '#333' : '#ccc') + ';';

        var tabGeneral = document.createElement('div');
        tabGeneral.id = 'lor-settings-tab-general';
        tabGeneral.textContent = 'Общие';
        tabGeneral.style.cssText = 'padding:8px 16px;cursor:pointer;border-bottom:2px solid #4a90d9;color:#4a90d9;font-weight:bold;';
        tabs.appendChild(tabGeneral);

        var tabButtons = document.createElement('div');
        tabButtons.id = 'lor-settings-tab-buttons';
        tabButtons.textContent = 'Кнопки';
        tabButtons.style.cssText = 'padding:8px 16px;cursor:pointer;border-bottom:2px solid transparent;color:' + (isDark ? '#888' : '#666') + ';';
        tabs.appendChild(tabButtons);

        modal.appendChild(tabs);

        var content = document.createElement('div');
        content.id = 'lor-settings-tab-content';
        content.style.cssText = 'min-height:200px;';
        modal.appendChild(content);

        var footer = document.createElement('div');
        footer.style.cssText = 'text-align:right;margin-top:16px;padding-top:12px;border-top:1px solid ' + (isDark ? '#333' : '#ccc') + ';';

        var saveBtn = document.createElement('button');
        saveBtn.id = 'lor-settings-save';
        saveBtn.textContent = 'Сохранить';
        saveBtn.style.cssText = 'padding:8px 20px;background:#0a3d6b;color:#ddd;border:1px solid #1a5a9a;border-radius:4px;cursor:pointer;font-size:13px;margin-right:8px;';
        footer.appendChild(saveBtn);

        var cancelBtn = document.createElement('button');
        cancelBtn.id = 'lor-settings-cancel';
        cancelBtn.textContent = 'Отмена';
        cancelBtn.style.cssText = 'padding:8px 20px;background:' + (isDark ? '#2a2a3a' : '#e0e0e0') + ';color:' + (isDark ? '#aaa' : '#666') + ';border:1px solid ' + (isDark ? '#444' : '#ccc') + ';border-radius:4px;cursor:pointer;font-size:13px;';
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
            scaleLabel.style.cssText = 'display:flex;align-items:center;gap:8px;';

            var scaleText = document.createElement('span');
            scaleText.textContent = 'Масштаб панели:';
            scaleLabel.appendChild(scaleText);

            var scaleSelect = document.createElement('select');
            scaleSelect.id = 'lor-setting-scale';
            scaleSelect.style.cssText = 'padding:6px 10px;background:' + (isDark ? '#111' : '#f5f5f5') + ';color:' + (isDark ? '#ccc' : '#333') + ';border:1px solid ' + (isDark ? '#444' : '#ccc') + ';border-radius:4px;font-size:14px;';

            for (var s = 30; s <= 150; s += 10) {
                var opt = document.createElement('option');
                opt.value = s;
                opt.textContent = s + '%';
                if (settings.general.scale === s) opt.selected = true;
                scaleSelect.appendChild(opt);
            }

            scaleLabel.appendChild(scaleSelect);
            scaleDiv.appendChild(scaleLabel);
            content.appendChild(scaleDiv);
        }

        function renderButtonsTab() {
            content.innerHTML = '';
            var btnNames = {
                up: '▲ Наверх',
                forum: '📋 Форум',
                tracker: '☰ Трекер',
                notifications: '🔔 Уведомления',
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

        renderGeneralTab();

        tabGeneral.onclick = function() {
            currentTab = 'general';
            tabGeneral.style.borderBottomColor = '#4a90d9';
            tabGeneral.style.color = '#4a90d9';
            tabGeneral.style.fontWeight = 'bold';
            tabButtons.style.borderBottomColor = 'transparent';
            tabButtons.style.color = isDark ? '#888' : '#666';
            tabButtons.style.fontWeight = 'normal';
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
            renderButtonsTab();
        };

        saveBtn.onclick = function() {
            var borderCheck = document.getElementById('lor-setting-border');
            var scaleSelect = document.getElementById('lor-setting-scale');

            if (borderCheck) settings.general.showBorder = borderCheck.checked;
            if (scaleSelect) {
                var val = parseInt(scaleSelect.value);
                if (val >= 30 && val <= 150) settings.general.scale = val;
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
            { key: 'forum', text: '📋', title: 'Форум', action: function() { location.href = 'https://www.linux.org.ru/forum/'; } },
            { key: 'tracker', text: '☰', title: 'Трекер', action: function() { location.href = 'https://www.linux.org.ru/tracker/'; } },
            { key: 'notifications', text: '🔔', title: 'Уведомления', action: function() { location.href = 'https://www.linux.org.ru/notifications'; } },
            { key: 'myComment', text: '💬', title: 'К моему последнему сообщению', action: goToMyLastComment },
            { key: 'mention', text: '📢', title: 'К последнему упоминанию меня', action: goToLastMention },
            { key: 'blacklist', text: '🚫', title: 'Чёрный список', action: showBlacklistModal },
            { key: 'down', text: '▼', title: 'Вниз', action: function() { window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }); } }
        ];

        buttonDefs.forEach(function(def) {
            if (settings.buttons[def.key]) {
                var btn = createButton(def.text, def.title, def.action, false);
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
    });

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() {
            setTimeout(addPanel, 500);
            setTimeout(function() { if (!newsInitialized) initNewsPage(); }, 800;)
        });
    } else {
        setTimeout(addPanel, 500);
        setTimeout(function() { if (!newsInitialized) initNewsPage(); }, 800);
    }

    var attempts = 0;
    var interval = setInterval(function() {
        if (document.body) {
            clearInterval(interval);
            addPanel();
            if (!newsInitialized) initNewsPage();
        }
        if (++attempts > 20) clearInterval(interval);
    }, 250);

})();