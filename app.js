"use strict";

// ============================================================
// 【理不尽】Web広告運用ダービー — 1〜4人対戦版
// ============================================================

const PLAYER_COLORS = ["#ff5c8a", "#4ba3ff", "#f1c453", "#36b37e"];
const PLAYER_ICONS = ["🐴", "🦄", "🐎", "🎠"];
const LANE_COLORS = ["#f1c453", "#4ba3ff", "#f06c9b", "#36b37e"];
const BET_AMOUNTS = [100, 300, 500];
const START_MONEY = 1000;
const EMERGENCY_FUND = 500;
const TOTAL_TICKS = 16;
const TICK_MS = 1050;
const INCIDENT_TICKS = [5, 9, 13];

// 展開パターン: レースごとに各馬へランダムに割り当てられ、展開が毎回変わる（全30種）
// type: front=逃げ系 / stalker=先行系 / closer=差し・追込系 / erratic=ムラ・トラブル系
// curve は各コーナーでの伸び倍率。incidentFactor はハプニングの影響倍率。
// event は1レースに1回だけ起こる持ちネタ（発生コーナーは毎回抽選）。
const RACE_PATTERNS = [
  // --- 逃げ系 ---
  { label: "大逃げ", icon: "💨", type: "front",
    curve: (t) => (t <= 5 ? 1.62 : t <= 10 ? 1.0 : 0.58) },
  { label: "しぶとい逃げ", icon: "🛡️", type: "front", incidentFactor: 0.7,
    curve: (t) => (t <= 6 ? 1.3 : 0.88) },
  { label: "ジェットスタート", icon: "🚀", type: "front",
    curve: (t) => (t <= 2 ? 1.95 : t <= 10 ? 1.0 : 0.78) },
  { label: "ハナ争い", icon: "🔥", type: "front",
    curve: (t) => (t <= 4 ? 1.48 : 0.9) },
  { label: "掛かり気味", icon: "😤", type: "front",
    curve: (t) => (t <= 5 ? 1.58 : t <= 9 ? 0.95 : 0.62) },
  { label: "マイペース逃げ", icon: "🎈", type: "front",
    curve: (t) => (t <= 8 ? 1.18 : 0.86) },
  // --- 先行系 ---
  { label: "好位抜け出し", icon: "🎯", type: "stalker",
    curve: (t) => (t <= 8 ? 1.02 : t <= 13 ? 1.12 : 0.95) },
  { label: "マイペース先行", icon: "🚶", type: "stalker",
    curve: () => 1.02 },
  { label: "粘り腰", icon: "🪨", type: "stalker", incidentFactor: 0.5,
    curve: () => 1.0 },
  { label: "尻上がり", icon: "📈", type: "stalker",
    curve: (t) => 0.78 + t * 0.03 },
  { label: "竜頭蛇尾", icon: "📉", type: "stalker",
    curve: (t) => 1.32 - t * 0.038 },
  { label: "中だるみ", icon: "😪", type: "stalker",
    curve: (t) => (t >= 7 && t <= 10 ? 0.6 : 1.16) },
  { label: "鋼メンタル", icon: "🧠", type: "stalker", incidentFactor: 0.3,
    curve: () => 1.0 },
  { label: "神がかり", icon: "✨", type: "stalker",
    curve: () => 0.97,
    event: { ticks: [6, 8, 10, 12], delta: [3, 6], text: (h) => `${h}に謎の追い風！ 何かが噛み合っている。` } },
  // --- 差し・追込系 ---
  { label: "直線一気", icon: "⚡", type: "closer",
    curve: (t) => (t <= 12 ? 0.82 : 1.7) },
  { label: "大外一気", icon: "🌪️", type: "closer",
    curve: (t) => (t <= 11 ? 0.85 : 1.45) },
  { label: "二の脚", icon: "🦵", type: "closer",
    curve: (t) => ((t >= 6 && t <= 8) || t >= 13 ? 1.35 : 0.8) },
  { label: "じわじわ差し", icon: "🐢", type: "closer",
    curve: (t) => (t <= 8 ? 0.9 : 1.18) },
  { label: "ため差し", icon: "⏳", type: "closer",
    curve: (t) => (t <= 9 ? 0.86 : 1.28) },
  { label: "最後方一気", icon: "🎇", type: "closer",
    curve: (t) => (t <= 13 ? 0.78 : 2.05) },
  { label: "エンジン遅れ", icon: "🔧", type: "closer",
    curve: (t) => (t <= 4 ? 0.6 : t <= 10 ? 1.05 : 1.28) },
  { label: "スロースターター", icon: "🐌", type: "closer",
    curve: (t) => Math.min(0.6 + t * 0.05, 1.3) },
  { label: "ワイヤ際の魔術師", icon: "🎩", type: "closer",
    curve: (t) => (t <= 14 ? 0.93 : 1.8) },
  { label: "逆境の鬼", icon: "👹", type: "closer", incidentFactor: -0.6,
    curve: (t) => (t <= 10 ? 0.94 : 1.2) },
  // --- ムラ・トラブル系 ---
  { label: "出遅れ", icon: "😱", type: "erratic",
    curve: (t) => (t <= 2 ? 0.15 : 1.18),
    event: { ticks: [1], delta: [0, 0], text: (h) => `${h}、痛恨の出遅れ！ ゲートで立ち上がってしまった。` } },
  { label: "ムラ馬", icon: "🎲", type: "erratic",
    curve: () => randomBetween(0.55, 1.5) },
  { label: "気分屋", icon: "🌗", type: "erratic",
    curve: (t) => (t % 4 < 2 ? 1.28 : 0.78) },
  { label: "ガス欠", icon: "⛽", type: "erratic",
    curve: (t) => (t <= 12 ? 1.14 : 0.55) },
  { label: "ガラスの脚", icon: "🥀", type: "erratic", incidentFactor: 1.9,
    curve: () => 1.04 },
  { label: "事故体質", icon: "🌩️", type: "erratic",
    curve: () => 1.06,
    event: { ticks: [3, 5, 7, 9, 11], delta: [-6, -3], text: (h) => `${h}に不運が直撃！ 進行がもたつく。` } },
];

