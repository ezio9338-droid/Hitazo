/* Hitazo — juego musical de líneas temporales */
'use strict';

const COLORS = ['#e9a93a', '#7fbf9a', '#e98a6b', '#9fb6e8', '#d9a3d0', '#f0d36b', '#8fd0d0', '#c9b6a0'];
const DECADES = [
  { id: '60', label: 'Hasta los 60', from: 0, to: 1969 },
  { id: '70', label: '70s', from: 1970, to: 1979 },
  { id: '80', label: '80s', from: 1980, to: 1989 },
  { id: '90', label: '90s', from: 1990, to: 1999 },
  { id: '00', label: '2000s', from: 2000, to: 2009 },
  { id: '10', label: '2010s', from: 2010, to: 2019 },
  { id: '20', label: '2020s', from: 2020, to: 2099 },
];
const LISTS = [
  { id: 'es', label: 'Éxitos en español' },
  { id: 'int', label: 'Éxitos internacionales' },
];
const CLIPS = [
  { id: 15, label: '15 s' },
  { id: 30, label: '30 s' },
  { id: 60, label: '1 min' },
  { id: 0, label: 'Entera' },
];
const STARTS = [
  { id: 'auto', label: 'En la parte buena o al azar' },
  { id: 0, label: 'Desde el principio' },
];
const SAVE_KEY = 'hitazo-partida-v1';
const PREFS_KEY = 'hitazo-ajustes-v2';
const MOMENTS_KEY = 'hitazo-momentos'; // momentos marcados en el editor de este dispositivo

let SONGS = [];
let state = null;          // partida en curso
let prefs = loadPrefs();   // ajustes de la portada
let player = null, playerReady = false;
let clipTimer = null, progressTimer = null, clipStartedAt = 0, clipElapsed = 0;
let isPlaying = false;

const $app = document.getElementById('app');
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ---------- Almacenamiento ---------- */
function loadPrefs() {
  const def = { players: ['Jugador 1', 'Jugador 2'], target: 10, lists: ['es', 'int'], decades: DECADES.map(d => d.id), clip: 30, start: 'auto' };
  try { return Object.assign(def, JSON.parse(localStorage.getItem(PREFS_KEY)) || {}); } catch { return def; }
}
function savePrefs() { try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch {} }
function saveGame() { try { state ? localStorage.setItem(SAVE_KEY, JSON.stringify(state)) : localStorage.removeItem(SAVE_KEY); } catch {} }
function loadGame() { try { return JSON.parse(localStorage.getItem(SAVE_KEY)); } catch { return null; } }

/* ---------- Utilidades ---------- */
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg; el.classList.add('show');
  clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove('show'), 3200);
}
function initial(name) { return (name.trim()[0] || '?').toUpperCase(); }
function pool() {
  const decs = DECADES.filter(d => prefs.decades.includes(d.id));
  return SONGS.filter(s => prefs.lists.includes(s.l) && s.v && decs.some(d => s.y >= d.from && s.y <= d.to));
}

