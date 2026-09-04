#!/usr/bin/env bash
# Decodes the base64-encoded release keystore from the GitHub Actions secret
# into a real file Gradle can read. Runs once before the assemble task.
# Safe to no-op if the secret is missing (falls back to debug signing).
set -e
if [ -z "$KEYSTORE_BASE64" ]; then
  echo "[keystore] KEYSTORE_BASE64 not set, skipping (debug build)"
  exit 0
fi
mkdir -p app
echo "$KEYSTORE_BASE64" | base64 -d > app/release.keystore
export KEYSTORE_FILE="$(pwd)/app/release.keystore"
export KEYSTORE_PASSWORD="${KEYSTORE_PASSWORD:-}"
export KEY_ALIAS="${KEY_ALIAS:-nove}"
export KEY_PASSWORD="${KEY_PASSWORD:-}"
echo "[keystore] release keystore restored: $KEYSTORE_FILE"
