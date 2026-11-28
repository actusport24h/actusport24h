// Simulateur de classement « et si » (/simulateur/?ch=fra.1&j=11-12&s=…) : données /data/simulateur/<championnat>.json générées au build.
import { SIM_LEAGUES, SIM_ZONES, SIM_CRIT, simTable, simOrder, simEncode, simDecode } from './sim-core.js?v=87f9d9d5';

const root = document.getElementById('sim');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const LGS = Object.keys(SIM_LEAGUES);
const S = { lg: 'fra.1', docs: {}, scores: {}, from: null, to: null, msg: '' };
const store = { get: k => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { if (v) localStorage.setItem(k, v); else localStorage.removeItem(k); } catch { /* navigation privée */ } } };
const day = iso => iso ? new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(iso)) : 'date à fixer';
const dShort = iso => new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', day: 'numeric', month: 'short' }).format(new Date(iso));
const ord = n => `${n}${n === 1 ? 're' : 'e'}`;
const doc = () => S.docs[S.lg];
const order = () => simOrder(doc().teams.map(t => t.id));
const team = id => doc().teams.find(t => t.id === id) || { id, name: id, short: id };
const scores = () => (S.scores[S.lg] ||= new Map());
const key = m => `${m.h}>${m.a}`;
const rounds = () => [...new Set(doc().left.map(m => m.j).filter(j => j != null))].sort((a, b) => a - b);
function range() { const r = rounds(); const from = r.includes(S.from) ? S.from : r[0]; let to = r.includes(S.to) ? S.to : from; if (to < from) to = from; return [from, to]; }
const shown = () => { const [a, b] = range(); return doc().left.filter(m => m.j == null || (m.j >= a && m.j <= b)); };

function save() {
  const enc = simEncode(order(), scores());
  store.set(`sim-${S.lg}`, enc);
  const u = new URL(location.href); u.searchParams.set('ch', S.lg);
  const [a, b] = range(); if (a != null) u.searchParams.set('j', a === b ? String(a) : `${a}-${b}`);
  if (enc) u.searchParams.set('s', enc); else u.searchParams.delete('s');
  history.replaceState(null, '', u);
}
function shareUrl() { const u = new URL(location.href); u.hash = ''; return u.toString(); }

function compute(withSim) {
  const d = doc(), sc = scores();
  const sim = withSim ? d.left.filter(m => sc.has(key(m))).map(m => ({ h: m.h, a: m.a, hs: sc.get(key(m))[0], as: sc.get(key(m))[1] })) : [];
  const complete = withSim && sim.length === d.left.length;
  const names = Object.fromEntries(d.teams.map(t => [t.id, t.name]));
  return simTable(S.lg, { teams: d.teams.map(t => t.id), results: [...d.played, ...sim], adj: d.adj, complete, names });
}

