// Page « Onze de légende » (/onze-de-legende/) : onze de tous les temps d'un club ou d'une sélection.
// Reprend Fais ta compo (schémas, terrain, recherche, image, lien, vote) ; vivier de joueurs issu de Wikidata, chaque nom renvoie à sa source.
import { FORMATION_IDS, DEFAULT_FORMATION, formationSlots, searchPlayers, pitchName, compoError, parseCompoParams, xIntentUrl, SITE } from './compo-core.js?v=a0d83acc';
import { getJSON, deviceId, readersHtml, PITCH_SVG } from './compo-readers.js?v=67543492';

const root = document.getElementById('lg');
const API = root.dataset.api;
const PAGE = '/onze-de-legende/';
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const FAM = { G: 'Gardiens', D: 'Défenseurs', M: 'Milieux', A: 'Attaquants' };
const FAM1 = { G: 'Gardien', D: 'Défenseur', M: 'Milieu', A: 'Attaquant' };
const GROUPS = [['fra.1', 'Ligue 1'], ['eng.1', 'Premier League'], ['esp.1', 'Liga'], ['ita.1', 'Serie A'], ['ger.1', 'Bundesliga']];
const PREVIEW = 8;
const store = {
  get: k => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* navigation privée */ } },
};
const S = { teams: [], team: null, data: null, byId: new Map(), formation: DEFAULT_FORMATION, slots: Array(11).fill(null), sel: null, more: {}, mine: null, agg: null };
const player = id => (id ? S.byId.get(id) || null : null);
const filled = () => S.slots.filter(Boolean).length;
const groupOf = t => (t.kind === 'selection' ? 'Sélections' : GROUPS.find(([c]) => t.comps?.includes(c))?.[1] || 'Autres clubs');
const srcUrl = p => (p.w ? `https://fr.wikipedia.org/wiki/${encodeURIComponent(p.w.replace(/ /g, '_'))}` : `https://www.wikidata.org/wiki/Q${p.id}`);
// « 1992–1995, depuis 2013 » → « au club : … » ; « arrivé en 2011 » (fin non renseignée sur Wikidata) → « arrivé au club en 2011 »
const lgYears = (y, sel) => /^arrivé en \d{4}$/.test(y) ? y.replace('arrivé en', 'arrivé au club en') : /^1re sélection en \d{4}$/.test(y) ? y : `${sel ? 'en sélection' : 'au club'} : ${y}`;
const sub = p => [p.g ? FAM1[p.g] : 'Poste non renseigné', p.y ? lgYears(p.y, S.team?.kind === 'selection') : ''].filter(Boolean).join(' · ');

