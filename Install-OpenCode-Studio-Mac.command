#!/bin/bash
#==========================================================================
# OpenCode Studio - macOS Installer
#==========================================================================
# This installer will:
#   1. Check if Node.js 20+ is installed (install via Homebrew or .pkg if not)
#   2. Install all npm dependencies
#   3. Create an OpenCode Studio.app in /Applications
#
# After installation, open OpenCode Studio.app from /Applications,
# Launchpad, or Spotlight.
#==========================================================================

set -e

# --- Resolve script directory ---
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

echo "=========================================="
echo "   OpenCode Studio - macOS Setup"
echo "=========================================="
echo ""

# --- Helper: check Node.js version is 20+ ---
check_node_version() {
    if ! command -v node &> /dev/null; then
        return 1
    fi
    local MAJOR
    MAJOR=$(node -v | sed 's/v//' | cut -d. -f1)
    if [ "$MAJOR" -lt 20 ]; then
        echo "[!] Node.js $(node -v) found, but version 20+ is required."
        return 2
    fi
    return 0
}

# --- Check / install Node.js ---
check_node_version
NODE_STATUS=$?

if [ $NODE_STATUS -eq 0 ]; then
    echo "[OK] Node.js found: $(node -v)"
elif [ $NODE_STATUS -eq 2 ]; then
    echo "    Upgrading Node.js is required."
    # Try Homebrew first
    if command -v brew &> /dev/null; then
        echo "    Upgrading via Homebrew..."
        brew upgrade node || brew install node
        check_node_version || { echo "ERROR: Upgrade failed. Please install Node.js 20+ from https://nodejs.org/"; exit 1; }
    else
        echo "    Please install Node.js 20+ from https://nodejs.org/"
        echo "    Or install Homebrew from https://brew.sh/ and run: brew install node"
        exit 1
    fi
else
    # Node not installed at all
    echo "[!] Node.js is not installed."
    echo ""
    echo "    Choose an installation method:"
    echo "    1) Homebrew (recommended if you use it)"
    echo "    2) Download .pkg installer from nodejs.org"
    echo "    3) Skip (I'll install it myself)"
    echo ""
    read -p "Select (1/2/3): " -n 1 -r
    echo ""

    if [[ $REPLY == "1" ]]; then
        # Install via Homebrew
        if ! command -v brew &> /dev/null; then
            echo "    Homebrew not found. Installing Homebrew first..."
            /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
            # Add brew to PATH for this session
            if [[ -f /opt/homebrew/bin/brew ]]; then
                eval "$(/opt/homebrew/bin/brew shellenv)"
            elif [[ -f /usr/local/bin/brew ]]; then
                eval "$(/usr/local/bin/brew shellenv)"
            fi
        fi
        echo "    Installing Node.js via Homebrew..."
        brew install node
        check_node_version || { echo "ERROR: Installation failed."; exit 1; }
        echo "[OK] Node.js installed: $(node -v)"

    elif [[ $REPLY == "2" ]]; then
        # Download and install .pkg from nodejs.org
        echo "    Downloading Node.js LTS .pkg installer..."
        ARCH=$(uname -m)
        if [ "$ARCH" = "arm64" ]; then
            NODE_URL="https://nodejs.org/dist/v22.16.0/node-v22.16.0.pkg"
            # Fallback: the universal .pkg
            NODE_URL="https://nodejs.org/dist/v22.16.0/node-v22.16.0-darwin-arm64.pkg"
        else
            NODE_URL="https://nodejs.org/dist/v22.16.0/node-v22.16.0-darwin-x64.pkg"
        fi
        TMP_PKG="/tmp/nodejs-installer.pkg"
        curl -L -o "$TMP_PKG" "$NODE_URL"
        echo "    Installing Node.js (may prompt for your password)..."
        sudo installer -pkg "$TMP_PKG" -target /
        rm -f "$TMP_PKG"
        # Refresh PATH
        export PATH="/usr/local/bin:/opt/homebrew/bin:$PATH"
        check_node_version || { echo "ERROR: Installation failed. Please install from https://nodejs.org/"; exit 1; }
        echo "[OK] Node.js installed: $(node -v)"

    else
        echo "    Please install Node.js 20+ from https://nodejs.org/"
        echo "    Then run this installer again."
        exit 1
    fi
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
    <key>CFBundleIconFile</key>
    <string>icon.icns</string>
    <key>LSUIElement</key>
    <true/>
    <key>NSHighResolutionCapable</key>
    <true/>
</dict>
</plist>
PLIST

# Create the launcher script.
# IMPORTANT: SCRIPT_DIR is resolved dynamically at RUNTIME, not hardcoded.
# This means the .app bundle works even if the user moves the repo folder.
cat > "$APP_DIR/Contents/MacOS/launch" << LAUNCH_SCRIPT
#!/bin/bash
# OpenCode Studio - Silent Launcher for macOS
# Starts the server (which spawns the client and opens browser), no Terminal visible.

# Resolve the repo directory: the .app bundle stores a symlink to the repo
REPO_DIR="\$(cat "\$0/../Resources/repo-path.txt" 2>/dev/null)"

if [ -z "\$REPO_DIR" ] || [ ! -d "\$REPO_DIR" ]; then
    # Fallback: try the path that was valid at install time
    REPO_DIR="$SCRIPT_DIR"
fi

# Check if already running
if curl -s -o /dev/null -w "%{http_code}" http://localhost:1080 2>/dev/null | grep -q "200"; then
    open http://localhost:1080
    exit 0
fi

# Clean up stale server lock
LOCK_FILE="\$HOME/.config/opencode-studio/server.lock.json"
rm -f "\$LOCK_FILE"

# Start server in background (no terminal)
cd "\$REPO_DIR/server"
node index.js &
SERVER_PID=\$!

# Wait for frontend to be ready, then open browser (fallback - server also does this)
for i in \$(seq 1 30); do
    if curl -s -o /dev/null -w "%{http_code}" http://localhost:1080 2>/dev/null | grep -q "200"; then
        open http://localhost:1080
        break
    fi
    sleep 2
done

# Keep the script alive so the server keeps running
wait \$SERVER_PID
LAUNCH_SCRIPT

chmod +x "$APP_DIR/Contents/MacOS/launch"

# Store the repo path as a file (not hardcoded in the script) so it can be updated
echo "$SCRIPT_DIR" > "$APP_DIR/Contents/Resources/repo-path.txt"

# Copy and convert icon
if [ -f "$SCRIPT_DIR/logo-dark.png" ]; then
    cp "$SCRIPT_DIR/logo-dark.png" "$APP_DIR/Contents/Resources/icon.png"
    # Convert to icns using sips (built into macOS)
    sips -s format icns "$APP_DIR/Contents/Resources/icon.png" \
         --out "$APP_DIR/Contents/Resources/icon.icns" 2>/dev/null || true
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
echo "IMPORTANT: On first launch, macOS Gatekeeper may block the app because"
echo "it is from an unidentified developer. To open it:"
echo "  1. Right-click (or Control-click) 'OpenCode Studio' in /Applications"
echo "  2. Select 'Open' from the menu"
echo "  3. Click 'Open' in the dialog that appears"
echo "  4. After this, it will open normally in the future"