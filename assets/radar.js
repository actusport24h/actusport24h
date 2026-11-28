// Radar des Français à l'étranger (/radar-francais/?vue=semaine|joueurs&s=0&ch=&poste=&bleus=1&espoirs=1&bi=1&q=) : données /data/radar/index.json.
import { RADAR_POS, RADAR_LG, RADAR_SORTS, radarWeek, radarFilter, radarWeekSummary, radarTotals, radarSort, fr1, dm } from './radar-core.js?v=b1d0f394';

const root = document.getElementById('radar');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const sp = new URLSearchParams(location.search);
const S = { vue: sp.get('vue') === 'joueurs' ? 'joueurs' : 'semaine', s: Math.min(7, Math.max(0, Number(sp.get('s')) || 0)), lg: RADAR_LG.some(x => x.id === sp.get('ch')) ? sp.get('ch') : '', pos: RADAR_POS.some(x => x.id === sp.get('poste')) ? sp.get('poste') : '', bleus: sp.get('bleus') === '1', u21: sp.get('espoirs') === '1', bi: sp.get('bi') === '1', sel: sp.get('sel') !== '0', q: sp.get('q') || '', tri: RADAR_SORTS.some(x => x.id === sp.get('tri')) ? sp.get('tri') : 'min', more: 24 };
let D = null;
const dShort = iso => new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(iso));
const save = () => { const u = new URL(location.href); const set = (k, v, def) => (v === def || v === '' || v == null ? u.searchParams.delete(k) : u.searchParams.set(k, v)); set('vue', S.vue, 'semaine'); set('s', String(S.s), '0'); set('ch', S.lg, ''); set('poste', S.pos, ''); set('bleus', S.bleus ? '1' : '', ''); set('espoirs', S.u21 ? '1' : '', ''); set('bi', S.bi ? '1' : '', ''); set('sel', S.sel ? '' : '0', ''); set('q', S.q, ''); set('tri', S.tri, 'min'); history.replaceState(null, '', u); };
const photo = p => p.photo ? `<img class="rd-ph" src="${esc(p.photo)}" alt="" width="40" height="40" loading="lazy">` : `<span class="rd-ph rd-ini" aria-hidden="true">${esc(p.name.split(' ').map(w => w[0]).slice(0, 2).join(''))}</span>`;
const badges = p => [p.bleus ? `<span class="rd-b bleus" title="Au moins une sélection en équipe de France A">Bleus${p.bleus.caps ? ` · ${p.bleus.caps} sél.` : ''}</span>` : '',
  p.u21 ? `<span class="rd-b u21" title="${p.u21 === 'sel' ? 'Passé par l’équipe de France espoirs et ' : ''}né en 2004 ou après : sélectionnable pour l’Euro espoirs 2027">${p.u21 === 'sel' ? 'Espoirs' : 'Âge espoirs'}</span>` : '',
  p.nat === 'bi' ? `<span class="rd-b bi" title="Nationalité française ; ${p.other ? `représente ${esc(p.other)}` : 'sélection ou nationalité sportive d’un autre pays'}">Binational${p.other ? ` · ${esc(p.other)}` : ''}</span>` : ''].join('');