function shell() {
  const groups = [...new Set(S.teams.map(groupOf))];
  root.innerHTML = `
  <div class="ftc-top">
    <label class="ftc-field"><span>Club ou sélection</span><select id="lg-team" aria-label="Choisir le club ou la sélection"><option value="">Choisis une équipe…</option>${groups.map(g => `<optgroup label="${esc(g)}">${S.teams.filter(t => groupOf(t) === g).map(t => `<option value="${t.id}">${esc(t.name)}</option>`).join('')}</optgroup>`).join('')}</select></label>
    <div class="ftc-field"><span>Schéma</span><div class="ftc-forms" role="radiogroup" aria-label="Schéma">${FORMATION_IDS.map(f => `<button type="button" role="radio" data-f="${f}" aria-checked="false">${f}</button>`).join('')}</div></div>
  </div>
  <div class="ftc-main">
    <div class="ftc-board">
      <div class="ftc-board-head"><span class="ftc-crest"></span><b class="ftc-club-name">Mon onze de légende</b><span class="ftc-form-tag"></span><span class="ftc-count" aria-live="polite"></span></div>
      <div class="ftc-pitch edit" id="lg-pitch">${PITCH_SVG}</div>
      <p class="ftc-hint">Touche un poste pour choisir sa légende, ou touche un joueur de la liste pour le placer au premier poste libre de sa ligne.</p>
      <div class="ftc-tools"><button type="button" class="ftc-btn ghost" data-act="auto">Compléter avec les plus célèbres</button><button type="button" class="ftc-btn ghost" data-act="clear">Vider le terrain</button></div>
      <div id="lg-src" class="lg-src"></div>
    </div>
    <aside class="ftc-side" aria-label="Joueurs de l'histoire de l'équipe">
      <label class="ftc-search"><span class="sr-only">Chercher une légende</span><input id="lg-q" type="search" autocomplete="off" placeholder="Chercher un joueur de l’histoire de l’équipe…"></label>
      <div id="lg-results" class="ftc-results" hidden></div>
      <div id="lg-roster" class="ftc-roster"></div>
    </aside>
  </div>
  <section class="ftc-share team-sec" aria-labelledby="lg-share-h"><h2 id="lg-share-h">Partager mon onze</h2>
    <div class="ftc-share-btns">
      <button type="button" class="ftc-btn" data-act="img">Créer l'image</button>
      <button type="button" class="ftc-btn" data-act="share" hidden>Partager l'image</button>
      <a class="ftc-btn x" id="lg-x" href="#" target="_blank" rel="noopener"><svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>Partager sur X</a>
      <button type="button" class="ftc-btn ghost" data-act="copy">Copier le lien</button>
    </div>
    <p class="ftc-msg" id="lg-share-msg" role="status" aria-live="polite"></p>
    <div class="ftc-img" id="lg-img" hidden></div>
  </section>
  <section class="ftc-vote team-sec" id="vote" aria-labelledby="lg-vote-h"><h2 id="lg-vote-h">Le onze de légende des lecteurs</h2><div id="lg-vote-body"><p class="ftc-note">Choisis une équipe pour voir le onze de légende voté par les lecteurs.</p></div></section>
  <dialog id="lg-sheet" class="ftc-sheet" aria-labelledby="lg-sheet-h"><form method="dialog" class="ftc-sheet-in">
    <div class="ftc-sheet-head"><h3 id="lg-sheet-h"></h3><button class="ftc-x" value="close" aria-label="Fermer">✕</button></div>
    <input id="lg-sheet-q" type="search" autocomplete="off" placeholder="Chercher un joueur…" aria-label="Chercher un joueur">
    <div id="lg-sheet-list" class="ftc-sheet-list"></div>
  </form></dialog>`;
}

