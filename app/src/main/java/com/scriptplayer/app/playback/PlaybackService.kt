package com.scriptplayer.app.playback

import androidx.media3.session.MediaSession
import androidx.media3.session.MediaSessionService
import com.scriptplayer.app.ScriptPlayerApplication

class PlaybackService : MediaSessionService() {
    private var mediaSession: MediaSession? = null

    override fun onCreate() {
        super.onCreate()
        val player = (application as ScriptPlayerApplication).playbackHolder.player
        mediaSession = MediaSession.Builder(this, player).build()
    }

    override fun onGetSession(controllerInfo: MediaSession.ControllerInfo): MediaSession? = mediaSession

    override fun onDestroy() {
        mediaSession?.release()
        mediaSession = null
        super.onDestroy()
    }
}
