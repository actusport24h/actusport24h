// Page « Fais ta compo » (/fais-ta-compo/) : choix du club et du schéma, placement des joueurs
// (toucher un poste, ou glisser-déposer), recherche dans toutes les fiches joueurs, image à partager,
// lien X (intent web, rien n'est publié automatiquement) et vote pour la compo des lecteurs.
import {
  FORMATION_IDS, DEFAULT_FORMATION, formationSlots, searchPlayers, pitchName, compoError, compoLink, parseCompoParams, shareText, xIntentUrl, SITE, ROLES,
} from './compo-core.js?v=a0d83acc';
import { getJSON, playersIndex, deviceId, fetchReaders, readersHtml, PITCH_SVG, fmtKo, teamColor } from './compo-readers.js?v=67543492';

const root = document.getElementById('ftc');
const API = root.dataset.api;
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const FAM = { G: 'Gardiens', D: 'Défenseurs', M: 'Milieux', A: 'Attaquants' };
const store = {
  get: k => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* navigation privée */ } },
};

const S = { clubs: [], groups: [], club: null, data: null, formation: DEFAULT_FORMATION, slots: Array(11).fill(null), extra: new Map(), sel: null, idx: null, mine: null, agg: null };
const pool = () => { const m = new Map(); for (const p of S.data?.roster || []) m.set(p.id, p); for (const [id, p] of S.extra) if (!m.has(id)) m.set(id, p); return m; };
const player = id => (id ? pool().get(id) || null : null);
const filled = () => S.slots.filter(Boolean).length;
const slugOf = p => p.slug || String(p.u || '').replace(/^\/joueur\/|\/$/g, '');

function clubLabel(id) { return S.clubs.find(c => c.id === id)?.name || ''; }
function fromIndex(x) { return { id: x.id, n: x.n, s: x.s, j: null, g: x.g || null, p: x.p || null, a: null, slug: x.slug, club: x.t, ext: true }; }

// ---------- rendu ----------
function shell() {
  root.innerHTML = `
  <div class="ftc-top">
    <label class="ftc-field"><span>Club</span><select id="ftc-club" aria-label="Choisir le club">${'<option value="">Choisis ton club…</option>'}${S.groups.map(g => `<optgroup label="${esc(g)}">${S.clubs.filter(c => c.group === g).map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}</optgroup>`).join('')}</select></label>
    <div class="ftc-field"><span>Schéma</span><div class="ftc-forms" role="radiogroup" aria-label="Schéma">${FORMATION_IDS.map(f => `<button type="button" role="radio" data-f="${f}" aria-checked="false">${f}</button>`).join('')}</div></div>
  </div>
  <div class="ftc-main">
    <div class="ftc-board">
      <div class="ftc-board-head"><span class="ftc-crest"></span><b class="ftc-club-name">Ton onze</b><span class="ftc-form-tag"></span><span class="ftc-count" aria-live="polite"></span></div>
      <div class="ftc-pitch edit" id="ftc-pitch">${PITCH_SVG}</div>
      <p class="ftc-hint">Touche un poste pour choisir son joueur. Sur ordinateur, tu peux aussi glisser un joueur de la liste sur le terrain, ou d'un poste à l'autre pour les échanger.</p>
      <div class="ftc-tools"><button type="button" class="ftc-btn ghost" data-act="auto">Compléter automatiquement</button><button type="button" class="ftc-btn ghost" data-act="clear">Vider le terrain</button></div>
    </div>
    <aside class="ftc-side" aria-label="Joueurs">
      <label class="ftc-search"><span class="sr-only">Chercher un joueur</span><input id="ftc-q" type="search" autocomplete="off" placeholder="Chercher un joueur (tous les clubs)…"></label>
      <div id="ftc-results" class="ftc-results" hidden></div>
      <div id="ftc-roster" class="ftc-roster"></div>
    </aside>
  </div>
  <section class="ftc-share team-sec" aria-labelledby="ftc-share-h"><h2 id="ftc-share-h">Partager ma compo</h2>
    <div class="ftc-share-btns">
      <button type="button" class="ftc-btn" data-act="img">Créer l'image</button>
      <button type="button" class="ftc-btn" data-act="share" hidden>Partager l'image</button>
      <a class="ftc-btn x" id="ftc-x" href="#" target="_blank" rel="noopener"><svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>Partager sur X</a>
      <button type="button" class="ftc-btn ghost" data-act="copy">Copier le lien</button>
    </div>
    <p class="ftc-msg" id="ftc-share-msg" role="status" aria-live="polite"></p>
    <div class="ftc-img" id="ftc-img" hidden></div>
  </section>
  <section class="ftc-vote team-sec" id="vote" aria-labelledby="ftc-vote-h"><h2 id="ftc-vote-h">La compo des lecteurs</h2><div id="ftc-vote-body"><p class="ftc-note">Choisis un club pour voir la compo des lecteurs de son prochain match.</p></div></section>
  <dialog id="ftc-sheet" class="ftc-sheet" aria-labelledby="ftc-sheet-h"><form method="dialog" class="ftc-sheet-in">
    <div class="ftc-sheet-head"><h3 id="ftc-sheet-h"></h3><button class="ftc-x" value="close" aria-label="Fermer">✕</button></div>
    <input id="ftc-sheet-q" type="search" autocomplete="off" placeholder="Chercher un joueur (tous les clubs)…" aria-label="Chercher un joueur">
    <div id="ftc-sheet-list" class="ftc-sheet-list"></div>
  </form></dialog>`;
}

