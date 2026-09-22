"use strict";

/* Reine Client-Logik, kein Server, kein Upload. Zustand nur in localStorage
   dieses Geräts (Regel: gleiche Privacy-Haltung wie die Sommerdetektive-App
   selbst – siehe deren save-state.ts). Wird die Seite geschlossen/gelöscht,
   ist auch der Lostopf weg. */

const STORAGE_KEY = "sommerverlosung:v1";
const SHUFFLE_MS = 1600;
const SHUFFLE_TICK_MS = 70;

// Feste Gewinnliste 2026 (Stand: von Fabian mitgeteilt). Vorbelegt im
// Textfeld und beim allerersten Aufruf automatisch geladen – bleibt aber
// ganz normal editierbar, falls sich die Gewinne noch ändern.
const DEFAULT_PRIZES_TEXT = [
  "Playmobil FunPark – 2 Tageseintritte + Anhänger\t5",
  "Alte Veste 10 €\t2",
  "Eisboutique + Playmobil Anhänger\t5",
  "Nazar\t2",
  "Mosena – 2 Kugeln Eis + Playmobil Anhänger\t5",
  "Playmobil Anhänger\t5",
  "Geschenktasche Stadtwerke\t5",
  "Orfeas 25 €\t1",
  "Bräuschank 20 €\t1",
  "Bücherstube – Set\t1",
  "Sparkasse-Set\t4",
].join("\n");

/** @typedef {{ name: string, total: number }} Prize */
/** @typedef {{ name: string, prize: string | null, followUp: boolean }} DrawnEntry */
/* followUp ist reine Notiz, keine Funktion: eine Ziehung ist immer
   endgültig, der Gewinn bleibt bei der gezogenen Person – laut
   Teilnahmebedingungen hat sie 4 Wochen Zeit, ihn im Hotel Knorz
   abzuholen, unabhängig davon, ob sie sich bei der Live-Ziehung meldet.
   followUp=true markiert nur "hier später nachfragen/nachhaken", löst
   nie eine Ersatzziehung aus und ändert nie, wer den Gewinn bekommen hat. */

/** @type {{ pool: string[], drawn: DrawnEntry[], prizes: Prize[] }} */
let state = { pool: [], drawn: [], prizes: [] };

// Im Dropdown gewählte Gewinnpaket-Zeile für die nächste Ziehung. Nur
// UI-Zustand für diese Sitzung, nicht persistiert – nach jedem Neuladen
// springt die Auswahl wieder auf das erste noch offene Paket in Listenreihenfolge.
let selectedPrizeName = null;

// true während "Alle X auf einmal ziehen" läuft – hält beide Ziehen-Buttons
// gesperrt, auch zwischen den einzelnen Einzelziehungen der Serie.
let batchInProgress = false;

// Anzeige-Umschalter fürs Protokoll (chronologisch vs. nach Gewinnpaket
// gruppiert). Nur UI-Zustand, nicht persistiert.
let logGroupedByPrize = false;

const el = {
  input: document.getElementById("sv-input"),
  load: document.getElementById("sv-load"),
  loadInfo: document.getElementById("sv-load-info"),
  pool: document.getElementById("sv-pool"),
  prizesInput: document.getElementById("sv-prizes-input"),
  prizesLoad: document.getElementById("sv-prizes-load"),
  prizesLoadInfo: document.getElementById("sv-prizes-load-info"),
  prizes: document.getElementById("sv-prizes"),
  currentPrize: document.getElementById("sv-current-prize"),
  stage: document.getElementById("sv-stage"),
  draw: document.getElementById("sv-draw"),
  remaining: document.getElementById("sv-remaining"),
  log: document.getElementById("sv-log"),
  logToggle: document.getElementById("sv-log-toggle"),
  copy: document.getElementById("sv-copy"),
  reset: document.getElementById("sv-reset"),
  winnerModal: document.getElementById("sv-winner-modal"),
  modalPrize: document.getElementById("sv-modal-prize"),
  modalStamp: document.getElementById("sv-modal-stamp"),
  modalName: document.getElementById("sv-modal-name"),
  modalContinue: document.getElementById("sv-modal-continue"),
  prizesSummary: document.getElementById("sv-prizes-summary"),
  undo: document.getElementById("sv-undo"),
  presentationToggle: document.getElementById("sv-presentation-toggle"),
  confettiCanvas: document.getElementById("sv-confetti-canvas"),
};

