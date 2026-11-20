// Centre de match ActuSport24h : normalisation du résumé public ESPN, traduction des commentaires,
// xG estimé (modèle maison), placement des joueurs sur le terrain et rendu HTML.
// Module partagé : build du site (Node), direct dans le navigateur et application.
export const MC_V = 3;
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const id = v => (v == null ? null : String(v));

/** Nom de joueur nettoyé : supprime les jetons parasites du flux (« Null », « undefined », « None »…). */
export function cleanName(v) {
  if (typeof v !== 'string') return v;
  const out = v.replace(/(^|[\s.])(?:null|undefined|none|nil)(?=[\s.,']|$)/gi, '$1').replace(/\s{2,}/g, ' ').replace(/\s+([,'])/g, '$1').trim();
  return out || null;
}
const NAME_KEYS = new Set(['name', 'player', 'short', 'other', 'displayName', 'shortName', 'fullName', 'firstName', 'lastName', 'label', 'who', 'shooter', 'replaces']);
/** Nettoie en place tous les champs de noms d'un objet (données live, fiches matchs, effectifs). */
export function cleanNamesDeep(o, depth = 0) {
  if (!o || typeof o !== 'object' || depth > 12) return o;
  if (Array.isArray(o)) { for (const x of o) cleanNamesDeep(x, depth + 1); return o; }
  for (const k of Object.keys(o)) {
    const v = o[k];
    if (typeof v === 'string') { if (NAME_KEYS.has(k) && /\b(?:null|undefined|none|nil)\b/i.test(v)) o[k] = cleanName(v); }
    else if (v && typeof v === 'object') cleanNamesDeep(v, depth + 1);
  }
  return o;
}
/** Tirs au but : { h, a } d'après shootoutScore (null s'il n'y en a pas eu). */
export function shootout(m) {
  const h = m?.home?.so ?? m?.home?.shootoutScore, a = m?.away?.so ?? m?.away?.shootoutScore;
  if (h == null || a == null || h === '' || a === '') return null;
  const n = x => String(x).replace(/\.0+$/, '');
  return { h: n(h), a: n(a) };
}
/** « 7-6 t.a.b. » ou ''. */
export function shootoutLabel(m) { const s = shootout(m); return s ? `${s.h}-${s.a} t.a.b.` : ''; }
/** Score texte : « 2-2 (7-6 t.a.b.) » ou « 2-0 ». */
export function scoreText(m, sep = '-') {
  if (!m || m.state === 'pre') return '';
  const so = shootoutLabel(m);
  return `${m.home?.score ?? ''}${sep}${m.away?.score ?? ''}${so ? ` (${so})` : ''}`;
}
/** Équipe qualifiée aux tirs au but : 'h', 'a' ou null. */
export function shootoutWinner(m) {
  const s = shootout(m); if (!s) return null;
  if (m.home?.winner === true) return 'h'; if (m.away?.winner === true) return 'a';
  return +s.h > +s.a ? 'h' : +s.a > +s.h ? 'a' : null;
}

/** Suffixe visible d'un but : CSC ou penalty. Jamais de nom de source. */
export function goalTag(kind) {
  return kind === 'og' ? ' (csc)' : kind === 'pen' ? ' (sp)' : '';
}
/** Libellé « Nom (csc) 12' ». */
export function scorerLabel(ev, { short = false } = {}) {
  const name = String((short && ev.short) || ev.player || '').trim();
  const tag = goalTag(ev.kind);
  const min = ev.min || '';
  // Nom inconnu (flux incomplet) : libellé explicite plutôt qu'un « (csc) » orphelin.
  const anon = ev.kind === 'og' ? 'But contre son camp' : ev.kind === 'pen' ? 'Penalty' : 'But';
  return [name ? `${name}${tag}` : anon, min].filter(Boolean).join(' ');
}
/** Buteur et équipe du joueur d'après le texte d'un temps fort (« Own Goal by X, Équipe. », « Goal! … X (Équipe) … »). */
export function scorerFromText(text) {
  const t = String(text || '').trim();
  let m;
  if ((m = t.match(/^Own Goal by (.+?), (.+?)\./))) return { player: m[1].trim(), team: m[2].trim(), og: true };
  if ((m = t.match(/^Goal!\s+.+?\.\s+(.+?) \((.+?)\)/))) return { player: m[1].trim(), team: m[2].trim(), og: false };
  if ((m = t.match(/^Penalty (?:scored|converted)[^.]*?by (.+?) \((.+?)\)/i))) return { player: m[1].trim(), team: m[2].trim(), og: false };
  return null;
}
export function scoringEvents(list) {
  return (list || []).filter(e => e && (e.kind === 'goal' || e.kind === 'pen' || e.kind === 'og'));
}
/** Buteurs domicile / extérieur (résultats, bandeau de match). */
export function scorersLineHtml(scorers, { short = true, className = 'match-scorers' } = {}) {
  const list = scoringEvents(scorers);
  if (!list.length) return '';
  const side = s => list.filter(e => e.s === s).map(e => esc(scorerLabel(e, { short }))).join(', ');
  return `<div class="${esc(className)}"><span class="ms-h">${side('h')}</span><span class="ms-mid"></span><span class="ms-a">${side('a')}</span></div>`;
}
export function scorersInline(scorers, { short = true } = {}) {
  return scoringEvents(scorers).map(e => scorerLabel(e, { short })).join(', ');
}


// ---------------------------------------------------------------- xG estimé
// Probabilité moyenne qu'un tir finisse au fond selon sa position (ordres de grandeur publics des modèles xG),
// corrigée pour les têtes, les contres et les coups francs directs. Penalty : 0,76.
const LOCS = [
  [/from very close range/, 'à bout portant', 0.40],
  [/from the centre of the six yard box/, 'dans les six mètres', 0.33],
  [/from the (left|right) side of the six yard box/, s => `côté ${s[1] === 'left' ? 'gauche' : 'droit'} des six mètres`, 0.17],
  [/from the centre of the box/, "dans l'axe de la surface", 0.12],
  [/from the (left|right) side of the box/, s => `côté ${s[1] === 'left' ? 'gauche' : 'droit'} de la surface`, 0.06],
  [/from a difficult angle and long range on the (left|right)/, s => `de loin, dans un angle fermé à ${s[1] === 'left' ? 'gauche' : 'droite'}`, 0.012],
  [/from a difficult angle on the (left|right)/, s => `dans un angle fermé à ${s[1] === 'left' ? 'gauche' : 'droite'}`, 0.035],
  [/from long range on the (left|right)/, s => `de loin, côté ${s[1] === 'left' ? 'gauche' : 'droit'}`, 0.02],
  [/from more than (\d+) yards/, s => `de plus de ${Math.round(+s[1] * 0.9144)} mètres`, 0.01],
  [/from outside the box/, "de l'extérieur de la surface", 0.035],
  [/from the (left|right) wing/, s => `depuis l'aile ${s[1] === 'left' ? 'gauche' : 'droite'}`, 0.02],
];
export function shotXg(text) {
  if (/converts the penalty|Penalty saved|Penalty missed/.test(text)) return 0.76;
  if (/from a direct free kick/.test(text)) return 0.06;
  let xg = 0.05;
  for (const [re, , v] of LOCS) if (re.test(text)) { xg = v; break; }
  if (/\bheader\b/.test(text)) xg *= /very close range|six yard/.test(text) ? 0.8 : 0.6;
  if (/fast break/.test(text)) xg *= 1.3;
  return Math.min(0.95, +xg.toFixed(3));
}