function renderHead() {
  const c = S.club;
  root.querySelector('.ftc-crest').innerHTML = c?.logo ? `<img src="${esc(c.logo)}" alt="" width="32" height="32">` : '';
  root.querySelector('.ftc-club-name').textContent = c ? c.name : 'Ton onze';
  root.querySelector('.ftc-form-tag').textContent = S.formation;
  root.querySelector('.ftc-count').textContent = `${filled()}/11`;
  for (const b of root.querySelectorAll('.ftc-forms button')) b.setAttribute('aria-checked', String(b.dataset.f === S.formation));
  root.querySelector('#ftc-club').value = c?.id || '';
}

function renderPitch() {
  const el = document.getElementById('ftc-pitch');
  el.style.setProperty('--tc', teamColor(S.data?.color));
  const pos = formationSlots(S.formation);
  el.querySelectorAll('.ftc-slot').forEach(n => n.remove());
  el.insertAdjacentHTML('beforeend', pos.map((s, i) => {
    const p = player(S.slots[i]);
    return `<button type="button" class="ftc-slot${p ? ' filled' : ''}${S.sel === i ? ' sel' : ''}" data-i="${i}" style="left:${s.x}%;top:${s.y}%" aria-label="${esc(`${s.name} : ${p ? p.n : 'à choisir'}`)}">
      <span class="ftc-dot">${p ? esc(p.j || s.label) : '+'}</span><span class="ftc-nm">${p ? esc(pitchName(p)) : esc(s.label)}</span>${p?.ext ? `<span class="ftc-ext">${esc(shortClub(p.club))}</span>` : ''}</button>`;
  }).join(''));
}
const shortClub = id => (S.clubs.find(c => c.id === id)?.short || '');

function rosterItem(p) {
  const at = S.slots.indexOf(p.id);
  const role = at >= 0 ? formationSlots(S.formation)[at].label : '';
  return `<li><button type="button" class="ftc-pl${at >= 0 ? ' on' : ''}" data-id="${p.id}"><span class="ftc-j">${esc(p.j || '–')}</span><span class="ftc-pn">${esc(p.n)}<small>${esc([p.ext ? clubLabel(p.club) : '', p.p].filter(Boolean).join(' · '))}</small></span>${role ? `<span class="ftc-role">${esc(role)}</span>` : ''}</button></li>`;
}
function renderRoster() {
  const el = document.getElementById('ftc-roster');
  if (!S.data) { el.innerHTML = '<p class="ftc-note">Choisis un club pour afficher son effectif.</p>'; return; }
  const list = S.data.roster;
  const groups = ['G', 'D', 'M', 'A'].map(g => [g, list.filter(p => p.g === g)]).filter(([, l]) => l.length);
  const other = list.filter(p => !FAM[p.g]);
  const ext = [...S.extra.values()].filter(p => !list.some(x => x.id === p.id));
  el.innerHTML = `${groups.map(([g, l]) => `<h3>${FAM[g]}</h3><ul>${l.sort((a, b) => (+a.j || 99) - (+b.j || 99)).map(rosterItem).join('')}</ul>`).join('')}
    ${other.length ? `<h3>Autres</h3><ul>${other.map(rosterItem).join('')}</ul>` : ''}
    ${ext.length ? `<h3>Joueurs d'autres équipes</h3><ul>${ext.map(rosterItem).join('')}</ul>` : ''}`;
}