const who = p => `<div class="rd-who">${photo(p)}<div><a class="rd-name" href="${esc(p.url || '#')}">${esc(p.name)}</a><span class="rd-club">${p.club.logo ? `<img src="${esc(p.club.logo)}" alt="" width="16" height="16" loading="lazy">` : ''}<a href="${esc(p.club.url || '#')}">${esc(p.club.short || p.club.name)}</a> · ${esc(p.posFr || '')}${p.age ? ` · ${p.age} ans` : ''}</span><span class="rd-bs">${badges(p)}</span></div></div>`;
const stat = m => [m.g ? `<b class="rd-g">${m.g > 1 ? `${m.g} buts` : 'but'}</b>` : '', m.a ? `<b class="rd-a">${m.a > 1 ? `${m.a} passes` : 'passe'}</b>` : ''].filter(Boolean).join(' · ');
const matchLine = (m, compact) => {
  const opp = m.o ? `${m.h ? '' : 'à '}${esc(m.o.n)}` : '';
  const inner = `<span class="rd-md">${esc(dShort(m.d))}</span><span class="rd-mc">${esc(m.cn)}${m.sel ? ' · sélection' : ''}</span><span class="rd-mo">${m.o?.l ? `<img src="${esc(m.o.l)}" alt="" width="16" height="16" loading="lazy">` : ''}${m.h ? 'vs ' : ''}${opp}${m.s ? ` <b>${esc(m.s)}</b>` : ''}</span>
    <span class="rd-mr rd-st${m.st}">${m.st ? `${m.st === 1 ? 'Titulaire' : 'Entré en jeu'} · ${m.min}’` : 'Banc, pas entré'}</span>${stat(m) ? `<span class="rd-ms">${stat(m)}</span>` : ''}${m.n ? `<span class="rd-nt" title="Note moyenne des lecteurs (${m.n[1]} votants)">★ ${fr1(m.n[0])}</span>` : ''}${m.rc ? '<span class="rd-rc" title="Carton rouge">■</span>' : ''}`;
  return `<li class="rd-m${compact ? ' c' : ''}">${m.u ? `<a href="${esc(m.u)}" aria-label="Fiche du match du ${esc(dShort(m.d))}">${inner}</a>` : `<span>${inner}</span>`}</li>`;
};
const filtersHtml = n => `
  <div class="rd-tabs" role="tablist" aria-label="Vue">
    <button type="button" role="tab" class="jx-btn${S.vue === 'semaine' ? ' on' : ''}" aria-selected="${S.vue === 'semaine'}" data-vue="semaine">Cette semaine</button>
    <button type="button" role="tab" class="jx-btn${S.vue === 'joueurs' ? ' on' : ''}" aria-selected="${S.vue === 'joueurs'}" data-vue="joueurs">Tous les joueurs</button>
  </div>
  <div class="rd-f">
    <label>Championnat <select data-f="lg">${RADAR_LG.map(x => `<option value="${x.id}"${x.id === S.lg ? ' selected' : ''}>${esc(x.name)}</option>`).join('')}</select></label>
    <label>Poste <select data-f="pos">${RADAR_POS.map(x => `<option value="${x.id}"${x.id === S.pos ? ' selected' : ''}>${esc(x.name)}</option>`).join('')}</select></label>
    <label class="rd-q">Joueur ou club <input type="search" data-f="q" value="${esc(S.q)}" placeholder="ex. Mbappé, Arsenal" autocomplete="off"></label>
  </div>
  <div class="rd-chk">
    <label><input type="checkbox" data-f="bleus"${S.bleus ? ' checked' : ''}> Bleus (sélectionnés en A)</label>
    <label><input type="checkbox" data-f="u21"${S.u21 ? ' checked' : ''}> Âge espoirs (nés en 2004 ou après)</label>
    <label><input type="checkbox" data-f="sel"${S.sel ? ' checked' : ''}> Matchs en sélection</label>
    <label><input type="checkbox" data-f="bi"${S.bi ? ' checked' : ''}> Binationaux d’une autre sélection</label>
  </div>
  <p class="rd-count" id="rd-count">${n} joueur${n > 1 ? 's' : ''}</p>`;

