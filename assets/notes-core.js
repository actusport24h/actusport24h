// « Notes des joueurs » : module partagé, sans DOM ni dépendance.
// Source unique : actusport24h-site/src/assets/notes-core.js. Copié tel quel dans l'appli
// (actusport24h-app/src/lib/notes-core.js, tools/sync-notes-core.sh) et dans le serveur
// (actusport24h-comments/src/notes-core.js, sync-notes-core.sh) : joueurs notables, fenêtre et seuils identiques partout.

export const NOTES_V = 1;
export const SITE = 'https://actusport24h.fr';
export const PAGE = '/notes/';
export const NOTES_API = 'https://actusport24h-comments.actusport24h.workers.dev';

/** Notes entières de 1 à 10. */
export const NOTE_MIN = 1;
export const NOTE_MAX = 10;
/** Moyenne affichée seulement à partir de ce nombre de votants (sinon « pas assez de votes »). */
export const MIN_VOTES = 3;
/** Ouverture au coup de sifflet final (statut « terminé ») ; fermeture 72 h après la fin du match, estimée à 2 h après le coup d'envoi. */
export const OPEN_HOURS = 72;
export const MATCH_HOURS = 2;
export const closesAt = ko => new Date(Date.parse(ko) + (MATCH_HOURS + OPEN_HOURS) * 3600e3).toISOString();

export const FINAL_STATUSES = new Set(['STATUS_FULL_TIME', 'STATUS_FINAL', 'STATUS_FINAL_AET', 'STATUS_FINAL_PEN', 'STATUS_FINAL_ET']);
/** Match terminé (sifflet final) d'après les données du site. */
export const isFinal = m => !!m && m.state === 'post' && FINAL_STATUSES.has(m.status);
/** Notes ouvertes : match terminé et fenêtre de 72 h non écoulée. */
export const isOpen = (m, now = Date.now()) => isFinal(m) && now < Date.parse(closesAt(m.date));

/**
 * Joueurs notables d'un match : titulaires + remplaçants entrés en jeu, d'après les compositions du JSON match
 * (lineups normalisés : { team, s, starters[], subs[] } ; joueur { id, name, short, n, in }).
 * Renvoie [{ id, name, short, j, t (id équipe), s ('h'|'a'), sub (entré en jeu) }] dans l'ordre de la feuille de match.
 */
export function playedPlayers(lineups, homeId, awayId) {
  const out = [], seen = new Set();
  for (const l of lineups || []) {
    const s = l.s || (String(l.team) === String(homeId) ? 'h' : String(l.team) === String(awayId) ? 'a' : (l.homeAway === 'away' ? 'a' : 'h'));
    const t = String(l.team ?? (s === 'h' ? homeId : awayId));
    const add = (p, sub) => {
      const id = p && p.id != null ? String(p.id) : '';
      if (!/^\d{1,12}$/.test(id) || seen.has(id)) return;
      seen.add(id);
      out.push({ id, name: String(p.name || p.short || ''), short: String(p.short || p.name || ''), j: p.n != null && p.n !== '' ? String(p.n) : null, t, s, sub });
    };
    for (const p of l.starters || []) add(p, false);
    for (const p of l.subs || []) if (p.in) add(p, true);
  }
  return out;
}

/** Validation d'une note : entier de 1 à 10. */
export const noteError = n => (Number.isInteger(n) && n >= NOTE_MIN && n <= NOTE_MAX ? null : `Note entière de ${NOTE_MIN} à ${NOTE_MAX}.`);

/** Moyenne au format français, une décimale : 6,8. */
export const fmtAvg = x => (x == null || Number.isNaN(Number(x)) ? '' : (Math.round(Number(x) * 10) / 10).toFixed(1).replace('.', ','));
/** Arrondi stocké / renvoyé par le serveur (2 décimales). */
export const round2 = x => Math.round(Number(x) * 100) / 100;

/** Homme du match des lecteurs : meilleure moyenne parmi les joueurs ayant au moins MIN_VOTES votes (égalité : plus de votants). */
export function motm(rows) {
  let best = null;
  for (const r of rows || []) {
    if (!r || r.n < MIN_VOTES || r.avg == null) continue;
    if (!best || r.avg > best.avg || (r.avg === best.avg && r.n > best.n)) best = r;
  }
  return best;
}