function sync() {
  renderHead(); renderPitch(); renderRoster(); renderShare(); renderVoteButtons();
  if (S.club) {
    store.set(`ftc-draft-${S.club.id}`, { f: S.formation, p: S.slots, x: [...S.extra.values()].filter(p => S.slots.includes(p.id)) });
    store.set('ftc-club', S.club.id);
    const url = compoLink({ club: S.club.slug, formation: S.formation, players: S.slots }, '');
    history.replaceState(null, '', url + location.hash);
  }
}

// ---------- actions ----------
function place(i, id) {
  const j = S.slots.indexOf(id);
  if (j === i) return;
  if (j >= 0) S.slots[j] = S.slots[i]; // déjà placé ailleurs : échange
  S.slots[i] = id;
}
function swap(i, j) { [S.slots[i], S.slots[j]] = [S.slots[j], S.slots[i]]; }
function firstFreeFor(p) {
  const pos = formationSlots(S.formation);
  const same = pos.findIndex((s, i) => !S.slots[i] && s.g === p.g);
  return same >= 0 ? same : S.slots.findIndex(x => !x);
}
function autoFill() {
  if (!S.data) return;
  const pos = formationSlots(S.formation);
  const used = new Set(S.slots.filter(Boolean));
  const ranked = [...S.data.roster].sort((a, b) => (b.a ?? -1) - (a.a ?? -1));
  pos.forEach((s, i) => {
    if (S.slots[i]) return;
    const p = ranked.find(x => !used.has(x.id) && x.g === s.g) || ranked.find(x => !used.has(x.id) && s.g !== 'G' && x.g !== 'G');
    if (p) { S.slots[i] = p.id; used.add(p.id); }
  });
}
function addExtra(p) { if (!pool().has(p.id)) S.extra.set(p.id, p); }

async function chooseClub(id, preset) {
  const c = S.clubs.find(x => x.id === id) || null;
  S.club = c; S.data = null; S.sel = null; S.extra = new Map(); S.mine = null; S.agg = null;
  if (!c) { S.slots = Array(11).fill(null); sync(); renderVote(); return; }
  try { S.data = await getJSON(`/data/compo/club/${c.id}.json`); } catch { S.data = { roster: [] }; msg('ftc-share-msg', 'Effectif indisponible, réessaie plus tard.'); }
  const draft = preset || store.get(`ftc-draft-${c.id}`);
  S.formation = draft?.f && FORMATION_IDS.includes(draft.f) ? draft.f : (draft?.formation || DEFAULT_FORMATION);
  if (!FORMATION_IDS.includes(S.formation)) S.formation = DEFAULT_FORMATION;
  const ids = (draft?.p || draft?.players || []).slice(0, 11);
  S.slots = Array.from({ length: 11 }, (_, i) => ids[i] || null);
  for (const x of draft?.x || []) if (x?.id) S.extra.set(x.id, x);
  // Joueurs inconnus de l'effectif (lien partagé, autre club) : retrouvés dans l'index de toutes les fiches.
  const unknown = S.slots.filter(x => x && !pool().has(x));
  if (unknown.length) {
    const idx = await playersIndex().catch(() => null);
    for (const u of unknown) { const p = idx?.get(u); if (p) S.extra.set(u, fromIndex(p)); else S.slots[S.slots.indexOf(u)] = null; }
  }
  sync();
  renderVote();
}

// ---------- recherche ----------
async function search(q, cb) {
  if (!S.idx) S.idx = [...(await playersIndex()).values()];
  const res = searchPlayers(S.idx, q, 25);
  cb(res.map(x => pool().get(x.id) || fromIndex(x)));
}
function resultItem(p) {
  const club = S.data?.roster.some(x => x.id === p.id) ? '' : clubLabel(p.club);
  return `<li><button type="button" class="ftc-pl" data-id="${p.id}" data-ext="${p.ext ? 1 : 0}"><span class="ftc-j">${esc(p.j || '')}</span><span class="ftc-pn">${esc(p.n)}<small>${esc([club, p.p].filter(Boolean).join(' · '))}</small></span></button></li>`;
}

