# ⌨️ Virtual Keyboard — Hand-Gesture Typing

> Type in mid-air. Pinch **index + thumb** over a key, or just click / tap.

[![Vercel Deploy](https://img.shields.io/badge/Vercel-Live-black?logo=vercel)](https://vercel.com)
[![Static Site](https://img.shields.io/badge/site-static_·_no_build-22c55e)](index.html)
[![Python](https://img.shields.io/badge/python-3.9%2B-3776AB?logo=python&logoColor=white)](virtualkeyboard.py)
[![MediaPipe](https://img.shields.io/badge/hand_tracking-MediaPipe-0097A7)](https://google.github.io/mediapipe/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

**Two apps, one repo:**

| App | Where it runs | Entry point |
|-----|---------------|-------------|
| 🌐 **Web demo** (Vercel-ready) | Browser, phone, Vercel static hosting | `index.html` → `app.js` |
| 🖥️ **Desktop** (OpenCV) | Local PC with webcam + Python | `virtualkeyboard.py` |

![Demo](rs%202.png)

---

## ✨ Features

- 👋 Real-time hand tracking (21 landmarks, MediaPipe Hands)
- 🤏 Pinch-to-type: thumb tip (4) + index tip (8), `< 50px`, 400 ms debounce
- 🖱️ Mouse / touch fallback — click any key
- 🔤 Full `QWERTYUIOP / ASDFGHJKL / ZXCVBNM` + `Space`, `clr`, `<--`
- 📝 On-screen text buffer (30 chars), live textbox overlay
- 📷 FPS counter, mirrored selfie view, Show / Hide keyboard
- ⌨️ Desktop mode actually presses keys via `pynput`
- 🚀 Zero-build static web app — deploys to Vercel in 1 click

## 🛠️ Tech stack

- **Web:** vanilla HTML/CSS/JS, `@mediapipe/hands` + `camera_utils` + `drawing_utils` via CDN, Canvas 2D, `getUserMedia`
- **Desktop:** Python, OpenCV (`cv2`), MediaPipe, NumPy, `pynput`
- **Hosting:** Vercel Static (no server, no build step)

## 📁 Project structure

```
Virtualkeyboard_/
├── index.html              # Vercel entry — web demo UI
├── app.js                  # Web hand-tracking + keyboard logic
├── styles.css              # Web styling
├── vercel.json             # Static rewrite config
├── package.json            # `npm run dev` helper (static server)
├── virtualkeyboard.py      # Desktop OpenCV app (local only)
├── HandTrackingModule.py   # HandDetector wrapper (MediaPipe)
├── keys.py                 # Key box class (draw + hit-test)
├── requirements.txt        # Python deps
├── rs 2.png                # Demo screenshot
├── favicon.svg             # Site icon (avoids 404)
├── LICENSE                 # MIT
├── CONTRIBUTING.md         # How to contribute
└── .github/workflows/ci.yml# Compile + syntax checks
```

## 🚀 Quick start — Web (recommended, works on Vercel)

No install. Just open the deployed URL, or run locally:

```bash
npm run dev
# → http://localhost:3000
# or: python3 -m http.server 3000
```

1. Click **Start Camera** → allow camera permission (HTTPS / localhost required).
2. Click **Show Keyboard**.
3. Hold hand up, pinch **index + thumb together over a key** to type.
4. Click / tap also types. `Space` adds space, `<--` deletes, `clr` clears.

> Tip: good lighting + plain background = best tracking. Keep hand 40–70 cm from camera.

### Vercel deploy settings

| Setting | Value |
|---------|-------|
| Framework Preset | `Other` |
| Root Directory | repo root |
| Build Command | *(empty)* |
| Output Directory | *(empty / `/`)* |
| Config file | `vercel.json` (already included) |

Import `Nishtha-Arora1977/Virtualkeyboard_` → Deploy. That's it.

## 🖥️ Quick start — Desktop (Python, local only)

Vercel **cannot** run this part — it needs a real webcam window + OS key presses.

```bash
pip install -r requirements.txt
python virtualkeyboard.py
```

Controls:

| Input | Action |
|-------|--------|
| Show / Hide button | Toggle keyboard overlay |
| Mouse move + left-click | Type |
| Index over key + thumb pinch | Type via gesture |
| `q` key / Exit button | Quit |

## 🧠 How it works

```
Webcam → MediaPipe Hands (21 pts) → landmarks 4 (thumb) + 8 (index)
  → scale to canvas → hit-test Key.isOver(x, y)
  → if BOTH tips in same key + dist < 50px + 400ms elapsed → typeText()
  → draw keys + pinch line + fingertips on canvas
```

Desktop mirrors this in OpenCV: `HandDetector.findHands` → `findPosition`
→ `calculateIntDistance` → per-key `isOver` → `pynput.Controller.press/release`.

## ⚙️ Configuration

Web (`app.js`):

```js
PINCH_PX = 50        // pinch threshold
DEBOUNCE_MS = 400    // per-key cooldown
MAX_LEN = 30         // textbox limit
minDetectionConfidence: 0.7
```

Desktop (`virtualkeyboard.py`):

```python
HandDetector(detectionCon=0.7)
PINCH < 50 px, debounce 0.4 s, len(text) < 30
```

## 🧪 Checks / CI

```bash
python3 -m py_compile virtualkeyboard.py keys.py HandTrackingModule.py
node --check app.js
npm run dev   # serve web demo
```

GitHub Actions (`.github/workflows/ci.yml`) runs the compile checks on every push.

## ❓ Troubleshooting

| Symptom | Fix |
|---------|-----|
| Vercel “no framework / build failed” | Use Framework `Other`, empty build command — this is a static site |
| Camera blocked | Serve over `https://` or `localhost`; allow permission in browser |
| No hand detected | Better light, show full palm, move closer, remove clutter |
| `ModuleNotFoundError: cv2` | `pip install -r requirements.txt`, Python 3.9+ |
| `HandTracker` import error (old code) | Fixed → now `from HandTrackingModule import HandDetector` |
| Typing too fast / double letters | Increase debounce in `app.js` / `virtualkeyboard.py` |

## 🗺️ Roadmap

- [ ] Numbers + punctuation row
- [ ] Word suggestions / swipe typing
- [ ] Two-hand support
- [ ] PWA offline mode
- [ ] Record demo GIF for README

## 🤝 Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). PRs welcome — run the checks above first.

## 📄 License

MIT — see [LICENSE](LICENSE).

## 👩‍💻 Author

**Nishtha Arora** — [@Nishtha-Arora1977](https://github.com/Nishtha-Arora1977)
Desktop OpenCV app + browser port, Vercel deployment.
