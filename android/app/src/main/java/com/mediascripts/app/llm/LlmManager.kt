package com.mediascripts.app.llm

import android.content.Context
import android.net.Uri
import android.os.Environment
import androidx.core.net.toUri
import com.google.ai.edge.litertlm.Backend
import com.google.ai.edge.litertlm.Engine
import com.google.ai.edge.litertlm.EngineConfig
import java.io.File
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * Singleton wrapper around the LiteRT-LM on-device engine. Same approach as
 * `basicsMar23`'s LlmManager (proven working on-device with a Gemma 3 1B
 * int4 `.litertlm` model) — this is that pattern, ported and self-contained
 * (no dependency on basicsMar23's MyTools logger).
 */
object LlmManager {
    // Default model path — matches basicsMar23's convention so an
    // already-downloaded model file can be reused as-is.
    var modelPath: String = File(
        Environment.getExternalStorageDirectory(),
        "Download/gemma3-1b-it-int4.litertlm"
    ).absolutePath

    private var engine: Engine? = null
    private var conversation: com.google.ai.edge.litertlm.Conversation? = null

    val partialResults = MutableSharedFlow<String>(extraBufferCapacity = 64)

    private val _log = MutableStateFlow<List<String>>(emptyList())
    val log = _log.asStateFlow()

    private fun addLog(message: String) {
        _log.value = _log.value + message
    }

    suspend fun initialize(context: Context, uriString: String?, onReady: () -> Unit) {
        if (engine != null) {
            addLog("Engine already initialized.")
            onReady()
            return
        }

        if (uriString != null && uriString.startsWith("content://")) {
            val uri: Uri = uriString.toUri()
            val targetFile = File(context.filesDir, "llm_model.litertlm")

            if (!targetFile.exists() || targetFile.length() == 0L) {
                addLog("Copying model from picked file...")
                try {
                    context.contentResolver.openInputStream(uri)?.use { input ->
                        targetFile.outputStream().use { output -> input.copyTo(output) }
                    }
                } catch (e: Exception) {
                    addLog("Failed to copy model: ${e.message}")
                    return
                }
            }
            modelPath = targetFile.absolutePath
        }

        val file = File(modelPath)
        if (!file.exists()) {
            addLog("Model file not found at: $modelPath")
            return
        }

        addLog("Initializing engine: $modelPath")
        try {
            val config = EngineConfig(modelPath = modelPath, backend = Backend.CPU())
            val newEngine = Engine(config)
            newEngine.initialize()
            engine = newEngine
            conversation = newEngine.createConversation()
            addLog("Engine ready.")
            onReady()
        } catch (e: Exception) {
            addLog("Failed to initialize engine: ${e.message}")
        }
    }

    suspend fun chatStream(prompt: String) {
        val currentConv = conversation ?: run {
            addLog("Conversation not initialized. Call initialize() first.")
            return
        }

        try {
            currentConv.sendMessageAsync(prompt).collect { token ->
                partialResults.emit(token.toString())
            }
        } catch (e: Exception) {
            addLog("Chat error: ${e.message}")
            partialResults.emit("\n[Chat Error: ${e.message}]")
        }
    }

    fun close() {
        engine?.close()
        engine = null
        conversation = null
    }
}
