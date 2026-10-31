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
        else if (weakest < noise * 4) verdict = `It is a little noisy here. Sensitivity is set, but a quieter room or a device 30-50 cm from the ${drumName} works best.`;
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
      if (incoming.practice.freeze) {
        const f = incoming.practice.freeze;
        mine.freeze = { since: [mine.freeze?.since, f.since].filter(Boolean).sort()[0] || dayStamp(), days: { ...(f.days || {}), ...(mine.freeze?.days || {}) } };
      }
      writeJson(keys.practice, mine);
    }
    if (keys.lessons && incoming.lessons?.scores) {
      const mine = readJson(keys.lessons, {scores:{}}); mine.scores = mine.scores || {};
      Object.entries(incoming.lessons.scores).forEach(([id,n]) => { if(Number.isFinite(n) && n >= 0 && n <= 100) mine.scores[id] = Math.max(Number(mine.scores[id]) || 0,n); });
      writeJson(keys.lessons,mine);
    }
    if (keys.journey && incoming.journey && typeof incoming.journey === 'object') {
      const mine = readJson(keys.journey, null) || { drills: {} };
      mine.drills = mine.drills || {};
      Object.entries(incoming.journey.drills || {}).forEach(([node, stars]) => { mine.drills[node] = Math.max(Number(mine.drills[node]) || 0, Number(stars) || 0); });
      mine.bosses = { ...(incoming.journey.bosses || {}), ...(mine.bosses || {}) };
      writeJson(keys.journey, mine);
    }
    if (keys.game && incoming.game && typeof incoming.game === 'object') {
      const mine = readJson(keys.game, null) || {};
      const theirs = incoming.game;
      const out = { ...theirs, ...mine };
      out.xp = Math.max(Number(mine.xp) || 0, Number(theirs.xp) || 0);
      out.c = { ...(theirs.c || {}), ...(mine.c || {}) };
      Object.entries(theirs.c || {}).forEach(([name, value]) => { if (Number.isFinite(Number(value)) && typeof value === 'number') out.c[name] = Math.max(Number(out.c[name]) || 0, value); });
      out.badges = { ...(theirs.badges || {}), ...(mine.badges || {}) };
      out.tiers = { ...(theirs.tiers || {}) };
      Object.entries(mine.tiers || {}).forEach(([id, tier]) => { out.tiers[id] = Math.max(Number(out.tiers[id]) || 0, Number(tier) || 0); });
      out.owned = [...new Set([...(theirs.owned || []), ...(mine.owned || [])])];
      for (const name of ['day', 'daily', 'workout']) {
        const a = mine[name], b = theirs[name];
        const stamp = value => String(value?.stamp || value?.day || '');
        if (stamp(b) > stamp(a)) out[name] = b;
        else if (stamp(a) === stamp(b) && a && b) {
          const newer = Number(theirs.updatedAt) > Number(mine.updatedAt) ? b : a;
          out[name] = { ...newer };
          if (name === 'daily') {
            out[name].swapped = Boolean(a.swapped || b.swapped);
            out[name].done = { ...(b.done || {}), ...(a.done || {}) };
          } else if (name === 'workout' && JSON.stringify(a.steps) === JSON.stringify(b.steps)) {
            out[name].done = a.steps.map((value, i) => Boolean(value || b.done?.[i]));
            out[name].bonus = Boolean(a.bonus || b.bonus);
          } else if (name === 'day') {
            Object.keys({ ...a, ...b }).forEach(key => { if (typeof a[key] === 'number' || typeof b[key] === 'number') out[name][key] = Math.max(Number(a[key]) || 0, Number(b[key]) || 0); });
            out[name].songs = [...new Set([...(a.songs || []), ...(b.songs || [])])];
            out[name].count = { ...(a.count || {}) };
            Object.entries(b.count || {}).forEach(([id, n]) => out[name].count[id] = Math.max(out[name].count[id] || 0, n));
          }
        }
      }
      out.updatedAt = Math.max(Number(mine.updatedAt) || 0, Number(theirs.updatedAt) || 0);
      writeJson(keys.game, out);
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
      return value && typeof value === 'object' && value.days ? { ...value, goal: Number(value.goal) || 10 } : { goal: 10, days: {} };
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
    // One automatic freeze; seven new daily goals refill the one-slot reserve.
    if (!data.freeze) data.freeze = { since: dayStamp(), days: {} };
    const freezeBalance = () => {
      const f = data.freeze;
      const goals = Object.keys(data.days).filter(day => day >= f.since && secondsOn(day) >= data.goal * 60);
      const events = [...goals.map(day => [day, 'goal']), ...Object.keys(f.days || {}).map(day => [day, 'freeze'])].sort((a, b) => a[0].localeCompare(b[0]));
      let tokens = 1, count = 0;
      events.forEach(([, kind]) => { if (kind === 'freeze') tokens = Math.max(0, tokens - 1); else if (++count % 7 === 0) tokens = 1; });
      return tokens;
    };
    const protectYesterday = () => {
      const date = new Date(); date.setDate(date.getDate() - 1);
      const yesterday = dayStamp(date); date.setDate(date.getDate() - 1);
      data.freeze = data.freeze || { since: dayStamp(), days: {} };
      data.freeze.days = data.freeze.days || {};
      if (!data.freeze.days[yesterday] && secondsOn(yesterday) < data.goal * 60 && secondsOn(dayStamp(date)) >= data.goal * 60 && freezeBalance() > 0) {
        data.freeze.days[yesterday] = Date.now(); save();
      }
      return yesterday;
    };
    const log = {
      key: storageKey,
      get goal() { return data.goal; },
      setGoal(minutes) { data.goal = Math.max(1, Number(minutes) || 10); save(); notify(); },
      todaySeconds() { return secondsOn(dayStamp()); },
      streak() {
        protectYesterday();
        const need = data.goal * 60;
        const date = new Date();
        if (secondsOn(dayStamp(date)) < need) date.setDate(date.getDate() - 1);
        let count = 0;
        for (let i = 0; i < 400; i += 1) {
          const day = dayStamp(date);
          if (secondsOn(day) >= need) count += 1;
          else if (!data.freeze.days[day]) break;
          date.setDate(date.getDate() - 1);
        }
        return count;
      },
      freezeStatus() { const yesterday = protectYesterday(); return { tokens: freezeBalance(), protected: Boolean(data.freeze.days[yesterday]) }; },
      reload() { data = load(); data.freeze = data.freeze || { since: dayStamp(), days: {} }; notify(); },
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

  // The card at the top of the song list: today's minutes, the streak, Song path, Practice studio.
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
        <button type="button" data-today="drills"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 17V6M12 17V9M18 17V4"/><circle cx="4.5" cy="17.5" r="1.8" fill="currentColor"/><circle cx="10.5" cy="17.5" r="1.8" fill="currentColor"/><circle cx="16.5" cy="17.5" r="1.8" fill="currentColor"/></svg>Practice studio</button>
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
            try { window.dispatchEvent(new CustomEvent('ethereal:take')); } catch {}
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

  /* ---------- Practice studio: short random patterns to read and play ---------- */

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

  const consentHtml = appName => `<div class="privacy-text">
    <p class="privacy-title"><b>Save your progress to the cloud</b> (optional)</p>
    <p>${esc(appName)} keeps your random sync code, the name or nickname you choose and your practice progress with Google, so you can restore your progress and use it on your other devices.</p>
    <p>Your cloud save includes the songs you played, scores, stars, attempts, practice time and dates, and whether you use a phone or a computer. No email address or sign-up is needed. Recordings and location are not included. We do not sell your data.</p>
    <p>Your progress is uploaded only after you agree. You can stop cloud saves on a device at any time, and remove your cloud save with <b>Delete progress</b>.</p>
    <p>Read our <button type="button" class="link-btn" data-privacy>Privacy Policy</button> for details about storage, keeping and deleting saves, and how to contact us.</p>
  </div>`;

  /* ---------- Privacy Policy ---------- */
  // Who to write to: an email when one is set in ethereal-cloud-config.js
  // (window.ETHEREAL_PRIVACY_EMAIL), otherwise a message through the Ko-fi page.
  const KOFI_URL = 'https://ko-fi.com/anya_and_lolo';
  const POLICY_UPDATED = '29 October 2026';

  function policyHtml(appName) {
    const email = String(window.ETHEREAL_PRIVACY_EMAIL || '').trim();
    const owner = String(window.ETHEREAL_PRIVACY_OWNER || '').trim();
    const contact = email
      ? `<a href="mailto:${esc(email)}">${esc(email)}</a> (or a message through our <a href="${KOFI_URL}" target="_blank" rel="noopener">Ko-fi page</a>)`
      : `a message through our <a href="${KOFI_URL}" target="_blank" rel="noopener">Ko-fi page</a>`;
    return `<div class="policy-text">
      <p class="policy-date">Last updated: ${POLICY_UPDATED}</p>
      <h3>1. Who we are</h3>
      <p>The Ethereal trainers (Ethereal Handpan and Ethereal Drum, here “the apps”) are made by ${owner ? esc(owner) + ', ' : ''}an independent developer based in Australia (“we”). We are responsible for the information described here. Privacy contact: ${contact}.</p>
      <h3>2. What stays on your device</h3>
      <p>Your practice progress, settings, your own songs and drafts, and the name you type are kept in your browser’s storage on this device. They are not sent to us unless you turn on cloud saves or send a song to the community gallery.</p>
      <p><b>Microphone.</b> If you turn it on, the sound is analysed on your device to recognise notes. We do not receive or keep your audio. Recordings you make with <b>Rec</b> stay on your device; you can download them yourself.</p>
      <p>Clearing your browser data, uninstalling the app or changing devices can remove progress that is only on this device.</p>
      <h3>3. Optional cloud save</h3>
      <p>Only if you agree in <b>Save progress</b>, we keep: a randomly generated sync code; the name or nickname you choose; which app it is; whether you use a phone or a computer; the songs you played with your best scores, stars and speed; your attempts; practice minutes and dates; your daily goal and song path progress; and when you first and last saved. No email address or sign-up is needed, and you can use a nickname. Recordings, audio and location are not included.</p>
      <p>We use it to save, restore and sync your progress between your devices, and to help you if you ask (for example when you lose your code). Where the EU or UK GDPR applies, our legal basis is your consent.</p>
      <h3>4. Sending a song to the community gallery</h3>
      <p>If you send a song, we receive the song itself (its title, the artist or arranger name you typed, its notes and settings) so we can review it. Approved songs are published in the apps for everyone. Please do not put personal details in a song you send.</p>
      <h3>5. Who else is involved</h3>
      <p><b>Google</b> stores the cloud saves (in a private Google Sheet, through Google Apps Script) and receives community songs. <b>GitHub</b> (GitHub Pages) hosts the apps. Like any website host, these services may process technical connection information such as your IP address, browser and the time of a request. <b>Ko-fi</b> handles donations and messages sent there. Each of them has its own privacy policy.</p>
      <p>We do not sell your personal information. Only we can open the cloud saves, and we share information only with these providers to run the apps, or when the law requires it. These providers may store and process information outside Australia, for example in the United States.</p>
      <h3>6. Keeping and deleting your cloud save</h3>
      <p>We keep your cloud save while you use cloud saves. <b>Delete progress</b> removes it from our list of saves. Google Sheets keeps a version history that only we can open, so a deleted save can stay in earlier versions of the sheet; ask us and we will remove those copies too. If you <b>Start over</b> on the song path, you get a new code and your old save is marked as replaced; it is kept until you or we delete it. We may also delete saves that have not been used for a long time.</p>
      <p><b>Stop saving on this device</b> (in Save progress) stops this device from sending your progress; your cloud save stays until you delete it. Withdrawing your consent stops future uploads and does not affect what was done before.</p>
      <h3>7. Your sync code</h3>
      <p>Anyone with your code can load, change or delete that save, so keep it private and do not post it publicly. No email is linked to a save; if you lose your code, contact us with the name you used and roughly when you last saved, and we will try to find it.</p>
      <h3>8. Your rights</h3>
      <p>Depending on the law where you live, you can ask to see, correct or delete your information, get a copy of it, object to or restrict how we use it, and withdraw your consent. Contact us; we may ask for a few details to find your save and check that it is yours. If you are not happy with our answer, you can complain to a data protection authority, such as the OAIC in Australia, the ICO in the UK, or the authority in your EU or EEA country.</p>
      <h3>9. Children</h3>
      <p>The apps are for a general audience and are not directed at children. Children should ask a parent or guardian before turning on cloud saves. A parent or guardian can contact us to remove a child’s save.</p>
      <h3>10. Changes</h3>
      <p>When the apps or our practices change, we update this policy and the date above, and point out important changes in the apps. We will ask before any new use that needs your consent.</p>
    </div>`;
  }

  let policyDialog = null;

  function openPrivacyPolicy(appName = 'the app') {
    if (!policyDialog) policyDialog = makeDialog('policy-dialog');
    policyDialog.innerHTML = `<div class="policy-card">
      <div class="path-head"><div><p class="eyebrow">ETHEREAL TRAINERS</p><h2>Privacy Policy</h2></div><button type="button" class="icon-btn" data-mini-close aria-label="Close">×</button></div>
      ${policyHtml(appName)}
      <div class="progress-actions-row"><button type="button" class="primary-btn" data-mini-close>Close</button></div>
    </div>`;
    if (!policyDialog.open) policyDialog.showModal();
    policyDialog.querySelector('.policy-text').scrollTop = 0;
  }

  // Any element with data-privacy inside a dialog opens the policy.
  function bindPrivacyLinks(root, appName) {
    root.querySelectorAll('[data-privacy]').forEach(button => button.addEventListener('click', () => openPrivacyPolicy(appName)));
  }

  /* ---------- A gentle pulse to show where to tap next ---------- */
  function nudge(el, ms = 2700) {
    if (!el) return;
    el.classList.remove('nudge');
    void el.offsetWidth;
    el.classList.add('nudge');
    clearTimeout(el._nudgeTimer);
    el._nudgeTimer = setTimeout(() => el.classList.remove('nudge'), ms);
  }

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

    async function pushNow(extra = {}) {
      if (!s.code) return;
      await call('save', { nickname: s.nickname || '', stats: stats(), device: navigator.userAgent.includes('Mobile') ? 'phone' : 'computer', data: collectProgress(keys), ...extra });
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
      // Start over: a fresh save under a new code; the old one is marked as replaced.
      async restart() {
        if (!s.code) return '';
        const old = s.code;
        clearTimeout(timer);
        timer = 0;
        s = { ...s, code: newSyncCode(), lastSync: 0 };
        save();
        await pushNow({ replaces: old });
        return s.code;
      },
      // Stop saving on this device (the cloud save stays until it is deleted).
      forget() {
        clearTimeout(timer);
        timer = 0;
        s = {};
        save();
      },
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

  // The same progress in words, for the columns of the cloud sheet.
  function progressReadable({ keys, titleOf = id => id, journey = null }) {
    const best = readJson(keys.best, {}) || {};
    const history = readJson(keys.history, {}) || {};
    const songs = Object.entries(best).filter(([, item]) => item && Number(item.accuracy) > 0)
      .sort((a, b) => bestStars(b[1]) - bestStars(a[1]) || Number(b[1].accuracy) - Number(a[1].accuracy))
      .map(([id, item]) => {
        const stars = bestStars(item);
        const tries = Array.isArray(history[id]) ? history[id].length : Number(item.runs) || 0;
        return `${titleOf(id) || id}: ${'★'.repeat(stars)}${'☆'.repeat(STAR_COUNT - stars)} ${Math.round(Number(item.accuracy))}% at ${speedLabel(Number(item.speed) || 1)}${tries ? ` (${tries} ${tries === 1 ? 'try' : 'tries'})` : ''}`;
      });
    const log = readJson(keys.practice, null) || {};
    const days = Object.entries(log.days || {}).map(([day, devices]) => [day, Object.values(devices || {}).reduce((sum, value) => sum + (Number(value) || 0), 0)])
      .filter(([, seconds]) => seconds >= 30).sort((a, b) => (a[0] < b[0] ? 1 : -1)).slice(0, 14)
      .map(([day, seconds]) => {
        const date = new Date(`${day}T12:00:00`);
        const label = Number.isNaN(date.getTime()) ? day : date.toLocaleDateString(window.EtherealI18n?.language || 'en-GB', { day: 'numeric', month: 'short' });
        return `${label}: ${Math.max(1, Math.round(seconds / 60))} min`;
      });
    if (days.length && log.goal) days.unshift(`Goal ${log.goal} min a day`);
    let path = '';
    if (journey) {
      path = journey.paths.map(p => {
        const nodes = journey.nodes.filter(node => node.path === p.id);
        const done = nodes.filter(node => journey.starsOf(node) >= journey.need).length;
        return `${p.name}: ${done} of ${nodes.length}`;
      }).join('\n');
      if (journey.admin) path += '\n(admin: all open)';
    }
    return { best: songs.join('\n'), practice: days.join('\n'), path };
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
          ${consentHtml(appName)}
          ${view === 'join' ? '<label class="progress-field"><span>Code from your other device</span><input type="text" data-p="code" placeholder="XXXX-XXXX-XXXX" autocomplete="off" autocapitalize="characters" maxlength="16"></label>' : ''}
          <label class="progress-field"><span>${view === 'join' ? 'Your name (leave empty to keep the one from your other device)' : 'Your name or nickname'}</span><input type="text" data-p="nick" maxlength="40" placeholder="e.g. John Appleseed" autocomplete="nickname"></label>
          <label class="toggle-label progress-agree"><input type="checkbox" data-p="agree"><span>I have read this and agree</span></label>
          <div class="progress-actions-row"><button type="button" class="soft-btn" data-p="back">Back</button><button type="button" class="primary-btn" data-p="${view === 'join' ? 'do-join' : 'do-start'}" disabled>${view === 'join' ? 'Join and save' : 'Save to the cloud'}</button></div>`;
      } else if (cloud.connected) {
        body = `<p class="progress-ok">✓ Your progress is saved in the cloud</p>
          <div class="progress-code"><span>Your code</span><b>${esc(cloud.code)}</b><button type="button" class="soft-btn" data-p="copy">Copy</button></div>
          <p class="path-sub">On another device: <b>Save progress → I have a code</b>, then enter this code. Keep it private: anyone with the code can see and delete this progress.</p>
          <label class="progress-field"><span>Your name</span><input type="text" data-p="nick" maxlength="40" value="${esc(cloud.nickname())}"></label>
          <p class="progress-meta">Last saved: ${esc(ago(cloud.lastSync()))}</p>
          <div class="progress-actions-row"><button type="button" class="primary-btn" data-p="sync">Save now</button></div>
          <div class="progress-links"><button type="button" class="text-btn" data-p="stop">Stop saving on this device</button><button type="button" class="text-btn" data-privacy>Privacy Policy</button></div>`;
      } else {
        body = `<p class="path-sub">Keep your stars, history and daily streak safe, and use them on your phone, tablet and computer.</p>
          <div class="progress-choice"><button type="button" class="choice-btn primary" data-p="consent"><b>Save to the cloud</b><small>Get a code for your other devices</small></button>
          <button type="button" class="choice-btn" data-p="join"><b>I have a code</b><small>Join the progress from another device</small></button></div>
          <div class="progress-links"><button type="button" class="text-btn" data-privacy>Privacy Policy</button></div>`;
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
      q('stop')?.addEventListener('click', () => {
        if (!window.confirm('Stop saving to the cloud on this device?\n\nYour cloud save stays (use Delete progress to remove it). Your progress on this device stays too.')) return;
        cloud.forget();
        toast('This device no longer saves to the cloud.');
        paint('');
      });
      bindPrivacyLinks(d, appName);
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
      <p class="path-sub">${online ? 'This deletes your save from our cloud list and stops saving it there. Your other devices keep what they already have.' : 'This clears your stars, history and practice days on this device.'}</p>
      ${online ? '<label class="toggle-label"><input type="checkbox" data-p="local"><span>Also clear it on this device</span></label>' : ''}
      <div class="progress-actions-row"><button type="button" class="soft-btn" data-mini-close>Cancel</button><button type="button" class="primary-btn danger-btn" data-p="go">Delete</button></div>
      <div class="progress-links"><button type="button" class="text-btn" data-privacy>Privacy Policy</button></div>
      <p class="mini-note"></p>
    </div>`;
    bindPrivacyLinks(d, 'the app');
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
    data.bosses = data.bosses || {};
    const nodes = [];
    paths.forEach((p, pathIndex) => p.nodes.forEach((node, index) => {
      if ((node.type === 'song' || node.type === 'boss') && !songOk(node.id)) return;
      nodes.push({ ...node, path: p.id, pathIndex, key: `${p.id}-${index}`, g: nodes.length });
    }));
    // A song can be on the path twice (a stop, and later its final trial): open if either is.
    const songNodes = new Map();
    nodes.filter(node => node.type === 'song' || node.type === 'boss').forEach(node => songNodes.set(node.id, [...(songNodes.get(node.id) || []), node]));
    const save = () => writeJson(key, data);
    // A final trial counts as five stars once it is beaten.
    const starsOf = node => (node.type === 'song' ? bestStars(best.get(node.id)) : node.type === 'boss' ? (data.bosses[node.key] ? STAR_COUNT : 0) : Number(data.drills[node.key]) || 0);
    const unlocked = node => admin || nodes.slice(0, node.g).every(before => starsOf(before) >= JOURNEY_NEED);
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
        const list = songNodes.get(id);
        return !list || list.some(node => unlocked(node));
      },
      // A run in Practice: is it good enough for a final trial (its speed and stars)?
      recordBoss(id, run) {
        const beaten = nodes.filter(node => node.type === 'boss' && node.id === id && !data.bosses[node.key] && unlocked(node)
          && Number(run.speed) >= node.speed - 1e-6 && starsFor(Number(run.accuracy), Number(run.speed)) >= node.stars);
        beaten.forEach(node => { data.bosses[node.key] = Date.now(); });
        if (beaten.length) save();
        return beaten;
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
      reload() { data = readJson(key, null) || { drills: {} }; data.drills = data.drills || {}; data.bosses = data.bosses || {}; },
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
    if (node.type === 'boss') return `<span class="j-thumb boss" aria-hidden="true">${achievementIcon('trial')}</span>`;
    if (node.type === 'drill') return '<span class="j-thumb drill" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></span>';
    let hash = 7;
    for (const ch of String(node.id)) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
    const hue = ([288,208,160,38,252,190,330,136][(node.g ?? (hash % 8)) % 8] + hash % 13) % 360;
    const ring = hash % 3 === 0 ? ' ring' : '';
    const moon = hash % 2 === 0 ? ' moon' : '';
    return `<span class="j-thumb${ring}${moon}" style="--h:${hue};--x:${30 + (hash % 40)}%" aria-hidden="true"><i class="planet-ring"></i><i class="planet-body"></i></span>`;
  }

  const LOCK_SVG = '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>';
  const PLAY_SVG = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M8 5.5v13l10.5-6.5z" fill="currentColor"/></svg>';

  let journeyDialog = null;

  // Draw the route through the actual waypoint positions, so it follows wrapped cards too.
  function drawJourneyRoute(dialog) {
    const list = dialog.querySelector('.journey-list');
    if (!list) return;
    const dots = [...list.querySelectorAll('.j-dot')];
    if (dots.length < 2) return;
    const box = list.getBoundingClientRect();
    const points = dots.map(dot => { const r = dot.getBoundingClientRect(); return { x: r.left - box.left + r.width / 2, y: r.top - box.top + list.scrollTop + r.height / 2 }; });
    const curve = points => points.map((p,i) => i ? `C${points[i-1].x},${(points[i-1].y + p.y)/2} ${p.x},${(points[i-1].y + p.y)/2} ${p.x},${p.y}` : `M${p.x},${p.y}`).join(' ');
    const last = list.querySelector('.j-node:last-child');
    const height = last.offsetTop + last.offsetHeight + 18;
    let svg = list.querySelector('.journey-route');
    if (!svg) { svg = document.createElementNS('http://www.w3.org/2000/svg','svg'); svg.classList.add('journey-route'); svg.setAttribute('aria-hidden','true'); list.prepend(svg); }
    svg.setAttribute('viewBox', `0 0 ${list.clientWidth} ${height}`);
    svg.style.height = `${height}px`;
    const nodes = [...list.querySelectorAll('.j-node')];
    const current = nodes.findIndex(node => !node.classList.contains('done'));
    const complete = current < 0 ? points : points.slice(0,current + 1);
    svg.innerHTML = `<path class="route-haze" d="${curve(points)}"/><path class="route-base" d="${curve(points)}"/>${complete.length > 1 ? `<path class="route-done" d="${curve(complete)}"/>` : ''}`;
  }

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
    const mapStyles = [['constellation','Constellation'],['aurora','Nebula trail']];
    let mapStyle = readJson('ethereal-journey-style-v1','constellation');
    if (!mapStyles.some(([id]) => id === mapStyle)) mapStyle = 'constellation';

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
        const boss = node.type === 'boss';
        const level = boss ? `<em class="j-level" data-level="boss">Final trial · ${esc(speedLabel(node.speed))} · ${'★'.repeat(node.stars)}</em>`
          : node.type === 'drill' ? `<em class="j-level" data-level="drill">${esc(node.levelName)} · ${node.bpm} BPM</em>` : `<em class="j-level" data-level="${esc(node.level)}">${esc(capitalise(node.level))}</em>`;
        const badge = state === 'done' ? `<span class="j-badge done">✓ ${boss ? 'Beaten' : 'Completed'}</span>` : state === 'current' ? `<span class="j-badge go">${PLAY_SVG}${boss ? 'Trial' : 'Ready to play'}</span>` : '';
        const prize = boss && node.reward ? `<i class="j-prize"><span class="skin-swatch" data-skin="${esc(node.reward)}" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i></span>Prize: ${esc(node.rewardName || '')}</i>` : `<i class="j-stars">${starsHtml(stars)}</i>`;
        return `<li class="j-node ${state} ${index % 2 ? 'way-left' : 'way-right'}${boss ? ' boss' : ''}${index === pathNodes.length - 1 ? ' last' : ''}${lineDone}" style="--drift:${Math.sin(index * 1.15).toFixed(3)}">
          <span class="j-rail"><i class="j-dot">${dot}</i></span>
          <button type="button" class="j-card" data-node="${node.g}">
            ${nodeThumb(node)}
            <span class="j-copy">${here ? '<small class="j-here">You are here</small>' : ''}<b>${esc(node.title)}</b>${level}${prize}</span>
            ${badge}
          </button>
        </li>`;
      }).join('');
      const footer = allDone
        ? `<div class="j-next"><span class="j-thumb win" aria-hidden="true"></span><div><small>Journey complete</small><b>You reached the stars!</b><span>Play any song you like, or start over.</span></div></div>`
        : now.type === 'boss'
          ? `<div class="j-next">${nodeThumb(now)}<div><small>Final trial</small><b>${esc(now.title)}</b><span>Play it at ${esc(speedLabel(now.speed))} in Practice and earn ${'★'.repeat(now.stars)}</span></div></div>
           <button type="button" class="j-play boss" data-play="${now.g}">${PLAY_SVG}Take the trial</button>`
          : `<div class="j-next">${nodeThumb(now)}<div><small>Up next</small><b>${esc(now.title)}</b><span>Earn ${journey.need} stars on this ${now.type === 'drill' ? 'drill' : 'song'}</span></div></div>
           <button type="button" class="j-play" data-play="${now.g}">${PLAY_SVG}${now.type === 'drill' ? 'Play drill' : 'Play song'}</button>`;
      d.innerHTML = `<div class="journey" data-map-style="${mapStyle}">
        <header class="journey-head">
          <p class="journey-eyebrow">Song journey · a constellation route</p>
          <h2 class="journey-title">Reach the stars</h2>
          <span class="journey-planet" aria-hidden="true"><i></i></span>
          <p class="journey-count"><b>${journey.totalStars()}</b> / ${total} stars</p>
          <p class="journey-sub">Earn ${journey.need} stars to unlock the next song</p>
          <button type="button" class="journey-close" data-j="close" aria-label="Close">×</button>
        </header>
        <nav class="journey-tabs" role="tablist">${journey.paths.map((p, index) => `<button type="button" role="tab" class="${index === tab ? 'active' : ''}${pathOpen(index) ? '' : ' locked'}" data-tab="${index}"><small>Path ${index + 1}${pathDone(index) ? ' ✓' : pathOpen(index) ? '' : ' 🔒'}</small><b>${esc(p.name)}</b></button>`).join('')}</nav>
        <nav class="journey-designs" aria-label="Journey appearance">${mapStyles.map(([id,label]) => `<button type="button" data-map="${id}" aria-pressed="${id === mapStyle}">${label}</button>`).join('')}</nav>
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
      d.querySelectorAll('[data-map]').forEach(button => button.addEventListener('click', () => { mapStyle = button.dataset.map; writeJson('ethereal-journey-style-v1',mapStyle); paint(); }));
      const note = text => { const el = d.querySelector('.mini-note'); el.textContent = text; el.classList.remove('show'); void el.offsetWidth; el.classList.add('show'); };
      d.querySelector('[data-j="close"]').addEventListener('click', () => d.close());
      d.querySelectorAll('[data-tab]').forEach(button => button.addEventListener('click', () => { tab = Number(button.dataset.tab); paint(); }));
      const play = g => {
        const node = journey.nodes[g];
        if (!node) return;
        if (!journey.unlocked(node)) {
          const before = journey.nodes[g - 1];
          note(before?.type === 'boss' ? `Beat the final trial “${before.title}” first.` : `Earn ${journey.need} stars on “${before?.title || ''}” first.`);
          return;
        }
        d.close();
        onPlay(node);
      };
      d.querySelectorAll('[data-node]').forEach(button => button.addEventListener('click', () => play(Number(button.dataset.node))));
      d.querySelector('[data-play]')?.addEventListener('click', event => play(Number(event.currentTarget.dataset.play)));
      d.querySelector('[data-j="over"]').addEventListener('click', () => {
        if (!window.confirm('Start the journey from the beginning?\n\nThis clears your stars and history on this device and locks the songs again. If you save to the cloud, you get a new code.')) return;
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
      requestAnimationFrame(() => { centreAchievementIcons(d); drawJourneyRoute(d); d.querySelector('.j-node.current')?.scrollIntoView({ block: 'center' }); });
      d.routeObserver?.disconnect();
      if (typeof ResizeObserver === 'function') { d.routeObserver = new ResizeObserver(() => drawJourneyRoute(d)); d.routeObserver.observe(d.querySelector('.journey-list')); }
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

  /* ---------- Player game: XP and levels, combos, badges, milestones, daily challenges,
     today's workout and rewards (drum colours and nebulas) ---------- */

  const LEVEL_TITLES = [[1, 'Stardust'], [5, 'Comet'], [10, 'Moon'], [15, 'Planet'], [20, 'Nova'], [30, 'Star'], [40, 'Galaxy']];
  const xpForLevel = level => 50 * level * (level - 1);
  const fmt = n => Math.round(Number(n) || 0).toLocaleString(window.EtherealI18n?.language || 'en-GB');

  function levelInfo(xp) {
    xp = Math.max(0, Math.min(1e12, Number(xp) || 0));
    const level = Math.floor((1 + Math.sqrt(1 + .08 * xp)) / 2);
    const from = xpForLevel(level);
    const to = xpForLevel(level + 1);
    const title = LEVEL_TITLES.filter(([min]) => level >= min).pop()[1];
    return { level, title, xp, from, to, into: xp - from, need: to - from, progress: Math.max(0, Math.min(1, (xp - from) / (to - from))) };
  }

  // Combo: 10 right notes in a row double the points, 25 triple them, 50 make them ×4.
  const comboFor = streak => (streak >= 50 ? 4 : streak >= 25 ? 3 : streak >= 10 ? 2 : 1);

  const COSMETICS = window.EtherealCosmetics;
  const SKINS = COSMETICS.skins;
  const NEBULAS = COSMETICS.nebulas;
  const REWARD_KINDS = ['skin', 'rim', 'accent', 'pattern', 'nebula', 'shape'];

  const ACHIEVEMENT_PATHS = {"runs": "M8 17V6l12-2v11M8 10l12-2 M8 17a2.5 2.5 0 1 1-5 0a2.5 2.5 0 1 1 5 0 M20 15a2.5 2.5 0 1 1-5 0a2.5 2.5 0 1 1 5 0", "notes": "M12 2v4M12 18v4M2 12h4M18 12h4 M12 8a4 4 0 1 0 0 8a4 4 0 0 0 0-8 M12 11v2", "perfect": "M12 3l2.3 6.7L21 12l-6.7 2.3L12 21l-2.3-6.7L3 12l6.7-2.3Z", "stars": "M12 2l3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1Z", "easy": "M5 20C3 10 10 3 20 4c0 9-5 16-15 16Z M5 20l10-10", "medium": "M17 3a9 9 0 1 0 4 14A9 9 0 0 1 17 3Z", "hard": "M13 2c1 6-4 6-2 11 2-1 4-3 4-5 6 7 4 14-3 14S1 15 7 8c0 3 1 4 2 4-1-5 2-7 4-10Z", "minutes": "M12 7v6l4 2 M9 2h6M12 2v3 M12 5a8 8 0 1 0 0 16a8 8 0 0 0 0-16", "streak": "M12 7a5 5 0 1 0 0 10a5 5 0 0 0 0-10 M12 1v3M12 20v3M1 12h3M20 12h3M4 4l2 2M18 18l2 2M4 20l2-2M18 6l2-2", "daily": "M5 5h14v16H5Z M8 2v6M16 2v6M5 10h14 M8 15l3 3 5-5", "drills": "M3 8l9-5 9 5v11l-9 3-9-3Z M3 8l9 4 9-4 M12 12v10M7 10v9M17 10v9", "combo": "M14 2L4 14h7l-1 8 10-13h-7Z", "workouts": "M3 9v6M6 5v14M18 5v14M21 9v6M6 12h12", "flawless": "M3 8l5-5h8l5 5-9 14Z M3 8h18M8 3l4 19 4-19", "fullspeed": "M8 15L4 20l5-1 M9 15l-2-5C11 2 18 3 21 3c0 6-1 10-8 14Z M15 8h.01", "slow": "M3 15h18M5 15v4M18 15v4M7 15C4 7 17 4 18 15 M18 10l3-1v6", "patient": "M12 3v2M6 21l6-9 6 9M2 15l10-3 10 3M8 8a4 4 0 1 0 8 0", "comeback": "M3 21h18M4 17l6-6 4 3 7-10 M15 4h6v6", "encore": "M4 9a8 8 0 0 1 14-3l2 3 M20 3v6h-6 M20 15a8 8 0 0 1-14 3l-2-3 M4 21v-6h6", "explorer": "M12 2a10 10 0 1 0 0 20a10 10 0 0 0 0-20 M16 8l-2 6-6 2 2-6Z", "night": "M4 5l8 3 8-3v10l-8 7-8-7Z M7 11h2M15 11h2M10 15l2 2 2-2", "early": "M3 17h18M6 14a6 6 0 0 1 12 0 M12 2v4M3 5l3 3M21 5l-3 3M1 12h3M20 12h3 M8 21h8", "weekend": "M3 21L9 4l11 11Z M9 4l3 11 8 0 M16 2l-1 3M22 5l-3 2M19 10l3 1", "mic": "M8 4a4 4 0 0 1 8 0v8a4 4 0 0 1-8 0Z M5 11v2a7 7 0 0 0 14 0v-2M12 20v3M8 23h8", "take": "M3 5h18v16H3Z M7 9h10M8 13h8M7 17h2M15 17h2", "composer": "M3 21l2-7L17 2l5 5-12 12Z M5 14l5 5M15 4l5 5", "trial": "M7 3h10v9a5 5 0 0 1-10 0Z M7 5H3v4a5 5 0 0 0 4 5M17 5h4v4a5 5 0 0 1-4 5M12 17v4M8 22h8"};
  function achievementIcon(id, kind = 'milestone') {
    const key = ({perfect100:'combo',week:'streak',beginner:'easy',first:'runs',five:'stars',trial0:'trial',trial1:'trial',trial2:'trial'})[id] || id;
    const hue = ({perfect100:272,week:28,beginner:148,first:175,five:44,flawless:194,fullspeed:345,slow:116,patient:260,comeback:155,encore:202,explorer:35,night:245,early:36,weekend:315,mic:185,take:285,composer:338,trial0:27,trial1:205,trial2:46})[id] ?? 175;
    const badge=kind==='badge';
    const shell=badge?'<path class="badge-ribbons" d="M11 32L8 50l16-8 16 8-3-18Z"/><circle class="medal-shell" cx="24" cy="22" r="19"/><circle class="medal-frame" cx="24" cy="22" r="15.5"/><path class="badge-shine" d="M10 17A15 15 0 0 1 25 7"/>':'<path class="medal-shell" d="M24 2L43 13v22L24 46 5 35V13Z"/><path class="medal-frame" d="M24 6L39 15v18L24 42 9 33V15Z"/>';
    return `<svg class="achievement-art ${badge?'badge-art':'milestone-art'}" data-glyph-cy="${badge?22:24}" style="--badge-hue:${hue}" viewBox="0 0 48 ${badge?52:48}" aria-hidden="true">${shell}<g class="achievement-glyph" transform="translate(12 ${badge?10:12})" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="${ACHIEVEMENT_PATHS[key] || ACHIEVEMENT_PATHS.perfect}"/></g></svg>`;

  }

  function centreAchievementIcons(root) {
    root.querySelectorAll('.achievement-art').forEach(svg=>{
      const g=svg.querySelector('.achievement-glyph'),path=g?.querySelector('path');
      if(!path?.getBBox)return;
      const b=path.getBBox();if(!b.width || !b.height)return;
      const scale=22/Math.max(b.width,b.height),cy=Number(svg.dataset.glyphCy)||24;
      g.setAttribute('transform',`translate(${24-(b.x+b.width/2)*scale} ${cy-(b.y+b.height/2)*scale}) scale(${scale})`);
    });
  }
  const MILESTONES = [
    { id: 'runs', icon: achievementIcon('runs'), name: 'Songs played', tiers: [1, 10, 50, 100, 250] },
    { id: 'notes', icon: achievementIcon('notes'), name: 'Notes hit', tiers: [500, 2000, 10000, 50000, 100000] },
    { id: 'perfect', icon: achievementIcon('perfect'), name: 'Perfect notes', tiers: [100, 1000, 5000, 20000, 50000] },
    { id: 'stars', icon: achievementIcon('stars'), name: 'Stars collected', tiers: [10, 25, 40, 60, 100] },
    { id: 'easy', icon: achievementIcon('easy'), name: 'Easy songs cleared', tiers: [1, 3, 6, 10, 20] },
    { id: 'medium', icon: achievementIcon('medium'), name: 'Medium songs cleared', tiers: [1, 3, 5, 10, 20] },
    { id: 'hard', icon: achievementIcon('hard'), name: 'Hard songs cleared', tiers: [1, 2, 4, 8, 15] },
    { id: 'minutes', icon: achievementIcon('minutes'), name: 'Practice time', tiers: [30, 120, 600, 3000, 6000], unit: 'min' },
    { id: 'streak', icon: achievementIcon('streak'), name: 'Day streak', tiers: [3, 7, 30, 100, 365], unit: 'days' },
    { id: 'daily', icon: achievementIcon('daily'), name: 'Daily challenges', tiers: [5, 25, 100, 250, 500] },
    { id: 'drills', icon: achievementIcon('drills'), name: 'Practice studio', tiers: [1, 10, 50, 100, 250] },
    { id: 'combo', icon: achievementIcon('combo'), name: 'Best combo', tiers: [25, 50, 100, 200, 500] },
    { id: 'workouts', icon: achievementIcon('workouts'), name: "Today's workouts", tiers: [1, 7, 30, 100, 250] }
  ];
  const TIER_XP = [50, 100, 200, 400, 800];

  const BADGES = [
    { id: 'perfect100', icon: achievementIcon('perfect100','badge'), name: 'Perfect century', text: 'Play 100 Perfect notes in a row in one run.', xp: 250 },
    { id: 'week', icon: achievementIcon('week','badge'), name: 'Seven-day flame', text: 'Reach a 7-day practice streak.', xp: 200 },
    { id: 'beginner', icon: achievementIcon('beginner','badge'), name: 'First Light graduate', text: 'Complete every stop and the final trial of path 1.', xp: 250 },
    { id: 'first', icon: achievementIcon('first','badge'), name: 'First notes', text: 'Finish your first song.', xp: 50 },
    { id: 'five', icon: achievementIcon('five','badge'), name: 'Five stars', text: 'Earn ★★★★★ on a song.', xp: 150 },
    { id: 'flawless', icon: achievementIcon('flawless','badge'), name: 'Flawless', text: 'Finish a song with no missed or wrong notes.', xp: 200 },
    { id: 'fullspeed', icon: achievementIcon('fullspeed','badge'), name: 'Full speed', text: 'Earn ★★★★ at 1× or faster.', xp: 150 },
    { id: 'slow', icon: achievementIcon('slow','badge'), name: 'Slow and steady', text: 'Finish a song at 0.5× or slower.', xp: 50 },
    { id: 'patient', icon: achievementIcon('patient','badge'), name: 'Patience', text: 'Finish Wait for note without a wrong note.', xp: 75 },
    { id: 'comeback', icon: achievementIcon('comeback','badge'), name: 'Comeback', text: 'Beat your best on a song by 20 points.', xp: 100 },
    { id: 'encore', icon: achievementIcon('encore','badge'), name: 'Encore', text: 'Play the same song 3 times in a row.', xp: 50 },
    { id: 'explorer', icon: achievementIcon('explorer','badge'), name: 'Explorer', text: 'Play 5 different songs in one day.', xp: 100 },
    { id: 'night', icon: achievementIcon('night','badge'), name: 'Night owl', text: 'Play between 10 pm and 4 am.', xp: 75 },
    { id: 'early', icon: achievementIcon('early','badge'), name: 'Early bird', text: 'Play between 5 and 7 am.', xp: 75 },
    { id: 'weekend', icon: achievementIcon('weekend','badge'), name: 'Weekend warrior', text: 'Play on a Saturday and the Sunday after.', xp: 100 },
    { id: 'mic', icon: achievementIcon('mic','badge'), name: 'Live on stage', text: 'Finish a song with the microphone on.', xp: 100 },
    { id: 'take', icon: achievementIcon('take','badge'), name: 'Recording artist', text: 'Record a take with Rec.', xp: 75 },
    { id: 'composer', icon: achievementIcon('composer','badge'), name: 'Composer', text: 'Save a song you made.', xp: 100 },
    { id: 'trial0', icon: achievementIcon('trial0','badge'), name: 'First Light trial', text: 'Beat the final trial of path 1.', xp: 300 },
    { id: 'trial1', icon: achievementIcon('trial1','badge'), name: 'Moonrise trial', text: 'Beat the final trial of path 2.', xp: 300 },
    { id: 'trial2', icon: achievementIcon('trial2','badge'), name: 'Reach the Stars trial', text: 'Beat the final trial of path 3.', xp: 500 }
  ];

  const DAILY = [
    { id: 'slow75', text: 'Play 2 whole songs at 0.75×', goal: 2, xp: 120, v: d => d.slow75 },
    { id: 'runs2', text: 'Play 2 songs in Practice or Wait for note', goal: 2, xp: 100, v: d => d.runs },
    { id: 'star3', text: 'Earn ★★★ or more on any song', goal: 1, xp: 120, v: d => d.star3 },
    { id: 'notes150', text: 'Hit 150 notes', goal: 150, xp: 100, v: d => d.notes },
    { id: 'combo25', text: 'Reach a 25-note combo (×3)', goal: 25, xp: 150, v: d => d.combo },
    { id: 'full', text: 'Finish a song at 1× with ★★ or more', goal: 1, xp: 150, v: d => d.full },
    { id: 'slow', text: 'Play a whole song at 0.5× or slower', goal: 1, xp: 80, v: d => d.slow },
    { id: 'time15', text: 'Practise for 15 minutes', goal: 15, xp: 150, v: (d, g) => g.todayMinutes() },
    { id: 'drill', text: 'Finish a Guided practice with ★★ or more', goal: 1, xp: 100, v: d => d.drill },
    { id: 'perfect60', text: 'Get 60 Perfect notes', goal: 60, xp: 120, v: d => d.perfect },
    { id: 'explore3', text: 'Play 3 different songs', goal: 3, xp: 120, v: d => (d.songs || []).length },
    { id: 'clean', text: 'Finish a song without a missed or wrong note', goal: 1, xp: 150, v: d => d.clean },
    { id: 'wait', text: 'Finish a song in Wait for note', goal: 1, xp: 80, v: d => d.wait },
    { id: 'encore', text: 'Play the same song twice', goal: 2, xp: 100, v: d => Math.max(0, ...Object.values(d.count || {})) },
    { id: 'easy4', text: 'Earn ★★★★ on an Easy song', goal: 1, xp: 120, v: d => d.easy4 },
    { id: 'climb', text: 'Play a Medium or Hard song', goal: 1, xp: 100, v: d => d.climb },
    { id: 'path', text: 'Play a song or drill from your Song path', goal: 1, xp: 120, v: d => d.path },
    { id: 'acc90', text: 'Score 90% or more on a song', goal: 1, xp: 150, v: d => d.acc90 },
    { id: 'mic', text: 'Finish a song with the microphone on', goal: 1, xp: 150, v: d => d.mic }
  ];
  const WORKOUT_BONUS = 200;

  function seeded(seed) {
    let h = 2166136261;
    for (const ch of String(seed)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
    return () => { h += 0x6d2b79f5; let t = h; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }

  function createGame({ app, keys, best, journey, titleOf = id => id, levelOf = () => 'easy', drillId = '', practice = null, songInfo = () => null }) {
    const rewardKinds = REWARD_KINDS.filter(kind => kind !== 'shape' || app === 'ethereal-drum');
    const key = `${app}-game-v1`;
    const blank = () => ({ xp: 0, c: {}, badges: {}, tiers: {}, owned: [], skin: '', nebula: '', rim: '', accent: '', pattern: '', day: null, daily: null, workout: null, last: null });
    let data = Object.assign(blank(), readJson(key, null) || {});
    const save = () => { data.updatedAt = Date.now(); return writeJson(key, data); };
    let run = null;
    let workoutIndex = null;
    const listeners = new Set();
    const tell = () => listeners.forEach(fn => { try { if (fn() === false) listeners.delete(fn); } catch {} });
    const combo = { mult: 1, chips: [], pop: null };

    const c = name => Number(data.c[name]) || 0;
    const bump = (name, by = 1) => { data.c[name] = c(name) + by; };
    const peak = (name, value) => { data.c[name] = Math.max(c(name), Number(value) || 0); };

    function practiceTotals() {
      const log = readJson(keys.practice, null) || {};
      let seconds = 0;
      let today = 0;
      const stamp = dayStamp();
      Object.entries(log.days || {}).forEach(([day, devices]) => Object.values(devices || {}).forEach(value => {
        seconds += Number(value) || 0;
        if (day === stamp) today += Number(value) || 0;
      }));
      const liveToday = practice ? practice.todaySeconds() : today;
      return { minutes: Math.floor((seconds - today + liveToday) / 60), today: Math.floor(liveToday / 60) };
    }
    function dayStreak() {
      if (practice) return practice.streak();
      const log = readJson(keys.practice, null) || {};
      const goal = Number(log.goal) || 10;
      const total = day => Object.values((log.days || {})[day] || {}).reduce((sum, value) => sum + (Number(value) || 0), 0);
      let streak = 0;
      const date = new Date();
      if (total(dayStamp(date)) < goal * 60) date.setDate(date.getDate() - 1);
      while (total(dayStamp(date)) >= goal * 60) { streak += 1; date.setDate(date.getDate() - 1); }
      return streak;
    }
    function bestList() {
      const store = readJson(keys.best, {}) || {};
      return Object.entries(store).filter(([, item]) => item && Number(item.accuracy) > 0);
    }
    function cleared(levels) {
      return bestList().filter(([id, item]) => id !== drillId && bestStars(item) >= 2 && levels.includes(levelOf(id))).length;
    }
    function bossNode(index) { return journey?.nodes.find(node => node.type === 'boss' && node.pathIndex === index) || null; }
    function bossBeaten(index) {
      if (data.badges[`trial${index}`]) return true;
      const node = bossNode(index);
      return Boolean(node && journey.starsOf(node) >= STAR_COUNT);
    }

    function value(id) {
      switch (id) {
        case 'runs': return c('runs');
        case 'notes': return c('notes');
        case 'perfect': return c('perfect');
        case 'stars': return bestList().reduce((sum, [, item]) => sum + bestStars(item), 0);
        case 'easy': return cleared(['easy']);
        case 'medium': return cleared(['medium']);
        case 'hard': return cleared(['hard', 'expert']);
        case 'minutes': return practiceTotals().minutes;
        case 'streak': peak('dayStreak', dayStreak()); return c('dayStreak');
        case 'daily': return c('daily');
        case 'drills': return c('drills');
        case 'combo': return c('bestCombo');
        case 'workouts': return c('workouts');
        case 'level': return levelInfo(data.xp).level;
        default: return 0;
      }
    }

    function requirement(unlock) {
      if (!unlock) return { done: true, text: 'Yours from the start', value: 1, goal: 1 };
      if (unlock.all || unlock.any) {
        const list = (unlock.all || unlock.any).map(requirement);
        const done = unlock.all ? list.every(req => req.done) : list.some(req => req.done);
        return { done, text: list.map(req => req.text).join(unlock.all ? ' · ' : ' or '), value: unlock.all ? list.reduce((sum, req) => sum + req.value / req.goal, 0) : Math.max(...list.map(req => req.value / req.goal)), goal: unlock.all ? list.length : 1 };
      }
      if (unlock.skin !== undefined) {
        const item = SKINS.find(item => item.id === unlock.skin);
        const done = Boolean(item && (data.owned.includes(`skin:${item.id}`) || requirement(item.unlock).done));
        return { done, text: `Unlock ${item?.name || 'a masterwork finish'}`, value: done ? 1 : 0, goal: 1 };
      }
      const [kind, goal] = Object.entries(unlock)[0];
      if (kind === 'boss') {
        const name = journey?.paths[goal]?.name || `path ${goal + 1}`;
        const done = bossBeaten(goal);
        return { done, text: `Beat the ${name} final trial`, value: done ? 1 : 0, goal: 1 };
      }
      const map = { level: ['level', n => `Reach level ${n}`], streak: ['streak', n => `Keep a ${n}-day streak`], daily: ['daily', n => `Complete ${n} daily challenges`],
        runs: ['runs', n => `Finish ${fmt(n)} songs`], notes: ['notes', n => `Hit ${fmt(n)} notes`], minutes: ['minutes', n => `Practise for ${fmt(n)} minutes`], perfect: ['perfect', n => `Hit ${fmt(n)} Perfect notes`], stars: ['stars', n => `Collect ${n} stars`], workouts: ['workouts', n => `Finish ${n} of Today's workouts`], combo: ['combo', n => `Reach a ${n}-note combo`] };
      const [source, text] = map[kind];
      const now = value(source);
      return { done: now >= goal, text: text(goal), value: Math.min(now, goal), goal };
    }

    /* Today's numbers (reset at midnight). */
    function today() {
      const stamp = dayStamp();
      if (!data.day || data.day.stamp !== stamp) data.day = { stamp, runs: 0, notes: 0, perfect: 0, combo: 0, songs: [], count: {} };
      return data.day;
    }

    function dailySet() {
      const stamp = dayStamp();
      if (!data.daily || data.daily.day !== stamp) {
        const rnd = seeded(`${app}:${stamp}:${readJson('ethereal-device-id', '') || ''}`);
        const pool = DAILY.slice();
        const ids = [];
        while (ids.length < 3 && pool.length) ids.push(pool.splice(Math.floor(rnd() * pool.length), 1)[0].id);
        data.daily = { day: stamp, ids, swapped: false, done: {} };
        save();
      }
      return data.daily;
    }

    function dailyList() {
      const set = dailySet();
      const d = today();
      return set.ids.map(id => {
        const def = DAILY.find(item => item.id === id);
        if (!def) return null;
        const now = Math.min(def.goal, Number(def.v(d, game)) || 0);
        return { ...def, now, done: Boolean(set.done[id]) || now >= def.goal };
      }).filter(Boolean);
    }

    function workoutPlan() {
      const stamp = dayStamp();
      if (data.workout && data.workout.day === stamp && data.workout.steps?.length === 3) return data.workout;
      const lv = levelInfo(data.xp).level;
      const drillLevel = lv < 6 ? 1 : lv < 14 ? 2 : 3;
      const steps = [{ kind: 'drill', level: drillLevel, bpm: [0, 70, 80, 90][drillLevel], title: 'Warm up with a guided pattern', sub: `${['', 'Beginner', 'Steady', 'Advanced'][drillLevel]} · ${[0, 70, 80, 90][drillLevel]} BPM` }];
      const current = journey?.current();
      const next = current && journey.starsOf(current) < journey.need ? current : null;
      if (next && next.type === 'drill') steps.push({ kind: 'drill', level: next.level, bpm: next.bpm, bars: next.bars, nodeKey: next.key, title: 'Next on your Song path', sub: `Guided practice · ${next.levelName} · ${next.bpm} BPM` });
      else if (next) steps.push({ kind: 'song', id: next.id, title: next.type === 'boss' ? 'Take the final trial' : 'Next on your Song path', sub: titleOf(next.id) || next.title || '' });
      if (steps.length < 2) {
        const pick = journey?.nodes.find(node => node.type === 'song' && journey.isSongOpen(node.id));
        if (pick) steps.push({ kind: 'song', id: pick.id, title: 'Revisit a favourite', sub: titleOf(pick.id) || pick.title });
        else steps.push({ kind: 'drill', level: drillLevel, bpm: 80, bars: 2, title: 'Read a new rhythm', sub: 'An eight-bar musical pattern' });
      }
      const learning = steps[1];
      if (learning.kind === 'song' && next?.type !== 'boss') {
        const info = songInfo(learning.id);
        if (info?.barSeconds && info.duration > 0) {
          learning.section = { from: 0, to: Math.min(info.duration, info.barSeconds * 2), bar: 1 };
          learning.title = 'Learn a piece of the next song';
          learning.sub += ' · first two bars';
        }
      }
      const played = bestList().filter(([id]) => id !== drillId && titleOf(id) && journey?.isSongOpen(id))
        .sort((a, b) => Number(a[1].accuracy) - Number(b[1].accuracy));
      const weak = data.weak && titleOf(data.weak.id) && journey?.isSongOpen(data.weak.id) ? data.weak : null;
      const pickId = weak?.id || played[0]?.[0] || learning.id;
      const info = pickId ? songInfo(pickId) : null;
      if (info?.duration > 0 && info.barSeconds) {
        const section = weak || { from: 0, to: Math.min(info.duration, info.barSeconds), bar: 1 };
        steps.push({ kind: 'song', id: pickId, section: { from: section.from, to: section.to, bar: section.bar },
          title: weak ? 'Your hardest bar' : 'Build confidence, one bar at a time', sub: `${titleOf(pickId)} · bar ${section.bar}` });
      } else steps.push({ kind: 'drill', level: drillLevel, bpm: 80, bars: 2, title: 'Finish with a musical pattern', sub: 'An eight-bar musical pattern' });
      data.workout = { day: stamp, steps, done: steps.map(() => false), bonus: false };
      save();
      return data.workout;
    }

    function addXp(amount, news, label) {
      if (!amount) return;
      data.xp += amount;
      if (label) news.push({ kind: 'xp', text: label, xp: amount });
    }

    // Badges, milestone tiers, daily challenges, the workout and rewards after any change.
    function check(news) {
      if (dayStreak() >= 7) award('week', news);
      const firstPath = journey?.nodes.filter(node => node.pathIndex === 0) || [];
      if (firstPath.length && firstPath.every(node => journey.starsOf(node) >= journey.need)) award('beginner', news);
      const set = dailySet();
      dailyList().forEach(item => {
        if (item.now >= item.goal && !set.done[item.id]) {
          set.done[item.id] = Date.now();
          bump('daily');
          addXp(item.xp, [], '');
          news.push({ kind: 'daily', icon: '📅', text: `Daily challenge: ${item.text}`, xp: item.xp });
        }
      });
      const plan = workoutPlan();
      if (!plan.bonus && plan.steps.length && plan.done.every(Boolean)) {
        plan.bonus = true;
        bump('workouts');
        addXp(WORKOUT_BONUS, [], '');
        news.push({ kind: 'workout', icon: '🏋️', text: "Today's workout complete", xp: WORKOUT_BONUS });
      }
      MILESTONES.forEach(m => {
        const now = value(m.id);
        const reached = m.tiers.filter(goal => now >= goal).length;
        const had = Number(data.tiers[m.id]) || 0;
        for (let tier = had; tier < reached; tier += 1) {
          addXp(TIER_XP[tier] || 800, [], '');
          news.push({ kind: 'tier', icon: m.icon, text: `${m.name} ${roman(tier + 1)}: ${fmt(m.tiers[tier])}${m.unit ? ` ${m.unit}` : ''}`, xp: TIER_XP[tier] || 800 });
        }
        if (reached > had) data.tiers[m.id] = reached;
      });
      rewardKinds.flatMap(kind => COSMETICS.catalog[kind].map(item => [kind, item])).forEach(([kind, item]) => {
        const id = `${kind}:${item.id}`;
        if (!item.id || !item.unlock || data.owned.includes(id) || !requirement(item.unlock).done) return;
        data.owned.push(id);
        news.push({ kind: 'reward', icon: '🎁', text: `New ${kind === 'skin' ? 'finish' : kind === 'nebula' ? 'nebula' : 'accessory'}: ${item.name}`, reward: { kind, id: item.id } });
      });
    }

    function award(id, news) {
      if (data.badges[id]) return;
      const badge = BADGES.find(item => item.id === id);
      if (!badge) return;
      data.badges[id] = Date.now();
      addXp(badge.xp, [], '');
      news.push({ kind: 'badge', icon: badge.icon, text: `Badge: ${badge.name}`, xp: badge.xp });
    }

    const game = {
      key,
      levelInfo: () => levelInfo(data.xp),
      todayMinutes: () => practiceTotals().today,
      onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
      streak: () => ({ days: dayStreak(), ...(practice?.freezeStatus() || { tokens: 0, protected: false }) }),
      beginWorkout(step) { workoutIndex = workoutPlan().steps.findIndex(item => item === step); },
      sectionPass({ id, from, to, total, hits }) {
        const plan = workoutPlan();
        const step = plan.steps[workoutIndex];
        if (!step?.section || plan.done[workoutIndex] || step.id !== id || Math.abs(step.section.from - from) > .05 || Math.abs(step.section.to - to) > .05 || total < 1 || hits / total < .75) return [];
        plan.done[workoutIndex] = true;
        const news = [{ icon: '✓', text: 'Workout step complete!' }];
        check(news); save(); tell();
        return news;
      },
      get skin() { return data.skin || ''; },
      get nebula() { return data.nebula || ''; },

      /* Combo during a run. */
      runReset() { run = { points: 0, notes: 0, perfect: 0, maxCombo: 0, perfectCombo: 0, bestPerfect: 0, timings: [], started: false, invalid: false, minSpeed: Infinity }; game.combo(0); },
      startRun({ id, speed, from = 0, mode }) {
        if (!run) game.runReset();
        if (!run.started) { run.started = true; run.id = id; run.mode = mode; if (from > .05) run.invalid = true; }
        if (run.id !== id || run.mode !== mode) run.invalid = true;
        game.speedChanged(speed);
      },
      invalidateRun() { if (!run) game.runReset(); run.invalid = true; },
      speedChanged(speed) { if (run?.started && Number(speed) > 0) run.minSpeed = Math.min(run.minSpeed, Number(speed)); },
      runSpeed(speed) { return run?.started && Number.isFinite(run.minSpeed) ? Math.min(speed, run.minSpeed) : speed; },
      canRecordRun() { return Boolean(run?.started && !run.invalid && (run.mode === 'practice' || run.mode === 'wait')); },
      noteTiming(delta) { if (run && Number.isFinite(delta)) run.timings.push(delta); },
      judge(kind, streak, mode) {
        if (mode !== 'practice' && mode !== 'wait') return;
        if (!run) game.runReset();
        if (kind === 'perfect' || kind === 'good' || kind === 'hit') {
          run.notes += 1;
          if (kind === 'perfect') { run.perfect += 1; run.perfectCombo += 1; run.bestPerfect = Math.max(run.bestPerfect, run.perfectCombo); } else run.perfectCombo = 0;
          run.maxCombo = Math.max(run.maxCombo, streak);
          run.points += (kind === 'perfect' ? 3 : 2) * comboFor(streak);
        }
        if (kind !== 'perfect') run.perfectCombo = 0;
        game.combo(kind === 'perfect' || kind === 'good' || kind === 'hit' ? streak : 0);
      },
      attachCombo({ chips = [], stage = null }) {
        combo.chips = chips.filter(Boolean).map(pill => {
          let chip = pill.querySelector('.combo-x');
          if (!chip) { chip = document.createElement('i'); chip.className = 'combo-x'; chip.hidden = true; pill.appendChild(chip); }
          return chip;
        });
        if (stage && !stage.querySelector('.combo-pop')) {
          combo.pop = document.createElement('div');
          combo.pop.className = 'combo-pop';
          combo.pop.setAttribute('aria-live', 'polite');
          stage.appendChild(combo.pop);
        } else if (stage) combo.pop = stage.querySelector('.combo-pop');
      },
      combo(streak) {
        const mult = comboFor(streak);
        if (mult === combo.mult) return;
        const up = mult > combo.mult;
        combo.mult = mult;
        combo.chips.forEach(chip => { chip.hidden = mult < 2; chip.textContent = `×${mult}`; chip.dataset.x = String(mult); });
        if (up && combo.pop) {
          combo.pop.textContent = `Combo ×${mult}!`;
          combo.pop.dataset.x = String(mult);
          combo.pop.classList.remove('show');
          void combo.pop.offsetWidth;
          combo.pop.classList.add('show');
        }
      },

      /* A finished run in Practice or Wait for note. */
      recordRun({ id, accuracy, speed, mode, prev, wrong = 0, missed = 0, mic = false, weakBar = null }) {
        // Nothing played (no notes heard): nothing to count.
        if (!game.canRecordRun() || !run.notes || !['practice', 'wait'].includes(mode)) { run = null; game.combo(0); return null; }
        speed = game.runSpeed(speed);
        if (weakBar && !isNaN(weakBar.from) && weakBar.to > weakBar.from) data.weak = { id, ...weakBar };
        const news = [];
        const before = levelInfo(data.xp);
        const isDrill = id === drillId;
        const stars = starsFor(accuracy, speed);
        const prevStars = bestStars(prev);
        const prevAccuracy = Number(prev?.accuracy) || 0;
        const level = isDrill ? 'drill' : levelOf(id);
        const d = today();
        const now = new Date();
        const hour = now.getHours();
        // XP: points from the notes (with combos), stars, and new stars on this song.
        const points = Math.round(run.points);
        const newStars = Math.max(0, stars - prevStars);
        const runXp = points + stars * 10 + newStars * 20;
        addXp(runXp, [], '');
        if (!isDrill) bump('runs');
        bump('notes', run.notes);
        bump('perfect', run.perfect);
        if (isDrill) bump('drills');
        peak('bestCombo', run.maxCombo);
        if (!isDrill) d.runs += 1;
        d.notes += run.notes;
        d.perfect += run.perfect;
        d.combo = Math.max(d.combo, run.maxCombo);
        if (!isDrill && !d.songs.includes(id)) d.songs.push(id);
        d.count[id] = (d.count[id] || 0) + 1;
        const clean = !missed && !wrong && run.notes > 0;
        if (!isDrill && Math.abs(speed - .75) < .001) d.slow75 = (d.slow75 || 0) + 1;
        if (stars >= 3) d.star3 = 1;
        if (speed >= 0.999 && stars >= 2) d.full = 1;
        if (speed <= 0.5001 && stars >= 1) d.slow = 1;
        if (isDrill && stars >= 2) d.drill = 1;
        if (clean) d.clean = 1;
        if (mode === 'wait' && run.notes) d.wait = 1;
        if (level === 'easy' && stars >= 4) d.easy4 = 1;
        if (['medium', 'hard', 'expert'].includes(level)) d.climb = 1;
        if (isDrill ? Boolean(journey?.activeDrill) : journey?.nodes.some(node => node.id === id)) d.path = 1;
        if (accuracy >= 90) d.acc90 = 1;
        if (mic) d.mic = 1;
        // The final trial of a path: Practice, at its speed, with its stars.
        if (mode === 'practice' && journey) {
          (journey.recordBoss?.(id, { accuracy, speed }) || []).forEach(node => {
            award(`trial${node.pathIndex}`, news);
            news.unshift({ kind: 'boss', icon: '🏆', text: `Final trial beaten: ${journey.paths[node.pathIndex]?.name || ''}!` });
          });
        }
        // Today's workout.
        const plan = workoutPlan();
        plan.steps.forEach((step, index) => {
          if (plan.done[index]) return;
          if (index !== workoutIndex || step.section) return;
          if (step.kind === 'drill' ? isDrill && (!step.nodeKey || journey?.activeDrill === step.nodeKey) : step.id === id) plan.done[index] = true;
        });
        // Badges.
        if (!isDrill && run.notes) award('first', news);
        if (run.bestPerfect >= 100) award('perfect100', news);
        if (stars >= 5) award('five', news);
        if (clean && mode === 'practice') award('flawless', news);
        if (speed >= 0.999 && stars >= 4) award('fullspeed', news);
        if (speed <= 0.5001 && stars >= 1) award('slow', news);
        if (mode === 'wait' && !wrong && run.notes) award('patient', news);
        if (prevAccuracy > 0 && accuracy - prevAccuracy >= 20) award('comeback', news);
        data.last = data.last && data.last.id === id ? { id, n: data.last.n + 1 } : { id, n: 1 };
        if (data.last.n >= 3) award('encore', news);
        if (d.songs.length >= 5) award('explorer', news);
        if (hour >= 22 || hour < 4) award('night', news);
        if (hour >= 5 && hour < 7) award('early', news);
        if (now.getDay() === 6) data.c.saturday = dayStamp();
        if (now.getDay() === 0) {
          const saturday = new Date(now);
          saturday.setDate(saturday.getDate() - 1);
          if (data.c.saturday === dayStamp(saturday)) award('weekend', news);
        }
        if (mic && run.notes) award('mic', news);
        check(news);
        const after = levelInfo(data.xp);
        const gained = data.xp - before.xp;
        const timing = run.timings.length ? { early: run.timings.filter(n => n < -.04).length, late: run.timings.filter(n => n > .04).length, count: run.timings.length, mean: run.timings.reduce((a, b) => a + b, 0) / run.timings.length } : null;
        const summary = { timing, gained, runXp, points, maxCombo: run.maxCombo, before, after, levelUp: after.level > before.level, news };
        run = null;
        save();
        tell();
        return summary;
      },

      event(name) {
        const news = [];
        if (name === 'take') award('take', news);
        if (name === 'composer') award('composer', news);
        if (!news.length) return news;
        check(news);
        save();
        tell();
        return news;
      },

      // Time-based challenges (minutes, streaks) are checked when the hub opens too.
      refresh() { const news = []; check(news); if (news.length) { save(); tell(); } return news; },

      daily: () => dailyList(),
      canSwap: () => !dailySet().swapped,
      swap(id) {
        const set = dailySet();
        if (!set.ids.includes(id) || set.swapped || dailyList().find(item => item.id === id)?.done) return false;
        const pool = DAILY.filter(item => !set.ids.includes(item.id));
        if (!pool.length) return false;
        const pick = pool[Math.floor(Math.random() * pool.length)];
        set.ids = set.ids.map(item => (item === id ? pick.id : item));
        set.swapped = true;
        save();
        tell();
        return true;
      },
      workout: () => workoutPlan(),
      milestones: () => MILESTONES.map(m => {
        const now = value(m.id);
        const tier = m.tiers.filter(goal => now >= goal).length;
        const next = m.tiers[tier];
        const prevGoal = tier ? m.tiers[tier - 1] : 0;
        return { ...m, now, tier, next, progress: next ? Math.max(0, Math.min(1, (now - prevGoal) / (next - prevGoal))) : 1, xp: TIER_XP[tier] || 800 };
      }),
      badges: () => BADGES.map(b => ({ ...b, at: data.badges[b.id] || 0 })),
      look(skin = data.skin) {
        const preset = COSMETICS.skinOf(skin);
        return Object.fromEntries(rewardKinds.map(kind => [kind, kind === 'skin' ? skin : ['accent','pattern'].includes(kind) && data[kind] === 'off' ? '' : data[kind] || (data.accessoryOverrides?.[kind] ? '' : preset[kind]) || '']));
      },
      lookFor(kind,id) { return kind === 'skin' ? game.look(id) : {...game.look(),[kind]:id}; },
      isTongue: app === 'ethereal-drum',
      rewards(kind) {
        return (COSMETICS.catalog[kind] || []).map(item => {
          let req = requirement(item.unlock);
          const included = ['rim','accent','pattern'].includes(kind) && SKINS.find(skin => skin[kind] === item.id && (data.owned.includes(`skin:${skin.id}`) || requirement(skin.unlock).done));
          if(included && !req.done) req = {done:true,value:1,goal:1,text:`Included with your ${included.name} finish`};
          const owned = !item.id || data.owned.includes(`${kind}:${item.id}`) || req.done;
          return { ...item, kind, owned, req, equipped: game.look()[kind] === item.id };
        });
      },
      ownedCount() { return rewardKinds.flatMap(kind => game.rewards(kind).filter(item => (item.id || kind === 'skin' || kind === 'nebula') && item.owned)).length; },
      rewardCount() { return rewardKinds.flatMap(kind => COSMETICS.catalog[kind].filter(item => item.id || kind === 'skin' || kind === 'nebula')).length; },
      equip(kind, id) {
        const item = game.rewards(kind).find(entry => entry.id === id);
        if (!item || !item.owned) return false;
        if (!rewardKinds.includes(kind)) return false;
        if (id && !data.owned.includes(`${kind}:${id}`)) data.owned.push(`${kind}:${id}`);
        data[kind] = id;
        if(['rim','accent','pattern'].includes(kind)) { data.accessoryOverrides = data.accessoryOverrides || {}; data.accessoryOverrides[kind] = true; }
        save();
        game.applyLook();
        tell();
        return true;
      },
      applyLook() {
        const body = document.body;
        if (data.skin) body.dataset.skin = data.skin; else delete body.dataset.skin;
        if (data.nebula) body.dataset.nebula = data.nebula; else delete body.dataset.nebula;
        COSMETICS.apply(game.look());
        const stage = document.getElementById('noteStage');
        if (stage && !stage.querySelector(':scope > .nebula-layer')) {
          const layer = document.createElement('div');
          layer.className = 'nebula-layer';
          layer.setAttribute('aria-hidden', 'true');
          stage.prepend(layer);
        }
      },
      reload() { data = Object.assign(blank(), readJson(key, null) || {}); game.applyLook(); tell(); }
    };
    if (typeof window !== 'undefined') window.addEventListener('ethereal:take', () => game.event('take'));
    return game;
  }

  function roman(n) { return ['', 'I', 'II', 'III', 'IV', 'V', 'VI'][n] || String(n); }

  const ICONS = {
    target: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="1" fill="currentColor"/></svg>',
    gift: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="9" width="16" height="11" rx="1.5"/><path d="M3 9h18M12 9v11M12 9c-1.5-3.5-6-4-6-1.5S10 9 12 9zm0 0c1.5-3.5 6-4 6-1.5S14 9 12 9z"/></svg>',
    swap: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 8h13l-3-3M20 16H7l3 3"/></svg>',
    lock: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>'
  };

  function levelRing(info, size = 44) {
    return `<span class="lv-ring" style="--p:${(info.progress * 100).toFixed(1)}%;--s:${size}px"><b>${info.level}</b></span>`;
  }

  // The card at the top of the song list: level, XP and the doors to the hub.
  function playerCard({ game, onOpen }) {
    const card = document.createElement('section');
    card.className = 'player-card';
    const paint = () => {
      const info = game.levelInfo();
      const daily = game.daily();
      const done = daily.filter(item => item.done).length;
      card.innerHTML = `<button type="button" class="pc-level" data-hub="milestones">${levelRing(info)}<span class="pc-copy"><b>Level ${info.level} · ${esc(info.title)}</b><i class="xp-bar"><i style="width:${(info.progress * 100).toFixed(1)}%"></i></i><small>${fmt(info.to - info.xp)} XP to level ${info.level + 1}</small></span></button>
        <div class="pc-actions"><button type="button" data-hub="today">${ICONS.target}Today<em>${done}/${daily.length}</em></button><button type="button" data-hub="rewards">${ICONS.gift}Rewards<em>${game.ownedCount()}/${game.rewardCount()}</em></button></div>`;
      card.querySelectorAll('[data-hub]').forEach(button => button.addEventListener('click', () => onOpen(button.dataset.hub)));
    };
    paint();
    game.onChange(() => { if (!card.isConnected) return false; paint(); });
    return card;
  }

  // The look of a reward: a small drum in that colour, or a patch of nebula.
  function rewardPreview(item) {
    if (item.kind === 'nebula') return `<span class="nebula-swatch" data-nebula="${esc(item.id)}" aria-hidden="true"></span>`;
    return `<span class="skin-swatch" data-skin="${esc(item.id)}" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i></span>`;
  }

  let hubDialog = null;

  function openHub({ game, tab = 'today', onWorkout, toast }) {
    if (!hubDialog) hubDialog = makeDialog('hub-dialog');
    const d = hubDialog;
    let rewardKind = 'skin';
    let previewLook = game.look();
    let previewItem = null;
    d.setAttribute('aria-label', 'Player progress');
    game.refresh();
    const paint = () => {
      const info = game.levelInfo();
      const tabs = [['today', 'Today'], ['milestones', 'Milestones'], ['badges', 'Badges'], ['rewards', 'Rewards']];
      let body = '';
      if (tab === 'today') {
        const daily = game.daily();
        const left = (() => { const now = new Date(); const end = new Date(now); end.setHours(24, 0, 0, 0); const m = Math.round((end - now) / 60000); return `${Math.floor(m / 60)} h ${m % 60} min`; })();
        const plan = game.workout();
        const streak = game.streak();
        body = `<div class="streak-freeze"><b>🔆 ${streak.days}-day streak</b><span>❄ ${streak.tokens}/1 freeze ready${streak.protected ? ' · yesterday protected' : ''}</span><small>One missed day is protected automatically. Refill after 7 daily goals.</small></div><section class="hub-section"><div class="hub-section-head"><h3>Daily challenges</h3><small>New ones in ${left}</small></div>
          <ul class="daily-list">${daily.map(item => `<li class="daily-item${item.done ? ' done' : ''}">
            <span class="daily-check" aria-hidden="true">${item.done ? '✓' : ''}</span>
            <span class="daily-copy"><b>${esc(item.text)}</b><i class="xp-bar small"><i style="width:${Math.round((item.now / item.goal) * 100)}%"></i></i><small>${fmt(item.now)} / ${fmt(item.goal)} · +${item.xp} XP</small></span>
            ${!item.done && game.canSwap() ? `<button type="button" class="daily-swap" data-swap="${item.id}" title="Swap this challenge (once a day)">${ICONS.swap}Swap</button>` : ''}
          </li>`).join('')}</ul></section>
          <section class="hub-section"><div class="hub-section-head"><h3>Today's workout</h3><small>+${WORKOUT_BONUS} XP for all three</small></div>
          <ol class="workout-list">${plan.steps.map((step, index) => `<li class="workout-step${plan.done[index] ? ' done' : ''}"><span class="workout-num">${plan.done[index] ? '✓' : index + 1}</span><span class="workout-copy"><b>${esc(step.title)}</b><small>${esc(step.sub || '')}</small></span>${plan.done[index] ? '' : `<button type="button" class="workout-go" data-step="${index}">Go</button>`}</li>`).join('')}</ol></section>`;
      } else if (tab === 'milestones') {
        body = `<ul class="milestone-list">${game.milestones().map(m => `<li class="milestone"><span class="ms-icon" aria-hidden="true">${m.icon}</span><span class="ms-copy"><b>${esc(m.name)} <em class="ms-tier">${m.tier ? roman(m.tier) : ''}</em></b>
          <span class="ms-pips">${m.tiers.map((goal, i) => `<i class="${i < m.tier ? 'on' : ''}" title="${fmt(goal)}"></i>`).join('')}</span>
          ${m.next ? `<i class="xp-bar small"><i style="width:${Math.round(m.progress * 100)}%"></i></i><small>${fmt(m.now)} / ${fmt(m.next)}${m.unit ? ` ${m.unit}` : ''} · next +${m.xp} XP</small>` : '<small class="ms-max">All tiers done</small>'}</span></li>`).join('')}</ul>`;
      } else if (tab === 'badges') {
        const list = game.badges();
        body = `<p class="hub-note">${list.filter(b => b.at).length} of ${list.length} badges</p><ul class="badge-grid">${list.map(b => `<li class="badge${b.at ? ' got' : ''}"><span class="badge-icon" aria-hidden="true">${b.icon}</span><b>${esc(b.name)}</b><small>${esc(b.text)}</small><em>+${b.xp} XP</em></li>`).join('')}</ul>`;
      } else {
        const kinds = [['skin', 'Finishes'], ['rim', 'Rims & rattan'], ['accent', 'Note centres'], ['pattern', 'Engravings'], ['nebula', 'Nebulas'], ...(game.isTongue ? [['shape','Tongue shapes']] : [])];
        const list = game.rewards(rewardKind);
        const selected = previewItem && previewItem.kind === rewardKind ? previewItem : list.find(item => item.id === (previewLook[rewardKind] || '')) || list.find(item => item.equipped) || list[0];
        const scene = previewLook.nebula ? `style="--atelier-scene:url('${COSMETICS.asset(`nebula-${previewLook.nebula}.webp`)}')"` : '';
        const preview = COSMETICS.preview(previewLook, { large: true, tongue: game.isTongue });
        const grid = list.map(item => `<li class="reward atelier-item${item.owned ? ' owned' : ' locked'}${item.equipped ? ' equipped' : ''}${selected.id === item.id ? ' previewing' : ''}">
          <button type="button" class="reward-peek" data-peek="${rewardKind}:${esc(item.id)}" aria-label="Preview ${esc(item.name)}">${item.kind === 'nebula' ? rewardPreview(item) : COSMETICS.preview(rewardKind === 'skin' ? {skin:item.id} : { ...game.look(), [rewardKind]: item.id }, { tongue: game.isTongue })}<b>${esc(item.name)}</b>${item.tier ? `<em class="reward-tier" data-tier="${item.tier}">${item.tier}</em>` : ''}</button>
          ${item.equipped ? '<span class="reward-state">In use ✓</span>' : item.owned ? `<button type="button" class="reward-use" data-use="${rewardKind}:${esc(item.id)}">Use</button>` : `<small>${ICONS.lock}${esc(item.req.text)}</small><i class="xp-bar small"><i style="width:${Math.round(item.req.value / item.req.goal * 100)}%"></i></i>`}
        </li>`).join('');
        body = `<div class="atelier-heading"><div><small>YOUR INSTRUMENT, YOUR STORY</small><h3>The drum atelier</h3></div><span>${game.ownedCount()} / ${game.rewardCount()} collected</span></div>
          <section class="atelier-showcase" ${scene}><div class="atelier-drum">${preview}</div><div class="atelier-copy"><small>${selected.owned ? 'YOUR COLLECTION' : 'DISCOVER YOUR NEXT REWARD'}</small><h3>${esc(selected.name)}</h3><p>${esc(selected.req.text)}</p>${selected.equipped ? '<span class="reward-state">In use ✓</span>' : selected.owned ? `<button type="button" class="reward-use" data-use="${rewardKind}:${esc(selected.id)}">Use this ${rewardKind === 'skin' ? 'finish' : rewardKind === 'nebula' ? 'nebula' : rewardKind === 'shape' ? 'shape' : 'accessory'}</button>` : '<span class="atelier-locked">Locked · preview only</span>'}</div></section>
          <nav class="atelier-tabs" aria-label="Reward categories">${kinds.map(([id,label]) => `<button type="button" data-kind="${id}" aria-pressed="${rewardKind === id}" class="${rewardKind === id ? 'active' : ''}">${label}</button>`).join('')}</nav>
          <p class="atelier-note">${rewardKind === 'skin' ? 'Three starter finishes. Master Obsidian or Nebula to begin your collector journey.' : rewardKind === 'shape' ? 'Choose a wider cut: Round petals, Lotus petals at level 5, or Double-cut petals at level 10. Shapes work with every finish.' : rewardKind === 'nebula' ? 'Detailed nebula clouds behind your instrument. The rest of the app keeps its dark space theme.' : 'Mix accessories with any finish once you unlock Obsidian or Nebula. Original centres and No engraving remove that decoration; the black rim is a smooth protective edge.'} Tap any reward to preview it.</p>
          <ul class="reward-grid atelier-grid">${grid}</ul>`;

      }
      d.innerHTML = `<div class="hub">
        <header class="hub-head">${levelRing(info, 58)}<div class="hub-level"><small>Level ${info.level} · ${esc(info.title)}</small><b>${fmt(info.xp)} XP</b><i class="xp-bar"><i style="width:${(info.progress * 100).toFixed(1)}%"></i></i><span>${fmt(info.to - info.xp)} XP to level ${info.level + 1}</span></div><button type="button" class="icon-btn" data-mini-close aria-label="Close">×</button></header>
        <nav class="hub-tabs" role="tablist">${tabs.map(([id, label]) => `<button type="button" role="tab" aria-selected="${id === tab}" tabindex="${id === tab ? 0 : -1}" data-tab="${id}" class="${id === tab ? 'active' : ''}">${label}</button>`).join('')}</nav>
        <div class="hub-body${tab === 'rewards' ? ' atelier-body' : ''}">${body}</div>
      </div>`;
      requestAnimationFrame(() => centreAchievementIcons(d));
      d.querySelectorAll('[data-tab]').forEach(button => button.addEventListener('click', () => { tab = button.dataset.tab; paint(); }));
      d.querySelector('[role=tablist]').addEventListener('keydown', event => {
        const index = tabs.findIndex(([id]) => id === tab);
        const next = event.key === 'ArrowRight' ? (index + 1) % tabs.length : event.key === 'ArrowLeft' ? (index + tabs.length - 1) % tabs.length : event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : -1;
        if (next < 0) return; event.preventDefault(); tab = tabs[next][0]; paint(); d.querySelector(`[data-tab="${tab}"]`).focus();
      });
      d.querySelectorAll('[data-swap]').forEach(button => button.addEventListener('click', () => { if (game.swap(button.dataset.swap)) { toast?.('New challenge! You can swap one a day.'); paint(); } }));
      d.querySelectorAll('[data-step]').forEach(button => button.addEventListener('click', () => { const step = game.workout().steps[Number(button.dataset.step)]; d.close(); onWorkout?.(step); }));
      d.querySelectorAll('[data-kind]').forEach(button => button.addEventListener('click', () => { rewardKind = button.dataset.kind; previewItem = null; paint(); }));
      d.querySelectorAll('[data-peek]').forEach(button => button.addEventListener('click', () => { const [kind,id] = button.dataset.peek.split(':'); previewItem = game.rewards(kind).find(item => item.id === id); previewLook = kind === 'skin' ? game.lookFor(kind,id) : {...previewLook,[kind]:id}; paint(); d.querySelector('.hub-body').scrollTop = 0; }));
      d.querySelectorAll('[data-use]').forEach(button => button.addEventListener('click', () => { const [kind, id] = button.dataset.use.split(':'); if (game.equip(kind, id)) { previewLook = game.look(); previewItem = game.rewards(kind).find(item => item.id === id); const scroll = d.querySelector('.hub-body').scrollTop; paint(); d.querySelector('.hub-body').scrollTop = scroll; } }));
    };
    paint();
    if (!d.open) d.showModal();
    clearInterval(d.gameTimer);
    d.gameTimer = setInterval(() => { if (d.open) { game.refresh(); paint(); } }, 60000);
    d.addEventListener('close', () => clearInterval(d.gameTimer), { once: true });
  }

  // On the results screen: the XP from this run and anything new.
  function gameResultHtml(summary) {
    if (!summary) return '';
    const info = summary.after;
    const news = summary.news.map(item => `<li class="gr-${item.kind}"><span aria-hidden="true">${item.icon || '✨'}</span><b>${esc(item.text)}</b>${item.xp ? `<em>+${item.xp} XP</em>` : ''}${item.reward ? `<button type="button" class="reward-use" data-use="${item.reward.kind}:${esc(item.reward.id)}">Use it</button>` : ''}</li>`).join('');
    const timing = summary.timing;
    const tip = timing ? `<p class="gr-timing"><b>Timing</b> · Early ${timing.early} · Late ${timing.late}<br>${Math.abs(timing.mean) <= .04 ? 'Nicely centred on the beat.' : timing.mean < 0 ? 'You tend to play early. Let the beat arrive before striking.' : 'You tend to play late. Prepare your hands a little sooner.'}</p>` : '';
    return `<div class="gr-head${summary.levelUp ? ' level-up' : ''}">${levelRing(info, 46)}<div class="gr-copy"><b class="gr-xp">+${fmt(summary.gained)} XP</b><small>${summary.levelUp ? `<strong class="gr-up">Level up! Level ${info.level} · ${esc(info.title)}</strong>` : `Level ${info.level} · ${esc(info.title)} · ${fmt(info.to - info.xp)} XP to go`}</small><i class="xp-bar"><i style="width:${(info.progress * 100).toFixed(1)}%"></i></i></div>${summary.maxCombo >= 10 ? `<span class="gr-combo">Best combo ${summary.maxCombo}<em>×${comboFor(summary.maxCombo)}</em></span>` : ''}</div>${tip}${news ? `<ul class="gr-news">${news}</ul>` : ''}`;
  }

  function bindGameResult(root, game) {
    requestAnimationFrame(() => centreAchievementIcons(root));
    root.querySelectorAll('[data-use]').forEach(button => button.addEventListener('click', () => {
      const [kind, id] = button.dataset.use.split(':');
      if (game.equip(kind, id)) { button.textContent = 'In use ✓'; button.disabled = true; }
    }));
  }

  window.EtherealCommon = {
    version: '31',
    esc, readJson, writeJson, capitalise, speedLabel,
    STAR_COUNT, scoreFor, starsForScore, starsFor, bestStars, starString, starsHtml, createBestStore, createHistoryStore, resultBestHtml, bestHtml, noStarsHtml, suggestSpeedUp,
    historySummary, historyChartHtml, resultHistoryHtml, openHistory, bindHistoryBadges, exportProgress, importProgress,
    mergeProgress, collectProgress, createPracticeLog, todayCard, todayLine, openSongPath, createTakeRecorder, takeHtml,
    generateRhythm, openDrills, nextDrill, createCloud, openSaveProgress, openDeleteProgress, bindRecChips, progressStats,
    createJourney, openJourney, journeyLockedRow, codeHash, progressReadable, openPrivacyPolicy, nudge,
    createGame, playerCard, openHub, gameResultHtml, bindGameResult, levelInfo, comboFor,
    smartLoopSpeeds, createSmartLoop, worstSection, haptic, bindHapticsToggle, hapticsSupported,
    encodeShare, decodeShare, shareSongLink, readSharedSong, tabify,
    startHereCard,
    micThreshold, micCheckSeen, openMicCheck,
    placeProgressInTape, isDesktopFit, syncProgressFill,
    fullscreenSupported, syncViewModeBtn, bindViewModeBtn, leaveFocusFullscreen,
    playChime
  };
})();




