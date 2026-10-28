package com.scriptplayer.app.data

import android.content.Context
import android.net.Uri
import java.io.File

class ExplanationCache(context: Context) {
    private val root = File(context.applicationContext.filesDir, "line_explanations").apply { mkdirs() }

    fun get(videoUri: Uri, cueIndex: Int): String? {
        val file = fileFor(videoUri, cueIndex)
        if (!file.isFile) return null
        return file.readText(Charsets.UTF_8).takeIf { it.isNotBlank() }
    }

    fun put(videoUri: Uri, cueIndex: Int, text: String) {
        fileFor(videoUri, cueIndex).writeText(text.trim(), Charsets.UTF_8)
    }

    private fun fileFor(videoUri: Uri, cueIndex: Int): File {
        val id = videoUri.toString().hashCode().toUInt().toString(16)
        return File(root, "${id}_$cueIndex.txt")
    }
}
