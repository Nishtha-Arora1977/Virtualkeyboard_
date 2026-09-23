// Web port of virtualkeyboard.py — static, Vercel-ready.
// Hand tracking via @mediapipe/tasks-vision HandLandmarker (VIDEO mode).

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

let show = false;
let keys = [];
let W = 960, H = 540;
let signTip = { x: 0, y: 0 };
let thumbTip = { x: 0, y: 0 };
let hasHand = false;
let previousClick = 0;
let lastTime = performance.now();
let landmarker = null;
let cameraOn = false;
let lastVideoTime = -1;
let PINCH_PX = 60;
const DEBOUNCE_MS = 400;

pinchRange.addEventListener('input', () => {
  PINCH_PX = Number(pinchRange.value);
  pinchVal.textContent = `${PINCH_PX}px`;
});

function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
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

function drawKey(k, highlight, pinching) {
  ctx.fillStyle = pinching ? 'rgba(34,197,94,0.75)' : highlight ? 'rgba(34,197,94,0.45)' : 'rgba(255,255,255,0.55)';
  ctx.strokeStyle = 'rgba(0,0,0,0.8)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.rect(k.x, k.y, k.w, k.h);
  ctx.fill();
  ctx.stroke();
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
        // Mirrored selfie view: flip x once to match displayed canvas.
        signTip = { x: (1 - lm[8].x) * W, y: lm[8].y * H };
        thumbTip = { x: (1 - lm[4].x) * W, y: lm[4].y * H };
        hasHand = true;
        statusEl.textContent = 'hand detected — pinch over a key';
      } else {
        hasHand = false;
        statusEl.textContent = 'no hand — show palm 40-70cm, good light';
      }
    } catch (e) {
      console.error(e);
      statusEl.textContent = 'tracking error — see console';
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

  const now = performance.now();
  const dt = (now - lastTime) / 1000;
  lastTime = now;
  fpsEl.textContent = `${dt > 0 ? Math.round(1 / dt) : 0} FPS`;

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
    ctx.fillText('Press "Show Keyboard", then pinch index + thumb over a key', W / 2, H / 2);
    requestAnimationFrame(draw);
    return;
  }

  const pinchD = hasHand ? dist(signTip, thumbTip) : NaN;
  pinchEl.textContent = hasHand ? `pinch: ${Math.round(pinchD)}px` : 'pinch: —';

  const hoverKey = hasHand ? keyAt(signTip.x, signTip.y) : null;
  const pinchCenter = hasHand ? { x: (signTip.x + thumbTip.x) / 2, y: (signTip.y + thumbTip.y) / 2 } : null;
  const pinchKey = hasHand && pinchD < PINCH_PX
    ? (hoverKey || (pinchCenter ? keyAt(pinchCenter.x, pinchCenter.y) : null))
    : null;

  if (hasHand) {
    if (pinchD < PINCH_PX) {
      ctx.strokeStyle = '#00ff00';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(signTip.x, signTip.y);
      ctx.lineTo(thumbTip.x, thumbTip.y);
      ctx.stroke();
      ctx.fillStyle = '#00ff00';
      ctx.beginPath();
      ctx.arc(pinchCenter.x, pinchCenter.y, 7, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#ff2fd6';
    for (const p of [signTip, thumbTip]) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 6, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.strokeStyle = pinchKey ? '#00ff00' : '#ffffff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(signTip.x, signTip.y, 12, 0, Math.PI * 2);
    ctx.stroke();
  }

  for (const k of keys) {
    drawKey(k, hoverKey === k, pinchKey === k);
    if (pinchKey === k && now - previousClick > DEBOUNCE_MS) {
      typeText(k.text);
      previousClick = now;
    }
  }

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
      statusEl.textContent = 'camera needs HTTPS — open the Vercel https URL';
      return;
    }
    statusEl.textContent = 'requesting camera…';
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 960 }, height: { ideal: 540 } },
      audio: false,
    });
    video.srcObject = stream;
    video.muted = true;
    await video.play();

    if (!landmarker) {
      statusEl.textContent = 'loading hand model…';
      landmarker = await createLandmarker();
    }
    cameraOn = true;
    statusEl.textContent = 'camera on — show your palm';
    btnCamera.textContent = 'Restart Camera';
  } catch (e) {
    console.error(e);
    if (e.name === 'NotAllowedError') statusEl.textContent = 'camera denied — click the camera icon → Allow, then Restart';
    else if (e.name === 'NotFoundError') statusEl.textContent = 'no camera found';
    else statusEl.textContent = 'failed: ' + (e.message || e);
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
  if (k) typeText(k.text);
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
