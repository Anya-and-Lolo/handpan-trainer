(() => {
  'use strict';

  /* =====================================================================
     Ethereal Handpan · Hand Drum Trainer
     Drum centre / falling lanes guidance, Demo / Practice / Wait for note /
     Tuner, D Kurd 9 / 10 / 12 at A4 = 440 Hz, percussion strokes D T K S.
     The canvas pipeline (stars, glow, guides, note sprites, particle trails,
     performance profiles) follows Ethereal Drum's tongue drum trainer.
     ===================================================================== */

  const STORAGE_SONGS = 'ethereal-handpan-songs-v1';
  const STORAGE_INSTRUMENT = 'ethereal-handpan-instrument-v1';
  const STORAGE_PREFS = 'ethereal-handpan-prefs-v3';
  const SONG_FORMAT = 'ethereal-handpan-song-v1';
  const REFERENCE_PITCH = 440;
  const HAND_COLORS = { L: '#38bdf8', R: '#fbbf24' };
  const NOTE_COLORS = ['#a78bfa', '#5eead4', '#fbbf24', '#fb7185', '#60a5fa', '#f472b6', '#34d399', '#f97316', '#c084fc', '#22d3ee', '#eab308', '#a3e635'];
  const DING_COLOR = '#c4b5fd';
  const PERC_COLOR = '#e2e8f0';
  const WRONG_COLOR = '#fb7185';
  const MIC_HEARD_COLOR = '#5eead4';
  const AUDIO_LOOKAHEAD = 0.14;
  const SCHEDULER_MS = 25;
  const MIN_SPEED = 0.1;
  const MAX_SPEED = 1.5;
  // Shell diameter of the stage handpan at --stage-scale 1. The wrapper is 1.3x wider so
  // bottom notes and slap zones near the rim still fit inside it.
  const STAGE_DRUM_BASE = 360;
  const VIEWBOX = { x: -1.3, y: -1.3, w: 2.6, h: 2.6 };
  const PARTICLE_QUALITY_ORDER = ['none', 'half', 'full'];
  const MIC_ICON = '<svg class="mic-icon" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="2" width="6" height="11" rx="3"></rect><path d="M5.5 10.5a6.5 6.5 0 0 0 13 0"></path><path d="M12 17v4"></path><path d="M8.6 21h6.8"></path></svg>';

  const SCALES = {
    kurd9: { id: 'kurd9', name: 'D Kurd 9', ding: 'D3', top: ['A3', 'Bb3', 'C4', 'D4', 'E4', 'F4', 'G4', 'A4'], bottoms: 0 },
    kurd10: { id: 'kurd10', name: 'D Kurd 10', ding: 'D3', top: ['A3', 'Bb3', 'C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'C5'], bottoms: 0 },
    kurd12: { id: 'kurd12', name: 'D Kurd 12', ding: 'D3', top: ['A3', 'Bb3', 'C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'C5'], bottoms: 2 }
  };
  const DEFAULT_BOTTOMS = ['F3', 'G3'];
  const BOTTOM_CHOICES = ['C3', 'D3', 'E3', 'F3', 'G3', 'A3', 'Bb3', 'C4', 'D5', 'E5', 'F5', 'G5'];
  // Percussion zones. My Handpan keeps the default zones (a slap under each hand, both
  // written "S"); a song can bring its own zones, also more than one of a kind: T2, S2...
  const PERC_IDS = ['T', 'K', 'SL', 'SR', 'P', 'F'];
  const PERC_BASES = ['T', 'K', 'S', 'P', 'F'];
  const PERC_INFO = {
    T: { label: 'T', name: 'Tak', sound: 'T' },
    K: { label: 'K', name: 'Ka', sound: 'K' },
    S: { label: 'S', name: 'Slap', sound: 'S' },
    SL: { label: 'S', name: 'Slap (left)', sound: 'S' },
    SR: { label: 'S', name: 'Slap (right)', sound: 'S' },
    P: { label: 'P', name: 'Palm', sound: 'P' },
    F: { label: 'F', name: 'Fist', sound: 'F' }
  };
  const PERC_WORDS = { T: 'tak', K: 'ka', S: 'slap', P: 'palm', F: 'fist' };
  const PERC_ID_PATTERN = /^(?:[TKSPF][2-9]?|S[LR])$/;
  const ZONE_R = 0.08;
  const SUBSCRIPT = { 2: '\u2082', 3: '\u2083', 4: '\u2084', 5: '\u2085', 6: '\u2086', 7: '\u2087', 8: '\u2088', 9: '\u2089' };
  const KEY_MAP = { d: 'D', '1': '1', '2': '2', '3': '3', '4': '4', '5': '5', '6': '6', '7': '7', '8': '8', '9': '9', '0': 'B1', '-': 'B2', t: 'T', k: 'K', p: 'P', f: 'F' };

  function isPercId(id) {
    return PERC_ID_PATTERN.test(String(id || ''));
  }

  function percBase(id) {
    return id === 'SL' || id === 'SR' ? 'S' : String(id || '').charAt(0);
  }

  function zoneIndex(id) {
    return /^[TKSPF][2-9]$/.test(String(id || '')) ? String(id).slice(1) : '';
  }

  function percInfo(id) {
    if (PERC_INFO[id]) return PERC_INFO[id];
    const base = PERC_INFO[percBase(id)];
    return base && isPercId(id) ? { label: base.label, name: `${base.name} ${zoneIndex(id)}`, sound: base.sound } : null;
  }

  // How a zone is written on the drum: S, S\u2082, T\u2083...
  function strokeMark(id) {
    const info = percInfo(id);
    if (!info) return String(id);
    const index = zoneIndex(id);
    return index ? `${info.label}${SUBSCRIPT[index]}` : info.label;
  }

  // Fallback copies so the two headline songs are there even if song-catalog.js is missing.
  const FALLBACK_SONGS = [
    {
      id: 'demo-interstellar', title: 'Interstellar', artist: 'Hans Zimmer · handpan arrangement', bpm: 120, beatsPerBar: 3, order: 1,
      sequence: '4L 8R - | 4L 8R - | 5R 8L - | 5R 8L - | 6L 8R - | 6L 8R - | 7R 8L - | 7R 8L 5R |\n4L 8R - | 4L 8R - | 5R 8L - | 5R 8L - | 6L 8R - | 6L 8R - | 7R 8L - | 7R 8L - | - - - - |\n4L+2R 8R - | 4L+2R 8R - | 3L+5R 8L - | 3L+5R 8L - | 6L+4R 8R - | 6L+4R 8R - | 5L+7R 8L - | 5L+7R 8L 5R |\n4L+2R 8R - | 4L+2R 8R - | 3L+5R 8L - | 3L+5R 8L - | 6L+4R 8R - | 6L+4R 8R - | 5L+7R 8L - | 5L+7R 8L - |'
    },
    {
      id: 'demo-minecraft', title: 'Minecraft (Sweden)', artist: 'C418 · handpan arrangement', bpm: 72, beatsPerBar: 4, order: 2,
      sequence: '8L 7R:0.5 4L:0.5 6L - | 8L 7R:0.5 4L:0.5 3R - | 8L 7R:0.5 4L:0.5 6L:0.5 3R:0.5 - |\n3R:0.5 4L:0.5 6L:0.5 7R:0.5 8L:0.5 7R:0.5 8L | 3R:0.5 4L:0.5 6L:0.5 7R:0.5 6L - |\n8L+7R 7R:0.5 4L:0.5 6L - | 8L+7R 7R:0.5 4L:0.5 3R - | 8L+7R 7R:0.5 4L:0.5 6L:0.5 3R:0.5 - |\n3R:0.5 4L:0.5 6L:0.5 7R:0.5 8L:0.5 7R:0.5 8L | 3R:0.5 4L:0.5 6L:0.5 7R:0.5 6L - - - |'
    }
  ];

  const $ = id => document.getElementById(id);
  const els = {};
  [
    'sidebar', 'sidebarClose', 'sidebarScrim', 'menuBtn', 'newSongBtn', 'importBtn', 'importFile', 'songSearch', 'songList', 'exportBtn', 'deleteBtn',
    'currentTitle', 'currentDifficulty', 'currentFit', 'helpBtn', 'editBtn', 'settingsBtn', 'mobileViewToggleBtn', 'trainerGrid',
    'scoreValue', 'scorePill', 'streakValue', 'streakPill', 'notesLeftValue', 'noteStage', 'noteCanvasBack', 'noteCanvas', 'focusModeBtn',
    'stageDrumWrap', 'stageHandLegend', 'rotateLeftBtn', 'rotateRightBtn', 'composeRotateLeftBtn', 'composeRotateRightBtn', 'layoutRow', 'totalNotesLabel', 'tempoLabel', 'mobileScoreValue', 'mobileScorePill', 'mobileStreakValue', 'mobileStreakPill', 'mobileNotesLeftValue',
    'waitBanner', 'waitBannerNotes', 'tunerPanel', 'tunerLabel', 'tunerNoteName', 'tunerCents', 'tunerMeter', 'tunerNeedle', 'tunerHz', 'countIn',
    'elapsedLabel', 'durationLabel', 'progress', 'abMarkerA', 'abMarkerB', 'setABtn', 'setBBtn', 'abLoopBtn', 'clearABBtn', 'abLoopStatus',
    'loopBtn', 'stopBtn', 'playBtn', 'metronomeBtn', 'guideBtn', 'speedSelect', 'countInToggle', 'micBtn', 'micStatus', 'modeHint',
    'practiceCard', 'instrumentTitle', 'keyboardHint', 'drumWrap', 'nextNoteValue', 'nextNoteTime', 'strokeKey',
    'editorDialog', 'editorForm', 'editorHeading', 'songTitleInput', 'songBpmInput', 'songMeterInput', 'chordModeToggle', 'composeDrum',
    'zonePanel', 'zoneTools', 'zoneSelected', 'addMuteBtn', 'appendRestBtn', 'appendBarBtn', 'undoTokenBtn', 'previewSongBtn', 'sequenceInput', 'sequenceStatus', 'saveSongBtn', 'deleteEditorBtn',
    'settingsDialog', 'scaleCards', 'bottomsConfig', 'noteTable', 'percToggle', 'mirrorToggle', 'settingsDrum', 'resetPercBtn',
    'handColorsToggle', 'noteNamesToggle', 'usedLanesToggle', 'helpDialog',
    'resultDialog', 'resultTitle', 'resultSummary', 'resultStats', 'resultHitValue', 'resultAccuracyValue', 'resultStreakValue', 'resultMistakes',
    'resultReplayBtn', 'resultSlowerBtn', 'resultNextBtn', 'resultRecommendation', 'resultRecommendedBtn', 'toast',
    'tourBtn', 'installBtn', 'installDialog', 'installHelpText', 'startupLoader', 'startupLoaderStatus', 'startupLoaderFill', 'startupLoaderCount', 'textModeBtn', 'rhythmView', 'topNewSongBtn', 'practiceOptions', 'waitToggle', 'micChipBtn', 'stageDock', 'dockLoopBtn', 'dockPlayBtn', 'dockMetronomeBtn', 'speedCycleBtn', 'speedCycleValue', 'songSwitchDialog', 'switchKeepBtn', 'switchChooseBtn', 'composePreviewStrip', 'stageJudge', 'difficultyFilter', 'resultSparkles', 'noteTape', 'noteTapeTrack', 'noteTapeJudge', 'stageSongName',
    'tourOverlay', 'tourShadeTop', 'tourShadeRight', 'tourShadeBottom', 'tourShadeLeft', 'tourFocusRing', 'tourCard', 'tourProgress',
    'tourTitle', 'tourText', 'tourSkipBtn', 'tourBackBtn', 'tourNextBtn', 'tourSoundBtn',
    'libraryBtn', 'libraryCountBadge', 'songLibraryDialog', 'libraryTabAll', 'libraryTabEasy', 'libraryTabMedium', 'libraryTabHard', 'libraryTabExpert', 'librarySearch', 'libraryGrid', 'libraryEmpty', 'libraryCommunityBanner', 'libraryCommunityInfoBtn',
    'communitySongsCount', 'communityEasyCount', 'communityMediumCount', 'communityHardCount', 'communityExpertCount', 'communityDialog', 'communitySelection', 'communityUploadProgress', 'communityUploadStatus', 'communityUploadPercent', 'communityProgressTrack', 'communityProgressFill', 'submitCommunityBtn',
    'soundWakeBtn', 'hintPop', 'fullscreenBtn',
    'waitStyleSelect', 'stagePracticeChips', 'stageWaitBtn', 'stageMicBtn', 'draftNotice', 'draftNoticeText', 'discardDraftBtn', 'allDraftsBtn',
    'draftsDialog', 'draftsList', 'draftsEmpty', 'editChoiceDialog', 'choiceEditBtn', 'choiceEditNote', 'choiceNewBtn', 'choiceDraftsBtn',
    'editorGuideBtn', 'resultBest', 'resultFasterBtn', 'micCheckBtn', 'resultSmartBtn', 'resultHistory', 'resultTake', 'resultToday', 'resultDrillBtn', 'recChipBtn', 'takeChipBtn', 'deleteProgressBtn', 'hapticsToggle', 'saveProgressBtn', 'loadProgressBtn', 'progressFile', 'shareSongBtn'
  ].forEach(id => { els[id] = $(id); });

  // Shared with the other Ethereal trainers: app-files/ethereal-common.js.
  const COMMON = window.EtherealCommon;
  const BEST = COMMON.createBestStore('ethereal-handpan-best-v1', { historyKey: 'ethereal-handpan-history-v1' });
  const HAPTICS_KEY = 'ethereal-handpan-haptics-v1';
  const PROGRESS_KEYS = { best: 'ethereal-handpan-best-v1', history: 'ethereal-handpan-history-v1', startHere: 'ethereal-handpan-start-here-v1' };
  const MIC_CHECK_KEY = 'ethereal-handpan-mic-check-v1';

  /* ------------------------------------------------------------------ */
  /* Storage                                                             */
  /* ------------------------------------------------------------------ */

  function readJson(key, fallback) {
    try {
      const raw = window.localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (error) {
      return fallback;
    }
  }

  function writeJson(key, value) {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (error) {
      return false;
    }
  }

  /* ------------------------------------------------------------------ */
  /* Pitch helpers                                                       */
  /* ------------------------------------------------------------------ */

  const PITCH_CLASS = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  const NAME_FOR_PC = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];

  function noteToMidi(name) {
    const match = /^([A-Ga-g])([#b]?)(-?\d)$/.exec(String(name || '').trim());
    if (!match) return 60;
    const pc = PITCH_CLASS[match[1].toUpperCase()] + (match[2] === '#' ? 1 : match[2] === 'b' ? -1 : 0);
    return (Number(match[3]) + 1) * 12 + pc;
  }

  function midiToName(midi) {
    return `${NAME_FOR_PC[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`;
  }

  function frequencyForMidi(midi) {
    return REFERENCE_PITCH * Math.pow(2, (midi - 69) / 12);
  }

  /* ------------------------------------------------------------------ */
  /* Instrument                                                          */
  /* ------------------------------------------------------------------ */

  function defaultInstrument() {
    return {
      scale: 'kurd10',
      bottoms: DEFAULT_BOTTOMS.slice(),
      percussion: true,
      mirror: false,
      percPos: {},
      handColors: true,
      noteNames: false,
      usedLanes: true,
      // Rotation in half-steps between tone fields. 1 = layout 1 (the lowest pair, Bb and A,
      // straddles the bottom - the most common), 0 = layout 2 (note 1 alone at the bottom).
      rotationSteps: 1
    };
  }

  function normaliseInstrument(raw) {
    const base = defaultInstrument();
    const value = raw && typeof raw === 'object' ? raw : {};
    const result = { ...base, ...value };
    if (!SCALES[result.scale]) result.scale = base.scale;
    if (!Array.isArray(result.bottoms) || result.bottoms.length < 2) result.bottoms = base.bottoms.slice();
    result.bottoms = result.bottoms.slice(0, 2).map((name, index) => (BOTTOM_CHOICES.includes(name) ? name : DEFAULT_BOTTOMS[index]));
    if (!result.percPos || typeof result.percPos !== 'object') result.percPos = {};
    // Version 1 stored a single slap as "S"; it is the left slap now.
    Object.values(result.percPos).forEach(map => {
      if (map && map.S && !map.SL) { map.SL = map.S; delete map.S; }
    });
    ['percussion', 'mirror', 'handColors', 'noteNames', 'usedLanes'].forEach(key => { result[key] = Boolean(result[key]); });
    result.rotationSteps = Number.isFinite(Number(result.rotationSteps)) ? Math.round(Number(result.rotationSteps)) : 1;
    return result;
  }

  // Tone fields zig-zag around the ding: 1 at the bottom, even numbers to the left,
  // odd numbers to the right, climbing towards the top. Angles are measured from the
  // bottom of the drum, positive to the player's right.
  function topAngle(index, count) {
    if (index === 1) return 0;
    const step = 360 / count;
    const k = Math.floor(index / 2);
    return (index % 2 === 0 ? -1 : 1) * k * step;
  }

  function polar(angleDeg, radius) {
    const a = angleDeg * Math.PI / 180;
    return { x: radius * Math.sin(a), y: radius * Math.cos(a) };
  }

  function rotationOffset(instrument, count) {
    return (instrument.rotationSteps || 0) * (360 / count) / 2;
  }

  function angleDistance(a, b) {
    return Math.abs(((((a - b) % 360) + 540) % 360) - 180);
  }

  // The ding's notes fly in through the gap between two tone fields nearest the top.
  function dingRayAngle(count, offset) {
    const step = 360 / count;
    let best = 180;
    let bestDistance = Infinity;
    for (let i = 1; i <= count; i += 1) {
      const mid = topAngle(i, count) + offset + step / 2;
      const distance = angleDistance(mid, 180);
      if (distance < bestDistance - 1e-6) { best = mid; bestDistance = distance; }
    }
    return best;
  }

  function defaultPercPositions(count, offset = 0) {
    // The left slap sits between 4 and 6; the right slap mirrors it, so both hands
    // reach the same distance (both slaps sound the same).
    const left = polar((topAngle(4, count) + topAngle(6, count)) / 2 + offset, 0.895);
    const right = { x: -left.x, y: left.y };
    // P is the palm on the ding (just below its centre); F, the fist, sits low on the right.
    return {
      T: { x: 0.37, y: -0.02 },
      K: { x: -0.37, y: -0.02 },
      SL: { x: left.x, y: left.y },
      SR: { x: right.x, y: right.y },
      P: { x: 0, y: 0.15 },
      F: polar((topAngle(1, count) + topAngle(3, count)) / 2 + offset, 0.895)
    };
  }

  function buildPads(instrument, offsetOverride, zoneCtx = songZoneCtx(state.song)) {
    const scale = SCALES[instrument.scale];
    const count = scale.top.length;
    const offset = Number.isFinite(offsetOverride) ? offsetOverride : rotationOffset(instrument, count);
    const pads = [];
    const dingMidi = noteToMidi(scale.ding);
    pads.push({ id: 'D', label: 'D', kind: 'ding', midi: dingMidi, name: midiToName(dingMidi), x: 0, y: 0, rx: 0.27, ry: 0.24, rot: 0, side: 'C', hand: 'R', color: DING_COLOR, rayAngle: dingRayAngle(count, offset) });
    const fieldPositions = window.EtherealCosmetics.handpanFields(count, offset);
    scale.top.forEach((noteName, i) => {
      const num = i + 1;
      const p = fieldPositions[i];
      const midi = noteToMidi(noteName);
      const side = num === 1 ? 'R' : (num % 2 === 0 ? 'L' : 'R');
      pads.push({
        id: String(num), num, label: String(num), kind: 'tone', midi, name: midiToName(midi),
        x: p.x, y: p.y, rx: p.rx, ry: p.ry,
        rot: Math.atan2(p.y, p.x) * 180 / Math.PI, side, hand: side, color: NOTE_COLORS[i % NOTE_COLORS.length]
      });
    });
    for (let b = 0; b < scale.bottoms; b += 1) {
      const sign = b === 0 ? -1 : 1;
      const p = polar(sign * 40 + offset, 1.12);
      const midi = noteToMidi(instrument.bottoms[b] || DEFAULT_BOTTOMS[b]);
      pads.push({
        id: `B${b + 1}`, label: `B${b + 1}`, kind: 'bottom', midi, name: midiToName(midi),
        x: p.x, y: p.y, rx: 0.15, ry: 0.105, rot: Math.atan2(p.y, p.x) * 180 / Math.PI,
        side: sign < 0 ? 'L' : 'R', hand: sign < 0 ? 'L' : 'R', color: '#94a3b8'
      });
    }
    if (instrument.percussion) zonePads(instrument, count, offset, pads, zoneCtx).forEach(pad => pads.push(pad));
    return pads;
  }

  /* ---------- Stroke zones ---------- */

  // Turn a point around the centre (angles as in polar(): from the bottom, to the right).
  function turnPoint(x, y, degrees) {
    if (!degrees) return { x, y };
    return polar(Math.atan2(x, y) * 180 / Math.PI + degrees, Math.hypot(x, y));
  }

  // What a song brings: its own zones (or none) and the zone ids it writes.
  function songZoneCtx(song) {
    return { zones: Array.isArray(song?.zones) ? song.zones : null, used: percIdsIn(song?.sequence || '') };
  }

  const DEFAULT_ZONE_CTX = { zones: null, used: new Set(), defaultsOnly: true };

  // A zone never sits on a note: not on a tone field and not on the ding (except P, the
  // palm on the ding). It keeps clear of the other zones and stays on the shell.
  function zoneBlocked(x, y, id, pads, placed) {
    if (Math.hypot(x, y) > 0.93) return true;
    const palm = percBase(id) === 'P';
    const margin = ZONE_R * 0.9;
    for (const pad of pads) {
      if (pad.kind !== 'tone' && pad.kind !== 'ding') continue;
      if (pad.kind === 'ding' && palm) continue;
      const a = -(pad.rot || 0) * Math.PI / 180;
      const dx = x - pad.x;
      const dy = y - pad.y;
      const lx = dx * Math.cos(a) - dy * Math.sin(a);
      const ly = dx * Math.sin(a) + dy * Math.cos(a);
      if ((lx / (pad.rx + margin)) ** 2 + (ly / (pad.ry + margin)) ** 2 < 1) return true;
    }
    return placed.some(p => Math.hypot(p.x - x, p.y - y) < ZONE_R * 2 + 0.012);
  }

  // The nearest free metal: rings around the wanted spot, a little wider each time. On a
  // ring the spot that stays as far from the centre as the wanted one wins, so a zone
  // slides round a note rather than jumping inwards or outwards.
  function snapZone(x, y, id, pads, placed) {
    if (!zoneBlocked(x, y, id, pads, placed)) return { x, y };
    const wanted = Math.hypot(x, y);
    for (let r = 0.02; r <= 1.3; r += 0.02) {
      let best = null;
      let bestScore = Infinity;
      for (let k = 0; k < 32; k += 1) {
        const a = (k / 32) * Math.PI * 2;
        const px = x + Math.cos(a) * r;
        const py = y + Math.sin(a) * r;
        if (zoneBlocked(px, py, id, pads, placed)) continue;
        const score = Math.abs(Math.hypot(px, py) - wanted);
        if (score < bestScore) { best = { x: px, y: py }; bestScore = score; }
      }
      if (best) return best;
    }
    return { x, y };
  }

  function zonePads(instrument, count, offset, tonePads, ctx = {}) {
    const defaults = defaultPercPositions(count, offset);
    const custom = instrument.percPos[instrument.scale] || {};
    const used = ctx.used || new Set();
    const specs = new Map();
    PERC_IDS.forEach(id => {
      const base = custom[id] && Number.isFinite(custom[id].x) ? custom[id] : defaults[id];
      // Mirroring moves the zones to the other hand; there is a slap under each hand already.
      const flip = instrument.mirror && id !== 'SL' && id !== 'SR';
      const x = flip ? -base.x : base.x;
      const hand = id === 'SL' ? 'L' : id === 'SR' ? 'R' : Math.abs(x) < 0.02 ? (instrument.mirror ? 'L' : 'R') : (x < 0 ? 'L' : 'R');
      specs.set(id, { id, x, y: base.y, hand, rank: used.has(id) ? 1 : 3, own: false });
    });
    if (!ctx.defaultsOnly && Array.isArray(ctx.zones)) {
      ctx.zones.forEach(zone => {
        if (!zone || !isPercId(zone.id) || zone.id === 'S' || !Number.isFinite(zone.x) || !Number.isFinite(zone.y)) return;
        // A song's zones are kept as on the unturned drum, so they turn with the notes.
        const p = turnPoint(zone.x, zone.y, offset);
        const fixed = zone.id === 'SL' || zone.id === 'SR';
        const flip = instrument.mirror && !fixed;
        let hand = zone.id === 'SL' ? 'L' : zone.id === 'SR' ? 'R' : zone.hand === 'L' || zone.hand === 'R' ? zone.hand : (p.x < 0 ? 'L' : 'R');
        if (flip) hand = hand === 'L' ? 'R' : 'L';
        specs.set(zone.id, { id: zone.id, x: flip ? -p.x : p.x, y: p.y, hand, rank: 0, own: true });
      });
    }
    used.forEach(id => {
      if (specs.has(id) || !isPercId(id) || id === 'S') return;
      // An extra zone (T2, S3...) with no spot yet starts a little round from the first of its kind.
      const base = percBase(id);
      const first = specs.get(base === 'S' ? (Number(zoneIndex(id)) % 2 ? 'SR' : 'SL') : base);
      const p = turnPoint(first.x, first.y, first.x < 0 ? -26 : 26);
      specs.set(id, { id, x: p.x, y: p.y, hand: first.hand, rank: 2, own: false });
    });
    const placed = [];
    return [...specs.values()].sort((a, b) => a.rank - b.rank).map(spec => {
      const spot = snapZone(spec.x, spec.y, spec.id, tonePads, placed);
      placed.push(spot);
      const info = percInfo(spec.id);
      return {
        id: spec.id, label: info.label, mark: strokeMark(spec.id), kind: 'perc', midi: null, name: info.name, sound: info.sound,
        x: spot.x, y: spot.y, rx: ZONE_R, ry: ZONE_R, rot: 0, side: spot.x < 0 ? 'L' : 'R', hand: spec.hand, color: PERC_COLOR, own: spec.own
      };
    });
  }

  // Lanes read like the drum seen from above: even notes on the left, odd notes on the
  // right, the ding in the middle, taps next to it and slaps / bottoms at the edges.
  function laneOrder(pads, usedIds) {
    const ding = pads.filter(p => p.kind === 'ding');
    const tones = pads.filter(p => p.kind === 'tone');
    const left = tones.filter(p => p.side === 'L').sort((a, b) => b.num - a.num);
    const right = tones.filter(p => p.side === 'R').sort((a, b) => a.num - b.num);
    const perc = pads.filter(p => p.kind === 'perc');
    const inner = perc.filter(p => Math.hypot(p.x, p.y) < 0.6);
    const outer = perc.filter(p => Math.hypot(p.x, p.y) >= 0.6);
    const byX = (a, b) => a.x - b.x;
    const bottoms = pads.filter(p => p.kind === 'bottom');
    let order = [
      ...bottoms.filter(p => p.side === 'L'),
      ...outer.filter(p => p.x < 0).sort(byX),
      ...left,
      ...inner.filter(p => p.x < 0).sort(byX),
      ...ding,
      ...inner.filter(p => p.x >= 0).sort(byX),
      ...right,
      ...outer.filter(p => p.x >= 0).sort(byX),
      ...bottoms.filter(p => p.side === 'R')
    ];
    if (usedIds && usedIds.size) order = order.filter(p => p.kind === 'ding' || usedIds.has(p.id));
    return order;
  }

  /* ------------------------------------------------------------------ */
  /* Song parsing                                                        */
  /* ------------------------------------------------------------------ */

  const ITEM_PATTERN = /^(DING|D|B[12]|[1-9]|[TKSPF][2-9]?|M)([LR])?$/i;

  // One stroke inside a token: "4R", "(T)" a ghost note, "*S2L" a flam, "M" a mute.
  function parsePart(part) {
    let text = String(part || '');
    let ghost = false;
    let flam = false;
    if (text.startsWith('*')) { flam = true; text = text.slice(1); }
    const bracket = /^\((.+)\)$/.exec(text);
    if (bracket) { ghost = true; text = bracket[1]; }
    if (!flam && text.startsWith('*')) { flam = true; text = text.slice(1); }
    const match = ITEM_PATTERN.exec(text);
    if (!match) return null;
    let id = match[1].toUpperCase();
    if (id === 'DING') id = 'D';
    const hand = match[2] ? match[2].toUpperCase() : '';
    const item = { pad: id, hand, explicitHand: Boolean(hand) };
    if (ghost) item.ghost = true;
    if (flam) item.flam = true;
    return item;
  }

  // The zone ids a song writes (an "S" may land on either slap).
  function percIdsIn(text) {
    const ids = new Set();
    String(text || '').replace(/#[^\n]*/g, ' ').split(/[\s|]+/).forEach(token => {
      if (!token) return;
      splitToken(token).core.split('+').forEach(part => {
        const item = parsePart(part);
        if (!item || !isPercId(item.pad)) return;
        if (item.pad === 'S') {
          if (item.hand !== 'R') ids.add('SL');
          if (item.hand !== 'L') ids.add('SR');
          return;
        }
        ids.add(item.pad);
      });
    });
    return ids;
  }

  function parseDuration(text) {
    if (text == null || text === '') return 1;
    const fraction = /^(\d+)\/(\d+)$/.exec(text);
    if (fraction) return Number(fraction[1]) / Math.max(1, Number(fraction[2]));
    const value = Number(text);
    return Number.isFinite(value) && value > 0 ? value : NaN;
  }

  function splitToken(token) {
    let core = token;
    let duration = 1;
    const colon = core.lastIndexOf(':');
    if (colon >= 0) {
      duration = parseDuration(core.slice(colon + 1));
      core = core.slice(0, colon);
    } else if (/=+$/.test(core) && core.length > 1) {
      duration = Math.pow(0.25, core.match(/=+$/)[0].length);
      core = core.replace(/=+$/, '');
    } else if (/_+$/.test(core) && core.length > 1) {
      duration = Math.pow(0.5, core.match(/_+$/)[0].length);
      core = core.replace(/_+$/, '');
    }
    return { core, duration };
  }

  function parseSequence(text, bpm, beatsPerBar, padMap) {
    const tempo = Math.min(300, Math.max(20, Number(bpm) || 90));
    const spb = 60 / tempo;
    const clean = String(text || '').replace(/#[^\n]*/g, ' ').replace(/\|/g, ' | ');
    const tokens = clean.split(/\s+/).filter(Boolean);
    const events = [];
    const bars = [0];
    const errors = [];
    let beat = 0;

    tokens.forEach(token => {
      if (token === '|') {
        if (bars[bars.length - 1] !== beat) bars.push(beat);
        return;
      }
      const { core, duration } = splitToken(token);
      if (!Number.isFinite(duration)) { errors.push(token); return; }
      if (core === '-' || core === '0' || core === '.' || core === '') {
        beat += duration;
        return;
      }
      const items = [];
      let bad = false;
      core.split('+').filter(Boolean).forEach(part => {
        const item = parsePart(part);
        if (!item) { bad = true; return; }
        items.push(item);
      });
      if (bad || !items.length) { errors.push(token); beat += duration; return; }
      const index = events.length;
      items.forEach((item, k) => { item.id = `${index}:${k}`; item.event = index; });
      events.push({ index, beat, time: beat * spb, durBeats: duration, items, bar: bars.length });
      beat += duration;
    });

    const totalBeats = Math.max(beat, 1);
    if (bars[bars.length - 1] !== totalBeats) bars.push(totalBeats);
    assignHands(events, padMap);
    const missing = new Set();
    const used = new Set();
    const percOn = Boolean(state.instrument?.percussion);
    const mirror = percOn && Boolean(state.instrument?.mirror);
    let mutes = 0;
    events.forEach(event => event.items.forEach(item => {
      // M is not a note: a hand rests on the shell and the ringing stops.
      if (item.pad === 'M') { item.fx = 'mute'; item.missing = true; mutes += 1; return; }
      // "S" is written once; the hand decides which slap zone it lands on.
      if (item.pad === 'S') item.pad = item.hand === 'R' ? 'SR' : 'SL';
      // Mirrored for left-handed playing, a hand written on a zone swaps with it.
      if (mirror && item.explicitHand && isPercId(item.pad) && item.pad !== 'SL' && item.pad !== 'SR') item.hand = item.hand === 'L' ? 'R' : 'L';
      // Extra zones (T2, S3...) always find a free spot on the drum.
      item.missing = !padMap.has(item.pad) && !(percOn && isPercId(item.pad));
      used.add(item.pad);
      if (item.missing) missing.add(isPercId(item.pad) ? percBase(item.pad) : item.pad);
    }));
    const playable = events.flatMap(e => e.items.filter(i => !i.missing));
    return {
      events, bars, errors, missing, used, spb, bpm: tempo,
      beatsPerBar: Math.max(1, Number(beatsPerBar) || 4),
      totalBeats, duration: totalBeats * spb,
      // Ghost notes are a bonus on top: they are not counted.
      itemCount: playable.filter(i => !i.ghost).length,
      mutes,
      chordCount: events.filter(e => e.items.length > 1).length
    };
  }

  function defaultHandFor(padId, padMap) {
    const pad = padMap.get(padId);
    if (pad) return pad.hand;
    if (padId === 'T') return 'R';
    if (padId === 'K') return 'L';
    return '';
  }

  function assignHands(events, padMap) {
    let lastHand = 'L';
    events.forEach(event => {
      const auto = event.items.filter(item => !item.explicitHand);
      auto.forEach(item => {
        if (item.pad === 'S') {
          // A free slap goes to whichever hand is not busy, alternating with the last stroke.
          const others = event.items.filter(other => other !== item && other.hand);
          item.hand = others.length ? (others[0].hand === 'L' ? 'R' : 'L') : (lastHand === 'R' ? 'L' : 'R');
          return;
        }
        item.hand = defaultHandFor(item.pad, padMap) || 'R';
        const pad = padMap.get(item.pad);
        if (pad && pad.side === 'C' && event.items.length === 1) item.hand = lastHand === 'R' ? 'L' : 'R';
      });
      if (event.items.length > 1 && auto.length) {
        // Two strokes on the same side at once: the left one to the left hand, the other to the right.
        const hands = event.items.map(i => i.hand);
        if (new Set(hands).size === 1) {
          const sorted = event.items.slice().sort((a, b) => (padMap.get(a.pad)?.x || 0) - (padMap.get(b.pad)?.x || 0));
          sorted.forEach((item, k) => { if (!item.explicitHand) item.hand = k === 0 ? 'L' : 'R'; });
        }
      }
      lastHand = event.items[event.items.length - 1]?.hand || lastHand;
    });
  }

  function songDifficulty(parsed) {
    const seconds = Math.max(1, parsed.duration);
    const rate = parsed.itemCount / seconds;
    const chordRatio = parsed.events.length ? parsed.chordCount / parsed.events.length : 0;
    let score = rate + chordRatio * 1.2 + (parsed.bpm >= 140 ? 0.6 : 0);
    const minDur = parsed.events.reduce((m, e) => Math.min(m, e.durBeats * parsed.spb), 9);
    if (minDur < 0.2) score += 0.8;
    if (score < 1.4) return { level: 'easy', label: 'Easy' };
    if (score < 2.3) return { level: 'medium', label: 'Medium' };
    if (score < 3.3) return { level: 'hard', label: 'Hard' };
    return { level: 'expert', label: 'Expert' };
  }

  /* ------------------------------------------------------------------ */
  /* State                                                               */
  /* ------------------------------------------------------------------ */

  const prefs = Object.assign({
    speed: 1, mode: 'listen', view: 'radial', countIn: true, metronome: false, guide: true, loop: false, selectedId: 'demo-interstellar'
  }, readJson(STORAGE_PREFS, {}));

  const state = {
    instrument: normaliseInstrument(readJson(STORAGE_INSTRUMENT, null)),
    pads: [],
    padMap: new Map(),
    lanes: [],
    demoSongs: [],
    mySongs: [],
    song: null,
    parsed: null,
    mode: ['listen', 'practice', 'wait'].includes(prefs.mode) ? prefs.mode : 'listen',
    view: prefs.view === 'lanes' ? 'lanes' : 'radial',
    speed: clampSpeed(prefs.speed),
    countIn: prefs.countIn !== false,
    metronome: Boolean(prefs.metronome),
    guide: Boolean(prefs.guide),
    waitPref: prefs.mode === 'wait' || Boolean(prefs.waitPref),
    // How Wait for note sounds: quiet, hear it first (the app plays the note), game (a chime when right).
    waitStyle: ['quiet', 'hear', 'game'].includes(prefs.waitMode) ? prefs.waitMode : 'game',
    loop: Boolean(prefs.loop),
    playing: false,
    holding: false,
    songTime: 0,
    anchorSong: 0,
    anchorReal: 0,
    clock: 'perf',
    countInBeats: 0,
    loopA: null,
    loopB: null,
    abLoop: false,
    results: new Map(),
    wrong: 0,
    streak: 0,
    bestStreak: 0,
    waitIdx: 0,
    schedIdx: 0,
    schedBeat: 0,
    flashIdx: 0,
    missIdx: 0,
    runStartedAt: 0,
    effects: [],
    laneFlash: new Map(),
    nextKey: '',
    drums: [],
    loopTimer: 0,
    schedulerId: 0,
    lastUi: 0,
    search: '',
    levelFilter: 'all',
    focusMode: false,
    // canvas pipeline
    layout: { w: 0, h: 0, drum: null, lanesTop: 0, lanesBottom: 0, phoneLanes: false },
    performanceProfile: null,
    particleQuality: 'full',
    particleProfileName: '',
    backgroundRateScale: 1,
    particlePhaseCache: new Map(),
    stars: [],
    lastFrameAt: 0,
    lastBackdropAt: 0,
    backdropMode: '',
    staticGuideCanvas: null,
    staticGuideKey: '',
    laneGuideCanvas: null,
    laneGuideKey: '',
    lastRenderAt: 0,
    visualMonitorStartedAt: 0,
    visualMonitorSamples: 0,
    visualMonitorSlowSamples: 0,
    visualMonitorCostAverage: 0,
    visualMonitorLastFrameAt: 0,
    tunerToken: 0,
    tunerReadings: []
  };

  function clampSpeed(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return 1;
    return Math.round(Math.min(MAX_SPEED, Math.max(MIN_SPEED, n)) * 100) / 100;
  }

  function savePrefs() {
    writeJson(STORAGE_PREFS, {
      speed: state.speed, mode: state.mode === 'tuner' ? 'listen' : state.mode, view: state.view, countIn: state.countIn,
      metronome: state.metronome, guide: state.guide, loop: state.loop, waitPref: state.waitPref, waitMode: state.waitStyle, selectedId: state.song?.id || prefs.selectedId
    });
  }

  function saveInstrument() {
    writeJson(STORAGE_INSTRUMENT, state.instrument);
  }

  /* ------------------------------------------------------------------ */
  /* Audio                                                               */
  /* ------------------------------------------------------------------ */

  const audio = { ctx: null, bus: null, master: null, buffers: new Map(), rendering: null, scheduled: [], preview: [] };

  function makeImpulse(context, seconds, decay) {
    const length = Math.floor(context.sampleRate * seconds);
    const impulse = context.createBuffer(2, length, context.sampleRate);
    for (let channel = 0; channel < 2; channel += 1) {
      const data = impulse.getChannelData(channel);
      for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
    }
    return impulse;
  }

  function createAudioGraph() {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return null;
    const context = new AudioCtx({ latencyHint: 'interactive' });
    const master = context.createGain();
    master.gain.value = 0.9;
    const compressor = context.createDynamicsCompressor();
    compressor.threshold.value = -14;
    compressor.ratio.value = 3;
    const bus = context.createGain();
    const dry = context.createGain();
    dry.gain.value = 1;
    const wet = context.createGain();
    wet.gain.value = 0.22;
    const reverb = context.createConvolver();
    reverb.buffer = makeImpulse(context, 2.6, 2.8);
    bus.connect(dry).connect(master);
    bus.connect(reverb).connect(wet).connect(master);
    // Phone and tablet speakers are small and quiet: a little more level there, and a
    // limiter at the end so several ringing notes together never clip and crackle.
    if (window.matchMedia?.('(pointer: coarse)').matches) {
      master.gain.value = 1.3;
      const limiter = context.createDynamicsCompressor();
      limiter.threshold.value = -3;
      limiter.knee.value = 0;
      limiter.ratio.value = 20;
      limiter.attack.value = 0.002;
      limiter.release.value = 0.12;
      master.connect(compressor).connect(limiter).connect(context.destination);
    } else {
      master.connect(compressor).connect(context.destination);
    }
    audio.ctx = context;
    audio.bus = bus;
    audio.master = master;
    return context;
  }

  async function ensureAudio() {
    if (!audio.ctx) {
      createAudioGraph();
      // Sound that wakes up later (first tap, or a browser that allows it) takes over the tour.
      audio.ctx?.addEventListener('statechange', onAudioStateChange);
    }
    if (!audio.ctx) return null;
    if (audio.ctx.state !== 'running') {
      // Before the first tap/click most browsers keep audio locked and resume() would wait
      // for that gesture. A computer that allows sound straight away starts within a moment,
      // so wait briefly for it; otherwise the tour runs on the page clock until a tap.
      const activation = navigator.userActivation;
      if (activation && !activation.hasBeenActive) {
        await Promise.race([audio.ctx.resume().catch(() => {}), new Promise(resolve => setTimeout(resolve, 450))]);
      } else {
        try { await audio.ctx.resume(); } catch (error) { /* ignored */ }
      }
    }
    if (!audio.rendering) audio.rendering = renderAllSounds();
    return audio.ctx;
  }

  function soundKeyForPad(pad) {
    if (!pad) return '';
    if (pad.kind === 'perc') return `perc:${pad.sound || pad.id}`;
    return `${pad.kind === 'ding' ? 'ding' : 'tone'}:${pad.midi}`;
  }

  function normaliseBuffer(buffer, target) {
    let peak = 0;
    for (let c = 0; c < buffer.numberOfChannels; c += 1) {
      const data = buffer.getChannelData(c);
      for (let i = 0; i < data.length; i += 1) peak = Math.max(peak, Math.abs(data[i]));
    }
    if (peak > 0) {
      const gain = target / peak;
      for (let c = 0; c < buffer.numberOfChannels; c += 1) {
        const data = buffer.getChannelData(c);
        for (let i = 0; i < data.length; i += 1) data[i] *= gain;
      }
    }
    return buffer;
  }

  function noiseBuffer(context, seconds) {
    const length = Math.max(1, Math.floor(context.sampleRate * seconds));
    const buffer = context.createBuffer(1, length, context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  // Attack, then an exponential fall to -60 dB at decayEnd (a natural ring-out).
  function envelope(context, param, start, peak, attack, decayEnd) {
    param.setValueAtTime(0.00001, start);
    param.linearRampToValueAtTime(peak, start + attack);
    param.exponentialRampToValueAtTime(Math.max(0.000001, peak * 0.001), Math.max(start + attack + 0.01, decayEnd));
    param.linearRampToValueAtTime(0, Math.max(start + attack + 0.02, decayEnd) + 0.05);
  }

  // A handpan voice: tuned fundamental, octave and compound fifth, a slightly detuned
  // twin for the gentle shimmer, and a short soft "touch" transient.
  async function renderToneSound(midi, isDing) {
    const Offline = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    if (!Offline) return null;
    const sampleRate = audio.ctx?.sampleRate || 44100;
    const seconds = isDing ? 5.6 : 4.6;
    const context = new Offline(1, Math.ceil(sampleRate * seconds), sampleRate);
    const f = frequencyForMidi(midi);
    const out = context.createGain();
    const tone = context.createBiquadFilter();
    tone.type = 'lowpass';
    tone.frequency.value = Math.min(10000, f * 10);
    tone.Q.value = 0.3;
    out.connect(tone).connect(context.destination);
    // Phone and tablet speakers hardly play anything below ~250 Hz, so there the low notes
    // (above all the ding, D3 = 147 Hz) get stronger overtones: the ear still hears the
    // same pitch, now through the octave and fifth above it.
    const smallSpeaker = window.matchMedia?.('(pointer: coarse)').matches;
    const low = f < 260;
    const partials = isDing
      ? (smallSpeaker
        ? [[1, 1, 0.012, 5.4], [1.0028, 0.3, 0.012, 4.8], [2, 1.05, 0.006, 4.0], [3, 0.55, 0.004, 2.8], [4.02, 0.24, 0.003, 1.5], [5.03, 0.08, 0.003, 0.8]]
        : [[1, 1, 0.012, 5.4], [1.0028, 0.3, 0.012, 4.8], [2, 0.42, 0.006, 3.6], [3, 0.16, 0.004, 2.2], [4.02, 0.04, 0.003, 0.9]])
      : (smallSpeaker && low
        ? [[1, 1, 0.009, 4.4], [1.0024, 0.24, 0.009, 3.8], [2, 0.8, 0.005, 3.2], [3, 0.34, 0.004, 2.0], [4.03, 0.1, 0.003, 0.9]]
        : [[1, 1, 0.009, 4.4], [1.0024, 0.24, 0.009, 3.8], [2, 0.48, 0.005, 3.0], [3, 0.18, 0.004, 1.8], [4.03, 0.05, 0.003, 0.7]]);
    partials.forEach(([ratio, amp, attack, decay]) => {
      const freq = f * ratio;
      if (freq > sampleRate / 2 - 200) return;
      const osc = context.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const gain = context.createGain();
      envelope(context, gain.gain, 0, amp, attack, Math.min(seconds, decay));
      osc.connect(gain).connect(out);
      osc.start(0);
      osc.stop(seconds);
    });
    const touch = context.createBufferSource();
    touch.buffer = noiseBuffer(context, 0.06);
    const touchFilter = context.createBiquadFilter();
    touchFilter.type = 'bandpass';
    touchFilter.frequency.value = Math.min(6000, f * 5);
    touchFilter.Q.value = 1.4;
    const touchGain = context.createGain();
    envelope(context, touchGain.gain, 0, isDing ? 0.14 : 0.1, 0.002, 0.07);
    touch.connect(touchFilter).connect(touchGain).connect(out);
    touch.start(0);
    const buffer = await context.startRendering();
    return normaliseBuffer(buffer, isDing ? 0.62 : 0.5);
  }

  async function renderPercSound(id) {
    const Offline = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    if (!Offline) return null;
    const sampleRate = audio.ctx?.sampleRate || 44100;
    const seconds = id === 'S' ? 1.6 : id === 'P' ? 2.4 : id === 'F' ? 1.8 : 1.2;
    const context = new Offline(1, Math.ceil(sampleRate * seconds), sampleRate);
    const out = context.createGain();
    out.connect(context.destination);
    const spec = {
      // P: the palm on the ding, a deep warm "dum" (the ding rings on). F: a low fist thump.
      P: { band: 760, q: 0.8, noise: 0.42, noiseDecay: 0.05, knock: 96, knockAmp: 0.78, knockDecay: 0.24, ring: [], ringAmp: 0, ringDecay: 0.2, ding: 0.5 },
      F: { band: 520, q: 0.7, noise: 0.6, noiseDecay: 0.06, knock: 74, knockAmp: 0.95, knockDecay: 0.17, ring: [560, 860], ringAmp: 0.05, ringDecay: 0.16, ding: 0.2 },
      T: { band: 3300, q: 1.3, noise: 0.9, noiseDecay: 0.05, knock: 230, knockAmp: 0.32, ring: [1230, 1810, 2730], ringAmp: 0.13, ringDecay: 0.2, ding: 0.07 },
      K: { band: 2200, q: 1.1, noise: 0.8, noiseDecay: 0.055, knock: 190, knockAmp: 0.3, ring: [1050, 1590, 2410], ringAmp: 0.11, ringDecay: 0.2, ding: 0.07 },
      S: { band: 2600, q: 0.6, noise: 1.25, noiseDecay: 0.11, knock: 120, knockAmp: 0.55, ring: [1480, 2270, 3390], ringAmp: 0.16, ringDecay: 0.34, ding: 0.12 }
    }[id];
    const noise = context.createBufferSource();
    noise.buffer = noiseBuffer(context, 0.25);
    const band = context.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = spec.band;
    band.Q.value = spec.q;
    const noiseGain = context.createGain();
    envelope(context, noiseGain.gain, 0, spec.noise, 0.0015, spec.noiseDecay);
    noise.connect(band).connect(noiseGain).connect(out);
    noise.start(0);

    const knock = context.createOscillator();
    knock.type = 'sine';
    knock.frequency.setValueAtTime(spec.knock * 1.5, 0);
    knock.frequency.exponentialRampToValueAtTime(spec.knock, 0.04);
    const knockGain = context.createGain();
    envelope(context, knockGain.gain, 0, spec.knockAmp, 0.002, spec.knockDecay || (id === 'S' ? 0.14 : 0.07));
    knock.connect(knockGain).connect(out);
    knock.start(0);
    knock.stop(Math.max(0.3, (spec.knockDecay || 0) + 0.12));

    spec.ring.forEach((freq, k) => {
      const osc = context.createOscillator();
      osc.frequency.value = freq;
      const gain = context.createGain();
      envelope(context, gain.gain, 0, spec.ringAmp / (k + 1), 0.002, spec.ringDecay);
      osc.connect(gain).connect(out);
      osc.start(0);
      osc.stop(seconds);
    });

    // Taps and slaps excite the shell, so a whisper of the ding rings on.
    const dingF = frequencyForMidi(noteToMidi(SCALES[state.instrument.scale].ding));
    [[1, 1], [2, 0.5]].forEach(([ratio, amp]) => {
      const osc = context.createOscillator();
      osc.frequency.value = dingF * ratio;
      const gain = context.createGain();
      envelope(context, gain.gain, 0, spec.ding * amp, 0.01, seconds);
      osc.connect(gain).connect(out);
      osc.start(0);
      osc.stop(seconds);
    });
    const buffer = await context.startRendering();
    return normaliseBuffer(buffer, id === 'S' || id === 'P' || id === 'F' ? 0.62 : 0.5);
  }

  // Phone and tablet speakers drop almost everything below ~300 Hz, so the ding (147 Hz)
  // and the lowest notes sound much quieter than the rest. Measure how much of each
  // note a small speaker can actually play and lift the quiet ones to match.
  function boostForSmallSpeaker(buffer) {
    if (!window.matchMedia?.('(pointer: coarse)').matches) return;
    const data = buffer.getChannelData(0);
    const n = Math.min(data.length, Math.round(buffer.sampleRate * 1.2));
    const a = Math.exp(-2 * Math.PI * 320 / buffer.sampleRate);
    let px = 0, py = 0, pz = 0, all = 0, high = 0;
    for (let i = 0; i < n; i += 1) {
      const x = data[i];
      const y = a * (py + x - px);   // two one-pole high-pass stages at 320 Hz
      const z = a * (pz + y - py);
      px = x; py = y; pz = z;
      all += x * x;
      high += z * z;
    }
    if (!all) return;
    const audible = Math.sqrt(high / all);
    const gain = Math.max(1, Math.min(2.6, Math.pow(0.78 / Math.max(audible, 0.05), 1.1)));
    if (gain <= 1.02) return;
    for (let i = 0; i < data.length; i += 1) data[i] *= gain;
  }

  async function renderAllSounds() {
    const wanted = [];
    const seen = new Set();
    const addPad = pad => {
      const key = soundKeyForPad(pad);
      if (!key || seen.has(key) || audio.buffers.has(key)) return;
      seen.add(key);
      wanted.push({ key, pad });
    };
    // Sounds for the selected song first, then everything else on the drum.
    if (state.parsed) state.parsed.events.forEach(e => e.items.forEach(i => addPad(state.padMap.get(i.pad))));
    state.pads.forEach(addPad);
    PERC_BASES.forEach(id => addPad({ id, kind: 'perc', sound: id }));
    const total = wanted.length + 2;
    let done = 0;
    loaderProgress(done, total);
    for (const [key, accent] of [['click:accent', true], ['click:beat', false]]) {
      done += 1;
      loaderProgress(done, total);
      if (audio.buffers.has(key)) continue;
      try {
        const buffer = await renderClickSound(accent);
        if (buffer) audio.buffers.set(key, buffer);
      } catch (error) { /* live fallback */ }
    }
    for (const { key, pad } of wanted) {
      done += 1;
      loaderProgress(done, total);
      try {
        const buffer = pad.kind === 'perc' ? await renderPercSound(pad.sound || pad.id) : await renderToneSound(pad.midi, pad.kind === 'ding');
        if (buffer && pad.kind !== 'perc') boostForSmallSpeaker(buffer);
        if (buffer) audio.buffers.set(key, buffer);
      } catch (error) {
        /* fall back to live synthesis */
      }
    }
    audio.rendering = null;
  }

  function trackSource(source, when, list = audio.scheduled) {
    list.push({ source, when });
    source.onended = () => {
      const index = list.findIndex(entry => entry.source === source);
      if (index >= 0) list.splice(index, 1);
    };
  }

  function cancelScheduledAudio(list = audio.scheduled) {
    if (!audio.ctx) return;
    const now = audio.ctx.currentTime;
    list.slice().forEach(entry => {
      if (entry.when > now + 0.005) {
        try { entry.source.stop(); } catch (error) { /* already stopped */ }
      }
    });
    list.length = 0;
  }

  // A real handpan note struck again does not ring twice: the earlier ring is damped.
  // Without this two copies of the same note drift in and out of phase (a whooshing,
  // crackly sound when a note is tapped quickly several times).
  function chokeSameNote(padId, voice) {
    if (!audio.voices) audio.voices = new Map();
    const now = audio.ctx.currentTime;
    const list = (audio.voices.get(padId) || []).filter(v => v.end > now);
    list.forEach(v => {
      if (v.choked) return;
      if (v.start < voice.start - 0.004) {
        v.choked = true;
        try {
          v.gain.gain.setTargetAtTime(0, voice.start, 0.014);
          v.source.stop(voice.start + 0.12);
        } catch (error) { /* already stopped */ }
      } else if (v.start > voice.start + 0.004 && !voice.choked) {
        voice.choked = true;
        try {
          voice.gain.gain.setTargetAtTime(0, v.start, 0.014);
          voice.source.stop(v.start + 0.12);
        } catch (error) { /* already stopped */ }
      }
    });
    voice.end = voice.start + (voice.source.buffer ? voice.source.buffer.duration : 6);
    list.push(voice);
    audio.voices.set(padId, list);
  }

  function playPad(padId, when = 0, velocity = 1, list = audio.scheduled) {
    const context = audio.ctx;
    if (!context || context.state !== 'running') return;
    const info = percInfo(padId);
    const pad = state.padMap.get(padId) || (info ? { id: padId, kind: 'perc', sound: info.sound } : null);
    if (!pad) return;
    const start = Math.max(context.currentTime, when || 0);
    const buffer = audio.buffers.get(soundKeyForPad(pad));
    const gain = context.createGain();
    gain.gain.setValueAtTime(velocity, start);
    gain.connect(audio.bus);
    if (buffer) {
      const source = context.createBufferSource();
      source.buffer = buffer;
      source.connect(gain);
      source.start(start);
      trackSource(source, start, list);
      if (pad.kind !== 'perc') chokeSameNote(pad.id, { source, gain, start });
      return;
    }
    // Live fallback while the offline renders are still being prepared.
    if (pad.kind === 'perc') {
      const source = context.createBufferSource();
      source.buffer = noiseBuffer(context, 0.08);
      const filter = context.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = pad.sound === 'S' ? 2600 : 3000;
      const env = context.createGain();
      envelope(context, env.gain, start, 0.5, 0.002, start + 0.07);
      source.connect(filter).connect(env).connect(gain);
      source.start(start);
      trackSource(source, start, list);
      return;
    }
    const f = frequencyForMidi(pad.midi);
    [[1, 0.35, 2.4], [2, 0.16, 1.6], [3, 0.06, 0.9]].forEach(([ratio, amp, decay]) => {
      const osc = context.createOscillator();
      osc.frequency.value = f * ratio;
      const env = context.createGain();
      envelope(context, env.gain, start, amp, 0.008, start + decay);
      osc.connect(env).connect(gain);
      osc.start(start);
      osc.stop(start + decay + 0.05);
      trackSource(osc, start, list);
    });
  }

  // One written stroke: a ghost note is played softly; a flam adds a quick grace stroke.
  function playItem(item, when = 0, velocity = 1, list = audio.scheduled) {
    const v = item.ghost ? velocity * 0.32 : velocity;
    if (!item.flam || !audio.ctx) { playPad(item.pad, when, v, list); return; }
    const now = audio.ctx.currentTime;
    const main = when ? Math.max(now + 0.04, when) : now + 0.04;
    playPad(item.pad, main - 0.04, v * 0.45, list);
    playPad(item.pad, main, v, list);
  }

  // M: a hand rests on the shell and every ringing note stops.
  function muteRinging(when = 0) {
    if (!audio.ctx || !audio.voices) return;
    const at = Math.max(audio.ctx.currentTime, when || 0);
    audio.voices.forEach(list => list.forEach(voice => {
      if (voice.choked || voice.start >= at - 0.004 || voice.end <= at) return;
      voice.choked = true;
      try {
        voice.gain.gain.setTargetAtTime(0, at, 0.035);
        voice.source.stop(at + 0.3);
      } catch (error) { /* already stopped */ }
    }));
  }

  // A wooden metronome tick: a pure ~1.57 kHz knock that dies away in about 40 ms
  // (modelled on the click in the handpan app video), plus a tiny attack transient.
  async function renderClickSound(accent) {
    const Offline = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    if (!Offline) return null;
    const sampleRate = audio.ctx?.sampleRate || 44100;
    const seconds = 0.12;
    const context = new Offline(1, Math.ceil(sampleRate * seconds), sampleRate);
    const f = accent ? 1860 : 1570;
    const out = context.createGain();
    out.connect(context.destination);
    [[1, 1, 0.1], [2.01, 0.12, 0.04], [0.5, 0.18, 0.06]].forEach(([ratio, amp, decay]) => {
      const osc = context.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(f * ratio * 1.03, 0);
      osc.frequency.exponentialRampToValueAtTime(f * ratio, 0.006);
      const gain = context.createGain();
      gain.gain.setValueAtTime(0.00001, 0);
      gain.gain.linearRampToValueAtTime(amp, 0.0008);
      gain.gain.exponentialRampToValueAtTime(amp * 0.001, decay);
      osc.connect(gain).connect(out);
      osc.start(0);
      osc.stop(seconds);
    });
    const tick = context.createBufferSource();
    tick.buffer = noiseBuffer(context, 0.01);
    const band = context.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = 3200;
    band.Q.value = 1.2;
    const tickGain = context.createGain();
    tickGain.gain.setValueAtTime(0.25, 0);
    tickGain.gain.exponentialRampToValueAtTime(0.0001, 0.008);
    tick.connect(band).connect(tickGain).connect(out);
    tick.start(0);
    const buffer = await context.startRendering();
    return normaliseBuffer(buffer, accent ? 0.42 : 0.34);
  }

  function playClick(when, accent) {
    const context = audio.ctx;
    if (!context || context.state !== 'running') return;
    const start = Math.max(context.currentTime, when || 0);
    const buffer = audio.buffers.get(accent ? 'click:accent' : 'click:beat');
    if (buffer) {
      const source = context.createBufferSource();
      source.buffer = buffer;
      source.connect(audio.master);
      source.start(start);
      trackSource(source, start);
      return;
    }
    const osc = context.createOscillator();
    const gain = context.createGain();
    osc.type = 'sine';
    osc.frequency.value = accent ? 1860 : 1570;
    gain.gain.setValueAtTime(accent ? 0.3 : 0.24, start);
    gain.gain.exponentialRampToValueAtTime(0.0003, start + 0.06);
    osc.connect(gain).connect(audio.master);
    osc.start(start);
    osc.stop(start + 0.07);
    trackSource(osc, start);
  }

  /* ------------------------------------------------------------------ */
  /* Songs                                                               */
  /* ------------------------------------------------------------------ */

  function capitalise(text) {
    return text ? text.charAt(0).toLocaleUpperCase() + text.slice(1) : '';
  }

  function normaliseSong(raw, folder) {
    if (!raw || typeof raw !== 'object') return null;
    const title = String(raw.title || '').trim().slice(0, 80);
    const sequence = String(raw.sequence || '');
    if (!title || !sequence.trim()) return null;
    return {
      id: String(raw.id || `song-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`),
      title,
      artist: String(raw.artist || '').slice(0, 80),
      about: capitalise(String(raw.about || '').trim().slice(0, 120)),
      bpm: Math.min(260, Math.max(20, Math.round(Number(raw.bpm) || 90))),
      beatsPerBar: Math.min(12, Math.max(1, Math.round(Number(raw.beatsPerBar) || 4))),
      sequence,
      zones: cleanZones(raw.zones),
      order: Number(raw.order) || 999,
      folder,
      builtIn: folder === 'demo' || folder === 'community',
      communitySubmittedFingerprint: folder === 'mine' ? String(raw.communitySubmittedFingerprint || '') : ''
    };
  }

  // A song's own stroke zones: [{ id: 'S2', x, y, hand }], kept as on the unturned drum.
  function cleanZones(list) {
    if (!Array.isArray(list)) return undefined;
    const seen = new Set();
    const out = [];
    list.forEach(zone => {
      const id = String(zone?.id || '').toUpperCase();
      const x = Number(zone?.x);
      const y = Number(zone?.y);
      if (!isPercId(id) || id === 'S' || seen.has(id) || !Number.isFinite(x) || !Number.isFinite(y) || out.length >= 30) return;
      seen.add(id);
      const hand = zone.hand === 'L' || zone.hand === 'R' ? zone.hand : undefined;
      out.push({ id, x: Math.round(x * 1000) / 1000, y: Math.round(y * 1000) / 1000, ...(hand ? { hand } : {}) });
    });
    return out.length ? out : undefined;
  }

  function loadSongs() {
    const catalog = Array.isArray(window.HANDPAN_DEMO_SONGS) && window.HANDPAN_DEMO_SONGS.length ? window.HANDPAN_DEMO_SONGS : FALLBACK_SONGS;
    state.demoSongs = catalog.map(song => normaliseSong(song, 'demo')).filter(Boolean).sort((a, b) => a.order - b.order || a.title.localeCompare(b.title));
    const community = Array.isArray(window.HANDPAN_COMMUNITY_SONGS) ? window.HANDPAN_COMMUNITY_SONGS : [];
    state.communitySongs = community.map(song => normaliseSong(song, 'community')).filter(Boolean).sort((a, b) => a.title.localeCompare(b.title));
    const mine = readJson(STORAGE_SONGS, []);
    state.mySongs = (Array.isArray(mine) ? mine : []).map(song => normaliseSong(song, 'mine')).filter(Boolean);
  }

  function saveMySongs() {
    const ok = writeJson(STORAGE_SONGS, state.mySongs.map(({ id, title, artist, bpm, beatsPerBar, sequence, zones, communitySubmittedFingerprint }) => ({ id, title, artist, bpm, beatsPerBar, sequence, zones, communitySubmittedFingerprint })));
    if (!ok) showToast('This browser blocked saving. Export the song to keep it.', 'warning');
  }

  function allSongs() {
    return [...state.demoSongs, ...(state.communitySongs || []), ...state.mySongs];
  }

  function findSong(id) {
    return allSongs().find(song => song.id === id) || null;
  }

  function parseSong(song) {
    return parseSequence(song?.sequence || '', song?.bpm, song?.beatsPerBar, state.padMap);
  }

  // Percussion zones are drawn only when the current song uses them.
  function visiblePercIds() {
    const used = state.parsed?.used || new Set();
    return new Set(state.pads.filter(pad => pad.kind === 'perc' && used.has(pad.id)).map(pad => pad.id));
  }

  // The pads follow the song: its own stroke zones, or the default ones.
  function refreshPads() {
    state.pads = buildPads(state.instrument);
    state.padMap = new Map(state.pads.map(p => [p.id, p]));
  }

  // On the stage a zone shows up about a beat before its stroke and fades out after it.
  function updateZoneVisibility(t) {
    const parsed = state.parsed;
    const on = new Set();
    if (parsed && state.mode !== 'tuner') {
      const lead = Math.max(parsed.spb * 1.25, 0.6 * state.speed);
      const after = Math.max(parsed.spb * 0.35, 0.3 * state.speed);
      const events = parsed.events;
      for (let i = firstEventIndexAtOrAfter(t - after); i < events.length && events[i].time <= t + lead; i += 1) {
        events[i].items.forEach(item => { if (!item.missing && state.padMap.get(item.pad)?.kind === 'perc') on.add(item.pad); });
      }
    }
    const key = [...on].sort().join(',');
    if (key === state.zoneKey) return;
    state.zoneKey = key;
    state.drums.forEach(drum => drum.padEls.forEach((g, id) => {
      if (g.classList.contains('pad-perc')) g.classList.toggle('zone-on', on.has(id));
    }));
  }

  function cueMutes(t) {
    const events = state.parsed.events;
    let i = state.muteIdx || 0;
    while (i < events.length && events[i].time <= t + 0.012) {
      const event = events[i];
      if (event.time >= t - 0.25 && event.items.some(item => item.fx === 'mute')) addEffect('text', 'D', '#cbd5e1', 'Mute');
      i += 1;
    }
    state.muteIdx = i;
  }

  function selectSong(id, options = {}) {
    if(id !== DRILL_ID) COACH?.clear();
    if (JOURNEY && !JOURNEY.isSongOpen(id)) {
      if (state.song && state.song.id !== id && JOURNEY.isSongOpen(state.song.id)) {
        showToast('That song is still locked. Reach it on the Song path.', 'warning');
        return;
      }
      id = JOURNEY.fallbackSong();
    }
    const song = findSong(id) || state.demoSongs[0] || state.mySongs[0];
    if (!song) return;
    stopPlayback(false);
    state.song = song;
    refreshPads();
    state.parsed = parseSong(song);
    state.particlePhaseCache.clear();
    state.loopA = null;
    state.loopB = null;
    state.abLoop = false;
    SMART?.stop();
    resetRun(0);
    rebuildLanes();
    renderDrums();
    renderSongHeader();
    renderSongList();
    updateNextHint(true);
    updateABLoopUI();
    savePrefs();
    if (options.closeSidebar) setSidebar(false);
    if (audio.ctx && !audio.rendering) audio.rendering = renderAllSounds();
    invalidateGuides();
    requestFrame();
  }

  function renderSongHeader() {
    const song = state.song;
    const parsed = state.parsed;
    if (!song || !parsed) return;
    els.currentTitle.setAttribute('translate', song.folder === 'mine' ? 'no' : 'yes');
    els.stageSongName?.setAttribute('translate', song.folder === 'mine' ? 'no' : 'yes');
    els.currentTitle.textContent = song.title;
    const byline = song.artist || song.about;
    els.stageSongName.innerHTML = `<b>${escapeHtml(song.title)}</b>${byline ? `<small>${escapeHtml(byline)}</small>` : ''}`;
    const difficulty = songDifficulty(parsed);
    els.currentDifficulty.textContent = `${difficulty.label} difficulty`;
    els.currentDifficulty.dataset.level = difficulty.level;
    const scaleName = SCALES[state.instrument.scale].name;
    if (parsed.missing.size) {
      els.currentFit.dataset.fit = 'warn';
      els.currentFit.textContent = `${[...parsed.missing].join(', ')} not on ${scaleName}`;
      els.currentFit.title = 'These strokes are skipped on your handpan. Pick a bigger scale in My Handpan, or turn on percussion strokes.';
    } else {
      els.currentFit.dataset.fit = 'ok';
      els.currentFit.textContent = `✓ ${scaleName}`;
      els.currentFit.title = 'Every stroke in this song is on your handpan.';
    }
    setTextIfChanged(els.totalNotesLabel, `${parsed.itemCount} strokes total`);
    updateTempoLabel();
    document.title = `${song.title} · Hand Drum Trainer`;
  }

  function updateTempoLabel() {
    if (!state.parsed) return;
    const tempoHtml = `<b>${Math.round(state.parsed.bpm * state.speed)}</b> BPM`;
    if (els.tempoLabel.innerHTML !== tempoHtml) els.tempoLabel.innerHTML = tempoHtml;
    setTextIfChanged(els.durationLabel, formatTime(state.parsed.duration / state.speed));
  }

  function renderSongList() {
    const query = state.search.trim().toLowerCase();
    const levelOk = song => {
      if (state.levelFilter === 'all') return true;
      const level = songDifficulty(parseSong(song)).level;
      return state.levelFilter === 'hard' ? level === 'hard' || level === 'expert' : level === state.levelFilter;
    };
    const filter = song => levelOk(song) && (!query || `${song.title} ${song.artist} ${song.about || ''} ${window.EtherealI18n?.t(song.title) || ''} ${window.EtherealI18n?.t(song.about || '') || ''}`.toLowerCase().includes(query));
    const group = (label, songs, emptyText, className) => {
      const shown = songs.filter(filter);
      const items = shown.map(song => {
        const parsed = parseSong(song);
        const difficulty = songDifficulty(parsed);
        const active = state.song && state.song.id === song.id;
        const meta = `${song.bpm} BPM · ${parsed.itemCount} strokes${song.artist ? ` · ${escapeHtml(song.artist)}` : ''}`;
        return `<button class="song-item${active ? ' active' : ''}" data-song-id="${escapeHtml(song.id)}" type="button" title="${escapeHtml(song.title)}">
          <span class="song-item-title"><strong${song.folder === 'mine' ? ' translate="no"' : ''}>${escapeHtml(song.title)}</strong><em class="difficulty-badge" data-level="${difficulty.level}">${difficulty.label}</em></span>
          <span>${meta}${BEST.badge(song.id)}</span>
          ${song.about ? `<span class="song-item-about">${escapeHtml(song.about)}</span>` : ''}
          ${parsed.missing.size ? `<span class="song-item-warn">needs ${escapeHtml([...parsed.missing].join(', '))}</span>` : ''}
        </button>`;
      }).join('');
      return `<section class="song-group catalogue-collection ${className}">
        <div class="song-group-heading static-heading"><span>${label}</span><small>${shown.length}</small></div>
        <div class="song-group-items">${items || `<p class="community-empty">${emptyText}</p>`}</div>
      </section>`;
    };
    const openDemos = JOURNEY ? state.demoSongs.filter(song => JOURNEY.isSongOpen(song.id)) : state.demoSongs;
    els.songList.innerHTML = group('Song library', openDemos, query ? 'No songs in the library match that search.' : 'Drop .handsong files into demo-songs.', 'demo-collection')
      + group('My songs', state.mySongs, query ? 'No My songs match that search.' : 'Create or import a song and it will appear here.', 'community-collection personal-collection');
    if (JOURNEY) addJourneyLockedRow(state.demoSongs.map(song => song.id), query);
    const startHere = query ? null : startHereCard();
    if (startHere) els.songList.prepend(startHere);
    const today = query || !PRACTICE ? null : COMMON.todayCard({ log: PRACTICE, onPath: openSongPathDialog, onDrills: openDrillsDialog });
    if (today) els.songList.prepend(today);
    const player = query || !GAME ? null : COMMON.playerCard({ game: GAME, onOpen: openHubDialog });
    if (player) els.songList.prepend(player);
    els.deleteBtn.disabled = !(state.song && state.song.folder === 'mine');
  }

  /* ------------------------------------------------------------------ */
  /* Handpan drawing (SVG)                                               */
  /* ------------------------------------------------------------------ */

  const SVG_NS = 'http://www.w3.org/2000/svg';
  let svgCounter = 0;

  function svgEl(name, attrs = {}, parent) {
    const node = document.createElementNS(SVG_NS, name);
    Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, String(value)));
    if (parent) parent.appendChild(node);
    return node;
  }

  function buildDrumSvg(options = {}) {
    const uid = `hp${(svgCounter += 1)}`;
    const svg = svgEl('svg', { viewBox: `${VIEWBOX.x} ${VIEWBOX.y} ${VIEWBOX.w} ${VIEWBOX.h}`, class: `handpan-svg${options.className ? ` ${options.className}` : ''}`, role: 'group' });
    const defs = svgEl('defs', {}, svg);
    const shellGrad = svgEl('radialGradient', { id: `${uid}-shell`, cx: '42%', cy: '36%', r: '72%' }, defs);
    svgEl('stop', { offset: '0%', style: 'stop-color:var(--skin-a,#5b6175)' }, shellGrad);
    svgEl('stop', { offset: '55%', style: 'stop-color:var(--skin-b,#363b4b)' }, shellGrad);
    svgEl('stop', { offset: '100%', style: 'stop-color:var(--skin-c,#1d2130)' }, shellGrad);
    const padGrad = svgEl('radialGradient', { id: `${uid}-pad`, cx: '45%', cy: '40%', r: '70%' }, defs);
    svgEl('stop', { offset: '0%', style: 'stop-color:var(--skin-pad-a,#7d849b);stop-opacity:var(--skin-pad-op,.55)' }, padGrad);
    svgEl('stop', { offset: '100%', style: 'stop-color:var(--skin-pad-b,#2a2f40);stop-opacity:var(--skin-pad-op,.55)' }, padGrad);
    const rimGrad = svgEl('linearGradient', { id: `${uid}-rim`, x1: '0', y1: '0', x2: '1', y2: '1' }, defs);
    svgEl('stop', { offset: '0%', style: 'stop-color:var(--skin-rim-a,#c9cfdf);stop-opacity:.7' }, rimGrad);
    svgEl('stop', { offset: '50%', style: 'stop-color:var(--skin-rim-b,#545b70);stop-opacity:.5' }, rimGrad);
    svgEl('stop', { offset: '100%', style: 'stop-color:var(--skin-rim-c,#a9b0c4);stop-opacity:.6' }, rimGrad);
    // Clouds for the nebula skin.
    [['neb1', '#a78bfa'], ['neb2', '#38bdf8'], ['neb3', '#f472b6']].forEach(([name, color]) => {
      const grad = svgEl('radialGradient', { id: `${uid}-${name}` }, defs);
      svgEl('stop', { offset: '0%', 'stop-color': color, 'stop-opacity': '0.55' }, grad);
      svgEl('stop', { offset: '100%', 'stop-color': color, 'stop-opacity': '0' }, grad);
    });

    const body = svgEl('g', { class: 'hp-body' }, svg);
    if (!options.noHalo) svgEl('circle', { r: 1.035, class: 'hp-halo' }, body);
    svgEl('circle', { r: 1, fill: `url(#${uid}-shell)`, class: 'hp-shell' }, body);
    svgEl('circle', { r: 0.985, fill: 'none', stroke: `url(#${uid}-rim)`, 'stroke-width': 0.022, class: 'hp-rim' }, body);
    svgEl('ellipse', { cx: -0.3, cy: -0.42, rx: 0.42, ry: 0.22, class: 'hp-sheen', transform: 'rotate(-28 -0.3 -0.42)' }, body);
    drumDecor(body, uid);

    const percShown = options.showAllPerc ? null : visiblePercIds();
    const padGroup = svgEl('g', { class: 'hp-pads' }, svg);
    const padEls = new Map();
    const ordered = (options.pads || state.pads)
      .filter(pad => pad.kind !== 'perc' || !percShown || percShown.has(pad.id))
      .sort((a, b) => (a.kind === 'perc') - (b.kind === 'perc'));
    ordered.forEach(pad => {
      const zoneClass = pad.kind === 'perc' ? ` zone-${pad.hand}${pad.own ? ' own' : ''}` : '';
      const g = svgEl('g', { class: `pad pad-${pad.kind}${zoneClass}`, 'data-pad': pad.id, transform: `translate(${pad.x.toFixed(4)} ${pad.y.toFixed(4)})` });
      g.style.setProperty('--note', pad.color);
      if (pad.kind === 'perc') {
        svgEl('circle', { r: 0.12, class: 'hit-area' }, g);
        svgEl('circle', { r: pad.rx, class: 'field' }, g);
        svgEl('text', { class: 'num perc-num', y: 0.004 }, g).textContent = pad.mark || pad.label;
      } else if (pad.kind === 'ding') {
        svgEl('ellipse', { rx: pad.rx, ry: pad.ry, class: 'field', fill: `url(#${uid}-pad)` }, g);
        svgEl('ellipse', { rx: pad.rx * 0.42, ry: pad.ry * 0.42, class: 'dimple' }, g);
        svgEl('text', { class: 'num ding-num', y: state.instrument.noteNames ? -0.025 : 0.004 }, g).textContent = 'D';
        if (state.instrument.noteNames) svgEl('text', { class: 'name', y: 0.1 }, g).textContent = pad.name;
      } else {
        const shape = svgEl('g', { transform: `rotate(${pad.rot.toFixed(2)})` }, g);
        if (pad.kind === 'bottom') {
          svgEl('ellipse', { rx: pad.rx, ry: pad.ry, class: 'field bottom-field' }, shape);
        } else {
          svgEl('ellipse', { rx: pad.rx, ry: pad.ry, class: 'field', fill: `url(#${uid}-pad)` }, shape);
          svgEl('ellipse', { rx: pad.rx * 0.5, ry: pad.ry * 0.5, class: 'dimple' }, shape);
        }
        const big = pad.kind === 'tone' ? Math.max(0.095, Math.min(0.13, pad.ry * 0.9)) : 0.08;
        const num = svgEl('text', { class: 'num', y: state.instrument.noteNames ? -0.018 : 0.004 }, g);
        num.style.fontSize = `${big}px`;
        num.textContent = pad.label;
        if (state.instrument.noteNames) svgEl('text', { class: 'name', y: 0.07 }, g).textContent = pad.name;
      }
      padGroup.appendChild(g);
      padEls.set(pad.id, g);
    });
    if ((options.pads || state.pads).some(p => p.kind === 'bottom')) {
      svgEl('text', { class: 'under-caption', x: 0, y: 1.215 }, svg).textContent = 'bottom notes (underside)';
    }
    window.EtherealCosmetics.enhanceDrum(svg, uid);
    const drum = { svg, padEls, options };
    if (options.interactive) bindDrumInput(drum);
    return drum;
  }

  // Patterns that some drum colours add: marble veins, a gold mandala, nebula clouds and stars.
  function drumDecor(body, uid) {
    const marble = svgEl('g', { class: 'hp-decor hp-decor-marble' }, body);
    ['M-0.95 -0.15 C -0.6 -0.45 -0.35 0.05 0.05 -0.2 S 0.6 -0.62 0.9 -0.38',
      'M-0.8 0.45 C -0.45 0.2 -0.15 0.62 0.25 0.38 S 0.7 0.1 0.96 0.22',
      'M-0.35 -0.88 C -0.2 -0.6 0.15 -0.75 0.3 -0.5 S 0.4 -0.1 0.62 0.02',
      'M-0.62 0.78 C -0.35 0.62 -0.1 0.92 0.18 0.74'].forEach((d, i) => svgEl('path', { d, class: `vein${i % 2 ? ' thin' : ''}` }, marble));
    const mandala = svgEl('g', { class: 'hp-decor hp-decor-mandala' }, body);
    svgEl('circle', { r: 0.335, class: 'mandala-ring' }, mandala);
    svgEl('circle', { r: 0.425, class: 'mandala-ring thin' }, mandala);
    for (let k = 0; k < 24; k += 1) {
      const a = (k / 24) * Math.PI * 2;
      svgEl('circle', { cx: (Math.cos(a) * 0.38).toFixed(4), cy: (Math.sin(a) * 0.38).toFixed(4), r: k % 2 ? 0.008 : 0.014, class: 'mandala-dot' }, mandala);
    }
    const nebula = svgEl('g', { class: 'hp-decor hp-decor-nebula' }, body);
    svgEl('ellipse', { cx: -0.35, cy: -0.25, rx: 0.75, ry: 0.42, fill: `url(#${uid}-neb1)`, transform: 'rotate(-25 -0.35 -0.25)' }, nebula);
    svgEl('ellipse', { cx: 0.3, cy: 0.3, rx: 0.7, ry: 0.38, fill: `url(#${uid}-neb2)`, transform: 'rotate(20 0.3 0.3)' }, nebula);
    svgEl('ellipse', { cx: 0.1, cy: -0.05, rx: 0.4, ry: 0.25, fill: `url(#${uid}-neb3)` }, nebula);
    let seed = 7;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (let k = 0; k < 46; k += 1) {
      const a = rnd() * Math.PI * 2;
      const r = Math.sqrt(rnd()) * 0.95;
      svgEl('circle', { cx: (Math.cos(a) * r).toFixed(3), cy: (Math.sin(a) * r).toFixed(3), r: (0.004 + rnd() * 0.008).toFixed(4), class: 'nebula-star' }, nebula);
    }
  }

  function bindDrumInput(drum) {
    drum.svg.addEventListener('pointerdown', event => {
      const target = event.target.closest('[data-pad]');
      if (!target) return;
      const padId = target.getAttribute('data-pad');
      const fire = () => {
        if (drum.options.onTap) drum.options.onTap(padId, event);
        else userHit(padId, 'tap');
      };
      // While a song is playing a touch plays the note at once (timing matters). Otherwise a
      // finger may also be scrolling the page: the note plays when the finger lifts without
      // having moved, and a scroll just scrolls.
      const deferred = event.pointerType === 'touch' && !state.playing && drum.options.className !== 'settings-svg';
      if (!deferred) {
        event.preventDefault();
        fire();
        return;
      }
      const x0 = event.clientX;
      const y0 = event.clientY;
      const cleanup = () => {
        drum.svg.removeEventListener('pointerup', up);
        drum.svg.removeEventListener('pointercancel', cleanup);
      };
      const up = e => {
        cleanup();
        if (Math.hypot(e.clientX - x0, e.clientY - y0) < 12) fire();
      };
      drum.svg.addEventListener('pointerup', up);
      drum.svg.addEventListener('pointercancel', cleanup);
    });
    drum.svg.addEventListener('contextmenu', event => event.preventDefault());
  }

  function renderDrums() {
    const side = buildDrumSvg({ interactive: true, className: 'side-drum' });
    els.drumWrap.replaceChildren(side.svg);
    const stage = buildDrumSvg({ interactive: true, className: 'stage-drum', noHalo: true });
    els.stageDrumWrap.replaceChildren(stage.svg);
    state.drums = [side, stage];
    state.nextKey = '';
    state.zoneKey = null;
    updateNextHint(true);
    renderInstrumentInfo();
  }

  function flashPad(padId, color, duration = 220) {
    state.drums.forEach(drum => {
      const g = drum.padEls.get(padId);
      if (!g) return;
      g.style.setProperty('--flash', color);
      g.classList.add('flash');
      clearTimeout(g._flashTimer);
      g._flashTimer = setTimeout(() => g.classList.remove('flash'), duration);
    });
    state.laneFlash.set(padId, { at: performance.now(), color });
    requestFrame();
  }

  function markWrongPad(padId) {
    state.drums.forEach(drum => {
      const g = drum.padEls.get(padId);
      if (!g) return;
      g.classList.add('wrong');
      clearTimeout(g._wrongTimer);
      g._wrongTimer = setTimeout(() => g.classList.remove('wrong'), 260);
    });
  }

  function renderInstrumentInfo() {
    const scale = SCALES[state.instrument.scale];
    els.instrumentTitle.textContent = `${scale.name} · 440 Hz`;
    const perc = visiblePercIds();
    const keys = [`D, 1-${scale.top.length}`];
    if (scale.bottoms) keys.push('0 / -');
    const bases = new Set([...perc].map(percBase));
    if (perc.size) keys.push(PERC_BASES.filter(base => bases.has(base)).join(' '));
    els.keyboardHint.textContent = `Keys ${keys.join(', ')}`;
    const strokes = [];
    if (state.parsed?.used.has('D')) strokes.push('<span><b>D</b> ding</span>');
    PERC_BASES.forEach(base => { if (bases.has(base)) strokes.push(`<span><b>${base}</b> ${PERC_WORDS[base]}</span>`); });
    const items = state.parsed ? state.parsed.events.flatMap(event => event.items) : [];
    const extras = [];
    if (items.some(item => item.ghost)) extras.push('<span><b>( )</b> ghost</span>');
    if (items.some(item => item.flam)) extras.push('<span><b>*</b> flam</span>');
    if (items.some(item => item.fx === 'mute')) extras.push('<span><b>M</b> mute</span>');
    els.strokeKey.innerHTML = perc.size || extras.length ? strokes.concat(extras).join('') : '';
  }

  /* ------------------------------------------------------------------ */
  /* Playback engine                                                     */
  /* ------------------------------------------------------------------ */

  function realNow() {
    if (state.clock === 'audio' && audio.ctx) return audio.ctx.currentTime;
    return performance.now() / 1000;
  }

  function songNow() {
    if (!state.playing) return state.songTime;
    if (state.holding) return state.anchorSong;
    return state.anchorSong + (realNow() - state.anchorReal) * state.speed;
  }

  function songToCtx(time) {
    return state.anchorReal + (time - state.anchorSong) / state.speed;
  }

  function anchorAt(time) {
    state.anchorSong = time;
    state.anchorReal = realNow();
    state.songTime = time;
  }

  function playableItems() {
    return state.parsed ? state.parsed.events.flatMap(e => e.items.filter(i => !i.missing && !i.ghost)) : [];
  }

  function firstEventIndexAtOrAfter(time) {
    const events = state.parsed?.events || [];
    let lo = 0;
    let hi = events.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (events[mid].time < time - 1e-6) lo = mid + 1; else hi = mid;
    }
    return lo;
  }

  // Ghost notes are a bonus: Wait for note does not stop for them, and a missed one is no miss.
  function eventPlayable(event) {
    return event.items.some(item => !item.missing && !item.ghost);
  }

  function eventDone(event) {
    return event.items.every(item => item.missing || item.ghost || state.results.has(item.id));
  }

  function resetRun(time = 0) {
    state.results.clear();
    state.userPlayed = false;
    state.wrong = 0;
    state.streak = 0;
    state.bestStreak = 0;
    GAME?.runReset();
    state.effects = [];
    state.runStartedAt = performance.now();
    seekTo(time, { keepResults: true });
  }

  function clearResultsFrom(time, until = Infinity) {
    if (!state.parsed) return;
    state.parsed.events.forEach(event => {
      if (event.time >= time - 1e-6 && event.time < until - 1e-6) event.items.forEach(item => state.results.delete(item.id));
    });
  }

  function seekTo(time, options = {}) {
    if (!state.parsed) return;
    const duration = state.parsed.duration;
    const t = Math.max(-60, Math.min(duration, time));
    if (!options.keepResults) { GAME?.invalidateRun(); clearResultsFrom(Math.max(0, t)); }
    state.waitIdx = firstEventIndexAtOrAfter(t);
    state.schedIdx = state.waitIdx;
    state.flashIdx = state.waitIdx;
    state.muteIdx = state.waitIdx;
    state.missIdx = state.waitIdx;
    state.schedBeat = Math.ceil(t / state.parsed.spb - 1e-6);
    state.holding = false;
    if (state.playing) {
      cancelScheduledAudio();
      anchorAt(t);
    } else {
      state.songTime = t;
    }
    updateNextHint(true);
    updatePracticeUI();
    requestFrame();
  }

  async function togglePlayback() {
    if (state.mode === 'tuner') {
      if (!mic.on) await startMic();
      return;
    }
    if (state.playing) {
      pausePlayback();
      return;
    }
    await startPlayback();
  }

  async function startPlayback(options = {}) {
    if (!state.parsed || !state.parsed.events.length) {
      showToast('This song has no strokes yet.', 'warning');
      return;
    }
    clearTimeout(state.loopTimer);
    const context = await ensureAudio();
    if (options.fromTour && (!tour.active || tour.token !== options.fromTour)) return;
    state.clock = context && context.state === 'running' ? 'audio' : 'perf';
    const parsed = state.parsed;
    let start = state.songTime;
    if (start >= parsed.duration - 0.01) {
      resetRun(0);
      start = 0;
    }
    if (state.abLoop && state.loopA != null && (start < state.loopA - 0.001 || start >= state.loopB)) start = state.loopA;
    state.countInBeats = 0;
    if (start <= 0.0001 || options.countIn) {
      if (start <= 0.0001) state.runStartedAt = performance.now();
      if (state.mode === 'wait') {
        // The notes wait for you anyway, so no count-in: just let the first ones fly in.
        start -= Math.min(previewSeconds() * 0.55, 1.4 * state.speed);
      } else if (state.countIn && !tour.active) {
        const beats = parsed.beatsPerBar <= 2 ? parsed.beatsPerBar * 2 : parsed.beatsPerBar;
        state.countInBeats = beats;
        start -= beats * parsed.spb;
      } else {
        start -= Math.max(1.5 * parsed.spb, 0.6);
      }
    }
    GAME?.startRun({ id: state.song.id, speed: state.speed, from: state.songTime, mode: state.mode });
    state.playing = true;
    // On a phone, Play goes straight to the full-screen focus view.
    if (isPhone() && !state.focusMode && !tour.active) setFocusMode(true);
    seekTo(start, { keepResults: true });
    anchorAt(start);
    resetVisualPerformanceMonitor();
    startScheduler();
    updateTransportUI();
    requestFrame();
  }

  function pausePlayback() {
    if (!state.playing) return;
    state.songTime = Math.max(0, Math.min(state.parsed?.duration || 0, songNow()));
    state.playing = false;
    state.holding = false;
    stopScheduler();
    cancelScheduledAudio();
    els.countIn.hidden = true;
    els.waitBanner.hidden = true;
    updateTransportUI();
    requestFrame();
  }

  function stopPlayback(resetPosition = true) {
    clearTimeout(state.loopTimer);
    if (state.playing) pausePlayback();
    if (resetPosition) resetRun(0);
    updateTransportUI();
  }

  function startScheduler() {
    stopScheduler();
    runScheduler();
    state.schedulerId = window.setInterval(runScheduler, SCHEDULER_MS);
  }

  function stopScheduler() {
    clearInterval(state.schedulerId);
    state.schedulerId = 0;
  }

  // Listen just plays the song (full volume, pads light up, nothing is scored).
  // Practice scores every stroke from the very first note.
  function listening() {
    return state.mode === 'listen';
  }

  function autoPlaysNotes() {
    if (state.mode === 'listen' || tour.active) return true;
    // Wait for note plays each note first only in the "Hear it first" style.
    if (state.mode === 'wait') return state.waitStyle === 'hear';
    return state.guide && state.mode === 'practice';
  }

  function runScheduler() {
    if (!state.playing || !state.parsed || document.hidden || state.holding) return;
    const parsed = state.parsed;
    const t = songNow();
    let horizon = t + AUDIO_LOOKAHEAD * state.speed;
    if (state.abLoop && state.loopB != null) horizon = Math.min(horizon, state.loopB - 0.001);
    if (state.mode === 'wait') {
      const pending = parsed.events[nextPendingWaitIndex()];
      if (pending) horizon = Math.min(horizon, pending.time + 0.0005);
    }
    const events = parsed.events;
    while (state.schedIdx < events.length && events[state.schedIdx].time <= horizon) {
      const event = events[state.schedIdx];
      if (parsed.mutes && event.time >= t - 0.04 && event.items.some(item => item.fx === 'mute')) muteRinging(state.clock === 'audio' ? songToCtx(event.time) : 0);
      if (event.time >= t - 0.04 && autoPlaysNotes() && event.items.some(item => !item.missing && !state.results.has(item.id))) {
        const when = songToCtx(event.time);
        const velocity = listening() ? 1 : 0.55;
        // The microphone must not take the app's own "hear it first" note for yours.
        if (state.mode === 'wait') {
          const delay = state.clock === 'audio' && audio.ctx ? Math.max(0, when - audio.ctx.currentTime) * 1000 : 0;
          mic.echoUntil = Math.max(mic.echoUntil || 0, performance.now() + delay + 900);
        }
        event.items.forEach(item => { if (!item.missing) playItem(item, state.clock === 'audio' ? when : 0, velocity); });
      }
      state.schedIdx += 1;
    }
    const spb = parsed.spb;
    while (state.schedBeat * spb <= horizon) {
      const beat = state.schedBeat;
      const beatTime = beat * spb;
      if (beatTime >= t - 0.04 && beatTime < parsed.duration - 0.001) {
        const isCount = beat < 0 && state.countInBeats > 0 && beat >= -state.countInBeats;
        if (isCount || (state.metronome && beat >= 0)) {
          const accent = isCount ? beat === -state.countInBeats : ((beat % parsed.beatsPerBar) + parsed.beatsPerBar) % parsed.beatsPerBar === 0;
          playClick(state.clock === 'audio' ? songToCtx(beatTime) : 0, accent);
        }
      }
      state.schedBeat += 1;
    }
  }

  function nextPendingWaitIndex() {
    const events = state.parsed?.events || [];
    let index = state.waitIdx;
    while (index < events.length && (!eventPlayable(events[index]) || eventDone(events[index]))) index += 1;
    return index;
  }

  /* ------------------------------------------------------------------ */
  /* Frame loop                                                          */
  /* ------------------------------------------------------------------ */

  let frameRequested = false;

  function requestFrame() {
    if (frameRequested) return;
    frameRequested = true;
    requestAnimationFrame(frame);
  }

  function frame(nowMs) {
    frameRequested = false;
    const parsed = state.parsed;
    if (state.playing && parsed) {
      let t = songNow();
      if (state.mode === 'wait' && !state.holding) {
        state.waitIdx = nextPendingWaitIndex();
        const pending = parsed.events[state.waitIdx];
        if (pending && t >= pending.time) {
          state.holding = true;
          state.anchorSong = pending.time;
          state.anchorReal = realNow();
          state.songTime = pending.time;
          t = pending.time;
          updateWaitBanner();
        }
      }
      if (listening()) flashDueNotes(t);
      if (parsed.mutes) cueMutes(t);
      if (state.mode === 'practice') markMissedNotes(t);
      if (state.abLoop && state.loopA != null && state.loopB != null && t >= state.loopB) {
        restartSection();
        t = songNow();
      } else if (t >= parsed.duration && !(state.mode === 'wait' && nextPendingWaitIndex() < parsed.events.length)) {
        finishPlayback();
      }
      updateCountIn(t);
      const profile = visualPerformanceProfile();
      if (nowMs - state.lastUi > profile.uiInterval) {
        state.lastUi = nowMs;
        updatePracticeUI();
        updateNextHint();
      }
    }

    const profile = visualPerformanceProfile();
    const busy = state.playing || state.effects.length || state.laneFlash.size || spin.active;
    const interval = state.playing ? profile.visualInterval : busy ? 0 : effectiveAmbientInterval(profile);
    updateTape(songNow());
    updateZoneVisibility(state.playing ? songNow() : state.songTime);
    if (state.dirty || !interval || nowMs - state.lastRenderAt >= interval) {
      applySpin(nowMs);
      state.dirty = false;
      state.lastRenderAt = nowMs;
      const started = performance.now();
      renderStage(nowMs);
      if (state.playing) monitorVisualPerformance(started, performance.now(), profile);
    }
    const ambient = state.view === 'radial' && !document.hidden;
    if (busy || state.dirty || ambient) requestFrame();
  }

  function flashDueNotes(t) {
    const events = state.parsed.events;
    while (state.flashIdx < events.length && events[state.flashIdx].time <= t + 0.012) {
      const event = events[state.flashIdx];
      if (event.time >= t - 0.25) {
        event.items.forEach(item => {
          if (item.missing) return;
          // The moment of the stroke: the field lights up in its colour with a ring of sparks.
          flashPad(item.pad, itemColor(item), Math.max(240, Math.min(480, event.durBeats * state.parsed.spb * 700 / state.speed)));
          addEffect('burst', item.pad, itemColor(item));
        });
      }
      state.flashIdx += 1;
    }
  }

  function goodWindow() {
    return Math.max(0.3 * state.parsed.spb, 0.13);
  }

  function perfectWindow() {
    return Math.max(0.13 * state.parsed.spb, 0.06);
  }

  function markMissedNotes(t) {
    const events = state.parsed.events;
    const window = goodWindow();
    while (state.missIdx < events.length && events[state.missIdx].time < t - window) {
      const event = events[state.missIdx];
      let missed = false;
      event.items.forEach(item => {
        if (item.missing || state.results.has(item.id)) return;
        if (item.ghost) { state.results.set(item.id, 'skip'); return; }
        state.results.set(item.id, 'miss');
        missed = true;
        addEffect('miss', item.pad, WRONG_COLOR);
      });
      if (missed) {
        state.streak = 0;
        tapeJudge('miss');
      }
      state.missIdx += 1;
    }
  }

  function restartSection() {
    GAME?.invalidateRun();
    if (SMART?.active && smartLoopPass() === 'done') return;
    clearResultsFrom(state.loopA, state.loopB);
    cancelScheduledAudio();
    const preroll = Math.min(state.loopA, state.parsed.spb);
    seekTo(state.loopA - preroll, { keepResults: true });
  }

  function finishPlayback() {
    const parsed = state.parsed;
    if (state.mode === 'practice') markMissedNotes(parsed.duration + 10);
    state.playing = false;
    state.holding = false;
    state.songTime = parsed.duration;
    stopScheduler();
    els.countIn.hidden = true;
    els.waitBanner.hidden = true;
    updateTransportUI();
    updatePracticeUI();
    requestFrame();
    if (tour.active) {
      // The tour keeps Interstellar going round.
      state.loopTimer = window.setTimeout(() => {
        if (!tour.active) return;
        resetRun(0);
        startPlayback();
      }, 900);
      return;
    }
    if (state.loop) {
      if (state.mode === 'practice' || state.mode === 'wait') showResults({ silent: true });
      state.loopTimer = window.setTimeout(() => {
        resetRun(0);
        startPlayback();
      }, 700);
      return;
    }
    if (isPhone() && state.focusMode) setFocusMode(false);
    if (state.mode === 'practice' || state.mode === 'wait') showResults();
  }

  function updateCountIn(t) {
    if (state.countInBeats > 0 && t < 0) {
      const remaining = Math.ceil(-t / state.parsed.spb - 1e-6);
      if (remaining >= 1 && remaining <= state.countInBeats) {
        const text = String(remaining);
        if (els.countIn.textContent !== text || els.countIn.hidden) {
          els.countIn.textContent = text;
          els.countIn.hidden = false;
          els.countIn.classList.remove('pop');
          void els.countIn.offsetWidth;
          els.countIn.classList.add('pop');
        }
        return;
      }
    }
    if (!els.countIn.hidden) els.countIn.hidden = true;
  }

  /* ------------------------------------------------------------------ */
  /* Input / judging                                                     */
  /* ------------------------------------------------------------------ */

  function itemColor(item) {
    if (state.instrument.handColors && item.hand) return HAND_COLORS[item.hand];
    return state.padMap.get(item.pad)?.color || '#e2e8f0';
  }

  function padColor(pad) {
    return state.instrument.handColors ? HAND_COLORS[pad.hand] || pad.color : pad.color;
  }

  function userHit(padId, source = 'tap') {
    if (!state.padMap.has(padId)) return;
    if (source === 'tap') COMMON.haptic(HAPTICS_KEY);
    if (source !== 'mic') {
      ensureAudio().then(() => playPad(padId, 0, 1)).catch(() => {});
      // The phone's own speaker plays this note; the microphone must not count it again.
      mic.echoUntil = performance.now() + 380;
    }
    const pad = state.padMap.get(padId);
    if (!state.playing || state.mode === 'tuner' || state.mode === 'listen' || !state.parsed) {
      flashPad(padId, source === 'mic' ? MIC_HEARD_COLOR : padColor(pad), source === 'mic' ? 600 : 200);
      addEffect('burst', padId, source === 'mic' ? MIC_HEARD_COLOR : padColor(pad));
      return;
    }
    if (state.mode === 'wait') judgeWait(padId);
    else judgePractice(padId);
    updatePracticeUI();
    requestFrame();
  }

  function registerHit(item, quality) {
    state.results.set(item.id, quality);
    state.streak += 1;
    state.bestStreak = Math.max(state.bestStreak, state.streak);
    const color = itemColor(item);
    flashPad(item.pad, color, 230);
    addEffect('burst', item.pad, color);
    if (quality === 'perfect' || quality === 'good') addEffect('text', item.pad, quality === 'perfect' ? '#5eead4' : '#c4b5fd', quality === 'perfect' ? 'Perfect' : 'Good');
    tapeJudge(quality);
  }

  function registerWrong(padId) {
    state.wrong += 1;
    state.streak = 0;
    markWrongPad(padId);
    flashPad(padId, WRONG_COLOR, 200);
    addEffect('miss', padId, WRONG_COLOR);
    tapeJudge('wrong');
  }

  function judgePractice(padId) {
    const t = songNow();
    const window = goodWindow();
    const events = state.parsed.events;
    let best = null;
    let bestDelta = Infinity;
    const from = Math.max(0, firstEventIndexAtOrAfter(t - window) - 1);
    for (let i = from; i < events.length && events[i].time <= t + window; i += 1) {
      const event = events[i];
      const delta = Math.abs(event.time - t);
      if (delta > window) continue;
      event.items.forEach(item => {
        if (item.missing || item.pad !== padId || state.results.has(item.id)) return;
        if (delta < bestDelta) { best = item; bestDelta = delta; }
      });
    }
    if (best) {
      const event = events[Number(best.id.split(':')[0])];
      GAME?.noteTiming((t - event.time) / state.speed);
      registerHit(best, bestDelta <= perfectWindow() ? 'perfect' : 'good');
    }
    else registerWrong(padId);
  }

  function judgeWait(padId) {
    const events = state.parsed.events;
    const index = nextPendingWaitIndex();
    const pending = events[index];
    if (!pending) { registerWrong(padId); return; }
    const t = songNow();
    const early = Math.max(0.45 * state.parsed.spb, 0.18);
    const item = pending.items.find(candidate => !candidate.missing && candidate.pad === padId && !state.results.has(candidate.id));
    if (!item || t < pending.time - early) {
      registerWrong(padId);
      return;
    }
    registerHit(item, 'hit');
    if (eventDone(pending)) {
      if (state.waitStyle === 'game') playChime();
      state.waitIdx = index + 1;
      if (state.holding) {
        state.holding = false;
        anchorAt(pending.time);
        state.schedIdx = Math.max(state.schedIdx, index + 1);
      }
      els.waitBanner.hidden = true;
      updateNextHint(true);
    } else {
      updateWaitBanner();
    }
  }

  function updateWaitBanner() {
    const pending = state.parsed?.events[nextPendingWaitIndex()];
    if (!state.holding || !pending) { els.waitBanner.hidden = true; return; }
    els.waitBannerNotes.innerHTML = pending.items.filter(i => !i.missing).map(item => {
      const done = state.results.has(item.id);
      const label = state.padMap.get(item.pad)?.label || item.pad;
      return `<span class="wb-item${done ? ' done' : ''}" style="--hand:${itemColor(item)}">${escapeHtml(label)}<small>${item.hand}</small></span>`;
    }).join('<em>+</em>');
    els.waitBanner.hidden = false;
  }

  /* ------------------------------------------------------------------ */
  /* UI updates                                                          */
  /* ------------------------------------------------------------------ */

  function setTextIfChanged(element, value) {
    if (element && element.textContent !== value) element.textContent = value;
  }

  function setToneIfChanged(element, value) {
    if (element && element.dataset.tone !== value) element.dataset.tone = value;
  }

  function updatePracticeUI() {
    const parsed = state.parsed;
    if (!parsed) return;
    const t = state.playing ? songNow() : state.songTime;
    const shown = Math.max(0, Math.min(parsed.duration, t));
    if (!state.dragProgress) {
      const value = String(Math.round((shown / parsed.duration) * 1000));
      if (els.progress.value !== value) { els.progress.value = value; syncProgressFill(); }
    }
    setTextIfChanged(els.elapsedLabel, formatTime(shown / state.speed));

    let perfect = 0; let good = 0; let miss = 0; let hit = 0;
    state.results.forEach(value => {
      if (value === 'perfect') perfect += 1;
      else if (value === 'good') good += 1;
      else if (value === 'miss') miss += 1;
      else if (value === 'hit') hit += 1;
    });
    const judged = perfect + good + miss + hit;
    let score = 0;
    if (state.mode === 'wait') score = hit + state.wrong ? hit / (hit + state.wrong) : 0;
    else if (state.mode === 'practice') score = judged + state.wrong ? (perfect + good * 0.7) / (judged + state.wrong * 0.5) : 0;
    const percent = Math.round(score * 100);
    const scoreText = `${percent}%`;
    setTextIfChanged(els.scoreValue, scoreText);
    setTextIfChanged(els.mobileScoreValue, scoreText);
    setTextIfChanged(els.streakValue, String(state.streak));
    setTextIfChanged(els.mobileStreakValue, String(state.streak));
    const scoreTone = !(judged + state.wrong) || percent === 0 ? 'neutral' : percent >= 80 ? 'success' : percent >= 40 ? 'warning' : 'danger';
    const streakTone = state.streak === 0 ? 'neutral' : state.streak >= 3 ? 'success' : 'building';
    setToneIfChanged(els.scorePill, scoreTone);
    setToneIfChanged(els.mobileScorePill, scoreTone);
    setToneIfChanged(els.streakPill, streakTone);
    setToneIfChanged(els.mobileStreakPill, streakTone);
    let left;
    if (state.mode === 'practice' || state.mode === 'wait') left = Math.max(0, parsed.itemCount - judged);
    else left = playableItems().filter(item => parsed.events[item.event].time >= t - 0.001).length;
    setTextIfChanged(els.notesLeftValue, String(left));
    setTextIfChanged(els.mobileNotesLeftValue, String(left));
  }

  function nextUpcomingEvent() {
    const parsed = state.parsed;
    if (!parsed || state.mode === 'tuner') return null;
    const t = state.playing ? songNow() : state.songTime;
    if (state.mode === 'wait') return parsed.events[nextPendingWaitIndex()] || null;
    const window = state.mode === 'practice' ? goodWindow() : 0.02;
    for (let i = firstEventIndexAtOrAfter(t - window); i < parsed.events.length; i += 1) {
      const event = parsed.events[i];
      if (!eventPlayable(event)) continue;
      if (state.mode === 'practice' && eventDone(event)) continue;
      return event;
    }
    return null;
  }

  function updateNextHint(force = false) {
    const event = nextUpcomingEvent();
    const key = event ? `${event.index}:${state.mode}:${state.instrument.handColors}` : 'none';
    const t = state.playing ? songNow() : state.songTime;
    let timeText;
    if (event) {
      const beats = (event.time - t) / state.parsed.spb;
      timeText = state.holding ? 'Play it now' : beats <= 0.25 ? 'Now' : `in ${beats < 10 ? beats.toFixed(1) : Math.round(beats)} beats`;
    } else {
      timeText = state.mode === 'tuner' ? 'Tuner' : state.parsed && state.songTime >= state.parsed.duration - 0.01 ? 'Complete' : 'Ready';
    }
    setTextIfChanged(els.nextNoteTime, timeText);
    if (key === state.nextKey && !force) return;
    state.nextKey = key;
    state.drums.forEach(drum => drum.padEls.forEach(g => g.classList.remove('next')));
    if (!event) {
      els.nextNoteValue.innerHTML = state.parsed && state.songTime >= state.parsed.duration - 0.01 ? '✓' : '-';
      return;
    }
    // Before the transport rolls, keep the drum clean (no highlighted pads).
    const started = state.playing || state.songTime > 0.001;
    event.items.forEach(item => {
      if (item.missing || !started) return;
      state.drums.forEach(drum => {
        const g = drum.padEls.get(item.pad);
        if (!g) return;
        g.style.setProperty('--next', itemColor(item));
        g.classList.add('next');
      });
    });
    els.nextNoteValue.innerHTML = event.items.filter(i => !i.missing).map(item => {
      const label = state.padMap.get(item.pad)?.label || item.pad;
      return `<span class="nn-item" style="--hand:${itemColor(item)}">${escapeHtml(label)}<small>${item.hand === 'L' ? 'left' : 'right'}</small></span>`;
    }).join('<em>+</em>') || '-';
  }

  function updateTransportUI() {
    els.playBtn.innerHTML = state.playing
      ? '<span class="pause-icon" aria-hidden="true"><span></span><span></span></span>'
      : '<span class="play-icon" aria-hidden="true"></span>';
    els.playBtn.setAttribute('aria-label', state.playing ? 'Pause' : 'Play');
    els.loopBtn.classList.toggle('active', state.loop);
    els.loopBtn.setAttribute('aria-pressed', String(state.loop));
    els.metronomeBtn.classList.toggle('active', state.metronome);
    els.metronomeBtn.setAttribute('aria-pressed', String(state.metronome));
    const guideOn = state.mode === 'wait' ? state.waitStyle === 'hear' : state.guide;
    els.guideBtn.classList.toggle('active', guideOn);
    els.guideBtn.setAttribute('aria-pressed', String(guideOn));
    els.guideBtn.disabled = state.mode === 'listen';
    els.dockPlayBtn.innerHTML = els.playBtn.innerHTML;
    els.dockPlayBtn.setAttribute('aria-label', state.playing ? 'Pause' : 'Play');
    els.dockLoopBtn.classList.toggle('active', state.loop);
    els.dockLoopBtn.setAttribute('aria-pressed', String(state.loop));
    els.dockMetronomeBtn.classList.toggle('active', state.metronome);
    els.dockMetronomeBtn.setAttribute('aria-pressed', String(state.metronome));
    keepScreenOn(state.playing || state.focusMode || (state.mode === 'tuner' && mic.on));
    els.guideBtn.title = state.mode === 'listen' ? 'Listen always plays the song'
      : state.mode === 'wait' ? (guideOn ? 'Play Note: the app plays each note, then waits for you' : 'Tap to hear each note first (Play Note)')
      : state.guide ? 'Song sound on: the app plays the song (quieter once you play along)' : 'Song sound off: only your own strokes';
    document.body.classList.toggle('is-playing', state.playing);
  }

  function updateModeUI() {
    document.querySelectorAll('[data-mode]').forEach(button => button.classList.toggle('active', button.dataset.mode === state.mode || (button.dataset.mode === 'practice' && state.mode === 'wait')));
    els.waitToggle.checked = state.mode === 'wait' || (state.mode !== 'practice' && state.waitPref);
    syncWaitControls();
    const hints = {
      listen: 'Listen and watch the notes, nothing is scored.',
      practice: 'Play along on screen, keyboard, or with the microphone.',
      wait: 'The song waits for each note. Play it to move on.',
      tuner: 'Strike one note at a time. The note lights up and the pitch meter will respond.'
    };
    els.modeHint.textContent = hints[state.mode];
    if (typeof fitPhoneStage === 'function') requestAnimationFrame(() => fitPhoneStage());
    const tuner = state.mode === 'tuner';
    els.trainerGrid.classList.toggle('tuner-mode', tuner);
    els.tunerPanel.hidden = !tuner;
    document.body.dataset.mode = state.mode;
    updateTransportUI();
    updateMicUI();
  }

  function setMode(mode) {
    if (mode === 'demo') mode = 'listen';
    if (!['listen', 'practice', 'wait', 'tuner'].includes(mode) || mode === state.mode) return;
    const wasPlaying = state.playing;
    pausePlayback();
    const previous = state.mode;
    state.mode = mode;
    const t = state.songTime;
    resetRun(t >= (state.parsed?.duration || 0) - 0.01 ? 0 : t);
    if (mode === 'tuner') {
      if (state.view !== 'radial') setView('radial', { silent: true, keepPref: true });
      resetTunerDisplay(mic.on ? 'Listening for a clear pitch' : 'Turn on the microphone to begin');
      if (!mic.on) { mic.autoByTuner = true; startMic(); }
    } else if (previous === 'tuner' && prefs.view === 'lanes' && state.view !== 'lanes') {
      setView('lanes', { silent: true });
    }
    // The tuner switched the microphone on by itself: switch it off again when you leave.
    // Listen never uses the microphone.
    if (mode !== 'tuner' && mic.on && (mic.autoByTuner || mode === 'listen')) stopMic();
    if (mode !== 'tuner') mic.autoByTuner = false;
    updateModeUI();
    updateNextHint(true);
    savePrefs();
    fitPhoneStage();
    resizeCanvas();
    if (wasPlaying && mode !== 'tuner') startPlayback();
  }

  function setView(view, options = {}) {
    if (!['radial', 'lanes'].includes(view)) return;
    state.view = view;
    if (!options.keepPref) prefs.view = view;
    const radial = view === 'radial';
    els.noteStage.classList.toggle('radial-view', radial);
    els.trainerGrid.classList.toggle('radial-layout', radial);
    document.querySelectorAll('.view-segment').forEach(button => {
      button.classList.toggle('active', button.dataset.view === view);
      button.setAttribute('aria-pressed', String(button.dataset.view === view));
    });
    const nextView = radial ? 'Falling lanes' : 'Drum centre';
    els.mobileViewToggleBtn.dataset.view = view;
    els.mobileViewToggleBtn.setAttribute('aria-label', `Switch display to ${nextView}`);
    els.mobileViewToggleBtn.title = `Switch to ${nextView}`;
    document.body.dataset.view = view;
    if (!options.keepPref) savePrefs();
    if (!options.silent) showToast(radial ? 'Centre-drum display enabled.' : 'Falling-lane display enabled.', 'success');
    fitPhoneStage();
    requestAnimationFrame(() => resizeCanvas());
  }

  // The dropdown lists the usual speeds; any other speed (from the [ ] keys) shows as
  // its own extra entry.
  function syncSpeedSelect() {
    const select = els.speedSelect;
    if (!select) return;
    select.querySelector('option[data-custom]')?.remove();
    let option = [...select.options].find(o => Math.abs(Number(o.value) - state.speed) < 0.001);
    if (!option) {
      option = new Option(`${formatSpeed(state.speed)}×`, String(state.speed));
      option.dataset.custom = '1';
      const after = [...select.options].find(o => Number(o.value) > state.speed);
      select.insertBefore(option, after || null);
    }
    select.value = option.value;
  }

  function setSpeed(value, announce = false) {
    state.speed = clampSpeed(value);
    GAME?.speedChanged(state.speed);
    if (state.playing) {
      const t = songNow();
      cancelScheduledAudio();
      state.anchorSong = t;
      state.anchorReal = realNow();
      if (!state.holding) state.songTime = t;
      state.schedIdx = firstEventIndexAtOrAfter(t);
      state.schedBeat = Math.ceil(t / state.parsed.spb - 1e-6);
    }
    syncSpeedSelect();
    els.speedCycleValue.textContent = `${formatSpeed(state.speed)}×`;
    updateTempoLabel();
    savePrefs();
    if (announce) showToast(`Speed ${formatSpeed(state.speed)}× · ${Math.round((state.parsed?.bpm || 0) * state.speed)} BPM`, 'success');
  }

  function formatSpeed(value) {
    return Number(value).toFixed(2).replace(/0$/, '').replace(/\.0$/, '');
  }

  /* ------------------------------------------------------------------ */
  /* A-B section loop                                                    */
  /* ------------------------------------------------------------------ */

  function currentPosition() {
    return Math.max(0, Math.min(state.parsed?.duration || 0, state.playing ? songNow() : state.songTime));
  }

  function snapToBar(time) {
    const parsed = state.parsed;
    if (!parsed) return time;
    const beat = time / parsed.spb;
    let best = parsed.bars[0];
    parsed.bars.forEach(bar => { if (Math.abs(bar - beat) < Math.abs(best - beat)) best = bar; });
    return best * parsed.spb;
  }

  function setLoopPoint(which) {
    const parsed = state.parsed;
    if (!parsed) return;
    const position = snapToBar(currentPosition());
    if (which === 'A') {
      state.loopA = position;
      if (state.loopB != null && state.loopB <= position) state.loopB = null;
    } else {
      state.loopB = position;
      if (state.loopA != null && state.loopA >= position) state.loopA = null;
      if (state.loopA == null) state.loopA = 0;
    }
    if (state.loopA != null && state.loopB != null && state.loopB - state.loopA < parsed.spb) {
      state.loopB = Math.min(parsed.duration, state.loopA + parsed.beatsPerBar * parsed.spb);
    }
    updateABLoopUI();
  }

  function clearABLoop() {
    SMART?.stop();
    state.loopA = null;
    state.loopB = null;
    state.abLoop = false;
    updateABLoopUI();
  }

  function toggleABLoop() {
    if (state.loopA == null || state.loopB == null) return;
    SMART?.stop();
    state.abLoop = !state.abLoop;
    if (state.abLoop) {
      state.loop = false;
      const t = currentPosition();
      if (t < state.loopA || t >= state.loopB) seekTo(state.loopA);
    }
    updateABLoopUI();
    updateTransportUI();
  }

  function updateABLoopUI() {
    const parsed = state.parsed;
    if (!parsed) return;
    const hasA = state.loopA != null;
    const hasB = state.loopB != null;
    els.abLoopBtn.disabled = !(hasA && hasB);
    els.clearABBtn.disabled = !(hasA || hasB);
    els.abLoopBtn.classList.toggle('active', state.abLoop);
    els.abLoopBtn.setAttribute('aria-pressed', String(state.abLoop));
    const pos = time => `${(time / parsed.duration) * 100}%`;
    els.abMarkerA.hidden = !hasA;
    els.abMarkerB.hidden = !hasB;
    if (hasA) els.abMarkerA.style.left = pos(state.loopA);
    if (hasB) els.abMarkerB.style.left = pos(state.loopB);
    const barOf = time => Math.round(time / parsed.spb / parsed.beatsPerBar) + 1;
    if (hasA && hasB) els.abLoopStatus.textContent = state.abLoop ? `Looping bars ${barOf(state.loopA)}-${barOf(state.loopB) - 1}.` : `Bars ${barOf(state.loopA)}-${barOf(state.loopB) - 1} are ready. Press Loop A-B.`;
    else if (hasA) els.abLoopStatus.textContent = `A is at bar ${barOf(state.loopA)}. Move on and set B.`;
    else els.abLoopStatus.textContent = '';
  }

  /* ------------------------------------------------------------------ */
  /* Canvas pipeline (after Ethereal Drum)                               */
  /* ------------------------------------------------------------------ */

  const renderColorDataCache = new Map();
  const noteSpriteCache = new Map();
  const noteLabelSpriteCache = new Map();
  const glowTextureCache = new Map();
  const backCtx = els.noteCanvasBack.getContext('2d');
  const frontCtx = els.noteCanvas.getContext('2d');

  function hexToRgb(hex) {
    const clean = /^#[0-9a-f]{6}$/i.test(String(hex || '')) ? hex.slice(1) : 'a78bfa';
    return { r: parseInt(clean.slice(0, 2), 16), g: parseInt(clean.slice(2, 4), 16), b: parseInt(clean.slice(4, 6), 16) };
  }

  function renderColorData(hex) {
    if (renderColorDataCache.has(hex)) return renderColorDataCache.get(hex);
    const { r, g, b } = hexToRgb(hex);
    const mix = amount => ({
      r: Math.round(r + (255 - r) * amount),
      g: Math.round(g + (255 - g) * amount),
      b: Math.round(b + (255 - b) * amount)
    });
    const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    const data = { r, g, b, highlight: mix(0.56), light: mix(0.3), trail: mix(0.38), ink: luminance > 0.58 ? '#101521' : '#ffffff' };
    renderColorDataCache.set(hex, data);
    return data;
  }

  function rgba(hex, alpha) {
    const { r, g, b } = renderColorData(hex);
    return `rgba(${r},${g},${b},${Math.max(0, Math.min(1, alpha)).toFixed(3)})`;
  }

  // Keep musical timing independent from drawing cost. Phones use a deliberately lean
  // canvas profile, tablets keep a little more detail, and desktop retains the full scene.
  function performanceProfileFor(width) {
    const coarsePointer = Boolean(window.matchMedia?.('(pointer: coarse)').matches);
    const viewportShortEdge = Math.min(window.innerWidth || width, window.innerHeight || width);
    const phoneLayout = width <= 600 || (coarsePointer && viewportShortEdge <= 600);
    if (phoneLayout) {
      return {
        name: 'phone', dpr: 1, visualInterval: 34, uiInterval: 100,
        backdropInterval: 100, ambientInterval: 100, stars: 52,
        particleQualityCap: 'none', fallingParticles: 27, radialParticles: 36,
        particleBudget: 0, particleShadows: false
      };
    }
    if (width <= 1100 || coarsePointer) {
      return {
        name: 'tablet', dpr: 1.25, visualInterval: 25, uiInterval: 80,
        backdropInterval: 67, ambientInterval: 80, stars: 78,
        particleQualityCap: 'half', fallingParticles: 27, radialParticles: 36,
        particleBudget: 144, particleShadows: false
      };
    }
    return {
      name: 'desktop', dpr: 1.75, visualInterval: 0, uiInterval: 33,
      backdropInterval: 33, ambientInterval: 66, stars: 110,
      particleQualityCap: 'full', fallingParticles: 27, radialParticles: 36,
      particleBudget: 432, particleShadows: true
    };
  }

  function visualPerformanceProfile() {
    return state.performanceProfile || performanceProfileFor(els.noteCanvas.clientWidth || window.innerWidth);
  }

  function setParticleQuality(quality) {
    state.particleQuality = PARTICLE_QUALITY_ORDER.includes(quality) ? quality : 'none';
    document.documentElement.dataset.particleQuality = state.particleQuality;
  }

  function resetVisualPerformanceMonitor(now = performance.now()) {
    state.visualMonitorStartedAt = now;
    state.visualMonitorSamples = 0;
    state.visualMonitorSlowSamples = 0;
    state.visualMonitorCostAverage = 0;
    state.visualMonitorLastFrameAt = 0;
  }

  function configureParticleQuality(profile) {
    if (state.particleProfileName === profile.name) return;
    state.particleProfileName = profile.name;
    state.backgroundRateScale = profile.name === 'phone' ? 2 : profile.name === 'tablet' ? 1.35 : 1;
    setParticleQuality(profile.particleQualityCap);
    resetVisualPerformanceMonitor();
  }

  function downgradeParticleQuality() {
    const current = Math.max(0, PARTICLE_QUALITY_ORDER.indexOf(state.particleQuality));
    if (current <= 0) return false;
    setParticleQuality(PARTICLE_QUALITY_ORDER[current - 1]);
    resetVisualPerformanceMonitor();
    return true;
  }

  function monitorVisualPerformance(frameStartedAt, frameFinishedAt, profile) {
    const targetInterval = profile.visualInterval || 16.7;
    const renderCost = Math.max(0, frameFinishedAt - frameStartedAt);
    const frameGap = state.visualMonitorLastFrameAt ? frameStartedAt - state.visualMonitorLastFrameAt : targetInterval;
    state.visualMonitorLastFrameAt = frameStartedAt;
    state.visualMonitorSamples += 1;
    state.visualMonitorCostAverage += (renderCost - state.visualMonitorCostAverage) * 0.08;
    if (renderCost > targetInterval * 0.62 || frameGap > targetInterval * 2.1) state.visualMonitorSlowSamples += 1;
    const elapsed = frameFinishedAt - state.visualMonitorStartedAt;
    if (elapsed < 2400 || state.visualMonitorSamples < 48) return;
    const slowRatio = state.visualMonitorSlowSamples / state.visualMonitorSamples;
    const drawingIsHeavy = state.visualMonitorCostAverage > targetInterval * 0.52;
    if (slowRatio >= 0.24 || drawingIsHeavy) {
      const reduced = downgradeParticleQuality();
      if (state.backgroundRateScale < 2) {
        state.backgroundRateScale = 2;
        state.lastBackdropAt = 0;
      }
      if (!reduced) resetVisualPerformanceMonitor(frameFinishedAt);
    } else resetVisualPerformanceMonitor(frameFinishedAt);
  }

  function effectiveBackdropInterval(profile) {
    if (!profile.backdropInterval) return state.backgroundRateScale > 1 ? 33 : 0;
    return profile.backdropInterval * state.backgroundRateScale;
  }

  function effectiveAmbientInterval(profile) {
    return profile.ambientInterval * state.backgroundRateScale;
  }

  function particleCountWithinBudget(maximum, visibleNotes, profile) {
    const quality = state.particleQuality || profile.particleQualityCap;
    if (quality === 'none') return 0;
    const multiplier = quality === 'half' ? 0.5 : 1;
    const qualityMaximum = Math.max(3, Math.floor((maximum * multiplier) / 3) * 3);
    const budgeted = Math.floor(profile.particleBudget / Math.max(1, visibleNotes));
    return Math.min(qualityMaximum, Math.max(Math.min(6, qualityMaximum), Math.floor(budgeted / 3) * 3));
  }

  function cacheGet(cache, key) {
    return cache.has(key) ? cache.get(key) : null;
  }

  function cacheSet(cache, key, value, maximum) {
    cache.set(key, value);
    while (cache.size > maximum) cache.delete(cache.keys().next().value);
    return value;
  }

  function canvasDensity(profile = visualPerformanceProfile()) {
    return Math.min(window.devicePixelRatio || 1, profile.dpr || 2);
  }

  function resizeCanvas() {
    const rect = els.noteStage.getBoundingClientRect();
    const previous = state.performanceProfile;
    state.performanceProfile = performanceProfileFor(rect.width);
    if (!previous || previous.name !== state.performanceProfile.name || previous.dpr !== state.performanceProfile.dpr) {
      noteSpriteCache.clear();
      noteLabelSpriteCache.clear();
      glowTextureCache.clear();
    }
    configureParticleQuality(state.performanceProfile);
    const dpr = canvasDensity(state.performanceProfile);
    [els.noteCanvas, els.noteCanvasBack].forEach(canvas => {
      canvas.width = Math.max(1, Math.round(rect.width * dpr));
      canvas.height = Math.max(1, Math.round(rect.height * dpr));
      canvas.getContext('2d').setTransform(dpr, 0, 0, dpr, 0, 0);
    });
    invalidateGuides();
    buildStarField(rect.width, rect.height);
    layoutStage(rect.width, rect.height);
    state.dirty = true;
    requestFrame();
  }

  function invalidateGuides() {
    state.staticGuideCanvas = null;
    state.staticGuideKey = '';
    state.laneGuideCanvas = null;
    state.laneGuideKey = '';
    state.backdropMode = '';
    state.lastBackdropAt = 0;
    state.dirty = true;
  }

  // Same sizing rules as Ethereal Drum's centre drum, so the handpan sits in the same
  // place on every screen and is always centred.
  function radialGeometry(width, height) {
    let drumSize;
    if (width <= 760) {
      // Room on both sides, so the notes can be seen flying in from the edges.
      drumSize = Math.max(200, Math.min(width * 0.78, height * 0.62, 340));
    } else if (width <= 1100) {
      const tabletFloor = Math.min(320, Math.max(280, width - 28));
      const tabletTarget = Math.min(400, width * 0.42, height * 0.64);
      drumSize = Math.max(tabletFloor, tabletTarget);
    } else {
      drumSize = Math.max(270, Math.min(450, Math.min(height * 0.61, width * 0.38)));
    }
    // Bottom notes sit just outside the shell; keep them on screen.
    if (state.pads.some(pad => pad.kind === 'bottom')) drumSize = Math.min(drumSize, (width - 14) / 1.27, (height - 20) / 1.3);
    const cx = width / 2;
    const cy = height / 2 + Math.min(14, height * 0.02);
    return { drumSize, scale: drumSize / STAGE_DRUM_BASE, cx, cy };
  }

  function layoutStage(width, height) {
    // Matches the 760px breakpoint where the side card (with its drum) is hidden.
    const phoneLanes = state.view === 'lanes' && window.innerWidth <= 760;
    els.noteStage.classList.toggle('lanes-drum', phoneLanes);
    const layout = { w: width, h: height, drum: null, phoneLanes, lanesTop: width <= 900 ? 60 : 52, lanesBottom: height };
    if (state.view === 'radial') {
      layout.drum = radialGeometry(width, height);
      if (state.mode === 'tuner') {
        // Leave room for the tuner panel along the bottom of the stage.
        const panel = width <= 760 ? 150 : 112;
        const usable = height - panel;
        layout.drum.drumSize = Math.min(layout.drum.drumSize, usable * 0.86);
        layout.drum.scale = layout.drum.drumSize / STAGE_DRUM_BASE;
        layout.drum.cy = usable / 2 + 8;
      }
    } else if (phoneLanes) {
      // Lanes on top, the handpan at the bottom just above the play controls.
      // The lanes take everything else, so they are as long as the screen allows.
      const hasBottoms = state.pads.some(pad => pad.kind === 'bottom');
      const extent = hasBottoms ? 1.28 : 1.08;
      const drumSize = Math.max(160, Math.min(width - 60, height * 0.31, 300));
      const reserve = window.innerWidth > 760 ? 10 : document.body.classList.contains('focus-mode') ? 54 : 70;
      const cy = height - reserve - drumSize * extent / 2;
      // "Left hand" / "Right hand" go beside the drum when there is room, else above it.
      const sideLegend = width / 2 - drumSize * extent * 0.42 >= 70;
      layout.lanesBottom = Math.round(cy - drumSize * extent / 2 + (sideLegend ? 4 : -26));
      layout.drum = { drumSize, scale: drumSize / STAGE_DRUM_BASE, cx: width / 2, cy, sideLegend, extent };
    }
    placeTape(layout, width, height);
    if (layout.drum) {
      const { cx, cy, scale } = layout.drum;
      els.stageDrumWrap.style.left = `${cx}px`;
      els.stageDrumWrap.style.top = `${cy}px`;
      els.stageDrumWrap.style.setProperty('--stage-scale', scale.toFixed(4));
      // Left hand / Right hand captions sit just above the drum, either side.
      const legend = els.stageHandLegend;
      legend.classList.add('on-drum');
      legend.style.left = `${cx - layout.drum.drumSize * 0.56}px`;
      legend.style.width = `${layout.drum.drumSize * 1.12}px`;
      legend.style.top = `${Math.max(phoneLanes ? layout.lanesBottom : 52, cy - layout.drum.drumSize * 0.5 - 30)}px`;
      if (phoneLanes && layout.drum.sideLegend) {
        // Close beside the drum, not out at the screen edges on a wider screen.
        const left = Math.max(8, Math.round(cx - layout.drum.drumSize * layout.drum.extent / 2 - 84));
        legend.style.left = `${left}px`;
        legend.style.width = `${Math.round((cx - left) * 2)}px`;
        legend.style.top = `${Math.round(cy - layout.drum.drumSize * 0.5 + 2)}px`;
      }
      if (width <= 760 && !phoneLanes) {
        // Phones: "Left / hand" and "Right / hand" sit on the edges, under the stats row.
        legend.style.left = '10px';
        legend.style.width = `${width - 20}px`;
        legend.style.top = '58px';
      } else if (width > 760 && !phoneLanes) {
        // Tablets and computers: out at the edges, clear of the notes flying in.
        legend.style.left = '18px';
        legend.style.width = `${width - 36}px`;
        legend.style.top = '62px';
      }
    } else {
      const legend = els.stageHandLegend;
      legend.classList.remove('on-drum');
      legend.style.left = '';
      legend.style.width = '';
      legend.style.top = '';
    }
    state.layout = layout;
  }

  function padScreen(pad) {
    const g = state.layout.drum;
    const r = g.drumSize / 2;
    return { x: g.cx + pad.x * r, y: g.cy + pad.y * r };
  }

  function rebuildLanes() {
    const used = state.instrument.usedLanes && state.parsed ? new Set([...state.parsed.used].filter(id => state.padMap.has(id))) : null;
    const perc = visiblePercIds();
    state.lanes = laneOrder(state.pads.filter(pad => pad.kind !== 'perc' || perc.has(pad.id)), used && used.size ? used : null);
    invalidateGuides();
  }

  function previewSeconds() {
    const spb = state.parsed?.spb || 0.6;
    return Math.min(4.2, Math.max(2.6, spb * 6));
  }

  function smooth(value) {
    const t = Math.max(0, Math.min(1, value));
    return t * t * (3 - 2 * t);
  }

  function addEffect(type, padId, color, text) {
    state.effects.push({ type, padId, color, text, at: performance.now() });
    if (state.effects.length > 80) state.effects.splice(0, state.effects.length - 80);
    requestFrame();
  }

  /* ---------- stars, glow, halo ---------- */

  function buildStarField(width, height) {
    if (!width || !height) return;
    const count = visualPerformanceProfile().stars;
    state.stars = Array.from({ length: count }, () => {
      const depth = Math.random() ** 1.4;
      return {
        x: Math.random() * width, y: Math.random() * height, depth,
        r: 0.35 + depth * 1.25, base: 0.13 + depth * 0.52,
        speed: 0.3 + Math.random() * 1.9, phase: Math.random() * Math.PI * 2, wobble: 0.7 + Math.random() * 0.6
      };
    });
  }

  // Parallax: every star slides along the same axis, near ones faster than far ones.
  const PARALLAX = { x: -5.2, y: 2.1 };

  function drawStars(ctx, width, height, now, delta) {
    if (!state.stars.length) buildStarField(width, height);
    const fixedPositions = visualPerformanceProfile().name === 'phone';
    const pace = (state.playing ? 1 : 0.32) * delta;
    const bucketCount = 6;
    const buckets = Array.from({ length: bucketCount }, () => []);
    state.stars.forEach(star => {
      if (!fixedPositions) {
        const rate = 0.18 + star.depth * 1.05;
        star.x = (star.x + PARALLAX.x * rate * star.wobble * pace + width) % width;
        star.y = (star.y + PARALLAX.y * rate * pace + height) % height;
      }
      const twinkle = 0.5 + 0.5 * Math.sin(now * star.speed + star.phase);
      const alpha = star.base * (0.3 + 0.7 * twinkle);
      buckets[Math.min(bucketCount - 1, Math.floor((alpha / 0.7) * bucketCount))].push(star);
    });
    ctx.save();
    ctx.fillStyle = '#ffffff';
    buckets.forEach((stars, bucket) => {
      if (!stars.length) return;
      ctx.globalAlpha = ((bucket + 0.5) / bucketCount) * 0.7;
      ctx.beginPath();
      stars.forEach(star => {
        ctx.moveTo(star.x + star.r, star.y);
        ctx.arc(star.x, star.y, star.r, 0, Math.PI * 2);
      });
      ctx.fill();
    });
    ctx.restore();
  }

  const AMOEBA_LOBES = [
    { orbit: 0.11, speed: 0.130, phase: 0.0, size: 0.62, tint: '123,146,255', alpha: 0.15 },
    { orbit: 0.17, speed: -0.092, phase: 1.9, size: 0.53, tint: '99,130,246', alpha: 0.13 },
    { orbit: 0.14, speed: 0.074, phase: 3.4, size: 0.58, tint: '94,234,212', alpha: 0.10 },
    { orbit: 0.21, speed: -0.109, phase: 5.0, size: 0.45, tint: '167,139,250', alpha: 0.11 },
    { orbit: 0.08, speed: 0.161, phase: 2.4, size: 0.70, tint: '110,140,255', alpha: 0.08 }
  ];

  function cachedGlowTexture(key, stops) {
    const density = canvasDensity();
    const cacheKey = `${key}:${density}`;
    const existing = cacheGet(glowTextureCache, cacheKey);
    if (existing) return existing;
    const cssSize = 256;
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(cssSize * density);
    canvas.height = Math.ceil(cssSize * density);
    const textureCtx = canvas.getContext('2d');
    textureCtx.setTransform(density, 0, 0, density, 0, 0);
    const gradient = textureCtx.createRadialGradient(cssSize / 2, cssSize / 2, 0, cssSize / 2, cssSize / 2, cssSize / 2);
    stops.forEach(([offset, color]) => gradient.addColorStop(offset, color));
    textureCtx.fillStyle = gradient;
    textureCtx.fillRect(0, 0, cssSize, cssSize);
    return cacheSet(glowTextureCache, cacheKey, { canvas, cssSize }, 24);
  }

  function drawGlowTexture(ctx, texture, cx, cy, radius) {
    ctx.drawImage(texture.canvas, cx - radius, cy - radius, radius * 2, radius * 2);
  }

  function drawAmoeba(ctx, cx, cy, size, now) {
    const compactLayout = visualPerformanceProfile().name !== 'desktop';
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    if (compactLayout) {
      const breathe = 1 + Math.sin(now * 0.42) * 0.035;
      const texture = cachedGlowTexture('amoeba:compact', [
        [0, 'rgba(112,143,255,.17)'], [0.34, 'rgba(99,130,246,.115)'], [0.66, 'rgba(99,130,246,.05)'],
        [0.86, 'rgba(94,234,212,.016)'], [1, 'rgba(109,130,246,0)']
      ]);
      drawGlowTexture(ctx, texture, cx, cy, size * 0.73 * breathe);
      ctx.restore();
      return;
    }
    AMOEBA_LOBES.forEach(lobe => {
      const breathe = 1 + 0.19 * Math.sin(now * lobe.speed * 2.3 + lobe.phase);
      const ox = cx + Math.cos(now * lobe.speed + lobe.phase) * size * lobe.orbit;
      const oy = cy + Math.sin(now * lobe.speed * 1.27 + lobe.phase * 1.4) * size * lobe.orbit * 0.82;
      const texture = cachedGlowTexture(`amoeba:${lobe.tint}:${lobe.alpha}`, [
        [0, `rgba(${lobe.tint},${lobe.alpha})`],
        [0.42, `rgba(${lobe.tint},${(lobe.alpha * 0.42).toFixed(4)})`],
        [1, `rgba(${lobe.tint},0)`]
      ]);
      drawGlowTexture(ctx, texture, ox, oy, size * lobe.size * breathe);
    });
    ctx.restore();
  }

  function drawDrumHalo(ctx, cx, cy, size, now) {
    const pulse = 1 + Math.sin(now * 0.82) * 0.035;
    const compactLayout = visualPerformanceProfile().name !== 'desktop';
    const innerRadius = size * (compactLayout ? 0.45 : 0.47);
    const outerRadius = size * (compactLayout ? 0.72 : 0.76) * pulse;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const innerRatio = Math.max(0, Math.min(0.9, innerRadius / outerRadius));
    const haloTexture = cachedGlowTexture(`halo:${compactLayout ? 'compact' : 'desktop'}`, [
      [0, 'rgba(126,156,255,.3)'],
      [innerRatio, 'rgba(126,156,255,.3)'],
      [innerRatio + (1 - innerRatio) * 0.22, 'rgba(116,147,255,.17)'],
      [innerRatio + (1 - innerRatio) * 0.58, compactLayout ? 'rgba(109,130,246,.06)' : 'rgba(109,130,246,.07)'],
      [1, 'rgba(109,130,246,0)']
    ]);
    drawGlowTexture(ctx, haloTexture, cx, cy, outerRadius);
    ctx.globalAlpha = 0.36 + Math.sin(now * 0.82) * 0.08;
    ctx.strokeStyle = 'rgba(170,186,255,.72)';
    ctx.lineWidth = Math.max(2, size * 0.009);
    ctx.shadowColor = 'rgba(112,143,255,.85)';
    ctx.shadowBlur = size * 0.07;
    ctx.beginPath();
    ctx.arc(cx, cy, size * 0.505, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  /* ---------- flight guides (rays) ---------- */

  function distanceToStageEdge(cx, cy, dx, dy, width, height, margin) {
    const values = [];
    if (dx > 0.0001) values.push((width - margin - cx) / dx);
    if (dx < -0.0001) values.push((margin - cx) / dx);
    if (dy > 0.0001) values.push((height - margin - cy) / dy);
    if (dy < -0.0001) values.push((margin - cy) / dy);
    return Math.max(0, Math.min(...values.filter(value => value > 0)));
  }

  function padTarget(pad, geometry) {
    const r = geometry.drumSize / 2;
    let dx = pad.x;
    let dy = pad.y;
    let length = Math.hypot(dx, dy);
    if (length < 0.05) {
      const a = (pad.rayAngle ?? 180) * Math.PI / 180;
      dx = Math.sin(a);
      dy = Math.cos(a);
      length = 0;
    } else { dx /= length; dy /= length; }
    const distance = length * r;
    return { x: geometry.cx + dx * distance, y: geometry.cy + dy * distance, dx, dy, distance, reach: Math.max(pad.rx, pad.ry) * r };
  }

  function guidePads() {
    const perc = visiblePercIds();
    return state.pads.filter(pad => pad.kind !== 'perc' || perc.has(pad.id));
  }

  function drawRadialGuide(ctx, width, height, geometry, pad, strength = 0, color = null) {
    const target = padTarget(pad, geometry);
    const edgeRadius = distanceToStageEdge(geometry.cx, geometry.cy, target.dx, target.dy, width, height, 12);
    const startX = target.x + target.dx * target.reach * 0.85;
    const startY = target.y + target.dy * target.reach * 0.85;
    const edgeX = geometry.cx + target.dx * edgeRadius;
    const edgeY = geometry.cy + target.dy * edgeRadius;
    if (edgeRadius <= target.distance + target.reach) return;
    const gradient = ctx.createLinearGradient(startX, startY, edgeX, edgeY);
    // The ray fades in over its first ~40 px, so it melts into the field instead of
    // stopping with a hard bright end.
    const length = Math.max(1, Math.hypot(edgeX - startX, edgeY - startY));
    const fade = Math.min(0.3, 42 / length);
    if (color) {
      gradient.addColorStop(0, rgba(color, 0));
      gradient.addColorStop(fade * 0.45, rgba(color, strength * 0.38));
      gradient.addColorStop(fade, rgba(color, strength * 0.78));
      gradient.addColorStop(Math.max(fade + 0.05, 0.3), rgba(color, strength * 0.48));
      gradient.addColorStop(0.65, rgba(color, strength * 0.16));
      gradient.addColorStop(1, rgba(color, strength * 0.02));
    } else {
      gradient.addColorStop(0, 'rgba(255,255,255,0)');
      gradient.addColorStop(fade, 'rgba(255,255,255,.08)');
      gradient.addColorStop(Math.max(fade + 0.05, 0.3), 'rgba(255,255,255,.06)');
      gradient.addColorStop(0.65, 'rgba(255,255,255,.03)');
      gradient.addColorStop(1, 'rgba(255,255,255,.006)');
    }
    ctx.strokeStyle = gradient;
    ctx.lineWidth = color ? 1 + strength * 1.6 : 1;
    ctx.shadowColor = color ? rgba(color, 0.9) : 'rgba(255,255,255,.9)';
    ctx.shadowBlur = color ? strength * 10 : 0;
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.lineTo(edgeX, edgeY);
    ctx.stroke();
  }

  function staticGuideLayer(width, height, geometry) {
    const density = canvasDensity();
    const key = [width, height, geometry.drumSize.toFixed(1), geometry.cx, geometry.cy, density, guidePads().map(p => `${p.id}${p.x.toFixed(2)}${p.y.toFixed(2)}`).join(',')].join(':');
    if (state.staticGuideCanvas && state.staticGuideKey === key) return state.staticGuideCanvas;
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(width * density));
    canvas.height = Math.max(1, Math.round(height * density));
    const guideCtx = canvas.getContext('2d');
    guideCtx.setTransform(density, 0, 0, density, 0, 0);
    guidePads().forEach(pad => drawRadialGuide(guideCtx, width, height, geometry, pad));
    state.staticGuideCanvas = canvas;
    state.staticGuideKey = key;
    return canvas;
  }

  // Everything that belongs behind the drum: stars, amoeba glow, halo and the faint rays.
  function renderRadialBackdrop(ctx, width, height, now, delta) {
    drawStars(ctx, width, height, now, delta);
    const geometry = state.layout.drum;
    if (!geometry) return;
    drawAmoeba(ctx, geometry.cx, geometry.cy, geometry.drumSize, now);
    drawDrumHalo(ctx, geometry.cx, geometry.cy, geometry.drumSize, now);
    if (state.mode !== 'tuner' && state.view === 'radial') {
      const guides = staticGuideLayer(width, height, geometry);
      ctx.drawImage(guides, 0, 0, guides.width, guides.height, 0, 0, width, height);
    }
  }

  /* ---------- note sprites ---------- */

  function roundRect(ctx, x, y, w, h, r) {
    const rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }

  function cachedNoteSprite(kind, color, requestedWidth, requestedHeight, requestedBlur) {
    const width = Math.max(8, Math.round(requestedWidth / 4) * 4);
    const height = Math.max(8, Math.round(requestedHeight / 4) * 4);
    const shadowBlur = Math.max(0, Math.round(requestedBlur / 4) * 4);
    const density = canvasDensity();
    const key = [kind, color, width, height, shadowBlur, density].join(':');
    const existing = cacheGet(noteSpriteCache, key);
    if (existing) return existing;
    const padding = Math.ceil(shadowBlur * 1.75 + 4);
    const cssWidth = width + padding * 2;
    const cssHeight = height + padding * 2;
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.ceil(cssWidth * density));
    canvas.height = Math.max(1, Math.ceil(cssHeight * density));
    const spriteCtx = canvas.getContext('2d');
    spriteCtx.setTransform(density, 0, 0, density, 0, 0);
    spriteCtx.translate(cssWidth / 2, cssHeight / 2);
    const data = renderColorData(color);
    const round = kind === 'round';
    if (kind === 'lane') spriteCtx.fillStyle = color;
    else {
      const gradient = spriteCtx.createLinearGradient(-width * 0.42, -height * 0.45, width * 0.42, height * 0.45);
      gradient.addColorStop(0, `rgb(${data.highlight.r},${data.highlight.g},${data.highlight.b})`);
      gradient.addColorStop(0.3, `rgb(${data.light.r},${data.light.g},${data.light.b})`);
      gradient.addColorStop(0.62, `rgb(${data.r},${data.g},${data.b})`);
      gradient.addColorStop(1, `rgb(${data.light.r},${data.light.g},${data.light.b})`);
      spriteCtx.fillStyle = gradient;
    }
    spriteCtx.shadowColor = color;
    spriteCtx.shadowBlur = shadowBlur;
    if (round) {
      spriteCtx.beginPath();
      spriteCtx.arc(0, 0, width / 2, 0, Math.PI * 2);
    } else {
      roundRect(spriteCtx, -width / 2, -height / 2, width, height, height / 2);
    }
    spriteCtx.fill();
    spriteCtx.shadowBlur = 0;
    if (kind !== 'lane') {
      spriteCtx.strokeStyle = 'rgba(255,255,255,.28)';
      spriteCtx.lineWidth = 1;
      spriteCtx.stroke();
    }
    return cacheSet(noteSpriteCache, key, { canvas, cssWidth, cssHeight }, 320);
  }

  function drawCachedNoteSprite(ctx, sprite) {
    ctx.drawImage(sprite.canvas, 0, 0, sprite.canvas.width, sprite.canvas.height, -sprite.cssWidth / 2, -sprite.cssHeight / 2, sprite.cssWidth, sprite.cssHeight);
  }

  function cachedNoteLabel(label, requestedFontSize, inkColor) {
    const fontSize = Math.max(8, Math.round(requestedFontSize));
    const density = canvasDensity();
    const key = [label, fontSize, inkColor, density].join(':');
    const existing = cacheGet(noteLabelSpriteCache, key);
    if (existing) return existing;
    const cssWidth = Math.ceil(Math.max(24, fontSize * 2.4));
    const cssHeight = Math.ceil(Math.max(28, fontSize * 2.35));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.ceil(cssWidth * density));
    canvas.height = Math.max(1, Math.ceil(cssHeight * density));
    const labelCtx = canvas.getContext('2d');
    labelCtx.setTransform(density, 0, 0, density, 0, 0);
    labelCtx.fillStyle = inkColor;
    labelCtx.font = `850 ${fontSize}px system-ui, sans-serif`;
    labelCtx.textAlign = 'center';
    labelCtx.textBaseline = 'middle';
    labelCtx.fillText(label, cssWidth / 2, cssHeight / 2 + 0.5);
    return cacheSet(noteLabelSpriteCache, key, { canvas, cssWidth, cssHeight }, 180);
  }

  function drawCachedNoteLabel(ctx, sprite, x, y) {
    ctx.drawImage(sprite.canvas, 0, 0, sprite.canvas.width, sprite.canvas.height, x - sprite.cssWidth / 2, y - sprite.cssHeight / 2, sprite.cssWidth, sprite.cssHeight);
  }

  function particleSeed(noteId, index, salt = 0) {
    const value = `${noteId}:${index}:${salt}`;
    let hash = 2166136261;
    for (let i = 0; i < value.length; i += 1) {
      hash ^= value.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0) / 4294967295;
  }

  // One reusable particle template is animated for every note; notes only get a phase offset.
  const PARTICLE_TEMPLATE = Array.from({ length: 36 }, (_, index) => {
    const wave = value => (Math.sin(value * 12.9898 + index * 78.233) * 43758.5453) % 1;
    const unit = value => Math.abs(wave(value));
    return { stream: index % 3 - 1, streamIndex: Math.floor(index / 3), side: unit(1.3), size: unit(2.7), phase: unit(4.1), speed: unit(6.9) };
  });

  function particlePhase(noteId) {
    if (state.particlePhaseCache.has(noteId)) return state.particlePhaseCache.get(noteId);
    const phase = particleSeed(noteId, 0, 91);
    state.particlePhaseCache.set(noteId, phase);
    return phase;
  }

  /* ---------- stage frame ---------- */

  function renderStage(nowMs) {
    const { w: width, h: height } = state.layout;
    if (!width || !height || !state.parsed) return;
    const now = nowMs / 1000;
    const delta = Math.min(0.1, Math.max(0, now - (state.lastFrameAt || now)));
    state.lastFrameAt = now;
    const profile = visualPerformanceProfile();
    frontCtx.clearRect(0, 0, width, height);

    const withDrum = Boolean(state.layout.drum);
    const backdropInterval = effectiveBackdropInterval(profile);
    const backdropKind = state.view === 'radial' ? 'radial' : withDrum ? 'lanes-drum' : 'lanes';
    if (backdropKind === 'lanes') {
      const lane = laneGuideLayer(width, height);
      if (state.backdropMode !== 'lanes' || lane.fresh || !state.lastBackdropAt || !backdropInterval || nowMs - state.lastBackdropAt >= backdropInterval) {
        const backdropDelta = Math.min(0.12, Math.max(0, (nowMs - (state.lastBackdropAt || nowMs)) / 1000));
        backCtx.clearRect(0, 0, width, height);
        backCtx.drawImage(lane.canvas, 0, 0, lane.canvas.width, lane.canvas.height, 0, 0, width, height);
        drawStars(backCtx, width, height, now, backdropDelta || delta);
        state.lastBackdropAt = nowMs;
      }
    } else if (state.backdropMode !== backdropKind || !state.lastBackdropAt || !backdropInterval || nowMs - state.lastBackdropAt >= backdropInterval) {
      const backdropDelta = Math.min(0.12, Math.max(0, (nowMs - (state.lastBackdropAt || nowMs)) / 1000));
      backCtx.clearRect(0, 0, width, height);
      if (backdropKind === 'lanes-drum') {
        const lane = laneGuideLayer(width, height);
        backCtx.drawImage(lane.canvas, 0, 0, lane.canvas.width, lane.canvas.height, 0, 0, width, height);
      }
      renderRadialBackdrop(backCtx, width, height, now, backdropDelta || delta);
      state.lastBackdropAt = nowMs;
    }
    state.backdropMode = backdropKind;

    if (state.mode !== 'tuner') {
      if (state.view === 'radial') renderRadialFrame(frontCtx, width, height, profile, nowMs);
      else renderLaneFrame(frontCtx, width, height, profile, nowMs);
    }
    drawEffects(nowMs);
    state.effects = state.effects.filter(effect => nowMs - effect.at < 700);
    state.laneFlash.forEach((value, key) => { if (nowMs - value.at > 420) state.laneFlash.delete(key); });
  }

  function noteAlpha(dt, travel, preview) {
    // Notes emerge from semi-transparency, become solid in flight, and soften again
    // as they reach the drum so the pad number stays readable.
    const fadeIn = 0.16 + 0.84 * smooth(travel / 0.3);
    const fadeNear = 1 - 0.42 * smooth((travel - 0.74) / 0.26);
    const afterHit = dt < 0 ? Math.max(0, 1 + dt / 0.3) : 1;
    const farEdge = dt > preview ? Math.max(0, 1 - (dt - preview) / 0.25) : 1;
    return fadeIn * fadeNear * afterHit * farEdge;
  }

  function isHitResult(result) {
    return result && result !== 'miss';
  }

  function renderRadialFrame(ctx, width, height, profile, nowMs) {
    const geometry = state.layout.drum;
    if (!geometry) return;
    const preview = previewSeconds();
    const t = state.playing ? songNow() : state.songTime;
    const started = state.playing || state.songTime > 0.001;
    const scale = geometry.scale;
    const spb = state.parsed.spb;
    const events = state.parsed.events;
    const pending = state.mode === 'wait' ? events[nextPendingWaitIndex()] : null;
    const from = firstEventIndexAtOrAfter(t - 0.48);
    let to = from;
    while (to < events.length && events[to].time <= t + preview) to += 1;
    let visibleNotes = 0;
    for (let i = from; i < to; i += 1) visibleNotes += events[i].items.length;
    visibleNotes = Math.max(1, visibleNotes);
    const particleCount = particleCountWithinBudget(profile.radialParticles, visibleNotes, profile);
    const particleClock = particleCount ? performance.now() / 1000 : 0;
    const noteIsMoving = state.playing && !state.holding;

    // 1. Light up the rays that notes are flying along.
    const strengths = new Map();
    for (let i = from; i < to; i += 1) {
      const event = events[i];
      const dt = event.time - t;
      if (!started && dt < 0.9) continue;
      event.items.forEach(item => {
        if (item.missing || isHitResult(state.results.get(item.id))) return;
        const travel = Math.max(0, Math.min(1, 1 - dt / preview));
        const hitFade = dt < 0 ? Math.max(0, 1 + dt / 0.2) : 1;
        const strength = (0.32 + 0.68 * Math.pow(travel, 1.4)) * hitFade;
        const previous = strengths.get(item.pad);
        if (!previous || previous.strength < strength) strengths.set(item.pad, { strength, color: itemColor(item) });
      });
    }
    ctx.save();
    strengths.forEach((value, padId) => {
      const pad = state.padMap.get(padId);
      if (pad && value.strength > 0.01) drawRadialGuide(ctx, width, height, geometry, pad, value.strength, value.color);
    });
    ctx.restore();

    // 2. The notes themselves.
    for (let i = from; i < to; i += 1) {
      const event = events[i];
      const dt = event.time - t;
      if (!started && dt < 0.9) continue;
      const isPending = pending && pending.index === event.index;
      event.items.forEach(item => {
        if (item.missing) return;
        const result = state.results.get(item.id);
        if (isHitResult(result)) return;
        if (listening() && dt < -0.3) return;
        const pad = state.padMap.get(item.pad);
        const target = padTarget(pad, geometry);
        const targetRadius = target.distance;
        const startRadius = Math.max(targetRadius + 75, distanceToStageEdge(geometry.cx, geometry.cy, target.dx, target.dy, width, height, 22));
        const progress = Math.max(0, Math.min(1.18, 1 - dt / preview));
        const eased = 1 - Math.pow(1 - Math.min(progress, 1), 1.25);
        const radius = startRadius + (targetRadius - startRadius) * eased;
        const x = geometry.cx + target.dx * radius;
        const y = geometry.cy + target.dy * radius;
        const travel = Math.max(0, Math.min(1, 1 - dt / preview));
        const color = result === 'miss' ? WRONG_COLOR : itemColor(item);
        const { highlight, light, r, g, b } = renderColorData(color);
        const growth = 0.72 + Math.pow(travel, 0.72) * 0.48;
        let alpha = noteAlpha(dt, travel, preview);
        if (isPending && state.holding) alpha = Math.max(alpha, 0.82);
        if (item.ghost) alpha *= 0.62;
        if (alpha <= 0.01) return;
        const approach = Math.max(0, Math.min(1, 1 - Math.abs(dt) / 0.6));
        // Round notes: the same gradient sprite as Ethereal Drum, drawn as a circle.
        const diameter = Math.max(30, Math.min(40, 32 * scale + 8)) * growth * (1 + approach * 0.06) * (item.ghost ? 0.72 : 1);
        const capsuleW = diameter * 1.15;
        const capsuleH = diameter * 0.85;

        // Approach ring: closes in on the pad during the last beat, like a vibration.
        if (dt >= 0 && dt < spb * 1.2 && !(isPending && state.holding)) {
          const k = dt / (spb * 1.2);
          ctx.save();
          ctx.globalAlpha = 0.42 * (1 - k * 0.5);
          ctx.strokeStyle = color;
          ctx.lineWidth = 1.4;
          ctx.shadowColor = color;
          ctx.shadowBlur = profile.particleShadows ? 12 : 6;
          ctx.beginPath();
          ctx.arc(target.x, target.y, target.reach * (1.02 + k * 1.4), 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();
        }

        if (noteIsMoving && particleCount) {
          const notePhase = particlePhase(item.id);
          const perpendicularX = -target.dy;
          const perpendicularY = target.dx;
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          ctx.shadowColor = `rgba(${r},${g},${b},.9)`;
          if (!profile.particleShadows) ctx.shadowBlur = 0;
          for (let particle = 0; particle < particleCount; particle += 1) {
            const template = PARTICLE_TEMPLATE[particle];
            const phaseSeed = (template.phase + notePhase) % 1;
            const flow = (template.streamIndex / 12 + particleClock * (0.55 + template.speed * 0.24) + phaseSeed * 0.08) % 1;
            const life = Math.sin(flow * Math.PI);
            const centreTailStretch = template.stream === 0 ? 1.38 : 1;
            const along = capsuleW * (0.25 + flow * 0.58) * centreTailStretch;
            const streamGap = capsuleH * (0.3 + flow * 0.2);
            const weave = Math.sin(particleClock * (1.7 + template.speed * 0.8) + phaseSeed * Math.PI * 2 + template.stream * 1.9) * capsuleH * 0.065;
            const jitter = (template.side - 0.5) * capsuleH * 0.16;
            const sideways = template.stream * streamGap + weave + jitter;
            const particleX = x + target.dx * along + perpendicularX * sideways;
            const particleY = y + target.dy * along + perpendicularY * sideways;
            const twinkle = 0.55 + 0.45 * Math.abs(Math.sin(particleClock * (2.8 + template.size * 3.2) + phaseSeed * Math.PI * 2));
            const particleSize = (0.55 + template.size * 1.5) * (0.6 + life * 0.65) * (0.72 + growth * 0.28);
            ctx.globalAlpha = alpha * (0.16 + life * 0.7) * twinkle;
            ctx.fillStyle = template.stream === 0 && template.streamIndex % 4 === 0
              ? `rgb(${highlight.r},${highlight.g},${highlight.b})`
              : `rgb(${light.r},${light.g},${light.b})`;
            if (profile.particleShadows) ctx.shadowBlur = 5 + life * 7;
            ctx.beginPath();
            ctx.arc(particleX, particleY, particleSize, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.restore();
        }

        // Impact ring as the note lands on its pad.
        if (noteIsMoving && Math.abs(dt) < 0.26) {
          const hit = 1 - Math.abs(dt) / 0.26;
          ctx.save();
          ctx.globalAlpha = hit * 0.55;
          ctx.strokeStyle = `rgb(${r},${g},${b})`;
          ctx.lineWidth = 2.4 * hit;
          ctx.beginPath();
          ctx.arc(target.x, target.y, Math.max(target.reach, (12 + (1 - hit) * 34) * scale), 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();
        }
        // While waiting, the target keeps pulsing.
        if (isPending && state.holding) {
          const phase = (nowMs % 900) / 900;
          ctx.save();
          ctx.globalAlpha = 0.6 * (1 - phase);
          ctx.strokeStyle = color;
          ctx.lineWidth = 1.5;
          ctx.shadowColor = color;
          ctx.shadowBlur = 10;
          ctx.beginPath();
          ctx.arc(target.x, target.y, target.reach * (1.05 + phase * 0.9), 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();
        }

        if (item.flam) {
          // The grace stroke of a flam: a small note just ahead of the main one.
          ctx.save();
          ctx.globalAlpha = alpha * 0.85;
          ctx.translate(x - target.dx * diameter * 0.78, y - target.dy * diameter * 0.78);
          drawCachedNoteSprite(ctx, cachedNoteSprite('round', color, diameter * 0.4, diameter * 0.4, 6));
          ctx.restore();
        }
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.translate(x, y);
        drawCachedNoteSprite(ctx, cachedNoteSprite('round', color, diameter, diameter, (10 + approach * 24) * Math.max(0.8, scale)));
        ctx.restore();
        ctx.save();
        ctx.globalAlpha = alpha;
        const label = pad.label;
        const labelSize = Math.max(13, Math.min(18, (14 + scale * 3) * growth));
        drawCachedNoteLabel(ctx, cachedNoteLabel(label, label.length > 1 ? labelSize * 0.85 : labelSize, renderColorData(color).ink), x, y);
        ctx.restore();
      });
    }
  }

  function laneGeometry() {
    const { w, h, phoneLanes, lanesTop, lanesBottom } = state.layout;
    const lanes = state.lanes;
    const laneW = w / Math.max(1, lanes.length);
    const centers = new Map();
    lanes.forEach((pad, i) => centers.set(pad.id, laneW * (i + 0.5)));
    const hitY = phoneLanes ? lanesBottom - 22 : h - 52;
    return { laneW, centers, top: lanesTop, hitY };
  }

  function drawLaneGuides(ctx, width, height, geometry) {
    const lanes = state.lanes.length;
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(255,255,255,.17)';
    ctx.beginPath();
    for (let index = 0; index <= lanes; index += 1) {
      ctx.moveTo(index * geometry.laneW, geometry.top);
      ctx.lineTo(index * geometry.laneW, geometry.hitY + 30);
    }
    ctx.stroke();
    state.lanes.forEach((pad, index) => {
      if (pad.kind === 'ding') ctx.fillStyle = 'rgba(196,181,253,.12)';
      else ctx.fillStyle = pad.hand === 'L' ? 'rgba(56,189,248,.095)' : 'rgba(251,191,36,.08)';
      ctx.fillRect(index * geometry.laneW, geometry.top, geometry.laneW, geometry.hitY - geometry.top);
    });
    ctx.strokeStyle = 'rgba(94,234,212,.7)';
    ctx.shadowColor = 'rgba(94,234,212,.5)';
    ctx.shadowBlur = 12;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, geometry.hitY);
    ctx.lineTo(width, geometry.hitY);
    ctx.stroke();
    ctx.shadowBlur = 0;
  }

  function laneGuideLayer(width, height) {
    const geometry = laneGeometry();
    const density = canvasDensity();
    const key = [width, height, state.lanes.map(p => p.id).join(','), geometry.hitY, density].join(':');
    if (state.laneGuideCanvas && state.laneGuideKey === key) return { canvas: state.laneGuideCanvas, fresh: false };
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(width * density));
    canvas.height = Math.max(1, Math.round(height * density));
    const guideCtx = canvas.getContext('2d');
    guideCtx.setTransform(density, 0, 0, density, 0, 0);
    drawLaneGuides(guideCtx, width, height, geometry);
    state.laneGuideCanvas = canvas;
    state.laneGuideKey = key;
    return { canvas, fresh: true };
  }

  function drawFallingNoteParticles(ctx, noteId, x, y, radius, noteHeight, color, alpha, particleCount, particleShadows, clock) {
    const { r, g, b, trail } = renderColorData(color);
    const notePhase = particlePhase(noteId);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.shadowColor = `rgba(${r},${g},${b},.9)`;
    if (!particleShadows) ctx.shadowBlur = 0;
    for (let particle = 0; particle < particleCount; particle += 1) {
      const template = PARTICLE_TEMPLATE[particle];
      const phaseSeed = (template.phase + notePhase) % 1;
      const flow = (template.streamIndex / 9 + clock * (0.58 + template.speed * 0.26) + phaseSeed * 0.08) % 1;
      const life = Math.sin(flow * Math.PI);
      const tailLength = noteHeight * (0.34 + flow * 2.35) * (template.stream === 0 ? 1.18 : 1);
      const spread = radius * (0.12 + flow * 0.42);
      const weave = Math.sin(clock * (2 + template.speed) + phaseSeed * Math.PI * 2) * radius * 0.1;
      const particleX = x + template.stream * spread + weave + (template.side - 0.5) * radius * 0.16;
      const particleY = y - tailLength;
      const twinkle = 0.55 + 0.45 * Math.abs(Math.sin(clock * (3 + template.size * 3) + phaseSeed * Math.PI * 2));
      const particleSize = (0.65 + template.size * 1.45) * (0.62 + life * 0.68);
      ctx.globalAlpha = alpha * (0.14 + life * 0.72) * twinkle;
      ctx.fillStyle = template.stream === 0 && template.streamIndex % 3 === 0 ? '#ffffff' : `rgb(${trail.r},${trail.g},${trail.b})`;
      if (particleShadows) ctx.shadowBlur = 5 + life * 7;
      ctx.beginPath();
      ctx.arc(particleX, particleY, particleSize, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function renderLaneFrame(ctx, width, height, profile, nowMs) {
    const geometry = laneGeometry();
    const { laneW, centers, top, hitY } = geometry;
    const preview = previewSeconds();
    const t = state.playing ? songNow() : state.songTime;
    const spb = state.parsed.spb;
    const travelPx = hitY - top;
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, top, width, height - top);
    ctx.clip();

    // faint bar lines
    ctx.save();
    ctx.font = '700 10px Inter, system-ui, sans-serif';
    ctx.textAlign = 'left';
    state.parsed.bars.forEach((barBeat, index) => {
      const dt = barBeat * spb - t;
      if (dt < 0 || dt > preview) return;
      const y = hitY - (dt / preview) * travelPx;
      ctx.strokeStyle = 'rgba(167,139,250,.13)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, y + 0.5);
      ctx.lineTo(width, y + 0.5);
      ctx.stroke();
      if (index < state.parsed.bars.length - 1 && y > top + 12) {
        ctx.fillStyle = 'rgba(167,139,250,.5)';
        ctx.fillText(String(index + 1), 4, y - 3);
      }
    });
    if (state.holding) {
      ctx.strokeStyle = 'rgba(251,191,36,.7)';
      ctx.shadowColor = 'rgba(251,191,36,.6)';
      ctx.shadowBlur = 14;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, hitY);
      ctx.lineTo(width, hitY);
      ctx.stroke();
    }
    ctx.restore();

    // lane labels on the hit line
    const labelR = Math.max(10, Math.min(laneW * 0.36, 17));
    state.lanes.forEach(pad => {
      const x = centers.get(pad.id);
      const flash = state.laneFlash.get(pad.id);
      const age = flash ? (nowMs - flash.at) / 420 : 1;
      ctx.save();
      ctx.beginPath();
      ctx.arc(x, hitY, labelR, 0, Math.PI * 2);
      if (flash && age < 1) {
        ctx.fillStyle = rgba(flash.color, 0.95 - age * 0.55);
        ctx.shadowColor = flash.color;
        ctx.shadowBlur = 18 * (1 - age);
      } else {
        ctx.fillStyle = pad.kind === 'perc' ? '#161c2c' : pad.kind === 'ding' ? '#2a2546' : '#1e2638';
      }
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = pad.kind === 'perc' ? 'rgba(226,232,240,.5)' : pad.hand === 'L' ? 'rgba(56,189,248,.6)' : pad.kind === 'ding' ? 'rgba(196,181,253,.6)' : 'rgba(251,191,36,.55)';
      if (pad.kind === 'perc') ctx.setLineDash([3, 3]);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = flash && age < 0.6 ? '#0b1020' : '#e8ecf6';
      // A second zone of a kind is told apart on its lane: T₂, S₂...
      const laneText = pad.mark || pad.label;
      ctx.font = `800 ${Math.round(labelR * (laneText.length > 1 ? 0.78 : 0.95))}px Inter, system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(laneText, x, hitY + 1);
      ctx.restore();
    });

    const events = state.parsed.events;
    const pending = state.mode === 'wait' ? events[nextPendingWaitIndex()] : null;
    const from = firstEventIndexAtOrAfter(t - 0.55);
    let to = from;
    while (to < events.length && events[to].time <= t + preview + 0.2) to += 1;
    const particleCount = particleCountWithinBudget(profile.fallingParticles, Math.max(1, to - from), profile);
    const particleClock = particleCount ? performance.now() / 1000 : 0;
    const noteIsMoving = state.playing && !state.holding;
    const started = state.playing || state.songTime > 0.001;
    for (let i = from; i < to; i += 1) {
      const event = events[i];
      const dt = event.time - t;
      if (!started && dt < 0.3) continue;
      const items = event.items.filter(item => !item.missing && centers.has(item.pad) && !isHitResult(state.results.get(item.id)));
      if (!items.length) continue;
      if (listening() && dt < -0.25) continue;
      const y = hitY - (dt / preview) * travelPx;
      const travel = Math.max(0, Math.min(1, 1 - dt / preview));
      const isPending = pending && pending.index === event.index;
      let alpha = (0.18 + 0.82 * smooth(travel / 0.22)) * (dt < -0.2 ? Math.max(0, 1 + dt * 2) : 1) * (dt > preview ? Math.max(0, 1 - (dt - preview) / 0.2) : 1);
      if (isPending && state.holding) alpha = 1;
      if (alpha <= 0.01) continue;
      const growth = 0.72 + Math.pow(travel, 0.72) * 0.48;
      const baseD = Math.max(26, Math.min(40, laneW * 0.78));
      const noteW = baseD * growth;
      const noteH = noteW;
      if (items.length > 1) {
        const xs = items.map(item => centers.get(item.pad));
        ctx.save();
        ctx.globalAlpha = alpha * 0.6;
        ctx.strokeStyle = 'rgba(226,232,240,.5)';
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(Math.min(...xs), y);
        ctx.lineTo(Math.max(...xs), y);
        ctx.stroke();
        ctx.restore();
      }
      items.forEach(item => {
        const x = centers.get(item.pad);
        const result = state.results.get(item.id);
        const color = result === 'miss' ? WRONG_COLOR : itemColor(item);
        // Ghost notes fall smaller and fainter; a flam has its grace stroke just below.
        const size = item.ghost ? noteW * 0.72 : noteW;
        const itemAlpha = item.ghost ? alpha * 0.62 : alpha;
        if (noteIsMoving && particleCount && !item.ghost) drawFallingNoteParticles(ctx, item.id, x, y, noteW / 2, noteH, color, alpha, particleCount, profile.particleShadows, particleClock);
        if (item.flam) {
          ctx.save();
          ctx.globalAlpha = itemAlpha * 0.85;
          ctx.translate(x, y + size * 0.78);
          drawCachedNoteSprite(ctx, cachedNoteSprite('round', color, size * 0.4, size * 0.4, 6));
          ctx.restore();
        }
        ctx.save();
        ctx.globalAlpha = itemAlpha;
        ctx.translate(x, y);
        drawCachedNoteSprite(ctx, cachedNoteSprite('round', color, size, size, Math.abs(dt) < 0.15 || (isPending && state.holding) ? 24 : 10));
        ctx.restore();
        if (isPending && state.holding) {
          const phase = (nowMs % 900) / 900;
          ctx.save();
          ctx.globalAlpha = 0.75 * (1 - phase);
          ctx.strokeStyle = color;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(x, y, noteW / 2 + 4 + phase * 8, 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();
        }
        ctx.save();
        ctx.globalAlpha = alpha;
        const label = state.padMap.get(item.pad).label;
        const labelSize = Math.max(13, Math.min(18, Math.max(width * 0.04, 15) * growth));
        drawCachedNoteLabel(ctx, cachedNoteLabel(label, label.length > 1 ? labelSize * 0.85 : labelSize, renderColorData(color).ink), x, y);
        ctx.restore();
      });
    }
    ctx.restore();
  }

  function drawEffects(nowMs) {
    const ctx = frontCtx;
    // Effects sit on the pad you played whenever the handpan is on the stage (also the phone
    // lanes layout); only the desktop lanes, without a stage drum, show them on the hit line.
    const lanes = state.view === 'lanes' && !state.layout.drum ? laneGeometry() : null;
    state.effects.forEach(effect => {
      let x;
      let y;
      let baseR;
      if (lanes) {
        x = lanes.centers.get(effect.padId);
        if (x == null) return;
        y = lanes.hitY;
        baseR = Math.max(10, Math.min(lanes.laneW * 0.36, 17));
      } else {
        const pad = state.padMap.get(effect.padId);
        if (!pad || !state.layout.drum) return;
        const p = padScreen(pad);
        x = p.x;
        y = p.y;
        baseR = Math.max(pad.rx, pad.ry) * state.layout.drum.drumSize / 2;
      }
      const age = (nowMs - effect.at) / 700;
      if (age >= 1) return;
      ctx.save();
      if (effect.type === 'burst') {
        ctx.globalCompositeOperation = 'lighter';
        ctx.beginPath();
        ctx.arc(x, y, baseR * (1 + age * 1.6), 0, Math.PI * 2);
        ctx.strokeStyle = rgba(effect.color, 0.85 * (1 - age));
        ctx.lineWidth = 3 * (1 - age) + 0.5;
        ctx.stroke();
        for (let k = 0; k < 8; k += 1) {
          const a = (k / 8) * Math.PI * 2 + effect.at * 0.001;
          const d = baseR * (1.1 + age * 2.2);
          ctx.fillStyle = rgba(effect.color, 0.8 * (1 - age));
          ctx.beginPath();
          ctx.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, 2.2 * (1 - age) + 0.4, 0, Math.PI * 2);
          ctx.fill();
        }
      } else if (effect.type === 'miss') {
        ctx.strokeStyle = rgba(WRONG_COLOR, 0.9 * (1 - age));
        ctx.lineWidth = 3;
        const s = Math.min(14, baseR * 0.6);
        ctx.beginPath();
        ctx.moveTo(x - s, y - s - age * 14);
        ctx.lineTo(x + s, y + s - age * 14);
        ctx.moveTo(x + s, y - s - age * 14);
        ctx.lineTo(x - s, y + s - age * 14);
        ctx.stroke();
      } else if (effect.type === 'text') {
        ctx.font = '800 12px Inter, system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = rgba(effect.color, 1 - age);
        ctx.fillText(effect.text, x, y - baseR - 10 - age * 22);
      }
      ctx.restore();
    });
  }

  /* ------------------------------------------------------------------ */
  /* Microphone and tuner                                                */
  /* ------------------------------------------------------------------ */

  const mic = { on: false, stream: null, source: null, analyser: null, data: null, prev: [], floor: 0.006, loud: false, last: 0, raf: 0, pending: 0, lastRms: 0 };

  function setMicStatus(message, stateName = '') {
    els.micStatus.textContent = message;
    els.micStatus.classList.remove('listening', 'heard', 'error');
    if (stateName) els.micStatus.classList.add(stateName);
  }

  function updateMicUI() {
    els.micBtn.classList.toggle('active', mic.on);
    els.micBtn.setAttribute('aria-pressed', String(mic.on));
    els.micBtn.innerHTML = `${MIC_ICON} Mic ${mic.on ? 'on' : 'off'}`;
    els.micChipBtn.innerHTML = `${MIC_ICON} Mic ${mic.on ? 'on' : 'off'}`;
    els.micChipBtn.classList.toggle('active', mic.on);
    els.micChipBtn.setAttribute('aria-pressed', String(mic.on));
    if (els.stageMicBtn) {
      els.stageMicBtn.lastElementChild.textContent = mic.on ? 'On' : 'Off';
      els.stageMicBtn.classList.toggle('active', mic.on);
      els.stageMicBtn.setAttribute('aria-pressed', String(mic.on));
    }
    if (typeof updateTransportUI === 'function' && els.dockPlayBtn) keepScreenOn(state.playing || state.focusMode || (state.mode === 'tuner' && mic.on));
    if (!mic.on) {
      setMicStatus(state.mode === 'tuner' ? 'Turn on the microphone to tune' : 'Use in Practice, Wait, or Tuner mode');
      if (state.mode === 'tuner') resetTunerDisplay();
    }
  }

  async function startMic() {
    if (!navigator.mediaDevices?.getUserMedia) {
      setMicStatus('Microphone unavailable', 'error');
      showToast('Microphone access is unavailable here. Open the app through the START launcher (localhost) or HTTPS in Chrome or Edge.', 'warning');
      return;
    }
    try {
      const context = await ensureAudio();
      if (!context) throw new Error('No audio');
      mic.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }, video: false });
      mic.source = context.createMediaStreamSource(mic.stream);
      mic.analyser = context.createAnalyser();
      mic.analyser.fftSize = 4096;
      mic.analyser.smoothingTimeConstant = 0.12;
      mic.source.connect(mic.analyser);
      mic.data = new Float32Array(mic.analyser.fftSize);
      mic.prev = [];
      mic.floor = 0.006;
      mic.minThreshold = COMMON.micThreshold(MIC_CHECK_KEY, 0.014);
      mic.on = true;
      updateMicUI();
      setMicStatus(state.mode === 'tuner' ? 'Tuner listening… strike one note' : 'Listening… play your handpan', 'listening');
      if (state.mode === 'tuner') resetTunerDisplay('Listening for a clear pitch');
      cancelAnimationFrame(mic.raf);
      mic.raf = requestAnimationFrame(micLoop);
      showToast('Microphone enabled. Strike one note at a time.', 'success');
    } catch (error) {
      mic.on = false;
      updateMicUI();
      const denied = error?.name === 'NotAllowedError' || error?.name === 'SecurityError';
      setMicStatus(denied ? 'Permission denied' : 'Could not start microphone', 'error');
      showToast(denied ? 'Microphone permission was denied. Allow microphone access in the browser and try again.' : 'The microphone could not be started. Check that another app is not using it.', 'warning');
    }
  }

  function stopMic() {
    cancelAnimationFrame(mic.raf);
    clearTimeout(mic.pending);
    state.tunerToken += 1;
    mic.stream?.getTracks().forEach(track => track.stop());
    try { mic.source?.disconnect(); } catch (error) { /* ignored */ }
    mic.on = false;
    mic.stream = null;
    mic.source = null;
    mic.analyser = null;
    updateMicUI();
  }

  async function toggleMic() {
    mic.autoByTuner = false;
    if (mic.on) {
      stopMic();
      showToast('Microphone turned off.', 'success');
      return;
    }
    await startMic();
  }

  function micLoop(now) {
    if (!mic.on || !mic.analyser) return;
    mic.analyser.getFloatTimeDomainData(mic.data);
    // Onset detection looks only at the newest ~1024 samples, so a strike is seen quickly.
    let recent = 0;
    for (let i = mic.data.length - 1024; i < mic.data.length; i += 1) recent += mic.data[i] * mic.data[i];
    const rms = Math.sqrt(recent / 1024);
    mic.prev.push(Float32Array.from(mic.data));
    if (mic.prev.length > 5) mic.prev.shift();
    if (rms < mic.floor * 2) mic.floor = mic.floor * 0.98 + rms * 0.02;
    const threshold = Math.max(mic.minThreshold ?? 0.014, mic.floor * 3.2);
    // Compare with the quietest of the last few frames, so an attack that is split
    // across two animation frames, or lands on a still-ringing note, is still caught.
    mic.history = (mic.history || []).concat(rms).slice(-7);
    const recentMin = Math.min(...mic.history.slice(0, -1), Infinity);
    const rising = rms > threshold && rms > Math.min(recentMin, mic.lastRms || recentMin) * 1.6;
    if ((rising || (rms > threshold && !mic.loud)) && now - mic.last > 110) {
      mic.loud = true;
      mic.last = now;
      const before = mic.prev.length > 2 ? mic.prev[mic.prev.length - 3] : null;
      clearTimeout(mic.pending);
      mic.pending = setTimeout(() => analyseStrike(before), 70);
    } else if (rms < threshold * 0.6) {
      mic.loud = false;
    }
    mic.lastRms = rms;
    mic.raf = requestAnimationFrame(micLoop);
  }

  function goertzel(samples, sampleRate, frequency) {
    const omega = 2 * Math.PI * frequency / sampleRate;
    const coeff = 2 * Math.cos(omega);
    let q1 = 0; let q2 = 0;
    const length = samples.length;
    for (let i = 0; i < length; i += 1) {
      const w = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (length - 1));
      const q0 = coeff * q1 - q2 + samples[i] * w;
      q2 = q1;
      q1 = q0;
    }
    return Math.max(0, q1 * q1 + q2 * q2 - coeff * q1 * q2) / (length * length);
  }

  // Fresh (new since the strike) energy at each note's fundamental, octave and twelfth.
  // Handpan partials are tuned, so the harmonic sum separates neighbours like A3 / Bb3.
  function tonalEnergies(after, before, sampleRate) {
    const nyquist = sampleRate / 2 - 100;
    const fresh = f => {
      if (f > nyquist) return 0;
      const now = goertzel(after, sampleRate, f);
      const prev = before ? goertzel(before, sampleRate, f) : 0;
      return Math.max(0, now - prev * 0.85);
    };
    return state.pads.filter(p => p.kind !== 'perc').map(pad => {
      const f = frequencyForMidi(pad.midi);
      const f1 = fresh(f);
      return { pad, f, fund: f1, sum: f1 + fresh(f * 2) * 0.8 + fresh(f * 3) * 0.5 };
    });
  }

  function isPartialOfLower(entry, energies) {
    return energies.some(other => {
      if (other === entry || other.f >= entry.f) return false;
      const ratio = entry.f / other.f;
      return (Math.abs(ratio - 2) < 0.03 || Math.abs(ratio - 3) < 0.045) && other.fund > entry.fund * 0.22;
    });
  }

  // Pure decision: which pad does this strike most likely belong to, given what we expect?
  function chooseFromStrike(after, before, sampleRate, expected) {
    const energies = tonalEnergies(after, before, sampleRate);
    energies.forEach(entry => { entry.score = isPartialOfLower(entry, energies) ? entry.sum * 0.3 : entry.sum; });
    const ranked = energies.slice().sort((a, b) => b.score - a.score);
    const best = ranked[0];
    const total = energies.reduce((sum, e) => sum + e.score, 0);
    const clarity = best && total > 0 ? best.score / total : 0;
    const strongest = Math.max(1e-12, ...energies.map(e => e.score));
    const maxFund = Math.max(1e-12, ...energies.map(e => e.fund));
    const tonalExpected = expected.filter(item => state.padMap.get(item.pad)?.kind !== 'perc');
    const percExpected = expected.filter(item => state.padMap.get(item.pad)?.kind === 'perc');
    for (const item of tonalExpected) {
      const entry = energies.find(e => e.pad.id === item.pad);
      if (!entry) continue;
      const lowerOctaveHeard = isPartialOfLower(entry, energies) && !tonalExpected.some(other => other !== item && (energies.find(e => e.pad.id === other.pad)?.f || Infinity) < entry.f);
      const ownFundamental = entry.fund >= maxFund * 0.12;
      if (!lowerOctaveHeard && ownFundamental && (entry === best || entry.score >= strongest * 0.4)) return item.pad;
    }
    if (percExpected.length && (clarity < 0.55 || !tonalExpected.length)) return percExpected[0].pad;
    if (best && clarity >= 0.3 && best.score > 1e-10) return best.pad.id;
    return null;
  }

  function expectedItemsNow() {
    if (!state.parsed) return [];
    if (state.mode === 'wait') {
      const pending = state.parsed.events[nextPendingWaitIndex()];
      return pending ? pending.items.filter(item => !item.missing && !state.results.has(item.id)) : [];
    }
    const t = songNow();
    const window = goodWindow();
    const items = [];
    for (let i = firstEventIndexAtOrAfter(t - window); i < state.parsed.events.length; i += 1) {
      const event = state.parsed.events[i];
      if (event.time > t + window) break;
      event.items.forEach(item => { if (!item.missing && !state.results.has(item.id)) items.push(item); });
    }
    return items;
  }

  function analyseStrike(before) {
    if (!mic.on || !mic.analyser) return;
    mic.analyser.getFloatTimeDomainData(mic.data);
    const sampleRate = audio.ctx.sampleRate;
    if (state.mode === 'tuner') {
      tunerStrike(Float32Array.from(mic.data), before, sampleRate);
      return;
    }
    if (state.mode === 'listen') return;
    if (performance.now() < (mic.echoUntil || 0)) return;
    if (!state.playing) {
      setMicStatus('Heard you · press Play to start', 'heard');
      return;
    }
    const expected = expectedItemsNow();
    const chosen = chooseFromStrike(mic.data, before, sampleRate, expected);
    if (!chosen) {
      setMicStatus('Strike heard · pitch unclear', 'error');
      return;
    }
    // A handpan note rings for seconds and its swell can sound like a second strike.
    // The same note again within ~1.3 s only counts when the song asks for it.
    const heardAt = performance.now();
    if (chosen === mic.lastPad && heardAt - (mic.lastAt || 0) < 1300 && !expected.some(item => item.pad === chosen)) return;
    mic.lastPad = chosen;
    mic.lastAt = heardAt;
    const pad = state.padMap.get(chosen);
    setMicStatus(`Heard ${pad.kind === 'perc' ? pad.name : `${pad.label} · ${pad.name}`}`, 'heard');
    userHit(chosen, 'mic');
  }

  // Cents from the target pitch: scan ±80 cents of the fundamental in 2-cent steps and
  // interpolate the peak. Looking only near the expected note keeps the strong handpan
  // octave from being mistaken for the note.
  function measureCents(samples, sampleRate, f0) {
    const powers = [];
    let bestIndex = 0;
    for (let c = -80, i = 0; c <= 80; c += 2, i += 1) {
      const power = goertzel(samples, sampleRate, f0 * Math.pow(2, c / 1200));
      powers.push(power);
      if (power > powers[bestIndex]) bestIndex = i;
    }
    if (bestIndex === 0 || bestIndex === powers.length - 1) return null;
    let energy = 0;
    for (let i = 0; i < samples.length; i += 1) energy += samples[i] * samples[i];
    energy /= samples.length;
    if (powers[bestIndex] < energy * 0.012) return null;
    const a = powers[bestIndex - 1];
    const b = powers[bestIndex];
    const c = powers[bestIndex + 1];
    const denom = a - 2 * b + c;
    const shift = denom ? 0.5 * (a - c) / denom : 0;
    return -80 + (bestIndex + Math.max(-1, Math.min(1, shift))) * 2;
  }

  function tunerStrike(samples, before, sampleRate) {
    const chosen = chooseFromStrike(samples, before, sampleRate, []);
    const pad = chosen ? state.padMap.get(chosen) : null;
    if (!pad || pad.kind === 'perc') {
      setMicStatus('Strike heard · pitch unclear', 'error');
      resetTunerDisplay('Pitch unclear. Try one firm strike.');
      return;
    }
    flashPad(pad.id, MIC_HEARD_COLOR, 900);
    addEffect('burst', pad.id, MIC_HEARD_COLOR);
    setMicStatus(`Heard ${pad.label} · ${pad.name}`, 'heard');
    const token = (state.tunerToken += 1);
    const readings = [];
    const f0 = frequencyForMidi(pad.midi);
    const measure = data => {
      if (token !== state.tunerToken) return;
      const cents = measureCents(data, sampleRate, f0);
      if (cents !== null) readings.push(cents);
      updateTunerDisplay(pad, readings);
    };
    measure(samples);
    // The note keeps ringing, so take a few more readings and show the median.
    [120, 260, 420, 650].forEach(delay => setTimeout(() => {
      if (token !== state.tunerToken || !mic.analyser) return;
      mic.analyser.getFloatTimeDomainData(mic.data);
      measure(mic.data);
    }, delay));
  }

  function resetTunerDisplay(message = 'Turn on the microphone to begin') {
    els.tunerPanel.dataset.tone = 'neutral';
    els.tunerLabel.textContent = '...';
    els.tunerNoteName.textContent = mic.on ? 'Strike a note' : 'Microphone off';
    els.tunerCents.textContent = message;
    els.tunerHz.textContent = 'In tune';
    els.tunerNeedle.style.left = '50%';
    els.tunerMeter.setAttribute('aria-valuenow', '0');
  }

  function updateTunerDisplay(pad, readings) {
    els.tunerLabel.textContent = pad.label;
    els.tunerNoteName.textContent = pad.kind === 'ding' ? `Ding ${pad.name}` : pad.name;
    if (!readings.length) {
      els.tunerPanel.dataset.tone = 'neutral';
      els.tunerCents.textContent = 'Pitch unstable. Let the note ring.';
      els.tunerNeedle.style.left = '50%';
      return;
    }
    const sorted = readings.slice().sort((a, b) => a - b);
    const cents = sorted[Math.floor(sorted.length / 2)];
    const rounded = Math.round(cents);
    const inTune = Math.abs(rounded) <= 8;
    const tone = inTune ? 'in-tune' : rounded < 0 ? 'flat' : 'sharp';
    const direction = inTune ? 'in tune' : rounded < 0 ? 'flat' : 'sharp';
    els.tunerPanel.dataset.tone = tone;
    els.tunerCents.textContent = `${rounded > 0 ? '+' : ''}${rounded} cents, ${direction}`;
    els.tunerHz.textContent = `${(frequencyForMidi(pad.midi) * Math.pow(2, cents / 1200)).toFixed(1)} Hz`;
    els.tunerNeedle.style.left = `${50 + Math.max(-50, Math.min(50, rounded))}%`;
    els.tunerMeter.setAttribute('aria-valuenow', String(rounded));
  }

  /* ------------------------------------------------------------------ */
  /* Results                                                             */
  /* ------------------------------------------------------------------ */


  /* Smart loop for mistakes: the trickiest bar, slower first, faster with every clean pass. */
  var SMART = COMMON.createSmartLoop({
    setSpeed: value => setSpeed(value, false),
    toast: message => showToast(message, 'success'),
    chime: () => playChime(),
    onMastered: speed => {
      state.abLoop = false;
      pausePlayback();
      updateABLoopUI();
      updateTransportUI();
      showToast(`Smart loop done: clean at ${COMMON.speedLabel(speed)}! Now play the whole song.`, 'success');
    }
  });

  function smartLoopPass() {
    if (state.mode !== 'practice' || !state.abLoop || state.loopA == null || state.loopB == null) { SMART.stop(); return null; }
    let total = 0;
    let hits = 0;
    state.parsed.events.forEach(event => {
      if (event.time < state.loopA - 1e-6 || event.time >= state.loopB - 1e-6) return;
      event.items.forEach(item => {
        if (item.missing) return;
        total += 1;
        if (isHitResult(state.results.get(item.id))) hits += 1;
      });
    });
    if (finishWorkoutSection({ id: state.song.id, from: state.loopA, to: state.loopB, total, hits })) return 'done';
    return SMART.pass(total, hits);
  }

  function startSmartLoop() {
    const parsed = state.parsed;
    if (!parsed) return;
    const missTimes = [];
    state.results.forEach((value, id) => {
      if (value !== 'miss') return;
      const event = parsed.events[Number(id.split(':')[0])];
      if (event) missTimes.push(event.time);
    });
    const totalBeats = parsed.duration / parsed.spb;
    const barBeats = parsed.bars.length > 1
      ? parsed.bars
      : Array.from({ length: Math.ceil(totalBeats / parsed.beatsPerBar) }, (_, index) => index * parsed.beatsPerBar);
    const section = COMMON.worstSection(missTimes, barBeats.map(beat => beat * parsed.spb), parsed.duration);
    if (!section) { showToast('No mistakes to practise. Lovely!', 'success'); return; }
    closeDialog(els.resultDialog);
    const target = state.speed;
    if (state.mode !== 'practice') setMode('practice');
    state.loop = false;
    state.loopA = section.from;
    state.loopB = Math.min(parsed.duration, section.to);
    state.abLoop = true;
    updateABLoopUI();
    resetRun(0);
    SMART.start(COMMON.smartLoopSpeeds(target), section.firstBar === section.lastBar ? `bar ${section.firstBar}` : `bars ${section.firstBar}-${section.lastBar}`);
    startPlayback();
  }


  /* ---------- Daily goal, song path, rhythm drills, takes, cloud saves ---------- */
  var PRACTICE = COMMON.createPracticeLog({
    storageKey: 'ethereal-handpan-practice-v1',
    isActive: () => state.playing && state.mode !== 'tuner',
    onGoal: streak => {
      playChime();
      showToast(`Daily goal reached! ${streak} ${streak === 1 ? 'day' : 'days'} in a row.`, 'success');
    }
  });
  PROGRESS_KEYS.practice = 'ethereal-handpan-practice-v1';

  var CLOUD = COMMON.createCloud({
    app: 'ethereal-handpan',
    appName: 'Ethereal Handpan',
    keys: PROGRESS_KEYS,
    stats: () => ({ ...COMMON.progressStats(PROGRESS_KEYS, PRACTICE), ...COMMON.progressReadable({ keys: PROGRESS_KEYS, titleOf: id => (id === DRILL_ID ? 'Rhythm drill' : findSong(id)?.title || ''), journey: JOURNEY }) }),
    onMerged: () => { BEST.reload(); JOURNEY.reload(); GAME.reload(); PRACTICE.reload(); renderSongList(); },
    toast: message => showToast(message, 'success')
  });
  BEST.onChange = () => CLOUD.changed();
  PRACTICE.onUpdate(() => CLOUD.changed());

  var REC = COMMON.createTakeRecorder({
    getContext: () => audio.ctx,
    getOutput: () => audio.master,
    getMicStream: () => mic.stream,
    ensureMic: async () => { if (!(mic.on)) await startMic(); return Boolean(mic.on); },
    isPlaying: () => state.playing && state.mode !== 'tuner',
    onTake: take => {
      els.resultTake.innerHTML = COMMON.takeHtml(take, state.song?.title);
      els.resultTake.hidden = false;
      if (!els.resultDialog.open) showToast('Your take is ready: tap ▶ Take to listen.', 'success');
    }
  });

  function openDrillsDialog() {
    COACH.open();
  }

  function progressFileSave() {
    COMMON.exportProgress({ app: 'ethereal-handpan', keys: PROGRESS_KEYS, fileName: 'ethereal-handpan-progress' });
    showToast('Progress saved to a file. Load it on your other device.', 'success');
  }

  function clearLocalProgress() {
    Object.values(PROGRESS_KEYS).forEach(key => { try { localStorage.removeItem(key); } catch {} });
    BEST.reload();
    JOURNEY.reload();
    GAME.reload();
    COACH.clear();
    PRACTICE.reload();
    renderSongList();
  }

  const DRILL_ID = 'my-rhythm-drill';

  // A drill in handpan notation: the ding, hands taking turns.
  function drillSequence(bars) {
    let hand = 'R';
    const length = d => (Math.abs(d - 1) < 1e-6 ? '' : Math.abs(d - 1 / 3) < 1e-3 ? ':1/3' : `:${Number(d.toFixed(3))}`);
    return bars.map(events => events.map(event => {
      if (event.rest) return `-${length(event.d)}`;
      hand = hand === 'R' ? 'L' : 'R';
      return `D${hand}${length(event.d)}`;
    }).join(' ')).join(' | ');
  }

  function loadDrill(drill) {
    const song = normaliseSong({ id: DRILL_ID, title: drill.title || 'Guided practice', about: drill.about || 'Build a musical skill', bpm: drill.bpm, beatsPerBar: drill.beatsPerBar || 4, sequence: drill.sequence || drillSequence(drill.bars) }, 'mine');
    if (!song) return;
    const index = state.mySongs.findIndex(item => item.id === DRILL_ID);
    if (index >= 0) state.mySongs[index] = song; else state.mySongs.push(song);
    saveMySongs();
    setSidebar(false);
    closeDialog(els.resultDialog);
    selectSong(DRILL_ID);
    state.waitPref = false;
    setMode('practice');
    renderSongList();
    COACH?.showBanner();
    showToast(drill.about || 'Listen first, then practise the complete phrase.', 'success');
  }


  /* ---------- Reach the stars: the song journey ---------- */
  const S_ = (id, title, level) => ({ type: 'song', id, title, level });
  const D_ = (level, bpm, bars = 2) => ({ type: 'drill', level, bpm, bars, title: 'Song preparation', levelName: ['', 'Beginner', 'Steady', 'Advanced'][level] });
  // The final trial of a path: a song at a given speed with a number of stars, and a prize.
  const B_ = (id, title, level, stars, reward, rewardName, speed = 1) => ({ type: 'boss', id, title, level, stars, reward, rewardName, speed });
  const JOURNEY_PATHS = [
    { id: 'p1', name: 'First Light', nodes: [S_('demo-easy-first-steps', 'First steps', 'easy'), S_('demo-mary-had-a-little-lamb', 'Mary Had a Little Lamb', 'easy'), D_(1, 70), S_('demo-jingle-bells', 'Jingle Bells', 'easy'), D_(1, 80), S_('demo-kurd-warm-up', 'Kurd scale warm-up', 'medium'), B_('demo-jingle-bells', 'Jingle Bells', 'easy', 3, 'silver', 'Silver drum')] },
    { id: 'p2', name: 'Moonrise', nodes: [S_('demo-interstellar', 'Interstellar', 'medium'), D_(2, 70), S_('demo-minecraft', 'Minecraft Menu', 'medium'), S_('demo-beethoven-5-fate', 'Symphony No. 5 · Fate motif', 'medium'), D_(2, 80), S_('demo-groove-d-t-k-s', 'Space Tribal', 'medium'), B_('demo-interstellar', 'Interstellar', 'medium', 3, 'gold', 'Gold drum')] },
    { id: 'p3', name: 'Reach the Stars', nodes: [D_(2, 90), S_('demo-groove-3-heartbeat', 'Heartbeat groove', 'hard'), D_(3, 70), S_('demo-carol-of-the-bells', 'Carol of the Bells', 'hard'), D_(3, 80, 4), B_('demo-carol-of-the-bells', 'Carol of the Bells', 'hard', 4, 'obsidian', 'Obsidian & gold drum')] }
  ];
  var JOURNEY = COMMON.createJourney({ app: 'ethereal-handpan', paths: JOURNEY_PATHS, best: BEST });
  PROGRESS_KEYS.journey = JOURNEY.key;
  var GAME = COMMON.createGame({ app: 'ethereal-handpan', keys: PROGRESS_KEYS, best: BEST, journey: JOURNEY, drillId: DRILL_ID,
    titleOf: id => (id === DRILL_ID ? 'Rhythm drill' : findSong(id)?.title || ''),
    levelOf: id => { const song = findSong(id); return song ? songDifficulty(parseSong(song)).level : 'easy'; },
    practice: PRACTICE, songInfo: id => { const song = findSong(id); if (!song) return null; const parsed = parseSong(song); return { duration: parsed.duration, barSeconds: parsed.spb * parsed.beatsPerBar }; } });
  PROGRESS_KEYS.game = GAME.key;
  var COACH = window.EtherealLessons.create({
    app: 'ethereal-handpan', tongue: false,
    source: () => { const selected = state.song; if(selected && selected.id !== DRILL_ID) return selected; const next = JOURNEY.current(); return next?.id ? findSong(next.id) : JOURNEY.nodes.filter(n => n.type === 'song' && JOURNEY.isSongOpen(n.id)).map(n => findSong(n.id)).find(Boolean); },
    canPlay: id => JOURNEY.isSongOpen(id),
    onStart: drill => { JOURNEY.activeDrill = null; loadDrill(drill); },
    onSong: id => { closeDialog(els.resultDialog); selectSong(id); setMode('practice'); },
    onLayout: () => requestAnimationFrame(() => { fitPhoneStage(); resizeCanvas(); }),
    onPractice: () => { stopPlayback(true); setMode('practice'); togglePlayback().catch(() => showToast('Could not start audio.', 'warning')); },
    onListen: () => { stopPlayback(true); setMode('listen'); togglePlayback().catch(() => showToast('Could not start audio.', 'warning')); }
  });
  PROGRESS_KEYS.lessons = COACH.key;

  GAME.applyLook();
  GAME.onChange(() => CLOUD.changed());
  PRACTICE.onUpdate(() => GAME.refresh());
  GAME.attachCombo({ chips: [els.streakPill, els.mobileStreakPill], stage: els.noteStage });

  function openHubDialog(tab) {
    setSidebar(false);
    COMMON.openHub({ game: GAME, tab, onWorkout: playWorkoutStep, toast: message => showToast(message, 'success') });
  }

  // A step of today's workout: a drill, or a song to open (you choose how to play it).
  function playWorkoutStep(step) {
    if (step.kind === 'drill') {
      if(step.nodeKey) { const node = JOURNEY.nodes.find(n => n.key === step.nodeKey); if(node) { playJourneyNode(node); GAME.beginWorkout(step); return; } }
      COACH.clear();
      loadDrill({...window.EtherealLessons.exercise(['pulse','hands','332'][(step.level || 1)-1],0,false),bpm:step.bpm || 60});
      JOURNEY.activeDrill = step.nodeKey || null;
      GAME.beginWorkout(step);
      setMode('practice');
      return;
    }
    if (!JOURNEY.isSongOpen(step.id)) { showToast('That song is still locked. Reach it on the Song path.', 'warning'); return; }
    const node = JOURNEY.current();
    if (node && node.type === 'boss' && node.id === step.id) { GAME.beginWorkout(step); playJourneyNode(node); return; }
    JOURNEY.activeDrill = null;
    selectSong(step.id);
    GAME.beginWorkout(step);
    if (step.section) { startWorkoutSection(step); return; }
    COMMON.nudge(document.querySelector('.mode-segmented'));
    showToast('Choose Listen or Practice, then press Play.', 'success');
  }

  // The results: XP from this run, a level up, badges, challenges and prizes.
  function showGameResult(summary) {
    let box = document.getElementById('resultGame');
    if (!box) {
      box = document.createElement('div');
      box.id = 'resultGame';
      box.className = 'result-game';
      els.resultBest.after(box);
    }
    box.innerHTML = summary ? COMMON.gameResultHtml(summary) : '';
    box.hidden = !summary;
    if (summary) COMMON.bindGameResult(box, GAME);
  }

  function bossTrialStart(node) {
    JOURNEY.activeDrill = null;
    selectSong(node.id);
    state.waitPref = false;
    setMode('practice');
    setSpeed(node.speed);
    state.loop = false;
    state.abLoop = false;
    resetRun(0);
    updateABLoopUI(); updateTransportUI();
    document.querySelectorAll('#playBtn, #dockPlayBtn').forEach(button => COMMON.nudge(button));
    showToast(`Final trial: play it at ${COMMON.speedLabel(node.speed)} in Practice and earn ${'★'.repeat(node.stars)}. Press Play when you are ready.`, 'success');
  }

  let journeyMark = JOURNEY.current()?.key || '';

  // A drill played from the journey counts for its node; a new node opening is news.
  BEST.onRecorded = (id, run) => {
    if (id === DRILL_ID) JOURNEY.recordDrill(COMMON.starsFor(run.accuracy, run.speed));
    const now = JOURNEY.current();
    if (now && now.key !== journeyMark) {
      journeyMark = now.key;
      renderSongList();
      setTimeout(() => showToast(`✨ New on your journey: ${now.title}`, 'success'), 1200);
    }
  };

  function playJourneyNode(node) {
    setSidebar(false);
    if (node.type === 'boss') { bossTrialStart(node); return; }
    if (node.type === 'drill') {
      const target = JOURNEY.nodes.slice(node.g + 1).find(item => item.id);
      const targetSong = target ? findSong(target.id) : null;
      if(targetSong) COACH.begin('song',0,targetSong);
      else { COACH.clear(); loadDrill(window.EtherealLessons.exercise(['pulse','hands','332'][(node.level || 1)-1],1,false)); }
      JOURNEY.activeDrill = node.key;
      return;
    }
    JOURNEY.activeDrill = null;
    selectSong(node.id);
    // You choose how to play it: Listen or Practice, then Play.
    
    COMMON.nudge(document.querySelector('.mode-segmented'));
    showToast('Choose Listen or Practice, then press Play.', 'success');
  }

  function startJourneyOver() {
    [PROGRESS_KEYS.best, PROGRESS_KEYS.history, PROGRESS_KEYS.journey].forEach(key => { try { localStorage.removeItem(key); } catch {} });
    BEST.reload();
    JOURNEY.reload();
    journeyMark = JOURNEY.current()?.key || '';
    // Starting over locks everything again, also for the admin.
    JOURNEY.adminOff();
    selectSong(JOURNEY.fallbackSong());
    renderSongList();
    // A cloud save starts fresh under a new code; the old one is marked as replaced.
    if (CLOUD.connected) CLOUD.restart().then(code => { if (code) showToast(`Started over. Your new cloud code is ${code}.`, 'success'); }).catch(() => {});
  }

  function openSongPathDialog() {
    JOURNEY.nodes.forEach(node => {
      if(node.type !== 'drill') return;
      const target = JOURNEY.nodes.slice(node.g+1).find(next => next.id);
      const source = target ? findSong(target.id) : null;
      if(source) { node.title = `Prepare · ${target.title}`; node.levelName = 'Guided phrases'; node.bpm = Math.max(35,Math.round((source.bpm || 80)*.55)); }
    });
    JOURNEY.nodes.forEach(node => {
      if (node.type !== 'song' && node.type !== 'boss') return;
      const song = findSong(node.id);
      if (song) { node.title = song.title; node.level = songDifficulty(parseSong(song)).level; }
    });
    COMMON.openJourney({ journey: JOURNEY, onPlay: playJourneyNode, onStartOver: startJourneyOver, toast: message => showToast(message, 'success') });
  }

  // The journey's locked songs, as one row under the demo songs.
  function addJourneyLockedRow(ids, query) {
    if (query) return;
    const count = JOURNEY.lockedSongCount(ids);
    const group = els.songList.querySelector('.demo-collection');
    if (count && group) group.appendChild(COMMON.journeyLockedRow({ count, onOpen: () => { setSidebar(false); openSongPathDialog(); } }));
  }

  /* Send the song as a link; a link that opens the app adds its song. */
  async function shareSong() {
    const song = state.song;
    if (!song) return;
    const chooser = document.getElementById('editChoiceDialog');
    if (chooser?.open) chooser.close();
    const doc = { format: SONG_FORMAT, song: { title: song.title, artist: song.artist || undefined, bpm: song.bpm, beatsPerBar: song.beatsPerBar, scale: 'D Kurd', sequence: song.sequence, zones: song.zones } };
    const how = await COMMON.shareSongLink({ doc, title: song.title, appName: 'Ethereal Handpan' });
    if (how === 'copied') showToast('Link copied. Paste it in a message to a friend.', 'success');
  }

  async function importSharedSong() {
    const doc = await COMMON.readSharedSong();
    if (!doc) return;
    const raw = doc.song || doc;
    if (doc.broken || !raw?.title) { showToast('That song link is broken or incomplete.', 'warning'); return; }
    const same = state.mySongs.find(song => song.title === raw.title && song.sequence === raw.sequence);
    if (same) { selectSong(same.id); showToast(`“${same.title}” is already in My songs.`, 'success'); return; }
    await importSongFile(new File([JSON.stringify(doc)], 'shared.handsong', { type: 'application/json' }));
  }

  function weakestBar() {
    const parsed = state.parsed;
    if (!parsed) return null;
    const times = [];
    state.results.forEach((value, id) => { if (value === 'miss' || value === 'good') { const event = parsed.events[Number(id.split(':')[0])]; if (event) times.push(event.time); } });
    const length = parsed.spb * parsed.beatsPerBar;
    const bars = Array.from({ length: Math.ceil(parsed.duration / length) }, (_, i) => i * length);
    const section = COMMON.worstSection(times, bars, parsed.duration);
    return section ? { from: section.from, to: section.to, bar: section.firstBar } : null;
  }

  function startWorkoutSection(step) {
    state.waitPref = false;
    setMode('practice');
    resetRun(0);
    state.loop = false;
    state.loopA = step.section.from;
    state.loopB = step.section.to;
    state.abLoop = true;
    updateABLoopUI();
    GAME.beginWorkout(step);
    GAME.invalidateRun();
    SMART.start([.75], `workout · bar ${step.section.bar}`);
    showToast('Play this section with at least 75% of the notes. Your workout step will complete automatically.', 'success');
    startPlayback();
  }

  function finishWorkoutSection(pass) {
    const news = GAME?.sectionPass(pass) || [];
    if (!news.length) return false;
    SMART.stop(); state.abLoop = false; pausePlayback(); updateABLoopUI();
    showToast(news.map(item => item.text + (item.xp ? ` +${item.xp} XP` : '')).join(' · '), 'success');
    return true;
  }

  function showResults({ silent = false } = {}) {
    const parsed = state.parsed;
    let perfect = 0; let good = 0; let miss = 0; let hit = 0;
    const missedPads = new Map();
    state.results.forEach((value, id) => {
      if (value === 'perfect') perfect += 1;
      else if (value === 'good') good += 1;
      else if (value === 'hit') hit += 1;
      else if (value === 'miss') {
        miss += 1;
        const [eventIndex, itemIndex] = id.split(':').map(Number);
        const item = parsed.events[eventIndex]?.items[itemIndex];
        if (item) {
          const label = state.padMap.get(item.pad)?.label || item.pad;
          missedPads.set(label, (missedPads.get(label) || 0) + 1);
        }
      }
    });
    const total = parsed.itemCount;
    let accuracy;
    let hits;
    if (state.mode === 'wait') {
      hits = hit;
      accuracy = hit + state.wrong ? Math.round((hit / (hit + state.wrong)) * 100) : 0;
    } else {
      hits = perfect + good;
      const judged = perfect + good + miss;
      accuracy = judged + state.wrong ? Math.round(((perfect + good * 0.7) / (judged + state.wrong * 0.5)) * 100) : 0;
    }
    els.resultTitle.textContent = `${state.song.title} complete`;
    els.resultSummary.textContent = accuracy >= 90 ? 'Beautiful, clean playing.' : accuracy >= 70 ? 'Nice work. A few strokes to polish.' : 'Good practice. Slow it down a little and go again.';
    els.resultHitValue.textContent = `${Math.min(hits, total)}/${total}`;
    els.resultAccuracyValue.textContent = `${accuracy}%`;
    els.resultStreakValue.textContent = String(state.bestStreak);
    const missedText = [...missedPads.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([label, count]) => `${label}${count > 1 ? ` ×${count}` : ''}`).join(' · ');
    els.resultMistakes.textContent = state.mode === 'wait'
      ? `${state.wrong} wrong ${state.wrong === 1 ? 'stroke' : 'strokes'} · ${formatTime((performance.now() - state.runStartedAt) / 1000)} at ${formatSpeed(state.speed)}×`
      : missedText ? `Missed most often: ${missedText}. Smart loop practises the trickiest bar for you.` : `Perfect ${perfect} · Good ${good} · Wrong ${state.wrong}`;
    const prevBest = BEST.get(state.song.id);
    const runSpeed = GAME.runSpeed(state.speed);
    const eligible = GAME.canRecordRun();
    const outcome = eligible ? BEST.record(state.song.id, { accuracy, speed: runSpeed }) : null;
    els.resultBest.innerHTML = outcome ? COMMON.resultBestHtml(outcome, accuracy, runSpeed)
      : COMMON.bestHtml(BEST.get(state.song.id)) || COMMON.noStarsHtml('No notes were heard this time. Turn on the microphone or tap the handpan to earn stars.');
    els.resultBest.hidden = !els.resultBest.innerHTML;
    showGameResult(GAME.recordRun({ id: state.song.id, accuracy, speed: state.speed, mode: state.mode, prev: prevBest, wrong: state.wrong, missed: miss, mic: Boolean(mic.on), weakBar: weakestBar() }));
    if(state.song?.id === DRILL_ID && COACH.active) { const lessonResult = COACH.record({accuracy:accuracy,eligible,mode:state.mode,speed:runSpeed}); if(lessonResult) { els.resultSummary.textContent = lessonResult.text; els.resultDrillBtn.textContent = lessonResult.next; } }
    const faster = COMMON.suggestSpeedUp(state.speed, accuracy);
    els.resultFasterBtn.hidden = !faster;
    els.resultFasterBtn.dataset.speed = faster ? String(faster) : '';
    if (faster) els.resultFasterBtn.textContent = `Try ${COMMON.speedLabel(faster)} →`;
    els.resultSlowerBtn.hidden = Boolean(faster) || accuracy >= 90;
    els.resultSmartBtn.hidden = state.mode !== 'practice' || !miss;
    els.resultHistory.innerHTML = COMMON.resultHistoryHtml(BEST.history.get(state.song.id));
    els.resultHistory.hidden = !els.resultHistory.innerHTML;
    if (!REC.recording && !REC.armed) { els.resultTake.hidden = true; els.resultTake.innerHTML = ''; }
    els.resultToday.innerHTML = COMMON.todayLine(PRACTICE);
    els.resultDrillBtn.hidden = state.song?.id !== DRILL_ID;
    if(!COACH?.active) els.resultDrillBtn.textContent = 'Choose a lesson';
    renderSongList();
    renderRecommendedNext(state.song);
    if (!eligible) els.resultSummary.textContent = 'Section practice. Restart from the beginning to earn song XP and stars.';
    if (!silent) { openDialog(els.resultDialog); requestAnimationFrame(() => celebrateResults(els.resultSparkles, (accuracy || 0) / 100)); }
  }

  /* ------------------------------------------------------------------ */
  /* Song builder                                                        */
  /* ------------------------------------------------------------------ */


  /* ------------------------------------------------------------------ */
  /* v16: wait styles, stage chips, sound wake-up, drafts, chooser       */
  /* ------------------------------------------------------------------ */


  // Shared with the other Ethereal trainers: app-files/ethereal-common.js.
  const { placeProgressInTape, isDesktopFit, syncProgressFill, syncViewModeBtn, leaveFocusFullscreen } = COMMON;
  function bindViewModeBtn() { COMMON.bindViewModeBtn({ setFocusMode }); }


  // A short, bright "correct!" for Wait for note · Game Mode; the microphone ignores it.
  function playChime() {
    COMMON.playChime(audio.ctx, audio.bus || audio.master);
    mic.echoUntil = Math.max(mic.echoUntil || 0, performance.now() + 700);
  }

  /* Start here: three first steps at the top of the song list. */
  function startHereCard() {
    return COMMON.startHereCard({
      storageKey: 'ethereal-handpan-start-here-v1',
      steps: [
        { title: 'Listen first', text: 'Hear where each note lands.' },
        { title: 'Play along', text: 'The first song in Wait Mode.' },
        { title: 'Your first tune', text: 'Play “Little Lamb” at 0.5×.' }
      ],
      onStep: index => {
        setSidebar(false);
        const first = 'demo-easy-first-steps';
        const tune = 'demo-mary-had-a-little-lamb';
        if (index === 2 && !JOURNEY.isSongOpen(tune)) { openSongPathDialog(); return; }
        if (index === 0 && findSong(first)) { selectSong(first); setMode('listen'); startPlayback(); }
        else if (index === 1 && findSong(first)) {
          selectSong(first);
          state.waitPref = true;
          setWaitStyle('game');
          setMode('wait');
          startPlayback();
        } else if (index === 2 && findSong(tune)) {
          selectSong(tune);
          state.waitPref = false;
          setSpeed(0.5, true);
          setMode('practice');
          savePrefs();
          startPlayback();
        }
        renderSongList();
      }
    });
  }

  /* Microphone check: ten seconds to set how loud a strike must be. */
  function openMicCheckDialog() {
    pausePlayback();
    COMMON.openMicCheck({
      storageKey: MIC_CHECK_KEY,
      fallback: 0.014,
      drumName: 'handpan',
      getAnalyser: async () => { if (!mic.on) await startMic(); return mic.analyser; },
      onDone: threshold => { mic.minThreshold = threshold; }
    });
  }

  const WAIT_STYLE_LABELS = { game: 'game', hear: 'play note', quiet: 'silent' };

  function syncWaitControls() {
    if (els.waitStyleSelect) els.waitStyleSelect.value = state.mode === 'wait' ? state.waitStyle : 'off';
    if (!els.stageWaitBtn) return;
    const waiting = state.mode === 'wait';
    const tileValue = els.stageWaitBtn.querySelector('b');
    if (tileValue) tileValue.textContent = waiting ? ({ game: 'Game', hear: 'Play note', quiet: 'Silent' }[state.waitStyle] || 'On') : 'Off';
    const stageSelect = document.getElementById('stageWaitSelect');
    if (stageSelect) stageSelect.value = waiting ? state.waitStyle : 'off';
    els.stageWaitBtn.classList.toggle('active', waiting);
    els.stageWaitBtn.setAttribute('aria-pressed', String(waiting));
  }

  function setWaitStyle(style) {
    if (!WAIT_STYLE_LABELS[style]) return;
    state.waitStyle = style;
    savePrefs();
    syncWaitControls();
    updateTransportUI();
  }

  function setWaitOn(on) {
    if (els.waitToggle.checked === on && (state.mode === 'wait') === on) return;
    els.waitToggle.checked = on;
    els.waitToggle.dispatchEvent(new Event('change'));
  }

  // The stage chip steps through: off → Game Mode → Play Note → Silent Mode → off.
  function cycleStageWait() {
    const order = ['game', 'hear', 'quiet'];
    if (state.mode !== 'wait') { state.waitStyle = 'game'; setWaitOn(true); syncWaitControls(); return; }
    const next = order.indexOf(state.waitStyle) + 1;
    if (next >= order.length) setWaitOn(false);
    else setWaitStyle(order[next]);
    showToast(state.mode === 'wait' ? `${els.waitStyleSelect.querySelector(`option[value="${state.waitStyle}"]`)?.text || 'Wait for note'}.` : 'Wait for note is off.', 'success');
  }


  function onAudioStateChange() {
    if (!soundIsAwake()) return;
    els.soundWakeBtn.hidden = true;
    if (tour.active) unlockTourAudio();
  }

  /* Drafts: every song you work on in the builder keeps its own unsaved draft. */
  const STORAGE_DRAFTS = 'ethereal-handpan-editor-drafts-v1';

  function readDrafts() {
    const list = readJson(STORAGE_DRAFTS, []);
    return (Array.isArray(list) ? list : [])
      .filter(draft => draft && draft.draftKey && (String(draft.title || '').trim() || String(draft.sequence || '').trim()))
      .sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
  }

  function writeDrafts(list) {
    writeJson(STORAGE_DRAFTS, list.slice(0, 30));
  }

  function currentEditorDraft() {
    return {
      draftKey: editor.draftKey,
      songId: editor.songId,
      sourceId: editor.sourceId,
      title: els.songTitleInput.value,
      bpm: els.songBpmInput.value,
      beatsPerBar: els.songMeterInput.value,
      sequence: els.sequenceInput.value,
      zones: editor.zones,
      changedZones: [...editor.changed],
      savedAt: Date.now()
    };
  }

  function writeEditorDraft() {
    clearTimeout(editor.draftTimer);
    editor.draftTimer = 0;
    if (!editor.draftKey) return;
    const draft = currentEditorDraft();
    const rest = readDrafts().filter(item => item.draftKey !== draft.draftKey);
    const empty = !draft.title.trim() && !draft.sequence.trim();
    writeDrafts(empty ? rest : [draft, ...rest]);
  }

  function queueDraftSave() {
    if (editor.loading || !els.editorDialog.open) return;
    clearTimeout(editor.draftTimer);
    editor.draftTimer = setTimeout(writeEditorDraft, 400);
  }

  function flushDraftSave() {
    if (editor.draftTimer) writeEditorDraft();
  }

  function clearDraft(key = editor.draftKey) {
    if (key === editor.draftKey) { clearTimeout(editor.draftTimer); editor.draftTimer = 0; }
    writeDrafts(readDrafts().filter(item => item.draftKey !== key));
  }

  function applyEditorDraft(draft) {
    els.songTitleInput.value = draft.title || '';
    els.songBpmInput.value = String(draft.bpm || els.songBpmInput.value);
    const meter = String(draft.beatsPerBar || '');
    if (meter && ![...els.songMeterInput.options].some(o => o.value === meter)) {
      const option = document.createElement('option');
      option.value = option.textContent = meter;
      els.songMeterInput.appendChild(option);
    }
    if (meter) els.songMeterInput.value = meter;
    els.sequenceInput.value = draft.sequence || '';
    if ('zones' in draft) {
      editor.zones = Array.isArray(draft.zones) ? draft.zones.map(zone => ({ ...zone })) : null;
      editor.changed = new Set(Array.isArray(draft.changedZones) ? draft.changedZones : []);
    }
  }

  function updateDraftNotice(restored) {
    const all = readDrafts();
    const others = all.filter(item => item.draftKey !== editor.draftKey).length;
    if (!restored && !others) { els.draftNotice.hidden = true; return; }
    els.draftNotice.hidden = false;
    if (restored) {
      const when = new Date(restored.savedAt || Date.now());
      const stamp = Number.isNaN(when.getTime()) ? '' : ` from ${when.toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`;
      els.draftNoticeText.textContent = `Unsaved draft restored${stamp}.`;
    } else {
      els.draftNoticeText.textContent = others === 1 ? 'You have 1 unsaved draft.' : `You have ${others} unsaved drafts.`;
    }
    els.discardDraftBtn.hidden = !restored;
    els.allDraftsBtn.hidden = !others;
    els.allDraftsBtn.textContent = restored ? `All drafts (${all.length})` : 'Open drafts';
  }

  function draftLabel(draft) {
    const song = draft.songId ? state.mySongs.find(s => s.id === draft.songId) : draft.sourceId ? findSong(draft.sourceId) : null;
    if (draft.songId) return song ? `Changes to “${song.title}”` : 'Changes to a deleted song';
    if (draft.sourceId) return song ? `My version of “${song.title}”` : 'Copy of a song';
    return 'New song';
  }

  function renderDrafts() {
    const drafts = readDrafts();
    els.draftsList.replaceChildren();
    els.draftsEmpty.hidden = drafts.length > 0;
    drafts.forEach(draft => {
      const li = document.createElement('li');
      li.className = `draft-item${els.editorDialog.open && draft.draftKey === editor.draftKey ? ' current' : ''}`;
      const strokes = String(draft.sequence || '').split(/\s+/).filter(token => token && token !== '|' && token !== '-').length;
      const when = new Date(draft.savedAt || Date.now()).toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
      li.innerHTML = `<div class="draft-info"><b>${escapeHtml(String(draft.title || '').trim() || 'Untitled')}</b><small>${escapeHtml(draftLabel(draft))} · ${strokes} strokes · ${escapeHtml(when)}</small></div>
        <button type="button" class="draft-open">Open</button>
        <button type="button" class="draft-delete" aria-label="Delete this draft" title="Delete this draft"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16"></path><path d="M9 7V4h6v3"></path><path d="M6 7l1 13h10l1-13"></path></svg></button>`;
      li.querySelector('.draft-open').addEventListener('click', () => openDraft(draft));
      li.querySelector('.draft-delete').addEventListener('click', () => {
        if (!window.confirm(`Delete the draft “${String(draft.title || '').trim() || 'Untitled'}”?`)) return;
        clearDraft(draft.draftKey);
        if (els.editorDialog.open) updateDraftNotice(draft.draftKey === editor.draftKey ? null : readDrafts().find(d => d.draftKey === editor.draftKey) || null);
        renderDrafts();
      });
      els.draftsList.appendChild(li);
    });
  }

  function openDrafts() {
    flushDraftSave();
    renderDrafts();
    openDialog(els.draftsDialog);
  }

  function openDraft(draft) {
    flushDraftSave();
    closeDialog(els.draftsDialog);
    const song = draft.songId ? state.mySongs.find(s => s.id === draft.songId) : draft.sourceId ? findSong(draft.sourceId) : null;
    openEditor(song || null, { draftKey: draft.draftKey });
  }

  function narrowPhone() {
    return window.matchMedia?.('(max-width: 360px)').matches;
  }

  function openEditChoice() {
    const song = state.song;
    els.choiceEditBtn.hidden = !song;
    els.choiceEditNote.textContent = song && song.folder !== 'mine' ? 'Make your own version of this song' : 'Change its notes, tempo or title';
    const count = readDrafts().length;
    els.choiceDraftsBtn.hidden = !count;
    els.choiceDraftsBtn.querySelector('b').textContent = `Drafts (${count})`;
    openDialog(els.editChoiceDialog);
  }

  function bindDraftsAndChooser() {
    els.discardDraftBtn.addEventListener('click', () => {
      const key = editor.draftKey;
      clearDraft(key);
      const song = editor.songId ? state.mySongs.find(s => s.id === editor.songId) : editor.sourceId ? findSong(editor.sourceId) : null;
      openEditor(song || null, { draftKey: key });
      showToast('Draft discarded.', 'success');
    });
    els.allDraftsBtn.addEventListener('click', openDrafts);
    els.editorDialog.addEventListener('close', flushDraftSave);
    els.songTitleInput.addEventListener('input', queueDraftSave);
    els.songMeterInput.addEventListener('change', queueDraftSave);
    els.choiceEditBtn.addEventListener('click', () => { closeDialog(els.editChoiceDialog); openEditor(state.song); });
    els.choiceNewBtn.addEventListener('click', () => { closeDialog(els.editChoiceDialog); setSidebar(false); openEditor(null); });
    els.choiceDraftsBtn.addEventListener('click', () => { closeDialog(els.editChoiceDialog); openDrafts(); });
    els.waitStyleSelect.addEventListener('change', () => {
      // One dropdown: "Don't wait for note" or one of the three ways of waiting.
      const choice = els.waitStyleSelect.value;
      if (choice === 'off') {
        setWaitOn(false);
        showToast("Don't wait for note: the song plays on while you play along.", 'success');
        return;
      }
      setWaitStyle(choice);
      setWaitOn(true);
      showToast(`${els.waitStyleSelect.selectedOptions[0].text}.`, 'success');
    });
    document.getElementById('stageWaitSelect')?.addEventListener('change', event => {
      els.waitStyleSelect.value = event.target.value;
      els.waitStyleSelect.dispatchEvent(new Event('change'));
    });
    els.stageMicBtn.addEventListener('click', () => els.micBtn.click());
    // Export and Delete sit in the "Edit song" chooser: close it once they are used.
    [els.exportBtn, els.deleteBtn, els.restoreDemosBtn].forEach(button => button?.addEventListener('click', () => {
      const chooser = document.getElementById('editChoiceDialog');
      if (chooser?.open) chooser.close();
    }));
    syncWaitControls();
  }

  const editor = { songId: null, sourceId: null, draftKey: '', draftTimer: 0, loading: false, hand: '', len: 1, drum: null, previewTimer: 0,
    style: '', zones: null, changed: new Set(), zoneMode: 'write', selectedZone: '', pads: null, zoneIdsKey: '' };

  function openEditor(song, options = {}) {
    flushDraftSave();
    editor.loading = true;
    editor.songId = song && song.folder === 'mine' ? song.id : null;
    editor.sourceId = song && song.folder !== 'mine' ? song.id : null;
    editor.draftKey = options.draftKey || (editor.songId ? `song:${editor.songId}` : editor.sourceId ? `copy:${editor.sourceId}` : `new:${Date.now()}`);
    els.editorHeading.textContent = song ? (song.folder === 'mine' ? 'Edit song' : 'Edit a copy') : 'Create a song';
    els.songTitleInput.value = song ? (song.folder === 'mine' ? song.title : `${song.title} (my version)`) : '';
    els.songBpmInput.value = String(song ? song.bpm : 90);
    els.songMeterInput.value = String(song ? song.beatsPerBar : 4);
    if (song && ![...els.songMeterInput.options].some(o => o.value === String(song.beatsPerBar))) {
      const option = document.createElement('option');
      option.value = option.textContent = String(song.beatsPerBar);
      els.songMeterInput.appendChild(option);
      els.songMeterInput.value = option.value;
    }
    els.sequenceInput.value = song ? song.sequence : '';
    editor.zones = song && Array.isArray(song.zones) ? song.zones.map(zone => ({ ...zone })) : null;
    editor.changed = new Set((editor.zones || []).map(zone => zone.id));
    editor.selectedZone = '';
    setZoneMode('write');
    els.deleteEditorBtn.hidden = !editor.songId;
    els.saveSongBtn.textContent = song && song.folder !== 'mine' ? 'Save as my song' : 'Save song';
    const draft = readDrafts().find(item => item.draftKey === editor.draftKey) || null;
    if (draft) applyEditorDraft(draft);
    updateDraftNotice(draft);
    renderComposeDrum();
    updateSequenceStatus();
    editor.loading = false;
    openDialog(els.editorDialog);
    requestAnimationFrame(() => renderRhythmView());
  }

  function composeTap(padId) {
    if (editor.zoneMode === 'move') {
      // Placing zones: zones are picked up by dragging; a note just sounds.
      if (!isPercId(padId)) ensureAudio().then(() => playPad(padId, 0, 0.9)).catch(() => {});
      return;
    }
    ensureAudio().then(() => playPad(padId, 0, 0.9)).catch(() => {});
    const g = editor.drum.padEls.get(padId);
    if (g) {
      g.style.setProperty('--flash', MIC_HEARD_COLOR);
      g.classList.add('flash');
      setTimeout(() => g.classList.remove('flash'), 180);
    }
    // Slaps are written "S" plus the hand; the zone itself implies the hand.
    let token;
    if (padId === 'SL' || padId === 'SR') token = `S${padId === 'SR' ? 'R' : 'L'}`;
    else token = `${padId}${editor.hand}`;
    if (editor.style === 'ghost') token = `(${token})`;
    else if (editor.style === 'flam') token = `*${token}`;
    const lenSuffix = editor.len === 1 ? '' : `:${editor.len}`;
    const input = els.sequenceInput;
    const before = input.value.slice(0, input.selectionStart);
    const after = input.value.slice(input.selectionEnd);
    if (els.chordModeToggle.checked) {
      const match = /(\S+)\s*$/.exec(before);
      if (match && match[1] !== '|' && !/^[-0.](:|$)/.test(match[1])) {
        const { core, duration } = splitToken(match[1]);
        const combined = `${core}+${token}${duration === 1 ? '' : `:${duration}`}`;
        const head = `${before.slice(0, match.index)}${combined} `;
        input.value = head + after.replace(/^\s+/, '');
        input.selectionStart = input.selectionEnd = head.length;
        updateSequenceStatus();
        return;
      }
    }
    insertAtCursor(`${token}${lenSuffix}`);
  }

  function insertAtCursor(text) {
    const input = els.sequenceInput;
    const start = input.selectionStart;
    const end = input.selectionEnd;
    const before = input.value.slice(0, start);
    const after = input.value.slice(end);
    const spacer = before && !/\s$/.test(before) ? ' ' : '';
    const insert = `${spacer}${text} `;
    input.value = before + insert + after.replace(/^\s+/, '');
    const caret = before.length + insert.length;
    input.selectionStart = input.selectionEnd = caret;
    if (!window.matchMedia('(pointer: coarse)').matches) input.focus({ preventScroll: true });
    updateSequenceStatus();
  }

  function removeLastToken() {
    const input = els.sequenceInput;
    const before = input.value.slice(0, input.selectionStart).replace(/\s+$/, '');
    const after = input.value.slice(input.selectionEnd);
    const trimmed = before.replace(/\S+$/, '');
    input.value = trimmed + after;
    input.selectionStart = input.selectionEnd = trimmed.length;
    updateSequenceStatus();
  }

  function editorParsed() {
    return parseSequence(els.sequenceInput.value, els.songBpmInput.value, els.songMeterInput.value, new Map(editorPads().map(pad => [pad.id, pad])));
  }

  /* ---------- Song builder: the song's own stroke zones ---------- */

  function editorPads() {
    return buildPads(state.instrument, undefined, { zones: editor.zones, used: percIdsIn(els.sequenceInput.value) });
  }

  function renderComposeDrum() {
    editor.zoneIdsKey = [...percIdsIn(els.sequenceInput.value)].sort().join(',');
    editor.pads = editorPads();
    editor.drum = buildDrumSvg({ interactive: true, className: `compose-svg${editor.zoneMode === 'move' ? ' zone-move' : ''}`, onTap: composeTap, showAllPerc: true, pads: editor.pads });
    els.composeDrum.replaceChildren(editor.drum.svg);
    bindZoneEditing(editor.drum);
    renderZoneTools();
  }

  function setZoneMode(mode) {
    editor.zoneMode = mode === 'move' ? 'move' : 'write';
    els.zonePanel?.querySelectorAll('[data-zone-mode]').forEach(button => button.classList.toggle('active', button.dataset.zoneMode === editor.zoneMode));
    editor.drum?.svg.classList.toggle('zone-move', editor.zoneMode === 'move');
    if (editor.zoneMode !== 'move') editor.selectedZone = '';
    renderZoneTools();
  }

  // Zones are kept as on the unturned drum (and for right-handed playing), so they turn
  // with the notes and follow the mirror setting.
  function zoneRecord(pad, x = pad.x, y = pad.y) {
    const inst = state.instrument;
    const flip = inst.mirror && pad.id !== 'SL' && pad.id !== 'SR';
    const p = turnPoint(flip ? -x : x, y, -rotationOffset(inst, SCALES[inst.scale].top.length));
    let hand = pad.hand;
    if (flip) hand = hand === 'L' ? 'R' : 'L';
    return { id: pad.id, x: Math.round(p.x * 1000) / 1000, y: Math.round(p.y * 1000) / 1000, hand };
  }

  // The first change to a zone gives the song its own copy of every zone on the drum.
  function materialiseZones() {
    if (editor.zones) return;
    editor.zones = (editor.pads || editorPads()).filter(pad => pad.kind === 'perc').map(pad => zoneRecord(pad));
  }

  function zonesChanged() {
    renderComposeDrum();
    updateSequenceStatus();
  }

  function setEditorZone(id, change) {
    const pad = (editor.pads || []).find(item => item.id === id);
    if (!pad) return;
    materialiseZones();
    const record = zoneRecord({ ...pad, hand: change.hand || pad.hand }, change.x ?? pad.x, change.y ?? pad.y);
    editor.zones = editor.zones.filter(zone => zone.id !== id).concat(record);
    editor.changed.add(id);
    zonesChanged();
  }

  function addZone(base) {
    const pads = editor.pads || editorPads();
    let n = 2;
    while (n <= 9 && pads.some(pad => pad.id === `${base}${n}`)) n += 1;
    if (n > 9) { showToast(`That is the most ${base} zones a song can have.`, 'warning'); return; }
    const id = `${base}${n}`;
    const first = pads.find(pad => pad.id === (base === 'S' ? (n % 2 ? 'SR' : 'SL') : base));
    if (!first) return;
    const spot = turnPoint(first.x, first.y, first.x < 0 ? -26 : 26);
    materialiseZones();
    editor.zones.push(zoneRecord({ id, hand: first.hand }, spot.x, spot.y));
    editor.changed.add(id);
    editor.selectedZone = id;
    zonesChanged();
  }

  function removeZone(id) {
    if (!editor.zones) return;
    editor.zones = editor.zones.filter(zone => zone.id !== id);
    editor.changed.delete(id);
    if (editor.selectedZone === id && zoneIndex(id)) editor.selectedZone = '';
    zonesChanged();
  }

  // What the song keeps: the zones it writes and the ones you placed or added.
  function editorSongZones() {
    if (!editor.zones) return undefined;
    const used = percIdsIn(els.sequenceInput.value);
    const list = editor.zones.filter(zone => used.has(zone.id) || editor.changed.has(zone.id) || zoneIndex(zone.id));
    return cleanZones(list);
  }

  function renderZoneTools() {
    if (!els.zoneTools) return;
    const move = editor.zoneMode === 'move';
    els.zoneTools.hidden = !move;
    editor.drum?.padEls.forEach((g, id) => g.classList.toggle('selected', move && id === editor.selectedZone));
    if (!move) return;
    const pad = editor.selectedZone ? (editor.pads || []).find(item => item.id === editor.selectedZone) : null;
    if (!pad) {
      els.zoneSelected.innerHTML = '<span class="zone-hint">Drag a zone to where you play it in this song. Tap one to pick its hand.</span>';
      return;
    }
    const used = percIdsIn(els.sequenceInput.value).has(pad.id);
    const fixedHand = pad.id === 'SL' || pad.id === 'SR';
    const hands = ['L', 'R'].map(hand => `<button type="button" data-zone-hand="${hand}" class="hand-${hand.toLowerCase()}${pad.hand === hand ? ' active' : ''}"${fixedHand ? ' disabled' : ''}>${hand === 'L' ? 'Left' : 'Right'}</button>`).join('');
    const action = zoneIndex(pad.id)
      ? `<button type="button" class="text-tool-btn" data-zone-remove${used ? ' disabled title="The song still uses this zone"' : ''}>Remove</button>`
      : editor.changed.has(pad.id) ? '<button type="button" class="text-tool-btn" data-zone-reset title="Back to the zone from My Handpan">Reset</button>' : '';
    els.zoneSelected.innerHTML = `<b class="zone-name">${escapeHtml(pad.mark)}</b><span class="zone-label">${escapeHtml(pad.name)}</span><span class="mini-seg zone-hand" role="group" aria-label="Hand">${hands}</span>${action}`;
  }

  function bindZoneEditing(drum) {
    let drag = null;
    drum.svg.addEventListener('pointerdown', event => {
      if (editor.zoneMode !== 'move') return;
      const g = event.target.closest('.pad-perc');
      if (!g) return;
      event.preventDefault();
      drag = { id: g.getAttribute('data-pad'), g, pointer: event.pointerId, moved: false };
      editor.selectedZone = drag.id;
      renderZoneTools();
      try { drum.svg.setPointerCapture(event.pointerId); } catch (error) { /* not capturable */ }
      g.classList.add('dragging');
    });
    drum.svg.addEventListener('pointermove', event => {
      if (!drag || event.pointerId !== drag.pointer) return;
      const point = drum.svg.createSVGPoint();
      point.x = event.clientX;
      point.y = event.clientY;
      const local = point.matrixTransform(drum.svg.getScreenCTM().inverse());
      const pads = editor.pads || [];
      const spot = snapZone(local.x, local.y, drag.id, pads, pads.filter(pad => pad.kind === 'perc' && pad.id !== drag.id));
      drag.x = spot.x;
      drag.y = spot.y;
      drag.moved = true;
      drag.g.setAttribute('transform', `translate(${spot.x.toFixed(4)} ${spot.y.toFixed(4)})`);
    });
    const end = event => {
      if (!drag || event.pointerId !== drag.pointer) return;
      drag.g.classList.remove('dragging');
      const done = drag;
      drag = null;
      if (done.moved) setEditorZone(done.id, { x: done.x, y: done.y });
    };
    drum.svg.addEventListener('pointerup', end);
    drum.svg.addEventListener('pointercancel', end);
  }

  function bindZonePanel() {
    els.zonePanel?.addEventListener('click', event => {
      const button = event.target.closest('button');
      if (!button || button.disabled) return;
      if (button.dataset.zoneMode) { setZoneMode(button.dataset.zoneMode); return; }
      if (button.dataset.addZone) { setZoneMode('move'); addZone(button.dataset.addZone); return; }
      const id = editor.selectedZone;
      if (button.dataset.zoneHand && id) { setEditorZone(id, { hand: button.dataset.zoneHand }); return; }
      if (button.hasAttribute('data-zone-remove') && id) { removeZone(id); return; }
      if (button.hasAttribute('data-zone-reset') && id) removeZone(id);
    });
    els.editorDialog.querySelectorAll('[data-style]').forEach(button => button.addEventListener('click', () => {
      editor.style = button.dataset.style;
      els.editorDialog.querySelectorAll('[data-style]').forEach(b => b.classList.toggle('active', b === button));
    }));
    els.addMuteBtn?.addEventListener('click', () => insertAtCursor(editor.len === 1 ? 'M' : `M:${editor.len}`));
  }

  function updateSequenceStatus() {
    const parsed = editorParsed();
    const parts = [];
    if (parsed.events.length) parts.push(`${parsed.itemCount} strokes · ${Math.max(0, parsed.bars.length - 1)} bars · ${formatTime(parsed.duration)}`);
    if (parsed.errors.length) parts.push(`Not understood: ${parsed.errors.slice(0, 4).join('  ')}${parsed.errors.length > 4 ? ' …' : ''}`);
    if (parsed.missing.size) parts.push(`Not on ${SCALES[state.instrument.scale].name}: ${[...parsed.missing].join(', ')}`);
    els.sequenceStatus.textContent = parts.join(' · ') || 'Tap the handpan or type strokes.';
    els.sequenceStatus.dataset.tone = parsed.errors.length ? 'error' : parsed.missing.size ? 'warn' : 'ok';
    // A new zone written as text (S3, T2...) shows up on the builder's handpan.
    if (editor.drum && [...percIdsIn(els.sequenceInput.value)].sort().join(',') !== editor.zoneIdsKey) renderComposeDrum();
    else renderZoneTools();
    renderRhythmView(parsed);
    queueDraftSave();
  }

  async function previewEditorSong() {
    if (audio.preview.length) {
      cancelScheduledAudio(audio.preview);
      els.previewSongBtn.textContent = '▶ Play';
      stopEditorPreviewVisuals();
      return;
    }
    const context = await ensureAudio();
    if (!context) return;
    const parsed = editorParsed();
    const start = context.currentTime + 0.15;
    parsed.events.forEach(event => event.items.forEach(item => {
      if (item.fx === 'mute') muteRinging(start + event.time);
      else if (!item.missing) playItem(item, start + event.time, 0.9, audio.preview);
    }));
    els.previewSongBtn.textContent = '■ Stop';
    clearTimeout(editor.previewTimer);
    startEditorPreviewVisuals(parsed, (start - context.currentTime) * 1000);
    editor.previewTimer = setTimeout(() => {
      els.previewSongBtn.textContent = '▶ Play';
      audio.preview.length = 0;
      stopEditorPreviewVisuals();
    }, (parsed.duration + 0.6) * 1000);
  }

  // While the editor plays a song, the strokes light up on its handpan and in a strip
  // above the sequence.
  function startEditorPreviewVisuals(parsed, delayMs) {
    stopEditorPreviewVisuals();
    const strip = els.composePreviewStrip;
    strip.replaceChildren(...parsed.events.map(event => {
      const chip = document.createElement('span');
      chip.className = 'preview-chip';
      chip.textContent = event.items.map(item => item.fx ? 'M' : isPercId(item.pad) ? strokeMark(item.pad) : state.padMap.get(item.pad)?.label || item.pad).join('+');
      chip.style.setProperty('--c', itemColor(event.items[0]));
      return chip;
    }));
    strip.hidden = true;
    const chips = parsed.events.map((event, index) => els.rhythmView.querySelector(`[data-event="${index}"]`) || document.createElement('span'));
    editor.previewTimers = parsed.events.map((event, index) => setTimeout(() => {
      chips.forEach((chip, k) => { chip.classList.toggle('now', k === index); chip.classList.toggle('done', k < index); });
      if (chips[index]?.isConnected) chips[index].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      event.items.forEach(item => {
        const g = editor.drum?.padEls.get(item.pad);
        if (!g) return;
        g.style.setProperty('--flash', itemColor(item));
        g.classList.add('flash');
        clearTimeout(g._flashTimer);
        g._flashTimer = setTimeout(() => g.classList.remove('flash'), 240);
      });
    }, delayMs + event.time * 1000));
  }

  function stopEditorPreviewVisuals() {
    (editor.previewTimers || []).forEach(clearTimeout);
    editor.previewTimers = [];
    els.composePreviewStrip.hidden = true;
    els.rhythmView.querySelectorAll('.now, .done').forEach(cell => cell.classList.remove('now', 'done'));
  }

  /* ---------- Swipe the song tape to move through the song ---------- */

  function bindTapeScrub() {
    const strip = els.noteTape.querySelector('.tape-window');
    let drag = null;
    strip.addEventListener('pointerdown', event => {
      if (!state.parsed || !tape.visible) return;
      drag = { id: event.pointerId, x0: event.clientX, t0: state.playing ? songNow() : state.songTime, wasPlaying: state.playing, moved: false };
      strip.setPointerCapture?.(event.pointerId);
    });
    strip.addEventListener('pointermove', event => {
      if (!drag || event.pointerId !== drag.id) return;
      const dx = event.clientX - drag.x0;
      if (!drag.moved && Math.abs(dx) < 6) return;
      if (!drag.moved) {
        drag.moved = true;
        if (drag.wasPlaying) pausePlayback();
        strip.classList.add('scrubbing');
      }
      const time = drag.t0 - (dx / tape.pxPerBeat) * state.parsed.spb;
      seekTo(Math.max(0, Math.min(state.parsed.duration - 0.01, time)));
      requestFrame();
    });
    const end = event => {
      if (!drag || event.pointerId !== drag.id) return;
      const resume = drag.moved && drag.wasPlaying;
      strip.classList.remove('scrubbing');
      drag = null;
      if (resume) startPlayback();
    };
    strip.addEventListener('pointerup', end);
    strip.addEventListener('pointercancel', end);
  }

  /* ---------- Loading screen ---------- */

  function loaderProgress(done, total) {
    if (!els.startupLoader || !els.startupLoader.isConnected) return;
    const percent = total ? Math.max(4, Math.round((done / total) * 100)) : 100;
    els.startupLoaderFill.style.width = `${percent}%`;
    els.startupLoaderStatus.textContent = done >= total ? 'Ready to play' : `Tuning your ${SCALES[state.instrument.scale].name}`;
    els.startupLoaderCount.textContent = done >= total ? 'All notes and sounds ready' : `${done} of ${total} sounds ready`;
  }

  function revealApp() {
    if (!els.startupLoader || !els.startupLoader.isConnected) return;
    loaderProgress(1, 1);
    setTimeout(() => {
      document.body.classList.remove('app-loading');
      els.startupLoader.classList.add('done');
      setTimeout(() => els.startupLoader.remove(), 320);
      fitPhoneStage();
      resizeCanvas();
      maybeShowSoundWake();
    }, 380);
  }

  /* ---------- Waking the sound up ---------- */

  // Browsers keep sound off until the first touch, so a fresh page plays silently. A
  // friendly button invites that first touch.
  function soundIsAwake() {
    return Boolean(audio.ctx && audio.ctx.state === 'running');
  }

  function maybeShowSoundWake() {
    const activated = navigator.userActivation ? navigator.userActivation.hasBeenActive : false;
    // Only on phones and tablets; on a computer the first click wakes the sound anyway.
    const touch = Boolean(window.matchMedia?.('(pointer: coarse)').matches);
    els.soundWakeBtn.hidden = !touch || activated || soundIsAwake();
  }

  function wakeSound() {
    els.soundWakeBtn.hidden = true;
    ensureAudio().then(() => { if (tour.active) unlockTourAudio(); }).catch(() => {});
  }

  /* ---------- Little "?" explanations ---------- */

  function bindHints() {
    const pop = els.hintPop;
    let owner = null;
    const hide = () => { pop.hidden = true; owner?.classList.remove('open'); owner = null; };
    const show = button => {
      if (owner === button) { hide(); return; }
      hide();
      owner = button;
      button.classList.add('open');
      pop.textContent = button.dataset.hint || '';
      pop.hidden = false;
      const r = button.getBoundingClientRect();
      const w = Math.min(300, window.innerWidth - 24);
      pop.style.width = `${w}px`;
      const left = Math.max(12, Math.min(window.innerWidth - w - 12, r.left + r.width / 2 - w / 2));
      pop.style.left = `${left}px`;
      const h = pop.offsetHeight;
      const above = r.top - h - 10;
      pop.style.top = `${above > 8 ? above : r.bottom + 10}px`;
    };
    document.querySelectorAll('.hint-btn').forEach(button => {
      button.addEventListener('click', event => { event.stopPropagation(); show(button); });
      button.addEventListener('mouseenter', () => { if (window.matchMedia?.('(hover: hover)').matches && owner !== button) show(button); });
      button.addEventListener('mouseleave', () => { if (window.matchMedia?.('(hover: hover)').matches && owner === button) hide(); });
    });
    document.addEventListener('pointerdown', event => { if (owner && !event.target.closest('.hint-btn')) hide(); });
    window.addEventListener('scroll', hide, { passive: true });
    window.addEventListener('resize', hide);
  }

  /* ---------- Full screen (tablets) ---------- */

  function bindFullscreen() {
    const root = document.documentElement;
    const supported = Boolean(root.requestFullscreen && document.fullscreenEnabled);
    els.fullscreenBtn.hidden = !supported;
    if (!supported) return;
    const sync = () => {
      const on = Boolean(document.fullscreenElement);
      els.fullscreenBtn.classList.toggle('active', on);
      els.fullscreenBtn.setAttribute('aria-label', on ? 'Leave full screen' : 'Full screen');
      els.fullscreenBtn.title = on ? 'Leave full screen' : 'Full screen: hide the system bars';
      const fsLabel = els.fullscreenBtn.querySelector('.fs-label');
      if (fsLabel) fsLabel.textContent = on ? 'Exit full screen' : 'Full screen';
      setTimeout(fitPhoneStage, 120);
    };
    els.fullscreenBtn.addEventListener('click', () => {
      if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
      else root.requestFullscreen({ navigationUI: 'hide' }).catch(() => showToast('Full screen is not available here.', 'warning'));
    });
    document.addEventListener('fullscreenchange', sync);
  }

  /* ---------- Community gallery ---------- */

  const COMMUNITY_UPLOAD_URL = String(window.ETHEREAL_COMMUNITY_UPLOAD_URL || '').trim();
  const COMMUNITY_STATUS_CALLBACK = 'etherealCommunityUploadStatus';
  let communityUploadRequest = null;
  const library = { tab: 'all' };

  function communityFingerprint(song) {
    if (!song) return '';
    const source = ['hp1', String(song.title || '').trim(), String(Number(song.bpm) || ''), String(song.beatsPerBar || 4), String(song.sequence || '').trim()].join('\u001f');
    let hash = 2166136261;
    for (let i = 0; i < source.length; i += 1) { hash ^= source.charCodeAt(i); hash = Math.imul(hash, 16777619); }
    return `hp1-${(hash >>> 0).toString(16).padStart(8, '0')}`;
  }

  function songUnderReview(song) {
    return Boolean(song && song.folder === 'mine' && song.communitySubmittedFingerprint && song.communitySubmittedFingerprint === communityFingerprint(song));
  }

  function updateLibraryCounts() {
    const songs = state.communitySongs || [];
    const counts = { easy: 0, medium: 0, hard: 0, expert: 0 };
    songs.forEach(song => { const level = songDifficulty(parseSong(song)).level; if (level in counts) counts[level] += 1; });
    els.libraryCountBadge.textContent = String(songs.length);
    els.communitySongsCount.textContent = String(songs.length);
    els.communityEasyCount.textContent = String(counts.easy);
    els.communityMediumCount.textContent = String(counts.medium);
    els.communityHardCount.textContent = String(counts.hard);
    els.communityExpertCount.textContent = String(counts.expert);
  }

  function renderSongLibrary() {
    updateLibraryCounts();
    const tab = library.tab;
    const query = String(els.librarySearch.value || '').trim().toLowerCase();
    const songs = (state.communitySongs || []).filter(song => {
      const level = songDifficulty(parseSong(song)).level;
      return (tab === 'all' || level === tab) && `${song.title} ${song.artist}`.toLowerCase().includes(query);
    });
    const tabs = { all: els.libraryTabAll, easy: els.libraryTabEasy, medium: els.libraryTabMedium, hard: els.libraryTabHard, expert: els.libraryTabExpert };
    Object.entries(tabs).forEach(([key, button]) => { button.classList.toggle('active', key === tab); button.setAttribute('aria-selected', String(key === tab)); });
    els.libraryGrid.innerHTML = '';
    songs.forEach(song => {
      const parsed = parseSong(song);
      const difficulty = songDifficulty(parsed);
      const card = document.createElement('button');
      card.type = 'button';
      card.className = `album-card${state.song && song.id === state.song.id ? ' selected' : ''}`;
      card.innerHTML = `${songCoverMarkup(song)}<span class="album-copy"><span class="album-title-row"><strong${song.folder === 'mine' ? ' translate="no"' : ''}>${escapeHtml(song.title)}</strong><em class="difficulty-badge" data-level="${difficulty.level}">${difficulty.label}</em></span><small>${song.bpm} BPM · ${parsed.itemCount} strokes</small><span class="album-source">${escapeHtml(song.artist || 'Community gallery')}</span>${song.about ? `<span class="album-about">${escapeHtml(song.about)}</span>` : ''}</span>`;
      card.addEventListener('click', () => { selectSong(song.id, { closeSidebar: true }); els.songLibraryDialog.close(); });
      els.libraryGrid.appendChild(card);
    });
    els.libraryEmpty.hidden = songs.length > 0;
    if (!songs.length) {
      if (query) els.libraryEmpty.innerHTML = '<strong>No matches</strong><span>Try another song name or difficulty.</span>';
      else if (tab !== 'all') els.libraryEmpty.innerHTML = `<strong>No ${tab[0].toUpperCase() + tab.slice(1)} community songs yet</strong><span>Try another difficulty, or check back when more songs are approved.</span>`;
      else els.libraryEmpty.innerHTML = '<strong>No community songs yet</strong><span>Approved .handsong files in the community-songs folder appear here.</span>';
    }
  }

  function openSongLibrary() {
    library.tab = 'all';
    els.librarySearch.value = '';
    renderSongLibrary();
    openDialog(els.songLibraryDialog);
  }

  function setCommunityProgress(percent, status, tone = '') {
    const value = Math.max(0, Math.min(100, Number(percent) || 0));
    els.communityUploadProgress.hidden = false;
    els.communityUploadProgress.classList.toggle('success', tone === 'success');
    els.communityUploadProgress.classList.toggle('error', tone === 'error');
    els.communityUploadStatus.textContent = status;
    els.communityUploadPercent.textContent = tone === 'error' ? 'Failed' : `${Math.round(value)}%`;
    els.communityProgressFill.style.width = `${value}%`;
    els.communityProgressTrack.setAttribute('aria-valuenow', String(Math.round(value)));
  }

  function resetCommunityProgress() {
    if (communityUploadRequest) return;
    els.communityUploadProgress.hidden = true;
    els.communityUploadProgress.classList.remove('success', 'error');
    els.communityProgressFill.style.width = '0%';
  }

  function setCommunitySelection(song, message) {
    els.communitySelection.replaceChildren();
    if (song?.title) {
      const strong = document.createElement('strong');
      strong.className = 'community-selected-song';
      strong.textContent = `Selected song: ${song.title}`;
      els.communitySelection.appendChild(strong);
    }
    if (message) {
      const span = document.createElement('span');
      span.className = 'community-selection-detail';
      span.textContent = message;
      els.communitySelection.appendChild(span);
    }
  }

  function openCommunityDialog() {
    const song = state.song;
    const own = Boolean(song && song.folder === 'mine');
    const configured = /^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec$/u.test(COMMUNITY_UPLOAD_URL);
    const underReview = own && songUnderReview(song);
    els.submitCommunityBtn.disabled = !(own && configured && !communityUploadRequest && !underReview);
    els.submitCommunityBtn.textContent = underReview ? 'Song under review' : 'Send selected song';
    if (!configured) setCommunitySelection(null, 'Sending songs is not available right now.');
    else if (underReview) setCommunitySelection(song, 'This version is already waiting for review. Edit the song to send a new version.');
    else if (own) setCommunitySelection(song, 'Ready to send for review.');
    else setCommunitySelection(null, 'First select one of your own songs in My songs.');
    resetCommunityProgress();
    openDialog(els.communityDialog);
  }

  function validCommunityOrigin(origin) {
    try {
      const url = new URL(origin);
      return url.protocol === 'https:' && (url.hostname === 'script.google.com' || url.hostname.endsWith('.googleusercontent.com'));
    } catch (error) { return false; }
  }

  function pollCommunityStatus(nonce) {
    if (!communityUploadRequest || communityUploadRequest.nonce !== nonce) return;
    const script = document.createElement('script');
    const url = new URL(COMMUNITY_UPLOAD_URL);
    url.searchParams.set('nonce', nonce);
    url.searchParams.set('callback', COMMUNITY_STATUS_CALLBACK);
    url.searchParams.set('status-check', String(Date.now()));
    script.src = url.href;
    script.async = true;
    script.onload = script.onerror = () => script.remove();
    document.head.appendChild(script);
  }

  window[COMMUNITY_STATUS_CALLBACK] = response => {
    const request = communityUploadRequest;
    if (!request || !response || response.pending || response.nonce !== request.nonce) return;
    finishCommunityUpload(request.nonce, Boolean(response.ok), String(response.message || ''));
  };

  function finishCommunityUpload(nonce, ok, message) {
    const request = communityUploadRequest;
    if (!request || request.nonce !== nonce) return;
    clearInterval(request.progressTimer);
    clearInterval(request.pollTimer);
    clearTimeout(request.timeoutTimer);
    window.removeEventListener('message', request.onMessage);
    request.form.remove();
    setTimeout(() => request.frame.remove(), 80);
    communityUploadRequest = null;
    const song = state.song;
    if (ok) {
      if (song && song.folder === 'mine') {
        song.communitySubmittedFingerprint = communityFingerprint(song);
        saveMySongs();
      }
      setCommunityProgress(100, message || 'Song sent for review.', 'success');
      els.submitCommunityBtn.textContent = 'Song under review';
      els.submitCommunityBtn.disabled = true;
      setCommunitySelection(song, 'Sent! It is waiting for review. Edit the song to send a new version.');
      showToast(message || 'Song sent for review.', 'success');
      return;
    }
    setCommunityProgress(request.progress, message || 'Upload failed. Please try again.', 'error');
    els.submitCommunityBtn.textContent = 'Try again';
    els.submitCommunityBtn.disabled = false;
    showToast(message || 'The song could not be sent.', 'warning');
  }

  function submitCommunitySong() {
    const song = state.song;
    if (!song || song.folder !== 'mine') { showToast('Select one of your own songs first.', 'warning'); return; }
    if (!COMMUNITY_UPLOAD_URL || communityUploadRequest) return;
    if (songUnderReview(song)) { showToast('This version is already waiting for review.', 'warning'); return; }
    const payload = { format: SONG_FORMAT, song: { title: song.title, artist: song.artist || '', bpm: song.bpm, beatsPerBar: song.beatsPerBar, scale: 'D Kurd', sequence: song.sequence, zones: song.zones, folder: 'community' } };
    const nonce = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : `community-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    const frame = document.createElement('iframe');
    frame.name = `community-upload-${nonce.replace(/[^a-z0-9]/gi, '')}`;
    frame.title = 'Community upload';
    frame.hidden = true;
    const form = document.createElement('form');
    form.method = 'post';
    form.action = COMMUNITY_UPLOAD_URL;
    form.target = frame.name;
    form.acceptCharset = 'UTF-8';
    form.hidden = true;
    [['payload', JSON.stringify(payload)], ['nonce', nonce], ['website', '']].forEach(([name, value]) => {
      const field = document.createElement('input');
      field.type = 'hidden';
      field.name = name;
      field.value = value;
      form.appendChild(field);
    });
    const onMessage = event => {
      if (!validCommunityOrigin(event.origin)) return;
      const data = event.data;
      if (!data || data.type !== 'ethereal-community-upload' || data.nonce !== nonce) return;
      finishCommunityUpload(nonce, Boolean(data.ok), String(data.message || ''));
    };
    communityUploadRequest = { nonce, frame, form, onMessage, progress: 6, progressTimer: 0, pollTimer: 0, timeoutTimer: 0 };
    window.addEventListener('message', onMessage);
    document.body.append(frame, form);
    els.submitCommunityBtn.disabled = true;
    els.submitCommunityBtn.textContent = 'Sending...';
    setCommunityProgress(6, 'Uploading song...');
    communityUploadRequest.progressTimer = setInterval(() => {
      const request = communityUploadRequest;
      if (!request || request.nonce !== nonce) return;
      request.progress = Math.min(92, request.progress + Math.max(1, (92 - request.progress) * 0.08));
      setCommunityProgress(request.progress, 'Uploading song...');
    }, 220);
    communityUploadRequest.timeoutTimer = setTimeout(() => finishCommunityUpload(nonce, false, 'The upload timed out. Please try again.'), 45000);
    form.submit();
    pollCommunityStatus(nonce);
    communityUploadRequest.pollTimer = setInterval(() => pollCommunityStatus(nonce), 800);
  }

  function bindCommunity() {
    updateLibraryCounts();
    els.libraryBtn.addEventListener('click', openSongLibrary);
    els.libraryCommunityInfoBtn.addEventListener('click', () => { els.songLibraryDialog.close(); openCommunityDialog(); });
    els.submitCommunityBtn.addEventListener('click', submitCommunitySong);
    els.librarySearch.addEventListener('input', renderSongLibrary);
    document.querySelectorAll('[data-library-tab]').forEach(button => button.addEventListener('click', () => { library.tab = button.dataset.libraryTab; renderSongLibrary(); }));
  }

  /* ---------- Install as an app ---------- */

  const install = { prompt: null };

  function appIsInstalled() {
    return window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;
  }

  function setupInstallButton() {
    els.installBtn.hidden = appIsInstalled();
    window.addEventListener('beforeinstallprompt', event => {
      event.preventDefault();
      install.prompt = event;
      els.installBtn.hidden = appIsInstalled();
    });
    window.addEventListener('appinstalled', () => {
      install.prompt = null;
      els.installBtn.hidden = true;
      showToast('Installed. Find Ethereal Handpan on your home screen.', 'success');
    });
    els.installBtn.addEventListener('click', async () => {
      if (install.prompt) {
        install.prompt.prompt();
        try { await install.prompt.userChoice; } catch (error) { /* ignored */ }
        install.prompt = null;
        return;
      }
      const ua = navigator.userAgent;
      let text;
      if (location.protocol === 'file:') text = 'Open the trainer from its website (for example your GitHub Pages link) to install it. A file opened from the computer cannot be installed.';
      else if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) text = 'On iPhone and iPad: tap the Share button in Safari, then Add to Home Screen.';
      else if (/Firefox/.test(ua)) text = 'In Firefox: open the ⋮ menu and choose Install (or Add to Home screen).';
      else if (/SamsungBrowser/.test(ua)) text = 'In Samsung Internet: open the ☰ menu and choose Add page to → Home screen.';
      else if (/Android/.test(ua)) text = 'Open the ⋮ browser menu and choose Install app or Add to Home screen.';
      else text = 'Click the install icon at the right end of the address bar, or open the browser menu and choose Install Ethereal Handpan. Safari on Mac: File → Add to Dock.';
      els.installHelpText.textContent = text;
      openDialog(els.installDialog);
    });
  }

  /* ---------- Song editor: the song as boxes, one per beat ---------- */

  function sequenceTokens(text) {
    // The same split as parseSequence (comments out, bars on their own), but remembering
    // where every token sits in the text.
    const masked = text.replace(/#[^\n]*/g, match => ' '.repeat(match.length));
    const tokens = [];
    const pattern = /\||[^\s|]+/g;
    let match;
    while ((match = pattern.exec(masked))) tokens.push({ text: match[0], from: match.index, to: match.index + match[0].length });
    return tokens;
  }

  function rhythmCells(text, parsed) {
    let beat = 0;
    let k = 0;
    const cells = [];
    sequenceTokens(text).forEach(token => {
      if (token.text === '|') { cells.push({ ...token, kind: 'bar', beat, dur: 0 }); return; }
      const { core, duration } = splitToken(token.text);
      if (!Number.isFinite(duration)) { cells.push({ ...token, kind: 'error', beat, dur: 0 }); return; }
      if (core === '-' || core === '0' || core === '.' || core === '') { cells.push({ ...token, kind: 'rest', beat, dur: duration }); beat += duration; return; }
      const parts = core.split('+').filter(Boolean);
      if (!parts.length || !parts.every(part => parsePart(part))) { cells.push({ ...token, kind: 'error', beat, dur: duration }); beat += duration; return; }
      cells.push({ ...token, kind: 'stroke', beat, dur: duration, event: parsed.events[k], eventIndex: k });
      k += 1;
      beat += duration;
    });
    return { cells, total: beat };
  }

  function renderRhythmView(parsed = editorParsed()) {
    const view = els.rhythmView;
    if (!view) return;
    const text = els.sequenceInput.value;
    const { cells, total } = rhythmCells(text, parsed);
    const meter = Math.max(1, Number(els.songMeterInput.value) || 4);
    const timed = cells.filter(cell => cell.kind !== 'bar' && cell.dur > 0);
    if (!timed.length) {
      view.innerHTML = '<p class="rv-empty">Tap the handpan to add strokes. Each box is one beat.</p>';
      return;
    }
    // The smallest grid that fits every stroke: whole, half, third, quarter... beats.
    const sub = [1, 2, 3, 4, 6, 8, 12].find(n => timed.every(cell => Math.abs(cell.beat * n - Math.round(cell.beat * n)) < 0.02 && Math.abs(cell.dur * n - Math.round(cell.dur * n)) < 0.02)) || 12;
    // Rows: one per bar; a long stretch without bar lines wraps every bar's worth of beats.
    const starts = [0];
    cells.filter(cell => cell.kind === 'bar').forEach(cell => { if (cell.beat > starts[starts.length - 1] + 1e-6 && cell.beat < total - 1e-6) starts.push(cell.beat); });
    const rows = [];
    starts.forEach((start, i) => {
      const end = i + 1 < starts.length ? starts[i + 1] : total;
      for (let a = start; a < end - 1e-6; a += meter) rows.push({ start: a, end: Math.min(end, a + meter) });
    });
    // Comments become little headings above the row where they start.
    const headings = new Map();
    const commentPattern = /#([^\n]*)/g;
    let comment;
    while ((comment = commentPattern.exec(text))) {
      const next = cells.find(cell => cell.from > comment.index && cell.kind !== 'bar');
      if (!next) continue;
      const row = rows.findIndex(r => next.beat >= r.start - 1e-6 && next.beat < r.end - 1e-6);
      if (row < 0) continue;
      headings.set(row, [...(headings.get(row) || []), comment[1].trim()].filter(Boolean));
    }
    const caret = els.sequenceInput.selectionEnd;
    const atEnd = !text.slice(caret).trim();
    const label = item => item.fx ? 'M' : isPercId(item.pad) ? strokeMark(item.pad) : state.padMap.get(item.pad)?.label || item.pad;
    const maxBeats = Math.max(...rows.map(row => Math.ceil(row.end - row.start - 1e-6)), 1);
    const room = (view.clientWidth || 340) - 40;
    const beatW = Math.max(50, Math.min(124, Math.floor(room / Math.max(maxBeats, 4))));
    view.style.setProperty('--rv-width', `${maxBeats * beatW + 22}px`);
    const html = rows.map((row, r) => {
      const beats = Math.max(1, Math.ceil(row.end - row.start - 1e-6));
      const columns = beats * sub;
      let inner = '';
      for (let b = 0; b < beats; b += 1) inner += `<i class="rv-beat" style="grid-column:${b * sub + 1} / span ${sub}" data-n="${b + 1}"></i>`;
      cells.forEach(cell => {
        if (cell.kind === 'bar' || cell.dur <= 0) return;
        if (cell.beat < row.start - 1e-6 || cell.beat >= row.end - 1e-6) return;
        const col = Math.round((cell.beat - row.start) * sub) + 1;
        const span = Math.max(1, Math.round(Math.min(cell.dur, row.end - cell.beat) * sub));
        const narrow = span / sub < 0.5 ? ' narrow' : '';
        const cursor = !atEnd && cell.to === caret ? ' at-cursor' : '';
        const pos = `style="grid-column:${col} / span ${span}" data-from="${cell.from}" data-to="${cell.to}"`;
        if (cell.kind === 'rest') {
          inner += `<button type="button" class="rv-cell rest${narrow}${cursor}" ${pos} aria-label="Rest">-<span class="rv-del" aria-label="Remove">×</span></button>`;
        } else if (cell.kind === 'error') {
          inner += `<button type="button" class="rv-cell error${narrow}${cursor}" ${pos} aria-label="Not understood">?<span class="rv-del" aria-label="Remove">×</span></button>`;
        } else {
          const items = cell.event?.items || [];
          const notes = items.map(item => `<b class="h-${item.hand || 'R'}${item.fx ? ' fx' : item.missing ? ' missing' : ''}${item.ghost ? ' ghost' : ''}${item.flam ? ' flam' : ''}">${escapeHtml(label(item))}</b>`).join('');
          const hands = items.map(item => `<i class="h-${item.hand || 'R'}">${item.fx ? '' : item.hand || ''}</i>`).join('');
          inner += `<button type="button" class="rv-cell stroke${items.length > 1 ? ' chord' : ''}${narrow}${cursor}" ${pos} data-event="${cell.eventIndex}"><span class="rv-notes">${notes}</span><span class="rv-hands">${hands}</span><span class="rv-del" aria-label="Remove">×</span></button>`;
        }
      });
      const head = (headings.get(r) || []).map(t => `<p class="rv-section">${escapeHtml(t)}</p>`).join('');
      return `${head}<div class="rv-row"><span class="rv-bar-num">${r + 1}</span><div class="rv-grid" style="grid-template-columns:repeat(${columns}, minmax(0,1fr)); width:${beats * beatW}px">${inner}</div></div>`;
    }).join('');
    view.innerHTML = `<div class="rv-inner">${html}</div>`;
  }

  function bindRhythmView() {
    els.rhythmView.addEventListener('click', event => {
      const input = els.sequenceInput;
      const cell = event.target.closest('.rv-cell');
      if (!cell) {
        input.selectionStart = input.selectionEnd = input.value.length;
        renderRhythmView();
        return;
      }
      const from = Number(cell.dataset.from);
      const to = Number(cell.dataset.to);
      if (event.target.closest('.rv-del') && cell.classList.contains('at-cursor')) {
        // Remove this stroke (and one space next to it).
        const text = input.value;
        const end = text[to] === ' ' ? to + 1 : to;
        input.value = text.slice(0, from) + text.slice(end);
        input.selectionStart = input.selectionEnd = from;
        updateSequenceStatus();
        return;
      }
      if (cell.classList.contains('at-cursor')) input.selectionStart = input.selectionEnd = input.value.length;
      else input.selectionStart = input.selectionEnd = to;
      renderRhythmView();
    });
    els.textModeBtn.addEventListener('click', () => {
      const on = !els.editorDialog.classList.contains('text-mode');
      els.editorDialog.classList.toggle('text-mode', on);
      els.textModeBtn.setAttribute('aria-pressed', String(on));
      els.textModeBtn.textContent = on ? 'Hide text' : 'Edit as text';
    });
    ['keyup', 'click', 'select'].forEach(type => els.sequenceInput.addEventListener(type, () => renderRhythmView()));
    els.songMeterInput.addEventListener('change', () => renderRhythmView());
  }

  function saveEditorSong(event) {
    event.preventDefault();
    const title = els.songTitleInput.value.trim();
    const parsed = editorParsed();
    if (!title) { els.songTitleInput.focus(); showToast('Give the song a title.', 'warning'); return; }
    if (!parsed.events.length) { els.sequenceInput.focus(); showToast('Add at least one stroke.', 'warning'); return; }
    if (parsed.errors.length) { showToast(`Fix the strokes that were not understood: ${parsed.errors.slice(0, 3).join(' ')}`, 'warning'); return; }
    const data = {
      title,
      bpm: Math.min(260, Math.max(20, Math.round(Number(els.songBpmInput.value) || 90))),
      beatsPerBar: Number(els.songMeterInput.value) || 4,
      sequence: els.sequenceInput.value.trim()
    };
    const zones = editorSongZones();
    if (zones) data.zones = zones;
    let song;
    if (editor.songId) {
      song = state.mySongs.find(s => s.id === editor.songId);
      Object.assign(song, data);
      if (!zones) delete song.zones;
    } else {
      song = normaliseSong(data, 'mine');
      state.mySongs.push(song);
    }
    saveMySongs();
    clearDraft();
    cancelScheduledAudio(audio.preview);
    closeDialog(els.editorDialog);
    selectSong(song.id);
    showToast('Song saved to My songs.', 'success');
    GAME.event('composer').forEach((item, index) => setTimeout(() => showToast(`${item.icon} ${item.text}`, 'success'), 1400 * (index + 1)));
  }

  function deleteSong(id) {
    const song = state.mySongs.find(s => s.id === id);
    if (!song) return;
    if (!window.confirm(`Delete “${song.title}” from My songs? Export it first if you want a backup.`)) return;
    state.mySongs = state.mySongs.filter(s => s.id !== id);
    saveMySongs();
    clearDraft(`song:${id}`);
    editor.draftKey = '';
    closeDialog(els.editorDialog);
    selectSong(state.demoSongs[0]?.id);
    showToast('Song deleted.', 'success');
  }

  function exportSong() {
    const song = state.song;
    if (!song) return;
    const documentData = { format: SONG_FORMAT, song: { title: song.title, artist: song.artist || undefined, bpm: song.bpm, beatsPerBar: song.beatsPerBar, scale: 'D Kurd', sequence: song.sequence, zones: song.zones } };
    const blob = new Blob([JSON.stringify(documentData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${slugify(song.title) || 'handpan-song'}.handsong`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast('Song exported.', 'success');
  }

  async function importSongFile(file) {
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      const raw = data && data.song ? data.song : data;
      const song = normaliseSong({ ...raw, id: undefined }, 'mine');
      if (!song) throw new Error('missing title or strokes');
      state.mySongs.push(song);
      saveMySongs();
      if (els.editorDialog.open) closeDialog(els.editorDialog);
      selectSong(song.id);
      showToast(`Imported “${song.title}”.`, 'success');
    } catch (error) {
      showToast('That file is not a handpan song (.handsong).', 'warning');
    } finally {
      els.importFile.value = '';
    }
  }

  /* ------------------------------------------------------------------ */
  /* My handpan                                                          */
  /* ------------------------------------------------------------------ */

  function openSettings() {
    renderSettings();
    openDialog(els.settingsDialog);
  }

  function renderSettingsDrum() {
    const pads = buildPads(state.instrument, undefined, DEFAULT_ZONE_CTX);
    const drum = buildDrumSvg({ interactive: true, className: 'settings-svg', showAllPerc: true, pads, onTap: padId => { ensureAudio().then(() => playPad(padId)).catch(() => {}); } });
    state.settingsDrum = drum;
    els.settingsDrum.replaceChildren(drum.svg);
    bindPercDrag(drum);
  }

  function renderSettings() {
    const inst = state.instrument;
    els.scaleCards.innerHTML = Object.values(SCALES).map(scale => {
      const notes = [scale.ding, ...scale.top].join(' ');
      const extra = scale.bottoms ? ` + ${inst.bottoms.join(' ')} below` : '';
      return `<button type="button" class="scale-card${inst.scale === scale.id ? ' active' : ''}" data-scale="${scale.id}" role="radio" aria-checked="${inst.scale === scale.id}"><b>${scale.name}</b><span>${notes}${extra}</span></button>`;
    }).join('');
    const scale = SCALES[inst.scale];
    if (scale.bottoms) {
      els.bottomsConfig.hidden = false;
      els.bottomsConfig.innerHTML = `<p class="settings-note">Bottom notes differ between makers. Pick the two on your drum:</p>
        <div class="bottoms-row">${[0, 1].map(i => `<label>B${i + 1}<select data-bottom="${i}">${BOTTOM_CHOICES.map(n => `<option${n === inst.bottoms[i] ? ' selected' : ''}>${n}</option>`).join('')}</select></label>`).join('')}</div>`;
    } else {
      els.bottomsConfig.hidden = true;
      els.bottomsConfig.innerHTML = '';
    }
    els.noteTable.innerHTML = state.pads.filter(p => p.kind !== 'perc').map(pad =>
      `<div class="note-row"><b style="--note:${pad.color}">${pad.label}</b><span>${pad.name}</span><em>${frequencyForMidi(pad.midi).toFixed(1)} Hz</em><button type="button" class="note-play" data-play="${pad.id}" aria-label="Play ${pad.label}">▶</button></div>`
    ).join('');
    els.percToggle.checked = inst.percussion;
    els.mirrorToggle.checked = inst.mirror;
    els.mirrorToggle.disabled = !inst.percussion;
    els.handColorsToggle.checked = inst.handColors;
    els.noteNamesToggle.checked = inst.noteNames;
    els.usedLanesToggle.checked = inst.usedLanes;
    els.resetPercBtn.disabled = !inst.percussion;
    updateLayoutCards();
    renderSettingsDrum();
  }

  function bindPercDrag(drum) {
    let drag = null;
    drum.svg.addEventListener('pointerdown', event => {
      const g = event.target.closest('.pad-perc');
      if (!g) return;
      drag = { id: g.getAttribute('data-pad'), g, pointer: event.pointerId };
      drum.svg.setPointerCapture(event.pointerId);
      g.classList.add('dragging');
    });
    drum.svg.addEventListener('pointermove', event => {
      if (!drag || event.pointerId !== drag.pointer) return;
      const point = drum.svg.createSVGPoint();
      point.x = event.clientX;
      point.y = event.clientY;
      const local = point.matrixTransform(drum.svg.getScreenCTM().inverse());
      // The zone slides round the notes to the nearest free metal.
      const pads = drum.options.pads || state.pads;
      const { x, y } = snapZone(local.x, local.y, drag.id, pads, pads.filter(pad => pad.kind === 'perc' && pad.id !== drag.id));
      drag.x = x;
      drag.y = y;
      drag.g.setAttribute('transform', `translate(${x.toFixed(4)} ${y.toFixed(4)})`);
    });
    const end = event => {
      if (!drag || event.pointerId !== drag.pointer) return;
      drag.g.classList.remove('dragging');
      if (Number.isFinite(drag.x)) {
        const inst = state.instrument;
        const mirrored = inst.mirror && drag.id !== 'SL' && drag.id !== 'SR';
        const stored = { x: mirrored ? -drag.x : drag.x, y: drag.y };
        // Only the dragged zone is stored; the others keep following the layout.
        inst.percPos[inst.scale] = { ...(inst.percPos[inst.scale] || {}), [drag.id]: stored };
        applyInstrumentChange({ keepSettingsDrum: true });
      }
      drag = null;
    };
    drum.svg.addEventListener('pointerup', end);
    drum.svg.addEventListener('pointercancel', end);
  }

  function applyInstrumentChange(options = {}) {
    saveInstrument();
    const wasPlaying = state.playing;
    pausePlayback();
    state.pads = buildPads(state.instrument);
    state.padMap = new Map(state.pads.map(p => [p.id, p]));
    const position = state.songTime;
    if (state.song) {
      state.parsed = parseSong(state.song);
      resetRun(Math.min(position, state.parsed.duration));
    }
    rebuildLanes();
    renderDrums();
    renderSongHeader();
    renderSongList();
    if (els.settingsDialog.open) {
      if (options.keepSettingsDrum) renderSettingsDrum();
      else renderSettings();
    }
    audio.rendering = audio.ctx ? renderAllSounds() : null;
    resizeCanvas();
    if (wasPlaying) startPlayback();
  }

  /* ------------------------------------------------------------------ */
  /* Rotating the handpan                                                */
  /* ------------------------------------------------------------------ */

  const rotation = { raf: 0, current: null };

  function rotationStep() {
    return 360 / SCALES[state.instrument.scale].top.length / 2;
  }

  // Move the pads of the drums already on screen, without rebuilding them, so the
  // rotation can animate smoothly (also during playback).
  function setPadGeometry(pads) {
    state.pads = pads;
    state.padMap = new Map(pads.map(pad => [pad.id, pad]));
    [...state.drums, editor.drum, state.settingsDrum].filter(Boolean).forEach(drum => drum.padEls.forEach((g, id) => {
      const pad = state.padMap.get(id);
      if (!pad || (pad.kind === 'perc' && !state.drums.includes(drum))) return;
      g.setAttribute('transform', `translate(${pad.x.toFixed(4)} ${pad.y.toFixed(4)})`);
      const inner = g.querySelector(':scope > g');
      if (inner) inner.setAttribute('transform', `rotate(${pad.rot.toFixed(2)})`);
    }));
  }

  function applyPadGeometry(pads) {
    setPadGeometry(pads);
    invalidateGuides();
    requestFrame();
  }

  function animateRotationTo(targetSteps) {
    const inst = state.instrument;
    const count = SCALES[inst.scale].top.length;
    const step = rotationStep();
    const from = rotation.current ?? (inst.rotationSteps || 0) * step;
    // Take the shorter way round.
    let to = targetSteps * step;
    while (to - from > 180) to -= 360;
    while (from - to > 180) to += 360;
    inst.rotationSteps = ((targetSteps % (count * 2)) + count * 2) % (count * 2);
    cancelAnimationFrame(rotation.raf);
    const started = performance.now();
    const tick = now => {
      const p = Math.min(1, (now - started) / 420);
      const eased = 1 - Math.pow(1 - p, 3);
      rotation.current = from + (to - from) * eased;
      applyPadGeometry(buildPads(inst, rotation.current));
      if (p < 1) {
        rotation.raf = requestAnimationFrame(tick);
        return;
      }
      rotation.current = null;
      saveInstrument();
      applyPadGeometry(buildPads(inst));
      rebuildLanes();
      renderDrums();
      if (els.settingsDialog.open) renderSettings();
      if (els.editorDialog.open) renderComposeDrum();
    };
    rotation.raf = requestAnimationFrame(tick);
  }

  function rotateDrum(direction = 1) {
    const current = rotation.current !== null ? Math.round(rotation.current / rotationStep()) : (state.instrument.rotationSteps || 0);
    animateRotationTo(current + direction);
  }

  function updateLayoutCards() {
    const count = SCALES[state.instrument.scale].top.length;
    const steps = ((state.instrument.rotationSteps % (count * 2)) + count * 2) % (count * 2);
    els.layoutRow.querySelectorAll('[data-layout]').forEach(card => card.classList.toggle('active', Number(card.dataset.layout) === steps));
  }

  /* ------------------------------------------------------------------ */
  /* Song tape: the strokes as numbers along the bottom of the stage     */
  /* ------------------------------------------------------------------ */

  const tape = { parsed: null, key: '', events: [], pxPerBeat: 60, width: 0, playheadX: 0, lastX: null, visible: false, judgeTimer: 0 };

  function tapeWanted() {
    return state.view === 'radial' && state.mode !== 'tuner' && Boolean(state.parsed?.events.length);
  }

  function tapeLabel(padId) {
    const pad = state.padMap.get(padId);
    if (pad?.kind === 'perc' || (!pad && isPercId(padId))) return strokeMark(padId);
    return pad?.label || padId;
  }

  function tapePitch(padId) {
    const pad = state.padMap.get(padId);
    if (!pad) return 0;
    return pad.kind === 'perc' ? 200 : pad.midi || 0;
  }

  function buildTape() {
    const parsed = state.parsed;
    tape.parsed = parsed;
    tape.key = `${state.instrument.handColors ? 'h' : 'n'}|${state.instrument.scale}`;
    tape.events = [];
    tape.lastX = null;
    els.noteTapeTrack.replaceChildren();
    if (!parsed || !parsed.events.length) return;
    let minGap = Infinity;
    for (let i = 1; i < parsed.events.length; i += 1) {
      const gap = parsed.events[i].beat - parsed.events[i - 1].beat;
      if (gap > 1e-3) minGap = Math.min(minGap, gap);
    }
    if (!Number.isFinite(minGap)) minGap = 1;
    const ppb = Math.max(34, Math.min(96, 25 / minGap));
    tape.pxPerBeat = ppb;
    const frag = document.createDocumentFragment();
    for (let beat = 0; beat <= Math.ceil(parsed.totalBeats); beat += 1) {
      const tick = document.createElement('i');
      tick.className = 'tape-beat';
      tick.style.left = `${(beat * ppb).toFixed(1)}px`;
      frag.appendChild(tick);
    }
    parsed.bars.slice(0, -1).forEach((beat, index) => {
      const bar = document.createElement('i');
      bar.className = 'tape-bar';
      bar.style.left = `${(beat * ppb).toFixed(1)}px`;
      bar.dataset.bar = String(index + 1);
      frag.appendChild(bar);
    });
    parsed.events.forEach(event => {
      const items = event.items.filter(item => !item.missing || item.fx).sort((a, b) => tapePitch(b.pad) - tapePitch(a.pad));
      if (!items.length) return;
      const col = document.createElement('span');
      col.className = `tape-ev${items.length > 1 ? ` chord chord-${Math.min(3, items.length)}` : ''}`;
      col.style.left = `${(event.beat * ppb).toFixed(1)}px`;
      const chips = items.map(item => {
        const chip = document.createElement('b');
        chip.textContent = item.fx ? 'M' : tapeLabel(item.pad);
        const base = [item.ghost ? 'ghost' : '', item.flam ? 'flam' : '', item.fx ? 'fx' : ''].filter(Boolean).join(' ');
        chip.className = base;
        chip.style.setProperty('--c', item.fx ? '#94a3b8' : itemColor(item));
        col.appendChild(chip);
        return { item, chip, cls: base, base };
      });
      frag.appendChild(col);
      tape.events.push({ event, col, chips, cls: '' });
    });
    els.noteTapeTrack.appendChild(frag);
  }

  function placeTape(layout, width, height) {
    const show = tapeWanted();
    tape.visible = show;
    placeProgressInTape(show && (document.body.classList.contains('wide-fit') || window.innerWidth <= 760));
    els.noteTape.hidden = !show;
    if (!show) return;
    const tapeH = width <= 760 ? 46 : 52;
    // Sit just above whatever controls are anchored to the bottom of the stage.
    const stage = els.noteStage.getBoundingClientRect();
    let controlsTop = height;
    [els.noteStage.querySelector('.rotate-drum-pair'), els.focusModeBtn, els.stageSongName, els.stageDock, els.speedCycleBtn].forEach(el => {
      if (!el) return;
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) return;
      const top = r.top - stage.top;
      if (top > height * 0.55) controlsTop = Math.min(controlsTop, top);
    });
    const bottomGap = controlsTop < height ? height - controlsTop + 8 : 12;
    const top = Math.round(height - bottomGap - tapeH);
    els.noteTape.style.top = `${top}px`;
    els.noteTape.style.height = `${tapeH}px`;
    tape.width = Math.max(120, width - 24);
    tape.playheadX = Math.round(tape.width * (window.innerWidth > 760 ? 0.5 : 0.3));
    els.noteTape.style.setProperty('--playhead', `${tape.playheadX}px`);
    tape.lastX = null;
    // The handpan moves up (and only shrinks if it really has to) to clear the tape.
    const drum = layout.drum;
    if (!drum) return;
    const ext = state.pads.some(pad => pad.kind === 'bottom') ? 0.66 : 0.53;
    const maxBottom = top - 6;
    const topReserve = width <= 900 ? 60 : 18;
    if (width <= 760) {
      // Phones: centre the handpan in the space between the stats row and the tape.
      const room = maxBottom - topReserve;
      const wanted = Math.max(drum.drumSize, Math.min(width * 0.86, 400));
      drum.drumSize = Math.max(170, Math.min(wanted, (room - 8) / (0.53 + ext)));
      drum.cy = topReserve + drum.drumSize * 0.53 + Math.max(0, (room - drum.drumSize * (0.53 + ext)) * 0.62);
      drum.scale = drum.drumSize / STAGE_DRUM_BASE;
      return;
    }
    // Tablets and computers: the same room above and below the handpan for the notes
    // flying in. The Wait for note banner keeps the top 60 px.
    const minTop = 60;
    const free = maxBottom - 12;
    const grown = document.body.classList.contains('tablet-fit') ? Math.max(drum.drumSize, Math.min(width * 0.62, 600)) : drum.drumSize;
    const margin = Math.max(20, free * 0.08);
    drum.drumSize = Math.max(170, Math.min(grown, (free - 2 * margin) / (0.53 + ext), (maxBottom - minTop - 6) / (0.53 + ext)));
    const span = drum.drumSize * (0.53 + ext);
    const spanTop = Math.max(minTop, 12 + (free - span) / 2);
    drum.cy = spanTop + drum.drumSize * 0.53;
    drum.scale = drum.drumSize / STAGE_DRUM_BASE;
  }

  function firstTapeIndexAt(beat) {
    let lo = 0;
    let hi = tape.events.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (tape.events[mid].event.beat < beat) lo = mid + 1; else hi = mid;
    }
    return lo;
  }

  function updateTape(songTime) {
    if (!tape.visible) return;
    if (tape.parsed !== state.parsed || tape.key !== `${state.instrument.handColors ? 'h' : 'n'}|${state.instrument.scale}`) buildTape();
    if (!tape.events.length) return;
    const ppb = tape.pxPerBeat;
    const beat = songTime / state.parsed.spb;
    const x = tape.playheadX - beat * ppb;
    if (tape.lastX === null || Math.abs(x - tape.lastX) > 0.05) {
      els.noteTapeTrack.style.transform = `translate3d(${x.toFixed(1)}px,0,0)`;
      tape.lastX = x;
    }
    const judged = state.mode === 'practice' || state.mode === 'wait';
    const waiting = state.mode === 'wait' && state.holding ? state.parsed.events[state.waitIdx] : null;
    const from = Math.max(0, firstTapeIndexAt(beat - tape.playheadX / ppb - 2));
    const to = Math.min(tape.events.length, firstTapeIndexAt(beat + (tape.width - tape.playheadX) / ppb + 2));
    for (let i = from; i < to; i += 1) {
      const entry = tape.events[i];
      const ev = entry.event;
      // "Now" only while the stroke is inside the playhead box.
      const hold = Math.min(Math.max(0.3, Math.min(0.9, ev.durBeats * 0.85)), 17 / ppb);
      let cls;
      if (waiting === ev || (beat >= ev.beat - 0.06 && beat < ev.beat + hold)) cls = 'tape-ev now';
      else if (beat >= ev.beat) cls = 'tape-ev past';
      else cls = 'tape-ev';
      if (entry.chips.length > 1) cls += ` chord chord-${Math.min(3, entry.chips.length)}`;
      if (cls !== entry.cls) {
        entry.col.className = cls;
        entry.cls = cls;
      }
      entry.chips.forEach(chip => {
        const result = judged ? state.results.get(chip.item.id) : null;
        const c = [chip.base, result ? `r-${result}` : ''].filter(Boolean).join(' ');
        if (c !== chip.cls) {
          chip.chip.className = c;
          chip.cls = c;
        }
      });
    }
  }

  const JUDGE_TEXT = { perfect: 'Perfect', good: 'Good', hit: 'Nice', miss: 'Miss', wrong: 'Wrong note' };

  // A small "Perfect ×12" / "Miss" pop above the tape, like a rhythm game.
  function tapeJudge(kind) {
    GAME?.judge(kind, state.streak, state.mode);
    if (!JUDGE_TEXT[kind] || state.mode === 'tuner') return;
    const el = els.noteTapeJudge;
    const good = kind === 'perfect' || kind === 'good' || kind === 'hit';
    el.innerHTML = `${JUDGE_TEXT[kind]}${good && state.streak >= 3 ? ` <em>×${state.streak}</em>` : ''}`;
    el.dataset.kind = kind;
    el.classList.remove('pop');
    void el.offsetWidth;
    el.classList.add('pop');
    clearTimeout(tape.judgeTimer);
    tape.judgeTimer = setTimeout(() => el.classList.remove('pop'), 900);
    const big = els.stageJudge;
    big.innerHTML = el.innerHTML;
    big.dataset.kind = kind;
    big.classList.toggle('below-banner', state.mode === 'wait');
    big.classList.remove('pop');
    void big.offsetWidth;
    big.classList.add('pop');
  }

  /* ------------------------------------------------------------------ */
  /* Demo tour (Interstellar plays, the handpan drifts like a saucer)    */
  /* ------------------------------------------------------------------ */

  const STORAGE_TOUR_SEEN = 'ethereal-handpan-tour-seen-v1';
  const SPIN_DEG_PER_SECOND = -4; // clockwise, one turn in 90 s
  const spin = { active: false, start: 0, base: 0 };
  const tour = { active: false, steps: [], index: 0, previous: null, positionRaf: 0 };

  const TOUR_STEPS = [
    {
      target: '#noteStage', scroll: 'start',
      title: 'Welcome to Ethereal Handpan',
      text: 'Interstellar is playing. The handpan drifts through space while every stroke flies along its glowing ray to the field you play: blue for the left hand, amber for the right.'
    },
    {
      target: '#noteTape',
      title: 'The song tape',
      text: 'The notes along the bottom show what is coming and what you just played. Swipe it to jump back or forward in the song. In Practice every note lights up Perfect, Good or Miss.'
    },
    {
      target: '.toolbar-controls .segmented',
      title: 'Listen, practise, learn',
      text: 'Listen just plays the song so you can relax. Practice scores every stroke: Perfect, Good or Miss. Tick Wait for note and the song stops on each stroke until you play it. Tuner checks your handpan against A4 = 440 Hz.'
    },
    {
      target: '#speedCycleBtn',
      title: 'Slow it right down',
      text: 'Tap Speed to go 1x, 0.75x, 0.5x, 0.25x and back. Play opens the full-screen view; tap the song name there to pick another song.'
    },
    {
      target: '.speed-control',
      title: 'Slow it right down',
      text: 'Pick a slower speed while you learn, then speed up. Count-in gives you a bar of clicks before the song starts.'
    },
    {
      target: '#micBtn',
      title: 'Play your real handpan',
      text: 'Got a handpan? Turn on the microphone and the trainer listens to you play. No handpan nearby? Tap the notes on screen (or your keyboard) and play it like a game.'
    },
    {
      target: '#noteStage .rotate-drum-pair',
      title: 'Turn it to match yours',
      text: 'Spin the handpan until the notes sit where yours do. In My Handpan you pick your scale (D Kurd 9, 10 or 12) and where you tap T, K and S.'
    },
    {
      target: '#songList', sidebar: true,
      title: 'Songs and grooves',
      text: 'The Song library: songs, grooves and low-note pieces that open up as you follow the Song path. Your own songs are underneath in My songs.'
    },
    {
      target: '#editBtn',
      title: 'Song Builder',
      text: 'Make your own songs! Every note you tap on the handpan drops into a box, one box per beat (a quick half-beat note takes half a box). Tap a box to slip a note in after it, × to take it out, and ▶ Play to hear your tune.'
    },
    {
      target: '#focusModeBtn',
      title: 'Focus mode',
      text: 'On a phone or tablet, Focus mode gives the whole screen to the handpan, the song name and the tape.'
    },
    {
      target: '#tourBtn',
      title: 'Watch it again any time',
      text: 'The ? replays this tour, and the book opens the strokes, keys and notation help.'
    }
  ];

  function startSpin() {
    cancelAnimationFrame(rotation.raf);
    spin.base = rotation.current ?? (state.instrument.rotationSteps || 0) * rotationStep();
    spin.start = performance.now();
    spin.active = true;
    requestFrame();
  }

  function applySpin(nowMs) {
    if (!spin.active) return;
    rotation.current = spin.base + ((nowMs - spin.start) / 1000) * SPIN_DEG_PER_SECOND;
    setPadGeometry(buildPads(state.instrument, rotation.current));
    // Only the guide rays need redrawing; the starry backdrop keeps its own pace.
    state.staticGuideCanvas = null;
    state.staticGuideKey = '';
  }

  function stopSpin() {
    if (!spin.active) return;
    spin.active = false;
    rotation.current = spin.base + ((performance.now() - spin.start) / 1000) * SPIN_DEG_PER_SECOND;
    // Glide back to the layout the player chose.
    animateRotationTo(state.instrument.rotationSteps || 0);
  }

  function tourSeen() {
    try { return localStorage.getItem(STORAGE_TOUR_SEEN) === 'true'; } catch (error) { return false; }
  }

  function markTourSeen() {
    try { localStorage.setItem(STORAGE_TOUR_SEEN, 'true'); } catch (error) { /* ignored */ }
  }

  function elementVisible(el) {
    if (!el) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden';
  }

  function tourTarget(step) {
    if (!step) return null;
    // A list of places: the first one that is on screen (desktop and phone differ).
    const targets = Array.isArray(step.target) ? step.target : [step.target];
    return targets.map(selector => document.querySelector(selector)).find(el => elementVisible(el)) || document.querySelector(targets[0]);
  }

  const STORAGE_MODE_TOURS = 'ethereal-handpan-mode-tours-v1';
  const MODE_TOURS = {
    practice: [
      { target: '.mode-segmented [data-mode="practice"]', title: 'Practice mode',
        text: 'Play along with the moving song: tap the handpan on screen, use your keyboard, or turn on the microphone and play your real handpan. Every stroke is scored Perfect, Good or Miss.' },
      { target: '#noteStage', title: 'Follow the flying notes',
        text: 'Each note flies to the field you play, blue for the left hand and amber for the right. Play it as it lands on the field.' },
      { target: ['#waitStyleSelect', '#stageWaitBtn'], title: 'Wait for note',
        text: 'Want to learn slowly? Choose Wait for note: the song stops on each stroke until you play it. Game Mode chimes for every right note, Play Note plays the note first, Silent just waits.' },
      { target: ['.stat-pills', '#scorePill', '.mobile-stage-pill'], title: 'Score and streak',
        text: 'Score is your accuracy and streak counts right notes in a row. After a run you get up to five stars, and Smart loop repeats your trickiest bar.' }
    ],
    wait: [
      { target: ['#waitStyleSelect', '#stageWaitBtn'], title: 'Wait for note',
        text: 'The song stops on every stroke until you play it, so you can learn at your own pace. Play in time and it never stops.' },
      { target: '#noteStage', title: 'One stroke at a time',
        text: 'The field to play pulses, and the banner shows which notes and which hand. Small, faint ghost notes do not stop the song.' },
      { target: ['#micBtn', '#stageMicBtn', '#micChipBtn'], title: 'Use your real handpan',
        text: 'Turn on the microphone and the trainer hears your handpan. You can also tap the screen or use the keyboard.' }
    ],
    tuner: [
      { target: '.mode-segmented [data-mode="tuner"]', title: 'Tuner mode',
        text: 'The tuner listens to one note at a time and compares it with A4 = 440 Hz.' },
      { target: ['#micBtn', '#stageMicBtn', '#micChipBtn'], title: 'Allow the microphone',
        text: 'Turn on the microphone, then strike one note clearly. A quiet room gives the steadiest reading.' },
      { target: '#tunerPanel', title: 'Read the meter',
        text: 'The centre is in tune, the left side is flat and the right side is sharp. A few cents either way is normal while a note rings out.' }
    ]
  };

  function modeToursSeen() {
    try { return JSON.parse(localStorage.getItem(STORAGE_MODE_TOURS) || '[]'); } catch (error) { return []; }
  }

  function startModeTour(mode) {
    if (tour.active || !MODE_TOURS[mode]) return;
    tour.active = true;
    tour.kind = 'mode';
    tour.mode = mode;
    tour.index = 0;
    tour.previous = null;
    els.tourOverlay.hidden = false;
    els.tourSoundBtn.hidden = true;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      tour.steps = MODE_TOURS[mode].filter(step => elementVisible(tourTarget(step)));
      if (!tour.steps.length) { finishTour(); return; }
      renderTourStep();
    }));
    setTimeout(() => els.tourNextBtn.focus(), 60);
  }

  function maybeStartModeTour(mode) {
    if (!MODE_TOURS[mode] || modeToursSeen().includes(mode) || !tourSeen()) return;
    setTimeout(() => { if (!document.querySelector('dialog[open]')) startModeTour(mode); }, 120);
  }

  function positionTour() {
    if (!tour.active) return;
    const target = tourTarget(tour.steps[tour.index]);
    if (!target) return;
    const rect = target.getBoundingClientRect();
    const padding = 7;
    const focusLeft = Math.max(4, rect.left - padding);
    const focusTop = Math.max(4, rect.top - padding);
    const focusRight = Math.min(window.innerWidth - 4, rect.right + padding);
    const focusBottom = Math.min(window.innerHeight - 4, rect.bottom + padding);
    const focusWidth = Math.max(28, focusRight - focusLeft);
    const focusHeight = Math.max(28, focusBottom - focusTop);
    Object.assign(els.tourFocusRing.style, { left: `${focusLeft}px`, top: `${focusTop}px`, width: `${focusWidth}px`, height: `${focusHeight}px` });
    const setShade = (el, left, top, width, height) => {
      Object.assign(el.style, { left: `${Math.max(0, left)}px`, top: `${Math.max(0, top)}px`, width: `${Math.max(0, width)}px`, height: `${Math.max(0, height)}px` });
    };
    setShade(els.tourShadeTop, 0, 0, window.innerWidth, focusTop);
    setShade(els.tourShadeRight, focusRight, focusTop, window.innerWidth - focusRight, focusHeight);
    setShade(els.tourShadeBottom, 0, focusBottom, window.innerWidth, window.innerHeight - focusBottom);
    setShade(els.tourShadeLeft, 0, focusTop, focusLeft, focusHeight);
    cancelAnimationFrame(tour.positionRaf);
    tour.positionRaf = requestAnimationFrame(() => {
      const cardWidth = els.tourCard.offsetWidth || 350;
      const cardHeight = els.tourCard.offsetHeight || 190;
      const edge = 14;
      const left = Math.min(Math.max(edge, rect.left), Math.max(edge, window.innerWidth - cardWidth - edge));
      let top = rect.bottom + 16;
      if (top + cardHeight > window.innerHeight - edge) top = rect.top - cardHeight - 16;
      // A tall target (the stage on a phone): put the card over its lower part instead.
      if (top < edge) top = window.innerHeight - cardHeight - edge;
      top = Math.max(edge, Math.min(top, window.innerHeight - cardHeight - edge));
      els.tourCard.style.left = `${left}px`;
      els.tourCard.style.top = `${top}px`;
    });
  }

  function renderTourStep() {
    const step = tour.steps[tour.index];
    if (!step) return;
    const narrow = window.innerWidth <= 1100;
    if (narrow) setSidebar(Boolean(step.sidebar));
    els.tourProgress.textContent = `${tour.index + 1} of ${tour.steps.length}`;
    els.tourTitle.textContent = step.title;
    els.tourText.textContent = step.text;
    els.tourBackBtn.hidden = tour.index === 0;
    els.tourNextBtn.textContent = tour.index === tour.steps.length - 1 ? 'Finish' : 'Next';
    const target = tourTarget(step);
    if (target) {
      const r = target.getBoundingClientRect();
      const fits = r.top >= 0 && r.bottom <= window.innerHeight;
      // On a phone the stage goes to the top of the screen so the card fits underneath.
      const toTop = step.scroll === 'start' && window.innerWidth <= 760 && r.top > 12;
      if (toTop) window.scrollTo({ top: window.scrollY + r.top - 8, behavior: 'smooth' });
      else if (!fits) target.scrollIntoView({ block: step.scroll || 'center', behavior: 'smooth' });
    }
    positionTour();
    setTimeout(positionTour, 300);
    setTimeout(positionTour, 650);
  }

  async function unlockTourAudio() {
    if (!tour.active) return;
    const context = await ensureAudio();
    if (!context || context.state !== 'running') return;
    els.tourSoundBtn.hidden = true;
    if (state.playing && state.clock !== 'audio') {
      // Visuals were running on the page clock (no sound allowed yet): hand over to the audio clock.
      const t = songNow();
      state.clock = 'audio';
      seekTo(t, { keepResults: true });
    }
  }

  function startTour() {
    if (tour.active) return;
    document.querySelectorAll('dialog[open]').forEach(dialog => dialog.close());
    tour.previous = {
      songId: state.song?.id,
      mode: state.mode,
      view: state.view,
      speed: state.speed,
      songTime: state.songTime,
      sidebarOpen: els.sidebar.classList.contains('open')
    };
    stopPlayback(false);
    if (state.mode !== 'listen') setMode('listen');
    if (state.view !== 'radial') setView('radial', { silent: true, keepPref: true });
    setSpeed(1);
    const song = state.demoSongs.find(item => /^interstellar/i.test(item.title)) || state.demoSongs[0];
    if (song) selectSong(song.id);
    tour.active = true;
    tour.kind = 'main';
    tour.index = 0;
    tour.steps = TOUR_STEPS;
    els.tourOverlay.hidden = false;
    els.tourSoundBtn.hidden = Boolean(audio.ctx && audio.ctx.state === 'running');
    startSpin();
    // Let the layout settle (view/mode changes resize the stage) before measuring targets.
    requestAnimationFrame(() => requestAnimationFrame(() => {
      tour.steps = TOUR_STEPS.filter(step => step.sidebar || elementVisible(tourTarget(step)));
      renderTourStep();
    }));
    tour.token = (tour.token || 0) + 1;
    startPlayback({ fromTour: tour.token }).then(() => {
      if (tour.active) els.tourSoundBtn.hidden = state.clock === 'audio';
    }).catch(() => {});
    setTimeout(() => els.tourNextBtn.focus(), 60);
  }

  function finishTour() {
    if (!tour.active) return;
    if (tour.kind === 'mode') {
      tour.active = false;
      tour.kind = '';
      els.tourOverlay.hidden = true;
      try { localStorage.setItem(STORAGE_MODE_TOURS, JSON.stringify([...new Set([...modeToursSeen(), tour.mode])])); } catch (error) { /* ignored */ }
      return;
    }
    tour.active = false;
    markTourSeen();
    els.tourOverlay.hidden = true;
    clearTimeout(state.loopTimer);
    stopPlayback(false);
    stopSpin();
    const previous = tour.previous;
    tour.previous = null;
    if (!previous) return;
    if (window.innerWidth <= 1100) setSidebar(previous.sidebarOpen);
    if (previous.songId && previous.songId !== state.song?.id) selectSong(previous.songId);
    else resetRun(0);
    if (previous.view !== state.view) setView(previous.view, { silent: true, keepPref: true });
    if (previous.mode !== state.mode) setMode(previous.mode);
    setSpeed(previous.speed);
  }

  function nextTourStep() {
    if (tour.index >= tour.steps.length - 1) {
      finishTour();
      return;
    }
    tour.index += 1;
    renderTourStep();
  }

  function previousTourStep() {
    if (tour.index === 0) return;
    tour.index -= 1;
    renderTourStep();
  }

  function maybeStartTour() {
    if (tourSeen()) return;
    setTimeout(() => {
      if (!tour.active && !document.querySelector('dialog[open]')) startTour();
    }, 700);
  }

  function bindTourEvents() {
    els.tourBtn.addEventListener('click', () => {
      // In Practice, Wait for note and Tuner the ? explains that mode; otherwise the demo tour.
      if (MODE_TOURS[state.mode]) { startModeTour(state.mode); return; }
      startTour();
      unlockTourAudio();
    });
    els.tourNextBtn.addEventListener('click', nextTourStep);
    els.tourBackBtn.addEventListener('click', previousTourStep);
    els.tourSkipBtn.addEventListener('click', finishTour);
    els.tourSoundBtn.addEventListener('click', unlockTourAudio);
    // Any touch on the tour is a user gesture, so the sound can start.
    els.tourOverlay.addEventListener('pointerdown', () => { unlockTourAudio(); });
    window.addEventListener('keydown', event => {
      if (!tour.active) return;
      unlockTourAudio();
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopImmediatePropagation();
        finishTour();
      } else if (event.key === 'ArrowRight' || event.key === 'Enter') {
        event.preventDefault();
        event.stopImmediatePropagation();
        nextTourStep();
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        event.stopImmediatePropagation();
        previousTourStep();
      } else if (event.key !== 'Tab') {
        // The page behind the tour is not playable.
        event.stopImmediatePropagation();
      }
    }, true);
    window.addEventListener('resize', positionTour);
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && tour.active && !state.playing) startPlayback().catch(() => {});
    });
    window.addEventListener('scroll', () => { if (tour.active) positionTour(); }, { passive: true });
  }

  // Session complete: a soft burst of glowing particles around the tick, then a few
  // sparkles that keep twinkling while the card is open.
  function celebrateResults(canvas, strength = 1) {
    if (!canvas || !canvas.getContext) return;
    const dialog = canvas.closest('dialog');
    const card = canvas.parentElement;
    const icon = card.querySelector('.result-icon');
    const ctx = canvas.getContext('2d');
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = canvas.clientWidth || card.clientWidth;
    const h = canvas.clientHeight || 160;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const cx = w / 2;
    const cy = icon ? icon.offsetTop + icon.offsetHeight / 2 - canvas.offsetTop : 55;
    const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const colors = ['#5eead4', '#99f6e4', '#c4b5fd', '#a78bfa', '#fbbf24', '#38bdf8', '#f9a8d4'];
    const level = Math.max(0.25, Math.min(1, strength));
    const particles = [];
    const burst = reduced ? 0 : Math.round(34 + 46 * level);
    for (let i = 0; i < burst; i += 1) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 55 + Math.random() * 150;
      particles.push({
        x: cx + Math.cos(angle) * 22, y: cy + Math.sin(angle) * 22,
        vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed * 0.8 - 18,
        life: 1.1 + Math.random() * 1.2, age: 0, size: 1 + Math.random() * 2.4,
        color: colors[(Math.random() * colors.length) | 0], spin: Math.random() * 6
      });
    }
    const sparkles = Array.from({ length: reduced ? 6 : 14 }, (_, i) => ({
      angle: (i / (reduced ? 6 : 14)) * Math.PI * 2 + Math.random() * 0.4,
      radius: 40 + Math.random() * 34, size: 0.8 + Math.random() * 1.6,
      phase: Math.random() * Math.PI * 2, speed: 1.4 + Math.random() * 1.8,
      color: colors[(Math.random() * colors.length) | 0]
    }));
    cancelAnimationFrame(canvas._celebrateRaf || 0);
    let last = performance.now();
    const started = last;
    const tick = now => {
      if (!canvas.isConnected || (dialog && !dialog.open)) { ctx.clearRect(0, 0, w, h); return; }
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const t = (now - started) / 1000;
      ctx.clearRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'lighter';
      const drag = Math.pow(0.18, dt);
      particles.forEach(p => {
        p.age += dt;
        if (p.age >= p.life) return;
        p.vx *= drag; p.vy = p.vy * drag - 10 * dt;
        p.x += p.vx * dt; p.y += p.vy * dt;
        const k = 1 - p.age / p.life;
        const r = p.size * (0.6 + 0.4 * k);
        const glow = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 4);
        glow.addColorStop(0, p.color);
        glow.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.globalAlpha = k * 0.55;
        ctx.fillStyle = glow;
        ctx.beginPath(); ctx.arc(p.x, p.y, r * 4, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = k;
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(p.x, p.y, r * 0.55, 0, Math.PI * 2); ctx.fill();
      });
      const fadeIn = Math.min(1, t / 0.6);
      sparkles.forEach(s => {
        const a = s.angle + t * 0.12;
        const x = cx + Math.cos(a) * s.radius * 1.35;
        const y = cy + Math.sin(a) * s.radius * 0.62;
        const tw = 0.5 + 0.5 * Math.sin(t * s.speed + s.phase);
        const size = s.size * (0.6 + tw);
        ctx.globalAlpha = fadeIn * (0.25 + 0.65 * tw);
        ctx.strokeStyle = s.color;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x - size * 2.2, y); ctx.lineTo(x + size * 2.2, y);
        ctx.moveTo(x, y - size * 2.2); ctx.lineTo(x, y + size * 2.2);
        ctx.stroke();
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(x, y, size * 0.5, 0, Math.PI * 2); ctx.fill();
      });
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      canvas._celebrateRaf = requestAnimationFrame(tick);
    };
    canvas._celebrateRaf = requestAnimationFrame(tick);
  }

  /* ---------- Recommended next (with Ethereal Drum's little album covers) ---------- */

  function stableSongHash(song) {
    const value = String(song?.id || song?.title || 'song');
    let hash = 2166136261;
    for (let i = 0; i < value.length; i += 1) { hash ^= value.charCodeAt(i); hash = Math.imul(hash, 16777619); }
    return hash >>> 0;
  }

  function songCoverMarkup(song) {
    const hash = stableSongHash(song);
    const theme = hash % 8;
    const symbols = ['✦', '☾', '✿', '♫', '✧', '☁', '❋', '♪'];
    const symbol = symbols[(hash >>> 3) % symbols.length];
    return `<span class="album-cover cover-theme-${theme}" aria-hidden="true"><i>${symbol}</i><b></b></span>`;
  }

  function songNoteSet(song) {
    return new Set([...parseSong(song).used].filter(id => state.padMap.get(id)?.kind !== 'perc'));
  }

  function recommendNextSong(current) {
    if (!current) return null;
    const order = { easy: 0, medium: 1, hard: 2, expert: 3 };
    const currentLevel = songDifficulty(parseSong(current)).level;
    const currentNotes = songNoteSet(current);
    return allSongs().filter(song => song && song.id !== current.id && JOURNEY.isSongOpen(song.id)).map(song => {
      const difficulty = songDifficulty(parseSong(song));
      const notes = songNoteSet(song);
      const intersection = [...currentNotes].filter(note => notes.has(note)).length;
      const union = new Set([...currentNotes, ...notes]).size || 1;
      const coverage = currentNotes.size ? intersection / currentNotes.size : 0;
      const distance = Math.abs((order[difficulty.level] ?? 0) - (order[currentLevel] ?? 0));
      const difficultyScore = distance === 0 ? 10 : distance === 1 ? 4 : 0;
      const tempoScore = Math.max(0, 2.5 - Math.abs((Number(song.bpm) || 90) - (Number(current.bpm) || 90)) / 35);
      return { song, difficulty, intersection, score: difficultyScore + (intersection / union) * 9 + coverage * 4 + tempoScore };
    }).sort((a, b) => b.score - a.score || b.intersection - a.intersection || a.song.title.localeCompare(b.song.title))[0] || null;
  }

  function renderRecommendedNext(song) {
    const rec = recommendNextSong(song);
    state.recommendedSongId = rec?.song?.id || null;
    els.resultRecommendation.hidden = !rec;
    if (!rec) { els.resultRecommendedBtn.innerHTML = ''; return; }
    const next = rec.song;
    const shared = rec.intersection === 1 ? '1 shared note' : `${rec.intersection} shared notes`;
    els.resultRecommendedBtn.innerHTML = `${songCoverMarkup(next)}<span class="result-recommended-copy"><span><strong>${escapeHtml(next.title)}</strong><em class="difficulty-badge" data-level="${rec.difficulty.level}">${rec.difficulty.label}</em></span><small>${shared} · ${next.bpm} BPM</small></span><b class="result-recommended-arrow" aria-hidden="true">→</b>`;
  }

  /* ------------------------------------------------------------------ */
  /* Dialogs, toast, sidebar, focus mode                                 */
  /* ------------------------------------------------------------------ */

  function openDialog(dialog) {
    if (typeof dialog.showModal === 'function') {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
  }

  function closeDialog(dialog) {
    if (typeof dialog.close === 'function') dialog.close();
    else dialog.removeAttribute('open');
  }

  function isPopoverOpen(element) {
    try { return element.matches(':popover-open'); } catch (error) { return element.classList.contains('show'); }
  }

  function hideToast() {
    clearTimeout(showToast.timer);
    try {
      if (typeof els.toast.hidePopover === 'function' && isPopoverOpen(els.toast)) els.toast.hidePopover();
      else els.toast.classList.remove('show');
    } catch (error) {
      els.toast.classList.remove('show');
    }
  }

  function showToast(message, type = 'info') {
    els.toast.textContent = message;
    els.toast.classList.remove('warning', 'success');
    if (type === 'warning' || type === 'success') els.toast.classList.add(type);
    clearTimeout(showToast.timer);
    try {
      if (typeof els.toast.showPopover === 'function') {
        if (isPopoverOpen(els.toast)) els.toast.hidePopover();
        els.toast.showPopover();
      } else {
        els.toast.classList.add('show');
      }
    } catch (error) {
      els.toast.classList.add('show');
    }
    showToast.timer = window.setTimeout(hideToast, type === 'warning' ? 3600 : 2400);
  }

  function setSidebar(open) {
    els.sidebar.classList.toggle('open', open);
  }

  function setFocusMode(enabled) {
    if (!enabled) leaveFocusFullscreen();
    state.focusMode = Boolean(enabled) && window.innerWidth <= 1100;
    document.body.classList.toggle('focus-mode', state.focusMode);
    els.focusModeBtn.classList.toggle('active', state.focusMode);
    els.focusModeBtn.setAttribute('aria-pressed', String(state.focusMode));
    els.focusModeBtn.setAttribute('aria-label', state.focusMode ? 'Exit focus mode' : 'Enter focus mode');
    els.focusModeBtn.title = state.focusMode ? 'Exit focus mode' : 'Focus mode';
    els.focusModeBtn.innerHTML = `<span aria-hidden="true">${state.focusMode ? '×' : '⛶'}</span><b>${state.focusMode ? 'Exit Focus' : 'Focus Mode'}</b>`;
    // The phone's Back button leaves focus mode instead of leaving the app.
    try {
      if (state.focusMode && !history.state?.hdtFocus) history.pushState({ hdtFocus: true }, '');
      else if (!state.focusMode && history.state?.hdtFocus) { focusHistory.ignore = true; history.back(); }
    } catch (error) { /* file:// may refuse; not important */ }
    fitPhoneStage();
    updateTransportUI();
    requestAnimationFrame(() => resizeCanvas());
  }

  const focusHistory = { ignore: false };

  function isPhone() {
    return window.innerWidth <= 760;
  }

  // On a phone the start screen has no scrolling: the stage takes whatever height is left
  // under the header and the mode buttons.
  // Tablets (touch screens wider than a phone): the song list slides in from the left like
  // on a phone, and the stage takes exactly the height that is left, so nothing scrolls.
  function isTablet() {
    return window.innerWidth > 760 && window.innerHeight >= 520 && Boolean(window.matchMedia?.('(pointer: coarse)').matches);
  }

  function fitTabletStage() {
    const stage = els.noteStage;
    const before = stage.style.height;
    stage.style.height = '';
    stage.style.minHeight = '';
    const card = stage.closest('.trainer-card');
    const panel = document.querySelector('.main-panel');
    const viewport = window.visualViewport?.height || window.innerHeight;
    const stageRect = stage.getBoundingClientRect();
    const below = card.getBoundingClientRect().bottom - stageRect.bottom;
    const padBottom = parseFloat(getComputedStyle(panel).paddingBottom) || 10;
    const top = stageRect.top + window.scrollY;
    const height = Math.max(300, Math.floor(viewport - top - below - padBottom - 2));
    stage.style.height = `${height}px`;
    stage.style.minHeight = `${height}px`;
    if (before !== stage.style.height) requestAnimationFrame(() => resizeCanvas());
  }

  function fitPhoneStage() {
    const stage = els.noteStage;
    const tablet = isTablet() && !state.focusMode;
    const desktop = !tablet && isDesktopFit() && !state.focusMode;
    document.body.classList.toggle('tablet-fit', tablet);
    document.body.classList.toggle('desktop-fit', desktop);
    document.body.classList.toggle('wide-fit', tablet || desktop);
    placeProgressInTape((tablet || desktop) && tapeWanted());
    if (tablet || desktop) { fitTabletStage(); return; }
    if (!isPhone() || state.focusMode) {
      stage.style.height = '';
      stage.style.minHeight = '';
      return;
    }
    const viewport = window.visualViewport?.height || window.innerHeight;
    const top = stage.getBoundingClientRect().top + window.scrollY;
    const height = Math.max(400, Math.floor(viewport - top - 14));
    stage.style.height = `${height}px`;
    stage.style.minHeight = `${height}px`;
  }

  // Keep the phone awake while you play (Screen Wake Lock, Chrome / Edge / Safari 16.4+).
  const wake = { lock: null, pending: false };

  async function keepScreenOn(on) {
    try {
      if (on) {
        if (wake.lock || wake.pending || !navigator.wakeLock || document.visibilityState !== 'visible') return;
        wake.pending = true;
        wake.lock = await navigator.wakeLock.request('screen');
        wake.lock.addEventListener('release', () => { wake.lock = null; });
      } else if (wake.lock) {
        const lock = wake.lock;
        wake.lock = null;
        await lock.release();
      }
    } catch (error) {
      wake.lock = null;
    } finally {
      wake.pending = false;
    }
  }

  /* ------------------------------------------------------------------ */
  /* Utilities                                                           */
  /* ------------------------------------------------------------------ */

  function formatTime(seconds) {
    const total = Math.max(0, Math.round(seconds));
    return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
  }

  function slugify(value) {
    return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  }

  /* ------------------------------------------------------------------ */
  /* Events                                                              */
  /* ------------------------------------------------------------------ */

  function bindEvents() {
    els.menuBtn.addEventListener('click', () => setSidebar(true));
    els.sidebarClose.addEventListener('click', () => setSidebar(false));
    els.sidebarScrim.addEventListener('click', () => setSidebar(false));
    els.songList.addEventListener('click', event => {
      const button = event.target.closest('[data-song-id]');
      if (button) selectSong(button.dataset.songId, { closeSidebar: true });
    });
    els.songSearch.addEventListener('input', () => { state.search = els.songSearch.value; renderSongList(); });
    els.newSongBtn?.addEventListener('click', () => { setSidebar(false); openEditor(null); });
    els.importBtn.addEventListener('click', () => els.importFile.click());
    els.importFile.addEventListener('change', () => importSongFile(els.importFile.files[0]));
    els.exportBtn.addEventListener('click', exportSong);
    els.deleteBtn.addEventListener('click', () => state.song && deleteSong(state.song.id));
    els.editBtn.addEventListener('click', openEditChoice);
    els.editorGuideBtn?.addEventListener('click', () => openDialog(els.helpDialog));
    els.settingsBtn.addEventListener('click', openSettings);
    els.helpBtn.addEventListener('click', () => openDialog(els.helpDialog));
    bindHints();
    bindFullscreen();
    bindCommunity();
    bindDraftsAndChooser();
    bindViewModeBtn();
    els.soundWakeBtn.addEventListener('click', wakeSound);
    // Any first touch, click or key wakes the sound and hides the invitation.
    const firstGesture = () => {
      if (!els.soundWakeBtn.hidden) wakeSound();
      window.removeEventListener('pointerdown', firstGesture, true);
      window.removeEventListener('keydown', firstGesture, true);
    };
    window.addEventListener('pointerdown', firstGesture, true);
    window.addEventListener('keydown', firstGesture, true);
    els.mobileViewToggleBtn.addEventListener('click', () => setView(state.view === 'lanes' ? 'radial' : 'lanes'));
    els.focusModeBtn.addEventListener('click', () => setFocusMode(!state.focusMode));
    // One click turns the drum clockwise by half a step (layout 1 -> layout 2 -> ...).
    [els.rotateLeftBtn, els.composeRotateLeftBtn].forEach(button => button.addEventListener('click', () => rotateDrum(1)));
    [els.rotateRightBtn, els.composeRotateRightBtn].forEach(button => button.addEventListener('click', () => rotateDrum(-1)));
    els.layoutRow.addEventListener('click', event => {
      const card = event.target.closest('[data-layout]');
      const turn = event.target.closest('[data-rotate]');
      if (card) {
        // Go to the chosen layout by the shortest turn from where the drum is now.
        const count = SCALES[state.instrument.scale].top.length;
        const current = state.instrument.rotationSteps || 0;
        let target = Number(card.dataset.layout);
        while (target - current > count) target -= count * 2;
        while (current - target > count) target += count * 2;
        animateRotationTo(target);
      } else if (turn) {
        rotateDrum(Number(turn.dataset.rotate));
      }
    });

    document.querySelectorAll('[data-mode]').forEach(button => button.addEventListener('click', () => {
      const mode = button.dataset.mode;
      setMode(mode === 'practice' ? (state.waitPref ? 'wait' : 'practice') : mode);
      maybeStartModeTour(state.mode);
    }));
    els.waitToggle.addEventListener('change', () => {
      state.waitPref = els.waitToggle.checked;
      savePrefs();
      if (state.mode === 'practice' || state.mode === 'wait') {
        setMode(state.waitPref ? 'wait' : 'practice');
        maybeStartModeTour(state.mode);
      }
    });
    els.micChipBtn.addEventListener('click', () => els.micBtn.click());
    els.topNewSongBtn.addEventListener('click', () => { setSidebar(false); openEditor(null); });
    els.dockPlayBtn.addEventListener('click', () => els.playBtn.click());
    els.dockLoopBtn.addEventListener('click', () => els.loopBtn.click());
    els.dockMetronomeBtn.addEventListener('click', () => els.metronomeBtn.click());
    els.speedCycleBtn.addEventListener('click', () => {
      const steps = [1, 0.75, 0.5, 0.25];
      const index = steps.findIndex(value => Math.abs(value - state.speed) < 0.001);
      setSpeed(index < 0 ? 1 : steps[(index + 1) % steps.length]);
    });
    els.stageSongName.addEventListener('click', () => {
      if (!state.focusMode) return;
      openDialog(els.songSwitchDialog);
    });
    els.switchKeepBtn.addEventListener('click', () => closeDialog(els.songSwitchDialog));
    els.switchChooseBtn.addEventListener('click', () => {
      closeDialog(els.songSwitchDialog);
      pausePlayback();
      setFocusMode(false);
      setSidebar(true);
    });
    window.addEventListener('popstate', () => {
      if (focusHistory.ignore) { focusHistory.ignore = false; return; }
      if (state.focusMode) { pausePlayback(); setFocusMode(false); }
    });
    document.addEventListener('visibilitychange', () => { if (!document.hidden) updateTransportUI(); });
    document.querySelectorAll('.view-segment').forEach(button => button.addEventListener('click', () => {
      if (button.dataset.view !== state.view) setView(button.dataset.view);
    }));
    document.querySelectorAll('[data-close-dialog]').forEach(button => button.addEventListener('click', () => {
      const dialog = $(button.dataset.closeDialog);
      if (dialog === els.editorDialog) {
        cancelScheduledAudio(audio.preview);
        els.previewSongBtn.textContent = '▶ Play';
        stopEditorPreviewVisuals();
      }
      closeDialog(dialog);
    }));

    els.playBtn.addEventListener('click', () => { togglePlayback().catch(() => showToast('Could not start audio.', 'warning')); });
    els.stopBtn.addEventListener('click', () => {
      stopPlayback(true);
      if (isPhone() && state.focusMode) setFocusMode(false);
    });
    els.loopBtn.addEventListener('click', () => {
      state.loop = !state.loop;
      if (state.loop) state.abLoop = false;
      updateTransportUI();
      updateABLoopUI();
      savePrefs();
      showToast(state.loop ? 'Whole-song loop enabled.' : 'Whole-song loop disabled.', 'success');
    });
    els.metronomeBtn.addEventListener('click', () => {
      state.metronome = !state.metronome;
      if (state.playing) state.schedBeat = Math.ceil(songNow() / state.parsed.spb - 1e-6);
      updateTransportUI();
      savePrefs();
    });
    els.guideBtn.addEventListener('click', () => {
      if (state.mode === 'wait') {
        // In Wait for note the speaker switches Play Note on (and back to Game Mode).
        setWaitStyle(state.waitStyle === 'hear' ? 'game' : 'hear');
        showToast(state.waitStyle === 'hear' ? 'Play Note: the app plays each note, then waits for you.' : 'Game Mode: a happy chime for every right note.', 'success');
        return;
      }
      state.guide = !state.guide;
      updateTransportUI();
      savePrefs();
      showToast(state.guide ? 'Guide sound on: the app plays each note quietly.' : 'Guide sound off.', 'success');
    });
    els.countInToggle.checked = state.countIn;
    els.countInToggle.addEventListener('change', () => { state.countIn = els.countInToggle.checked; savePrefs(); });
    els.micBtn.addEventListener('click', () => toggleMic().then(() => {
      if (mic.on && state.mode !== 'tuner' && !COMMON.micCheckSeen(MIC_CHECK_KEY)) openMicCheckDialog();
    }));

    els.speedSelect.addEventListener('change', () => setSpeed(els.speedSelect.value));
    els.progress.addEventListener('input', syncProgressFill);

    els.progress.addEventListener('pointerdown', () => { state.dragProgress = true; });
    els.progress.addEventListener('input', () => {
      if (!state.parsed) return;
      const time = (Number(els.progress.value) / 1000) * state.parsed.duration;
      seekTo(time);
      els.elapsedLabel.textContent = formatTime(time / state.speed);
    });
    els.progress.addEventListener('change', () => { state.dragProgress = false; });
    window.addEventListener('pointerup', () => { state.dragProgress = false; });

    els.setABtn.addEventListener('click', () => setLoopPoint('A'));
    els.setBBtn.addEventListener('click', () => setLoopPoint('B'));
    els.abLoopBtn.addEventListener('click', toggleABLoop);
    els.clearABBtn.addEventListener('click', clearABLoop);

    // Song builder
    els.editorForm.addEventListener('submit', saveEditorSong);
    els.sequenceInput.addEventListener('input', updateSequenceStatus);
    els.songBpmInput.addEventListener('input', updateSequenceStatus);
    els.appendRestBtn.addEventListener('click', () => insertAtCursor(editor.len === 1 ? '-' : `-:${editor.len}`));
    els.appendBarBtn.addEventListener('click', () => insertAtCursor('|'));
    els.undoTokenBtn.addEventListener('click', removeLastToken);
    els.previewSongBtn.addEventListener('click', () => previewEditorSong());
    els.deleteEditorBtn.addEventListener('click', () => editor.songId && deleteSong(editor.songId));
    els.editorDialog.addEventListener('close', () => { cancelScheduledAudio(audio.preview); els.previewSongBtn.textContent = '▶ Play'; stopEditorPreviewVisuals(); });
    els.editorDialog.querySelectorAll('[data-hand]').forEach(button => button.addEventListener('click', () => {
      editor.hand = button.dataset.hand;
      els.editorDialog.querySelectorAll('[data-hand]').forEach(b => b.classList.toggle('active', b === button));
    }));
    els.editorDialog.querySelectorAll('[data-len]').forEach(button => button.addEventListener('click', () => {
      editor.len = Number(button.dataset.len);
      els.editorDialog.querySelectorAll('[data-len]').forEach(b => b.classList.toggle('active', b === button));
    }));
    bindZonePanel();

    // My handpan
    els.scaleCards.addEventListener('click', event => {
      const card = event.target.closest('[data-scale]');
      if (!card) return;
      state.instrument.scale = card.dataset.scale;
      applyInstrumentChange();
      showToast(`${SCALES[state.instrument.scale].name} selected.`, 'success');
    });
    els.bottomsConfig.addEventListener('change', event => {
      const select = event.target.closest('[data-bottom]');
      if (!select) return;
      state.instrument.bottoms[Number(select.dataset.bottom)] = select.value;
      applyInstrumentChange();
    });
    els.noteTable.addEventListener('click', event => {
      const button = event.target.closest('[data-play]');
      if (button) ensureAudio().then(() => playPad(button.dataset.play)).catch(() => {});
    });
    els.percToggle.addEventListener('change', () => { state.instrument.percussion = els.percToggle.checked; applyInstrumentChange(); });
    els.mirrorToggle.addEventListener('change', () => { state.instrument.mirror = els.mirrorToggle.checked; applyInstrumentChange(); });
    els.resetPercBtn.addEventListener('click', () => { delete state.instrument.percPos[state.instrument.scale]; applyInstrumentChange(); });
    els.handColorsToggle.addEventListener('change', () => {
      state.instrument.handColors = els.handColorsToggle.checked;
      saveInstrument();
      state.nextKey = '';
      updateNextHint(true);
      state.dirty = true;
      requestFrame();
    });
    els.noteNamesToggle.addEventListener('change', () => { state.instrument.noteNames = els.noteNamesToggle.checked; applyInstrumentChange(); });
    els.usedLanesToggle.addEventListener('change', () => { state.instrument.usedLanes = els.usedLanesToggle.checked; saveInstrument(); rebuildLanes(); requestFrame(); });

    // Results
    els.resultReplayBtn.addEventListener('click', () => { closeDialog(els.resultDialog); resetRun(0); startPlayback(); });
    els.resultSmartBtn.addEventListener('click', startSmartLoop);
    els.shareSongBtn?.addEventListener('click', () => { shareSong().catch(() => showToast('Could not make the link.', 'warning')); });
    COMMON.bindHapticsToggle(els.hapticsToggle, HAPTICS_KEY);
    COMMON.bindHistoryBadges({ store: BEST, title: id => findSong(id)?.title });
    els.saveProgressBtn?.addEventListener('click', () => COMMON.openSaveProgress({
      cloud: CLOUD, appName: 'Ethereal Handpan', onFileSave: progressFileSave, onFileLoad: () => els.progressFile.click(), toast: message => showToast(message, 'success')
    }));
    els.deleteProgressBtn?.addEventListener('click', () => COMMON.openDeleteProgress({ cloud: CLOUD, clearLocal: clearLocalProgress, toast: message => showToast(message, 'success') }));
    COMMON.bindRecChips({ rec: REC, recBtn: els.recChipBtn, takeBtn: els.takeChipBtn, toast: message => showToast(message, 'success') });
    els.resultDrillBtn?.addEventListener('click', () => { if(COACH.next()) return; const node = JOURNEY.nodes.find(item => item.key === JOURNEY.activeDrill); if (node) playJourneyNode(node); else COACH.open(); });
    els.loadProgressBtn?.addEventListener('click', () => els.progressFile.click());
    els.progressFile?.addEventListener('change', async () => {
      const file = els.progressFile.files[0];
      els.progressFile.value = '';
      if (!file) return;
      try {
        const { songs } = await COMMON.importProgress(file, { app: 'ethereal-handpan', keys: PROGRESS_KEYS });
        BEST.reload();
        JOURNEY.reload();
        GAME.reload();
        PRACTICE.reload();
        renderSongList();
        CLOUD.changed();
        showToast(`Progress loaded: ${songs} ${songs === 1 ? 'song' : 'songs'}.`, 'success');
      } catch (error) {
        showToast(error.message || 'That is not a progress file.', 'warning');
      }
    });
    {
      const help = document.querySelector('#helpDialog .help-content');
      if (help) COMMON.tabify(help, ['Strokes', 'Hands', 'Rhythm', 'App', 'Writing'].map(label => ({ label, items: [...help.querySelectorAll(`[data-learn-tab="${label}"]`)] })));
    }
    window.addEventListener('load', () => setTimeout(() => importSharedSong().catch(() => {}), 700));
    window.addEventListener('hashchange', () => importSharedSong().catch(() => {}));
    els.resultFasterBtn.addEventListener('click', () => {
      const next = Number(els.resultFasterBtn.dataset.speed);
      closeDialog(els.resultDialog);
      if (next) setSpeed(next, true);
      resetRun(0);
      startPlayback();
    });
    els.micCheckBtn?.addEventListener('click', () => { closeDialog(els.settingsDialog); openMicCheckDialog(); });
    els.resultSlowerBtn.addEventListener('click', () => {
      closeDialog(els.resultDialog);
      setSpeed(Math.max(MIN_SPEED, state.speed - 0.1), true);
      resetRun(0);
      startPlayback();
    });
    els.resultRecommendedBtn.addEventListener('click', () => {
      const id = state.recommendedSongId;
      if (!id || !findSong(id)) return;
      closeDialog(els.resultDialog);
      selectSong(id);
      startPlayback();
    });
    els.resultNextBtn.addEventListener('click', () => {
      closeDialog(els.resultDialog);
      const list = allSongs().filter(song => JOURNEY.isSongOpen(song.id));
      const index = list.findIndex(song => song.id === state.song?.id);
      selectSong(list[(index + 1) % list.length].id);
    });

    bindTourEvents();
    bindRhythmView();
    bindTapeScrub();
    els.difficultyFilter.addEventListener('click', event => {
      const chip = event.target.closest('[data-level]');
      if (!chip) return;
      state.levelFilter = chip.dataset.level;
      els.difficultyFilter.querySelectorAll('[data-level]').forEach(b => b.classList.toggle('active', b === chip));
      renderSongList();
    });
    document.addEventListener('keydown', keyboardHandler);
    window.addEventListener('resize', () => {
      if (state.focusMode && window.innerWidth > 1100) setFocusMode(false);
      fitPhoneStage();
      resizeCanvas();
      if (els.editorDialog.open) renderRhythmView();
    });
    if ('ResizeObserver' in window) new ResizeObserver(() => resizeCanvas()).observe(els.noteStage);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && state.playing) pausePlayback();
      if (!document.hidden) requestFrame();
    });
  }

  function keyboardHandler(event) {
    if (document.querySelector('dialog[open]')) return;
    if (event.target.matches('input:not([type="range"]):not([type="checkbox"]), textarea, select') || event.metaKey || event.ctrlKey || event.altKey) return;
    if (event.code === 'Space') {
      // A focused button already reacts to Space itself.
      if (event.target.closest('button')) return;
      event.preventDefault();
      togglePlayback().catch(() => {});
      return;
    }
    if (event.key === '[' || event.key === ']') {
      event.preventDefault();
      setSpeed(state.speed + (event.key === ']' ? 0.05 : -0.05), true);
      return;
    }
    if (event.repeat) return;
    const key = event.key.toLowerCase();
    let padId = KEY_MAP[key];
    const base = { t: 'T', k: 'K', s: 'S', p: 'P', f: 'F' }[key];
    if (base) {
      // T, K, S, P and F play the zone of that kind the song is asking for (T2, S2...);
      // Shift+S is always the right-hand slap.
      const wanted = nextUpcomingEvent()?.items.find(item => !item.missing && percBase(item.pad) === base);
      padId = base === 'S' && event.shiftKey ? 'SR' : wanted ? wanted.pad : base === 'S' ? 'SL' : base;
    }
    if (padId && state.padMap.has(padId)) {
      event.preventDefault();
      userHit(padId, 'key');
    }
  }

  /* ------------------------------------------------------------------ */
  /* Init                                                                */
  /* ------------------------------------------------------------------ */

  function init() {
    state.pads = buildPads(state.instrument);
    state.padMap = new Map(state.pads.map(p => [p.id, p]));
    loadSongs();
    bindEvents();
    setView(state.view, { silent: true });
    updateModeUI();
    setSpeed(state.speed);
    selectSong(prefs.selectedId);
    fitPhoneStage();
    resizeCanvas();
    updateTransportUI();
    try {
      if (window.OfflineAudioContext || window.webkitOfflineAudioContext) audio.rendering = renderAllSounds();
    } catch (error) { /* ignored */ }
    if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol) && !/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) {
      navigator.serviceWorker.register('service-worker.js').catch(() => {});
    }
    // The tour starts once the loading screen has gone.
    const ready = audio.rendering ? Promise.race([audio.rendering, new Promise(resolve => setTimeout(resolve, 9000))]) : Promise.resolve();
    ready.catch(() => {}).then(() => { revealApp(); maybeStartTour(); });
    setupInstallButton();
    window.__handpanTrainer = { tour, startTour, finishTour, songNow, state, audio, chooseFromStrike, measureCents, parseSequence, buildPads, laneOrder, userHit, setMode, setView, setSpeed, seekTo, startPlayback, pausePlayback, tunerStrike };
  }

  init();
})();

