# Habits

A colorful yes/no daily habit tracker for your phone. Each habit has its own color, used on every screen, and your history builds up into calendars and charts. It works offline, needs no account, and keeps all data on the device.

## Screens

| Tab | What it shows |
|-----|---------------|
| **Today** | One card per habit with its 🔥 streak, plus a ring that fills one colored segment per habit done |
| **Calendar** | A month of colored flowers, one petal per habit, plus a summary of days done per habit |
| **History** | Weekly stacked bars and a completion trend (3 months, 6 months or 1 year), then each habit's stats and a 12-month heatmap |

## How to use

- **Tick a habit:** tap its card on **Today**. Tap again to undo.
- **Fix a past day:** use ‹ › or tap the date on **Today**, or tap a day on **Calendar**.
- **Look at one habit:** tap its chip on **Calendar**. Tapping a day then ticks or unticks that habit directly.
- **Change month:** use ‹ › or swipe sideways on **Calendar**.
- **See exact values:** tap a chart or heatmap square.
- **Add a habit:** tap **+ Add habit** at the bottom of **Today**.
- **Edit a habit:** tap **⋯** on its card to change the name, emoji or color, or to archive or delete it.

**Archive** hides a habit but keeps its history, and you can restore it from Settings. **Delete** removes the habit and all its history for good.

## How the numbers work

- **Streak:** days in a row done, counting back from today. If today isn't ticked yet, it counts from yesterday, so a streak doesn't drop to 0 every morning.
- **Best:** the longest streak ever.
- **7 / 30 / 90 days:** the share of those days done, counting only days since the habit started. Today only counts once it's ticked.

## Your data

Everything is stored on the phone, in the browser's local storage. Nothing is ever sent anywhere, and nothing is stored in this repo.

App updates don't touch your data, but clearing Chrome's data or changing phones erases it. To keep a copy, use **Settings → Export backup**, and **Import backup** to restore it. Importing replaces everything currently in the app.

## Install on Android

Open the GitHub Pages address in Chrome, then tap **⋮ → Install app**. The app then opens full-screen from your home screen and works offline.

## Files

| File | Purpose |
|------|---------|
| `index.html` | Page structure and the bottom tabs |
| `styles.css` | Colors (follows the phone's light or dark setting) and layout |
| `app.js` | Habits, streaks, stats, calendar and charts |
| `manifest.webmanifest` | App name, colors and icons for "Install app" |
| `sw.js` | Offline support |
| `icons/` | App icons (SVG source + 192 / 512 px PNG) |

There are no libraries and no build step.

After changing any app file, bump `VERSION` in `sw.js` (e.g. `'v3'` → `'v4'`) so installed copies update.

To try the charts with sample data, add `?demo` to the address and open Settings. **Load sample year** and **Reset everything** both replace your data, so don't use them on the copy you track with.

## Credits

Made by gionzana. If you enjoy it, you can [buy me a coffee](https://buymeacoffee.com/gionzana) ☕
