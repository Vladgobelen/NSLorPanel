// ==UserScript==
// @name         NSLorNewsFilter
// @namespace    test
// @description  Фильтрация новостей по чёрному списку из NSLorPanel (Вырезание/Блюр + Бесшовная лента)
// @match        https://www.linux.org.ru/*
// @grant        none
// @inject-into  content
// @run-at       document-idle
// ==/UserScript==

(function() {
'use strict';

const CONFIG = {
    PANEL_SETTINGS_KEY: 'lor_panel_settings_v3',
    BLACKLIST_KEY: 'lor_blacklist',
    STYLE_FILTER: 'blur(4px)',
    TRANSITION_DURATION: 200,
    BLUR_MARK: '!blur!',
    PAGE_SIZE: 20,
    SCROLL_TRIGGER_RATIO: 0.6,
    INIT_DELAY_MS: 300,
    MUTATION_DEBOUNCE_MS: 50
};

const SELECTORS = {
    ARTICLES: 'article.news, article.mini-news, article.gallery-item, article.story, section.news-item, div.story',
    AUTHOR: [
        'a[itemprop="creator"]',
        '.sign a[href*="/people/"]',
        '.topic-author a[href*="/people/"]',
        '.author a[href*="/people/"]'
    ],
    MINI_LINK: 'a[href*="/news/"], a[href*="/gallery/"], a[href*="/stories/"]',
    ANCHOR_CONTAINER: '#bd'
};

const PATHS = {
    NEWS_PAGES: ['/', '/news/'],
    NEWS_PREFIXES: ['/news', '/gallery', '/stories']
};

const state = {
    blacklist: [],
    filterSettings: { enabled: true, mode: 'cut', applyToMini: true, animateBlur: true },
    isLoading: false,
    noMoreNews: false,
    currentOffset: CONFIG.PAGE_SIZE,
    anchorParent: null,
    anchorNext: null,
    newsInitialized: false,
    loadedIds: Object.create(null)
};

function safeLocalStorageGet(key, defaultValue) {
    try {
        var raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : defaultValue;
    } catch (e) {
        return defaultValue;
    }
}

function parseHTML(html) {
    return new DOMParser().parseFromString(html, 'text/html');
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

function isAuthorBlacklisted(author) {
    if (!author) return false;
    var clean = author.trim().toLowerCase();
    return state.blacklist.some(function(b) {
        return b.toLowerCase() === clean;
    });
}

function hasBlurMark(article) {
    var sign = article.querySelector('.sign');
    return sign && sign.textContent && sign.textContent.indexOf(CONFIG.BLUR_MARK) !== -1;
}

function isNewsPage() {
    var path = location.pathname;
    if (PATHS.NEWS_PAGES.indexOf(path) !== -1) return true;
    for (var i = 0; i < PATHS.NEWS_PREFIXES.length; i++) {
        if (path.indexOf(PATHS.NEWS_PREFIXES[i]) === 0) return true;
    }
    return false;
}

function resetArticleState(article) {
    article._filterProcessed = false;
    article._needsRecheck = false;
    article._wasBlurred = false;
    article._wasHidden = false;
    article._blurAttached = false;
}

function markAsLoaded(article) {
    if (article && article.id) {
        state.loadedIds[article.id] = true;
    }
}

function isAlreadyLoaded(article) {
    return article && article.id && state.loadedIds[article.id] === true;
}

function applyArticleFilterState(article, shouldFilter) {
    var settings = state.filterSettings;
    if (!settings.enabled) {
        article.style.display = '';
        article.style.transition = '';
        article.style.filter = '';
        detachBlur(article);
        article._wasHidden = false;
        article._wasBlurred = false;
        return;
    }
    if (settings.mode === 'blur') {
        applyBlurMode(article, shouldFilter);
    } else {
        applyCutMode(article, shouldFilter);
    }
}

function applyBlurMode(article, shouldBlur) {
    if (shouldBlur) {
        if (!article._wasBlurred) {
            attachBlur(article);
            article._wasBlurred = true;
        }
        article._wasHidden = false;
        article.style.display = '';
    } else {
        if (article._wasBlurred) {
            detachBlur(article);
            article._wasBlurred = false;
        }
        article._wasHidden = false;
        article.style.display = '';
    }
}

function applyCutMode(article, shouldCut) {
    if (shouldCut) {
        if (!article._wasHidden) {
            article.style.display = 'none';
            article._wasHidden = true;
            markAsLoaded(article);
        }
        if (article._wasBlurred) {
            detachBlur(article);
            article._wasBlurred = false;
        }
    } else {
        if (article._wasHidden) {
            article.style.display = '';
            article._wasHidden = false;
        }
        if (article._wasBlurred) {
            detachBlur(article);
            article._wasBlurred = false;
        }
    }
}

function attachBlur(article) {
    if (article._blurAttached) return;
    article.style.transition = 'filter ' + (CONFIG.TRANSITION_DURATION / 1000) + 's ease';
    article.style.filter = CONFIG.STYLE_FILTER;
    article.addEventListener('mouseenter', handleMouseEnter);
    article.addEventListener('mouseleave', handleMouseLeave);
    article._blurAttached = true;
}

function detachBlur(article) {
    article.style.transition = '';
    article.style.filter = '';
    article.removeEventListener('mouseenter', handleMouseEnter);
    article.removeEventListener('mouseleave', handleMouseLeave);
    article._blurAttached = false;
}

function handleMouseEnter() {
    this.style.filter = 'none';
}

function handleMouseLeave() {
    this.style.filter = CONFIG.STYLE_FILTER;
}

function onSettingsChanged() {
    state.filterSettings = getPanelFilterSettings();
    state.blacklist = getBlacklist();
    var articles = getFilterableArticles();
    for (var i = 0; i < articles.length; i++) {
        articles[i]._needsRecheck = true;
    }
    filterExistingArticles();
}

function getPanelFilterSettings() {
    var saved = safeLocalStorageGet(CONFIG.PANEL_SETTINGS_KEY, null);
    return (saved && saved.filter) ? saved.filter : {
        enabled: true,
        mode: 'cut',
        applyToMini: true,
        animateBlur: true
    };
}

function getBlacklist() {
    return safeLocalStorageGet(CONFIG.BLACKLIST_KEY, []);
}

function filterExistingArticles() {
    if (!state.filterSettings || !state.blacklist) {
        state.filterSettings = getPanelFilterSettings();
        state.blacklist = getBlacklist();
    }
    var articles = getFilterableArticles();
    for (var i = 0; i < articles.length; i++) {
        var art = articles[i];
        if (art._filterProcessed && !art._needsRecheck) {
            continue;
        }
        var author = getArticleAuthor(art);
        var isBl = isAuthorBlacklisted(author);
        var hasMark = hasBlurMark(art);
        var shouldFilter = isBl || hasMark;
        applyArticleFilterState(art, shouldFilter);
        art._filterProcessed = true;
        art._needsRecheck = false;
    }
    if (state.filterSettings.enabled && state.filterSettings.mode === 'cut' && isNewsPage()) {
        if (!state.newsInitialized) {
            initNewsPage();
        }
    } else {
        window.removeEventListener('scroll', onScroll);
        state.newsInitialized = false;
    }
}

function saveAnchor() {
    var existing = getFilterableArticles();
    if (existing.length > 0) {
        var last = existing[existing.length - 1];
        state.anchorParent = last.parentNode;
        state.anchorNext = last.nextSibling;
    } else {
        state.anchorParent = document.querySelector(SELECTORS.ANCHOR_CONTAINER) || document.body;
        state.anchorNext = null;
    }
}

function appendArticles(articles) {
    saveAnchor();
    if (!state.anchorParent) return;
    for (var i = 0; i < articles.length; i++) {
        var art = articles[i];
        if (isAlreadyLoaded(art)) continue;
        markAsLoaded(art);
        var clone = document.importNode(art, true);
        resetArticleState(clone);
        if (state.anchorNext) {
            state.anchorParent.insertBefore(clone, state.anchorNext);
        } else {
            state.anchorParent.appendChild(clone);
        }
    }
    filterExistingArticles();
}

function onScroll() {
    if (state.isLoading || state.noMoreNews || state.filterSettings.mode !== 'cut') return;
    var articles = getFilterableArticles();
    if (articles.length === 0) return;
    var triggerIndex = Math.floor(articles.length * CONFIG.SCROLL_TRIGGER_RATIO);
    var trigger = articles[triggerIndex];
    if (!trigger) return;
    var rect = trigger.getBoundingClientRect();
    if (rect.top < window.innerHeight) {
        loadNextPage();
    }
}

function loadNextPage() {
    if (state.isLoading || state.noMoreNews) return;
    state.isLoading = true;
    var url = 'https://www.linux.org.ru/news/?offset=' + state.currentOffset;
    fetch(url)
        .then(function(r) { return r.text(); })
        .then(function(html) {
            var doc = parseHTML(html);
            var articles = doc.querySelectorAll(SELECTORS.ARTICLES);
            if (articles.length === 0) {
                state.noMoreNews = true;
                state.isLoading = false;
                return;
            }
            var miniToCheck = [];
            var regular = [];
            for (var i = 0; i < articles.length; i++) {
                var art = articles[i];
                if (isAlreadyLoaded(art)) continue;
                if (art.classList.contains('mini-news') || art.classList.contains('story')) {
                    miniToCheck.push(art);
                } else {
                    var author = getArticleAuthor(art);
                    if (!isAuthorBlacklisted(author)) {
                        regular.push(art);
                    }
                }
            }
            appendArticles(regular);
            state.currentOffset += CONFIG.PAGE_SIZE;
            if (miniToCheck.length === 0 || !state.filterSettings.applyToMini) {
                state.isLoading = false;
                return;
            }
            checkMiniNewsAuthors(miniToCheck);
        })
        .catch(function() {
            state.isLoading = false;
        });
}

function checkMiniNewsAuthors(miniList) {
    var checked = 0;
    var approved = [];
    function onCheckDone() {
        checked++;
        if (checked >= miniList.length) {
            appendArticles(approved);
            state.isLoading = false;
        }
    }
    for (var i = 0; i < miniList.length; i++) {
        (function(mini) {
            var link = mini.querySelector(SELECTORS.MINI_LINK);
            if (!link) {
                onCheckDone();
                return;
            }
            fetch(link.href)
                .then(function(r) { return r.text(); })
                .then(function(html) {
                    var doc = parseHTML(html);
                    var article = doc.querySelector('article') || doc;
                    var author = getArticleAuthor(article);
                    if (!isAuthorBlacklisted(author)) {
                        approved.push(mini);
                    }
                    onCheckDone();
                })
                .catch(onCheckDone);
        })(miniList[i]);
    }
}

function initNewsPage() {
    if (state.newsInitialized) return;
    state.newsInitialized = true;
    var articles = getFilterableArticles();
    for (var i = 0; i < articles.length; i++) {
        markAsLoaded(articles[i]);
    }
    saveAnchor();
    onScroll();
    window.addEventListener('scroll', onScroll);
}

function init() {
    state.filterSettings = getPanelFilterSettings();
    state.blacklist = getBlacklist();
    filterExistingArticles();
    var events = [
        'lor-blacklist-changed',
        'lor-filter-settings-changed'
    ];
    for (var i = 0; i < events.length; i++) {
        window.addEventListener(events[i], onSettingsChanged);
    }
    window.addEventListener('storage', function(e) {
        if (e.key === CONFIG.BLACKLIST_KEY || e.key === CONFIG.PANEL_SETTINGS_KEY) {
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
            setTimeout(filterExistingArticles, CONFIG.MUTATION_DEBOUNCE_MS);
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