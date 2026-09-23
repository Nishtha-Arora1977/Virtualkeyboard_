import { FilesetResolver, HandLandmarker } from "@mediapipe/tasks-vision";

// ----- DOM -----
const video = document.getElementById("webcam");
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");
const textboxEl = document.getElementById("textbox");
const statusPill = document.getElementById("statusPill");
const fpsPill = document.getElementById("fpsPill");
const overlayMsg = document.getElementById("overlayMsg");
const startBtn = document.getElementById("startBtn");
const toggleKeysBtn = document.getElementById("toggleKeysBtn");
const stopBtn = document.getElementById("stopBtn");
const copyBtn = document.getElementById("copyBtn");
const clearBtn = document.getElementById("clearBtn");
const landmarksChk = document.getElementById("landmarksChk");
const mirrorChk = document.getElementById("mirrorChk");
const errorBox = document.getElementById("errorBox");

// ----- State (mirrors virtualkeyboard.py) -----
const MAX_LEN = 30;
const PINCH_THRESHOLD_PX = 50; // same as `calculateIntDidtance(...) < 50`
const DEBOUNCE_MS = 400;       // same as `clickTime - previousClick > 0.4`
let typedText = "";
let showKeys = true;
let running = false;
let handLandmarker = null;
let lastVideoTime = -1;
let previousClick = 0;
let mouseX = 0, mouseY = 0;
let clickedX = -9999, clickedY = -9999;
let signTip = { x: 0, y: 0, visible: false };
let thumbTip = { x: 0, y: 0, visible: false };
let pinchCenter = null;
let pinchActive = false;
let currentLandmarks = null; // normalized landmarks for drawing
let fps = 0, lastFpsT = performance.now(), frames = 0;

const W = 960, H = 720;
canvas.width = W;
canvas.height = H;

// Keys layout — same rows as Python version:
// Row1: QWERTYUIOP (10), Row2: ASDFGHJKL (9), Row3: ZXCVBNM (7)
const letters = "QWERTYUIOPASDFGHJKLZXCVBNM".split("");
const keys = [];
const kw = 80, kh = 60, gap = 5;
const startX = 40, startY = 300;

letters.forEach((l, i) => {
  if (i < 10) keys.push(mkKey(startX + i * (kw + gap), startY, kw, kh, l));
  else if (i < 19) keys.push(mkKey(startX + (i - 10) * (kw + gap), startY + kh + gap, kw, kh, l));
  else keys.push(mkKey(startX + (i - 19) * (kw + gap), startY + 2 * (kh + gap), kw, kh, l));
});
keys.push(mkKey(startX + 25, startY + 3 * (kh + gap) + 15, 5 * kw, kh, "Space"));
keys.push(mkKey(startX + 8 * kw + 50, startY + 2 * (kh + gap) + 10, kw, kh, "clr"));
keys.push(mkKey(startX + 5 * kw + 30, startY + 3 * (kh + gap) + 15, 5 * kw, kh, "<--"));

const showKey = mkKey(W - 125, 12, 110, 50, "Hide");
const exitKey = mkKey(W - 125, 70, 110, 50, "Exit");

function mkKey(x, y, w, h, text) {
  return { x, y, w, h, text };
}
function isOver(k, x, y) {
  return x > k.x && x < k.x + k.w && y > k.y && y < k.y + k.h;
}
function setStatus(mode, text) {
  statusPill.className = "pill " + mode;
  statusPill.textContent = text;
}
function showError(msg) {
  errorBox.hidden = false;
  errorBox.textContent = msg;
}
function renderTextbox() {
  textboxEl.textContent = typedText;
}
function pressKeyText(t) {
  if (t === "<--") typedText = typedText.slice(0, -1);
  else if (t === "clr") typedText = "";
  else if (typedText.length < MAX_LEN) typedText += t === "Space" ? " " : t;
  renderTextbox();
}

// ----- Model -----
async function initModel() {
  try {
    const vision = await FilesetResolver.forVisionTasks(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm"
    );
    handLandmarker = await HandLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath:
          "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
        delegate: "GPU",
      },
      runningMode: "VIDEO",
      numHands: 1,
      minHandDetectionConfidence: 0.5,
      minHandPresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });
    setStatus("ready", "Hand model ready");
  } catch (e) {
    console.error(e);
    setStatus("error", "Model failed to load");
    showError("Could not load MediaPipe hand model. Check your connection and reload. " + (e?.message || e));
  }
}

// ----- Camera -----
async function startCamera() {
  errorBox.hidden = true;
  if (!handLandmarker) {
    showError("Hand model is still loading — wait a moment and try again.");
    return;
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 960 }, height: { ideal: 720 }, facingMode: "user" },
    });
    video.srcObject = stream;
    await video.play();
    running = true;
    overlayMsg.hidden = true;
    setStatus("ready", "Tracking • pinch to type");
    requestAnimationFrame(loop);
  } catch (e) {
    console.error(e);
    showError("Camera access denied or unavailable. Allow webcam access and use HTTPS (or localhost). " + (e?.message || ""));
    setStatus("error", "Camera blocked");
  }
}
function stopCamera() {
  running = false;
  const s = video.srcObject;
  if (s) s.getTracks().forEach((t) => t.stop());
  video.srcObject = null;
  overlayMsg.hidden = false;
  setStatus("loading", "Camera stopped");
}

