/*
  DTW Timer
  Created by Yuri (2026)
*/
// =========================
// Data (씨앗 정보)
// =========================
let CROPS = [
  { id:"test",   name:"🧪 테스트 씨앗",      sec: 15 },
  { id:"tomato", name:"🍅 토마토 씨앗",      sec: 15 * 60 },
  { id:"potato", name:"🥔 감자 씨앗",        sec: 60 * 60 },
  { id:"wheat",  name:"🌾 밀 씨앗",          sec: 4 * 60 * 60 },
  { id:"lettuce",name:"🥬 상추 씨앗",        sec: 8 * 60 * 60 },
  { id:"pine",   name:"🍍 파인애플 씨앗",    sec: 30 * 60 },
  { id:"carrot", name:"🥕 당근 씨앗",        sec: 2 * 60 * 60 },
  { id:"straw",  name:"🍓 딸기 씨앗",        sec: 6 * 60 * 60 },
  { id:"corn",   name:"🌽 옥수수 씨앗",      sec: 12 * 60 * 60 },
  { id:"grape",  name:"🍇 포도 씨앗",        sec: 10 * 60 * 60 },
  { id:"egg",    name:"🍆 가지 씨앗",        sec: 7 * 60 * 60 },
  { id:"truf",   name:"🍄 트러플 버섯",      sec: 13 * 60 },
  { id:"tree",   name:"🌳 큰나무",           sec: 2 * 60 * 60 }
];

const CROPS_KEY  = "dtw_crops_custom_v1";
const TIMERS_KEY = "dtw_timers_v1";

// =========================
// State
// =========================
const selected = new Set();
let timers = []; // {tid, name, sec, startAt, endAt, notified, beeped}
let tickHandle = null;

// 소리
let audioCtx = null;
let audioUnlocked = false;


const $ = (q) => document.querySelector(q);

function safeId(){
  return Math.random().toString(16).slice(2) + Date.now().toString(16);
}

function fmtClock(ts){
  const d = new Date(ts);
  let h = d.getHours();
  const m = String(d.getMinutes()).padStart(2,"0");
  const ap = h >= 12 ? "오후" : "오전";
  h = h % 12; if (h === 0) h = 12;
  return `${ap} ${String(h).padStart(2,"0")}:${m}`;
}

function humanGrow(sec){
  if (sec < 60) return `${sec}초`;
  const m = sec/60;
  if (m < 60) return `${m}분`;
  const h = m/60;
  if (h < 24) return `${h}시간`;
  return `${Math.round(h/24)}일`;
}

// 시간 단위
function timePartsHTML(ms){
  if (ms <= 0) return `<span class="bigNum">수확!</span>`;

  const s = Math.floor(ms/1000);
  const hh = Math.floor(s/3600);
  const mm = Math.floor((s%3600)/60);
  const ss = s%60;

  if (hh > 0){
    return `
      <span class="bigNum">${hh}</span><span class="unit">시간</span>
      <span class="bigNum">${mm}</span><span class="unit">분</span>
    `;
  }
  if (mm > 0){
    return `
      <span class="bigNum">${mm}</span><span class="unit">분</span>
      <span class="bigNum">${ss}</span><span class="unit">초</span>
    `;
  }
  return `<span class="bigNum">${ss}</span><span class="unit">초</span>`;
}

function progressRatio(t, now){
  const total = t.sec * 1000;
  const remain = Math.max(0, t.endAt - now);
  return total <= 0 ? 0 : (remain / total);
}

// 타이머 색 게이지 색 변환: 50% 파랑 / 30% 보라 / 15% 빨강
function progressColor(ratio){
  if (ratio >= 0.50){
    return "linear-gradient(180deg, var(--blue), var(--blue2))";
  }
  if (ratio >= 0.30){
    const t = (0.50 - ratio) / 0.20;
    return `linear-gradient(180deg,
      color-mix(in srgb, var(--blue) ${(1-t)*100}%, var(--violet) ${t*100}%),
      color-mix(in srgb, var(--blue2) ${(1-t)*100}%, var(--violet) ${t*100}%)
    )`;
  }
  if (ratio >= 0.15){
    const t = (0.30 - ratio) / 0.15;
    return `linear-gradient(180deg,
      color-mix(in srgb, var(--violet) ${(1-t)*100}%, var(--red) ${t*100}%),
      color-mix(in srgb, var(--violet) ${(1-t)*100}%, var(--red) ${t*100}%)
    )`;
  }
  return `linear-gradient(180deg, var(--red), var(--red))`;
}

