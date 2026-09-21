package com.mediascripts.app.sos

import android.annotation.SuppressLint
import android.util.Log
import android.webkit.ConsoleMessage
import android.webkit.WebChromeClient
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.viewinterop.AndroidView

// The real map (pan/zoom/pin-drop, Leaflet + OSM) already exists and is
// already tested as a web page (docs/map/, py/map/preview.py) — this wraps
// it in a WebView instead of reimplementing map UI natively in Kotlin. Same
// reasoning as reusing editor/voice/camera from media-scripts: don't rebuild
// something that already works.
private const val MAP_URL = "http://127.0.0.1:18188/map/"

@SuppressLint("SetJavaScriptEnabled")
@Composable
fun MapScreen(innerPadding: PaddingValues) {
    AndroidView(
        modifier = Modifier
            .fillMaxSize()
            .padding(innerPadding),
        factory = { context ->
            WebView.setWebContentsDebuggingEnabled(true)
            WebView(context).apply {
                settings.javaScriptEnabled = true
                settings.domStorageEnabled = true
                // Dev-phase only: the local server has no cache-control
                // headers, and WebView was caching sos-map.js across app
                // restarts (only pm clear'ing app data forced a fresh
                // fetch). Always bypass cache while iterating on JS served
                // from the local preview server.
                settings.cacheMode = WebSettings.LOAD_NO_CACHE
                webViewClient = WebViewClient()
                webChromeClient = object : WebChromeClient() {
                    override fun onConsoleMessage(message: ConsoleMessage): Boolean {
                        Log.d("SosMapConsole", "${message.message()} [${message.sourceId()}:${message.lineNumber()}]")
                        return true
                    }
                }
                loadUrl(MAP_URL)
            }
        },
    )
}