function render(tableOnly) {
  const d = doc(); if (!d) return;
  const R = SIM_LEAGUES[S.lg], sc = scores(), rs = rounds(), [a, b] = range();
  const real = new Map(compute(false).rows.map(r => [r.id, r.rank]));
  const { rows } = compute(true);
  const nSim = d.left.filter(m => sc.has(key(m))).length;
  const byRound = new Map(); for (const m of shown()) { const k = m.j ?? 'tbd'; if (!byRound.has(k)) byRound.set(k, []); byRound.get(k).push(m); }
  const opt = (v, sel) => rs.map(j => `<option value="${j}"${j === sel ? ' selected' : ''}>J${j}</option>`).join('');
  const label = j => { if (j === 'tbd') return 'Matchs reportés (date à fixer)'; const ms = d.left.filter(m => m.j === j && m.date); const ds = ms.map(m => m.date).sort(); return `Journée ${j}${ds.length ? ` · ${dShort(ds[0])}${dShort(ds[0]) !== dShort(ds[ds.length - 1]) ? ` – ${dShort(ds[ds.length - 1])}` : ''}` : ''}`; };
  const matchRow = m => {
    const s = sc.get(key(m)), H = team(m.h), A = team(m.a);
    const res = s ? (s[0] > s[1] ? '1' : s[0] < s[1] ? '2' : 'N') : '';
    return `<li class="sim-m${s ? ' set' : ''}" data-k="${key(m)}">
      <span class="sim-d">${esc(day(m.date))}${m.live ? ' · en cours' : ''}</span>
      <span class="sim-t h">${esc(H.short || H.name)}${H.logo ? `<img src="${esc(H.logo)}" alt="" width="18" height="18" loading="lazy">` : ''}</span>
      <span class="sim-sc"><input type="number" inputmode="numeric" min="0" max="20" aria-label="Buts de ${esc(H.name)}" data-side="0" value="${s ? s[0] : ''}"><b>–</b><input type="number" inputmode="numeric" min="0" max="20" aria-label="Buts de ${esc(A.name)}" data-side="1" value="${s ? s[1] : ''}"></span>
      <span class="sim-t a">${A.logo ? `<img src="${esc(A.logo)}" alt="" width="18" height="18" loading="lazy">` : ''}${esc(A.short || A.name)}</span>
      <span class="sim-q" role="group" aria-label="Résultat rapide">${['1', 'N', '2'].map(x => `<button type="button" data-q="${x}" class="${res === x ? 'on' : ''}" aria-pressed="${res === x}" title="${x === '1' ? `Victoire de ${esc(H.name)} (1-0)` : x === '2' ? `Victoire de ${esc(A.name)} (0-1)` : 'Match nul (0-0)'}">${x}</button>`).join('')}</span>
    </li>`;
  };
  const ties = rows.filter(r => r.by).map(r => { const up = rows[r.rank - 2]; return `${esc(team(r.id).name)} derrière ${esc(team(up.id).name)} (${r.by === 'lots' ? `égalité parfaite : ${esc(R.rest)}` : esc(SIM_CRIT[r.by])})`; });
  const zonesUsed = [...new Set(R.zones.map(z => z[2]))];
  const right = `    <section class="sim-right" aria-labelledby="sim-th">
      <h2 id="sim-th" class="sim-h">Classement ${nSim ? 'simulé' : 'actuel'}</h2>
      <p class="sim-meta" id="sim-meta">${nSim ? `<b>${nSim}</b> match${nSim > 1 ? 's' : ''} simulé${nSim > 1 ? 's' : ''} sur ${d.left.length} restants · flèches : écart avec le classement actuel` : `Aucun match simulé : classement réel après ${d.played.length} matchs.`}</p>
      <div class="sim-acts"><button type="button" class="jx-btn primary" data-act="share">Partager ma simulation</button><button type="button" class="jx-btn" data-act="reset"${nSim ? '' : ' disabled'}>Réinitialiser tout</button></div>
      <p class="sim-msg" id="sim-msg" role="status" aria-live="polite">${esc(S.msg)}</p>
      <div class="oj-scroll"><table class="sim-t-tab"><caption class="sr-only">${esc(R.name)} : classement ${nSim ? 'simulé' : 'actuel'}</caption>
        <thead><tr><th scope="col">#</th><th scope="col" class="sim-dl"><span class="sr-only">Évolution</span></th><th scope="col">Équipe</th><th scope="col" title="Points">Pts</th><th scope="col" title="Matchs joués">J</th><th scope="col" title="Victoires">G</th><th scope="col" title="Nuls">N</th><th scope="col" title="Défaites">P</th><th scope="col" class="sim-x" title="Buts pour">BP</th><th scope="col" class="sim-x" title="Buts contre">BC</th><th scope="col" title="Différence de buts">Diff</th></tr></thead>
        <tbody>${rows.map(r => { const T = team(r.id), dl = real.get(r.id) - r.rank, z = r.zone;
          return `<tr data-team="${r.id}" class="${z ? `z-${z}` : ''}"${z ? ` title="${esc(SIM_ZONES[z].label)}"` : ''}><td class="sim-rk"><span style="${z ? `background:${SIM_ZONES[z].color}` : ''}">${r.rank}</span></td>
          <td class="sim-dl ${dl > 0 ? 'up' : dl < 0 ? 'down' : ''}">${dl > 0 ? `▲${dl}` : dl < 0 ? `▼${-dl}` : ''}</td>
          <th scope="row"><a href="${T.slug ? `/equipe/${esc(T.slug)}/` : '#'}">${T.logo ? `<img src="${esc(T.logo)}" alt="" width="18" height="18" loading="lazy">` : ''}<span>${esc(T.short || T.name)}</span></a>${r.adj ? ` <small class="sim-adj" title="Points retirés ou ajoutés par décision officielle">(${r.adj > 0 ? '+' : ''}${r.adj})</small>` : ''}</th>
          <td class="sim-pts">${r.pts}</td><td>${r.p}</td><td>${r.w}</td><td>${r.d}</td><td>${r.l}</td><td class="sim-x">${r.gf}</td><td class="sim-x">${r.ga}</td><td>${r.gd > 0 ? '+' : ''}${r.gd}</td></tr>`; }).join('')}</tbody></table></div>
      <div class="sim-legend" aria-label="Zones">${zonesUsed.map(z => `<span><i style="background:${SIM_ZONES[z].color}"></i>${esc(SIM_ZONES[z].label)} (${R.zones.filter(x => x[2] === z).map(([p, q]) => p === q ? ord(p) : `${ord(p)}–${ord(q)}`).join(', ')})</span>`).join('')}</div>
      ${ties.length ? `<p class="sim-ties"><b>Égalités de points :</b> ${ties.join(' ; ')}.</p>` : ''}
      <p class="sim-rules"><b>Départage en ${esc(R.name)} :</b> ${R.crit.map((c, i) => `${i + 1}) ${esc(SIM_CRIT[c])}`).join(', ')}, puis ${esc(R.rest)}.</p>
      <p class="cal-upd">Données du ${new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', dateStyle: 'long', timeStyle: 'short' }).format(new Date(d.generated))}.</p>
    </section>
`;
  if (tableOnly && root.querySelector('.sim-right')) { root.querySelector('.sim-right').outerHTML = right; return; }
  root.innerHTML = `
  <div class="cal-ctl sim-ctl">
    <div class="cal-tabs" role="tablist" aria-label="Championnat">${LGS.map(l => `<button type="button" role="tab" aria-selected="${l === S.lg}" class="jx-btn${l === S.lg ? ' on' : ''}" data-ch="${l}">${esc(SIM_LEAGUES[l].name)}</button>`).join('')}</div>
  </div>
  <div class="sim-grid">
    <section class="sim-left" aria-labelledby="sim-mh">
      <h2 id="sim-mh" class="sim-h">Matchs restants <a class="sim-jump" href="#sim-th">Voir le classement ↓</a></h2>
      ${rs.length ? `<div class="sim-range"><label>De <select id="sim-from">${opt(0, a)}</select></label><label>à <select id="sim-to">${opt(0, b)}</select></label>
        <button type="button" class="jx-btn sim-all" data-act="allrounds">Toute la saison</button></div>` : '<p class="sim-note">Plus aucun match à jouer : la saison est terminée.</p>'}
      <div class="sim-bulk"><span>Matchs affichés :</span>
        <button type="button" class="jx-btn" data-act="home">Tout en victoire à domicile</button>
        <button type="button" class="jx-btn" data-act="draw">Tout en nul</button>
        <button type="button" class="jx-btn" data-act="away">Tout en victoire à l’extérieur</button>
        <button type="button" class="jx-btn" data-act="clear">Effacer</button></div>
      ${[...byRound.entries()].map(([j, ms]) => `<h3 class="sim-jh">${esc(label(j))}</h3><ul class="sim-ms">${ms.map(matchRow).join('')}</ul>`).join('')}
    </section>
${right}  </div>`;
}

