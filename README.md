# OpenCode Studio

OpenCode Studio is a small app that sets up OpenCode on your computer so you do not have to edit configuration files by hand.

For most people, you only need to do three things:

1. Install the app.
2. Choose the company profile your team told you to use.
3. Enter your API key when the app asks for it.

If anything here does not match what you see, stop and contact IT. Include a screenshot if you can.

---

## Before you start

You need:

- A company computer with OpenCode installed. If you are not sure, ask IT.
- Your API key, if your team gave you one.
- To know which profile to use:
  - **Public data only** — for non-sensitive work.
  - **All data (private AI)** — for confidential work and anything that should stay on company infrastructure.

If you were not told which profile to use, ask before choosing.

Important: never paste your API key into email, chat, tickets, screenshots, or documents. Only paste it into the app's **Settings → Provider API Keys** page.

---

## Install

### Windows

1. Download the installer:
   https://github.com/BrianMulc/opencode-studio/releases/latest/download/OpenCodeStudio-Setup.exe
2. Open `OpenCodeStudio-Setup.exe`.
3. If Windows shows a SmartScreen warning, click **More info** → **Run anyway**.
4. Leave **Launch OpenCode Studio now** checked and finish the installer.
5. The app opens in your web browser. No terminal window should appear.

To stop the app later, close the browser tab.

### Mac

The Mac installer is currently for Apple Silicon Macs (M1, M2, M3, M4).

1. Download the DMG:
   https://github.com/BrianMulc/opencode-studio/releases/latest/download/OpenCodeStudio-macOS-arm64.dmg
2. Open the downloaded file.
3. Drag **OpenCode Studio.app** onto **Applications**.
4. Open **OpenCode Studio** from Applications, Launchpad, or Spotlight.
5. If macOS says the app is from an unidentified developer:
   - Right-click or Control-click **OpenCode Studio** in Applications.
   - Choose **Open**.
   - Click **Open** again.

To stop the app later, close the browser tab.

Intel Macs: use the advanced install option below or ask IT.

---

## First-time setup

1. Open **OpenCode Studio**.
2. Wait until the left sidebar says **Connected**.
   - If it says **Disconnected**, click **Restart Backend** once.
   - If it still does not connect, contact IT.
3. In the sidebar, click **Profiles**.
4. Click **New from Preset**.
5. Choose the profile your team told you to use:
   - **Public data only**
   - **All data (private AI)**
6. Create the profile.
7. Go to **Settings → Provider API Keys**.
8. Enter your API key and save it.

You should not need to edit **Raw Config**, **MCP Servers**, **Plugins**, **Skills**, or **Commands** unless IT asks you to.

---

## Everyday use

Most people only need the **Profiles** and **Settings** pages.

- **Profiles** — switch between company setups. If your profile says **Linked**, it can receive catalog updates from the company server.
- **Sync catalog** — updates the model list for a linked profile. Your API key is kept.
- **Settings → Provider API Keys** — enter or replace your API key.
- **Update Available** — if you see this in the sidebar, click it and let the app restart. Do not close the tab while it is updating.

If you are asked to send information to IT, open **Logs**, then copy or screenshot the recent errors.

---

## If something goes wrong

| What you see | What to do |
|---|---|
| Windows warns about SmartScreen | Click **More info** → **Run anyway**. |
| Mac says the app is from an unidentified developer | Right-click the app → **Open** → **Open**. |
| Sidebar says **Disconnected** | Click **Restart Backend** once. If it still fails, contact IT. |
| Profile sync fails | Check that you are on the company network/VPN/tailnet if required, then try again. If it still fails, contact IT. |
| You are asked to run `npm` commands | This usually means the installed app did not start correctly. Contact IT unless you were specifically told to use the advanced install. |
| You do not know which profile to use | Ask your manager or IT. Do not guess for confidential work. |

When contacting IT, include:

- What you clicked
- A screenshot
- Whether you are on Windows or Mac
- Any errors from the **Logs** page

---

## For tech-savvy employees and IT

This section is optional. Most users do not need it.

### What the app manages

OpenCode Studio edits the local OpenCode configuration for the current user. It provides pages for:

- Profiles
- Agents
- MCP servers
- Skills
- Plugins
- Commands
- Logs
- Rules
- Code settings
- Settings
- Raw config

Config locations:

- OpenCode config: `~/.config/opencode/`
- OpenCode Studio data: `~/.config/opencode-studio/`
- Profiles: `~/.config/opencode-profiles/`

### Advanced install

Use this only if the normal installer is not available for your machine.

```bash
npm install -g opencode-studio-server
opencode-studio-server --register
opencode-studio-server
```

Then open the local OpenCode Studio page shown by the server.

### Verifying the Mac download

Most users can skip this.

```bash
cd ~/Downloads
cat OpenCodeStudio-macOS-arm64.dmg.sha256
shasum -a 256 OpenCodeStudio-macOS-arm64.dmg
```

The printed SHA-256 hash should match the hash inside the `.sha256` file.

### Releases

Latest release:
https://github.com/BrianMulc/opencode-studio/releases/latest

Source code:
https://github.com/BrianMulc/opencode-studio

---

## License

MIT