/* ---------- Portada ---------- */
function renderSetup() {
  stopAudio();
  const saved = loadGame();
  const n = pool().length;
  const need = prefs.players.length * (prefs.target + 4);
  $app.innerHTML = `
    <h1 class="logo">Hitazo</h1>
    <p class="tagline">Suena una canción. Adivina el artista y el título, y colócala en tu línea temporal: ¿es anterior o posterior a las que ya tienes? Cada acierto vale un punto. Cuando alguien completa su línea, gana quien más puntos tenga.</p>
    ${saved ? `<div class="panel" style="margin-bottom:18px;display:flex;flex-wrap:wrap;gap:12px;align-items:center;justify-content:space-between">
        <span>Tienes una partida a medias.</span>
        <span style="display:flex;gap:10px"><button class="btn small" data-act="resume">Continuar partida</button><button class="btn small ghost" data-act="discard">Descartar</button></span>
      </div>` : ''}
    <div class="setup">
      <section class="panel">
        <h2>Jugadores</h2>
        <p class="hint">De 2 a 8 jugadores o equipos. Os pasáis el móvil en cada turno.</p>
        <ul class="players">
          ${prefs.players.map((p, i) => `
            <li>
              <span class="dot" style="background:${COLORS[i]}">${esc(initial(p))}</span>
              <input value="${esc(p)}" data-player="${i}" maxlength="20" aria-label="Nombre del jugador ${i + 1}">
              ${prefs.players.length > 2 ? `<button class="icon-btn" data-remove="${i}" aria-label="Quitar a ${esc(p)}">×</button>` : ''}
            </li>`).join('')}
        </ul>
        ${prefs.players.length < 8 ? `<button class="btn small ghost" data-act="add">Añadir jugador</button>` : ''}
      </section>
      <section class="panel">
        <h2>Partida</h2>
        <div class="field">
          <span class="label">Cartas para ganar</span>
          <div class="stepper">
            <button data-act="minus" aria-label="Menos cartas">−</button>
            <output>${prefs.target}</output>
            <button data-act="plus" aria-label="Más cartas">+</button>
          </div>
        </div>
        <div class="field">
          <span class="label">Canciones</span>
          <div class="chips">${LISTS.map(l => chip('list', l.id, l.label, prefs.lists.includes(l.id))).join('')}</div>
        </div>
        <div class="field">
          <span class="label">Décadas</span>
          <div class="chips">${DECADES.map(d => chip('decade', d.id, d.label, prefs.decades.includes(d.id))).join('')}</div>
        </div>
        <div class="field">
          <span class="label">Cuánto suena cada canción</span>
          <div class="chips">${CLIPS.map(c => chip('clip', c.id, c.label, prefs.clip === c.id, 'radio')).join('')}</div>
        </div>
        <div class="field">
          <span class="label">Empezar a sonar</span>
          <div class="chips">${STARTS.map(c => chip('start', c.id, c.label, prefs.start === c.id, 'radio')).join('')}</div>
        </div>
      </section>
    </div>
    <div class="start-row">
      <button class="btn berry" data-act="start" ${n < need ? 'disabled' : ''}>Empezar partida</button>
      <span class="pool-count">${n < need
        ? `Con esta selección solo hay ${n} canciones y hacen falta unas ${need}. Elige más décadas o listas, o baja las cartas para ganar.`
        : `${n} canciones en juego`}</span>
    </div>
    <p class="editor-link"><a href="editor.html">Marcar la parte buena de cada canción</a></p>`;
}
function chip(group, value, label, checked, type = 'checkbox') {
  return `<label class="chip"><input type="${type}" name="${group}" value="${value}" ${checked ? 'checked' : ''}><span>${esc(label)}</span></label>`;
}

$app.addEventListener('input', e => {
  const i = e.target.dataset.player;
  if (i !== undefined) {
    prefs.players[i] = e.target.value;
    const dot = e.target.parentElement.querySelector('.dot');
    if (dot) dot.textContent = initial(e.target.value);
    savePrefs();
  }
});
$app.addEventListener('change', e => {
  const t = e.target;
  if (!t.name) return;
  if (t.name === 'list' || t.name === 'decade') {
    const key = t.name === 'list' ? 'lists' : 'decades';
    prefs[key] = [...$app.querySelectorAll(`input[name="${t.name}"]:checked`)].map(x => x.value);
  }
  if (t.name === 'clip') prefs.clip = +t.value;
  if (t.name === 'start') prefs.start = t.value === 'auto' ? 'auto' : +t.value;
  savePrefs(); renderSetup();
});

/* ---------- Acciones ---------- */
$app.addEventListener('click', e => {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.dataset.remove !== undefined) { prefs.players.splice(+b.dataset.remove, 1); savePrefs(); return renderSetup(); }
  if (b.dataset.slot !== undefined) return selectSlot(+b.dataset.slot);
  switch (b.dataset.act) {
    case 'add': prefs.players.push(`Jugador ${prefs.players.length + 1}`); savePrefs(); renderSetup();
      $app.querySelector(`input[data-player="${prefs.players.length - 1}"]`)?.select(); break;
    case 'minus': prefs.target = Math.max(3, prefs.target - 1); savePrefs(); renderSetup(); break;
    case 'plus': prefs.target = Math.min(30, prefs.target + 1); savePrefs(); renderSetup(); break;
    case 'start': startGame(); break;
    case 'resume': state = loadGame(); state.players.forEach(p => { p.points ??= 0; }); renderGame(); break;
    case 'discard': state = null; saveGame(); renderSetup(); break;
    case 'play': playClip(); break;
    case 'pause': pauseAudio(); break;
    case 'more': keepPlaying(); break;
    case 'place': placeCard(); break;
    case 'next': nextTurn(); break;
    case 'quit':
      if (confirm('¿Terminar la partida? Se perderá el progreso.')) { state = null; saveGame(); renderSetup(); }
      break;
    case 'again': state = null; saveGame(); renderSetup(); break;
  }
});

