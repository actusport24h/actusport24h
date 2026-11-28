// « Fais ta compo » : module partagé, sans DOM ni dépendance.
// Source unique : actusport24h-site/src/assets/compo-core.js. Copié tel quel dans l'appli
// (actusport24h-app/src/lib/compo-core.js, tools/sync-compo-core.sh) et dans le serveur des votes
// (actusport24h-comments/src/compo-core.js, sync-compo-core.sh) : schémas, validation et agrégation identiques partout.

export const COMPO_V = 1;
export const SITE = 'https://actusport24h.fr';
export const PAGE = '/fais-ta-compo/';
export const VOTES_API = 'https://actusport24h-comments.actusport24h.workers.dev';

/** Postes : libellé court, libellé long, famille (G gardien, D défense, M milieu, A attaque). */
export const ROLES = {
  GB: ['GB', 'Gardien', 'G'],
  DG: ['DG', 'Latéral gauche', 'D'], DC: ['DC', 'Défenseur central', 'D'], DD: ['DD', 'Latéral droit', 'D'],
  PG: ['PG', 'Piston gauche', 'D'], PD: ['PD', 'Piston droit', 'D'],
  MDC: ['MDC', 'Milieu défensif', 'M'], MC: ['MC', 'Milieu central', 'M'], MG: ['MG', 'Milieu gauche', 'M'],
  MD: ['MD', 'Milieu droit', 'M'], MOC: ['MOC', 'Milieu offensif', 'M'],
  AG: ['AG', 'Ailier gauche', 'A'], AD: ['AD', 'Ailier droit', 'A'], BU: ['BU', 'Avant-centre', 'A'],
};

// Schémas : postes du gardien à l'attaque, de gauche à droite. x : % de la largeur, y : % de la hauteur (attaque en haut).
const L = (...a) => a;
const DEF4 = L(['DG', 14, 70], ['DC', 37, 75], ['DC', 63, 75], ['DD', 86, 70]);
const DEF3 = L(['DC', 22, 74], ['DC', 50, 77], ['DC', 78, 74]);
const DEF5 = L(['PG', 9, 64], ['DC', 30, 75], ['DC', 50, 77], ['DC', 70, 75], ['PD', 91, 64]);
const RAW = {
  '4-3-3': [...DEF4, ['MC', 24, 48], ['MDC', 50, 55], ['MC', 76, 48], ['AG', 17, 22], ['BU', 50, 16], ['AD', 83, 22]],
  '4-4-2': [...DEF4, ['MG', 12, 46], ['MC', 37, 51], ['MC', 63, 51], ['MD', 88, 46], ['BU', 35, 18], ['BU', 65, 18]],
  '4-2-3-1': [...DEF4, ['MDC', 35, 56], ['MDC', 65, 56], ['MG', 15, 35], ['MOC', 50, 37], ['MD', 85, 35], ['BU', 50, 15]],
  '4-1-4-1': [...DEF4, ['MDC', 50, 58], ['MG', 12, 40], ['MC', 37, 43], ['MC', 63, 43], ['MD', 88, 40], ['BU', 50, 16]],
  '3-5-2': [...DEF3, ['MG', 10, 46], ['MC', 32, 47], ['MDC', 50, 56], ['MC', 68, 47], ['MD', 90, 46], ['BU', 35, 18], ['BU', 65, 18]],
  '3-4-3': [...DEF3, ['MG', 12, 48], ['MC', 37, 52], ['MC', 63, 52], ['MD', 88, 48], ['AG', 17, 22], ['BU', 50, 16], ['AD', 83, 22]],
  '3-4-2-1': [...DEF3, ['MG', 12, 50], ['MC', 37, 54], ['MC', 63, 54], ['MD', 88, 50], ['MOC', 32, 32], ['MOC', 68, 32], ['BU', 50, 15]],
  '5-3-2': [...DEF5, ['MC', 25, 47], ['MC', 50, 51], ['MC', 75, 47], ['BU', 35, 19], ['BU', 65, 19]],
};
/** Schémas proposés, dans l'ordre d'affichage. */
export const FORMATION_IDS = Object.keys(RAW);
export const DEFAULT_FORMATION = '4-3-3';
export const isFormation = f => typeof f === 'string' && Object.prototype.hasOwnProperty.call(RAW, f);
/** Les 11 postes d'un schéma : { i, r (code), label, name, g (famille), x, y }. Poste 0 = gardien. */
export function formationSlots(f) {
  const rows = RAW[isFormation(f) ? f : DEFAULT_FORMATION];
  return [['GB', 50, 91], ...rows].map(([r, x, y], i) => ({ i, r, label: ROLES[r][0], name: ROLES[r][1], g: ROLES[r][2], x, y }));
}

/** Texte normalisé pour la recherche : minuscules, sans accents ni ponctuation (ø, ł, đ, æ, œ, ß compris). */
export function normText(s) {
  return String(s ?? '').toLowerCase()
    .replace(/[øǿ]/g, 'o').replace(/ł/g, 'l').replace(/[đð]/g, 'd').replace(/æ/g, 'ae').replace(/œ/g, 'oe').replace(/ß/g, 'ss').replace(/ı/g, 'i').replace(/þ/g, 'th')
    .replace(/[\u00C0-\u024F]/g, c => { try { return c.normalize('NFD'); } catch { return c; } }).replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ').trim();
}

/**
 * Recherche dans l'index des joueurs : items { id, n (nom), k (nom normalisé, facultatif) }.
 * Chaque mot de la requête doit commencer un mot du nom (ou y figurer) ; les débuts de mot passent devant.
 */