/** Kurzer Konfetti-Effekt beim Öffnen des Gewinner-Popups. Reines Canvas,
    keine Bilder/Fremd-Assets. Läuft einmalig für DURATION_MS und räumt sich
    danach selbst wieder ab. */
function burstConfetti() {
  const canvas = el.confettiCanvas;
  const ctx = canvas.getContext("2d");
  const dpr = window.devicePixelRatio || 1;
  canvas.width = window.innerWidth * dpr;
  canvas.height = window.innerHeight * dpr;
  canvas.style.width = window.innerWidth + "px";
  canvas.style.height = window.innerHeight + "px";
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const colors = ["#f7bb3f", "#689b3e", "#e05a3a", "#dcb162", "#64492a"];
  const particles = Array.from({ length: 90 }, () => ({
    x: Math.random() * window.innerWidth,
    y: -20 - Math.random() * window.innerHeight * 0.4,
    w: 5 + Math.random() * 6,
    h: 8 + Math.random() * 8,
    color: colors[Math.floor(Math.random() * colors.length)],
    vy: 2.5 + Math.random() * 3,
    vx: -1.5 + Math.random() * 3,
    rot: Math.random() * Math.PI,
    vrot: -0.25 + Math.random() * 0.5,
  }));

  const durationMs = 2200;
  const start = performance.now();

  function frame(now) {
    const elapsed = now - start;
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    for (const p of particles) {
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.vrot;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    }
    if (elapsed < durationMs) {
      requestAnimationFrame(frame);
    } else {
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    }
  }
  requestAnimationFrame(frame);
}

/** Schriftgröße für den/die Gewinnernamen im Popup – abhängig davon, wie
    viele Namen gleichzeitig gezeigt werden (Einzelziehung vs. "Alle X auf
    einmal ziehen") UND vom Präsentationsmodus. Bewusst als Inline-Style
    statt fester CSS-Regeln: eine feste Größe für "viele Namen" gibt es
    nicht – 2 Namen dürfen groß sein, 8 Namen müssen klein genug sein, um
    ohne Abschneiden/Scrollen alle gleichzeitig lesbar zu bleiben. */
function applyModalNameSizing(count) {
  const presentation = document.body.classList.contains("sv-presentation");
  let px;
  if (count <= 1) px = presentation ? 44 : 30;
  else if (count <= 3) px = presentation ? 38 : 24;
  else if (count <= 5) px = presentation ? 30 : 19;
  else if (count <= 8) px = presentation ? 23 : 16;
  else px = presentation ? 18 : 13;
  el.modalName.style.fontSize = px + "px";
}

/** Zeigt den Gewinner-Popup und löst erst auf, wenn er weggeklickt (oder
    mit Enter/Leertaste auf dem fokussierten Weiter-Button bestätigt) wird.
    namesOrName: ein einzelner Name (Einzelziehung) ODER ein Array mehrerer
    Namen (nach "Alle X auf einmal ziehen" – dann alle Gewinner:innen
    dieses Pakets zusammen in einem Popup statt einzeln nacheinander).
    Blockiert damit bewusst die aufrufende Kette, bis der/die Name(n)
    gesehen/vorgelesen wurden. */
