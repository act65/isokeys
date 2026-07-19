/* main.js — wire the DOM controls to the keyboard, audio, and games. */
(function (KB) {
  'use strict';

  const T = KB.theory;
  const $ = (id) => document.getElementById(id);

  // ---- interval names for the readout ----
  const IV_NAMES = ['unison', 'min 2nd', 'maj 2nd', 'min 3rd', 'maj 3rd', 'perf 4th',
    'tritone', 'perf 5th', 'min 6th', 'maj 6th', 'min 7th', 'maj 7th', 'octave'];
  function intervalName(semis) {
    const a = Math.abs(semis);
    const base = a <= 12 ? IV_NAMES[a] : `${a} st`;
    if (semis === 0) return base;
    return `${base} ${semis < 0 ? '↓' : '↑'} (${semis > 0 ? '+' : ''}${semis})`;
  }

  // ---- state ----
  const presets = T.LAYOUT_PRESETS;
  let currentPreset = 'Wicki-Hayden';
  const layout = Object.assign({}, presets[currentPreset]);
  let octaveShift = 0;

  function effectiveLayout() {
    return { right: layout.right, upRight: layout.upRight, base: layout.base + octaveShift * 12 };
  }

  // ---- build the keyboard ----
  const kbd = new KB.HexKeyboard($('kbd-canvas'), effectiveLayout());

  // ---- games + tutorial ----
  const rhythm = new KB.RhythmGame(kbd, $('rhythm-canvas'), renderRhythmScore);
  const reaction = new KB.ReactionGame(kbd, renderReactionState);
  const tutorial = new KB.LayoutTutorial(kbd, renderTutorial);

  // ---- populate selects ----
  const presetSel = $('layout-preset');
  Object.keys(presets).forEach((name) => {
    const opt = document.createElement('option');
    opt.value = name; opt.textContent = name;
    presetSel.appendChild(opt);
  });
  presetSel.value = currentPreset;

  const songSel = $('song-select');
  KB.songs.SONGS.forEach((s, i) => {
    const opt = document.createElement('option');
    opt.value = i; opt.textContent = s.name;
    songSel.appendChild(opt);
  });

  // note-name dropdowns (scale root + tutorial root)
  function fillNoteNames(sel) {
    T.NOTE_NAMES.forEach((n, pc) => {
      const opt = document.createElement('option');
      opt.value = pc; opt.textContent = n;
      sel.appendChild(opt);
    });
  }
  fillNoteNames($('scale-root'));
  fillNoteNames($('tut-root'));

  // each scale is its own entry in the colour-scheme dropdown
  const scaleGroup = document.createElement('optgroup');
  scaleGroup.label = 'Highlight scale';
  Object.keys(T.SCALES).forEach((key) => {
    const opt = document.createElement('option');
    opt.value = 'scale:' + key; opt.textContent = 'Scale · ' + (T.SCALE_LABELS[key] || key);
    scaleGroup.appendChild(opt);
  });
  $('color-scheme').appendChild(scaleGroup);

  // tutorial chord-type dropdown
  Object.entries(T.CHORD_TYPES).forEach(([key, def]) => {
    const opt = document.createElement('option');
    opt.value = key; opt.textContent = def.label;
    $('tut-type').appendChild(opt);
  });
  function refreshInvOptions() {
    const inv = $('tut-inv');
    inv.innerHTML = '';
    for (let i = 0; i < tutorial.numInversions(); i++) {
      const opt = document.createElement('option');
      opt.value = i; opt.textContent = T.INVERSION_NAMES[i];
      inv.appendChild(opt);
    }
  }

  // ---- theme + colour scheme ----
  document.body.dataset.theme = 'earthy';
  $('theme-select').addEventListener('change', (e) => {
    document.body.dataset.theme = e.target.value;
    kbd.setTheme(e.target.value);
    circle.setTheme(e.target.value);
  });
  $('color-scheme').addEventListener('change', (e) => {
    const v = e.target.value;
    if (v.indexOf('scale:') === 0) {
      kbd.setColorScheme('scale');
      kbd.setScaleType(v.slice(6));
      $('scale-root-group').style.display = '';
    } else {
      kbd.setColorScheme(v);
      $('scale-root-group').style.display = 'none';
    }
  });
  $('scale-root').addEventListener('change', (e) => kbd.setScaleRoot(parseInt(e.target.value, 10)));

  // ---- apply layout + refresh UI ----
  function applyLayout() {
    kbd.setLayout(effectiveLayout());
    $('step-right').value = layout.right;
    $('step-upright').value = layout.upRight;
    const r = layout.right, ur = layout.upRight;
    $('iv-right').textContent = intervalName(r);
    $('iv-upright').textContent = intervalName(ur);
    $('interval-readout').innerHTML =
      `<b>Neighbour intervals</b><br>` +
      `→ ${intervalName(r)}<br>` +
      `↗ ${intervalName(ur)}<br>` +
      `↖ ${intervalName(ur - r)}`;
    stopGames();
    // keep the tutorial highlight in sync when the layout changes underneath it
    if (!$('panel-tutorial').classList.contains('hidden')) {
      const activeBtn = document.querySelector('.subtab.active');
      if (activeBtn) selectSubtab(activeBtn.dataset.view);
    }
  }

  presetSel.addEventListener('change', () => {
    currentPreset = presetSel.value;
    Object.assign(layout, presets[currentPreset]);
    applyLayout();
  });
  $('step-right').addEventListener('change', (e) => {
    layout.right = clampInt(e.target.value); applyLayout();
  });
  $('step-upright').addEventListener('change', (e) => {
    layout.upRight = clampInt(e.target.value); applyLayout();
  });
  $('octave').addEventListener('change', (e) => { octaveShift = parseInt(e.target.value, 10); applyLayout(); });
  $('volume').addEventListener('input', (e) => { KB.audio.ensure(); KB.audio.setVolume(parseFloat(e.target.value)); });
  $('show-names').addEventListener('change', (e) => { kbd.showNoteNames = e.target.checked; });

  function clampInt(v) {
    let n = parseInt(v, 10); if (isNaN(n)) n = 0;
    return Math.max(-12, Math.min(12, n));
  }

  // ---- mode switching ----
  const panels = {
    free: $('panel-free'), tutorial: $('panel-tutorial'),
    rhythm: $('panel-rhythm'), reaction: $('panel-reaction'),
  };
  document.querySelectorAll('.tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');
      const mode = tab.dataset.mode;
      Object.entries(panels).forEach(([m, el]) => el.classList.toggle('hidden', m !== mode));
      stopGames();
      if (mode === 'tutorial') {
        refreshInvOptions();
        const activeBtn = document.querySelector('.subtab.active');
        selectSubtab(activeBtn ? activeBtn.dataset.view : 'neighbours');
      }
    });
  });

  function stopGames() {
    rhythm.stop();
    reaction.stop();
    tutorial.leave();
    kbd.clearHighlights();
    $('rhythm-feedback').textContent = '';
  }

  // ---- circle of fifths ----
  fillNoteNames($('circle-root'));
  Object.keys(T.SCALES).forEach((key) => {
    const opt = document.createElement('option');
    opt.value = key; opt.textContent = T.SCALE_LABELS[key] || key;
    $('circle-scale').appendChild(opt);
  });
  let circleRoot = 0, circleScale = 'major';
  const circle = new KB.CircleOfFifths($('circle-canvas'), (pc) => {
    circleRoot = pc;
    $('circle-root').value = String(pc);
    KB.audio.blip(60 + pc, 0.7);
    updateCircle();
  });
  function updateCircle() {
    circle.setTheme(document.body.dataset.theme);
    circle.setSelection(circleRoot, circleScale);
    const set = T.SCALES[circleScale] || T.SCALES.major;
    const hl = new Map();
    kbd.cells.forEach((c) => {
      const n = kbd.noteFor(c.key);
      if (n < 0 || n > 127) return;
      const pc = ((n % 12) + 12) % 12;
      const deg = set.indexOf((((pc - circleRoot) % 12) + 12) % 12);
      if (deg === -1) return;
      const frac = set.length > 1 ? deg / (set.length - 1) : 0;
      const col = KB.viridis(0.1 + frac * 0.85);
      hl.set(c.key, {
        color: `rgb(${col[0] | 0}, ${col[1] | 0}, ${col[2] | 0})`,
        ring: pc === circleRoot ? '#ffffff' : 'rgba(255,255,255,0.5)',
      });
    });
    kbd.setHighlights(hl);
  }
  $('circle-root').addEventListener('change', (e) => { circleRoot = parseInt(e.target.value, 10); updateCircle(); });
  $('circle-scale').addEventListener('change', (e) => { circleScale = e.target.value; updateCircle(); });

  // ---- tutorial sub-view routing ----
  function selectSubtab(view) {
    document.querySelectorAll('.subtab').forEach((b) => b.classList.toggle('active', b.dataset.view === view));
    $('tut-neighbours').classList.toggle('hidden', view !== 'neighbours');
    $('tut-chords').classList.toggle('hidden', view !== 'chords');
    $('tut-circle').classList.toggle('hidden', view !== 'circle');
    if (view === 'circle') { tutorial.active = false; updateCircle(); }
    else { tutorial.active = true; tutorial.setView(view); }
  }
  document.querySelectorAll('.subtab').forEach((btn) => btn.addEventListener('click', () => selectSubtab(btn.dataset.view)));

  // ---- tutorial controls ----
  $('tut-root').addEventListener('change', (e) => tutorial.setRoot(parseInt(e.target.value, 10)));
  $('tut-type').addEventListener('change', (e) => { tutorial.setType(e.target.value); refreshInvOptions(); $('tut-inv').value = '0'; });
  $('tut-inv').addEventListener('change', (e) => tutorial.setInversion(parseInt(e.target.value, 10)));
  $('tut-play').addEventListener('click', () => { KB.audio.ensure(); tutorial.play(); });
  $('tut-play-n').addEventListener('click', () => { KB.audio.ensure(); tutorial.play(); });

  function ivQuality(semis) {
    const a = Math.abs(semis);
    return a <= 12 ? IV_NAMES[a] : a + ' st';
  }
  function renderTutorial(st) {
    if (st.view === 'neighbours') {
      $('tut-center').textContent = st.center;
      $('tut-neighbour-list').innerHTML = st.neighbours.map((n) =>
        `<div class="nb-item ${n.delta >= 0 ? 'up' : 'down'}">
           <span class="nb-arrow">${n.arrow}</span>
           <b>${n.delta >= 0 ? '+' : ''}${n.delta}</b>
           <em>${ivQuality(n.delta)}</em>
         </div>`
      ).join('');
    } else {
      $('tut-notes').innerHTML = st.items.map((it) =>
        `<div class="tut-note"><b>${it.role}</b><span>${it.name}</span><em>${keyCap(it.key)}</em></div>`
      ).join('<span class="tut-arrow">+</span>');
      $('tut-desc').textContent = `${st.root} ${st.typeLabel} · ${st.inversion} — ${st.desc}`;
    }
  }
  function keyCap(k) { return k === '—' ? '—' : (T.keyLabel(k)); }

  // ---- rhythm game ----
  $('rhythm-speed').addEventListener('change', (e) => rhythm.setSpeed(parseFloat(e.target.value)));
  $('rhythm-start').addEventListener('click', () => {
    KB.audio.ensure();
    rhythm.setSpeed(parseFloat($('rhythm-speed').value));
    rhythm.start(KB.songs.SONGS[parseInt(songSel.value || '0', 10)]);
  });
  $('rhythm-stop').addEventListener('click', () => { rhythm.stop(); $('rhythm-feedback').textContent = ''; });

  function renderRhythmScore(s) {
    $('rhythm-score').innerHTML =
      stat(Math.round(s.score), 'Score') +
      stat(s.combo + '×', 'Combo') +
      stat((s.perfect + s.great + s.good), 'Hits') +
      stat(s.miss, 'Miss');
    const fb = $('rhythm-feedback');
    if (s.done) {
      fb.style.color = 'var(--accent)';
      fb.textContent = `Finished!  Accuracy ${s.accuracy}%  ·  Max combo ${s.maxCombo}`;
    } else if (s.feedback) {
      fb.style.color = s.feedback === 'Miss' ? 'var(--bad)' : (s.feedback === 'PERFECT' ? 'var(--good)' : 'var(--accent)');
      fb.textContent = s.feedback;
    }
  }

  // ---- reaction game ----
  const reactionReplay = $('reaction-replay');
  function updateReplayVisibility() {
    const audio = $('reaction-mode').value === 'audio';
    reactionReplay.classList.toggle('hidden', !(audio && reaction.active));
  }
  $('reaction-mode').addEventListener('change', (e) => { reaction.setMode(e.target.value); updateReplayVisibility(); });
  $('reaction-start').addEventListener('click', () => {
    KB.audio.ensure();
    reaction.setMode($('reaction-mode').value);
    reaction.setTypes(readChordTypes());
    reaction.setInversionMode($('reaction-inv').value);
    reaction.start();
    updateReplayVisibility();
  });
  $('reaction-stop').addEventListener('click', () => {
    reaction.stop();
    $('reaction-prompt').textContent = 'Press Start';
    $('reaction-sub').textContent = '';
    updateReplayVisibility();
  });
  $('reaction-replay').addEventListener('click', () => reaction.replay());
  $('reaction-hints').addEventListener('change', (e) => reaction.setHints(e.target.checked));

  // chord-quality chips + inversion filter
  const chordChips = $('reaction-chord-types');
  KB.REACTION_CHORD_POOL.forEach((key) => {
    const label = document.createElement('label');
    label.className = 'chip';
    label.innerHTML = `<input type="checkbox" value="${key}" checked /> ${T.CHORD_TYPES[key].label}`;
    chordChips.appendChild(label);
  });
  const readChordTypes = () => Array.from(chordChips.querySelectorAll('input:checked')).map((c) => c.value);
  chordChips.addEventListener('change', () => {
    let types = readChordTypes();
    if (!types.length) { // never allow an empty set
      chordChips.querySelectorAll('input').forEach((c) => (c.checked = true));
      types = readChordTypes();
    }
    reaction.setTypes(types);
  });
  $('reaction-inv').addEventListener('change', (e) => reaction.setInversionMode(e.target.value));

  function renderReactionState(st) {
    if (st.prompt !== undefined && st.prompt !== '') {
      $('reaction-prompt').textContent = st.prompt;
      $('reaction-sub').textContent = `${st.inversion || ''}${st.notes ? '  —  ' + st.notes : ''}`;
    }
    $('reaction-score').innerHTML =
      stat(st.round || 0, 'Round') +
      stat(st.best != null ? st.best + 'ms' : '—', 'Best') +
      stat(st.avg != null ? st.avg + 'ms' : '—', 'Avg') +
      stat(st.wrong || 0, 'Wrong');
    const card = $('reaction-prompt-card');
    if (st.flash) {
      card.classList.remove('correct', 'wrong');
      void card.offsetWidth; // restart animation
      card.classList.add(st.flash);
      if (st.flash === 'correct' && st.lastTime != null) {
        $('reaction-prompt').textContent = st.reveal ? st.reveal.split(' — ')[0] : $('reaction-prompt').textContent;
        $('reaction-sub').textContent = `✓ ${st.reveal ? st.reveal + '  ·  ' : ''}${st.lastTime} ms`;
      }
      setTimeout(() => card.classList.remove(st.flash), 700);
    }
  }

  function stat(value, label) {
    return `<div class="stat"><b>${value}</b><span>${label}</span></div>`;
  }

  // ---- init ----
  applyLayout();
  renderRhythmScore({ score: 0, combo: 0, perfect: 0, great: 0, good: 0, miss: 0 });
  renderReactionState({ round: 0, best: null, avg: null, wrong: 0 });

  // deep-link to a mode or tutorial sub-view via #hash (e.g. #reaction, #circle)
  const hash = (location.hash || '').replace('#', '');
  if (['tutorial', 'rhythm', 'reaction', 'free'].indexOf(hash) !== -1) {
    const tab = document.querySelector(`.tab[data-mode="${hash}"]`);
    if (tab) tab.click();
  } else if (['neighbours', 'chords', 'circle'].indexOf(hash) !== -1) {
    const tab = document.querySelector('.tab[data-mode="tutorial"]');
    if (tab) tab.click();
    selectSubtab(hash);
  }

  // ---- loading screen: start decoding samples up front, show progress ----
  KB.audio.ensure(); // creates a (suspended) AudioContext and begins decoding
  (function pollLoading(tries) {
    tries = tries || 0;
    const fill = $('loading-fill');
    if (fill) fill.style.width = Math.round(KB.audio.progress * 100) + '%';
    // hide when ready, or give up after ~30s so the app is never stuck
    if (KB.audio.samplesReady || tries > 300) {
      const el = $('loading');
      if (el) { el.classList.add('done'); setTimeout(() => { el.style.display = 'none'; }, 500); }
      return;
    }
    setTimeout(() => pollLoading(tries + 1), 100);
  })();

  // resume audio on first interaction anywhere
  window.addEventListener('pointerdown', () => KB.audio.ensure(), { once: true });
  window.addEventListener('keydown', () => KB.audio.ensure(), { once: true });
})(window.KB = window.KB || {});