export function searchPlayers(items, q, limit = 30) {
  const qs = normText(q).split(' ').filter(Boolean);
  if (!qs.length) return [];
  const out = [];
  for (const it of items) {
    const k = it.k || (it.k = normText(it.n));
    const words = k.split(' ');
    let score = 0, ok = true;
    for (const w of qs) {
      if (words.some(x => x === w)) score += 3;
      else if (words.some(x => x.startsWith(w))) score += 2;
      else if (k.includes(w)) score += 1;
      else { ok = false; break; }
    }
    if (ok) out.push({ it, score: score * 100 - k.length });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, limit).map(x => x.it);
}

/** Nom court à afficher sur le terrain : « M. Greenwood » → « Greenwood » (le nom complet reste en infobulle). */
export function pitchName(p) {
  if (!p) return '';
  const s = String(p.s || p.short || p.n || p.name || '');
  return s.replace(/^[A-ZÀ-ÖØ-Þ]\.\s+/, '') || s; // classes simples : compatibles avec le moteur JS de l'appli (Hermes)
}

const ID_RE = /^\d{1,12}$/;
/**
 * Validation stricte d'une compo soumise (même règle côté site, appli et serveur).
 * players : 11 ids de joueurs distincts, dans l'ordre des postes du schéma.
 * exists(id) : le joueur existe dans les fiches du site. Renvoie un message d'erreur, ou null si la compo est valide.
 */
export function compoError({ formation, players }, exists = () => true) {
  if (!isFormation(formation)) return 'Schéma inconnu.';
  if (!Array.isArray(players) || players.length !== 11) return 'Il faut exactement 11 joueurs.';
  const seen = new Set();
  for (const id of players) {
    if (typeof id !== 'string' || !ID_RE.test(id)) return 'Joueur invalide.';
    if (seen.has(id)) return 'Un joueur ne peut occuper qu’un seul poste.';
    seen.add(id);
    if (!exists(id)) return 'Joueur inconnu.';
  }
  return null;
}

/**
 * Compo des lecteurs : schéma le plus choisi, puis, pour chacun de ses postes, le joueur le plus choisi
 * (sans doublon : on attribue d'abord les choix les plus nets), avec le pourcentage des votes de ce schéma.
 * rows : [{ f: '4-3-3', p: [11 ids] }].
 */
export function aggregateVotes(rows) {
  const valid = (rows || []).filter(r => isFormation(r.f) && Array.isArray(r.p) && r.p.length === 11);
  const total = valid.length;
  if (!total) return { total: 0, formation: null, formations: [], votesInFormation: 0, slots: [] };
  const byF = new Map();
  for (const r of valid) byF.set(r.f, (byF.get(r.f) || 0) + 1);
  const formations = [...byF.entries()].sort((a, b) => b[1] - a[1] || FORMATION_IDS.indexOf(a[0]) - FORMATION_IDS.indexOf(b[0]));
  const f = formations[0][0];
  const inF = valid.filter(r => r.f === f);
  const n = inF.length;
  const counts = Array.from({ length: 11 }, () => new Map());
  for (const r of inF) r.p.forEach((id, i) => { if (id) counts[i].set(id, (counts[i].get(id) || 0) + 1); });
  const cand = [];
  counts.forEach((m, i) => m.forEach((c, id) => cand.push({ i, id, c })));
  cand.sort((a, b) => b.c - a.c || a.i - b.i || (a.id < b.id ? -1 : 1));
  const slotTaken = new Array(11).fill(null), used = new Set();
  for (const x of cand) {
    if (slotTaken[x.i] || used.has(x.id)) continue;
    slotTaken[x.i] = x; used.add(x.id);
  }
  const slots = formationSlots(f).map(s => {
    const x = slotTaken[s.i];
    return { i: s.i, r: s.r, id: x ? x.id : null, pct: x ? Math.round((100 * x.c) / n) : 0 };
  });
  return { total, formation: f, formations: formations.map(([id, c]) => ({ id, n: c, pct: Math.round((100 * c) / total) })), votesInFormation: n, slots };
}

/** Lien de partage d'une compo : /fais-ta-compo/?club=<slug>&f=<schéma>&p=<11 ids séparés par des points, « _ » si vide>. */
export function compoLink({ club, formation, players }, base = SITE) {
  const p = (players || []).map(x => x || '_').join('.');
  const q = new URLSearchParams();
  if (club) q.set('club', club);
  if (formation) q.set('f', formation);
  if ((players || []).some(Boolean)) q.set('p', p);
  return `${base}${PAGE}?${q.toString()}`;
}
/** Lecture des paramètres d'un lien de partage (ids invalides ignorés). */
export function parseCompoParams(get) {
  const club = String(get('club') || get('c') || '').toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 80) || null;
  const f = get('f');
  const formation = isFormation(f) ? f : null;
  const raw = String(get('p') || '').split('.').slice(0, 11);
  const players = Array.from({ length: 11 }, (_, i) => (ID_RE.test(raw[i] || '') ? raw[i] : null));
  return { club, formation, players };
}

/** Texte du post X (le lien est ajouté par l'intent ; X le compte pour 23 caractères). */
export function shareText({ clubName, formation, names }) {
  const head = `Ma compo${clubName ? ` pour ${clubName}` : ''}${formation ? ` en ${formation}` : ''}`;
  const tail = ' #FaisTaCompo via @ActuSport24h';
  const list = (names || []).filter(Boolean);
  let txt = list.length ? `${head} : ${list.join(', ')}.` : `${head}.`;
  if (txt.length + tail.length > 250) txt = `${head}.`;
  return txt + tail;
}
/** Intent web X (rien n'est publié sans action de l'utilisateur). */
export function xIntentUrl(text, url) {
  return `https://x.com/intent/post?text=${encodeURIComponent(text)}${url ? `&url=${encodeURIComponent(url)}` : ''}`;
}
