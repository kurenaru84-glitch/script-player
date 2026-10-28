package com.scriptplayer.app.player

data class MediaTrackOption(
    val groupIndex: Int,
    val trackIndex: Int,
    val label: String,
    val language: String?,
    val mimeType: String?,
)
