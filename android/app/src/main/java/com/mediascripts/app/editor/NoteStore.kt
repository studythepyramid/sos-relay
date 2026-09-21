package com.mediascripts.app.editor

import android.content.Context
import java.io.File

/** Plain-text notes under app-private storage — no permissions needed. */
class NoteStore(private val context: Context) {
    private val notesDir: File
        get() = File(context.filesDir, "notes").apply { mkdirs() }

    fun list(): List<File> = notesDir.listFiles { f -> f.extension == "txt" }
        ?.sortedByDescending { it.lastModified() }
        ?: emptyList()

    fun read(file: File): String = if (file.exists()) file.readText() else ""

    fun write(file: File, content: String) {
        file.writeText(content)
    }

    fun create(name: String): File {
        val safeName = if (name.endsWith(".txt")) name else "$name.txt"
        val file = File(notesDir, safeName)
        if (!file.exists()) file.writeText("")
        return file
    }
}