const state = {
  players: [], // { name, color, icon, money, borrowed }
  playerCount: 2,
  raceCount: 5,
  round: 0,
  gameCases: [], // 今ゲームで出題される案件（ランダム抽選）
  bets: [], // { player, plan, amount }
  betOrder: [],
  betTurn: 0,
  betAmount: 100,
  bettingOpen: false,
  running: false,
  runners: [], // { progress, style, condition }
  raceIncidents: [],
  highlights: [], // { tick, icon, text }
  lastLeader: -1,
  incidentMessageUntil: -1,
  confettiRaf: null,
};

const els = {};
[
  "screen-title", "screen-setup", "screen-game", "screen-final",
  "titleStart", "countButtons", "nameInputs", "raceCountButtons", "setupStart",
  "roundLabel", "playerBar",
  "clientName", "clientBrief", "clientIndustry", "clientKpi", "clientBudget", "clientAbsurdity",
  "raceVisual", "raceMessage", "racePhase", "raceLeader", "raceIncident",
  "track", "betIndicator", "betAmounts", "plansGrid",
  "eventLog", "resultPanel",
  "highlightModal", "highlightStyles", "highlightList", "highlightClose",
  "winnerModal", "winnerName", "winnerSummary", "winnerPayouts", "winnerClose",
  "finalStandings", "finalComment", "rematchButton", "changeMembersButton", "shareButton",
  "confetti", "muteButton",
].forEach((id) => {
  els[id] = document.getElementById(id);
});

// ---------- ユーティリティ ----------

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function randomBetween(min, max) {
  return Math.random() * (max - min) + min;
}

