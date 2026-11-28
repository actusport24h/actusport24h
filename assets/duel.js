// Duel de joueurs (/duel/?a=<id>&b=<id>) : deux fiches du site côte à côte, barres comparatives, vote « Qui préfères-tu ? ».
import { barPct, better, clubCareer, DUEL_ROWS, duelUrl, IX, norm, searchPlayers, seasonTotals, VOTES_API, xIntent } from './jeux-core.js?v=095f69cd';

const root = document.getElementById('duel');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const getJSON = async u => { const r = await fetch(u, { headers: { Accept: 'application/json' } }); if (!r.ok) throw new Error(String(r.status)); return r.json(); };
const S = { rows: [], byId: new Map(), bySlug: new Map(), sel: [null, null], data: [null, null], notes: [null, null], votes: null, q: ['', ''] };
function device() {
  try { let d = localStorage.getItem('duel-device'); if (!d) { d = crypto.randomUUID(); localStorage.setItem('duel-device', d); } return d; } catch { return null; }
}
const fmtN = n => String(n).replace('.', ',');
const local = u => String(u || '').replace('https://actusport24h.fr', '');
const seniorIntl = p => (p.intl || []).filter(x => !/\bU-?\d{2}\b|olymp|espoirs|b$/i.test(x.team));
const years = c => (c.from ? `${c.from}–${c.to || 'auj.'}` : '');