function renderHead() {
  const t = S.team;
  root.querySelector('.ftc-crest').innerHTML = t?.logo ? `<img src="${esc(t.logo)}" alt="" width="32" height="32">` : '';
  root.querySelector('.ftc-club-name').textContent = t ? `Onze de légende · ${t.name}` : 'Mon onze de légende';
  root.querySelector('.ftc-form-tag').textContent = S.formation;
  root.querySelector('.ftc-count').textContent = `${filled()}/11`;
  for (const b of root.querySelectorAll('.ftc-forms button')) b.setAttribute('aria-checked', String(b.dataset.f === S.formation));
  root.querySelector('#lg-team').value = t?.id || '';
}
function renderPitch() {
  const el = document.getElementById('lg-pitch');
  el.querySelectorAll('.ftc-slot').forEach(n => n.remove());
  el.insertAdjacentHTML('beforeend', formationSlots(S.formation).map((s, i) => {
    const p = player(S.slots[i]);
    return `<button type="button" class="ftc-slot${p ? ' filled' : ''}${S.sel === i ? ' sel' : ''}" data-i="${i}" style="left:${s.x}%;top:${s.y}%" aria-label="${esc(`${s.name} : ${p ? p.n : 'à choisir'}`)}"${p ? ` title="${esc(p.n)}"` : ''}>
      <span class="ftc-dot">${p ? esc(s.label) : '+'}</span><span class="ftc-nm">${p ? esc(pitchName(p)) : esc(s.label)}</span></button>`;
  }).join(''));
}
function renderSources() {
  const el = document.getElementById('lg-src');
  const placed = formationSlots(S.formation).map((s, i) => [s, player(S.slots[i])]).filter(([, p]) => p);
  el.innerHTML = placed.length ? `<h3>Mes légendes et leurs sources</h3><ul>${placed.map(([s, p]) => `<li><b>${esc(s.label)}</b> <a href="${srcUrl(p)}" target="_blank" rel="noopener">${esc(p.n)}</a> <small>${esc(p.y ? p.y.replace(/–$/, '–auj.') : '')}</small></li>`).join('')}</ul>` : '';
}
function item(p) {
  const at = S.slots.indexOf(p.id);
  const role = at >= 0 ? formationSlots(S.formation)[at].label : '';
  return `<li><button type="button" class="ftc-pl${at >= 0 ? ' on' : ''}" data-id="${p.id}"><span class="ftc-j">${esc(p.g || '–')}</span><span class="ftc-pn">${esc(p.n)}<small>${esc(sub(p))}</small></span>${role ? `<span class="ftc-role">${esc(role)}</span>` : ''}</button></li>`;
}
function renderRoster() {
  const el = document.getElementById('lg-roster');
  if (!S.data) { el.innerHTML = '<p class="ftc-note">Choisis un club ou une sélection pour afficher les joueurs de son histoire.</p>'; return; }
  const list = S.data.players;
  const parts = [...['G', 'D', 'M', 'A'].map(g => [g, FAM[g], list.filter(p => p.g === g)]), ['X', 'Poste non renseigné', list.filter(p => !FAM[p.g])]].filter(([, , l]) => l.length);
  el.innerHTML = `<p class="ftc-note">${list.length} joueurs de l’histoire ${S.team.kind === 'selection' ? 'de la sélection' : 'du club'}, du plus au moins célèbre (nombre d’articles Wikipédia).</p>${parts.map(([g, h, l]) => {
    const all = S.more[g], shown = all ? l : l.slice(0, PREVIEW);
    return `<h3>${h} <small>(${l.length})</small></h3><ul>${shown.map(item).join('')}</ul>${l.length > PREVIEW ? `<button type="button" class="ftc-btn ghost lg-more" data-more="${g}">${all ? 'Réduire' : `Voir les ${l.length - PREVIEW} autres`}</button>` : ''}`;
  }).join('')}`;
}
function link(base = SITE) {
  const q = new URLSearchParams();
  if (S.team) q.set('club', S.team.slug);
  q.set('f', S.formation);
  if (S.slots.some(Boolean)) q.set('p', S.slots.map(x => x || '_').join('.'));
  return `${base}${PAGE}?${q}`;
}
function text() {
  const names = filled() === 11 ? S.slots.map(id => pitchName(player(id))) : [];
  const head = `Mon onze de légende${S.team ? ` ${S.team.kind === 'selection' ? 'de la sélection' : 'pour'} ${S.team.name}` : ''} en ${S.formation}`;
  const tail = ' #OnzeDeLegende via @ActuSport24h';
  let t = names.length ? `${head} : ${names.join(', ')}.` : `${head}.`;
  if (t.length + tail.length > 250) t = `${head}.`;
  return t + tail;
}
function sync() {
  renderHead(); renderPitch(); renderRoster(); renderSources(); renderVoteButtons();
  document.getElementById('lg-x').href = xIntentUrl(text(), link());
  if (S.team) {
    store.set(`lg-draft-${S.team.id}`, { f: S.formation, p: S.slots });
    store.set('lg-team', S.team.id);
    history.replaceState(null, '', link('') + location.hash);
  }
}

function place(i, id) { const j = S.slots.indexOf(id); if (j === i) return; if (j >= 0) S.slots[j] = S.slots[i]; S.slots[i] = id; }
function firstFreeFor(p) { const pos = formationSlots(S.formation); const same = pos.findIndex((s, i) => !S.slots[i] && s.g === p.g); return same >= 0 ? same : S.slots.findIndex(x => !x); }
function autoFill() {
  if (!S.data) return;
  const used = new Set(S.slots.filter(Boolean));
  formationSlots(S.formation).forEach((s, i) => {
    if (S.slots[i]) return;
    const p = S.data.players.find(x => !used.has(x.id) && x.g === s.g);
    if (p) { S.slots[i] = p.id; used.add(p.id); }
  });
}

async function chooseTeam(id, preset) {
  const t = S.teams.find(x => x.id === id) || null;
  S.team = t; S.data = null; S.byId = new Map(); S.sel = null; S.more = {}; S.mine = null; S.agg = null;
  if (!t) { S.slots = Array(11).fill(null); sync(); renderVote(); return; }
  try { S.data = await getJSON(`/data/legende/team/${t.id}.json`); } catch { S.data = { players: [] }; msg('lg-share-msg', 'Liste des joueurs indisponible, réessaie plus tard.', 'err'); }
  S.byId = new Map(S.data.players.map(p => [p.id, p]));
  const d = preset || store.get(`lg-draft-${t.id}`);
  S.formation = FORMATION_IDS.includes(d?.f) ? d.f : DEFAULT_FORMATION;
  const ids = (d?.p || []).slice(0, 11);
  const seen = new Set();
  S.slots = Array.from({ length: 11 }, (_, i) => { const x = ids[i]; if (!x || !S.byId.has(x) || seen.has(x)) return null; seen.add(x); return x; });
  sync(); renderVote();
}

