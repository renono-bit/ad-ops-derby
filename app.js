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
const TOTAL_TICKS = 12;
const INCIDENT_TICKS = [3, 6, 9];

const state = {
  players: [], // { name, color, icon, money, borrowed }
  playerCount: 2,
  round: 0,
  bets: [], // { player, plan, amount }
  betOrder: [],
  betTurn: 0,
  betAmount: 100,
  bettingOpen: false,
  running: false,
  scores: [],
  raceIncidents: [],
  confettiRaf: null,
};

const els = {};
[
  "screen-title", "screen-setup", "screen-game", "screen-final",
  "titleStart", "countButtons", "nameInputs", "setupStart",
  "roundLabel", "playerBar",
  "clientName", "clientBrief", "clientIndustry", "clientKpi", "clientBudget", "clientAbsurdity",
  "raceVisual", "raceMessage", "racePhase", "raceLeader", "raceIncident",
  "track", "betIndicator", "betAmounts", "plansGrid",
  "eventLog", "resultPanel",
  "cutIn", "cutInType", "cutInTitle", "cutInBody", "cutInContinue",
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

// ---------- ラウンド進行 ----------

function startRound() {
  const item = CASES[state.round];
  state.bets = [];
  state.betTurn = 0;
  state.running = false;
  state.bettingOpen = true;
  state.betOrder = state.players.map((_, i) => (i + state.round) % state.players.length);
  state.scores = item.plans.map((plan) => ({
    score: weightedBase(plan) + randomBetween(-4, 4),
  }));
  state.raceIncidents = shuffle([...item.incidents, ...shuffle(GENERIC_INCIDENTS).slice(0, 2)]).slice(0, 3);

  els.roundLabel.textContent = `${state.round + 1} / ${CASES.length}`;
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
  const item = CASES[state.round];
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
  const item = CASES[state.round];
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
  const item = CASES[state.round];
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
    await sleep(820);
    Sound.se.tick();
    updateRaceHud(`第${tick}コーナー / ${TOTAL_TICKS}`, null, null);
    advanceScores(item, tick);
    renderRacePositions(item);

    const incidentSlot = INCIDENT_TICKS.indexOf(tick);
    if (incidentSlot !== -1) {
      await playIncident(item, state.raceIncidents[incidentSlot]);
    }
  }

  await sleep(650);
  finishRace(item);
}

function advanceScores(item, tick) {
  item.plans.forEach((plan, index) => {
    const { fit, stability, burst } = plan.stats;
    const pace = fit * 0.07 + stability * 0.045 + randomBetween(-2.8, 3.2);
    const lateBurst = tick > 7 ? burst * 0.045 + randomBetween(-1.5, 4.5) : 0;
    state.scores[index].score = clamp(state.scores[index].score + pace + lateBurst, 15, 185);
  });
}

async function playIncident(item, incident) {
  Sound.se.alarm();
  showCutIn(incident);
  addLog(`⚡ ${incident.type}: ${incident.title}。${incident.body}`);
  updateRaceHud("審議中", null, incident.title);
  applyIncident(item, incident);
  renderRacePositions(item);
  await waitForCutInContinue();
  hideCutIn();
}

function applyIncident(item, incident) {
  item.plans.forEach((plan, index) => {
    const effects = incident.effect;
    const profile =
      (effects.fit || 0) * (plan.stats.fit / 100) +
      (effects.stability || 0) * (plan.stats.stability / 100) +
      (effects.burst || 0) * (plan.stats.burst / 100) +
      (effects.client || 0) * (plan.stats.client / 100);
    const chaos = randomBetween(-7, 7);
    state.scores[index].score = clamp(state.scores[index].score + profile + chaos, 10, 198);
  });
}

function renderRacePositions(item, isFinal = false) {
  const ranked = state.scores
    .map((entry, index) => ({ ...entry, index }))
    .sort((a, b) => b.score - a.score);

  ranked.forEach((entry, rank) => {
    const horse = document.getElementById(`horse-${entry.index}`);
    if (!horse) return;
    const usable = getUsableDistance(horse);
    let distance;
    if (isFinal) {
      distance = rank === 0 ? usable + 46 : Math.round(usable * clamp(0.92 - rank * 0.13, 0.4, 0.95));
    } else {
      const leaderBoost = rank === 0 ? 0.045 : 0;
      const fraction = clamp(entry.score / 190 + leaderBoost, 0.02, 0.92);
      distance = Math.round(usable * fraction);
    }
    horse.style.transform = `translateX(${distance}px)`;
    const label = horse.querySelector(".runner-card span");
    if (label) label.textContent = `${item.plans[entry.index].media} / KPI ${Math.round(entry.score)}%`;
  });

  const leader = item.plans[ranked[0].index];
  updateRaceHud(null, `${leader.horse} / KPI ${Math.round(ranked[0].score)}%`, null);
  if (!isFinal) {
    els.raceMessage.textContent = `現在先頭: ${leader.horse} / KPI ${Math.round(ranked[0].score)}%。まだ何も信用できません。`;
  }
}