function showWinnerModal(namesOrName, prizeName) {
  const names = Array.isArray(namesOrName) ? namesOrName : [namesOrName];
  return new Promise((resolve) => {
    el.modalPrize.textContent = prizeName ? `🎁 ${prizeName}` : "";
    el.modalStamp.textContent = names.length > 1 ? "Alle gezogen" : "Gezogen";
    el.modalName.innerHTML = "";
    el.modalName.classList.toggle("sv-modal-name--list", names.length > 1);
    applyModalNameSizing(names.length);
    for (const name of names) {
      const line = document.createElement("div");
      line.textContent = name;
      el.modalName.appendChild(line);
    }
    el.winnerModal.hidden = false;
    el.modalContinue.focus();
    burstConfetti();

    const close = () => {
      el.winnerModal.hidden = true;
      el.modalContinue.removeEventListener("click", close);
      el.winnerModal.removeEventListener("click", onBackdropClick);
      resolve();
    };
    const onBackdropClick = (e) => {
      if (e.target === el.winnerModal) close();
    };
    el.modalContinue.addEventListener("click", close);
    el.winnerModal.addEventListener("click", onBackdropClick);
  });
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed.pool) && Array.isArray(parsed.drawn)) {
      // Alter Zustand (vor der followUp-Umstellung) kannte "status: won|noshow"
      // statt "followUp" – als reine Notiz gleichwertig übernehmen, damit
      // frühere Markierungen nicht verloren gehen.
      const drawn = parsed.drawn.map((d) => ({
        name: d.name,
        prize: d.prize ?? null,
        followUp: typeof d.followUp === "boolean" ? d.followUp : d.status === "noshow",
      }));
      state = { pool: parsed.pool, drawn, prizes: Array.isArray(parsed.prizes) ? parsed.prizes : [] };
    }
  } catch {
    // Beschädigter/fremder localStorage-Inhalt: mit leerem Zustand starten,
    // statt die Seite mit einem Fehler zu blockieren.
  }
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // z.B. privater Modus mit vollem/gesperrtem Storage – Ziehung funktioniert
    // trotzdem, nur ohne Reload-Schutz.
  }
}

function parseNames(raw) {
  const seen = new Set();
  const names = [];
  let duplicates = 0;
  for (const line of raw.split(/\r?\n/)) {
    // Excel-Copy-Paste kann mehrspaltig sein (Tab-getrennt) – nur die erste
    // Spalte zählt als Losname.
    const name = line.split("\t")[0].trim();
    if (!name) continue;
    if (seen.has(name)) {
      duplicates++;
      continue;
    }
    seen.add(name);
    names.push(name);
  }
  return { names, duplicates };
}

/* Erwartet zwei Excel-Spalten ("Gewinnpaket", "Anzahl") als Tab-getrennten
   Paste, ist aber tolerant gegenüber Komma/Semikolon/Leerzeichen als
   Trenner – entscheidend ist nur, dass die Zeile mit einer Zahl endet. */
function parsePrizes(raw) {
  const merged = new Map();
  const invalidLines = [];
  for (const rawLine of raw.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const m = line.match(/^(.*?)[\t,;]?\s*(\d+)\s*$/);
    const name = m ? m[1].trim() : "";
    const count = m ? parseInt(m[2], 10) : NaN;
    if (!name || !Number.isFinite(count) || count <= 0) {
      invalidLines.push(rawLine);
      continue;
    }
    merged.set(name, (merged.get(name) || 0) + count);
  }
  const prizes = Array.from(merged, ([name, total]) => ({ name, total }));
  return { prizes, invalidLines };
}

function alreadyDrawnNames() {
  return new Set(state.drawn.map((d) => d.name));
}

// Jede Ziehung zählt endgültig gegen die Anzahl des Pakets – unabhängig
// von einer eventuellen followUp-Notiz (siehe DrawnEntry-Kommentar oben).
function countForPrize(prizeName) {
  return state.drawn.filter((d) => d.prize === prizeName).length;
}

function remainingFor(prize) {
  return Math.max(0, prize.total - countForPrize(prize.name));
}

function selectablePrizes() {
  return state.prizes.filter((p) => remainingFor(p) > 0);
}

function handleLoad() {
  const { names, duplicates } = parseNames(el.input.value);
  const drawnSet = alreadyDrawnNames();
  const skippedAlreadyDrawn = names.filter((n) => drawnSet.has(n)).length;
  state.pool = names.filter((n) => !drawnSet.has(n));
  saveState();
  render();

  const parts = [`${state.pool.length} Namen im Lostopf`];
  if (duplicates > 0) parts.push(`${duplicates} Duplikate entfernt`);
  if (skippedAlreadyDrawn > 0) parts.push(`${skippedAlreadyDrawn} bereits gezogen, übersprungen`);
  el.loadInfo.textContent = parts.join(" · ");
}

