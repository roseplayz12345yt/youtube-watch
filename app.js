const USERS_KEY = "rosetube_users_v1";
const SESSION_KEY = "rosetube_session_v1";
const CLIENT_KEY = "rosetube_google_client_id";
const DRIVE_FOLDER = "RoseTube Cloud";
const DRIVE_FILE = "accounts-vault.json";
const KDF_ITERS = 150000;

const FEATURED_TWITCH = [
  { channel: "xqc", title: "xQc" },
  { channel: "kai_cenat", title: "Kai Cenat" },
  { channel: "shroud", title: "shroud" },
  { channel: "pokimane", title: "pokimane" },
  { channel: "lol", title: "League of Legends" },
  { channel: "valorant", title: "VALORANT" },
  { channel: "eslcs", title: "ESL CS" },
  { channel: "twitch", title: "Twitch" },
];

const INVIDIOUS_INSTANCES = [
  "https://invidious.f5.si",
  "https://inv.nadeko.net",
  "https://invidious.nerdvpn.de",
  "https://yt.artemislena.eu",
  "https://invidious.materialio.us",
  "https://iv.ggtyler.dev",
  "https://invidious.darkness.services",
];

const els = {
  auth: document.getElementById("auth-screen"),
  app: document.getElementById("app"),
  loginForm: document.getElementById("login-form"),
  registerForm: document.getElementById("register-form"),
  authError: document.getElementById("auth-error"),
  searchForm: document.getElementById("search-form"),
  searchInput: document.getElementById("search-input"),
  greeting: document.getElementById("greeting"),
  userLabel: document.getElementById("user-label"),
  userAvatar: document.getElementById("user-avatar"),
  homeView: document.getElementById("home-view"),
  resultsView: document.getElementById("results-view"),
  watchView: document.getElementById("watch-view"),
  listView: document.getElementById("list-view"),
  homeRail: document.getElementById("home-rail"),
  resultsGrid: document.getElementById("results-grid"),
  resultsTitle: document.getElementById("results-title"),
  resultsMeta: document.getElementById("results-meta"),
  listTitle: document.getElementById("list-title"),
  listGrid: document.getElementById("list-grid"),
  player: document.getElementById("player"),
  watchTitle: document.getElementById("watch-title"),
  watchAuthor: document.getElementById("watch-author"),
  watchStats: document.getElementById("watch-stats"),
  watchDesc: document.getElementById("watch-desc"),
  saveBtn: document.getElementById("save-btn"),
  openYt: document.getElementById("open-yt"),
  related: document.getElementById("related-list"),
  settingsModal: document.getElementById("settings-modal"),
  apiKeyInput: document.getElementById("api-key-input"),
  toast: document.getElementById("toast"),
  driveStatus: document.getElementById("drive-status"),
  driveBtn: document.getElementById("drive-connect-btn"),
  clientIdInput: document.getElementById("google-client-id"),
  settingsClientId: document.getElementById("settings-client-id"),
  settingsDriveStatus: document.getElementById("settings-drive-status"),
  twitchChat: document.getElementById("twitch-chat"),
  relatedHeading: document.getElementById("related-heading"),
};

let currentUser = null;
let currentVideo = null;
let sessionPassword = "";
let mediaSource = "youtube";
let drive = { token: "", email: "", folderId: "", fileId: "", vault: null };

function toast(msg) {
  els.toast.textContent = msg;
  els.toast.classList.remove("hidden");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => els.toast.classList.add("hidden"), 2400);
}

function showAuthError(msg) {
  els.authError.hidden = !msg;
  els.authError.textContent = msg || "";
}

function getClientId() {
  return (els.clientIdInput?.value || localStorage.getItem(CLIENT_KEY) || "").trim();
}

function setClientId(id) {
  localStorage.setItem(CLIENT_KEY, id);
  if (els.clientIdInput) els.clientIdInput.value = id;
  if (els.settingsClientId) els.settingsClientId.value = id;
}

function setDriveStatus(text, on) {
  els.driveStatus.textContent = text;
  els.driveStatus.classList.toggle("on", !!on);
  if (els.settingsDriveStatus) els.settingsDriveStatus.textContent = "Drive: " + text;
}

const textEnc = new TextEncoder();
const textDec = new TextDecoder();

function bytesToB64(bytes) {
  let s = "";
  const arr = new Uint8Array(bytes);
  for (let i = 0; i < arr.length; i++) s += String.fromCharCode(arr[i]);
  return btoa(s);
}

