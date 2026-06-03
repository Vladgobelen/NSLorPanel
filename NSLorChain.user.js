// ==UserScript==
// @name         NSLorChain
// @namespace    test
// @version      1.2.0
// @description  Цепочки ответов и жесты мышкой для linux.org.ru
// @match        https://www.linux.org.ru/*
// @grant        none
// @inject-into  content
// @run-at       document-idle
// ==/UserScript==

(function() {
    'use strict';

    const SETTINGS_KEY = 'lor_chain_settings_v1';
    const defaultSettings = {
        gesturesEnabled: true,
        chainMode: 'dim',
        gestureZoneHeight: 50,
        gestureHighlightOpacity: 15
    };

    let chainSettings = { ...defaultSettings };
    let isPanelPresent = false;
    let isMobileView = false;
    let panelModalScale = 1;

    let chainState = {
        active: false,
        firstClickedId: null,
        chainIds: []
    };

    function loadSettings() {
        try {
            const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY));
            if (saved && typeof saved === 'object') {
                chainSettings.gesturesEnabled = saved.gesturesEnabled !== undefined ? saved.gesturesEnabled : defaultSettings.gesturesEnabled;
                chainSettings.chainMode = saved.chainMode || defaultSettings.chainMode;
                chainSettings.gestureZoneHeight = saved.gestureZoneHeight || defaultSettings.gestureZoneHeight;
                chainSettings.gestureHighlightOpacity = saved.gestureHighlightOpacity !== undefined ? saved.gestureHighlightOpacity : defaultSettings.gestureHighlightOpacity;
            }
        } catch(e) {}
    }

    function saveSettings() {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(chainSettings));
    }

    function getCurrentTheme() {
        const links = document.querySelectorAll('link[rel="stylesheet"]');
        for (let i = 0; i < links.length; i++) {
            const m = links[i].href.match(/\/([^/]+)\/combined\.css/);
            if (m) return m[1];
        }
        return 'black';
    }

    function isDarkTheme() {
        const t = getCurrentTheme();
        return t === 'black' || t === 'tango';
    }

    function getThemeColors() {
        const theme = getCurrentTheme();
        const colors = {
            black: { bg: '#0a0a14', border: '#333', text: '#ccc', accent: '#4a90d9' },
            tango: { bg: '#222', border: '#666', text: '#aaa', accent: '#4a90d9' },
            white2: { bg: '#fff', border: '#ccc', text: '#333', accent: '#0a3d6b' },
            waltz: { bg: '#fff', border: '#ccc', text: '#333', accent: '#0a3d6b' }
        };
        return colors[theme] || colors.black;
    }

    setTimeout(() => {
        const panelEl = document.querySelector('.lor-panel-container, .lor-mobile-collapsed');
        if (panelEl) {
            isPanelPresent = true;
            try {
                const panelSettings = JSON.parse(localStorage.getItem('lor_panel_settings_v3'));
                if (panelSettings) {
                    panelModalScale = (panelSettings.general.modalScale || 100) / 100;
                    isMobileView = panelSettings.general.mobileView || false;
                }
            } catch(e) {}
            initPanelIntegration();
        }

        initChainLogic();
        initGestures();
    }, 1000);

    function initPanelIntegration() {
        const observer = new MutationObserver((mutations) => {
            for (const m of mutations) {
                for (const node of m.addedNodes) {
                    if (node.id === 'lor-settings-overlay') {
                        injectSettingsTab(node);
                    }
                }
            }
        });
        observer.observe(document.body, { childList: true });
    }

    function injectSettingsTab(overlay) {
        const generalTab = overlay.querySelector('#lor-settings-tab-general');
        if (!generalTab) return;
        const tabsContainer = generalTab.parentNode;
        const contentContainer = overlay.querySelector('#lor-settings-tab-content');
        if (!tabsContainer || !contentContainer) return;

        const isDark = isDarkTheme();
        const scale = panelModalScale;

        const tabChain = document.createElement('div');
        tabChain.id = 'lor-settings-tab-chain';
        tabChain.textContent = 'Цепочки и жесты';
        tabChain.style.cssText = `padding:8px 16px;cursor:pointer;border-bottom:2px solid transparent;color:${isDark ? '#888' : '#666'};font-size:${Math.round(14 * scale)}px;`;

        tabsContainer.appendChild(tabChain);

        function renderChainTab() {
            contentContainer.innerHTML = '';

            const gestDiv = document.createElement('div');
            gestDiv.style.cssText = 'margin-bottom:20px;';
            const gestLabel = document.createElement('label');
            gestLabel.style.cssText = 'display:flex;align-items:center;gap:8px;cursor:pointer;';
            const gestCheck = document.createElement('input');
            gestCheck.type = 'checkbox';
            gestCheck.checked = chainSettings.gesturesEnabled && !isMobileView;
            gestCheck.disabled = isMobileView;
            gestCheck.style.cssText = 'width:16px;height:16px;';
            gestCheck.onchange = () => {
                chainSettings.gesturesEnabled = gestCheck.checked;
                saveSettings();
                updateGesturesState();
            };
            const gestText = document.createElement('span');
            gestText.textContent = 'Включить жесты мышкой (свайп сверху/снизу)' + (isMobileView ? ' (отключено в мобильном режиме)' : '');
            gestLabel.appendChild(gestCheck);
            gestLabel.appendChild(gestText);
            gestDiv.appendChild(gestLabel);
            contentContainer.appendChild(gestDiv);

            const zoneHeightDiv = document.createElement('div');
            zoneHeightDiv.style.cssText = 'margin-bottom:16px;';
            const zoneHeightLabel = document.createElement('label');
            zoneHeightLabel.style.cssText = 'display:block;margin-bottom:8px;';
            const zoneHeightText = document.createElement('span');
            zoneHeightText.textContent = 'Высота зон жестов (пиксели):';
            zoneHeightLabel.appendChild(zoneHeightText);
            const zoneHeightSelect = document.createElement('select');
            zoneHeightSelect.style.cssText = `padding:6px 10px;background:${isDark ? '#111' : '#f5f5f5'};color:${isDark ? '#ccc' : '#333'};border:1px solid ${isDark ? '#444' : '#ccc'};border-radius:4px;font-size:${Math.round(14 * scale)}px;margin-top:4px;width:100%;box-sizing:border-box;`;
            for (let h = 50; h <= 200; h += 50) {
                const opt = document.createElement('option');
                opt.value = h;
                opt.textContent = h + 'px';
                if (chainSettings.gestureZoneHeight === h) opt.selected = true;
                zoneHeightSelect.appendChild(opt);
            }
            zoneHeightSelect.onchange = () => {
                chainSettings.gestureZoneHeight = parseInt(zoneHeightSelect.value);
                saveSettings();
                updateGesturesState();
            };
            zoneHeightLabel.appendChild(zoneHeightSelect);
            zoneHeightDiv.appendChild(zoneHeightLabel);
            contentContainer.appendChild(zoneHeightDiv);

            const highlightDiv = document.createElement('div');
            highlightDiv.style.cssText = 'margin-bottom:16px;';
            const highlightLabel = document.createElement('label');
            highlightLabel.style.cssText = 'display:block;margin-bottom:8px;';
            const highlightText = document.createElement('span');
            highlightText.textContent = 'Прозрачность подсветки зон при наведении:';
            highlightLabel.appendChild(highlightText);
            const highlightSelect = document.createElement('select');
            highlightSelect.style.cssText = `padding:6px 10px;background:${isDark ? '#111' : '#f5f5f5'};color:${isDark ? '#ccc' : '#333'};border:1px solid ${isDark ? '#444' : '#ccc'};border-radius:4px;font-size:${Math.round(14 * scale)}px;margin-top:4px;width:100%;box-sizing:border-box;`;
            for (let o = 0; o <= 100; o += 5) {
                const opt = document.createElement('option');
                opt.value = o;
                opt.textContent = o + '%';
                if (chainSettings.gestureHighlightOpacity === o) opt.selected = true;
                highlightSelect.appendChild(opt);
            }
            highlightSelect.onchange = () => {
                chainSettings.gestureHighlightOpacity = parseInt(highlightSelect.value);
                saveSettings();
            };
            highlightLabel.appendChild(highlightSelect);
            highlightDiv.appendChild(highlightLabel);
            contentContainer.appendChild(highlightDiv);

            const modeDiv = document.createElement('div');
            modeDiv.style.cssText = 'margin-bottom:16px;';
            const modeTitle = document.createElement('div');
            modeTitle.textContent = 'Режим отображения цепочек:';
            modeTitle.style.cssText = 'font-weight:bold;margin-bottom:8px;';
            modeDiv.appendChild(modeTitle);

            const modes = [
                { val: 'dim', text: 'Затенять комментарии вне цепочки' },
                { val: 'cut', text: 'Полностью вырезать и скрывать комментарии' }
            ];

            modes.forEach(m => {
                const lbl = document.createElement('label');
                lbl.style.cssText = 'display:flex;align-items:center;gap:8px;cursor:pointer;margin-bottom:6px;';
                const radio = document.createElement('input');
                radio.type = 'radio';
                radio.name = 'lor-chain-mode';
                radio.value = m.val;
                radio.checked = chainSettings.chainMode === m.val;
                radio.style.cssText = 'width:16px;height:16px;';
                radio.onchange = () => {
                    chainSettings.chainMode = m.val;
                    saveSettings();
                };
                const txt = document.createElement('span');
                txt.textContent = m.text;
                lbl.appendChild(radio);
                lbl.appendChild(txt);
                modeDiv.appendChild(lbl);
            });
            contentContainer.appendChild(modeDiv);

            const hint = document.createElement('div');
            hint.style.cssText = `margin-top:20px;padding:10px;font-size:${Math.round(12 * scale)}px;color:${isDark ? '#888' : '#666'};background:${isDark ? '#1a1a2e' : '#f5f5f5'};border-radius:4px;`;
            hint.innerHTML = '<b>Как пользоваться:</b><br>• <b>ЛКМ по заголовку:</b> Показать цепочку ответов. Повторный клик по цепочке — свернуть. Клик по другой ветке — переключить.<br>• <b>ПКМ (или долгое нажатие) по заголовку:</b> Открыть модальное окно со всей цепочкой.<br>• <b>Жесты:</b> Зажмите ЛКМ в зоне сверху/снизу и потяните.<br>• <b>Клик по зоне:</b> Клик по верхней зоне — прокрутка вверх, по нижней — вниз.';
            contentContainer.appendChild(hint);
        }

        tabChain.onclick = function() {
            Array.from(tabsContainer.children).forEach(t => {
                t.style.borderBottomColor = 'transparent';
                t.style.color = isDark ? '#888' : '#666';
                t.style.fontWeight = 'normal';
            });
            tabChain.style.borderBottomColor = '#4a90d9';
            tabChain.style.color = '#4a90d9';
            tabChain.style.fontWeight = 'bold';
            renderChainTab();
        };
    }

    function findParentId(msgEl) {
        const titleDiv = msgEl.querySelector('div.title');
        if (!titleDiv) return null;
        const replyLink = titleDiv.querySelector('a[href*="cid="], a[href*="lastmod="], a[href^="#comment-"]');
        if (replyLink) {
            const match = replyLink.href.match(/(?:cid=|lastmod=|#comment-)(\d+)/);
            if (match) {
                const id = match[1];
                const parentEl = document.getElementById('comment-' + id) || document.getElementById('topic-' + id);
                return parentEl ? parentEl.id : null;
            }
        }
        return null;
    }

    function findChildrenIds(id) {
        const children = [];
        const cleanId = id.replace(/^(comment-|topic-)/, '');
        const selectors = [
            `article.msg div.title a[href*="cid=${cleanId}"]`,
            `article.msg div.title a[href*="lastmod=${cleanId}"]`,
            `article.msg div.title a[href="#comment-${cleanId}"]`,
            `article.msg div.title a[href*="?cid=${cleanId}"]`,
            `article.msg div.title a[href*="?lastmod=${cleanId}"]`
        ];
        const seen = new Set();
        selectors.forEach(sel => {
            document.querySelectorAll(sel).forEach(link => {
                const childMsg = link.closest('article.msg');
                if (childMsg && !seen.has(childMsg.id)) {
                    seen.add(childMsg.id);
                    children.push(childMsg.id);
                }
            });
        });
        return children;
    }

    function buildChain(startId) {
        const upPath = [];
        let current = document.getElementById(startId);
        while (current) {
            upPath.unshift(current.id);
            const parentId = findParentId(current);
            if (!parentId) break;
            current = document.getElementById(parentId);
        }

        const downPath = [];
        const queue = [startId];
        const visited = new Set();

        while (queue.length > 0) {
            const id = queue.shift();
            if (visited.has(id)) continue;
            visited.add(id);
            downPath.push(id);

            const children = findChildrenIds(id);
            children.forEach(childId => {
                if (!visited.has(childId)) queue.push(childId);
            });
        }

        const fullPath = [...upPath];
        downPath.forEach(id => {
            if (!fullPath.includes(id)) fullPath.push(id);
        });

        return fullPath;
    }

    function applyChainView(chainIds) {
        const mode = chainSettings.chainMode;
        document.querySelectorAll('article.msg').forEach(m => {
            m.style.transition = 'opacity 0.3s, filter 0.3s';
            if (chainIds.includes(m.id)) {
                m.style.opacity = '1';
                m.style.filter = 'none';
                m.style.display = '';
                m.style.border = '2px solid #4CAF50';
                m.style.borderRadius = '4px';
            } else {
                if (mode === 'cut') {
                    m.style.display = 'none';
                } else {
                    m.style.opacity = '0.15';
                    m.style.filter = 'grayscale(100%)';
                    m.style.border = 'none';
                }
            }
        });
    }

    function restoreChainView() {
        document.querySelectorAll('article.msg').forEach(m => {
            m.style.transition = 'opacity 0.3s, filter 0.3s';
            m.style.opacity = '1';
            m.style.filter = 'none';
            m.style.display = '';
            m.style.border = '';
            m.style.borderRadius = '';
        });
    }

    function scrollToElement(id) {
        const el = document.getElementById(id);
        if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            el.style.transition = 'outline 0.3s';
            el.style.outline = '3px solid #4a90d9';
            setTimeout(() => { el.style.outline = ''; }, 2000);
        }
    }

    function initChainLogic() {
        let longPressTimer = null;
        let longPressTriggered = false;

        document.addEventListener('click', function(e) {
            if (longPressTriggered) {
                e.preventDefault();
                e.stopPropagation();
                longPressTriggered = false;
                return;
            }

            const title = e.target.closest('article.msg div.title');
            if (!title || e.target.closest('a')) return;

            const msg = title.closest('article.msg');
            if (!msg) return;
            const msgId = msg.id;

            if (chainState.active) {
                if (chainState.chainIds.includes(msgId)) {
                    restoreChainView();
                    scrollToElement(chainState.firstClickedId);
                    chainState.active = false;
                } else {
                    restoreChainView();
                    activateChain(msgId);
                }
            } else {
                activateChain(msgId);
            }
        });

        document.addEventListener('contextmenu', function(e) {
            const title = e.target.closest('article.msg div.title');
            if (!title || e.target.closest('a')) return;

            e.preventDefault();
            const msg = title.closest('article.msg');
            if (msg) showChainModal(msg.id);
        });

        document.addEventListener('mousedown', function(e) {
            if (e.button !== 0) return;
            const title = e.target.closest('article.msg div.title');
            const inGestureZone = checkGestureZone(e.clientX, e.clientY);

            if (title && !e.target.closest('a') && !inGestureZone) {
                const msg = title.closest('article.msg');
                if (msg) {
                    longPressTriggered = false;
                    longPressTimer = setTimeout(() => {
                        longPressTriggered = true;
                        showChainModal(msg.id);
                    }, 600);
                }
            }
        });

        document.addEventListener('mouseup', function() {
            clearTimeout(longPressTimer);
        });

        document.addEventListener('mousemove', function(e) {
            if (longPressTimer && (Math.abs(e.movementX) > 5 || Math.abs(e.movementY) > 5)) {
                clearTimeout(longPressTimer);
                longPressTimer = null;
            }
        });
    }

    function activateChain(msgId) {
        chainState.firstClickedId = msgId;
        chainState.chainIds = buildChain(msgId);
        applyChainView(chainState.chainIds);
        chainState.active = true;
    }

    function showChainModal(startId) {
        const chainIds = buildChain(startId);
        const isDark = isDarkTheme();
        const scale = isPanelPresent ? panelModalScale : 1;
        const colors = getThemeColors();

        const overlay = document.createElement('div');
        overlay.id = 'lor-chain-modal-overlay';
        overlay.style.cssText = `position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.6);z-index:100005;display:flex;align-items:center;justify-content:center;padding:10px;box-sizing:border-box;`;

        const modal = document.createElement('div');
        modal.style.cssText = `background:${colors.bg};border:1px solid ${colors.border};padding:${Math.round(24 * scale)}px;border-radius:${Math.round(8 * scale)}px;width:100%;max-width:${Math.round(800 * scale)}px;max-height:85vh;box-sizing:border-box;color:${colors.text};font-family:Arial,sans-serif;font-size:${Math.round(14 * scale)}px;box-shadow:0 0 30px rgba(0,0,0,0.5);display:flex;flex-direction:column;overflow:hidden;`;

        const header = document.createElement('div');
        header.style.cssText = `display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;padding-bottom:8px;border-bottom:1px solid ${colors.border};flex-shrink:0;`;

        const titleEl = document.createElement('div');
        titleEl.textContent = `Цепочка ответов (${chainIds.length} сообщ.)`;
        titleEl.style.cssText = `font-size:${Math.round(16 * scale)}px;font-weight:bold;color:${colors.accent};`;

        const closeBtn = document.createElement('div');
        closeBtn.textContent = '✕';
        closeBtn.style.cssText = `cursor:pointer;font-size:${Math.round(20 * scale)}px;color:${isDark ? '#888' : '#666'};padding:0 4px;`;
        closeBtn.onclick = () => overlay.remove();

        header.appendChild(titleEl);
        header.appendChild(closeBtn);
        modal.appendChild(header);

        const contentDiv = document.createElement('div');
        contentDiv.style.cssText = `overflow-y:auto;flex:1;padding-right:4px;`;

        chainIds.forEach(id => {
            const origMsg = document.getElementById(id);
            if (!origMsg) return;

            const clone = origMsg.cloneNode(true);
            clone.style.cssText = 'margin-bottom:15px;padding:10px;border:1px solid ' + (isDark ? '#333' : '#ddd') + ';border-radius:4px;cursor:pointer;transition:background 0.2s;';
            clone.onmouseenter = () => clone.style.background = isDark ? '#1a1a2e' : '#f5f5f5';
            clone.onmouseleave = () => clone.style.background = '';

            clone.querySelectorAll('.reply, .btn-group, .actions, a[href*="reply"], a[href*="moderate"]').forEach(el => el.remove());

            clone.onclick = () => {
                overlay.remove();
                setTimeout(() => scrollToElement(id), 100);
            };

            contentDiv.appendChild(clone);
        });

        modal.appendChild(contentDiv);
        overlay.appendChild(modal);
        document.body.appendChild(overlay);

        overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
    }

    let gestureZones = { top: null, bottom: null };
    let gestureActive = false;
    let gestureStartY = 0;
    let gestureStartX = 0;
    let gestureDirection = null;

    function checkGestureZone(x, y) {
        const w = window.innerWidth;
        const h = window.innerHeight;
        const zoneH = chainSettings.gestureZoneHeight;
        if (x < 30 || x > w - 30) return false;
        return y < zoneH || y > h - zoneH;
    }

    function initGestures() {
        gestureZones.top = document.createElement('div');
        gestureZones.top.id = 'lor-gesture-zone-top';
        gestureZones.top.style.cssText = 'position:fixed;top:0;left:0;width:100%;z-index:9998;pointer-events:none;transition:background 0.2s;';

        gestureZones.bottom = document.createElement('div');
        gestureZones.bottom.id = 'lor-gesture-zone-bottom';
        gestureZones.bottom.style.cssText = 'position:fixed;bottom:0;left:0;width:100%;z-index:9998;pointer-events:none;transition:background 0.2s;';

        document.body.appendChild(gestureZones.top);
        document.body.appendChild(gestureZones.bottom);

        document.addEventListener('mousedown', handleGestureStart);
        document.addEventListener('mousemove', handleGestureMove);
        document.addEventListener('mouseup', handleGestureEnd);
        document.addEventListener('click', handleGestureClick);

        document.addEventListener('touchstart', handleTouchStart, { passive: false });
        document.addEventListener('touchmove', handleTouchMove, { passive: false });
        document.addEventListener('touchend', handleGestureEnd);

        document.addEventListener('mousemove', handleGestureHover);

        updateGesturesState();
    }

    function handleGestureClick(e) {
        if (!chainSettings.gesturesEnabled || isMobileView) return;
        if (e.button !== 0) return;
        if (gestureActive) return;

        const x = e.clientX, y = e.clientY, w = window.innerWidth, h = window.innerHeight;
        const zoneH = chainSettings.gestureZoneHeight;

        if (x < 30 || x > w - 30) return;

        if (y < zoneH) {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        } else if (y > h - zoneH) {
            const comments = document.querySelectorAll('article.msg');
            if (comments.length > 0) {
                comments[comments.length - 1].scrollIntoView({ behavior: 'smooth', block: 'end' });
            } else {
                window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
            }
        }
    }

    function handleGestureHover(e) {
        if (!chainSettings.gesturesEnabled || isMobileView || gestureActive) return;
        const x = e.clientX, y = e.clientY, w = window.innerWidth, h = window.innerHeight;
        const zoneH = chainSettings.gestureZoneHeight;
        const opacity = chainSettings.gestureHighlightOpacity / 100;
        const inTop = y < zoneH && x > 30 && x < w - 30;
        const inBottom = y > h - zoneH && x > 30 && x < w - 30;

        if (inTop) {
            gestureZones.top.style.background = `rgba(74, 144, 217, ${opacity})`;
            gestureZones.top.style.height = zoneH + 'px';
            gestureZones.bottom.style.background = 'transparent';
        } else if (inBottom) {
            gestureZones.bottom.style.background = `rgba(74, 144, 217, ${opacity})`;
            gestureZones.bottom.style.height = zoneH + 'px';
            gestureZones.top.style.background = 'transparent';
        } else {
            gestureZones.top.style.background = 'transparent';
            gestureZones.bottom.style.background = 'transparent';
        }
    }

    function updateGesturesState() {
        const enabled = chainSettings.gesturesEnabled && !isMobileView;
        const zoneH = chainSettings.gestureZoneHeight;
        if (gestureZones.top) {
            gestureZones.top.style.display = enabled ? 'block' : 'none';
            gestureZones.top.style.height = zoneH + 'px';
        }
        if (gestureZones.bottom) {
            gestureZones.bottom.style.display = enabled ? 'block' : 'none';
            gestureZones.bottom.style.height = zoneH + 'px';
        }
        if (!enabled) {
            gestureZones.top.style.background = 'transparent';
            gestureZones.bottom.style.background = 'transparent';
        }
    }

    function handleGestureStart(e) {
        if (!chainSettings.gesturesEnabled || isMobileView) return;
        if (e.button !== 0) return;

        const y = e.clientY;
        const x = e.clientX;

        if (checkGestureZone(x, y)) {
            gestureActive = true;
            gestureStartY = y;
            gestureStartX = x;
            gestureDirection = null;
            document.body.style.userSelect = 'none';
            document.body.style.webkitUserSelect = 'none';
        }
    }

    function handleGestureMove(e) {
        if (!gestureActive) return;

        const deltaY = e.clientY - gestureStartY;

        if (Math.abs(deltaY) > 30 && !gestureDirection) {
            gestureDirection = deltaY > 0 ? 'down' : 'up';
            executeGesture(gestureDirection);
        }
    }

    function handleGestureEnd() {
        if (gestureActive) {
            gestureActive = false;
            gestureDirection = null;
            document.body.style.userSelect = '';
            document.body.style.webkitUserSelect = '';
        }
    }

    function handleTouchStart(e) {
        if (!chainSettings.gesturesEnabled || isMobileView) return;
        if (e.touches.length !== 1) return;

        const y = e.touches[0].clientY;
        const x = e.touches[0].clientX;

        if (checkGestureZone(x, y)) {
            gestureActive = true;
            gestureStartY = y;
            gestureStartX = x;
            gestureDirection = null;
        }
    }

    function handleTouchMove(e) {
        if (!gestureActive) return;

        const deltaY = e.touches[0].clientY - gestureStartY;

        if (Math.abs(deltaY) > 30 && !gestureDirection) {
            gestureDirection = deltaY > 0 ? 'down' : 'up';
            executeGesture(gestureDirection);
            e.preventDefault();
        }
    }

    function executeGesture(direction) {
        const bhv = 'smooth';
        if (direction === 'up') {
            window.scrollTo({ top: 0, behavior: bhv });
        } else if (direction === 'down') {
            const comments = document.querySelectorAll('article.msg');
            if (comments.length > 0) {
                comments[comments.length - 1].scrollIntoView({ behavior: bhv, block: 'end' });
            } else {
                window.scrollTo({ top: document.body.scrollHeight, behavior: bhv });
            }
        }
    }

    loadSettings();

})();