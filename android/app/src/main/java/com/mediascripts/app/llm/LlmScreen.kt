package com.mediascripts.app.llm

import android.util.Log
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Button
import androidx.compose.material3.Text
import androidx.compose.material3.TextField
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

private data class ChatTurn(val text: String, val isUser: Boolean)

@Composable
fun LlmScreen(innerPadding: PaddingValues) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()

    var fileKnown by remember { mutableStateOf(false) }
    var selectedFileName by remember { mutableStateOf("") }
    var selectedFileUri by remember { mutableStateOf("") }
    var engineReady by remember { mutableStateOf(false) }
    var chatInput by remember { mutableStateOf("Hello!") }
    var chatOutput by remember { mutableStateOf("") }
    var chatHistory by remember { mutableStateOf(listOf<ChatTurn>()) }

    val log by LlmManager.log.collectAsState()

    val launcher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.OpenDocument()
    ) { uri ->
        uri?.let {
            val name = context.contentResolver.query(it, null, null, null, null)?.use { cursor ->
                val idx = cursor.getColumnIndex(android.provider.OpenableColumns.DISPLAY_NAME)
                cursor.moveToFirst()
                if (idx >= 0) cursor.getString(idx) else null
            }
            if (name?.endsWith(".litertlm") == true) {
                selectedFileUri = it.toString()
                selectedFileName = name
                fileKnown = true
            } else {
                Log.e("LlmScreen", "Invalid model file: $name")
            }
        }
    }

    LaunchedEffect(Unit) {
        LlmManager.partialResults.collect { token -> chatOutput += token }
    }

    LaunchedEffect(selectedFileUri) {
        if (selectedFileUri.isNotEmpty()) {
            withContext(Dispatchers.IO) {
                LlmManager.initialize(context, selectedFileUri) { engineReady = true }
            }
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(innerPadding)
            .padding(16.dp)
    ) {
        Text("LLM — on-device via LiteRT-LM (same engine as basicsMar23)")

        Button(
            onClick = { launcher.launch(arrayOf("*/*")) },
            enabled = !fileKnown,
            modifier = Modifier.padding(vertical = 12.dp)
        ) {
            Text(if (fileKnown) "Model: $selectedFileName" else "Pick .litertlm model file")
        }

        LazyColumn(modifier = Modifier.fillMaxWidth().height(360.dp)) {
            items(chatHistory) { turn ->
                Text(
                    text = if (turn.isUser) "You: ${turn.text}" else "AI: ${turn.text}",
                    modifier = Modifier.padding(bottom = 4.dp)
                )
            }
            if (chatOutput.isNotEmpty()) {
                item { Text("AI: $chatOutput") }
            }
            items(log.takeLast(5)) { line -> Text(line, modifier = Modifier.padding(top = 4.dp)) }
        }

        Row(verticalAlignment = Alignment.CenterVertically) {
            TextField(
                value = chatInput,
                onValueChange = { chatInput = it },
                modifier = Modifier.fillMaxWidth(0.75f)
            )
            Button(
                enabled = engineReady,
                onClick = {
                    val prompt = chatInput
                    if (prompt.isNotBlank()) {
                        scope.launch {
                            chatHistory = chatHistory + ChatTurn(prompt, true)
                            chatInput = ""
                            chatOutput = ""
                            withContext(Dispatchers.IO) { LlmManager.chatStream(prompt) }
                        }
                    }
                }
            ) { Text("Send") }
        }
    }
}