// ---------------------------------------------------------------- traduction des commentaires
const SHOT = { 'right footed shot': 'frappe du pied droit', 'left footed shot': 'frappe du pied gauche', header: 'tête', 'with an attempt': 'tentative', shot: 'frappe' };
const SPOT = {
  'bottom left corner': 'en bas à gauche', 'bottom right corner': 'en bas à droite', 'top left corner': 'en lucarne gauche', 'top right corner': 'en lucarne droite',
  'centre of the goal': 'au centre du but', 'top centre of the goal': 'en haut, au centre', 'high centre of the goal': 'en haut, au centre', 'bottom centre of the goal': 'en bas, au centre',
  'left side of the goal': 'à gauche', 'right side of the goal': 'à droite',
};
const spot = s => SPOT[s] || s;
const loc = t => { for (const [re, fr] of LOCS) { const m = t.match(re); if (m) return typeof fr === 'function' ? fr(m) : fr; } return ''; };
const shotType = t => { for (const k of Object.keys(SHOT)) if (t.includes(k)) return SHOT[k]; return 'frappe'; };
const MISS = [
  [/is close, but misses to the (left|right)/, m => `tout près, à ${m[1] === 'left' ? 'gauche' : 'droite'}`],
  [/is close, but misses the top (left|right) corner/, m => `frôle la lucarne ${m[1] === 'left' ? 'gauche' : 'droite'}`],
  [/is close, but misses the top centre/, () => 'juste au-dessus'],
  [/is close, but misses/, () => 'tout près'],
  [/is high and wide to the (left|right)/, m => `au-dessus, à ${m[1] === 'left' ? 'gauche' : 'droite'}`],
  [/is just a bit too high/, () => 'juste au-dessus'],
  [/is too high/, () => 'au-dessus'],
  [/misses to the (left|right)/, m => `à côté, à ${m[1] === 'left' ? 'gauche' : 'droite'}`],
];
const SUFFIX = [
  [/ with a cross/, 'sur un centre'], [/ with a through ball/, 'sur une passe en profondeur'], [/ with a headed pass/, 'sur une remise de la tête'],
  [/ following a corner/, 'après un corner'], [/ following a fast break/, 'en contre-attaque'], [/ following a set piece situation/, 'sur coup de pied arrêté'],
  [/ from a direct free kick/, 'sur coup franc direct'], [/ following a fast break/, 'en contre-attaque'],
];
function assistPart(t, goal) {
  const m = t.match(/Assisted by (.+?)(?= with a | following a |\.(?:\s|$|[A-Z])|$)/);
  const extras = SUFFIX.filter(([re]) => re.test(t)).map(([, fr]) => fr);
  if (/Goal (?:confirmed|awarded) following VAR Review/i.test(t)) extras.push('validé par la VAR');
  const uniq = [...new Set(extras)];
  // sans passeur : la précision se place avant le point final
  if (!m) return uniq.length ? `\u0001 (${uniq.join(', ')})` : '';
  return ` ${goal ? 'Passe décisive' : 'Servi par'} : ${m[1]}${uniq.length ? ` (${uniq.join(', ')})` : ''}.`;
}
const fixDot = s => s.replace(/\.\u0001( \([^)]*\))/, '$1.');
const score = (s, tn) => { const m = s.match(/^(.+?) (\d+), (.+?) (\d+)(?: \((.+?)\))?\.?$/); return m ? `${tn(m[1])} ${m[2]}-${m[4]} ${tn(m[3])}` : s; };
const half = { 'First Half': 'Première période', 'Second Half': 'Seconde période', 'First Half Extra Time': 'Première prolongation', 'Second Half Extra Time': 'Seconde prolongation', 'Penalty Shootout': 'Séance de tirs au but' };
const cardWhy = { 'for a bad foul': 'pour une faute', 'for hand ball': 'pour une main', 'for dangerous play': 'pour jeu dangereux', 'for time wasting': 'pour anti-jeu', 'for unsporting behaviour': 'pour comportement antisportif', 'for violent conduct': 'pour conduite violente', 'for simulation': 'pour simulation', 'for dissent': 'pour contestation', 'for a professional foul': "pour faute d'antijeu", 'for excessive celebration': 'pour célébration excessive' };

