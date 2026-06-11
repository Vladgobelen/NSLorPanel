// ==UserScript==
// @name         Universal Swipe Gestures
// @namespace    test
// @version      3.0.0
// @description  Свайп-жесты в любом месте сайта
// @match        *://*/*
// @grant        none
// @inject-into  content
// @run-at       document-end
// ==/UserScript==

(function() {
    'use strict';

    const settings = {
        minSwipeDistance: 150,
        maxClickMovement: 5,
        maxHorizontalDeviation: 30
    };

    let gestureState = {
        active: false,
        startX: 0,
        startY: 0,
        isSwipe: false,
        direction: null
    };

    const topBar = document.createElement('div');
    topBar.style.cssText = `
        position: fixed; top: 0; left: 0; width: 100%; height: 4px;
        background: #4CAF50; z-index: 2147483647;
        opacity: 0; transition: opacity 0.15s;
        pointer-events: none;
    `;

    const bottomBar = document.createElement('div');
    bottomBar.style.cssText = `
        position: fixed; bottom: 0; left: 0; width: 100%; height: 4px;
        background: #4CAF50; z-index: 2147483647;
        opacity: 0; transition: opacity 0.15s;
        pointer-events: none;
    `;

    document.body.appendChild(topBar);
    document.body.appendChild(bottomBar);

    let savedScrollY = 0;

    function lockPage() {
        savedScrollY = window.scrollY;

        document.body.style.overflow = 'hidden';
        document.body.style.position = 'fixed';
        document.body.style.width = '100%';
        document.body.style.top = `-${savedScrollY}px`;
        document.body.style.userSelect = 'none';
        document.body.style.webkitUserSelect = 'none';

        document.addEventListener('dragstart', preventDrag, true);
        document.addEventListener('drag', preventDrag, true);
        document.addEventListener('dragend', preventDrag, true);

        document.querySelectorAll('img, a, [draggable="true"]').forEach(el => {
            el._swipePE = el.style.pointerEvents;
            el.style.pointerEvents = 'none';
            if (el.hasAttribute('draggable')) {
                el._swipeDraggable = el.getAttribute('draggable');
                el.setAttribute('draggable', 'false');
            }
        });
    }

    function preventDrag(e) {
        e.preventDefault();
        e.stopPropagation();
        return false;
    }

    function unlockPage(restoreScroll = true) {
        document.body.style.overflow = '';
        document.body.style.position = '';
        document.body.style.width = '';
        document.body.style.top = '';

        if (restoreScroll && savedScrollY > 0) {
            window.scrollTo(0, savedScrollY);
        }

        document.body.style.userSelect = '';
        document.body.style.webkitUserSelect = '';

        document.removeEventListener('dragstart', preventDrag, true);
        document.removeEventListener('drag', preventDrag, true);
        document.removeEventListener('dragend', preventDrag, true);

        document.querySelectorAll('img, a, [draggable="true"]').forEach(el => {
            el.style.pointerEvents = el._swipePE || '';
            delete el._swipePE;
            if (el._swipeDraggable !== undefined) {
                el.setAttribute('draggable', el._swipeDraggable);
                delete el._swipeDraggable;
            }
        });
    }

    function showIndicator(direction) {
        if (direction === 'up') {
            topBar.style.opacity = '1';
            bottomBar.style.opacity = '0';
        } else {
            topBar.style.opacity = '0';
            bottomBar.style.opacity = '1';
        }
    }

    function hideIndicators() {
        topBar.style.opacity = '0';
        bottomBar.style.opacity = '0';
    }

    function executeSwipe(direction) {
        document.body.style.overflow = '';
        document.body.style.position = '';
        document.body.style.width = '';
        document.body.style.top = '';

        if (direction === 'up') {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        } else {
            const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
            window.scrollTo({ top: maxScroll, behavior: 'smooth' });
        }
    }

    function finishGesture(direction) {
        executeSwipe(direction);
        hideIndicators();

        document.body.style.userSelect = '';
        document.body.style.webkitUserSelect = '';

        document.removeEventListener('dragstart', preventDrag, true);
        document.removeEventListener('drag', preventDrag, true);
        document.removeEventListener('dragend', preventDrag, true);

        document.querySelectorAll('img, a, [draggable="true"]').forEach(el => {
            el.style.pointerEvents = el._swipePE || '';
            delete el._swipePE;
            if (el._swipeDraggable !== undefined) {
                el.setAttribute('draggable', el._swipeDraggable);
                delete el._swipeDraggable;
            }
        });

        gestureState = {
            active: false,
            startX: 0,
            startY: 0,
            isSwipe: false,
            direction: null
        };
    }

    function cancelGesture() {
        if (gestureState.isSwipe) {
            hideIndicators();
            unlockPage(true);
        }
        gestureState = {
            active: false,
            startX: 0,
            startY: 0,
            isSwipe: false,
            direction: null
        };
    }

    document.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return;
        if (e.target.matches('input, textarea, select, [contenteditable="true"]') ||
            e.target.closest('input, textarea, select, [contenteditable="true"]')) return;

        gestureState.active = true;
        gestureState.startX = e.clientX;
        gestureState.startY = e.clientY;
        gestureState.isSwipe = false;
        gestureState.direction = null;
    });

    document.addEventListener('mousemove', (e) => {
        if (!gestureState.active) return;

        const deltaX = e.clientX - gestureState.startX;
        const deltaY = e.clientY - gestureState.startY;
        const absDeltaX = Math.abs(deltaX);
        const absDeltaY = Math.abs(deltaY);

        if (absDeltaX > settings.maxHorizontalDeviation) {
            cancelGesture();
            return;
        }

        if (!gestureState.isSwipe) {
            if (absDeltaY > settings.maxClickMovement && absDeltaY > absDeltaX) {
                gestureState.isSwipe = true;
                gestureState.direction = deltaY < 0 ? 'up' : 'down';
                lockPage();
                showIndicator(gestureState.direction);
            }
        }

        if (gestureState.isSwipe) {
            const newDirection = deltaY < 0 ? 'up' : 'down';
            if (newDirection !== gestureState.direction) {
                gestureState.direction = newDirection;
                showIndicator(newDirection);
            }
        }
    });

    document.addEventListener('mouseup', (e) => {
        if (!gestureState.active) return;

        if (gestureState.isSwipe) {
            const deltaY = e.clientY - gestureState.startY;
            const deltaX = e.clientX - gestureState.startX;

            if (Math.abs(deltaX) <= settings.maxHorizontalDeviation &&
                Math.abs(deltaY) >= settings.minSwipeDistance) {
                finishGesture(gestureState.direction);
            } else {
                cancelGesture();
            }
        } else {
            gestureState.active = false;
        }
    });

    window.addEventListener('blur', () => {
        if (gestureState.active && gestureState.isSwipe) {
            cancelGesture();
        }
    });

    document.addEventListener('selectstart', (e) => {
        if (gestureState.isSwipe) {
            e.preventDefault();
        }
    });

})();