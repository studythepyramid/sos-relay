package com.mediascripts.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.Scaffold
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import com.mediascripts.app.sos.MapScreen
import com.mediascripts.app.ui.theme.MediaScriptsTheme

/**
 * Second slice per android/design.md: the real map (already built as a web
 * page — Leaflet pan/zoom/pin-drop, coordinate entry, message composer,
 * privacy disclosures) shown via WebView instead of reimplemented natively.
 * SosScreen.kt (plain text-only form) stays in the codebase but isn't wired
 * in — the web map already does everything it did, plus a real map. Voice,
 * Camera, LLM, Editor, Dictionary screens are forked but not wired in yet.
 */
class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            MediaScriptsTheme {
                SosApp()
            }
        }
    }
}

@Composable
fun SosApp() {
    Scaffold(modifier = Modifier.fillMaxSize()) { innerPadding ->
        MapScreen(innerPadding)
    }
}
