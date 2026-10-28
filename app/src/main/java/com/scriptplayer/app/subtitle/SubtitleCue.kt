package com.scriptplayer.app.subtitle

data class SubtitleCue(
    val index: Int,
    val startMs: Long,
    val endMs: Long,
    val text: String,
)

data class BilingualCue(
    val index: Int,
    val startMs: Long,
    val endMs: Long,
    val primary: String,
    val translation: String,
)
