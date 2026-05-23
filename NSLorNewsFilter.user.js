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

// === КОНСТАНТЫ ===
const PANEL_SETTINGS_KEY = 'lor_panel_settings_v2';
const BLACKLIST_KEY = 'lor_blacklist';
const STYLE_FILTER = 'blur(4px)';
const TRANSITION_DURATION = 200;
const BLUR_MARK = '!blur!';
const PAGE_SIZE = 20;

// === ГЛОБАЛЬНОЕ СОСТОЯНИЕ ===
var state = {
    blacklist: [],
    filterSettings: { enabled: true, mode: 'cut', applyToMini: true, animateBlur: true },
    isLoading: false,
    noMoreNews: false,
    currentOffset: PAGE_SIZE,
    anchorParent: null,
    anchorNext: null,
    newsInitialized: false,
    loadedIds: {}
};

// === ЧТЕНИЕ НАСТРОЕК И ЧС ИЗ ПАНЕЛИ ===
function getPanelFilterSettings() {
    try {
        var saved = JSON.parse(localStorage.getItem(PANEL_SETTINGS_KEY));
        if (saved && saved.filter) return saved.filter;
    } catch(e) {}
    return { enabled: true, mode: 'cut', applyToMini: true, animateBlur: true };
}

function getBlacklist() {
    try { return JSON.parse(localStorage.getItem(BLACKLIST_KEY) || '[]'); } catch(e) { return []; }
}

// === ПРОВЕРКА АВТОРА ===
function isAuthorBlacklisted(author) {
    if (!author) return false;
    var clean = author.trim().toLowerCase();
    return state.blacklist.some(function(b) { return b.toLowerCase() === clean; });
}

function getArticleAuthor(article) {
    var selectors = ['a[itemprop="creator"]', '.sign a[href*="/people/"]', '.topic-author a[href*="/people/"]', '.author a[href*="/people/"]'];
    for (var i = 0; i < selectors.length; i++) {
        var el = article.querySelector(selectors[i]);
        if (el && el.textContent.trim()) return el.textContent.trim();
    }
    return null;
}

function hasBlurMark(article) {
    var sign = article.querySelector('.sign');
    return sign && sign.textContent && sign.textContent.indexOf(BLUR_MARK) !== -1;
}

// === БЛЮРИНГ (исправленный, без мерцания) ===
function applyBlur(article) {
    if (article._blurAttached) return;

    // Плавный переход через CSS
    article.style.transition = 'filter ' + (TRANSITION_DURATION / 1000) + 's ease';
    article.style.filter = STYLE_FILTER;

    article.addEventListener('mouseenter', handleMouseEnter);
    article.addEventListener('mouseleave', handleMouseLeave);
    article._blurAttached = true;
}

function removeBlur(article) {
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
    this.style.filter = STYLE_FILTER;
}

// === ОСНОВНАЯ ФИЛЬТРАЦИЯ ===
function filterExistingArticles() {
    state.filterSettings = getPanelFilterSettings();
    state.blacklist = getBlacklist();

    var articles = document.querySelectorAll('article.news, article.mini-news, article.gallery-item, article.story, section.news-item, div.story');
    articles.forEach(function(art) {
        if (art._filterProcessed && !art._needsRecheck) return;

        var author = getArticleAuthor(art);
        var isBl = isAuthorBlacklisted(author);
        var hasMark = hasBlurMark(art);

        if (state.filterSettings.enabled) {
            if (state.filterSettings.mode === 'blur') {
                if (isBl || hasMark) {
                    if (!art._wasBlurred) {
                        applyBlur(art);
                        art._wasBlurred = true;
                    }
                    art._wasHidden = false;
                    art.style.display = '';
                } else {
                    if (art._wasBlurred) {
                        removeBlur(art);
                        art._wasBlurred = false;
                    }
                    art._wasHidden = false;
                    art.style.display = '';
                }
            } else {
                if (isBl) {
                    if (!art._wasHidden) {
                        art.style.display = 'none';
                        art._wasHidden = true;
                        if (art.id) state.loadedIds[art.id] = true;
                    }
                    if (art._wasBlurred) {
                        removeBlur(art);
                        art._wasBlurred = false;
                    }
                } else {
                    if (art._wasHidden) {
                        art.style.display = '';
                        art._wasHidden = false;
                    }
                    if (art._wasBlurred) {
                        removeBlur(art);
                        art._wasBlurred = false;
                    }
                }
            }
        } else {
            art.style.display = '';
            art._wasHidden = false;
            if (art._wasBlurred) {
                removeBlur(art);
                art._wasBlurred = false;
            }
        }

        art._filterProcessed = true;
        art._needsRecheck = false;
    });

    if (state.filterSettings.enabled && state.filterSettings.mode === 'cut' && isNewsPage()) {
        if (!state.newsInitialized) {
            initNewsPage();
        }
    } else {
        window.removeEventListener('scroll', onScroll);
        state.newsInitialized = false;
    }
}

