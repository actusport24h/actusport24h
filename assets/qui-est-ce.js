// Qui est-ce ? (/qui-est-ce/) : un joueur mystère par jour, un indice de plus à chaque essai, 6 essais.
import { decodeSecret, frDate, IX, JEUX_DATA, norm, parisDate, qecFeedback, qecShareText, QEC_TRIES, searchPlayers, SITE, xIntent } from './jeux-core.js?v=095f69cd';

const root = document.getElementById('qec');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const getJSON = async u => { const r = await fetch(u, { headers: { Accept: 'application/json' } }); if (!r.ok) throw new Error(String(r.status)); return r.json(); };
const S = { rows: [], byId: new Map(), leagues: {}, day: null, secret: null, guesses: [], q: '', date: null };
const KEY = d => `qec-${d}`;
const save = () => { try { localStorage.setItem(KEY(S.date), JSON.stringify({ guesses: S.guesses })); } catch {} };
const won = () => S.guesses.includes(S.secret.id);
const over = () => won() || S.guesses.length >= QEC_TRIES;

function cluesHtml() {
  const shown = over() ? S.day.clues.length : Math.min(S.guesses.length + 1, S.day.clues.length);
  return `<ol class="qe-clues">${S.day.clues.map((c, k) => k < shown
    ? `<li class="on"><span>${esc(c.k)}</span><b>${esc(c.v)}</b></li>`
    : `<li class="off"><span>Indice ${k + 1}</span><b>révélé après l’essai ${k}</b></li>`).join('')}</ol>`;
}
const chip = (ok, label, title) => `<span class="qe-chip ${ok === true ? 'ok' : ok === false ? 'ko' : 'na'}" title="${esc(title)}">${esc(label)}${ok === true ? ' ✓' : ok === false ? ' ✗' : ''}</span>`;
function guessesHtml() {
  if (!S.guesses.length) return '';
  return `<ol class="qe-guesses" aria-label="Tes essais">${S.guesses.map(id => {
    const r = S.byId.get(id); if (!r) return '';
    if (id === S.secret.id) return `<li class="win"><b>${esc(r[IX.name])}</b><span class="qe-chip ok">C’est lui !</span></li>`;
    const f = qecFeedback(r, S.day.m);
    const age = f.age == null ? chip(null, 'Âge ?', 'Âge inconnu') : f.age === 0 ? chip(true, `${r[IX.age]} ans`, 'Même âge') : `<span class="qe-chip ko" title="${f.age > 0 ? 'Le joueur mystère est plus âgé' : 'Le joueur mystère est plus jeune'}">${r[IX.age]} ans ${f.age > 0 ? '↑ plus âgé' : '↓ plus jeune'}</span>`;
    return `<li><b>${esc(r[IX.name])}</b><span class="qe-chips">${chip(f.club, r[IX.club] || 'Club', 'Même club ?')}${chip(f.league, S.leagues[r[IX.league]] || 'Autre championnat', 'Même championnat ?')}${chip(f.nat, r[IX.nat] || 'Nationalité', 'Même nationalité ?')}${chip(f.pos, r[IX.pos] || 'Poste', 'Même ligne (gardien, défense, milieu, attaque) ?')}${age}</span></li>`;
  }).join('')}</ol>`;
}
function endHtml() {
  const s = S.secret, w = won(), tries = S.guesses.slice(0, w ? S.guesses.indexOf(s.id) + 1 : QEC_TRIES);
  const text = qecShareText(S.date, tries, w);
  return `<div class="qe-end ${w ? 'win' : 'lose'}" tabindex="-1">
    <p class="qe-res">${w ? `Bravo, trouvé en ${tries.length} essai${tries.length > 1 ? 's' : ''} !` : 'Perdu, c’était :'}</p>
    ${s.photo ? `<img class="qe-photo" src="${esc(s.photo)}" alt="${esc(s.name)}" width="160" height="160">` : ''}
    <h2><a href="${esc(s.url)}">${esc(s.name)}</a></h2><p class="qe-club">${esc(s.club)}</p>
    ${s.photo && s.credit ? `<p class="dl-credit">Photo : ${esc(s.credit.author)}, <a href="${esc(s.credit.licenseUrl || s.credit.page)}" rel="noopener">${esc(s.credit.license)}</a></p>` : ''}
    <div class="jx-share"><button type="button" class="jx-btn" data-copy>Copier mon résultat</button><a class="jx-btn jx-x" href="${esc(xIntent(text.split('\n')[0], `${SITE}/qui-est-ce/`))}" target="_blank" rel="noopener">Partager sur X</a></div>
    <p class="jx-copied" role="status" aria-live="polite"></p>
    <p class="qz-next-day">Nouveau joueur mystère demain. <a href="${esc(s.url)}">Voir sa fiche</a> · <a href="/jeux/">Les autres jeux</a></p></div>`;
}
function render(focusInput) {
  const left = QEC_TRIES - S.guesses.length;
  root.innerHTML = `<p class="qz-date">Joueur mystère du ${frDate(S.date)}${S.date !== parisDate() ? ' (le joueur du jour arrive bientôt)' : ''}</p>
    ${over() ? endHtml() : ''}
    <h2 class="qe-h">Indices</h2>${cluesHtml()}
    ${over() ? '' : `<div class="qe-form"><label for="qe-q">Ta proposition <span class="qe-left">(${left} essai${left > 1 ? 's' : ''} restant${left > 1 ? 's' : ''})</span></label>
      <div class="dl-search"><input id="qe-q" type="search" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="qe-l" autocomplete="off" placeholder="Nom du joueur, sans accents si tu veux" value="${esc(S.q)}"><ul id="qe-l" class="dl-list" role="listbox"></ul></div></div>`}
    ${guessesHtml()}
    <p class="qe-help">Après chaque essai : ✓ si ton joueur a le même club, le même championnat, la même nationalité ou la même ligne (gardien, défense, milieu, attaque) que le mystère ; ↑ ou ↓ pour l’âge.</p>`;
  if (focusInput) document.getElementById('qe-q')?.focus();
  if (over() && focusInput !== false) root.querySelector('.qe-end')?.focus?.();
}
function listHtml() {
  if (norm(S.q).length < 2) return '';
  const res = searchPlayers(S.rows, S.q, 8, S.guesses);
  if (!res.length) return '<li class="dl-none">Aucun joueur trouvé.</li>';
  return res.map((r, k) => `<li role="option" id="qe-o${k}" data-pick="${r[0]}" aria-selected="false"><b>${esc(r[IX.name])}</b><span>${esc([r[IX.club], r[IX.pos]].filter(Boolean).join(' · '))}</span></li>`).join('');
}
function guess(id) {
  if (over() || S.guesses.includes(id) || !S.byId.has(id)) return;
  S.guesses.push(id); S.q = ''; save(); render(!over());
}
root.addEventListener('input', e => {
  if (e.target.id !== 'qe-q') return;
  S.q = e.target.value; const ul = document.getElementById('qe-l'); ul.innerHTML = listHtml();
  e.target.setAttribute('aria-expanded', ul.children.length ? 'true' : 'false');
});
root.addEventListener('keydown', e => {
  if (e.target.id !== 'qe-q') return;
  const opts = [...document.querySelectorAll('#qe-l [data-pick]')]; if (!opts.length) return;
  let k = opts.findIndex(o => o.getAttribute('aria-selected') === 'true');
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault(); k = e.key === 'ArrowDown' ? (k + 1) % opts.length : (k <= 0 ? opts.length - 1 : k - 1);
    opts.forEach((o, j) => o.setAttribute('aria-selected', String(j === k))); e.target.setAttribute('aria-activedescendant', opts[k].id);
  } else if (e.key === 'Enter') { e.preventDefault(); guess((opts[k] || opts[0]).dataset.pick); }
});
root.addEventListener('click', async e => {
  const li = e.target.closest('[data-pick]'); if (li) { guess(li.dataset.pick); return; }
  if (e.target.closest('[data-copy]')) {
    const w = won(), text = qecShareText(S.date, S.guesses.slice(0, w ? S.guesses.indexOf(S.secret.id) + 1 : QEC_TRIES), w);
    try { await navigator.clipboard.writeText(text); root.querySelector('.jx-copied').textContent = 'Résultat copié, sans le nom du joueur.'; } catch { root.querySelector('.jx-copied').textContent = text; }
  }
});
(async () => {
  try {
    const today = parisDate(), idx = await getJSON(`${JEUX_DATA}/qui-est-ce/index.json`);
    S.date = idx.dates.includes(today) ? today : idx.dates.filter(d => d <= today).pop();
    if (!S.date) throw new Error('aucun joueur');
    const [day, J] = await Promise.all([getJSON(`${JEUX_DATA}/qui-est-ce/${S.date}.json`), getJSON(`${JEUX_DATA}/joueurs.json`)]);
    S.day = day; S.secret = decodeSecret(S.date, day.k); S.rows = J.players; S.leagues = J.leagues || {};
    S.byId = new Map(J.players.map(r => [r[0], r]));
    if (!S.secret) throw new Error('secret');
    try { S.guesses = (JSON.parse(localStorage.getItem(KEY(S.date)) || 'null')?.guesses || []).filter(id => S.byId.has(id)).slice(0, QEC_TRIES); } catch {}
    render(false);
  } catch { root.innerHTML = '<p class="jx-err">Le joueur mystère n’a pas pu être chargé. Réessaie dans un instant.</p>'; }
})();
