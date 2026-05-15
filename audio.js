// Brick Fiesta - Audio im Hülsbeck/Amiga-Stil
// Mehrstimmige Chiptune-Engine mit Arpeggios, Octave-Bass, PWM-Lead, Drums.
// Alles prozedural via WebAudio - keine Samples.

const Audio16 = (() => {
  let ctx = null;
  let masterGain = null;
  let musicGain = null;
  let muted = false;
  let musicTimer = null;
  let musicStarted = false;
  let nextNoteTime = 0;
  let stepIndex = 0;
  let currentLevel = 1;

  // === Externe Musik-Tracks ====================================
  // Manifest: track-files relativ zur index.html. Wenn vorhanden -> Audio-Element,
  // sonst Fallback auf prozeduralen Chiptune.
  // Pro Level wird ein Track aus dem Pool zugewiesen (Round-Robin).
  const TRACK_POOL = [
    'assets/music/track1.ogg',
    'assets/music/track2.ogg',
    'assets/music/track3.ogg',
    'assets/music/track4.ogg',
    'assets/music/track5.ogg',
    'assets/music/track6.ogg',
  ];
  const trackCache = new Map();   // url -> HTMLAudioElement
  const trackAvailable = new Map(); // url -> bool (geprüft via HEAD)
  let currentAudio = null;

  function trackUrlForLevel(level) {
    return TRACK_POOL[(level - 1) % TRACK_POOL.length];
  }

  async function tryLoadTrack(url) {
    if (trackAvailable.has(url)) return trackAvailable.get(url);
    try {
      const r = await fetch(url, { method: 'HEAD' });
      const ok = r.ok;
      trackAvailable.set(url, ok);
      return ok;
    } catch {
      trackAvailable.set(url, false);
      return false;
    }
  }

  function getAudioFor(url) {
    if (trackCache.has(url)) return trackCache.get(url);
    const a = new Audio(url);
    a.loop = true;
    a.preload = 'auto';
    a.volume = 0.5;
    trackCache.set(url, a);
    return a;
  }

  function stopExternalMusic() {
    if (currentAudio) {
      try { currentAudio.pause(); currentAudio.currentTime = 0; } catch {}
      currentAudio = null;
    }
  }

  function ensure() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    ctx = new AC();
    masterGain = ctx.createGain();
    masterGain.gain.value = 0.35;
    // Leichter Lowpass für "Amiga-Feeling"
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 12000;
    masterGain.connect(lp).connect(ctx.destination);
    return ctx;
  }

  function resume() {
    ensure();
    if (ctx.state === 'suspended') ctx.resume();
  }

  function setMuted(m) {
    muted = m;
    ensure();
    masterGain.gain.value = m ? 0 : 0.35;
    if (currentAudio) currentAudio.volume = m ? 0 : 0.5;
  }
  function isMuted() { return muted; }

  // ---- Synth-Primitive ----------------------------------------

  // PWM-artiger Lead via zwei verstimmte Sägen.
  function pwmLead(freq, dur, vol = 0.18, when = 0) {
    if (!ctx || muted) return;
    const t0 = ctx.currentTime + when;
    const o1 = ctx.createOscillator();
    const o2 = ctx.createOscillator();
    o1.type = 'sawtooth'; o2.type = 'sawtooth';
    o1.frequency.value = freq;
    o2.frequency.value = freq * 1.005; // leichte Detuning
    // Vibrato für Hülsbeck-Feel
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    lfo.frequency.value = 6;
    lfoGain.gain.value = freq * 0.005;
    lfo.connect(lfoGain).connect(o1.frequency);
    lfo.connect(lfoGain).connect(o2.frequency);

    const filt = ctx.createBiquadFilter();
    filt.type = 'lowpass';
    filt.frequency.setValueAtTime(freq * 4, t0);
    filt.frequency.exponentialRampToValueAtTime(freq * 8, t0 + dur * 0.3);
    filt.Q.value = 6;

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(vol * 0.6, t0 + dur * 0.4);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

    o1.connect(filt); o2.connect(filt);
    filt.connect(g).connect(masterGain);
    o1.start(t0); o2.start(t0); lfo.start(t0);
    o1.stop(t0 + dur + 0.05); o2.stop(t0 + dur + 0.05); lfo.stop(t0 + dur + 0.05);
  }

  // Pulswelle - klassischer Chiptune-Lead
  function pulse(freq, dur, vol = 0.15, when = 0, type = 'square') {
    if (!ctx || muted) return;
    const t0 = ctx.currentTime + when;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(masterGain);
    o.start(t0);
    o.stop(t0 + dur + 0.02);
  }

  // Octave-Bass mit Saw + Sub
  function bass(freq, dur, vol = 0.22, when = 0) {
    if (!ctx || muted) return;
    const t0 = ctx.currentTime + when;
    const o1 = ctx.createOscillator();
    o1.type = 'sawtooth';
    o1.frequency.value = freq;
    const o2 = ctx.createOscillator();
    o2.type = 'triangle';
    o2.frequency.value = freq * 0.5; // Sub-Oktave
    const filt = ctx.createBiquadFilter();
    filt.type = 'lowpass';
    filt.frequency.setValueAtTime(freq * 6, t0);
    filt.frequency.exponentialRampToValueAtTime(freq * 2, t0 + dur);
    filt.Q.value = 3;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.005);
    g.gain.exponentialRampToValueAtTime(vol * 0.5, t0 + dur * 0.5);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o1.connect(filt); o2.connect(filt);
    filt.connect(g).connect(masterGain);
    o1.start(t0); o2.start(t0);
    o1.stop(t0 + dur + 0.02); o2.stop(t0 + dur + 0.02);
  }

  // Drums --------------------------------------------------------
  function kick(when = 0, vol = 0.4) {
    if (!ctx || muted) return;
    const t0 = ctx.currentTime + when;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(120, t0);
    o.frequency.exponentialRampToValueAtTime(40, t0 + 0.1);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.15);
    o.connect(g).connect(masterGain);
    o.start(t0); o.stop(t0 + 0.2);
  }

  function snare(when = 0, vol = 0.25) {
    if (!ctx || muted) return;
    const t0 = ctx.currentTime + when;
    const buf = ctx.createBuffer(1, ctx.sampleRate * 0.15, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1);
    const src = ctx.createBufferSource(); src.buffer = buf;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass'; hp.frequency.value = 1500;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.12);
    src.connect(hp).connect(g).connect(masterGain);
    src.start(t0); src.stop(t0 + 0.15);
    // Tonale Komponente
    const o = ctx.createOscillator();
    o.type = 'triangle'; o.frequency.value = 180;
    const og = ctx.createGain();
    og.gain.setValueAtTime(vol * 0.5, t0);
    og.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.08);
    o.connect(og).connect(masterGain);
    o.start(t0); o.stop(t0 + 0.1);
  }

  function hat(when = 0, vol = 0.1) {
    if (!ctx || muted) return;
    const t0 = ctx.currentTime + when;
    const buf = ctx.createBuffer(1, ctx.sampleRate * 0.05, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1);
    const src = ctx.createBufferSource(); src.buffer = buf;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass'; hp.frequency.value = 7000;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.04);
    src.connect(hp).connect(g).connect(masterGain);
    src.start(t0); src.stop(t0 + 0.06);
  }

  // ---- Soundeffekte -------------------------------------------
  function shortTone(freq, dur, type, vol, slide) {
    if (!ctx || muted) return;
    const t0 = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t0 + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(masterGain);
    o.start(t0); o.stop(t0 + dur + 0.02);
  }

  const sfx = {
    paddle: () => shortTone(440, 0.05, 'square', 0.22, 200),
    wall:   () => shortTone(280, 0.04, 'square', 0.16, -50),
    brick:  (n = 1) => {
      const base = 520 + n * 80;
      shortTone(base, 0.06, 'square', 0.22, 300);
      shortTone(base * 1.5, 0.04, 'triangle', 0.15, 200);
    },
    hard:   () => {
      shortTone(140, 0.12, 'sawtooth', 0.28);
      const buf = ctx.createBuffer(1, ctx.sampleRate * 0.08, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1);
      const src = ctx.createBufferSource(); src.buffer = buf;
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass'; f.frequency.value = 1500;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.15, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.08);
      src.connect(f).connect(g).connect(masterGain);
      src.start(); src.stop(ctx.currentTime + 0.1);
    },
    powerup: () => {
      // Aufsteigendes Arpeggio
      const notes = [523, 659, 784, 1047, 1319];
      notes.forEach((f, i) => pulse(f, 0.08, 0.22, i * 0.04, 'square'));
    },
    lose: () => {
      pwmLead(330, 0.25, 0.22, 0);
      pwmLead(247, 0.3, 0.22, 0.15);
      pwmLead(196, 0.4, 0.22, 0.3);
    },
    win: () => {
      // Fanfare - Triade aufsteigend
      const notes = [523, 659, 784, 1047, 1319, 1568];
      notes.forEach((f, i) => {
        pulse(f, 0.18, 0.2, i * 0.08, 'square');
        pulse(f * 0.5, 0.18, 0.15, i * 0.08, 'triangle');
      });
    },
    gameover: () => {
      const notes = [523, 466, 415, 349, 311, 262];
      notes.forEach((f, i) => {
        pwmLead(f, 0.3, 0.2, i * 0.18);
      });
    },
    select: () => shortTone(880, 0.05, 'square', 0.18),
  };

  // ---- Musik im Hülsbeck-Stil ---------------------------------
  // Strukturiert als Pattern aus 32 Sechzehnteln, mehrere Spuren:
  //  - lead: PWM-Melodie
  //  - arp: schnelle 16tel-Arpeggios (Hülsbeck-Markenzeichen)
  //  - bass: Octave-Bass
  //  - drums: Kick/Snare/Hat

  // Noten-Helper: MIDI-artige Nummer → Frequenz
  const NOTE = {
    C3: 130.81, D3: 146.83, E3: 164.81, F3: 174.61, G3: 196.00, A3: 220.00, B3: 246.94,
    C4: 261.63, D4: 293.66, E4: 329.63, F4: 349.23, G4: 392.00, A4: 440.00, B4: 493.88,
    C5: 523.25, D5: 587.33, E5: 659.25, F5: 698.46, G5: 783.99, A5: 880.00, B5: 987.77,
    C6: 1046.50, D6: 1174.66, E6: 1318.51, F6: 1396.91, G6: 1567.98, A6: 1760.00,
    R: 0, // Pause
  };

  // Mehrere Akkord-Progressionen (Hülsbeck-typisch: Moll, schnelle Wechsel)
  const PROGRESSIONS = [
    // 0: Am - F - C - G (klassisches Pop-Moll)
    [
      { root: NOTE.A3, notes: [NOTE.A4, NOTE.C5, NOTE.E5] },
      { root: NOTE.F3, notes: [NOTE.F4, NOTE.A4, NOTE.C5] },
      { root: NOTE.C3, notes: [NOTE.C4, NOTE.E4, NOTE.G4] },
      { root: NOTE.G3, notes: [NOTE.G3, NOTE.B3, NOTE.D4] },
    ],
    // 1: Em - C - G - D (epic)
    [
      { root: NOTE.E3, notes: [NOTE.E4, NOTE.G4, NOTE.B4] },
      { root: NOTE.C3, notes: [NOTE.C4, NOTE.E4, NOTE.G4] },
      { root: NOTE.G3, notes: [NOTE.G3, NOTE.B3, NOTE.D4] },
      { root: NOTE.D3, notes: [NOTE.D4, NOTE.F4*1.06, NOTE.A4] }, // Dm-Anteil
    ],
    // 2: Dm - Bb - F - C (Turrican-Vibe)
    [
      { root: NOTE.D3, notes: [NOTE.D4, NOTE.F4, NOTE.A4] },
      { root: NOTE.A3*0.89, notes: [NOTE.D4*0.94, NOTE.F4, NOTE.A4*0.94] }, // Bb
      { root: NOTE.F3, notes: [NOTE.F4, NOTE.A4, NOTE.C5] },
      { root: NOTE.C3, notes: [NOTE.C4, NOTE.E4, NOTE.G4] },
    ],
    // 3: Gm - Eb - Bb - F (dunkel, R-Type-artig)
    [
      { root: NOTE.G3, notes: [NOTE.G4, NOTE.A4*1.06, NOTE.D5] }, // Gm: G Bb D
      { root: NOTE.E3*1.06, notes: [NOTE.E4*1.06, NOTE.G4, NOTE.A4*1.06] }, // Eb
      { root: NOTE.A3*0.89, notes: [NOTE.A4*0.89, NOTE.D5*0.94, NOTE.F5] }, // Bb
      { root: NOTE.F3, notes: [NOTE.F4, NOTE.A4, NOTE.C5] },
    ],
    // 4: Cm - Ab - Eb - Bb (heroisch)
    [
      { root: NOTE.C3, notes: [NOTE.C4, NOTE.E4*1.06, NOTE.G4] }, // Cm
      { root: NOTE.A3*0.94, notes: [NOTE.A4*0.94, NOTE.C5, NOTE.E5*1.06] }, // Ab
      { root: NOTE.E3*1.06, notes: [NOTE.E4*1.06, NOTE.G4, NOTE.A4*1.06] }, // Eb
      { root: NOTE.A3*0.89, notes: [NOTE.A4*0.89, NOTE.D5*0.94, NOTE.F5] }, // Bb
    ],
    // 5: Am - E - F - G (mediterran)
    [
      { root: NOTE.A3, notes: [NOTE.A4, NOTE.C5, NOTE.E5] },
      { root: NOTE.E3, notes: [NOTE.E4, NOTE.A4*0.89, NOTE.B4] }, // E-Dur
      { root: NOTE.F3, notes: [NOTE.F4, NOTE.A4, NOTE.C5] },
      { root: NOTE.G3, notes: [NOTE.G4, NOTE.B4, NOTE.D5] },
    ],
  ];

  // Mehrere Melodie-Pattern (je 32 Sechzehntel)
  const MELODIES = [
    // 0: Hauptthema
    [
      NOTE.A4, 0, NOTE.C5, 0, NOTE.E5, 0, NOTE.A5, 0,
      NOTE.G5, 0, NOTE.E5, 0, NOTE.C5, NOTE.D5, NOTE.E5, 0,
      NOTE.F5, 0, NOTE.A5, 0, NOTE.G5, 0, NOTE.E5, 0,
      NOTE.D5, 0, NOTE.C5, 0, NOTE.B4, NOTE.C5, NOTE.D5, 0,
    ],
    // 1: Aktionsthema (schneller, mit Triolen-Gefühl)
    [
      NOTE.E5, NOTE.A5, NOTE.E5, NOTE.C5, NOTE.A4, 0, NOTE.E5, 0,
      NOTE.F5, NOTE.A5, NOTE.F5, NOTE.C5, NOTE.A4, 0, 0, 0,
      NOTE.G5, NOTE.E5, NOTE.G5, NOTE.B5, NOTE.G5, 0, NOTE.E5, 0,
      NOTE.D5, NOTE.B4, NOTE.D5, NOTE.G5, NOTE.A4, 0, 0, 0,
    ],
    // 2: Sphärisch / langsame Melodieführung
    [
      NOTE.E5, 0, 0, 0, NOTE.G5, 0, 0, 0,
      NOTE.A5, 0, NOTE.G5, 0, NOTE.E5, 0, 0, 0,
      NOTE.D5, 0, 0, 0, NOTE.F5, 0, 0, 0,
      NOTE.E5, 0, NOTE.D5, 0, NOTE.C5, 0, NOTE.B4, 0,
    ],
    // 3: Heroisch-fanfarenartig
    [
      NOTE.C5, NOTE.E5, NOTE.G5, NOTE.C6, NOTE.G5, NOTE.E5, NOTE.C5, 0,
      NOTE.D5, NOTE.F5, NOTE.A5, NOTE.D6, NOTE.A5, NOTE.F5, NOTE.D5, 0,
      NOTE.E5, NOTE.G5, NOTE.B5, NOTE.E6, NOTE.B5, NOTE.G5, NOTE.E5, 0,
      NOTE.D5, NOTE.B4, NOTE.G4, NOTE.A4, NOTE.B4, NOTE.C5, NOTE.D5, 0,
    ],
    // 4: Schwebend, mit Pausen
    [
      NOTE.A5, 0, NOTE.G5, NOTE.E5, 0, NOTE.D5, 0, 0,
      NOTE.E5, 0, NOTE.D5, NOTE.C5, 0, NOTE.B4, 0, 0,
      NOTE.G5, 0, NOTE.F5, NOTE.D5, 0, NOTE.C5, 0, 0,
      NOTE.D5, NOTE.E5, NOTE.F5, NOTE.G5, NOTE.A5, 0, 0, 0,
    ],
    // 5: Dance-artig, durchgehender Puls
    [
      NOTE.A4, NOTE.E5, NOTE.A4, NOTE.E5, NOTE.C5, NOTE.E5, NOTE.A4, NOTE.E5,
      NOTE.B4, NOTE.E5, NOTE.B4, NOTE.E5, NOTE.D5, NOTE.E5, NOTE.B4, NOTE.E5,
      NOTE.C5, NOTE.F5, NOTE.C5, NOTE.F5, NOTE.E5, NOTE.F5, NOTE.C5, NOTE.F5,
      NOTE.D5, NOTE.G5, NOTE.D5, NOTE.G5, NOTE.F5, NOTE.E5, NOTE.D5, NOTE.C5,
    ],
  ];

  // Drum-Patterns (16 Slots: 'K'=Kick, 'S'=Snare, 'H'=Hat, '.'=nichts)
  const DRUM_PATTERNS = [
    // 0: Standard
    ['K','H','H','H','S','H','H','H','K','H','K','H','S','H','H','H'],
    // 1: Treibend
    ['K','H','K','H','S','H','K','H','K','H','K','H','S','H','K','S'],
    // 2: Halftime / cinematic
    ['K','.','H','.','.','.','H','.','K','.','H','.','S','.','H','.'],
    // 3: Doppel-Kick
    ['K','H','H','K','S','H','H','H','K','H','K','H','S','H','K','S'],
  ];

  // Pro Level: { prog, melody, drums, leadType, semitones (Transposition), baseBpm }
  const SEMITONE = 1.059463;
  function variantForLevel(level) {
    const idx = (level - 1);
    return {
      prog: idx % PROGRESSIONS.length,
      melody: Math.floor(idx / 2) % MELODIES.length,
      drums: Math.floor(idx / 3) % DRUM_PATTERNS.length,
      leadType: ['saw','square','square','saw','triangle','square'][idx % 6],
      // Transposition: leicht versetzt pro Level (-3 bis +4 Halbtöne)
      semitones: ((idx * 5) % 8) - 3,
      bpmOffset: (idx % 5) * 4,
    };
  }
  function transpose(freq, semitones) {
    return freq * Math.pow(SEMITONE, semitones);
  }

  let stepCount = 32; // ein Pattern = 32 Sechzehntel
  let currentVariant = variantForLevel(1);

  function scheduleStep(stepInPattern, when) {
    const v = currentVariant;
    const chords = PROGRESSIONS[v.prog];
    const melody = MELODIES[v.melody];
    const drumPat = DRUM_PATTERNS[v.drums];

    const chordIdx = Math.floor(stepInPattern / 8) % chords.length;
    const chord = chords[chordIdx];
    const subStep = stepInPattern % 8;
    const drumIdx = stepInPattern % 16;

    // Arpeggio: jeden Sechzehntel eine Note des Akkords (transponiert)
    const arpNote = transpose(chord.notes[subStep % chord.notes.length] * 2, v.semitones);
    pulse(arpNote, 0.08, 0.07, when, 'square');

    // Bass: Oktavsprung-Pattern
    if (subStep % 2 === 0) {
      const bassFreq = (subStep % 4 === 0) ? chord.root : chord.root * 2;
      bass(transpose(bassFreq, v.semitones), 0.18, 0.18, when);
    }

    // Lead-Melodie
    const leadNote = melody[stepInPattern % melody.length];
    if (leadNote > 0) {
      const f = transpose(leadNote, v.semitones);
      if (v.leadType === 'saw') pwmLead(f, 0.22, 0.13, when);
      else if (v.leadType === 'triangle') pulse(f, 0.22, 0.16, when, 'triangle');
      else pulse(f, 0.18, 0.12, when, 'square');
    }

    // Drums anhand Pattern
    const drumHit = drumPat[drumIdx];
    if (drumHit === 'K') kick(when, 0.35);
    if (drumHit === 'S') snare(when, 0.2);
    if (drumHit === 'H') hat(when, 0.08);
    // Subtile Hi-Hat-Spur unterhalb (jeder Schlag) für mehr Drive
    if (drumHit !== 'H' && drumHit !== 'S') hat(when, 0.04);
  }

  function tick() {
    if (!ctx || muted || !musicStarted) return;
    const bpm = 120 + Math.min(40, currentLevel * 0.5) + currentVariant.bpmOffset;
    const sixteenth = 60 / bpm / 4;
    const lookahead = 0.15; // sek vorausplanen
    while (nextNoteTime < ctx.currentTime + lookahead) {
      scheduleStep(stepIndex % stepCount, nextNoteTime - ctx.currentTime);
      stepIndex++;
      nextNoteTime += sixteenth;
    }
    musicTimer = setTimeout(tick, 30);
  }

  function startMusic(level = 1) {
    ensure();
    stopMusic();
    if (muted) return;
    currentLevel = level;
    // Immer prozeduraler Chiptune (externe Tracks deaktiviert)
    currentVariant = variantForLevel(level);
    musicStarted = true;
    stepIndex = 0;
    nextNoteTime = ctx.currentTime + 0.05;
    tick();
  }

  function stopMusic() {
    musicStarted = false;
    if (musicTimer) clearTimeout(musicTimer);
    musicTimer = null;
    stopExternalMusic();
  }

  return { resume, setMuted, isMuted, sfx, startMusic, stopMusic };
})();