// === ЯКОРЯ И БЕСШОВНАЯ ВСТАВКА ===
function saveAnchor() {
    var existing = document.querySelectorAll('article.news, article.mini-news, article.gallery-item, article.story');
    if (existing.length > 0) {
        var last = existing[existing.length - 1];
        state.anchorParent = last.parentNode;
        state.anchorNext = last.nextSibling;
    } else {
        state.anchorParent = document.querySelector('#bd') || document.body;
        state.anchorNext = null;
    }
}

function appendArticles(articles) {
    saveAnchor();
    if (!state.anchorParent) return;
    articles.forEach(function(art) {
        if (art.id && state.loadedIds[art.id]) return;
        if (art.id) state.loadedIds[art.id] = true;

        var clone = document.importNode(art, true);
        clone._filterProcessed = false;
        clone._needsRecheck = true;
        clone._wasBlurred = false;
        clone._wasHidden = false;
        clone._blurAttached = false;

        if (state.anchorNext) {
            state.anchorParent.insertBefore(clone, state.anchorNext);
        } else {
            state.anchorParent.appendChild(clone);
        }
    });
    filterExistingArticles();
}

// === БЕСКОНЕЧНАЯ ЛЕНТА ===
function isNewsPage() {
    var path = location.pathname;
    return path === '/' || path === '/news/' || path.indexOf('/news') === 0 ||
           path.indexOf('/gallery') === 0 || path.indexOf('/stories') === 0;
}

function onScroll() {
    if (state.isLoading || state.noMoreNews || state.filterSettings.mode !== 'cut') return;

    var articles = document.querySelectorAll('article.news, article.mini-news, article.gallery-item, article.story');
    if (articles.length === 0) return;

    var trigger = articles[Math.floor(articles.length * 0.6)];
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
            var doc = new DOMParser().parseFromString(html, 'text/html');
            var articles = doc.querySelectorAll('article.news, article.mini-news, article.gallery-item, article.story');

            if (articles.length === 0) {
                state.noMoreNews = true;
                state.isLoading = false;
                return;
            }

            var miniToCheck = [];
            var regular = [];

            articles.forEach(function(art) {
                if (art.id && state.loadedIds[art.id]) return;

                if (art.classList.contains('mini-news') || art.classList.contains('story')) {
                    miniToCheck.push(art);
                } else {
                    var author = getArticleAuthor(art);
                    if (!isAuthorBlacklisted(author)) {
                        regular.push(art);
                    }
                }
            });

            appendArticles(regular);
            state.currentOffset += PAGE_SIZE;

            if (miniToCheck.length === 0 || !state.filterSettings.applyToMini) {
                state.isLoading = false;
                return;
            }

            var checked = 0;
            var approvedMini = [];

            miniToCheck.forEach(function(mini) {
                var link = mini.querySelector('a[href*="/news/"], a[href*="/gallery/"], a[href*="/stories/"]');
                if (!link) {
                    checked++;
                    if (checked >= miniToCheck.length) done();
                    return;
                }

                fetch(link.href)
                    .then(function(r) { return r.text(); })
                    .then(function(html2) {
                        var doc2 = new DOMParser().parseFromString(html2, 'text/html');
                        var author = getArticleAuthor(doc2.querySelector('article') || doc2);
                        if (!isAuthorBlacklisted(author)) {
                            approvedMini.push(mini);
                        }
                        checked++;
                        if (checked >= miniToCheck.length) done();
                    })
                    .catch(function() {
                        checked++;
                        if (checked >= miniToCheck.length) done();
                    });
            });

            function done() {
                appendArticles(approvedMini);
                state.isLoading = false;
            }
        })
        .catch(function() {
            state.isLoading = false;
        });
}

function initNewsPage() {
    if (state.newsInitialized) return;
    state.newsInitialized = true;

    document.querySelectorAll('article.news, article.mini-news, article.gallery-item, article.story').forEach(function(art) {
        if (art.id) state.loadedIds[art.id] = true;
    });

    saveAnchor();
    onScroll();
    window.addEventListener('scroll', onScroll);
}

// === ЗАПУСК И СОБЫТИЯ ===
function init() {
    filterExistingArticles();

    window.addEventListener('lor-blacklist-changed', function() {
        document.querySelectorAll('article.news, article.mini-news, article.gallery-item, article.story').forEach(function(art) {
            art._needsRecheck = true;
        });
        filterExistingArticles();
    });

    window.addEventListener('lor-filter-settings-changed', function() {
        document.querySelectorAll('article.news, article.mini-news, article.gallery-item, article.story').forEach(function(art) {
            art._needsRecheck = true;
        });
        filterExistingArticles();
    });

    window.addEventListener('storage', function(e) {
        if (e.key === BLACKLIST_KEY || e.key === PANEL_SETTINGS_KEY) {
            document.querySelectorAll('article.news, article.mini-news, article.gallery-item, article.story').forEach(function(art) {
                art._needsRecheck = true;
            });
            filterExistingArticles();
        }
    });
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() { setTimeout(init, 300); });
} else {
    setTimeout(init, 300);
}

var mutationObserver = new MutationObserver(function(mutations) {
    var added = false;
    mutations.forEach(function(m) {
        if (m.addedNodes && m.addedNodes.length) added = true;
    });
    if (added) {
        setTimeout(function() {
            filterExistingArticles();
        }, 50);
    }
});
mutationObserver.observe(document.body, { childList: true, subtree: true });

})();