// Feuille de choix
const sheet = () => document.getElementById('lg-sheet');
function openSheet(i) {
  S.sel = i; renderPitch();
  const s = formationSlots(S.formation)[i];
  document.getElementById('lg-sheet-h').textContent = `${s.name} (${s.label})`;
  const q = document.getElementById('lg-sheet-q'); q.value = '';
  fillSheet('');
  const d = sheet(); if (d.showModal) d.showModal(); else d.setAttribute('open', '');
  setTimeout(() => { if (matchMedia('(pointer:fine)').matches) q.focus(); }, 30);
}
function fillSheet(q) {
  const list = document.getElementById('lg-sheet-list');
  const i = S.sel; if (i == null) return;
  const s = formationSlots(S.formation)[i], cur = S.slots[i];
  const head = cur ? `<button type="button" class="ftc-btn ghost ftc-remove" data-remove="1">Retirer ${esc(player(cur)?.n || '')} de ce poste</button>` : '';
  const all = S.data?.players || [];
  if (!all.length) { list.innerHTML = '<p class="ftc-note">Choisis d’abord une équipe.</p>'; return; }
  if (q.trim().length >= 2) { const r = searchPlayers(all, q, 40); list.innerHTML = `${head}${r.length ? `<ul>${r.map(item).join('')}</ul>` : '<p class="ftc-note">Aucun joueur trouvé dans l’histoire de cette équipe.</p>'}`; return; }
  const fam = all.filter(p => p.g === s.g), rest = all.filter(p => p.g !== s.g);
  list.innerHTML = `${head}${fam.length ? `<h4>${FAM[s.g]}</h4><ul>${fam.map(item).join('')}</ul>` : ''}${rest.length ? `<h4>Autres joueurs</h4><ul>${rest.map(item).join('')}</ul>` : ''}`;
}
function closeSheet() { const d = sheet(); if (d.open) d.close ? d.close() : d.removeAttribute('open'); S.sel = null; renderPitch(); }

