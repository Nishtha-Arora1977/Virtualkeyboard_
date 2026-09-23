// Web port of virtualkeyboard.py — runs on Vercel as a static site.
// Uses MediaPipe Hands (CDN) + getUserMedia. No build step.

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

let show = false;
let keys = [];
let W = 960, H = 540;
let signTip = { x: 0, y: 0 };
let thumbTip = { x: 0, y: 0 };
let hasHand = false;
let previousClick = 0;
let lastTime = performance.now();
let camera = null;

function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function buildKeys() {
  // Mirror of Python layout: w=80,h=60 scaled to canvas 960px wide.
  // Python used frameWidth*1.5; here we fit to canvas with scale factor.
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

function typeText(t) {
  if (t === '<--') textbox.value = textbox.value.slice(0, -1);
  else if (t === 'clr') textbox.value = '';
  else if (textbox.value.length >= 30) return;
  else if (t === 'Space') textbox.value += ' ';
  else if (t.length === 1) textbox.value += t;
}

function drawKey(k, highlight) {
  ctx.fillStyle = highlight ? 'rgba(34,197,94,0.55)' : 'rgba(255,255,255,0.45)';
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
  // Un-mirror text (canvas is flipped via CSS, so draw flipped back)
  ctx.save();
  ctx.translate(k.x + k.w / 2, k.y + k.h / 2);
  ctx.scale(-1, 1);
  ctx.fillText(k.text, 0, 0);
  ctx.restore();
}

function draw() {
  // video is CSS-mirrored; canvas is also mirrored to match.
  ctx.clearRect(0, 0, W, H);
  ctx.drawImage(video, 0, 0, W, H);

  // FPS
  const now = performance.now();
  const dt = (now - lastTime) / 1000;
  lastTime = now;
  const fps = dt > 0 ? Math.round(1 / dt) : 0;
  fpsEl.textContent = `${fps} FPS`;

  // Text box strip (like Python textBox)
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.fillRect(40, 140, 880, 48);
  ctx.fillStyle = '#000';
  ctx.font = '20px system-ui';
  ctx.textAlign = 'left';
  ctx.save();
  ctx.translate(480, 164);
  ctx.scale(-1, 1);
  ctx.fillText((textbox.value || '').split('').reverse().join(''), -430, 0);
  ctx.restore();

  if (!show) {
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#fff';
    ctx.font = '24px system-ui';
    ctx.textAlign = 'center';
    ctx.save();
    ctx.translate(W / 2, H / 2);
    ctx.scale(-1, 1);
    ctx.fillText('Press "Show Keyboard" then pinch index + thumb over a key', 0, 0);
    ctx.restore();
    requestAnimationFrame(draw);
    return;
  }

  // Pinch visual
  if (hasHand && dist(signTip, thumbTip) < 50) {
    ctx.strokeStyle = '#00ff00';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(signTip.x, signTip.y);
    ctx.lineTo(thumbTip.x, thumbTip.y);
    ctx.stroke();
    const cx = (signTip.x + thumbTip.x) / 2;
    const cy = (signTip.y + thumbTip.y) / 2;
    ctx.fillStyle = '#00ff00';
    ctx.beginPath();
    ctx.arc(cx, cy, 6, 0, Math.PI * 2);
    ctx.fill();
  }

  if (hasHand) {
    ctx.fillStyle = '#ff00ff';
    [signTip, thumbTip].forEach((p) => {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 6, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  for (const k of keys) {
    const hover = hasHand && (isOver(k, signTip.x, signTip.y));
    drawKey(k, hover);
    // pinch-to-type: both tips over same key + debounce
    if (hasHand && isOver(k, signTip.x, signTip.y) && isOver(k, thumbTip.x, thumbTip.y)) {
      const t = performance.now();
      if (t - previousClick > 400) {
        typeText(k.text);
        previousClick = t;
      }
    }
  }

  requestAnimationFrame(draw);
}

function onResults(results) {
  if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
    const lm = results.multiHandLandmarks[0];
    // landmarks are normalized 0..1; scale to canvas. Note: video is mirrored
    // via CSS, MediaPipe coords are unmirrored, so flip x.
    const sx = (1 - lm[8].x) * W;
    const sy = lm[8].y * H;
    const tx = (1 - lm[4].x) * W;
    const ty = lm[4].y * H;
    signTip = { x: sx, y: sy };
    thumbTip = { x: tx, y: ty };
    hasHand = true;
    statusEl.textContent = 'hand detected';
  } else {
    hasHand = false;
    statusEl.textContent = 'no hand';
  }
}

async function startCamera() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 960, height: 540 } });
    video.srcObject = stream;
    await video.play();
    statusEl.textContent = 'camera on — loading hand model…';

    const hands = new Hands({
      locateFile: (f) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1675469240/${f}`,
    });
    hands.setOptions({ maxNumHands: 1, minDetectionConfidence: 0.7, minTrackingConfidence: 0.5 });
    hands.onResults(onResults);

    camera = new Camera(video, {
      onFrame: async () => { await hands.send({ image: video }); },
      width: 960,
      height: 540,
    });
    camera.start();
    statusEl.textContent = 'camera on';
    btnCamera.textContent = 'Restart Camera';
  } catch (e) {
    statusEl.textContent = 'camera blocked: ' + e.message;
  }
}

// Mouse / touch fallback (canvas coords account for CSS mirror)
function canvasPoint(evt) {
  const r = canvas.getBoundingClientRect();
  const cx = (evt.clientX - r.left) * (W / r.width);
  // mirrored display → flip x back to internal coords
  return { x: W - cx, y: (evt.clientY - r.top) * (H / r.height) };
}

canvas.addEventListener('pointerup', (evt) => {
  if (!show) return;
  const p = canvasPoint(evt);
  for (const k of keys) {
    if (isOver(k, p.x, p.y)) {
      typeText(k.text);
      break;
    }
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
