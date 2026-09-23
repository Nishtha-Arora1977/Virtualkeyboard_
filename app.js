// Web port of virtualkeyboard.py — static, Vercel-ready.
// Hand tracking via @mediapipe/tasks-vision HandLandmarker (VIDEO mode).
// Default mode is TOUCH: hold your index fingertip on a key to type (dwell).
// Pinch mode (index+thumb) is still available via the Touch/Pinch toggle.

import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';

const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const textbox = document.getElementById('textbox');
const btnCamera = document.getElementById('btnCamera');
const btnShow = document.getElementById('btnShow');
const btnClear = document.getElementById('btnClear');
const btnBackspace = document.getElementById('btnBackspace');
const btnSpace = document.getElementById('btnSpace');
const fpsEl = document.getElementById('fps');
const statusEl = document.getElementById('status');
const pinchEl = document.getElementById('pinch');
const pinchRange = document.getElementById('pinchRange');
const pinchVal = document.getElementById('pinchVal');
const pinchWrap = document.getElementById('pinchWrap');
const dwellRange = document.getElementById('dwellRange');
const dwellVal = document.getElementById('dwellVal');
const dwellWrap = document.getElementById('dwellWrap');
const modeTouch = document.getElementById('modeTouch');
const modePinch = document.getElementById('modePinch');

let show = false;
let mode = 'touch'; // 'touch' (dwell, default) | 'pinch'
let keys = [];
let W = 960, H = 540;
// Raw + smoothed fingertip positions (smoothing kills jitter -> fewer neighbor hits)
let signTip = { x: 0, y: 0 };
let thumbTip = { x: 0, y: 0 };
let sSign = { x: 0, y: 0 };
let sThumb = { x: 0, y: 0 };
let smoothedInit = false;
let hasHand = false;

// Shared typing state
let lastTypedAt = 0;
let hoverKey = null;
let hoverStreak = 0;
let flashKey = null;
let flashAt = 0;
// Pinch mode state: only type on open->pinched EDGE, locked to one key per pinch.
let pinchHeld = false;
let lockedKey = null;
// Touch mode state: dwell progress per key, must leave key to retype.
let dwellKey = null;
let dwellStart = 0;
let dwellDoneKey = null;
let dwellProgress = 0;
let fpsSmooth = 60;
let lastTime = performance.now();
let landmarker = null;
let cameraOn = false;
let lastVideoTime = -1;
let PINCH_PX = 55;
let DWELL_MS = 700;
const PINCH_RELEASE_PAD = 18; // must open past PINCH+18 to re-arm (hysteresis)
const TYPE_COOLDOWN_MS = 800; // min gap between any two types (fixes double "NN")
const STABLE_FRAMES = 3; // index must sit on same key N frames before gesture counts
const SMOOTH = 0.55;

pinchRange.addEventListener('input', () => {
  PINCH_PX = Number(pinchRange.value);
  pinchVal.textContent = `${PINCH_PX}px`;
});
dwellRange.addEventListener('input', () => {
  DWELL_MS = Number(dwellRange.value);
  dwellVal.textContent = `${(DWELL_MS / 1000).toFixed(1)}s`;
});
function setMode(m) {
  mode = m;
  modeTouch.classList.toggle('seg-active', m === 'touch');
  modePinch.classList.toggle('seg-active', m === 'pinch');
  dwellWrap.hidden = m !== 'touch';
  pinchWrap.hidden = m !== 'pinch';
  // reset gesture state on switch so a held pinch/dwell can't carry over
  pinchHeld = false;
  lockedKey = null;
  dwellKey = null;
  dwellDoneKey = null;
  dwellProgress = 0;
  setStatus(m === 'touch' ? 'touch mode — hold fingertip on a key' : 'pinch mode — hover, then pinch + release');
}
modeTouch.addEventListener('click', () => setMode('touch'));
modePinch.addEventListener('click', () => setMode('pinch'));

function setStatus(msg) {
  statusEl.innerHTML = '<span class="dot"></span>' + msg;
}

function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function lerpPt(prev, next, t) {
  return { x: prev.x + (next.x - prev.x) * t, y: prev.y + (next.y - prev.y) * t };
}

