// « La compo des lecteurs » : lecture des votes (serveur des commentaires) et rendu sur un terrain.
// Utilisé par /assets/compo.js (page Fais ta compo) et, seul, sur les fiches des matchs à venir.
import { formationSlots, pitchName, VOTES_API } from './compo-core.js?v=a0d83acc';

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const cache = new Map();
export async function getJSON(url) {
  if (!cache.has(url)) cache.set(url, fetch(url, { headers: { Accept: 'application/json' } }).then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); }).catch(e => { cache.delete(url); throw e; }));
  return cache.get(url);
}
/** Index de toutes les fiches joueurs du site (chargé à la demande) : Map id → { id, n, s, t, g, p, slug }. */
let playersP = null;
export function playersIndex() {
  if (!playersP) playersP = getJSON('/data/compo/players.json').then(d => new Map(d.players.map(([id, n, s, t, g, p, slug]) => [id, { id, n, s, t, g, p, slug }])));
  return playersP;
}
/** Identifiant anonyme de l'appareil (aléatoire, sans lien avec la personne) : un vote par appareil et par match. */
export function deviceId() {
  try {
    let d = localStorage.getItem('ftc-device');
    if (!d || !/^[0-9a-f-]{36}$/.test(d)) { d = crypto.randomUUID(); localStorage.setItem('ftc-device', d); }
    return d;
  } catch { return null; }
}
export async function fetchReaders(api, match, team) {
  const r = await fetch(`${api}/compo?match=${encodeURIComponent(match)}&team=${encodeURIComponent(team)}`, { headers: { Accept: 'application/json' }, cache: 'no-store' });
  const d = await r.json().catch(() => null);
  if (!r.ok || !d?.ok) throw new Error(d?.error || `HTTP ${r.status}`);
  return d;
}

export const PITCH_SVG = `<svg class="ftc-lines" viewBox="0 0 68 105" preserveAspectRatio="none" aria-hidden="true"><rect x="1" y="1" width="66" height="103" rx="1"/><line x1="1" y1="52.5" x2="67" y2="52.5"/><circle cx="34" cy="52.5" r="9.15"/><circle class="dot" cx="34" cy="52.5" r=".6"/><rect x="13.84" y="1" width="40.32" height="16.5"/><rect x="24.84" y="1" width="18.32" height="5.5"/><path d="M26.7 17.5a9.15 9.15 0 0 0 14.6 0"/><rect x="13.84" y="87.5" width="40.32" height="16.5"/><rect x="24.84" y="98.5" width="18.32" height="5.5"/><path d="M26.7 87.5a9.15 9.15 0 0 1 14.6 0"/></svg>`;

/** Terrain en lecture seule : slots [{ r, id, pct? }] dans l'ordre du schéma. */
export function pitchHtml(formation, slots, byId, { color = '', pct = false } = {}) {
  const pos = formationSlots(formation);
  return `<div class="ftc-pitch ro" style="--tc:${esc(teamColor(color))}">${PITCH_SVG}${pos.map((s, i) => {
    const x = slots[i] || {}; const p = x.id ? byId(x.id) : null;
    const name = p ? pitchName(p) : '';
    return `<div class="ftc-slot${p ? ' filled' : ''}" style="left:${s.x}%;top:${s.y}%" title="${esc(p ? `${p.n} · ${s.name}` : s.name)}"><span class="ftc-dot">${esc(p?.j || s.label)}</span><span class="ftc-nm">${p ? (p.slug ? `<a href="/joueur/${esc(p.slug)}/">${esc(name)}</a>` : esc(name)) : esc(s.label)}</span>${pct && p ? `<span class="ftc-pct">${x.pct} %</span>` : ''}</div>`;
  }).join('')}</div>`;
}

const plural = (n, w) => `${n} ${w}${n > 1 ? 's' : ''}`;
/** Couleur d'équipe lisible autour des pastilles (le blanc et le noir d'ESPN deviennent le rouge du site). */
export const teamColor = c => (c && /^#[0-9a-f]{6}$/i.test(c) && !/^#(f{6}|0{6})$/i.test(c) ? c : '#E10E2D');
/** Résumé + terrain de la compo des lecteurs (agg = réponse du serveur). */
export function readersHtml(agg, byId, { color = '' } = {}) {
  if (!agg.total) return `<p class="ftc-empty">Pas encore de vote${agg.closed ? '.' : ' : sois le premier à proposer ton onze !'}</p>`;
  const others = agg.formations.slice(1).map(f => `${esc(f.id)} (${f.pct} %)`).join(', ');
  return `<p class="ftc-agg-meta"><b>${plural(agg.total, 'vote')}</b> · schéma le plus choisi : <b>${esc(agg.formation)}</b> (${agg.formations[0].pct} %)${others ? ` · ensuite : ${others}` : ''}</p>
    ${pitchHtml(agg.formation, agg.slots, byId, { color, pct: true })}
    <p class="ftc-note">Pour chaque poste du ${esc(agg.formation)}, le joueur le plus choisi ${agg.votesInFormation > 1 ? `par les ${agg.votesInFormation} lecteurs qui ont voté ce schéma (pourcentage de ces votes)` : 'par le seul lecteur qui a voté ce schéma pour l’instant'}.</p>`;
}

const fmtKo = d => new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }).format(new Date(d)).replace(':', 'h').replace(' à ', ' à ');

/** Fiches matchs : un bloc par équipe couverte (données statiques du club + votes en direct). */
async function initMatchBlock(sec) {
  const api = sec.dataset.api || VOTES_API;
  const list = sec.querySelector('.ftc-readers-list');
  const ids = (sec.dataset.teams || '').split(',').filter(Boolean);
  try {
    const parts = await Promise.all(ids.map(async id => {
      const club = await getJSON(`/data/compo/club/${id}.json`);
      const agg = await fetchReaders(api, sec.dataset.match, id);
      const roster = new Map(club.roster.map(p => [p.id, { ...p, slug: (p.u || '').replace(/^\/joueur\/|\/$/g, '') }]));
      const missing = agg.slots.filter(s => s.id && !roster.has(s.id));
      const idx = missing.length ? await playersIndex() : null;
      const byId = id2 => roster.get(id2) || idx?.get(id2) || null;
      return `<div class="ftc-readers"><h3>${club.logo ? `<img src="${esc(club.logo)}" alt="" width="28" height="28">` : ''}${esc(club.name)}${agg.closed ? ' <small>votes clos</small>' : ''}</h3>${readersHtml(agg, byId, { color: club.color })}</div>`;
    }));
    list.innerHTML = parts.join('');
  } catch {
    list.innerHTML = '<p class="ftc-empty">La compo des lecteurs est momentanément indisponible.</p>';
  }
}
export { fmtKo };
for (const sec of document.querySelectorAll('.ftc-readers-sec')) initMatchBlock(sec);