function handlePrizesLoad() {
  const { prizes, invalidLines } = parsePrizes(el.prizesInput.value);
  state.prizes = prizes;
  saveState();
  render();

  const totalSlots = prizes.reduce((sum, p) => sum + p.total, 0);
  const parts = [`${prizes.length} Gewinnpakete geladen (${totalSlots} Gewinne insgesamt)`];
  if (invalidLines.length > 0) parts.push(`${invalidLines.length} Zeile(n) ohne erkennbare Anzahl übersprungen`);
  el.prizesLoadInfo.textContent = parts.join(" · ");
}

function renderPool() {
  el.pool.innerHTML = "";
  for (const name of state.pool) {
    const tag = document.createElement("span");
    tag.className = "sd-evidence sd-type";
    tag.textContent = name;
    el.pool.appendChild(tag);
  }
}

function renderPrizes() {
  el.prizes.innerHTML = "";
  for (const prize of state.prizes) {
    const count = countForPrize(prize.name);
    const done = count >= prize.total;
    const tag = document.createElement("span");
    tag.className = "sd-evidence sd-type" + (done ? " sd-evidence--done" : "");
    tag.append(document.createTextNode((done ? "✅ " : "") + prize.name + " "));
    const frac = document.createElement("span");
    frac.className = "frac";
    frac.textContent = `(${count}/${prize.total})`;
    tag.appendChild(frac);
    el.prizes.appendChild(tag);
  }
}

function renderPrizesSummary() {
  if (state.prizes.length === 0) {
    el.prizesSummary.textContent = "";
    return;
  }
  const totalSlots = state.prizes.reduce((sum, p) => sum + p.total, 0);
  const totalAwarded = state.prizes.reduce((sum, p) => sum + countForPrize(p.name), 0);
  el.prizesSummary.innerHTML = `🏆 <strong>${totalAwarded}</strong> von <strong>${totalSlots}</strong> Gewinnen insgesamt vergeben`;
}

/** Baut eine einzelne Protokoll-Zeile. showPrizeLabel=false lässt das
    Gewinn-Label weg (in der gruppierten Ansicht steht der Name schon in
    der Gruppenüberschrift, das wäre doppelt). i ist immer der Index im
    ungefilterten state.drawn – auch in der gruppierten Ansicht, damit der
    Offen-Toggle die richtige Zeile trifft.
    Wichtig: die Ziehung selbst ist immer endgültig (4 Wochen Abholfrist
    im Hotel Knorz) – der Name bleibt deshalb normal dargestellt, nie
    durchgestrichen/ausgegraut, auch wenn followUp gesetzt ist. */
function buildLogRow(entry, i, showPrizeLabel) {
  const li = document.createElement("li");
  li.className = "sv-log-row" + (entry.followUp ? " is-open" : "");

  const idx = document.createElement("span");
  idx.className = "idx";
  idx.textContent = `${i + 1}.`;
  li.appendChild(idx);

  const nameWrap = document.createElement("span");
  nameWrap.className = "name";
  const tag = document.createElement("span");
  tag.className = "sd-evidence sd-type";
  tag.textContent = entry.name;
  nameWrap.appendChild(tag);
  if (showPrizeLabel && entry.prize) {
    const prizeLabel = document.createElement("span");
    prizeLabel.className = "sv-prize-label";
    prizeLabel.textContent = `🎁 ${entry.prize}`;
    nameWrap.appendChild(prizeLabel);
  }
  if (entry.followUp) {
    const badge = document.createElement("span");
    badge.className = "sv-flag-badge";
    badge.textContent = "📌 offen";
    nameWrap.appendChild(badge);
  }
  li.appendChild(nameWrap);

  const btn = document.createElement("button");
  btn.className = "sv-btn sv-btn--ghost sv-btn--sm";
  if (entry.followUp) {
    btn.textContent = "✅ erledigt";
    btn.title = "Offen-Markierung wieder entfernen";
  } else {
    btn.textContent = "📌 als offen markieren";
    btn.title = "Nur eine Notiz für dich (z.B. \"bei der Ziehung nicht gemeldet\") – der Gewinn bleibt bei dieser Person, sie hat laut Teilnahmebedingungen 4 Wochen Zeit zur Abholung im Hotel Knorz. Löst keine Ersatzziehung aus.";
  }
  btn.addEventListener("click", () => toggleFollowUp(i));
  li.appendChild(btn);

  return li;
}

