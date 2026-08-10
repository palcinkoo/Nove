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

echo "=== Grant runtime permissions (simulates finished wizard) ==="
for p in \
  android.permission.ACCESS_FINE_LOCATION \
  android.permission.ACCESS_COARSE_LOCATION \
  android.permission.ACCESS_BACKGROUND_LOCATION \
  android.permission.READ_SMS \
  android.permission.READ_CALL_LOG \
  android.permission.READ_PHONE_STATE \
  android.permission.READ_CONTACTS \
  android.permission.POST_NOTIFICATIONS; do
  adb shell pm grant "$PKG" "$p" >/dev/null 2>&1 || echo "pm grant skipped: $p"
done

echo "=== Start CoreService (the wizard's final step) ==="
# CoreService is exported=false, so the adb shell user cannot start it; a
# root adbd (google_apis images support `adb root`) can.
adb root >/dev/null 2>&1 || true
sleep 3
adb wait-for-device
adb logcat -c 2>/dev/null || true
adb shell am start-foreground-service --user 0 -n "$PKG/.service.CoreService"
sleep 10

echo "=== Crash buffer after service start ==="
CRASH=$(adb logcat -d -b crash 2>/dev/null | grep -c "$PKG" || true)
if [ "$CRASH" -gt 0 ]; then
  adb logcat -d -b crash 2>/dev/null | grep "$PKG" | head -30
  echo "::error::CoreService zhavaroval po starte. Detaily v logcat.txt artefakte."
  exit 1
fi

echo "=== Service process alive check ==="
PID=$(adb shell pidof "$PKG" 2>/dev/null | tr -d '\r' || true)
if [ -z "$PID" ]; then
  echo "::error::Proces aplikacie nie je zivy (CoreService crash). Detaily v logcat.txt artefakte."
  exit 1
fi
echo "OK: Proces zivy (pid $PID) - CoreService bezi bez padu"
