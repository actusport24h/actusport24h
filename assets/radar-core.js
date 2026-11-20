// Radar des Français à l'étranger : logique partagée site + application (copiée dans l'appli par tools/sync-radar-core.sh).
// Semaines du lundi au dimanche à l'heure de Paris, filtres, synthèse de la semaine et totaux.
export const RADAR_POS = [{ id: '', name: 'Tous les postes' }, { id: 'G', name: 'Gardiens' }, { id: 'D', name: 'Défenseurs' }, { id: 'M', name: 'Milieux' }, { id: 'A', name: 'Attaquants' }];
export const RADAR_LG = [{ id: '', name: 'Tous les championnats' }, { id: 'eng.1', name: 'Premier League' }, { id: 'esp.1', name: 'Liga' }, { id: 'ita.1', name: 'Serie A' }, { id: 'ger.1', name: 'Bundesliga' }, { id: 'autres', name: 'Autres championnats' }];
const pad = n => String(n).padStart(2, '0');
/** Date AAAA-MM-JJ à Paris. */
export function parisYMD(d) {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(d));
  const g = t => p.find(x => x.type === t).value; return `${g('year')}-${g('month')}-${g('day')}`;
}
const addD = (ymd, n) => { const [y, m, d] = ymd.split('-').map(Number); const t = new Date(Date.UTC(y, m - 1, d + n)); return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`; };
const MOIS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
export const dm = ymd => { const [, m, d] = ymd.split('-').map(Number); return `${d === 1 ? '1er' : d} ${MOIS[m - 1]}`; };
/** Semaine (lundi → dimanche, Paris) : offset 0 = cette semaine, 1 = la précédente… */
export function radarWeek(offset = 0, now = Date.now()) {
  const today = parisYMD(now); const [y, m, d] = today.split('-').map(Number);
  const dow = (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7; // 0 = lundi
  const from = addD(today, -dow - 7 * offset), to = addD(from, 6);
  return { offset, from, to, label: offset === 0 ? 'Cette semaine' : offset === 1 ? 'Semaine dernière' : `Semaine du ${dm(from)}`, range: `du ${dm(from)} au ${dm(to)}` };
}
export const inWeek = (m, w) => { const y = parisYMD(m.d); return y >= w.from && y <= w.to; };
/** Filtres : { lg, pos, bleus, u21, bi (inclure les binationaux), q } */
export function radarFilter(players, f = {}) {
  const q = norm(f.q || '');
  return players.filter(p => (f.bi || p.nat === 'fr') && (!f.lg || p.lg === f.lg) && (!f.pos || p.pos === f.pos) && (!f.bleus || !!p.bleus) && (!f.u21 || !!p.u21) && (!q || norm(`${p.name} ${p.club.name}`).includes(q)));
}
export const norm = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
/** Synthèse d'une semaine. sel = inclure les matchs en sélection. */
export function radarWeekSummary(players, w, { sel = true } = {}) {
  const rows = players.map(p => ({ p, ms: p.m.filter(m => inWeek(m, w) && (sel || !m.sel)).sort((a, b) => a.d.localeCompare(b.d)) })).filter(r => r.ms.length);
  const tot = r => ({ min: r.ms.reduce((s, m) => s + (m.min || 0), 0), g: r.ms.reduce((s, m) => s + m.g, 0), a: r.ms.reduce((s, m) => s + m.a, 0), played: r.ms.filter(m => m.st).length, starts: r.ms.filter(m => m.st === 1).length });
  const all = rows.map(r => ({ ...r, t: tot(r) }));
  const played = all.filter(r => r.t.played).sort((a, b) => b.t.min - a.t.min || a.p.name.localeCompare(b.p.name, 'fr'));
  const decisive = played.filter(r => r.t.g + r.t.a).sort((a, b) => (b.t.g + b.t.a) - (a.t.g + a.t.a) || b.t.g - a.t.g || a.p.name.localeCompare(b.p.name, 'fr'));
  const bench = all.filter(r => !r.t.played).sort((a, b) => a.p.name.localeCompare(b.p.name, 'fr'));
  const ids = new Set(all.map(r => r.p.id));
  const none = players.filter(p => !ids.has(p.id));
  return { decisive, played, bench, none, goals: played.reduce((s, r) => s + r.t.g, 0), assists: played.reduce((s, r) => s + r.t.a, 0) };
}
/** Totaux sur les matchs publiés (fenêtre des données). */
export function radarTotals(p, { sel = true } = {}) {
  const ms = p.m.filter(m => sel || !m.sel);
  return { played: ms.filter(m => m.st).length, starts: ms.filter(m => m.st === 1).length, min: ms.reduce((s, m) => s + (m.min || 0), 0), g: ms.reduce((s, m) => s + m.g, 0), a: ms.reduce((s, m) => s + m.a, 0) };
}
export const RADAR_SORTS = [{ id: 'min', name: 'Plus de minutes' }, { id: 'ga', name: 'Buts + passes' }, { id: 'nom', name: 'Nom' }];
export function radarSort(players, by, opt) {
  const T = new Map(players.map(p => [p.id, radarTotals(p, opt)]));
  const c = (a, b) => a.name.localeCompare(b.name, 'fr');
  return [...players].sort(by === 'nom' ? c : by === 'ga' ? (a, b) => (T.get(b.id).g + T.get(b.id).a) - (T.get(a.id).g + T.get(a.id).a) || T.get(b.id).g - T.get(a.id).g || c(a, b) : (a, b) => T.get(b.id).min - T.get(a.id).min || c(a, b));
}
/** « Titulaire », « Entré à la 67e », « Sur le banc ». */
export const radarRole = m => m.st === 1 ? 'Titulaire' : m.st === 2 ? 'Remplaçant' : 'Sur le banc, pas entré';
export const fr1 = x => (Math.round(x * 10) / 10).toFixed(1).replace('.', ',');