/** Fasst state.drawn nach Gewinnpaket zusammen, in der Reihenfolge der
    Gewinnliste (nicht Ziehungsreihenfolge) – Pakete ohne Ziehung fallen
    weg, ein evtl. "ohne Zuordnung"-Rest kommt ans Ende. Jeder Eintrag
    behält seinen ursprünglichen Index in state.drawn (für "nicht
    erschienen" und die Nummerierung). */
function groupedLogEntries() {
  const order = [];
  for (const p of state.prizes) order.push(p.name);
  for (const entry of state.drawn) {
    if (entry.prize && !order.includes(entry.prize)) order.push(entry.prize);
  }

  const groups = order.map((name) => ({ name, items: [] }));
  const unassigned = { name: null, items: [] };
  state.drawn.forEach((entry, i) => {
    const target = entry.prize ? groups.find((g) => g.name === entry.prize) : unassigned;
    (target || unassigned).items.push({ entry, i });
  });

  const result = groups.filter((g) => g.items.length > 0);
  if (unassigned.items.length > 0) result.push(unassigned);
  return result;
}

function renderLog() {
  el.log.innerHTML = "";
  if (state.drawn.length === 0) {
    const li = document.createElement("li");
    li.className = "sv-log-empty";
    li.textContent = "Noch keine Ziehung.";
    el.log.appendChild(li);
    return;
  }

  if (!logGroupedByPrize) {
    state.drawn.forEach((entry, i) => el.log.appendChild(buildLogRow(entry, i, true)));
    return;
  }

  for (const group of groupedLogEntries()) {
    const heading = document.createElement("li");
    heading.className = "sv-log-group-heading";
    if (group.name) {
      const prize = state.prizes.find((p) => p.name === group.name);
      heading.textContent = prize ? `🎁 ${group.name} (${group.items.length}/${prize.total})` : `🎁 ${group.name}`;
    } else {
      heading.textContent = "Ohne Zuordnung";
    }
    el.log.appendChild(heading);
    for (const { entry, i } of group.items) {
      el.log.appendChild(buildLogRow(entry, i, false));
    }
  }
}

function renderStage(content) {
  el.stage.innerHTML = "";
  el.stage.appendChild(content);
}

function renderIdleStage() {
  const span = document.createElement("span");
  span.className = "placeholder";
  span.textContent = state.pool.length > 0
    ? "Bereit für die Ziehung 🔍"
    : "Lostopf befüllen, dann geht's los 🔍";
  renderStage(span);
}

function renderCurrentPrizeAndDrawState() {
  el.currentPrize.innerHTML = "";

  if (state.prizes.length === 0) {
    // Keine Gewinnpakete hinterlegt: reine Namensziehung ohne Zuordnung.
    el.draw.disabled = state.pool.length === 0 || batchInProgress;
    return;
  }

  const selectable = selectablePrizes();

  if (selectable.length === 0) {
    const msg = document.createElement("span");
    msg.textContent = "🎉 Alle Gewinnpakete sind vollständig vergeben.";
    el.currentPrize.appendChild(msg);
    el.draw.disabled = true;
    selectedPrizeName = null;
    return;
  }

  // Auswahl merken, solange sie noch gültig ist – sonst zurück auf das
  // erste noch offene Paket (Standard-Reihenfolge wie in der Liste).
  if (!selectable.some((p) => p.name === selectedPrizeName)) {
    selectedPrizeName = selectable[0].name;
  }

  const label = document.createElement("label");
  label.className = "sv-count";
  label.htmlFor = "sv-prize-select";
  label.textContent = "Gewinn für diese Ziehung: ";

  const select = document.createElement("select");
  select.id = "sv-prize-select";
  select.className = "sv-select";
  for (const p of selectable) {
    const opt = document.createElement("option");
    opt.value = p.name;
    opt.textContent = `${p.name} (noch ${remainingFor(p)} von ${p.total})`;
    if (p.name === selectedPrizeName) opt.selected = true;
    select.appendChild(opt);
  }
  select.addEventListener("change", () => {
    selectedPrizeName = select.value;
    renderCurrentPrizeAndDrawState();
  });
  label.appendChild(select);
  el.currentPrize.appendChild(label);

  if (state.pool.length === 0) {
    const warn = document.createElement("span");
    warn.style.color = "var(--sd-accent)";
    warn.textContent = "Lostopf ist leer, bitte ergänzen";
    el.currentPrize.appendChild(warn);
  }

  el.draw.disabled = state.pool.length === 0 || batchInProgress;
}

