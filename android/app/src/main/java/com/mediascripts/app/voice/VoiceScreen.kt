package com.mediascripts.app.voice

import android.Manifest
import android.content.pm.PackageManager
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Button
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import java.io.File

@Composable
fun VoiceScreen(innerPadding: PaddingValues) {
    val context = LocalContext.current
    val recorder = remember { VoiceRecorder(context) }

    var hasMicPermission by remember {
        mutableStateOf(
            ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO) ==
                PackageManager.PERMISSION_GRANTED
        )
    }
    val permissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { granted -> hasMicPermission = granted }

    var isRecording by remember { mutableStateOf(false) }
    var isPlaying by remember { mutableStateOf(false) }
    var recordings by remember { mutableStateOf(recorder.listRecordings()) }
    var status by remember { mutableStateOf("Idle") }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(innerPadding)
            .padding(16.dp)
    ) {
        Text("Voice — record, then play back (vecho.sh port)")
        Text("Status: $status", modifier = Modifier.padding(top = 4.dp, bottom = 12.dp))

        if (!hasMicPermission) {
            Button(onClick = { permissionLauncher.launch(Manifest.permission.RECORD_AUDIO) }) {
                Text("Grant microphone permission")
            }
        } else {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Button(
                    enabled = !isRecording,
                    onClick = {
                        recorder.startRecording()
                        isRecording = true
                        status = "Recording..."
                    }
                ) { Text("Record") }

                Button(
                    enabled = isRecording,
                    onClick = {
                        recorder.stopRecording()
                        isRecording = false
                        recordings = recorder.listRecordings()
                        status = "Recorded"
                    }
                ) { Text("Stop") }
            }
        }

        HorizontalDivider(modifier = Modifier.padding(vertical = 12.dp))
        Text("Recordings", modifier = Modifier.padding(bottom = 8.dp))

        LazyColumn(modifier = Modifier.fillMaxWidth()) {
            items(recordings) { file: File ->
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(vertical = 4.dp),
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Text(file.name, modifier = Modifier.padding(top = 8.dp))
                    Button(
                        enabled = !isPlaying,
                        onClick = {
                            isPlaying = true
                            status = "Playing ${file.name}"
                            recorder.play(file) {
                                isPlaying = false
                                status = "Idle"
                            }
                        }
                    ) { Text("Play") }
                }
            }
        }
    }
}