// ---------- feuille de choix (toucher un poste) ----------
const sheet = () => document.getElementById('ftc-sheet');
function openSheet(i) {
  S.sel = i; renderPitch();
  const s = formationSlots(S.formation)[i];
  document.getElementById('ftc-sheet-h').textContent = `${s.name} (${s.label})`;
  const q = document.getElementById('ftc-sheet-q'); q.value = '';
  fillSheet('');
  const d = sheet();
  if (d.showModal) d.showModal(); else d.setAttribute('open', '');
  setTimeout(() => { if (matchMedia('(pointer:fine)').matches) q.focus(); }, 30);
}
function fillSheet(q) {
  const list = document.getElementById('ftc-sheet-list');
  const i = S.sel; if (i == null) return;
  const s = formationSlots(S.formation)[i];
  const cur = S.slots[i];
  const head = cur ? `<button type="button" class="ftc-btn ghost ftc-remove" data-remove="1">Retirer ${esc(player(cur)?.n || '')} de ce poste</button>` : '';
  if (q.trim().length >= 2) {
    list.innerHTML = `${head}<p class="ftc-note">Recherche…</p>`;
    search(q, res => { if (document.getElementById('ftc-sheet-q').value !== q) return; S.found = S.found || new Map(); for (const p of res) S.found.set(p.id, p); list.innerHTML = `${head}${res.length ? `<ul>${res.map(resultItem).join('')}</ul>` : '<p class="ftc-note">Aucun joueur trouvé.</p>'}`; });
    return;
  }
  const r = S.data?.roster || [];
  const fam = r.filter(p => p.g === s.g).sort((a, b) => (b.a ?? -1) - (a.a ?? -1));
  const rest = r.filter(p => p.g !== s.g).sort((a, b) => (+a.j || 99) - (+b.j || 99));
  const ext = [...S.extra.values()].filter(p => !r.some(x => x.id === p.id));
  list.innerHTML = `${head}${fam.length ? `<h4>${FAM[s.g]}</h4><ul>${fam.map(rosterItem).join('')}</ul>` : ''}${rest.length ? `<h4>Le reste de l'effectif</h4><ul>${rest.map(rosterItem).join('')}</ul>` : ''}${ext.length ? `<h4>Joueurs d'autres équipes</h4><ul>${ext.map(rosterItem).join('')}</ul>` : ''}${!r.length ? '<p class="ftc-note">Choisis d’abord un club, ou cherche un joueur.</p>' : ''}`;
}
function closeSheet() { const d = sheet(); if (d.open) d.close ? d.close() : d.removeAttribute('open'); S.sel = null; renderPitch(); }

// ---------- glisser-déposer (souris, stylet, et toucher sur le terrain) ----------
let drag = null;
function startDrag(e, src) {
  const g = document.createElement('div');
  g.className = 'ftc-ghost'; g.textContent = pitchName(player(src.id)) || '';
  document.body.appendChild(g);
  drag = { ...src, g };
  moveDrag(e);
}
function moveDrag(e) {
  if (!drag) return;
  drag.g.style.left = `${e.clientX}px`; drag.g.style.top = `${e.clientY}px`;
  // Défilement automatique près des bords (terrain plus haut que l'écran).
  if (e.clientY > innerHeight - 70) scrollBy(0, 14); else if (e.clientY < 90) scrollBy(0, -14);
}
function cancelDrag() { if (drag) { drag.g.remove(); drag = null; } }
function endDrag(e) {
  const d = drag; drag = null; if (!d) return;
  d.g.remove();
  const el = document.elementFromPoint(e.clientX, e.clientY)?.closest('.ftc-slot');
  if (!el) return;
  const i = +el.dataset.i;
  if (d.from != null) swap(d.from, i); else place(i, d.id);
  sync();
}
function bindDrag() {
  let pend = null;
  root.addEventListener('pointerdown', e => {
    cancelDrag();
    const slot = e.target.closest('#ftc-pitch .ftc-slot.filled');
    const item = e.target.closest('#ftc-roster .ftc-pl');
    if (!slot && !(item && e.pointerType !== 'touch')) return;
    pend = { x: e.clientX, y: e.clientY, from: slot ? +slot.dataset.i : null, id: slot ? S.slots[+slot.dataset.i] : item.dataset.id, el: slot || item, pid: e.pointerId };
  });
  window.addEventListener('pointermove', e => {
    if (drag) { e.preventDefault(); moveDrag(e); return; }
    if (pend && Math.hypot(e.clientX - pend.x, e.clientY - pend.y) > 8) { try { pend.el.releasePointerCapture?.(pend.pid); } catch { /* rien */ } startDrag(e, pend); pend.dragged = true; }
  }, { passive: false });
  window.addEventListener('pointerup', e => { if (drag) { endDrag(e); suppressClick = true; setTimeout(() => (suppressClick = false), 50); } pend = null; });
  window.addEventListener('pointercancel', () => { cancelDrag(); pend = null; });
  window.addEventListener('blur', () => { cancelDrag(); pend = null; });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') cancelDrag(); });
}
let suppressClick = false;

