package com.scriptplayer.app.data

import android.content.Context
import android.net.Uri
import java.io.File

class LineNoteStore(context: Context) {
    private val root = File(context.applicationContext.filesDir, "line_notes").apply { mkdirs() }

    fun get(videoUri: Uri, cueIndex: Int): String? {
        val file = fileFor(videoUri, cueIndex)
        if (!file.isFile) return null
        return file.readText(Charsets.UTF_8).takeIf { it.isNotBlank() }
    }

    fun put(videoUri: Uri, cueIndex: Int, text: String) {
        val trimmed = text.trim()
        val file = fileFor(videoUri, cueIndex)
        if (trimmed.isEmpty()) {
            if (file.isFile) file.delete()
        } else {
            file.writeText(trimmed, Charsets.UTF_8)
        }
    }

    fun indicesWithNotes(videoUri: Uri): Set<Int> {
        val prefix = "${storageId(videoUri)}_"
        return root.listFiles()
            ?.mapNotNull { file ->
                if (!file.isFile || !file.name.startsWith(prefix)) return@mapNotNull null
                file.name.removePrefix(prefix).removeSuffix(".txt").toIntOrNull()
            }
            ?.toSet()
            ?: emptySet()
    }

    private fun fileFor(videoUri: Uri, cueIndex: Int): File {
        return File(root, "${storageId(videoUri)}_$cueIndex.txt")
    }

    private fun storageId(videoUri: Uri): String =
        videoUri.toString().hashCode().toUInt().toString(16)
}