function setScore(k, s) { if (s) scores().set(k, s); else scores().delete(k); }
function bulk(kind) { for (const m of shown()) setScore(key(m), kind === 'home' ? [1, 0] : kind === 'away' ? [0, 1] : kind === 'draw' ? [0, 0] : null); }
async function loadLg(lg) {
  if (!S.docs[lg]) { const r = await fetch(`/data/simulateur/${lg}.json`, { headers: { Accept: 'application/json' } }); if (!r.ok) throw new Error(r.status); S.docs[lg] = await r.json(); }
  if (!S.scores[lg]) { const sp = new URLSearchParams(location.search); const fromUrl = sp.get('ch') === lg ? sp.get('s') : null; S.scores[lg] = simDecode(simOrder(S.docs[lg].teams.map(t => t.id)), fromUrl ?? store.get(`sim-${lg}`) ?? ''); }
  // garder seulement les affiches encore à jouer
  const leftK = new Set(S.docs[lg].left.map(key)); for (const k of [...S.scores[lg].keys()]) if (!leftK.has(k)) S.scores[lg].delete(k);
}
async function go(lg, keepRange) {
  S.lg = lg; if (!keepRange) { S.from = null; S.to = null; }
  try { await loadLg(lg); } catch { root.innerHTML = '<p class="sim-note">Données momentanément indisponibles. Réessaie dans un instant.</p>'; return; }
  S.msg = ''; render(); save();
}