/* ---------- Partida ---------- */
function startGame() {
  const names = prefs.players.map((p, i) => p.trim() || `Jugador ${i + 1}`);
  const deck = shuffle(pool());
  state = {
    players: names.map(name => ({ name, cards: [deck.pop()], points: 0 })),
    deck, turn: 0, current: deck.pop(), phase: 'listen', selected: null, guess: { a: '', t: '' },
    target: prefs.target, clip: prefs.clip, start: prefs.start, last: null,
  };
  state.players.forEach(p => p.cards.sort((a, b) => a.y - b.y));
  saveGame(); renderGame();
}

function renderGame() {
  if (!state) return renderSetup();
  const p = state.players[state.turn];
  const revealed = state.phase === 'revealed';
  const s = state.current;
  const cards = p.cards;
  state.guess ??= { a: '', t: '' };
  const L = state.last;

  $app.innerHTML = `
    <div class="topbar">
      <span class="mini-logo">Hitazo</span>
      <button class="link" data-act="quit">Terminar partida</button>
    </div>
    <div class="scores">
      ${state.players.map((pl, i) => `<span class="score ${i === state.turn ? 'active' : ''}">
        <span class="dot" style="background:${COLORS[i]}">${esc(initial(pl.name))}</span>${esc(pl.name)}
        <b>${pl.points ?? 0} pts</b><span class="cards-count">${pl.cards.length}/${state.target}</span></span>`).join('')}
    </div>
    <h1 class="turn-title">Turno de ${esc(p.name)}</h1>
    <p class="turn-sub">${revealed ? '' : 'Escucha, intenta adivinar artista y canción, y elige su sitio en tu línea.'}</p>

    <section class="deck">
      <div class="record ${revealed ? 'revealed' : ''} ${isPlaying ? 'spinning' : ''}" id="record">
        <div class="disc"><div class="label">
          <span class="q">${revealed ? s.y : '?'}</span><span class="hole"></span>
        </div></div>
      </div>
      ${revealed ? `
        <div class="reveal-info">
          <div class="song">${esc(s.t)}</div>
          <div class="artist">${esc(s.a)} · ${s.y}</div>
        </div>
        <ul class="results">
          ${resultRow('Año', L.ok, L.ok ? 'Bien colocada' : 'No encaja en tu línea')}
          ${resultRow('Artista', L.artistOk, L.ga ? `Dijiste «${esc(L.ga)}»` : 'Sin respuesta')}
          ${resultRow('Canción', L.titleOk, L.gt ? `Dijiste «${esc(L.gt)}»` : 'Sin respuesta')}
        </ul>
        <p class="verdict ${L.gained ? 'ok' : 'ko'}">${L.gained ? `+${L.gained} ${L.gained === 1 ? 'punto' : 'puntos'}` : 'Sin puntos esta vez'}</p>`
      : `<div class="progress" aria-hidden="true"><i id="bar"></i></div>`}
      <div class="controls" id="controls">${controlsHTML()}</div>
    </section>

    ${revealed ? '' : `
    <section class="guess" aria-label="Adivina la canción">
      ${guessField('a', 'Artista', 'Empieza a escribir, p. ej. «elvi»')}
      ${guessField('t', 'Canción', 'Título de la canción')}
      <p class="guess-hint">Opcional. Cada acierto suma 1 punto, igual que colocar bien la carta.</p>
    </section>`}

    <div class="timeline-head">
      <h2>Línea de ${esc(p.name)}</h2>
      <span>${cards.length} de ${state.target} cartas</span>
    </div>
    <div class="timeline" id="timeline">${timelineHTML()}</div>

    <div class="place-bar">
      ${revealed
        ? `<button class="btn berry" data-act="next">${winnerIndex() >= 0 ? 'Ver resultado final' : 'Siguiente turno'}</button>`
        : `<button class="btn" data-act="place" id="place-btn" ${state.selected === null ? 'disabled' : ''}>${state.selected === null ? 'Toca un hueco de tu línea' : 'Colocar aquí y ver el año'}</button>`}
    </div>`;
}
function timelineHTML() {
  const p = state.players[state.turn], cards = p.cards, s = state.current;
  const revealed = state.phase === 'revealed';
  let html = '';
  for (let i = 0; i <= cards.length; i++) {
    if (revealed && state.last?.index === i && !state.last.ok) html += cardHTML(s, 'wrong new');
    if (!revealed) {
      const sel = state.selected === i;
      html += `<button class="slot ${sel ? 'selected' : ''}" data-slot="${i}" aria-label="Colocar ${slotLabel(cards, i)}">${sel ? 'Aquí' : '+'}</button>`;
    }
    if (i < cards.length) html += cardHTML(cards[i], revealed && state.last?.ok && cards[i].v === s.v ? 'new' : '');
  }
  return html;
}
function selectSlot(i) {
  state.selected = i; saveGame();
  document.getElementById('timeline').innerHTML = timelineHTML();
  const b = document.getElementById('place-btn');
  if (b) { b.disabled = false; b.textContent = 'Colocar aquí y ver el año'; }
}
function resultRow(label, ok, detail) {
  return `<li class="${ok ? 'ok' : 'ko'}"><span class="mark" aria-hidden="true">${ok ? '✓' : '✗'}</span>
    <span><b>${label}</b> <span class="detail">${detail}</span></span></li>`;
}
function guessField(key, label, placeholder) {
  return `<div class="ac">
    <label for="g-${key}">${label}</label>
    <input id="g-${key}" data-guess="${key}" value="${esc(state.guess[key])}" placeholder="${placeholder}"
      autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false"
      role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="sg-${key}">
    <ul class="suggest" id="sg-${key}" role="listbox" hidden></ul>
  </div>`;
}
function controlsHTML() {
  if (isPlaying) return `<button class="btn ghost" data-act="pause">Pausar</button>`;
  const first = clipElapsed === 0;
  return `<button class="btn" data-act="play">${first ? 'Escuchar' : 'Volver a escuchar'}</button>
    ${!first ? `<button class="btn ghost" data-act="more">Seguir escuchando</button>` : ''}`;
}
function refreshControls() {
  const c = document.getElementById('controls');
  if (c) c.innerHTML = controlsHTML();
  document.getElementById('record')?.classList.toggle('spinning', isPlaying);
}
function cardHTML(s, cls = '') {
  return `<div class="card ${cls}"><span class="year">${s.y}</span><span class="t">${esc(s.t)}</span><span class="a">${esc(s.a)}</span></div>`;
}
function slotLabel(cards, i) {
  if (!cards.length) return 'aquí';
  if (i === 0) return `antes de ${cards[0].y}`;
  if (i === cards.length) return `después de ${cards[i - 1].y}`;
  return `entre ${cards[i - 1].y} y ${cards[i].y}`;
}

