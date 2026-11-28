// Baromètre mercato (/barometre-mercato/?statut=toutes&indice=chaud&club=marseille&q=&tri=recent#id) : données /data/mercato/index.json,
// votes « Ça va se faire ? » sur le Worker (GET /mercato/votes, POST /mercato/vote).
import { mcFilter, mcSort, mcPct, mcDate, MC_LEVELS, MC_STATUS, MC_SORTS, MC_TIER_LABEL } from './mercato-core.js?v=528fbf27';
import { VOTES_API } from './jeux-core.js?v=095f69cd';

const root = document.getElementById('barometre');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const sp = new URLSearchParams(location.search);
const S = { statut: sp.get('statut') === 'toutes' ? 'toutes' : 'actives', niveau: MC_LEVELS[sp.get('indice')] ? sp.get('indice') : '', club: sp.get('club') || '', q: sp.get('q') || '', tri: MC_SORTS[sp.get('tri')] ? sp.get('tri') : 'indice' };
let D = null, V = { votes: {}, mine: {} }, busy = new Set(), msg = {};
function device() { try { let d = localStorage.getItem('mercato-device'); if (!d) { d = crypto.randomUUID(); localStorage.setItem('mercato-device', d); } return d; } catch { return null; } }
const save = () => { const u = new URL(location.href); const set = (k, v, def) => (v === def || !v ? u.searchParams.delete(k) : u.searchParams.set(k, v)); set('statut', S.statut, 'actives'); set('indice', S.niveau, ''); set('club', S.club, ''); set('q', S.q, ''); set('tri', S.tri, 'indice'); history.replaceState(null, '', u); };
const club = c => `<a class="mc-club" href="${esc(c.url)}">${c.logo ? `<img src="${esc(c.logo)}" alt="" width="18" height="18" loading="lazy">` : ''}${esc(c.name)}</a>`;
const kindTag = s => ({ pour: '', confirme: '<span class="mc-k ok">Confirmation</span>', contre: '<span class="mc-k no">Contraire</span>', dementi: '<span class="mc-k no">Démenti</span>', officiel: '<span class="mc-k ok">Officiel</span>', contexte: '<span class="mc-k cx">Contexte</span>' })[s.kind] || '';
const srcLine = s => `<li><a href="${esc(s.url)}" target="_blank" rel="nofollow noopener">${esc(s.outlet)}</a>${s.via ? ` <small>via ${esc(s.via)}</small>` : ''} ${kindTag(s)}<span class="mc-t t${s.tier}" title="Fiabilité du média">${esc(MC_TIER_LABEL[s.tier])}</span>${s.relay ? '<span class="mc-t rl" title="Reprise d’une information déjà comptée : 0 point">reprise</span>' : ''}${s.auto ? '<span class="mc-t au" title="Repéré automatiquement dans un flux RSS public">détection automatique</span>' : ''} <span class="mc-d">${esc(mcDate(s.date))}</span>${s.note || s.title ? `<br><span class="mc-n">${esc(s.note || s.title)}</span>` : ''}</li>`;
function voteHtml(r, s) {
  const v = V.votes[r.id] || { oui: 0, non: 0 }, p = mcPct(v), mine = V.mine[r.id], open = s.status === 'active' && D.open.includes(r.id);
  return `<div class="mc-vote" data-id="${esc(r.id)}"><p class="mc-vq">Ça va se faire ?</p>
    ${open ? `<div class="mc-vb"><button type="button" class="jx-btn${mine === 'oui' ? ' on' : ''}" data-vote="oui" aria-pressed="${mine === 'oui'}"${busy.has(r.id) ? ' disabled' : ''}>Oui</button><button type="button" class="jx-btn${mine === 'non' ? ' on' : ''}" data-vote="non" aria-pressed="${mine === 'non'}"${busy.has(r.id) ? ' disabled' : ''}>Non</button></div>` : '<p class="mc-vc">Vote fermé.</p>'}
    <div class="mc-bar" role="img" aria-label="${p.n} vote${p.n > 1 ? 's' : ''} : ${p.oui} % oui, ${p.non} % non"><span class="oui" style="width:${p.n ? p.oui : 0}%"></span><span class="non" style="width:${p.n ? p.non : 0}%"></span></div>
    <p class="mc-vr">${p.n ? `<b>${p.oui} %</b> oui · <b>${p.non} %</b> non · ${p.n} vote${p.n > 1 ? 's' : ''}` : 'Aucun vote pour l’instant'}${mine ? ` · ton vote : ${mine}${open ? ' (modifiable)' : ''}` : ''}</p>${msg[r.id] ? `<p class="mc-err" role="alert">${esc(msg[r.id])}</p>` : ''}</div>`;
}
function card({ r, s }) {
  const lv = MC_LEVELS[s.level];
  return `<li class="mc-card lv-${s.level} st-${s.status}" id="${esc(r.id)}">
  <div class="mc-top"><div class="mc-who">${r.player.photo ? `<img class="rd-ph" src="${esc(r.player.photo)}" alt="" width="40" height="40" loading="lazy">` : `<span class="rd-ph rd-ini" aria-hidden="true">${esc(r.player.name.split(' ').map(w => w[0]).slice(0, 2).join(''))}</span>`}
    <div><h2 class="mc-name">${r.player.url ? `<a href="${esc(r.player.url)}">${esc(r.player.name)}</a>` : esc(r.player.name)}</h2>
    <p class="mc-move">${club(r.from)}${r.fromNote ? ` <small>(${esc(r.fromNote)})</small>` : ''} <span aria-label="vers">→</span> ${r.to.map(club).join(' <span>ou</span> ')}</p>
    ${r.also?.length ? `<p class="mc-also">Aussi cité : ${r.also.map(club).join(', ')}</p>` : ''}</div></div>
    <div class="mc-badge" title="Indice de crédibilité : ${s.score} point${Math.abs(s.score) > 1 ? 's' : ''}"><span class="mc-lv">${lv.icon} ${lv.label}</span><span class="mc-sc">${s.score} pt${Math.abs(s.score) > 1 ? 's' : ''}</span>${s.status !== 'active' ? `<span class="mc-st">${esc(MC_STATUS[s.status])}</span>` : ''}</div></div>
  <p class="mc-sum">${esc(r.summary)}</p>
  <p class="mc-meta">Première mention : ${esc(mcDate(s.first))} · dernière source favorable : ${esc(mcDate(s.last))}${r.window ? ` · horizon : ${esc(r.window)}` : ''}</p>
  <details class="mc-src"><summary>Sources (${r.sources.length}) et calcul de l’indice</summary><ul>${r.sources.map(srcLine).join('')}</ul>
    <ul class="mc-calc">${s.parts.map(p => `<li>${esc(p.t)}</li>`).join('')}<li><b>Total : ${s.score} → ${esc(lv.label.toLowerCase())}</b></li></ul></details>
  ${r.articles.length ? `<p class="mc-arts">Sur ActuSport24h : ${r.articles.map(a => `<a href="${esc(a.url)}">${esc(a.title)}</a>`).join(' · ')}</p>` : ''}
  ${voteHtml(r, s)}</li>`;
}
function render(keepFocus) {
  const rows = mcSort(mcFilter(D.rumeurs, S), S.tri);
  const all = mcFilter(D.rumeurs, { statut: 'toutes' });
  const n = l => all.filter(x => x.s.status === 'active' && x.s.level === l).length, closed = all.filter(x => x.s.status !== 'active').length;
  const clubs = [...new Map(D.rumeurs.flatMap(r => [r.from, ...r.to, ...(r.also || [])]).map(c => [c.slug, c])).values()].sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  root.innerHTML = `<p class="mc-sum0"><span class="lv-chaud">${MC_LEVELS.chaud.icon} <b>${n('chaud')}</b> chaude${n('chaud') > 1 ? 's' : ''}</span> <span class="lv-tiede">${MC_LEVELS.tiede.icon} <b>${n('tiede')}</b> tiède${n('tiede') > 1 ? 's' : ''}</span> <span class="lv-froid">${MC_LEVELS.froid.icon} <b>${n('froid')}</b> froide${n('froid') > 1 ? 's' : ''}</span>${closed ? ` <span>· ${closed} démentie${closed > 1 ? 's' : ''}, expirée${closed > 1 ? 's' : ''} ou conclue${closed > 1 ? 's' : ''}</span>` : ''}</p>
  <div class="rd-f">
    <label>Rumeurs <select data-f="statut"><option value="actives"${S.statut === 'actives' ? ' selected' : ''}>En cours</option><option value="toutes"${S.statut === 'toutes' ? ' selected' : ''}>Toutes (démenties, expirées…)</option></select></label>
    <label>Indice <select data-f="niveau"><option value="">Tous</option>${Object.entries(MC_LEVELS).map(([k, v]) => `<option value="${k}"${k === S.niveau ? ' selected' : ''}>${v.label}</option>`).join('')}</select></label>
    <label>Club <select data-f="club"><option value="">Tous les clubs</option>${clubs.map(c => `<option value="${esc(c.slug)}"${c.slug === S.club ? ' selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label>
    <label>Trier <select data-f="tri">${Object.entries(MC_SORTS).map(([k, v]) => `<option value="${k}"${k === S.tri ? ' selected' : ''}>${v}</option>`).join('')}</select></label>
    <label class="rd-q">Joueur ou club <input type="search" data-f="q" value="${esc(S.q)}" placeholder="ex. Højbjerg, PSG" autocomplete="off"></label>
  </div>
  <p class="rd-count">${rows.length} rumeur${rows.length > 1 ? 's' : ''} · mise à jour ${esc(new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }).format(new Date(D.generated)))}</p>
  ${rows.length ? `<ul class="mc-list">${rows.map(card).join('')}</ul>` : '<p class="rd-empty">Aucune rumeur ne correspond à ces filtres.</p>'}`;
  if (keepFocus) { const i = root.querySelector('[data-f="q"]'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }
}
async function loadVotes() {
  const ids = D.rumeurs.map(r => r.id), d = device();
  try { const r = await fetch(`${VOTES_API}/mercato/votes?ids=${ids.join(',')}${d ? `&device=${d}` : ''}`); const j = await r.json(); if (j.ok) V = { votes: j.votes || {}, mine: j.mine || {} }; } catch {}
}
root.addEventListener('change', e => { const f = e.target.dataset.f; if (!f || f === 'q') return; S[f] = e.target.value; save(); render(); });
root.addEventListener('input', e => { if (e.target.dataset.f !== 'q') return; S.q = e.target.value; save(); render(true); });
root.addEventListener('click', async e => {
  const b = e.target.closest('[data-vote]'); if (!b) return;
  const id = b.closest('.mc-vote').dataset.id, d = device();
  if (!d) { msg[id] = 'Ton navigateur bloque le stockage local : impossible de voter.'; render(); return; }
  busy.add(id); delete msg[id]; render();
  try {
    const r = await fetch(`${VOTES_API}/mercato/vote`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, pick: b.dataset.vote, device: d }) });
    const j = await r.json().catch(() => ({}));
    if (j.ok) { V.votes[id] = j.votes; V.mine[id] = j.mine; } else msg[id] = j.error || 'Vote impossible, réessaie plus tard.';
  } catch { msg[id] = 'Connexion impossible, réessaie plus tard.'; }
  busy.delete(id); render();
  document.querySelector(`#${CSS.escape(id)} [data-vote="${b.dataset.vote}"]`)?.focus();
});
(async () => {
  try {
    const [d, ids] = await Promise.all([fetch('/data/mercato/index.json').then(r => r.json()), fetch('/data/mercato/ids.json').then(r => r.json()).catch(() => ({ open: [] }))]);
    D = { ...d, open: ids.open || [] };
    render(); await loadVotes(); render();
    if (location.hash) document.getElementById(decodeURIComponent(location.hash.slice(1)))?.scrollIntoView();
  } catch { root.innerHTML = '<p class="rd-empty">Le baromètre n’a pas pu être chargé. Réessaie dans un instant.</p>'; }
})();
