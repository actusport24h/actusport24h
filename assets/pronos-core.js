// « Pronos entre lecteurs » : module partagé, sans DOM ni dépendance.
// Source unique : actusport24h-site/src/assets/pronos-core.js. Copié tel quel dans l'appli
// (actusport24h-app/src/lib/pronos-core.js, tools/sync-pronos-core.sh) et dans le serveur
// (actusport24h-comments/src/pronos-core.js, sync-pronos-core.sh) : barème, validation et classements identiques partout.

export const PRONOS_V = 1;
export const SITE = 'https://actusport24h.fr';
export const PAGE = '/pronos/';
export const RANKING_PAGE = '/pronos/classement/';
export const PRONOS_API = 'https://actusport24h-comments.actusport24h.workers.dev';

/** Barème : score exact 3 pts ; bon résultat avec le bon écart 2 pts ; bon résultat seul 1 pt ; sinon 0. */
export const BAREME = { exact: 3, diff: 2, result: 1 };
export const BAREME_LINES = [
  ['Score exact', BAREME.exact, 'ex. tu joues 2-1, le match finit 2-1'],
  ['Bon résultat et bon écart', BAREME.diff, 'ex. tu joues 2-1, le match finit 3-2 (ou 1-1 contre 0-0 pour un nul)'],
  ['Bon résultat (1, N ou 2)', BAREME.result, 'ex. tu joues 2-1, le match finit 3-0'],
  ['Mauvais résultat', 0, ''],
];
export const GOALS_MAX = 15;

/** 1 (victoire à domicile), N (nul), 2 (victoire à l'extérieur). */
export const outcome = (h, a) => (h > a ? '1' : h < a ? '2' : 'N');
/** Points d'un prono (ph-pa) pour un score final (h-a). */
export function points(ph, pa, h, a) {
  if (ph === h && pa === a) return BAREME.exact;
  if (outcome(ph, pa) !== outcome(h, a)) return 0;
  return ph - pa === h - a ? BAREME.diff : BAREME.result;
}
const isGoals = x => Number.isInteger(x) && x >= 0 && x <= GOALS_MAX;
/** Validation d'un prono : deux entiers de 0 à 15. */
export function predError({ h, a }) {
  if (!isGoals(h) || !isGoals(a)) return `Le score doit être composé de deux nombres de 0 à ${GOALS_MAX}.`;
  return null;
}

/**
 * Statuts ESPN : un match est « terminé » s'il a un score final officiel (prolongation comprise, hors tirs au but) ;
 * reporté ou annulé : le prono est annulé (ni points ni pénalité).
 */
export const FINAL_STATUSES = new Set(['STATUS_FULL_TIME', 'STATUS_FINAL', 'STATUS_FINAL_AET', 'STATUS_FINAL_PEN', 'STATUS_FINAL_ET']);
export const VOID_STATUSES = new Set(['STATUS_POSTPONED', 'STATUS_CANCELED', 'STATUS_CANCELLED', 'STATUS_ABANDONED', 'STATUS_FORFEIT', 'STATUS_SUSPENDED']);
/** Score final [h, a] d'un match des données du site, ou null s'il n'est pas terminé. */
export function finalScore(m) {
  if (!m || m.state !== 'post' || !FINAL_STATUSES.has(m.status)) return null;
  const s = Array.isArray(m.score) ? m.score : [m.home?.score, m.away?.score];
  const h = Number(s[0]), a = Number(s[1]);
  return Number.isInteger(h) && Number.isInteger(a) && h >= 0 && a >= 0 ? [h, a] : null;
}
export const isVoid = m => !!m && VOID_STATUSES.has(m.status);

// ---------- pseudos ----------
/** Mots interdits (racines, sans accents) : insultes, racisme, contenu sexuel, et noms réservés. */
const BANNED = [
  'connard', 'connasse', 'conasse', 'salope', 'salaud', 'pute', 'encule', 'enfoire', 'batard', 'fdp', 'ntm', 'niquetamere', 'nique', 'niquer',
  'pd', 'pedale', 'tapette', 'tafiole', 'gouine', 'trouduc', 'mongol', 'gogol', 'triso', 'merde', 'pouffiasse', 'raclure', 'bite', 'couille', 'chatte', 'teub', 'zizi',
  'negre', 'negro', 'bougnoul', 'bicot', 'crouille', 'youpin', 'youtre', 'chinetoque', 'niakoue', 'macaque', 'bamboula', 'nazi', 'hitler', 'siegheil', 'kkk',
  'fuck', 'shit', 'bitch', 'cunt', 'asshole', 'dick', 'whore', 'slut', 'retard', 'faggot', 'nigger', 'nigga', 'porn', 'sexe', 'xxx', 'casino', 'bitcoin', 'crypto', 'telegram', 'whatsapp', 'onlyfans',
];
const RESERVED = ['admin', 'administrateur', 'moderateur', 'moderation', 'actusport', 'actusport24h', 'redaction', 'officiel', 'webmaster'];
// Mots courts ou contenus dans des noms courants (Monique, Montenegro…) : refusés seulement comme mot entier.
const WHOLE = new Set(['nique', 'niquer', 'negro', 'retard', 'mongol', 'merde', 'triso']);
const strip = s => String(s ?? '').toLowerCase()
  .replace(/[øǿ]/g, 'o').replace(/ł/g, 'l').replace(/[đð]/g, 'd').replace(/æ/g, 'ae').replace(/œ/g, 'oe').replace(/ß/g, 'ss')
  .replace(/[\u00C0-\u024F]/g, c => { try { return c.normalize('NFD'); } catch { return c; } }).replace(/[\u0300-\u036f]/g, '');
