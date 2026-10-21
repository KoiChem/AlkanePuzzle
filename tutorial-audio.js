// Source: index.html @ f6b23013c74fd63c3fc2267b82798053c7a7b365.
// Existing synthesis, mix, timing and iOS recovery are unchanged.
// Adaptations: page-only enabled state and tutorial trace-state bridge.
(function(){
'use strict';
let traceState=null,traceGestureStartedWithAudioLocked=false;
  let audioCtx = null;
  let audioMasterGain = null;
  let audioCompressor = null;
  const pendingAudioTasks = [];
  const AUDIO_STARTUP_LEAD = 0.07;
  const AUDIO_PRIME_DURATION = 0.14;
  const AUDIO_RESUME_TIMEOUT = 1000;
  const AUDIO_PENDING_REPLAY_MAX = 0.32;
  let audioWarmUntil = 0;
  let audioNeedsRecreate = false;
  let primedAudioCtx = null;
  let traceNoiseBuffer = null;
  let traceNoiseSampleRate = 0;
  let soundEnabled = true;

  function soundIconSVG(enabled) {
    const waves = enabled
      ? '<path d="M16 9.2c1 .7 1.5 1.7 1.5 2.8s-.5 2.1-1.5 2.8"/><path d="M19 6.5c1.8 1.4 2.7 3.3 2.7 5.5s-.9 4.1-2.7 5.5"/>'
      : '<path d="m17 9 4 4m0-4-4 4"/>';
    return `<svg class="sound-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 10v4h4l5 4V6L8 10H4Z"/>${waves}</svg>`;
  }

  function renderSoundToggle() {
    const button = document.getElementById('sound-toggle');
    if (!button) return;
    button.innerHTML = soundIconSVG(soundEnabled);
    button.classList.toggle('active', soundEnabled);
    button.setAttribute('aria-pressed', String(soundEnabled));
    const label = soundEnabled ? '効果音をオフにする' : '効果音をオンにする';
    button.title = label;
    button.setAttribute('aria-label', label);
  }

  function saveSoundEnabled() { /* 独立試作: 通常設定へ保存しない。 */ }

  function audioOutputDestination(ctx) {
    return audioMasterGain || ctx.destination;
  }

  function createAudioCtx() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    try {
      audioCtx = new AC({ latencyHint: 'interactive' });
    } catch (e) {
      try { audioCtx = new AC(); } catch (fallbackError) { audioCtx = null; }
    }
    if (!audioCtx) return null;

    audioMasterGain = audioCtx.createGain();
    audioMasterGain.gain.value = soundEnabled ? 0.88 : 0.001;
    audioCompressor = audioCtx.createDynamicsCompressor();
    audioCompressor.threshold.value = -8;
    audioCompressor.knee.value = 8;
    audioCompressor.ratio.value = 6;
    audioCompressor.attack.value = 0.003;
    audioCompressor.release.value = 0.12;
    audioMasterGain.connect(audioCompressor);
    audioCompressor.connect(audioCtx.destination);

    audioWarmUntil = audioCtx.currentTime + AUDIO_STARTUP_LEAD;
    primedAudioCtx = null;
    traceNoiseBuffer = null;
    traceNoiseSampleRate = 0;
    const ctx = audioCtx;
    if (typeof ctx.addEventListener === 'function') {
      ctx.addEventListener('statechange', () => {
        if (ctx !== audioCtx) return;
        if (ctx.state === 'running') {
          primeAudioOutput(ctx);
          flushPendingAudio(ctx);
        } else if (ctx.state === 'closed') {
          audioNeedsRecreate = true;
        }
      });
    }
    return ctx;
  }

  function getAudioCtx() {
    if (!audioCtx || audioCtx.state === 'closed') return createAudioCtx();
    return audioCtx;
  }

  function discardAudioCtx() {
    const staleCtx = audioCtx;
    audioCtx = null;
    audioMasterGain = null;
    audioCompressor = null;
    primedAudioCtx = null;
    audioWarmUntil = 0;
    traceNoiseBuffer = null;
    traceNoiseSampleRate = 0;
    if (!staleCtx || staleCtx.state === 'closed') return;
    try {
      const closing = staleCtx.close();
      if (closing && typeof closing.catch === 'function') closing.catch(() => {});
    } catch (e) { /* 壊れたAudioContextでも次の作り直しを続行する */ }
  }

  // iPhoneではAudioContextがrunningになっても、出力経路の起動に数十msかかり、
  // 短い初音がその間に終わってしまうことがある。少し長い無音を先に流し、
  // 最初の実音には小さな助走時間を設けて、音の立ち上がりを欠けさせない。
  function primeAudioOutput(ctx) {
    if (!ctx || primedAudioCtx === ctx) return;
    primedAudioCtx = ctx;
    audioWarmUntil = Math.max(audioWarmUntil, ctx.currentTime + AUDIO_STARTUP_LEAD);
    try {
      const frameCount = Math.max(1, Math.ceil(ctx.sampleRate * AUDIO_PRIME_DURATION));
      const buffer = ctx.createBuffer(1, frameCount, ctx.sampleRate);
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(audioOutputDestination(ctx));
      source.start(0);
    } catch (e) { /* 無音の助走に失敗してもresumeと実音は試す */ }
  }

  function audioStartAt(ctx, delay = 0) {
    return Math.max(ctx.currentTime, audioWarmUntil) + delay;
  }

  function audioQueueNow() {
    return typeof performance !== 'undefined' && typeof performance.now === 'function'
      ? performance.now()
      : Date.now();
  }

  // 初回スワイプ中に溜まった各打音は、AudioContextの解禁後も順番が分かるよう
  // 入力時刻の間隔を保って予約する。長いスワイプだけは320ms以内へ圧縮し、
  // 指を離した後に長時間音だけが続かないようにする。
  function schedulePendingAudioTasks(ctx) {
    const queued = pendingAudioTasks.splice(0);
    if (queued.length === 0) return;
    const firstAt = queued[0].queuedAt;
    const span = Math.max(0, queued[queued.length - 1].queuedAt - firstAt);
    const maxSpanMs = AUDIO_PENDING_REPLAY_MAX * 1000;
    const timeScale = span > maxSpanMs ? maxSpanMs / span : 1;
    queued.forEach(({ task, queuedAt }) => {
      const queuedDelay = Math.max(0, queuedAt - firstAt) * timeScale / 1000;
      try { task(ctx, queuedDelay); } catch (e) { /* 1音の失敗で残りの効果音を止めない */ }
    });
  }

  // iOSではスワイプのtouchend/pointerupが音声解禁の操作として認められない場合がある。
  // そのスワイプ中の描画音だけを破棄し、次のタップでまとめて鳴ることを防ぐ。
  function discardPendingTraceAudio() {
    for (let i = pendingAudioTasks.length - 1; i >= 0; i--) {
      if (pendingAudioTasks[i].category === 'trace') pendingAudioTasks.splice(i, 1);
    }
  }

  function flushPendingAudio(ctx) {
    if (!ctx || ctx !== audioCtx || ctx.state !== 'running' || audioNeedsRecreate) return;
    primeAudioOutput(ctx);
    schedulePendingAudioTasks(ctx);
  }

  function resumeAudio(ctx, armRecovery = true) {
    if (ctx.state === 'running') {
      flushPendingAudio(ctx);
      return;
    }
    let settled = false;
    try {
      Promise.resolve(ctx.resume())
        .then(() => {
          settled = true;
          if (ctx === audioCtx && ctx.state === 'running') flushPendingAudio(ctx);
        })
        .catch(() => { settled = true; /* 次の実操作で再試行する */ });
    } catch (e) {
      settled = true;
    }
    // WebKitにはresume()が解決も拒否もされない状態がある。処理中フラグで
    // 次の操作を塞がず、タイムアウト後は次の実操作内でContextごと作り直す。
    if (armRecovery) {
      setTimeout(() => {
        if (!settled && ctx === audioCtx && ctx.state !== 'running') audioNeedsRecreate = true;
      }, AUDIO_RESUME_TIMEOUT);
    }
  }

  // iOSではページ読み込みやscriptからのclick()では音声を解禁できない。
  // 実際のユーザー操作のcapture段階で出力を起こし、その操作が要求した実音は
  // running確認後まで保持する。未解決のresumeがあっても毎回再試行できる。
  function unlockAudio(event) {
    if (event && event.isTrusted === false) return;
    if (!soundEnabled) return;
    if (audioCtx && (audioNeedsRecreate || audioCtx.state === 'interrupted' || audioCtx.state === 'closed')) {
      discardAudioCtx();
    }
    audioNeedsRecreate = false;
    const ctx = getAudioCtx();
    if (!ctx) return;
    primeAudioOutput(ctx);
    const pointerType = event && event.pointerType;
    const activationCanStartAudio = !event
      || event.type === 'click'
      || event.type === 'keydown'
      || event.type === 'touchend'
      || event.type === 'pointerup'
      || (event.type === 'pointerdown' && pointerType === 'mouse');
    const traceReleaseWhileLocked = traceGestureStartedWithAudioLocked
      && ctx.state !== 'running'
      && traceState?.path.length >= 2
      && (event?.type === 'pointerup' || event?.type === 'touchend');
    if (traceReleaseWhileLocked) discardPendingTraceAudio();
    if (activationCanStartAudio && pendingAudioTasks.length > 0) {
      // iOSではスワイプ後のresume()だけが拒否されることがある。実操作の同期処理内で
      // 実音ノードのstart()まで予約し、AudioContext側にも音声開始の意図を渡す。
      schedulePendingAudioTasks(ctx);
    }
    // touch/pointerの押し始めはスクロール開始にもなり得るため、そこでの未解決resumeを
    // タイムアウト扱いにしない。復旧判定は指を離す操作または明確なクリックで行う。
    // 音声解禁に使えない初回スワイプでは、1秒後のContext再生成も予約しない。
    // 次のタップで同じContextを素直にresumeできる状態を保つ。
    resumeAudio(ctx, activationCanStartAudio && !traceReleaseWhileLocked);
  }
  window.addEventListener('pointerdown', unlockAudio, { capture: true, passive: true });
  window.addEventListener('pointerup', unlockAudio, { capture: true, passive: true });
  window.addEventListener('touchstart', unlockAudio, { capture: true, passive: true });
  window.addEventListener('touchend', unlockAudio, { capture: true, passive: true });
  window.addEventListener('click', unlockAudio, { capture: true, passive: true });
  window.addEventListener('keydown', unlockAudio, { capture: true, passive: true });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && audioCtx) {
      pendingAudioTasks.length = 0;
      audioNeedsRecreate = true;
    }
  });
  window.addEventListener('pageshow', (event) => {
    if (event.persisted && audioCtx) {
      pendingAudioTasks.length = 0;
      audioNeedsRecreate = true;
    }
  });

  function runWhenAudioReady(task, category = 'general') {
    if (!soundEnabled) return;
    const ctx = getAudioCtx();
    if (!ctx) return;
    if (ctx.state === 'running' && !audioNeedsRecreate) {
      primeAudioOutput(ctx);
      try { task(ctx); } catch (e) { /* 再生失敗で操作自体を止めない */ }
      return;
    }
    // 画面復帰直後などに大量の音が溜まらないよう、直近の効果音だけを保持する。
    if (pendingAudioTasks.length >= 24) pendingAudioTasks.shift();
    pendingAudioTasks.push({ task, queuedAt: audioQueueNow(), category });
  }

  function playTone({ freqStart, freqEnd, duration, type = 'sine', volume, delay = 0, category = 'general' }) {
    runWhenAudioReady((ctx, queuedDelay = 0) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      const startAt = audioStartAt(ctx, delay + queuedDelay);
      const attackEnd = startAt + Math.min(0.004, duration * 0.2);
      osc.frequency.setValueAtTime(freqStart, startAt);
      if (freqEnd !== freqStart) osc.frequency.linearRampToValueAtTime(freqEnd, startAt + duration);
      gain.gain.setValueAtTime(0.001, startAt);
      gain.gain.linearRampToValueAtTime(volume, attackEnd);
      gain.gain.exponentialRampToValueAtTime(0.001, startAt + duration);
      osc.connect(gain);
      gain.connect(audioOutputDestination(ctx));
      osc.start(startAt);
      osc.stop(startAt + duration);
    }, category);
  }

  // フィルターをかけた短いノイズ。各操作音に木質の「コッ」という輪郭を添える。
  function playClick({ freq, duration, volume, q, delay = 0 }) {
    runWhenAudioReady((ctx, queuedDelay = 0) => {
      const startAt = audioStartAt(ctx, delay + queuedDelay);
      const bufferSize = Math.max(1, Math.floor(ctx.sampleRate * duration));
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        const decay = Math.pow(1 - i / bufferSize, 2); // 急速に減衰するエンベロープ
        data[i] = (Math.random() * 2 - 1) * decay;
      }
      const noise = ctx.createBufferSource();
      noise.buffer = buffer;

      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = freq;
      filter.Q.value = q;

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(volume, startAt);
      gain.gain.exponentialRampToValueAtTime(0.001, startAt + duration);

      noise.connect(filter);
      filter.connect(gain);
      gain.connect(audioOutputDestination(ctx));
      noise.start(startAt);
    });
  }

  function playWoodNote(freq, { delay = 0, volume = 0.065, duration = 0.065 } = {}) {
    playClick({ freq: freq * 3.2, duration: Math.min(duration, 0.04), volume: 0.16, q: 1.2, delay });
    playTone({ freqStart: freq * 1.08, freqEnd: freq, duration, type: 'triangle', volume, delay });
  }

  let placeSoundStep = 0;
  // 配置: 3音を巡回させ、連続配置にも小さなリズムが生まれる木製ブロック音
  function playPlaceSound() {
    const notes = [392.00, 440.00, 493.88];
    playWoodNote(notes[placeSoundStep % notes.length], { volume: 0.06 });
    placeSoundStep++;
  }
  // 移動: 配置より軽く、着地点へ滑り込む短い上昇音
  function playMoveSound() {
    playClick({ freq: 1450, duration: 0.035, volume: 0.14, q: 1.0 });
    playTone({ freqStart: 330, freqEnd: 392, duration: 0.075, type: 'triangle', volume: 0.05 });
  }
  // 長押し成立: 丸い「ペ」と跳ね上がる「コリっ」で、移動可能になったことを知らせる。
  function playPanelPickupSound() {
    playTone({ freqStart: 480, freqEnd: 300, duration: 0.075, type: 'sine', volume: 0.09 });
    playTone({ freqStart: 660, freqEnd: 940, duration: 0.095, type: 'sine', volume: 0.072, delay: 0.065 });
    playClick({ freq: 2100, duration: 0.025, volume: 0.12, q: 1.8, delay: 0.065 });
  }
  // 回転: 時計回りは上昇、反時計回りは下降。目を離していても方向が分かる。
  function playRotateCWSound() {
    playClick({ freq: 2400, duration: 0.025, volume: 0.18, q: 1.3 });
    playTone({ freqStart: 620, freqEnd: 840, duration: 0.07, type: 'triangle', volume: 0.055 });
  }
  function playRotateCCWSound() {
    playClick({ freq: 1750, duration: 0.025, volume: 0.18, q: 1.3 });
    playTone({ freqStart: 840, freqEnd: 620, duration: 0.07, type: 'triangle', volume: 0.055 });
  }
  // 削除: 低く短い「ポコッ」。失敗音のように重くしない。
  function playDeleteSound() {
    playClick({ freq: 720, duration: 0.05, volume: 0.2, q: 0.85 });
    playTone({ freqStart: 250, freqEnd: 180, duration: 0.09, type: 'triangle', volume: 0.055 });
  }
  function playUiClickSound() { playClick({ freq: 1900, duration: 0.026, volume: 0.18, q: 1.0 }); }
  function playPaletteSound(selected) {
    playClick({ freq: selected ? 2200 : 1450, duration: 0.028, volume: 0.16, q: 1.1 });
    playTone({
      freqStart: selected ? 620 : 520, freqEnd: selected ? 700 : 420,
      duration: 0.065, type: 'triangle', volume: 0.045,
    });
  }
  function playNamingTokenSound() {
    playClick({ freq: 2500, duration: 0.022, volume: 0.14, q: 1.4 });
    playTone({ freqStart: 784, freqEnd: 830, duration: 0.055, type: 'sine', volume: 0.04 });
  }
  function playUndoSound() {
    playClick({ freq: 1300, duration: 0.032, volume: 0.15, q: 1.0 });
    playTone({ freqStart: 520, freqEnd: 390, duration: 0.085, type: 'triangle', volume: 0.05 });
  }
  function playClearSound() {
    playWoodNote(293.66, { volume: 0.05, duration: 0.07 });
    playWoodNote(220.00, { delay: 0.055, volume: 0.05, duration: 0.085 });
  }
  function playToggleSound(enabled) {
    playClick({ freq: enabled ? 2100 : 1350, duration: 0.028, volume: 0.15, q: 1.1 });
    playTone({
      freqStart: enabled ? 440 : 659.25, freqEnd: enabled ? 659.25 : 440,
      duration: 0.09, type: 'triangle', volume: 0.05,
    });
  }
  function setSoundEnabled(enabled, event) {
    if (soundEnabled === enabled) return;
    soundEnabled = enabled;
    pendingAudioTasks.length = 0;
    saveSoundEnabled();
    const ctx = audioCtx;
    if (ctx && audioMasterGain) {
      const now = ctx.currentTime;
      audioMasterGain.gain.cancelScheduledValues(now);
      audioMasterGain.gain.setValueAtTime(Math.max(0.001, audioMasterGain.gain.value), now);
      audioMasterGain.gain.linearRampToValueAtTime(enabled ? 0.88 : 0.001, now + 0.05);
    }
    renderSoundToggle();
    if (enabled) {
      // このクリックは信頼済みの実操作なので、iPhoneでもここで音声復帰を試せる。
      unlockAudio(event);
      playToggleSound(true);
    }
  }
  function playModeSelectSound(mode) {
    const base = mode === 'game2' ? 493.88 : 392.00;
    playClick({ freq: mode === 'game2' ? 2250 : 1750, duration: 0.03, volume: 0.17, q: 1.15 });
    playTone({ freqStart: base, freqEnd: base, duration: 0.065, type: 'triangle', volume: 0.055 });
    playTone({ freqStart: base * 4 / 3, freqEnd: base * 4 / 3, duration: 0.085, type: 'triangle', volume: 0.05, delay: 0.055 });
  }
  function playDifficultySound(tier) {
    const notes = { practice: 329.63, easy: 392.00, medium: 440.00, hard: 493.88 };
    playWoodNote(notes[tier] || notes.easy, { volume: 0.055 });
  }

  // なぞり描き用の短いノイズは一度だけ生成して使い回す。
  // 高速で炭素鎖を伸ばしても、1マスごとのBuffer生成で処理が重くならないようにする。
  function getTraceNoiseBuffer(ctx) {
    if (traceNoiseBuffer && traceNoiseSampleRate === ctx.sampleRate) return traceNoiseBuffer;
    const duration = 0.09;
    const size = Math.max(1, Math.floor(ctx.sampleRate * duration));
    traceNoiseBuffer = ctx.createBuffer(1, size, ctx.sampleRate);
    traceNoiseSampleRate = ctx.sampleRate;
    const data = traceNoiseBuffer.getChannelData(0);
    for (let i = 0; i < size; i++) data[i] = Math.random() * 2 - 1;
    return traceNoiseBuffer;
  }

  function playTraceHit({ freq, duration = 0.045, volume = 0.07, delay = 0, q = 1.1 }) {
    runWhenAudioReady((ctx, queuedDelay = 0) => {
      const startAt = audioStartAt(ctx, delay + queuedDelay);
      const source = ctx.createBufferSource();
      source.buffer = getTraceNoiseBuffer(ctx);
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(freq, startAt);
      filter.Q.setValueAtTime(q, startAt);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(volume, startAt);
      gain.gain.exponentialRampToValueAtTime(0.001, startAt + duration);
      source.connect(filter);
      filter.connect(gain);
      gain.connect(audioOutputDestination(ctx));
      source.start(startAt);
      source.stop(startAt + duration);
    }, 'trace');
  }

  // 新しい炭素へ進むたびに音を積み上げる。長い鎖ほど明るく、5炭素目以降は
  // 小さな追い打ちを加えて、素早くなぞったときにドラムロールとしてつながる。
  function playTraceStepSound(carbonCount) {
    const pattern = [980, 1260, 1100, 1480];
    const lift = 1 + Math.min(Math.max(carbonCount - 2, 0), 10) * 0.035;
    const freq = pattern[(carbonCount - 2) % pattern.length] * lift;
    playTraceHit({ freq, volume: 0.068, duration: 0.042, q: 1.05 });
    if (carbonCount >= 5) {
      playTraceHit({ freq: freq * 1.12, volume: 0.036, duration: 0.032, delay: 0.03, q: 1.25 });
    }
    if (carbonCount % 4 === 0 && carbonCount % 8 !== 0) {
      playTraceHit({ freq: 2200 + carbonCount * 35, volume: 0.055, duration: 0.035, delay: 0.012, q: 1.6 });
    }
    if (carbonCount >= 8 && carbonCount % 8 === 0) playTraceMilestoneSound(carbonCount);
  }

  // 8炭素ごとの節目は、軽い木琴音ではなく胴鳴りのあるドラム音で強調する。
  // 8・24…炭素は「タン！」、16・32…炭素は「タタン！」と交互に鳴らす。
  function playTraceMilestoneSound(carbonCount) {
    const doubleHit = (carbonCount / 8) % 2 === 0;
    const playStroke = (delay, strength) => {
      playTraceHit({ freq: 820, volume: 0.11 * strength, duration: 0.085, delay, q: 0.72 });
      playTraceHit({ freq: 1750, volume: 0.065 * strength, duration: 0.045, delay: delay + 0.006, q: 1.35 });
      playTone({
        freqStart: 190, freqEnd: 132, duration: 0.105, type: 'triangle',
        volume: 0.075 * strength, delay, category: 'trace',
      });
    };
    if (doubleHit) playStroke(0, 0.72);
    playStroke(doubleHit ? 0.075 : 0, 1);
  }

  function playTraceBacktrackSound() {
    playTraceHit({ freq: 620, volume: 0.045, duration: 0.04, q: 0.85 });
    playTone({ freqStart: 310, freqEnd: 230, duration: 0.06, type: 'triangle', volume: 0.025, category: 'trace' });
  }

  function playTraceCloseSound(carbonCount) {
    // 環の閉鎖は「ドドン！」という固有の手触りを残しつつ、正常構造音と
    // 同じくらい小型スピーカーで届くよう、中域の胴鳴りと短い明るい余韻を重ねる。
    const depth = Math.min(carbonCount, 12) * 1.5;
    const playKick = (delay, strength) => {
      playTraceHit({ freq: 340, volume: 0.08 * strength, duration: 0.07, delay, q: 0.72 });
      playTone({ freqStart: 132 + depth, freqEnd: 76, duration: 0.14, type: 'sine', volume: 0.10 * strength, delay, category: 'trace' });
      playTone({ freqStart: 285, freqEnd: 180, duration: 0.10, type: 'triangle', volume: 0.062 * strength, delay, category: 'trace' });
    };
    playKick(0, 0.72);
    playKick(0.10, 1);
    // 低音だけを上げず、閉じた瞬間に小さな光沢を足す。通常の正常構造音とは
    // 別の音型なので、環が閉じた感覚を保ったまま格だけを揃えられる。
    playTone({ freqStart: 720, freqEnd: 760, duration: 0.12, type: 'triangle', volume: 0.12, delay: 0.115, category: 'trace' });
    playTone({ freqStart: 1080, freqEnd: 1080, duration: 0.075, type: 'sine', volume: 0.052, delay: 0.185, category: 'trace' });
  }
  // 構造が正常になった瞬間: 明るい2音の上昇チャイム + ふわっと軽いきらめき
  function playValidSound() {
    playTone({ freqStart: 660, freqEnd: 700, duration: 0.09, type: 'sine', volume: 0.14 });
    playTone({ freqStart: 880, freqEnd: 932, duration: 0.15, type: 'sine', volume: 0.16, delay: 0.07 });
    playTone({ freqStart: 1320, freqEnd: 1320, duration: 0.1, type: 'triangle', volume: 0.07, delay: 0.15 });
  }
  // 正解: 明るい上昇アルペジオ(ド・ミ・ソ・高ド)で弾む達成感を出す
  function playCorrectSound({ sparkle = false } = {}) {
    playTone({ freqStart: 523.25, freqEnd: 523.25, duration: 0.08, type: 'sine', volume: 0.15 });
    playTone({ freqStart: 659.25, freqEnd: 659.25, duration: 0.08, type: 'sine', volume: 0.16, delay: 0.06 });
    playTone({ freqStart: 783.99, freqEnd: 783.99, duration: 0.1, type: 'sine', volume: 0.17, delay: 0.12 });
    playTone({ freqStart: 1046.5, freqEnd: 1046.5, duration: 0.22, type: 'triangle', volume: 0.16, delay: 0.19 });
    if (sparkle) {
      playTone({ freqStart: 1567.98, freqEnd: 1567.98, duration: 0.08, type: 'triangle', volume: 0.055, delay: 0.27 });
      playTone({ freqStart: 2093.0, freqEnd: 2093.0, duration: 0.12, type: 'sine', volume: 0.045, delay: 0.33 });
    }
  }

window.TutorialAudio={playPlaceSound,playMoveSound,playPanelPickupSound,playRotateCWSound,playRotateCCWSound,playDeleteSound,playUiClickSound,playPaletteSound,playUndoSound,playClearSound,playValidSound,playCorrectSound,
 toggle(event){setSoundEnabled(!soundEnabled,event);},
 render:renderSoundToggle,
 beginTrace(path){traceState={path};traceGestureStartedWithAudioLocked=!audioCtx||audioCtx.state!=='running';},
 trace(path,previousLength,closed){traceState={path};if(closed)playTraceCloseSound(path.length-1);else if(path.length<previousLength)playTraceBacktrackSound();else for(let n=previousLength+1;n<=path.length;n++)if(n>=2)playTraceStepSound(n);},
 endTrace(){if(traceGestureStartedWithAudioLocked)discardPendingTraceAudio();traceGestureStartedWithAudioLocked=false;traceState=null;},
 clearPending(){pendingAudioTasks.length=0;traceGestureStartedWithAudioLocked=false;traceState=null;}
};
})();
