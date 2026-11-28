// Page « Onze de la journée » (/onze-de-la-journee/) : meilleur onze (4-3-3) par championnat et par journée.
// Données : /data/onze-journee/<championnat>.json (stats des matchs + notes des lecteurs, voir la méthode sur la page).
import { formationSlots } from './compo-core.js?v=a0d83acc';
import { PITCH_SVG } from './compo-readers.js?v=67543492';

const root = document.getElementById('oj');
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fr = x => (Math.round(Number(x) * 10) / 10).toFixed(1).replace('.', ',');
const TZ = { timeZone: 'Europe/Paris' };
const dm = d => new Intl.DateTimeFormat('fr-FR', { ...TZ, day: 'numeric', month: 'long' }).format(new Date(d));
const dayLabel = d => { const a = dm(d.from), b = dm(d.to); return a === b ? `Journée du ${a}` : `Journée du ${a.split(' ')[1] === b.split(' ')[1] ? a.split(' ')[0] : a} au ${b}`; };
const sp = new URLSearchParams(location.search);
const S = { idx: null, ch: sp.get('ch') || 'fra.1', day: sp.get('j') || null, docs: new Map() };

async function getDoc(lg) {
  if (!S.docs.has(lg)) S.docs.set(lg, fetch(`/data/onze-journee/${lg}.json`, { headers: { Accept: 'application/json' } }).then(r => { if (!r.ok) throw new Error(r.status); return r.json(); }));
  return S.docs.get(lg);
}
const pl = (n, w) => `${n > 1 ? `${n} ` : ''}${w}${n > 1 ? 's' : ''}`;
const badges = p => [p.st.g ? `⚽ ${pl(p.st.g, 'but')}` : '', p.st.a ? pl(p.st.a, 'passe déc.').replace('déc.s', 'déc.') : '', p.st.cs ? 'clean sheet' : '', p.st.yc ? 'carton jaune' : '', p.st.rc ? 'carton rouge' : '', p.st.og ? 'but contre son camp' : '', p.st.sub ? `entré à la ${Math.floor(p.st.inMin)}e` : '']
  .filter(Boolean).map(t => `<span class="oj-b">${esc(t)}</span>`).join('');