root.addEventListener('click', async e => {
  const t = e.target;
  const ch = t.closest('[data-ch]'); if (ch) { go(ch.dataset.ch); return; }
  const q = t.closest('.sim-q button'); if (q) { const k = q.closest('[data-k]').dataset.k; const v = { 1: [1, 0], N: [0, 0], 2: [0, 1] }[q.dataset.q]; const cur = scores().get(k); setScore(k, cur && cur[0] === v[0] && cur[1] === v[1] ? null : v); S.msg = ''; render(); save(); return; }
  const act = t.closest('[data-act]')?.dataset.act; if (!act) return;
  if (['home', 'draw', 'away', 'clear'].includes(act)) { bulk(act); S.msg = ''; }
  if (act === 'allrounds') { const r = rounds(); S.from = r[0]; S.to = r[r.length - 1]; }
  if (act === 'reset') { scores().clear(); S.msg = 'Simulation effacée : retour au classement réel.'; }
  if (act === 'share') {
    save(); const url = shareUrl(), title = `Mon classement « et si » de ${SIM_LEAGUES[S.lg].name}`;
    if (navigator.share && matchMedia('(pointer:coarse)').matches) { try { await navigator.share({ title, url }); return; } catch { /* annulé */ } }
    try { await navigator.clipboard.writeText(url); S.msg = 'Lien copié : il rouvre exactement cette simulation.'; } catch { S.msg = url; }
  }
  render(); save();
});
root.addEventListener('change', e => {
  const t = e.target;
  if (t.id === 'sim-from') { S.from = Number(t.value); if (S.to == null || S.to < S.from) S.to = S.from; }
  else if (t.id === 'sim-to') { S.to = Number(t.value); if (S.from == null || S.from > S.to) S.from = S.to; }
  else if (t.matches('.sim-sc input')) {
    const li = t.closest('[data-k]'), [x, y] = [...li.querySelectorAll('input')].map(i => i.value.trim());
    const ok = v => /^\d{1,2}$/.test(v) && Number(v) <= 20;
    if (x === '' && y === '') setScore(li.dataset.k, null);
    else if (ok(x) && ok(y)) setScore(li.dataset.k, [Number(x), Number(y)]);
    else { li.classList.add('half'); setScore(li.dataset.k, null); syncRow(li); render(true); save(); return; } // score incomplet : pas compté
    li.classList.remove('half'); syncRow(li); S.msg = ''; render(true); save(); return; // garder le focus dans la liste des matchs
  } else return;
  S.msg = ''; render(); save();
});
function syncRow(li) {
  const s = scores().get(li.dataset.k), res = s ? (s[0] > s[1] ? '1' : s[0] < s[1] ? '2' : 'N') : '';
  li.classList.toggle('set', !!s);
  for (const b of li.querySelectorAll('.sim-q button')) { b.classList.toggle('on', b.dataset.q === res); b.setAttribute('aria-pressed', String(b.dataset.q === res)); }
}
(async () => {
  const sp = new URLSearchParams(location.search);
  const lg = LGS.includes(sp.get('ch')) ? sp.get('ch') : (LGS.includes(store.get('sim-lg')) ? store.get('sim-lg') : 'fra.1');
  const j = (sp.get('j') || '').match(/^(\d{1,2})(?:-(\d{1,2}))?$/); if (j) { S.from = Number(j[1]); S.to = Number(j[2] || j[1]); }
  await go(lg, true);
})();
addEventListener('pagehide', () => store.set('sim-lg', S.lg));
