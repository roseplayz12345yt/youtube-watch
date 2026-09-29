# RoseTube

A signed-in YouTube search and watch site. Encrypted accounts sync through **your Google Drive**, so the same username and password work on another phone or computer.

Live site (after GitHub Pages is on):

https://roseplayz12345yt.github.io/youtube-watch/

Owner Drive folder:

https://drive.google.com/drive/folders/1AmCZxyFJjbiFZMBhokKvHzcjIRCb3e8f

## Enable GitHub Pages

1. Repo **Settings → Pages**
2. Source: **Deploy from a branch**
3. Branch: `main`, folder: `/ (root)`

## Turn on Google Drive sync

Google requires an OAuth client ID for the website to write to Drive.

1. Open [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
2. Create a project (or pick one)
3. Enable **Google Drive API**
4. Create credentials → **OAuth client ID** → Application type **Web application**
5. Authorized JavaScript origins:
   - `https://roseplayz12345yt.github.io`
   - `http://localhost:5500` if you test locally
6. Copy the client ID (`….apps.googleusercontent.com`)
7. Paste it into RoseTube → **Connect Google Drive**
8. Approve Drive access

The site creates a `RoseTube Cloud/accounts-vault.json` file in that Google account.

## How logins are stored

- Password is never uploaded as text
- The browser derives a key with PBKDF2 and encrypts the account with AES-GCM
- Only the encrypted blob is written to Drive
- History and saved videos ride along in that same encrypted vault

On another device: connect the **same Google account**, then sign in with the same RoseTube username and password.

## Files

- `index.html` — layout
- `styles.css` — dark UI
- `app.js` — auth, Drive vault, search, player