// =========================
// Timers persistence
// =========================
function saveTimers(){
  localStorage.setItem(TIMERS_KEY, JSON.stringify(timers));
}

function loadTimers(){
  try{
    const raw = localStorage.getItem(TIMERS_KEY);
    if (!raw){ timers = []; return; }

    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)){ timers = []; return; }

    timers = arr.map(t => ({
      tid: t.tid || safeId(),
      name: String(t.name || "⏱️ 타이머"),
      sec: Number(t.sec || 0),
      startAt: Number(t.startAt || Date.now()),
      endAt: Number(t.endAt || (Number(t.startAt || Date.now()) + Number(t.sec || 0) * 1000)),
      notified: Boolean(t.notified),
      beeped: Boolean(t.beeped)
    }));
  }catch(e){
    timers = [];
    localStorage.removeItem(TIMERS_KEY);
  }
}



function setTheme(theme){
  document.documentElement.setAttribute("data-theme", theme);
  localStorage.setItem("dtw_theme", theme);
  $("#themeText").textContent = theme === "dark" ? "다크" : "라이트";
}
function initTheme(){
  const saved = localStorage.getItem("dtw_theme");
  if (saved === "dark" || saved === "light"){ setTheme(saved); return; }
  const prefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  setTheme(prefersDark ? "dark" : "light");
}
function toggleTheme(){
  const cur = document.documentElement.getAttribute("data-theme");
  setTheme(cur === "dark" ? "light" : "dark");
}

// =========================
// 소리
// =========================
function unlockAudio(){
  if (audioUnlocked) return;
  try{
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === "suspended") audioCtx.resume();
    audioUnlocked = true;
  }catch(e){}
}

function beepFor4s(){
  if (!audioUnlocked || !audioCtx) return;

  const start = audioCtx.currentTime;
  const duration = 4.0;
  const pulse = 0.22;
  const gap = 0.10;
  const freq = 880;

  let t = 0;
  while (t < duration){
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(freq, start + t);

    gain.gain.setValueAtTime(0.0001, start + t);
    gain.gain.exponentialRampToValueAtTime(0.18, start + t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + t + pulse);

    osc.connect(gain).connect(audioCtx.destination);
    osc.start(start + t);
    osc.stop(start + t + pulse + 0.02);

    t += pulse + gap;
  }
}

// 완료시 소리 즉시 차단
async function stopAllSound(){
  try{
    if (!audioCtx) return;
    if (audioCtx.state === "running") await audioCtx.suspend();
    await audioCtx.close();
  }catch(e){
  }finally{
    audioCtx = null;
    audioUnlocked = false;
  }
}

