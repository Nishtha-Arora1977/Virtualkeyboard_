// Web port of virtualkeyboard.py — static, Vercel-ready.
// Debug build: on-screen log, HTTPS/camera checks, no-camera test + hand simulation.

const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const textbox = document.getElementById('textbox');
const btnCamera = document.getElementById('btnCamera');
const btnShow = document.getElementById('btnShow');
const btnClear = document.getElementById('btnClear');
const btnTest = document.getElementById('btnTest');
const btnSim = document.getElementById('btnSim');
const btnBackspace = document.getElementById('btnBackspace');
const btnSpace = document.getElementById('btnSpace');
const fpsEl = document.getElementById('fps');
const statusEl = document.getElementById('status');
const pinchEl = document.getElementById('pinch');
const pinchRange = document.getElementById('pinchRange');
const pinchVal = document.getElementById('pinchVal');
const debugLog = document.getElementById('debugLog');

let show = false;
let keys = [];
let W = 960, H = 540;
let signTip = { x: 0, y: 0 };
let thumbTip = { x: 0, y: 0 };
let hasHand = false;
let simulated = false;
let previousClick = 0;
let lastTime = performance.now();
let hands = null;
let sending = false;
let framesSent = 0;
let resultsSeen = 0;
let PINCH_PX = 60;
const DEBOUNCE_MS = 400;

function log(msg, isErr) {
  const t = new Date().toLocaleTimeString();
  const line = `[${t}] ${msg}`;
  if (debugLog) {
    debugLog.textContent = (debugLog.textContent === 'waiting…' ? '' : debugLog.textContent + '\n') + line;
    debugLog.scrollTop = debugLog.scrollHeight;
  }
  if (isErr) console.error(line);
  else console.log(line);
}

window.addEventListener('error', (e) => log('Window error: ' + (e.message || e.error), true));

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

function draw() {
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
    ctx.fillText('Press "Start Camera" and allow access', W / 2, H / 2 - 10);
    ctx.font = '16px system-ui';
    ctx.fillStyle = '#9aa5bb';
    ctx.fillText('No camera? Use Test Typing / Simulate Hand below', W / 2, H / 2 + 18);
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
    ctx.fillStyle = simulated ? '#ff9f00' : '#ff2fd6';
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
    const isHover = hoverKey === k;
    const isPinch = pinchKey === k;
    drawKey(k, isHover, isPinch);
    if (isPinch && now - previousClick > DEBOUNCE_MS) {
      typeText(k.text);
      log(`typed '${k.text}' via pinch (dist ${Math.round(pinchD)}px)`);
      previousClick = now;
    }
  }

  requestAnimationFrame(draw);
}

function onResults(results) {
  sending = false;
  resultsSeen += 1;
  if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
    const lm = results.multiHandLandmarks[0];
    signTip = { x: (1 - lm[8].x) * W, y: lm[8].y * H };
    thumbTip = { x: (1 - lm[4].x) * W, y: lm[4].y * H };
    if (!hasHand) log('hand detected');
    hasHand = true;
    simulated = false;
    statusEl.textContent = 'hand detected — pinch over a key';
  } else {
    if (hasHand && !simulated) log('hand lost');
    if (!simulated) {
      hasHand = false;
      statusEl.textContent = 'no hand — show palm 40-70cm, good light';
    }
  }
}

async function pump() {
  if (hands && video.readyState >= 2 && !sending) {
    sending = true;
    framesSent += 1;
    try {
      await hands.send({ image: video });
    } catch (e) {
      sending = false;
      log('hands.send failed: ' + e.message, true);
      statusEl.textContent = 'model error: ' + e.message;
      return;
    }
    if (framesSent === 1) log('first frame sent to model');
    if (framesSent === 30) {
      log(`30 frames sent, results callbacks: ${resultsSeen}, video ${video.videoWidth}x${video.videoHeight}, readyState ${video.readyState}`);
      if (resultsSeen === 0) {
        log('WARNING: model got 30 frames but zero callbacks — CDN/WASM likely blocked. Try Chrome, disable adblock, check console.', true);
        statusEl.textContent = 'model not responding — see Debug';
      }
    }
  }
  setTimeout(pump, 50);
}