// ----- Input: mouse + touch -----
function toCanvas(e) {
  const r = canvas.getBoundingClientRect();
  const cx = (e.clientX - r.left) * (W / r.width);
  const cy = (e.clientY - r.top) * (H / r.height);
  return { x: cx, y: cy };
}
canvas.addEventListener("mousemove", (e) => {
  const p = toCanvas(e);
  mouseX = p.x; mouseY = p.y;
});
canvas.addEventListener("click", (e) => {
  const p = toCanvas(e);
  handleTap(p.x, p.y);
});
canvas.addEventListener("touchstart", (e) => {
  const t = e.touches[0];
  const p = toCanvas(t);
  handleTap(p.x, p.y);
}, { passive: true });

function handleTap(x, y) {
  clickedX = x; clickedY = y;
  if (isOver(showKey, x, y)) {
    toggleShow();
    clickedX = -9999;
    return;
  }
  if (isOver(exitKey, x, y)) {
    stopCamera();
    return;
  }
  if (showKeys) {
    for (const k of keys) {
      if (isOver(k, x, y)) {
        // visual click feedback
        k._flash = performance.now();
        pressKeyText(k.text);
        break;
      }
    }
  }
  clickedX = -9999;
}

function toggleShow() {
  showKeys = !showKeys;
  showKey.text = showKeys ? "Hide" : "Show";
  toggleKeysBtn.textContent = showKeys ? "Hide keys" : "Show keys";
}