/** Traduit une ligne de commentaire Opta/ESPN. Renvoie { fr, kind, xg, shooter, en } (en = non traduite). */
export function frComm(t, tn = x => x) {
  t = String(t || '').trim();
  const P = (name, team) => `${name} (${tn(team)})`;
  let m;
  const R = (fr, kind, extra = {}) => ({ fr, kind, ...extra });
  if (/^Lineups are announced/.test(t)) return R("Les compositions sont annoncées, les joueurs s'échauffent.", 'info');
  if ((m = t.match(/^(First Half|Second Half|First Half Extra Time|Second Half Extra Time|Penalty Shootout) begins\.?\s*(.*)$/))) return R(`Début de la ${(half[m[1]] || m[1]).toLowerCase()}${m[2] ? ` (${score(m[2].replace(/\.$/, ''), tn)})` : ''}.`, 'period');
  if ((m = t.match(/^(First Half|Second Half|First Half Extra Time|Second Half Extra Time|Match|Penalty Shootout) ends,\s*(.+)$/))) return R(`${m[1] === 'Match' ? 'Fin du match' : m[1] === 'First Half' ? 'Mi-temps' : `Fin de la ${(half[m[1]] || m[1]).toLowerCase()}`} : ${score(m[2].replace(/\.$/, ''), tn)}.`, 'period');
  if ((m = t.match(/^Goal!\s+(.+?)\.\s+(.+?) \((.+?)\) converts the penalty with a (.+?) to the (.+?)\.$/))) return R(`BUT ! ${score(m[1], tn)}. ${P(m[2], m[3])} transforme le penalty (${shotType(m[4])}, ${spot(m[5])}).`, 'goal', { xg: 0.76, shooter: m[2], team: m[3] });
  if ((m = t.match(/^Goal!\s+(.+?)\.\s+(.+?) \((.+?)\) (right footed shot|left footed shot|header|shot)(.*?) to the ((?:bottom |top |high )?(?:left |right |centre )?(?:corner|of the goal|centre of the goal|side of the goal))(.*)$/))) return R(fixDot(`BUT ! ${score(m[1], tn)}. ${P(m[2], m[3])}, ${shotType(m[4])} ${loc(m[5])}, ${spot(m[6].replace(/^centre of the goal$/, 'centre of the goal'))}.${assistPart(m[7] || '', true)}`).replace(/ ,/g, ','), 'goal', { xg: shotXg(t), shooter: m[2], team: m[3] });
  if ((m = t.match(/^Goal!\s+(.+?)\.\s+(.+?) \((.+?)\)\s*(.*)$/))) return R(`BUT ! ${score(m[1], tn)}. ${P(m[2], m[3])}.`, 'goal', { xg: shotXg(t), shooter: m[2], team: m[3] });
  if ((m = t.match(/^Own Goal by (.+?), (.+?)\.\s+(.+?)\.?$/))) return R(`But contre son camp de ${P(m[1], m[2])}. ${score(m[3], tn)}.`, 'og', { team: m[2] });
  if ((m = t.match(/^Attempt (saved|missed|blocked)\.\s+(.+?) \((.+?)\) (right footed shot|left footed shot|header|shot|with an attempt) (.+)$/))) {
    const [, out, name, team, st, rest] = m;
    let outcome = '';
    if (out === 'saved') { const s = rest.match(/(?:is )?saved in the (.+?) by (.+?) \((.+?)\)/) || rest.match(/(?:is )?saved in the (.+?)(?:\.|$)/); outcome = s ? `arrêtée${s[2] ? ` par ${s[2]}` : ''} (${spot(s[1])})` : 'arrêtée'; }
    else if (out === 'blocked') outcome = 'contrée';
    else { for (const [re, f] of MISS) { const x = rest.match(re); if (x) { outcome = f(x); break; } } if (!outcome) outcome = 'non cadrée'; }
    const head = { saved: 'Tir arrêté', missed: 'Tir manqué', blocked: 'Tir contré' }[out];
    return R(fixDot(`${head}. ${P(name, team)}, ${shotType(st)} ${loc(rest)} : ${outcome}.${assistPart(rest, false)}`).replace(/ {2,}/g, ' ').replace(/ :/, ' :'), `shot-${out}`, { xg: shotXg(t), shooter: name, team });
  }
  if ((m = t.match(/^(?:Attempt missed\.\s+)?(.+?) \((.+?)\) hits the (bar|crossbar|left post|right post|post) with a (.+?) from (.+?)\.(.*)$/))) {
    const where = { bar: 'la barre', crossbar: 'la barre', 'left post': 'le poteau gauche', 'right post': 'le poteau droit', post: 'le poteau' }[m[3]];
    return R(fixDot(`Sur ${where} ! ${P(m[1], m[2])}, ${shotType(m[4])} ${loc('from ' + m[5])}.${assistPart(m[6] || '', false)}`), 'post', { xg: shotXg(t), shooter: m[1], team: m[2] });
  }
  if ((m = t.match(/^Penalty saved\.\s+(.+?) \((.+?)\) .*?saved in the (.+?) by .+$/))) return R(`Penalty arrêté ! ${P(m[1], m[2])} échoue (${spot(m[3])}).`, 'pen-miss', { xg: 0.76, shooter: m[1], team: m[2] });
  if ((m = t.match(/^Penalty saved!\s+(.+?) \((.+?)\) fails to capitalise.*?(?:saves in the (.+?))?\.$/))) return R(`Penalty arrêté ! ${P(m[1], m[2])} échoue${m[3] ? ` (${spot(m[3])})` : ''}.`, 'pen-miss', { xg: 0.76, shooter: m[1], team: m[2] });
  if ((m = t.match(/^Penalty missed\.\s+(.+?) \((.+?)\) .*?shot (.+?)\.?$/))) { const r = m[3]; const where = /too high/.test(r) ? (/just a bit|close/.test(r) ? 'juste au-dessus' : 'au-dessus') : /left/.test(r) ? (/close|just/.test(r) ? 'juste à côté, à gauche' : 'à gauche') : /right/.test(r) ? (/close|just/.test(r) ? 'juste à côté, à droite' : 'à droite') : /post|bar/.test(r) ? 'sur le montant' : 'à côté'; return R(`Penalty manqué ! ${P(m[1], m[2])} ne cadre pas (${where}).`, 'pen-miss', { xg: 0.76, shooter: m[1], team: m[2] }); }
  if ((m = t.match(/^Penalty missed!\s+(.+?) \((.+?)\) (?:hits|fails|misses).*$/))) return R(`Penalty manqué ! ${P(m[1], m[2])} ne cadre pas.`, 'pen-miss', { xg: 0.76, shooter: m[1], team: m[2] });
  if ((m = t.match(/^Penalty (.+?)\.\s+(.+?) draws a foul in the penalty area\.$/))) return R(`Penalty pour ${tn(m[1])} ! ${m[2]} obtient une faute dans la surface.`, 'pen');
  if ((m = t.match(/^Penalty conceded by (.+?) \((.+?)\) (after a foul|with a handball) in the penalty area\.$/))) return R(`Penalty concédé par ${P(m[1], m[2])}, ${m[3] === 'after a foul' ? 'pour une faute' : 'pour une main'} dans la surface.`, 'pen');
  if ((m = t.match(/^Foul by (.+?) \((.+?)\)\.$/))) return R(`Faute de ${P(m[1], m[2])}.`, 'foul');
  if ((m = t.match(/^(.+?) \((.+?)\) wins a free kick (in the defensive half|in the attacking half|on the left wing|on the right wing)\.$/))) return R(`${P(m[1], m[2])} obtient un coup franc ${{ 'in the defensive half': 'dans son camp', 'in the attacking half': 'dans le camp adverse', 'on the left wing': "sur l'aile gauche", 'on the right wing': "sur l'aile droite" }[m[3]]}.`, 'fk');
  if ((m = t.match(/^Corner,\s+(.+?)\.\s+Conceded by (.+?)\.$/))) return R(`Corner pour ${tn(m[1])}, concédé par ${m[2]}.`, 'corner');
  if ((m = t.match(/^Offside,\s+(.+?)\.\s+(.+?) tries a through ball, but (.+?) is caught offside\.$/))) return R(`Hors-jeu de ${m[3]} (${tn(m[1])}), sur une passe de ${m[2]}.`, 'offside');
  if ((m = t.match(/^Offside,\s+(.+?)\.\s+(.+?) is caught offside\.$/))) return R(`Hors-jeu de ${m[2]} (${tn(m[1])}).`, 'offside');
  if ((m = t.match(/^Substitution,\s+(.+?)\.\s+(.+?) replaces (.+?)( because of an injury)?\.$/))) return R(`Changement pour ${tn(m[1])} : ${m[2]} remplace ${m[3]}${m[4] ? ' (blessure)' : ''}.`, 'sub');
  if ((m = t.match(/^(.+?) \((.+?)\) is shown the (yellow|red|second yellow) card\s*(.*?)\.$/))) return R(`${m[3] === 'yellow' ? 'Carton jaune' : m[3] === 'red' ? 'Carton rouge' : 'Second carton jaune'} pour ${P(m[1], m[2])}${m[4] ? ` ${cardWhy[m[4]] || ''}`.trimEnd() : ''}.`, m[3] === 'yellow' ? 'yellow' : 'red');
  if ((m = t.match(/^(?:First |Second )?(yellow|red) card to (.+?) \((.+?)\)\s*(.*?)\.$/i))) return R(`Carton ${m[1].toLowerCase() === 'yellow' ? 'jaune' : 'rouge'} pour ${P(m[2], m[3])}${m[4] ? ` ${cardWhy[m[4]] || ''}`.trimEnd() : ''}.`, m[1].toLowerCase() === 'yellow' ? 'yellow' : 'red');
  if ((m = t.match(/^Fourth official has announced (\d+) minutes? of added time\.$/))) return R(`Le quatrième arbitre annonce ${m[1]} minute${+m[1] > 1 ? 's' : ''} de temps additionnel.`, 'added');
  if (/^Delay over\./.test(t)) return R('Reprise du jeu.', 'info');
  if ((m = t.match(/^Delay in match because of an injury (.+?) \((.+?)\)\.$/))) return R(`Arrêt de jeu : ${P(m[1], m[2])} est touché.`, 'injury');
  if ((m = t.match(/^Delay in match\s*(?:\((.+?)\))?\.?$/))) return R(`Arrêt de jeu${m[1] ? ` (${tn(m[1])})` : ''}.`, 'info');
  if ((m = t.match(/^Hand ?ball by (.+?) \((.+?)\)\.$/i))) return R(`Main de ${P(m[1], m[2])}.`, 'foul');
  if ((m = t.match(/^Dangerous play by (.+?) \((.+?)\)\.$/))) return R(`Jeu dangereux de ${P(m[1], m[2])}.`, 'foul');
  if ((m = t.match(/^(?:GOAL OVERTURNED BY VAR|VAR Decision)[^:]*:\s*(.+?) \((.+?)\) scores but the goal is ruled out after a VAR review\.?$/i))) return R(`But annulé par la VAR : ${P(m[1], m[2])} avait marqué.`, 'var');
  if ((m = t.match(/^VAR Decision:\s*(.+)$/))) {
    const d = m[1].replace(/^No Goal/, 'but refusé').replace(/^Goal/, 'but accordé').replace(/^No Penalty/, 'pas de penalty').replace(/^Penalty/, 'penalty accordé').replace(/^Red Card/, 'carton rouge').replace(/^No Red Card/, 'pas de carton rouge').replace(/^Card upgrade/, 'carton aggravé');
    return R(`Décision VAR : ${d}`, 'var');
  }
  if ((m = t.match(/^(.+?) went off injured after (.+?) had used all subs\.$/))) return R(`${m[1]} sort blessé, ${tn(m[2])} ayant déjà effectué tous ses changements.`, 'injury');
  if (/^Match delayed|^Match stopped/.test(t)) return R('Match interrompu.', 'info');
  // Lignes Opta/ESPN plus rares (ajoutées après relevé des lignes restées en anglais dans data/matches).
  if ((m = t.match(/^(.+?) \((.+?)\) has gone down, but the referee deems it simulation\.?$/))) return R(`${P(m[1], m[2])} est tombé, mais l'arbitre juge qu'il a simulé.`, 'foul');
  if ((m = t.match(/^Delay in match\s*(?:\((.+?)\))?\.\s*VAR checking\.?$/))) return R(`Arrêt de jeu${m[1] ? ` (${tn(m[1])})` : ''} : vérification VAR en cours.`, 'var');
  if ((m = t.match(/^\((.+?)\) wins a free kick (in the defensive half|in the attacking half|on the left wing|on the right wing)\.$/))) return R(`${tn(m[1])} obtient un coup franc ${{ 'in the defensive half': 'dans son camp', 'in the attacking half': 'dans le camp adverse', 'on the left wing': "sur l'aile gauche", 'on the right wing': "sur l'aile droite" }[m[2]]}.`, 'fk');
  if ((m = t.match(/^Back pass by (.+?) \((.+?)\)\.$/))) return R(`Passe en retrait de ${P(m[1], m[2])}.`, 'foul');
  if ((m = t.match(/^(.+?) \((.+?)\) Goal at (\d+'(?:\s*\+\s*\d+')?)\.?$/))) return R(`But de ${P(m[1], m[2])} (${m[3]}).`, 'info');
  // Ligne réduite à « Joueur (Équipe). » (texte ESPN tronqué) : aucune information, on ne l'affiche pas.
  if (/^[^()]{2,60} \([^()]{2,50}\)\.$/.test(t)) return R('', 'info', { empty: true });
  return R(t, 'info', { en: true });
}