// ---------- image ----------
const loadImg = src => new Promise((res, rej) => { const i = new Image(); i.crossOrigin = 'anonymous'; i.onload = () => res(i); i.onerror = rej; i.src = src; });
function fitText(ctx, txt, max) { let t = txt; while (ctx.measureText(t).width > max && t.length > 2) t = t.slice(0, -2) + '…'; return t; }
export async function drawCompo() {
  await document.fonts?.load?.('800 40px "Barlow Condensed"').catch(() => {});
  await document.fonts?.load?.('700 20px Inter').catch(() => {});
  const W = 1080, H = 1350, c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, W, H); g.addColorStop(0, '#0A0E17'); g.addColorStop(1, '#16213A');
  x.fillStyle = g; x.fillRect(0, 0, W, H);
  x.fillStyle = '#E10E2D'; x.fillRect(0, 0, W, 10);
  // Marque
  try { x.drawImage(await loadImg('/img/logo-96.png'), 48, 40, 64, 64); } catch { /* sans logo */ }
  x.font = '800 44px "Barlow Condensed", Impact, sans-serif'; x.fillStyle = '#fff'; x.textBaseline = 'middle';
  x.fillText('ACTUSPORT', 124, 74); const bw = x.measureText('ACTUSPORT').width;
  x.fillStyle = '#E10E2D'; x.fillRect(124 + bw + 6, 50, x.measureText('24H').width + 14, 48); x.fillStyle = '#fff'; x.fillText('24H', 124 + bw + 13, 75);
  // Titre
  const club = S.club?.name || '';
  x.font = '800 76px "Barlow Condensed", Impact, sans-serif'; x.fillStyle = '#fff';
  x.fillText(fitText(x, `MA COMPO${club ? ` · ${club.toLocaleUpperCase('fr-FR')}` : ''}`, W - 230), 48, 168);
  x.font = '700 34px Inter, sans-serif'; x.fillStyle = '#FEC84B'; x.fillText(`Schéma ${S.formation}`, 48, 232);
  if (S.club?.logo) { try { x.drawImage(await loadImg(S.club.logo), W - 48 - 150, 40, 150, 150); } catch { /* logo indisponible */ } }
  // Terrain
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
  // Joueurs
  const tc = teamColor(S.data?.color);
  formationSlots(S.formation).forEach((s, i) => {
    const p = player(S.slots[i]);
    const cx = P.x + (s.x / 100) * P.w, cy = P.y + (s.y / 100) * P.h;
    x.beginPath(); x.arc(cx, cy, 40, 0, Math.PI * 2); x.fillStyle = p ? '#fff' : 'rgba(255,255,255,.25)'; x.fill();
    x.lineWidth = 7; x.strokeStyle = p ? tc : 'rgba(255,255,255,.6)'; x.stroke();
    x.fillStyle = '#101828'; x.font = '800 34px "Barlow Condensed", Impact, sans-serif'; x.textAlign = 'center';
    x.fillText(p ? (p.j || s.label) : s.label, cx, cy + 2);
    if (p) {
      x.font = '700 27px Inter, sans-serif';
      const name = fitText(x, pitchName(p), 200);
      const tw = x.measureText(name).width + 22;
      x.fillStyle = 'rgba(10,14,23,.78)'; roundRect(x, cx - tw / 2, cy + 50, tw, 40, 10); x.fill();
      x.fillStyle = '#fff'; x.fillText(name, cx, cy + 71);
    }
    x.textAlign = 'left';
  });
  // Pied
  x.font = '600 28px Inter, sans-serif'; x.fillStyle = '#C9D1DD';
  x.fillText('Fais la tienne sur actusport24h.fr/fais-ta-compo', 48, H - 52);
  x.textAlign = 'right'; x.fillStyle = '#FEC84B'; x.font = '700 28px Inter, sans-serif'; x.fillText('#FaisTaCompo', W - 48, H - 52); x.textAlign = 'left';
  return new Promise(res => c.toBlob(b => res(b), 'image/png'));
}
function roundRect(x, a, b, w, h, r) { x.beginPath(); x.moveTo(a + r, b); x.arcTo(a + w, b, a + w, b + h, r); x.arcTo(a + w, b + h, a, b + h, r); x.arcTo(a, b + h, a, b, r); x.arcTo(a, b, a + w, b, r); x.closePath(); }

