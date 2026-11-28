// « Notes des joueurs » : page /notes/, bloc « Notes des lecteurs » des fiches matchs et section des fiches joueurs.
import { NOTES_API, NOTE_MIN, NOTE_MAX, MIN_VOTES, fmtAvg } from './notes-core.js?v=c3586997';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const page = document.getElementById('notes');
const block = document.getElementById('notes-lecteurs');
const playerSec = document.getElementById('notes-joueur');
const API = (page || block || playerSec)?.dataset.api || NOTES_API;

// Même identifiant d'appareil que les Pronos (aucun compte requis ; le serveur le hache avec un sel propre aux notes).
function deviceId() {
  try {
    let d = localStorage.getItem('pr-device');
    if (!d || !/^[0-9a-f-]{36}$/.test(d)) { d = crypto.randomUUID(); localStorage.setItem('pr-device', d); }
    return d;
  } catch { return crypto.randomUUID(); }
}
async function api(method, path, body) {
  try {
    const r = await fetch(API + path, { method, cache: 'no-store', headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
    const j = await r.json().catch(() => ({}));
    return { status: r.status, ok: r.ok && j.ok !== false, ...j };
  } catch {
    return { status: 0, ok: false, error: 'Pas de connexion. Réessaie.' };
  }
}
const tz = { timeZone: 'Europe/Paris' };
const fmtWhen = d => new Intl.DateTimeFormat('fr-FR', { ...tz, weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }).format(new Date(d)).replace(':', 'h');
const fmtShort = d => new Intl.DateTimeFormat('fr-FR', { ...tz, day: 'numeric', month: 'short' }).format(new Date(d));
const votesTxt = n => `${n} vote${n > 1 ? 's' : ''}`;
const avgHtml = r => (r && r.avg != null ? `<b class="nt-avg" aria-label="Moyenne ${fmtAvg(r.avg)} sur 10">${fmtAvg(r.avg)}</b>` : `<span class="nt-few">pas assez de votes</span>`);
const leftTxt = closes => {
  const ms = Date.parse(closes) - Date.now();
  if (ms <= 0) return 'Notes figées';
  const h = Math.floor(ms / 3600e3);
  return h >= 24 ? `Ouvert encore ${Math.floor(h / 24)} j ${h % 24} h` : h >= 1 ? `Ouvert encore ${h} h` : `Ouvert encore ${Math.max(1, Math.round(ms / 60e3))} min`;
};

// ---------- bloc fiche match ----------
async function initBlock() {
  const data = JSON.parse(block.querySelector('.nt-data')?.textContent || 'null');
  const body = block.querySelector('.nt-body');
  if (!data) return;
  const S = { agg: null, mine: {}, draft: {}, open: false, msg: '' };
  const byId = new Map(data.players.map(p => [p.id, p]));
  const load = async () => {
    const r = await api('GET', `/notes/match?match=${data.id}&device=${deviceId()}`);
    if (!r.ok) { body.innerHTML = `<p class="nt-msg">${esc(r.error || 'Notes indisponibles pour le moment.')}</p>`; return false; }
    S.agg = r; S.mine = r.mine || {}; S.open = r.open; S.draft = {};
    return true;
  };
  const row = p => {
    const a = S.agg.players[p.id], mine = S.draft[p.id] ?? S.mine[p.id] ?? '';
    const name = p.url ? `<a href="${p.url}">${esc(p.name)}</a>` : esc(p.name);
    const sel = S.open ? `<label class="nt-pick"><span class="sr-only">Ta note pour ${esc(p.name)}</span><select data-p="${p.id}"><option value="">–</option>${Array.from({ length: NOTE_MAX - NOTE_MIN + 1 }, (_, i) => NOTE_MIN + i).map(n => `<option value="${n}"${String(mine) === String(n) ? ' selected' : ''}>${n}</option>`).join('')}</select></label>`
      : (S.mine[p.id] ? `<span class="nt-mine">Ta note : <b>${S.mine[p.id]}</b></span>` : '');
    return `<li class="nt-row${S.draft[p.id] !== undefined ? ' changed' : ''}"><span class="nt-num">${esc(p.j ?? '')}</span><span class="nt-name">${name}${p.sub ? ' <small>entré en jeu</small>' : ''}</span><span class="nt-res">${avgHtml(a)}<small>${votesTxt(a?.n || 0)}</small></span>${sel}</li>`;
  };
  const render = () => {
    const a = S.agg, best = a.motm && byId.get(a.motm.id);
    const changes = Object.keys(S.draft).length;
    const team = side => { const t = data[side === 'h' ? 'home' : 'away']; return `<div class="nt-team"><h3>${esc(t.name)}</h3><ol class="nt-rows">${data.players.filter(p => p.s === side).map(row).join('')}</ol></div>`; };
    body.innerHTML = `<div class="nt-head">
      <p class="nt-state ${S.open ? 'open' : 'closed'}">${S.open ? `${leftTxt(a.closes)} <small>(jusqu'au ${esc(fmtWhen(a.closes))})</small>` : 'Notes figées : la période de vote (72 h) est terminée.'}</p>
      <p class="nt-voters">${a.voters} lecteur${a.voters > 1 ? 's ont' : ' a'} noté ce match</p></div>
      <div class="nt-motm">${best ? `<span class="nt-k">Homme du match des lecteurs</span><b>${esc(best.name)}</b> <span class="nt-motm-v">${fmtAvg(a.motm.avg)}/10 · ${votesTxt(a.motm.n)}</span>` : `<span class="nt-k">Homme du match des lecteurs</span><span class="nt-few">pas assez de votes (${MIN_VOTES} votants minimum)</span>`}</div>
      <form class="nt-form" novalidate>
        <input type="text" name="website" tabindex="-1" autocomplete="off" class="nt-hp" aria-hidden="true">
        <div class="nt-teams">${team('h')}${team('a')}</div>
        ${S.open ? `<div class="nt-save"><button type="submit" class="nt-btn"${changes ? '' : ' disabled'}>${changes ? `Enregistrer ${changes} note${changes > 1 ? 's' : ''}` : 'Enregistrer mes notes'}</button><span class="nt-msg" role="status">${esc(S.msg)}</span></div>` : ''}
      </form>`;
    const form = body.querySelector('form');
    form.addEventListener('change', ev => {
      const s = ev.target.closest('select[data-p]'); if (!s) return;
      const pid = s.dataset.p, v = s.value ? Number(s.value) : 0;
      if ((S.mine[pid] || 0) === v) delete S.draft[pid]; else S.draft[pid] = v;
      S.msg = ''; const btn = form.querySelector('.nt-btn'); const n = Object.keys(S.draft).length;
      btn.disabled = !n; btn.textContent = n ? `Enregistrer ${n} note${n > 1 ? 's' : ''}` : 'Enregistrer mes notes';
      s.closest('.nt-row').classList.toggle('changed', pid in S.draft);
      form.querySelector('.nt-msg').textContent = '';
    });
    form.addEventListener('submit', async ev => {
      ev.preventDefault();
      const notes = {}; for (const [k, v] of Object.entries(S.draft)) notes[k] = v || null;
      if (!Object.keys(notes).length) return;
      const btn = form.querySelector('.nt-btn'); btn.disabled = true; btn.textContent = 'Envoi…';
      const r = await api('POST', '/notes/vote', { match: data.id, device: deviceId(), notes, website: form.website.value || undefined });
      if (r.ok) { await load(); S.msg = 'Notes enregistrées. Modifiables jusqu’à la fermeture.'; }
      else S.msg = r.error || 'Envoi impossible.';
      render();
    });
  };
  if (await load()) render();
}

// ---------- page /notes/ ----------
async function initPage() {
  const [d, sum] = await (async () => {
    const d = await fetch('/data/notes/matches.json', { cache: 'no-store' }).then(r => r.json()).catch(() => null);
    if (!d) return [null, null];
    const ids = d.matches.slice(0, 60).map(m => m.id);
    const s = ids.length ? await api('GET', `/notes/summary?ids=${ids.join(',')}`) : { matches: {} };
    return [d, s.ok ? s.matches : {}];
  })();
  if (!d) { page.innerHTML = '<p class="nt-msg">Matchs indisponibles pour le moment.</p>'; return; }
  const open = d.matches.filter(m => Date.parse(m.closes) > Date.now()), closed = d.matches.filter(m => Date.parse(m.closes) <= Date.now());
  const card = m => {
    const s = sum[m.id] || { voters: 0, motm: null };
    const best = s.motm ? `<span class="nt-c-motm">Homme du match : <b>${esc(m.pl[s.motm.id] || '')}</b> ${fmtAvg(s.motm.avg)}</span>` : '';
    const logo = t => (t.logo ? `<img src="${esc(t.logo)}" alt="" width="22" height="22" loading="lazy">` : '');
    return `<li><a class="nt-c" href="${m.url}#notes-lecteurs">
      <span class="nt-c-top"><span>${esc(m.compName)} · ${esc(fmtShort(m.date))}</span><span class="nt-c-st ${Date.parse(m.closes) > Date.now() ? 'open' : ''}">${leftTxt(m.closes)}</span></span>
      <span class="nt-c-m"><span class="nt-c-t">${logo(m.home)}${esc(m.home.short)}</span><b>${m.score[0]} - ${m.score[1]}</b><span class="nt-c-t a">${esc(m.away.short)}${logo(m.away)}</span></span>
      <span class="nt-c-bot"><span>${s.voters} lecteur${s.voters > 1 ? 's' : ''}</span>${best}<span class="nt-c-go">${Date.parse(m.closes) > Date.now() ? 'Noter →' : 'Voir →'}</span></span></a></li>`;
  };
  page.innerHTML = `<section class="nt-card"><h2>À noter</h2>${open.length ? `<ol class="nt-cards">${open.map(card).join('')}</ol>` : '<p class="nt-empty">Aucun match à noter pour le moment : les notes ouvrent au coup de sifflet final.</p>'}</section>
    ${closed.length ? `<section class="nt-card"><h2>Notes figées</h2><ol class="nt-cards">${closed.map(card).join('')}</ol></section>` : ''}`;
}

// ---------- fiche joueur ----------
async function initPlayer() {
  const r = await api('GET', `/notes/player?id=${playerSec.dataset.player}`);
  if (!r.ok || !r.matches?.length) return;
  const rows = r.matches.map(m => `<li><span class="nt-p-d">${esc(fmtShort(m.ko))}</span><a href="/match/${m.match}/#notes-lecteurs">${esc(m.home[1])} ${esc(m.score || '-')} ${esc(m.away[1])}</a><span class="nt-res">${avgHtml(m)}<small>${votesTxt(m.n)}</small></span></li>`).join('');
  playerSec.querySelector('.nt-body').innerHTML = `<div class="nt-p-avg">${r.avg != null ? `<b>${fmtAvg(r.avg)}</b><span>/10<br><small>moyenne des lecteurs sur ${r.count} match${r.count > 1 ? 's' : ''}</small></span>` : `<span class="nt-few">pas assez de votes pour une moyenne</span>`}</div><ol class="nt-p-list">${rows}</ol>`;
  playerSec.hidden = false;
}

if (block) initBlock();
if (page) initPage();
if (playerSec) initPlayer();
