// Commentaires pré-modérés (sans cookie, sans traceur). Seuls les commentaires approuvés s'affichent.
(function () {
  var box = document.getElementById('commentaires');
  if (!box || !window.fetch) return;
  var api = box.getAttribute('data-api'), slug = box.getAttribute('data-slug');
  var list = box.querySelector('.cm-list'), count = box.querySelector('.cm-count');
  var form = box.querySelector('form'), msg = box.querySelector('.cm-msg');
  var fmt = function (iso) {
    try { return new Date(iso).toLocaleString('fr-FR', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' }).replace(':', 'h'); } catch (e) { return ''; }
  };
  function render(items) {
    list.textContent = '';
    count.textContent = items.length ? '(' + items.length + ')' : '';
    if (!items.length) {
      var p = document.createElement('p'); p.className = 'cm-empty'; p.textContent = 'Aucun commentaire pour le moment. Sois le premier à réagir !';
      list.appendChild(p); return;
    }
    items.forEach(function (c) {
      var li = document.createElement('li'); li.className = 'cm-item';
      var h = document.createElement('div'); h.className = 'cm-head';
      var b = document.createElement('strong'); b.textContent = c.pseudo;
      var t = document.createElement('time'); t.dateTime = c.created_at; t.textContent = fmt(c.created_at);
      h.appendChild(b); h.appendChild(t);
      var p = document.createElement('p'); p.className = 'cm-body'; p.textContent = c.body;
      li.appendChild(h); li.appendChild(p); list.appendChild(li);
    });
  }
  fetch(api + '/comments?slug=' + encodeURIComponent(slug), { credentials: 'omit' })
    .then(function (r) { return r.json(); })
    .then(function (d) { render((d && d.comments) || []); })
    .catch(function () { list.textContent = ''; var p = document.createElement('p'); p.className = 'cm-empty'; p.textContent = 'Les commentaires sont momentanément indisponibles.'; list.appendChild(p); });
  var ta = form.querySelector('textarea'), left = box.querySelector('.cm-left');
  var upd = function () { left.textContent = (1000 - ta.value.length) + ' caractères restants'; };
  ta.addEventListener('input', upd); upd();
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var btn = form.querySelector('button'); btn.disabled = true;
    msg.className = 'cm-msg'; msg.textContent = 'Envoi…';
    var data = { slug: slug, pseudo: form.pseudo.value, text: form.text.value, website: form.website.value };
    fetch(api + '/comments', { method: 'POST', credentials: 'omit', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
      .then(function (r) { return r.json().catch(function () { return { ok: false }; }); })
      .then(function (d) {
        if (d && d.ok) { msg.className = 'cm-msg ok'; msg.textContent = 'Merci ! Ton commentaire a bien été reçu. Il sera publié après modération.'; form.text.value = ''; upd(); }
        else { msg.className = 'cm-msg err'; msg.textContent = (d && d.error) || 'Envoi impossible, réessaie plus tard.'; }
      })
      .catch(function () { msg.className = 'cm-msg err'; msg.textContent = 'Envoi impossible, réessaie plus tard.'; })
      .then(function () { btn.disabled = false; });
  });
})();