function b64ToBytes(b64) {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

async function deriveKey(password, salt, iterations) {
  const base = await crypto.subtle.importKey("raw", textEnc.encode(password), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

async function encryptPayload(password, obj) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt, KDF_ITERS);
  const cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, textEnc.encode(JSON.stringify(obj)));
  return { salt: bytesToB64(salt), iv: bytesToB64(iv), iterations: KDF_ITERS, cipher: bytesToB64(cipher) };
}

async function decryptPayload(password, rec) {
  const salt = b64ToBytes(rec.salt);
  const iv = b64ToBytes(rec.iv);
  const key = await deriveKey(password, salt, rec.iterations || KDF_ITERS);
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, b64ToBytes(rec.cipher));
  return JSON.parse(textDec.decode(plain));
}

function emptyVault() {
  return { v: 1, app: "rosetube", updatedAt: Date.now(), users: {} };
}

function loadUsers() {
  try { return JSON.parse(localStorage.getItem(USERS_KEY) || "{}"); } catch { return {}; }
}

function saveUsers(users) {
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
}

function dataKey(username) {
  return `rosetube_data_${username}`;
}

function loadData() {
  try { return JSON.parse(localStorage.getItem(dataKey(currentUser.username)) || "{}"); } catch { return {}; }
}

async function saveData(patch) {
  const data = { history: [], saved: [], settings: {}, ...loadData(), ...patch };
  localStorage.setItem(dataKey(currentUser.username), JSON.stringify(data));
  if (currentUser && sessionPassword) {
    try { await persistUserToStores(currentUser.username, sessionPassword, currentUser.displayName, data); }
    catch (err) { console.warn("Drive sync failed", err); }
  }
  return data;
}

async function persistUserToStores(username, password, displayName, profile) {
  const payload = {
    check: "RT_OK",
    displayName: displayName || username,
    createdAt: profile.createdAt || Date.now(),
    history: profile.history || [],
    saved: profile.saved || [],
    settings: profile.settings || {},
  };
  const sealed = await encryptPayload(password, payload);
  const localUsers = loadUsers();
  localUsers[username] = { username, displayName: payload.displayName, createdAt: payload.createdAt, ...sealed };
  saveUsers(localUsers);
  if (drive.token) {
    const vault = await readVault();
    vault.users[username] = { username, displayName: payload.displayName, updatedAt: Date.now(), ...sealed };
    vault.updatedAt = Date.now();
    await writeVault(vault);
  }
}

async function driveFetch(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: { Authorization: `Bearer ${drive.token}`, ...(options.headers || {}) },
  });
  if (res.status === 401) {
    drive.token = "";
    setDriveStatus("Session expired — reconnect", false);
    throw new Error("Google Drive session expired. Connect Drive again.");
  }
  return res;
}

async function connectDrive(promptUser = true) {
  const clientId = getClientId();
  if (!clientId) throw new Error("Paste a Google OAuth client ID first. See the README.");
  setClientId(clientId);
  if (!window.google?.accounts?.oauth2) throw new Error("Google sign-in is still loading. Try again in a second.");
  const token = await new Promise((resolve, reject) => {
    const client = google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: "https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.email",
      callback: (resp) => {
        if (resp.error) reject(new Error(resp.error));
        else resolve(resp.access_token);
      },
      error_callback: (err) => reject(new Error(err?.message || "Google Drive login was cancelled")),
    });
    client.requestAccessToken({ prompt: promptUser ? "consent" : "" });
  });
  drive.token = token;
  const me = await driveFetch("https://www.googleapis.com/oauth2/v2/userinfo").then((r) => r.json());
  drive.email = me.email || "connected";
  await ensureVaultFile();
  setDriveStatus(`Connected · ${drive.email}`, true);
  toast("Google Drive connected");
}

async function findFirst(q) {
  const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name)&pageSize=5&spaces=drive`;
  const data = await driveFetch(url).then((r) => r.json());
  return (data.files || [])[0] || null;
}

async function ensureVaultFile() {
  let folder = await findFirst(`name='${DRIVE_FOLDER}' and mimeType='application/vnd.google-apps.folder' and trashed=false`);
  if (!folder) {
    folder = await driveFetch("https://www.googleapis.com/drive/v3/files", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: DRIVE_FOLDER, mimeType: "application/vnd.google-apps.folder" }),
    }).then((r) => r.json());
  }
  drive.folderId = folder.id;
  let file = await findFirst(`name='${DRIVE_FILE}' and '${drive.folderId}' in parents and trashed=false`);
  if (!file) {
    const meta = { name: DRIVE_FILE, parents: [drive.folderId], mimeType: "application/json" };
    const form = new FormData();
    form.append("metadata", new Blob([JSON.stringify(meta)], { type: "application/json" }));
    form.append("file", new Blob([JSON.stringify(emptyVault())], { type: "application/json" }));
    file = await driveFetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart", {
      method: "POST",
      body: form,
    }).then((r) => r.json());
  }
  drive.fileId = file.id;
}

async function readVault() {
  if (!drive.fileId) return emptyVault();
  const res = await driveFetch(`https://www.googleapis.com/drive/v3/files/${drive.fileId}?alt=media`);
  if (!res.ok) return emptyVault();
  try {
    const vault = await res.json();
    drive.vault = vault.users ? vault : emptyVault();
    return drive.vault;
  } catch {
    return emptyVault();
  }
}

