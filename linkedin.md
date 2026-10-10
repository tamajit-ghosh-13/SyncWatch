# 🎬 LinkedIn Post: SyncWatch

---

## 📌 Post Content (Ready to Copy & Paste)

What if you could watch a movie with friends as if you're in the same room—while everyone is actually watching their own separate copy at home?

Think of it like a virtual cinema theater: everyone sits in their own bedroom, streaming from the same provider, yet every gasp, pause, and scene transition happens at the exact same millisecond.

Here’s the story behind why I built it:

After a gruesome week of **4 consecutive, back-to-back class tests**, my friends and I were completely burned out. All we wanted was an evening to chill out and catch a movie together.

Going out to a theater wasn't an option—none of us had the energy or time to travel. Screen-sharing over Discord or Google Meet was out of the question too (nobody wants to watch a laggy, 720p pixelated screen-capture with out-of-sync audio).

We just wanted a way to **"sync our watches"** at the exact same second. That way, we get the true feeling of watching cinema together, without the overhead.

Then we paused and asked ourselves:
*“Why spend hours scouring the internet for bloated third-party tools and buggy extensions when we can just build it ourselves?”*

So, I decided to make it for my friends.

---

### 💡 The Philosophy Behind It:
Instead of streaming heavy video data across a server, everyone streams the movie natively on their own browser at full original quality.

**Zero video bytes ever touch our server.**  
The only packets crossing the network are microscopic JSON sync signals:  
`{ type: "pause", t: 1401.17 }`

---

### 🛠️ How It Works Under the Hood:
1. **👑 Among Us-Style Hierarchy**: One friend creates the room as the **Host**. When the rest of the crew joins, their video **instantly snaps to the host's exact timestamp**, down to the second.
2. **🛡️ Strict URL Guard**: Before syncing, the extension verifies that every friend is on the *exact same movie URL*. If someone is on the wrong episode or page, it flags a mismatch and offers a 1-click button to open the host’s exact link.
3. **⌨️ Native Spacebar Sync**: Pressing `Space` anywhere on your keyboard pauses your local player and instantly pauses everyone else's screen across the room.
4. **🎨 In-Page Shadow DOM HUD**: An overlay widget injected into the page via Shadow DOM (inspired by client-side web accessibility engines), keeping controls completely immune to the streaming site’s internal CSS.
5. **💾 SQLite & Ngrok Relay**: A lightweight Node relay backed by native `node:sqlite` in WAL mode for persistent room state, tunneled through `ngrok` so friends can connect seamlessly from completely different WiFi networks and devices.

---

Turning a stressful week of exams into a movie night with a tool built from scratch with code was one of the most satisfying feelings.

Sometimes, the best software isn't built for a company or a hackathon pitch—it’s built on a late evening just to share a laugh with your friends.

Have you ever built a quick hack solely to solve a problem for your friend group? I’d love to hear about it below! 👇

---

#SoftwareEngineering #WebDevelopment #JavaScript #ChromeExtension #BuildInPublic #StudentBuilder #NodeJS #CodingProjects

---

## 💡 Posting Tips
- **Media**: Attach a short screen recording or screenshot of the in-page **🎬 SyncWatch** floating widget active on your movie player (showing the `👑 Host` badge and Spacebar indicator).
- **First Comment**: Drop a link to your GitHub repo in the comments rather than the main post body to maximize algorithmic reach.
