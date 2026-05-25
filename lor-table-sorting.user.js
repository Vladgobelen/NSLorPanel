// ==UserScript==
// @name         LOR table sorting
// @description  Сортировка таблиц на linux.org.ru
// @namespace    LOR
// @version      4
// @match        *://www.linux.org.ru/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    function addTableSorting() {
        const tables = document.querySelectorAll('table');
        tables.forEach((tbl) => {
            if (tbl.dataset.lorSortReady) return;
            tbl.dataset.lorSortReady = '1';

            if (!tbl.rows || tbl.rows.length < 2) return;
            const firstCell = tbl.rows[0].cells[0]?.textContent.trim();
            if (!firstCell || firstCell === '') return;

            const originalOrder = [];
            for (let i = 1; i < tbl.rows.length; i++) {
                const row = tbl.rows[i];
                originalOrder.push({
                    row: row,
                    parent: row.parentNode,
                    next: row.nextSibling
                });
            }

            let currentSort = { col: null, direction: null };

            function getColumnType(col) {
                let hasTime = false, hasNumeric = true, total = 0;
                for (let i = 1; i < tbl.rows.length; i++) {
                    const raw = tbl.rows[i].cells[col]?.textContent.trim() || '';
                    if (raw === '' || raw === '-' || raw === '—') continue;
                    total++;
                    if (/(?:минут|час|день|дня|дней|недел|месяц|год|минуту|час назад|сегодня|вчера)/i.test(raw)) {
                        hasTime = true;
                    }
                    if (!/^[+-]?\d+$/.test(raw.replace(/[\s\u00A0]/g, ''))) {
                        hasNumeric = false;
                    }
                }
                if (hasTime) return 'time';
                if (hasNumeric && total > 0) return 'numeric';
                return 'text';
            }

            function parseRelativeTime(str) {
                const now = Date.now();
                const val = str.toLowerCase();

                if (val.includes('минуту назад')) return now - 60 * 1000;

                let m = val.match(/(\d+)\s*минут/);
                if (m) return now - parseInt(m[1]) * 60 * 1000;

                m = val.match(/(\d+)\s*час/);
                if (m) return now - parseInt(m[1]) * 3600 * 1000;

                m = val.match(/(\d+)\s*д(?:ень|ня|ней)/);
                if (m) return now - parseInt(m[1]) * 86400 * 1000;

                m = val.match(/сегодня\s+(\d{1,2}):(\d{2})/);
                if (m) {
                    const d = new Date();
                    d.setHours(parseInt(m[1]), parseInt(m[2]), 0, 0);
                    return d.getTime();
                }

                m = val.match(/вчера\s+(\d{1,2}):(\d{2})/);
                if (m) {
                    const d = new Date();
                    d.setDate(d.getDate() - 1);
                    d.setHours(parseInt(m[1]), parseInt(m[2]), 0, 0);
                    return d.getTime();
                }

                m = val.match(/(\d{2})\.(\d{2})\.(\d{2,4})/);
                if (m) {
                    const year = m[3].length === 2 ? 2000 + parseInt(m[3]) : parseInt(m[3]);
                    return new Date(year, parseInt(m[2]) - 1, parseInt(m[1])).getTime();
                }

                return 0;
            }

            function getSortValue(col, row) {
                const raw = (row.cells[col]?.textContent || '').trim().replace(/[\s\u00A0]/g, '');
                if (raw === '' || raw === '-' || raw === '—') return { empty: true };
                return { empty: false, raw: raw };
            }

            function doSort(col, direction) {
                const colType = getColumnType(col);
                const dataRows = [];
                for (let i = 1; i < tbl.rows.length; i++) {
                    dataRows.push(tbl.rows[i]);
                }

                dataRows.sort((a, b) => {
                    const aVal = getSortValue(col, a);
                    const bVal = getSortValue(col, b);

                    if (aVal.empty && bVal.empty) return 0;
                    if (aVal.empty) return 1;
                    if (bVal.empty) return -1;

                    if (colType === 'numeric') {
                        const aNum = parseInt(aVal.raw) || 0;
                        const bNum = parseInt(bVal.raw) || 0;
                        return direction === 'asc' ? aNum - bNum : bNum - aNum;
                    } else if (colType === 'time') {
                        const aTime = parseRelativeTime(aVal.raw);
                        const bTime = parseRelativeTime(bVal.raw);
                        return direction === 'asc' ? bTime - aTime : aTime - bTime;
                    } else {
                        const cmp = aVal.raw.toLowerCase().localeCompare(bVal.raw.toLowerCase(), 'ru');
                        return direction === 'asc' ? cmp : -cmp;
                    }
                });

                dataRows.forEach(row => {
                    row.parentNode.appendChild(row);
                });
            }

            function updateHeaders() {
                Array.from(tbl.rows[0].cells).forEach((cell, i) => {
                    cell.classList.remove('lor-sort-asc', 'lor-sort-desc');
                    if (currentSort.col === i && currentSort.direction) {
                        cell.classList.add(currentSort.direction === 'asc' ? 'lor-sort-asc' : 'lor-sort-desc');
                    }
                });
            }

            function resetSort() {
                currentSort = { col: null, direction: null };
                const tbodyMap = new Map();
                originalOrder.forEach(item => {
                    if (!tbodyMap.has(item.parent)) {
                        tbodyMap.set(item.parent, []);
                    }
                    tbodyMap.get(item.parent).push(item);
                });
                tbodyMap.forEach((items, tbody) => {
                    while (tbody.firstChild) {
                        tbody.removeChild(tbody.firstChild);
                    }
                    items.forEach(item => {
                        tbody.appendChild(item.row);
                    });
                });
                updateHeaders();
            }

            if (!document.getElementById('lor-sort-styles')) {
                const style = document.createElement('style');
                style.id = 'lor-sort-styles';
                style.textContent = `
                    .lor-sortable-header { cursor: pointer; user-select: none; }
                    .lor-sortable-header:hover { text-decoration: underline; }
                    .lor-sort-asc::after { content: " ▲"; font-size: 0.8em; }
                    .lor-sort-desc::after { content: " ▼"; font-size: 0.8em; }
                `;
                document.head.appendChild(style);
            }

            Array.from(tbl.rows[0].cells).forEach((cell, i) => {
                cell.classList.add('lor-sortable-header');
                cell.addEventListener('click', () => {
                    if (currentSort.col === i) {
                        if (currentSort.direction === 'asc') {
                            currentSort.direction = 'desc';
                        } else {
                            resetSort();
                            return;
                        }
                    } else {
                        currentSort.col = i;
                        currentSort.direction = 'asc';
                    }
                    doSort(currentSort.col, currentSort.direction);
                    updateHeaders();
                });
            });
        });
    }

    // Запуск при загрузке
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            setTimeout(addTableSorting, 500);
        });
    } else {
        setTimeout(addTableSorting, 500);
    }

    // Наблюдатель за динамическими изменениями
    const observer = new MutationObserver(() => {
        setTimeout(addTableSorting, 200);
    });

    // Запускаем наблюдение когда body готов
    function startObserver() {
        if (document.body) {
            observer.observe(document.body, { childList: true, subtree: true });
        } else {
            setTimeout(startObserver, 100);
        }
    }
    startObserver();
})();