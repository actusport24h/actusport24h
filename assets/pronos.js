// « Pronos entre lecteurs » : page /pronos/ (matchs, compte, mes pronos), /pronos/classement/ et bloc des fiches matchs.
import {
  PRONOS_API, GOALS_MAX, pseudoError, cleanPseudo, formatCode, isCode, monthLabel, monthOf, seasonOf, outcome,
} from './pronos-core.js?v=122c5a44';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const root = document.getElementById('pronos');
const block = document.getElementById('pronos-lecteurs');
const API = (root || block)?.dataset.api || PRONOS_API;
const params = new URLSearchParams(location.search);

// ---------- appareil, compte, réseau ----------
function deviceId(fresh = false) {
  try {
    let d = localStorage.getItem('pr-device');
    if (fresh || !d || !/^[0-9a-f-]{36}$/.test(d)) { d = crypto.randomUUID(); localStorage.setItem('pr-device', d); }
    return d;
  } catch { return crypto.randomUUID(); }
}
async function api(method, path, body) {
  try {
    const r = await fetch(API + path, { method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
    const j = await r.json().catch(() => ({}));
    return { status: r.status, ok: r.ok && j.ok !== false, ...j };
  } catch {
    return { status: 0, ok: false, error: 'Pas de connexion. Réessaie.' };
  }
}
const qs = o => Object.entries(o).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
let matchesP = null;
const loadMatches = () => (matchesP ||= fetch('/data/pronos/matches.json').then(r => r.json()));
const S = { me: null, mine: new Map(), stats: {}, data: null, comp: 'all', club: params.get('club') || null, code: null, recover: false };
const fmtDay = d => new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(d));
const fmtTime = d => new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit' }).format(new Date(d)).replace(':', 'h');
const fmtShort = d => new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', day: 'numeric', month: 'short' }).format(new Date(d));
const compName = id => S.data?.comps.find(c => c.id === id)?.name || id;
const open = m => m.state === 'pre' && Date.parse(m.date) > Date.now();
const ptsTxt = n => `${n} pt${n > 1 ? 's' : ''}`;

async function loadMe() {
  const [me, mine] = await Promise.all([api('GET', `/pronos/me?${qs({ device: deviceId() })}`), api('GET', `/pronos/mine?${qs({ device: deviceId() })}`)]);
  S.me = me.ok ? me.user : null;
  S.mine = new Map((mine.preds || []).map(p => [p.match, p]));
  S.minePreds = mine.preds || [];
}
async function loadStats(ids) {
  const out = {};
  for (let i = 0; i < ids.length; i += 80) {
    const r = await api('GET', `/pronos/stats?${qs({ ids: ids.slice(i, i + 80).join(',') })}`);
    Object.assign(out, r.stats || {});
  }
  Object.assign(S.stats, out);
}

// ---------- éléments communs ----------
function statsHtml(m, st) {
  if (!st || !st.n) return `<p class="pr-stats-none">${open(m) ? 'Pas encore de prono : sois le premier !' : 'Aucun prono pour ce match.'}</p>`;
  const seg = (k, l, v) => `<span class="pr-seg pr-s${k}" style="flex:${Math.max(v, 0.0001)}" title="${esc(l)} : ${v} %">${v >= 12 ? `${v} %` : ''}</span>`;
  return `<div class="pr-stats" aria-label="Pronos des lecteurs : victoire ${esc(m.home.short)} ${st.h} %, nul ${st.d} %, victoire ${esc(m.away.short)} ${st.a} %">
    <div class="pr-bar">${seg('h', `Victoire ${m.home.short}`, st.h)}${seg('d', 'Nul', st.d)}${seg('a', `Victoire ${m.away.short}`, st.a)}</div>
    <div class="pr-legend"><span><b>1</b> ${esc(m.home.short)} ${st.h} %</span><span><b>N</b> ${st.d} %</span><span><b>2</b> ${esc(m.away.short)} ${st.a} %</span></div>
    <p class="pr-n">${st.n} prono${st.n > 1 ? 's' : ''} de lecteurs${st.top && st.n > 1 ? ` · score le plus joué : ${st.top.h}-${st.top.a} (${st.top.n})` : ''}</p></div>`;
}
const stepper = (m, side, v, dis) => `<div class="pr-step" data-side="${side}">
  <button type="button" data-d="-1" aria-label="Un but de moins pour ${esc(side === 'h' ? m.home.name : m.away.name)}"${dis ? ' disabled' : ''}>−</button>
  <output aria-live="polite" aria-label="Buts ${esc(side === 'h' ? m.home.name : m.away.name)}">${v}</output>
  <button type="button" data-d="1" aria-label="Un but de plus pour ${esc(side === 'h' ? m.home.name : m.away.name)}"${dis ? ' disabled' : ''}>+</button></div>`;
const team = (t, right) => `<span class="pr-team${right ? ' r' : ''}">${t.logo ? `<img src="${esc(t.logo)}" alt="" width="28" height="28" loading="lazy">` : ''}<span>${esc(t.name)}</span></span>`;
function predForm(m) {
  const mine = S.mine.get(m.id);
  const isOpen = open(m);
  const h = mine ? mine.h : 0, a = mine ? mine.a : 0;
  let status = '';
  if (!isOpen) {
    status = mine ? (mine.pts != null ? `Ton prono : ${mine.h}-${mine.a} · <b>${ptsTxt(mine.pts)}</b>` : mine.void ? `Ton prono : ${mine.h}-${mine.a} · annulé (match reporté)` : `Ton prono : ${mine.h}-${mine.a} · points calculés après le match`) : 'Pronos clos.';
  } else status = mine ? `Prono enregistré : <b>${mine.h}-${mine.a}</b> (modifiable jusqu'au coup d'envoi)` : '';
  return `<div class="pr-form${mine ? ' saved' : ''}" data-match="${m.id}">
    <div class="pr-row">${team(m.home)}${stepper(m, 'h', h, !isOpen)}<span class="pr-dash">-</span>${stepper(m, 'a', a, !isOpen)}${team(m.away, true)}</div>
    ${isOpen ? `<div class="pr-act"><button type="button" class="pr-btn" data-act="save">${mine ? 'Modifier mon prono' : 'Valider mon prono'}</button>${mine ? '<button type="button" class="pr-btn ghost" data-act="del">Retirer</button>' : ''}</div>` : ''}
    <p class="pr-status" role="status">${status}</p></div>`;
}
function matchCard(m) {
  return `<article class="pr-m" id="m-${m.id}" data-match="${m.id}">
    <div class="pr-m-top"><span class="pr-comp">${esc(compName(m.comp))}</span><span>${fmtTime(m.date)}${m.url ? ` · <a href="${esc(m.url)}#pronos-lecteurs">fiche match</a>` : ''}</span></div>
    ${predForm(m)}
    <div class="pr-m-stats">${statsHtml(m, S.stats[m.id])}</div></article>`;
}

// ---------- compte ----------
function accountHtml() {
  if (S.code) {
    return `<div class="pr-code" role="alert"><h2>Ton code de récupération</h2>
      <p class="pr-code-v" id="pr-code-v">${esc(formatCode(S.code))}</p>
      <p>Note-le ou fais une capture : <b>il ne sera plus jamais affiché</b>. Avec ton pseudo, il permet de retrouver ton compte sur un autre appareil (aucun e-mail n'est demandé).</p>
      <p class="pr-act"><button type="button" class="pr-btn ghost" data-act="copy">Copier le code</button><button type="button" class="pr-btn" data-act="code-ok">J'ai noté mon code</button></p></div>`;
  }
  if (S.me) {
    const u = S.me;
    return `<div class="pr-me"><p class="pr-me-main">Tu joues sous le pseudo <b>${esc(u.pseudo)}</b></p>
      <p class="pr-me-pts"><span><b>${ptsTxt(u.pts)}</b> cette saison</span>${u.rank ? `<span>${u.rank}<sup>${u.rank === 1 ? 'er' : 'e'}</sup> au classement</span>` : ''}<span>${u.n} prono${u.n > 1 ? 's' : ''} noté${u.n > 1 ? 's' : ''}</span>${u.pending ? `<span>${u.pending} en attente</span>` : ''}</p>
      <details class="pr-more"><summary>Mon compte</summary>
        <p>Pour jouer sur un autre appareil, il te faut ton code de récupération. Perdu ? Génère-en un nouveau (l'ancien ne marchera plus).</p>
        <p class="pr-act"><button type="button" class="pr-btn ghost" data-act="newcode">Nouveau code de récupération</button><button type="button" class="pr-btn ghost" data-act="logout">Utiliser un autre pseudo sur cet appareil</button></p>
        <p class="pr-msg" id="pr-acc-msg" role="status"></p></details></div>`;
  }
  return `<div class="pr-join"><h2>Choisis ton pseudo pour jouer</h2>
    <form class="pr-reg" data-form="${S.recover ? 'recover' : 'register'}" novalidate>
      <label>Pseudo<input name="pseudo" autocomplete="nickname" maxlength="20" required placeholder="ex. Kylian_93" autocapitalize="off"></label>
      ${S.recover ? '<label>Code de récupération<input name="code" autocomplete="off" maxlength="20" required placeholder="XXXX-XXXX-XXXX" autocapitalize="characters"></label>' : ''}
      <label class="pr-hp" aria-hidden="true">Site web<input name="website" tabindex="-1" autocomplete="off"></label>
      <button class="pr-btn" type="submit">${S.recover ? 'Retrouver mon compte' : 'Créer mon pseudo'}</button>
    </form>
    <p class="pr-msg" id="pr-acc-msg" role="status"></p>
    <p class="pr-note">${S.recover ? '<a href="#" data-act="mode-reg">Créer un nouveau pseudo</a>' : '3 à 20 caractères : lettres, chiffres, espaces, « - » et « _ ». Déjà un pseudo sur un autre appareil ? <a href="#" data-act="mode-rec">Retrouver mon compte</a>'}</p></div>`;
}
function renderAccount() { const el = document.getElementById('pr-acc'); if (el) el.innerHTML = accountHtml(); }
async function onAccount(e) {
  const t = e.target;
  const act = t.closest('[data-act]')?.dataset.act;
  const msg = txt => { const el = document.getElementById('pr-acc-msg'); if (el) el.textContent = txt; };
  if (e.type === 'submit') {
    e.preventDefault();
    const f = t.closest('form'); const fd = new FormData(f);
    const pseudo = cleanPseudo(fd.get('pseudo'));
    const body = { device: deviceId(), pseudo, website: fd.get('website') || undefined };
    if (f.dataset.form === 'register') {
      const err = pseudoError(pseudo); if (err) return msg(err);
      f.querySelector('button').disabled = true;
      const r = await api('POST', '/pronos/register', body);
      f.querySelector('button').disabled = false;
      if (r.status !== 201) return msg(r.error || 'Impossible de créer le pseudo.');
      S.code = r.code;
    } else {
      const code = String(fd.get('code') || '');
      if (!isCode(code)) return msg('Le code fait 12 caractères (lettres et chiffres), par exemple ABCD-EFGH-JKMN.');
      f.querySelector('button').disabled = true;
      const r = await api('POST', '/pronos/recover', { ...body, code });
      f.querySelector('button').disabled = false;
      if (!r.ok) return msg(r.error || 'Impossible de retrouver le compte.');
      S.code = r.code;
    }
    await loadMe(); renderAll();
    return;
  }
  if (!act) return;
  e.preventDefault();
  if (act === 'mode-rec' || act === 'mode-reg') { S.recover = act === 'mode-rec'; renderAccount(); return; }
  if (act === 'copy') { try { await navigator.clipboard.writeText(formatCode(S.code)); t.textContent = 'Code copié'; } catch { t.textContent = 'Sélectionne le code pour le copier'; } return; }
  if (act === 'code-ok') { S.code = null; renderAccount(); return; }
  if (act === 'newcode') {
    if (!confirm('Créer un nouveau code de récupération ? L’ancien ne fonctionnera plus.')) return;
    const r = await api('POST', '/pronos/code', { device: deviceId() });
    if (!r.ok) return msg(r.error || 'Impossible pour le moment.');
    S.code = r.code; renderAccount(); return;
  }
  if (act === 'logout') {
    if (!confirm('Délier ce pseudo de cet appareil ? Sans ton code de récupération, tu ne pourras plus le retrouver.')) return;
    await api('DELETE', `/pronos/device?${qs({ device: deviceId() })}`);
    deviceId(true); S.me = null; S.mine = new Map(); S.minePreds = []; renderAll(); return;
  }
}

// ---------- pronos : formulaire ----------
async function onForm(e) {
  const f = e.target.closest('.pr-form'); if (!f) return;
  const b = e.target.closest('button'); if (!b || b.disabled) return;
  const id = f.dataset.match;
  const status = txt => { f.querySelector('.pr-status').innerHTML = txt; };
  if (b.dataset.d) {
    const o = b.parentElement.querySelector('output');
    o.textContent = Math.max(0, Math.min(GOALS_MAX, Number(o.textContent) + Number(b.dataset.d)));
    f.classList.add('dirty');
    return;
  }
  const m = S.data?.matches.find(x => x.id === id) || S.blockMatch;
  if (b.dataset.act === 'save') {
    if (!S.me) {
      status('Choisis d’abord un pseudo pour enregistrer ton prono.');
      const acc = document.getElementById('pr-acc');
      if (acc) { acc.scrollIntoView({ behavior: 'smooth', block: 'center' }); acc.querySelector('input[name=pseudo]')?.focus({ preventScroll: true }); }
      return;
    }
    const h = Number(f.querySelector('[data-side=h] output').textContent), a = Number(f.querySelector('[data-side=a] output').textContent);
    b.disabled = true;
    const r = await api('POST', '/pronos/predict', { device: deviceId(), match: id, h, a });
    b.disabled = false;
    if (!r.ok) { status(esc(r.error || 'Prono non enregistré.')); return; }
    S.mine.set(id, { ...(S.mine.get(id) || {}), match: id, h, a, pts: null, void: false });
    S.minePreds = [...(S.minePreds || []).filter(p => p.match !== id), { match: id, h, a, ko: m.date, pts: null, void: false, result: null }];
    renderMine();
    await loadStats([id]);
    rerenderMatch(m, `Prono enregistré : <b>${h}-${a}</b> (${outcome(h, a) === 'N' ? 'match nul' : `victoire ${esc(outcome(h, a) === '1' ? m.home.name : m.away.name)}`}). Modifiable jusqu'au coup d'envoi.`);
    return;
  }
  if (b.dataset.act === 'del') {
    const r = await api('DELETE', `/pronos/predict?${qs({ device: deviceId(), match: id })}`);
    if (!r.ok) { status(esc(r.error || 'Impossible de retirer le prono.')); return; }
    S.mine.delete(id); S.minePreds = (S.minePreds || []).filter(p => p.match !== id); renderMine(); await loadStats([id]);
    rerenderMatch(m, 'Prono retiré.');
  }
}
function rerenderMatch(m, msg) {
  const host = document.getElementById(`m-${m.id}`) || block?.querySelector('.pr-match-body');
  if (!host) return;
  if (host.classList.contains('pr-m')) host.outerHTML = matchCard(m);
  else host.innerHTML = blockHtml(m);
  const f = (document.getElementById(`m-${m.id}`) || block).querySelector('.pr-status');
  if (f && msg) f.innerHTML = msg;
}

// ---------- page des matchs ----------
function renderMatches() {
  const list = document.getElementById('pr-list');
  const clubT = S.club ? S.data.matches.flatMap(m => [m.home, m.away]).find(t => t.slug === S.club || t.id === S.club) : null;
  const upcoming = S.data.matches.filter(open).filter(m => S.comp === 'all' || m.comp === S.comp)
    .filter(m => !clubT || m.home.id === clubT.id || m.away.id === clubT.id).slice(0, 120);
  const days = new Map();
  for (const m of upcoming) { const k = fmtDay(m.date); if (!days.has(k)) days.set(k, []); days.get(k).push(m); }
  document.getElementById('pr-club').innerHTML = clubT ? `Matchs de <b>${esc(clubT.name)}</b> <a href="/pronos/" data-act="noclub">Voir tous les matchs</a>` : '';
  list.innerHTML = upcoming.length ? [...days].map(([d, ms]) => `<h3 class="pr-day">${esc(d)}</h3>${ms.map(matchCard).join('')}`).join('')
    : '<p class="pr-empty">Aucun match à venir pour ce filtre dans les prochains jours.</p>';
}
function renderMine() {
  const el = document.getElementById('pr-mine'); if (!el) return;
  // À venir (modifiables) d'abord, dans l'ordre des coups d'envoi, puis les matchs commencés ou terminés, du plus récent au plus ancien.
  const isOpen = p => open(S.data.matches.find(m => m.id === p.match) || { state: 'post', date: p.ko });
  const all = S.minePreds || [];
  const preds = [...all.filter(isOpen).sort((a, b) => a.ko.localeCompare(b.ko)), ...all.filter(p => !isOpen(p))];
  if (!S.me) { el.innerHTML = '<p class="pr-note">Choisis un pseudo pour retrouver ici tes pronos et tes points.</p>'; return; }
  if (!preds.length) { el.innerHTML = '<p class="pr-note">Tes pronos apparaîtront ici, avec tes points une fois les matchs terminés.</p>'; return; }
  el.innerHTML = `<ul class="pr-hist">${preds.slice(0, 60).map(p => {
    const m = S.data.matches.find(x => x.id === p.match);
    const name = m ? `${esc(m.home.short)} - ${esc(m.away.short)}` : `Match ${esc(p.match)}`;
    const res = p.result ? `${p.result[0]}-${p.result[1]}` : '…';
    const badge = isOpen(p) ? `<a class="pr-badge w" href="#m-${esc(p.match)}">modifiable</a>` : p.pts != null ? `<span class="pr-badge p${p.pts}">${ptsTxt(p.pts)}</span>` : p.void ? '<span class="pr-badge v">annulé</span>' : '<span class="pr-badge w">en attente</span>';
    return `<li><span class="pr-h-d">${fmtShort(p.ko)}</span><span class="pr-h-m">${m?.url ? `<a href="${esc(m.url)}">${name}</a>` : name}</span><span class="pr-h-p">ton prono ${p.h}-${p.a}</span><span class="pr-h-r">score ${res}</span>${badge}</li>`;
  }).join('')}</ul>`;
}
async function renderTop() {
  const el = document.getElementById('pr-top'); if (!el) return;
  const r = await api('GET', `/pronos/ranking?${qs({ scope: 'season', device: deviceId() })}`);
  el.innerHTML = r.rows?.length ? `${tableHtml(r.rows.slice(0, 5), r.me)}<p class="pr-note"><a href="/pronos/classement/">Voir tout le classement (${r.players} joueur${r.players > 1 ? 's' : ''}) →</a></p>`
    : '<p class="pr-note">Le classement s’affichera dès les premiers matchs terminés.</p>';
}
function renderAll() {
  renderAccount();
  if (root?.dataset.mode === 'matches' && S.data) { renderMatches(); renderMine(); renderTop(); }
  if (root?.dataset.mode === 'ranking') renderRanking();
}
async function initMatches() {
  const comps = S.data.comps.filter(c => S.data.matches.some(m => m.comp === c.id && open(m)));
  root.innerHTML = `<section class="pr-card" id="pr-acc"></section>
  <section class="pr-card"><div class="pr-filter"><label>Compétition <select id="pr-comp"><option value="all">Toutes les compétitions</option>${comps.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select></label><p id="pr-club" class="pr-club"></p></div>
    <h2 class="pr-h">Matchs à pronostiquer</h2><div id="pr-list"></div></section>
  <section class="pr-card"><h2 class="pr-h">Mes pronos</h2><div id="pr-mine"></div></section>
  <section class="pr-card"><h2 class="pr-h">Classement de la saison</h2><div id="pr-top"></div></section>`;
  root.addEventListener('click', e => { onForm(e); onAccount(e); if (e.target.closest('[data-act=noclub]')) { e.preventDefault(); S.club = null; history.replaceState(null, '', '/pronos/'); renderMatches(); } });
  root.addEventListener('submit', onAccount);
  root.querySelector('#pr-comp').addEventListener('change', e => { S.comp = e.target.value; renderMatches(); });
  await loadStats(S.data.matches.filter(open).slice(0, 240).map(m => m.id));
  renderAll();
  if (location.hash.startsWith('#m-')) document.getElementById(location.hash.slice(1))?.scrollIntoView({ block: 'center' });
}

// ---------- classement ----------
function tableHtml(rows, me) {
  return `<table class="pr-table"><thead><tr><th>#</th><th>Pseudo</th><th>Pts</th><th title="Scores exacts">Exacts</th><th title="Bons résultats">Bons</th><th title="Pronos notés">Pronos</th></tr></thead><tbody>${rows.map(r => `<tr${me && me.pseudo === r.pseudo ? ' class="me"' : ''}><td>${r.rank}</td><td>${esc(r.pseudo)}</td><td><b>${r.pts}</b></td><td>${r.exact}</td><td>${r.good}</td><td>${r.n}</td></tr>`).join('')}</tbody></table>`;
}
let clubsP = null;
async function renderRanking() {
  const box = document.getElementById('pr-rank'); if (!box) return;
  const scope = S.scope || 'season';
  const season = seasonOf(new Date().toISOString());
  let key = '';
  if (scope === 'month') key = S.month || monthOf(new Date().toISOString());
  if (scope === 'club') key = S.rclub || '';
  const ctl = document.getElementById('pr-rank-ctl');
  if (scope === 'month') {
    const [y0] = season.split('-').map(Number); const months = [];
    for (let i = 0; i < 12; i++) { const d = new Date(Date.UTC(y0, 6 + i, 15)); const k = d.toISOString().slice(0, 7); if (k <= monthOf(new Date().toISOString())) months.push(k); }
    ctl.innerHTML = `<label>Mois <select id="pr-month">${months.reverse().map(k => `<option value="${k}"${k === key ? ' selected' : ''}>${monthLabel(k)}</option>`).join('')}</select></label>`;
  } else if (scope === 'club') {
    const clubs = await (clubsP ||= fetch('/data/compo/clubs.json').then(r => r.json()).then(d => d.clubs).catch(() => []));
    if (!key) { const fromQ = params.get('club'); key = (clubs.find(c => c.slug === fromQ || c.id === fromQ) || clubs.find(c => c.slug === 'paris-saint-germain') || clubs[0])?.id || ''; S.rclub = key; }
    const groups = [...new Set(clubs.map(c => c.group))];
    ctl.innerHTML = `<label>Club <select id="pr-rclub">${groups.map(g => `<optgroup label="${esc(g)}">${clubs.filter(c => c.group === g).map(c => `<option value="${c.id}"${c.id === key ? ' selected' : ''}>${esc(c.name)}</option>`).join('')}</optgroup>`).join('')}</select></label>
      <p class="pr-note">Points gagnés par chaque lecteur sur les seuls matchs de ce club (domicile ou extérieur), saison ${season}.</p>`;
  } else ctl.innerHTML = `<p class="pr-note">Saison ${season} (juillet à juin) : tous les matchs terminés.</p>`;
  box.innerHTML = '<p class="pr-loading">Chargement…</p>';
  const r = await api('GET', `/pronos/ranking?${qs({ scope, key, device: deviceId() })}`);
  if (!r.ok) { box.innerHTML = `<p class="pr-note">${esc(r.error || 'Classement indisponible.')}</p>`; return; }
  const meRow = r.me && r.me.rank && !r.rows.some(x => x.pseudo === r.me.pseudo) ? `<p class="pr-note">Toi : ${r.me.rank}<sup>e</sup> avec ${ptsTxt(r.me.pts)}.</p>` : '';
  box.innerHTML = r.rows.length ? `<p class="pr-n">${r.players} joueur${r.players > 1 ? 's' : ''} classé${r.players > 1 ? 's' : ''}${scope === 'month' ? ` · ${monthLabel(r.key)}` : ''}</p>${tableHtml(r.rows, r.me)}${meRow}`
    : '<p class="pr-empty">Pas encore de points pour ce classement : ils arrivent dès la fin des matchs pronostiqués.</p>';
}
async function initRanking() {
  S.scope = ['season', 'month', 'club'].includes(params.get('vue')) ? params.get('vue') : params.get('club') ? 'club' : 'season';
  root.innerHTML = `<section class="pr-card" id="pr-acc"></section>
  <section class="pr-card"><div class="pr-tabs" role="tablist">${[['season', 'Saison'], ['month', 'Mois'], ['club', 'Par club']].map(([k, l]) => `<button type="button" role="tab" data-scope="${k}" aria-selected="${k === S.scope}">${l}</button>`).join('')}</div>
  <div id="pr-rank-ctl" class="pr-filter"></div><div id="pr-rank"></div></section>`;
  root.addEventListener('click', e => {
    const tb = e.target.closest('[data-scope]');
    if (tb) { S.scope = tb.dataset.scope; root.querySelectorAll('[data-scope]').forEach(x => x.setAttribute('aria-selected', x === tb)); renderRanking(); return; }
    onAccount(e);
  });
  root.addEventListener('submit', onAccount);
  root.addEventListener('change', e => { if (e.target.id === 'pr-month') { S.month = e.target.value; renderRanking(); } if (e.target.id === 'pr-rclub') { S.rclub = e.target.value; renderRanking(); } });
  renderAll();
}

// ---------- bloc des fiches matchs ----------
function blockHtml(m) {
  const st = S.stats[m.id];
  const join = open(m) && !S.me ? `<p class="pr-note"><a class="pr-btn" href="/pronos/#m-${m.id}">Choisis un pseudo pour pronostiquer</a></p>` : '';
  return `${S.me || !open(m) ? predForm(m) : `<div class="pr-form" data-match="${m.id}"><div class="pr-row">${team(m.home)}<span class="pr-dash">-</span>${team(m.away, true)}</div><p class="pr-status"></p></div>`}${join}<div class="pr-m-stats">${statsHtml(m, st)}</div>`;
}
async function initBlock() {
  const id = block.dataset.match;
  const data = await loadMatches().catch(() => null);
  const m = data?.matches.find(x => x.id === id);
  const body = block.querySelector('.pr-match-body');
  if (!m) { body.innerHTML = '<p class="pr-note">Ce match n’est pas ouvert aux pronos.</p>'; return; }
  S.data = data; S.blockMatch = m;
  await Promise.all([loadMe(), loadStats([id])]);
  body.innerHTML = blockHtml(m);
  block.addEventListener('click', onForm);
}

(async () => {
  try {
    if (root) {
      const [data] = await Promise.all([loadMatches(), loadMe()]);
      S.data = data;
      if (root.dataset.mode === 'ranking') await initRanking(); else await initMatches();
    } else if (block) await initBlock();
  } catch (e) {
    console.error(e);
    const host = root || block?.querySelector('.pr-match-body');
    if (host) host.innerHTML = '<p class="pr-note">Pronos indisponibles pour le moment. Réessaie dans quelques minutes.</p>';
  }
})();
