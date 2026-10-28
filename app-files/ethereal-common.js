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

  // A star with softly rounded points (the round stroke rounds every corner).
  const STAR_PATH = 'M12 3.3L14.53 9.42 21.13 9.93 16.09 14.23 17.64 20.67 12 17.2 6.36 20.67 7.91 14.23 2.87 9.93 9.47 9.42Z';

  // Five stars, the earned ones lit (they glow on the results screen).
  function starsHtml(stars) {
    return Array.from({ length: STAR_COUNT }, (_, index) => `<b class="${index < stars ? 'on' : ''}" style="--i:${index}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="${STAR_PATH}"/></svg></b>`).join('');
  }

  // Five unlit stars and a hint, when a song has no result yet.
  function noStarsHtml(text) {
    return `<span class="result-stars" aria-label="No stars yet">${starsHtml(0)}</span><span class="result-best-text is-muted">${esc(text)}</span>`;
  }

  // A saved best with no hits at all is not worth showing.
  const realBest = best => (best && Number(best.accuracy) > 0 ? best : null);

  /* ---------- History: every scored try of a song ---------- */

  function createHistoryStore(storageKey, limit = 60) {
    const load = () => {
      const value = storageKey ? readJson(storageKey, {}) : {};
      return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    };
    let data = load();
    return {
      key: storageKey,
      add(id, { accuracy, speed }) {
        if (!storageKey || !id || !(Number(accuracy) > 0)) return;
        const list = Array.isArray(data[id]) ? data[id] : [];
        list.push({ t: Date.now(), a: Math.round(Number(accuracy)), s: Number(speed) || 1 });
        data[id] = list.slice(-limit);
        writeJson(storageKey, data);
      },
      get(id) { return Array.isArray(data[id]) ? data[id] : []; },
      reload() { data = load(); }
    };
  }

  function createBestStore(storageKey, options = {}) {
    let data = readJson(storageKey, {});
    if (!data || typeof data !== 'object' || Array.isArray(data)) data = {};
    const history = createHistoryStore(options.historyKey || '');
    const store = {
      onChange: null,
      onRecorded: null,
      key: storageKey,
      history,
      reload() {
        data = readJson(storageKey, {}) || {};
        history.reload();
      },
      get(id) { return realBest(data[id]); },
      record(id, { accuracy, speed }) {
        if (!id || !Number.isFinite(Number(accuracy)) || !(Number(accuracy) > 0)) return null;
        const score = scoreFor(accuracy, speed);
        const previous = realBest(data[id]);
        const better = !previous || score > (Number(previous.score) || 0) + 0.01;
        const runs = (previous?.runs || 0) + 1;
        history.add(id, { accuracy, speed });
        setTimeout(() => store.onChange?.(), 0);
        setTimeout(() => { try { store.onRecorded?.(id, { accuracy: Number(accuracy), speed: Number(speed) || 1 }); } catch {} }, 0);
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
        return `<span class="song-best" data-song="${esc(id)}" title="Your best: ${best.accuracy}%${slow}. Tap for your history."><i aria-hidden="true">${starsHtml(bestStars(best))}</i>${best.accuracy}%</span>`;
      }
    };
    return store;
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

  /* ---------- History chart ---------- */

  const dayKey = time => { const d = new Date(time); return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`; };
  const dateLabel = time => new Date(time).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

  function historySummary(list) {
    if (!list.length) return '';
    const days = new Set(list.map(item => dayKey(item.t))).size;
    const best = Math.max(...list.map(item => item.a));
    return `${list.length} ${list.length === 1 ? 'try' : 'tries'} · ${days} ${days === 1 ? 'day' : 'days'} · best ${best}%`;
  }

  // Bars for the last tries: height = score (accuracy, less when played slower), colour = stars.
  function historyChartHtml(list, max = 20) {
    const items = list.slice(-max);
    if (!items.length) return '';
    const height = 58;
    const barW = 11;
    const gap = 4;
    const width = items.length * (barW + gap) - gap;
    const scores = items.map(item => scoreFor(item.a, item.s));
    const best = Math.max(...scores);
    const bars = items.map((item, index) => {
      const score = scores[index];
      const h = Math.max(3, Math.round((score / 100) * (height - 4)));
      const cls = `h-bar s${starsForScore(score)}${score === best ? ' best' : ''}${index === items.length - 1 ? ' last' : ''}`;
      const tip = `${dateLabel(item.t)} · ${item.a}%${item.s < 1 ? ` at ${speedLabel(item.s)}` : ''}`;
      return `<rect class="${cls}" x="${index * (barW + gap)}" y="${height - h}" width="${barW}" height="${h}" rx="3"><title>${esc(tip)}</title></rect>`;
    }).join('');
    return `<svg class="history-chart" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="Your last ${items.length} tries">`
      + `<line class="h-grid" x1="0" x2="${width}" y1="${height - 4 - Math.round(0.9 * (height - 4))}" y2="${height - 4 - Math.round(0.9 * (height - 4))}"/>${bars}</svg>`;
  }

  // Under the results: the last tries of this song.
  function resultHistoryHtml(list) {
    if (!list || list.length < 2) return '';
    return `<div class="result-history-head"><b>Your last tries</b><span>${esc(historySummary(list))}</span></div>${historyChartHtml(list, 16)}`;
  }

  let historyDialog = null;

  function openHistory({ title, list }) {
    if (!historyDialog) {
      historyDialog = document.createElement('dialog');
      historyDialog.className = 'dialog history-dialog';
      document.body.appendChild(historyDialog);
      historyDialog.addEventListener('click', event => {
        if (event.target === historyDialog || event.target.closest('[data-history-close]')) historyDialog.close();
      });
    }
    const recent = list.slice(-8).reverse().map(item => {
      const score = scoreFor(item.a, item.s);
      return `<li><span>${esc(dateLabel(item.t))}</span><b>${item.a}%</b><span>${item.s < 1 ? esc(speedLabel(item.s)) : '1×'}</span><i aria-hidden="true">${starsHtml(starsForScore(score))}</i></li>`;
    }).join('');
    historyDialog.innerHTML = `<div class="history-card">
      <p class="eyebrow">YOUR HISTORY</p>
      <h2>${esc(title || 'This song')}</h2>
      ${list.length ? `<p class="history-summary">${esc(historySummary(list))}</p>
      <div class="history-chart-wrap">${historyChartHtml(list, 30)}</div>
      <ol class="history-list">${recent}</ol>` : '<p class="history-summary">No scored tries yet. Play it in Practice mode to start your history.</p>'}
      <button type="button" class="primary-btn" data-history-close>Close</button>
    </div>`;
    if (!historyDialog.open) historyDialog.showModal();
  }

  // Tapping the stars of a song in the list opens its history (and does not switch songs).
  function bindHistoryBadges({ store, title }) {
    const open = badge => openHistory({ title: title(badge.dataset.song), list: store.history.get(badge.dataset.song) });
    document.addEventListener('click', event => {
      const badge = event.target.closest?.('.song-best[data-song]');
      if (!badge) return;
      event.preventDefault();
      event.stopPropagation();
      open(badge);
    }, true);
    document.addEventListener('pointerdown', event => {
      if (event.target.closest?.('.song-best[data-song]')) event.stopPropagation();
    }, true);
  }

  /* ---------- Progress file: carry stars and history to another device ---------- */

  function downloadFile(name, text) {
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function exportProgress({ app, keys, fileName }) {
    const data = collectProgress(keys);
    const doc = { format: 'ethereal-progress', version: 1, app, savedAt: new Date().toISOString(), data };
    const stamp = new Date().toISOString().slice(0, 10);
    downloadFile(`${fileName}-${stamp}.json`, JSON.stringify(doc, null, 2));
  }

  // Joins progress from another device into this one: the better best wins, histories
  // and practice days are joined, Start here steps add up.
  function mergeProgress(incoming, keys) {
    let songs = 0;
    if (!incoming || typeof incoming !== 'object') return { songs };
    if (keys.best && incoming.best && typeof incoming.best === 'object') {
      const mine = readJson(keys.best, {}) || {};
      Object.entries(incoming.best).forEach(([id, theirs]) => {
        if (!theirs || !(Number(theirs.accuracy) > 0)) return;
        const own = mine[id];
        if (!own || (Number(theirs.score) || 0) > (Number(own.score) || 0) + 0.01) mine[id] = { ...theirs, runs: Math.max(own?.runs || 0, theirs.runs || 0) };
        songs += 1;
      });
      writeJson(keys.best, mine);
    }
    if (keys.history && incoming.history && typeof incoming.history === 'object') {
      const mine = readJson(keys.history, {}) || {};
      Object.entries(incoming.history).forEach(([id, list]) => {
        if (!Array.isArray(list)) return;
        const seen = new Map((mine[id] || []).map(item => [item.t, item]));
        list.forEach(item => { if (item && Number.isFinite(item.t)) seen.set(item.t, item); });
        mine[id] = [...seen.values()].sort((a, b) => a.t - b.t).slice(-60);
      });
      writeJson(keys.history, mine);
    }
    if (keys.startHere && incoming.startHere) {
      const mine = readJson(keys.startHere, null) || { done: [], hidden: false };
      const theirs = incoming.startHere;
      writeJson(keys.startHere, { done: [...new Set([...(mine.done || []), ...(theirs.done || [])])], hidden: Boolean(mine.hidden || theirs.hidden) });
    }
    if (keys.practice && incoming.practice && typeof incoming.practice.days === 'object') {
      const mine = readJson(keys.practice, null) || { goal: incoming.practice.goal || 10, days: {} };
      mine.days = mine.days || {};
      Object.entries(incoming.practice.days).forEach(([day, devices]) => {
        if (!devices || typeof devices !== 'object') return;
        const own = mine.days[day] && typeof mine.days[day] === 'object' ? mine.days[day] : {};
        Object.entries(devices).forEach(([device, seconds]) => { own[device] = Math.max(Number(own[device]) || 0, Number(seconds) || 0); });
        mine.days[day] = own;
      });
      writeJson(keys.practice, mine);
    }
    if (keys.journey && incoming.journey && incoming.journey.drills && typeof incoming.journey.drills === 'object') {
      const mine = readJson(keys.journey, null) || { drills: {} };
      mine.drills = mine.drills || {};
      Object.entries(incoming.journey.drills).forEach(([node, stars]) => { mine.drills[node] = Math.max(Number(mine.drills[node]) || 0, Number(stars) || 0); });
      writeJson(keys.journey, mine);
    }
    return { songs };
  }

  function collectProgress(keys) {
    const data = {};
    Object.entries(keys).forEach(([role, key]) => { if (key) data[role] = readJson(key, null); });
    return data;
  }

  async function importProgress(file, { app, keys }) {
    const doc = JSON.parse(await file.text());
    if (!doc || doc.format !== 'ethereal-progress' || !doc.data) throw new Error('Not a progress file');
    if (doc.app !== app) throw new Error(`This progress file is for ${doc.app || 'another app'}`);
    return mergeProgress(doc.data, keys);
  }

  /* ---------- Smart loop for mistakes ---------- */
  // Loops the bar with the most mistakes. It starts slower; every clean pass makes it a
  // little faster, two passes with mistakes in a row slow it down again. A clean pass at
  // the original speed finishes it.

  function smartLoopSpeeds(target, options) {
    const goal = Number(target) || 1;
    if (Array.isArray(options) && options.length) {
      const below = options.filter(value => value <= goal + 1e-6).sort((a, b) => a - b);
      if (!below.length) return [goal];
      const start = below.filter(value => value <= goal * 0.75 + 1e-6).pop() ?? below[0];
      return below.filter(value => value >= start - 1e-6);
    }
    const start = Math.max(0.25, Math.round((goal * 0.7) / 0.05) * 0.05);
    const list = [];
    for (let value = start; value < goal - 1e-6; value = Math.round((value + 0.1) * 100) / 100) list.push(value);
    list.push(goal);
    return list;
  }

  function createSmartLoop({ setSpeed, toast, onMastered, chime }) {
    const s = { active: false, speeds: [], index: 0, fails: 0, label: '' };
    return {
      get active() { return s.active; },
      get speed() { return s.speeds[s.index]; },
      get label() { return s.label; },
      start(speeds, label = '') {
        s.speeds = speeds.length ? speeds : [1];
        s.index = 0;
        s.fails = 0;
        s.label = label;
        s.active = true;
        setSpeed(s.speeds[0]);
        toast(`Smart loop: ${label ? `${label} ` : ''}at ${speedLabel(s.speeds[0])}. Play it clean and it speeds up.`);
      },
      stop() { s.active = false; },
      // One pass of the loop is over: how did it go?
      pass(total, hits) {
        if (!s.active) return null;
        const clean = total > 0 && hits >= total;
        if (clean) {
          s.fails = 0;
          chime?.();
          if (s.index >= s.speeds.length - 1) {
            s.active = false;
            onMastered(s.speeds[s.index]);
            return 'done';
          }
          s.index += 1;
          setSpeed(s.speeds[s.index]);
          toast(`Clean! Next round at ${speedLabel(s.speeds[s.index])}.`);
          return 'faster';
        }
        s.fails += 1;
        if (s.fails >= 2 && s.index > 0) {
          s.index -= 1;
          s.fails = 0;
          setSpeed(s.speeds[s.index]);
          toast(`A little slower: ${speedLabel(s.speeds[s.index])}. You've got this.`);
          return 'slower';
        }
        toast(`${hits} of ${total} notes. Once more at ${speedLabel(s.speeds[s.index])}.`);
        return 'again';
      }
    };
  }

  // The bar (or two short bars) with the most missed notes. times: missed note times in
  // seconds; barStarts: start time of every bar; end: song length.
  function worstSection(times, barStarts, end, minLength = 2.4) {
    if (!times.length || !barStarts.length) return null;
    const starts = [...barStarts].sort((a, b) => a - b);
    const barOf = time => { let index = 0; while (index + 1 < starts.length && starts[index + 1] <= time + 1e-6) index += 1; return index; };
    const counts = new Map();
    times.forEach(time => { const bar = barOf(time); counts.set(bar, (counts.get(bar) || 0) + 1); });
    let bar = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0];
    let from = starts[bar];
    let to = starts[bar + 1] ?? end;
    while (to - from < minLength && bar + 1 < starts.length) {
      bar += 1;
      to = starts[bar + 1] ?? end;
    }
    return { from, to, firstBar: barOf(from) + 1, lastBar: bar + 1, misses: counts.get(barOf(from)) || 0 };
  }

  /* ---------- Haptic feedback (phones that can vibrate) ---------- */

  const hapticsSupported = () => typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
  const hapticsOn = key => readJson(key, true) !== false;

  function haptic(key, pattern = 12) {
    if (!hapticsSupported() || !hapticsOn(key)) return;
    try { navigator.vibrate(pattern); } catch {}
  }

  function bindHapticsToggle(input, key) {
    if (!input) return;
    const label = input.closest('label');
    if (!hapticsSupported()) { if (label) label.hidden = true; return; }
    input.checked = hapticsOn(key);
    input.addEventListener('change', () => {
      writeJson(key, input.checked);
      if (input.checked) haptic(key, 25);
    });
  }

  /* ---------- Send a song as a link ---------- */

  const toBase64Url = bytes => {
    let text = '';
    for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(text).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  };
  const fromBase64Url = code => {
    const text = atob(code.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((code.length + 3) % 4));
    return Uint8Array.from(text, ch => ch.charCodeAt(0));
  };

  async function encodeShare(doc) {
    const bytes = new TextEncoder().encode(JSON.stringify(doc));
    if (typeof CompressionStream === 'function') {
      const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw'));
      return `z${toBase64Url(new Uint8Array(await new Response(stream).arrayBuffer()))}`;
    }
    return `j${toBase64Url(bytes)}`;
  }

  async function decodeShare(code) {
    const kind = code.charAt(0);
    let bytes = fromBase64Url(code.slice(1));
    if (kind === 'z') {
      const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
      bytes = new Uint8Array(await new Response(stream).arrayBuffer());
    } else if (kind !== 'j') throw new Error('Unknown link');
    return JSON.parse(new TextDecoder().decode(bytes));
  }

  // Shares on phones (the share sheet), copies the link everywhere else.
  async function shareSongLink({ doc, title, appName }) {
    const code = await encodeShare(doc);
    const url = `${location.href.split('#')[0]}#song=${code}`;
    if (navigator.share && window.matchMedia?.('(pointer: coarse)').matches) {
      try {
        await navigator.share({ title, text: `“${title}” in ${appName}`, url });
        return 'shared';
      } catch (error) {
        if (error?.name === 'AbortError') return 'cancelled';
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      return 'copied';
    } catch {
      window.prompt('Copy this link and send it:', url);
      return 'shown';
    }
  }

  // A song that arrived in the address (#song=...). The address is cleaned up afterwards.
  async function readSharedSong() {
    const match = /[#&]song=([A-Za-z0-9_-]+)/.exec(location.hash || '');
    if (!match) return null;
    try {
      return await decodeShare(match[1]);
    } catch {
      return { broken: true };
    } finally {
      try { history.replaceState(null, '', location.href.split('#')[0]); } catch {}
    }
  }

  /* ---------- Tabs (Learn) ---------- */
  // groups: [{ label, items: [elements] }]. Elements of the other tabs are hidden, and so
  // are wrappers that hold nothing of the open tab.

  function tabify(container, groups, { startAt = 0 } = {}) {
    if (!container || container.dataset.tabbed) return;
    container.dataset.tabbed = '1';
    const assigned = new Map();
    groups.forEach((group, index) => group.items.filter(Boolean).forEach(element => assigned.set(element, index)));
    const wrappers = new Map();
    assigned.forEach((index, element) => {
      for (let parent = element.parentElement; parent && parent !== container; parent = parent.parentElement) {
        if (!wrappers.has(parent)) wrappers.set(parent, new Set());
        wrappers.get(parent).add(index);
      }
    });
    const bar = document.createElement('div');
    bar.className = 'learn-tabs';
    bar.setAttribute('role', 'tablist');
    const show = index => {
      assigned.forEach((tab, element) => element.classList.toggle('tab-off', tab !== index));
      wrappers.forEach((tabs, element) => element.classList.toggle('tab-off', !tabs.has(index)));
      bar.querySelectorAll('button').forEach((button, i) => {
        button.classList.toggle('active', i === index);
        button.setAttribute('aria-selected', String(i === index));
      });
      container.scrollTop = 0;
      container.closest('dialog')?.querySelector('form, .help-scroll')?.scrollTo?.(0, 0);
    };
    groups.forEach((group, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.setAttribute('role', 'tab');
      button.textContent = group.label;
      button.addEventListener('click', () => show(index));
      bar.appendChild(button);
    });
    container.prepend(bar);
    show(startAt);
  }

  /* ---------- Shared little dialog ---------- */

  function makeDialog(className) {
    const dialog = document.createElement('dialog');
    dialog.className = `dialog ethereal-mini-dialog ${className}`;
    document.body.appendChild(dialog);
    dialog.addEventListener('click', event => {
      if (event.target === dialog || event.target.closest('[data-mini-close]')) dialog.close();
    });
    return dialog;
  }

  const FLAME = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M12.3 2.5c.5 3.1-1.3 4.6-2.9 6.4-1.5 1.7-2.9 3.5-2.9 6.1A5.5 5.5 0 0 0 12 20.5a5.5 5.5 0 0 0 5.5-5.5c0-2.3-1-4-2.2-5.3.1 1.6-.4 2.8-1.6 3.4.4-3.7-.6-7.4-1.4-10.6z" fill="currentColor"/></svg>';

  /* ---------- Practice time: a small daily goal and a streak of days ---------- */

  const dayStamp = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

  function deviceId() {
    let id = '';
    try { id = localStorage.getItem('ethereal-device-id') || ''; } catch {}
    if (!id) {
      id = Math.random().toString(36).slice(2, 10);
      try { localStorage.setItem('ethereal-device-id', id); } catch {}
    }
    return id;
  }

  function createPracticeLog({ storageKey, isActive, onGoal }) {
    const device = deviceId();
    const load = () => {
      const value = readJson(storageKey, null);
      return value && typeof value === 'object' && value.days ? { goal: Number(value.goal) || 10, days: value.days } : { goal: 10, days: {} };
    };
    let data = load();
    let last = Date.now();
    let unsaved = 0;
    let shownMinute = -1;
    const listeners = new Set();
    const secondsOn = day => {
      const entry = data.days[day];
      if (!entry || typeof entry !== 'object') return 0;
      return Object.values(entry).reduce((sum, value) => sum + (Number(value) || 0), 0);
    };
    const save = () => {
      const days = Object.keys(data.days).sort();
      if (days.length > 400) days.slice(0, days.length - 400).forEach(day => delete data.days[day]);
      writeJson(storageKey, data);
      unsaved = 0;
    };
    const notify = () => listeners.forEach(fn => { try { fn(); } catch {} });
    const log = {
      key: storageKey,
      get goal() { return data.goal; },
      setGoal(minutes) { data.goal = Math.max(1, Number(minutes) || 10); save(); notify(); },
      todaySeconds() { return secondsOn(dayStamp()); },
      streak() {
        const need = data.goal * 60;
        const date = new Date();
        let count = secondsOn(dayStamp(date)) >= need ? 1 : 0;
        for (let i = 0; i < 400; i += 1) {
          date.setDate(date.getDate() - 1);
          if (secondsOn(dayStamp(date)) >= need) count += 1;
          else break;
        }
        return count;
      },
      reload() { data = load(); notify(); },
      onUpdate(fn) { listeners.add(fn); },
      save
    };
    setInterval(() => {
      const now = Date.now();
      const step = Math.min(5, Math.max(0, (now - last) / 1000));
      last = now;
      if (document.hidden || !isActive()) return;
      const day = dayStamp();
      const need = data.goal * 60;
      const before = secondsOn(day);
      const entry = data.days[day] && typeof data.days[day] === 'object' ? data.days[day] : (data.days[day] = {});
      entry[device] = (Number(entry[device]) || 0) + step;
      unsaved += step;
      const after = before + step;
      if (before < need && after >= need) { save(); onGoal?.(log.streak()); }
      if (unsaved >= 20) save();
      const minute = Math.floor(after / 60);
      if (minute !== shownMinute) { shownMinute = minute; notify(); }
    }, 1000);
    const flush = () => { if (unsaved > 0) save(); };
    document.addEventListener('visibilitychange', () => { if (document.hidden) flush(); });
    window.addEventListener('pagehide', flush);
    return log;
  }

  function todayHtml(log) {
    const minutes = Math.floor(log.todaySeconds() / 60);
    const goal = log.goal;
    const streak = log.streak();
    const done = minutes >= goal;
    const pct = Math.min(100, Math.round((minutes / goal) * 100));
    return `<div class="today-row">
        <span class="today-flame${streak ? ' lit' : ''}" title="Days in a row with your goal reached">${FLAME}<b>${streak}</b></span>
        <span class="today-copy"><b>${done ? 'Goal reached today!' : `Today ${minutes} of ${goal} min`}</b><small>${streak === 1 ? '1 day in a row' : `${streak} days in a row`}</small></span>
        <label class="today-goal" title="Daily goal"><select aria-label="Daily goal">${[5, 10, 15, 20, 30].map(value => `<option value="${value}"${value === goal ? ' selected' : ''}>${value} min</option>`).join('')}</select></label>
      </div>
      <div class="today-bar${done ? ' done' : ''}"><i style="width:${pct}%"></i></div>`;
  }

  // The card at the top of the song list: today's minutes, the streak, Song path, Rhythm drills.
  function todayCard({ log, onPath, onDrills }) {
    const card = document.createElement('section');
    card.className = 'today-card';
    const paint = () => {
      card.querySelector('.today-body').innerHTML = todayHtml(log);
      card.querySelector('select').addEventListener('change', event => log.setGoal(Number(event.target.value)));
    };
    card.innerHTML = `<div class="today-body"></div>
      <div class="today-actions">
        <button type="button" data-today="path"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="6" cy="18" r="2.4"/><circle cx="18" cy="6" r="2.4"/><path d="M8.2 16.6c4-1.2 1.6-6.4 6.2-8.6"/></svg>Song path</button>
        <button type="button" data-today="drills"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 17V6M12 17V9M18 17V4"/><circle cx="4.5" cy="17.5" r="1.8" fill="currentColor"/><circle cx="10.5" cy="17.5" r="1.8" fill="currentColor"/><circle cx="16.5" cy="17.5" r="1.8" fill="currentColor"/></svg>Rhythm drills</button>
      </div>`;
    paint();
    card.querySelector('[data-today="path"]').addEventListener('click', onPath);
    card.querySelector('[data-today="drills"]').addEventListener('click', onDrills);
    log.onUpdate(() => { if (card.isConnected) paint(); });
    return card;
  }

  function todayLine(log) {
    const minutes = Math.floor(log.todaySeconds() / 60);
    const streak = log.streak();
    return `<span class="today-line">${FLAME}<b>${streak}</b> ${streak === 1 ? 'day' : 'days'} · today ${minutes} of ${log.goal} min</span>`;
  }

  /* ---------- Song path: easy to hard, the next song opens with stars ---------- */

  let pathDialog = null;

  function openSongPath({ songs, store, onPick, needStars = 2 }) {
    if (!pathDialog) pathDialog = makeDialog('path-dialog');
    let open = true;
    let total = 0;
    const nodes = songs.map((song, index) => {
      const stars = bestStars(store.get(song.id));
      total += stars;
      const unlocked = open || stars > 0;
      const prev = songs[index - 1];
      const node = `<li class="path-node ${index % 2 ? 'side-r' : 'side-l'}${unlocked ? '' : ' locked'}${stars ? ' played' : ''}">
        <button type="button" data-path-song="${esc(song.id)}" ${unlocked ? '' : `data-locked="${esc(prev?.title || '')}"`}>
          <span class="path-dot">${unlocked ? (stars >= needStars ? '✓' : index + 1) : '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>'}</span>
          <span class="path-copy"><b>${esc(song.title)}</b><small><em class="path-level" data-level="${esc(song.level)}">${esc(capitalise(song.level))}</em><i class="path-stars">${starsHtml(stars)}</i></small></span>
        </button>
      </li>`;
      open = stars >= needStars;
      return node;
    }).join('');
    pathDialog.innerHTML = `<div class="path-card">
      <div class="path-head"><div><p class="eyebrow">SONG PATH</p><h2>From easy to hard</h2></div><button type="button" class="icon-btn" data-mini-close aria-label="Close">×</button></div>
      <p class="path-sub">Earn ${needStars} stars on a song to open the next one. <b>${total}</b> of ${songs.length * STAR_COUNT} stars.</p>
      <ol class="path-list">${nodes}</ol>
    </div>`;
    pathDialog.querySelectorAll('[data-path-song]').forEach(button => button.addEventListener('click', () => {
      if (button.dataset.locked !== undefined) {
        showMiniNote(pathDialog, `Earn ${needStars} stars on “${button.dataset.locked}” to open this song.`);
        return;
      }
      pathDialog.close();
      onPick(button.dataset.pathSong);
    }));
    if (!pathDialog.open) pathDialog.showModal();
    [...pathDialog.querySelectorAll('.path-node:not(.locked)')].pop()?.scrollIntoView?.({ block: 'center' });
  }

  function showMiniNote(dialog, text) {
    let note = dialog.querySelector('.mini-note');
    if (!note) {
      note = document.createElement('p');
      note.className = 'mini-note';
      dialog.firstElementChild.appendChild(note);
    }
    note.textContent = text;
    note.classList.remove('show');
    void note.offsetWidth;
    note.classList.add('show');
  }

  /* ---------- Record a take: the song and your playing, to listen back ---------- */

  function pickRecordingType() {
    if (typeof MediaRecorder !== 'function') return null;
    const types = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
    return types.find(type => MediaRecorder.isTypeSupported?.(type)) || '';
  }

  function createTakeRecorder({ getContext, getOutput, getMicStream, ensureMic, isPlaying, onTake }) {
    const type = pickRecordingType();
    const r = { armed: false, recorder: null, chunks: [], nodes: [], take: null, startedAt: 0, wasPlaying: false };
    const supported = type !== null && typeof window.AudioContext !== 'undefined';
    const listeners = new Set();
    const tell = () => listeners.forEach(fn => fn({ armed: r.armed, recording: Boolean(r.recorder), take: r.take }));

    function begin() {
      const context = getContext();
      const output = getOutput();
      if (!context || !output || r.recorder) return;
      try {
        const destination = context.createMediaStreamDestination();
        output.connect(destination);
        r.nodes = [() => { try { output.disconnect(destination); } catch {} }];
        const stream = getMicStream();
        if (stream) {
          const source = context.createMediaStreamSource(stream);
          const gain = context.createGain();
          gain.gain.value = 1.6;
          source.connect(gain).connect(destination);
          r.nodes.push(() => { try { source.disconnect(); gain.disconnect(); } catch {} });
        }
        const recorder = new MediaRecorder(destination.stream, type ? { mimeType: type } : undefined);
        r.chunks = [];
        recorder.ondataavailable = event => { if (event.data && event.data.size) r.chunks.push(event.data); };
        recorder.onstop = () => {
          r.nodes.forEach(undo => undo());
          r.nodes = [];
          const seconds = (performance.now() - r.startedAt) / 1000;
          if (seconds > 1.5 && r.chunks.length) {
            if (r.take) URL.revokeObjectURL(r.take.url);
            const blob = new Blob(r.chunks, { type: recorder.mimeType || type || 'audio/webm' });
            r.take = { url: URL.createObjectURL(blob), blob, seconds, at: Date.now(), ext: /mp4/.test(blob.type) ? 'm4a' : /ogg/.test(blob.type) ? 'ogg' : 'webm' };
            onTake?.(r.take);
          }
          r.recorder = null;
          tell();
        };
        recorder.start(1000);
        r.recorder = recorder;
        r.startedAt = performance.now();
        tell();
      } catch (error) {
        console.warn('Recording could not start:', error);
        r.recorder = null;
        tell();
      }
    }

    function end() {
      if (r.recorder && r.recorder.state !== 'inactive') r.recorder.stop();
    }

    setInterval(() => {
      const playing = Boolean(isPlaying());
      if (playing && !r.wasPlaying && r.armed) begin();
      if (!playing && r.wasPlaying) end();
      r.wasPlaying = playing;
    }, 200);

    return {
      supported,
      onState(fn) { listeners.add(fn); },
      get armed() { return r.armed; },
      get take() { return r.take; },
      get recording() { return Boolean(r.recorder); },
      async setArmed(on) {
        if (on && !(await ensureMic())) return false;
        r.armed = Boolean(on);
        if (!on) end();
        tell();
        return true;
      }
    };
  }

  function takeHtml(take, title = 'take') {
    if (!take) return '';
    const name = `${String(title).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'my'}-take.${take.ext}`;
    return `<div class="take-head"><b>Your take</b><span>${Math.round(take.seconds)} s · the song and your playing</span><a href="${take.url}" download="${esc(name)}">Download</a></div><audio controls preload="metadata" src="${take.url}"></audio>`;
  }

  // The Rec chip (record the next run) and the Take chip (listen to the last take).
  function bindRecChips({ rec, recBtn, takeBtn, toast }) {
    if (!recBtn) return;
    if (!rec.supported) { recBtn.hidden = true; return; }
    let player = null;
    const label = recBtn.querySelector('span');
    rec.onState(({ armed, recording, take }) => {
      recBtn.classList.toggle('armed', armed);
      recBtn.classList.toggle('recording', recording);
      recBtn.setAttribute('aria-pressed', String(armed));
      if (label) label.textContent = recording ? 'Recording' : armed ? 'Rec on' : 'Rec';
      if (takeBtn) takeBtn.hidden = !take;
    });
    recBtn.addEventListener('click', async () => {
      const on = !rec.armed;
      const ok = await rec.setArmed(on);
      if (!ok) { toast('Turn on the microphone to record your take.'); return; }
      toast(on ? 'Rec is on: press Play. Your take (the song and your playing) is kept until you stop.' : 'Rec is off.');
    });
    takeBtn?.addEventListener('click', () => {
      const take = rec.take;
      if (!take) return;
      if (player && !player.paused) { player.pause(); takeBtn.textContent = '▶ Take'; return; }
      player = new Audio(take.url);
      player.addEventListener('ended', () => { takeBtn.textContent = '▶ Take'; });
      player.play().catch(() => {});
      takeBtn.textContent = '❚❚ Take';
    });
  }

  /* ---------- Rhythm drills: short random patterns to read and play ---------- */

  const DRILL_CELLS = {
    1: [[[1], 7], [[2], 2], [['r1'], 2]],
    2: [[[1], 5], [[0.5, 0.5], 6], [['r0.5', 0.5], 2], [[0.5, 'r0.5'], 1], [[2], 1], [['r1'], 1]],
    3: [[[1], 3], [[0.5, 0.5], 4], [[0.25, 0.25, 0.25, 0.25], 3], [[0.5, 0.25, 0.25], 3], [[0.25, 0.25, 0.5], 3], [[1 / 3, 1 / 3, 1 / 3], 3], [[0.75, 0.25], 2], [['r0.5', 0.5], 1], [['r1'], 1]]
  };

  function pickWeighted(list) {
    const total = list.reduce((sum, [, weight]) => sum + weight, 0);
    let roll = Math.random() * total;
    for (const [value, weight] of list) { roll -= weight; if (roll <= 0) return value; }
    return list[list.length - 1][0];
  }

  // Bars of { d: beats, rest: bool }. A two-beat note only starts on beat 1 or 3.
  function generateRhythm({ level = 1, bars = 2, beatsPerBar = 4 } = {}) {
    const cells = DRILL_CELLS[level] || DRILL_CELLS[1];
    const out = [];
    for (let bar = 0; bar < bars; bar += 1) {
      const events = [];
      let beat = 0;
      let rests = 0;
      while (beat < beatsPerBar) {
        let cell = pickWeighted(cells);
        const long = cell.length === 1 && cell[0] === 2;
        const restCell = cell.some(value => typeof value === 'string');
        if ((long && (beat % 2 !== 0 || beatsPerBar - beat < 2)) || (restCell && (rests >= 1 || (bar === 0 && beat === 0)))) cell = [1];
        cell.forEach(value => {
          const rest = typeof value === 'string';
          events.push({ d: rest ? Number(value.slice(1)) : value, rest });
        });
        if (restCell) rests += 1;
        beat += long ? 2 : 1;
      }
      out.push(events);
    }
    return out;
  }

  const DRILL_KEY = 'ethereal-rhythm-drill-v1';
  const drillOptions = () => ({ level: 1, bars: 2, bpm: 70, ...(readJson(DRILL_KEY, {}) || {}) });
  let drillDialog = null;

  function openDrills({ onStart }) {
    if (!drillDialog) drillDialog = makeDialog('drill-dialog');
    const o = drillOptions();
    const levels = [
      [1, 'Beginner', 'Whole beats, long notes and rests'],
      [2, 'Steady', 'Adds half beats (eighth notes)'],
      [3, 'Advanced', 'Adds quarter beats and triplets']
    ];
    drillDialog.innerHTML = `<div class="drill-card">
      <div class="path-head"><div><p class="eyebrow">RHYTHM DRILLS</p><h2>Read a new rhythm</h2></div><button type="button" class="icon-btn" data-mini-close aria-label="Close">×</button></div>
      <p class="path-sub">A short random pattern on one note. Read it, then press Play and play along. Every drill is new.</p>
      <div class="drill-levels">${levels.map(([value, name, text]) => `<button type="button" class="drill-level${o.level === value ? ' active' : ''}" data-level="${value}"><b>${name}</b><small>${text}</small></button>`).join('')}</div>
      <div class="drill-row"><span>Length</span><div class="drill-seg">${[2, 4].map(value => `<button type="button" data-bars="${value}" class="${o.bars === value ? 'active' : ''}">${value} bars</button>`).join('')}</div></div>
      <div class="drill-row"><span>Tempo</span><div class="drill-seg">${[60, 70, 90, 110].map(value => `<button type="button" data-bpm="${value}" class="${o.bpm === value ? 'active' : ''}">${value}</button>`).join('')}</div></div>
      <button type="button" class="primary-btn drill-start">Start a drill</button>
    </div>`;
    const pick = (selector, key, cast = Number) => drillDialog.querySelectorAll(selector).forEach(button => button.addEventListener('click', () => {
      drillDialog.querySelectorAll(selector).forEach(other => other.classList.toggle('active', other === button));
      o[key] = cast(button.dataset[key]);
    }));
    pick('[data-level]', 'level');
    pick('[data-bars]', 'bars');
    pick('[data-bpm]', 'bpm');
    drillDialog.querySelector('.drill-start').addEventListener('click', () => {
      writeJson(DRILL_KEY, o);
      drillDialog.close();
      onStart({ ...o, bars: generateRhythm({ level: o.level, bars: o.bars }) });
    });
    if (!drillDialog.open) drillDialog.showModal();
  }

  // The next drill with the last settings (from the results screen).
  function nextDrill() {
    const o = drillOptions();
    return { ...o, bars: generateRhythm({ level: o.level, bars: o.bars }) };
  }

  /* ---------- Cloud saves: progress kept online, shared by your devices ---------- */
  // A random sync code is the only key. Nothing is sent before the player agrees.

  const CODE_CHARS = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  const CODE_PATTERN = /^[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}$/;

  function newSyncCode() {
    const bytes = new Uint8Array(12);
    crypto.getRandomValues(bytes);
    const chars = [...bytes].map(value => CODE_CHARS[value % CODE_CHARS.length]).join('');
    return `${chars.slice(0, 4)}-${chars.slice(4, 8)}-${chars.slice(8, 12)}`;
  }

  const PRIVACY_HTML = `<div class="privacy-text">
    <p><b>What is saved:</b> a random sync code, the name or nickname you choose, and your progress in this app: songs played, scores and stars, tries, practice minutes and dates. No email, no account, no recordings, no location.</p>
    <p><b>Why:</b> to keep your progress safe and let you use it on your other devices. The makers of the app may look at totals (how many people play, which songs are popular) to make the app better.</p>
    <p><b>Where:</b> in a private Google Sheet that belongs to the makers of the app (Google stores it). It is never sold or shared.</p>
    <p><b>How long:</b> until you tap <b>Delete progress</b>, which removes it from the cloud straight away.</p>
    <p><b>Your choice:</b> nothing leaves this device until you agree here. Without the cloud everything stays on this device.</p>
    <p><b>Questions or a deletion request:</b> write to us through our Ko-fi page.</p>
  </div>`;

  function createCloud({ app, appName, keys, stats, onMerged, toast }) {
    const url = String(window.ETHEREAL_PROGRESS_SYNC_URL || '').trim();
    const stateKey = `${app}-cloud-v1`;
    let s = readJson(stateKey, null) || {};
    let timer = 0;
    let busy = false;
    const save = () => writeJson(stateKey, s);

    async function call(action, extra = {}) {
      if (!url) throw new Error('Cloud saves are not set up yet.');
      const response = await fetch(url, { method: 'POST', body: JSON.stringify({ action, app, code: s.code, ...extra }) });
      const result = await response.json();
      if (!result || !result.ok) throw new Error(result?.error || 'The cloud did not answer.');
      return result;
    }

    async function pushNow() {
      if (!s.code) return;
      await call('save', { nickname: s.nickname || '', stats: stats(), device: navigator.userAgent.includes('Mobile') ? 'phone' : 'computer', data: collectProgress(keys) });
      s.lastSync = Date.now();
      save();
    }

    async function syncNow() {
      if (!s.code || busy) return;
      busy = true;
      try {
        const result = await call('load');
        if (result.found && result.data) {
          mergeProgress(result.data, keys);
          if (result.nickname && !s.nickname) s.nickname = result.nickname;
          onMerged?.();
        }
        await pushNow();
      } finally {
        busy = false;
      }
    }

    const cloud = {
      enabled: Boolean(url),
      get connected() { return Boolean(s.code); },
      get code() { return s.code || ''; },
      changed() {
        if (!s.code) return;
        clearTimeout(timer);
        timer = setTimeout(() => pushNow().catch(() => {}), 4000);
      },
      sync: () => syncNow(),
      push: () => pushNow(),
      async start(nickname) {
        s = { code: newSyncCode(), nickname: String(nickname || '').trim().slice(0, 40), consentAt: new Date().toISOString() };
        save();
        await pushNow();
      },
      async join(code, nickname) {
        const clean = String(code || '').toUpperCase().replace(/[^0-9A-Z]/g, '');
        const formatted = `${clean.slice(0, 4)}-${clean.slice(4, 8)}-${clean.slice(8, 12)}`;
        if (!CODE_PATTERN.test(formatted)) throw new Error('That code does not look right (12 letters and numbers).');
        const previous = s;
        s = { code: formatted, nickname: String(nickname || '').trim().slice(0, 40), consentAt: new Date().toISOString() };
        try {
          const result = await call('load');
          if (!result.found) throw new Error('No progress found for that code.');
          mergeProgress(result.data, keys);
          if (!s.nickname && result.nickname) s.nickname = result.nickname;
          save();
          onMerged?.();
          await pushNow();
        } catch (error) {
          s = previous;
          save();
          throw error;
        }
      },
      async rename(nickname) { s.nickname = String(nickname || '').trim().slice(0, 40); save(); await pushNow(); },
      async remove() {
        clearTimeout(timer);
        timer = 0;
        if (s.code) await call('delete');
        s = {};
        save();
      },
      lastSync() { return s.lastSync || 0; },
      nickname() { return s.nickname || ''; }
    };

    // Opening the app: bring in what the other devices saved.
    if (cloud.enabled && s.code) setTimeout(() => syncNow().catch(() => {}), 1500);
    window.addEventListener('pagehide', () => {
      if (!timer || !s.code || !url) return;
      try { navigator.sendBeacon?.(url, JSON.stringify({ action: 'save', app, code: s.code, nickname: s.nickname || '', stats: stats(), data: collectProgress(keys) })); } catch {}
    });
    return cloud;
  }

  // A few totals that are easy to read in the cloud sheet.
  function progressStats(keys, log) {
    const best = readJson(keys.best, {}) || {};
    const history = readJson(keys.history, {}) || {};
    const real = Object.values(best).filter(item => item && Number(item.accuracy) > 0);
    let seconds = 0;
    Object.values(readJson(keys.practice, null)?.days || {}).forEach(day => Object.values(day || {}).forEach(value => { seconds += Number(value) || 0; }));
    return {
      songs: real.length,
      stars: real.reduce((sum, item) => sum + bestStars(item), 0),
      tries: Object.values(history).reduce((sum, list) => sum + (Array.isArray(list) ? list.length : 0), 0),
      minutes: Math.round(seconds / 60),
      streak: log ? log.streak() : 0
    };
  }

  let progressDialog = null;

  // "Save progress": the cloud (with the privacy note first) or a file.
  function openSaveProgress({ cloud, appName, onFileSave, onFileLoad, toast }) {
    if (!progressDialog) progressDialog = makeDialog('progress-dialog');
    const d = progressDialog;
    const head = `<div class="path-head"><div><p class="eyebrow">YOUR PROGRESS</p><h2>Save progress</h2></div><button type="button" class="icon-btn" data-mini-close aria-label="Close">×</button></div>`;
    const fileRow = `<div class="progress-file-row"><span>Or use a file:</span><button type="button" class="text-btn" data-p="file-save">Save to a file</button><button type="button" class="text-btn" data-p="file-load">Load a file</button></div>`;
    const ago = time => {
      if (!time) return 'not yet';
      const minutes = Math.round((Date.now() - time) / 60000);
      return minutes < 1 ? 'just now' : minutes < 60 ? `${minutes} min ago` : new Date(time).toLocaleString();
    };
    const paint = view => {
      let body = '';
      if (!cloud.enabled) {
        body = `<p class="path-sub">Cloud saves are not switched on in this copy of ${esc(appName)} yet. You can still carry your progress to another device with a file.</p>`;
      } else if (view === 'consent' || view === 'join') {
        body = `<p class="path-sub">${view === 'join' ? 'Enter the code from your other device. Your progress from both devices is joined.' : 'Your stars, history and practice days are kept online, and your other devices can use them with a code.'}</p>
          ${PRIVACY_HTML}
          ${view === 'join' ? '<label class="progress-field"><span>Code from your other device</span><input type="text" data-p="code" placeholder="XXXX-XXXX-XXXX" autocomplete="off" autocapitalize="characters" maxlength="16"></label>' : ''}
          <label class="progress-field"><span>${view === 'join' ? 'Your name (leave empty to keep the one from your other device)' : 'Your name or nickname (the app makers see it)'}</span><input type="text" data-p="nick" maxlength="40" placeholder="e.g. Anya" autocomplete="nickname"></label>
          <label class="toggle-label progress-agree"><input type="checkbox" data-p="agree"><span>I have read this and agree</span></label>
          <div class="progress-actions-row"><button type="button" class="soft-btn" data-p="back">Back</button><button type="button" class="primary-btn" data-p="${view === 'join' ? 'do-join' : 'do-start'}" disabled>${view === 'join' ? 'Join and save' : 'Save to the cloud'}</button></div>`;
      } else if (cloud.connected) {
        body = `<p class="progress-ok">✓ Your progress is saved in the cloud</p>
          <div class="progress-code"><span>Your code</span><b>${esc(cloud.code)}</b><button type="button" class="soft-btn" data-p="copy">Copy</button></div>
          <p class="path-sub">On another device: <b>Save progress → I have a code</b>, then enter this code. Keep it private: anyone with the code can see and delete this progress.</p>
          <label class="progress-field"><span>Your name</span><input type="text" data-p="nick" maxlength="40" value="${esc(cloud.nickname())}"></label>
          <p class="progress-meta">Last saved: ${esc(ago(cloud.lastSync()))}</p>
          <div class="progress-actions-row"><button type="button" class="primary-btn" data-p="sync">Save now</button></div>`;
      } else {
        body = `<p class="path-sub">Keep your stars, history and daily streak safe, and use them on your phone, tablet and computer.</p>
          <div class="progress-choice"><button type="button" class="choice-btn primary" data-p="consent"><b>Save to the cloud</b><small>Get a code for your other devices</small></button>
          <button type="button" class="choice-btn" data-p="join"><b>I have a code</b><small>Join the progress from another device</small></button></div>`;
      }
      d.innerHTML = `<div class="progress-card">${head}${body}${fileRow}<p class="mini-note"></p></div>`;
      const q = name => d.querySelector(`[data-p="${name}"]`);
      const note = text => { const el = d.querySelector('.mini-note'); el.textContent = text; el.classList.add('show'); };
      const ready = () => {
        const go = q('do-start') || q('do-join');
        if (!go) return;
        const named = q('do-join') || (q('nick')?.value.trim().length >= 2);
        go.disabled = !(q('agree')?.checked && named);
      };
      q('agree')?.addEventListener('change', ready);
      q('nick')?.addEventListener('input', ready);
      q('consent')?.addEventListener('click', () => paint('consent'));
      q('join')?.addEventListener('click', () => paint('join'));
      q('back')?.addEventListener('click', () => paint(''));
      q('do-start')?.addEventListener('click', async () => {
        note('Saving…');
        try { await cloud.start(q('nick').value); toast('Progress saved in the cloud.'); paint(''); } catch (error) { note(error.message); }
      });
      q('do-join')?.addEventListener('click', async () => {
        note('Looking for your progress…');
        try { await cloud.join(q('code').value, q('nick').value); toast('Progress joined. This device now saves to the cloud too.'); paint(''); } catch (error) { note(error.message); }
      });
      q('sync')?.addEventListener('click', async () => {
        note('Saving…');
        try {
          const nick = q('nick').value.trim();
          if (nick.length < 2) { note('Please write your name (2 letters or more).'); return; }
          if (nick !== cloud.nickname()) await cloud.rename(nick);
          await cloud.sync();
          paint('');
          toast('Progress saved.');
        } catch (error) { note(error.message); }
      });
      q('copy')?.addEventListener('click', async () => {
        try { await navigator.clipboard.writeText(cloud.code); note('Code copied.'); } catch { note(cloud.code); }
      });
      q('file-save')?.addEventListener('click', onFileSave);
      q('file-load')?.addEventListener('click', onFileLoad);
    };
    paint('');
    if (!d.open) d.showModal();
  }

  // "Delete progress": the cloud copy (and, if wanted, this device too).
  function openDeleteProgress({ cloud, clearLocal, toast }) {
    if (!progressDialog) progressDialog = makeDialog('progress-dialog');
    const d = progressDialog;
    const online = cloud.enabled && cloud.connected;
    d.innerHTML = `<div class="progress-card">
      <div class="path-head"><div><p class="eyebrow">YOUR PROGRESS</p><h2>Delete progress</h2></div><button type="button" class="icon-btn" data-mini-close aria-label="Close">×</button></div>
      <p class="path-sub">${online ? 'This deletes your saved progress from the cloud and stops saving it there. Your other devices keep what they already have.' : 'This clears your stars, history and practice days on this device.'}</p>
      ${online ? '<label class="toggle-label"><input type="checkbox" data-p="local"><span>Also clear it on this device</span></label>' : ''}
      <div class="progress-actions-row"><button type="button" class="soft-btn" data-mini-close>Cancel</button><button type="button" class="primary-btn danger-btn" data-p="go">Delete</button></div>
      <p class="mini-note"></p>
    </div>`;
    d.querySelector('[data-p="go"]').addEventListener('click', async () => {
      const note = d.querySelector('.mini-note');
      try {
        if (online) { note.textContent = 'Deleting…'; note.classList.add('show'); await cloud.remove(); }
        if (!online || d.querySelector('[data-p="local"]')?.checked) clearLocal();
        d.close();
        toast(online ? 'Your progress was deleted from the cloud.' : 'Progress cleared on this device.');
      } catch (error) {
        note.textContent = error.message;
        note.classList.add('show');
      }
    });
    if (!d.open) d.showModal();
  }

  /* ---------- Song journey: three paths, songs open as you reach them ---------- */
  // Each path is a list of nodes: songs and rhythm drills. A node opens when the node
  // before it has NEED stars. Songs that are not on any path stay open.

  const JOURNEY_NEED = 2;
  const ADMIN_HASH = '0dbebb3843a25af8';

  function codeHash(text) {
    const clean = String(text || '').toUpperCase().replace(/[^0-9A-Z]/g, '');
    let h1 = 0x811c9dc5;
    let h2 = 0x2b992ddf;
    for (let i = 0; i < clean.length; i += 1) {
      const c = clean.charCodeAt(i);
      h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
      h2 = Math.imul(h2 ^ c, 0x5bd1e995) >>> 0;
      h2 = (h2 ^ (h2 >>> 13)) >>> 0;
    }
    return h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0');
  }

  function createJourney({ app, paths, best, songOk = () => true }) {
    const key = `${app}-journey-v1`;
    const adminKey = `${app}-admin-v1`;
    let data = readJson(key, null) || { drills: {} };
    data.drills = data.drills || {};
    let admin = readJson(adminKey, false) === true;
    const nodes = [];
    paths.forEach((p, pathIndex) => p.nodes.forEach((node, index) => {
      if (node.type === 'song' && !songOk(node.id)) return;
      nodes.push({ ...node, path: p.id, pathIndex, key: `${p.id}-${index}`, g: nodes.length });
    }));
    const songNode = new Map(nodes.filter(node => node.type === 'song').map(node => [node.id, node]));
    const save = () => writeJson(key, data);
    const starsOf = node => (node.type === 'song' ? bestStars(best.get(node.id)) : Number(data.drills[node.key]) || 0);
    const unlocked = node => admin || node.g === 0 || starsOf(nodes[node.g - 1]) >= JOURNEY_NEED;
    const j = {
      key,
      paths,
      nodes,
      need: JOURNEY_NEED,
      activeDrill: null,
      starsOf,
      unlocked,
      get admin() { return admin; },
      isSongOpen(id) {
        const node = songNode.get(id);
        return !node || unlocked(node);
      },
      lockedSongCount(ids) { return ids.filter(id => !j.isSongOpen(id)).length; },
      // The furthest song you have reached (for a start, or after Start over).
      fallbackSong() {
        let id = '';
        nodes.forEach(node => { if (node.type === 'song' && unlocked(node)) id = node.id; });
        return id || nodes.find(node => node.type === 'song')?.id || '';
      },
      current() {
        return nodes.find(node => unlocked(node) && starsOf(node) < JOURNEY_NEED) || nodes[nodes.length - 1];
      },
      totalStars() { return nodes.reduce((sum, node) => sum + starsOf(node), 0); },
      recordDrill(stars) {
        if (!j.activeDrill) return;
        data.drills[j.activeDrill] = Math.max(Number(data.drills[j.activeDrill]) || 0, stars);
        save();
      },
      reload() { data = readJson(key, null) || { drills: {} }; data.drills = data.drills || {}; },
      tryAdmin(code) {
        if (codeHash(code) !== ADMIN_HASH) return false;
        admin = true;
        writeJson(adminKey, true);
        return true;
      },
      adminOff() { admin = false; writeJson(adminKey, false); }
    };
    return j;
  }

  // A little planet for each node, its colours taken from the song.
  function nodeThumb(node) {
    if (node.type === 'drill') return '<span class="j-thumb drill" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></span>';
    let hash = 7;
    for (const ch of String(node.id)) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
    const hue = hash % 360;
    const ring = hash % 3 === 0 ? ' ring' : '';
    const moon = hash % 2 === 0 ? ' moon' : '';
    return `<span class="j-thumb${ring}${moon}" style="--h:${hue};--x:${30 + (hash % 40)}%" aria-hidden="true"></span>`;
  }

  const LOCK_SVG = '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>';
  const PLAY_SVG = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M8 5.5v13l10.5-6.5z" fill="currentColor"/></svg>';

  let journeyDialog = null;

  function openJourney({ journey, onPlay, onStartOver, toast }) {
    if (!journeyDialog) {
      journeyDialog = document.createElement('dialog');
      journeyDialog.className = 'dialog journey-dialog';
      document.body.appendChild(journeyDialog);
      journeyDialog.addEventListener('click', event => { if (event.target === journeyDialog) journeyDialog.close(); });
    }
    const d = journeyDialog;
    const current = journey.current();
    let tab = current ? current.pathIndex : 0;
    let showCode = false;

    const paint = () => {
      const now = journey.current();
      const pathNodes = journey.nodes.filter(node => node.pathIndex === tab);
      const pathOpen = index => journey.nodes.some(node => node.pathIndex === index && journey.unlocked(node));
      const pathDone = index => journey.nodes.filter(node => node.pathIndex === index).every(node => journey.starsOf(node) >= journey.need);
      const total = journey.nodes.length * STAR_COUNT;
      const allDone = journey.nodes.every(node => journey.starsOf(node) >= journey.need);
      const rows = pathNodes.map((node, index) => {
        const stars = journey.starsOf(node);
        const open = journey.unlocked(node);
        const done = stars >= journey.need;
        const here = now && node.key === now.key && !allDone;
        const state = here ? 'current' : done ? 'done' : open ? 'open' : 'locked';
        const next = pathNodes[index + 1];
        const lineDone = next && journey.unlocked(next) ? ' solid' : '';
        const dot = state === 'done' ? '✓' : state === 'current' ? PLAY_SVG : state === 'open' ? PLAY_SVG : LOCK_SVG;
        const level = node.type === 'drill' ? `<em class="j-level" data-level="drill">${esc(node.levelName)} · ${node.bpm} BPM</em>` : `<em class="j-level" data-level="${esc(node.level)}">${esc(capitalise(node.level))}</em>`;
        const badge = state === 'done' ? '<span class="j-badge done">✓ Completed</span>' : state === 'current' ? `<span class="j-badge go">${PLAY_SVG}Ready to play</span>` : '';
        return `<li class="j-node ${state}${index === pathNodes.length - 1 ? ' last' : ''}${lineDone}">
          <span class="j-rail"><i class="j-dot">${dot}</i></span>
          <button type="button" class="j-card" data-node="${node.g}">
            ${nodeThumb(node)}
            <span class="j-copy">${here ? '<small class="j-here">You are here</small>' : ''}<b>${esc(node.title)}</b>${level}<i class="j-stars">${starsHtml(stars)}</i></span>
            ${badge}
          </button>
        </li>`;
      }).join('');
      const footer = allDone
        ? `<div class="j-next"><span class="j-thumb win" aria-hidden="true"></span><div><small>Journey complete</small><b>You reached the stars!</b><span>Play any song you like, or start over.</span></div></div>`
        : `<div class="j-next">${nodeThumb(now)}<div><small>Up next</small><b>${esc(now.title)}</b><span>Earn ${journey.need} stars on this ${now.type === 'drill' ? 'drill' : 'song'}</span></div></div>
           <button type="button" class="j-play" data-play="${now.g}">${PLAY_SVG}${now.type === 'drill' ? 'Play drill' : 'Play song'}</button>`;
      d.innerHTML = `<div class="journey">
        <header class="journey-head">
          <p class="journey-eyebrow">Song journey · a constellation route</p>
          <h2 class="journey-title">Reach the stars</h2>
          <p class="journey-count"><b>${journey.totalStars()}</b> / ${total} stars</p>
          <p class="journey-sub">Earn ${journey.need} stars to unlock the next song</p>
          <button type="button" class="journey-close" data-j="close" aria-label="Close">×</button>
        </header>
        <nav class="journey-tabs" role="tablist">${journey.paths.map((p, index) => `<button type="button" role="tab" class="${index === tab ? 'active' : ''}${pathOpen(index) ? '' : ' locked'}" data-tab="${index}"><small>Path ${index + 1}${pathDone(index) ? ' ✓' : pathOpen(index) ? '' : ' 🔒'}</small><b>${esc(p.name)}</b></button>`).join('')}</nav>
        ${journey.admin ? '<p class="journey-admin">Admin: everything is open. <button type="button" data-j="admin-off">Turn off</button></p>' : ''}
        <ol class="journey-list">${rows}</ol>
        <footer class="journey-foot">
          ${footer}
          <div class="j-links">
            <button type="button" data-j="over">Start over</button>
            <button type="button" data-j="code">Unlock code</button>
          </div>
          ${showCode ? '<form class="j-code" data-j="code-form"><input type="text" placeholder="Code" autocomplete="off" autocapitalize="characters" aria-label="Unlock code"><button type="submit">OK</button></form>' : ''}
          <p class="mini-note"></p>
        </footer>
      </div>`;
      const note = text => { const el = d.querySelector('.mini-note'); el.textContent = text; el.classList.remove('show'); void el.offsetWidth; el.classList.add('show'); };
      d.querySelector('[data-j="close"]').addEventListener('click', () => d.close());
      d.querySelectorAll('[data-tab]').forEach(button => button.addEventListener('click', () => { tab = Number(button.dataset.tab); paint(); }));
      const play = g => {
        const node = journey.nodes[g];
        if (!node) return;
        if (!journey.unlocked(node)) {
          const before = journey.nodes[g - 1];
          note(`Earn ${journey.need} stars on “${before?.title || ''}” first.`);
          return;
        }
        d.close();
        onPlay(node);
      };
      d.querySelectorAll('[data-node]').forEach(button => button.addEventListener('click', () => play(Number(button.dataset.node))));
      d.querySelector('[data-play]')?.addEventListener('click', event => play(Number(event.currentTarget.dataset.play)));
      d.querySelector('[data-j="over"]').addEventListener('click', () => {
        if (!window.confirm('Start the journey from the beginning?\n\nThis clears your stars and history on this device, and locks the songs again.')) return;
        onStartOver();
        tab = 0;
        paint();
        toast('A fresh start: the journey begins again.');
      });
      d.querySelector('[data-j="code"]').addEventListener('click', () => { showCode = !showCode; paint(); d.querySelector('.j-code input')?.focus(); });
      d.querySelector('[data-j="code-form"]')?.addEventListener('submit', event => {
        event.preventDefault();
        const value = d.querySelector('.j-code input').value;
        if (journey.tryAdmin(value)) { showCode = false; paint(); toast('Admin: every song and path is open.'); }
        else note('That code does not work.');
      });
      d.querySelector('[data-j="admin-off"]')?.addEventListener('click', () => { journey.adminOff(); paint(); toast('Admin is off: the journey locks are back.'); });
      requestAnimationFrame(() => d.querySelector('.j-node.current')?.scrollIntoView({ block: 'center' }));
    };
    paint();
    if (!d.open) d.showModal();
  }

  // In the song list: how many songs are still waiting on the journey.
  function journeyLockedRow({ count, onOpen }) {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'journey-locked-row';
    row.innerHTML = `<span class="j-lock">${LOCK_SVG}</span><span class="j-locked-copy"><b>${count} more ${count === 1 ? 'song' : 'songs'} to unlock</b><small>Reach the stars on the Song path</small></span><span aria-hidden="true">→</span>`;
    row.addEventListener('click', onOpen);
    return row;
  }

  window.EtherealCommon = {
    version: '6',
    esc, readJson, writeJson, capitalise, speedLabel,
    STAR_COUNT, scoreFor, starsForScore, starsFor, bestStars, starString, starsHtml, createBestStore, createHistoryStore, resultBestHtml, bestHtml, noStarsHtml, suggestSpeedUp,
    historySummary, historyChartHtml, resultHistoryHtml, openHistory, bindHistoryBadges, exportProgress, importProgress,
    mergeProgress, collectProgress, createPracticeLog, todayCard, todayLine, openSongPath, createTakeRecorder, takeHtml,
    generateRhythm, openDrills, nextDrill, createCloud, openSaveProgress, openDeleteProgress, bindRecChips, progressStats,
    createJourney, openJourney, journeyLockedRow, codeHash,
    smartLoopSpeeds, createSmartLoop, worstSection, haptic, bindHapticsToggle, hapticsSupported,
    encodeShare, decodeShare, shareSongLink, readSharedSong, tabify,
    startHereCard,
    micThreshold, micCheckSeen, openMicCheck,
    placeProgressInTape, isDesktopFit, syncProgressFill,
    fullscreenSupported, syncViewModeBtn, bindViewModeBtn, leaveFocusFullscreen,
    playChime
  };
})();
