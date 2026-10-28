package com.scriptplayer.app.data

import android.content.Context

class StudyPreferences(context: Context) {
    private val prefs = context.applicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    var repeatCount: Int
        get() = prefs.getInt(KEY_REPEAT_COUNT, DEFAULT_REPEAT_COUNT).coerceIn(MIN_REPEAT, MAX_REPEAT)
        set(value) {
            prefs.edit().putInt(KEY_REPEAT_COUNT, value.coerceIn(MIN_REPEAT, MAX_REPEAT)).apply()
        }

    var geminiApiKey: String
        get() = prefs.getString(KEY_GEMINI_API_KEY, "").orEmpty()
        set(value) {
            prefs.edit().putString(KEY_GEMINI_API_KEY, value.trim()).apply()
        }

    companion object {
        private const val PREFS_NAME = "script_player_study"
        private const val KEY_REPEAT_COUNT = "repeat_count"
        private const val KEY_GEMINI_API_KEY = "gemini_api_key"
        const val DEFAULT_REPEAT_COUNT = 1
        const val MIN_REPEAT = 1
        const val MAX_REPEAT = 99
    }
}
