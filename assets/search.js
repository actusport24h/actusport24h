// Recherche interne ActuSport24h — index JSON statique, aucun service externe.
(() => {
  const form = document.querySelector('.search-form');
  const input = form?.querySelector('input[name="q"]');
  const meta = document.querySelector('.search-meta');
  const box = document.querySelector('.search-results');
  if (!form || !input || !box) return;

  const fold = s => String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  const tokens = q => fold(q).split(/[^a-z0-9]+/).filter(t => t.length >= 2);

  const LABELS = { officiel: 'Officiel', confirme: 'Confirmé', info: 'Info', rumeur: 'Rumeur', analyse: 'Analyse' };
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const fmtDate = iso => {
    try {
      return new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(iso));
    } catch { return ''; }
  };

  let index = null;
  const load = () => index || fetch('/search-index.json', { cache: 'no-cache' })
    .then(r => { if (!r.ok) throw new Error('index'); return r.json(); })
    .then(data => { index = Array.isArray(data.articles) ? data.articles : []; return index; });

  function score(art, terms) {
    const title = fold(art.title);
    const hook = fold(art.hook);
    const tags = fold((art.tags || []).join(' '));
    const section = fold(art.sectionName || art.section || '');
    const body = fold(art.excerpt || '');
    let s = 0;
    for (const t of terms) {
      if (title === t) s += 12;
      else if (title.includes(t)) s += 8;
      if (tags.split(' ').includes(t) || tags.includes(t)) s += 4;
      if (section.includes(t)) s += 2;
      if (hook.includes(t)) s += 3;
      if (body.includes(t)) s += 1;
    }
    return s;
  }

  function render(q, arts) {
    const terms = tokens(q);
    if (!q.trim()) {
      meta.hidden = true;
      box.innerHTML = '<p class="search-hint">Saisissez un joueur, un club, une compétition ou un mot-clé.</p>';
      return;
    }
    const hits = arts.map(a => ({ a, s: score(a, terms) })).filter(x => x.s > 0).sort((x, y) => y.s - x.s || String(y.a.date).localeCompare(String(x.a.date)));
    meta.hidden = false;
    meta.textContent = hits.length
      ? `${hits.length} article${hits.length > 1 ? 's' : ''} pour « ${q.trim()} »`
      : `Aucun article pour « ${q.trim()} »`;
    if (!hits.length) {
      box.innerHTML = '<p class="search-empty">Essayez un autre mot-clé, ou parcourez les <a href="/fil-info/">brèves</a> et les <a href="/">derniers articles</a>.</p>';
      return;
    }
    box.innerHTML = `<ul class="search-list">${hits.slice(0, 50).map(({ a }) => {
      const badge = a.label && LABELS[a.label] ? `<span class="badge b-${esc(a.label)}">${LABELS[a.label]}</span>` : '';
      return `<li><a href="${esc(a.url)}"><span class="search-k">${esc(a.sectionName || '')} ${badge}</span><strong>${esc(a.title)}</strong>${a.hook ? `<span class="search-hook">${esc(a.hook)}</span>` : ''}<span class="search-date">${esc(fmtDate(a.date))}</span></a></li>`;
    }).join('')}</ul>`;
  }

  async function run(q, push) {
    try {
      const arts = await load();
      render(q, arts);
      if (push) {
        const url = q.trim() ? `/recherche/?q=${encodeURIComponent(q.trim())}` : '/recherche/';
        history.replaceState(null, '', url);
      }
    } catch {
      meta.hidden = false;
      meta.textContent = 'La recherche est momentanément indisponible.';
      box.innerHTML = '';
    }
  }

  const initial = new URLSearchParams(location.search).get('q') || '';
  if (initial) input.value = initial;
  run(initial, false);

  form.addEventListener('submit', e => { e.preventDefault(); run(input.value, true); });
  let t;
  input.addEventListener('input', () => {
    clearTimeout(t);
    t = setTimeout(() => run(input.value, true), 180);
  });
})();
