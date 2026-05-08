# StreamHub

**Your unified streaming command center.**

Control YouTube, TikTok, Facebook, Twitter/X, and Bluesky — all from one dark-mode desktop dashboard. Built with Electron, Node.js, and Socket.IO.

---

## Features

### Platforms
| Platform | What it does |
|---|---|
| **YouTube** | Live chat, super chats, OAuth auth |
| **TikTok** | Live chat, gifts, viewer count |
| **Facebook** | Live video comments, OAuth auth |
| **Twitter/X** | Real-time filtered stream for @mentions |
| **Bluesky** | Polls mentions & replies every 15 seconds |

### OBS Integration
- Scene switcher — click any scene to go live on it
- Audio mute/unmute toggle per source
- Source visibility toggle
- Recording start/stop
- Live stream & recording status badges

### AI Engine (Claude)
- Reply to any chat message with one click
- Custom AI prompts about your stream
- Auto-generate chat messages on an interval
- Clip title generator — describe a moment, get 3 viral title ideas
- Stream highlights summary

### Analytics
- Live message activity chart (30s intervals)
- Top chatters leaderboard
- Per-platform message breakdown
- Session duration, total messages, avg message rate
- Clip moment detector — flags chat spikes automatically

### Stream Deck
- 12-button customizable quick-action grid
- Actions: OBS scene switch, broadcast message, mute mic, record toggle, mark clip, show alert, AI summary
- Button config persists between sessions
- Keyboard shortcut `Ctrl+7`

### Other
- **Multi-platform broadcast** — type once, send to all connected platforms
- **Clip logger** — saves clip moments to disk (`%APPDATA%/StreamHub/clips.json`)
- **Sound alerts** — Web Audio API tones for donations, connections, clip detections
- **Automation rules** — word filter, welcome new viewers, donation alerts, milestones
- **YouTube title sync** — update your stream title without leaving the dashboard

---

## Tech Stack

- **Electron** — Desktop shell
- **Node.js + Express** — Backend API
- **Socket.IO** — Real-time events between backend and UI
- **Google APIs** — YouTube Data API v3
- **tmi.js** — Twitch IRC (optional)
- **tiktok-live-connector** — TikTok live chat
- **obs-websocket-js** — OBS WebSocket v5
- **@atproto/api** — Bluesky
- **@anthropic-ai/sdk** — Claude AI
- **Vanilla HTML/CSS/JS** — No frontend framework, no build step

---

## Setup

### 1. Clone & install

```bash
git clone https://github.com/Ricardo509-prog/streamhub.git
cd streamhub
npm install
```

### 2. Configure credentials

Copy the example env file and fill in your keys:

```bash
cp .env.example .env
```

Open `.env` and add credentials for the platforms you use (see [Platform Setup](#platform-setup) below).

### 3. Run

```bash
npm start
```

---

## Platform Setup

### YouTube
1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Create a project → Enable **YouTube Data API v3**
3. Credentials → **Create OAuth 2.0 Client ID** → Desktop app
4. Add to `.env`:
```
YOUTUBE_CLIENT_ID=your_client_id
YOUTUBE_CLIENT_SECRET=your_client_secret
YOUTUBE_REDIRECT_URI=http://localhost:3001/auth/youtube/callback
```
5. In the app: click **Auth** next to YouTube → log in → click **Live**

### TikTok
No API key needed — just your username:
```
TIKTOK_USERNAME=yourusername
```
You must be **live on TikTok** when you click Connect.

### Facebook
1. Go to [developers.facebook.com](https://developers.facebook.com) → Create App
2. Add the **Live Video** product
3. Get your **Page Access Token** from Graph API Explorer
4. Add to `.env`:
```
FACEBOOK_APP_ID=
FACEBOOK_APP_SECRET=
FACEBOOK_PAGE_ID=
FACEBOOK_PAGE_ACCESS_TOKEN=
```

### Twitter / X
1. Go to [developer.twitter.com](https://developer.twitter.com) → Create a project & app
2. Apply for **Basic or Elevated** access (required for filtered stream)
3. Add to `.env`:
```
TWITTER_BEARER_TOKEN=your_bearer_token
TWITTER_USERNAME=your_username_without_@
```

### Bluesky
1. Go to **bsky.app → Settings → App Passwords** → Add App Password
2. Add to `.env`:
```
BLUESKY_HANDLE=yourname.bsky.social
BLUESKY_APP_PASSWORD=xxxx-xxxx-xxxx-xxxx
```

### OBS
1. Open OBS → **Tools → WebSocket Server Settings** → Enable WebSocket Server
2. Add to `.env`:
```
OBS_WEBSOCKET_URL=ws://localhost:4455
OBS_WEBSOCKET_PASSWORD=your_password
```
3. In the app: go to **OBS tab** → click **Connect to OBS**

### AI (Claude)
1. Go to [console.anthropic.com](https://console.anthropic.com) → API Keys
2. Add to `.env`:
```
ANTHROPIC_API_KEY=sk-ant-...
```

---

## Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl+1` | Chat tab |
| `Ctrl+2` | OBS tab |
| `Ctrl+3` | AI tab |
| `Ctrl+4` | Donations tab |
| `Ctrl+5` | Automation tab |
| `Ctrl+6` | Analytics tab |
| `Ctrl+7` | Stream Deck tab |
| `Enter` | Send chat message |

---

## Building a Distributable

```bash
npm run package
```

Produces `dist/StreamHub-win32-x64/StreamHub.exe` — portable, no installer needed. Zip and share.

On the target machine, create `%APPDATA%\StreamHub\.env` with your API keys.

---

## Project Structure

```
src/
├── main/
│   ├── index.js          # Electron entry point
│   └── preload.js        # Secure IPC bridge
├── backend/
│   ├── server.js         # Express + Socket.IO server
│   ├── ai.js             # Claude AI engine
│   ├── analytics.js      # Live stats & clip detection
│   ├── automation.js     # Rules engine
│   ├── clips.js          # Clip logger (saves to disk)
│   ├── deck.js           # Stream Deck engine
│   ├── obs.js            # OBS WebSocket controller
│   └── platforms/
│       ├── youtube.js
│       ├── tiktok.js
│       ├── facebook.js
│       ├── twitter.js
│       └── bluesky.js
└── renderer/
    ├── index.html        # Dashboard UI
    ├── app.js            # Frontend logic
    └── styles/main.css
```

---

## Roadmap

| Phase | Features | Status |
|---|---|---|
| 1 | YouTube live chat | ✅ Done |
| 2 | TikTok, Facebook, Twitter/X, Bluesky | ✅ Done |
| 3 | OBS control, AI chat engine, Automation | ✅ Done |
| 4 | Analytics, clip detection, title sync, AI summary | ✅ Done |
| 5 | Stream Deck, broadcast, sound alerts, clip logger | ✅ Done |