// Image
const loadImg = src => new Promise((res, rej) => { const i = new Image(); i.crossOrigin = 'anonymous'; i.onload = () => res(i); i.onerror = rej; i.src = src; });
function fitText(ctx, txt, max) { let t = txt; while (ctx.measureText(t).width > max && t.length > 2) t = t.slice(0, -2) + '…'; return t; }
function roundRect(x, a, b, w, h, r) { x.beginPath(); x.moveTo(a + r, b); x.arcTo(a + w, b, a + w, b + h, r); x.arcTo(a + w, b + h, a, b + h, r); x.arcTo(a, b + h, a, b, r); x.arcTo(a, b, a + w, b, r); x.closePath(); }
async function drawImage() {
  await document.fonts?.load?.('800 40px "Barlow Condensed"').catch(() => {});
  await document.fonts?.load?.('700 20px Inter').catch(() => {});
  const W = 1080, H = 1350, c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, W, H); g.addColorStop(0, '#0A0E17'); g.addColorStop(1, '#2A2111');
  x.fillStyle = g; x.fillRect(0, 0, W, H);
  x.fillStyle = '#D4A62A'; x.fillRect(0, 0, W, 10);
  try { x.drawImage(await loadImg('/img/logo-96.png'), 48, 40, 64, 64); } catch { /* sans logo */ }
  x.font = '800 44px "Barlow Condensed", Impact, sans-serif'; x.fillStyle = '#fff'; x.textBaseline = 'middle';
  x.fillText('ACTUSPORT', 124, 74); const bw = x.measureText('ACTUSPORT').width;
  x.fillStyle = '#E10E2D'; x.fillRect(124 + bw + 6, 50, x.measureText('24H').width + 14, 48); x.fillStyle = '#fff'; x.fillText('24H', 124 + bw + 13, 75);
  x.font = '800 76px "Barlow Condensed", Impact, sans-serif'; x.fillStyle = '#fff';
  x.fillText(fitText(x, `ONZE DE LÉGENDE${S.team ? ` · ${S.team.name.toLocaleUpperCase('fr-FR')}` : ''}`, W - 230), 48, 168);
  x.font = '700 34px Inter, sans-serif'; x.fillStyle = '#FEC84B'; x.fillText(`Mon onze de tous les temps · ${S.formation}`, 48, 232);
  if (S.team?.logo) { try { x.drawImage(await loadImg(S.team.logo), W - 48 - 150, 40, 150, 150); } catch { /* logo indisponible */ } }
  const P = { x: 48, y: 280, w: W - 96, h: 960 };
  const pg = x.createLinearGradient(0, P.y, 0, P.y + P.h); pg.addColorStop(0, '#2f8f46'); pg.addColorStop(1, '#257a3c');
  x.fillStyle = pg; roundRect(x, P.x, P.y, P.w, P.h, 22); x.fill();
  x.save(); roundRect(x, P.x, P.y, P.w, P.h, 22); x.clip();
  for (let k = 0; k < 10; k++) if (k % 2) { x.fillStyle = 'rgba(255,255,255,.045)'; x.fillRect(P.x, P.y + (P.h / 10) * k, P.w, P.h / 10); }
  x.restore();
  x.strokeStyle = 'rgba(255,255,255,.55)'; x.lineWidth = 4;
  const sx = v => P.x + (v / 68) * P.w, sy = v => P.y + (v / 105) * P.h;
  x.strokeRect(sx(1), sy(1), sx(67) - sx(1), sy(104) - sy(1));
  x.beginPath(); x.moveTo(sx(1), sy(52.5)); x.lineTo(sx(67), sy(52.5)); x.stroke();
  x.beginPath(); x.ellipse(sx(34), sy(52.5), (9.15 / 68) * P.w, (9.15 / 105) * P.h, 0, 0, Math.PI * 2); x.stroke();
  for (const [yy, hh] of [[1, 16.5], [87.5, 16.5]]) x.strokeRect(sx(13.84), sy(yy), sx(54.16) - sx(13.84), sy(yy + hh) - sy(yy));
  for (const [yy, hh] of [[1, 5.5], [98.5, 5.5]]) x.strokeRect(sx(24.84), sy(yy), sx(43.16) - sx(24.84), sy(yy + hh) - sy(yy));
  formationSlots(S.formation).forEach((s, i) => {
    const p = player(S.slots[i]);
    const cx = P.x + (s.x / 100) * P.w, cy = P.y + (s.y / 100) * P.h;
    x.beginPath(); x.arc(cx, cy, 40, 0, Math.PI * 2); x.fillStyle = p ? '#fff' : 'rgba(255,255,255,.25)'; x.fill();
    x.lineWidth = 7; x.strokeStyle = p ? '#D4A62A' : 'rgba(255,255,255,.6)'; x.stroke();
    x.fillStyle = '#101828'; x.font = '800 32px "Barlow Condensed", Impact, sans-serif'; x.textAlign = 'center';
    x.fillText(s.label, cx, cy + 2);
    if (p) {
      x.font = '700 27px Inter, sans-serif';
      const name = fitText(x, pitchName(p), 210), tw = x.measureText(name).width + 22;
      x.fillStyle = 'rgba(10,14,23,.8)'; roundRect(x, cx - tw / 2, cy + 50, tw, 40, 10); x.fill();
      x.fillStyle = '#fff'; x.fillText(name, cx, cy + 71);
    }
    x.textAlign = 'left';
  });
  x.font = '700 26px Inter, sans-serif'; const tagW = x.measureText('#OnzeDeLegende').width;
  x.font = '600 26px Inter, sans-serif'; x.fillStyle = '#C9D1DD';
  x.fillText('Compose le tien sur actusport24h.fr/onze-de-legende', 48, H - 52, W - 96 - tagW - 28);
  x.textAlign = 'right'; x.fillStyle = '#FEC84B'; x.font = '700 26px Inter, sans-serif'; x.fillText('#OnzeDeLegende', W - 48, H - 52); x.textAlign = 'left';
  return new Promise(res => c.toBlob(b => res(b), 'image/png'));
}
function msg(id, t, kind = '') { const el = document.getElementById(id); if (el) { el.textContent = t; el.className = `ftc-msg ${kind}`; } }
let lastBlob = null;
const fname = () => `onze-de-legende-${S.team?.slug || 'actusport24h'}-${S.formation}.png`;
async function makeImage() {
  msg('lg-share-msg', 'Création de l’image…');
  lastBlob = await drawImage();
  if (!lastBlob) { msg('lg-share-msg', 'Impossible de créer l’image sur ce navigateur.', 'err'); return; }
  const url = URL.createObjectURL(lastBlob);
  const box = document.getElementById('lg-img'); box.hidden = false;
  box.innerHTML = `<img src="${url}" alt="Mon onze de légende ${esc(S.team?.name || '')} en ${esc(S.formation)}" width="540" height="675"><a class="ftc-btn" href="${url}" download="${esc(fname())}">Télécharger l’image</a>`;
  const file = new File([lastBlob], fname(), { type: 'image/png' });
  root.querySelector('[data-act="share"]').hidden = !(navigator.canShare && navigator.canShare({ files: [file] }));
  msg('lg-share-msg', filled() < 11 ? `Image créée (${filled()}/11 joueurs placés).` : 'Image créée : télécharge-la ou partage-la.', 'ok');
}
async function shareImage() {
  if (!lastBlob) await makeImage();
  try { await navigator.share({ files: [new File([lastBlob], fname(), { type: 'image/png' })], title: 'Mon onze de légende', text: text(), url: link() }); } catch { /* annulé */ }
}