function slotHtml(i) {
  const id = S.sel[i], r = id && S.byId.get(id);
  const label = i ? 'Joueur 2' : 'Joueur 1';
  return `<div class="dl-slot" data-slot="${i}">
    ${r ? `<div class="dl-chosen"><b>${esc(r[IX.name])}</b><span>${esc([r[IX.club], r[IX.pos]].filter(Boolean).join(' · '))}</span><button type="button" class="dl-change" data-change="${i}">Changer</button></div>` : ''}
    <div class="dl-search"${r ? ' hidden' : ''}><label for="dl-q${i}">${label}</label>
      <input id="dl-q${i}" type="search" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="dl-l${i}" autocomplete="off" placeholder="Nom du joueur (ex. Mbappe, Dembele)" value="${esc(S.q[i])}">
      <ul id="dl-l${i}" class="dl-list" role="listbox"></ul></div></div>`;
}
function listHtml(i) {
  const res = searchPlayers(S.rows, S.q[i], 8, S.sel.filter(Boolean));
  if (norm(S.q[i]).length < 2) return '';
  if (!res.length) return '<li class="dl-none">Aucun joueur trouvé.</li>';
  return res.map((r, k) => `<li role="option" id="dl-o${i}-${k}" data-pick="${r[0]}" data-slot="${i}" aria-selected="false"><b>${esc(r[IX.name])}</b><span>${esc([r[IX.club], r[IX.pos]].filter(Boolean).join(' · '))}</span></li>`).join('');
}
function headCard(p, i) {
  const photo = p.photo && p.photo.startsWith('https://actusport24h.fr/') ? p.photo : null;
  const cr = p.photoCredit;
  return `<div class="dl-card dl-c${i}">
    ${photo ? `<img class="dl-photo" src="${esc(local(photo))}" alt="${esc(p.name)}" width="120" height="120" loading="lazy">` : `<div class="dl-photo dl-nophoto" aria-hidden="true">${esc((p.first || p.name)[0])}${esc((p.last || '')[0] || '')}</div>`}
    <h2><a href="${esc(local(p.url))}">${esc(p.name)}</a></h2>
    <p class="dl-club">${p.club?.logo ? `<img src="${esc(p.club.logo)}" alt="" width="20" height="20">` : ''}${esc(p.club?.name || 'Sans club')}</p>
    <p>${esc([p.posFr, p.age != null ? `${p.age} ans` : null].filter(Boolean).join(' · '))}</p>
    <p>${p.flag ? `<img src="${esc(p.flag)}" alt="" width="18" height="12">` : ''} ${esc(p.natFr || p.nat || '')}</p>
    ${photo && cr ? `<p class="dl-credit">Photo : ${esc(cr.author || '')}, <a href="${esc(cr.licenseUrl || '#')}" rel="noopener">${esc(cr.license || '')}</a></p>` : ''}
  </div>`;
}
function compare(label, va, vb, row = {}) {
  const w = better(row, va, vb), pa = barPct(va, vb);
  return `<div class="dl-row"><span class="dl-v ${w === 1 ? 'best' : ''}">${fmtN(va)}</span><div class="dl-mid"><span class="dl-lab">${esc(label)}</span><div class="dl-bar" aria-hidden="true"><i class="a" style="width:${pa}%"></i><i class="b" style="width:${100 - pa}%"></i></div></div><span class="dl-v ${w === -1 ? 'best' : ''}">${fmtN(vb)}</span></div>`;
}
function plain(label, va, vb) { return `<div class="dl-row dl-plain"><span class="dl-v">${esc(va ?? '–')}</span><div class="dl-mid"><span class="dl-lab">${esc(label)}</span></div><span class="dl-v">${esc(vb ?? '–')}</span></div>`; }
function splitsHtml(p) {
  if (!p.splits?.length) return '<p class="dl-empty">Pas de statistiques cette saison.</p>';
  return `<table class="dl-tab"><thead><tr><th>Compétition</th><th title="Titularisations">Tit.</th><th>Buts</th><th title="Passes décisives">Pd</th></tr></thead><tbody>${p.splits.map(s => `<tr><td>${esc(s.compFr || s.comp)}<small>${esc(s.teamFr || s.team || '')}</small></td><td>${s.starts ?? 0}</td><td>${s.g ?? 0}</td><td>${s.a ?? 0}</td></tr>`).join('')}</tbody></table>`;
}
function careerHtml(p) {
  const c = clubCareer(p);
  if (!c.length) return '<p class="dl-empty">Parcours non disponible.</p>';
  return `<ol class="dl-car">${c.map(x => `<li><b>${esc(x.team)}</b>${x.loan ? ' <em>(prêt)</em>' : ''}<span>${esc(years(x))}${x.apps != null ? ` · ${x.apps} m, ${x.goals ?? 0} b` : ''}</span></li>`).join('')}</ol>`;
}
function intlHtml(p) {
  const l = seniorIntl(p);
  if (!l.length) return '<p class="dl-empty">Aucune sélection en équipe A selon sa fiche.</p>';
  return l.map(x => `<p><b>${esc(x.team)}</b> : ${x.apps ?? 0} sélection${(x.apps ?? 0) > 1 ? 's' : ''}, ${x.goals ?? 0} but${(x.goals ?? 0) > 1 ? 's' : ''}${x.from ? ` (depuis ${esc(x.from)})` : ''}</p>`).join('');
}
function notesTxt(n) { return !n ? 'Indisponible' : n.avg == null ? 'Pas encore assez de votes' : `${fmtN(n.avg.toFixed(1))}/10 (${n.count} match${n.count > 1 ? 's' : ''})`; }
function voteHtml() {
  const [a, b] = S.data, v = S.votes;
  if (!v) return '';
  const na = v.votes[a.id] || 0, nb = v.votes[b.id] || 0, tot = na + nb, pa = tot ? Math.round((na / tot) * 100) : 50;
  return `<section class="dl-sec dl-vote" aria-labelledby="dl-vh"><h2 id="dl-vh">Qui préfères-tu ?</h2>
    <div class="dl-vbtns">${[a, b].map(p => `<button type="button" class="jx-btn${v.mine === p.id ? ' on' : ''}" data-vote="${p.id}" aria-pressed="${v.mine === p.id}">${esc(p.short || p.name)}</button>`).join('')}</div>
    ${tot ? `<div class="dl-bar dl-vbar" role="img" aria-label="${pa} % pour ${esc(a.name)}, ${100 - pa} % pour ${esc(b.name)}"><i class="a" style="width:${pa}%"></i><i class="b" style="width:${100 - pa}%"></i></div><p class="dl-vres"><span>${pa} %</span><span>${tot} vote${tot > 1 ? 's' : ''}</span><span>${100 - pa} %</span></p>` : '<p class="dl-empty">Aucun vote pour ce duel : sois le premier.</p>'}
    ${v.msg ? `<p class="dl-vmsg" role="status">${esc(v.msg)}</p>` : ''}</section>`;
}
function duelHtml() {
  const [a, b] = S.data;
  const ta = seasonTotals(a), tb = seasonTotals(b);
  const ia = seniorIntl(a)[0], ib = seniorIntl(b)[0];
  const text = `Duel : ${a.name} ou ${b.name} ? Stats, parcours et notes des lecteurs côte à côte sur ActuSport24h`;
  return `<div class="dl-heads">${headCard(a, 0)}<span class="dl-vs" aria-hidden="true">VS</span>${headCard(b, 1)}</div>
    <section class="dl-sec"><h2>Identité</h2>${plain('Âge', a.age != null ? `${a.age} ans` : null, b.age != null ? `${b.age} ans` : null)}${plain('Taille', a.height ? `${fmtN((a.height / 100).toFixed(2))} m` : null, b.height ? `${fmtN((b.height / 100).toFixed(2))} m` : null)}${plain('Pied', a.foot, b.foot)}${plain('Poste', a.posFr, b.posFr)}${plain('Club', a.club?.name, b.club?.name)}</section>
    <section class="dl-sec"><h2>Saison, toutes compétitions</h2><p class="dl-sub">Somme du tableau « Saison par compétition » de chaque fiche, club et sélection (${ta.comps} compétition${ta.comps > 1 ? 's' : ''} pour ${esc(a.short || a.name)}, ${tb.comps} pour ${esc(b.short || b.name)}). En couleur : le meilleur.</p>
      ${DUEL_ROWS.map(r => compare(r.label, r.calc ? r.calc(ta) : ta[r.k], r.calc ? r.calc(tb) : tb[r.k], r)).join('')}
      ${compare('Sélections (équipe A)', ia?.apps ?? 0, ib?.apps ?? 0)}${compare('Buts en sélection', ia?.goals ?? 0, ib?.goals ?? 0)}
      ${S.notes[0]?.avg != null && S.notes[1]?.avg != null ? compare('Note des lecteurs', S.notes[0].avg, S.notes[1].avg) : plain('Note des lecteurs', S.notes[0]?.avg != null ? fmtN(S.notes[0].avg.toFixed(1)) : '–', S.notes[1]?.avg != null ? fmtN(S.notes[1].avg.toFixed(1)) : '–')}
      <p class="dl-sub dl-nnote">Note des lecteurs (5 derniers matchs notés) : ${esc(a.short || a.name)}, ${esc(notesTxt(S.notes[0]).toLowerCase())} ; ${esc(b.short || b.name)}, ${esc(notesTxt(S.notes[1]).toLowerCase())}.</p></section>
    <section class="dl-sec"><h2>Par compétition</h2><div class="dl-two">${splitsHtml(a)}${splitsHtml(b)}</div></section>
    <section class="dl-sec"><h2>Parcours</h2><div class="dl-two">${careerHtml(a)}${careerHtml(b)}</div></section>
    <section class="dl-sec"><h2>Sélections</h2><div class="dl-two"><div>${intlHtml(a)}</div><div>${intlHtml(b)}</div></div></section>
    ${voteHtml()}
    <div class="jx-share"><button type="button" class="jx-btn" data-copy="${esc(duelUrl(a.id, b.id))}">Copier le lien du duel</button><a class="jx-btn jx-x" href="${esc(xIntent(text, duelUrl(a.id, b.id)))}" target="_blank" rel="noopener">Partager sur X</a><span class="jx-copied" role="status"></span></div>`;
}
function render() {
  const ready = S.data[0] && S.data[1];
  root.innerHTML = `<div class="dl-pick">${slotHtml(0)}<span class="dl-vs" aria-hidden="true">VS</span>${slotHtml(1)}</div>
    ${ready ? duelHtml() : S.sel[0] && S.sel[1] ? '<p class="jx-loading">Chargement des fiches…</p>' : '<p class="dl-hint">Choisis deux joueurs pour lancer le duel. Exemples : <a href="/duel/?a=231388&b=229744">Mbappé – Dembélé</a>, <a href="/duel/?a=231388&b=253989">Mbappé – Haaland</a>.</p>'}`;
}
async function load() {
  const ids = S.sel.filter(Boolean);
  const u = new URL(location.href);
  if (S.sel[0]) u.searchParams.set('a', S.sel[0]); else u.searchParams.delete('a');
  if (S.sel[1]) u.searchParams.set('b', S.sel[1]); else u.searchParams.delete('b');
  history.replaceState(null, '', u.pathname + (u.search || ''));
  S.data = [null, null]; S.votes = null;
  render();
  if (ids.length < 2) return;
  try {
    const [a, b] = await Promise.all(S.sel.map(id => getJSON(`/api/v1/player/${id}.json`)));
    S.data = [a, b];
    S.notes = await Promise.all(S.sel.map(id => getJSON(`${VOTES_API}/notes/player?id=${id}`).catch(() => null)));
    const d = device();
    S.votes = await getJSON(`${VOTES_API}/duel/votes?a=${S.sel[0]}&b=${S.sel[1]}${d ? `&device=${d}` : ''}`).catch(() => null);
  } catch { root.insertAdjacentHTML('beforeend', '<p class="dl-empty">Fiche momentanément indisponible. Réessaie dans un instant.</p>'); return; }
  render();
}
function choose(i, id) { S.sel[i] = id; S.q[i] = ''; load().then(() => { if (!S.sel[1 - i]) document.getElementById(`dl-q${1 - i}`)?.focus(); }); }

