// Baromètre mercato : méthode de l'indice de crédibilité, partagée par le site (/barometre-mercato/), le build et l'appli.
// Aucune dépendance. Toute modification ici doit être recopiée dans l'appli (tools/sync-mercato-core.sh).

/** Fiabilité des médias (jugement éditorial publié sur la page). 1 = référence, 2 = spécialisé reconnu, 3 = faible ou non vérifié (défaut). */
export const MC_TIERS = {
  "L'Équipe": 1, 'Le Parisien': 1, 'RMC Sport': 1, 'La Gazzetta dello Sport': 1, 'Corriere dello Sport': 1, 'BBC Sport': 1, 'Sky Sports': 1,
  'The Athletic': 1, 'Fabrizio Romano': 1, 'Kicker': 1, 'ESPN': 1, 'The Guardian': 1,
  'Foot Mercato': 2, 'Santi Aouna (Foot Mercato)': 2, 'TuttoMercatoWeb': 2, 'Sportmediaset': 2, 'Nicolò Schira': 2, 'Record': 2, 'O Jogo': 2,
  'A Bola': 2, 'TyC Sports': 2, 'Marca': 2, 'AS': 2, 'Mundo Deportivo': 2, 'Sport': 2, 'Bild': 2, 'Sky Sport Italia': 2, 'Sky Sport Deutschland': 2,
  'La Provence': 2, 'Calciomercato.com': 2, 'Ouest-France': 2, 'Le Progrès': 2, 'La Voix du Nord': 2,
};
export const MC_TIER_LABEL = { 1: 'référence', 2: 'spécialisé', 3: 'faible' };
export const MC_TIER_PTS = { 1: 3, 2: 2, 3: 1 };
export const MC_WEAK_CAP = 2;          // les sources « faibles » rapportent au plus 2 points à elles toutes
export const MC_PTS_CAP = 7;           // plafond des points de sources
export const MC_CONTRE = { party: -3, media: -2 };
export const MC_CONFIRME = 2;
export const MC_AGE = [[14, 0], [30, -1], [60, -2]]; // jours depuis la dernière source favorable → malus ; au-delà de 60 jours : expirée
export const MC_EXPIRE_DAYS = 60;
export const MC_HOT = 6, MC_WARM = 3;  // ≥ 6 chaud, 3 à 5 tiède, ≤ 2 froid
export const MC_LEVELS = { chaud: { label: 'Chaud', icon: '🔥' }, tiede: { label: 'Tiède', icon: '🌤️' }, froid: { label: 'Froid', icon: '❄️' } };
export const MC_STATUS = { active: 'En cours', expiree: 'Expirée', dementie: 'Démentie', conclue: 'Officialisée' };

export const mcTier = s => (s.party || s.kind === 'officiel') ? 1 : (MC_TIERS[s.outlet] || 3);
const DAY = 864e5;
const ts = d => Date.parse(String(d).length === 10 ? `${d}T12:00:00Z` : d);
export const mcDays = (d, now = Date.now()) => Math.max(0, Math.floor((now - ts(d)) / DAY));

