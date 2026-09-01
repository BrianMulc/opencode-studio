#!/bin/bash
# Build a self-contained OpenCode Studio.app and package it as a DMG.
# Usage: installer/macos/build-dmg.sh <app-version> <arm64|x64> [node-runtime-version]
set -euo pipefail

APP_VERSION="${1:-}"
ARCH="${2:-}"
NODE_RUNTIME_VERSION="${3:-24.19.0}"

if [[ -z "$APP_VERSION" || -z "$ARCH" ]]; then
    echo "Usage: $0 <app-version> <arm64|x64> [node-runtime-version]" >&2
    exit 1
fi

if [[ "$ARCH" != "arm64" && "$ARCH" != "x64" ]]; then
    echo "Unsupported arch: $ARCH (expected arm64 or x64)" >&2
    exit 1
fi

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
STAGE_ROOT="$ROOT_DIR/installer/macos/build/$ARCH"
APP_DIR="$STAGE_ROOT/stage/OpenCode Studio.app"
DMG_ROOT="$STAGE_ROOT/dmg"
RUNTIME_TMP="$STAGE_ROOT/node-runtime"
OUTPUT_DIR="$ROOT_DIR/installer/Output-macos"
DMG_PATH="$OUTPUT_DIR/OpenCodeStudio-macOS-$ARCH.dmg"

echo "[macOS DMG] Building OpenCode Studio v$APP_VERSION for darwin/$ARCH"

rm -rf "$STAGE_ROOT"
mkdir -p "$APP_DIR/Contents/MacOS" \
         "$APP_DIR/Contents/Resources/app" \
         "$APP_DIR/Contents/Resources/runtime/nodejs" \
         "$DMG_ROOT" \
         "$RUNTIME_TMP" \
         "$OUTPUT_DIR"

# Copy the app source + prebuilt client + npm dependencies into the bundle.
# Keep this close to the Windows installer layout so server/client startup code
# behaves the same across platforms.
rsync -a --delete \
    --exclude='.git/' \
    --exclude='.github/' \
    --exclude='installer/' \
    --exclude='vendor/' \
    --exclude='.changeset/' \
    --exclude='.sisyphus/' \
    --exclude='.omo/' \
    --exclude='client-next/.next/cache/' \
    --exclude='**/.DS_Store' \
    --exclude='*.log' \
    "$ROOT_DIR/" "$APP_DIR/Contents/Resources/app/"

# Bundle a portable Node.js runtime so users do not need Homebrew, nvm, or sudo.
NODE_TARBALL="$STAGE_ROOT/node-runtime.tar.gz"
NODE_URL="https://nodejs.org/dist/v$NODE_RUNTIME_VERSION/node-v$NODE_RUNTIME_VERSION-darwin-$ARCH.tar.gz"
echo "[macOS DMG] Downloading $NODE_URL"
curl -fL "$NODE_URL" -o "$NODE_TARBALL"
tar -xzf "$NODE_TARBALL" -C "$RUNTIME_TMP" --strip-components 1
cp -R "$RUNTIME_TMP/" "$APP_DIR/Contents/Resources/runtime/nodejs/"
"$APP_DIR/Contents/Resources/runtime/nodejs/bin/node" -v

# App metadata + launcher.
sed -e "s/__APP_VERSION__/$APP_VERSION/g" \
    "$ROOT_DIR/installer/macos/Info.plist" > "$APP_DIR/Contents/Info.plist"
cp "$ROOT_DIR/installer/macos/launch" "$APP_DIR/Contents/MacOS/opencode-studio"
chmod +x "$APP_DIR/Contents/MacOS/opencode-studio"

# Build an .icns icon from the existing PNG using only macOS built-ins.
ICON_SRC="$ROOT_DIR/client-next/public/logo-dark.png"
if [[ -f "$ICON_SRC" ]]; then
    ICONSET="$STAGE_ROOT/icon.iconset"
    mkdir -p "$ICONSET"
    sips -z 16 16     "$ICON_SRC" --out "$ICONSET/icon_16x16.png" >/dev/null
    sips -z 32 32     "$ICON_SRC" --out "$ICONSET/icon_16x16@2x.png" >/dev/null
    sips -z 32 32     "$ICON_SRC" --out "$ICONSET/icon_32x32.png" >/dev/null
    sips -z 64 64     "$ICON_SRC" --out "$ICONSET/icon_32x32@2x.png" >/dev/null
    sips -z 128 128   "$ICON_SRC" --out "$ICONSET/icon_128x128.png" >/dev/null
    sips -z 256 256   "$ICON_SRC" --out "$ICONSET/icon_128x128@2x.png" >/dev/null
    sips -z 256 256   "$ICON_SRC" --out "$ICONSET/icon_256x256.png" >/dev/null
    sips -z 512 512   "$ICON_SRC" --out "$ICONSET/icon_256x256@2x.png" >/dev/null
    sips -z 512 512   "$ICON_SRC" --out "$ICONSET/icon_512x512.png" >/dev/null
    sips -z 1024 1024 "$ICON_SRC" --out "$ICONSET/icon_512x512@2x.png" >/dev/null
    iconutil -c icns "$ICONSET" -o "$APP_DIR/Contents/Resources/icon.icns" || true
fi

# Optional signing/notarization hooks. Without Apple Developer ID credentials the
# DMG still works, but users get the standard one-time Gatekeeper prompt.
if [[ -n "${MACOS_CODESIGN_IDENTITY:-}" ]]; then
    echo "[macOS DMG] Signing app with identity: $MACOS_CODESIGN_IDENTITY"
    /usr/bin/codesign --force --deep --sign "$MACOS_CODESIGN_IDENTITY" --options runtime --timestamp "$APP_DIR"
fi

cp -R "$APP_DIR" "$DMG_ROOT/"
ln -s /Applications "$DMG_ROOT/Applications"

rm -f "$DMG_PATH" "$DMG_PATH.sha256"
hdiutil create -volname "OpenCode Studio" -srcfolder "$DMG_ROOT" -ov -format UDZO "$DMG_PATH"

if [[ -n "${MACOS_CODESIGN_IDENTITY:-}" ]]; then
    /usr/bin/codesign --force --sign "$MACOS_CODESIGN_IDENTITY" --timestamp "$DMG_PATH" || true
fi

if [[ -n "${MACOS_CODESIGN_IDENTITY:-}" && -n "${APPLE_ID:-}" && -n "${APPLE_APP_SPECIFIC_PASSWORD:-}" && -n "${APPLE_TEAM_ID:-}" ]]; then
    echo "[macOS DMG] Notarizing DMG"
    xcrun notarytool submit "$DMG_PATH" \
        --apple-id "$APPLE_ID" \
        --password "$APPLE_APP_SPECIFIC_PASSWORD" \
        --team-id "$APPLE_TEAM_ID" \
        --wait
    xcrun stapler staple "$DMG_PATH"
fi

shasum -a 256 "$DMG_PATH" > "$DMG_PATH.sha256"
echo "[macOS DMG] Wrote $DMG_PATH"