const RES = { V: 'victoire', N: 'nul', D: 'défaite' };
const matchTxt = p => { const [h, a] = p.match.score.split('-'); return `${p.home ? 'contre' : 'à'} ${p.opp.name} · ${RES[p.st.res] || ''} ${p.home ? h : a}-${p.home ? a : h}`; };
function row(p, label) {
  const name = p.url ? `<a href="${esc(p.url)}">${esc(p.name)}</a>` : esc(p.name);
  const m = esc(matchTxt(p));
  const reader = p.note && p.note.n ? `${fr(p.note.avg)} (${p.note.n} votant${p.note.n > 1 ? 's' : ''})` : '–';
  return `<tr data-id="${esc(p.id)}"><td class="oj-pos">${esc(label || '')}</td><td class="oj-pl">${p.team.logo ? `<img src="${esc(p.team.logo)}" alt="" width="20" height="20" loading="lazy">` : ''}<span>${name}<small>${esc(p.team.name)} · ${p.match.url ? `<a href="${esc(p.match.url)}">${m}</a>` : m}</small><span class="oj-bs">${badges(p)}</span><small class="oj-mob">Stats ${fr(p.stats)} · lecteurs ${reader}</small></span></td>
    <td class="oj-n oj-d">${fr(p.stats)}</td><td class="oj-n oj-d">${p.note && p.note.n ? `${fr(p.note.avg)}<small>${p.note.n} votant${p.note.n > 1 ? 's' : ''}</small>` : '–'}</td><td class="oj-n oj-f"><b>${fr(p.score)}</b></td></tr>`;
}
async function render() {
  let doc;
  try { doc = await getDoc(S.ch); } catch { root.innerHTML = '<p class="ftc-empty">Le onze de la journée est momentanément indisponible.</p>'; return; }
  const days = doc.days || [];
  const d = days.find(x => x.key === S.day) || days[0];
  if (d) S.day = d.key;
  const pos = formationSlots('4-3-3');
  root.innerHTML = `<div class="cal-ctl">
    <div class="cal-tabs" role="tablist" aria-label="Championnat">${S.idx.leagues.map(l => `<button type="button" role="tab" aria-selected="${l.lg === S.ch}" class="jx-btn${l.lg === S.ch ? ' on' : ''}" data-ch="${l.lg}">${esc(l.name)}</button>`).join('')}</div>
    ${days.length ? `<label class="cal-sel"><span>Journée</span> <select id="oj-day">${days.map(x => `<option value="${x.key}"${x === d ? ' selected' : ''}>${esc(dayLabel(x))}${x.frozen ? '' : ' (provisoire)'}</option>`).join('')}</select></label>` : ''}
  </div>
  ${!d ? '<p class="ftc-empty">Pas encore de journée terminée pour ce championnat.</p>' : `
  <div class="oj-grid">
    <div class="oj-board"><h2 class="oj-h">${esc(doc.name)} · ${esc(dayLabel(d))}</h2>
      <p class="oj-meta">${d.matches} match${d.matches > 1 ? 's' : ''} · ${d.candidates} joueurs pris en compte · ${d.frozen ? 'onze définitif' : `<b>provisoire</b> : les notes des lecteurs sont ouvertes jusqu’au ${new Intl.DateTimeFormat('fr-FR', { ...TZ, day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }).format(new Date(d.closes)).replace(':', 'h')}`}</p>
      <div class="ftc-pitch ro oj-pitch" style="--tc:#E10E2D">${PITCH_SVG}${pos.map((s, i) => { const p = d.xi[i]; return `<div class="ftc-slot${p ? ' filled' : ''}" style="left:${s.x}%;top:${s.y}%" title="${esc(p ? `${p.name} (${p.team.name}) · ${fr(p.score)}` : s.name)}"><span class="ftc-dot">${p ? fr(p.score) : esc(s.label)}</span><span class="ftc-nm">${p ? (p.url ? `<a href="${esc(p.url)}">${esc(p.short)}</a>` : esc(p.short)) : ''}</span>${p?.team.logo ? `<img class="oj-logo" src="${esc(p.team.logo)}" alt="" width="18" height="18">` : ''}</div>`; }).join('')}</div>
    </div>
    <div class="oj-list"><div class="oj-scroll"><table class="oj-t"><thead><tr><th>Poste</th><th>Joueur</th><th class="oj-d" title="Note calculée avec les stats du match">Stats</th><th class="oj-d" title="Moyenne des lecteurs">Lecteurs</th><th>Note</th></tr></thead>
      <tbody>${d.xi.map((p, i) => row(p, pos[i].label)).join('')}</tbody></table></div>
      ${d.bench?.length ? `<h3 class="oj-h3">Juste derrière</h3><div class="oj-scroll"><table class="oj-t oj-bench"><tbody>${d.bench.map(p => row(p, { G: 'G', D: 'Déf.', M: 'Mil.', A: 'Att.' }[p.fam])).join('')}</tbody></table></div>` : ''}
      <p class="cal-upd">Calculé le ${new Intl.DateTimeFormat('fr-FR', { ...TZ, dateStyle: 'long', timeStyle: 'short' }).format(new Date(d.updated))}.${d.withNotes ? ` Notes des lecteurs prises en compte pour ${d.withNotes} joueur${d.withNotes > 1 ? 's' : ''}.` : ' Aucun joueur n’a encore 3 votants : note des stats seule.'}</p>
    </div>
  </div>`}`;
  const q = new URLSearchParams(); q.set('ch', S.ch); if (S.day && S.day !== days[0]?.key) q.set('j', S.day);
  history.replaceState(null, '', `${location.pathname}?${q}`);
}
root.addEventListener('click', e => { const b = e.target.closest('[data-ch]'); if (b) { S.ch = b.dataset.ch; S.day = null; render(); } });
root.addEventListener('change', e => { if (e.target.id === 'oj-day') { S.day = e.target.value; render(); } });
(async () => {
  try { S.idx = await fetch('/data/onze-journee/index.json').then(r => r.json()); } catch { root.innerHTML = '<p class="ftc-empty">Le onze de la journée est momentanément indisponible.</p>'; return; }
  if (!S.idx.leagues.some(l => l.lg === S.ch)) S.ch = S.idx.leagues[0]?.lg;
  render();
})();
