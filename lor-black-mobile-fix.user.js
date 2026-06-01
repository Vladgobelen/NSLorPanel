// ==UserScript==
// @name         LOR Black Theme Mobile Fix
// @namespace    test
// @description  Адаптация десктопной темы Black для мобильных устройств
// @match        https://www.linux.org.ru/*
// @grant        none
// @inject-into  content
// @run-at       document-start
// ==/UserScript==
(function() {
    'use strict';

    var themeLink = document.querySelector('link[href*="/black/"]');
    if (!themeLink) return;

    var viewport = document.querySelector('meta[name="viewport"]');
    if (!viewport) {
        viewport = document.createElement('meta');
        viewport.name = 'viewport';
        viewport.content = 'width=device-width, initial-scale=1.0';
        document.head.appendChild(viewport);
    }

    function applyFixes() {
        var tables = document.querySelectorAll('.message-table, table.head');
        for (var i = 0; i < tables.length; i++) {
            var t = tables[i];
            if (t.parentElement.classList.contains('lor-table-wrap')) continue;
            var w = document.createElement('div');
            w.className = 'lor-table-wrap';
            t.parentElement.insertBefore(w, t);
            w.appendChild(t);
        }

        var style = document.createElement('style');
        style.id = 'lor-black-mobile-fix';
        style.textContent = `
            @media screen and (max-width: 768px) {
                html, body, #bd, #mainpage, #news, #boxlets,
                .entry-body, article, .msg, .slider-parent {
                    width: auto !important;
                    max-width: 100vw !important;
                }

                #mainpage {
                    display: flex;
                    flex-direction: column;
                }

                #news {
                    padding: 0 8px !important;
                    box-sizing: border-box;
                }

                #boxlets {
                    float: none !important;
                    padding: 0 8px !important;
                    box-sizing: border-box;
                }

                /* Масштабируем таблицу под ширину экрана */
                .lor-table-wrap {
                    width: 100% !important;
                    overflow-x: auto !important;
                    -webkit-overflow-scrolling: touch !important;
                }

                .lor-table-wrap table {
                    table-layout: auto !important;
                    width: auto !important;
                    min-width: 100% !important;
                    font-size: 12px !important;
                }

                .lor-table-wrap td,
                .lor-table-wrap th {
                    padding: 4px 6px !important;
                    font-size: 12px !important;
                    word-break: break-word;
                }

                /* Логотип */
                body > a > img {
                    width: 120px !important;
                    height: auto !important;
                    float: left !important;
                    margin: 4px 8px !important;
                }

                #hd { text-align: center; }
                #head-main table { margin: 0 auto; font-size: 14px; }
                #head-main td { padding: 4px 8px; }

                .head {
                    position: static !important;
                    text-align: center !important;
                    padding: 8px !important;
                    font-size: 13px;
                }

                article.news, article.infoblock {
                    box-sizing: border-box;
                    font-size: 15px !important;
                }

                article.news h1, article.news h1 a {
                    font-size: 18px !important;
                    line-height: 1.3 !important;
                }

                article img, .slider-parent, .medium-image-container {
                    max-width: 100% !important;
                    height: auto !important;
                }

                .swiffy-slider { max-width: 100% !important; }

                .msg { font-size: 15px !important; line-height: 1.5 !important; }
                .btn { font-size: 14px !important; padding: 6px 12px !important; }
                .sign { font-size: 12px !important; }
                .tags { font-size: 12px !important; }

                #interpage { height: auto !important; min-height: 50px !important; }
                #interpage img { max-width: 100% !important; height: auto !important; }

                nav { font-size: 14px !important; }

                #ft {
                    font-size: 12px !important;
                    text-align: center !important;
                    padding: 10px !important;
                    max-width: 100vw !important;
                }

                .msg table {
                    max-width: 100% !important;
                    overflow-x: auto !important;
                }

                pre, code {
                    max-width: 100% !important;
                    overflow-x: auto !important;
                    font-size: 13px !important;
                    white-space: pre-wrap !important;
                }

                .entry-userpic { float: right !important; margin-left: 10px !important; }
                .entry-userpic img { width: 40px !important; height: auto !important; }

                .poll-result ol { padding-left: 20px !important; }
                .penguin_progress span { font-size: 0 !important; }

                #main-page-news ul { padding-left: 16px !important; }
                #main-page-news li { font-size: 14px !important; margin-bottom: 6px; }
            }

            @media screen and (max-width: 480px) {
                article.news h1, article.news h1 a { font-size: 16px !important; }
                .msg { font-size: 14px !important; }
                #head-main td { padding: 4px 4px; font-size: 12px; }
                body > a > img { width: 90px !important; margin: 4px 4px !important; }

                .lor-table-wrap td,
                .lor-table-wrap th {
                    padding: 2px 4px !important;
                    font-size: 10px !important;
                }
            }
        `;
        document.head.appendChild(style);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', applyFixes);
    } else {
        applyFixes();
    }
})();