package com.scriptplayer.app.data

import android.content.Context
import android.net.Uri

class FavoriteStore(context: Context) {
    private val prefs = context.applicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    fun load(videoUri: Uri?): Set<Int> {
        if (videoUri == null) return emptySet()
        val raw = prefs.getStringSet(storageKey(videoUri), emptySet()) ?: emptySet()
        return raw.mapNotNull { it.toIntOrNull() }.toSet()
    }

    fun isFavorite(videoUri: Uri?, cueIndex: Int): Boolean {
        if (videoUri == null) return false
        return load(videoUri).contains(cueIndex)
    }

    fun toggle(videoUri: Uri, cueIndex: Int): Set<Int> {
        val key = storageKey(videoUri)
        val current = load(videoUri).toMutableSet()
        if (!current.add(cueIndex)) {
            current.remove(cueIndex)
        }
        prefs.edit()
            .putStringSet(key, current.map { it.toString() }.toSet())
            .apply()
        return current
    }

    private fun storageKey(videoUri: Uri): String = "fav:${videoUri.toString()}"

    companion object {
        private const val PREFS_NAME = "script_player_favorites"
    }
}
