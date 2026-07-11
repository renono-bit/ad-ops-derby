"use strict";

// ============================================================
// サウンドエンジン
// Web Audio APIだけでチップチューンBGMとSEを合成する。外部音源ファイル不要。
// ============================================================

const Sound = (() => {
  let ctx = null;
  let master = null;
  let bgmGain = null;
  let seGain = null;
  let muted = localStorage.getItem("derbyMuted") === "1";

  const bgm = {
    timerId: null,
    step: 0,
    nextTime: 0,
    song: null,
  };

  const NOTE_INDEX = {
    C: 0, "C#": 1, D: 2, "D#": 3, E: 4, F: 5,
    "F#": 6, G: 7, "G#": 8, A: 9, "A#": 10, B: 11,
  };

  function noteHz(name) {
    const m = /^([A-G]#?)(-?\d)$/.exec(name);
    if (!m) return 440;
    const midi = (parseInt(m[2], 10) + 1) * 12 + NOTE_INDEX[m[1]];
    return 440 * Math.pow(2, (midi - 69) / 12);
  }

  function ensure() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.6;
      master.connect(ctx.destination);
      bgmGain = ctx.createGain();
      bgmGain.gain.value = 0.09;
      bgmGain.connect(master);
      seGain = ctx.createGain();
      seGain.gain.value = 0.22;
      seGain.connect(master);
    }
    // 裏タブ中は再開しない（visibilitychangeで復帰時に再開される）
    if (ctx.state === "suspended" && !document.hidden) ctx.resume();
    return true;
  }

  function tone({ freq, time, dur = 0.15, type = "square", vol = 1, dest, slideTo = null }) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, time);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, time + dur);
    gain.gain.setValueAtTime(0, time);
    gain.gain.linearRampToValueAtTime(vol, time + 0.008);
    gain.gain.setValueAtTime(vol, time + Math.max(0.008, dur - 0.04));
    gain.gain.linearRampToValueAtTime(0.0001, time + dur);
    osc.connect(gain);
    gain.connect(dest || seGain);
    osc.start(time);
    osc.stop(time + dur + 0.02);
  }

  function noise({ time, dur = 0.1, vol = 0.4, filterFreq = 2000 }) {
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = filterFreq;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol, time);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + dur);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(seGain);
    src.start(time);
  }

  function seq(notes, { step = 0.12, type = "square", vol = 0.9 } = {}) {
    if (!ensure()) return;
    const t0 = ctx.currentTime;
    notes.forEach((n, i) => {
      if (!n) return;
      tone({ freq: noteHz(n), time: t0 + i * step, dur: step * 0.92, type, vol });
    });
  }

  // ---------- SE ----------

  const se = {
    ui() {
      if (!ensure()) return;
      tone({ freq: 880, time: ctx.currentTime, dur: 0.06, vol: 0.5 });
    },
    coin() {
      if (!ensure()) return;
      const t = ctx.currentTime;
      tone({ freq: noteHz("B5"), time: t, dur: 0.07, vol: 0.7 });
      tone({ freq: noteHz("E6"), time: t + 0.07, dur: 0.22, vol: 0.7 });
    },
    gate() {
      // ゲートイン→スタートのファンファーレ
      seq(["G4", "C5", "E5", "G5", null, "G5", "G5"], { step: 0.13, vol: 0.8 });
      if (ctx) noise({ time: ctx.currentTime + 0.9, dur: 0.25, vol: 0.5, filterFreq: 900 });
    },
    tick() {
      if (!ensure()) return;
      noise({ time: ctx.currentTime, dur: 0.05, vol: 0.12, filterFreq: 3200 });
    },
    alarm() {
      if (!ensure()) return;
      const t = ctx.currentTime;
      for (let i = 0; i < 3; i += 1) {
        tone({ freq: 622, time: t + i * 0.19, dur: 0.09, type: "sawtooth", vol: 0.45 });
        tone({ freq: 466, time: t + i * 0.19 + 0.095, dur: 0.09, type: "sawtooth", vol: 0.45 });
      }
    },
    goal() {
      seq(["C5", "C5", "C5", "G5", null, "E5", "G5", "C6"], { step: 0.11, vol: 0.85 });
      if (ctx) noise({ time: ctx.currentTime, dur: 0.5, vol: 0.35, filterFreq: 1500 });
    },
    win() {
      seq(["C5", "E5", "G5", "C6", "G5", "C6", "E6", "C6", null, "G5", "C6", "E6", "G6"], {
        step: 0.11,
        vol: 0.8,
      });
    },
    lose() {
      if (!ensure()) return;
      const t = ctx.currentTime;
      tone({ freq: noteHz("E4"), time: t, dur: 0.28, type: "triangle", vol: 0.8 });
      tone({ freq: noteHz("D#4"), time: t + 0.3, dur: 0.28, type: "triangle", vol: 0.8 });
      tone({ freq: noteHz("D4"), time: t + 0.6, dur: 0.32, type: "triangle", vol: 0.8 });
      tone({ freq: noteHz("C#4"), time: t + 0.95, dur: 0.7, type: "triangle", vol: 0.8, slideTo: noteHz("C4") });
    },
    fate() {
      // パチンコ激アツ風: 加速する鼓動 + 上昇スイープ
      if (!ensure()) return;
      const t = ctx.currentTime;
      let time = t;
      for (let i = 0; i < 9; i += 1) {
        tone({ freq: 66, time, dur: 0.1, type: "triangle", vol: 1.0 });
        noise({ time, dur: 0.06, vol: 0.3, filterFreq: 280 });
        time += 0.42 - i * 0.035;
      }
      tone({ freq: 160, time: t + 2.2, dur: 1.0, type: "sawtooth", vol: 0.5, slideTo: 1900 });
    },
  };

  // ---------- BGM ----------
  // ステップシーケンサー: 8分音符単位のパターンをループ再生する。

  const SONGS = {
    lobby: {
      bpm: 106,
      melody: [
        "E5", null, "G5", null, "A5", null, "G5", "E5",
        "D5", null, "E5", null, "C5", null, null, null,
        "E5", null, "G5", null, "A5", null, "C6", "A5",
        "G5", null, "E5", "D5", "E5", null, null, null,
        "A5", null, "G5", null, "E5", null, "G5", null,
        "A5", "B5", "C6", null, "B5", "A5", "G5", null,
        "E5", null, "D5", null, "C5", "D5", "E5", "G5",
        "D5", null, "C5", null, null, null, null, null,
      ],
      bass: [
        "C3", null, "G3", null, "A2", null, "E3", null,
        "F2", null, "C3", null, "G2", null, "B2", null,
        "C3", null, "G3", null, "A2", null, "E3", null,
        "F2", null, "G2", null, "C3", null, null, null,
        "F2", null, "C3", null, "A2", null, "E3", null,
        "F2", null, "G2", null, "A2", null, "B2", null,
        "C3", null, "G3", null, "A2", null, "E3", null,
        "G2", null, "G2", null, "C3", null, null, null,
      ],
      melodyType: "square",
      melodyVol: 0.32,
      bassVol: 0.5,
    },
    race: {
      bpm: 168,
      melody: [
        "C5", "C5", null, "C5", null, "A4", "C5", null,
        "D5", "D5", null, "D5", null, "C5", "D5", null,
        "E5", "E5", null, "G5", null, "E5", "D5", "C5",
        "D5", null, "D5", "E5", "D5", "C5", "A4", null,
        "C5", "C5", null, "C5", null, "A4", "C5", null,
        "F5", "F5", null, "F5", null, "E5", "F5", null,
        "G5", null, "A5", null, "G5", "F5", "E5", "D5",
        "C5", null, "C5", "C5", "C5", null, null, null,
      ],
      bass: [
        "A2", "A2", "A3", "A2", "A2", "A3", "A2", "A3",
        "F2", "F2", "F3", "F2", "F2", "F3", "F2", "F3",
        "C3", "C3", "C4", "C3", "C3", "C4", "C3", "C4",
        "G2", "G2", "G3", "G2", "G2", "G3", "G2", "G3",
        "A2", "A2", "A3", "A2", "A2", "A3", "A2", "A3",
        "F2", "F2", "F3", "F2", "F2", "F3", "F2", "F3",
        "C3", "C3", "C4", "C3", "G2", "G2", "G3", "G2",
        "A2", "A2", "A3", "A2", "A2", "A3", "A2", "A3",
      ],
      melodyType: "square",
      melodyVol: 0.3,
      bassVol: 0.55,
    },
    final: {
      bpm: 124,
      melody: [
        "C5", null, "E5", null, "G5", null, "C6", null,
        "B5", "A5", "G5", null, "E5", null, "G5", null,
        "A5", null, "F5", null, "A5", null, "C6", null,
        "B5", null, "G5", null, "E5", "D5", "C5", null,
      ],
      bass: [
        "C3", null, "G2", null, "C3", null, "G2", null,
        "E3", null, "B2", null, "E3", null, "G2", null,
        "F2", null, "C3", null, "F2", null, "C3", null,
        "G2", null, "D3", null, "C3", null, "C3", null,
      ],
      melodyType: "triangle",
      melodyVol: 0.4,
      bassVol: 0.5,
    },
  };

  function scheduleStep(song, step, time) {
    const len = song.melody.length;
    const i = step % len;
    const mel = song.melody[i];
    const bas = song.bass[i % song.bass.length];
    if (mel) {
      tone({
        freq: noteHz(mel), time, dur: (30 / song.bpm) * 0.9,
        type: song.melodyType, vol: song.melodyVol, dest: bgmGain,
      });
    }
    if (bas) {
      tone({
        freq: noteHz(bas), time, dur: (30 / song.bpm) * 0.85,
        type: "triangle", vol: song.bassVol, dest: bgmGain,
      });
    }
  }

  function startBgm(name) {
    if (!ensure()) return;
    if (bgm.song === name && bgm.timerId !== null) return;
    stopBgm();
    const song = SONGS[name];
    if (!song) return;
    bgm.song = name;
    bgm.step = 0;
    bgm.nextTime = ctx.currentTime + 0.05;
    const stepDur = 30 / song.bpm; // 8分音符
    bgm.timerId = setInterval(() => {
      // タブ非表示中は予約しない（復帰時の音符一斉再生＝BGM被りを防ぐ）
      if (document.hidden) return;
      // スケジューラが遅れて音符が溜まっていたら、捨てて現在時刻に追従する
      if (bgm.nextTime < ctx.currentTime - 0.05) {
        const missed = Math.ceil((ctx.currentTime - bgm.nextTime) / stepDur);
        bgm.step += missed;
        bgm.nextTime += missed * stepDur;
      }
      while (bgm.nextTime < ctx.currentTime + 0.18) {
        scheduleStep(song, bgm.step, bgm.nextTime);
        bgm.nextTime += stepDur;
        bgm.step += 1;
      }
    }, 40);
  }

  // タブが裏に回ったら音声全体を一時停止し、戻ったら再開する
  document.addEventListener("visibilitychange", () => {
    if (!ctx) return;
    if (document.hidden) {
      if (ctx.state === "running") ctx.suspend();
    } else if (ctx.state === "suspended") {
      ctx.resume();
    }
  });

  function stopBgm() {
    if (bgm.timerId !== null) {
      clearInterval(bgm.timerId);
      bgm.timerId = null;
    }
    bgm.song = null;
  }

  function toggleMute() {
    muted = !muted;
    localStorage.setItem("derbyMuted", muted ? "1" : "0");
    if (master) master.gain.value = muted ? 0 : 0.6;
    return muted;
  }

  return {
    ensure,
    se,
    startBgm,
    stopBgm,
    toggleMute,
    isMuted: () => muted,
  };
})();
