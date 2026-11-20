// Calendrier de difficulté (/calendrier-difficulte/?ch=fra.1&n=5&tri=facile) : données /data/calendrier/index.json générées au build.
const root = document.getElementById('cal');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const LV = ['', 'Très facile', 'Facile', 'Moyen', 'Difficile', 'Très difficile'];
const SORTS = { facile: 'Plus facile d’abord', difficile: 'Plus difficile d’abord', classement: 'Classement' };
const S = { data: null, ch: 'fra.1', n: 5, tri: 'facile' };
const fmt = x => x.toFixed(1).replace('.', ',');
const day = iso => new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', day: 'numeric', month: 'short' }).format(new Date(iso));
export const indexOf = (t, n) => { const f = t.fixtures.slice(0, n); return f.length ? (f.reduce((s, x) => s + x.d, 0) / f.length) * 10 : null; };
function sync() { const u = new URL(location.href); u.searchParams.set('ch', S.ch); u.searchParams.set('n', S.n); u.searchParams.set('tri', S.tri); history.replaceState(null, '', u); }
function render() {
  const L = S.data.leagues[S.ch]; if (!L) return;
  const teams = L.teams.map(t => ({ t, i: indexOf(t, S.n) }));
  if (S.tri === 'facile') teams.sort((a, b) => a.i - b.i || a.t.rank - b.t.rank);
  else if (S.tri === 'difficile') teams.sort((a, b) => b.i - a.i || a.t.rank - b.t.rank);
  else teams.sort((a, b) => a.t.rank - b.t.rank);
  root.innerHTML = `<div class="cal-ctl">
    <div class="cal-tabs" role="tablist" aria-label="Championnat">${Object.values(S.data.leagues).map(l => `<button type="button" role="tab" aria-selected="${l.id === S.ch}" class="jx-btn${l.id === S.ch ? ' on' : ''}" data-ch="${l.id}">${esc(l.name)}</button>`).join('')}</div>
    <div class="cal-opts"><label>Matchs <select id="cal-n">${[3, 4, 5].map(n => `<option value="${n}"${n === S.n ? ' selected' : ''}>${n} prochains</option>`).join('')}</select></label>
    <label>Tri <select id="cal-tri">${Object.entries(SORTS).map(([k, v]) => `<option value="${k}"${k === S.tri ? ' selected' : ''}>${v}</option>`).join('')}</select></label></div></div>
  <div class="cal-legend" aria-label="Légende">${[1, 2, 3, 4, 5].map(l => `<span class="cal-c lv${l}">${LV[l]}</span>`).join('')}<span class="cal-note">(E) = à l’extérieur</span></div>
  <div class="cal-wrap"><table class="cal-t"><caption class="sr-only">${esc(L.name)} : difficulté des ${S.n} prochains matchs de championnat</caption>
    <thead><tr><th scope="col">Équipe</th><th scope="col" title="Indice moyen sur 10 (0 = très facile, 10 = très difficile)">Indice</th>${Array.from({ length: S.n }, (_, k) => `<th scope="col">M${k + 1}</th>`).join('')}</tr></thead>
    <tbody>${teams.map(({ t, i }) => `<tr data-team="${t.id}"><th scope="row"><a href="${t.slug ? `/equipe/${esc(t.slug)}/` : '#'}"><span class="cal-rk">${t.rank}</span>${t.logo ? `<img src="${esc(t.logo)}" alt="" width="20" height="20" loading="lazy">` : ''}<span class="cal-nm">${esc(t.short || t.name)}</span></a></th>
      <td class="cal-i lv${i == null ? 3 : 1 + [3, 4.2, 5.4, 6.6].filter(x => i >= x).length}">${i == null ? '–' : fmt(i)}</td>
      ${Array.from({ length: S.n }, (_, k) => { const f = t.fixtures[k]; return f ? `<td class="cal-c lv${f.lv}" title="${esc(`${day(f.date)} : ${f.home ? 'contre' : 'à'} ${f.opp.name} (${f.opp.rank}e, ${f.opp.pts} pts en ${f.opp.played} matchs, forme ${f.opp.form || '–'}) — ${LV[f.lv]}, ${fmt(f.d * 10)}/10`)}"><b>${esc(f.opp.abbr || f.opp.short)}</b><small>${f.home ? 'D' : 'E'} · ${esc(day(f.date))}</small></td>` : '<td class="cal-c">–</td>'; }).join('')}</tr>`).join('')}</tbody></table></div>
  <p class="cal-upd">Données du ${new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', dateStyle: 'long', timeStyle: 'short' }).format(new Date(S.data.generated))}. Touchez une case pour le détail.</p>`;
}
root.addEventListener('click', e => {
  const b = e.target.closest('[data-ch]'); if (b) { S.ch = b.dataset.ch; sync(); render(); return; }
  const c = e.target.closest('td.cal-c[title]'); if (c) { const p = root.querySelector('.cal-upd'); p.textContent = c.title; }
});
root.addEventListener('change', e => { if (e.target.id === 'cal-n') S.n = Number(e.target.value); if (e.target.id === 'cal-tri') S.tri = e.target.value; sync(); render(); });
(async () => {
  try {
    const r = await fetch('/data/calendrier/index.json', { headers: { Accept: 'application/json' } }); if (!r.ok) throw new Error(r.status);
    S.data = await r.json();
    const q = new URLSearchParams(location.search);
    if (S.data.leagues[q.get('ch')]) S.ch = q.get('ch'); else if (!S.data.leagues[S.ch]) S.ch = Object.keys(S.data.leagues)[0];
    if ([3, 4, 5].includes(Number(q.get('n')))) S.n = Number(q.get('n'));
    if (SORTS[q.get('tri')]) S.tri = q.get('tri');
    render();
  } catch { root.innerHTML = '<p class="jx-err">Le calendrier n’a pas pu être chargé. Réessaie dans un instant.</p>'; }
})();
