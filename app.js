"use strict";

// ============================================================
// 【理不尽】Web広告運用ダービー — 1〜4人対戦版
// ローカル(1画面) / オンライン(ルームID) 両対応
// ============================================================

const PLAYER_COLORS = ["#ff6ea9", "#4aa8ff", "#ffd23f", "#4fd18b", "#b78aff", "#ff9f45"];
const PLAYER_ICONS = ["🐴", "🦄", "🐎", "🎠", "🦓", "🐫"];
const LANE_COLORS = ["#f1c453", "#4ba3ff", "#f06c9b", "#36b37e"];
const BET_AMOUNTS = [100, 300, 500];
const START_MONEY = 1000;
const EMERGENCY_FUND = 500;
const TOTAL_TICKS = 16;
const TICK_MS = 1050;
const INCIDENT_TICKS = [5, 9, 13];
const MAX_PLAYERS = 6;

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
  mode: "local", // "local" | "host" | "guest"
  myIndex: 0, // オンライン時の自分のプレイヤー番号
  roster: [], // オンライン時の参加者 [{ name, connected }]
  players: [], // { name, color, icon, money, borrowed }
  playerCount: 2,
  raceCount: 5,
  cutInEnabled: false,
  round: 0,
  deck: [], // 今ゲームで出題される案件のインデックス列
  bets: [], // { player, plan, amount }
  betOrder: [],
  betTurn: 0,
  betAmount: 100,
  bettingOpen: false,
  running: false,
  runners: [], // { progress, pattern, condition, eventTick }
  raceIncidents: [],
  highlights: [],
  incidentMessageUntil: -1,
  queuedMsg: null, // 再生中に届いたラウンド進行メッセージの待避場所
  confettiRaf: null,
};

const els = {};
[
  "screen-title", "screen-setup", "screen-online", "screen-game", "screen-final",
  "titleStart", "titleOnline",
  "countButtons", "nameInputs", "raceCountButtons", "cutInButtons", "setupStart", "setupBack",
  "onlineEntry", "onlineName", "createRoomButton", "roomCodeInput", "joinRoomButton", "onlineError", "onlineBack",
  "onlineLobby", "roomCodeDisplay", "copyRoomCode", "lobbyMembers",
  "hostSettings", "onlineCutInButtons", "onlineRaceCountButtons", "onlineStartButton",
  "guestWaitNote", "leaveRoomButton",
  "roundLabel", "playerBar",
  "clientName", "clientBrief", "clientIndustry", "clientKpi", "clientBudget", "clientAbsurdity",
  "raceVisual", "raceMessage", "racePhase", "raceLeader", "raceIncident",
  "oddsRows", "incidentBanner", "track", "deckPanel",
  "betIndicator", "betAmounts", "plansGrid",
  "eventLog", "resultPanel",
  "cutIn", "cutInType", "cutInTitle", "cutInBody", "cutInContinue",
  "ribbonModal", "ribbonDots", "ribbonBody", "ribbonNext", "ribbonSecondary",
  "burstCanvas",
  "finalStandings", "finalComment", "rematchButton", "changeMembersButton", "shareButton",
  "onlineFinalNote",
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
  return CASES[state.deck[state.round]];
}

function isOnline() {
  return state.mode === "host" || state.mode === "guest";
}

function canControlFlow() {
  return state.mode !== "guest";
}

// ---------- 画面遷移 ----------

function showScreen(name) {
  ["screen-title", "screen-setup", "screen-online", "screen-game", "screen-final"].forEach((id) => {
    els[id].classList.toggle("active", id === name);
  });
  window.scrollTo({ top: 0 });
}

// ---------- プレイヤー設定（ローカル） ----------

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

function buildPlayers(names) {
  return names.map((name, i) => ({
    name: name || `プレイヤー${i + 1}`,
    color: PLAYER_COLORS[i],
    icon: PLAYER_ICONS[i],
    money: START_MONEY,
    borrowed: 0,
  }));
}

function buildDeck(raceCount) {
  const deck = [];
  const indexes = CASES.map((_, i) => i);
  while (deck.length < raceCount) {
    deck.push(...shuffle(indexes));
  }
  return deck.slice(0, raceCount);
}

function startGame(deck) {
  state.round = 0;
  state.deck = deck;
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
  const candidates = RACE_PATTERNS.map((p, i) => ({ p, i })).filter(({ p }) => p.type === type);
  return candidates[Math.floor(Math.random() * candidates.length)].i;
}

// ---------- ラウンド進行 ----------

// ラウンドの乱数要素をすべて生成する（ホスト/ローカルのみ実行し、ゲストへ配信する）
function generateRoundSetup() {
  const item = currentCase();
  const caseIncidents = item.incidents.map((_, i) => ({ src: "case", i }));
  const genericPicks = shuffle(GENERIC_INCIDENTS.map((_, i) => i)).slice(0, 2)
    .map((i) => ({ src: "generic", i }));
  const incidents = shuffle([...caseIncidents, ...genericPicks]).slice(0, 3);
  return {
    betOrder: state.players.map((_, i) => (i + state.round) % state.players.length),
    runners: item.plans.map((plan) => {
      const patternIndex = pickPattern(plan);
      const pattern = RACE_PATTERNS[patternIndex];
      return {
        patternIndex,
        condition: randomBetween(0.86, 1.18), // 当日の学習の調子
        eventTick: pattern.event
          ? pattern.event.ticks[Math.floor(Math.random() * pattern.event.ticks.length)]
          : -1,
      };
    }),
    incidents,
  };
}

function resolveIncident(ref) {
  return ref.src === "case" ? currentCase().incidents[ref.i] : GENERIC_INCIDENTS[ref.i];
}