// Vote (un vote modifiable par appareil et par équipe)
function renderVoteButtons() {
  const b = root.querySelector('[data-act="vote"]'); if (!b) return;
  const err = compoError({ formation: S.formation, players: S.slots });
  b.disabled = !!err;
  b.textContent = S.mine ? 'Mettre à jour mon vote' : 'Voter avec mon onze';
  const why = document.getElementById('lg-vote-why'); if (why) why.textContent = err ? `Place les 11 joueurs pour voter (${filled()}/11).` : '';
}
function renderVote() {
  const body = document.getElementById('lg-vote-body');
  if (!S.team) { body.innerHTML = '<p class="ftc-note">Choisis une équipe pour voir le onze de légende voté par les lecteurs.</p>'; return; }
  body.innerHTML = `<p class="ftc-note">Le onze de tous les temps ${S.team.kind === 'selection' ? 'de la sélection' : 'du club'} ${esc(S.team.name)} selon les lecteurs : un vote par appareil, modifiable à tout moment.</p>
    <div class="ftc-vote-actions"><button type="button" class="ftc-btn" data-act="vote">Voter avec mon onze</button><button type="button" class="ftc-btn ghost" data-act="unvote" hidden>Retirer mon vote</button><span id="lg-vote-why" class="ftc-note"></span></div>
    <p class="ftc-msg" id="lg-vote-msg" role="status" aria-live="polite"></p>
    <div id="lg-agg"><p class="ftc-loading">Chargement des votes…</p></div>`;
  renderVoteButtons();
  loadAgg();
}
function showAgg(d) {
  S.agg = d; S.mine = d.mine || null;
  document.getElementById('lg-agg').innerHTML = readersHtml(d, id => S.byId.get(id) || null, { color: '#D4A62A' });
  const u = root.querySelector('[data-act="unvote"]'); if (u) u.hidden = !S.mine;
  renderVoteButtons();
}
async function loadAgg() {
  const t = S.team, dev = deviceId(); if (!t) return;
  try {
    const r = await fetch(`${API}/legende?team=${t.id}${dev ? `&device=${dev}` : ''}`, { cache: 'no-store' });
    const d = await r.json(); if (!d.ok) throw new Error();
    if (S.team !== t) return;
    showAgg(d);
    if (S.mine) msg('lg-vote-msg', `Ton vote (${S.mine.formation}) est enregistré. Tu peux le modifier à tout moment.`, 'ok');
  } catch { document.getElementById('lg-agg').innerHTML = '<p class="ftc-empty">Les votes sont momentanément indisponibles.</p>'; }
}
async function sendVote(remove) {
  const t = S.team, dev = deviceId(); if (!t) return;
  if (!dev) { msg('lg-vote-msg', 'Ton navigateur bloque le stockage local : impossible de voter.', 'err'); return; }
  const err = remove ? null : compoError({ formation: S.formation, players: S.slots });
  if (err) { msg('lg-vote-msg', err, 'err'); return; }
  msg('lg-vote-msg', remove ? 'Suppression…' : 'Envoi du vote…');
  try {
    const r = remove
      ? await fetch(`${API}/legende/vote?team=${t.id}&device=${dev}`, { method: 'DELETE' })
      : await fetch(`${API}/legende/vote`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ team: t.id, formation: S.formation, players: S.slots, device: dev, website: '' }) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || !d.ok) { msg('lg-vote-msg', d.error || 'Vote impossible, réessaie plus tard.', 'err'); return; }
    showAgg({ ...d, mine: remove ? null : d.mine });
    msg('lg-vote-msg', remove ? 'Ton vote a été retiré.' : d.updated ? 'Vote mis à jour. Merci !' : 'Vote enregistré. Merci !', 'ok');
  } catch { msg('lg-vote-msg', 'Pas de connexion. Réessaie plus tard.', 'err'); }
}

