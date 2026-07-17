// ==UserScript==
// @name         NSLorSound
// @namespace    test
// @version      2.9.2
// @description  Sound notifications for linux.org.ru
// @match        https://www.linux.org.ru/*
// @grant        none
// @inject-into  content
// @run-at       document-idle
// ==/UserScript==

(function() {
    'use strict';

    const SOUND_SETTINGS_KEY = 'lor_sound_settings';
    const defaultSounds = {
        reaction: null,
        reply: null,
        mention: null,
        deleted: null,
        newComment: null
    };

    let soundSettings = loadSettings();
    let audioContext = null;
    let panelModalScale = 1;
    let isDark = false;
    let isMobileView = false;
    let lastCount = 0;
    let notificationObserver = null;
    let settingsInjected = false;
    let soundCache = {};
    let newCommentFound = false;
    let newCommentObserver = null;
    let audioUnlocked = false;
    let unlockBanner = null;
    let showWarning = loadShowWarning();

    function log(msg, data) {
        const prefix = '[NSLorSound]';
        if (data !== undefined) {
            console.log(prefix, msg, data);
        } else {
            console.log(prefix, msg);
        }
    }

    function loadSettings() {
        try {
            const saved = localStorage.getItem(SOUND_SETTINGS_KEY);
            if (saved) {
                const parsed = JSON.parse(saved);
                return { ...defaultSounds, ...parsed };
            }
        } catch (e) {}
        return { ...defaultSounds };
    }

    function saveSettings() {
        localStorage.setItem(SOUND_SETTINGS_KEY, JSON.stringify(soundSettings));
    }

    function loadShowWarning() {
        try {
            const saved = localStorage.getItem('lor_sound_show_warning');
            return saved !== null ? JSON.parse(saved) : true;
        } catch (e) {
            return true;
        }
    }

    function saveShowWarning(value) {
        localStorage.setItem('lor_sound_show_warning', JSON.stringify(value));
    }

    function fileToBase64(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }

    function base64ToArrayBuffer(base64) {
        const parts = base64.split(',');
        const binaryString = atob(parts[1]);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        return bytes.buffer;
    }

    function createUnlockBanner() {
        if (unlockBanner) return;
        if (!showWarning) return;
        
        updatePanelSettings();
        
        unlockBanner = document.createElement('div');
        unlockBanner.id = 'lor-sound-unlock-banner';
        unlockBanner.innerHTML = '🔊 Кликните для звука';
        unlockBanner.style.cssText = `
            position: fixed;
            top: 20px;
            left: 50%;
            transform: translateX(-50%);
            background: ${isDark ? '#1a3a1a' : '#2d5a27'};
            color: #fff;
            text-align: center;
            padding: 10px 24px;
            font-size: 13px;
            font-family: Arial, sans-serif;
            z-index: 100000;
            cursor: pointer;
            border-radius: 20px;
            box-shadow: 0 2px 12px rgba(0,0,0,0.3);
            border: 1px solid ${isDark ? '#3a6a3a' : '#4CAF50'};
            transition: all 0.3s;
            white-space: nowrap;
            user-select: none;
        `;

        unlockBanner.addEventListener('mouseenter', function() {
            this.style.background = isDark ? '#2a5a2a' : '#3d7a37';
            this.style.transform = 'translateX(-50%) scale(1.05)';
        });

        unlockBanner.addEventListener('mouseleave', function() {
            this.style.background = isDark ? '#1a3a1a' : '#2d5a27';
            this.style.transform = 'translateX(-50%) scale(1)';
        });

        unlockBanner.addEventListener('click', function() {
            unlockAudio();
        });

        document.body.appendChild(unlockBanner);
        log('Плашка разблокировки показана');
    }

    function hideUnlockBanner() {
        if (unlockBanner) {
            unlockBanner.style.opacity = '0';
            unlockBanner.style.transform = 'translateX(-50%) translateY(-20px)';
            setTimeout(() => {
                if (unlockBanner && unlockBanner.parentNode) {
                    unlockBanner.parentNode.removeChild(unlockBanner);
                    unlockBanner = null;
                }
            }, 300);
        }
    }

    function unlockAudio() {
        if (!audioContext) {
            try {
                audioContext = new (window.AudioContext || window.webkitAudioContext)();
            } catch(e) {
                log('Ошибка создания AudioContext:', e);
                return;
            }
        }
        if (audioContext.state === 'suspended') {
            audioContext.resume().then(() => {
                if (audioContext.state === 'running') {
                    audioUnlocked = true;
                    log('✅ Аудио разблокировано');
                    hideUnlockBanner();
                }
            }).catch(() => {});
        } else if (audioContext.state === 'running') {
            audioUnlocked = true;
            hideUnlockBanner();
        }
    }

    function playSound(type) {
        const soundData = soundSettings[type];
        if (!soundData) {
            log(`Звук для "${type}" не настроен`);
            return;
        }

        if (!audioUnlocked) {
            log(`Аудио заблокировано, показываем плашку`);
            createUnlockBanner();
            return;
        }

        try {
            if (!audioContext) {
                audioContext = new (window.AudioContext || window.webkitAudioContext)();
            }

            if (audioContext.state === 'suspended') {
                audioContext.resume().then(() => {
                    playSoundInternal(type, soundData);
                }).catch(() => {});
            } else {
                playSoundInternal(type, soundData);
            }
        } catch (e) {}
    }

    function playSoundInternal(type, soundData) {
        try {
            if (soundCache[type]) {
                playFromBuffer(soundCache[type], type);
                return;
            }

            const arrayBuffer = base64ToArrayBuffer(soundData);
            audioContext.decodeAudioData(arrayBuffer, function(audioBuffer) {
                soundCache[type] = audioBuffer;
                playFromBuffer(audioBuffer, type);
            }, function(err) {
                log(`Ошибка декодирования звука "${type}":`, err);
            });
        } catch (e) {}
    }

    function playFromBuffer(buffer, type) {
        try {
            const source = audioContext.createBufferSource();
            source.buffer = buffer;
            source.connect(audioContext.destination);
            source.start(0);
            log(`🔊 Воспроизведен звук: ${type}`);
        } catch (e) {}
    }

    function getPanelSettings() {
        try {
            const saved = localStorage.getItem('lor_panel_settings_v3');
            if (saved) {
                const parsed = JSON.parse(saved);
                return parsed;
            }
        } catch(e) {}
        return null;
    }

    function updatePanelSettings() {
        const settings = getPanelSettings();
        if (settings) {
            panelModalScale = (settings.general.modalScale || 100) / 100;
            isMobileView = settings.general.mobileView || false;
        }

        const links = document.querySelectorAll('link[rel="stylesheet"]');
        let theme = 'black';
        for (let i = 0; i < links.length; i++) {
            const m = links[i].href.match(/\/([^/]+)\/combined\.css/);
            if (m) { theme = m[1]; break; }
        }
        isDark = theme === 'black' || theme === 'tango';
    }

    function getNotificationType(row) {
        const firstCell = row.querySelector('td:first-child');
        if (!firstCell) return 'unknown';

        const allElements = firstCell.querySelectorAll('*');
        for (const el of allElements) {
            const title = (el.getAttribute('title') || '').toLowerCase();
            if (title.includes('удален') || title.includes('удалено') || 
                title.includes('нарушение') || title.includes('delete')) {
                return 'deleted';
            }
        }

        const icons = firstCell.querySelectorAll('i');
        for (const icon of icons) {
            const cls = (icon.className || '').toLowerCase();
            const title = (icon.getAttribute('title') || '').toLowerCase();

            if (title.includes('ответ') || cls.includes('icon-reply')) return 'reply';
            if (cls.includes('icon-user')) return 'mention';
            if (title.includes('упоминание') || cls.includes('icon-mention')) return 'mention';
            if (title.includes('нарушение') || cls.includes('icon-violation')) return 'deleted';
        }

        const imgs = firstCell.querySelectorAll('img');
        for (const img of imgs) {
            const title = (img.getAttribute('title') || '').toLowerCase();
            if (title.includes('удалено') || title.includes('удален')) return 'deleted';

            const src = img.src || '';
            if (src.includes('twemoji') || src.includes('emoji')) {
                return 'reaction';
            }
        }

        const text = firstCell.textContent.trim();
        if (text && text.length > 0) {
            return 'reaction';
        }

        return 'unknown';
    }

    function startNotificationMonitoring() {
        const counter = document.getElementById('main_events_count');
        if (!counter) {
            setTimeout(startNotificationMonitoring, 1000);
            return;
        }

        lastCount = parseInt(counter.textContent.replace(/[^0-9]/g, '')) || 0;

        if (notificationObserver) {
            notificationObserver.disconnect();
            notificationObserver = null;
        }

        notificationObserver = new MutationObserver(function() {
            const text = counter.textContent.replace(/[^0-9]/g, '');
            const currentCount = parseInt(text) || 0;

            if (currentCount > lastCount) {
                log(`📨 Новое уведомление! Счетчик: ${lastCount} → ${currentCount}`);
                unlockAudio();
                fetchAndPlay();
                lastCount = currentCount;
            } else {
                lastCount = currentCount;
            }
        });

        notificationObserver.observe(counter, {
            characterData: true,
            childList: true,
            subtree: true,
            attributes: true
        });

        const parent = counter.parentElement;
        if (parent) {
            const parentObserver = new MutationObserver(function() {
                const newCounter = document.getElementById('main_events_count');
                if (newCounter && newCounter !== counter) {
                    notificationObserver.disconnect();
                    startNotificationMonitoring();
                }
            });
            parentObserver.observe(parent, { childList: true, subtree: true });
        }
    }

    function fetchAndPlay() {
        fetch('https://www.linux.org.ru/notifications')
            .then(r => r.text())
            .then(html => {
                const parser = new DOMParser();
                const doc = parser.parseFromString(html, 'text/html');
                const rows = doc.querySelectorAll('table.message-table tbody tr');

                if (rows.length > 0) {
                    const type = getNotificationType(rows[0]);
                    log(`Определен тип уведомления: ${type}`);
                    if (type !== 'unknown') {
                        playSound(type);
                    }
                }
            })
            .catch((err) => {
                log('Ошибка загрузки уведомлений:', err);
            });
    }

    function startNewCommentMonitoring() {
        newCommentFound = false;

        if (newCommentObserver) {
            newCommentObserver.disconnect();
            newCommentObserver = null;
        }

        function checkNewComment() {
            const targetText = 'Был добавлен новый комментарий';
            const realtimeEl = document.getElementById('realtime');
            if (realtimeEl && realtimeEl.textContent && realtimeEl.textContent.includes(targetText)) {
                if (!newCommentFound) {
                    newCommentFound = true;
                    log('💬 Новый комментарий на странице');
                    unlockAudio();
                    playSound('newComment');
                }
                return true;
            }
            return false;
        }

        checkNewComment();

        const realtimeEl = document.getElementById('realtime');
        if (!realtimeEl) {
            setTimeout(startNewCommentMonitoring, 1000);
            return;
        }

        newCommentObserver = new MutationObserver(function(mutations) {
            mutations.forEach(function(mutation) {
                if (mutation.type === 'childList') {
                    mutation.addedNodes.forEach(function(node) {
                        if (node.nodeType === Node.TEXT_NODE) {
                            if (node.textContent && node.textContent.includes('Был добавлен новый комментарий')) {
                                if (!newCommentFound) {
                                    newCommentFound = true;
                                    log('💬 Новый комментарий на странице');
                                    unlockAudio();
                                    playSound('newComment');
                                }
                            }
                        }
                        if (node.nodeType === Node.ELEMENT_NODE) {
                            if (node.textContent && node.textContent.includes('Был добавлен новый комментарий')) {
                                if (!newCommentFound) {
                                    newCommentFound = true;
                                    log('💬 Новый комментарий на странице');
                                    unlockAudio();
                                    playSound('newComment');
                                }
                            }
                        }
                    });
                }
                if (mutation.type === 'characterData') {
                    if (mutation.target && mutation.target.textContent && mutation.target.textContent.includes('Был добавлен новый комментарий')) {
                        if (!newCommentFound) {
                            newCommentFound = true;
                            log('💬 Новый комментарий на странице');
                            unlockAudio();
                            playSound('newComment');
                        }
                    }
                }
            });
        });

        newCommentObserver.observe(realtimeEl, {
            characterData: true,
            childList: true,
            subtree: true,
            attributes: true
        });
    }

    function initPanelIntegration() {
        updatePanelSettings();

        const observer = new MutationObserver((mutations) => {
            for (const m of mutations) {
                for (const node of m.addedNodes) {
                    if (node.id === 'lor-settings-overlay') {
                        settingsInjected = false;
                        injectSoundTab(node);
                    }
                }
            }
        });
        observer.observe(document.body, { childList: true });

        const existingOverlay = document.getElementById('lor-settings-overlay');
        if (existingOverlay) {
            injectSoundTab(existingOverlay);
        }
    }

    function injectSoundTab(overlay) {
        if (overlay.querySelector('#lor-sound-tab')) {
            return;
        }

        updatePanelSettings();

        const generalTab = overlay.querySelector('#lor-settings-tab-general');
        if (!generalTab) {
            return;
        }

        const tabsContainer = generalTab.parentNode;
        const contentContainer = overlay.querySelector('#lor-settings-tab-content');
        if (!tabsContainer || !contentContainer) {
            return;
        }

        const scale = panelModalScale;

        const tab = document.createElement('div');
        tab.id = 'lor-sound-tab';
        tab.textContent = '🔊 Звуки';
        tab.style.cssText = `
            padding: 8px 16px;
            cursor: pointer;
            border-bottom: 2px solid transparent;
            color: ${isDark ? '#888' : '#666'};
            font-size: ${Math.round(14 * scale)}px;
            transition: all 0.3s;
        `;

        tabsContainer.appendChild(tab);

        function renderSoundTab() {
            contentContainer.innerHTML = '';

            const types = [
                { key: 'reaction', label: '❤️ Реакция' },
                { key: 'reply', label: '💬 Ответ' },
                { key: 'mention', label: '📢 Упоминание' },
                { key: 'deleted', label: '🗑️ Удаление/Нарушение' },
                { key: 'newComment', label: '💬 Новый комментарий' }
            ];

            const title = document.createElement('div');
            title.textContent = '🔊 Настройка звуков уведомлений';
            title.style.cssText = `
                font-size: ${Math.round(18 * scale)}px;
                font-weight: bold;
                margin-bottom: 16px;
                padding-bottom: 8px;
                border-bottom: 1px solid ${isDark ? '#333' : '#ccc'};
                color: ${isDark ? '#ccc' : '#333'};
            `;
            contentContainer.appendChild(title);

            const desc = document.createElement('div');
            desc.textContent = 'Выберите звуковые файлы для каждого типа уведомления.';
            desc.style.cssText = `
                margin-bottom: 16px;
                color: ${isDark ? '#888' : '#666'};
                font-size: ${Math.round(13 * scale)}px;
                line-height: 1.5;
            `;
            contentContainer.appendChild(desc);

            types.forEach(t => {
                const hasSound = !!soundSettings[t.key];
                const name = hasSound ? '✅ Выбран' : '❌ Не выбран';

                const row = document.createElement('div');
                row.style.cssText = `
                    background: ${isDark ? '#0d0d1a' : '#f9f9f9'};
                    border: 1px solid ${isDark ? '#2a2a3a' : '#e0e0e0'};
                    border-radius: ${Math.round(8 * scale)}px;
                    padding: ${Math.round(12 * scale)}px ${Math.round(16 * scale)}px;
                    margin-bottom: ${Math.round(10 * scale)}px;
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    flex-wrap: wrap;
                    gap: 10px;
                `;

                const label = document.createElement('span');
                label.textContent = t.label;
                label.style.cssText = `
                    font-weight: bold;
                    color: ${isDark ? '#ccc' : '#333'};
                    font-size: ${Math.round(14 * scale)}px;
                `;
                row.appendChild(label);

                const fileName = document.createElement('span');
                fileName.textContent = name;
                fileName.style.cssText = `
                    font-size: ${Math.round(12 * scale)}px;
                    color: ${hasSound ? '#4CAF50' : (isDark ? '#888' : '#999')};
                    background: ${isDark ? '#1a1a2e' : '#f0f0f0'};
                    padding: 2px 10px;
                    border-radius: 12px;
                    border: 1px solid ${isDark ? '#333' : '#ddd'};
                `;
                row.appendChild(fileName);

                const btnGroup = document.createElement('div');
                btnGroup.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap;';

                const selectBtn = document.createElement('button');
                selectBtn.textContent = '📁';
                selectBtn.title = 'Выбрать звуковой файл';
                selectBtn.setAttribute('data-type', t.key);
                selectBtn.className = 'lor-sound-select';
                selectBtn.style.cssText = `
                    width: ${Math.round(32 * scale)}px;
                    height: ${Math.round(32 * scale)}px;
                    background: #0a3d6b;
                    color: #ddd;
                    border: 1px solid #1a5a9a;
                    border-radius: ${Math.round(4 * scale)}px;
                    cursor: pointer;
                    font-size: ${Math.round(16 * scale)}px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    transition: background 0.2s;
                `;
                selectBtn.onmouseenter = function() { this.style.background = '#0a4d7b'; };
                selectBtn.onmouseleave = function() { this.style.background = '#0a3d6b'; };
                selectBtn.onclick = function() {
                    const type = this.getAttribute('data-type');
                    const input = document.createElement('input');
                    input.type = 'file';
                    input.accept = 'audio/*';
                    input.onchange = async function() {
                        if (this.files && this.files[0]) {
                            try {
                                const file = this.files[0];
                                const base64 = await fileToBase64(file);
                                soundSettings[type] = base64;
                                saveSettings();
                                delete soundCache[type];
                                fileName.textContent = '✅ Выбран';
                                fileName.style.color = '#4CAF50';
                                log(`Звук для "${type}" обновлен`);
                            } catch (e) {}
                        }
                    };
                    input.click();
                };
                btnGroup.appendChild(selectBtn);

                const clearBtn = document.createElement('button');
                clearBtn.textContent = '✕';
                clearBtn.title = 'Очистить звук';
                clearBtn.setAttribute('data-type', t.key);
                clearBtn.className = 'lor-sound-clear';
                clearBtn.style.cssText = `
                    width: ${Math.round(32 * scale)}px;
                    height: ${Math.round(32 * scale)}px;
                    background: ${isDark ? '#2a2a3a' : '#e0e0e0'};
                    color: ${isDark ? '#aaa' : '#666'};
                    border: 1px solid ${isDark ? '#444' : '#ccc'};
                    border-radius: ${Math.round(4 * scale)}px;
                    cursor: pointer;
                    font-size: ${Math.round(14 * scale)}px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    transition: background 0.2s;
                `;
                clearBtn.onmouseenter = function() { this.style.background = isDark ? '#3a3a4a' : '#d0d0d0'; };
                clearBtn.onmouseleave = function() { this.style.background = isDark ? '#2a2a3a' : '#e0e0e0'; };
                clearBtn.onclick = function() {
                    const type = this.getAttribute('data-type');
                    soundSettings[type] = null;
                    saveSettings();
                    delete soundCache[type];
                    fileName.textContent = '❌ Не выбран';
                    fileName.style.color = isDark ? '#888' : '#999';
                    log(`Звук для "${type}" очищен`);
                };
                btnGroup.appendChild(clearBtn);

                const testBtn = document.createElement('button');
                testBtn.textContent = '▶';
                testBtn.title = 'Тест звука';
                testBtn.setAttribute('data-type', t.key);
                testBtn.className = 'lor-sound-test';
                testBtn.style.cssText = `
                    width: ${Math.round(32 * scale)}px;
                    height: ${Math.round(32 * scale)}px;
                    background: ${isDark ? '#1a2a3a' : '#f0f0f0'};
                    color: ${isDark ? '#aaa' : '#666'};
                    border: 1px solid ${isDark ? '#444' : '#ccc'};
                    border-radius: ${Math.round(4 * scale)}px;
                    cursor: pointer;
                    font-size: ${Math.round(14 * scale)}px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    transition: background 0.2s;
                `;
                testBtn.onmouseenter = function() { this.style.background = isDark ? '#2a3a4a' : '#e0e0e0'; };
                testBtn.onmouseleave = function() { this.style.background = isDark ? '#1a2a3a' : '#f0f0f0'; };
                testBtn.onclick = function() {
                    const type = this.getAttribute('data-type');
                    if (!soundSettings[type]) {
                        alert('Сначала выберите звуковой файл!');
                        return;
                    }
                    unlockAudio();
                    playSound(type);
                };
                btnGroup.appendChild(testBtn);

                row.appendChild(btnGroup);
                contentContainer.appendChild(row);
            });

            const warningDiv = document.createElement('div');
            warningDiv.style.cssText = `
                margin-top: ${Math.round(16 * scale)}px;
                padding: ${Math.round(12 * scale)}px ${Math.round(16 * scale)}px;
                background: ${isDark ? '#0d0d1a' : '#f9f9f9'};
                border: 1px solid ${isDark ? '#2a2a3a' : '#e0e0e0'};
                border-radius: ${Math.round(8 * scale)}px;
                display: flex;
                align-items: center;
                gap: 12px;
            `;

            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.id = 'lor-sound-show-warning';
            checkbox.checked = showWarning;
            checkbox.style.cssText = `
                width: ${Math.round(18 * scale)}px;
                height: ${Math.round(18 * scale)}px;
                cursor: pointer;
                accent-color: #4CAF50;
            `;
            checkbox.onchange = function() {
                showWarning = this.checked;
                saveShowWarning(showWarning);
                log(`Предупреждение ${showWarning ? 'включено' : 'выключено'}`);
                if (!showWarning) {
                    hideUnlockBanner();
                }
            };

            const checkboxLabel = document.createElement('label');
            checkboxLabel.htmlFor = 'lor-sound-show-warning';
            checkboxLabel.textContent = 'Отображать предупреждение о разблокировке звука';
            checkboxLabel.style.cssText = `
                color: ${isDark ? '#ccc' : '#333'};
                font-size: ${Math.round(13 * scale)}px;
                cursor: pointer;
                user-select: none;
            `;

            warningDiv.appendChild(checkbox);
            warningDiv.appendChild(checkboxLabel);
            contentContainer.appendChild(warningDiv);

            const saveDiv = document.createElement('div');
            saveDiv.style.cssText = `
                text-align: right;
                margin-top: ${Math.round(16 * scale)}px;
                padding-top: ${Math.round(12 * scale)}px;
                border-top: 1px solid ${isDark ? '#333' : '#ccc'};
            `;

            const saveBtn = document.createElement('button');
            saveBtn.textContent = '💾 Сохранить';
            saveBtn.style.cssText = `
                padding: ${Math.round(8 * scale)}px ${Math.round(24 * scale)}px;
                background: #0a3d6b;
                color: #ddd;
                border: 1px solid #1a5a9a;
                border-radius: ${Math.round(4 * scale)}px;
                cursor: pointer;
                font-size: ${Math.round(14 * scale)}px;
                transition: background 0.2s;
            `;
            saveBtn.onmouseenter = function() { this.style.background = '#0a4d7b'; };
            saveBtn.onmouseleave = function() { this.style.background = '#0a3d6b'; };
            saveBtn.onclick = function() {
                saveSettings();
                log('Настройки звуков сохранены');
                alert('✅ Настройки звуков сохранены!');
            };
            saveDiv.appendChild(saveBtn);
            contentContainer.appendChild(saveDiv);

            const hint = document.createElement('div');
            hint.style.cssText = `
                margin-top: ${Math.round(12 * scale)}px;
                padding: ${Math.round(10 * scale)}px;
                font-size: ${Math.round(12 * scale)}px;
                color: ${isDark ? '#666' : '#999'};
                background: ${isDark ? '#0d0d1a' : '#f5f5f5'};
                border-radius: ${Math.round(4 * scale)}px;
                border: 1px solid ${isDark ? '#2a2a3a' : '#e0e0e0'};
            `;
            hint.innerHTML = `
                <b>💡 Как это работает:</b><br>
                • Звуки хранятся в localStorage<br>
                • При появлении уведомления определяется его тип<br>
                • Воспроизводится выбранный звук<br>
                • Клик по странице разблокирует звук
            `;
            contentContainer.appendChild(hint);
        }

        tab.onclick = function() {
            Array.from(tabsContainer.children).forEach(t => {
                t.style.borderBottomColor = 'transparent';
                t.style.color = isDark ? '#888' : '#666';
                t.style.fontWeight = 'normal';
            });
            this.style.borderBottomColor = '#4a90d9';
            this.style.color = '#4a90d9';
            this.style.fontWeight = 'bold';
            renderSoundTab();
        };
    }

    function createOwnButton() {
        if (document.getElementById('lor-sound-own-btn')) return;

        updatePanelSettings();

        const btn = document.createElement('div');
        btn.id = 'lor-sound-own-btn';
        btn.textContent = '🔊';
        btn.title = 'Настройки звуков';
        btn.style.cssText = `
            position: fixed;
            bottom: 80px;
            right: 20px;
            width: 50px;
            height: 50px;
            background: ${isDark ? '#1a1a2e' : '#e8e8e8'};
            color: ${isDark ? '#c8c8c8' : '#333'};
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 24px;
            cursor: pointer;
            z-index: 9998;
            opacity: 0.8;
            transition: all 0.3s;
            box-shadow: 0 2px 8px rgba(0,0,0,0.3);
            user-select: none;
            border: 1px solid ${isDark ? '#444' : '#ccc'};
        `;

        btn.addEventListener('mouseenter', function() {
            this.style.opacity = '1';
            this.style.transform = 'scale(1.1)';
        });
        btn.addEventListener('mouseleave', function() {
            this.style.opacity = '0.8';
            this.style.transform = 'scale(1)';
        });
        btn.addEventListener('click', function() {
            unlockAudio();
            openSoundModal();
        });

        document.body.appendChild(btn);
    }

    function openSoundModal() {
        updatePanelSettings();
        const scale = panelModalScale;

        const overlay = document.createElement('div');
        overlay.id = 'lor-sound-modal-overlay';
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0,0,0,0.6);
            z-index: 100001;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
            box-sizing: border-box;
        `;

        const modal = document.createElement('div');
        modal.style.cssText = `
            background: ${isDark ? '#0a0a14' : '#fff'};
            border: 1px solid ${isDark ? '#333' : '#ccc'};
            border-radius: ${Math.round(8 * scale)}px;
            padding: ${Math.round(24 * scale)}px;
            width: 100%;
            max-width: ${Math.round(600 * scale)}px;
            max-height: 85vh;
            box-sizing: border-box;
            color: ${isDark ? '#ccc' : '#333'};
            font-family: Arial, sans-serif;
            font-size: ${Math.round(14 * scale)}px;
            box-shadow: 0 0 30px rgba(0,0,0,0.5);
            display: flex;
            flex-direction: column;
            overflow: hidden;
        `;

        const header = document.createElement('div');
        header.style.cssText = `
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 16px;
            padding-bottom: 8px;
            border-bottom: 1px solid ${isDark ? '#333' : '#ccc'};
            flex-shrink: 0;
        `;
        header.innerHTML = `
            <span style="font-size: ${Math.round(18 * scale)}px; font-weight: bold;">🔊 Настройка звуков</span>
            <span id="lor-sound-modal-close" style="cursor: pointer; font-size: ${Math.round(24 * scale)}px; color: #888; padding: 0 4px;">✕</span>
        `;
        modal.appendChild(header);

        const content = document.createElement('div');
        content.style.cssText = `
            overflow-y: auto;
            flex: 1;
            padding-right: 4px;
        `;
        modal.appendChild(content);

        overlay.appendChild(modal);
        document.body.appendChild(overlay);

        document.getElementById('lor-sound-modal-close').onclick = () => overlay.remove();
        overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };

        const types = [
            { key: 'reaction', label: '❤️ Реакция' },
            { key: 'reply', label: '💬 Ответ' },
            { key: 'mention', label: '📢 Упоминание' },
            { key: 'deleted', label: '🗑️ Удаление/Нарушение' },
            { key: 'newComment', label: '💬 Новый комментарий' }
        ];

        const title = document.createElement('div');
        title.textContent = 'Выберите звуковые файлы для каждого типа уведомления.';
        title.style.cssText = `margin-bottom:16px;color:${isDark ? '#888' : '#666'};font-size:${Math.round(13 * scale)}px;`;
        content.appendChild(title);

        types.forEach(t => {
            const hasSound = !!soundSettings[t.key];
            const name = hasSound ? '✅ Выбран' : '❌ Не выбран';

            const row = document.createElement('div');
            row.style.cssText = `
                background: ${isDark ? '#0d0d1a' : '#f9f9f9'};
                border: 1px solid ${isDark ? '#2a2a3a' : '#e0e0e0'};
                border-radius: ${Math.round(8 * scale)}px;
                padding: ${Math.round(12 * scale)}px ${Math.round(16 * scale)}px;
                margin-bottom: ${Math.round(10 * scale)}px;
                display: flex;
                align-items: center;
                justify-content: space-between;
                flex-wrap: wrap;
                gap: 10px;
            `;

            const label = document.createElement('span');
            label.textContent = t.label;
            label.style.cssText = `font-weight:bold;color:${isDark ? '#ccc' : '#333'};font-size:${Math.round(14 * scale)}px;`;
            row.appendChild(label);

            const fileName = document.createElement('span');
            fileName.textContent = name;
            fileName.style.cssText = `
                font-size: ${Math.round(12 * scale)}px;
                color: ${hasSound ? '#4CAF50' : (isDark ? '#888' : '#999')};
                background: ${isDark ? '#1a1a2e' : '#f0f0f0'};
                padding: 2px 10px;
                border-radius: 12px;
                border: 1px solid ${isDark ? '#333' : '#ddd'};
            `;
            row.appendChild(fileName);

            const btnGroup = document.createElement('div');
            btnGroup.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap;';

            const selectBtn = document.createElement('button');
            selectBtn.textContent = '📁';
            selectBtn.title = 'Выбрать звуковой файл';
            selectBtn.setAttribute('data-type', t.key);
            selectBtn.style.cssText = `
                width: ${Math.round(32 * scale)}px;
                height: ${Math.round(32 * scale)}px;
                background: #0a3d6b;
                color: #ddd;
                border: 1px solid #1a5a9a;
                border-radius: ${Math.round(4 * scale)}px;
                cursor: pointer;
                font-size: ${Math.round(16 * scale)}px;
                display: flex;
                align-items: center;
                justify-content: center;
                transition: background 0.2s;
            `;
            selectBtn.onmouseenter = function() { this.style.background = '#0a4d7b'; };
            selectBtn.onmouseleave = function() { this.style.background = '#0a3d6b'; };
            selectBtn.onclick = function() {
                const type = this.getAttribute('data-type');
                const input = document.createElement('input');
                input.type = 'file';
                input.accept = 'audio/*';
                input.onchange = async function() {
                    if (this.files && this.files[0]) {
                        try {
                            const file = this.files[0];
                            const base64 = await fileToBase64(file);
                            soundSettings[type] = base64;
                            saveSettings();
                            delete soundCache[type];
                            fileName.textContent = '✅ Выбран';
                            fileName.style.color = '#4CAF50';
                            log(`Звук для "${type}" обновлен`);
                        } catch (e) {}
                    }
                };
                input.click();
            };
            btnGroup.appendChild(selectBtn);

            const clearBtn = document.createElement('button');
            clearBtn.textContent = '✕';
            clearBtn.title = 'Очистить звук';
            clearBtn.setAttribute('data-type', t.key);
            clearBtn.style.cssText = `
                width: ${Math.round(32 * scale)}px;
                height: ${Math.round(32 * scale)}px;
                background: ${isDark ? '#2a2a3a' : '#e0e0e0'};
                color: ${isDark ? '#aaa' : '#666'};
                border: 1px solid ${isDark ? '#444' : '#ccc'};
                border-radius: ${Math.round(4 * scale)}px;
                cursor: pointer;
                font-size: ${Math.round(14 * scale)}px;
                display: flex;
                align-items: center;
                justify-content: center;
                transition: background 0.2s;
            `;
            clearBtn.onmouseenter = function() { this.style.background = isDark ? '#3a3a4a' : '#d0d0d0'; };
            clearBtn.onmouseleave = function() { this.style.background = isDark ? '#2a2a3a' : '#e0e0e0'; };
            clearBtn.onclick = function() {
                const type = this.getAttribute('data-type');
                soundSettings[type] = null;
                saveSettings();
                delete soundCache[type];
                fileName.textContent = '❌ Не выбран';
                fileName.style.color = isDark ? '#888' : '#999';
                log(`Звук для "${type}" очищен`);
            };
            btnGroup.appendChild(clearBtn);

            const testBtn = document.createElement('button');
            testBtn.textContent = '▶';
            testBtn.title = 'Тест звука';
            testBtn.setAttribute('data-type', t.key);
            testBtn.style.cssText = `
                width: ${Math.round(32 * scale)}px;
                height: ${Math.round(32 * scale)}px;
                background: ${isDark ? '#1a2a3a' : '#f0f0f0'};
                color: ${isDark ? '#aaa' : '#666'};
                border: 1px solid ${isDark ? '#444' : '#ccc'};
                border-radius: ${Math.round(4 * scale)}px;
                cursor: pointer;
                font-size: ${Math.round(14 * scale)}px;
                display: flex;
                align-items: center;
                justify-content: center;
                transition: background 0.2s;
            `;
            testBtn.onmouseenter = function() { this.style.background = isDark ? '#2a3a4a' : '#e0e0e0'; };
            testBtn.onmouseleave = function() { this.style.background = isDark ? '#1a2a3a' : '#f0f0f0'; };
            testBtn.onclick = function() {
                const type = this.getAttribute('data-type');
                if (!soundSettings[type]) {
                    alert('Сначала выберите звуковой файл!');
                    return;
                }
                unlockAudio();
                playSound(type);
            };
            btnGroup.appendChild(testBtn);

            row.appendChild(btnGroup);
            content.appendChild(row);
        });

        const warningDiv = document.createElement('div');
        warningDiv.style.cssText = `
            margin-top: ${Math.round(16 * scale)}px;
            padding: ${Math.round(12 * scale)}px ${Math.round(16 * scale)}px;
            background: ${isDark ? '#0d0d1a' : '#f9f9f9'};
            border: 1px solid ${isDark ? '#2a2a3a' : '#e0e0e0'};
            border-radius: ${Math.round(8 * scale)}px;
            display: flex;
            align-items: center;
            gap: 12px;
        `;

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.id = 'lor-sound-show-warning-modal';
        checkbox.checked = showWarning;
        checkbox.style.cssText = `
            width: ${Math.round(18 * scale)}px;
            height: ${Math.round(18 * scale)}px;
            cursor: pointer;
            accent-color: #4CAF50;
        `;
        checkbox.onchange = function() {
            showWarning = this.checked;
            saveShowWarning(showWarning);
            log(`Предупреждение ${showWarning ? 'включено' : 'выключено'}`);
            if (!showWarning) {
                hideUnlockBanner();
            }
        };

        const checkboxLabel = document.createElement('label');
        checkboxLabel.htmlFor = 'lor-sound-show-warning-modal';
        checkboxLabel.textContent = 'Отображать предупреждение о разблокировке звука';
        checkboxLabel.style.cssText = `
            color: ${isDark ? '#ccc' : '#333'};
            font-size: ${Math.round(13 * scale)}px;
            cursor: pointer;
            user-select: none;
        `;

        warningDiv.appendChild(checkbox);
        warningDiv.appendChild(checkboxLabel);
        content.appendChild(warningDiv);

        const saveDiv = document.createElement('div');
        saveDiv.style.cssText = `text-align:right;margin-top:${Math.round(16 * scale)}px;padding-top:${Math.round(12 * scale)}px;border-top:1px solid ${isDark ? '#333' : '#ccc'};`;

        const saveBtn = document.createElement('button');
        saveBtn.textContent = '💾 Сохранить';
        saveBtn.style.cssText = `
            padding: ${Math.round(8 * scale)}px ${Math.round(24 * scale)}px;
            background: #0a3d6b;
            color: #ddd;
            border: 1px solid #1a5a9a;
            border-radius: ${Math.round(4 * scale)}px;
            cursor: pointer;
            font-size: ${Math.round(14 * scale)}px;
            transition: background 0.2s;
        `;
        saveBtn.onmouseenter = function() { this.style.background = '#0a4d7b'; };
        saveBtn.onmouseleave = function() { this.style.background = '#0a3d6b'; };
        saveBtn.onclick = function() {
            saveSettings();
            log('Настройки звуков сохранены');
            alert('✅ Настройки звуков сохранены!');
        };
        saveDiv.appendChild(saveBtn);
        content.appendChild(saveDiv);
    }

    function init() {
        updatePanelSettings();
        log('NSLorSound v2.9.2 запущен');

        document.addEventListener('click', unlockAudio);
        document.addEventListener('keydown', unlockAudio);

        setTimeout(() => {
            if (showWarning) {
                createUnlockBanner();
            }

            const panel = document.querySelector('.lor-panel-container, .lor-mobile-collapsed');
            if (panel) {
                initPanelIntegration();
            } else {
                createOwnButton();
            }

            startNotificationMonitoring();
            startNewCommentMonitoring();

            setTimeout(() => {
                const counter = document.getElementById('main_events_count');
                if (counter) {
                    lastCount = parseInt(counter.textContent.replace(/[^0-9]/g, '')) || 0;
                }
            }, 500);
        }, 1000);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();