// ----- Main loop -----
async function loop(now) {
  if (!running) return;

  // FPS
  frames++;
  if (now - lastFpsT >= 500) {
    fps = Math.round((frames * 1000) / (now - lastFpsT));
    fpsPill.textContent = `${fps} FPS`;
    frames = 0;
    lastFpsT = now;
  }

  // 1. Draw video frame (mirrored like cv2.flip(frame, 1))
  const mirror = mirrorChk.checked;
  ctx.save();
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, W, H);
  if (video.readyState >= 2) {
    if (mirror) {
      ctx.translate(W, 0);
      ctx.scale(-1, 1);
    }
    const vw = video.videoWidth || 640, vh = video.videoHeight || 480;
    // cover-fit
    const s = Math.max(W / vw, H / vh);
    const dw = vw * s, dh = vh * s;
    ctx.drawImage(video, (W - dw) / 2 * (mirror ? -1 : 1), (H - dh) / 2, dw, dh);
  }
  ctx.restore();

  // 2. Hand detection
  signTip.visible = false;
  thumbTip.visible = false;
  pinchCenter = null;
  if (video.currentTime !== lastVideoTime && video.readyState >= 2) {
    lastVideoTime = video.currentTime;
    try {
      const res = handLandmarker.detectForVideo(video, now);
      const lms = res?.landmarks?.[0];
      currentLandmarks = lms || null;
      if (lms) {
        // landmark 8 = index tip, 4 = thumb tip (normalized 0..1, unmirrored)
        let sx = lms[8].x * W, sy = lms[8].y * H;
        let tx = lms[4].x * W, ty = lms[4].y * H;
        if (mirror) {
          sx = W - sx;
          tx = W - tx;
        }
        signTip = { x: sx, y: sy, visible: true };
        thumbTip = { x: tx, y: ty, visible: true };
        const d = Math.hypot(sx - tx, sy - ty);
        if (d < PINCH_THRESHOLD_PX) {
          pinchCenter = { x: (sx + tx) / 2, y: (sy + ty) / 2 };
          pinchActive = true;
        } else {
          pinchActive = false;
        }
      } else {
        currentLandmarks = null;
        pinchActive = false;
      }
    } catch (e) {
      console.warn("detect error", e);
    }
  }

  // 3. Pinch-to-press (mirrors Python finger logic + 400ms debounce)
  if (pinchCenter && pinchCenter) {
    const nowMs = performance.now();
    const target =
      (showKeys && keys.find((k) => isOver(k, pinchCenter.x, pinchCenter.y))) ||
      (isOver(showKey, pinchCenter.x, pinchCenter.y) ? showKey : null) ||
      (isOver(exitKey, pinchCenter.x, pinchCenter.y) ? exitKey : null);
    if (target && nowMs - previousClick > DEBOUNCE_MS) {
      if (target === showKey) toggleShow();
      else if (target === exitKey) stopCamera();
      else {
        target._flash = nowMs;
        pressKeyText(target.text);
      }
      previousClick = nowMs;
    }
  }

  // 4. Draw landmarks
  if (landmarksChk.checked && currentLandmarks) {
    ctx.save();
    ctx.fillStyle = "#4ade80";
    ctx.strokeStyle = "rgba(74,222,128,.7)";
    ctx.lineWidth = 2;
    const pts = currentLandmarks.map((p) => ({
      x: (mirror ? 1 - p.x : p.x) * W,
      y: p.y * H,
    }));
    const CONN = [[0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[5,9],[9,10],[10,11],[11,12],[9,13],[13,14],[14,15],[15,16],[13,17],[17,18],[18,19],[19,20],[0,17]];
    ctx.beginPath();
    for (const [a,b] of CONN) {
      ctx.moveTo(pts[a].x, pts[a].y);
      ctx.lineTo(pts[b].x, pts[b].y);
    }
    ctx.stroke();
    for (const p of pts) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
      ctx.fill();
    }
    // pinch line like cv2.line + circle
    if (signTip.visible && thumbTip.visible && pinchActive && pinchCenter) {
      ctx.strokeStyle = "#00ff00";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(signTip.x, signTip.y);
      ctx.lineTo(thumbTip.x, thumbTip.y);
      ctx.stroke();
      ctx.fillStyle = "#00ff00";
      ctx.beginPath();
      ctx.arc(pinchCenter.x, pinchCenter.y, 6, 0, Math.PI * 2);
      ctx.fill();
    }
    // fingertip cursor
    if (signTip.visible) {
      ctx.fillStyle = "#60a5fa";
      ctx.beginPath();
      ctx.arc(signTip.x, signTip.y, 7, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // 5. Draw UI: FPS + Show/Exit + textbox strip + keys
  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,.55)";
  ctx.fillRect(8, 8, 110, 28);
  ctx.fillStyle = "#fff";
  ctx.font = "bold 16px system-ui";
  ctx.fillText(`${fps} FPS`, 18, 28);

  drawKey(showKey, mouseX, mouseY, signTip, pinchCenter);
  drawKey(exitKey, mouseX, mouseY, signTip, pinchCenter);

  if (showKeys) {
    // textbox strip at top (like Python textBox)
    ctx.fillStyle = "rgba(255,255,255,.92)";
    roundRect(40, 230, W - 80, 56, 10);
    ctx.fill();
    ctx.fillStyle = "#111";
    ctx.font = "22px system-ui";
    ctx.fillText(typedText || "Type with your hand or mouse…", 56, 266);

    for (const k of keys) drawKey(k, mouseX, mouseY, signTip, pinchCenter);
  }
  ctx.restore();

  requestAnimationFrame(loop);
}

function drawKey(k, mx, my, fingertip, pinch) {
  const hovered =
    isOver(k, mx, my) ||
    (fingertip.visible && isOver(k, fingertip.x, fingertip.y)) ||
    (pinch && isOver(k, pinch.x, pinch.y));
  const flashed = k._flash && performance.now() - k._flash < 250;
  let alpha = hovered ? 0.9 : 0.5;
  // key body (white with alpha like cv2.addWeighted)
  ctx.fillStyle = flashed ? "rgba(74,222,128,.95)" : `rgba(255,255,255,${hovered ? 0.9 : 0.55})`;
  roundRect(k.x, k.y, k.w, k.h, 8);
  ctx.fill();
  ctx.strokeStyle = hovered ? "#4ade80" : "rgba(0,0,0,.35)";
  ctx.lineWidth = hovered ? 3 : 1.5;
  roundRect(k.x, k.y, k.w, k.h, 8);
  ctx.stroke();
  // label
  ctx.fillStyle = flashed ? "#06210f" : "#111";
  ctx.font = `${k.text.length > 3 ? "bold 15px" : "bold 20px"} system-ui`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(k.text, k.x + k.w / 2, k.y + k.h / 2 + 1);
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  void alpha;
}

function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// ----- Buttons -----
startBtn.addEventListener("click", startCamera);
stopBtn.addEventListener("click", stopCamera);
toggleKeysBtn.addEventListener("click", toggleShow);
clearBtn.addEventListener("click", () => { typedText = ""; renderTextbox(); });
copyBtn.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(typedText);
    copyBtn.textContent = "Copied!";
    setTimeout(() => (copyBtn.textContent = "Copy"), 1200);
  } catch { showError("Copy failed — select the text manually."); }
});
document.addEventListener("keydown", (e) => {
  if (e.key.length === 1 && /[a-zA-Z ]/.test(e.key)) {
    if (typedText.length < MAX_LEN) {
      typedText += e.key.toUpperCase() === e.key && e.key !== " " ? e.key.toUpperCase() : e.key;
      // keep parity: original only A-Z; map lowercase to uppercase
      typedText = typedText.toUpperCase();
      renderTextbox();
    }
  } else if (e.key === "Backspace") {
    typedText = typedText.slice(0, -1);
    renderTextbox();
  }
});

renderTextbox();
initModel();