function buildKeys() {
  const w = 80, h = 48;
  const gap = 5;
  const startX = 40, startY = 200;
  const out = [];
  const letters = 'QWERTYUIOPASDFGHJKLZXCVBNM'.split('');
  letters.forEach((l, i) => {
    if (i < 10) out.push({ x: startX + i * (w + gap), y: startY, w, h, text: l });
    else if (i < 19) out.push({ x: startX + (i - 10) * (w + gap), y: startY + h + gap, w, h, text: l });
    else out.push({ x: startX + (i - 19) * (w + gap), y: startY + 2 * (h + gap), w, h, text: l });
  });
  out.push({ x: startX + 25, y: startY + 3 * (h + gap) + 12, w: 5 * w, h, text: 'Space' });
  out.push({ x: startX + 5 * w + 30, y: startY + 3 * (h + gap) + 12, w: 2 * w, h, text: '<--' });
  out.push({ x: startX + 8 * w + 50, y: startY + 2 * (h + gap) + 8, w, h, text: 'clr' });
  return out;
}

function isOver(k, x, y) {
  return x > k.x && x < k.x + k.w && y > k.y && y < k.y + k.h;
}

function keyAt(x, y) {
  for (const k of keys) if (isOver(k, x, y)) return k;
  return null;
}

function typeText(t) {
  if (t === '<--') textbox.value = textbox.value.slice(0, -1);
  else if (t === 'clr') textbox.value = '';
  else if (textbox.value.length >= 30) return;
  else if (t === 'Space') textbox.value += ' ';
  else if (t.length === 1) textbox.value += t;
}

function drawKey(k, highlight, active, flashed, progress) {
  ctx.fillStyle = flashed
    ? 'rgba(34,197,94,0.9)'
    : active
      ? 'rgba(34,197,94,0.7)'
      : highlight
        ? 'rgba(34,197,94,0.4)'
        : 'rgba(255,255,255,0.55)';
  ctx.strokeStyle = flashed ? '#22c55e' : 'rgba(0,0,0,0.8)';
  ctx.lineWidth = flashed ? 3 : 2;
  ctx.beginPath();
  ctx.rect(k.x, k.y, k.w, k.h);
  ctx.fill();
  ctx.stroke();
  // dwell progress bar along the bottom of the hovered key (touch mode)
  if (progress > 0 && progress < 1) {
    ctx.fillStyle = '#22c55e';
    ctx.fillRect(k.x, k.y + k.h - 6, k.w * progress, 6);
  }
  ctx.fillStyle = '#000';
  ctx.font = 'bold 20px system-ui';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(k.text, k.x + k.w / 2, k.y + k.h / 2);
}

function detectFrame() {
  if (landmarker && cameraOn && video.readyState >= 2 && video.currentTime !== lastVideoTime) {
    lastVideoTime = video.currentTime;
    try {
      const res = landmarker.detectForVideo(video, performance.now());
      const lm = res.landmarks && res.landmarks[0];
      if (lm) {
        signTip = { x: (1 - lm[8].x) * W, y: lm[8].y * H };
        thumbTip = { x: (1 - lm[4].x) * W, y: lm[4].y * H };
        if (!smoothedInit) {
          sSign = { ...signTip };
          sThumb = { ...thumbTip };
          smoothedInit = true;
        } else {
          sSign = lerpPt(sSign, signTip, SMOOTH);
          sThumb = lerpPt(sThumb, thumbTip, SMOOTH);
        }
        hasHand = true;
        setStatus(mode === 'touch' ? 'hand detected — touch & hold a key' : 'hand detected — hover, then pinch + release');
      } else {
        hasHand = false;
        pinchHeld = false;
        lockedKey = null;
        hoverStreak = 0;
        dwellKey = null;
        dwellProgress = 0;
        setStatus('no hand — show palm 40-70cm, good light');
      }
    } catch (e) {
      console.error(e);
      setStatus( 'tracking error — see console');
    }
  }
}

