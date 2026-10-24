// popup.js — toolbar menu: browse your links by section and group, search them, open them.
// Reads the same storage as the dashboard (gd_sections, gd_lang, gd_theme); never writes to it.
(() => {
  'use strict';
  const api = (typeof browser !== 'undefined' && browser) || null;
  const $ = id => document.getElementById(id);

  const I18N = {
    es: { search: 'Buscar en tus links…', none: 'Sin resultados', empty: 'Aún no tienes links. Añádelos desde el dashboard.', dash: 'Abrir dashboard', settings: 'Configurar', clear: 'Borrar búsqueda' },
    en: { search: 'Search your links…', none: 'No results', empty: 'You have no links yet. Add them from the dashboard.', dash: 'Open dashboard', settings: 'Settings', clear: 'Clear search' },
    ru: { search: 'Поиск по ссылкам…', none: 'Ничего не найдено', empty: 'Ссылок пока нет. Добавьте их на дашборде.', dash: 'Открыть дашборд', settings: 'Настройки', clear: 'Очистить поиск' },
    fr: { search: 'Rechercher dans vos liens…', none: 'Aucun résultat', empty: 'Vous n’avez pas encore de liens. Ajoutez-les depuis le tableau de bord.', dash: 'Ouvrir le tableau de bord', settings: 'Paramètres', clear: 'Effacer la recherche' },
    de: { search: 'In deinen Links suchen…', none: 'Keine Ergebnisse', empty: 'Du hast noch keine Links. Füge sie im Dashboard hinzu.', dash: 'Dashboard öffnen', settings: 'Einstellungen', clear: 'Suche löschen' },
  };
  // theme id -> [accent, background]  (same values as the dashboard themes)
  const THEMES = {
    obsidian: ['#c8b89a', '#0a0a0c'], midnight: ['#7eb8e8', '#050c16'], forest: ['#6dbf8a', '#08100c'],
    aurora: ['#c48de0', '#100812'], ember: ['#e89a6a', '#120a06'], arctic: ['#6ab8c8', '#060e12'],
  };

  const Store = {
    async get(k, def) {
      if (api && api.storage && api.storage.sync) {
        try { const r = await api.storage.sync.get(k); return r[k] !== undefined ? r[k] : def; } catch {}
      }
      try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : def; } catch { return def; }
    },
  };

  let T = I18N.en;
  let sections = [];
  let query = '';
  const rowLink = new WeakMap();   // <a> -> link object
  let collapsed = new Set();
  try { collapsed = new Set(JSON.parse(localStorage.getItem('gd_popup_collapsed') || '[]')); } catch {}
  const saveCollapsed = () => { try { localStorage.setItem('gd_popup_collapsed', JSON.stringify([...collapsed])); } catch {} };

  // ── helpers ──
  const NS = 'http://www.w3.org/2000/svg';
  function svg(cls, d, vb) {
    const s = document.createElementNS(NS, 'svg'); s.setAttribute('viewBox', vb || '0 0 24 24'); s.setAttribute('class', cls);
    s.setAttribute('fill', 'none'); s.setAttribute('stroke', 'currentColor'); s.setAttribute('stroke-width', '2.2');
    s.setAttribute('stroke-linecap', 'round'); s.setAttribute('stroke-linejoin', 'round'); s.setAttribute('aria-hidden', 'true');
    const p = document.createElementNS(NS, 'path'); p.setAttribute('d', d); s.appendChild(p); return s;
  }
  const rgb = hex => { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
  function applyTheme(id) {
    const [accent, bg] = THEMES[id] || THEMES.obsidian, r = document.documentElement.style, a = rgb(accent);
    r.setProperty('--accent', accent); r.setProperty('--bg', bg);
    r.setProperty('--bg-2', 'rgb(' + mix(rgb(bg), [255, 255, 255], 0.045).join(',') + ')');
    r.setProperty('--accent-glow', 'rgba(' + a.join(',') + ',0.10)'); r.setProperty('--accent-line', 'rgba(' + a.join(',') + ',0.42)');
  }
  function pickLang(saved) {
    let l = saved;
    if (!l) { try { l = (api && api.i18n && api.i18n.getUILanguage()) || navigator.language || ''; } catch { l = ''; } }
    l = String(l).toLowerCase().split(/[-_]/)[0];
    return I18N[l] ? l : 'en';
  }
  const normUrl = u => (/^[a-z][a-z0-9+.-]*:/i.test(u) ? u : 'https://' + u);
  const linksOf = g => (g && g.links) || [];

  function iconFor(l) {
    const box = document.createElement('span'); box.className = 'pop-ico';
    const letter = () => {
      box.textContent = ''; box.classList.add('letter');
      const ch = (l.name || l.url || '?').trim().charAt(0).toUpperCase() || '?';
      let h = 0; for (const c of (l.name || '')) h = (h * 31 + c.charCodeAt(0)) % 360;
      box.style.background = 'hsl(' + h + ' 30% 34%)'; box.textContent = ch;
    };
    if (l.icon) {
      const img = document.createElement('img'); img.alt = ''; img.loading = 'lazy'; img.src = l.icon;
      img.onerror = letter; box.appendChild(img);
    } else letter();
    return box;
  }

  // text with the search terms wrapped in <mark> (DOM nodes only)
  function highlight(el, text, tokens) {
    if (!tokens.length) { el.textContent = text; return; }
    const re = new RegExp('(' + tokens.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')', 'ig');
    text.split(re).forEach((part, i) => {
      if (!part) return;
      if (i % 2) { const m = document.createElement('mark'); m.textContent = part; el.appendChild(m); }
      else el.appendChild(document.createTextNode(part));
    });
  }

  function linkRow(l, tokens, ctx) {
    const a = document.createElement('a'); a.className = 'pop-link'; a.href = normUrl(l.url || ''); a.title = l.url || '';
    const main = document.createElement('span'); main.className = 'pop-main';
    const name = document.createElement('span'); name.className = 'pop-name'; highlight(name, l.name || l.url || '', tokens);
    main.appendChild(name);
    if (ctx) { const c = document.createElement('span'); c.className = 'pop-ctx'; c.textContent = ctx; main.appendChild(c); }
    a.appendChild(iconFor(l)); a.appendChild(main); a.appendChild(svg('pop-go', 'M7 17L17 7M8 7h9v9'));
    rowLink.set(a, l);
    return a;
  }

  // ── rendering ──
  function render() {
    const list = $('list'); list.textContent = '';
    const total = sections.reduce((n, s) => n + (s.groups || []).reduce((m, g) => m + linksOf(g).length, 0), 0);
    if (!total) { const e = document.createElement('div'); e.className = 'pop-empty'; e.textContent = T.empty; list.appendChild(e); return; }
    const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
    if (tokens.length) return renderSearch(list, tokens);

    sections.forEach(sec => {
      const count = (sec.groups || []).reduce((m, g) => m + linksOf(g).length, 0);
      if (!count) return;
      const wrap = document.createElement('section'); wrap.className = 'pop-sec' + (collapsed.has(sec.id) ? ' collapsed' : '');
      const head = document.createElement('button'); head.type = 'button'; head.className = 'pop-sec-head';
      head.setAttribute('aria-expanded', collapsed.has(sec.id) ? 'false' : 'true');
      const nm = document.createElement('span'); nm.className = 'pop-sec-name'; nm.textContent = sec.name;
      const ct = document.createElement('span'); ct.className = 'pop-count'; ct.textContent = String(count);
      head.appendChild(svg('pop-chev', 'M6 9l6 6 6-6')); head.appendChild(nm); head.appendChild(ct);

      const body = document.createElement('div'); body.className = 'pop-sec-body'; body.inert = collapsed.has(sec.id);
      const inner = document.createElement('div'); inner.className = 'pop-sec-inner';
      (sec.groups || []).forEach(g => {
        if (!linksOf(g).length) return;
        const gr = document.createElement('div'); gr.className = 'pop-group';
        const gn = document.createElement('div'); gn.className = 'pop-group-name'; gn.textContent = g.name;
        gr.appendChild(gn);
        linksOf(g).forEach(l => gr.appendChild(linkRow(l, [], '')));
        inner.appendChild(gr);
      });
      body.appendChild(inner); wrap.appendChild(head); wrap.appendChild(body);
      head.addEventListener('click', () => {
        const c = wrap.classList.toggle('collapsed');
        body.inert = c; head.setAttribute('aria-expanded', c ? 'false' : 'true');
        if (c) collapsed.add(sec.id); else collapsed.delete(sec.id);
        saveCollapsed();
      });
      list.appendChild(wrap);
    });
  }

  function renderSearch(list, tokens) {
    let found = 0;
    sections.forEach(sec => (sec.groups || []).forEach(g => linksOf(g).forEach(l => {
      const hay = ((l.name || '') + ' ' + (l.url || '') + ' ' + g.name + ' ' + sec.name).toLowerCase();
      if (!tokens.every(t => hay.includes(t))) return;
      found++; list.appendChild(linkRow(l, tokens, g.name + ' · ' + sec.name));
    })));
    if (!found) { const e = document.createElement('div'); e.className = 'pop-empty'; e.textContent = T.none; list.appendChild(e); }
  }

  // ── opening links ──
  async function openLink(link, how) {
    const url = normUrl(link.url || '');
    const mode = how || link.openIn || (link.sameTab ? 'same' : 'new');
    try {
      if (!api) { window.open(url, mode === 'same' ? '_self' : '_blank'); }
      else if (mode === 'same') await api.tabs.update({ url });                 // active tab of this window
      else if (mode === 'window') await api.windows.create({ url });
      else await api.tabs.create({ url, active: mode !== 'bg' });
    } catch (e) { console.warn('Could not open', url, e); }
    if (mode !== 'bg') window.close();
  }
  const visibleRows = () => [...document.querySelectorAll('.pop-link')].filter(el => !el.closest('[inert]'));
  const howFrom = e => (e.shiftKey ? 'window' : (e.ctrlKey || e.metaKey || e.button === 1) ? 'bg' : null);

  function wire() {
    const list = $('list'), q = $('q');
    list.addEventListener('click', e => {
      const a = e.target.closest('a.pop-link'); if (!a) return;
      e.preventDefault(); openLink(rowLink.get(a), howFrom(e));
    });
    list.addEventListener('auxclick', e => {
      const a = e.target.closest('a.pop-link'); if (!a || e.button !== 1) return;
      e.preventDefault(); openLink(rowLink.get(a), 'bg');
    });
    const setQuery = v => { query = v; $('qClear').hidden = !v; render(); };
    q.addEventListener('input', () => setQuery(q.value));
    $('qClear').addEventListener('click', () => { q.value = ''; setQuery(''); q.focus(); });
    document.addEventListener('keydown', e => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        const rows = visibleRows(); if (!rows.length) return;
        e.preventDefault();
        const i = rows.indexOf(document.activeElement);
        if (e.key === 'ArrowDown') (rows[i + 1] || rows[0]).focus();
        else if (i <= 0) q.focus(); else rows[i - 1].focus();
      } else if (e.key === 'Enter' && document.activeElement === q) {
        const first = visibleRows()[0]; if (first) { e.preventDefault(); openLink(rowLink.get(first), howFrom(e)); }
      } else if (e.key === 'Escape') {
        if (query) { e.preventDefault(); q.value = ''; setQuery(''); } else window.close();
      } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey && document.activeElement !== q
                 && !(document.activeElement && document.activeElement.tagName === 'BUTTON' && e.key === ' ')) {
        q.focus();   // start typing anywhere to search
      }
    });
    $('btnDash').addEventListener('click', async () => {
      try { if (api) await api.tabs.create({}); else window.open('dashboard.html', '_blank'); } catch {}
      window.close();
    });
    $('btnSettings').addEventListener('click', async () => {
      try {
        if (api) await api.tabs.create({ url: api.runtime.getURL('dashboard.html#settings') });
        else window.open('dashboard.html#settings', '_blank');
      } catch {}
      window.close();
    });
  }

  (async () => {
    T = I18N[pickLang(await Store.get('gd_lang', null))];
    document.documentElement.lang = pickLang(await Store.get('gd_lang', null));
    $('q').placeholder = T.search; $('qClear').title = T.clear;
    $('txtDash').textContent = T.dash; $('txtSettings').textContent = T.settings;
    applyTheme(await Store.get('gd_theme', 'obsidian'));
    const s = await Store.get('gd_sections', []);
    sections = Array.isArray(s) ? s : [];
    wire(); render(); $('q').focus();
  })();
})();