if (root) {
  root.addEventListener('input', e => {
    const m = e.target.id?.match(/^dl-q(\d)$/); if (!m) return;
    const i = Number(m[1]); S.q[i] = e.target.value;
    const ul = document.getElementById(`dl-l${i}`); ul.innerHTML = listHtml(i);
    e.target.setAttribute('aria-expanded', ul.children.length ? 'true' : 'false');
  });
  root.addEventListener('keydown', e => {
    const m = e.target.id?.match(/^dl-q(\d)$/); if (!m) return;
    const ul = document.getElementById(`dl-l${m[1]}`), opts = [...ul.querySelectorAll('[data-pick]')];
    if (!opts.length) return;
    let k = opts.findIndex(o => o.getAttribute('aria-selected') === 'true');
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault(); k = e.key === 'ArrowDown' ? (k + 1) % opts.length : (k <= 0 ? opts.length - 1 : k - 1);
      opts.forEach((o, j) => o.setAttribute('aria-selected', String(j === k))); e.target.setAttribute('aria-activedescendant', opts[k].id);
    } else if (e.key === 'Enter') { e.preventDefault(); choose(Number(m[1]), (opts[k] || opts[0]).dataset.pick); }
  });
  root.addEventListener('click', async e => {
    const li = e.target.closest('[data-pick]'); if (li) { choose(Number(li.dataset.slot), li.dataset.pick); return; }
    const ch = e.target.closest('[data-change]'); if (ch) { const i = Number(ch.dataset.change); S.sel[i] = null; await load(); document.getElementById(`dl-q${i}`)?.focus(); return; }
    const cp = e.target.closest('[data-copy]');
    if (cp) { try { await navigator.clipboard.writeText(cp.dataset.copy); root.querySelector('.jx-copied').textContent = 'Lien copié.'; } catch { root.querySelector('.jx-copied').textContent = cp.dataset.copy; } return; }
    const v = e.target.closest('[data-vote]');
    if (v && S.votes) {
      const d = device(); if (!d) return;
      v.disabled = true;
      try {
        const r = await fetch(`${VOTES_API}/duel/vote`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ a: S.sel[0], b: S.sel[1], pick: v.dataset.vote, device: d }) });
        const j = await r.json().catch(() => ({}));
        S.votes = r.ok ? { ...j, msg: 'Vote enregistré, tu peux le changer à tout moment.' } : { ...S.votes, msg: j.error || 'Vote impossible pour le moment.' };
      } catch { S.votes = { ...S.votes, msg: 'Connexion impossible. Réessaie.' }; }
      render();
    }
  });
  (async () => {
    try {
      const d = await getJSON('/data/jeux/joueurs.json');
      S.rows = d.players; S.byId = new Map(d.players.map(r => [r[0], r])); S.bySlug = new Map(d.players.map(r => [r[2], r[0]]));
      const sp = new URLSearchParams(location.search);
      const res = k => { const v = sp.get(k) || ''; return S.byId.has(v) ? v : S.bySlug.get(v) || null; };
      S.sel = [res('a'), res('b')];
      if (S.sel[0] && S.sel[0] === S.sel[1]) S.sel[1] = null;
      await load();
    } catch { root.innerHTML = '<p class="dl-empty">Le duel est momentanément indisponible. Réessaie dans un instant.</p>'; }
  })();
}
