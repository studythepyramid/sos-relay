package com.mediascripts.app.sos

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.Text
import androidx.compose.material3.TextField
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL
import java.util.UUID

// First slice per android/design.md: smallest possible end-to-end path —
// text message, manually-entered coordinates (same pattern already used by
// the map frontend's own manual-entry mode), submit to the local preview
// API. Camera/mic/album/translation are later slices, wired in once this
// path is proven on a real device.

private const val API_BASE = "http://127.0.0.1:18188"

private sealed interface SubmitState {
    data object Idle : SubmitState
    data object Sending : SubmitState
    data class Success(val id: String) : SubmitState
    data class Failed(val reason: String) : SubmitState
}

private fun jsonString(value: String): String {
    val out = StringBuilder("\"")
    for (ch in value) {
        when (ch) {
            '"' -> out.append("\\\"")
            '\\' -> out.append("\\\\")
            '\n' -> out.append("\\n")
            '\r' -> out.append("\\r")
            '\t' -> out.append("\\t")
            else -> if (ch.code < 0x20) out.append("\\u%04x".format(ch.code)) else out.append(ch)
        }
    }
    out.append("\"")
    return out.toString()
}

private fun submitPin(latitude: Double, longitude: Double, message: String): Pair<Int, String> {
    val id = UUID.randomUUID().toString()
    val body = """{"id":${jsonString(id)},"latitude":$latitude,"longitude":$longitude,"message":${jsonString(message)},"share_contact":false}"""
    val connection = URL("$API_BASE/api/sos/pins").openConnection() as HttpURLConnection
    return try {
        connection.requestMethod = "POST"
        connection.doOutput = true
        connection.setRequestProperty("Content-Type", "application/json")
        connection.connectTimeout = 10_000
        connection.readTimeout = 10_000
        OutputStreamWriter(connection.outputStream, Charsets.UTF_8).use { it.write(body) }
        val code = connection.responseCode
        val stream = if (code in 200..299) connection.inputStream else connection.errorStream
        val text = stream?.bufferedReader()?.use { it.readText() } ?: ""
        code to text
    } finally {
        connection.disconnect()
    }
}

@Composable
fun SosScreen(innerPadding: PaddingValues) {
    var message by remember { mutableStateOf("") }
    var latitude by remember { mutableStateOf("") }
    var longitude by remember { mutableStateOf("") }
    var state by remember { mutableStateOf<SubmitState>(SubmitState.Idle) }
    val scope = rememberCoroutineScope()

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(innerPadding)
            .padding(16.dp)
    ) {
        Text("SOS — send a message with your location")

        TextField(
            value = message,
            onValueChange = { message = it },
            placeholder = { Text("What's happening, what help is needed") },
            modifier = Modifier
                .fillMaxWidth()
                .height(140.dp)
                .padding(vertical = 8.dp)
        )

        Row(modifier = Modifier.fillMaxWidth()) {
            TextField(
                value = latitude,
                onValueChange = { latitude = it },
                placeholder = { Text("latitude") },
                modifier = Modifier.fillMaxWidth(0.5f).padding(end = 4.dp)
            )
            TextField(
                value = longitude,
                onValueChange = { longitude = it },
                placeholder = { Text("longitude") },
                modifier = Modifier.fillMaxWidth()
            )
        }

        Button(
            onClick = {
                val lat = latitude.toDoubleOrNull()
                val lon = longitude.toDoubleOrNull()
                if (lat == null || lon == null) {
                    state = SubmitState.Failed("Latitude/longitude must be numbers")
                } else if (message.isBlank()) {
                    state = SubmitState.Failed("Message can't be empty")
                } else {
                    state = SubmitState.Sending
                    scope.launch {
                        val result = withContext(Dispatchers.IO) {
                            runCatching { submitPin(lat, lon, message) }
                        }
                        state = result.fold(
                            onSuccess = { (code, body) ->
                                if (code == 201) SubmitState.Success(body) else SubmitState.Failed("HTTP $code: $body")
                            },
                            onFailure = { SubmitState.Failed(it.message ?: "Network error") }
                        )
                    }
                }
            },
            modifier = Modifier.padding(top = 8.dp)
        ) { Text("Send SOS") }

        when (val s = state) {
            is SubmitState.Idle -> {}
            is SubmitState.Sending -> Text("Sending…")
            is SubmitState.Success -> Text("Saved: ${s.id}")
            is SubmitState.Failed -> Text("Failed: ${s.reason}")
        }
    }
}