// ---------- partage ----------
function link() { return compoLink({ club: S.club?.slug, formation: S.formation, players: S.slots }); }
function names() { return S.slots.map(id => (id ? pitchName(player(id)) : null)); }
function renderShare() {
  const a = document.getElementById('ftc-x');
  a.href = xIntentUrl(shareText({ clubName: S.club?.name, formation: S.formation, names: filled() === 11 ? names() : [] }), link());
}
function msg(id, t, kind = '') { const el = document.getElementById(id); if (el) { el.textContent = t; el.className = `ftc-msg ${kind}`; } }
let lastBlob = null;
async function makeImage() {
  msg('ftc-share-msg', 'Création de l’image…');
  lastBlob = await drawCompo();
  if (!lastBlob) { msg('ftc-share-msg', 'Impossible de créer l’image sur ce navigateur.', 'err'); return; }
  const url = URL.createObjectURL(lastBlob);
  const fname = `compo-${S.club?.slug || 'actusport24h'}-${S.formation}.png`;
  const box = document.getElementById('ftc-img'); box.hidden = false;
  box.innerHTML = `<img src="${url}" alt="Ma compo ${esc(S.club?.name || '')} en ${esc(S.formation)}" width="540" height="675"><a class="ftc-btn" href="${url}" download="${esc(fname)}">Télécharger l’image</a>`;
  const file = new File([lastBlob], fname, { type: 'image/png' });
  const can = !!(navigator.canShare && navigator.canShare({ files: [file] }));
  const sb = root.querySelector('[data-act="share"]'); sb.hidden = !can;
  msg('ftc-share-msg', filled() < 11 ? `Image créée (${filled()}/11 joueurs placés).` : 'Image créée : télécharge-la ou partage-la.', 'ok');
}
async function shareImage() {
  if (!lastBlob) await makeImage();
  const file = new File([lastBlob], `compo-${S.club?.slug || 'actusport24h'}.png`, { type: 'image/png' });
  try { await navigator.share({ files: [file], title: 'Ma compo', text: shareText({ clubName: S.club?.name, formation: S.formation, names: [] }), url: link() }); }
  catch { /* partage annulé */ }
}

