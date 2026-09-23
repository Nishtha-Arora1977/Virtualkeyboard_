# Virtualkeyboard_

Hand-gesture virtual keyboard — desktop (Python + OpenCV) + web (Vercel-ready).

## Why Vercel was failing
Vercel hosts **web** projects (static HTML / Node). This repo only had Python
(`virtualkeyboard.py` needs a local webcam, OpenCV GUI windows, `pynput`) —
there was no `index.html` / framework entry, so Vercel had nothing to build
or serve. Python OpenCV + `cv2.imshow` can never run on Vercel's servers.

Fix: added a browser port (`index.html` + `app.js` + `styles.css`) using
MediaPipe Hands via CDN + `getUserMedia`. It runs 100% client-side, so Vercel
can deploy it as a static site. The Python version is kept for local use.

## Web demo (Vercel)
- Entry: `index.html` (static, no build). Config: `vercel.json`.
- Vercel settings: Framework Preset = **Other**, Root Directory = repo root,
  Build Command = empty, Output = `/`.
- Flow: Start Camera → Show Keyboard → pinch **index tip + thumb** over a key
  (50px threshold, 400ms debounce) or click/tap. Max 30 chars.

## Desktop (Python, local only — not on Vercel)
```bash
pip install -r requirements.txt
python virtualkeyboard.py
# q or Exit button to quit, needs webcam
```

Files:
- `virtualkeyboard.py` — fixed imports (`HandDetector`), distance math,
  mouse vars, `press+release` handling
- `HandTrackingModule.py` — MediaPipe kwargs API, robust `findPosition`
- `keys.py` — clipped `drawKey`
- `index.html` / `app.js` / `styles.css` — Vercel static app