async function writeVault(vault) {
  drive.vault = vault;
  const res = await driveFetch(`https://www.googleapis.com/upload/drive/v3/files/${drive.fileId}?uploadType=media`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(vault),
  });
  if (!res.ok) throw new Error("Could not save the encrypted vault to Google Drive.");
}

async function lookupRecord(username) {
  const local = loadUsers()[username];
  if (drive.token) {
    const vault = await readVault();
    if (vault.users?.[username]) return vault.users[username];
  }
  return local || null;
}

async function register(username, password, displayName) {
  const key = username.toLowerCase();
  const existing = await lookupRecord(key);
  if (existing) throw new Error("That username is already taken.");
  const profile = { history: [], saved: [], settings: {}, createdAt: Date.now() };
  await persistUserToStores(key, password, displayName || username, profile);
  localStorage.setItem(dataKey(key), JSON.stringify(profile));
  return { username: key, displayName: displayName || username };
}

async function login(username, password) {
  const key = username.toLowerCase();
  const rec = await lookupRecord(key);
  if (!rec) throw new Error("No account found. Connect Google Drive if this account was created on another device.");
  let payload;
  try {
    payload = await decryptPayload(password, rec);
  } catch {
    throw new Error("Wrong password.");
  }
  if (payload.check !== "RT_OK") throw new Error("Wrong password.");
  const profile = {
    history: payload.history || [],
    saved: payload.saved || [],
    settings: payload.settings || {},
    createdAt: payload.createdAt,
  };
  localStorage.setItem(dataKey(key), JSON.stringify(profile));
  return { username: key, displayName: payload.displayName || rec.displayName || key };
}

function setSession(user, persist) {
  const payload = JSON.stringify({ username: user.username, persist: !!persist });
  sessionStorage.setItem(SESSION_KEY, payload);
  if (persist) localStorage.setItem(SESSION_KEY, payload);
  else localStorage.removeItem(SESSION_KEY);
}

function clearSession() {
  sessionStorage.removeItem(SESSION_KEY);
  localStorage.removeItem(SESSION_KEY);
}

function readSession() {
  try { return JSON.parse(sessionStorage.getItem(SESSION_KEY) || localStorage.getItem(SESSION_KEY) || "null"); }
  catch { return null; }
}

function showView(name) {
  for (const view of [els.homeView, els.resultsView, els.watchView, els.listView]) view.classList.add("hidden");
  document.getElementById(`${name}-view`).classList.remove("hidden");
}

function formatDuration(seconds) {
  if (!seconds && seconds !== 0) return "";
  const s = Number(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h) return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  return `${m}:${String(sec).padStart(2, "0")}`;
}

function formatCount(n) {
  const num = Number(n || 0);
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M views`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K views`;
  return `${num} views`;
}

function mediaKey(item) {
  if (item.source === "twitch") return item.videoId;
  return `yt:${item.videoId}`;
}

function twitchParents() {
  const host = location.hostname || "localhost";
  return [...new Set([host, "roseplayz12345yt.github.io", "localhost", "127.0.0.1"])];
}

function twitchParentQuery() {
  return twitchParents().map((p) => `parent=${encodeURIComponent(p)}`).join("&");
}

const TWITCH_GQL_CLIENT = "kimne78kx3ncx6brgo4mv6wki5h1ko";

function twitchThumb(channel) {
  return `https://static-cdn.jtvnw.net/previews-ttv/live_user_${channel}-440x248.jpg?t=${Date.now()}`;
}

function formatViewers(n) {
  const num = Number(n || 0);
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M watching`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K watching`;
  return `${num} watching`;
}