// ---------- vote ----------
function voteOpen() { const n = S.data?.next; return !!(n && Date.parse(n.date) > Date.now() && !S.agg?.closed); }
function renderVoteButtons() {
  const b = root.querySelector('[data-act="vote"]'); if (!b) return;
  const err = compoError({ formation: S.formation, players: S.slots });
  b.disabled = !voteOpen() || !!err;
  b.textContent = S.mine ? 'Mettre à jour mon vote' : 'Voter avec ma compo';
  const why = document.getElementById('ftc-vote-why');
  if (why) why.textContent = !voteOpen() ? '' : err ? `Place les 11 joueurs pour voter (${filled()}/11).` : '';
}
async function renderVote() {
  const body = document.getElementById('ftc-vote-body');
  const c = S.club, n = S.data?.next;
  if (!c) { body.innerHTML = '<p class="ftc-note">Choisis un club pour voir la compo des lecteurs de son prochain match.</p>'; return; }
  if (!n) { body.innerHTML = `<p class="ftc-note">Pas de prochain match connu pour ${esc(c.name)} : la compo des lecteurs reviendra avant son prochain match.</p>`; return; }
  const title = `${esc(n.home.name)} - ${esc(n.away.name)}`;
  body.innerHTML = `<p class="ftc-match">${n.url ? `<a href="${n.url}">${title}</a>` : title} · ${esc(n.compName)} · ${esc(fmtKo(n.date))}</p>
    <div class="ftc-vote-actions"><button type="button" class="ftc-btn" data-act="vote">Voter avec ma compo</button><button type="button" class="ftc-btn ghost" data-act="unvote" hidden>Retirer mon vote</button><span id="ftc-vote-why" class="ftc-note"></span></div>
    <p class="ftc-msg" id="ftc-vote-msg" role="status" aria-live="polite"></p>
    <div id="ftc-agg"><p class="ftc-loading">Chargement des votes…</p></div>`;
  renderVoteButtons();
  await Promise.all([loadMine(), loadAgg()]);
}
async function loadAgg() {
  const c = S.club, n = S.data?.next; if (!c || !n) return;
  const box = document.getElementById('ftc-agg');
  try {
    S.agg = await fetchReaders(API, n.id, c.id);
    const missing = S.agg.slots.filter(s => s.id && !pool().has(s.id));
    const idx = missing.length ? await playersIndex() : null;
    const byId = id => pool().get(id) || (idx?.get(id) ? fromIndex(idx.get(id)) : null);
    box.innerHTML = `${S.agg.closed ? '<p class="ftc-note"><b>Votes clos</b> : le match a commencé.</p>' : `<p class="ftc-note">Votes ouverts jusqu'au coup d'envoi. Un vote par appareil, modifiable jusque-là.</p>`}${readersHtml(S.agg, byId, { color: S.data.color })}`;
  } catch { box.innerHTML = '<p class="ftc-empty">La compo des lecteurs est momentanément indisponible.</p>'; }
  renderVoteButtons();
}
async function loadMine() {
  const c = S.club, n = S.data?.next, dev = deviceId(); if (!c || !n || !dev) return;
  try {
    const r = await fetch(`${API}/compo/mine?match=${n.id}&team=${c.id}&device=${dev}`, { cache: 'no-store' });
    const d = await r.json(); S.mine = d?.vote || null;
  } catch { S.mine = null; }
  const u = root.querySelector('[data-act="unvote"]'); if (u) u.hidden = !S.mine;
  if (S.mine) msg('ftc-vote-msg', `Ton vote (${S.mine.formation}) est enregistré. Tu peux le modifier jusqu'au coup d'envoi.`, 'ok');
  renderVoteButtons();
}
async function sendVote(remove = false) {
  const c = S.club, n = S.data?.next, dev = deviceId();
  if (!c || !n) return;
  if (!dev) { msg('ftc-vote-msg', 'Ton navigateur bloque le stockage local : impossible de voter.', 'err'); return; }
  const err = remove ? null : compoError({ formation: S.formation, players: S.slots });
  if (err) { msg('ftc-vote-msg', err, 'err'); return; }
  msg('ftc-vote-msg', remove ? 'Suppression…' : 'Envoi du vote…');
  try {
    const r = remove
      ? await fetch(`${API}/compo/vote?match=${n.id}&team=${c.id}&device=${dev}`, { method: 'DELETE' })
      : await fetch(`${API}/compo/vote`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ match: n.id, team: c.id, formation: S.formation, players: S.slots, device: dev, website: '' }) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || !d.ok) { msg('ftc-vote-msg', d.error || 'Vote impossible, réessaie plus tard.', 'err'); return; }
    S.mine = remove ? null : { formation: S.formation, players: [...S.slots] };
    msg('ftc-vote-msg', remove ? 'Ton vote a été retiré.' : d.updated ? 'Vote mis à jour. Merci !' : 'Vote enregistré. Merci !', 'ok');
    const u = root.querySelector('[data-act="unvote"]'); if (u) u.hidden = !S.mine;
    await loadAgg();
  } catch { msg('ftc-vote-msg', 'Pas de connexion. Réessaie plus tard.', 'err'); }
}