function shuffle(list) {
  const arr = [...list];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function escapeHtml(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function formatPt(value) {
  return value.toLocaleString("ja-JP");
}

function weightedBase(plan) {
  const { fit, stability, burst, client } = plan.stats;
  return fit * 0.42 + stability * 0.24 + burst * 0.2 + client * 0.14;
}

function currentCase() {
  return state.gameCases[state.round];
}

// ---------- 画面遷移 ----------

function showScreen(name) {
  ["screen-title", "screen-setup", "screen-game", "screen-final"].forEach((id) => {
    els[id].classList.toggle("active", id === name);
  });
  window.scrollTo({ top: 0 });
}

// ---------- プレイヤー設定 ----------

function renderNameInputs() {
  const previous = [...els.nameInputs.querySelectorAll("input")].map((input) => input.value);
  els.nameInputs.innerHTML = Array.from({ length: state.playerCount }, (_, i) => {
    const value = previous[i] || "";
    return `
      <label class="name-input" style="--player-color:${PLAYER_COLORS[i]}">
        <span>${PLAYER_ICONS[i]} PLAYER ${i + 1}</span>
        <input type="text" maxlength="8" placeholder="プレイヤー${i + 1}" value="${escapeHtml(value)}" />
      </label>
    `;
  }).join("");
}

function initPlayers() {
  const inputs = [...els.nameInputs.querySelectorAll("input")];
  state.players = inputs.map((input, i) => ({
    name: input.value.trim() || `プレイヤー${i + 1}`,
    color: PLAYER_COLORS[i],
    icon: PLAYER_ICONS[i],
    money: START_MONEY,
    borrowed: 0,
  }));
}

function startGame() {
  state.round = 0;
  // 案件プールより多いレース数の場合は、シャッフルを繰り返して継ぎ足す
  const deck = [];
  while (deck.length < state.raceCount) {
    deck.push(...shuffle(CASES));
  }
  state.gameCases = deck.slice(0, state.raceCount);
  showScreen("screen-game");
  startRound();
}

// ---------- 展開パターン割り当て ----------

function pickPattern(plan) {
  const { stability, burst } = plan.stats;
  // 安定型は逃げ/先行、爆発型は差し/追込に寄りやすい。ムラ系は誰にでも起こる。
  const weights = {
    front: stability * 0.6 + 15,
    stalker: stability * 0.9 + 15,
    closer: burst * 0.9 + 15,
    erratic: 42,
  };
  const total = Object.values(weights).reduce((a, b) => a + b, 0);
  let roll = Math.random() * total;
  let type = "stalker";
  for (const [key, weight] of Object.entries(weights)) {
    roll -= weight;
    if (roll <= 0) {
      type = key;
      break;
    }
  }
  const candidates = RACE_PATTERNS.filter((p) => p.type === type);
  return candidates[Math.floor(Math.random() * candidates.length)];
}

// ---------- ラウンド進行 ----------

function startRound() {
  const item = currentCase();
  state.bets = [];
  state.betTurn = 0;
  state.running = false;
  state.bettingOpen = true;
  state.betOrder = state.players.map((_, i) => (i + state.round) % state.players.length);
  state.runners = item.plans.map((plan) => {
    const pattern = pickPattern(plan);
    return {
      progress: 0,
      pattern,
      condition: randomBetween(0.86, 1.18), // 当日の学習の調子
      eventTick: pattern.event
        ? pattern.event.ticks[Math.floor(Math.random() * pattern.event.ticks.length)]
        : -1,
    };
  });
  state.raceIncidents = shuffle([...item.incidents, ...shuffle(GENERIC_INCIDENTS).slice(0, 2)]).slice(0, 3);
  state.highlights = [];
  state.lastLeader = -1;
  state.incidentMessageUntil = -1;

  els.roundLabel.textContent = `${state.round + 1} / ${state.gameCases.length}`;
  els.clientName.textContent = item.client;
  els.clientBrief.textContent = item.brief;
  els.clientIndustry.textContent = item.industry;
  els.clientKpi.textContent = item.kpi;
  els.clientBudget.textContent = item.budget;
  els.clientAbsurdity.textContent = item.absurdity;
  els.raceMessage.textContent = "各プレイヤー、馬券をどうぞ！";
  updateRaceHud("出走前", "未確定", "まだ平和");
  els.eventLog.innerHTML = "";
  els.resultPanel.classList.add("hidden");
  els.resultPanel.innerHTML = "";
  hideWinnerModal();
  hideHighlights();
  renderPlans(item);
  renderTrack(item);
  renderPlayerBar();
  Sound.startBgm("lobby");
  promptNextBetter();
}

// ---------- 馬券購入フェーズ ----------

function currentBetterIndex() {
  return state.betOrder[state.betTurn];
}

function promptNextBetter() {
  if (state.betTurn >= state.betOrder.length) {
    state.bettingOpen = false;
    els.betIndicator.innerHTML = `<span class="bet-done">💥 全員の馬券が出揃いました。まもなく出走！</span>`;
    renderPlayerBar();
    updateBetAmountButtons(null);
    setTimeout(() => beginRace(), 1200);
    return;
  }

  const idx = currentBetterIndex();
  const player = state.players[idx];

  if (player.money < BET_AMOUNTS[0]) {
    player.money += EMERGENCY_FUND;
    player.borrowed += EMERGENCY_FUND;
    addLog(`💸 ${player.name} が「来期予算の前借り」で ${EMERGENCY_FUND}pt を調達。役員会には内緒。`, player.color);
  }

  if (state.betAmount > player.money) {
    state.betAmount = [...BET_AMOUNTS].reverse().find((a) => a <= player.money) || BET_AMOUNTS[0];
  }

  els.betIndicator.innerHTML = `
    <span class="bet-turn-badge" style="--player-color:${player.color}">
      ${player.icon} ${escapeHtml(player.name)} の番
    </span>
    <span class="bet-turn-note">賭け金を選んで、プランをクリック！（持ち: ${formatPt(player.money)}pt）</span>
  `;
  updateBetAmountButtons(player);
  renderPlayerBar();
}

function updateBetAmountButtons(player) {
  [...els.betAmounts.querySelectorAll("button")].forEach((button) => {
    const amount = Number(button.dataset.amount);
    button.classList.toggle("selected", amount === state.betAmount);
    button.disabled = !player || amount > player.money;
  });
}

function placeBet(planIndex) {
  if (!state.bettingOpen || state.running) return;
  const idx = currentBetterIndex();
  const player = state.players[idx];
  const item = currentCase();
  const plan = item.plans[planIndex];
  const amount = Math.min(state.betAmount, player.money);
  if (amount <= 0) return;

  player.money -= amount;
  state.bets.push({ player: idx, plan: planIndex, amount });
  Sound.se.coin();
  addLog(
    `🎫 ${player.name} が ${plan.horse}（${plan.odds.toFixed(1)}倍）に ${amount}pt。的中なら ${formatPt(Math.round(amount * plan.odds))}pt！`,
    player.color,
  );
  renderBetChips(item);
  state.betTurn += 1;
  promptNextBetter();
}

function renderBetChips(item) {
  item.plans.forEach((_, planIndex) => {
    const holder = els.plansGrid.querySelector(`[data-index="${planIndex}"] .bet-chips`);
    if (!holder) return;
    holder.innerHTML = state.bets
      .filter((bet) => bet.plan === planIndex)
      .map((bet) => {
        const player = state.players[bet.player];
        return `<span class="bet-chip" style="--player-color:${player.color}">${player.icon} ${escapeHtml(player.name)} ${bet.amount}</span>`;
      })
      .join("");
  });
}

// ---------- 描画 ----------

function renderPlayerBar() {
  const activeIdx = state.bettingOpen && state.betTurn < state.betOrder.length ? currentBetterIndex() : -1;
  els.playerBar.innerHTML = state.players
    .map((player, i) => {
      const active = i === activeIdx ? " active" : "";
      return `
        <div class="player-badge${active}" style="--player-color:${player.color}">
          <span class="player-icon">${player.icon}</span>
          <span class="player-name">${escapeHtml(player.name)}</span>
          <strong class="player-money">${formatPt(player.money)}<small>pt</small></strong>
        </div>
      `;
    })
    .join("");
}

function renderPlans(item) {
  els.plansGrid.innerHTML = item.plans
    .map((plan, index) => {
      const gate = index + 1;
      return `
        <button class="plan-card" type="button" data-index="${index}">
          <div class="plan-topline">
            <span class="gate" style="background:${LANE_COLORS[index]}">${gate}</span>
            <span class="horse-name">${plan.horse}</span>
            <span class="odds">${plan.odds.toFixed(1)}倍</span>
          </div>
          <h3>${plan.name}</h3>
          <p>${plan.setup}</p>
          <p class="allocation">予算配分: ${plan.allocation}</p>
          <div class="stats">
            <span>適性 ${plan.stats.fit}</span>
            <span>安定 ${plan.stats.stability}</span>
            <span>爆発 ${plan.stats.burst}</span>
            <span>顧客 ${plan.stats.client}</span>
          </div>
          <div class="bet-chips"></div>
        </button>
      `;
    })
    .join("");

  [...els.plansGrid.querySelectorAll(".plan-card")].forEach((button) => {
    button.addEventListener("click", () => {
      placeBet(Number(button.dataset.index));
    });
  });
}

function renderTrack(item) {
  els.track.innerHTML = item.plans
    .map((plan, index) => {
      return `
        <div class="lane">
          <div class="horse" id="horse-${index}">
            <span class="runner-icon" style="background:${LANE_COLORS[index]}"><span class="horse-emoji">🏇</span></span>
            <span class="runner-card">
              <strong>${plan.horse}</strong>
              <span>${plan.media} / KPI 0%</span>
              <span class="lane-chips" id="laneChips-${index}"></span>
            </span>
          </div>
        </div>
      `;
    })
    .join("");
}

function renderLaneChips() {
  const item = currentCase();
  item.plans.forEach((_, planIndex) => {
    const holder = document.getElementById(`laneChips-${planIndex}`);
    if (!holder) return;
    holder.innerHTML = state.bets
      .filter((bet) => bet.plan === planIndex)
      .map((bet) => {
        const player = state.players[bet.player];
        return `<i style="background:${player.color}" title="${escapeHtml(player.name)}"></i>`;
      })
      .join("");
  });
}

// ---------- レース ----------

async function beginRace() {
  const item = currentCase();
  state.running = true;
  els.raceMessage.textContent = "ゲートイン完了。全員の胃が痛くなり始めた。";
  updateRaceHud("ゲートイン", "未確定", "まだ平和");
  [...els.plansGrid.querySelectorAll(".plan-card")].forEach((button) => {
    button.disabled = true;
  });
  renderLaneChips();
  Sound.se.gate();
  await sleep(1400);
  Sound.startBgm("race");
  [...els.track.querySelectorAll(".horse")].forEach((horse) => horse.classList.add("running"));

  for (let tick = 1; tick <= TOTAL_TICKS; tick += 1) {
    await sleep(TICK_MS);
    updateRaceHud(`第${tick}コーナー / ${TOTAL_TICKS}`, null, null);
    advanceProgress(item, tick);
    processPatternEvents(item, tick);

    const incidentSlot = INCIDENT_TICKS.indexOf(tick);
    if (incidentSlot !== -1) {
      applyIncidentLive(item, state.raceIncidents[incidentSlot], tick);
    }

    renderRacePositions(item, tick);
    trackLeaderChange(item, tick);
  }

  await sleep(900);
  finishRace(item);
}

function advanceProgress(item, tick) {
  item.plans.forEach((plan, index) => {
    const runner = state.runners[index];
    const curve = runner.pattern.curve(tick);
    const gain = (weightedBase(plan) / TOTAL_TICKS) * curve * runner.condition * randomBetween(0.88, 1.14);
    runner.progress += gain;
  });
}

// 展開パターンの持ちネタ（出遅れ・神がかり等）を発火させる
function processPatternEvents(item, tick) {
  state.runners.forEach((runner, index) => {
    if (runner.eventTick !== tick) return;
    runner.eventTick = -1;
    const event = runner.pattern.event;
    const delta = randomBetween(event.delta[0], event.delta[1]);
    runner.progress = Math.max(2, runner.progress + delta);
    const text = event.text(item.plans[index].horse);
    state.highlights.push({ tick, icon: runner.pattern.icon, text });
    addLog(`${runner.pattern.icon} ${text}`);
  });
}

function applyIncidentLive(item, incident, tick) {
  Sound.se.alarm();
  let worstIndex = 0;
  let worstDelta = Infinity;
  let bestIndex = 0;
  let bestDelta = -Infinity;

  item.plans.forEach((plan, index) => {
    const effects = incident.effect;
    const profile =
      (effects.fit || 0) * (plan.stats.fit / 100) +
      (effects.stability || 0) * (plan.stats.stability / 100) +
      (effects.burst || 0) * (plan.stats.burst / 100) +
      (effects.client || 0) * (plan.stats.client / 100);
    let delta = profile * 0.55 + randomBetween(-2.4, 2.4);
    const factor = state.runners[index].pattern.incidentFactor ?? 1;
    if (factor < 0) {
      // 逆境の鬼: マイナスをプラスに変える。プラスの追い風は半減。
      delta = delta < 0 ? delta * factor : delta * 0.5;
    } else {
      delta *= factor;
    }
    state.runners[index].progress = Math.max(2, state.runners[index].progress + delta);
    if (delta < worstDelta) {
      worstDelta = delta;
      worstIndex = index;
    }
    if (delta > bestDelta) {
      bestDelta = delta;
      bestIndex = index;
    }
  });

  updateRaceHud(null, null, incident.title);
  els.raceMessage.textContent = `⚡ ${incident.type}: ${incident.title}`;
  state.incidentMessageUntil = tick + 1;
  addLog(`⚡ ${incident.type}: ${incident.title}。${incident.body}`);

  let impact = "";
  if (worstDelta < -1.5) {
    impact = `直撃したのは ${item.plans[worstIndex].horse}。`;
  } else if (bestDelta > 1.5) {
    impact = `追い風を受けたのは ${item.plans[bestIndex].horse}。`;
  }
  state.highlights.push({
    tick,
    icon: "⚡",
    text: `${incident.type}「${incident.title}」— ${incident.body}${impact ? " " + impact : ""}`,
  });
}

function trackLeaderChange(item, tick) {
  const leader = state.runners
    .map((runner, index) => ({ progress: runner.progress, index }))
    .sort((a, b) => b.progress - a.progress)[0].index;

  if (state.lastLeader === -1) {
    state.highlights.push({
      tick,
      icon: "🏁",
      text: `${item.plans[leader].horse}（${state.runners[leader].pattern.label}）が飛び出して先頭に。`,
    });
  } else if (leader !== state.lastLeader) {
    state.highlights.push({
      tick,
      icon: "🔄",
      text: `${item.plans[leader].horse}（${state.runners[leader].pattern.label}）が ${item.plans[state.lastLeader].horse} をかわして先頭に立つ！`,
    });
    addLog(`🔄 第${tick}コーナー: ${item.plans[leader].horse} が先頭を奪う！`);
  }
  state.lastLeader = leader;
}

function renderRacePositions(item, tick, finalRanks = null) {
  const ranked = state.runners
    .map((runner, index) => ({ progress: runner.progress, index }))
    .sort((a, b) => b.progress - a.progress);

  const leaderProgress = Math.max(1, ranked[0].progress);
  const leaderFraction = clamp(0.05 + 0.9 * (tick / TOTAL_TICKS), 0.05, 0.94);

  state.runners.forEach((runner, index) => {
    const horse = document.getElementById(`horse-${index}`);
    if (!horse) return;
    const usable = getUsableDistance(horse);
    let fraction;
    if (finalRanks) {
      const rank = finalRanks.indexOf(index);
      fraction = rank === 0 ? 1.0 : clamp(0.93 - rank * 0.08, 0.4, 0.93);
    } else {
      fraction = leaderFraction * Math.pow(runner.progress / leaderProgress, 2.2);
    }
    const distance = finalRanks && finalRanks.indexOf(index) === 0
      ? usable + 14
      : Math.round(usable * fraction);
    horse.style.transform = `translateX(${distance}px)`;
    horse.classList.toggle("flip", fraction > 0.72);
    horse.style.zIndex = String(10 - ranked.findIndex((r) => r.index === index));
    const label = horse.querySelector(".runner-card > span");
    if (label) label.textContent = `${item.plans[index].media} / KPI ${Math.round(runner.progress * 1.9)}%`;
  });

  const leader = item.plans[ranked[0].index];
  updateRaceHud(null, `${leader.horse} / KPI ${Math.round(ranked[0].progress * 1.9)}%`, null);
  if (!finalRanks && tick > state.incidentMessageUntil) {
    els.raceMessage.textContent = `現在先頭: ${leader.horse}。まだ何も信用できません。`;
  }
}

function getUsableDistance(horse) {
  const trackRect = els.track.getBoundingClientRect();
  const finishRect = document.querySelector(".finish-line")?.getBoundingClientRect();
  const horseLeft = horse.offsetLeft || 12;
  const iconWidth = 44;
  if (finishRect && trackRect.width > 0) {
    return Math.max(60, finishRect.left - trackRect.left + finishRect.width - horseLeft - iconWidth);
  }
  return Math.max(60, trackRect.width - horseLeft - iconWidth - 40);
}

// ---------- 決着と払い戻し ----------

function finishRace(item) {
  const result = state.runners
    .map((runner, index) => {
      const plan = item.plans[index];
      const clientAdjustment = plan.stats.client * randomBetween(-0.02, 0.05);
      const finalScore = runner.progress + clientAdjustment + randomBetween(-2.5, 3.5);
      return { index, finalScore };
    })
    .sort((a, b) => b.finalScore - a.finalScore);

  result.forEach((entry) => {
    state.runners[entry.index].progress = entry.finalScore;
  });

  const finalRanks = result.map((entry) => entry.index);
  const winner = result[0];
  const second = result[1];
  const winnerPlan = item.plans[winner.index];
  const winnerPattern = state.runners[winner.index].pattern;

  // 決着ハイライト
  if (winnerPattern.type === "front" && winner.index === state.lastLeader) {
    state.highlights.push({
      tick: TOTAL_TICKS,
      icon: "🏆",
      text: `${winnerPlan.horse} がそのまま押し切って1着！ 見事な逃げ切り（${winnerPattern.label}）。`,
    });
  } else if (winnerPattern.type === "closer") {
    state.highlights.push({
      tick: TOTAL_TICKS,
      icon: "🏆",
      text: `最後の直線、${winnerPlan.horse} が一気に突き抜けて1着！ 鮮やかな${winnerPattern.label}決着。`,
    });
  } else if (winnerPattern.type === "erratic") {
    state.highlights.push({
      tick: TOTAL_TICKS,
      icon: "🏆",
      text: `波乱を呼んだ ${winnerPlan.horse}（${winnerPattern.label}）がまさかの1着！ 誰がこの展開を読めただろうか。`,
    });
  } else {
    state.highlights.push({
      tick: TOTAL_TICKS,
      icon: "🏆",
      text: `${winnerPlan.horse}（${winnerPattern.label}）が混戦を制して1着。着差はわずか、胃へのダメージは甚大。`,
    });
  }

  [...els.track.querySelectorAll(".horse")].forEach((horse) => horse.classList.remove("running"));
  renderRacePositions(item, TOTAL_TICKS, finalRanks);
  els.raceVisual.classList.add("flash");
  setTimeout(() => els.raceVisual.classList.remove("flash"), 900);
  Sound.stopBgm();
  Sound.se.goal();

  updateRaceHud("確定", `${winnerPlan.horse} / KPI ${Math.round(winner.finalScore * 1.9)}%`, "レース確定");

  // 払い戻し: 1着はオッズ×賭け金、2着は賭け金返還
  const payouts = state.bets.map((bet) => {
    const player = state.players[bet.player];
    const plan = item.plans[bet.plan];
    let payout = 0;
    let label = "紙くず";
    if (bet.plan === winner.index) {
      payout = Math.round(bet.amount * plan.odds);
      label = "的中！";
    } else if (bet.plan === second.index) {
      payout = bet.amount;
      label = "2着（返還）";
    }
    player.money += payout;
    return { bet, payout, label };
  });

  const anyoneWon = payouts.some((p) => p.bet.plan === winner.index);
  els.raceMessage.textContent = anyoneWon
    ? `${winnerPlan.horse} が1着！ 的中者の勝因は、だいたい後付けです。`
    : `勝ったのは ${winnerPlan.horse}。全員ハズレ。広告運用は最後まで油断できません。`;

  payouts.forEach(({ bet, payout, label }) => {
    const player = state.players[bet.player];
    const sign = payout > 0 ? `+${formatPt(payout)}pt` : "±0pt";
    addLog(`💰 ${player.name}: ${item.plans[bet.plan].horse} → ${label} ${payout > 0 ? sign : `(-${bet.amount}pt)`}`, player.color);
  });

  renderPlayerBar();
  renderResultPanel(item, result, payouts);
  state.running = false;

  // ゴール後: まずハイライト、その後に払い戻しモーダル
  setTimeout(() => {
    showHighlights(item, () => showWinnerModal(item, winnerPlan, winner.finalScore, payouts, anyoneWon));
  }, 1300);
}

function renderResultPanel(item, result, payouts) {
  const isLastRound = state.round === state.gameCases.length - 1;
  els.resultPanel.innerHTML = `
    <h3>🏁 決着: ${item.plans[result[0].index].name}</h3>
    <ol class="ranking">
      ${result
        .map((entry, rank) => {
          const plan = item.plans[entry.index];
          const pattern = state.runners[entry.index].pattern;
          const medal = ["🥇", "🥈", "🥉", "　"][rank];
          return `
            <li>
              <strong>${medal} ${rank + 1}着</strong>
              <span>${plan.horse} <small class="style-tag">${pattern.label}</small></span>
              <span>${Math.round(entry.finalScore * 1.9)}%</span>
            </li>
          `;
        })
        .join("")}
    </ol>
    <table class="payout-table">
      <thead>
        <tr><th>プレイヤー</th><th>買い目</th><th>結果</th><th>収支</th></tr>
      </thead>
      <tbody>
        ${payouts
          .map(({ bet, payout, label }) => {
            const player = state.players[bet.player];
            const net = payout - bet.amount;
            const netClass = net > 0 ? "plus" : net < 0 ? "minus" : "";
            return `
              <tr>
                <td><span class="mini-chip" style="--player-color:${player.color}">${player.icon} ${escapeHtml(player.name)}</span></td>
                <td>${item.plans[bet.plan].horse} × ${bet.amount}pt</td>
                <td>${label}</td>
                <td class="${netClass}">${net >= 0 ? "+" : ""}${formatPt(net)}pt</td>
              </tr>
            `;
          })
          .join("")}
      </tbody>
    </table>
    <div class="result-buttons">
      <button class="sub-button" type="button" id="replayHighlights">📜 ハイライトを見る</button>
      <button class="next-button" type="button" id="nextRoundButton">${isLastRound ? "🏆 最終結果を見る" : "▶ 次の案件へ"}</button>
    </div>
  `;
  els.resultPanel.classList.remove("hidden");
  els.resultPanel.querySelector("#nextRoundButton").addEventListener("click", () => {
    Sound.se.ui();
    nextRound();
  });
  els.resultPanel.querySelector("#replayHighlights").addEventListener("click", () => {
    Sound.se.ui();
    showHighlights(item, null);
  });
}

function nextRound() {
  state.round += 1;
  if (state.round >= state.gameCases.length) {
    showFinal();
  } else {
    startRound();
  }
}

// ---------- ハイライトポップアップ ----------

let highlightCallback = null;

function showHighlights(item, onClose) {
  highlightCallback = onClose || null;
  els.highlightStyles.innerHTML = item.plans
    .map((plan, index) => {
      const pattern = state.runners[index].pattern;
      return `<span class="style-chip" style="--lane-color:${LANE_COLORS[index]}">${pattern.icon} ${plan.horse}【${pattern.label}】</span>`;
    })
    .join("");
  els.highlightList.innerHTML = state.highlights
    .map((h) => `
      <li>
        <span class="hl-tick">${h.tick === TOTAL_TICKS ? "GOAL" : `第${h.tick}角`}</span>
        <span class="hl-icon">${h.icon}</span>
        <span class="hl-text">${escapeHtml(h.text)}</span>
      </li>
    `)
    .join("");
  els.highlightClose.textContent = onClose ? "払い戻しへ ▶" : "閉じる";
  els.highlightModal.classList.add("show");
  els.highlightModal.setAttribute("aria-hidden", "false");
  els.highlightClose.focus();
}

function hideHighlights() {
  els.highlightModal.classList.remove("show");
  els.highlightModal.setAttribute("aria-hidden", "true");
}

// ---------- 最終結果 ----------

function showFinal() {
  Sound.stopBgm();
  showScreen("screen-final");
  const standings = state.players
    .map((player, i) => ({ ...player, index: i }))
    .sort((a, b) => b.money - a.money);
  const top = standings[0];
  const isTie = standings.length > 1 && standings[1].money === top.money;

  els.finalStandings.innerHTML = standings
    .map((player, rank) => {
      const crown = rank === 0 ? "👑 " : "";
      const rankLabel = ["1st", "2nd", "3rd", "4th"][rank];
      const debt = player.borrowed > 0 ? `<small class="debt">（前借り ${formatPt(player.borrowed)}pt）</small>` : "";
      return `
        <div class="final-row rank-${rank}" style="--player-color:${player.color}">
          <span class="final-rank">${rankLabel}</span>
          <span class="final-name">${crown}${player.icon} ${escapeHtml(player.name)}</span>
          <span class="final-money">${formatPt(player.money)}pt ${debt}</span>
        </div>
      `;
    })
    .join("");

  els.finalComment.textContent = isTie
    ? "まさかの同点決着。広告運用と同じく、勝敗の理由は誰にも説明できません。"
    : state.players.length === 1
      ? top.money >= START_MONEY
        ? `最終 ${formatPt(top.money)}pt。初期予算を守り切りました。運用者の鑑です。`
        : `最終 ${formatPt(top.money)}pt。予算は溶けましたが、得られた学びはプライスレス…ということにしましょう。`
      : `優勝は ${top.name}！ 勝因はもちろん「相場観」。負けた人の敗因は「理不尽」です。`;

  const shareText = state.players.length === 1
    ? `【理不尽】Web広告運用ダービーで最終 ${formatPt(top.money)}pt を記録！`
    : `【理不尽】Web広告運用ダービー、優勝は ${top.name}（${formatPt(top.money)}pt）！`;
  els.shareButton.href =
    `https://twitter.com/intent/tweet?text=${encodeURIComponent(`${shareText} #広告運用ダービー`)}&url=${encodeURIComponent(location.href.split("#")[0])}`;

  Sound.se.win();
  setTimeout(() => Sound.startBgm("final"), 1600);
  startConfetti();
}

function rematch() {
  stopConfetti();
  state.players.forEach((player) => {
    player.money = START_MONEY;
    player.borrowed = 0;
  });
  startGame();
}

// ---------- 紙吹雪 ----------

function startConfetti() {
  const canvas = els.confetti;
  const ctx2d = canvas.getContext("2d");
  const colors = [...PLAYER_COLORS, "#ffffff", "#ffd700"];
  let width = (canvas.width = canvas.offsetWidth);
  let height = (canvas.height = canvas.offsetHeight);
  const onResize = () => {
    width = canvas.width = canvas.offsetWidth;
    height = canvas.height = canvas.offsetHeight;
  };
  window.addEventListener("resize", onResize);
  canvas._onResize = onResize;

  const particles = Array.from({ length: 130 }, () => ({
    x: Math.random() * width,
    y: Math.random() * -height,
    size: 4 + Math.random() * 6,
    speed: 1.4 + Math.random() * 2.6,
    sway: Math.random() * 2 * Math.PI,
    swaySpeed: 0.02 + Math.random() * 0.05,
    color: colors[Math.floor(Math.random() * colors.length)],
  }));

  function frame() {
    ctx2d.clearRect(0, 0, width, height);
    particles.forEach((p) => {
      p.y += p.speed;
      p.sway += p.swaySpeed;
      p.x += Math.sin(p.sway) * 1.2;
      if (p.y > height + 20) {
        p.y = -20;
        p.x = Math.random() * width;
      }
      ctx2d.fillStyle = p.color;
      ctx2d.fillRect(p.x, p.y, p.size, p.size * 0.6);
    });
    state.confettiRaf = requestAnimationFrame(frame);
  }
  frame();
}

function stopConfetti() {
  if (state.confettiRaf) {
    cancelAnimationFrame(state.confettiRaf);
    state.confettiRaf = null;
  }
  if (els.confetti._onResize) {
    window.removeEventListener("resize", els.confetti._onResize);
    els.confetti._onResize = null;
  }
  const ctx2d = els.confetti.getContext("2d");
  ctx2d.clearRect(0, 0, els.confetti.width, els.confetti.height);
}

// ---------- モーダル ----------

function showWinnerModal(item, winnerPlan, finalScore, payouts, anyoneWon) {
  els.winnerName.textContent = winnerPlan.horse;
  els.winnerSummary.textContent = `${winnerPlan.name} が KPI ${Math.round(finalScore * 1.9)}% で優勝。`;
  els.winnerPayouts.innerHTML = payouts
    .map(({ bet, payout }) => {
      const player = state.players[bet.player];
      const net = payout - bet.amount;
      const cls = net > 0 ? "plus" : net < 0 ? "minus" : "";
      return `<span class="mini-chip" style="--player-color:${player.color}">${player.icon} ${escapeHtml(player.name)} <b class="${cls}">${net >= 0 ? "+" : ""}${formatPt(net)}</b></span>`;
    })
    .join("");
  els.winnerModal.classList.add("show");
  els.winnerModal.setAttribute("aria-hidden", "false");
  els.winnerClose.focus();
  setTimeout(() => (anyoneWon ? Sound.se.win() : Sound.se.lose()), 400);
}

function hideWinnerModal() {
  els.winnerModal.classList.remove("show");
  els.winnerModal.setAttribute("aria-hidden", "true");
}

// ---------- HUD / ログ ----------

function updateRaceHud(phase, leader, incident) {
  if (phase !== null) els.racePhase.textContent = phase;
  if (leader !== null) els.raceLeader.textContent = leader;
  if (incident !== null) els.raceIncident.textContent = incident;
}

function addLog(message, color = null) {
  const li = document.createElement("li");
  li.textContent = message;
  if (color) li.style.borderLeftColor = color;
  els.eventLog.prepend(li);
  while (els.eventLog.children.length > 30) {
    els.eventLog.removeChild(els.eventLog.lastChild);
  }
}

// ---------- イベント配線 ----------

function updateMuteButton() {
  els.muteButton.textContent = Sound.isMuted() ? "🔇" : "🔊";
}

els.muteButton.addEventListener("click", () => {
  Sound.ensure();
  Sound.toggleMute();
  updateMuteButton();
});

els.titleStart.addEventListener("click", () => {
  Sound.ensure();
  Sound.se.ui();
  Sound.startBgm("lobby");
  renderNameInputs();
  showScreen("screen-setup");
});

els.countButtons.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-count]");
  if (!button) return;
  Sound.se.ui();
  state.playerCount = Number(button.dataset.count);
  [...els.countButtons.querySelectorAll("button")].forEach((b) => {
    b.classList.toggle("selected", b === button);
  });
  renderNameInputs();
});

