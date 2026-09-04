#!/usr/bin/env bash
# Decodes the base64-encoded release keystore from the GitHub Actions secret
# into android/app/release.keystore (where the Gradle signing config expects it).
# No-ops when the secret is missing so a fork without secrets still works.
set -e
if [ -z "$KEYSTORE_BASE64" ]; then
  echo "[keystore] KEYSTORE_BASE64 not set, skipping"
  exit 0
fi
REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
KEYSTORE_DIR="$REPO_ROOT/android/app"
mkdir -p "$KEYSTORE_DIR"
echo "$KEYSTORE_BASE64" | base64 -d > "$KEYSTORE_DIR/release.keystore"
export KEYSTORE_FILE="$KEYSTORE_DIR/release.keystore"
export KEYSTORE_PASSWORD="${KEYSTORE_PASSWORD:-}"
export KEY_ALIAS="${KEY_ALIAS:-nove}"
export KEY_PASSWORD="${KEY_PASSWORD:-}"
echo "[keystore] restored: $KEYSTORE_FILE"
