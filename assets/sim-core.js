// Simulateur de classement « et si » : module partagé site + application (copié dans l'appli par tools/sync-sim-core.sh).
// Critères de départage 2026-2027 vérifiés sur les pages Wikipédia de chaque saison, qui citent les règlements officiels :
// LFP (art. 518 ter), Premier League Handbook (section C), RFEF (art. 29), FIGC (C.U. 244/A), DFL (SpOL § 2).

/** Zones : clés communes, libellés et couleurs. */
export const SIM_ZONES = {
  ucl: { label: 'Ligue des champions', color: '#1F8A4C' },
  uclq: { label: 'Ligue des champions (3e tour de qualification)', color: '#5FBF86' },
  uel: { label: 'Ligue Europa', color: '#2E6FD8' },
  uecl: { label: 'Ligue Conférence (barrage)', color: '#22A3B8' },
  po: { label: 'Barrage de relégation', color: '#F08A24' },
  rel: { label: 'Relégation', color: '#D92D20' },
};
/** Libellés des critères (affichés pour expliquer un départage). */
export const SIM_CRIT = {
  pts: 'points', gd: 'différence de buts', gf: 'buts marqués', w: 'nombre de victoires', aw: 'victoires à l’extérieur', ag: 'buts marqués à l’extérieur',
  h2hPts: 'points en confrontations directes', h2hGd: 'différence de buts en confrontations directes', h2hAg: 'buts à l’extérieur en confrontations directes',
};
/**
 * Règles par championnat. h2h : 'all' = confrontations directes seulement quand tous les matchs entre les équipes à égalité
 * sont joués (ou simulés) ; 'end' = seulement une fois la saison entière jouée (Premier League).
 */
export const SIM_LEAGUES = {
  'fra.1': { name: 'Ligue 1', crit: ['pts', 'gd', 'h2hPts', 'h2hGd', 'gf', 'w', 'aw'], h2h: 'all',
    zones: [[1, 3, 'ucl'], [4, 4, 'uclq'], [5, 5, 'uel'], [6, 6, 'uecl'], [16, 16, 'po'], [17, 18, 'rel']],
    rest: 'points de fair-play, puis tirage au sort', src: 'Règlement des compétitions de la LFP 2026-2027, article 518 ter' },
  'eng.1': { name: 'Premier League', crit: ['pts', 'gd', 'gf', 'h2hPts', 'h2hAg'], h2h: 'end',
    zones: [[1, 4, 'ucl'], [5, 5, 'uel'], [18, 20, 'rel']],
    rest: 'match d’appui sur terrain neutre', src: 'Premier League Handbook 2026-27, section C' },
  'esp.1': { name: 'Liga', crit: ['pts', 'h2hPts', 'h2hGd', 'gd', 'gf'], h2h: 'all',
    zones: [[1, 4, 'ucl'], [5, 5, 'uel'], [6, 6, 'uecl'], [18, 20, 'rel']],
    rest: 'points de fair-play (à partir de trois équipes), puis match d’appui', src: 'Règlement des compétitions de la RFEF, article 29' },
  'ita.1': { name: 'Serie A', crit: ['pts', 'h2hPts', 'h2hGd', 'gd', 'gf'], h2h: 'all',
    zones: [[1, 4, 'ucl'], [5, 5, 'uel'], [6, 6, 'uecl'], [18, 20, 'rel']],
    rest: 'tirage au sort ; en fin de saison, une égalité de points pour la 1re ou la 17e place se joue en match(s) d’appui', src: 'FIGC, communiqué officiel n° 244/A du 27 mai 2026' },
  'ger.1': { name: 'Bundesliga', crit: ['pts', 'gd', 'gf', 'h2hGd', 'h2hAg', 'ag'], h2h: 'all',
    zones: [[1, 4, 'ucl'], [5, 5, 'uel'], [6, 6, 'uecl'], [16, 16, 'po'], [17, 18, 'rel']],
    rest: 'match d’appui sur terrain neutre (fin de saison)', src: 'Spielordnung (SpOL) de la Bundesliga, § 2' },
};
export const simZone = (lg, rank) => { const z = SIM_LEAGUES[lg]?.zones.find(([a, b]) => rank >= a && rank <= b); return z ? z[2] : null; };

const blank = id => ({ id, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, gd: 0, pts: 0, ag: 0, aw: 0, adj: 0 });
function add(t, f, a, away) { t.p++; t.gf += f; t.ga += a; t.gd = t.gf - t.ga; if (away) t.ag += f; if (f > a) { t.w++; t.pts += 3; if (away) t.aw++; } else if (f === a) { t.d++; t.pts += 1; } else t.l++; }

/**
 * Classement à partir des résultats. teams : ids ; results : [{h, a, hs, as}] ; adj : {id: points} (pénalités) ;
 * complete : true si plus aucun match restant (pour h2h 'end'). Renvoie { rows } triées, chaque ligne avec rank et by
 * (critère qui l'a départagée de l'équipe juste au-dessus à égalité de points, 'lots' si égalité parfaite).
 */
