// Centre de match : mise à jour en direct (API publique ESPN) avec le même rendu que la page statique.
import { normalizeSummary, centreSections, scorersLineHtml, scoringEvents } from './mc-core.js?v=d6d15e6d';
const root = document.querySelector('.match-page[data-match]');
if (root) {
  const { match: id, comp, home, away } = root.dataset;
  const ESPN = 'https://site.api.espn.com/apis/site/v2/sports/soccer';
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  let timer = 0, MAPS = null;
  const maps = () => MAPS || (MAPS = Promise.all([
    fetch('/data/players-map.json').then(r => (r.ok ? r.json() : {})).catch(() => ({})),
    fetch('/data/teams-map.json').then(r => (r.ok ? r.json() : {})).catch(() => ({})),
  ]));
  const head = () => document.querySelector('.match-head');
  const state = () => { const el = head(); return el?.classList.contains('s-in') ? 'in' : el?.classList.contains('s-post') ? 'post' : 'pre'; };
  const teamNames = [...document.querySelectorAll('.match-head .mod-team span')].map(x => x.textContent);
  const teamLinks = [...document.querySelectorAll('.match-head .mod-team')].map(a => a.getAttribute('href'));
  // Filtre du minute par minute (Tout / Temps forts), conservé entre deux mises à jour.
  let onlyKey = false;
  root.addEventListener('click', e => {
    const b = e.target.closest('.cm-filter button'); if (!b) return;
    onlyKey = b.dataset.f === 'key'; applyFilter();
  });
  function applyFilter() {
    root.querySelectorAll('.mc-comm').forEach(c => { c.classList.toggle('only-key', onlyKey); c.querySelectorAll('.cm-filter button').forEach(x => x.classList.toggle('on', (x.dataset.f === 'key') === onlyKey)); });
  }
  async function tick() {
    let j;
    try { const r = await fetch(`${ESPN}/${comp}/summary?event=${id}`, { cache: 'no-store' }); if (!r.ok) return; j = await r.json(); } catch { return; }
    const [PL, TM] = await maps();
    const names = TM.names || {}, matches = new Set(TM.matches || []);
    const tn = n => names[n] || n;
    const d = normalizeSummary(j, { tn });
    const pl = (pid, name) => (pid && PL[pid] ? `<a class="pl-a" href="/joueur/${PL[pid]}/">${esc(name)}</a>` : esc(name));
    const st = d.status.state || state();
    root.style.setProperty('--ch', d.teams.h.color); root.style.setProperty('--ca', d.teams.a.color);
    const secs = centreSections(d, {
      state: st, away, tn, pl,
      teamLabel: s => { const i = s === 'h' ? 0 : 1; const n = esc(teamNames[i] || tn(d.teams[s]?.name || '')); return teamLinks[i] ? `<a href="${teamLinks[i]}">${n}</a>` : n; },
      date: x => new Date(x).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }),
      matchLink: (mid, html) => (matches.has(String(mid)) ? `<a href="/match/${mid}/">${html}</a>` : html),
    });
    // Ne pas écraser un contenu statique riche par une réponse vide.
    for (const [k, html] of Object.entries(secs)) {
      const el = root.querySelector(`.mc-body[data-k="${k}"]`); if (!el) continue;
      if (/class="empty"/.test(html) && !el.querySelector('.empty')) continue;
      const open = [...el.querySelectorAll('details[open]')].map(x => x.className);
      el.innerHTML = html;
      open.forEach(c => el.querySelector(`details.${c.split(' ')[0]}`)?.setAttribute('open', ''));
    }
    applyFilter();
    // En-tête : score et minute
    const h = head();
    if (h && st !== 'pre' && d.teams.h.score != null) {
      const sc = h.querySelector('.sc-big'), stEl = h.querySelector('.mod-d.st');
      if (sc) sc.textContent = `${d.teams.h.score} - ${d.teams.a.score}`;
      if (stEl && d.status.detail) stEl.textContent = st === 'post' ? 'Terminé' : (d.status.clock || d.status.detail);
      h.classList.remove('s-pre', 's-in', 's-post'); h.classList.add(`s-${st}`);
      const goals = scoringEvents(d.events).map(e => ({ ...e, s: e.s || (e.team === away ? 'a' : 'h') }));
      const html = scorersLineHtml(goals, { short: false, className: 'mod-scorers' });
      const cur = h.querySelector('.mod-scorers');
      if (!html) cur?.remove();
      else if (cur) cur.outerHTML = html;
      else h.querySelector('.mod-main')?.insertAdjacentHTML('afterend', html);
    }
  }
  function arm() {
    clearTimeout(timer); timer = 0;
    const st = state();
    if (document.hidden || st === 'post') return;
    const ko = new Date(head()?.dataset.ko || 0).getTime();
    // Pendant le match : 30 s ; avant : seulement dans l'heure et quart qui précède (compositions), toutes les 2 min.
    if (st === 'pre' && ko - Date.now() > 75 * 60e3) return;
    timer = setTimeout(async () => { timer = 0; await tick(); arm(); }, st === 'in' ? 30000 : 120000);
  }
  const st0 = state();
  const ko0 = new Date(head()?.dataset.ko || 0).getTime();
  if (st0 === 'in' || (st0 === 'post' && root.dataset.static !== '1') || (st0 === 'pre' && ko0 - Date.now() < 75 * 60e3)) tick();
  arm();
  document.addEventListener('visibilitychange', () => { if (!document.hidden && state() === 'in') tick(); arm(); });
  setInterval(() => { if (!document.hidden && state() !== 'post' && !timer) arm(); }, 60000);
}

// Infobulle ⓘ du « xG estimé » : ouverture au toucher / clic (le title couvre la souris), fermeture au clic ailleurs ou Échap.
document.addEventListener('click', e => {
  const b = e.target.closest && e.target.closest('.xg-i');
  document.querySelectorAll('.xg-i.open').forEach(x => { if (x !== b) { x.classList.remove('open'); x.setAttribute('aria-expanded', 'false'); } });
  if (b) { const o = b.classList.toggle('open'); b.setAttribute('aria-expanded', String(o)); }
});
document.addEventListener('keydown', e => { if (e.key === 'Escape') document.querySelectorAll('.xg-i.open').forEach(x => { x.classList.remove('open'); x.setAttribute('aria-expanded', 'false'); }); });
