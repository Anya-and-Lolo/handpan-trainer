/* =====================================================================
   Ethereal trainers: code shared by Ethereal Handpan, Ethereal Drum and the
   trainers that come next (Kalimba...).

   The original lives in "- Drum Trainers/shared". Edit it there and run
   sync-shared (SYNC_SHARED_Win.bat or sync-shared.py) to copy it into every
   app's app-files folder. Each app talks to it through small adapters, so the
   code here never reaches into one app's own state.
   ===================================================================== */
(function () {
  'use strict';

  /* ---------- Little helpers ---------- */

  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

  function readJson(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  }

  function writeJson(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; }
  }

  function capitalise(text) {
    const value = String(text || '').trim();
    return value ? value.charAt(0).toLocaleUpperCase() + value.slice(1) : '';
  }

  function speedLabel(speed) {
    return `${Number(Number(speed || 1).toFixed(2))}×`;
  }

  /* ---------- Stars and best results ---------- */
  // A run's score is its accuracy, scaled down when it was played slower than 1×,
  // so five stars always mean "clean at full speed".

  const STAR_COUNT = 5;

  function scoreFor(accuracy, speed) {
    return Math.max(0, Math.min(100, Number(accuracy) || 0)) * Math.min(1, Number(speed) || 1);
  }

  function starsForScore(score) {
    const value = Number(score) || 0;
    return value >= 95 ? 5 : value >= 85 ? 4 : value >= 70 ? 3 : value >= 50 ? 2 : value >= 25 ? 1 : 0;
  }

  function starsFor(accuracy, speed) {
    return starsForScore(scoreFor(accuracy, speed));
  }

  // Older saves kept three-star values, so the stars are always worked out from the score.
  function bestStars(best) {
    if (!best) return 0;
    return starsForScore(Number.isFinite(Number(best.score)) ? best.score : scoreFor(best.accuracy, best.speed));
  }

  function starString(stars) {
    return '★'.repeat(stars) + '☆'.repeat(Math.max(0, STAR_COUNT - stars));
  }

  // Five stars, the earned ones lit (they glow on the results screen).
  function starsHtml(stars) {
    return Array.from({ length: STAR_COUNT }, (_, index) => `<b class="${index < stars ? 'on' : ''}" style="--i:${index}">★</b>`).join('');
  }

  // A saved best with no hits at all is not worth showing.
  const realBest = best => (best && Number(best.accuracy) > 0 ? best : null);

  function createBestStore(storageKey) {
    let data = readJson(storageKey, {});
    if (!data || typeof data !== 'object' || Array.isArray(data)) data = {};
    return {
      get(id) { return realBest(data[id]); },
      record(id, { accuracy, speed }) {
        if (!id || !Number.isFinite(Number(accuracy)) || !(Number(accuracy) > 0)) return null;
        const score = scoreFor(accuracy, speed);
        const previous = realBest(data[id]);
        const better = !previous || score > (Number(previous.score) || 0) + 0.01;
        const runs = (previous?.runs || 0) + 1;
        data[id] = better
          ? { stars: starsFor(accuracy, speed), accuracy: Math.round(accuracy), speed: Number(speed) || 1, score, runs, at: Date.now() }
          : { ...previous, runs };
        writeJson(storageKey, data);
        return { first: !previous, improved: Boolean(previous) && better, best: data[id], previous, stars: starsFor(accuracy, speed) };
      },
      badge(id) {
        const best = realBest(data[id]);
        if (!best) return '';
        const slow = best.speed && best.speed < 1 ? ` at ${speedLabel(best.speed)}` : '';
        return `<span class="song-best" title="Your best: ${best.accuracy}%${slow}"><i aria-hidden="true">${starsHtml(bestStars(best))}</i>${best.accuracy}%</span>`;
      }
    };
  }

  // The line under the results: stars for this run and how it compares with the best.
  function resultBestHtml(outcome, accuracy, speed) {
    if (!outcome) return '';
    const stars = starsFor(accuracy, speed);
    let text;
    if (outcome.first) text = 'Your first result for this song is saved.';
    else if (outcome.improved) text = `New best! Before: ${outcome.previous.accuracy}%${outcome.previous.speed < 1 ? ` at ${speedLabel(outcome.previous.speed)}` : ''}.`;
    else text = `Your best: ${outcome.best.accuracy}%${outcome.best.speed < 1 ? ` at ${speedLabel(outcome.best.speed)}` : ''}.`;
    const hint = stars < STAR_COUNT && speed < 1 && accuracy >= 90 ? ' Five stars come at full speed.' : '';
    return `<span class="result-stars" aria-label="${stars} of ${STAR_COUNT} stars">${starsHtml(stars)}</span><span class="result-best-text">${esc(text + hint)}</span>`;
  }

  // The song's best so far, for a results screen without a scored run (Listen, or no hits).
  function bestHtml(best) {
    const real = realBest(best);
    if (!real) return '';
    const stars = bestStars(real);
    const slow = real.speed < 1 ? ` at ${speedLabel(real.speed)}` : '';
    return `<span class="result-stars" aria-label="${stars} of ${STAR_COUNT} stars">${starsHtml(stars)}</span><span class="result-best-text">${esc(`Your best: ${real.accuracy}%${slow}.`)}</span>`;
  }

  /* ---------- Soft speed-up ---------- */
  // After a clean run below full speed, suggest the next step up.

  const SPEED_STEPS = [0.25, 0.5, 0.75, 1];

  function suggestSpeedUp(speed, accuracy) {
    if (!(accuracy >= 90) || !(speed < 1 - 1e-6)) return null;
    return SPEED_STEPS.find(step => step > speed + 1e-6) || null;
  }

  /* ---------- "Start here" for beginners ---------- */
  // A small card at the top of the song list with three steps. Each step is done as
  // soon as it is tapped; the card goes away when all three are done or on "Hide".

  function startHereCard({ storageKey, steps, onStep }) {
    const saved = readJson(storageKey, null) || { done: [], hidden: false };
    if (saved.hidden) return null;
    const done = new Set(Array.isArray(saved.done) ? saved.done : []);
    if (steps.every((_, index) => done.has(index))) return null;
    const card = document.createElement('section');
    card.className = 'start-here';
    card.innerHTML = `<div class="start-here-head"><b>New here? Start here</b><button type="button" class="start-here-hide">Hide</button></div>
      <ol>${steps.map((step, index) => `<li><button type="button" class="start-step${done.has(index) ? ' done' : ''}" data-step="${index}">
        <span class="start-num" aria-hidden="true">${done.has(index) ? '✓' : index + 1}</span>
        <span class="start-copy"><b>${esc(step.title)}</b><small>${esc(step.text)}</small></span></button></li>`).join('')}</ol>`;
    const save = hidden => writeJson(storageKey, { done: [...done], hidden });
    card.querySelector('.start-here-hide').addEventListener('click', () => { save(true); card.remove(); });
    card.querySelectorAll('.start-step').forEach(button => button.addEventListener('click', () => {
      const index = Number(button.dataset.step);
      done.add(index);
      save(false);
      onStep(index);
    }));
    return card;
  }

  /* ---------- 10-second microphone check ---------- */
  // Measures the room for a moment, then listens to three strikes and sets how loud a
  // sound must be to count as a note. Apps read the result with micThreshold().

  function micThreshold(storageKey, fallback) {
    const saved = readJson(storageKey, null);
    return saved && Number.isFinite(saved.threshold) ? saved.threshold : fallback;
  }

  function micCheckSeen(storageKey) {
    return Boolean(readJson(storageKey, null));
  }

  let micDialog = null;

  function buildMicDialog() {
    if (micDialog) return micDialog;
    const dialog = document.createElement('dialog');
    dialog.className = 'dialog mic-check-dialog';
    dialog.innerHTML = `<div class="mic-check-card">
      <p class="mic-check-kicker">10-second check</p>
      <h2>Microphone check</h2>
      <p class="mic-check-step" data-mc="step">Getting the microphone ready…</p>
      <div class="mic-check-meter" aria-hidden="true"><i data-mc="level"></i><b data-mc="line" hidden></b></div>
      <ol class="mic-check-strikes" aria-label="Strikes heard"><li></li><li></li><li></li></ol>
      <p class="mic-check-result" data-mc="result" hidden></p>
      <div class="mic-check-actions">
        <button type="button" class="soft-btn" data-mc="cancel">Skip</button>
        <button type="button" class="soft-btn" data-mc="again" hidden>Check again</button>
        <button type="button" class="primary-btn" data-mc="done" hidden>Done</button>
      </div>
    </div>`;
    document.body.appendChild(dialog);
    micDialog = dialog;
    return dialog;
  }

  function openMicCheck({ storageKey, fallback, getAnalyser, onDone, drumName = 'drum' }) {
    const dialog = buildMicDialog();
    const $ = name => dialog.querySelector(`[data-mc="${name}"]`);
    const strikesList = [...dialog.querySelectorAll('.mic-check-strikes li')];
    let raf = 0;
    let timer = 0;
    let finished = false;

    const stop = () => { cancelAnimationFrame(raf); clearTimeout(timer); };
    const setLevel = rms => { $('level').style.width = `${Math.min(100, Math.sqrt(rms / 0.25) * 100)}%`; };

    const run = async () => {
      finished = false;
      stop();
      strikesList.forEach(li => { li.className = ''; li.textContent = ''; });
      $('result').hidden = true;
      $('again').hidden = true;
      $('done').hidden = true;
      $('cancel').hidden = false;
      $('line').hidden = true;
      $('step').textContent = 'Getting the microphone ready…';
      let analyser = null;
      try { analyser = await getAnalyser(); } catch { analyser = null; }
      if (!analyser) {
        $('step').textContent = 'The microphone did not start. Allow microphone access for this page and try again.';
        $('again').hidden = false;
        return;
      }
      const data = new Float32Array(analyser.fftSize);
      const rmsNow = () => {
        analyser.getFloatTimeDomainData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i += 1) sum += data[i] * data[i];
        return Math.sqrt(sum / data.length);
      };
      // 1) A moment of quiet: how loud is the room?
      $('step').textContent = 'Stay quiet for a moment…';
      const quiet = [];
      const quietUntil = performance.now() + 1300;
      await new Promise(resolve => {
        const tick = now => {
          const rms = rmsNow();
          setLevel(rms);
          quiet.push(rms);
          if (now < quietUntil && dialog.open) raf = requestAnimationFrame(tick); else resolve();
        };
        raf = requestAnimationFrame(tick);
      });
      if (!dialog.open) return;
      quiet.sort((a, b) => a - b);
      const noise = quiet[Math.floor(quiet.length / 2)] || 0.002;
      // 2) Three strikes, at most ten seconds.
      $('step').textContent = `Now strike any 3 notes on your ${drumName}, one at a time.`;
      const peaks = [];
      const trigger = Math.max(noise * 3, 0.006);
      let loud = false;
      let peak = 0;
      let lastStrike = 0;
      const endAt = performance.now() + 10000;
      const finish = () => {
        if (finished) return;
        finished = true;
        stop();
        const weakest = peaks.length ? Math.min(...peaks) : 0;
        let threshold = fallback;
        if (peaks.length) {
          threshold = Math.min(Math.max(noise * 3, 0.004), weakest * 0.45);
          threshold = Math.min(0.03, Math.max(threshold, noise * 2.2, 0.003));
          writeJson(storageKey, { threshold, noise, weakest, strikes: peaks.length, at: Date.now() });
          $('line').hidden = false;
          $('line').style.left = `${Math.min(100, Math.sqrt(threshold / 0.25) * 100)}%`;
          onDone?.(threshold);
        }
        let verdict;
        if (!peaks.length) verdict = `I did not hear the ${drumName}. Check that the microphone is not muted, move the device closer and try again.`;
        else if (peaks.length < 3) verdict = `I heard ${peaks.length} of 3 strikes. Sensitivity is set; if notes are missed, strike a little firmer or move the device closer.`;
        else if (weakest < noise * 4) verdict = `It is a little noisy here. Sensitivity is set, but a quieter room or a device 30–50 cm from the ${drumName} works best.`;
        else verdict = `Great! The microphone hears your ${drumName} clearly. Sensitivity is set for this room.`;
        $('step').textContent = 'Check finished.';
        $('result').textContent = verdict;
        $('result').hidden = false;
        $('again').hidden = false;
        $('done').hidden = false;
        $('cancel').hidden = true;
      };
      const tick = now => {
        if (!dialog.open) return;
        const rms = rmsNow();
        setLevel(rms);
        if (!loud && rms > trigger && now - lastStrike > 260) {
          loud = true;
          peak = rms;
          lastStrike = now;
        } else if (loud) {
          peak = Math.max(peak, rms);
          if (now - lastStrike > 140) {
            loud = false;
            peaks.push(peak);
            const li = strikesList[peaks.length - 1];
            if (li) { li.className = 'heard'; li.textContent = '✓'; }
            if (peaks.length >= 3) { timer = setTimeout(finish, 250); return; }
          }
        }
        if (now > endAt) { finish(); return; }
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    };

    $('cancel').onclick = () => {
      stop();
      if (!micCheckSeen(storageKey)) writeJson(storageKey, { skipped: true, at: Date.now() });
      dialog.close();
    };
    $('again').onclick = () => run();
    $('done').onclick = () => { stop(); dialog.close(); };
    dialog.onclose = () => stop();
    if (!dialog.open) dialog.showModal();
    run();
  }

  /* ---------- Song tape: the position line lives in the tape on wide screens ---------- */

  const progressHome = { wrap: null, parent: null, next: null };

  function placeProgressInTape(inTape) {
    const wrap = progressHome.wrap || document.querySelector('.progress-wrap');
    const tapeEl = document.getElementById('noteTape');
    if (!wrap || !tapeEl) return;
    if (!progressHome.wrap) {
      progressHome.wrap = wrap;
      progressHome.parent = wrap.parentElement;
      progressHome.next = wrap.nextElementSibling;
      // Dragging the position line must not also drag the tape.
      wrap.addEventListener('pointerdown', event => event.stopPropagation());
      wrap.addEventListener('touchstart', event => event.stopPropagation(), { passive: true });
    }
    if (inTape && wrap.parentElement !== tapeEl) {
      tapeEl.appendChild(wrap);
      tapeEl.removeAttribute('aria-hidden');
      tapeEl.querySelector('.tape-window')?.setAttribute('aria-hidden', 'true');
    } else if (!inTape && wrap.parentElement === tapeEl) {
      progressHome.parent.insertBefore(wrap, progressHome.next);
      tapeEl.setAttribute('aria-hidden', 'true');
    }
  }

  function isDesktopFit() {
    return window.innerWidth > 760 && window.innerHeight >= 560 && !window.matchMedia?.('(pointer: coarse)').matches;
  }

  function syncProgressFill() {
    const input = document.getElementById('progress');
    if (input) input.style.setProperty('--fill', `${(Number(input.value) / (Number(input.max) || 1000)) * 100}%`);
  }

  /* ---------- Focus / Full screen button of the right-hand group ---------- */

  const viewModeState = { fullscreenByFocus: false, setFocusMode: null };

  function fullscreenSupported() {
    return Boolean(document.documentElement.requestFullscreen && document.fullscreenEnabled);
  }

  function syncViewModeBtn() {
    const btn = document.getElementById('viewModeBtn');
    if (!btn) return;
    const focus = window.innerWidth <= 1100;
    btn.lastElementChild.textContent = focus ? 'Focus' : document.fullscreenElement ? 'Exit full' : 'Full screen';
    btn.title = focus ? 'Focus mode: just the drum and the controls' : 'Full screen';
    btn.hidden = !focus && !fullscreenSupported();
  }

  function bindViewModeBtn({ setFocusMode }) {
    const btn = document.getElementById('viewModeBtn');
    viewModeState.setFocusMode = setFocusMode;
    if (!btn) return;
    btn.addEventListener('click', () => {
      const root = document.documentElement;
      if (window.innerWidth <= 1100) {
        setFocusMode(true);
        const touch = Boolean(window.matchMedia?.('(pointer: coarse)').matches);
        if (touch && fullscreenSupported() && !document.fullscreenElement) {
          root.requestFullscreen({ navigationUI: 'hide' }).then(() => { viewModeState.fullscreenByFocus = true; }).catch(() => {});
        }
        return;
      }
      if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
      else if (fullscreenSupported()) root.requestFullscreen({ navigationUI: 'hide' }).catch(() => {});
    });
    document.addEventListener('fullscreenchange', () => {
      if (!document.fullscreenElement) viewModeState.fullscreenByFocus = false;
      syncViewModeBtn();
    });
    window.addEventListener('resize', syncViewModeBtn);
    syncViewModeBtn();
  }

  // Leaving focus mode also leaves the full screen it opened.
  function leaveFocusFullscreen() {
    if (viewModeState.fullscreenByFocus && document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
    viewModeState.fullscreenByFocus = false;
  }

  /* ---------- Sounds ---------- */

  // A short, bright "correct!" for Wait for note · Game Mode.
  function playChime(context, out) {
    if (!context || context.state !== 'running') return;
    const t0 = context.currentTime + 0.01;
    [[1318.5, 0, 0.13], [1975.5, 0.085, 0.11], [2637, 0.17, 0.06]].forEach(([freq, delay, level]) => {
      const osc = context.createOscillator();
      const gain = context.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, t0 + delay);
      gain.gain.exponentialRampToValueAtTime(level, t0 + delay + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + delay + 0.42);
      osc.connect(gain).connect(out || context.destination);
      osc.start(t0 + delay);
      osc.stop(t0 + delay + 0.45);
    });
  }

  window.EtherealCommon = {
    version: '2',
    esc, readJson, writeJson, capitalise, speedLabel,
    STAR_COUNT, scoreFor, starsForScore, starsFor, bestStars, starString, starsHtml, createBestStore, resultBestHtml, bestHtml, suggestSpeedUp,
    startHereCard,
    micThreshold, micCheckSeen, openMicCheck,
    placeProgressInTape, isDesktopFit, syncProgressFill,
    fullscreenSupported, syncViewModeBtn, bindViewModeBtn, leaveFocusFullscreen,
    playChime
  };
})();