export function simTable(lg, { teams, results, adj = {}, complete = false, names = {} }) {
  const R = SIM_LEAGUES[lg]; if (!R) throw new Error(`championnat inconnu ${lg}`);
  const S = new Map(teams.map(id => [String(id), blank(String(id))]));
  for (const m of results) { const H = S.get(String(m.h)), A = S.get(String(m.a)); if (!H || !A || m.hs == null || m.as == null) continue; add(H, +m.hs, +m.as, false); add(A, +m.as, +m.hs, true); }
  for (const [id, v] of Object.entries(adj || {})) { const t = S.get(String(id)); if (t) { t.pts += Number(v) || 0; t.adj = Number(v) || 0; } }
  const res = new Map(); for (const m of results) if (m.hs != null && m.as != null) res.set(`${m.h}>${m.a}`, m);
  const h2hOk = g => {
    if (R.h2h === 'end' && !complete) return false;
    for (const x of g) for (const y of g) if (x !== y && !res.has(`${x.id}>${y.id}`)) return false;
    return true;
  };
  const mini = g => {
    const ids = new Set(g.map(t => t.id)), M = new Map(g.map(t => [t.id, blank(t.id)]));
    for (const m of res.values()) if (ids.has(String(m.h)) && ids.has(String(m.a))) { add(M.get(String(m.h)), +m.hs, +m.as, false); add(M.get(String(m.a)), +m.as, +m.hs, true); }
    return M;
  };
  const nm = t => names[t.id] || t.id;
  function rank(group, ci) {
    if (group.length < 2) return group;
    if (ci >= R.crit.length) { const g = [...group].sort((a, b) => nm(a).localeCompare(nm(b), 'fr')); g.forEach((t, i) => { if (i) t.by = 'lots'; }); return g; }
    const key = R.crit[ci];
    let val;
    if (key.startsWith('h2h')) {
      if (!h2hOk(group)) return rank(group, ci + 1);
      const M = mini(group), f = { h2hPts: 'pts', h2hGd: 'gd', h2hAg: 'ag' }[key];
      val = t => M.get(t.id)[f];
    } else val = t => t[key];
    const sorted = [...group].sort((a, b) => val(b) - val(a));
    const subs = []; for (const t of sorted) { const last = subs[subs.length - 1]; if (last && val(last[0]) === val(t)) last.push(t); else subs.push([t]); }
    const out = [];
    subs.forEach((sg, i) => { const r = rank(sg, ci + 1); if (i && ci > 0) r[0].by = key; out.push(...r); });
    return out;
  }
  const rows = rank([...S.values()].map(t => ({ ...t, by: null })), 0);
  rows.forEach((t, i) => { t.rank = i + 1; t.zone = simZone(lg, t.rank); });
  return { rows };
}

// Lien partageable : un caractère par affiche (domicile × extérieur, équipes triées par identifiant), stable toute la saison.
const ALPHA = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ-_';
const B36 = '0123456789abcdefghijklmnopqrstuvwxyz';
export const simOrder = teams => [...teams].map(String).sort((a, b) => Number(a) - Number(b) || a.localeCompare(b));
/** scores : Map 'h>a' → [hs, as]. Renvoie une chaîne URL-safe ('' si rien). */
export function simEncode(order, scores) {
  let out = '', gap = 0;
  const flush = () => { while (gap > 0) { const k = Math.min(gap, 35); out += '.' + B36[k]; gap -= k; } };
  for (const h of order) for (const a of order) {
    if (h === a) continue;
    const s = scores.get(`${h}>${a}`);
    if (!s) { gap++; continue; }
    flush();
    const [x, y] = s.map(Number);
    out += x <= 7 && y <= 7 ? ALPHA[x * 8 + y] : '~' + ALPHA[Math.min(x, 63)] + ALPHA[Math.min(y, 63)];
  }
  return out;
}
export function simDecode(order, str) {
  const scores = new Map(); if (!str) return scores;
  const pairs = []; for (const h of order) for (const a of order) if (h !== a) pairs.push(`${h}>${a}`);
  let i = 0, p = 0;
  while (i < str.length && p < pairs.length) {
    const c = str[i];
    if (c === '.') { const k = B36.indexOf(str[i + 1]); if (k < 1) break; p += k; i += 2; continue; }
    if (c === '~') { const x = ALPHA.indexOf(str[i + 1]), y = ALPHA.indexOf(str[i + 2]); if (x < 0 || y < 0) break; scores.set(pairs[p++], [x, y]); i += 3; continue; }
    const v = ALPHA.indexOf(c); if (v < 0) break; scores.set(pairs[p++], [Math.floor(v / 8), v % 8]); i++;
  }
  return scores;
}
