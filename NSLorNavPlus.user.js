// ==UserScript==
// @name         NSLorNavPlus
// @namespace    test
// @version      2.0.0
// @match        https://www.linux.org.ru/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==
(function () {
  'use strict';

  const STORAGE_NICKS = 'lor_navplus_nicks_v1';
  const STORAGE_HIST = 'lor_navplus_hist_v1';
  const STORAGE_SET = 'lor_navplus_set_v1';
  const STORAGE_SEARCH = 'lor_navplus_search_v1';
  const PANEL_OFFSET = 90;

  const state = {
    myIdx: -1,
    myCache: [],
    lastMyNick: null,
    menIdx: -1,
    menCache: [],
    lastMentionNick: null,
    searchIdx: -1,
    searchCache: [],
    lastQuery: null,
    highlight: false,
    currentTopicUrl: null,
  };

  function getMainSettings() {
    try {
      return JSON.parse(localStorage.getItem('lor_panel_settings_v3')) || {};
    } catch (e) {
      return {};
    }
  }

  function getThemeName() {
    const links = document.querySelectorAll('link[rel="stylesheet"]');
    for (let i = 0; i < links.length; i++) {
      const m = links[i].href.match(/\/([^/]+)\/combined\.css/);
      if (m) return m[1];
    }
    return 'black';
  }

  function getColors() {
    const t = getThemeName();
    const map = {
      black: { bg: '#0a0a14', text: '#c8c8c8', border: '#444', btnBg: '#1a1a2e', btnHov: '#16213e' },
      tango: { bg: '#222', text: '#aaa', border: '#666', btnBg: '#333', btnHov: '#16213e' },
      'tango-light': { bg: '#fff', text: '#2e3436', border: '#888a85', btnBg: '#d3d7cf', btnHov: '#c0c4bc' },
      white2: { bg: '#fff', text: '#333', border: '#ccc', btnBg: '#e8e8e8', btnHov: '#d0d0d0' },
      waltz: { bg: '#fff', text: '#333', border: '#ccc', btnBg: '#ececec', btnHov: '#d8d8d8' },
      zomg_ponies: { bg: '#fff', text: '#333', border: '#ccc', btnBg: '#ececec', btnHov: '#d8d8d8' },
    };
    return map[t] || map.black;
  }

  function isDark() {
    return ['black', 'tango'].includes(getThemeName());
  }

  function getModalScale() {
    return (getMainSettings().general?.modalScale || 100) / 100;
  }

  function load(k) {
    try {
      return JSON.parse(localStorage.getItem(k));
    } catch (e) {
      return null;
    }
  }

  function save(k, v) {
    localStorage.setItem(k, JSON.stringify(v));
  }

  function getMyNick() {
    let el = document.querySelector('a[href*="/people/"][href*="/profile"]');
    if (el) return el.textContent.trim();
    el = document.querySelector('article.msg.comments-owner a[href*="/people/"]');
    return el ? el.textContent.trim() : 'User';
  }

  function getTopicUrl() {
    const path = window.location.pathname;
    return path.replace(/\/page\d+$/, '').split('?')[0].split('#')[0];
  }

  function clearHighlights() {
    document.querySelectorAll('article.msg[data-lor-nav-highlight]').forEach((el) => {
      el.style.outline = '';
      el.style.boxShadow = '';
      el.removeAttribute('data-lor-nav-highlight');
    });
  }

  function applyHighlights(cache, active) {
    cache.forEach((item) => {
      let el;
      if (item instanceof Element) {
        el = item;
      } else {
        el = document.getElementById('comment-' + item.id);
      }
      if (!el) return;
      if (active) {
        el.style.outline = '2px solid orange';
        el.setAttribute('data-lor-nav-highlight', '1');
      } else {
        el.style.outline = '';
        el.removeAttribute('data-lor-nav-highlight');
      }
    });
  }

  function scrollToElement(el, highlightColor) {
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const currentY = window.scrollY;
    const targetY = Math.max(0, rect.top + currentY - PANEL_OFFSET);
    window.scrollTo({ top: targetY, behavior: 'auto' });
    setTimeout(() => {
      const actualY = window.scrollY;
      const moved = Math.abs(actualY - currentY);
      if (moved < 5) {
        el.scrollIntoView({ behavior: 'instant', block: 'start' });
      }
      if (highlightColor) {
        el.style.outline = highlightColor;
        setTimeout(() => {
          if (el.style.outline && !state.highlight) el.style.outline = '';
        }, 3000);
      }
    }, 80);
  }

  function initMyMessages(nick) {
    if (!nick) return;
    const all = Array.from(document.querySelectorAll('article.msg'));
    state.myCache = all.filter((el) => {
      const a = el.querySelector('.sign a[href*="/people/"]') || el.querySelector('.title a[href*="/people/"]');
      const author = a ? a.textContent.trim() : '';
      return author === nick;
    });
    state.myCache.sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
    state.myIdx = state.myCache.length;
    if (state.highlight) applyHighlights(state.myCache, true);
  }

  function nextMyMessage() {
    if (!state.myCache.length) return;
    if (state.myIdx <= 0) state.myIdx = state.myCache.length;
    state.myIdx--;
    const el = state.myCache[state.myIdx];
    scrollToElement(el, state.highlight ? '2px solid orange' : '3px solid #4a90d9');
  }

  function initMentions(nick) {
    if (!nick) return;
    const all = Array.from(document.querySelectorAll('article.msg'));
    state.menCache = all.filter((el) => {
      const authorEl = el.querySelector('.sign a[href*="/people/"]');
      const author = authorEl ? authorEl.textContent.trim() : '';
      if (author === nick) return false;
      const title = el.querySelector('.title')?.textContent || '';
      const norm = title.replace(/\s+/g, ' ').trim();
      const esc = nick.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return new RegExp(`Ответ\\s+на:.*?от\\s+${esc}`, 'i').test(norm);
    });
    state.menCache.sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
    state.menIdx = state.menCache.length;
    if (state.highlight) applyHighlights(state.menCache, true);
  }

  function nextMention() {
    if (!state.menCache.length) return;
    if (state.menIdx <= 0) state.menIdx = state.menCache.length;
    state.menIdx--;
    const el = state.menCache[state.menIdx];
    scrollToElement(el, state.highlight ? '2px solid orange' : '3px solid #ff6600');
  }

  function saveSearchState() {
    if (state.lastQuery && state.searchCache.length && state.currentTopicUrl) {
      const data = load(STORAGE_SEARCH) || {};
      data[state.currentTopicUrl] = {
        query: state.lastQuery,
        cache: state.searchCache.map(item => ({ id: item.id, author: item.author, text: item.text, page: item.page })),
        idx: state.searchIdx
      };
      save(STORAGE_SEARCH, data);
    }
  }

  function loadSearchState() {
    const data = load(STORAGE_SEARCH);
    const currentTopic = getTopicUrl();
    if (data && data[currentTopic]) {
      const saved = data[currentTopic];
      state.lastQuery = saved.query;
      state.searchCache = saved.cache || [];
      state.searchIdx = saved.idx !== undefined ? saved.idx : (saved.cache?.length || 0);
      state.currentTopicUrl = currentTopic;
      return true;
    }
    return false;
  }

  function updateSearchPosition(commentId) {
    if (!state.searchCache.length) return;
    const idx = state.searchCache.findIndex(item => item.id === commentId);
    if (idx !== -1) {
      state.searchIdx = idx;
      saveSearchState();
    }
  }

  async function doSearchGlobal(query) {
    if (!query) return;
    if (!state.highlight) clearHighlights();

    state.currentTopicUrl = getTopicUrl();
    const baseUrl = state.currentTopicUrl;
    const lowerQ = query.toLowerCase();
    state.searchCache = [];

    const firstResp = await fetch(baseUrl, { credentials: 'same-origin' });
    const firstHtml = await firstResp.text();
    const allPages = [...firstHtml.matchAll(/\/page(\d+)/g)].map(m => parseInt(m[1]));
    const maxPages = allPages.length ? Math.max(...allPages) + 1 : 1;

    for (let pageNum = 1; pageNum <= maxPages; pageNum++) {
      const pageSuffix = pageNum === 1 ? '' : `/page${pageNum - 1}`;
      const url = `${baseUrl}${pageSuffix}`;
      try {
        const resp = await fetch(url, { credentials: 'same-origin' });
        if (!resp.ok) break;
        const html = await resp.text();
        const commentCount = (html.match(/id="comment-/g) || []).length;
        if (commentCount === 0 && pageNum > 1) break;
        if (!html.toLowerCase().includes(lowerQ)) continue;

        const commentRegex = /<article\s+class="msg"\s+id="comment-(\d+)"[^>]*>([\s\S]*?)<\/article>/gi;
        let match;
        while ((match = commentRegex.exec(html)) !== null) {
          if (match[2].toLowerCase().includes(lowerQ)) {
            const authorMatch = match[2].match(/<a[^>]*href="\/people\/[^"]*"[^>]*>([^<]+)<\/a>/);
            state.searchCache.push({
              id: match[1],
              author: authorMatch ? authorMatch[1].trim() : '',
              text: match[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),
              page: pageNum
            });
          }
        }
      } catch (e) {
        break;
      }
      if (pageNum < maxPages) await new Promise((r) => setTimeout(r, 100));
    }

    state.searchIdx = state.searchCache.length;
    state.lastQuery = query;

    if (state.highlight) {
      state.searchCache.forEach((item) => {
        const el = document.getElementById('comment-' + item.id);
        if (el) {
          el.style.outline = '2px solid orange';
          el.setAttribute('data-lor-nav-highlight', '1');
        }
      });
    }

    let hist = load(STORAGE_HIST) || [];
    hist = [query, ...hist.filter((h) => h !== query)].slice(0, 50);
    save(STORAGE_HIST, hist);

    saveSearchState();
  }

  function nextSearchResult() {
    if (!state.searchCache.length) return;
    if (state.searchIdx <= 0) {
      state.searchIdx = state.searchCache.length;
    }
    state.searchIdx--;
    const item = state.searchCache[state.searchIdx];

    const base = window.location.pathname.split('?')[0];
    const newUrl = `${base}?cid=${item.id}#comment-${item.id}`;

    const currentUrlWithoutHash = window.location.href.split('#')[0];
    const newUrlWithoutHash = newUrl.split('#')[0];

    if (currentUrlWithoutHash === newUrlWithoutHash) {
      const el = document.getElementById('comment-' + item.id);
      if (el) {
        scrollToElement(el, state.highlight ? '2px solid orange' : '3px solid #ff6600');
      } else {
        window.location.href = newUrl;
      }
    } else {
      window.location.href = newUrl;
    }
    saveSearchState();
  }

  function createModal(title, contentEl) {
    const c = getColors();
    const ms = getModalScale();
    const ov = document.createElement('div');
    ov.style.cssText =
      'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.6);z-index:99998;display:flex;align-items:center;justify-content:center;padding:10px;box-sizing:border-box;';
    const mdl = document.createElement('div');
    mdl.style.cssText = `background:${c.bg};border:1px solid ${c.border};padding:${Math.round(
      24 * ms
    )}px;border-radius:${Math.round(8 * ms)}px;width:auto;min-width:${Math.round(
      400 * ms
    )}px;max-width:95vw;height:auto;min-height:${Math.round(
      100 * ms
    )}px;max-height:90vh;box-sizing:border-box;color:${c.text};font-family:Arial,sans-serif;font-size:${Math.round(
      14 * ms
    )}px;box-shadow:0 0 30px rgba(0,0,0,0.5);display:flex;flex-direction:column;overflow:hidden;`;
    const hdr = document.createElement('div');
    hdr.style.cssText = `display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;padding-bottom:${Math.round(
      8 * ms
    )}px;border-bottom:1px solid ${c.border};flex-shrink:0;`;
    const ttl = document.createElement('div');
    ttl.textContent = title;
    ttl.style.cssText = `font-size:${Math.round(
      16 * ms
    )}px;font-weight:bold;word-break:break-word;flex:1;margin:0 8px;`;
    const cls = document.createElement('div');
    cls.textContent = '✕';
    cls.style.cssText = `cursor:pointer;font-size:${Math.round(
      20 * ms
    )}px;color:${isDark() ? '#888' : '#666'};flex-shrink:0;padding:0 4px;`;
    hdr.appendChild(ttl);
    hdr.appendChild(cls);
    mdl.appendChild(hdr);
    const body = document.createElement('div');
    body.style.cssText = `overflow-y:auto;flex:1;min-height:0;padding-right:4px;padding-bottom:8px;background:${c.bg};overscroll-behavior:contain;`;
    body.appendChild(contentEl);
    mdl.appendChild(body);
    ov.appendChild(mdl);
    document.body.appendChild(ov);
    const closeFn = () => {
      ov.remove();
      if (window.__modalResizeObserver) {
        window.__modalResizeObserver.disconnect();
        delete window.__modalResizeObserver;
      }
    };
    cls.onclick = closeFn;
    ov.onclick = (e) => {
      if (e.target === ov) closeFn();
    };
    if (window.ResizeObserver) {
      const ro = new ResizeObserver(() => {
        const maxH = window.innerHeight * 0.9;
        const rect = mdl.getBoundingClientRect();
        if (rect.height >= maxH - 5) {
          body.style.overflowY = 'auto';
        } else {
          body.style.overflowY = 'visible';
        }
      });
      ro.observe(mdl);
      window.__modalResizeObserver = ro;
    }
    return { ov, mdl, body, hdr, close: closeFn };
  }

  function buildNavListModal(type, nickStateKey, cacheKey, initFn, nextFn, modalTitle) {
    const myNick = getMyNick();
    const c = getColors();
    const ms = getModalScale();
    const pinned = load(STORAGE_NICKS) || [];
    state[nickStateKey] = state[nickStateKey] || pinned[0] || myNick;
    const cont = document.createElement('div');
    cont.style.cssText = 'display:flex;flex-direction:column;gap:8px;';
    const toggleBtn = document.createElement('button');
    toggleBtn.textContent = '>';
    toggleBtn.style.cssText = `padding:${Math.round(4 * ms)}px ${Math.round(
      8 * ms
    )}px;background:${c.btnBg};color:${c.text};border:1px solid ${c.border};border-radius:${Math.round(
      4 * ms
    )}px;cursor:pointer;flex-shrink:0;font-size:${Math.round(13 * ms)}px;`;
    const hlCheck = document.createElement('input');
    hlCheck.type = 'checkbox';
    hlCheck.checked = state.highlight;
    hlCheck.title = 'Подсвечивать найденное';
    hlCheck.style.cssText =
      'width:16px;height:16px;cursor:pointer;margin-left:6px;flex-shrink:0;';
    const nickList = document.createElement('ul');
    nickList.style.cssText = `list-style:none;padding:0;margin:4px 0;overflow-y:auto;background:${
      isDark() ? '#0d0d1a' : '#f9f9f9'
    };border:1px solid ${c.border};border-radius:4px;display:none;font-size:${Math.round(13 * ms)}px;`;
    const inputRow = document.createElement('div');
    inputRow.style.cssText = 'display:flex;gap:8px;margin-top:8px;';
    const nickInp = document.createElement('input');
    nickInp.type = 'text';
    nickInp.value = state[nickStateKey];
    nickInp.style.cssText = `flex:1;padding:${Math.round(
      6 * ms
    )}px;background:${isDark() ? '#111' : '#f5f5f5'};color:${c.text};border:1px solid ${
      c.border
    };border-radius:4px;font-size:${Math.round(13 * ms)}px;`;
    const addBtn = document.createElement('button');
    addBtn.textContent = '+';
    addBtn.style.cssText = `padding:${Math.round(6 * ms)}px ${Math.round(
      12 * ms
    )}px;background:#0a3d6b;color:#ddd;border:1px solid #1a5a9a;border-radius:4px;cursor:pointer;flex-shrink:0;font-size:${Math.round(
      13 * ms
    )}px;`;
    inputRow.appendChild(nickInp);
    inputRow.appendChild(addBtn);
    const msgList = document.createElement('ul');
    msgList.style.cssText = `list-style:none;padding:0;margin:4px 0;overflow-y:auto;background:${
      isDark() ? '#0d0d1a' : '#f9f9f9'
    };border:1px solid ${c.border};border-radius:4px;font-size:${Math.round(
      12 * ms
    )}px;white-space:pre-wrap;word-break:break-word;line-height:1.4;`;
    msgList.innerHTML =
      '<li style="padding:10px;color:#888;text-align:center;">Выберите ник</li>';
    function renderNickList() {
      const cur = load(STORAGE_NICKS) || [];
      nickList.innerHTML = cur
        .map(
          (n) =>
            `<li data-nick="${n}" style="padding:${Math.round(6 * ms)}px ${Math.round(
              8 * ms
            )}px;border-bottom:1px solid ${
              c.border
            };cursor:pointer;color:${c.text};"><span class="lor-del" data-val="${n}" style="color:#ff6666;font-weight:bold;margin-right:6px;cursor:pointer;">✕</span>${n}</li>`
        )
        .join('');
    }
    function applyNick(nick) {
      state[nickStateKey] = nick;
      nickInp.value = nick;
      initFn(nick);
      const cache = state[cacheKey];
      msgList.innerHTML = '';
      if (!cache.length) {
        msgList.innerHTML =
          '<li style="padding:10px;color:#888;text-align:center;">Не найдено</li>';
        return;
      }
      cache.forEach((el) => {
        const li = document.createElement('li');
        li.style.cssText = `padding:${Math.round(8 * ms)}px ${Math.round(
          10 * ms
        )}px;border-bottom:1px solid ${
          c.border
        };cursor:pointer;color:${c.text};font-size:${Math.round(12 * ms)}px;`;
        const author =
          el.querySelector('.sign a[href*="/people/"]')?.textContent?.trim() || '';
        const textPreview = el.textContent.slice(0, 140).replace(/\s+/g, ' ').trim();
        li.innerHTML = `<strong style="color:#4a90d9">#${el.id.replace(
          'comment-',
          ''
        )}</strong> | <span style="font-weight:bold">${author}</span><br><span style="color:${
          isDark() ? '#aaa' : '#555'
        }">${textPreview}${el.textContent.length > 140 ? '…' : ''}</span>`;
        li.onclick = () => {
          scrollToElement(el, state.highlight ? '2px solid orange' : '3px solid #4a90d9');
        };
        msgList.appendChild(li);
      });
      if (state.highlight) applyHighlights(cache, true);
    }
    toggleBtn.onclick = () => {
      const open = nickList.style.display !== 'none';
      nickList.style.display = open ? 'none' : 'block';
      toggleBtn.textContent = open ? '>' : '<';
    };
    renderNickList();
    nickList.onclick = (e) => {
      const del = e.target.closest('.lor-del');
      if (del) {
        e.stopPropagation();
        const val = del.dataset.val;
        const cur = (load(STORAGE_NICKS) || []).filter((x) => x !== val);
        save(STORAGE_NICKS, cur);
        renderNickList();
        if (state[nickStateKey] === val) {
          state[nickStateKey] = cur[0] || getMyNick();
          nickInp.value = state[nickStateKey];
          applyNick(state[nickStateKey]);
        }
        return;
      }
      const li = e.target.closest('li');
      if (li && li.dataset.nick) applyNick(li.dataset.nick);
    };
    addBtn.onclick = () => {
      const n = nickInp.value.trim();
      if (n) {
        const cur = load(STORAGE_NICKS) || [];
        if (!cur.includes(n)) {
          cur.push(n);
          save(STORAGE_NICKS, cur);
          renderNickList();
        }
        applyNick(n);
      }
    };
    hlCheck.onchange = () => {
      state.highlight = hlCheck.checked;
      save(STORAGE_SET, { highlight: state.highlight });
      applyHighlights(state[cacheKey], state.highlight);
    };
    cont.appendChild(nickList);
    cont.appendChild(inputRow);
    cont.appendChild(msgList);
    const m = createModal(modalTitle, cont);
    m.hdr.insertBefore(toggleBtn, m.hdr.firstChild);
    const chkWrap = document.createElement('span');
    chkWrap.appendChild(hlCheck);
    chkWrap.style.marginLeft = '6px';
    m.hdr.insertBefore(chkWrap, toggleBtn.nextSibling);
    applyNick(state[nickStateKey]);
  }

  function buildMyMessagesModal() {
    buildNavListModal(
      'my',
      'lastMyNick',
      'myCache',
      initMyMessages,
      nextMyMessage,
      '💬 Мои сообщения'
    );
  }

  function buildMentionsModal() {
    buildNavListModal(
      'men',
      'lastMentionNick',
      'menCache',
      initMentions,
      nextMention,
      '📢 Упоминания'
    );
  }

  function buildSearchModal() {
    const c = getColors();
    const ms = getModalScale();
    const hist = load(STORAGE_HIST) || [];
    state.highlight = load(STORAGE_SET)?.highlight || false;
    const cont = document.createElement('div');
    cont.style.cssText = 'display:flex;flex-direction:column;gap:8px;';
    const toggleBtn = document.createElement('button');
    toggleBtn.textContent = '>';
    toggleBtn.style.cssText = `padding:${Math.round(4 * ms)}px ${Math.round(
      8 * ms
    )}px;background:${c.btnBg};color:${c.text};border:1px solid ${
      c.border
    };border-radius:${Math.round(4 * ms)}px;cursor:pointer;flex-shrink:0;font-size:${Math.round(
      13 * ms
    )}px;`;
    const hlCheck = document.createElement('input');
    hlCheck.type = 'checkbox';
    hlCheck.checked = state.highlight;
    hlCheck.title = 'Подсвечивать найденное';
    hlCheck.style.cssText =
      'width:16px;height:16px;cursor:pointer;margin-left:6px;flex-shrink:0;';
    const histList = document.createElement('ul');
    histList.style.cssText = `list-style:none;padding:0;margin:4px 0;overflow-y:auto;background:${
      isDark() ? '#0d0d1a' : '#f9f9f9'
    };border:1px solid ${c.border};border-radius:4px;display:none;font-size:${Math.round(
      13 * ms
    )}px;`;
    const inputRow = document.createElement('div');
    inputRow.style.cssText = 'display:flex;gap:8px;margin-top:8px;';
    const searchInp = document.createElement('input');
    searchInp.type = 'text';
    searchInp.value = state.lastQuery || '';
    searchInp.style.cssText = `flex:1;padding:${Math.round(
      6 * ms
    )}px;background:${isDark() ? '#111' : '#f5f5f5'};color:${c.text};border:1px solid ${
      c.border
    };border-radius:4px;font-size:${Math.round(13 * ms)}px;`;
    const findBtn = document.createElement('button');
    findBtn.textContent = 'Найти';
    findBtn.style.cssText = `padding:${Math.round(6 * ms)}px ${Math.round(
      12 * ms
    )}px;background:#0a3d6b;color:#ddd;border:1px solid #1a5a9a;border-radius:4px;cursor:pointer;flex-shrink:0;font-size:${Math.round(
      13 * ms
    )}px;`;
    inputRow.appendChild(searchInp);
    inputRow.appendChild(findBtn);
    const resultList = document.createElement('ul');
    resultList.style.cssText = `list-style:none;padding:0;margin:4px 0;overflow-y:auto;background:${
      isDark() ? '#0d0d1a' : '#f9f9f9'
    };border:1px solid ${c.border};border-radius:4px;font-size:${Math.round(
      12 * ms
    )}px;white-space:pre-wrap;word-break:break-word;line-height:1.4;`;
    resultList.innerHTML =
      '<li style="padding:10px;color:#888;text-align:center;">Введите запрос</li>';
    function renderHistList() {
      const cur = load(STORAGE_HIST) || [];
      histList.innerHTML = cur
        .map(
          (h) =>
            `<li data-query="${h}" style="padding:${Math.round(6 * ms)}px ${Math.round(
              8 * ms
            )}px;border-bottom:1px solid ${
              c.border
            };cursor:pointer;color:${c.text};"><span class="lor-del" data-val="${h}" style="color:#ff6666;font-weight:bold;margin-right:6px;cursor:pointer;">✕</span>${h}</li>`
        )
        .join('');
    }
    histList.onclick = (e) => {
      const del = e.target.closest('.lor-del');
      if (del) {
        e.stopPropagation();
        const val = del.dataset.val;
        const cur = (load(STORAGE_HIST) || []).filter((x) => x !== val);
        save(STORAGE_HIST, cur);
        renderHistList();
        return;
      }
      const li = e.target.closest('li');
      if (li && li.dataset.query) runSearch(li.dataset.query);
    };
    async function runSearch(q) {
      resultList.innerHTML = '<li style="padding:10px;color:#888;text-align:center;">Поиск...</li>';
      searchInp.value = q;
      await doSearchGlobal(q);
      renderSearchResults();
    }
    function renderSearchResults() {
      resultList.innerHTML = '';
      if (!state.searchCache.length) {
        resultList.innerHTML =
          '<li style="padding:10px;color:#888;text-align:center;">Не найдено</li>';
        return;
      }
      const base = window.location.pathname.split('?')[0];
      state.searchCache.forEach((item) => {
        const li = document.createElement('li');
        li.style.cssText = `padding:${Math.round(8 * ms)}px ${Math.round(
          10 * ms
        )}px;border-bottom:1px solid ${
          c.border
        };cursor:pointer;color:${c.text};font-size:${Math.round(12 * ms)}px;`;
        const textPreview = item.text.slice(0, 140);
        li.innerHTML = `<strong style="color:#4a90d9">#${item.id}</strong> | <span style="font-weight:bold">${item.author}</span> <span style="color:#888;font-size:11px;">(стр.${item.page})</span><br><span style="color:${
          isDark() ? '#aaa' : '#555'
        }">${textPreview}${item.text.length > 140 ? '…' : ''}</span>`;
        li.onclick = () => {
          updateSearchPosition(item.id);
          window.location.href = `${base}?cid=${item.id}#comment-${item.id}`;
        };
        resultList.appendChild(li);
      });
      if (state.highlight) applyHighlights(state.searchCache, true);
    }
    toggleBtn.onclick = () => {
      const open = histList.style.display !== 'none';
      histList.style.display = open ? 'none' : 'block';
      toggleBtn.textContent = open ? '>' : '<';
    };
    hlCheck.onchange = () => {
      state.highlight = hlCheck.checked;
      save(STORAGE_SET, { highlight: state.highlight });
      if (!state.highlight) clearHighlights();
      else if (state.lastQuery) runSearch(state.lastQuery);
    };
    renderHistList();
    findBtn.onclick = () => {
      const q = searchInp.value.trim();
      if (q) runSearch(q);
    };
    searchInp.onkeydown = (e) => {
      if (e.key === 'Enter') findBtn.click();
    };
    cont.appendChild(histList);
    cont.appendChild(inputRow);
    cont.appendChild(resultList);
    const m = createModal('🔍 Поиск', cont);
    m.hdr.insertBefore(toggleBtn, m.hdr.firstChild);
    const chkWrap = document.createElement('span');
    chkWrap.appendChild(hlCheck);
    chkWrap.style.marginLeft = '6px';
    m.hdr.insertBefore(chkWrap, toggleBtn.nextSibling);
    if (state.lastQuery) {
      searchInp.value = state.lastQuery;
      renderSearchResults();
    }
  }

  function attachNav(btn, quickFn, modalFn) {
      let timer = null;
      let long = false;
      let mx = 0;

      btn._cmjf = false;
      btn._lpt = null;
      btn._lptr = false;

      btn.onmousedown = function(e) {
          if (!btn.contains(e.target) && e.target !== btn) return;

          if (e.button === 2) {
              btn._cmjf = true;
              setTimeout(() => { btn._cmjf = false; }, 300);
              return;
          }
          if (e.button !== 0) return;

          long = false;
          mx = e.clientX;
          timer = setTimeout(() => {
              long = true;
              btn._cmjf = true;
              btn.dispatchEvent(new MouseEvent('contextmenu', {
                  bubbles: true, cancelable: true, button: 2,
                  clientX: e.clientX, clientY: e.clientY
              }));
          }, 500);
      };

      btn.onmouseup = function(e) {
          if (!btn.contains(e.target) && e.target !== btn) return;

          if (e.button === 2) return;
          if (e.button !== 0) return;

          clearTimeout(timer);
          if (long || btn._cmjf) {
              e.preventDefault();
              e.stopPropagation();
              e.stopImmediatePropagation();
              setTimeout(() => { btn._cmjf = false; long = false; }, 100);
              return false;
          }
      };

      btn.onmousemove = function(e) {
          if (timer && Math.abs(e.clientX - mx) > 5) {
              clearTimeout(timer);
              timer = null;
          }
      };

      btn.addEventListener('contextmenu', function(e) {
          if (!btn.contains(e.target) && e.target !== btn) return;
          btn._cmjf = true;
          setTimeout(() => { btn._cmjf = false; }, 300);
          e.preventDefault();
          e.stopPropagation();
          modalFn();
          return false;
      }, true);

      btn.addEventListener('click', function(e) {
          if (!btn.contains(e.target) && e.target !== btn) return;

          if (btn._cmjf || long) {
              e.preventDefault();
              e.stopPropagation();
              e.stopImmediatePropagation();
              return false;
          }
          if (e.button !== 0) {
              e.preventDefault();
              e.stopPropagation();
              return false;
          }
          quickFn();
          return false;
      }, true);

      btn.addEventListener('auxclick', function(e) {
          e.preventDefault();
          e.stopPropagation();
      }, true);

      btn.addEventListener('dragstart', function(e) {
          e.preventDefault();
          return false;
      }, true);
  }

  function getOrCloneBtn(title, fallbackIcon) {
    let btn = document.querySelector(`div[title="${title}"]`);
    if (!btn) return null;

    if (btn.hasAttribute('data-lor-nav-replaced')) {
      const hasContent = (btn.textContent || '').trim().length > 0 ||
                         btn.querySelector('svg, i, img, span, .icon');
      if (!hasContent && fallbackIcon) {
        btn.textContent = fallbackIcon;
        btn.style.fontSize = '18px';
        btn.style.lineHeight = '1';
      }
      return btn;
    }

    const parent = btn.parentElement;
    if (!parent) return null;
    const next = btn.nextSibling;

    const clone = btn.cloneNode(true);

    const hasText = (clone.textContent || '').trim().length > 0;
    const hasIconNode = !!(clone.querySelector('svg, i, img, span, .icon'));
    if (!hasText && !hasIconNode && fallbackIcon) {
      clone.textContent = fallbackIcon;
    }

    clone.className = btn.className;
    clone.title = btn.title;
    const baseStyle = btn.getAttribute('style') || '';
    clone.setAttribute('style', baseStyle +
      ';user-select:none;-webkit-user-select:none;-webkit-touch-callout:none;' +
      'pointer-events:auto;cursor:pointer;');

    if (!hasText && !hasIconNode && fallbackIcon) {
      clone.style.fontSize = '18px';
      clone.style.lineHeight = '1';
      clone.style.fontFamily = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
    }

    clone.setAttribute('data-lor-nav-replaced', '1');

    btn.remove();
    if (next) parent.insertBefore(clone, next);
    else parent.appendChild(clone);

    return clone;
  }

  function createStandaloneButton() {
    const c = getColors();
    const btn = document.createElement('div');
    btn.textContent = '🔍';
    btn.title = 'Поиск';
    btn.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      width: 48px;
      height: 48px;
      background: ${c.btnBg};
      color: ${c.text};
      border: 2px solid ${c.border};
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      z-index: 99999;
      font-size: 20px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.3);
      transition: transform 0.2s, box-shadow 0.2s;
    `;

    btn.addEventListener('mouseenter', () => {
      btn.style.transform = 'scale(1.1)';
      btn.style.boxShadow = '0 4px 15px rgba(0,0,0,0.4)';
    });

    btn.addEventListener('mouseleave', () => {
      btn.style.transform = 'scale(1)';
      btn.style.boxShadow = '0 2px 10px rgba(0,0,0,0.3)';
    });

    document.body.appendChild(btn);

    attachNav(btn,
      () => {
        if (state.searchCache?.length > 0 && state.lastQuery) {
          nextSearchResult();
        } else {
          buildSearchModal();
        }
      },
      () => buildSearchModal()
    );

    return btn;
  }

  function init() {
    state.myIdx = -1;
    state.menIdx = -1;
    state.searchIdx = -1;
    state.myCache = [];
    state.menCache = [];
    state.searchCache = [];
    const myNick = getMyNick();
    state.lastMyNick = myNick;
    state.lastMentionNick = myNick;
    state.lastQuery = null;
    state.highlight = load(STORAGE_SET)?.highlight || false;
    state.currentTopicUrl = getTopicUrl();

    loadSearchState();

    const urlParams = new URLSearchParams(window.location.search);
    const cidParam = urlParams.get('cid');
    if (cidParam && state.searchCache.length) {
      updateSearchPosition(cidParam);
    }

    const myBtn = getOrCloneBtn('Мои сообщения', '💬');
    const menBtn = getOrCloneBtn('Упоминания', '📢');
    const searchBtn = getOrCloneBtn('Поиск', '🔍');

    const panelFound = myBtn !== null || menBtn !== null || searchBtn !== null;

    if (myBtn) {
      attachNav(myBtn,
        () => {
          if (!state.myCache.length) initMyMessages(state.lastMyNick);
          nextMyMessage();
        },
        () => buildMyMessagesModal()
      );
    }

    if (menBtn) {
      attachNav(menBtn,
        () => {
          if (!state.menCache.length) initMentions(state.lastMentionNick);
          nextMention();
        },
        () => buildMentionsModal()
      );
    }

    if (searchBtn) {
      attachNav(searchBtn,
        () => {
          if (state.searchCache?.length > 0 && state.lastQuery) {
            nextSearchResult();
          } else {
            buildSearchModal();
          }
        },
        () => buildSearchModal()
      );
    }

    if (!panelFound) {
      createStandaloneButton();
    }
  }

  setTimeout(() => {
    if (document.querySelectorAll('article.msg').length > 0) {
      init();
    } else {
      const obs = new MutationObserver(() => {
        if (document.querySelectorAll('article.msg').length > 0) {
          obs.disconnect();
          init();
        }
      });
      obs.observe(document.body, { childList: true, subtree: true });
    }
  }, 1000);
})();