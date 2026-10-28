package com.scriptplayer.app.player

import android.content.Context
import androidx.media3.exoplayer.ExoPlayer

class PlaybackHolder(context: Context) {
    val player: ExoPlayer = ExoPlayer.Builder(context.applicationContext).build().apply {
        playWhenReady = false
    }
}