const leet = s => s.replace(/0/g, 'o').replace(/1/g, 'i').replace(/3/g, 'e').replace(/4/g, 'a').replace(/5/g, 's').replace(/7/g, 't').replace(/8/g, 'b');
/** Pseudo affiché : espaces superflus retirés. */
export const cleanPseudo = p => String(p ?? '').replace(/\s+/g, ' ').trim();
/** Clé d'unicité : « Jean-Pierre », « jean pierre » et « JeanPierre » sont le même pseudo. */
export const pseudoKey = p => strip(cleanPseudo(p)).replace(/[^a-z0-9]/g, '');
const PSEUDO_RE = /^[A-Za-zÀ-ÖØ-öø-ÿ0-9][A-Za-zÀ-ÖØ-öø-ÿ0-9 _-]*$/;
/** Validation d'un pseudo (même règle sur le site, l'appli et le serveur). Renvoie un message, ou null. */
export function pseudoError(p) {
  const s = cleanPseudo(p);
  if (s.length < 3 || s.length > 20) return 'Le pseudo doit faire entre 3 et 20 caractères.';
  if (!PSEUDO_RE.test(s)) return 'Lettres, chiffres, espaces, tirets et « _ » uniquement (pas de lien ni de symbole).';
  if ((s.match(/[A-Za-zÀ-ÖØ-öø-ÿ]/g) || []).length < 2) return 'Le pseudo doit contenir au moins deux lettres.';
  if (/(.)\1{3,}/.test(s)) return 'Merci d’éviter les caractères répétés.';
  const k = pseudoKey(s), kl = leet(k);
  const words = strip(s).split(/[^a-z0-9]+/).filter(Boolean);
  for (const w of RESERVED) if (k.includes(w) || kl.includes(w)) return 'Ce pseudo est réservé.';
  for (const w of BANNED) {
    const short = w.length <= 4 || WHOLE.has(w); // mot entier seulement (évite « Podolski » pour « pd », « Monique » pour « nique »)
    if (short ? words.some(x => x === w || leet(x) === w) : (k.includes(w) || kl.includes(w))) return 'Ce pseudo n’est pas autorisé.';
  }
  return null;
}

// ---------- code de récupération ----------
/** 12 caractères sans ambiguïté (ni 0/O, ni 1/I/L), affichés en 3 groupes : environ 60 bits. */
export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const normCode = c => String(c ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
export const formatCode = c => normCode(c).replace(/(.{4})(?=.)/g, '$1-');
export const isCode = c => normCode(c).length === 12 && [...normCode(c)].every(x => CODE_ALPHABET.includes(x));

// ---------- périodes et classements ----------
/** Mois (heure de Paris) d'un coup d'envoi : « 2026-11 ». */
export function monthOf(iso) {
  const d = new Date(iso);
  try {
    const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit' }).formatToParts(d);
    return `${p.find(x => x.type === 'year').value}-${p.find(x => x.type === 'month').value}`;
  } catch {
    return d.toISOString().slice(0, 7);
  }
}
/** Saison (juillet à juin) : « 2026-2027 ». */
export function seasonOf(iso) {
  const [y, m] = monthOf(iso).split('-').map(Number);
  return m >= 7 ? `${y}-${y + 1}` : `${y - 1}-${y}`;
}
const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
export const monthLabel = k => { const [y, m] = String(k).split('-').map(Number); return MONTHS[m - 1] ? `${MONTHS[m - 1]} ${y}` : String(k); };
export const seasonLabel = k => `saison ${String(k).replace('-', '-')}`;

/** Rangs avec ex-æquo : mêmes points, mêmes scores exacts et mêmes bons résultats = même rang. */
export function rankRows(rows) {
  let prev = null, rank = 0;
  return rows.map((r, i) => {
    const k = `${r.pts}|${r.exact}|${r.good}`;
    if (k !== prev) { rank = i + 1; prev = k; }
    return { ...r, rank };
  });
}
/** Pourcentages 1 / N / 2 arrondis dont la somme fait 100. */
export function pct1N2({ h = 0, d = 0, a = 0 }) {
  const n = h + d + a;
  if (!n) return { n: 0, h: 0, d: 0, a: 0 };
  const raw = [h, d, a].map(x => (100 * x) / n), fl = raw.map(Math.floor);
  let rest = 100 - fl.reduce((s, x) => s + x, 0);
  raw.map((x, i) => [x - fl[i], i]).sort((x, y) => y[0] - x[0]).forEach(([, i]) => { if (rest > 0) { fl[i]++; rest--; } });
  return { n, h: fl[0], d: fl[1], a: fl[2] };
}
