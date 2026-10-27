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
  { id: 0, label: 'Desde el principio' },
  { id: 30, label: 'Saltar la intro (seg. 30)' },
];
const SAVE_KEY = 'hitazo-partida-v1';
const PREFS_KEY = 'hitazo-ajustes-v1';

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
  const def = { players: ['Jugador 1', 'Jugador 2'], target: 10, lists: ['es', 'int'], decades: DECADES.map(d => d.id), clip: 30, start: 0 };
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
    <p class="tagline">Suena una canción. Sin mirar, colócala en tu línea temporal: ¿es anterior o posterior a las que ya tienes? Gana quien antes complete su colección.</p>
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
    </div>`;
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
  if (t.name === 'start') prefs.start = +t.value;
  savePrefs(); renderSetup();
});

/* ---------- Acciones ---------- */
$app.addEventListener('click', e => {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.dataset.remove !== undefined) { prefs.players.splice(+b.dataset.remove, 1); savePrefs(); return renderSetup(); }
  if (b.dataset.slot !== undefined) { state.selected = +b.dataset.slot; saveGame(); return renderGame(); }
  switch (b.dataset.act) {
    case 'add': prefs.players.push(`Jugador ${prefs.players.length + 1}`); savePrefs(); renderSetup();
      $app.querySelector(`input[data-player="${prefs.players.length - 1}"]`)?.select(); break;
    case 'minus': prefs.target = Math.max(3, prefs.target - 1); savePrefs(); renderSetup(); break;
    case 'plus': prefs.target = Math.min(30, prefs.target + 1); savePrefs(); renderSetup(); break;
    case 'start': startGame(); break;
    case 'resume': state = loadGame(); renderGame(); break;
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
    players: names.map(name => ({ name, cards: [deck.pop()] })),
    deck, turn: 0, current: deck.pop(), phase: 'listen', selected: null,
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
  let timeline = '';
  for (let i = 0; i <= cards.length; i++) {
    if (revealed && state.last && state.last.index === i && !state.last.ok) {
      timeline += cardHTML(s, 'wrong new');
    }
    if (!revealed) {
      const sel = state.selected === i;
      timeline += `<button class="slot ${sel ? 'selected' : ''}" data-slot="${i}" aria-label="Colocar ${slotLabel(cards, i)}">${sel ? 'Aquí' : '+'}</button>`;
    }
    if (i < cards.length) timeline += cardHTML(cards[i], revealed && state.last?.ok && cards[i] === s ? 'new' : '');
  }

  $app.innerHTML = `
    <div class="topbar">
      <span class="mini-logo">Hitazo</span>
      <button class="link" data-act="quit">Terminar partida</button>
    </div>
    <div class="scores">
      ${state.players.map((pl, i) => `<span class="score ${i === state.turn ? 'active' : ''}">
        <span class="dot" style="background:${COLORS[i]}">${esc(initial(pl.name))}</span>${esc(pl.name)} <b>${pl.cards.length}/${state.target}</b></span>`).join('')}
    </div>
    <h1 class="turn-title">Turno de ${esc(p.name)}</h1>
    <p class="turn-sub">${revealed ? '' : 'Escucha la canción y elige su sitio en tu línea temporal.'}</p>

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
          <p class="verdict ${state.last.ok ? 'ok' : 'ko'}">${state.last.ok ? '¡Bien colocada!' : 'Fallaste'}</p>
        </div>` : `<div class="progress" aria-hidden="true"><i id="bar"></i></div>`}
      <div class="controls" id="controls">${controlsHTML()}</div>
    </section>

    <div class="timeline-head">
      <h2>Línea de ${esc(p.name)}</h2>
      <span>${cards.length} de ${state.target} cartas</span>
    </div>
    <div class="timeline">${timeline}</div>

    <div class="place-bar">
      ${revealed
        ? `<button class="btn berry" data-act="next">${winnerIndex() >= 0 ? 'Ver ganador' : 'Siguiente turno'}</button>`
        : `<button class="btn" data-act="place" ${state.selected === null ? 'disabled' : ''}>Colocar aquí y ver el año</button>`}
    </div>`;
}
function controlsHTML() {
  if (isPlaying) return `<button class="btn ghost" data-act="pause">Pausar</button>`;
  const first = clipElapsed === 0;
  return `<button class="btn" data-act="play">${first ? 'Escuchar' : 'Repetir desde el inicio'}</button>
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
  state.last = { ok, index: i };
  state.phase = 'revealed';
  saveGame(); renderGame();
}
function winnerIndex() { return state.players.findIndex(p => p.cards.length >= state.target); }

function nextTurn() {
  stopAudio();
  const w = winnerIndex();
  if (w >= 0) return renderWinner(w);
  if (!state.deck.length) {
    toast('Se han acabado las canciones. Gana quien tenga más cartas.');
    const best = state.players.reduce((b, p, i, a) => p.cards.length > a[b].cards.length ? i : b, 0);
    return renderWinner(best);
  }
  state.turn = (state.turn + 1) % state.players.length;
  state.current = state.deck.pop();
  state.phase = 'listen'; state.selected = null; state.last = null;
  clipElapsed = 0;
  saveGame(); renderGame();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function renderWinner(i) {
  const w = state.players[i];
  const ranking = state.players.slice().sort((a, b) => b.cards.length - a.cards.length);
  $app.innerHTML = `
    <section class="winner">
      <h1>¡Gana ${esc(w.name)}!</h1>
      <div class="record revealed spinning"><div class="disc"><div class="label"><span class="q">${w.cards.length}</span><span class="hole"></span></div></div></div>
      <ul class="final-scores">${ranking.map(p => `<li><span>${esc(p.name)}</span><b>${p.cards.length} cartas</b></li>`).join('')}</ul>
      <button class="btn berry" data-act="again">Nueva partida</button>
    </section>`;
  state = null; saveGame();
}

/* ---------- Audio (YouTube) ---------- */
window.onYouTubeIframeAPIReady = function () {
  player = new YT.Player('yt', {
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
  player.loadVideoById({ videoId: s.v, startSeconds: (s.s ?? 0) + state.start });
  if (state.clip) armClipTimer(state.clip);
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
function pauseAudio() { clearTimeout(clipTimer); if (playerReady) player.pauseVideo(); }
function stopAudio() {
  clearTimeout(clipTimer); cancelAnimationFrame(progressTimer);
  if (playerReady) { try { player.stopVideo(); } catch {} }
  isPlaying = false;
}

/* ---------- Arranque ---------- */
fetch('songs.json')
  .then(r => r.json())
  .then(data => { SONGS = data; renderSetup(); })
  .catch(() => { $app.innerHTML = '<p>No se ha podido cargar la lista de canciones. Recarga la página.</p>'; });