function applyRoundSetup(setup) {
  const item = currentCase();
  state.bets = [];
  state.betTurn = 0;
  state.running = false;
  state.bettingOpen = true;
  state.betOrder = setup.betOrder;
  state.runners = setup.runners.map((r) => ({
    progress: 0,
    pattern: RACE_PATTERNS[r.patternIndex],
    condition: r.condition,
    eventTick: r.eventTick,
  }));
  state.raceIncidents = setup.incidents.map(resolveIncident);
  state.highlights = [];
  state.incidentMessageUntil = -1;

  els.roundLabel.textContent = `${state.round + 1} / ${state.deck.length}`;
  els.clientName.textContent = item.client;
  els.clientBrief.textContent = item.brief;
  els.clientIndustry.textContent = item.industry;
  els.clientKpi.textContent = item.kpi;
  els.clientBudget.textContent = item.budget;
  els.clientAbsurdity.textContent = absurdityStars(item.absurdity);
  els.clientAbsurdity.title = `理不尽度: ${item.absurdity}`;
  els.raceMessage.textContent = "各プレイヤー、馬券をどうぞ！";
  updateRaceHud("出走前", "未確定", "まだ平和");
  els.eventLog.innerHTML = "";
  els.resultPanel.classList.add("hidden");
  els.resultPanel.innerHTML = "";
  hideRibbon();
  hideCutIn();
  renderOddsBoard(item, null);
  renderPlans(item);
  renderTrack(item);
  renderPlayerBar();
  Sound.startBgm("lobby");
  promptNextBetter();
}

function absurdityStars(level) {
  const stars = { "低": "★★☆☆☆", "中": "★★★☆☆", "高": "★★★★☆", "極": "★★★★★" };
  return stars[level] || level;
}

// オッズ掲示板: 出走前はゲート順、レース中は順位順に並べ替え（先頭は金発光）
function renderOddsBoard(item, rankedOrder) {
  const order = rankedOrder || item.plans.map((_, i) => i);
  els.oddsRows.innerHTML = order
    .map((planIdx, pos) => {
      const plan = item.plans[planIdx];
      const lead = rankedOrder && pos === 0;
      return `
        <div class="board-row${lead ? " is-lead" : ""}">
          <span class="board-rank">${rankedOrder ? pos + 1 : "·"}</span>
          <i class="board-dot" style="background:${LANE_COLORS[planIdx]}"></i>
          <span class="board-name">${plan.horse}</span>
          <span class="board-odds">${plan.odds.toFixed(1)}</span>
        </div>
      `;
    })
    .join("");
}

function startRound() {
  const setup = generateRoundSetup();
  if (state.mode === "host") {
    Net.broadcast({ t: "round", round: state.round, setup });
  }
  applyRoundSetup(setup);
}

// ---------- 馬券購入フェーズ ----------

function currentBetterIndex() {
  return state.betOrder[state.betTurn];
}

function isMyTurn() {
  if (!state.bettingOpen || state.betTurn >= state.betOrder.length) return false;
  return state.mode === "local" || currentBetterIndex() === state.myIndex;
}

let autoBetTimer = null;

function promptNextBetter() {
  if (state.betTurn >= state.betOrder.length) {
    state.bettingOpen = false;
    els.betIndicator.innerHTML = `<div class="turn-plate all-in"><strong>💥 全員の馬券が出揃いました。まもなく出走！</strong></div>`;
    els.deckPanel.classList.remove("is-turn");
    renderPlayerBar();
    updateBetAmountButtons(null);
    updateBetInteractivity();
    if (canControlFlow()) {
      setTimeout(() => beginRace(), 1200);
    }
    return;
  }

  const idx = currentBetterIndex();
  const player = state.players[idx];

  // 全クライアントで決定的に同じ結果になる（同じ所持金 → 同じ補填）
  if (player.money < BET_AMOUNTS[0]) {
    player.money += EMERGENCY_FUND;
    player.borrowed += EMERGENCY_FUND;
    addLog(`💸 ${player.name} が「来期予算の前借り」で ${EMERGENCY_FUND}pt を調達。役員会には内緒。`, player.color);
  }

  if (state.betAmount > player.money) {
    state.betAmount = [...BET_AMOUNTS].reverse().find((a) => a <= player.money) || BET_AMOUNTS[0];
  }

  let note;
  let eyebrow = "NOW BETTING";
  if (state.mode === "local") {
    note = `賭け金を選んで、プランをクリック！（持ち: ${formatPt(player.money)}pt）`;
  } else if (idx === state.myIndex) {
    eyebrow = "YOUR TURN";
    note = `🫵 あなたの番です！ 賭け金を選んでプランをクリック（持ち: ${formatPt(player.money)}pt）`;
  } else {
    note = `${escapeHtml(player.name)} さんの端末で選択中…`;
  }
  // 手番スポットライト: 馬券エリア全体を手番の色で発光させる
  els.deckPanel.classList.add("is-turn");
  els.deckPanel.style.setProperty("--turn-color", player.color);
  els.betIndicator.innerHTML = `
    <div class="turn-plate" style="--turn-color:${player.color}">
      <span class="turn-plate-eyebrow">${eyebrow}</span>
      <strong>${player.icon} ${escapeHtml(player.name)} さんの番</strong>
      <span class="turn-plate-note">${note}</span>
    </div>
  `;
  updateBetAmountButtons(isMyTurn() ? player : null);
  updateBetInteractivity();
  renderPlayerBar();

  // ホスト: 切断中プレイヤーの番になったら自動投票で代行
  if (autoBetTimer) {
    clearTimeout(autoBetTimer);
    autoBetTimer = null;
  }
  if (state.mode === "host" && idx !== 0 && state.roster[idx] && !state.roster[idx].connected) {
    autoBetTimer = setTimeout(() => {
      if (state.bettingOpen && currentBetterIndex() === idx) {
        const plan = Math.floor(Math.random() * currentCase().plans.length);
        addLog(`🤖 ${player.name} は切断中のため、100pt を自動投票します。`);
        Net.broadcast({ t: "log", text: `🤖 ${player.name} は切断中のため、100pt を自動投票します。` });
        hostApplyBet(idx, plan, 100);
      }
    }, 1500);
  }
}

function updateBetAmountButtons(player) {
  [...els.betAmounts.querySelectorAll("button")].forEach((button) => {
    const amount = Number(button.dataset.amount);
    button.classList.toggle("selected", amount === state.betAmount);
    button.disabled = !player || amount > player.money;
  });
}

function updateBetInteractivity() {
  const clickable = state.bettingOpen && !state.running && isMyTurn();
  [...els.plansGrid.querySelectorAll(".plan-card")].forEach((button) => {
    button.disabled = !clickable;
  });
}

