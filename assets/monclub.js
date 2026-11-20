// « Mon club » : page /mon-club/ (choix des clubs, tableau de bord, fil personnalisé) et bouton « Suivre ce club » des fiches équipe.
// Choix gardé dans ce navigateur (localStorage « mc-clubs » : ids ESPN, le premier = club favori). Rien n'est envoyé au serveur.
const KEY = 'mc-clubs';
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const norm = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const tz = { timeZone: 'Europe/Paris' };
const fmtDay = d => new Intl.DateTimeFormat('fr-FR', { ...tz, weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(d));
const fmtTime = d => new Intl.DateTimeFormat('fr-FR', { ...tz, hour: '2-digit', minute: '2-digit' }).format(new Date(d)).replace(':', 'h');
const fmtShort = d => new Intl.DateTimeFormat('fr-FR', { ...tz, day: 'numeric', month: 'short' }).format(new Date(d));
const rel = d => { const m = Math.round((Date.now() - Date.parse(d)) / 60000); return m < 60 ? `il y a ${Math.max(1, m)} min` : m < 1440 ? `il y a ${Math.round(m / 60)} h` : fmtShort(d); };
const MAX = Number(document.getElementById('mon-club')?.dataset.max || 5);
const SITE = 'https://actusport24h.fr';
const local = u => String(u || '').replace(SITE, '') || '/';

export function getClubs() { try { const v = JSON.parse(localStorage.getItem(KEY) || '[]'); return Array.isArray(v) ? v.filter(x => /^\d{1,12}$/.test(x)).slice(0, MAX) : []; } catch { return []; } }
function setClubs(l) { try { localStorage.setItem(KEY, JSON.stringify([...new Set(l)].slice(0, MAX))); } catch { /* navigation privée */ } }
const getJSON = u => fetch(u).then(r => { if (!r.ok) throw new Error(r.status); return r.json(); });

// ---------- bouton des fiches équipe ----------
for (const b of document.querySelectorAll('.mc-follow')) {
  const id = b.dataset.team;
  const sync = () => {
    const l = getClubs(), on = l.includes(id);
    b.setAttribute('aria-pressed', on ? 'true' : 'false'); b.classList.toggle('on', on);
    b.querySelector('span').textContent = on ? (l[0] === id ? 'Mon club (favori)' : 'Club suivi') : 'Suivre ce club';
    b.title = on ? 'Ne plus suivre ce club' : 'Ajouter à Mon club';
  };
  b.hidden = false; sync();
  b.addEventListener('click', () => {
    const l = getClubs();
    if (l.includes(id)) setClubs(l.filter(x => x !== id));
    else if (l.length >= MAX) { b.querySelector('span').textContent = `${MAX} clubs maximum`; setTimeout(sync, 1800); return; }
    else setClubs([...l, id]);
    sync();
  });
  b.insertAdjacentHTML('afterend', ' <a class="mc-follow-link" href="/mon-club/">Mon club →</a>');
}

// ---------- page /mon-club/ ----------
const root = document.getElementById('mon-club');
const S = { clubs: [], byId: new Map(), groups: [], mine: getClubs(), active: null, teams: new Map(), edit: false, q: '', notes: null };

const teamLine = (t, side) => `<span class="mc-t ${side}">${t.logo ? `<img src="${esc(t.logo)}" alt="" width="24" height="24" loading="lazy">` : ''}<span>${esc(t.short || t.name)}</span></span>`;
function matchCard(m, title, teamId) {
  if (!m) return `<section class="mc-card"><h2>${title}</h2><p class="mc-empty">Aucun match connu.</p></section>`;
  const pre = m.state === 'pre', live = m.state === 'in';
  const me = m.home.id === teamId ? m.home : m.away, op = m.home.id === teamId ? m.away : m.home;
  const res = m.state === 'post' ? (Number(me.score) > Number(op.score) ? ['V', 'win'] : Number(me.score) < Number(op.score) ? ['D', 'loss'] : ['N', 'draw']) : null;
  return `<section class="mc-card mc-match"><h2>${title}</h2>
    <a class="mc-m" href="/match/${m.id}/">
      <span class="mc-m-top">${esc(S.compName(m.comp))} · ${esc(fmtDay(m.date))}${pre ? ` · ${fmtTime(m.date)}` : ''}</span>
      <span class="mc-m-row">${teamLine(m.home, 'h')}<b class="mc-sc${live ? ' live' : ''}">${pre ? fmtTime(m.date) : `${esc(m.home.score)} - ${esc(m.away.score)}`}</b>${teamLine(m.away, 'a')}</span>
      ${res ? `<span class="mc-res r-${res[1]}">${res[0] === 'V' ? 'Victoire' : res[0] === 'D' ? 'Défaite' : 'Match nul'}</span>` : live ? '<span class="mc-res live">En direct</span>' : m.venue ? `<span class="mc-m-top">${esc(m.venue)}</span>` : ''}
    </a></section>`;
}
function standingCard(t) {
  const rows = (t.standings || []).filter(s => s.row);
  if (!rows.length) return `<section class="mc-card"><h2>Classement</h2><p class="mc-empty">Pas de classement pour cette équipe (coupe ou sélection).</p></section>`;
  return `<section class="mc-card"><h2>Classement</h2>${rows.map(s => `<div class="mc-st"><span class="mc-st-c">${esc(s.name)}${s.group ? ` · ${esc(s.group)}` : ''}</span>
    <span class="mc-st-r"><b>${esc(s.row.rank)}<sup>${s.row.rank === 1 || s.row.rank === '1' ? 'er' : 'e'}</sup></b><span>${esc(s.row.pts)} pts · ${esc(s.row.played)} j. · ${esc(s.row.win)}V ${esc(s.row.draw)}N ${esc(s.row.loss)}D · diff. ${esc(s.row.gd)}</span></span></div>`).join('')}
    <p class="mc-more"><a href="/classements/">Tous les classements →</a></p></section>`;
}
function lineupCard(t) {
  const pl = t.probableLineup;
  if (!pl || !pl.lines?.length) return `<section class="mc-card"><h2>Compo probable</h2><p class="mc-empty">Pas assez de compositions récentes pour estimer la compo probable.</p></section>`;
  const next = pl.next ? ` pour ${pl.next.home ? 'la réception de' : 'le déplacement à'} ${esc(pl.next.opp?.short || pl.next.opp?.name || '')}` : '';
  return `<section class="mc-card"><h2>Compo probable</h2><p class="mc-sub">${esc(pl.formation || '')}${next} · d’après les ${esc(pl.basedOn)} derniers matchs</p>
    <ol class="mc-lines">${[...pl.lines].reverse().map(l => `<li>${l.map(p => `<span>${esc(p.short || p.name)}</span>`).join('')}</li>`).join('')}</ol>
    <p class="mc-more"><a href="${local(t.url)}#compo-probable">Détail sur la fiche équipe →</a></p></section>`;
}
function absencesCard(t) {
  const a = t.absences || {};
  const inj = a.injuries || [], sus = a.suspensions || [];
  if (!inj.length && !sus.length) return '';
  return `<section class="mc-card"><h2>Blessés et suspendus</h2>
    ${inj.length ? `<ul class="mc-abs">${inj.map(i => `<li>🩹 ${esc(i.name)}${i.status ? ` <small>${esc(i.status)}</small>` : ''}${i.detail ? ` : ${esc(i.detail)}` : ''}</li>`).join('')}</ul>` : ''}
    ${sus.length ? `<ul class="mc-abs">${sus.map(x => `<li>🟥 ${esc(x.name)} : expulsé le ${esc(fmtShort(x.date))}, suspension probable au prochain match.</li>`).join('')}</ul>` : ''}</section>`;
}
function gamesCard(t, club) {
  const last = (t.results || []).find(m => m.state === 'post');
  const noted = last && S.notes?.has(last.id);
  return `<section class="mc-card mc-games"><h2>Jouer avec ${esc(t.short || t.name)}</h2><div class="mc-gl">
    <a href="${club?.[6] ? `/fais-ta-compo/?club=${esc(t.slug)}` : '/fais-ta-compo/'}"><b>Fais ta compo</b><span>${club?.[6] ? 'Compose le onze du club' : 'Compose ton onze'}</span></a>
    <a href="/pronos/?club=${esc(t.slug)}"><b>Pronos</b><span>Pronostique ses matchs</span></a>
    <a href="${noted ? `/match/${last.id}/#notes-lecteurs` : '/notes/'}"><b>Notes</b><span>${noted ? 'Note les joueurs du dernier match' : 'Notes des joueurs'}</span></a>
  </div></section>`;
}
function feedHtml() {
  const seen = new Set(), items = [];
  for (const id of S.mine) {
    const t = S.teams.get(id); if (!t) continue;
    for (const a of t.articles || []) if (!seen.has(`a-${a.slug}`)) { seen.add(`a-${a.slug}`); items.push({ d: a.date, html: `<li class="mc-art"><a href="${local(a.url)}">${a.thumb || a.image ? `<img src="${esc(a.thumb || a.image)}" alt="" width="96" height="64" loading="lazy">` : ''}<span><small>${esc(a.sectionName || '')} · ${esc(rel(a.date))}</small><b>${esc(a.title)}</b></span></a></li>` }); }
    for (const f of t.fil || []) {
      if (f.articleSlug && seen.has(`a-${f.articleSlug}`)) continue;
      if (seen.has(`f-${f.id}`)) continue; seen.add(`f-${f.id}`);
      items.push({ d: f.date, html: `<li class="mc-fil"><small>Brève · ${esc(rel(f.date))}</small>${f.title ? `<b>${esc(f.title)}</b>` : ''}<p>${esc(f.text)}</p></li>` });
    }
  }
  items.sort((a, b) => String(b.d).localeCompare(String(a.d)));
  return `<section class="mc-card mc-feed"><h2>Le fil de ${S.mine.length > 1 ? 'mes clubs' : 'mon club'}</h2>${items.length ? `<ol>${items.slice(0, 30).map(i => i.html).join('')}</ol>` : '<p class="mc-empty">Pas encore d’article ni de brève sur ce club.</p>'}<p class="mc-more"><a href="/fil-info/">Tout le fil info →</a></p></section>`;
}
function pickerHtml() {
  const q = norm(S.q);
  const list = S.clubs.filter(c => !q || norm(`${c[1]} ${c[2]}`).includes(q));
  const groups = S.groups.map(([g, name]) => [name, list.filter(c => c[5] === g)]).filter(([, l]) => l.length);
  return `<section class="mc-card mc-picker"><h2>${S.mine.length ? 'Gérer mes clubs' : 'Choisis ton club'}</h2>
    <p class="mc-sub">${S.mine.length}/${MAX} club${S.mine.length > 1 ? 's' : ''} suivi${S.mine.length > 1 ? 's' : ''}. Le premier est ton club favori.</p>
    ${S.mine.length ? `<ol class="mc-mine">${S.mine.map((id, i) => { const c = S.byId.get(id); return c ? `<li>${c[3] ? `<img src="${esc(c[3])}" alt="" width="22" height="22">` : ''}<span>${esc(c[1])}${i === 0 ? ' <small>favori</small>' : ''}</span>${i ? `<button type="button" data-fav="${id}">Favori</button>` : ''}<button type="button" data-del="${id}" aria-label="Ne plus suivre ${esc(c[1])}">Retirer</button></li>` : ''; }).join('')}</ol>` : ''}
    <label class="mc-search"><span class="sr-only">Chercher un club</span><input type="search" placeholder="Chercher un club (ex. OM, Real, Bleus)" value="${esc(S.q)}" autocomplete="off"></label>
    <div class="mc-list">${groups.map(([name, l]) => `<h3>${esc(name)}</h3><ul>${l.slice(0, q ? 40 : 200).map(c => { const on = S.mine.includes(c[0]); return `<li><button type="button" class="mc-pick${on ? ' on' : ''}" data-id="${c[0]}" aria-pressed="${on}">${c[3] ? `<img src="${esc(c[3])}" alt="" width="22" height="22" loading="lazy">` : ''}<span>${esc(c[1])}</span><i>${on ? '✓' : '+'}</i></button></li>`; }).join('')}</ul>`).join('') || '<p class="mc-empty">Aucun club trouvé.</p>'}</div>
    ${S.mine.length ? '<p class="mc-act"><button type="button" class="mc-btn" data-done>Voir mon club</button></p>' : ''}</section>`;
}
async function render() {
  if (!S.mine.length || S.edit) { root.innerHTML = pickerHtml(); return; }
  if (!S.active || !S.mine.includes(S.active)) S.active = S.mine[0];
  await Promise.all(S.mine.filter(id => !S.teams.has(id)).map(id => getJSON(`/api/v1/team/${id}.json`).then(t => S.teams.set(id, t)).catch(() => {})));
  const t = S.teams.get(S.active), club = S.byId.get(S.active);
  const tabs = `<div class="mc-tabs" role="tablist" aria-label="Mes clubs">${S.mine.map((id, i) => { const c = S.byId.get(id); const on = id === S.active; return c ? `<button type="button" role="tab" aria-selected="${on}" class="mc-tab${on ? ' on' : ''}" data-tab="${id}">${c[3] ? `<img src="${esc(c[3])}" alt="" width="20" height="20">` : ''}${esc(c[2])}${i === 0 ? ' ★' : ''}</button>` : ''; }).join('')}<button type="button" class="mc-tab mc-manage" data-edit>Gérer</button></div>`;
  if (!t) { root.innerHTML = `${tabs}<p class="mc-empty">Fiche du club momentanément indisponible.</p>`; return; }
  const next = (t.fixtures || []).find(m => m.state !== 'post'), live = (t.results || []).find(m => m.state === 'in') || (t.fixtures || []).find(m => m.state === 'in');
  const last = (t.results || []).find(m => m.state === 'post');
  root.innerHTML = `${tabs}
    <section class="mc-card mc-head"${t.color ? ` style="--tc:${esc(t.color)}"` : ''}>${t.logo ? `<img src="${esc(t.logo)}" alt="" width="64" height="64">` : ''}<div><h2>${esc(t.name)}</h2><p><a href="${local(t.url)}">Fiche complète du club →</a></p></div></section>
    <div class="mc-grid">${live ? matchCard(live, 'En direct', t.id) : ''}${matchCard(next, 'Prochain match', t.id)}${matchCard(last, 'Dernier résultat', t.id)}${standingCard(t)}${gamesCard(t, club)}${lineupCard(t)}${absencesCard(t)}</div>
    ${feedHtml()}`;
}
if (root) {
  root.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.id) { S.edit = true; const id = b.dataset.id; if (S.mine.includes(id)) S.mine = S.mine.filter(x => x !== id); else if (S.mine.length < MAX) S.mine = [...S.mine, id]; else { b.querySelector('i').textContent = `${MAX} max`; return; } setClubs(S.mine); render(); return; }
    if (b.dataset.del) { S.edit = true; S.mine = S.mine.filter(x => x !== b.dataset.del); setClubs(S.mine); render(); return; }
    if (b.dataset.fav) { S.mine = [b.dataset.fav, ...S.mine.filter(x => x !== b.dataset.fav)]; setClubs(S.mine); render(); return; }
    if ('done' in b.dataset) { S.edit = false; S.q = ''; S.active = S.mine[0]; render(); return; }
    if ('edit' in b.dataset) { S.edit = true; render(); return; }
    if (b.dataset.tab) { S.active = b.dataset.tab; render(); }
  });
  root.addEventListener('input', e => {
    if (e.target.type !== 'search') return;
    S.q = e.target.value; const pos = e.target.selectionStart;
    render().then(() => { const i = root.querySelector('input[type=search]'); if (i) { i.focus(); i.setSelectionRange(pos, pos); } });
  });
  (async () => {
    try {
      const d = await getJSON('/data/mon-club/clubs.json');
      S.clubs = d.clubs; S.groups = d.groups; S.byId = new Map(d.clubs.map(c => [c[0], c]));
      S.mine = S.mine.filter(id => S.byId.has(id));
      const comps = await getJSON('/data/pronos/matches.json').then(x => new Map(x.comps.map(c => [c.id, c.name]))).catch(() => new Map());
      S.compName = id => comps.get(id) || id;
      S.notes = await getJSON('/data/notes/matches.json').then(x => new Set(x.matches.map(m => m.id))).catch(() => new Set());
      const sp = new URLSearchParams(location.search).get('club');
      if (sp) { const c = S.clubs.find(x => x[4] === sp || x[0] === sp); if (c) { if (!S.mine.includes(c[0]) && S.mine.length < MAX) { S.mine.push(c[0]); setClubs(S.mine); } S.active = c[0]; } }
      await render();
    } catch { root.innerHTML = '<p class="mc-empty">Mon club est momentanément indisponible. Réessaie dans un instant.</p>'; }
  })();
}
