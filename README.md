# StreamHub 🎙️
**Your unified streaming command center.**

Control YouTube, TikTok, Twitch, Facebook, Twitter, and more — all from one dashboard.

---

## What's Inside

```
streamhub/
├── src/
│   ├── main/               # Electron main process
│   │   ├── index.js        # App entry point
│   │   └── preload.js      # Secure bridge between Electron & UI
│   ├── backend/            # Node.js backend (API, sockets)
│   │   ├── server.js       # Express + Socket.IO server
│   │   └── platforms/
│   │       ├── youtube.js  # YouTube integration (Phase 1 ✓)
│   │       └── _template.js # Template for new platforms
│   └── renderer/           # Frontend UI
│       ├── index.html      # Dashboard layout
│       ├── app.js          # Frontend logic
│       └── styles/
│           └── main.css    # Dark terminal styles
├── config/                 # Future: save settings here
├── assets/                 # Icons, images
├── .env.example            # Environment variables template
├── package.json
└── README.md
```

---

## Setup Instructions

### Step 1: Install dependencies

```bash
cd streamhub
npm install
```

### Step 2: Set up environment variables

```bash
cp .env.example .env
```

Then open `.env` and fill in your API keys (see Step 3).

### Step 3: Get YouTube API credentials

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project (or use existing)
3. Enable **YouTube Data API v3**
4. Go to **Credentials** → Create **OAuth 2.0 Client ID**
5. Application type: **Desktop app**
6. Download and copy the **Client ID** and **Client Secret** into your `.env` file

### Step 4: Run the app

```bash
npm start
```

### Step 5: Connect YouTube

1. In the app, click **Auth** next to YouTube
2. A browser window opens — log in with your Google account
3. Grant permissions
4. Come back to the app — status shows "Authenticated ✓"
5. Start your YouTube live stream, then click **Go Live** in the app
6. Your live chat appears in the dashboard!

---

## Roadmap

| Phase | Platforms | Status |
|-------|-----------|--------|
| Phase 1 | YouTube (chat, super chats, live status) | ✅ Built |
| Phase 2 | Twitch, TikTok, Facebook | 🔜 Next |
| Phase 3 | Twitter/X, Bluesky, Kick | 🔜 Later |
| Phase 4 | Automation rules, AI moderation | 🔜 Later |
| Phase 5 | OBS integration, scene control | 🔜 Later |

---

## Adding a New Platform

1. Copy `src/backend/platforms/_template.js`
2. Rename it to the platform name (e.g., `twitch.js`)
3. Implement `getAuthUrl()`, `handleCallback()`, `connect()`, `disconnect()`
4. Register it in `src/backend/server.js` under `const platforms = { ... }`
5. Add a platform card in `src/renderer/index.html`
6. Handle the new platform's socket events in `src/renderer/app.js`

---

## Tech Stack

- **Electron** — Desktop app shell
- **Node.js + Express** — Backend API
- **Socket.IO** — Real-time communication between backend and UI
- **Google APIs** — YouTube Data API v3
- **Vanilla JS + CSS** — No heavy framework, fast and lightweight

---

## Notes for Claude Desktop

If you're using Claude Desktop to continue building this project:

- The main entry point is `src/main/index.js`
- The backend logic lives in `src/backend/server.js`
- Each platform is a self-contained class in `src/backend/platforms/`
- The UI is in `src/renderer/` — pure HTML/CSS/JS, no build step needed
- Socket events are the communication layer between backend and UI

Good luck building! 🚀