/** Indice d'une rumeur : { score, level, status, parts[], first, last, ageDays, counted[] }. */
export function mcScore(r, now = Date.now()) {
  const src = (r.sources || []).filter(s => ts(s.date) <= now + DAY);
  const parts = [];
  const pour = src.filter(s => s.kind === 'pour' || s.kind === 'confirme');
  const orig = pour.filter(s => !s.relay);
  const first = orig.length ? orig.map(s => s.date).sort()[0] : (src[0]?.date || null);
  const last = orig.length ? orig.map(s => s.date).sort().at(-1) : first; // les reprises ne rafraîchissent pas une rumeur
  const off = src.find(s => s.kind === 'officiel');
  const dem = src.find(s => s.kind === 'dementi');
  // Points : un média ne compte qu'une fois (sa meilleure note), les simples reprises ne comptent pas.
  const best = new Map();
  for (const s of pour) { if (s.relay || s.kind !== 'pour') continue; const t = mcTier(s); if (!best.has(s.outlet) || best.get(s.outlet) > t) best.set(s.outlet, t); }
  let strong = 0, weak = 0;
  for (const [, t] of best) { if (t === 3) weak += 1; else strong += MC_TIER_PTS[t]; }
  const weakPts = Math.min(MC_WEAK_CAP, weak);
  const pts = Math.min(MC_PTS_CAP, strong + weakPts);
  const counted = [...best].map(([o, t]) => ({ outlet: o, tier: t, pts: t === 3 ? null : MC_TIER_PTS[t] }));
  parts.push({ k: 'sources', v: pts, t: `${best.size} média${best.size > 1 ? 's' : ''} distinct${best.size > 1 ? 's' : ''} : +${pts}${weak > MC_WEAK_CAP ? ` (sources faibles plafonnées à ${MC_WEAK_CAP})` : ''}` });
  let score = pts;
  const conf = src.filter(s => s.kind === 'confirme');
  if (conf.length) { score += MC_CONFIRME * conf.length; parts.push({ k: 'confirme', v: MC_CONFIRME * conf.length, t: `${conf.length} confirmation${conf.length > 1 ? 's' : ''} d'une partie concernée : +${MC_CONFIRME * conf.length}` }); }
  for (const s of src.filter(x => x.kind === 'contre')) {
    const v = s.party ? MC_CONTRE.party : MC_CONTRE.media; score += v;
    parts.push({ k: 'contre', v, t: `${s.party ? 'Déclaration contraire d’une partie concernée' : 'Information contraire d’un média'} (${s.outlet}) : ${v}` });
  }
  const ageDays = last ? mcDays(last, now) : 0;
  let status = 'active';
  if (off) status = 'conclue';
  else if (dem) status = 'dementie';
  else if (ageDays > MC_EXPIRE_DAYS) status = 'expiree';
  const pen = (MC_AGE.find(([d]) => ageDays <= d) || [0, -2])[1];
  if (pen) { score += pen; parts.push({ k: 'age', v: pen, t: `Dernière source favorable il y a ${ageDays} jours : ${pen}` }); }
  else parts.push({ k: 'age', v: 0, t: `Dernière source favorable ${ageDays === 0 ? 'aujourd’hui' : `il y a ${ageDays} jour${ageDays > 1 ? 's' : ''}`} : pas de malus` });
  let level = score >= MC_HOT ? 'chaud' : score >= MC_WARM ? 'tiede' : 'froid';
  if (status === 'dementie' || status === 'expiree') { level = 'froid'; parts.push({ k: 'statut', v: 0, t: status === 'dementie' ? `Démentie (${dem.outlet}) : classée froide` : `Aucune nouvelle source depuis plus de ${MC_EXPIRE_DAYS} jours : expirée` }); }
  if (status === 'conclue') parts.push({ k: 'statut', v: 0, t: `Officialisée (${off.outlet})` });
  return { score, level, status, parts, first, last, ageDays, counted };
}

/** Filtre et tri pour l'affichage. o = { statut: 'actives'|'toutes', niveau: ''|'chaud'|'tiede'|'froid', club: slug|'' , q } */
export function mcFilter(list, o = {}, now = Date.now()) {
  const q = mcNorm(o.q || '');
  return list.map(r => ({ r, s: mcScore(r, now) })).filter(({ r, s }) => {
    if ((o.statut || 'actives') === 'actives' && s.status !== 'active') return false;
    if (o.niveau && s.level !== o.niveau) return false;
    const cl = [r.from, ...(r.to || []), ...(r.also || [])].filter(Boolean);
    if (o.club && !cl.some(c => (c.slug || c) === o.club)) return false;
    if (q && !mcNorm(`${r.player?.name} ${cl.map(c => `${c.name || c} ${c.short || ''}`).join(' ')}`).includes(q)) return false;
    return true;
  });
}
export const MC_SORTS = { indice: 'Indice', recent: 'Plus récentes', joueur: 'Joueur' };
const ORDER = { active: 0, conclue: 1, dementie: 2, expiree: 3 };
export function mcSort(rows, by = 'indice') {
  const c = by === 'joueur' ? (a, b) => mcNorm(a.r.player.name).localeCompare(mcNorm(b.r.player.name))
    : by === 'recent' ? (a, b) => String(b.s.last).localeCompare(String(a.s.last))
    : (a, b) => (ORDER[a.s.status] - ORDER[b.s.status]) || (b.s.score - a.s.score) || String(b.s.last).localeCompare(String(a.s.last));
  return rows.slice().sort(c);
}
export const mcNorm = s => String(s || '').replace(/[’‘]/g, "'").normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/ø/g, 'o');
export const mcPct = (v = {}) => { const n = (v.oui || 0) + (v.non || 0); return { n, oui: n ? Math.round(100 * (v.oui || 0) / n) : 0, non: n ? 100 - Math.round(100 * (v.oui || 0) / n) : 0 }; };
export const MC_MONTHS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
export const mcDate = d => { const [y, m, j] = String(d).slice(0, 10).split('-').map(Number); return `${j} ${MC_MONTHS[m - 1]} ${y}`; };
export const MC_ID_RE = /^[a-z0-9][a-z0-9-]{2,59}$/;
