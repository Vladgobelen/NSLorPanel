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
        btn.style.background = count > 0 ? '#cc0000' : '#000080';
        btn.style.fontWeight = 'bold';
        btn.style.fontSize = '28px';
        btn.onmouseenter = function() { this.style.opacity = '1'; this.style.background = count > 0 ? '#ff0000' : '#0000a0'; };
        btn.onmouseleave = function() { this.style.opacity = '0.6'; this.style.background = count > 0 ? '#cc0000' : '#000080'; };
    }

    function showBlacklistModal() {
        if (document.getElementById('lor-blacklist-overlay')) return;
        var overlay = document.createElement('div');
        overlay.id = 'lor-blacklist-overlay';
        overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.6);z-index:99999;display:flex;align-items:center;justify-content:center;';
        var modal = document.createElement('div');
        modal.style.cssText = 'background:#0a0a14;border:1px solid #333;padding:24px;border-radius:6px;width:420px;color:#ccc;font-family:Arial,sans-serif;font-size:14px;box-shadow:0 0 20px rgba(0,0,0,0.8);';
        modal.innerHTML = '<div style="font-size:16px;font-weight:bold;margin-bottom:16px;padding-bottom:8px;border-bottom:1px solid #333;">Чёрный список авторов</div>' +
            '<div style="margin-bottom:12px;"><input type="text" id="lor-blacklist-input" placeholder="Введите ник автора" style="width:100%;padding:8px 10px;background:#111;color:#ccc;border:1px solid #444;border-radius:4px;font-size:14px;box-sizing:border-box;"></div>' +
            '<div style="display:flex;gap:8px;margin-bottom:16px;"><button id="lor-blacklist-add" style="padding:8px 16px;background:#0a3d6b;color:#ddd;border:1px solid #1a5a9a;border-radius:4px;cursor:pointer;font-size:13px;">Добавить</button><button id="lor-blacklist-remove" style="padding:8px 16px;background:#5a1a1a;color:#ddd;border:1px solid #8a2a2a;border-radius:4px;cursor:pointer;font-size:13px;">Исключить</button></div>' +
            '<div style="font-size:13px;color:#888;margin-bottom:6px;">Авторы в списке:</div>' +
            '<ul id="lor-blacklist-list" style="list-style:none;padding:0;margin:0 0 16px 0;max-height:200px;overflow-y:auto;background:#0d0d1a;border:1px solid #2a2a3a;border-radius:4px;"></ul>' +
            '<div style="text-align:right;"><button id="lor-blacklist-close" style="padding:8px 20px;background:#2a2a3a;color:#aaa;border:1px solid #444;border-radius:4px;cursor:pointer;font-size:13px;">Закрыть</button></div>';
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
                empty.style.cssText = 'padding:10px;color:#555;text-align:center;font-style:italic;';
                listEl.appendChild(empty);
            } else {
                blacklist.forEach(function(nick) {
                    var li = document.createElement('li');
                    li.style.cssText = 'padding:7px 10px;border-bottom:1px solid #1a1a2e;color:#ccc;display:flex;justify-content:space-between;align-items:center;';
                    var nameSpan = document.createElement('span');
                    nameSpan.textContent = nick;
                    var closeBtn = document.createElement('span');
                    closeBtn.textContent = '✕';
                    closeBtn.style.cssText = 'color:#888;cursor:pointer;font-size:16px;padding:0 4px;';
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

    function addPanel() {
        if (document.querySelector('.lor-panel-container')) return;
        var scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
        var size = 54;
        var container = document.createElement('div');
        container.className = 'lor-panel-container';
        container.style.cssText = 'position:fixed !important;top:50% !important;transform:translateY(-50%) !important;z-index:9999 !important;display:flex !important;flex-direction:column !important;gap:8px !important;right:' + (scrollbarWidth + 20) + 'px !important;';
        function createButton(text, title, callback, marginBottom) {
            var btn = document.createElement('div');
            btn.textContent = text;
            btn.title = title;
            btn.style.cssText = 'width:' + size + 'px !important;height:' + size + 'px !important;background:#000080 !important;color:#ffffff !important;border-radius:50% !important;display:flex !important;align-items:center !important;justify-content:center !important;cursor:pointer !important;font-size:24px !important;user-select:none !important;opacity:0.6 !important;position:relative !important;' + (marginBottom ? 'margin-bottom:30px !important;' : '');
            btn.onmouseenter = function() { this.style.opacity = '1'; this.style.background = '#0000a0'; };
            btn.onmouseleave = function() { this.style.opacity = '0.6'; this.style.background = '#000080'; };
            btn.onclick = callback;
            return btn;
        }
        container.appendChild(createButton('👤', 'Профиль', function() { location.href = getProfileUrl(); }, true));
        container.appendChild(createButton('▲', 'Наверх', function() { window.scrollTo({ top: 0, behavior: 'smooth' }); }));
        container.appendChild(createButton('📋', 'Форум', function() { location.href = 'https://www.linux.org.ru/forum/'; }));
        container.appendChild(createButton('☰', 'Трекер', function() { location.href = 'https://www.linux.org.ru/tracker/'; }));
        var notifBtn = createButton('🔔', 'Уведомления', function() { location.href = 'https://www.linux.org.ru/notifications'; });
        container.appendChild(notifBtn);
        updateNotificationBadge(notifBtn);
        setInterval(function() { updateNotificationBadge(notifBtn); }, 5000);
        container.appendChild(createButton('💬', 'К моему последнему сообщению', goToMyLastComment));
        container.appendChild(createButton('📢', 'К последнему упоминанию меня', goToLastMention));
        container.appendChild(createButton('🚫', 'Чёрный список', showBlacklistModal));
        container.appendChild(createButton('▼', 'Вниз', function() { window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }); }));
        document.body.appendChild(container);
    }

    function initNewsPage() {
        if (newsInitialized) return;
        if (location.pathname !== '/news/' && location.pathname !== '/news') return;
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
            setTimeout(function() { if (!newsInitialized) initNewsPage(); }, 800);
        });
    } else {
        setTimeout(addPanel, 500);
        setTimeout(function() { if (!newsInitialized) initNewsPage(); }, 800);
    }

    var attempts = 0;
    var interval = setInterval(function() {
        if (document.body && document.querySelector('article.msg, article.news, article.mini-news')) {
            clearInterval(interval);
            addPanel();
            if (!newsInitialized) initNewsPage();
        }
        if (++attempts > 20) clearInterval(interval);
    }, 250);

})();