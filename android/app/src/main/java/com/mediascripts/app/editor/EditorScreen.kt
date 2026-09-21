package com.mediascripts.app.editor

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
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Text
import androidx.compose.material3.TextField
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import java.io.File

@Composable
fun EditorScreen(innerPadding: PaddingValues) {
    val context = LocalContext.current
    val store = remember { NoteStore(context) }

    var notes by remember { mutableStateOf(store.list()) }
    var currentFile by remember { mutableStateOf<File?>(null) }
    var text by remember { mutableStateOf("") }
    var newName by remember { mutableStateOf("") }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(innerPadding)
            .padding(16.dp)
    ) {
        Text("Editor — plain-text notes, saved on device")

        Row(modifier = Modifier.padding(vertical = 8.dp)) {
            TextField(
                value = newName,
                onValueChange = { newName = it },
                placeholder = { Text("new note name") },
                modifier = Modifier.fillMaxWidth(0.7f)
            )
            Button(
                onClick = {
                    if (newName.isNotBlank()) {
                        val file = store.create(newName)
                        notes = store.list()
                        currentFile = file
                        text = store.read(file)
                        newName = ""
                    }
                }
            ) { Text("New") }
        }

        LazyColumn(modifier = Modifier.fillMaxWidth()) {
            items(notes) { file ->
                Button(
                    onClick = {
                        currentFile?.let { store.write(it, text) }
                        currentFile = file
                        text = store.read(file)
                    },
                    modifier = Modifier.padding(vertical = 2.dp)
                ) { Text(file.name) }
            }
        }

        HorizontalDivider(modifier = Modifier.padding(vertical = 8.dp))

        currentFile?.let { file ->
            Text("Editing: ${file.name}")
            TextField(
                value = text,
                onValueChange = { text = it },
                modifier = Modifier
                    .fillMaxWidth()
                    .height(320.dp)
                    .padding(vertical = 8.dp)
            )
            Button(onClick = { store.write(file, text) }) { Text("Save") }
        } ?: Text("Pick or create a note to start editing.")
    }
}