function placeCard() {
  if (state.selected === null) return;
  const p = state.players[state.turn];
  const i = state.selected, y = state.current.y, c = p.cards;
  const ok = (i === 0 || c[i - 1].y <= y) && (i === c.length || y <= c[i].y);
  if (ok) c.splice(i, 0, state.current);
  const ga = state.guess.a.trim(), gt = state.guess.t.trim();
  const artistOk = !!ga && artistMatches(ga, state.current.a);
  const titleOk = !!gt && titleMatches(gt, state.current.t);
  const gained = ok + artistOk + titleOk;
  p.points = (p.points ?? 0) + gained;
  state.last = { ok, index: i, artistOk, titleOk, ga, gt, gained };
  state.phase = 'revealed';
  saveGame(); renderGame();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
function winnerIndex() { return state.players.findIndex(p => p.cards.length >= state.target); }

function nextTurn() {
  stopAudio();
  if (winnerIndex() >= 0) return renderWinner();
  if (!state.deck.length) { toast('Se han acabado las canciones.'); return renderWinner(); }
  state.turn = (state.turn + 1) % state.players.length;
  state.current = state.deck.pop();
  state.phase = 'listen'; state.selected = null; state.last = null; state.guess = { a: '', t: '' };
  clipElapsed = 0;
  saveGame(); renderGame();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// Gana quien más puntos tenga; en caso de empate, quien tenga más cartas.
function renderWinner() {
  const ranking = state.players.slice().sort((a, b) => (b.points - a.points) || (b.cards.length - a.cards.length));
  const top = ranking.filter(p => p.points === ranking[0].points && p.cards.length === ranking[0].cards.length);
  const title = top.length > 1 ? `¡Empate entre ${top.map(p => esc(p.name)).join(' y ')}!` : `¡Gana ${esc(top[0].name)}!`;
  $app.innerHTML = `
    <section class="winner">
      <h1>${title}</h1>
      <div class="record revealed spinning"><div class="disc"><div class="label"><span class="q">${ranking[0].points}</span><span class="hole"></span></div></div></div>
      <ul class="final-scores">${ranking.map(p => `<li><span>${esc(p.name)}</span><span><b>${p.points} pts</b> · ${p.cards.length} cartas</span></li>`).join('')}</ul>
      <button class="btn berry" data-act="again">Nueva partida</button>
    </section>`;
  state = null; saveGame();
}

/* ---------- Adivinar artista y título ---------- */
const norm = s => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/&/g, ' y ').replace(/[^a-z0-9ñ ]/g, ' ').replace(/\s+/g, ' ').trim().replace(/^the /, '');
// Distancia de edición (para perdonar erratas pequeñas)
function lev(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++)
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}
function close(guess, target) {
  const g = norm(guess), t = norm(target);
  if (!g || !t) return false;
  if (g === t) return true;
  const tol = t.length >= 12 ? 2 : t.length >= 5 ? 1 : 0;
  return lev(g, t) <= tol;
}
// Para dúos y colaboraciones vale cualquiera de los artistas
const artistParts = a => [a, ...a.split(/\s+(?:y|ft\.|feat\.|x)\s+/i)];
function artistMatches(guess, artist) { return artistParts(artist).some(part => close(guess, part)); }
function titleMatches(guess, title) {
  const short = title.replace(/\s*\(.*?\)\s*/g, ' ').trim();   // «Sweet Dreams (Are Made of This)» → «Sweet Dreams»
  const afterColon = title.includes(':') ? title.split(':')[0] : null; // «Quevedo: Bzrp…» → «Quevedo»
  return [title, short, afterColon].some(t => t && close(guess, t));
}

