#!/bin/bash
#==========================================================================
# OpenCode Studio - Linux Installer
#==========================================================================
# Run this file to install OpenCode Studio on Linux:
#
#   chmod +x Install-OpenCode-Studio.sh
#   ./Install-OpenCode-Studio.sh
#
# This installer will:
#   1. Check if Node.js is installed (install via package manager if not)
#   2. Install all npm dependencies
#   3. Create a desktop shortcut (.desktop file)
#
# After installation, launch from your application menu or desktop shortcut.
#==========================================================================

set -e

# --- Resolve script directory ---
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

echo "=========================================="
echo "   OpenCode Studio - Linux Setup"
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
        return 2
    fi
    return 0
}

# --- Helper: download a URL (curl or wget) ---
download() {
    if command -v curl &> /dev/null; then
        curl -fsSL "$1"
    elif command -v wget &> /dev/null; then
        wget -qO- "$1"
    else
        echo "ERROR: Neither curl nor wget is installed."
        echo "Please install one of them and try again."
        return 1
    fi
}

# --- Check / install Node.js ---
check_node_version
NODE_STATUS=$?

if [ $NODE_STATUS -eq 0 ]; then
    echo "[OK] Node.js found: $(node -v)"
elif [ $NODE_STATUS -eq 2 ]; then
    echo "[!] Node.js $(node -v) found, but version 20+ is required."
    echo "    Please upgrade Node.js from https://nodejs.org/"
    echo "    Or use Node Version Manager: nvm install 22 && nvm use 22"
    exit 1
else
    echo "[!] Node.js is not installed."
    echo "    Attempting to install via your package manager..."
    echo ""

    # Detect package manager and install Node.js
    if command -v apt-get &> /dev/null; then
        # Debian/Ubuntu/Mint - use NodeSource for Node 22
        echo "Detected: apt (Debian/Ubuntu)"
        echo "Installing Node.js 22 via NodeSource..."
        # Ensure curl is available for NodeSource setup
        if ! command -v curl &> /dev/null; then
            sudo apt-get install -y curl
        fi
        curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
        sudo apt-get install -y nodejs
    elif command -v dnf &> /dev/null; then
        # Fedora/RHEL
        echo "Detected: dnf (Fedora/RHEL)"
        sudo dnf install -y nodejs npm
    elif command -v yum &> /dev/null; then
        # Older RHEL/CentOS
        echo "Detected: yum (RHEL/CentOS)"
        if ! command -v curl &> /dev/null; then
            sudo yum install -y curl
        fi
        curl -fsSL https://rpm.nodesource.com/setup_22.x | sudo -E bash -
        sudo yum install -y nodejs
    elif command -v pacman &> /dev/null; then
        # Arch/Manjaro (usually has recent Node)
        echo "Detected: pacman (Arch)"
        sudo pacman -S --noconfirm nodejs npm
    elif command -v zypper &> /dev/null; then
        # openSUSE
        echo "Detected: zypper (openSUSE)"
        sudo zypper install -y nodejs npm
    elif command -v apk &> /dev/null; then
        # Alpine
        echo "Detected: apk (Alpine)"
        sudo apk add nodejs npm
    else
        echo "ERROR: Could not detect your package manager."
        echo "Please install Node.js 20+ manually from https://nodejs.org/"
        echo "Or use nvm: download https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh and run it"
        exit 1
    fi

    # Verify installation and version
    check_node_version
    if [ $? -ne 0 ]; then
        echo "ERROR: Node.js 20+ installation failed."
        echo "Please install Node.js 20+ manually from https://nodejs.org/"
        echo "Or use nvm: curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash && nvm install 22"
        exit 1
    fi
    echo "[OK] Node.js installed: $(node -v)"
fi

# --- Install dependencies ---
echo ""
echo "=========================================="
echo "   Installing dependencies..."
echo "=========================================="
npm install
echo "[OK] Dependencies installed!"

# --- Create launcher script ---
echo ""
echo "=========================================="
echo "   Creating launcher..."
echo "=========================================="

LAUNCHER="$SCRIPT_DIR/OpenCode-Studio.sh"
cat > "$LAUNCHER" << LAUNCH_SCRIPT
#!/bin/bash
# OpenCode Studio - Silent Launcher for Linux
# Starts the server (which spawns the client and opens browser).

SCRIPT_DIR="$SCRIPT_DIR"

# Check if already running
if curl -s -o /dev/null -w "%{http_code}" http://localhost:1080 2>/dev/null | grep -q "200"; then
    xdg-open http://localhost:1080
    exit 0
fi

# Clean up stale server lock
rm -f "\$HOME/.config/opencode-studio/server.lock.json"

# Start server in background (no terminal)
cd "\$SCRIPT_DIR/server"
node index.js &
SERVER_PID=\$!

# Wait for frontend to be ready, then open browser
for i in \$(seq 1 30); do
    if curl -s -o /dev/null -w "%{http_code}" http://localhost:1080 2>/dev/null | grep -q "200"; then
        xdg-open http://localhost:1080
        break
    fi
    sleep 2
done

# Keep the script alive so the server keeps running
wait \$SERVER_PID
LAUNCH_SCRIPT

chmod +x "$LAUNCHER"

# --- Create .desktop file ---
echo ""
echo "=========================================="
echo "   Creating desktop shortcut..."
echo "=========================================="

# Determine icon path
ICON_PATH="$SCRIPT_DIR/logo-dark.png"
if [ ! -f "$ICON_PATH" ]; then
    ICON_PATH=""  # No icon if not found
fi

# Create .desktop file in applications directory
DESKTOP_FILE="$HOME/.local/share/applications/opencode-studio.desktop"
mkdir -p "$(dirname "$DESKTOP_FILE")"

cat > "$DESKTOP_FILE" << DESKTOP_ENTRY
[Desktop Entry]
Version=1.0
Type=Application
Name=OpenCode Studio
Comment=Visual interface for managing OpenCode configuration
Exec=$LAUNCHER
Path=$SCRIPT_DIR
Icon=$ICON_PATH
Terminal=false
Categories=Development;Utility;
DESKTOP_ENTRY

chmod +x "$DESKTOP_FILE"

# Also put a copy on the desktop if it exists
if [ -d "$HOME/Desktop" ]; then
    cp "$DESKTOP_FILE" "$HOME/Desktop/opencode-studio.desktop"
    chmod +x "$HOME/Desktop/opencode-studio.desktop"
    echo "[OK] Desktop shortcut created"
fi

# Update desktop database if possible
if command -v update-desktop-database &> /dev/null; then
    update-desktop-database "$HOME/.local/share/applications/" 2>/dev/null || true
fi

echo "[OK] Application menu entry created"

echo ""
echo "=========================================="
echo "   Installation Complete!"
echo "=========================================="
echo ""
echo "To start: Open 'OpenCode Studio' from your application menu or desktop shortcut."
echo "The app opens in your browser automatically - no terminals needed."
echo ""
echo "To stop: Close the browser tab - everything shuts down automatically."