function twitchItem({ channel, title, kind = "channel", vodId, clipId, live, viewers, game, description, thumbnail, author }) {
  const login = String(channel || "").replace(/^#/, "").toLowerCase();
  if (kind === "video" && vodId) {
    return {
      source: "twitch",
      kind: "video",
      channel: login,
      videoId: `twitchvod:${vodId}`,
      vodId,
      title: title || `Twitch VOD ${vodId}`,
      author: author || login,
      thumbnail: thumbnail || twitchThumb(login),
      description,
    };
  }
  if (kind === "clip" && clipId) {
    return {
      source: "twitch",
      kind: "clip",
      channel: login,
      videoId: `twitchclip:${clipId}`,
      clipId,
      title: title || clipId,
      author: author || login,
      thumbnail: thumbnail || twitchThumb(login),
      description,
    };
  }
  return {
    source: "twitch",
    kind: "channel",
    channel: login,
    videoId: `twitch:${login}`,
    title: title || login,
    author: author || login,
    thumbnail: thumbnail || twitchThumb(login),
    publishedText: live ? formatViewers(viewers) : "Offline channel",
    live: !!live,
    viewers: viewers || 0,
    game: game || "",
    description: description || "",
  };
}

async function twitchGql(query, variables = {}) {
  const res = await fetch("https://gql.twitch.tv/gql", {
    method: "POST",
    headers: {
      "Client-ID": TWITCH_GQL_CLIENT,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(`Twitch lookup failed (${res.status})`);
  const data = await res.json();
  if (data.errors?.length) throw new Error(data.errors[0].message || "Twitch lookup failed");
  return data.data || {};
}

function itemFromGqlUser(user) {
  if (!user?.login) return null;
  const live = !!user.stream;
  return twitchItem({
    channel: user.login,
    title: live ? (user.stream.title || user.displayName) : user.displayName || user.login,
    author: user.displayName || user.login,
    live,
    viewers: user.stream?.viewersCount,
    game: user.stream?.game?.name,
    description: user.description || "",
    thumbnail: user.stream?.previewImageURL || twitchThumb(user.login),
  });
}

function parseTwitchInput(raw) {
  const q = (raw || "").trim();
  if (!q) return null;
  try {
    const url = new URL(q.startsWith("http") ? q : `https://${q}`);
    if (url.hostname.includes("clips.twitch.tv")) {
      const clipId = url.pathname.split("/").filter(Boolean)[0];
      if (clipId) return twitchItem({ channel: clipId, clipId, kind: "clip", title: clipId });
    }
    if (url.hostname.includes("twitch.tv")) {
      const parts = url.pathname.split("/").filter(Boolean);
      if (parts[0] === "videos" && parts[1]) {
        return twitchItem({ channel: "twitch", vodId: parts[1].replace(/^v/, ""), kind: "video" });
      }
      if (parts[1] === "videos" && parts[2] && /^\d+$/.test(parts[2].replace(/^v/, ""))) {
        return twitchItem({ channel: parts[0], vodId: parts[2].replace(/^v/, ""), kind: "video" });
      }
      if (parts[1] === "clip" && parts[2]) {
        return twitchItem({ channel: parts[0], clipId: parts[2], kind: "clip", title: parts[2] });
      }
      if (parts[0] && !["directory", "downloads", "p", "search", "settings"].includes(parts[0])) {
        return twitchItem({ channel: parts[0], title: parts[0] });
      }
    }
  } catch {
    /* not a url */
  }
  const login = q.replace(/^@/, "").replace(/^#/, "").trim().toLowerCase();
  if (/^[a-z0-9_]{3,25}$/.test(login)) return twitchItem({ channel: login, title: login });
  return null;
}

async function fetchLiveStreams(limit = 24) {
  try {
    const data = await twitchGql(`query ($n: Int!) {
      streams(first: $n) {
        edges {
          node {
            title
            viewersCount
            previewImageURL(width: 440, height: 248)
            broadcaster { login displayName description }
            game { name }
          }
        }
      }
    }`, { n: limit });
    return (data.streams?.edges || []).map((edge) => {
      const node = edge.node;
      if (!node?.broadcaster?.login) return null;
      return twitchItem({
        channel: node.broadcaster.login,
        title: node.title || node.broadcaster.displayName,
        author: node.broadcaster.displayName || node.broadcaster.login,
        live: true,
        viewers: node.viewersCount,
        game: node.game?.name,
        description: node.broadcaster.description || "",
        thumbnail: node.previewImageURL,
      });
    }).filter(Boolean);
  } catch (err) {
    console.warn("Live directory failed", err);
    return FEATURED_TWITCH.map((row) => twitchItem({ channel: row.channel, title: row.title }));
  }
}

async function hydrateTwitchChannel(item) {
  if (!item || item.kind !== "channel" || !item.channel) return item;
  try {
    const data = await twitchGql(`query ($login: String!) {
      user(login: $login) {
        login
        displayName
        description
        stream {
          title
          viewersCount
          previewImageURL(width: 440, height: 248)
          game { name }
        }
      }
    }`, { login: item.channel });
    return itemFromGqlUser(data.user) || item;
  } catch {
    return item;
  }
}

async function searchTwitch(query) {
  const q = (query || "").trim();
  const parsed = parseTwitchInput(q);
  if (parsed && parsed.kind !== "channel") return [parsed];
  if (!q) return fetchLiveStreams(24);

  const results = [];
  const seen = new Set();
  const push = (item) => {
    if (!item) return;
    const key = mediaKey(item);
    if (seen.has(key)) return;
    seen.add(key);
    results.push(item);
  };

  if (parsed) push(await hydrateTwitchChannel(parsed));

  try {
    const data = await twitchGql(`query ($q: String!) {
      searchFor(userQuery: $q, platform: "web") {
        channels {
          items {
            login
            displayName
            description
            stream {
              title
              viewersCount
              previewImageURL(width: 440, height: 248)
              game { name }
            }
          }
        }
      }
    }`, { q });
    (data.searchFor?.channels?.items || []).forEach((user) => push(itemFromGqlUser(user)));
  } catch (err) {
    console.warn("Twitch search failed", err);
  }

  const needle = q.toLowerCase();
  FEATURED_TWITCH.forEach((row) => {
    if (row.channel.includes(needle) || row.title.toLowerCase().includes(needle)) {
      push(twitchItem({ channel: row.channel, title: row.title }));
    }
  });

  results.sort((a, b) => Number(!!b.live) - Number(!!a.live) || (b.viewers || 0) - (a.viewers || 0));
  return results;
}

function videoCard(video) {
  const el = document.createElement("article");
  el.className = "card";
  const thumb = video.thumbnail || (video.source === "twitch"
    ? twitchThumb(video.channel)
    : `https://i.ytimg.com/vi/${video.videoId}/hqdefault.jpg`);
  const badge = video.source === "twitch"
    ? (video.live
      ? `<span class="duration live-badge">LIVE</span>`
      : `<span class="duration">${video.kind === "clip" ? "CLIP" : video.kind === "video" ? "VOD" : "TWITCH"}</span>`)
    : (video.lengthSeconds ? `<span class="duration">${formatDuration(video.lengthSeconds)}</span>` : "");
  el.innerHTML = `
    <div class="thumb" style="background-image:url('${thumb}')">${badge}</div>
    <div class="card-body"><h3></h3><p></p></div>`;
  el.querySelector("h3").textContent = video.title || "Untitled";
  el.querySelector("p").textContent = [
    video.source === "twitch" ? (video.game || video.author || "Twitch") : video.author,
    video.source === "twitch" && video.live ? formatViewers(video.viewers)
      : video.viewCount != null ? formatCount(video.viewCount) : video.publishedText || "",
  ].filter(Boolean).join(" • ");
  el.addEventListener("click", () => watchVideo(video));
  return el;
}

function renderGrid(target, videos, emptyText) {
  target.innerHTML = "";
  if (!videos.length) {
    target.innerHTML = `<p class="empty">${emptyText}</p>`;
    return;
  }
  videos.forEach((v) => target.appendChild(videoCard(v)));
}

function normalizeInvidious(item) {
  if (!item || (item.type && item.type !== "video" && !item.videoId)) return null;
  const videoId = item.videoId || item.videoID;
  if (!videoId) return null;
  const thumb = (item.videoThumbnails || []).find((t) => t.quality === "medium" || t.quality === "high") || (item.videoThumbnails || [])[0];
  return {
    videoId, title: item.title, author: item.author, authorId: item.authorId,
    description: item.description || "", lengthSeconds: item.lengthSeconds,
    viewCount: item.viewCount, publishedText: item.publishedText,
    thumbnail: thumb?.url || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
  };
}

function normalizeYoutubeApi(item) {
  const videoId = item.id?.videoId || item.id;
  if (!videoId || typeof videoId !== "string") return null;
  return {
    videoId, title: item.snippet?.title, author: item.snippet?.channelTitle,
    description: item.snippet?.description || "",
    thumbnail: item.snippet?.thumbnails?.high?.url || item.snippet?.thumbnails?.medium?.url || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
  };
}

async function fetchJson(url, ms = 8000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally { clearTimeout(t); }
}

async function searchYoutubeApi(query, key) {
  const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=24&q=${encodeURIComponent(query)}&key=${encodeURIComponent(key)}`;
  const data = await fetchJson(url, 10000);
  return (data.items || []).map(normalizeYoutubeApi).filter(Boolean);
}

async function searchInvidious(query) {
  const errors = [];
  for (const base of INVIDIOUS_INSTANCES) {
    try {
      const data = await fetchJson(`${base}/api/v1/search?q=${encodeURIComponent(query)}&type=video`);
      const videos = (Array.isArray(data) ? data : []).map(normalizeInvidious).filter(Boolean);
      if (videos.length) return videos;
    } catch (err) { errors.push(`${base}: ${err.message}`); }
  }
  throw new Error(`Could not reach a search server. ${errors[0] || ""}`.trim());
}

async function searchVideos(query) {
  const key = loadData().settings?.youtubeApiKey;
  if (key) {
    try { return await searchYoutubeApi(query, key); }
    catch (err) { console.warn("YouTube API search failed, falling back", err); }
  }
  return searchInvidious(query);
}

async function getVideoDetails(videoId) {
  for (const base of INVIDIOUS_INSTANCES) {
    try {
      const data = await fetchJson(`${base}/api/v1/videos/${encodeURIComponent(videoId)}`);
      const video = normalizeInvidious(data);
      if (!video) continue;
      video.description = data.description || video.description;
      video.related = (data.recommendedVideos || []).map(normalizeInvidious).filter(Boolean);
      return video;
    } catch { /* next */ }
  }
  return null;
}

function setTwitchChat(channel) {
  if (!els.twitchChat) return;
  if (!channel) {
    els.twitchChat.classList.add("hidden");
    els.twitchChat.src = "";
    return;
  }
  els.twitchChat.src = `https://www.twitch.tv/embed/${encodeURIComponent(channel)}/chat?${twitchParentQuery()}&darkpopout`;
  els.twitchChat.classList.remove("hidden");
}

async function watchVideo(video) {
  currentVideo = video;
  showView("watch");
  els.watchTitle.textContent = video.title || "Watch";
  els.watchAuthor.textContent = video.author || video.channel || "";
  els.watchStats.textContent = [video.viewCount != null ? formatCount(video.viewCount) : "", video.publishedText || ""].filter(Boolean).join(" • ");
  els.related.innerHTML = "";
  updateSaveButton();

  if (video.source === "twitch") {
    const pq = twitchParentQuery();
    if (video.kind === "video" && video.vodId) {
      els.player.src = `https://player.twitch.tv/?video=${encodeURIComponent(video.vodId)}&${pq}&autoplay=true&muted=false`;
      setTwitchChat(video.channel || "");
    } else if (video.kind === "clip" && video.clipId) {
      els.player.src = `https://clips.twitch.tv/embed?clip=${encodeURIComponent(video.clipId)}&${pq}&autoplay=true&muted=false`;
      setTwitchChat("");
    } else {
      els.player.src = `https://player.twitch.tv/?channel=${encodeURIComponent(video.channel)}&${pq}&autoplay=true&muted=false`;
      setTwitchChat(video.channel);
    }
    els.openYt.href = video.kind === "video"
      ? `https://www.twitch.tv/videos/${encodeURIComponent(video.vodId)}`
      : video.kind === "clip"
        ? `https://clips.twitch.tv/${encodeURIComponent(video.clipId)}`
        : `https://www.twitch.tv/${encodeURIComponent(video.channel)}`;
    els.openYt.textContent = "Open on Twitch";
    const status = video.kind === "channel"
      ? (video.live ? `${formatViewers(video.viewers)}${video.game ? ` · ${video.game}` : ""}` : "Channel may be offline — the player will show the last broadcast if available.")
      : "";
    els.watchStats.textContent = status;
    els.watchDesc.textContent = video.description || "Twitch live player with chat. Click another channel on the right to switch streams.";
    if (els.relatedHeading) els.relatedHeading.textContent = "More live streams";
    const related = (await fetchLiveStreams(12)).filter((row) => row.channel !== video.channel).slice(0, 8);
    related.forEach((item) => {
      const el = document.createElement("div");
      el.className = "related-item";
      el.innerHTML = `<div class="thumb" style="background-image:url('${item.thumbnail}')"></div><div><h4></h4><p></p></div>`;
      el.querySelector("h4").textContent = item.title;
      el.querySelector("p").textContent = item.live ? formatViewers(item.viewers) : "Twitch";
      el.addEventListener("click", () => watchVideo(item));
      els.related.appendChild(el);
    });
    if (video.kind === "channel") {
      const hydrated = await hydrateTwitchChannel(video);
      if (hydrated && currentVideo && currentVideo.videoId === video.videoId) {
        currentVideo = hydrated;
        els.watchTitle.textContent = hydrated.title || video.title;
        els.watchAuthor.textContent = hydrated.author || video.author || "";
        els.watchStats.textContent = hydrated.live
          ? `${formatViewers(hydrated.viewers)}${hydrated.game ? ` · ${hydrated.game}` : ""}`
          : "Offline right now — open the player anyway, or try another live channel.";
        if (hydrated.description) els.watchDesc.textContent = hydrated.description;
        updateSaveButton();
      }
    }
  } else {
    setTwitchChat("");
    els.player.src = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(video.videoId)}?autoplay=1&rel=0`;
    els.openYt.href = `https://www.youtube.com/watch?v=${encodeURIComponent(video.videoId)}`;
    els.openYt.textContent = "Open on YouTube";
    els.watchDesc.textContent = video.description || "Loading description…";
    if (els.relatedHeading) els.relatedHeading.textContent = "Up next";
    const details = await getVideoDetails(video.videoId);
    if (details) {
      currentVideo = { ...video, ...details };
      els.watchTitle.textContent = details.title || video.title;
      els.watchAuthor.textContent = details.author || video.author || "";
      els.watchStats.textContent = [details.viewCount != null ? formatCount(details.viewCount) : "", details.publishedText || ""].filter(Boolean).join(" • ");
      els.watchDesc.textContent = details.description || "No description.";
      (details.related || []).slice(0, 12).forEach((item) => {
        const row = document.createElement("div");
        row.className = "related-item";
        row.innerHTML = `<div class="thumb" style="background-image:url('${item.thumbnail}')"></div><div><h4></h4><p></p></div>`;
        row.querySelector("h4").textContent = item.title;
        row.querySelector("p").textContent = item.author || "";
        row.addEventListener("click", () => watchVideo(item));
        els.related.appendChild(row);
      });
      updateSaveButton();
    } else if (!video.description) {
      els.watchDesc.textContent = "No description available.";
    }
  }

  const data = loadData();
  const key = mediaKey(video);
  const history = (data.history || []).filter((v) => mediaKey(v) !== key);
  history.unshift({ ...video, watchedAt: Date.now() });
  await saveData({ history: history.slice(0, 80) });
}

function isSaved(videoId) {
  return (loadData().saved || []).some((v) => v.videoId === videoId || mediaKey(v) === videoId);
}

function updateSaveButton() {
  if (!currentVideo) return;
  els.saveBtn.textContent = isSaved(currentVideo.videoId) ? "Saved" : "Save";
}

async function toggleSave() {
  if (!currentVideo) return;
  const data = loadData();
  const saved = data.saved || [];
  const exists = saved.some((v) => v.videoId === currentVideo.videoId);
  const next = exists ? saved.filter((v) => v.videoId !== currentVideo.videoId) : [{ ...currentVideo, savedAt: Date.now() }, ...saved].slice(0, 100);
  await saveData({ saved: next });
  updateSaveButton();
  toast(exists ? "Removed from saved" : "Saved to your library");
}

function enterApp(user) {
  currentUser = user;
  els.auth.classList.add("hidden");
  els.app.classList.remove("hidden");
  els.userLabel.textContent = user.displayName || user.username;
  els.userAvatar.textContent = (user.displayName || user.username).slice(0, 1).toUpperCase();
  els.greeting.textContent = `Welcome back, ${user.displayName || user.username}`;
  renderHome();
}

async function renderHome() {
  showView("home");
  if (mediaSource === "twitch") {
    els.greeting.textContent = "Live on Twitch";
    els.homeRail.innerHTML = `<p class="empty">Loading live streams…</p>`;
    const live = await fetchLiveStreams(24);
    renderGrid(els.homeRail, live, "No live streams found right now. Search a channel name above.");
    return;
  }
  if (currentUser) {
    els.greeting.textContent = `Welcome back, ${currentUser.displayName || currentUser.username}`;
  }
  const history = loadData().history || [];
  if (!history.length) {
    els.homeRail.innerHTML = `<p class="empty">Search YouTube or switch to Twitch to watch live streams.</p>`;
    return;
  }
  renderGrid(els.homeRail, history.slice(0, 12), "");
}

async function runSearch(query) {
  showView("results");
  els.resultsTitle.textContent = mediaSource === "twitch" ? `Twitch · “${query}”` : `Results for “${query}”`;
  els.resultsMeta.textContent = "Searching…";
  els.resultsGrid.innerHTML = `<p class="empty">${mediaSource === "twitch" ? "Looking up Twitch channels…" : "Looking across YouTube mirrors…"}</p>`;
  try {
    const videos = mediaSource === "twitch" ? await searchTwitch(query) : await searchVideos(query);
    const liveCount = videos.filter((v) => v.live).length;
    els.resultsMeta.textContent = mediaSource === "twitch"
      ? `${videos.length} channels${liveCount ? ` · ${liveCount} live` : ""}`
      : `${videos.length} videos`;
    renderGrid(els.resultsGrid, videos, "No results found.");
  } catch (err) {
    els.resultsMeta.textContent = "";
    els.resultsGrid.innerHTML = `<p class="empty">${err.message}</p>`;
  }
}

function showLibrary(kind) {
  showView("list");
  const data = loadData();
  if (kind === "history") {
    els.listTitle.textContent = "Watch history";
    renderGrid(els.listGrid, data.history || [], "No watch history yet.");
  } else {
    els.listTitle.textContent = "Saved videos";
    renderGrid(els.listGrid, data.saved || [], "You have not saved any videos yet.");
  }
}

function logout() {
  clearSession();
  currentUser = null;
  currentVideo = null;
  sessionPassword = "";
  els.player.src = "";
  els.app.classList.add("hidden");
  els.auth.classList.remove("hidden");
}

document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
    tab.classList.add("active");
    const isLogin = tab.dataset.tab === "login";
    els.loginForm.classList.toggle("hidden", !isLogin);
    els.registerForm.classList.toggle("hidden", isLogin);
    showAuthError("");
  });
});

