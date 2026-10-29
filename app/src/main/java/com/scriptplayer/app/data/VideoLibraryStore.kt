package com.scriptplayer.app.data

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

class VideoLibraryStore(context: Context) {
    private val prefs = context.applicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    fun loadAll(): List<SavedVideo> {
        val raw = prefs.getString(KEY_ENTRIES, null) ?: return emptyList()
        return runCatching {
            val array = JSONArray(raw)
            buildList {
                for (i in 0 until array.length()) {
                    parseEntry(array.getJSONObject(i))?.let { add(it) }
                }
            }.sortedByDescending { it.lastOpenedMs }
        }.getOrDefault(emptyList())
    }

    fun upsert(entry: SavedVideo) {
        val current = loadAll().associateBy { it.videoUri }.toMutableMap()
        current[entry.videoUri] = entry.copy(lastOpenedMs = System.currentTimeMillis())
        saveAll(current.values.toList())
    }

    fun updateSubtitles(videoUri: String, primarySrtUri: String?, translationSrtUri: String?) {
        val current = loadAll().associateBy { it.videoUri }.toMutableMap()
        val existing = current[videoUri] ?: return
        current[videoUri] = existing.copy(
            primarySrtUri = primarySrtUri ?: existing.primarySrtUri,
            translationSrtUri = translationSrtUri ?: existing.translationSrtUri,
        )
        saveAll(current.values.toList())
    }

    fun remove(videoUri: String) {
        val filtered = loadAll().filterNot { it.videoUri == videoUri }
        saveAll(filtered)
    }

    fun mostRecent(): SavedVideo? = loadAll().maxByOrNull { it.lastOpenedMs }

    private fun saveAll(entries: List<SavedVideo>) {
        val array = JSONArray()
        entries.forEach { array.put(toJson(it)) }
        prefs.edit().putString(KEY_ENTRIES, array.toString()).apply()
    }

    private fun toJson(entry: SavedVideo): JSONObject = JSONObject()
        .put("videoUri", entry.videoUri)
        .put("label", entry.label)
        .put("primarySrtUri", entry.primarySrtUri)
        .put("translationSrtUri", entry.translationSrtUri)
        .put("lastOpenedMs", entry.lastOpenedMs)

    private fun parseEntry(obj: JSONObject): SavedVideo? {
        val videoUri = obj.optString("videoUri").takeIf { it.isNotBlank() } ?: return null
        return SavedVideo(
            videoUri = videoUri,
            label = obj.optString("label", "video"),
            primarySrtUri = obj.optString("primarySrtUri").takeIf { it.isNotBlank() },
            translationSrtUri = obj.optString("translationSrtUri").takeIf { it.isNotBlank() },
            lastOpenedMs = obj.optLong("lastOpenedMs", 0L),
        )
    }

    companion object {
        private const val PREFS_NAME = "script_player_video_library"
        private const val KEY_ENTRIES = "entries"
    }
}
