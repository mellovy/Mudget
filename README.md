# Mudget

A cycle-based budgeting app for people who struggle to save. Set how much you get and how often, split it into envelopes, log spends, and watch your savings bank itself automatically. Works fully offline once installed — no account, no subscription, no ads, your data never leaves your phone.

**Live app:** https://mellovy.github.io/Mudget/

---

## Install on iPhone (Safari)

1. Open **https://mellovy.github.io/Mudget/** in **Safari** (must be Safari — Chrome on iOS can't install PWAs to the home screen).
2. Tap the **Share** icon at the bottom of the screen (square with an arrow pointing up).
3. Scroll down and tap **Add to Home Screen**.
4. Tap **Add** in the top right.

Mudget now sits on your home screen as a real app icon. It opens fullscreen with no browser bar and works completely offline.

## Install on Android (Chrome)

1. Open **https://mellovy.github.io/Mudget/** in **Chrome**.
2. Tap the **⋮** menu in the top right.
3. Tap **Install app** (or **Add to Home screen**, depending on your Chrome version).
4. Confirm the install prompt.

Chrome will sometimes suggest installing automatically after you visit a couple times — you can tap that banner instead of going through the menu.

---

## Updating the app

When new changes are pushed to this repo, GitHub Pages takes 1–2 minutes to rebuild. After that:

- **Just reopening the app or refreshing the tab is enough** — the service worker always fetches the latest version when you have signal, and only falls back to the cached version if you're offline.
- If something still looks stale, fully close the app (don't just background it) and reopen it once more.

## Your data

Everything — cycle settings, envelopes, logs, saved totals, cycle history — is stored locally on your device only (`localStorage`), never sent to a server. That means:

- Installing on a second device starts a **separate, independent** budget — nothing syncs between phones.
- If you clear Safari/Chrome site data for this page, or uninstall the app, your budget data is gone for good.
- **Settings → Delete All Data** inside the app wipes everything and returns you to first-time setup. This cannot be undone.

## Customizing your setup

Open the ⚙ icon on the Home tab to change:

- Cycle amount, length, and save target
- Envelope names, colors, and amounts
- Appearance — dark/light mode and accent color

---

## For development

This is a static PWA — plain HTML/CSS/JS, no build step, no dependencies.

```
index.html      — structure
style.css       — styling, themes, layout
app.js          — all app logic and state
manifest.json   — home screen install metadata
sw.js           — offline caching / service worker
icons/          — app icons
```

To test locally, serve the folder with any static server (e.g. `python3 -m http.server`) and open it in a browser — PWA install prompts require HTTPS, so full install testing needs it deployed (e.g. GitHub Pages) or run via `localhost`, which browsers treat as a secure context.
