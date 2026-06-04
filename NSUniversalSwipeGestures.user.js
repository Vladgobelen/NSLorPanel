// ==UserScript==
// @name         NS Universal Swipe Gestures
// @namespace    test
// @version      2.3.0
// @description  Свайп-жесты в любом месте сайта
// @match        *://*/*
// @grant        none
// @inject-into  content
// @run-at       document-end
// ==/UserScript==

(function() {
    'use strict';

    const settings = {
        minSwipeDistance: 50,
        maxClickMovement: 5
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

    const overlay = document.createElement('div');
    overlay.style.cssText = `
        position: fixed; top: 0; left: 0; width: 100%; height: 100%;
        z-index: 2147483646; background: transparent;
        display: none;
    `;

    document.body.appendChild(topBar);
    document.body.appendChild(bottomBar);
    document.body.appendChild(overlay);

    function lockPage() {
        const scrollY = window.scrollY;
        overlay.dataset.scrollY = scrollY;
        overlay.style.display = 'block';
        
        document.body.style.overflow = 'hidden';
        document.body.style.position = 'fixed';
        document.body.style.width = '100%';
        document.body.style.top = `-${scrollY}px`;
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

    function unlockPage() {
        overlay.style.display = 'none';
        
        document.body.style.overflow = '';
        document.body.style.position = '';
        document.body.style.width = '';
        document.body.style.top = '';
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
        if (direction === 'up') {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        } else {
            const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
            window.scrollTo({ top: maxScroll, behavior: 'smooth' });
        }
    }

    function finishGesture(direction) {
        const scrollY = parseInt(overlay.dataset.scrollY) || 0;
        
        document.body.style.overflow = '';
        document.body.style.position = '';
        document.body.style.width = '';
        document.body.style.top = '';
        
        executeSwipe(direction);
        
        hideIndicators();
        overlay.style.display = 'none';
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

    document.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return;
        if (e.target.matches('input, textarea, select, [contenteditable="true"]')) return;
        if (e.target.closest('input, textarea, select, [contenteditable="true"]')) return;

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
        const totalDistance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

        if (!gestureState.isSwipe && totalDistance > settings.maxClickMovement) {
            if (Math.abs(deltaY) > Math.abs(deltaX)) {
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
            if (Math.abs(deltaY) >= settings.minSwipeDistance) {
                finishGesture(gestureState.direction);
            } else {
                hideIndicators();
                unlockPage();
                gestureState = {
                    active: false,
                    startX: 0,
                    startY: 0,
                    isSwipe: false,
                    direction: null
                };
            }
        } else {
            gestureState = {
                active: false,
                startX: 0,
                startY: 0,
                isSwipe: false,
                direction: null
            };
        }
    });

    document.addEventListener('mouseleave', () => {
        if (gestureState.active && gestureState.isSwipe) {
            hideIndicators();
            unlockPage();
        }
        gestureState = {
            active: false,
            startX: 0,
            startY: 0,
            isSwipe: false,
            direction: null
        };
    });

    document.addEventListener('selectstart', (e) => {
        if (gestureState.isSwipe) {
            e.preventDefault();
        }
    });

})();