function weekHtml(list) {
  const w = radarWeek(S.s), sm = radarWeekSummary(list, w, { sel: S.sel });
  const opts = Array.from({ length: 8 }, (_, i) => radarWeek(i)).filter(x => x.offset === 0 || x.from >= (D.since || '')).map(x => `<option value="${x.offset}"${x.offset === S.s ? ' selected' : ''}>${esc(x.label)} (${esc(x.range)})</option>`).join('');
  const row = (r, all) => `<li class="rd-row">${who(r.p)}<div class="rd-wt"><span class="rd-tot">${r.t.min}’${r.t.played > 1 ? ` en ${r.t.played} matchs` : ''}${r.t.g ? ` · <b class="rd-g">${r.t.g} but${r.t.g > 1 ? 's' : ''}</b>` : ''}${r.t.a ? ` · <b class="rd-a">${r.t.a} passe${r.t.a > 1 ? 's' : ''}</b>` : ''}</span><ul class="rd-ml">${(all ? r.ms : r.ms.filter(m => m.st)).map(m => matchLine(m, true)).join('')}</ul></div></li>`;
  return `<div class="rd-week"><label class="rd-wsel">Semaine <select data-f="s">${opts}</select></label>
    <p class="rd-sum"><b>${sm.played.length}</b> ont joué · <b>${sm.goals}</b> but${sm.goals > 1 ? 's' : ''} · <b>${sm.assists}</b> passe${sm.assists > 1 ? 's' : ''} décisive${sm.assists > 1 ? 's' : ''} · ${esc(w.range)}</p>
    <section aria-labelledby="rd-h1"><h2 id="rd-h1" class="rd-h">Buteurs et passeurs</h2>${sm.decisive.length ? `<ul class="rd-list">${sm.decisive.map(r => row(r)).join('')}</ul>` : '<p class="rd-empty">Aucun but ni passe décisive cette semaine pour cette sélection de joueurs.</p>'}</section>
    <section aria-labelledby="rd-h2"><h2 id="rd-h2" class="rd-h">Ont joué <small>(par minutes jouées)</small></h2>${sm.played.length ? `<ul class="rd-list">${sm.played.map(r => row(r)).join('')}</ul>` : '<p class="rd-empty">Personne n’a joué sur cette période (trêve internationale ?). Essaie la semaine précédente.</p>'}</section>
    ${sm.bench.length ? `<section aria-labelledby="rd-h3"><h2 id="rd-h3" class="rd-h">Sur le banc, pas entrés</h2><ul class="rd-list">${sm.bench.map(r => row(r, true)).join('')}</ul></section>` : ''}
    ${sm.none.length ? `<details class="rd-none"><summary>Sans match cette semaine dans nos données (${sm.none.length})</summary><p>${sm.none.map(p => `<a href="${esc(p.url || '#')}">${esc(p.name)}</a> (${esc(p.club.short || p.club.name)})`).join(', ')}.</p></details>` : ''}</div>`;
}
function playersHtml(list) {
  const sorted = radarSort(list, S.tri, { sel: S.sel }), shown = sorted.slice(0, S.more);
  return `<div class="rd-sort"><label>Trier <select data-f="tri">${RADAR_SORTS.map(x => `<option value="${x.id}"${x.id === S.tri ? ' selected' : ''}>${esc(x.name)}</option>`).join('')}</select></label><span>Totaux des matchs depuis le ${esc(dm(D.since || ''))}</span></div>
  <ul class="rd-cards">${shown.map(p => { const t = radarTotals(p, { sel: S.sel }); const ms = p.m.filter(m => S.sel || !m.sel).slice(0, 5);
    return `<li class="rd-card" data-id="${p.id}">${who(p)}<p class="rd-tt"><span><b>${t.played}</b> match${t.played > 1 ? 's' : ''} (${t.starts} tit.)</span><span><b>${t.min}</b> min</span><span><b>${t.g}</b> but${t.g > 1 ? 's' : ''}</span><span><b>${t.a}</b> passe${t.a > 1 ? 's' : ''}</span></p>
    ${ms.length ? `<ul class="rd-ml">${ms.map(m => matchLine(m)).join('')}</ul>` : '<p class="rd-empty">Aucun match dans nos données sur la période.</p>'}</li>`; }).join('')}</ul>
  ${sorted.length > shown.length ? `<p class="rd-more"><button type="button" class="jx-btn" data-act="more">Voir ${Math.min(24, sorted.length - shown.length)} joueurs de plus (${sorted.length - shown.length} restants)</button></p>` : ''}`;
}
function render(keepFocus) {
  const list = radarFilter(D.players, S);
  const active = keepFocus && document.activeElement?.dataset?.f === 'q' ? document.activeElement : null; const pos = active?.selectionStart;
  root.innerHTML = `${filtersHtml(list.length)}<div id="rd-body">${S.vue === 'semaine' ? weekHtml(list) : playersHtml(list)}</div>
  <p class="cal-upd">Données du ${new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', dateStyle: 'long', timeStyle: 'short' }).format(new Date(D.generated))}${D.notesOk ? '' : ' · notes des lecteurs momentanément indisponibles'}.</p>`;
  if (active) { const i = root.querySelector('[data-f="q"]'); i.focus(); try { i.setSelectionRange(pos, pos); } catch { /* */ } }
  save();
}
root.addEventListener('click', e => {
  const v = e.target.closest('[data-vue]'); if (v) { S.vue = v.dataset.vue; S.more = 24; render(); return; }
  if (e.target.closest('[data-act="more"]')) { S.more += 24; render(); }
});
let qT; root.addEventListener('input', e => { if (e.target.dataset.f === 'q') { clearTimeout(qT); qT = setTimeout(() => { S.q = e.target.value.trim(); S.more = 24; render(true); }, 200); } });
root.addEventListener('change', e => {
  const f = e.target.dataset.f; if (!f || f === 'q') return;
  if (e.target.type === 'checkbox') S[f] = e.target.checked; else if (f === 's') S.s = Number(e.target.value); else S[f] = e.target.value;
  S.more = 24; render();
});
(async () => {
  try { const r = await fetch('/data/radar/index.json', { headers: { Accept: 'application/json' } }); if (!r.ok) throw new Error(r.status); D = await r.json(); render(); }
  catch { root.innerHTML = '<p class="rd-empty">Données momentanément indisponibles. Réessaie dans un instant.</p>'; }
})();