function bind() {
  root.querySelector('#lg-team').addEventListener('change', e => chooseTeam(e.target.value));
  root.addEventListener('click', e => {
    const t = e.target;
    const f = t.closest('.ftc-forms button'); if (f) { S.formation = f.dataset.f; sync(); return; }
    const slot = t.closest('#lg-pitch .ftc-slot'); if (slot) { openSheet(+slot.dataset.i); return; }
    const more = t.closest('[data-more]'); if (more) { S.more[more.dataset.more] = !S.more[more.dataset.more]; renderRoster(); return; }
    const act = t.closest('[data-act]')?.dataset.act;
    if (act === 'auto') { autoFill(); sync(); return; }
    if (act === 'clear') { S.slots = Array(11).fill(null); sync(); return; }
    if (act === 'img') { makeImage(); return; }
    if (act === 'share') { shareImage(); return; }
    if (act === 'copy') { navigator.clipboard?.writeText(link()).then(() => msg('lg-share-msg', 'Lien copié.', 'ok'), () => msg('lg-share-msg', link())); return; }
    if (act === 'vote') { sendVote(false); return; }
    if (act === 'unvote') { sendVote(true); return; }
    const pl = t.closest('#lg-roster .ftc-pl, #lg-results .ftc-pl');
    if (pl) {
      const p = player(pl.dataset.id); if (!p) return;
      const at = S.slots.indexOf(p.id);
      if (at >= 0) { S.slots[at] = null; sync(); return; }
      const i = firstFreeFor(p);
      if (i < 0) { msg('lg-share-msg', 'Terrain complet : touche un poste pour remplacer son joueur.'); return; }
      S.slots[i] = p.id; sync();
      if (t.closest('#lg-results')) { document.getElementById('lg-q').value = ''; document.getElementById('lg-results').hidden = true; }
    }
  });
  document.getElementById('lg-sheet-list').addEventListener('click', e => {
    if (e.target.closest('[data-remove]')) { S.slots[S.sel] = null; sync(); closeSheet(); return; }
    const b = e.target.closest('.ftc-pl'); if (!b) return;
    place(S.sel, b.dataset.id); sync(); closeSheet();
  });
  let st = 0;
  document.getElementById('lg-sheet-q').addEventListener('input', e => { clearTimeout(st); const v = e.target.value; st = setTimeout(() => fillSheet(v.trim().length < 2 ? '' : v), 100); });
  sheet().addEventListener('close', () => { S.sel = null; renderPitch(); });
  sheet().addEventListener('click', e => { if (e.target === sheet()) closeSheet(); });
  const q = document.getElementById('lg-q'), res = document.getElementById('lg-results');
  let timer = 0;
  q.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      const v = q.value;
      if (v.trim().length < 2 || !S.data) { res.hidden = true; return; }
      const r = searchPlayers(S.data.players, v, 25);
      res.hidden = false; res.innerHTML = r.length ? `<ul>${r.map(item).join('')}</ul>` : '<p class="ftc-note">Aucun joueur trouvé dans l’histoire de cette équipe.</p>';
    }, 120);
  });
}

(async function init() {
  try { S.teams = (await getJSON('/data/legende/teams.json')).teams; } catch { root.innerHTML = '<p class="ftc-empty">Les équipes sont momentanément indisponibles. Réessaie dans un instant.</p>'; return; }
  shell(); bind();
  const sp = new URLSearchParams(location.search);
  const prm = parseCompoParams(k => sp.get(k));
  const fromLink = prm.club && (S.teams.find(t => t.slug === prm.club) || S.teams.find(t => t.id === prm.club));
  const last = store.get('lg-team');
  if (fromLink) await chooseTeam(fromLink.id, sp.get('p') || sp.get('f') ? { f: prm.formation || DEFAULT_FORMATION, p: prm.players } : null);
  else if (last && S.teams.some(t => t.id === last)) await chooseTeam(last);
  else sync();
  if (location.hash === '#vote') document.getElementById('vote')?.scrollIntoView();
})();
