#!/bin/bash
# Build a self-contained OpenCode Studio AppImage for Linux x86_64.
# Usage: installer/linux/build-appimage.sh <app-version> [node-runtime-version]
set -euo pipefail

APP_VERSION="${1:-}"
NODE_RUNTIME_VERSION="${2:-24.19.0}"
ARCH="x86_64"
NODE_ARCH="x64"

if [[ -z "$APP_VERSION" ]]; then
    echo "Usage: $0 <app-version> [node-runtime-version]" >&2
    exit 1
fi

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
STAGE_ROOT="$ROOT_DIR/installer/linux/build/$ARCH"
APP_DIR="$STAGE_ROOT/OpenCodeStudio.AppDir"
RUNTIME_TMP="$STAGE_ROOT/node-runtime"
OUTPUT_DIR="$ROOT_DIR/installer/Output-linux"
APPIMAGE_PATH="$OUTPUT_DIR/OpenCodeStudio-Linux-$ARCH.AppImage"
APPIMAGETOOL="$STAGE_ROOT/appimagetool-$ARCH.AppImage"

echo "[Linux AppImage] Building OpenCode Studio v$APP_VERSION for linux/$NODE_ARCH"

rm -rf "$STAGE_ROOT"
mkdir -p "$APP_DIR/usr/share/opencode-studio/app" \
         "$APP_DIR/usr/share/opencode-studio/runtime/nodejs" \
         "$RUNTIME_TMP" \
         "$OUTPUT_DIR"

# Copy the app source + prebuilt client + npm dependencies into the AppImage.
# Use tar (available on minimal runners) instead of rsync.
(
    cd "$ROOT_DIR"
    tar \
        --exclude='./.git' \
        --exclude='./.github' \
        --exclude='./installer' \
        --exclude='./vendor' \
        --exclude='./.changeset' \
        --exclude='./.sisyphus' \
        --exclude='./.omo' \
        --exclude='./client-next/.next/cache' \
        --exclude='*/.DS_Store' \
        --exclude='*.log' \
        -cf - .
) | tar -xf - -C "$APP_DIR/usr/share/opencode-studio/app"

# Bundle a portable Node.js runtime so users do not need Node/npm installed.
NODE_TARBALL="$STAGE_ROOT/node-runtime.tar.xz"
NODE_URL="https://nodejs.org/dist/v$NODE_RUNTIME_VERSION/node-v$NODE_RUNTIME_VERSION-linux-$NODE_ARCH.tar.xz"
echo "[Linux AppImage] Downloading $NODE_URL"
curl -fL "$NODE_URL" -o "$NODE_TARBALL"
tar -xJf "$NODE_TARBALL" -C "$RUNTIME_TMP" --strip-components=1
cp -R "$RUNTIME_TMP/." "$APP_DIR/usr/share/opencode-studio/runtime/nodejs/"
"$APP_DIR/usr/share/opencode-studio/runtime/nodejs/bin/node" -v

cp "$ROOT_DIR/installer/linux/AppRun" "$APP_DIR/AppRun"
chmod +x "$APP_DIR/AppRun"
cp "$ROOT_DIR/installer/linux/opencode-studio.desktop" "$APP_DIR/opencode-studio.desktop"
cp "$ROOT_DIR/client-next/public/logo-dark.png" "$APP_DIR/opencode-studio.png"
cp "$ROOT_DIR/client-next/public/logo-dark.png" "$APP_DIR/.DirIcon"

APPIMAGETOOL_URL="https://github.com/AppImage/AppImageKit/releases/download/continuous/appimagetool-$ARCH.AppImage"
echo "[Linux AppImage] Downloading $APPIMAGETOOL_URL"
curl -fL "$APPIMAGETOOL_URL" -o "$APPIMAGETOOL"
chmod +x "$APPIMAGETOOL"

rm -f "$APPIMAGE_PATH" "$APPIMAGE_PATH.sha256"
APPIMAGE_EXTRACT_AND_RUN=1 ARCH="$ARCH" "$APPIMAGETOOL" "$APP_DIR" "$APPIMAGE_PATH"
chmod +x "$APPIMAGE_PATH"
sha256sum "$APPIMAGE_PATH" > "$APPIMAGE_PATH.sha256"
echo "[Linux AppImage] Wrote $APPIMAGE_PATH"