// Infobulle d'une ligne sur l'étiquette « xG estimé » : title (souris) + bouton ⓘ (toucher/clavier, géré dans match.js).
export const XG_TIP = 'Calculé par ActuSport à partir des actions du match (tirs, penalties) décrites dans le commentaire.';
const XG_I = `<button type="button" class="xg-i" title="${XG_TIP}" aria-label="Qu'est-ce que le xG estimé ? ${XG_TIP}" aria-expanded="false" data-tip="${XG_TIP}">ⓘ</button>`;

/** Couleurs lisibles pour une paire d'équipes (pas de blanc/noir, assez distinctes). */
export function fixColors(h, a) {
  const lum = c => { const m = /^#?([0-9a-f]{6})$/i.exec(c || ''); if (!m) return null; const n = parseInt(m[1], 16); return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255; };
  const ok = c => { const l = lum(c); return l != null && l < 0.85 && l > 0.08; };
  const rgb = c => { const n = parseInt(String(c).slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; };
  const dist = (x, y) => Math.hypot(...rgb(x).map((v, i) => v - rgb(y)[i]));
  h = ok(h) ? h : '#1f6feb'; a = ok(a) ? a : '#d92d20';
  if (dist(h, a) < 90) a = dist(h, '#d92d20') < 90 ? '#1f6feb' : '#d92d20';
  return { h, a };
}
// ---------------------------------------------------------------- normalisation
const STAT_KEYS = [
  ['possessionPct', 'Possession', 'pct'], ['totalShots', 'Tirs'], ['shotsOnTarget', 'Tirs cadrés'], ['xg', 'xG estimé', 'xg'], ['wonCorners', 'Corners'],
  ['saves', 'Arrêts'], ['totalPasses', 'Passes'], ['passPct', 'Passes réussies', 'pct'], ['totalCrosses', 'Centres'], ['totalTackles', 'Tacles'],
  ['interceptions', 'Interceptions'], ['totalClearance', 'Dégagements'], ['blockedShots', 'Tirs contrés'], ['foulsCommitted', 'Fautes'],
  ['offsides', 'Hors-jeu'], ['yellowCards', 'Cartons jaunes'], ['redCards', 'Cartons rouges'],
];
function kindOfKey(t, k = {}) {
  const typ = String(t || '').toLowerCase();
  const text = String(k.type?.text || '').toLowerCase();
  if (k.ownGoal || typ.startsWith('own-goal') || typ === 'owngoal' || typ === 'own_goal' || text === 'own goal') return 'og';
  if (k.penaltyKick || typ.startsWith('penalty---scored') || typ === 'penalty-scored' || typ === 'penalty_scored' || (k.scoringPlay && /penalty/.test(`${typ} ${text}`))) return 'pen';
  if (typ.startsWith('goal') || k.scoringPlay) return 'goal';
  if (typ === 'yellow-card') return 'yellow';
  if (typ === 'red-card' || typ === 'yellow-red-card' || typ === 'second-yellow-card') return 'red';
  if (typ === 'substitution') return 'sub';
  return null;
}
const minVal = s => { const m = String(s || '').match(/(\d+)(?:'\s*\+\s*(\d+))?/); return m ? +m[1] + (m[2] ? +m[2] / 100 : 0) : 0; };

/** Normalise le JSON /summary d'ESPN. tn : traduction des noms d'équipes. */
export function normalizeSummary(j, { tn = x => x } = {}) {
  const comp0 = j.header?.competitions?.[0] || {};
  const cs = comp0.competitors || [];
  const H = cs.find(c => c.homeAway === 'home') || cs[0] || {}, A = cs.find(c => c.homeAway === 'away') || cs[1] || {};
  const home = id(H.team?.id || H.id), away = id(A.team?.id || A.id);
  const side = (teamId, name) => {
    if (teamId != null) return id(teamId) === away ? 'a' : id(teamId) === home ? 'h' : null;
    if (!name) return null;
    if (name === A.team?.displayName || name === A.team?.name || name === A.team?.shortDisplayName) return 'a';
    if (name === H.team?.displayName || name === H.team?.name || name === H.team?.shortDisplayName) return 'h';
    return null;
  };
  const st = comp0.status || j.header?.status || {};
  const status = { state: st.type?.state || null, detail: st.type?.shortDetail || st.type?.detail || null, clock: st.displayClock || null, period: st.period || null, completed: !!st.type?.completed };
  const teams = {
    h: { id: home, name: H.team?.displayName || null, color: H.team?.color ? `#${H.team.color}` : null, alt: H.team?.alternateColor ? `#${H.team.alternateColor}` : null, score: H.score ?? null, so: H.shootoutScore ?? null, winner: H.winner ?? null, logo: H.team?.logos?.[0]?.href || H.team?.logo || null },
    a: { id: away, name: A.team?.displayName || null, color: A.team?.color ? `#${A.team.color}` : null, alt: A.team?.alternateColor ? `#${A.team.alternateColor}` : null, score: A.score ?? null, so: A.shootoutScore ?? null, winner: A.winner ?? null, logo: A.team?.logos?.[0]?.href || A.team?.logo || null },
  };
  // Couleurs lisibles : pas de blanc, et deux couleurs bien distinctes.
  const lum = c => { const m = /^#?([0-9a-f]{6})$/i.exec(c || ''); if (!m) return null; const n = parseInt(m[1], 16); return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255; };
  const rgb = c => { const n = parseInt(String(c).slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; };
  const dist = (a, b) => (a && b ? Math.hypot(...rgb(a).map((v, i) => v - rgb(b)[i])) : 999);
  const okc = (c, alt, fb) => (c && lum(c) < 0.85 && lum(c) > 0.08 ? c : alt && lum(alt) < 0.85 && lum(alt) > 0.08 ? alt : fb);
  teams.h.color = okc(teams.h.color, teams.h.alt, '#1f6feb');
  teams.a.color = okc(teams.a.color, teams.a.alt, '#d92d20');
  if (dist(teams.h.color, teams.a.color) < 90) teams.a.color = teams.a.alt && dist(teams.h.color, `${teams.a.alt}`) >= 90 && lum(teams.a.alt) < 0.85 && lum(teams.a.alt) > 0.08 ? teams.a.alt : (dist(teams.h.color, '#d92d20') < 90 ? '#1f6feb' : '#d92d20');
  // Temps forts
  const events = (j.keyEvents || []).map(k => {
    const kind = kindOfKey(k.type?.type || '', k);
    if (!kind || k.shootout) return null;
    const ps = k.participants || [];
    const ev = { min: k.clock?.displayValue || '', kind, team: id(k.team?.id), s: side(k.team?.id), player: cleanName(ps[0]?.athlete?.displayName) || null, other: cleanName(ps[1]?.athlete?.displayName) || null, pid: id(ps[0]?.athlete?.id), oid: id(ps[1]?.athlete?.id) };
    if (kind === 'goal' || kind === 'pen' || kind === 'og') {
      const tx = scorerFromText(k.text);
      if (!ev.player && tx?.player) ev.player = tx.player;
      // CSC : toujours crédité à l'équipe qui en profite (l'adversaire de l'équipe du buteur).
      if (kind === 'og' && tx?.team) {
        const sc = side(null, tx.team);
        if (sc) { const ben = sc === 'h' ? 'a' : 'h'; ev.s = ben; ev.team = ben === 'h' ? home : away; }
      }
      if (!ev.s) ev.s = ev.team === away ? 'a' : 'h';
    }
    return ev;
  }).filter(Boolean);
  // Commentaires (traduits) et xG estimé
  const comm = [], shots = [];
  for (const c of j.commentary || []) {
    const tr = frComm(c.text, tn);
    if (tr.empty) continue;
    const teamName = c.play?.team?.displayName || tr.team || null;
    const s = side(null, teamName) || (tr.team ? side(null, tr.team) : null);
    const min = c.time?.displayValue || c.play?.clock?.displayValue || '';
    comm.push({ m: min, k: tr.kind, s, t: String(tr.fr).replace(/ (?:Null|NULL|null|undefined|None)(?= \(|[,.;:)]| -)/g, ''), ...(tr.en ? { en: 1 } : {}), ...(tr.xg != null ? { xg: tr.xg } : {}) });
    if (tr.xg != null && s) shots.push({ m: min, v: minVal(min), s, xg: tr.xg, goal: tr.kind === 'goal', who: tr.shooter || null });
  }
  comm.reverse(); // le plus récent d'abord
  const xg = shots.length ? { h: +shots.filter(x => x.s === 'h').reduce((a, x) => a + x.xg, 0).toFixed(2), a: +shots.filter(x => x.s === 'a').reduce((a, x) => a + x.xg, 0).toFixed(2), shots: shots.sort((a, b) => a.v - b.v) } : null;
  // Statistiques
  const bt = j.boxscore?.teams || [];
  const statOf = s => { const t = bt.find(x => id(x.team?.id) === (s === 'h' ? home : away)) || bt[s === 'h' ? 0 : 1]; const o = {}; for (const x of t?.statistics || []) o[x.name] = x.displayValue; return o; };
  const sh = statOf('h'), sa = statOf('a');
  const stats = [];
  for (const [k, label, type] of STAT_KEYS) {
    let h, a;
    if (k === 'xg') { if (!xg) continue; h = xg.h; a = xg.a; }
    else if (k === 'passPct') { const f = o => (+o.totalPasses ? Math.round(100 * +o.accuratePasses / +o.totalPasses) : null); h = f(sh); a = f(sa); }
    else { h = sh[k] != null ? +sh[k] : null; a = sa[k] != null ? +sa[k] : null; }
    if (h == null || a == null || Number.isNaN(h) || Number.isNaN(a)) continue;
    if (k === 'possessionPct') { h = Math.round(h); a = Math.round(a); }
    stats.push({ k, l: label, h, a, ...(type ? { t: type } : {}) });
  }
  // Compositions
  const lineups = (j.rosters || []).map(r => {
    const s = side(r.team?.id) || (r.homeAway === 'away' ? 'a' : 'h');
    const pstat = x => { const o = {}; for (const z of x.stats || []) o[z.name] = z.value; return o; };
    const mk = x => { const ps = pstat(x); return { n: x.jersey || '', name: cleanName(x.athlete?.displayName), short: cleanName(x.athlete?.lastName || x.athlete?.shortName || x.athlete?.displayName), id: id(x.athlete?.id), pos: x.position?.abbreviation || '', posName: x.position?.name || null, place: x.formationPlace ? +x.formationPlace : null, out: !!x.subbedOut, in: !!x.subbedIn, g: ps.totalGoals || 0, a: ps.goalAssists || 0, yc: ps.yellowCards || 0, rc: ps.redCards || 0, og: ps.ownGoals || 0, for: id(x.subbedInFor?.athlete?.id) }; };
    const roster = r.roster || [];
    return { team: id(r.team?.id), s, homeAway: r.homeAway, formation: r.formation || null, starters: roster.filter(x => x.starter).map(mk), subs: roster.filter(x => !x.starter).map(mk) };
  }).filter(l => l.starters.length);
  // Face-à-face (5 dernières confrontations)
  const series = (j.seasonseries || []).find(x => x.type === 'head-to-head') || null;
  const h2h = series ? (series.events || []).map(e => {
    const c = e.competitors || [];
    const eh = c.find(x => x.homeAway === 'home') || c[0], ea = c.find(x => x.homeAway === 'away') || c[1];
    if (!eh || !ea) return null;
    return { id: id(e.id), date: e.date, h: { id: id(eh.team?.id), name: eh.team?.displayName, score: eh.score ?? null }, a: { id: id(ea.team?.id), name: ea.team?.displayName, score: ea.score ?? null }, state: e.statusType?.state || e.status || null };
  }).filter(e => e && e.id !== id(comp0.id) && e.h.score != null && e.state !== 'pre') : [];
  return {
    v: MC_V, status, teams, events, stats, xg, comm, lineups, h2h,
    attendance: j.gameInfo?.attendance || null, venue: j.gameInfo?.venue?.fullName || null,
  };
}

// ---------------------------------------------------------------- placement sur le terrain
const DEPTH = { G: 0, GK: 0, SW: 1.5, CD: 1.05, 'CD-L': 1.05, 'CD-R': 1.05, LB: 1, RB: 1, LWB: 1.7, RWB: 1.7, DM: 2, 'DM-L': 2, 'DM-R': 2, CM: 2.5, 'CM-L': 2.5, 'CM-R': 2.5, LM: 2.7, RM: 2.7, AM: 3.3, 'AM-L': 3.3, 'AM-R': 3.3, LW: 3.5, RW: 3.5, SS: 3.6, LF: 3.8, RF: 3.8, F: 4, CF: 4, 'CF-L': 4, 'CF-R': 4, ST: 4 };
const lateral = p => { const a = p.pos || ''; if (/-L$/.test(a)) return -1; if (/-R$/.test(a)) return 1; if (/^L/.test(a)) return -2; if (/^R/.test(a)) return 2; return 0; };
/** Lignes (de l'arrière vers l'avant), chaque ligne de gauche à droite (du point de vue de l'équipe). */
export function pitchLines(l) {
  const gk = l.starters.filter(p => (DEPTH[p.pos] ?? 2.5) === 0 || p.place === 1).slice(0, 1);
  const out = l.starters.filter(p => !gk.includes(p));
  const sorted = out.map((p, i) => ({ p, d: DEPTH[p.pos] ?? 2.5, i })).sort((a, b) => a.d - b.d || a.i - b.i).map(x => x.p);
  let sizes = String(l.formation || '').split('-').map(Number).filter(n => n > 0);
  if (sizes.reduce((a, b) => a + b, 0) !== sorted.length) {
    // Sans formation exploitable : regroupement par profondeur
    const bins = [];
    for (const p of sorted) { const d = DEPTH[p.pos] ?? 2.5; const b = d < 1.5 ? 0 : d < 2.3 ? 1 : d < 3 ? 2 : d < 3.7 ? 3 : 4; (bins[b] = bins[b] || []).push(p); }
    sizes = bins.filter(Boolean).map(x => x.length);
  }
  const lines = [gk]; let k = 0;
  for (const n of sizes) { lines.push(sorted.slice(k, k + n).sort((a, b) => lateral(a) - lateral(b) || (a.place ?? 0) - (b.place ?? 0))); k += n; }
  return lines.filter(x => x.length);
}

// ---------------------------------------------------------------- rendu HTML
const EV = { goal: ['⚽', 'But'], pen: ['⚽', 'But sur penalty'], og: ['⚽', 'But contre son camp'], yellow: ['🟨', 'Carton jaune'], red: ['🟥', 'Carton rouge'], sub: ['🔁', 'Remplacement'] };
const CK = { goal: '⚽', og: '⚽', 'shot-saved': '🧤', 'shot-missed': '↗', 'shot-blocked': '🛡', post: '🥅', yellow: '🟨', red: '🟥', sub: '🔁', corner: '⛳', offside: '🚩', var: '📺', pen: '❗', 'pen-miss': '❌', period: '⏱', added: '⏱', injury: '🩹' };
const fmtNum = (v, t) => (t === 'pct' ? `${v} %` : t === 'xg' ? String(v.toFixed ? v.toFixed(2) : v).replace('.', ',') : String(v));

export function timelineHtml(d, ctx) {
  const evs = d.events || [];
  if (!evs.length) return '';
  const max = Math.max(90, ...evs.map(e => Math.floor(minVal(e.min))));
  const marks = evs.filter(e => e.kind !== 'sub' || true).map(e => {
    const v = Math.min(max, minVal(e.min)); const s = e.s || (e.team === ctx.away ? 'a' : 'h');
    return `<span class="tl-m tl-${e.kind} tl-${s}" style="left:${(100 * v / max).toFixed(1)}%" title="${esc(`${EV[e.kind]?.[1] || ''} : ${scorerLabel(e) || e.player || ''}`.trim())}">${EV[e.kind]?.[0] || '•'}</span>`;
  }).join('');
  const list = `<ol class="m-events">${evs.map(ev => {
    const s = ev.s || (ev.team === ctx.away ? 'a' : 'h');
    const [ic, label] = EV[ev.kind];
    const txt = ev.kind === 'sub' ? `${ctx.pl(ev.pid, ev.player)} <small>remplace ${ctx.pl(ev.oid, ev.other)}</small>` : `${ctx.pl(ev.pid, ev.player)}${goalTag(ev.kind)}${ev.other && ['goal', 'pen'].includes(ev.kind) ? ` <small>passe de ${ctx.pl(ev.oid, ev.other)}</small>` : ''}`;
    return `<li class="ev ev-${ev.kind} ${s === 'a' ? 'away' : 'home'}"><span class="ev-min">${esc(ev.min)}</span><span class="ev-ic" role="img" aria-label="${label}">${ic}</span><span class="ev-t">${txt}</span></li>`;
  }).join('')}</ol>`;
  return `<div class="tl" aria-hidden="true"><div class="tl-bar"><span class="tl-ht" style="left:${(100 * 45 / max).toFixed(1)}%"></span>${marks}</div><div class="tl-sc"><span>0'</span><span>45'</span><span>${max}'</span></div></div>${list}`;
}

export function statsHtml(d) {
  if (!d.stats?.length) return '';
  const C = d.teams || {};
  return `<div class="mc-stats" style="--ch:${esc(C.h?.color || '#1f6feb')};--ca:${esc(C.a?.color || '#d92d20')}">${d.stats.map(s => {
    const tot = (+s.h || 0) + (+s.a || 0); const ph = tot ? (100 * s.h / tot) : 50;
    const win = s.k === 'foulsCommitted' || s.k === 'yellowCards' || s.k === 'redCards' || s.k === 'offsides' ? (s.h < s.a ? 'h' : s.a < s.h ? 'a' : '') : (s.h > s.a ? 'h' : s.a > s.h ? 'a' : '');
    return `<div class="st-row"><div class="st-top"><b class="${win === 'h' ? 'w' : ''}">${esc(fmtNum(s.h, s.t))}</b><span>${esc(s.l)}${s.k === 'xg' ? ' ' + XG_I : ''}</span><b class="${win === 'a' ? 'w' : ''}">${esc(fmtNum(s.a, s.t))}</b></div><div class="st-bar"><i class="h" style="width:${ph.toFixed(1)}%"></i><i class="a" style="width:${(100 - ph).toFixed(1)}%"></i></div></div>`;
  }).join('')}</div>`;
}

export function xgHtml(d) {
  const x = d.xg; if (!x?.shots?.length) return '';
  const max = Math.max(90, ...x.shots.map(s => Math.ceil(s.v)));
  const top = Math.max(1, x.h, x.a) * 1.1;
  const W = 600, Hh = 160;
  const path = s => { let c = 0, pts = [[0, Hh]]; for (const sh of x.shots.filter(z => z.s === s)) { const X = W * sh.v / max; pts.push([X, Hh - Hh * c / top]); c += sh.xg; pts.push([X, Hh - Hh * c / top]); } pts.push([W, Hh - Hh * c / top]); return pts.map(p => p.map(n => n.toFixed(1)).join(',')).join(' '); };
  const goals = x.shots.filter(z => z.goal).map(z => { let c = 0; for (const sh of x.shots.filter(q => q.s === z.s)) { c += sh.xg; if (sh === z) break; } return `<circle cx="${(W * z.v / max).toFixed(1)}" cy="${(Hh - Hh * c / top).toFixed(1)}" r="5" class="xg-g xg-${z.s}"><title>${esc(`${Math.floor(z.v)}' but ${z.who || ''}`)}</title></circle>`; }).join('');
  const C = d.teams || {};
  return `<figure class="xg-fig" style="--ch:${esc(C.h?.color || '#1f6feb')};--ca:${esc(C.a?.color || '#d92d20')}"><svg viewBox="0 0 ${W} ${Hh + 2}" role="img" aria-label="xG estimé cumulé"><line x1="${W * 45 / max}" y1="0" x2="${W * 45 / max}" y2="${Hh}" class="xg-ht"/><polyline points="${path('h')}" class="xg-l xg-h"/><polyline points="${path('a')}" class="xg-l xg-a"/>${goals}</svg>
    <figcaption>xG estimé ${XG_I} cumulé : <b class="xg-th">${esc(String(x.h).replace('.', ','))}</b> – <b class="xg-ta">${esc(String(x.a).replace('.', ','))}</b>. Points : buts.</figcaption></figure>
    <details id="mc-xg" class="mc-note"><summary>Comment calcule-t-on le xG estimé ?</summary><p>Nous l'estimons à partir du commentaire officiel de chaque tir (zone de frappe, tête ou pied, contre-attaque, coup franc direct). Chaque tir reçoit la probabilité moyenne de but de sa zone : environ 0,40 à bout portant, 0,33 dans les six mètres, 0,12 dans l'axe de la surface, 0,06 sur les côtés de la surface, 0,035 de l'extérieur, 0,76 pour un penalty, avec −40 % pour une tête. C'est une approximation, moins précise que les modèles professionnels qui connaissent la position exacte du tir.</p></details>`;
}

export function pitchHtml(d, ctx) {
  const ls = d.lineups || []; if (!ls.length) return '';
  const C = d.teams || {};
  const evBy = {}; for (const e of d.events || []) if (e.kind === 'sub' && e.oid) evBy[e.oid] = e.min;
  const subIn = {}; for (const e of d.events || []) if (e.kind === 'sub' && e.pid) subIn[e.pid] = e.min;
  const marks = p => `${p.g ? `<i class="pp-g">${'⚽'.repeat(Math.min(3, p.g))}</i>` : ''}${p.og ? '<i class="pp-og" title="But contre son camp">⚽</i>' : ''}${p.rc ? '<i class="pp-c r"></i>' : p.yc ? '<i class="pp-c y"></i>' : ''}${p.out ? `<i class="pp-s" title="Remplacé${evBy[p.id] ? ` (${esc(evBy[p.id])})` : ''}">🔁</i>` : ''}`;
  const team = l => {
    const s = l.s; const lines = pitchLines(l); const n = lines.length;
    return lines.map((line, li) => line.map((p, pi) => {
      const y0 = s === 'h' ? 94 - (li * (40 / Math.max(1, n - 1))) : 6 + (li * (40 / Math.max(1, n - 1)));
      let x = (pi + 1) / (line.length + 1) * 100; if (s === 'a') x = 100 - x;
      return `<div class="pp pp-${s}" style="left:${x.toFixed(1)}%;top:${y0.toFixed(1)}%"><span class="pp-n">${esc(p.n)}</span>${marks(p)}<span class="pp-name">${ctx.pl(p.id, p.short || p.name)}</span></div>`;
    }).join('')).join('');
  };
  const H = ls.find(l => l.s === 'h'), A = ls.find(l => l.s === 'a');
  const bench = l => !l ? '' : `<div class="lu"><h3>${ctx.teamLabel(l.s)}${l.formation ? ` <small>${esc(l.formation)}</small>` : ''}</h3><h4>Remplaçants</h4><ul class="subs">${l.subs.map(p => `<li class="${p.in ? 'in' : ''}"><span class="num">${esc(p.n)}</span>${ctx.pl(p.id, p.name)}${p.in ? ` <small>entré${subIn[p.id] ? ` ${esc(subIn[p.id])}` : ' en jeu'}</small>` : ''}${p.g ? ' ⚽'.repeat(Math.min(3, p.g)) : ''}${p.rc ? ' 🟥' : p.yc ? ' 🟨' : ''}</li>`).join('')}</ul></div>`;
  return `<div class="pitch-wrap" style="--ch:${esc(C.h?.color || '#1f6feb')};--ca:${esc(C.a?.color || '#d92d20')}"><div class="pitch-lbl a">${A ? `${ctx.teamLabel('a')}${A.formation ? ` · ${esc(A.formation)}` : ''}` : ''}</div>
    <div class="pitch" role="img" aria-label="Compositions sur le terrain"><svg class="pitch-lines" viewBox="0 0 68 105" preserveAspectRatio="none" aria-hidden="true"><rect x="1" y="1" width="66" height="103"/><line x1="1" y1="52.5" x2="67" y2="52.5"/><circle cx="34" cy="52.5" r="9.15"/><rect x="13.85" y="1" width="40.3" height="16.5"/><rect x="24.85" y="1" width="18.3" height="5.5"/><rect x="13.85" y="87.5" width="40.3" height="16.5"/><rect x="24.85" y="98.5" width="18.3" height="5.5"/></svg>${A ? team(A) : ''}${H ? team(H) : ''}</div>
    <div class="pitch-lbl h">${H ? `${ctx.teamLabel('h')}${H.formation ? ` · ${esc(H.formation)}` : ''}` : ''}</div></div>
    <div class="lineups">${bench(H)}${bench(A)}</div>`;
}

export function commHtml(d, { limit = 0 } = {}) {
  const c = d.comm || []; if (!c.length) return '';
  const key = new Set(['goal', 'og', 'red', 'yellow', 'pen', 'pen-miss', 'post', 'var', 'shot-saved', 'period', 'sub']);
  const li = x => `<li class="cm cm-${esc(x.k)}${key.has(x.k) ? ' key' : ''}${x.s ? ` cm-${x.s}` : ''}"><span class="cm-min">${esc(x.m)}</span><span class="cm-ic" aria-hidden="true">${CK[x.k] || ''}</span><span class="cm-t"${x.en ? ' lang="en"' : ''}>${esc(x.t)}</span></li>`;
  const first = limit ? c.slice(0, limit) : c, rest = limit ? c.slice(limit) : [];
  return `<div class="mc-comm"><div class="cm-filter" role="group" aria-label="Filtrer"><button type="button" class="on" data-f="all">Tout</button><button type="button" data-f="key">Temps forts</button></div><ol class="cm-list">${first.map(li).join('')}</ol>${rest.length ? `<details class="cm-more"><summary>Voir les ${rest.length} commentaires précédents</summary><ol class="cm-list">${rest.map(li).join('')}</ol></details>` : ''}<p class="data-note">Commentaire officiel du match, traduit automatiquement.</p></div>`;
}

export function h2hHtml(d, ctx) {
  const g = d.h2h || []; if (!g.length) return '';
  const T = d.teams || {};
  let w = 0, dr = 0, l = 0;
  const me = T.h?.id;
  for (const e of g) { const hs = +e.h.score, as = +e.a.score; const mine = e.h.id === me ? hs - as : as - hs; if (mine > 0) w++; else if (mine < 0) l++; else dr++; }
  return `<p class="h2h-sum"><b>${ctx.teamLabel('h')}</b> : ${w} victoire${w > 1 ? 's' : ''}, ${dr} nul${dr > 1 ? 's' : ''}, ${l} défaite${l > 1 ? 's' : ''} sur les ${g.length} dernières confrontations.</p>
    <ul class="h2h">${g.map(e => `<li><span class="h2h-d">${esc(ctx.date(e.date))}</span><span class="h2h-t r">${esc(ctx.tn(e.h.name))}</span>${ctx.matchLink(e.id, `<b class="h2h-s">${esc(e.h.score)} - ${esc(e.a.score)}</b>`)}<span class="h2h-t">${esc(ctx.tn(e.a.name))}</span></li>`).join('')}</ul>`;
}

/** Sections complètes (ids stables pour la mise à jour en direct). */
export function centreSections(d, ctx) {
  const tl = timelineHtml(d, ctx), st = statsHtml(d), xg = xgHtml(d), pi = pitchHtml(d, ctx), cm = commHtml(d, { limit: ctx.commLimit ?? 40 }), hh = h2hHtml(d, ctx);
  const pre = ctx.state === 'pre';
  return {
    timeline: tl || `<p class="empty">${pre ? 'Les temps forts (buts, cartons, remplacements) s’afficheront ici pendant le match.' : 'Temps forts non disponibles pour ce match.'}</p>`,
    stats: st ? st + xg : `<p class="empty">${pre ? 'Les statistiques arriveront au coup d’envoi.' : 'Statistiques non disponibles.'}</p>`,
    lineups: pi || `<p class="empty">${pre ? 'Les compositions sont publiées environ une heure avant le coup d’envoi.' : 'Compositions non disponibles.'}</p>`,
    comm: cm || `<p class="empty">${pre ? 'Le minute par minute démarre avec le match.' : 'Commentaire non disponible pour ce match.'}</p>`,
    h2h: hh || '<p class="empty">Pas de confrontation récente connue.</p>',
  };
}