// =========================
// 씨앗 만들기 
// =========================
function loadCustomCrops(){
  try{
    const raw = localStorage.getItem(CROPS_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr.filter(x => x && typeof x.id==="string" && typeof x.name==="string" && typeof x.sec==="number");
  }catch{
    return [];
  }
}

function saveCustomCrops(custom){
  localStorage.setItem(CROPS_KEY, JSON.stringify(custom));
}

function normalizeCustomName(name){
  const trimmed = (name || "").trim();
  if (!trimmed) return "⏱️ 사용자 씨앗";
  const hasEmoji = /[\u{1F300}-\u{1FAFF}]/u.test(trimmed);
  return hasEmoji ? trimmed : `⏱️ ${trimmed}`;
}

function ensureCustomCropExists(name, sec){
  const custom = loadCustomCrops();
  const norm = normalizeCustomName(name);

  const found = custom.find(c => c.name === norm && c.sec === sec);
  if (found) return found;

  const newCrop = { id: "custom_" + safeId(), name: norm, sec };
  custom.unshift(newCrop);
  saveCustomCrops(custom);
  return newCrop;
}

function isCustomCrop(id){
  return String(id).startsWith("custom_");
}

function deleteCustomCrop(id){
  const ok = confirm("이 사용자 씨앗을 목록에서 삭제할까?");
  if (!ok) return;

  // localStorage에서 제거
  const custom = loadCustomCrops();
  const removed = custom.find(c => c.id === id);
  const next = custom.filter(c => c.id !== id);
  saveCustomCrops(next);

  // 메모리 목록에서 제거
  CROPS = CROPS.filter(c => c.id !== id);

  // 선택 해제
  selected.delete(id);

  //해당 씨앗 이름으로 생성된 타이머도 같이 제거
  if (removed){
    timers = timers.filter(t => t.name !== removed.name);
    saveTimers(); // 타이머가 변했으면 저장
  }

  stopAllSound(); //울리는 소리 차단
  renderCropGrid();
  renderTimers();
}

// =========================
// Crops render
// =========================
function toggleSelect(id){
  if (selected.has(id)) selected.delete(id);
  else selected.add(id);
  renderCropGrid();
}

function renderCropGrid(){
  const grid = $("#cropGrid");
  grid.innerHTML = "";

  CROPS.forEach(c => {
    const card = document.createElement("div");
    card.className = "cropCard" + (selected.has(c.id) ? " selected" : "");

    const custom = isCustomCrop(c.id);
    card.innerHTML = `
      <div class="cropTop">
        <div class="cropName">${c.name}</div>
        ${custom ? `<button class="cropDel" title="삭제" aria-label="삭제">×</button>` : ``}
      </div>
      <div class="cropMeta">성장 ${humanGrow(c.sec)}</div>
    `;

    card.addEventListener("click", (e) => {
      const delBtn = e.target.closest?.(".cropDel");
      if (delBtn){
        e.stopPropagation();
        deleteCustomCrop(c.id);
        return;
      }
      toggleSelect(c.id);
    });

    grid.appendChild(card);
  });
}

// =========================
// 타이머
// =========================
function ensureTick(){
  if (tickHandle) return;
  tickHandle = setInterval(() => {
    const now = Date.now();
    let changed = false;

    timers.forEach(t => {
      if (!t.notified && t.endAt <= now){
        t.notified = true;
        changed = true;
        notifyDone(t);

        if (!t.beeped){
          t.beeped = true;
          changed = true;
          beepFor4s();
        }
      }
    });

    if (changed) saveTimers(); // 상태 변하면 저장
    renderTimers();
  }, 500);
}

function addTimersFromSelected(){
  if (selected.size === 0) return;
  unlockAudio();

  const now = Date.now();
  selected.forEach(id => {
    const crop = CROPS.find(c => c.id === id);
    if (!crop) return;

    timers.unshift({
      tid: safeId(),
      name: crop.name,
      sec: crop.sec,
      startAt: now,
      endAt: now + crop.sec * 1000,
      notified: false,
      beeped: false
    });
  });

  saveTimers();   // 추가
  ensureTick();
  renderTimers();
}

function removeTimer(tid){
  stopAllSound();
  timers = timers.filter(t => t.tid !== tid);
  saveTimers();   // 추가
  renderTimers();
}

function resetTimer(tid){
  const t = timers.find(x => x.tid === tid);
  if (!t) return;
  unlockAudio();

  const now = Date.now();
  t.startAt = now;
  t.endAt = now + t.sec * 1000;
  t.notified = false;
  t.beeped = false;

  saveTimers();   // 추가
  renderTimers();
}

function removeDoneTimers(){
  stopAllSound();
  const now = Date.now();
  timers = timers.filter(t => t.endAt > now);
  saveTimers();   // 추가
  renderTimers();
}

function removeAllTimers(){
  const ok = confirm("전체 타이머를 삭제할까? (되돌릴 수 없어)");
  if (!ok) return;

  stopAllSound();
  timers = [];
  saveTimers();   // 추가
  renderTimers();
}

// =========================
// 타이머 렌더링
// =========================
function renderTimers(){
  const listEl = $("#timerList");
  const now = Date.now();

  if (timers.length === 0){
    listEl.innerHTML = `
      <div class="timerEmpty">
        아직 타이머가 없어 🫧<br/>왼쪽에서 작물을 선택하고 <b>심기 완료</b>를 눌러줘!
      </div>
    `;
    return;
  }

  listEl.innerHTML = "";
  timers.forEach(t => {
    const remainMs = t.endAt - now;
    const done = remainMs <= 0;

    const ratio = progressRatio(t, now);
    const widthPct = Math.round(ratio * 100);
    const grad = progressColor(ratio);

    const card = document.createElement("div");
    card.className = "timerCard";
    card.innerHTML = `
      <div class="timerLeft">
        <b>${t.name}</b>
        <small>
          수확 예정: ${fmtClock(t.endAt)} · 성장 ${humanGrow(t.sec)}<br/>
          ${done ? "지금 수확 가능해요 👀" : ""}
        </small>
      </div>

      <div class="timerRight">
        <div class="timeParts">${timePartsHTML(remainMs)}</div>
        <div class="miniRow">
          <button class="miniBtn" data-act="reset">리셋</button>
          <button class="miniBtn danger" data-act="del">삭제</button>
        </div>
      </div>

      <div class="progress" aria-hidden="true">
        <i style="width:${done ? 0 : widthPct}%; background:${grad};"></i>
      </div>
    `;

    card.querySelector('[data-act="del"]').addEventListener("click", () => removeTimer(t.tid));
    card.querySelector('[data-act="reset"]').addEventListener("click", () => resetTimer(t.tid));

    listEl.appendChild(card);
  });
}

// =========================
// 알림 설정 
// =========================
async function requestPermission(){
  unlockAudio();
  if (!("Notification" in window)){
    alert("이 브라우저는 알림을 지원하지 않아 🥲");
    return;
  }
  const perm = await Notification.requestPermission();
  if (perm === "granted") alert("알림 권한 OK! 이제 수확 시점에 알려줄게 🔔");
  else alert("알림 권한이 거절됐어. 필요하면 브라우저 설정에서 다시 켤 수 있어!");
}

function notifyDone(timer){
  if (!("Notification" in window)) return;
  if (Notification.permission !== "granted") return;
  new Notification("🌱 수확 시간!", { body: `${timer.name} 수확 가능해요`, silent: false });
}


function openModal(){
  const m = $("#addTimerModal");
  m.classList.add("open");
  m.setAttribute("aria-hidden", "false");
}
function closeModal(){
  const m = $("#addTimerModal");
  m.classList.remove("open");
  m.setAttribute("aria-hidden", "true");
}

function initModal(){
  const m = $("#addTimerModal");

  m.addEventListener("click", (e) => {
    const close = e.target && e.target.getAttribute("data-close");
    if (close) closeModal();
  });

  $("#openAddTimer").addEventListener("click", () => {
    unlockAudio();
    openModal();
  });

  $("#createCustomTimer").addEventListener("click", () => {
    const name = $("#customName").value.trim();
    const h = Math.max(0, parseInt($("#customHours").value || "0", 10));
    const mi = Math.max(0, parseInt($("#customMins").value || "0", 10));
    const s = Math.max(0, parseInt($("#customSecs").value || "0", 10));
    const sec = h * 3600 + mi * 60 + s;

    if (!sec){
      alert("시간/분/초 중 하나라도 넣어줘!");
      return;
    }

    // 왼쪽 씨앗 목록에 저장
    const added = ensureCustomCropExists(name, sec);

    // 목록에 없으면 추가
    if (!CROPS.some(c => c.id === added.id)){
      CROPS = [added, ...CROPS];
    }

    // 바로 선택 + 타이머 생성
    selected.add(added.id);
    renderCropGrid();
    addTimersFromSelected();

    closeModal();
  });
}

// =========================
// 로드 init
// =========================
function init(){
  // 커스텀 씨앗 로드
  const custom = loadCustomCrops();
  if (custom.length){
    CROPS = [...custom, ...CROPS];
  }

  // 새로고침 유지 핵심
  loadTimers();

  initTheme();
  $("#themeToggle").addEventListener("click", toggleTheme);

  renderCropGrid();
  renderTimers();
  ensureTick();

  $("#plantBtn").addEventListener("click", addTimersFromSelected);
  $("#permBtn").addEventListener("click", requestPermission);

  $("#removeDoneBtn").addEventListener("click", removeDoneTimers);
  $("#removeAllBtn").addEventListener("click", removeAllTimers);

  initModal();
}

init();