function getUsableDistance(horse) {
  const trackRect = els.track.getBoundingClientRect();
  const finishRect = document.querySelector(".finish-line")?.getBoundingClientRect();
  const horseWidth = horse.getBoundingClientRect().width || 260;
  const horseLeft = horse.offsetLeft || 10;
  if (finishRect && trackRect.width > 0) {
    const finishX = finishRect.left - trackRect.left;
    return Math.max(60, finishX - horseLeft - horseWidth + 24);
  }
  return Math.max(60, trackRect.width - horseWidth - 40);
}

// ---------- 決着と払い戻し ----------

function finishRace(item) {
  const result = state.scores
    .map((entry, index) => {
      const plan = item.plans[index];
      const clientAdjustment = plan.stats.client * randomBetween(-0.03, 0.07);
      const finalScore = clamp(entry.score + clientAdjustment + randomBetween(-4, 6), 1, 220);
      return { index, finalScore };
    })
    .sort((a, b) => b.finalScore - a.finalScore);

  result.forEach((entry) => {
    state.scores[entry.index].score = entry.finalScore;
  });

  [...els.track.querySelectorAll(".horse")].forEach((horse) => horse.classList.remove("running"));
  renderRacePositions(item, true);
  els.raceVisual.classList.add("flash");
  setTimeout(() => els.raceVisual.classList.remove("flash"), 900);
  Sound.stopBgm();
  Sound.se.goal();

  const winner = result[0];
  const second = result[1];
  const winnerPlan = item.plans[winner.index];
  updateRaceHud("確定", `${winnerPlan.horse} / KPI ${Math.round(winner.finalScore)}%`, "レース確定");

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
  showWinnerModal(item, winnerPlan, winner.finalScore, payouts, anyoneWon);
}

function renderResultPanel(item, result, payouts) {
  const isLastRound = state.round === CASES.length - 1;
  els.resultPanel.innerHTML = `
    <h3>🏁 決着: ${item.plans[result[0].index].name}</h3>
    <ol class="ranking">
      ${result
        .map((entry, rank) => {
          const plan = item.plans[entry.index];
          const medal = ["🥇", "🥈", "🥉", "　"][rank];
          return `
            <li>
              <strong>${medal} ${rank + 1}着</strong>
              <span>${plan.horse}</span>
              <span>${Math.round(entry.finalScore)}%</span>
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
    <button class="next-button" type="button" id="nextRoundButton">${isLastRound ? "🏆 最終結果を見る" : "▶ 次の案件へ"}</button>
  `;
  els.resultPanel.classList.remove("hidden");
  els.resultPanel.querySelector("#nextRoundButton").addEventListener("click", () => {
    Sound.se.ui();
    nextRound();
  });
}

function nextRound() {
  state.round += 1;
  if (state.round >= CASES.length) {
    showFinal();
  } else {
    startRound();
  }
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
  state.round = 0;
  showScreen("screen-game");
  startRound();
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

// ---------- カットイン / モーダル ----------

let cutInTimer = null;

function showCutIn(incident) {
  els.cutInType.textContent = incident.type;
  els.cutInTitle.textContent = incident.title;
  els.cutInBody.textContent = incident.body;
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
    cutInTimer = setTimeout(done, 4500); // 放置しても止まらないよう自動で進む
  });
}

function showWinnerModal(item, winnerPlan, finalScore, payouts, anyoneWon) {
  els.winnerName.textContent = winnerPlan.horse;
  els.winnerSummary.textContent = `${winnerPlan.name} が KPI ${Math.round(finalScore)}% で優勝。`;
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
  setTimeout(() => (anyoneWon ? Sound.se.win() : Sound.se.lose()), 500);
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

els.setupStart.addEventListener("click", () => {
  Sound.se.coin();
  initPlayers();
  state.round = 0;
  showScreen("screen-game");
  startRound();
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
  if (els["screen-game"].classList.contains("active") && state.running && state.scores.length) {
    renderRacePositions(CASES[state.round]);
  }
});

// ---------- 初期化 ----------

updateMuteButton();
renderNameInputs();
showScreen("screen-title");
