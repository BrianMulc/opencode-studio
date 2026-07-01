#!/bin/bash
#==========================================================================
# OpenCode Studio - macOS Installer
#==========================================================================
# Double-click this file in Finder to install OpenCode Studio.
#
# This installer will:
#   1. Check if Node.js is installed (install via Homebrew if not)
#   2. Install all npm dependencies
#   3. Create an OpenCode Studio.app in /Applications
#
# After installation, double-click OpenCode Studio.app in /Applications
# (or Launchpad/Spotlight) to launch the app.
#==========================================================================

set -e

# --- Resolve script directory ---
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

echo "=========================================="
echo "   OpenCode Studio - macOS Setup"
echo "=========================================="
echo ""

# --- Check if Homebrew is installed ---
if ! command -v brew &> /dev/null; then
    echo "[!] Homebrew is not installed."
    echo "    Homebrew is required to install Node.js automatically."
    echo ""
    read -p "Install Homebrew now? (y/n) " -n 1 -r
    echo ""
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo "Installing Homebrew..."
        /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
        # Add brew to PATH for this session
        if [[ -f /opt/homebrew/bin/brew ]]; then
            eval "$(/opt/homebrew/bin/brew shellenv)"
        elif [[ -f /usr/local/bin/brew ]]; then
            eval "$(/usr/local/bin/brew shellenv)"
        fi
    else
        echo "Please install Homebrew from https://brew.sh/ then run this installer again."
        exit 1
    fi
fi

# --- Check / install Node.js ---
if ! command -v node &> /dev/null; then
    echo "[!] Node.js is not installed."
    read -p "Install Node.js via Homebrew? (y/n) " -n 1 -r
    echo ""
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo "Installing Node.js..."
        brew install node
    else
        echo "Please install Node.js from https://nodejs.org/ then run this installer again."
        exit 1
    fi
else
    NODE_VERSION=$(node -v)
    echo "[OK] Node.js found: $NODE_VERSION"
fi

# --- Install dependencies ---
echo ""
echo "=========================================="
echo "   Installing dependencies..."
echo "=========================================="
npm install
echo "[OK] Dependencies installed!"

# --- Create .app bundle in /Applications ---
echo ""
echo "=========================================="
echo "   Creating OpenCode Studio.app..."
echo "=========================================="

APP_DIR="/Applications/OpenCode Studio.app"
# Remove old app if exists
rm -rf "$APP_DIR"

# Create .app bundle structure
mkdir -p "$APP_DIR/Contents/MacOS"
mkdir -p "$APP_DIR/Contents/Resources"

# Create Info.plist
cat > "$APP_DIR/Contents/Info.plist" << 'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleName</key>
    <string>OpenCode Studio</string>
    <key>CFBundleDisplayName</key>
    <string>OpenCode Studio</string>
    <key>CFBundleIdentifier</key>
    <string>com.opencode.studio</string>
    <key>CFBundleVersion</key>
    <string>1.0</string>
    <key>CFBundleShortVersionString</key>
    <string>1.0</string>
    <key>CFBundlePackageType</key>
    <string>APPL</string>
    <key>CFBundleExecutable</key>
    <string>launch</string>
    <key>LSUIElement</key>
    <true/>
    <key>NSHighResolutionCapable</key>
    <true/>
</dict>
</plist>
PLIST

# Create the launcher script (runs silently, no Terminal window)
cat > "$APP_DIR/Contents/MacOS/launch" << LAUNCH_SCRIPT
#!/bin/bash
# OpenCode Studio - Silent Launcher for macOS
# Starts the server (which spawns the client and opens browser), no Terminal visible.

SCRIPT_DIR="$SCRIPT_DIR"

# Check if already running
if curl -s -o /dev/null -w "%{http_code}" http://localhost:1080 | grep -q "200"; then
    open http://localhost:1080
    exit 0
fi

# Clean up stale server lock
LOCK_FILE="\$HOME/.config/opencode-studio/server.lock.json"
rm -f "\$LOCK_FILE"

# Start server in background (no terminal)
cd "\$SCRIPT_DIR/server"
node index.js &
SERVER_PID=\$!

# Wait for frontend to be ready, then open browser
# (The server itself polls for client readiness and opens the browser,
#  but we also do it here as a fallback)
for i in \$(seq 1 30); do
    if curl -s -o /dev/null -w "%{http_code}" http://localhost:1080 | grep -q "200"; then
        open http://localhost:1080
        break
    fi
    sleep 2
done

# Keep the script alive so the server keeps running
# When the user quits the app (Cmd+Q from Dock), the server gets killed
wait \$SERVER_PID
LAUNCH_SCRIPT

chmod +x "$APP_DIR/Contents/MacOS/launch"

# Copy icon if available
if [ -f "$SCRIPT_DIR/logo-dark.png" ]; then
    cp "$SCRIPT_DIR/logo-dark.png" "$APP_DIR/Contents/Resources/icon.png"
    # Convert to icns if sips is available (it is on macOS)
    sips -s format icns "$APP_DIR/Contents/Resources/icon.png" --out "$APP_DIR/Contents/Resources/icon.icns" 2>/dev/null || true
    # Add icon reference to Info.plist
    # (Already handled by macOS convention - icon.icns in Resources)
fi

# Set permissions
chmod -R 755 "$APP_DIR"

echo "[OK] OpenCode Studio.app created in /Applications"
echo ""
echo "=========================================="
echo "   Installation Complete!"
echo "=========================================="
echo ""
echo "To start: Open 'OpenCode Studio' from /Applications, Launchpad, or Spotlight."
echo "The app opens in your browser automatically - no terminals needed."
echo ""
echo "To stop: Close the browser tab - everything shuts down automatically."
echo ""
echo "Note: On first launch, macOS may ask you to confirm opening an app from"
echo "      an unidentified developer. Right-click the app and select 'Open'."