// ---------- événements ----------
function bind() {
  root.querySelector('#ftc-club').addEventListener('change', e => chooseClub(e.target.value));
  root.addEventListener('click', e => {
    // Après un glisser, le « click » synthétique ne doit pas ouvrir la feuille de choix (boutons non concernés).
    if (suppressClick && e.target.closest('#ftc-pitch .ftc-slot, #ftc-roster .ftc-pl, #ftc-results .ftc-pl')) { suppressClick = false; e.preventDefault(); return; }
    const t = e.target;
    const f = t.closest('.ftc-forms button');
    if (f) { S.formation = f.dataset.f; sync(); return; }
    const slot = t.closest('#ftc-pitch .ftc-slot');
    if (slot) { openSheet(+slot.dataset.i); return; }
    const act = t.closest('[data-act]')?.dataset.act;
    if (act === 'auto') { autoFill(); sync(); return; }
    if (act === 'clear') { S.slots = Array(11).fill(null); sync(); return; }
    if (act === 'img') { makeImage(); return; }
    if (act === 'share') { shareImage(); return; }
    if (act === 'copy') { navigator.clipboard?.writeText(link()).then(() => msg('ftc-share-msg', 'Lien copié.', 'ok'), () => msg('ftc-share-msg', link())); return; }
    if (act === 'vote') { sendVote(false); return; }
    if (act === 'unvote') { sendVote(true); return; }
    const pl = t.closest('#ftc-roster .ftc-pl, #ftc-results .ftc-pl');
    if (pl) {
      const p = pool().get(pl.dataset.id) || S.found?.get(pl.dataset.id);
      if (!p) return;
      addExtra(p);
      const at = S.slots.indexOf(p.id);
      if (at >= 0) { S.slots[at] = null; sync(); return; } // déjà placé : le retire
      const i = firstFreeFor(p);
      if (i < 0) { msg('ftc-share-msg', 'Terrain complet : touche un poste pour remplacer son joueur.'); return; }
      S.slots[i] = p.id; sync();
      if (t.closest('#ftc-results')) { document.getElementById('ftc-q').value = ''; document.getElementById('ftc-results').hidden = true; }
    }
  });
  // Feuille de choix
  const list = document.getElementById('ftc-sheet-list');
  list.addEventListener('click', e => {
    if (e.target.closest('[data-remove]')) { S.slots[S.sel] = null; sync(); closeSheet(); return; }
    const b = e.target.closest('.ftc-pl'); if (!b) return;
    const p = pool().get(b.dataset.id) || S.found?.get(b.dataset.id); if (!p) return;
    addExtra(p); place(S.sel, p.id); sync(); closeSheet();
  });
  document.getElementById('ftc-sheet-q').addEventListener('input', e => { S.found = S.found || new Map(); fillSheetSearch(e.target.value); });
  sheet().addEventListener('close', () => { S.sel = null; renderPitch(); });
  sheet().addEventListener('click', e => { if (e.target === sheet()) closeSheet(); });
  // Recherche latérale
  const q = document.getElementById('ftc-q'), res = document.getElementById('ftc-results');
  let timer = 0;
  q.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      const v = q.value;
      if (v.trim().length < 2) { res.hidden = true; return; }
      search(v, list2 => { if (q.value !== v) return; S.found = new Map(list2.map(p => [p.id, p])); res.hidden = false; res.innerHTML = list2.length ? `<ul>${list2.map(resultItem).join('')}</ul>` : '<p class="ftc-note">Aucun joueur trouvé.</p>'; });
    }, 120);
  });
  bindDrag();
}
let sheetTimer = 0;
function fillSheetSearch(v) {
  clearTimeout(sheetTimer);
  sheetTimer = setTimeout(() => {
    fillSheet(v.trim().length < 2 ? '' : v);
  }, 120);
}

// ---------- démarrage ----------
(async function init() {
  try {
    const d = await getJSON('/data/compo/clubs.json');
    S.clubs = d.clubs; S.groups = d.groups;
  } catch { root.innerHTML = '<p class="ftc-empty">Les effectifs sont momentanément indisponibles. Réessaie dans un instant.</p>'; return; }
  shell(); bind();
  const sp = new URLSearchParams(location.search);
  const prm = parseCompoParams(k => sp.get(k));
  const fromLink = prm.club && (S.clubs.find(c => c.slug === prm.club) || S.clubs.find(c => c.id === prm.club));
  const last = store.get('ftc-club');
  if (fromLink) await chooseClub(fromLink.id, sp.get('p') || sp.get('f') ? { f: prm.formation || DEFAULT_FORMATION, p: prm.players } : null);
  else if (last && S.clubs.some(c => c.id === last)) await chooseClub(last);
  else sync();
  if (location.hash === '#vote') document.getElementById('vote')?.scrollIntoView();
})();
export { ROLES, SITE };