els.driveBtn.addEventListener("click", async () => {
  showAuthError("");
  try { await connectDrive(true); }
  catch (err) { showAuthError(err.message); }
});

els.loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  showAuthError("");
  try {
    const password = document.getElementById("login-pass").value;
    const user = await login(document.getElementById("login-user").value.trim(), password);
    sessionPassword = password;
    setSession(user, document.getElementById("login-remember").checked);
    enterApp(user);
  } catch (err) { showAuthError(err.message); }
});

els.registerForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  showAuthError("");
  const username = document.getElementById("reg-user").value.trim();
  const display = document.getElementById("reg-display").value.trim();
  const pass = document.getElementById("reg-pass").value;
  const pass2 = document.getElementById("reg-pass2").value;
  if (pass !== pass2) { showAuthError("Passwords do not match."); return; }
  try {
    const user = await register(username, pass, display);
    sessionPassword = pass;
    setSession(user, true);
    enterApp(user);
    toast(drive.token ? "Account encrypted and saved to Google Drive" : "Account created on this device. Connect Drive to use it elsewhere.");
  } catch (err) { showAuthError(err.message); }
});

document.querySelectorAll(".source-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".source-btn").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    mediaSource = btn.dataset.source;
    els.searchInput.placeholder = mediaSource === "twitch"
      ? "Channel, live search, or twitch.tv link"
      : "Search YouTube";
    if (!els.homeView.classList.contains("hidden")) renderHome();
  });
});

