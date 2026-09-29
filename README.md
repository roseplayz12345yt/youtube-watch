# RoseTube

A signed-in YouTube search and watch site for GitHub Pages.

Create an account in the browser, search videos, and play them with the official YouTube embed player. Watch history and saved videos stay on the device that signed in.

## Live site

After GitHub Pages is on:

https://roseplayz12345yt.github.io/youtube-watch/

## Enable GitHub Pages

1. Open the repo **Settings → Pages**.
2. Under **Build and deployment**, set **Source** to **Deploy from a branch**.
3. Branch: `main`, folder: `/ (root)`.
4. Save. The site is usually live within a minute.

Or set Source to **GitHub Actions** if you want the workflow in `.github/workflows/pages.yml` to publish it.

## How search works

- Default: public [Invidious](https://docs.invidious.io/api/) instances (no API key).
- Optional: paste a [YouTube Data API v3](https://console.cloud.google.com/apis/library/youtube.googleapis.com) key in **Settings**. The key never leaves this browser.

Playback uses `youtube-nocookie.com/embed`, which is YouTube’s official embed player.

## Accounts

Sign-in is local only (`localStorage`). There is no server database. Accounts do not sync across phones or browsers.

## Files

- `index.html` — layout
- `styles.css` — dark UI
- `app.js` — auth, search, player, library