function placeBet(planIndex) {
  if (!state.bettingOpen || state.running || !isMyTurn()) return;
  if (state.mode === "guest") {
    Net.sendToHost({ t: "bet", plan: planIndex, amount: state.betAmount });
    // ホストからのbetPlaced反映を待つ間、二重送信を防ぐ
    els.betIndicator.innerHTML = `<span class="bet-turn-note">送信中…</span>`;
    updateBetInteractivity();
    return;
  }
  const idx = currentBetterIndex();
  const amount = Math.min(state.betAmount, state.players[idx].money);
  if (state.mode === "host") {
    hostApplyBet(idx, planIndex, amount);
  } else {
    applyBet(idx, planIndex, amount);
  }
}

// ホスト専用: 賭けを確定して全員に配信
function hostApplyBet(playerIdx, planIndex, amount) {
  const clamped = Math.min(amount, state.players[playerIdx].money);
  if (clamped <= 0) return;
  Net.broadcast({ t: "betPlaced", player: playerIdx, plan: planIndex, amount: clamped });
  applyBet(playerIdx, planIndex, clamped);
}

function applyBet(playerIdx, planIndex, amount) {
  const player = state.players[playerIdx];
  const item = currentCase();
  const plan = item.plans[planIndex];
  player.money -= amount;
  state.bets.push({ player: playerIdx, plan: planIndex, amount });
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
  els.playerBar.classList.toggle("betting", activeIdx !== -1);
  els.playerBar.innerHTML = state.players
    .map((player, i) => {
      const active = i === activeIdx ? " active" : "";
      const you = isOnline() && i === state.myIndex ? `<small class="you-tag">あなた</small>` : "";
      return `
        <div class="player-badge${active}" style="--player-color:${player.color}">
          <span class="player-icon">${player.icon}</span>
          <span class="player-name">${escapeHtml(player.name)}${you}</span>
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
  updateBetInteractivity();
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

// ---------- レースシミュレーション（DOMなし・純関数） ----------
// レース全体を先に計算して「台本」を作る。オンライン時はホストだけが実行し
// ゲストへ配信するため、全端末でまったく同じレースが再生される。

function simulateRace(item) {
  const runners = state.runners.map((r) => ({
    progress: 0,
    pattern: r.pattern,
    condition: r.condition,
    eventTick: r.eventTick,
  }));
  const ticks = [];
  const incidents = []; // { tick, slot }
  const logs = []; // { tick, text }
  const highlights = [];
  let lastLeader = -1;

  for (let tick = 1; tick <= TOTAL_TICKS; tick += 1) {
    // 進行
    runners.forEach((runner, index) => {
      const curve = runner.pattern.curve(tick);
      const gain = (weightedBase(item.plans[index]) / TOTAL_TICKS) * curve * runner.condition * randomBetween(0.88, 1.14);
      runner.progress += gain;
    });

    // 展開パターンの持ちネタ
    runners.forEach((runner, index) => {
      if (runner.eventTick !== tick) return;
      runner.eventTick = -1;
      const event = runner.pattern.event;
      const delta = randomBetween(event.delta[0], event.delta[1]);
      runner.progress = Math.max(2, runner.progress + delta);
      const text = event.text(item.plans[index].horse);
      highlights.push({ tick, icon: runner.pattern.icon, text });
      logs.push({ tick, text: `${runner.pattern.icon} ${text}` });
    });

    // 理不尽ハプニング
    const slot = INCIDENT_TICKS.indexOf(tick);
    if (slot !== -1) {
      const incident = state.raceIncidents[slot];
      let worstIndex = 0;
      let worstDelta = Infinity;
      let bestIndex = 0;
      let bestDelta = -Infinity;
      runners.forEach((runner, index) => {
        const effects = incident.effect;
        const plan = item.plans[index];
        const profile =
          (effects.fit || 0) * (plan.stats.fit / 100) +
          (effects.stability || 0) * (plan.stats.stability / 100) +
          (effects.burst || 0) * (plan.stats.burst / 100) +
          (effects.client || 0) * (plan.stats.client / 100);
        let delta = profile * 0.55 + randomBetween(-2.4, 2.4);
        const factor = runner.pattern.incidentFactor ?? 1;
        if (factor < 0) {
          // 逆境の鬼: マイナスをプラスに変える。プラスの追い風は半減。
          delta = delta < 0 ? delta * factor : delta * 0.5;
        } else {
          delta *= factor;
        }
        runner.progress = Math.max(2, runner.progress + delta);
        if (delta < worstDelta) {
          worstDelta = delta;
          worstIndex = index;
        }
        if (delta > bestDelta) {
          bestDelta = delta;
          bestIndex = index;
        }
      });
      // 追い風/直撃の閾値は控えめ(0.8)。同じ閾値でハイライトも生成するので表示と辻褄が合う。
      const IMPACT_THRESHOLD = 0.8;
      incidents.push({
        tick,
        slot,
        worst: worstDelta < -IMPACT_THRESHOLD ? worstIndex : -1,
        worstDelta: Math.round(worstDelta * 10) / 10,
        best: bestDelta > IMPACT_THRESHOLD ? bestIndex : -1,
        bestDelta: Math.round(bestDelta * 10) / 10,
      });
      let impact = "";
      if (worstDelta < -IMPACT_THRESHOLD) {
        impact = ` 直撃したのは ${item.plans[worstIndex].horse}。`;
      } else if (bestDelta > IMPACT_THRESHOLD) {
        impact = ` 追い風を受けたのは ${item.plans[bestIndex].horse}。`;
      }
      highlights.push({
        tick,
        icon: "⚡",
        text: `${incident.type}「${incident.title}」— ${incident.body}${impact}`,
      });
    }

    // 先頭交代
    const leader = runners
      .map((runner, index) => ({ progress: runner.progress, index }))
      .sort((a, b) => b.progress - a.progress)[0].index;
    if (lastLeader === -1) {
      highlights.push({
        tick,
        icon: "🏁",
        text: `${item.plans[leader].horse}（${runners[leader].pattern.label}）が飛び出して先頭に。`,
      });
    } else if (leader !== lastLeader) {
      highlights.push({
        tick,
        icon: "🔄",
        text: `${item.plans[leader].horse}（${runners[leader].pattern.label}）が ${item.plans[lastLeader].horse} をかわして先頭に立つ！`,
      });
      logs.push({ tick, text: `🔄 第${tick}コーナー: ${item.plans[leader].horse} が先頭を奪う！` });
    }
    lastLeader = leader;

    ticks.push(runners.map((r) => Math.round(r.progress * 100) / 100));
  }

  // 決着
  const result = runners
    .map((runner, index) => {
      const plan = item.plans[index];
      const clientAdjustment = plan.stats.client * randomBetween(-0.02, 0.05);
      const finalScore = Math.round((runner.progress + clientAdjustment + randomBetween(-2.5, 3.5)) * 100) / 100;
      return { index, finalScore };
    })
    .sort((a, b) => b.finalScore - a.finalScore);

  const winnerPattern = runners[result[0].index].pattern;
  const winnerHorse = item.plans[result[0].index].horse;
  if (winnerPattern.type === "front" && result[0].index === lastLeader) {
    highlights.push({
      tick: TOTAL_TICKS,
      icon: "🏆",
      text: `${winnerHorse} がそのまま押し切って1着！ 見事な逃げ切り（${winnerPattern.label}）。`,
    });
  } else if (winnerPattern.type === "closer") {
    highlights.push({
      tick: TOTAL_TICKS,
      icon: "🏆",
      text: `最後の直線、${winnerHorse} が一気に突き抜けて1着！ 鮮やかな${winnerPattern.label}決着。`,
    });
  } else if (winnerPattern.type === "erratic") {
    highlights.push({
      tick: TOTAL_TICKS,
      icon: "🏆",
      text: `波乱を呼んだ ${winnerHorse}（${winnerPattern.label}）がまさかの1着！ 誰がこの展開を読めただろうか。`,
    });
  } else {
    highlights.push({
      tick: TOTAL_TICKS,
      icon: "🏆",
      text: `${winnerHorse}（${winnerPattern.label}）が混戦を制して1着。着差はわずか、胃へのダメージは甚大。`,
    });
  }

  return { ticks, incidents, logs, highlights, result };
}

// ---------- レース再生 ----------

function beginRace() {
  const item = currentCase();
  const script = simulateRace(item);
  if (state.mode === "host") {
    Net.broadcast({ t: "race", script });
  }
  playbackRace(item, script);
}

async function playbackRace(item, script) {
  state.running = true;
  state.highlights = script.highlights;
  els.raceMessage.textContent = "ゲートイン完了。全員の胃が痛くなり始めた。";
  updateRaceHud("ゲートイン", "未確定", "まだ平和");
  updateBetInteractivity();
  renderLaneChips();
  Sound.se.gate();
  await sleep(1400);
  Sound.startBgm("race");
  [...els.track.querySelectorAll(".horse")].forEach((horse) => horse.classList.add("running"));

  for (let tick = 1; tick <= TOTAL_TICKS; tick += 1) {
    await sleep(TICK_MS);
    updateRaceHud(`第${tick}コーナー / ${TOTAL_TICKS}`, null, null);
    script.ticks[tick - 1].forEach((progress, index) => {
      state.runners[index].progress = progress;
    });

    script.logs.filter((l) => l.tick === tick).forEach((l) => addLog(l.text));

    const incidentEntry = script.incidents.find((e) => e.tick === tick);
    if (incidentEntry) {
      const incident = state.raceIncidents[incidentEntry.slot];
      Sound.se.alarm();
      updateRaceHud(null, null, incident.title);
      els.raceMessage.textContent = `⚡ ${incident.type}: ${incident.title}`;
      state.incidentMessageUntil = tick + 1;
      addLog(`⚡ ${incident.type}: ${incident.title}。${incident.body}`);
      // 追い風/直撃の馬を割り出してバナー・ログ・カットインに載せる
      const impacts = [];
      if (incidentEntry.worst >= 0) {
        impacts.push({
          kind: "worst",
          horse: item.plans[incidentEntry.worst].horse,
          delta: incidentEntry.worstDelta,
        });
      }
      if (incidentEntry.best >= 0) {
        impacts.push({
          kind: "best",
          horse: item.plans[incidentEntry.best].horse,
          delta: incidentEntry.bestDelta,
        });
      }
      const impactHtml = impacts
        .map((imp) => {
          const cls = imp.kind === "worst" ? "impact-neg" : "impact-pos";
          const sign = imp.delta >= 0 ? "+" : "";
          const label = imp.kind === "worst" ? "直撃" : "追い風";
          return `<span class="${cls}">${label} ${escapeHtml(imp.horse)} <b>${sign}${imp.delta}</b></span>`;
        })
        .join("");
      const impactText = impacts
        .map((imp) => {
          const sign = imp.delta >= 0 ? "+" : "";
          const label = imp.kind === "worst" ? "直撃" : "追い風";
          return `${label} ${imp.horse}(${sign}${imp.delta})`;
        })
        .join(" / ");
      // 事件演出: 赤バナー割り込み + 画面微振動 + 直撃馬の失速アニメ
      els.incidentBanner.innerHTML =
        `<span class="incident-headline">⚡ ${escapeHtml(incident.type)}: ${escapeHtml(incident.title)}</span>` +
        (impactHtml ? `<span class="incident-impacts">${impactHtml}</span>` : "");
      els.incidentBanner.classList.add("show");
      els.raceVisual.classList.add("shake");
      setTimeout(() => els.raceVisual.classList.remove("shake"), 500);
      setTimeout(() => els.incidentBanner.classList.remove("show"), 3200);
      if (impactText) addLog(`　└ ${impactText}`);
      if (incidentEntry.worst >= 0) {
        const struck = document.getElementById(`horse-${incidentEntry.worst}`);
        struck?.classList.add("stumble");
        setTimeout(() => struck?.classList.remove("stumble"), 1600);
      }
      if (incidentEntry.best >= 0) {
        const boosted = document.getElementById(`horse-${incidentEntry.best}`);
        boosted?.classList.add("tailwind");
        setTimeout(() => boosted?.classList.remove("tailwind"), 1600);
      }
      if (state.cutInEnabled) {
        renderRacePositions(item, tick);
        showCutIn(incident, impacts);
        await waitForCutInContinue();
        hideCutIn();
      }
    }

    renderRacePositions(item, tick);
  }

  await sleep(900);
  settleRace(item, script.result);
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

  // オッズ掲示板を順位順に並べ替え + 先頭レーンを金発光
  renderOddsBoard(item, ranked.map((r) => r.index));
  [...els.track.children].forEach((lane, laneIdx) => {
    lane.classList.toggle("is-lead", laneIdx === ranked[0].index);
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

function settleRace(item, result) {
  result.forEach((entry) => {
    state.runners[entry.index].progress = entry.finalScore;
  });

  const finalRanks = result.map((entry) => entry.index);
  const winner = result[0];
  const second = result[1];
  const winnerPlan = item.plans[winner.index];

  [...els.track.querySelectorAll(".horse")].forEach((horse) => horse.classList.remove("running"));
  renderRacePositions(item, TOTAL_TICKS, finalRanks);
  els.raceVisual.classList.add("photo-finish");
  setTimeout(() => els.raceVisual.classList.remove("photo-finish"), 1100);
  Sound.stopBgm();
  Sound.se.goal();

  updateRaceHud("確定", `${winnerPlan.horse} / KPI ${Math.round(winner.finalScore * 1.9)}%`, "レース確定");

  // 払い戻し: 1着はオッズ×賭け金、2着は賭け金返還
  // state.bets と result は全端末で同一のため、計算結果も全端末で一致する
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

  // ゴール後: 決着→ハイライト→払戻を1枚のリボンで連続再生
  setTimeout(() => {
    showRaceRibbon(item, result, payouts, anyoneWon);
  }, 1200);

  // 再生中に届いていた進行メッセージを処理（ゲスト）
  if (state.queuedMsg) {
    const msg = state.queuedMsg;
    state.queuedMsg = null;
    setTimeout(() => handleHostMessage(msg), 600);
  }
}

function buildRankingHtml(item, result) {
  return `
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
  `;
}

function buildPayoutTableHtml(item, payouts) {
  return `
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
  `;
}

function renderResultPanel(item, result, payouts) {
  const isLastRound = state.round === state.deck.length - 1;
  const controlHtml = canControlFlow()
    ? `<button class="next-button" type="button" id="nextRoundButton">${isLastRound ? "🏆 最終結果を見る" : "▶ 次の案件へ"}</button>`
    : `<p class="guest-wait">⏳ ホストが${isLastRound ? "最終結果" : "次の案件"}へ進めるのを待っています…</p>`;
  els.resultPanel.innerHTML = `
    <h3>🏁 決着: ${item.plans[result[0].index].name}</h3>
    ${buildRankingHtml(item, result)}
    ${buildPayoutTableHtml(item, payouts)}
    <div class="result-buttons">
      <button class="sub-button" type="button" id="replayHighlights">📜 ハイライトを見る</button>
      ${controlHtml}
    </div>
  `;
  els.resultPanel.classList.remove("hidden");
  els.resultPanel.querySelector("#nextRoundButton")?.addEventListener("click", () => {
    Sound.se.ui();
    nextRound();
  });
  els.resultPanel.querySelector("#replayHighlights").addEventListener("click", () => {
    Sound.se.ui();
    showHighlightRibbon(item);
  });
}

function nextRound() {
  state.round += 1;
  if (state.round >= state.deck.length) {
    if (state.mode === "host") Net.broadcast({ t: "final" });
    showFinal();
  } else {
    startRound();
  }
}

// ---------- カットイン ----------

let cutInTimer = null;

function showCutIn(incident, impacts = []) {
  els.cutInType.textContent = incident.type;
  els.cutInTitle.textContent = incident.title;
  els.cutInBody.innerHTML =
    escapeHtml(incident.body) +
    (impacts.length
      ? `<span class="cutin-impacts">${impacts
          .map((imp) => {
            const cls = imp.kind === "worst" ? "impact-neg" : "impact-pos";
            const sign = imp.delta >= 0 ? "+" : "";
            const label = imp.kind === "worst" ? "直撃" : "追い風";
            return `<span class="${cls}">${label} ${escapeHtml(imp.horse)} <b>${sign}${imp.delta}</b></span>`;
          })
          .join("")}</span>`
      : "");
  els.cutIn.classList.add("show");
  els.cutIn.setAttribute("aria-hidden", "false");
}

function hideCutIn() {
  els.cutIn.classList.remove("show");
  els.cutIn.setAttribute("aria-hidden", "true");
}

function waitForCutInContinue() {
  return new Promise((resolve) => {
    const done = () => {
      if (cutInTimer) {
        clearTimeout(cutInTimer);
        cutInTimer = null;
      }
      els.cutInContinue.disabled = true;
      els.cutInContinue.onclick = null;
      resolve();
    };
    els.cutInContinue.disabled = false;
    els.cutInContinue.focus();
    els.cutInContinue.onclick = () => {
      Sound.se.ui();
      done();
    };
    cutInTimer = setTimeout(done, 5000); // 放置しても止まらないよう自動で進む
  });
}

// ---------- リボン（ゴール→ハイライト→払戻を1枚で連続再生） ----------

const ribbon = { steps: [], index: 0 };

function buildHighlightStepHtml(item) {
  const chips = item.plans
    .map((plan, index) => {
      const pattern = state.runners[index].pattern;
      return `<span class="style-chip" style="--lane-color:${LANE_COLORS[index]}">${pattern.icon} ${plan.horse}【${pattern.label}】</span>`;
    })
    .join("");
  const list = state.highlights
    .map((h) => `
      <li>
        <span class="hl-tick">${h.tick === TOTAL_TICKS ? "GOAL" : `第${h.tick}角`}</span>
        <span class="hl-icon">${h.icon}</span>
        <span class="hl-text">${escapeHtml(h.text)}</span>
      </li>
    `)
    .join("");
  return `
    <p class="board-label">RACE HIGHLIGHTS</p>
    <strong class="ribbon-title">📜 実況ハイライト</strong>
    <div class="highlight-styles">${chips}</div>
    <ul class="highlight-list">${list}</ul>
  `;
}

function showRaceRibbon(item, result, payouts, anyoneWon) {
  const winner = result[0];
  const winnerPlan = item.plans[winner.index];
  const isLastRound = state.round === state.deck.length - 1;
  const winnerOdds = winnerPlan.odds;

  ribbon.steps = [
    {
      title: "決着",
      html: `
        <p class="board-label">🏆 WINNER</p>
        <strong class="ribbon-winner">${winnerPlan.horse}</strong>
        <span class="ribbon-sub">${winnerPlan.name} が KPI ${Math.round(winner.finalScore * 1.9)}% で優勝。</span>
        ${buildRankingHtml(item, result)}
      `,
      onEnter: () => setTimeout(() => (anyoneWon ? Sound.se.win() : Sound.se.lose()), 300),
    },
    {
      title: "ハイライト",
      html: buildHighlightStepHtml(item),
    },
    {
      title: "払い戻し",
      html: `
        <p class="board-label">PAYOUT</p>
        <strong class="ribbon-title">💰 払い戻し</strong>
        ${buildPayoutTableHtml(item, payouts)}
      `,
      onEnter: () => {
        if (anyoneWon) {
          // 大穴バースト: 的中オッズが高いほど紙吹雪と音を強く
          burstGold(Math.min(320, Math.round(winnerOdds * 22) + 40));
          if (winnerOdds >= 8) setTimeout(() => Sound.se.win(), 250);
        }
      },
      primaryLabel: canControlFlow() ? (isLastRound ? "🏆 最終結果を見る" : "▶ 次の案件へ") : "閉じる",
      primaryAction: canControlFlow() ? nextRound : null,
      showSecondary: canControlFlow(),
    },
  ];
  ribbon.index = 0;
  renderRibbonStep();
  els.ribbonModal.classList.add("show");
  els.ribbonModal.setAttribute("aria-hidden", "false");
  els.ribbonNext.focus();
}

function showHighlightRibbon(item) {
  ribbon.steps = [
    {
      title: "ハイライト",
      html: buildHighlightStepHtml(item),
      primaryLabel: "閉じる",
      primaryAction: null,
      showSecondary: false,
    },
  ];
  ribbon.index = 0;
  renderRibbonStep();
  els.ribbonModal.classList.add("show");
  els.ribbonModal.setAttribute("aria-hidden", "false");
  els.ribbonNext.focus();
}

function renderRibbonStep() {
  const step = ribbon.steps[ribbon.index];
  els.ribbonDots.innerHTML = ribbon.steps.length > 1
    ? ribbon.steps
        .map((s, i) => {
          const cls = i === ribbon.index ? "active" : i < ribbon.index ? "done" : "";
          return `<span class="${cls}"><i></i>${s.title}</span>`;
        })
        .join(`<b class="dot-line"></b>`)
    : "";
  els.ribbonBody.innerHTML = step.html;
  els.ribbonBody.scrollTop = 0;
  const isLast = ribbon.index === ribbon.steps.length - 1;
  els.ribbonNext.textContent = isLast ? (step.primaryLabel || "閉じる") : "続ける ▶";
  els.ribbonSecondary.style.display = isLast && step.showSecondary ? "" : "none";
  if (step.onEnter) step.onEnter();
}

function hideRibbon() {
  els.ribbonModal.classList.remove("show");
  els.ribbonModal.setAttribute("aria-hidden", "true");
}

// ---------- 大穴バースト（金の紙吹雪） ----------

let burstActive = false;

function burstGold(count) {
  const canvas = els.burstCanvas;
  if (burstActive) return;
  burstActive = true;
  const ctx2d = canvas.getContext("2d");
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  canvas.classList.add("show");
  const colors = ["#f1c453", "#ffd23f", "#fff2cf", "#b8862c"];
  const parts = Array.from({ length: count }, () => {
    const angle = Math.random() * Math.PI * 2;
    const speed = 4 + Math.random() * 9;
    return {
      x: canvas.width / 2,
      y: canvas.height * 0.35,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 4,
      size: 3 + Math.random() * 5,
      color: colors[Math.floor(Math.random() * colors.length)],
      life: 1,
    };
  });
  let frames = 0;
  const finish = () => {
    ctx2d.globalAlpha = 1;
    ctx2d.clearRect(0, 0, canvas.width, canvas.height);
    canvas.classList.remove("show");
    burstActive = false;
  };
  const safety = setTimeout(finish, 4000); // バックグラウンドタブ等でrAFが止まっても必ず終了
  (function loop() {
    if (!burstActive) return;
    ctx2d.clearRect(0, 0, canvas.width, canvas.height);
    parts.forEach((p) => {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.16;
      p.life -= 0.009;
      ctx2d.globalAlpha = Math.max(0, p.life);
      ctx2d.fillStyle = p.color;
      ctx2d.fillRect(p.x, p.y, p.size, p.size * 0.7);
    });
    frames += 1;
    if (frames < 120) {
      requestAnimationFrame(loop);
    } else {
      clearTimeout(safety);
      finish();
    }
  })();
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
      const rankLabel = `${rank + 1}${["st", "nd", "rd"][rank] || "th"}`;
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

  // オンライン時: 再戦はホストのみ操作可能
  els.rematchButton.style.display = canControlFlow() ? "" : "none";
  els.onlineFinalNote.classList.toggle("hidden", canControlFlow());
  els.changeMembersButton.textContent = isOnline() ? "🚪 退出してタイトルへ" : "👥 メンバーを変える";

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
  const deck = buildDeck(state.raceCount);
  if (state.mode === "host") {
    Net.broadcast({ t: "rematch", deck });
  }
  startGame(deck);
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

// ============================================================
// オンライン対戦（ルームID方式）
// ============================================================

function renderLobby() {
  els.lobbyMembers.innerHTML = state.roster
    .map((member, i) => {
      const host = i === 0 ? `<small class="host-tag">ホスト</small>` : "";
      const you = i === state.myIndex ? `<small class="you-tag">あなた</small>` : "";
      const off = member.connected ? "" : "（切断）";
      return `
        <div class="player-badge" style="--player-color:${PLAYER_COLORS[i]}">
          <span class="player-icon">${PLAYER_ICONS[i]}</span>
          <span class="player-name">${escapeHtml(member.name)}${off}${host}${you}</span>
        </div>
      `;
    })
    .join("");
  if (state.mode === "host") {
    els.onlineStartButton.disabled = state.roster.length < 1;
  }
}

function showOnlineError(message) {
  els.onlineError.textContent = message || "";
}

function enterLobby(code) {
  els.onlineEntry.classList.add("hidden");
  els.onlineLobby.classList.remove("hidden");
  els.roomCodeDisplay.textContent = code;
  els.hostSettings.classList.toggle("hidden", state.mode !== "host");
  els.guestWaitNote.classList.toggle("hidden", state.mode !== "guest");
  renderLobby();
}

function leaveRoom() {
  Net.destroy();
  stopConfetti();
  state.mode = "local";
  state.myIndex = 0;
  state.roster = [];
  state.queuedMsg = null;
  els.onlineEntry.classList.remove("hidden");
  els.onlineLobby.classList.add("hidden");
  showOnlineError("");
  showScreen("screen-title");
}

function myName() {
  return els.onlineName.value.trim() || (state.mode === "host" ? "ホスト" : "ゲスト");
}

// --- ホスト側 ---

const guestConns = new Map(); // conn -> playerIndex

async function hostCreateRoom() {
  showOnlineError("");
  els.createRoomButton.disabled = true;
  els.createRoomButton.textContent = "作成中…";
  try {
    const code = await Net.createRoom();
    state.mode = "host";
    state.myIndex = 0;
    state.roster = [{ name: myName(), connected: true }];
    enterLobby(code);
  } catch (err) {
    showOnlineError(`⚠ ${err.message}`);
  } finally {
    els.createRoomButton.disabled = false;
    els.createRoomButton.textContent = "🏠 部屋を作る";
  }
}

function hostGameStarted() {
  return state.deck.length > 0;
}

Net.handlers.onGuestOpen = (conn) => {
  // 名前は join メッセージで届く。ここでは接続のみ受け付ける。
  setTimeout(() => {
    // 5秒以内にjoinが来なければ無視（不正接続対策）
    if (!guestConns.has(conn)) {
      try { conn.close(); } catch (e) { /* 無視 */ }
    }
  }, 5000);
};

Net.handlers.onGuestData = (conn, msg) => {
  if (!msg || typeof msg !== "object") return;
  if (msg.t === "join") {
    if (hostGameStarted()) {
      Net.sendTo(conn, { t: "reject", reason: "ゲームが既に始まっています。" });
      return;
    }
    if (state.roster.length >= MAX_PLAYERS) {
      Net.sendTo(conn, { t: "reject", reason: `この部屋は満員です（最大${MAX_PLAYERS}人）。` });
      return;
    }
    const index = state.roster.length;
    const name = String(msg.name || "").slice(0, 8) || `ゲスト${index}`;
    state.roster.push({ name, connected: true });
    guestConns.set(conn, index);
    Net.sendTo(conn, { t: "welcome", yourIndex: index, roster: state.roster.map((r) => r.name) });
    Net.broadcast({ t: "roster", roster: state.roster.map((r) => ({ name: r.name, connected: r.connected })) });
    renderLobby();
    Sound.se.coin();
    return;
  }
  if (msg.t === "bet") {
    const playerIdx = guestConns.get(conn);
    if (playerIdx === undefined) return;
    if (!state.bettingOpen || currentBetterIndex() !== playerIdx) return; // 手番外の投票は無視
    const plan = Number(msg.plan);
    const amount = Number(msg.amount);
    if (!Number.isInteger(plan) || plan < 0 || plan >= currentCase().plans.length) return;
    if (!BET_AMOUNTS.includes(amount)) return;
    hostApplyBet(playerIdx, plan, amount);
  }
};

Net.handlers.onGuestLeave = (conn) => {
  const playerIdx = guestConns.get(conn);
  if (playerIdx === undefined) return;
  guestConns.delete(conn);
  if (!hostGameStarted()) {
    // ロビー中は名簿から削除して詰める
    state.roster.splice(playerIdx, 1);
    // インデックスの振り直し
    const entries = [...guestConns.entries()].sort((a, b) => a[1] - b[1]);
    guestConns.clear();
    entries.forEach(([c], i) => guestConns.set(c, i + 1));
    Net.broadcast({ t: "roster", roster: state.roster.map((r) => ({ name: r.name, connected: r.connected })) });
    guestConns.forEach((idx, c) => Net.sendTo(c, { t: "reindex", yourIndex: idx }));
    renderLobby();
    return;
  }
  // ゲーム中は切断マークを付けて自動投票で継続
  state.roster[playerIdx].connected = false;
  addLog(`📡 ${state.players[playerIdx]?.name || "プレイヤー"} との接続が切れました。以降は自動投票で継続します。`);
  Net.broadcast({ t: "log", text: `📡 ${state.players[playerIdx]?.name || "プレイヤー"} との接続が切れました。` });
  if (state.bettingOpen && currentBetterIndex() === playerIdx) {
    promptNextBetter(); // 自動投票タイマーを起動し直す
  }
};

function hostStartGame() {
  if (state.roster.length < 1) return;
  const names = state.roster.map((r) => r.name);
  state.players = buildPlayers(names);
  const deck = buildDeck(state.raceCount);
  Net.broadcast({
    t: "start",
    deck,
    raceCount: state.raceCount,
    cutInEnabled: state.cutInEnabled,
    roster: names,
  });
  startGame(deck);
}

// --- ゲスト側 ---

async function guestJoinRoom() {
  const code = els.roomCodeInput.value.trim().toUpperCase();
  if (code.length !== 4) {
    showOnlineError("⚠ ルームIDは4文字です。");
    return;
  }
  showOnlineError("");
  els.joinRoomButton.disabled = true;
  els.joinRoomButton.textContent = "接続中…";
  try {
    await Net.joinRoom(code);
    state.mode = "guest";
    Net.sendToHost({ t: "join", name: myName() });
    enterLobby(code);
  } catch (err) {
    showOnlineError(`⚠ ${err.message}`);
  } finally {
    els.joinRoomButton.disabled = false;
    els.joinRoomButton.textContent = "🚪 入室する";
  }
}

function handleHostMessage(msg) {
  if (!msg || typeof msg !== "object") return;
  // レース再生中に進行系メッセージが届いたら、再生完了後に処理する
  if (state.running && ["round", "final", "rematch"].includes(msg.t)) {
    state.queuedMsg = msg;
    return;
  }
  switch (msg.t) {
    case "welcome":
      state.myIndex = msg.yourIndex;
      state.roster = msg.roster.map((name) => ({ name, connected: true }));
      renderLobby();
      Sound.se.coin();
      break;
    case "reindex":
      state.myIndex = msg.yourIndex;
      renderLobby();
      break;
    case "roster":
      state.roster = msg.roster.map((r) => ({ name: r.name, connected: r.connected }));
      renderLobby();
      break;
    case "reject":
      Net.destroy();
      state.mode = "local";
      els.onlineEntry.classList.remove("hidden");
      els.onlineLobby.classList.add("hidden");
      showOnlineError(`⚠ ${msg.reason}`);
      break;
    case "start":
      state.raceCount = msg.raceCount;
      state.cutInEnabled = msg.cutInEnabled;
      state.players = buildPlayers(msg.roster);
      state.round = 0;
      state.deck = msg.deck;
      showScreen("screen-game");
      break;
    case "round":
      state.round = msg.round;
      applyRoundSetup(msg.setup);
      break;
    case "betPlaced":
      applyBet(msg.player, msg.plan, msg.amount);
      break;
    case "race":
      playbackRace(currentCase(), msg.script);
      break;
    case "final":
      showFinal();
      break;
    case "rematch":
      stopConfetti();
      state.players.forEach((player) => {
        player.money = START_MONEY;
        player.borrowed = 0;
      });
      state.round = 0;
      state.deck = msg.deck;
      showScreen("screen-game");
      break;
    case "log":
      addLog(msg.text);
      break;
    default:
      break;
  }
}

Net.handlers.onHostData = handleHostMessage;

Net.handlers.onHostLost = () => {
  // ホスト消失: カットインの器を借りて通知し、タイトルへ戻す
  els.cutInType.textContent = "通信エラー";
  els.cutInTitle.textContent = "ホストとの接続が切れました";
  els.cutInBody.textContent = "レースは中止です。広告運用と同じで、インフラには逆らえません。";
  els.cutIn.classList.add("show");
  els.cutIn.setAttribute("aria-hidden", "false");
  els.cutInContinue.disabled = false;
  els.cutInContinue.onclick = () => {
    els.cutInContinue.onclick = null;
    hideCutIn();
    leaveRoom();
  };
};

// ---------- イベント配線 ----------

function updateMuteButton() {
  els.muteButton.textContent = Sound.isMuted() ? "🔇" : "🔊";
}

function wireToggleGroup(container, dataKey, apply) {
  container.addEventListener("click", (event) => {
    const button = event.target.closest(`button[data-${dataKey}]`);
    if (!button || button.disabled) return;
    Sound.se.ui();
    apply(button.dataset[dataKey === "cutin" ? "cutin" : dataKey]);
    [...container.querySelectorAll("button")].forEach((b) => {
      b.classList.toggle("selected", b === button);
    });
  });
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
  state.mode = "local";
  renderNameInputs();
  showScreen("screen-setup");
});

els.titleOnline.addEventListener("click", () => {
  Sound.ensure();
  Sound.se.ui();
  Sound.startBgm("lobby");
  showScreen("screen-online");
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

wireToggleGroup(els.cutInButtons, "cutin", (v) => {
  state.cutInEnabled = v === "on";
});
wireToggleGroup(els.raceCountButtons, "races", (v) => {
  state.raceCount = Number(v);
});
wireToggleGroup(els.onlineCutInButtons, "cutin", (v) => {
  state.cutInEnabled = v === "on";
});
wireToggleGroup(els.onlineRaceCountButtons, "races", (v) => {
  state.raceCount = Number(v);
});

els.setupStart.addEventListener("click", () => {
  Sound.se.coin();
  state.mode = "local";
  const inputs = [...els.nameInputs.querySelectorAll("input")];
  state.players = buildPlayers(inputs.map((input) => input.value.trim()));
  startGame(buildDeck(state.raceCount));
});

els.setupBack.addEventListener("click", () => {
  Sound.se.ui();
  showScreen("screen-title");
});

els.createRoomButton.addEventListener("click", () => {
  Sound.se.ui();
  hostCreateRoom();
});

els.joinRoomButton.addEventListener("click", () => {
  Sound.se.ui();
  guestJoinRoom();
});

els.roomCodeInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") guestJoinRoom();
});

els.copyRoomCode.addEventListener("click", async () => {
  Sound.se.ui();
  try {
    await navigator.clipboard.writeText(els.roomCodeDisplay.textContent);
    els.copyRoomCode.textContent = "✅ コピーしました";
    setTimeout(() => {
      els.copyRoomCode.textContent = "📋 コピー";
    }, 1500);
  } catch (e) {
    /* クリップボード非対応環境は無視 */
  }
});

els.onlineStartButton.addEventListener("click", () => {
  Sound.se.coin();
  hostStartGame();
});

els.leaveRoomButton.addEventListener("click", () => {
  Sound.se.ui();
  leaveRoom();
});

els.onlineBack.addEventListener("click", () => {
  Sound.se.ui();
  leaveRoom();
});

els.betAmounts.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-amount]");
  if (!button || button.disabled) return;
  Sound.se.ui();
  state.betAmount = Number(button.dataset.amount);
  const player = isMyTurn() ? state.players[currentBetterIndex()] : null;
  updateBetAmountButtons(player);
});

els.ribbonNext.addEventListener("click", () => {
  Sound.se.ui();
  const isLast = ribbon.index === ribbon.steps.length - 1;
  if (!isLast) {
    ribbon.index += 1;
    renderRibbonStep();
    return;
  }
  const step = ribbon.steps[ribbon.index];
  hideRibbon();
  if (step.primaryAction) step.primaryAction();
});

els.ribbonSecondary.addEventListener("click", () => {
  Sound.se.ui();
  hideRibbon();
});

els.rematchButton.addEventListener("click", () => {
  Sound.se.ui();
  rematch();
});

els.changeMembersButton.addEventListener("click", () => {
  Sound.se.ui();
  if (isOnline()) {
    leaveRoom();
    return;
  }
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

window.addEventListener("beforeunload", () => {
  Net.destroy();
});

// ---------- 初期化 ----------

updateMuteButton();
renderNameInputs();
showScreen("screen-title");