function draw() {
  detectFrame();

  ctx.clearRect(0, 0, W, H);

  if (video.readyState >= 2 && video.videoWidth > 0) {
    ctx.save();
    ctx.translate(W, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0, W, H);
    ctx.restore();
  } else {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#fff';
    ctx.font = '22px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText('Press "Start Camera" and allow access', W / 2, H / 2);
  }

  // Smoothed FPS (was jumpy before)
  const now = performance.now();
  const inst = 1000 / Math.max(1, now - lastTime);
  lastTime = now;
  fpsSmooth = fpsSmooth * 0.9 + inst * 0.1;
  fpsEl.textContent = `${Math.round(fpsSmooth)} FPS`;

  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.fillRect(40, 140, 880, 48);
  ctx.fillStyle = '#000';
  ctx.font = '20px system-ui';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(textbox.value || '', 55, 164);

  if (!show) {
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#fff';
    ctx.font = '24px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText(mode === 'touch' ? 'Press "Show Keyboard", then touch & hold a key' : 'Press "Show Keyboard", hover a key, pinch then release', W / 2, H / 2);
    requestAnimationFrame(draw);
    return;
  }

  const pinchD = hasHand ? dist(sSign, sThumb) : NaN;
  if (mode === 'touch') {
    pinchEl.textContent = hasHand && dwellKey ? `hold: ${Math.round(dwellProgress * 100)}%` : 'touch: hold a key';
  } else {
    pinchEl.textContent = hasHand ? `pinch: ${Math.round(pinchD)}px` : 'pinch: —';
  }

  // Hover stability: index must rest on the same key a few frames (kills flicker to B/K).
  const curHover = hasHand ? keyAt(sSign.x, sSign.y) : null;
  if (curHover === hoverKey && curHover) hoverStreak += 1;
  else {
    hoverKey = curHover;
    hoverStreak = curHover ? 1 : 0;
  }
  const stableHover = hoverStreak >= STABLE_FRAMES ? hoverKey : null;
  const pinchCenter = hasHand ? { x: (sSign.x + sThumb.x) / 2, y: (sSign.y + sThumb.y) / 2 } : null;

  let activeKey = null;

  if (mode === 'touch') {
    // TOUCH (dwell): hold index on one key -> types once. Must leave key to retype.
    if (hasHand && stableHover) {
      if (dwellKey !== stableHover) {
        dwellKey = stableHover;
        dwellStart = now;
        dwellProgress = 0;
      } else {
        dwellProgress = Math.min(1, (now - dwellStart) / DWELL_MS);
        if (dwellProgress >= 1 && dwellDoneKey !== dwellKey && now - lastTypedAt > TYPE_COOLDOWN_MS) {
          typeText(dwellKey.text);
          lastTypedAt = now;
          flashKey = dwellKey;
          flashAt = now;
          dwellDoneKey = dwellKey; // require leaving the key before it can type again
        }
      }
    } else {
      dwellKey = null;
      dwellProgress = 0;
      if (!curHover) dwellDoneKey = null; // fully left keys -> re-arm
    }
    activeKey = dwellKey && dwellProgress > 0 ? dwellKey : null;
  } else {
    // PINCH: type exactly once per pinch edge, locked to one key.
    if (hasHand && !pinchHeld && pinchD < PINCH_PX && stableHover) {
      const target = stableHover || (pinchCenter ? keyAt(pinchCenter.x, pinchCenter.y) : null);
      if (target && now - lastTypedAt > TYPE_COOLDOWN_MS) {
        typeText(target.text);
        lastTypedAt = now;
        flashKey = target;
        flashAt = now;
      }
      pinchHeld = true;
      lockedKey = target; // lock: jitter to B/K while held is ignored
    } else if (pinchHeld && pinchD > PINCH_PX + PINCH_RELEASE_PAD) {
      pinchHeld = false; // must fully release before next type (fixes "NN")
      lockedKey = null;
    }
    activeKey = lockedKey;
  }

  if (hasHand) {
    if (mode === 'pinch' && pinchD < PINCH_PX + PINCH_RELEASE_PAD) {
      ctx.strokeStyle = pinchHeld ? '#22c55e' : '#eab308';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(sSign.x, sSign.y);
      ctx.lineTo(sThumb.x, sThumb.y);
      ctx.stroke();
      if (pinchCenter) {
        ctx.fillStyle = pinchHeld ? '#22c55e' : '#eab308';
        ctx.beginPath();
        ctx.arc(pinchCenter.x, pinchCenter.y, 7, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // Index fingertip is the cursor in both modes; thumb dot only matters for pinch.
    ctx.fillStyle = '#ff2fd6';
    ctx.beginPath();
    ctx.arc(sSign.x, sSign.y, 7, 0, Math.PI * 2);
    ctx.fill();
    if (mode === 'pinch') {
      ctx.fillStyle = 'rgba(255,47,214,0.55)';
      ctx.beginPath();
      ctx.arc(sThumb.x, sThumb.y, 6, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.strokeStyle = activeKey ? '#22c55e' : stableHover ? '#ffffff' : 'rgba(255,255,255,0.5)';
    ctx.lineWidth = activeKey ? 3 : 2;
    ctx.beginPath();
    ctx.arc(sSign.x, sSign.y, activeKey ? 16 : 13, 0, Math.PI * 2);
    ctx.stroke();
  }

  for (const k of keys) {
    const flashed = flashKey === k && now - flashAt < 350;
    const prog = mode === 'touch' && dwellKey === k ? dwellProgress : 0;
    drawKey(k, stableHover === k, activeKey === k, flashed, prog);
  }
  if (flashKey && now - flashAt >= 350) flashKey = null;

  requestAnimationFrame(draw);
}

async function createLandmarker() {
  const vision = await FilesetResolver.forVisionTasks(
    'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm'
  );
  const options = {
    baseOptions: {
      modelAssetPath:
        'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
      delegate: 'GPU',
    },
    runningMode: 'VIDEO',
    numHands: 1,
    minHandDetectionConfidence: 0.5,
    minHandPresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
  };
  try {
    return await HandLandmarker.createFromOptions(vision, options);
  } catch (e) {
    console.warn('GPU delegate failed, retrying CPU', e);
    options.baseOptions.delegate = 'CPU';
    return await HandLandmarker.createFromOptions(vision, options);
  }
}

async function startCamera() {
  try {
    if (location.protocol !== 'https:' && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
      setStatus( 'camera needs HTTPS — open the Vercel https URL');
      return;
    }
    setStatus( 'requesting camera…');
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 960 }, height: { ideal: 540 } },
      audio: false,
    });
    video.srcObject = stream;
    video.muted = true;
    await video.play();

    if (!landmarker) {
      setStatus( 'loading hand model…');
      landmarker = await createLandmarker();
    }
    cameraOn = true;
    setStatus( 'camera on — show your palm');
    btnCamera.textContent = 'Restart Camera';
  } catch (e) {
    console.error(e);
    if (e.name === 'NotAllowedError') setStatus( 'camera denied — click the camera icon → Allow, then Restart');
    else if (e.name === 'NotFoundError') setStatus( 'no camera found');
    else setStatus('failed: ' + (e.message || e));
  }
}

function canvasPoint(evt) {
  const r = canvas.getBoundingClientRect();
  return {
    x: (evt.clientX - r.left) * (W / r.width),
    y: (evt.clientY - r.top) * (H / r.height),
  };
}

canvas.addEventListener('pointerup', (evt) => {
  if (!show) return;
  const p = canvasPoint(evt);
  const k = keyAt(p.x, p.y);
  if (k) {
    typeText(k.text);
    flashKey = k;
    flashAt = performance.now();
  }
});

btnCamera.addEventListener('click', startCamera);
btnShow.addEventListener('click', () => {
  show = !show;
  btnShow.textContent = show ? 'Hide Keyboard' : 'Show Keyboard';
});
btnClear.addEventListener('click', () => { textbox.value = ''; });
btnBackspace.addEventListener('click', () => { textbox.value = textbox.value.slice(0, -1); });
btnSpace.addEventListener('click', () => { if (textbox.value.length < 30) textbox.value += ' '; });

keys = buildKeys();
W = canvas.width;
H = canvas.height;
requestAnimationFrame(draw);
