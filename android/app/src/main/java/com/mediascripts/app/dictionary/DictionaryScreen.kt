package com.mediascripts.app.dictionary

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
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
import org.json.JSONArray

private data class Entry(val word: String, val definition: String)

private fun loadEntries(context: android.content.Context): List<Entry> {
    val text = context.assets.open("dictionary/words.json").bufferedReader().use { it.readText() }
    val array = JSONArray(text)
    return (0 until array.length()).map { i ->
        val obj = array.getJSONObject(i)
        Entry(obj.getString("word"), obj.getString("definition"))
    }
}

@Composable
fun DictionaryScreen(innerPadding: PaddingValues) {
    val context = LocalContext.current
    val entries = remember { loadEntries(context) }
    var query by remember { mutableStateOf("") }

    val filtered = if (query.isBlank()) {
        entries
    } else {
        entries.filter { it.word.contains(query, ignoreCase = true) }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(innerPadding)
            .padding(16.dp)
    ) {
        Text("Dictionary — offline, bundled word list")
        TextField(
            value = query,
            onValueChange = { query = it },
            placeholder = { Text("Search a word...") },
            modifier = Modifier
                .fillMaxWidth()
                .padding(vertical = 8.dp)
        )
        HorizontalDivider()
        LazyColumn {
            items(filtered) { entry ->
                Column(modifier = Modifier.padding(vertical = 8.dp)) {
                    Text(entry.word)
                    Text(entry.definition)
                }
                HorizontalDivider()
            }
        }
    }
}
