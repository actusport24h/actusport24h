// ActuSport24h — thème, onglets, temps relatif, compte à rebours,
// scores et classements en direct (API publique ESPN, dans le navigateur).
(() => {
  const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const TZ = 'Europe/Paris';
  const ESPN = 'https://site.api.espn.com/apis';
  const FAST_MS = 10000, SLOW_MS = 120000, ST_LIVE_MS = 60000, ST_IDLE_MS = 600000;
  const COMPS = {
    'fra.1': { name: 'Ligue 1', short: 'L1', standings: true },
    'uefa.champions': { name: 'Ligue des champions', short: 'LDC', standings: true },
    'eng.1': { name: 'Premier League', short: 'PL', standings: true },
    'esp.1': { name: 'Liga', short: 'Liga', standings: true },
    'ita.1': { name: 'Serie A', short: 'Serie A', standings: true },
    'ger.1': { name: 'Bundesliga', short: 'Bundesliga', standings: true },
    'uefa.nations': { name: 'Ligue des nations', short: 'LDN', standings: false },
  };
  const TEAM_FR = {
    Italy: 'Italie', France: 'France', Spain: 'Espagne', Germany: 'Allemagne', England: 'Angleterre', Belgium: 'Belgique',
    'Türkiye': 'Turquie', Netherlands: 'Pays-Bas', Portugal: 'Portugal', Croatia: 'Croatie', Switzerland: 'Suisse',
    Czechia: 'Tchéquie', Albania: 'Albanie', Finland: 'Finlande', Cyprus: 'Chypre', Armenia: 'Arménie', Scotland: 'Écosse',
    Wales: 'Pays de Galles', Norway: 'Norvège', Sweden: 'Suède', Denmark: 'Danemark', Austria: 'Autriche', Poland: 'Pologne',
    Hungary: 'Hongrie', Greece: 'Grèce', Serbia: 'Serbie', Romania: 'Roumanie', Ukraine: 'Ukraine', Slovakia: 'Slovaquie',
    Slovenia: 'Slovénie', Ireland: 'Irlande', 'Republic of Ireland': 'Irlande', 'Northern Ireland': 'Irlande du Nord', Iceland: 'Islande',
    Georgia: 'Géorgie', 'Bosnia-Herzegovina': 'Bosnie-Herzégovine', Kosovo: 'Kosovo', Montenegro: 'Monténégro', 'North Macedonia': 'Macédoine du Nord',
    Bulgaria: 'Bulgarie', Israel: 'Israël', Lithuania: 'Lituanie', Latvia: 'Lettonie', Estonia: 'Estonie', Luxembourg: 'Luxembourg',
    Moldova: 'Moldavie', Belarus: 'Biélorussie', Azerbaijan: 'Azerbaïdjan', Kazakhstan: 'Kazakhstan', Malta: 'Malte', Andorra: 'Andorre',
    'Faroe Islands': 'Îles Féroé', Gibraltar: 'Gibraltar', 'San Marino': 'Saint-Marin', Liechtenstein: 'Liechtenstein',
    'Bayern Munich': 'Bayern Munich', 'Le Havre AC': 'Le Havre',
  };
  const NOTE_FR = {
    'Champions League': 'Ligue des champions', 'Champions League qualifying': 'Qualif. Ligue des champions',
    'Europa League': 'Ligue Europa', 'Conference League qualifying': 'Qualif. Ligue Conférence', 'Conference League': 'Ligue Conférence',
    'Relegation playoff': 'Barrage de relégation', Relegation: 'Relégation', 'Round of 16': 'Huitièmes de finale',
    'Knockout Round Playoffs': 'Barrages', Eliminated: 'Éliminé', 'Europa League qualifying': 'Qualif. Ligue Europa',
    'Qualifies for round of 16': 'Qualifié pour les huitièmes',
    'Knockout phase playoffs - seeded': 'Barrages (tête de série)',
    'Knockout phase playoffs - unseeded': 'Barrages (non tête de série)',
  };
  const HL = ['Marseille', 'Paris Saint-Germain'];
  const tn = n => TEAM_FR[n] || n;
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const fmt = (d, o) => new Intl.DateTimeFormat('fr-FR', { timeZone: TZ, ...o }).format(new Date(d));
  const hhmm = d => fmt(d, { hour: '2-digit', minute: '2-digit' });
  const dateShort = d => fmt(d, { day: 'numeric', month: 'short' });
  const dayLong = d => { const s = fmt(d, { weekday: 'long', day: 'numeric', month: 'long' }); return s[0].toUpperCase() + s.slice(1); };
  const dayISO = d => new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(d));
  const ymd = d => dayISO(d).replace(/-/g, '');
  const isToday = d => dayISO(d) === dayISO(new Date());

  // Thème
  $('.theme-btn')?.addEventListener('click', () => {
    const t = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = t; try { localStorage.setItem('theme', t); } catch {}
  });
  // Onglets
  $$('[data-tabs]').forEach(tabs => {
    const btns = $$('button', tabs);
    const show = b => { btns.forEach(x => { x.classList.toggle('on', x === b); const p = document.getElementById(x.dataset.t); p && p.classList.toggle('on', x === b); }); };
    btns.forEach(b => b.addEventListener('click', () => { show(b); if (b.dataset.hash) history.replaceState(null, '', '#' + b.dataset.hash); }));
    const h = location.hash.slice(1); const m = btns.find(b => b.dataset.hash === h); if (m) show(m);
  });
  // Temps relatif
  const rel = () => $$('.rt').forEach(el => {
    const d = (Date.now() - new Date(el.dataset.ts)) / 6e4;
    if (d < 1) el.textContent = "À l'instant"; else if (d < 60) el.textContent = `Il y a ${Math.round(d)} min`;
    else if (d < 24 * 60) el.textContent = `Il y a ${Math.round(d / 60)} h`;
  });
  rel(); setInterval(rel, 60000);
  // Compte à rebours
  const cd = () => $$('.countdown').forEach(el => {
    const s = (new Date(el.dataset.ko) - Date.now()) / 1000;
    if (s <= 0) { el.textContent = "C'est parti !"; return; }
    const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60);
    el.textContent = s < 86400 ? `Dans ${h ? h + ' h ' : ''}${String(m).padStart(2, '0')} min` : '';
  });
  cd(); setInterval(cd, 30000);

  function statusFR(m) {
    if (m.state === 'pre') return hhmm(m.date);
    if (m.state === 'in') return m.clock && m.clock !== "0'" ? m.clock : 'En cours';
    if (/PEN/.test(m.status || '')) return 'T.a.b.'; if (/AET|EXTRA/.test(m.status || '')) return 'A.p.';
    if (/POSTPONED/.test(m.status || '')) return 'Reporté'; if (/CANCEL/.test(m.status || '')) return 'Annulé';
    return 'Terminé';
  }
  function scoreHTML(m) {
    return m.state === 'pre'
      ? `<span class="vs">${hhmm(m.date)}</span>`
      : `<span class="sc">${esc(m.home.score)}</span><span class="sep">-</span><span class="sc">${esc(m.away.score)}</span>`;
  }
  function teamCell(t, side) {
    const logo = t.logo ? `<img src="${t.logo}" alt="" loading="lazy" width="22" height="22">` : `<span class="nologo"></span>`;
    const name = `<span class="tn">${esc(tn(t.short || t.name))}</span>`;
    return `<span class="team ${side} ${t.winner ? 'win' : ''}">${side === 'home' ? name + logo : logo + name}</span>`;
  }
  function matchRowHTML(m, compact = false) {
    const status = compact && m.state === 'post' ? dateShort(m.date) : m.state === 'pre' ? '' : statusFR(m);
    return `<div class="match s-${m.state}" data-ev="${m.id}" data-comp="${m.comp}" data-ko="${m.date}">
  ${teamCell(m.home, 'home')}
  <span class="match-mid"><span class="mstatus">${m.state === 'in' ? '<i class="live-dot"></i>' : ''}<span class="st">${status}</span></span><span class="score">${scoreHTML(m)}</span></span>
  ${teamCell(m.away, 'away')}
  ${!compact && m.venue ? `<span class="venue">${esc(m.venue)}</span>` : ''}</div>`;
  }
  function tickerHTML(m) {
    const c = COMPS[m.comp]?.short || m.comp;
    const mid = m.state === 'pre' ? hhmm(m.date) : `${m.home.score}-${m.away.score}`;
    return `<a class="tk s-${m.state}" href="/resultats/#${m.comp}" data-ev="${m.id}" data-comp="${m.comp}" data-ko="${m.date}"><span class="tk-c">${esc(c)}</span>${esc(tn(m.home.short))} <b>${mid}</b> ${esc(tn(m.away.short))}${m.state === 'in' ? ' <i class="live-dot"></i>' : ''}</a>`;
  }
  function scoreKey(m) { return m.state === 'pre' ? '' : `${m.home?.score}-${m.away?.score}`; }
  function flash(el) {
    if (!el) return;
    el.classList.remove('goal-flash');
    void el.offsetWidth;
    el.classList.add('goal-flash');
    clearTimeout(el._gf);
    el._gf = setTimeout(() => el.classList.remove('goal-flash'), 1800);
  }
  function maybeFlash(el, prev, next, state) {
    if (prev && next && prev !== next && state !== 'pre') flash(el);
  }

  function updateMatchEl(el, m) {
    const compact = !!el.closest('.sidebar');
    const prev = el.dataset.score || '';
    const next = scoreKey(m);
    el.classList.remove('s-pre', 's-post', 's-in');
    el.classList.add('s-' + m.state);
    el.dataset.ko = m.date;
    const mid = el.querySelector('.match-mid');
    if (mid) {
      const status = compact && m.state === 'post' ? dateShort(m.date) : m.state === 'pre' ? '' : statusFR(m);
      mid.innerHTML = `<span class="mstatus">${m.state === 'in' ? '<i class="live-dot"></i>' : ''}<span class="st">${status}</span></span><span class="score">${scoreHTML(m)}</span>`;
    }
    el.querySelector('.team.home')?.classList.toggle('win', !!m.home.winner);
    el.querySelector('.team.away')?.classList.toggle('win', !!m.away.winner);
    maybeFlash(el, prev, next, m.state);
    el.dataset.score = next;
  }

  function updateMod(el, m) {
    const prev = el.dataset.score || '';
    const next = scoreKey(m);
    el.classList.remove('s-pre', 's-post', 's-in');
    el.classList.add('s-' + m.state);
    el.dataset.ko = m.date;
    const topRight = el.querySelector('.mod-top span:last-child');
    if (topRight) topRight.innerHTML = m.state === 'in' ? '<i class="live-dot"></i> En direct' : m.state === 'post' ? 'Terminé' : 'Le match à suivre';
    const box = el.querySelector('.mod-score');
    if (box && m.state !== 'pre') {
      box.innerHTML = `<span class="mod-h sc-big">${esc(m.home.score)} - ${esc(m.away.score)}</span><span class="mod-d st">${statusFR(m)}</span>`;
    }
    maybeFlash(el, prev, next, m.state);
    el.dataset.score = next;
  }

  function updateTickerEl(el, m) {
    const prev = el.dataset.score || '';
    const next = m.state === 'pre' ? hhmm(m.date) : `${m.home.score}-${m.away.score}`;
    el.classList.remove('s-pre', 's-post', 's-in');
    el.classList.add('s-' + m.state);
    el.dataset.ko = m.date;
    const b = el.querySelector('b');
    if (b) b.textContent = next;
    const dot = el.querySelector('.live-dot');
    if (m.state === 'in' && !dot) el.insertAdjacentHTML('beforeend', ' <i class="live-dot"></i>');
    if (m.state !== 'in' && dot) dot.remove();
    maybeFlash(el, prev, next, m.state);
    el.dataset.score = next;
  }

  function shouldShowInTicker(m) {
    const now = Date.now();
    if (m.state === 'in') return true;
    if (m.state === 'pre' && new Date(m.date) - now < 3 * 864e5 && new Date(m.date) - now > -36e5) return true;
    if (m.state === 'post' && now - new Date(m.date) < 36 * 36e5) return true;
    return false;
  }

  function addTickerItem(m) {
    const track = $('.ticker-track');
    if (!track) return;
    const tmp = document.createElement('div');
    tmp.innerHTML = tickerHTML(m) + tickerHTML(m);
    const a = tmp.children[0], b = tmp.children[1];
    const n = track.children.length;
    const mid = Math.floor(n / 2);
    track.insertBefore(a, track.firstChild);
    const second = track.children[mid + 1] || null;
    track.insertBefore(b, second);
  }

  function ensureDayBlock(pane, m, past) {
    const day = dayISO(m.date);
    const headingText = past ? 'Derniers résultats' : 'À venir';
    let h2 = [...pane.querySelectorAll('h2.pane-h')].find(h => h.textContent.trim() === headingText);
    if (!h2) {
      h2 = document.createElement('h2');
      h2.className = 'pane-h';
      h2.textContent = headingText;
      pane.querySelector('.empty')?.remove();
      if (past) pane.appendChild(h2);
      else pane.insertBefore(h2, pane.firstChild);
    }
    let block = null;
    for (let n = h2.nextElementSibling; n && !n.matches('h2'); n = n.nextElementSibling) {
      if (n.classList.contains('day-block') && n.dataset.day === day) { block = n; break; }
    }
    if (!block) {
      block = document.createElement('div');
      block.className = 'day-block';
      block.dataset.day = day;
      block.innerHTML = `<h3 class="day-h sm">${dayLong(m.date)}</h3>`;
      const blocks = [];
      for (let n = h2.nextElementSibling; n && !n.matches('h2'); n = n.nextElementSibling) {
        if (n.classList.contains('day-block')) blocks.push(n);
      }
      let inserted = false;
      for (const b of blocks) {
        const cmp = past ? b.dataset.day < day : b.dataset.day > day;
        if (cmp) { h2.parentNode.insertBefore(block, b); inserted = true; break; }
      }
      if (!inserted) {
        const last = blocks[blocks.length - 1];
        if (last) last.after(block);
        else h2.after(block);
      }
    }
    return block;
  }

  function insertMatchInBlock(block, el, m, past) {
    const rows = [...block.querySelectorAll('.match')];
    const t = new Date(m.date).getTime();
    let ref = null;
    for (const r of rows) {
      const rt = new Date(r.dataset.ko || 0).getTime();
      if (past ? rt < t : rt > t) { ref = r; break; }
    }
    if (ref) block.insertBefore(el, ref);
    else block.appendChild(el);
  }

  function placeResultRow(el, m) {
    const pane = document.getElementById('res-' + m.comp) || el.closest('[data-results]');
    if (!pane) return;
    const past = m.state !== 'pre';
    const block = ensureDayBlock(pane, m, past);
    if (el.parentElement !== block) insertMatchInBlock(block, el, m, past);
  }

  function applyEvent(m) {
    const nodes = $$(`[data-ev="${m.id}"]`);
    const prevScores = nodes.map(el => el.dataset.score || '');
    const had = nodes.length > 0;
    nodes.forEach(el => {
      if (el.classList.contains('tk')) updateTickerEl(el, m);
      else if (el.classList.contains('mod')) updateMod(el, m);
      else updateMatchEl(el, m);
    });
    if (had) {
      const row = nodes.find(el => el.classList.contains('match') && el.closest('[data-results]'));
      if (row) placeResultRow(row, m);
    }
    if (!had && shouldShowInTicker(m)) addTickerItem(m);
    if (!had && isToday(m.date)) {
      const pane = document.getElementById('res-' + m.comp);
      if (pane && !pane.querySelector(`[data-ev="${m.id}"]`)) {
        const tmp = document.createElement('div');
        tmp.innerHTML = matchRowHTML(m);
        const el = tmp.firstElementChild;
        placeResultRow(el, m);
        el.dataset.score = scoreKey(m);
      }
      if (m.comp === 'fra.1' && m.state !== 'pre') {
        const wres = $('#w-res');
        if (wres && !wres.querySelector(`[data-ev="${m.id}"]`)) {
          const tmp = document.createElement('div');
          tmp.innerHTML = matchRowHTML(m, true);
          const el = tmp.firstElementChild;
          el.dataset.score = scoreKey(m);
          wres.insertBefore(el, wres.firstChild);
        }
      }
    }
    return { id: m.id, scored: prevScores.some((p, i) => p && scoreKey(m) && p !== scoreKey(m) && m.state !== 'pre') };
  }

  function normEvent(e, compId) {
    const c = e.competitions?.[0] || {};
    const side = ha => {
      const t = (c.competitors || []).find(x => x.homeAway === ha) || {};
      return {
        id: t.team?.id, name: t.team?.displayName, short: t.team?.shortDisplayName || t.team?.displayName,
        abbr: t.team?.abbreviation, logo: t.team?.logo || null,
        score: t.score ?? null, winner: t.winner ?? null,
      };
    };
    const st = e.status?.type || {};
    return {
      id: String(e.id), comp: compId, date: e.date,
      state: st.state, status: st.name, detail: st.shortDetail || st.detail || '',
      clock: e.status?.displayClock || null,
      home: side('home'), away: side('away'),
      venue: c.venue?.fullName || null,
    };
  }

  let lastEvents = [];
  const lastByComp = {};

  function datesToFetch() {
    const dates = new Set();
    const now = new Date();
    dates.add(ymd(now));
    dates.add(ymd(new Date(now.getTime() - 12 * 3600e3))); // veille (matchs tardifs)
    return [...dates];
  }

  function hasLiveOrImminent() {
    const now = Date.now();
    const windowMs = 15 * 60 * 1000;
    if (lastEvents.some(m => m.state === 'in' || (m.state === 'pre' && new Date(m.date) - now <= windowMs && new Date(m.date) - now >= -60 * 1000))) return true;
    if ($$('.s-in[data-ev]').length) return true;
    for (const el of $$('[data-ko]')) {
      if (!el.classList.contains('s-pre') && !el.classList.contains('s-in') && el.dataset.ko) {
        // ticker/mod may not have s-pre yet
      }
      const t = new Date(el.dataset.ko).getTime();
      if (!isFinite(t)) continue;
      if (el.classList.contains('s-in')) return true;
      if (el.classList.contains('s-pre') && t - now <= windowMs && t - now >= -60 * 1000) return true;
    }
    return false;
  }

  async function tickScores() {
    const dates = datesToFetch();
    const ids = Object.keys(COMPS);
    const events = [];
    await Promise.all(ids.flatMap(id => dates.map(async d => {
      try {
        const r = await fetch(`${ESPN}/site/v2/sports/soccer/${id}/scoreboard?dates=${d}`);
        if (!r.ok) return;
        const j = await r.json();
        for (const e of j.events || []) events.push(normEvent(e, id));
      } catch {}
    })));
    const uniq = new Map();
    for (const m of events) uniq.set(m.id, m);
    lastEvents = [...uniq.values()];
    for (const id of ids) lastByComp[id] = lastEvents.filter(m => m.comp === id);
    for (const m of lastEvents) applyEvent(m);
    return lastEvents;
  }

  // ----- classements -----
  function parseStandings(j) {
    const groups = (j.children || []).map(ch => ({
      name: ch.name,
      rows: (ch.standings?.entries || []).map(en => {
        const s = Object.fromEntries((en.stats || []).map(x => [x.name, x.displayValue ?? x.value]));
        return {
          rank: +s.rank || null, team: en.team?.displayName, short: en.team?.shortDisplayName || en.team?.displayName,
          abbr: en.team?.abbreviation, logo: en.team?.logos?.[0]?.href || null,
          played: s.gamesPlayed, win: s.wins, draw: s.ties, loss: s.losses,
          gf: s.pointsFor, ga: s.pointsAgainst, gd: s.pointDifferential, pts: s.points,
          note: en.note?.description || null, noteColor: en.note?.color || null,
        };
      }).sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99)),
    }));
    return { season: j.children?.[0]?.name || j.name, groups };
  }

  function renderStandings(table, { compact = false } = {}) {
    if (!table) return '<p class="empty">Classement indisponible.</p>';
    return table.groups.map(g => {
      const notes = [...new Map(g.rows.filter(r => r.note).map(r => [r.note, r.noteColor])).entries()];
      return `${table.groups.length > 1 ? `<h4 class="grp">${esc(g.name)}</h4>` : ''}<div class="table-wrap"><table class="standings ${compact ? 'compact' : ''}">
    <thead><tr><th class="pos">#</th><th class="tm">Équipe</th><th class="pj">J</th>${compact ? '' : '<th class="num hide-m">G</th><th class="num hide-m">N</th><th class="num hide-m">P</th><th class="num hide-s">BP</th><th class="num hide-s">BC</th>'}<th class="gd">Diff</th><th class="pts">Pts</th></tr></thead>
    <tbody>${g.rows.map(r => `<tr class="${HL.includes(r.team) ? 'hl' : ''}"><td class="pos"><span class="zone" style="--z:${r.noteColor || 'transparent'}"></span>${r.rank}</td>
    <td class="tm"><span class="tmi">${r.logo ? `<img src="${r.logo}" alt="" loading="lazy" width="20" height="20">` : ''}<span class="tm-full">${esc(tn(compact ? r.short : r.team))}</span><span class="tm-short">${esc(tn(r.short || r.team))}</span></span></td><td class="pj">${r.played}</td>
    ${compact ? '' : `<td class="num hide-m">${r.win}</td><td class="num hide-m">${r.draw}</td><td class="num hide-m">${r.loss}</td><td class="num hide-s">${r.gf}</td><td class="num hide-s">${r.ga}</td>`}<td class="gd">${r.gd}</td><td class="pts">${r.pts}</td></tr>`).join('')}</tbody></table></div>
    ${!compact && notes.length ? `<ul class="legend">${notes.map(([n, c]) => `<li><span style="--z:${c}"></span>${esc(NOTE_FR[n] || n)}</li>`).join('')}</ul>` : ''}`;
    }).join('');
  }

  function updateClubRanks(id, table) {
    $$(`[data-club-rank][data-comp="${id}"]`).forEach(el => {
      const team = el.dataset.clubRank;
      const row = table.groups.flatMap(g => g.rows).find(r => r.team === team);
      if (!row) return;
      const strong = el.querySelector('strong');
      const span = el.querySelector('span');
      if (strong) strong.textContent = `${row.rank}${row.rank === 1 ? 'er' : 'e'}`;
      if (span) span.textContent = `${row.pts} pts`;
    });
  }

  async function tickStandings() {
    const wraps = $$('[data-standings][data-comp]');
    if (!wraps.length) return;
    const ids = [...new Set(wraps.map(w => w.dataset.comp).filter(Boolean))];
    await Promise.all(ids.map(async id => {
      try {
        const r = await fetch(`${ESPN}/v2/sports/soccer/${id}/standings`);
        if (!r.ok) return;
        const table = parseStandings(await r.json());
        $$(`[data-standings][data-comp="${id}"]`).forEach(w => {
          w.innerHTML = renderStandings(table, { compact: w.dataset.compact === '1' });
        });
        const season = (table.season || '').match(/\d{4}-\d{2,4}/)?.[0];
        if (season) {
          const pane = document.getElementById('st-' + id);
          const small = pane?.querySelector('h2.pane-h small');
          if (small) small.textContent = 'Saison ' + season;
        }
        updateClubRanks(id, table);
      } catch {}
    }));
  }

  function compIsLive(id) {
    if (lastByComp[id]?.some(m => m.state === 'in')) return true;
    return $$(`[data-comp="${id}"].s-in`).length > 0;
  }

  function desiredScoreInterval() { return hasLiveOrImminent() ? FAST_MS : SLOW_MS; }
  function desiredStandingsInterval() {
    const ids = [...new Set($$('[data-standings][data-comp]').map(w => w.dataset.comp))];
    return ids.some(compIsLive) ? ST_LIVE_MS : ST_IDLE_MS;
  }

  let scoreTimer = 0, standTimer = 0, scoreGen = 0, standGen = 0, scoreBusy = false, standBusy = false;

  function armScores() {
    clearTimeout(scoreTimer);
    const gen = ++scoreGen;
    if (document.hidden) return;
    scoreTimer = setTimeout(async () => {
      if (gen !== scoreGen || document.hidden) return;
      if (!scoreBusy) {
        scoreBusy = true;
        try { await tickScores(); } finally { scoreBusy = false; }
      }
      if (gen === scoreGen) armScores();
    }, desiredScoreInterval());
  }
  function armStandings() {
    clearTimeout(standTimer);
    const gen = ++standGen;
    if (document.hidden || !$$('[data-standings][data-comp]').length) return;
    standTimer = setTimeout(async () => {
      if (gen !== standGen || document.hidden) return;
      if (!standBusy) {
        standBusy = true;
        try { await tickStandings(); } finally { standBusy = false; }
      }
      if (gen === standGen) armStandings();
    }, desiredStandingsInterval());
  }

  async function startLive() {
    scoreBusy = true;
    try { await tickScores(); } finally { scoreBusy = false; }
    armScores();
    if ($$('[data-standings][data-comp]').length) {
      standBusy = true;
      try { await tickStandings(); } finally { standBusy = false; }
      armStandings();
    }
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      scoreGen++; standGen++;
      clearTimeout(scoreTimer); clearTimeout(standTimer);
      return;
    }
    startLive();
  });

  startLive();

  window.ActuSportLive = {
    pollScores: tickScores,
    pollStandings: tickStandings,
    intervals: () => ({
      scores: document.hidden ? 0 : desiredScoreInterval(),
      standings: document.hidden || !$$('[data-standings][data-comp]').length ? 0 : desiredStandingsInterval(),
    }),
  };
})();
