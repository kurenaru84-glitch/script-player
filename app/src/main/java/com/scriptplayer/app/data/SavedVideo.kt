package com.scriptplayer.app.data

data class SavedVideo(
    val videoUri: String,
    val label: String,
    val primarySrtUri: String? = null,
    val translationSrtUri: String? = null,
    val lastOpenedMs: Long = 0L,
)