function render() {
  renderPool();
  renderPrizes();
  renderPrizesSummary();
  renderLog();
  el.remaining.innerHTML = `<strong>${state.pool.length}</strong> noch im Lostopf · <strong>${state.drawn.length}</strong> bereits gezogen`;
  renderCurrentPrizeAndDrawState();
  renderUndoButton();
  renderIdleStage();
}

/** forcedPrizeName: für die Serie in drawAllForSelected – zieht dann
    gezielt für ein bestimmtes Paket statt für die aktuelle Dropdown-
    Auswahl. undefined = normale Ziehung, nutzt die Dropdown-Auswahl (bzw.
    null ohne Gewinnpakete).
    showModal=false unterdrückt das Einzel-Popup (nutzt drawAllForSelected,
    das stattdessen am Ende ein Sammel-Popup mit allen Gewinner:innen des
    Pakets zeigt).
    Gibt ein Promise zurück, das nach Abschluss der Animation mit dem
    gezogenen Namen (oder null, wenn nichts zu ziehen war) auflöst – für
    drawAllForSelected, das mehrere Ziehungen nacheinander abwarten und
    die Namen einsammeln muss. */
function drawOne(forcedPrizeName, showModal = true) {
  // Sicherheitsnetz für "jeder gewinnt maximal einmal": state.pool sollte
  // schon durch splice() beim Ziehen und durch den Filter in handleLoad()
  // nie bereits gezogene Namen enthalten – hier zusätzlich direkt vor dem
  // Ziehen nochmal ausschließen, damit das auch bei einem Bug oder einem
  // manuell nachbearbeiteten localStorage-Stand garantiert bleibt.
  const alreadyWon = alreadyDrawnNames();
  const eligible = state.pool.filter((n) => !alreadyWon.has(n));
  if (eligible.length === 0) return Promise.resolve(null);

  let prizeName = null;
  if (state.prizes.length > 0) {
    if (forcedPrizeName !== undefined) {
      prizeName = forcedPrizeName;
    } else {
      if (selectablePrizes().length === 0) return Promise.resolve(null); // alle Gewinnpakete bereits vergeben
      prizeName = selectedPrizeName;
    }
  }

  el.draw.disabled = true;

  const wrap = document.createElement("div");
  wrap.className = "winner-wrap";
  if (prizeName) {
    const label = document.createElement("span");
    label.className = "prize-label";
    label.textContent = `🎁 ${prizeName}`;
    wrap.appendChild(label);
  }
  const shufflingText = document.createElement("span");
  shufflingText.className = "shuffling sd-type";
  wrap.appendChild(shufflingText);
  renderStage(wrap);

  const tickInterval = setInterval(() => {
    const r = eligible[Math.floor(Math.random() * eligible.length)];
    shufflingText.textContent = r;
  }, SHUFFLE_TICK_MS);

  return new Promise((resolve) => {
    setTimeout(async () => {
      clearInterval(tickInterval);
      const winner = eligible[Math.floor(Math.random() * eligible.length)];
      state.pool.splice(state.pool.indexOf(winner), 1);
      state.drawn.push({ name: winner, prize: prizeName, followUp: false });
      saveState();

      const winnerWrap = document.createElement("div");
      winnerWrap.className = "winner-wrap";
      if (prizeName) {
        const label = document.createElement("span");
        label.className = "prize-label";
        label.textContent = `🎁 ${prizeName}`;
        winnerWrap.appendChild(label);
      }
      const stamp = document.createElement("span");
      stamp.className = "sd-stamp sd-stamp--green";
      stamp.textContent = "Gezogen";
      const nameEl = document.createElement("span");
      nameEl.className = "winner-name sd-type";
      nameEl.textContent = winner;
      winnerWrap.append(stamp, nameEl);
      renderStage(winnerWrap);

      renderPool();
      renderPrizes();
      renderPrizesSummary();
      renderLog();
      el.remaining.innerHTML = `<strong>${state.pool.length}</strong> noch im Lostopf · <strong>${state.drawn.length}</strong> bereits gezogen`;
      renderCurrentPrizeAndDrawState();
      renderUndoButton();

      // Popup blockiert bewusst, bis "Weiter" geklickt wird. Bei einer
      // Serie (drawAllForSelected, showModal=false) wird das hier
      // übersprungen – dort kommt stattdessen ein Sammel-Popup am Ende.
      if (showModal) {
        await showWinnerModal(winner, prizeName);
      }
      resolve(winner);
    }, SHUFFLE_MS);
  });
}