els.raceCountButtons.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-races]");
  if (!button) return;
  Sound.se.ui();
  state.raceCount = Number(button.dataset.races);
  [...els.raceCountButtons.querySelectorAll("button")].forEach((b) => {
    b.classList.toggle("selected", b === button);
  });
});

els.setupStart.addEventListener("click", () => {
  Sound.se.coin();
  initPlayers();
  startGame();
});

els.betAmounts.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-amount]");
  if (!button || button.disabled) return;
  Sound.se.ui();
  state.betAmount = Number(button.dataset.amount);
  const player = state.bettingOpen && state.betTurn < state.betOrder.length
    ? state.players[currentBetterIndex()]
    : null;
  updateBetAmountButtons(player);
});

els.highlightClose.addEventListener("click", () => {
  Sound.se.ui();
  hideHighlights();
  if (highlightCallback) {
    const callback = highlightCallback;
    highlightCallback = null;
    callback();
  }
});

els.winnerClose.addEventListener("click", () => {
  Sound.se.ui();
  hideWinnerModal();
});

els.rematchButton.addEventListener("click", () => {
  Sound.se.ui();
  rematch();
});

els.changeMembersButton.addEventListener("click", () => {
  Sound.se.ui();
  stopConfetti();
  Sound.startBgm("lobby");
  renderNameInputs();
  showScreen("screen-setup");
});

// 最初のユーザー操作でオーディオを起動（自動再生制限対策）
document.addEventListener("pointerdown", () => Sound.ensure(), { once: true });

window.addEventListener("resize", () => {
  if (els["screen-game"].classList.contains("active") && state.running && state.runners.length) {
    renderRacePositions(currentCase(), TOTAL_TICKS / 2);
  }
});

// ---------- 初期化 ----------

updateMuteButton();
renderNameInputs();
showScreen("screen-title");
