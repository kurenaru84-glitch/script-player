package com.scriptplayer.app

import android.app.Application
import com.scriptplayer.app.data.ExplanationCache
import com.scriptplayer.app.data.FavoriteStore
import com.scriptplayer.app.data.StudyPreferences
import com.scriptplayer.app.player.PlaybackHolder

class ScriptPlayerApplication : Application() {
    lateinit var playbackHolder: PlaybackHolder
        private set
    lateinit var favoriteStore: FavoriteStore
        private set
    lateinit var studyPreferences: StudyPreferences
        private set
    lateinit var explanationCache: ExplanationCache
        private set

    override fun onCreate() {
        super.onCreate()
        playbackHolder = PlaybackHolder(this)
        favoriteStore = FavoriteStore(this)
        studyPreferences = StudyPreferences(this)
        explanationCache = ExplanationCache(this)
    }
}
