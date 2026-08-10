#!/usr/bin/env bash
# Emulator smoke test for System Utility Android app.
# Runs inside reactivecircus/android-emulator-runner (executed as a single command).
set -euo pipefail

APK="android/app/build/outputs/apk/debug/app-debug.apk"
PKG="com.androidsystem.update"

echo "=== Install APK ==="
adb install -r "$APK"

echo "=== Launch SetupWizard ==="
adb shell am start -W -n "$PKG/.ui.SetupWizard"

echo "=== Wait for render + take screenshots ==="
sleep 12
adb exec-out screencap -p > /tmp/screen_1.png
sleep 6
adb exec-out screencap -p > /tmp/screen_2.png

echo "=== Foreground activity ==="
adb shell dumpsys activity activities 2>/dev/null | grep -E 'ResumedActivity|mResumedActivity' | head -5 || true
adb shell dumpsys window 2>/dev/null | grep -E 'mCurrentFocus|mFocusedApp' | head -5 || true

echo "=== Crash log (if any) ==="
adb logcat -d -b crash 2>/dev/null | tail -40 || true

echo "=== App-related logcat ==="
adb logcat -d 2>/dev/null | grep -iE 'FATAL|AndroidRuntime|com\.androidsystem' | tail -60 || true

# Save full logcat tail for the artifact (debugging aid)
adb logcat -d 2>/dev/null | tail -300 > /tmp/logcat.txt || true

echo "=== Check app is in foreground ==="
FOCUS=$(adb shell dumpsys window 2>/dev/null | grep -oE 'com\.androidsystem\.update[^ /}]*' | head -1 || true)
if [ -z "$FOCUS" ]; then
  echo "::error::Aplikacia sa nespustila - nie je v popredi. Detaily v logcat.txt artefakte."
  exit 1
fi
echo "OK: App bezi v popredi: $FOCUS"
