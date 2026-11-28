// Quiz du jour (/quiz/) : questions générées chaque jour à partir des données du site, les mêmes pour tout le monde.
import { decodeSecret, frDate, JEUX_DATA, parisDate, quizShareText, quizVerdict, SITE, xIntent } from './jeux-core.js?v=095f69cd';

const root = document.getElementById('quiz');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const getJSON = async u => { const r = await fetch(u, { headers: { Accept: 'application/json' } }); if (!r.ok) throw new Error(String(r.status)); return r.json(); };
const S = { quiz: null, ans: [], picks: [], i: 0, date: null };
const KEY = d => `quiz-${d}`;
const save = () => { try { localStorage.setItem(KEY(S.date), JSON.stringify({ picks: S.picks })); } catch {} };
const load = d => { try { return JSON.parse(localStorage.getItem(KEY(d)) || 'null'); } catch { return null; } };

function qHtml() {
  const q = S.quiz.questions[S.i], n = S.quiz.questions.length, picked = S.picks[S.i], done = picked != null, good = S.ans[S.i];
  return `<div class="qz-prog" aria-hidden="true">${S.quiz.questions.map((_, k) => `<span class="${k < S.picks.length ? (S.picks[k] === S.ans[k] ? 'ok' : 'ko') : k === S.i ? 'cur' : ''}"></span>`).join('')}</div>
  <p class="qz-num">Question ${S.i + 1} sur ${n}</p>
  <h2 class="qz-q" id="qz-q" tabindex="-1">${esc(q.q)}</h2>
  <div class="qz-choices" role="group" aria-labelledby="qz-q">${q.choices.map((c, k) => `<button type="button" class="qz-c${done ? (k === good ? ' good' : k === picked ? ' bad' : '') : ''}" data-c="${k}"${done ? ' disabled' : ''}>${esc(c)}${done && k === good ? ' <span class="sr-only">(bonne réponse)</span>' : ''}</button>`).join('')}</div>
  ${done ? `<div class="qz-exp ${picked === good ? 'ok' : 'ko'}" role="status"><b>${picked === good ? 'Bonne réponse !' : `Raté : la bonne réponse était « ${esc(q.choices[good])} ».`}</b><p>${esc(q.explain)}</p><a href="${esc(q.src)}">Vérifier sur le site →</a></div>
  <button type="button" class="jx-btn qz-next" data-next>${S.i + 1 < n ? 'Question suivante' : 'Voir mon score'}</button>` : ''}`;
}
function endHtml() {
  const n = S.quiz.questions.length, res = S.picks.map((p, k) => p === S.ans[k]), ok = res.filter(Boolean).length;
  const text = quizShareText(S.date, res, n);
  return `<div class="qz-end"><p class="qz-score"><b>${ok}/${n}</b></p><p class="qz-verdict">${esc(quizVerdict(ok, n))}</p>
    <p class="qz-grid" aria-label="${ok} bonnes réponses sur ${n}">${res.map(x => (x ? '✅' : '❌')).join('')}</p>
    <div class="jx-share"><button type="button" class="jx-btn" data-copy>Copier mon score</button><a class="jx-btn jx-x" href="${esc(xIntent(text.split('\n')[0], `${SITE}/quiz/`))}" target="_blank" rel="noopener">Partager sur X</a></div>
    <p class="jx-copied" role="status" aria-live="polite"></p>
    <p class="qz-next-day">Nouveau quiz demain. En attendant, <a href="/jeux/">découvre les autres jeux</a>.</p></div>
  <h2 class="qz-rh">Les réponses</h2><ol class="qz-recap">${S.quiz.questions.map((q, k) => `<li class="${res[k] ? 'ok' : 'ko'}"><p>${esc(q.q)}</p><p><b>${esc(q.choices[S.ans[k]])}</b>${res[k] ? '' : ` <span>(ta réponse : ${esc(q.choices[S.picks[k]])})</span>`}</p><p class="qz-x">${esc(q.explain)} <a href="${esc(q.src)}">Source</a></p></li>`).join('')}</ol>`;
}
function render(focus) {
  const finished = S.picks.length === S.quiz.questions.length && S.i >= S.quiz.questions.length;
  root.innerHTML = `<p class="qz-date">Quiz du ${frDate(S.date)}${S.date !== parisDate() ? ' (le quiz du jour arrive bientôt)' : ''} · ${S.quiz.questions.length} questions</p>${finished ? endHtml() : qHtml()}`;
  if (focus) root.querySelector(finished ? '.qz-score' : '#qz-q')?.focus?.();
}
root.addEventListener('click', async e => {
  const c = e.target.closest('[data-c]');
  if (c && S.picks[S.i] == null) { S.picks[S.i] = Number(c.dataset.c); save(); render(); root.querySelector('.qz-exp')?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' }); return; }
  if (e.target.closest('[data-next]')) { S.i++; render(true); root.scrollIntoView?.({ block: 'start' }); return; }
  if (e.target.closest('[data-copy]')) {
    const res = S.picks.map((p, k) => p === S.ans[k]), text = quizShareText(S.date, res, S.quiz.questions.length);
    try { await navigator.clipboard.writeText(text); root.querySelector('.jx-copied').textContent = 'Score copié, sans les réponses.'; } catch { root.querySelector('.jx-copied').textContent = text; }
  }
});
(async () => {
  try {
    const today = parisDate(), idx = await getJSON(`${JEUX_DATA}/quiz/index.json`);
    S.date = idx.dates.includes(today) ? today : idx.dates.filter(d => d <= today).pop();
    if (!S.date) throw new Error('aucun quiz');
    S.quiz = await getJSON(`${JEUX_DATA}/quiz/${S.date}.json`);
    S.ans = decodeSecret(`quiz|${S.date}`, S.quiz.k) || [];
    const st = load(S.date);
    S.picks = (st?.picks || []).slice(0, S.quiz.questions.length).filter(p => Number.isInteger(p));
    S.i = S.picks.length >= S.quiz.questions.length ? S.quiz.questions.length : S.picks.length;
    render();
  } catch { root.innerHTML = '<p class="jx-err">Le quiz n’a pas pu être chargé. Réessaie dans un instant.</p>'; }
})();
