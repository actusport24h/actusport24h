// Jeux ActuSport24h (Duel de joueurs, Quiz du jour, Qui est-ce ?) : logique partagée site / appli / génération (build).
// Synchronisé tel quel dans l'appli (tools/sync-jeux-core.sh). Aucune dépendance.
export const SITE = 'https://actusport24h.fr';
export const JEUX_DATA = '/data/jeux';
export const VOTES_API = 'https://actusport24h-comments.actusport24h.workers.dev';
export const QEC_TRIES = 6;

/** Minuscules sans accents ni ponctuation (recherche « mbappe » → Mbappé). */
export const norm = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[øØ]/g, 'o').replace(/[æÆ]/g, 'ae').replace(/ß/g, 'ss').replace(/[łŁ]/g, 'l').replace(/[đĐ]/g, 'd').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** Date du jour à Paris (AAAA-MM-JJ) : la même pour tout le monde, change à minuit heure de Paris. */
export function parisDate(d = new Date()) {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d);
  const g = t => p.find(x => x.type === t).value;
  return `${g('year')}-${g('month')}-${g('day')}`;
}
export const frDate = iso => { const [y, m, d] = iso.split('-').map(Number); return `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`; };
export const addDays = (iso, n) => { const t = new Date(`${iso}T12:00:00Z`); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };

/** Graine et générateur pseudo-aléatoire déterministes (même date → mêmes questions). */
export function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
export function rng(seed) {
  let a = typeof seed === 'string' ? hashStr(seed) : seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
export const pick = (r, list) => list[Math.floor(r() * list.length)];
export function shuffle(r, list) { const a = [...list]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

// ---------- Qui est-ce ? : identité du joueur mystère masquée dans le fichier du jour (anti-divulgâchage, pas un secret) ----------
// Octets UTF-8 et hexadécimal écrits à la main (mêmes résultats sur navigateur, Node et Hermes).
const utf8e = s => encodeURIComponent(s).replace(/%([0-9A-F]{2})/g, (m, h) => String.fromCharCode(parseInt(h, 16)));
const utf8d = s => decodeURIComponent(s.split('').map(c => `%${c.charCodeAt(0).toString(16).padStart(2, '0')}`).join(''));
const hexe = s => s.split('').map(c => c.charCodeAt(0).toString(16).padStart(2, '0')).join('');
const hexd = h => (h.match(/../g) || []).map(x => String.fromCharCode(parseInt(x, 16))).join('');
function xorKey(date, s) { const r = rng(`qec-key|${date}`); let o = ''; for (let i = 0; i < s.length; i++) o += String.fromCharCode(s.charCodeAt(i) ^ Math.floor(r() * 256)); return o; }
export const encodeSecret = (date, obj) => hexe(xorKey(date, utf8e(JSON.stringify(obj))));
export const decodeSecret = (date, k) => { try { return JSON.parse(utf8d(xorKey(date, hexd(k)))); } catch { return null; } };

/** Index des joueurs (data/jeux/joueurs.json) : [id, nom, slug, club, idClub, poste, nationalité, âge, championnat, photo 0/1, notoriété]. */
export const IX = { id: 0, name: 1, slug: 2, club: 3, clubId: 4, pos: 5, nat: 6, age: 7, league: 8, photo: 9, fame: 10 };
/** Recherche sans accents : nom complet, nom de famille ou club ; les débuts de mots passent devant. */
export function searchPlayers(rows, q, limit = 8, exclude = []) {
  const n = norm(q); if (n.length < 2) return [];
  const out = [];
  for (const r of rows) {
    if (exclude.includes(r[0])) continue;
    const nm = norm(r[1]);
    let s = -1;
    if (nm.startsWith(n)) s = 0; else if (nm.split(' ').some(w => w.startsWith(n))) s = 1; else if (nm.includes(n)) s = 2; else if (norm(r[3]).startsWith(n)) s = 3;
    if (s >= 0) out.push([s, r]);
  }
  // Début du nom complet, puis début d'un mot, puis le reste ; à égalité, les joueurs les plus connus d'abord.
  return out.sort((a, b) => a[0] - b[0] || (b[1][10] || 0) - (a[1][10] || 0) || a[1][1].localeCompare(b[1][1], 'fr')).slice(0, limit).map(x => x[1]);
}

/** Retour d'un essai : compare le joueur proposé au mystère (club, championnat, nationalité, poste, âge). */
export function qecFeedback(row, m) {
  return {
    club: row[IX.clubId] && row[IX.clubId] === m.clubId,
    league: !!row[IX.league] && row[IX.league] === m.league,
    nat: row[IX.nat] === m.nat,
    pos: posGroup(row[IX.pos]) === posGroup(m.pos),
    age: row[IX.age] == null || m.age == null ? null : row[IX.age] === m.age ? 0 : row[IX.age] < m.age ? 1 : -1, // 1 : le mystère est plus âgé
  };
}
export function posGroup(p) {
  const s = norm(p);
  if (/gardien/.test(s)) return 'G';
  if (/defenseur|lateral|arriere|libero/.test(s)) return 'D';
  if (/milieu/.test(s)) return 'M';
  if (/attaquant|avant|ailier|buteur/.test(s)) return 'A';
  return s;
}
/** Texte de partage sans divulgâchage. */
export function qecShareText(date, tries, won) {
  const cells = [...Array(won ? tries.length - 1 : tries.length).fill('🟥'), ...(won ? ['🟩'] : [])].join('');
  return `Qui est-ce ? ActuSport24h du ${frDate(date)} : ${won ? `trouvé en ${tries.length}/${QEC_TRIES}` : `raté (${QEC_TRIES}/${QEC_TRIES})`} ${cells}\n${SITE}/qui-est-ce/`;
}
export function quizShareText(date, answers, total) {
  const ok = answers.filter(Boolean).length;
  return `Quiz du jour ActuSport24h du ${frDate(date)} : ${ok}/${total} ${answers.map(a => (a ? '✅' : '❌')).join('')}\n${SITE}/quiz/`;
}
export const quizVerdict = (ok, total) => (ok === total ? 'Sans faute !' : ok >= total * 0.75 ? 'Très bien joué.' : ok >= total / 2 ? 'Pas mal du tout.' : 'Retente ta chance demain.');

// ---------- Duel de joueurs ----------
/** Lignes comparées (totaux de la saison, toutes compétitions suivies) ; low = plus petit est meilleur. */
export const DUEL_ROWS = [
  { k: 'starts', label: 'Titularisations' },
  { k: 'g', label: 'Buts' },
  { k: 'a', label: 'Passes décisives' },
  { k: 'ga', label: 'Buts + passes', calc: t => (t.g ?? 0) + (t.a ?? 0) },
  { k: 'sh', label: 'Tirs' },
  { k: 'sot', label: 'Tirs cadrés' },
  { k: 'fs', label: 'Fautes subies' },
  { k: 'yc', label: 'Cartons jaunes', low: true },
  { k: 'rc', label: 'Cartons rouges', low: true },
];
/** Totaux de la saison à partir des statistiques par compétition de la fiche (splits). */
export function seasonTotals(p) {
  const t = { starts: 0, g: 0, a: 0, sh: 0, sot: 0, fs: 0, yc: 0, rc: 0, comps: 0 };
  for (const s of p?.splits || []) { t.comps++; for (const k of ['starts', 'g', 'a', 'sh', 'sot', 'fs', 'yc', 'rc']) t[k] += Number(s[k]) || 0; }
  t.ga = t.g + t.a;
  return t;
}
/** 1 si a est meilleur, -1 si b, 0 si égalité. */
export const better = (row, va, vb) => (va === vb ? 0 : (row.low ? va < vb : va > vb) ? 1 : -1);
/** Pourcentages des deux barres (somme 100, 50/50 si les deux sont à 0). */
export const barPct = (va, vb) => (va + vb > 0 ? Math.round((va / (va + vb)) * 100) : 50);
export const duelUrl = (a, b) => `${SITE}/duel/?a=${encodeURIComponent(a)}&b=${encodeURIComponent(b)}`;
export const duelPair = (a, b) => [String(a), String(b)].sort((x, y) => Number(x) - Number(y)).join('-');
export const xIntent = (text, url) => `https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;
/** Parcours en clubs sans les équipes réserves, du plus récent au plus ancien, prêts signalés. */
export const clubCareer = p => (p?.career || []).filter(c => !c.reserve);
export const ageAt = (dob, iso) => { if (!dob) return null; const [y, m, d] = dob.split('-').map(Number); const [Y, M, D] = iso.split('-').map(Number); return Y - y - (M < m || (M === m && D < d) ? 1 : 0); };
