# Contributing

Thanks for stopping by! This repo has a **web demo** (Vercel static) + a **desktop** Python app.

## Quick setup

```bash
git clone https://github.com/Nishtha-Arora1977/Virtualkeyboard_.git
cd Virtualkeyboard_

# web (no install needed, optional static server)
npm run dev

# desktop
pip install -r requirements.txt
python virtualkeyboard.py
```

## Before you push

```bash
python3 -m py_compile virtualkeyboard.py keys.py HandTrackingModule.py
node --check app.js
```

Keep PRs focused: one feature / fix per PR, update `README.md` if behavior changes.

## Good first issues

- Add numbers / punctuation row to `app.js` + `virtualkeyboard.py`
- Improve low-light hand detection hints in README
- Record a demo GIF and link it in README
- PWA manifest / offline support

## Style

- Python: keep functions small, preserve `calculateIntDistance` alias for compat.
- JS: vanilla, no bundler — must stay Vercel static-friendly (CDN imports only).
