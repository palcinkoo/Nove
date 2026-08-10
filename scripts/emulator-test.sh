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

echo "=== Drive wizard to the pairing screen (tap through all steps) ==="
# CoreService is exported=false so it cannot be started from adb directly; the
# test drives the REAL wizard UI instead. Permissions are pre-granted above, so
# every step is skipped with "Už mám povolené" until "Spustiť službu" starts
# the service and the completion screen (pairing code) shows up.
adb root >/dev/null 2>&1 || true
sleep 3
adb wait-for-device
adb logcat -c 2>/dev/null || true

# Dumps the accessibility tree and prints every visible text so the CI log
# shows exactly which wizard step is on screen (and what changed after a tap).
visible_texts() {
  adb shell uiautomator dump /sdcard/ui.xml >/dev/null 2>&1 || true
  adb shell cat /sdcard/ui.xml 2>/dev/null | tr -d '\r' \
    | grep -oP 'text="[^"]*"' | sed 's/^text="//; s/"$//' | grep -v '^$' || true
}

tap_by_text() {
  local text="$1"
  # uiautomator dump is flaky right after a tap (UI may not be idle) — retry.
  local xml bounds
  for attempt in 1 2 3; do
    adb shell uiautomator dump /sdcard/ui.xml >/dev/null 2>&1 || true
    xml=$(adb shell cat /sdcard/ui.xml 2>/dev/null | tr -d '\r')
    bounds=$(echo "$xml" | grep -oP "text=\"$text\"[^>]*bounds=\"\[[0-9]+,[0-9]+\]\[[0-9]+,[0-9]+\]\"" | head -1 | grep -oP '\[[0-9]+,[0-9]+\]\[[0-9]+,[0-9]+\]')
    [ -n "$bounds" ] && break
    sleep 2
  done
  if [ -z "$bounds" ]; then
    echo "::error::Tlacidlo '$text' sa nenaslo v UI. Viditelny text:"
    visible_texts | head -25
    exit 1
  fi
  local x1 y1 x2 y2
  x1=$(echo "$bounds" | sed -E 's/\[([0-9]+),([0-9]+)\]\[([0-9]+),([0-9]+)\]/\1/')
  y1=$(echo "$bounds" | sed -E 's/\[([0-9]+),([0-9]+)\]\[([0-9]+),([0-9]+)\]/\2/')
  x2=$(echo "$bounds" | sed -E 's/\[([0-9]+),([0-9]+)\]\[([0-9]+),([0-9]+)\]/\3/')
  y2=$(echo "$bounds" | sed -E 's/\[([0-9]+),([0-9]+)\]\[([0-9]+),([0-9]+)\]/\4/')
  adb shell input tap "$(( (x1 + x2) / 2 ))" "$(( (y1 + y2) / 2 ))"
  sleep 4
  echo "--- po tapnuti '$text' je viditelne: ---"
  visible_texts | head -12
}

for i in $(seq 1 9); do
  tap_by_text "Už mám povolené"
done
tap_by_text "Spustiť službu"

echo "=== Pairing screen check ==="
sleep 4
adb exec-out screencap -p > /tmp/screen_final.png || true
PAIRED_TEXT=""
for attempt in 1 2 3 4 5; do
  adb shell uiautomator dump /sdcard/ui.xml >/dev/null 2>&1 || true
  PAIRED_TEXT=$(adb shell cat /sdcard/ui.xml 2>/dev/null | tr -d '\r' | grep -oE 'Párovanie zariadenia|Nastavenie dokončené|Zariadenie je spárované' | head -1 || true)
  [ -n "$PAIRED_TEXT" ] && break
  sleep 3
done

echo "=== Crash buffer after service start ==="
adb logcat -d -b crash 2>/dev/null | grep "$PKG" | head -30 || echo "(ziadny crash zaznam)"

echo "=== Process alive check ==="
PID=$(adb shell pidof "$PKG" 2>/dev/null | tr -d '\r' || true)
echo "PID: ${PID:-NONE}"

if [ -n "$PAIRED_TEXT" ]; then
  echo "OK: Dokoncovacia obrazovka sa zobrazila: $PAIRED_TEXT"
else
  echo "::error::Dokoncovacia obrazovka sa nezobrazila. Viditelny text na obrazovke:"
  visible_texts | head -30
  echo "--- FATAL / AndroidRuntime z logcat ---"
  adb logcat -d 2>/dev/null | grep -iE 'FATAL|AndroidRuntime|MissingForegroundServiceType|SecurityException' | tail -30 || true
  exit 1
fi

if [ -z "$PID" ]; then
  echo "::error::Proces aplikacie nie je zivy (crash po starte sluzby). Detaily v logcat.txt artefakte."
  exit 1
fi
echo "OK: Proces zivy (pid $PID) - sluzby bezia bez padu"
