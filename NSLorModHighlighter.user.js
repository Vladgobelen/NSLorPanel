// ==UserScript==
// @name         LOR Mod Highlighter
// @namespace    test
// @description  Подсветка сообщений модераторов на Linux.org.ru
// @match        https://www.linux.org.ru/*
// @grant        none
// @inject-into  content
// @run-at       document-idle
// ==/UserScript==
(function() {
    'use strict';

    var CONFIG = {
        PANEL_SETTINGS_KEY: 'lor_panel_settings_v3',
        MOD_CACHE_KEY: 'lor_mod_cache',
        MOD_CACHE_TTL: 7 * 24 * 60 * 60 * 1000,
        INIT_DELAY_MS: 1000,
        MUTATION_DEBOUNCE_MS: 50
    };

    var SELECTORS = {
        ARTICLES: 'article.msg',
        AUTHOR: [
            'a[itemprop="creator"]',
            '.sign a[href*="/people/"]',
            '.topic-author a[href*="/people/"]',
            '.author a[href*="/people/"]'
        ]
    };

    var state = {
        enabled: true,
        modCache: {},
        modQueue: [],
        modStylesInjected: false
    };

    function safeLocalStorageGet(key, defaultValue) {
        try {
            var raw = localStorage.getItem(key);
            return raw ? JSON.parse(raw) : defaultValue;
        } catch (e) {
            return defaultValue;
        }
    }

    function getFilterableArticles() {
        return document.querySelectorAll(SELECTORS.ARTICLES);
    }

    function getArticleAuthor(article) {
        if (!article) return null;
        for (var i = 0; i < SELECTORS.AUTHOR.length; i++) {
            var el = article.querySelector(SELECTORS.AUTHOR[i]);
            if (el && el.textContent.trim()) {
                return el.textContent.trim();
            }
        }
        return null;
    }

    function getModCache() {
        var cache = safeLocalStorageGet(CONFIG.MOD_CACHE_KEY, {});
        var now = Date.now();
        var cleaned = {};
        for (var nick in cache) {
            if (cache[nick] && cache[nick].ts && (now - cache[nick].ts < CONFIG.MOD_CACHE_TTL)) {
                cleaned[nick] = cache[nick];
            }
        }
        return cleaned;
    }

    function saveModCache(cache) {
        try {
            localStorage.setItem(CONFIG.MOD_CACHE_KEY, JSON.stringify(cache));
        } catch(e) {}
    }

    function injectModStyles() {
        if (state.modStylesInjected) return;
        state.modStylesInjected = true;
        var style = document.createElement('style');
        style.id = 'lor-mod-highlight-styles';
        style.textContent = `
            .lor-mod-message {
                border-left: 5px solid #4a90d9 !important;
                background: none !important;
            }
            .lor-mod-badge {
                display: inline-flex;
                align-items: center;
                gap: 4px;
                margin-left: 8px;
                padding: 2px 10px;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 50%, #f093fb 100%);
                color: white;
                font-size: 10px;
                font-weight: 900;
                letter-spacing: 1px;
                text-transform: uppercase;
                border-radius: 12px;
                box-shadow: 0 2px 8px rgba(102, 126, 234, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.3);
                text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
                vertical-align: middle;
                animation: lor-mod-pulse 2.5s ease-in-out infinite;
                user-select: none;
                cursor: help;
            }
            .lor-mod-badge::before {
                content: "🛡️";
                font-size: 11px;
                filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.3));
            }
            .lor-mod-badge::after {
                content: "MOD";
            }
            @keyframes lor-mod-pulse {
                0%, 100% { transform: scale(1); box-shadow: 0 2px 8px rgba(102, 126, 234, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.3); }
                50% { transform: scale(1.05); box-shadow: 0 4px 14px rgba(102, 126, 234, 0.6), inset 0 1px 0 rgba(255, 255, 255, 0.4); }
            }
        `;
        document.head.appendChild(style);
    }

    function applyModHighlight(article, isMod) {
        if (!article) return;
        if (isMod) {
            if (!article.classList.contains('lor-mod-message')) {
                article.classList.add('lor-mod-message');
                article.title = 'Пользователь является модератором LOR';
                if (!article.querySelector('.lor-mod-badge')) {
                    var badge = document.createElement('span');
                    badge.className = 'lor-mod-badge';
                    badge.title = 'Модератор Linux.org.ru';
                    var sign = article.querySelector('.sign');
                    if (sign) {
                        var authorLink = sign.querySelector('a[href*="/people/"]');
                        if (authorLink && authorLink.nextSibling) {
                            sign.insertBefore(badge, authorLink.nextSibling);
                        } else {
                            sign.appendChild(badge);
                        }
                    } else {
                        article.insertBefore(badge, article.firstChild);
                    }
                }
            }
        } else {
            if (article.classList.contains('lor-mod-message')) {
                article.classList.remove('lor-mod-message');
                article.title = '';
                var badge = article.querySelector('.lor-mod-badge');
                if (badge) badge.remove();
            }
        }
    }

    function processModQueue() {
        if (state.modQueue.length === 0) return;

        var queueItem = state.modQueue.shift();

        var nick, nickLower;
        if (typeof queueItem === 'string') {
            nick = queueItem;
            nickLower = queueItem.toLowerCase();
        } else if (queueItem && queueItem.nick) {
            nick = queueItem.nick;
            nickLower = queueItem.nickLower;
        } else {
            setTimeout(processModQueue, 100);
            return;
        }

        var cached = state.modCache[nickLower];
        if (cached && cached.nick === nick && (Date.now() - cached.ts < CONFIG.MOD_CACHE_TTL)) {
            applyModToAllArticles(nickLower, cached.isMod);
            setTimeout(processModQueue, 100);
            return;
        }

        var url = 'https://www.linux.org.ru/people/' + encodeURIComponent(nick) + '/profile';

        fetch(url)
            .then(function(r) {
                if (!r.ok) throw new Error('HTTP ' + r.status);
                return r.text();
            })
            .then(function(html) {
                var isMod = /Статус:[\s\S]*?\(модератор\)/i.test(html);
                state.modCache[nickLower] = { isMod: isMod, nick: nick, ts: Date.now() };
                saveModCache(state.modCache);
                applyModToAllArticles(nickLower, isMod);
                setTimeout(processModQueue, 100);
            })
            .catch(function() {
                setTimeout(processModQueue, 500);
            });
    }

    function applyModToAllArticles(nickLower, isMod) {
        var articles = getFilterableArticles();
        for (var i = 0; i < articles.length; i++) {
            var art = articles[i];
            var author = getArticleAuthor(art);
            if (author && author.trim().toLowerCase() === nickLower) {
                applyModHighlight(art, isMod);
                art._modProcessed = true;
            }
        }
    }

    function addToModQueue(originalNick, cleanMod) {
        var alreadyQueued = state.modQueue.some(function(item) {
            return item.nickLower === cleanMod;
        });
        if (!alreadyQueued) {
            state.modQueue.push({ nick: originalNick, nickLower: cleanMod });
            return true;
        }
        return false;
    }

    function checkPanelSettings() {
        var saved = safeLocalStorageGet(CONFIG.PANEL_SETTINGS_KEY, null);

        var panelExists = !!document.querySelector('.lor-panel-container');

        if (panelExists && saved && saved.filter && saved.filter.highlightMods !== undefined) {
            state.enabled = saved.filter.highlightMods;
        } else {
            state.enabled = true;
        }
    }

    function processArticles() {
        if (!state.enabled) return;

        injectModStyles();
        state.modCache = getModCache();

        state.modQueue = state.modQueue.filter(function(item) {
            return typeof item === 'object' && item.nick && item.nickLower;
        });

        var articles = getFilterableArticles();
        var queueAdded = false;

        for (var i = 0; i < articles.length; i++) {
            var art = articles[i];
            if (art._modProcessed) continue;

            var author = getArticleAuthor(art);
            if (!author) continue;

            var cleanMod = author.trim().toLowerCase();
            var originalNick = author.trim();

            var cached = state.modCache[cleanMod];
            if (cached && cached.nick === originalNick && (Date.now() - cached.ts < CONFIG.MOD_CACHE_TTL)) {
                applyModHighlight(art, cached.isMod);
                art._modProcessed = true;
            } else if (cached && cached.nick !== originalNick) {
                delete state.modCache[cleanMod];
                if (addToModQueue(originalNick, cleanMod)) queueAdded = true;
            } else {
                if (addToModQueue(originalNick, cleanMod)) queueAdded = true;
            }
        }

        if (queueAdded) processModQueue();
    }

    function onSettingsChanged() {
        checkPanelSettings();
        var articles = getFilterableArticles();
        for (var i = 0; i < articles.length; i++) {
            articles[i]._modProcessed = false;
        }
        processArticles();
    }

    function init() {
        checkPanelSettings();

        if (!state.enabled) return;

        processArticles();

        window.addEventListener('lor-filter-settings-changed', onSettingsChanged);

        window.addEventListener('storage', function(e) {
            if (e.key === CONFIG.PANEL_SETTINGS_KEY) {
                onSettingsChanged();
            }
        });

        var mutationObserver = new MutationObserver(function(mutations) {
            var hasAdded = false;
            for (var i = 0; i < mutations.length; i++) {
                if (mutations[i].addedNodes && mutations[i].addedNodes.length) {
                    hasAdded = true;
                    break;
                }
            }
            if (hasAdded) {
                setTimeout(processArticles, CONFIG.MUTATION_DEBOUNCE_MS);
            }
        });

        mutationObserver.observe(document.body, { childList: true, subtree: true });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() {
            setTimeout(init, CONFIG.INIT_DELAY_MS);
        });
    } else {
        setTimeout(init, CONFIG.INIT_DELAY_MS);
    }
})();