# Virtualkeyboard — touchless keyboard (web version, Vercel-ready)

Browser-based virtual keyboard using webcam + MediaPipe hand tracking.
Pinch thumb + index finger over a key to type. This is the deployable rewrite of the original OpenCV desktop app.

## Why this rewrite was needed

The original `virtualkeyboard.py` cannot run on Vercel because it is a **desktop** program:

| Original code | Why Vercel fails |
|---|---|
| `cv2.VideoCapture(0)` | No webcam on Vercel servers |
| `cv2.imshow / namedWindow / setMouseCallback / waitKey` | No GUI window on serverless |
| `while True:` infinite loop | Serverless functions time out (~10–60s) |
| `pynput.keyboard.Controller` | No OS keyboard to control in the cloud |
| No `package.json` / no HTML entry | Vercel doesn't know how to build it |

The fix: run hand-tracking **client-side in the browser** (video never leaves the user's machine) and host only static files (`index.html`, `app.js`, `styles.css`) on Vercel.

## Run locally

```bash
# from this folder
python3 -m http.server 8000
# open http://localhost:8000  (use HTTPS or localhost so camera works)
# click "Start camera"
```

> Camera requires a secure context: `localhost` or `https://`. `file://` will fail for `getUserMedia` in most browsers.

## Deploy to Vercel

Option A — drag & drop: https://vercel.com/new → upload this folder (or the repo).

Option B — CLI:

```bash
npm i -g vercel
vercel --prod
```

Option C — Git: push this folder to GitHub, then Vercel → New Project → Import repo. No build settings needed (static). Framework preset: **Other**.

## How it maps to the Python version

- QWERTY rows, `Space`, `clr`, `<--`, `Show/Hide`, `Exit`, 30-char textbox → same in `app.js`
- `calculateIntDidtance(...) < 50` pinch → `PINCH_THRESHOLD_PX = 50`
- `clickTime - previousClick > 0.4` debounce → `DEBOUNCE_MS = 400`
- `cv2.flip(frame, 1)` mirror → mirror checkbox (default on)
- FPS overlay, hover highlight (`alpha`), mouse fallback clicks → canvas rendering in `loop()`

## Original Python sources (reference only, not deployed)

- `virtualkeyboard.py` — desktop app (needs webcam + display, run with `python virtualkeyboard.py`)
- `HandTrackingModule.py` — MediaPipe wrapper (note: `virtualkeyboard.py` imports `handTracker`, but the file is named `HandTrackingModule` — fixed by web rewrite; to run desktop version rename import to `from HandTrackingModule import HandDetector`)
- `keys.py` — key box drawing

To run the desktop version locally (not on Vercel):

```bash
pip install opencv-python mediapipe numpy pynput
python virtualkeyboard.py
```

## Test

Manual: open the page, start camera, hover/pinch over keys, check textbox, copy/clear, Show/Hide, Exit, FPS counter.
