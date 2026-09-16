// ==UserScript==
// @name         linux.org.ru — drag-листание галереи
// @namespace    https://www.linux.org.ru/
// @version      1.0
// @description  Перетягивание картинки листает галерею, двойной клик открывает оригинал
// @match        https://www.linux.org.ru/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    const THRESHOLD = 50;
    const DEBUG = false;
    const log = (...a) => DEBUG && console.log('[drag]', ...a);

    function realClick(el) {
        const r = el.getBoundingClientRect();
        const x = r.left + r.width / 2;
        const y = r.top + r.height / 2;
        const opts = {
            bubbles: true, cancelable: true, view: window,
            clientX: x, clientY: y, button: 0, buttons: 1, detail: 1
        };
        el.dispatchEvent(new MouseEvent('mousedown', opts));
        el.dispatchEvent(new MouseEvent('mouseup', opts));
        el.dispatchEvent(new MouseEvent('click', opts));
    }

    function initSlider(slider) {
        if (slider.dataset.dragInit) return;
        slider.dataset.dragInit = '1';

        const next = slider.querySelector('button.slider-nav-next');
        const prev = slider.querySelector('button.slider-nav:not(.slider-nav-next)');
        if (!next || !prev) { log('нет кнопок'); return; }

        slider.querySelectorAll('img').forEach(img => {
            img.draggable = false;
            img.style.userSelect = 'none';
            img.style.webkitUserDrag = 'none';
        });
        slider.querySelectorAll('a').forEach(a => { a.draggable = false; });

        slider.addEventListener('dragstart', e => {
            if (e.target.tagName === 'IMG' || e.target.tagName === 'A') e.preventDefault();
        }, true);

        let sx = 0, sy = 0, dragging = false, moved = false;

        function down(x, y, target) {
            if (target.closest('button')) return;
            sx = x; sy = y; dragging = true; moved = false;
            log('down', sx, sy);
        }
        function move(x, y, e) {
            if (!dragging) return;
            const dx = x - sx, dy = y - sy;
            if (!moved && Math.abs(dx) > 5) moved = true;
            if (moved && Math.abs(dx) > Math.abs(dy) && e) {
                if (e.cancelable) e.preventDefault();
                e.stopPropagation();
            }
        }
        function up(x, y) {
            if (!dragging) return;
            dragging = false;
            const dx = x - sx, dy = y - sy;
            log('up', { dx, dy });
            if (Math.abs(dx) >= THRESHOLD && Math.abs(dx) > Math.abs(dy)) {
                if (dx < 0) { log('→ next'); realClick(next); }
                else        { log('→ prev'); realClick(prev); }
            }
        }

        slider.addEventListener('click', e => {
            if (e.target.closest('button')) return;
            const a = e.target.closest('a');
            if (!a) return;
            e.preventDefault();
            e.stopPropagation();
        }, true);

        slider.addEventListener('dblclick', e => {
            if (e.target.closest('button')) return;
            const a = e.target.closest('a');
            if (!a) return;
            e.preventDefault();
            e.stopPropagation();
            window.open(a.href, '_blank', 'noopener');
        }, true);

        slider.addEventListener('pointerdown', e => {
            if (e.pointerType === 'mouse' && e.button !== 0) return;
            down(e.clientX, e.clientY, e.target);
        }, true);
        slider.addEventListener('pointermove', e => move(e.clientX, e.clientY, e), true);
        slider.addEventListener('pointerup',   e => up(e.clientX, e.clientY),   true);
        slider.addEventListener('pointercancel', () => dragging = false, true);

        slider.addEventListener('mousedown', e => {
            if (dragging || e.button !== 0) return;
            down(e.clientX, e.clientY, e.target);
        }, true);
        slider.addEventListener('mousemove', e => { if (dragging) move(e.clientX, e.clientY, e); }, true);
        slider.addEventListener('mouseup',   e => { if (dragging) up(e.clientX, e.clientY); },   true);
        document.addEventListener('mouseup', e => { if (dragging) up(e.clientX, e.clientY); },   true);
    }

    function initAll() {
        document.querySelectorAll('.swiffy-slider').forEach(initSlider);
    }
    initAll();

    const mo = new MutationObserver(initAll);
    mo.observe(document.body, { childList: true, subtree: true });
})();