async function startCamera() {
  log(`Start clicked. protocol=${location.protocol}, host=${location.host}`);
  if (location.protocol !== 'https:' && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
    const msg = 'Camera needs HTTPS or localhost — you are on ' + location.protocol;
    log(msg, true);
    statusEl.textContent = msg;
  }
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    const msg = 'getUserMedia not supported in this browser — use Chrome/Edge on HTTPS';
    log(msg, true);
    statusEl.textContent = msg;
    return;
  }
  if (typeof Hands === 'undefined') {
    const msg = 'MediaPipe Hands CDN failed to load (Hands undefined) — adblock or offline?';
    log(msg, true);
    statusEl.textContent = msg;
    return;
  }
  try {
    statusEl.textContent = 'requesting camera…';
    log('requesting getUserMedia…');
    const stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 960 }, height: { ideal: 540 } }, audio: false });
    video.srcObject = stream;
    video.muted = true;
    await video.play();
    log(`camera on: ${video.videoWidth}x${video.videoHeight}, readyState ${video.readyState}`);

    statusEl.textContent = 'loading hand model…';
    log('creating Hands, loading WASM from jsdelivr…');
    hands = new Hands({
      locateFile: (f) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1675469240/${f}`,
    });
    hands.setOptions({ maxNumHands: 1, minDetectionConfidence: 0.5, minTrackingConfidence: 0.5 });
    hands.onResults(onResults);

    framesSent = 0;
    resultsSeen = 0;
    sending = false;
    pump();
    statusEl.textContent = 'camera on — show your palm';
    btnCamera.textContent = 'Restart Camera';
    log('model created, pump started — show your palm 40-70cm in good light');
  } catch (e) {
    log('camera/model failed: ' + (e.name + ': ' + e.message), true);
    if (e.name === 'NotAllowedError') statusEl.textContent = 'camera denied — click the camera icon in address bar → Allow, then Restart';
    else if (e.name === 'NotFoundError') statusEl.textContent = 'no camera found';
    else statusEl.textContent = 'failed: ' + e.message;
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
    log(`typed '${k.text}' via click`);
  }
});

btnCamera.addEventListener('click', startCamera);
btnShow.addEventListener('click', () => {
  show = !show;
  btnShow.textContent = show ? 'Hide Keyboard' : 'Show Keyboard';
  log('keyboard ' + (show ? 'shown' : 'hidden'));
});
btnClear.addEventListener('click', () => { textbox.value = ''; });
btnBackspace.addEventListener('click', () => { textbox.value = textbox.value.slice(0, -1); });
btnSpace.addEventListener('click', () => { if (textbox.value.length < 30) textbox.value += ' '; });

btnTest.addEventListener('click', () => {
  if (!show) { show = true; btnShow.textContent = 'Hide Keyboard'; }
  typeText('Q');
  log("Test Typing: typed 'Q' without camera — if you see Q above, clicking works; only hand tracking is broken.");
});

btnSim.addEventListener('click', () => {
  if (!show) { show = true; btnShow.textContent = 'Hide Keyboard'; }
  const q = keys.find((k) => k.text === 'Q');
  signTip = { x: q.x + q.w / 2, y: q.y + q.h / 2 };
  thumbTip = { x: signTip.x + 12, y: signTip.y + 8 };
  hasHand = true;
  simulated = true;
  previousClick = 0; // force immediate type on next frame
  statusEl.textContent = 'simulated hand — should type Q';
  log(`Simulate Hand: fake pinch on Q (dist ${Math.round(dist(signTip, thumbTip))}px) — watch for Q in a second; press again to stop.`);
  if (btnSim.dataset.on === '1') {
    btnSim.dataset.on = '';
    hasHand = false;
    simulated = false;
    btnSim.textContent = 'Simulate Hand';
    statusEl.textContent = 'simulation off';
  } else {
    btnSim.dataset.on = '1';
    btnSim.textContent = 'Stop Simulation';
  }
});

keys = buildKeys();
W = canvas.width;
H = canvas.height;
log(`app loaded. ${keys.length} keys. protocol=${location.protocol}. Click Show Keyboard, then Test Typing.`);
requestAnimationFrame(draw);

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { buildKeys, isOver, keyAt, dist, typeText };
}