/** Einziger Ziehen-Button: mit geladenen Gewinnpaketen wird immer das
    komplette gewählte Paket auf einmal gezogen (auch wenn nur 1 Platz
    übrig ist – kein separater "Alle X auf einmal"-Button mehr, die Anzahl
    steht schon im Dropdown). Ohne Gewinnpakete (Namensziehung ohne
    Zuordnung) gibt es kein "ganzes Paket", das gezogen werden könnte –
    dann bleibt es bei einer einzelnen Person pro Klick. */
async function handleDrawClick() {
  if (batchInProgress) return;
  if (state.prizes.length > 0) {
    await drawAllForSelected();
  } else {
    await drawOne();
  }
}

/** Zieht nacheinander alle noch offenen Plätze des aktuell gewählten
    Gewinnpakets, ohne dass zwischendurch erneut geklickt werden muss –
    z.B. für "5 Playmobil Anhänger in einem Rutsch". Wiederverwendet
    drawOne() 1:1 (gleiche Animation, gleiches Protokoll), reiht die
    Aufrufe nur automatisch aneinander. Zeigt dabei kein Einzel-Popup pro
    Person (showModal=false), sondern sammelt alle Namen und zeigt sie am
    Ende zusammen in einem Popup – "alle Gewinner eines Gewinns gleichzeitig". */
async function drawAllForSelected() {
  if (batchInProgress || state.prizes.length === 0) return;
  const prize = state.prizes.find((p) => p.name === selectedPrizeName);
  if (!prize) return;
  const target = prize.name;
  const toDraw = remainingFor(prize);
  if (toDraw <= 0) return;

  batchInProgress = true;
  el.draw.disabled = true;

  const winners = [];
  for (let i = 0; i < toDraw; i++) {
    const winner = await drawOne(target, false);
    if (!winner) break;
    winners.push(winner);
  }

  batchInProgress = false;
  renderCurrentPrizeAndDrawState();
  renderUndoButton();

  if (winners.length > 0) {
    await showWinnerModal(winners, target);
  }

  if (winners.length < toDraw) {
    alert(`Nur ${winners.length} von ${toDraw} für „${target}“ gezogen – der Lostopf ist leer. Bitte ergänzen, der Rest lässt sich danach normal weiterziehen.`);
  }
}

/** Reine Notiz-Markierung, siehe DrawnEntry-Kommentar oben: ändert nie,
    wer den Gewinn bekommen hat, löst nie eine Ersatzziehung aus. */
function toggleFollowUp(index) {
  const entry = state.drawn[index];
  if (!entry) return;
  entry.followUp = !entry.followUp;
  saveState();
  renderLog();
}

function renderUndoButton() {
  const last = state.drawn[state.drawn.length - 1];
  if (!last || batchInProgress) {
    el.undo.hidden = true;
    return;
  }
  el.undo.hidden = false;
  el.undo.disabled = false;
  el.undo.textContent = `↩️ Rückgängig: ${last.name}${last.prize ? ` (${last.prize})` : ""}`;
}

/** Macht nur die allerletzte Ziehung rückgängig (state.drawn.pop()) – legt
    die Person zurück in den Lostopf, der Gewinnpaket-Zähler sinkt
    automatisch mit (rein aus state.drawn abgeleitet, siehe countForPrize).
    Sicherheitsnetz für Fehlklicks/falsch gewähltes Paket während der Live-
    Ziehung; während einer Serie (batchInProgress) bewusst nicht verfügbar,
    siehe renderUndoButton(). */