els.searchForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const q = els.searchInput.value.trim();
  if (q) runSearch(q);
});

document.getElementById("home-btn").addEventListener("click", renderHome);
document.getElementById("history-btn").addEventListener("click", () => showLibrary("history"));
document.getElementById("saved-btn").addEventListener("click", () => showLibrary("saved"));
document.getElementById("logout-btn").addEventListener("click", logout);
els.saveBtn.addEventListener("click", () => toggleSave());

document.getElementById("settings-btn").addEventListener("click", () => {
  els.apiKeyInput.value = loadData().settings?.youtubeApiKey || "";
  els.settingsClientId.value = getClientId();
  els.settingsModal.classList.remove("hidden");
});
document.getElementById("close-settings").addEventListener("click", () => els.settingsModal.classList.add("hidden"));
document.getElementById("reconnect-drive").addEventListener("click", async () => {
  try { await connectDrive(true); }
  catch (err) { toast(err.message); }
});
document.getElementById("save-settings").addEventListener("click", async () => {
  const youtubeApiKey = els.apiKeyInput.value.trim();
  setClientId(els.settingsClientId.value.trim());
  await saveData({ settings: { ...loadData().settings, youtubeApiKey } });
  els.settingsModal.classList.add("hidden");
  toast("Settings saved");
});

(function boot() {
  const savedId = localStorage.getItem(CLIENT_KEY) || "";
  if (els.clientIdInput) els.clientIdInput.value = savedId;
  if (els.settingsClientId) els.settingsClientId.value = savedId;
  const session = readSession();
  if (!session) return;
  const local = loadUsers()[session.username];
  if (local) enterApp({ username: local.username, displayName: local.displayName || local.username });
})();