let OPTIONS = { a: [], t: [] };
function buildOptions() {
  const fullArtists = new Set(SONGS.map(s => s.a));
  const artists = new Set(fullArtists);
  // Añadimos también a los artistas de las colaboraciones que tienen canciones propias (Shakira, Bruno Mars…)
  SONGS.forEach(s => artistParts(s.a).slice(1).forEach(p => { if (fullArtists.has(p)) artists.add(p); }));
  const sortEs = (x, y) => x.localeCompare(y, 'es');
  OPTIONS = {
    a: [...artists].sort(sortEs).map(v => ({ v, n: norm(v) })),
    t: [...new Set(SONGS.map(s => s.t))].sort(sortEs).map(v => ({ v, n: norm(v) })),
  };
}
function suggestions(key, text) {
  const q = norm(text);
  if (!q) return [];
  const scored = [];
  for (const o of OPTIONS[key]) {
    let r = -1;
    if (o.n.startsWith(q)) r = 0;
    else if (o.n.split(' ').some(w => w.startsWith(q))) r = 1;
    else if (o.n.includes(q)) r = 2;
    if (r >= 0) scored.push([r, o.v]);
  }
  return scored.sort((a, b) => a[0] - b[0]).slice(0, 7).map(x => x[1]);
}
let acActive = -1;
function showSuggest(input) {
  const key = input.dataset.guess, list = document.getElementById('sg-' + key);
  const items = suggestions(key, input.value);
  acActive = -1;
  const exact = items.length === 1 && norm(items[0]) === norm(input.value);
  if (!items.length || exact) { list.hidden = true; input.setAttribute('aria-expanded', 'false'); return; }
  list.innerHTML = items.map((v, i) => `<li role="option" id="sg-${key}-${i}" data-pick="${esc(v)}">${highlight(v, input.value)}</li>`).join('');
  list.hidden = false; input.setAttribute('aria-expanded', 'true');
}
function highlight(v, q) {
  // Resalta la parte que coincide, sin perder tildes del texto original
  const nv = v.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const nq = q.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
  const i = nq ? nv.indexOf(nq) : -1;
  if (i < 0 || nv.length !== v.length) return esc(v);
  return esc(v.slice(0, i)) + '<mark>' + esc(v.slice(i, i + nq.length)) + '</mark>' + esc(v.slice(i + nq.length));
}
function pickSuggestion(input, value) {
  input.value = value; state.guess[input.dataset.guess] = value; saveGame();
  hideSuggest(input);
  // Pasar al siguiente campo para escribir rápido en el móvil
  if (input.dataset.guess === 'a') document.getElementById('g-t')?.focus(); else input.blur();
}
function hideSuggest(input) {
  const list = document.getElementById('sg-' + input.dataset.guess);
  if (list) list.hidden = true;
  input.setAttribute('aria-expanded', 'false');
}
$app.addEventListener('input', e => {
  const k = e.target.dataset.guess;
  if (!k) return;
  state.guess[k] = e.target.value; saveGame();
  showSuggest(e.target);
});
$app.addEventListener('focusin', e => {
  if (e.target.dataset.guess && e.target.value) showSuggest(e.target);
  // En el móvil, que el teclado no tape el campo ni el desplegable
  if (e.target.dataset.guess) setTimeout(() => e.target.scrollIntoView({ block: 'center', behavior: 'smooth' }), 250);
});
$app.addEventListener('focusout', e => {
  if (e.target.dataset.guess) setTimeout(() => hideSuggest(e.target), 150);
});
// pointerdown para elegir antes de que el campo pierda el foco
$app.addEventListener('pointerdown', e => {
  const li = e.target.closest('[data-pick]');
  if (!li) return;
  e.preventDefault();
  const input = li.closest('.ac').querySelector('input');
  pickSuggestion(input, li.dataset.pick);
});
$app.addEventListener('keydown', e => {
  const input = e.target;
  if (!input.dataset?.guess) return;
  const list = document.getElementById('sg-' + input.dataset.guess);
  const items = list && !list.hidden ? [...list.children] : [];
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    if (!items.length) return;
    e.preventDefault();
    acActive = (acActive + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
    items.forEach((li, i) => li.setAttribute('aria-selected', i === acActive));
    input.setAttribute('aria-activedescendant', items[acActive].id);
  } else if (e.key === 'Enter') {
    e.preventDefault();
    if (items.length) pickSuggestion(input, items[Math.max(0, acActive)].dataset.pick);
    else if (input.dataset.guess === 'a') document.getElementById('g-t')?.focus();
    else input.blur();
  } else if (e.key === 'Escape') hideSuggest(input);
});

