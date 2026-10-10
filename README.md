# SyncWatch 🎬

Synchronize video playback controls (Play, Pause, Seek, and Spacebar) in real-time across any video website with friends on completely different devices.

---

## 🌐 Public Internet Relay (Ngrok Tunnel)

The relay server is currently running and exposed to the internet via **ngrok**:
- **Public WebSocket Server**: `wss://sensitive-village-sincere.ngrok-free.dev`
- **Public REST API & Test Player**: `https://sensitive-village-sincere.ngrok-free.dev`

*(If you ever need to restart the tunnel manually: `ngrok http 8080`)*

---

## 👥 How to Watch Together on Different Devices

### Step 1: Install the Extension on Both Devices
1. On each friend's computer, open Chrome or Edge and go to `chrome://extensions`.
2. Toggle on **Developer mode** in the top-right corner.
3. Click **Load unpacked** and select the `syncwatch/extension` folder.
   *(You can zip the `extension/` folder and send it to your friend to unpack).*

### Step 2: Friend A (The Host) Creates a Room
1. Open the movie or video page you want to watch (e.g., Netflix, YouTube, 123movies, etc.).
2. Seek to the desired start point (or pause wherever you are).
3. Click the floating **🎬 SyncWatch** widget at the bottom-right of your screen.
4. Select **"👑 Create Room"**.
5. Server is pre-filled with `wss://sensitive-village-sincere.ngrok-free.dev`.
6. Enter a room name (e.g. `FRIDAY-NIGHT`) or click **"Create Room (Become Host)"** to auto-generate one.
7. Send the **Room Code** and the **Movie Link** to your friend!

### Step 3: Friend B (The Crew Member) Joins
1. Open the **exact same video URL** sent by the host.
2. Click the floating **🎬 SyncWatch** widget at the bottom-right.
3. Select **"🚀 Join Room"**.
4. Enter the Room Code (e.g. `FRIDAY-NIGHT`) and click **"Join Room (Sync to Host)"**.
5. **Instant Sync**:
   - The video **immediately jumps to the Host's exact timestamp**!
   - If the friend is on the wrong website/page, SyncWatch displays a **URL Mismatch Alert** with a direct button to jump to the host's video page.

### Step 4: Control with Spacebar
- Pressing **Spacebar** on either device toggles Pause and Play across all connected screens simultaneously!