function undoLastDraw() {
  const last = state.drawn[state.drawn.length - 1];
  if (!last) return;
  if (!confirm(`Ziehung von „${last.name}“${last.prize ? ` (${last.prize})` : ""} rückgängig machen? Die Person kommt zurück in den Lostopf.`)) return;
  state.drawn.pop();
  state.pool.push(last.name);
  saveState();
  render();
}

function resultLineFor(entry, i, includePrize) {
  const prizePart = includePrize && entry.prize ? ` — ${entry.prize}` : "";
  const statusPart = entry.followUp ? "  (offen – noch nicht bestätigt)" : "";
  return `${i + 1}. ${entry.name}${prizePart}${statusPart}`;
}

function buildResultText() {
  const lines = ["Sommerdetektive – Ziehungsprotokoll", new Date().toLocaleString("de-DE"), ""];

  if (state.drawn.length === 0) {
    lines.push("(noch keine Ziehung)");
    return lines.join("\n");
  }

  if (!logGroupedByPrize) {
    state.drawn.forEach((entry, i) => lines.push(resultLineFor(entry, i, true)));
    return lines.join("\n");
  }

  for (const group of groupedLogEntries()) {
    lines.push(group.name ? `${group.name}:` : "Ohne Zuordnung:");
    for (const { entry, i } of group.items) lines.push("  " + resultLineFor(entry, i, false));
    lines.push("");
  }
  return lines.join("\n").trimEnd();
}

async function handleCopy() {
  const text = buildResultText();
  try {
    await navigator.clipboard.writeText(text);
    el.copy.textContent = "✅ Kopiert";
  } catch {
    // Clipboard-API evtl. ohne HTTPS/Fokus nicht verfügbar – Text stattdessen anzeigen.
    window.prompt("Kopieren nicht möglich – Text manuell markieren:", text);
  }
  setTimeout(() => { el.copy.textContent = "📄 Ergebnis kopieren"; }, 1500);
}

function togglePresentationMode() {
  const active = document.body.classList.toggle("sv-presentation");
  el.presentationToggle.textContent = active ? "📋 Verwaltung" : "🖥️ Bühne";
  el.presentationToggle.title = active
    ? "Zurück zur Verwaltung (Gewinnpakete/Lostopf/Protokoll wieder einblenden)"
    : "Präsentationsmodus: blendet Eingabe/Protokoll aus, nur Bühne groß";
}

function handleLogToggle() {
  logGroupedByPrize = !logGroupedByPrize;
  el.logToggle.textContent = logGroupedByPrize ? "🗒️ Chronologisch anzeigen" : "📦 Nach Gewinn gruppieren";
  renderLog();
}

function handleReset() {
  if (state.pool.length === 0 && state.drawn.length === 0 && state.prizes.length === 0) return;
  if (!confirm("Lostopf und Ziehungsprotokoll wirklich komplett zurücksetzen? Die Gewinnliste wird dabei auf den aktuellen Stand zurückgesetzt.")) return;
  state = { pool: [], drawn: [], prizes: [] };
  el.input.value = "";
  el.loadInfo.textContent = "";
  el.prizesInput.value = DEFAULT_PRIZES_TEXT;
  handlePrizesLoad();
}

el.load.addEventListener("click", handleLoad);
el.prizesLoad.addEventListener("click", handlePrizesLoad);
el.draw.addEventListener("click", handleDrawClick);
el.logToggle.addEventListener("click", handleLogToggle);
el.copy.addEventListener("click", handleCopy);
el.reset.addEventListener("click", handleReset);
el.undo.addEventListener("click", undoLastDraw);
el.presentationToggle.addEventListener("click", togglePresentationMode);

loadState();
// Beim allerersten Aufruf (nichts in localStorage) die feste Gewinnliste
// vorbelegen und direkt laden. Läuft bereits eine Ziehung oder wurden die
// Gewinnpakete schon einmal manuell geladen, nicht mehr eingreifen – sonst
// würde ein Reload mitten in der Live-Ziehung den Fortschritt überschreiben.
if (state.prizes.length === 0 && state.drawn.length === 0) {
  el.prizesInput.value = DEFAULT_PRIZES_TEXT;
  handlePrizesLoad();
} else {
  el.prizesInput.value = DEFAULT_PRIZES_TEXT;
  render();
}