/* ---------- Audio (YouTube) ---------- */
window.onYouTubeIframeAPIReady = function () {
  player = new YT.Player('yt', {
    host: 'https://www.youtube-nocookie.com', // modo de privacidad mejorada
    width: 200, height: 200,
    playerVars: { controls: 0, disablekb: 1, playsinline: 1, rel: 0, fs: 0, iv_load_policy: 3 },
    events: {
      onReady: () => { playerReady = true; },
      onStateChange: onPlayerState,
      onError: onPlayerError,
    },
  });
};
function onPlayerState(e) {
  if (e.data === YT.PlayerState.PLAYING) {
    hideUnlock();
    isPlaying = true; refreshControls();
    clipStartedAt = performance.now() - clipElapsed * 1000;
    tickProgress();
  } else if (e.data === YT.PlayerState.PAUSED || e.data === YT.PlayerState.ENDED) {
    isPlaying = false; refreshControls();
    cancelAnimationFrame(progressTimer);
  }
}
function onPlayerError() {
  stopAudio();
  if (!state || state.phase !== 'listen') return;
  if (!state.deck.length) return toast('Esta canción no se puede reproducir y no quedan más.');
  state.current = state.deck.pop();
  clipElapsed = 0; saveGame(); renderGame();
  toast('Esa canción no se puede reproducir aquí. Pulsa Escuchar para oír otra.');
}
function playClip() {
  if (!playerReady) return toast('El reproductor aún se está cargando. Prueba en un segundo.');
  const s = state.current;
  clipElapsed = 0;
  clearTimeout(clipTimer);
  let start = 0;
  if (state.start === 'auto') {
    const local = loadMoments();
    const marked = s.v in local ? local[s.v] : s.s;
    if (marked != null) start = marked;
    else {
      // Sin momento marcado: punto al azar entre el 25 y el 60 % de la canción.
      // Se guarda para que "Volver a escuchar" repita el mismo trozo.
      if (s.rs == null) { s.rs = Math.round((s.d || 200) * (0.25 + Math.random() * 0.35)); saveGame(); }
      start = s.rs;
    }
  }
  player.loadVideoById({ videoId: s.v, startSeconds: start });
  if (state.clip) armClipTimer(state.clip);
  armUnlockWatchdog();
  keepAwake();
}
// Algunos móviles (sobre todo iPhone) no dejan arrancar el sonido desde la web
// hasta que se toca el reproductor de YouTube una vez. Si no suena en 2,5 s,
// mostramos su botón de play recortado (sin título) para que el jugador lo toque.
let unlockTimer = null;
function armUnlockWatchdog() {
  clearTimeout(unlockTimer);
  unlockTimer = setTimeout(() => {
    if (!isPlaying && state?.phase === 'listen') document.body.classList.add('needs-tap');
  }, 2500);
}
function hideUnlock() { clearTimeout(unlockTimer); document.body.classList.remove('needs-tap'); }
// Evita que la pantalla se apague durante la partida (si el navegador lo permite)
let wakeLock = null;
async function keepAwake() {
  try { if ('wakeLock' in navigator && !wakeLock) { wakeLock = await navigator.wakeLock.request('screen'); wakeLock.addEventListener('release', () => { wakeLock = null; }); } } catch {}
}
function loadMoments() {
  try { return JSON.parse(localStorage.getItem(MOMENTS_KEY)) || {}; } catch { return {}; }
}
function keepPlaying() {
  if (!playerReady) return;
  clearTimeout(clipTimer);
  player.playVideo();
  if (state.clip) armClipTimer(clipElapsed + state.clip);
}
let segFrom = 0, segTo = 0;
function armClipTimer(untilSeconds) {
  clearTimeout(clipTimer);
  segFrom = untilSeconds - state.clip; segTo = untilSeconds;
  const check = () => {
    if (isPlaying && clipElapsed >= untilSeconds) { player.pauseVideo(); return; }
    clipTimer = setTimeout(check, 200);
  };
  check();
}
function tickProgress() {
  clipElapsed = (performance.now() - clipStartedAt) / 1000;
  const bar = document.getElementById('bar');
  if (bar) {
    let pct;
    if (state?.clip) pct = (clipElapsed - segFrom) / (segTo - segFrom) * 100;
    else {
      const dur = player?.getDuration?.() || 0;
      pct = dur ? (player.getCurrentTime() / dur) * 100 : 0;
    }
    bar.style.width = Math.max(0, Math.min(100, pct)) + '%';
  }
  if (isPlaying) progressTimer = requestAnimationFrame(tickProgress);
}
function pauseAudio() { hideUnlock(); clearTimeout(clipTimer); if (playerReady) player.pauseVideo(); }
function stopAudio() {
  hideUnlock();
  clearTimeout(clipTimer); cancelAnimationFrame(progressTimer);
  if (playerReady) { try { player.stopVideo(); } catch {} }
  isPlaying = false;
}

/* ---------- Arranque ---------- */
fetch('songs.json')
  .then(r => r.json())
  .then(data => { SONGS = data; buildOptions(); renderSetup(); })
  .catch(() => { $app.innerHTML = '<p>No se ha podido cargar la lista de canciones. Recarga la página.</p>'; });
