package com.scriptplayer.app.player

import android.app.Application
import android.content.Intent
import android.net.Uri
import androidx.core.content.ContextCompat
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.MimeTypes
import androidx.media3.common.Player
import androidx.media3.common.TrackSelectionOverride
import androidx.media3.common.Tracks
import androidx.media3.exoplayer.ExoPlayer
import com.scriptplayer.app.ScriptPlayerApplication
import com.scriptplayer.app.data.SavedVideo
import com.scriptplayer.app.data.StudyPreferences
import com.scriptplayer.app.explain.LineExplainer
import com.scriptplayer.app.playback.PlaybackService
import com.scriptplayer.app.subtitle.BilingualAligner
import com.scriptplayer.app.subtitle.BilingualCue
import com.scriptplayer.app.subtitle.SrtParser
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

data class PlayerUiState(
    val videoUri: Uri? = null,
    val videoLabel: String = "",
    val primarySrtUri: Uri? = null,
    val translationSrtUri: Uri? = null,
    val cues: List<BilingualCue> = emptyList(),
    val activeCueIndex: Int? = null,
    val audioTracks: List<MediaTrackOption> = emptyList(),
    val textTracks: List<MediaTrackOption> = emptyList(),
    val selectedAudioTrack: MediaTrackOption? = null,
    val selectedTextTrack: MediaTrackOption? = null,
    val playbackSpeed: Float = 1f,
    val positionMs: Long = 0L,
    val durationMs: Long = 0L,
    val isPlaying: Boolean = false,
    val statusMessage: String = "動画を選んでください",
    val repeatCount: Int = StudyPreferences.DEFAULT_REPEAT_COUNT,
    val favoriteCueIndices: Set<Int> = emptySet(),
    val showFavoritesOnly: Boolean = false,
    val favoritePlaylistActive: Boolean = false,
    val explanationTargetIndex: Int? = null,
    val explanationText: String? = null,
    val explanationFromCache: Boolean = false,
    val explanationLoading: Boolean = false,
    val explanationError: String? = null,
    val apiKeyConfigured: Boolean = false,
    val savedVideos: List<SavedVideo> = emptyList(),
    val explanationUserNote: String = "",
    val userNoteCueIndices: Set<Int> = emptySet(),
)

class PlayerViewModel(application: Application) : AndroidViewModel(application) {
    private val app = application as ScriptPlayerApplication
    private val studyPreferences = app.studyPreferences
    private val favoriteStore = app.favoriteStore
    private val explanationCache = app.explanationCache
    private val videoLibraryStore = app.videoLibraryStore
    private val lineNoteStore = app.lineNoteStore
    private val lineExplainer = LineExplainer()

    private val _uiState = MutableStateFlow(
        PlayerUiState(
            repeatCount = studyPreferences.repeatCount,
            apiKeyConfigured = studyPreferences.geminiApiKey.isNotBlank(),
        ),
    )
    val uiState: StateFlow<PlayerUiState> = _uiState.asStateFlow()

    val exoPlayer: ExoPlayer = app.playbackHolder.player

    /** リピート用の区間（repeatCount > 1 のときだけ有効） */
    private var segmentStartMs: Long? = null
    private var segmentEndMs: Long? = null
    private var segmentRepeatsRemaining: Int = 0

    private var favoritePlayQueue: List<Int>? = null
    private var favoriteQueueStep: Int = 0
    private var playbackMonitorJob: Job? = null

    private val playerListener = object : Player.Listener {
        override fun onIsPlayingChanged(isPlaying: Boolean) {
            _uiState.update { it.copy(isPlaying = isPlaying) }
            if (isPlaying) {
                ensurePlaybackService()
            }
        }

        override fun onTracksChanged(tracks: Tracks) {
            refreshTrackOptions(tracks)
        }

        override fun onPlaybackStateChanged(playbackState: Int) {
            if (playbackState == Player.STATE_READY) {
                _uiState.update { it.copy(durationMs = exoPlayer.duration.coerceAtLeast(0L)) }
            }
        }
    }

    init {
        exoPlayer.addListener(playerListener)
        startPlaybackMonitor()
        viewModelScope.launch {
            refreshSavedVideos()
            videoLibraryStore.mostRecent()?.let { openSavedVideo(it, bumpLastOpened = false) }
        }
    }

    fun setVideo(uri: Uri, label: String) {
        clearRepeatSegment()
        favoritePlayQueue = null
        favoriteQueueStep = 0
        val favorites = favoriteStore.load(uri)
        val existing = videoLibraryStore.loadAll().find { it.videoUri == uri.toString() }
        _uiState.update {
            it.copy(
                videoUri = uri,
                videoLabel = label,
                primarySrtUri = null,
                translationSrtUri = null,
                cues = emptyList(),
                favoriteCueIndices = favorites,
                favoritePlaylistActive = false,
                statusMessage = "字幕ファイルを選ぶか、埋め込み字幕トラックを選んでください",
            )
        }
        rebuildMediaItem()
        videoLibraryStore.upsert(
            SavedVideo(
                videoUri = uri.toString(),
                label = label,
                primarySrtUri = existing?.primarySrtUri,
                translationSrtUri = existing?.translationSrtUri,
            ),
        )
        refreshSavedVideos()
        refreshUserNoteIndices(uri)
        existing?.primarySrtUri?.let { applySavedSrt(Uri.parse(it), primary = true) }
        existing?.translationSrtUri?.let { applySavedSrt(Uri.parse(it), primary = false) }
    }

    fun openSavedVideo(entry: SavedVideo, bumpLastOpened: Boolean = true) {
        val uri = Uri.parse(entry.videoUri)
        if (!canReadUri(uri)) {
            _uiState.update {
                it.copy(
                    statusMessage = "「${entry.label}」へのアクセスが切れています。もう一度「動画」から選び直してください",
                )
            }
            return
        }
        clearRepeatSegment()
        favoritePlayQueue = null
        favoriteQueueStep = 0
        val favorites = favoriteStore.load(uri)
        _uiState.update {
            it.copy(
                videoUri = uri,
                videoLabel = entry.label,
                primarySrtUri = null,
                translationSrtUri = null,
                cues = emptyList(),
                favoriteCueIndices = favorites,
                favoritePlaylistActive = false,
                statusMessage = "字幕を読み込み中…",
            )
        }
        rebuildMediaItem()
        if (bumpLastOpened) {
            videoLibraryStore.upsert(entry)
            refreshSavedVideos()
        }
        entry.primarySrtUri?.let { applySavedSrt(Uri.parse(it), primary = true) }
        entry.translationSrtUri?.let { applySavedSrt(Uri.parse(it), primary = false) }
        refreshUserNoteIndices(uri)
        if (_uiState.value.cues.isEmpty()) {
            _uiState.update {
                it.copy(statusMessage = "字幕ファイルを選ぶか、埋め込み字幕トラックを選んでください")
            }
        }
    }

    fun removeSavedVideo(videoUri: String) {
        videoLibraryStore.remove(videoUri)
        refreshSavedVideos()
    }

    fun setPrimarySrt(uri: Uri) {
        _uiState.update { it.copy(primarySrtUri = uri) }
        reloadCues()
        persistSubtitlesToLibrary()
    }

    fun setTranslationSrt(uri: Uri) {
        _uiState.update { it.copy(translationSrtUri = uri) }
        reloadCues()
        persistSubtitlesToLibrary()
    }

    private fun applySavedSrt(uri: Uri, primary: Boolean) {
        if (!canReadUri(uri)) return
        if (primary) {
            _uiState.update { it.copy(primarySrtUri = uri) }
        } else {
            _uiState.update { it.copy(translationSrtUri = uri) }
        }
        reloadCues()
    }

    private fun persistSubtitlesToLibrary() {
        val state = _uiState.value
        val videoUri = state.videoUri?.toString() ?: return
        videoLibraryStore.upsert(
            SavedVideo(
                videoUri = videoUri,
                label = state.videoLabel.ifBlank { "video" },
                primarySrtUri = state.primarySrtUri?.toString(),
                translationSrtUri = state.translationSrtUri?.toString(),
            ),
        )
        refreshSavedVideos()
    }

    private fun refreshSavedVideos() {
        _uiState.update { it.copy(savedVideos = videoLibraryStore.loadAll()) }
    }

    private fun canReadUri(uri: Uri): Boolean {
        val resolver = getApplication<Application>().contentResolver
        val persisted = resolver.persistedUriPermissions.any { perm ->
            perm.uri == uri && perm.isReadPermission
        }
        if (persisted) return true
        return runCatching { resolver.openInputStream(uri)?.use { } }.isSuccess
    }

    fun setRepeatCount(count: Int) {
        val clamped = count.coerceIn(StudyPreferences.MIN_REPEAT, StudyPreferences.MAX_REPEAT)
        studyPreferences.repeatCount = clamped
        _uiState.update { it.copy(repeatCount = clamped) }
    }

    fun cycleRepeatCount() {
        val options = listOf(1, 2, 3, 5, 10, 20)
        val current = _uiState.value.repeatCount
        val next = options.firstOrNull { it > current } ?: options.first()
        setRepeatCount(next)
    }

    fun setShowFavoritesOnly(show: Boolean) {
        _uiState.update { it.copy(showFavoritesOnly = show) }
    }

    fun toggleFavorite(cueIndex: Int) {
        val videoUri = _uiState.value.videoUri ?: return
        val updated = favoriteStore.toggle(videoUri, cueIndex)
        _uiState.update { it.copy(favoriteCueIndices = updated) }
    }

    fun playFavoritePlaylist() {
        val indices = sortedFavoriteIndices()
        if (indices.isEmpty()) {
            _uiState.update { it.copy(statusMessage = "お気に入りがありません") }
            return
        }
        favoritePlayQueue = indices
        favoriteQueueStep = 0
        _uiState.update {
            it.copy(
                favoritePlaylistActive = true,
                statusMessage = "お気に入り ${indices.size} 行（飛ばしながら連続再生）",
            )
        }
        playCueInternal(indices.first(), fromUser = true)
    }

    fun stopFavoritePlaylist() {
        favoritePlayQueue = null
        favoriteQueueStep = 0
        _uiState.update { it.copy(favoritePlaylistActive = false) }
    }

    fun selectAudioTrack(option: MediaTrackOption) {
        val params = exoPlayer.trackSelectionParameters
            .buildUpon()
            .clearOverridesOfType(C.TRACK_TYPE_AUDIO)
            .addOverride(
                TrackSelectionOverride(
                    exoPlayer.currentTracks.groups[option.groupIndex].mediaTrackGroup,
                    option.trackIndex,
                ),
            )
            .build()
        exoPlayer.trackSelectionParameters = params
        _uiState.update { it.copy(selectedAudioTrack = option) }
    }

    fun selectTextTrack(option: MediaTrackOption?) {
        val builder = exoPlayer.trackSelectionParameters.buildUpon()
            .clearOverridesOfType(C.TRACK_TYPE_TEXT)
        if (option != null) {
            builder.addOverride(
                TrackSelectionOverride(
                    exoPlayer.currentTracks.groups[option.groupIndex].mediaTrackGroup,
                    option.trackIndex,
                ),
            )
        } else {
            builder.setTrackTypeDisabled(C.TRACK_TYPE_TEXT, true)
        }
        exoPlayer.trackSelectionParameters = builder.build()
        _uiState.update { it.copy(selectedTextTrack = option) }
    }

    fun playCue(index: Int) {
        favoritePlayQueue = null
        favoriteQueueStep = 0
        _uiState.update { it.copy(favoritePlaylistActive = false) }
        playCueInternal(index, fromUser = true)
    }

    fun togglePlayPause() {
        if (exoPlayer.isPlaying) {
            exoPlayer.pause()
        } else {
            exoPlayer.play()
            ensurePlaybackService()
        }
    }

    fun seekBy(deltaMs: Long) {
        clearRepeatSegment()
        val target = (exoPlayer.currentPosition + deltaMs).coerceAtLeast(0L)
        exoPlayer.seekTo(target)
    }

    fun setSpeed(speed: Float) {
        exoPlayer.setPlaybackSpeed(speed)
        _uiState.update { it.copy(playbackSpeed = speed) }
    }

    fun saveGeminiApiKey(key: String) {
        studyPreferences.geminiApiKey = key
        _uiState.update { it.copy(apiKeyConfigured = key.isNotBlank()) }
    }

    fun dismissExplanation() {
        _uiState.update {
            it.copy(
                explanationTargetIndex = null,
                explanationText = null,
                explanationFromCache = false,
                explanationError = null,
                explanationLoading = false,
                explanationUserNote = "",
            )
        }
    }

    fun openExplanation(cueIndex: Int) {
        val videoUri = _uiState.value.videoUri
        val cached = if (videoUri != null) explanationCache.get(videoUri, cueIndex) else null
        val userNote = if (videoUri != null) lineNoteStore.get(videoUri, cueIndex).orEmpty() else ""
        _uiState.update {
            it.copy(
                explanationTargetIndex = cueIndex,
                explanationText = cached,
                explanationFromCache = cached != null,
                explanationError = null,
                explanationLoading = cached == null && userNote.isBlank(),
                explanationUserNote = userNote,
            )
        }
        if (cached == null && _uiState.value.apiKeyConfigured) {
            fetchExplanation(cueIndex, forceRefresh = false)
        } else if (cached == null && !_uiState.value.apiKeyConfigured) {
            _uiState.update { it.copy(explanationLoading = false) }
        }
    }

    fun saveUserNote(cueIndex: Int, text: String) {
        val videoUri = _uiState.value.videoUri ?: return
        lineNoteStore.put(videoUri, cueIndex, text)
        refreshUserNoteIndices(videoUri)
        _uiState.update { it.copy(explanationUserNote = text.trim()) }
    }

    private fun refreshUserNoteIndices(videoUri: Uri? = _uiState.value.videoUri) {
        if (videoUri == null) {
            _uiState.update { it.copy(userNoteCueIndices = emptySet()) }
            return
        }
        _uiState.update { it.copy(userNoteCueIndices = lineNoteStore.indicesWithNotes(videoUri)) }
    }

    fun refreshExplanation(cueIndex: Int) {
        fetchExplanation(cueIndex, forceRefresh = true)
    }

    fun visibleCueIndices(): List<Int> {
        val state = _uiState.value
        if (!state.showFavoritesOnly) {
            return state.cues.indices.toList()
        }
        return state.cues.indices.filter { state.favoriteCueIndices.contains(it) }
    }

    private fun fetchExplanation(cueIndex: Int, forceRefresh: Boolean) {
        val state = _uiState.value
        val cue = state.cues.getOrNull(cueIndex) ?: return
        val videoUri = state.videoUri

        if (!forceRefresh && videoUri != null) {
            explanationCache.get(videoUri, cueIndex)?.let { cached ->
                _uiState.update {
                    it.copy(
                        explanationTargetIndex = cueIndex,
                        explanationText = cached,
                        explanationFromCache = true,
                        explanationLoading = false,
                        explanationError = null,
                    )
                }
                return
            }
        }

        viewModelScope.launch {
            _uiState.update {
                it.copy(
                    explanationTargetIndex = cueIndex,
                    explanationLoading = true,
                    explanationError = null,
                    explanationText = if (forceRefresh) null else it.explanationText,
                    explanationFromCache = false,
                )
            }
            val result = lineExplainer.explain(
                apiKey = studyPreferences.geminiApiKey,
                primaryLine = cue.primary,
                translationLine = cue.translation,
            )
            _uiState.update { ui ->
                if (ui.explanationTargetIndex != cueIndex) return@update ui
                result.fold(
                    onSuccess = { text ->
                        if (videoUri != null) {
                            explanationCache.put(videoUri, cueIndex, text)
                        }
                        ui.copy(
                            explanationLoading = false,
                            explanationText = text,
                            explanationFromCache = false,
                            explanationError = null,
                        )
                    },
                    onFailure = { err ->
                        ui.copy(
                            explanationLoading = false,
                            explanationError = err.message ?: "解説に失敗しました",
                        )
                    },
                )
            }
        }
    }

    private fun playCueInternal(index: Int, fromUser: Boolean) {
        val cue = _uiState.value.cues.getOrNull(index) ?: return
        val repeat = _uiState.value.repeatCount
        if (repeat > 1) {
            segmentStartMs = cue.startMs
            segmentEndMs = cue.endMs
            segmentRepeatsRemaining = repeat
        } else {
            clearRepeatSegment()
        }
        _uiState.update { it.copy(activeCueIndex = index) }
        exoPlayer.seekTo(cue.startMs)
        exoPlayer.playWhenReady = true
        if (fromUser) {
            ensurePlaybackService()
        }
    }

    private fun rebuildMediaItem() {
        val state = _uiState.value
        val videoUri = state.videoUri ?: return

        val subtitleConfigs = buildList {
            state.primarySrtUri?.let { uri ->
                add(
                    MediaItem.SubtitleConfiguration.Builder(uri)
                        .setMimeType(MimeTypes.APPLICATION_SUBRIP)
                        .setLanguage("primary")
                        .setSelectionFlags(C.SELECTION_FLAG_DEFAULT)
                        .build(),
                )
            }
            state.translationSrtUri?.let { uri ->
                add(
                    MediaItem.SubtitleConfiguration.Builder(uri)
                        .setMimeType(MimeTypes.APPLICATION_SUBRIP)
                        .setLanguage("translation")
                        .build(),
                )
            }
        }

        val builder = MediaItem.Builder().setUri(videoUri)
        if (subtitleConfigs.isNotEmpty()) {
            builder.setSubtitleConfigurations(subtitleConfigs)
        }

        exoPlayer.setMediaItem(builder.build())
        exoPlayer.prepare()
    }

    private fun reloadCues() {
        viewModelScope.launch {
            val context = getApplication<Application>()
            val state = _uiState.value
            val primary = state.primarySrtUri?.let { readText(context.contentResolver.openInputStream(it)) }
            val translation = state.translationSrtUri?.let { readText(context.contentResolver.openInputStream(it)) }

            val primaryCues = primary?.let { SrtParser.parse(it) }.orEmpty()
            val translationCues = translation?.let { SrtParser.parse(it) }.orEmpty()
            val merged = BilingualAligner.merge(primaryCues, translationCues)

            _uiState.update {
                it.copy(
                    cues = merged,
                    statusMessage = when {
                        merged.isEmpty() -> "字幕が読み込めていません"
                        translationCues.isEmpty() -> "学習用字幕 ${merged.size} 行（翻訳未設定）"
                        else -> "二言語字幕 ${merged.size} 行"
                    },
                )
            }
            rebuildMediaItem()
        }
    }

    private fun refreshTrackOptions(tracks: Tracks) {
        val audio = mutableListOf<MediaTrackOption>()
        val text = mutableListOf<MediaTrackOption>()
        tracks.groups.forEachIndexed { groupIndex, group ->
            if (group.type == C.TRACK_TYPE_AUDIO) {
                for (trackIndex in 0 until group.length) {
                    if (!group.isTrackSupported(trackIndex)) continue
                    val format = group.getTrackFormat(trackIndex)
                    audio += MediaTrackOption(
                        groupIndex = groupIndex,
                        trackIndex = trackIndex,
                        label = format.label ?: format.language ?: "Audio ${trackIndex + 1}",
                        language = format.language,
                        mimeType = format.sampleMimeType,
                    )
                }
            }
            if (group.type == C.TRACK_TYPE_TEXT) {
                for (trackIndex in 0 until group.length) {
                    if (!group.isTrackSupported(trackIndex)) continue
                    val format = group.getTrackFormat(trackIndex)
                    text += MediaTrackOption(
                        groupIndex = groupIndex,
                        trackIndex = trackIndex,
                        label = format.label ?: format.language ?: "Subtitle ${trackIndex + 1}",
                        language = format.language,
                        mimeType = format.sampleMimeType,
                    )
                }
            }
        }
        _uiState.update {
            it.copy(
                audioTracks = audio,
                textTracks = text,
                selectedAudioTrack = it.selectedAudioTrack ?: audio.firstOrNull(),
            )
        }
    }

    private fun startPlaybackMonitor() {
        playbackMonitorJob?.cancel()
        playbackMonitorJob = viewModelScope.launch {
            while (isActive) {
                val pos = exoPlayer.currentPosition.coerceAtLeast(0L)
                handleRepeatSegmentAt(pos)
                maybeAdvanceFavoritePlaylist(pos)
                _uiState.update {
                    it.copy(
                        positionMs = pos,
                        activeCueIndex = cueIndexAt(pos, it.cues),
                    )
                }
                delay(80)
            }
        }
    }

    private fun handleRepeatSegmentAt(pos: Long) {
        val end = segmentEndMs ?: return
        if (pos < end - 40) return
        if (segmentRepeatsRemaining > 1) {
            segmentRepeatsRemaining--
            val start = segmentStartMs ?: return
            exoPlayer.seekTo(start)
            exoPlayer.play()
        } else {
            clearRepeatSegment()
        }
    }

    private fun maybeAdvanceFavoritePlaylist(pos: Long) {
        val queue = favoritePlayQueue ?: return
        if (segmentEndMs != null) return
        if (favoriteQueueStep >= queue.size) return

        val cueIndex = queue[favoriteQueueStep]
        val cue = _uiState.value.cues.getOrNull(cueIndex) ?: return
        if (pos < cue.endMs - 40) return

        if (favoriteQueueStep >= queue.lastIndex) {
            finishFavoritePlaylist()
            return
        }
        favoriteQueueStep++
        val nextCue = _uiState.value.cues.getOrNull(queue[favoriteQueueStep]) ?: return
        exoPlayer.seekTo(nextCue.startMs)
    }

    private fun finishFavoritePlaylist() {
        favoritePlayQueue = null
        favoriteQueueStep = 0
        _uiState.update {
            it.copy(
                favoritePlaylistActive = false,
                statusMessage = "お気に入り区間の再生が終わりました（動画は続行）",
            )
        }
    }

    private fun cueIndexAt(positionMs: Long, cues: List<BilingualCue>): Int? {
        cues.forEachIndexed { index, cue ->
            if (positionMs in cue.startMs until cue.endMs) return index
        }
        return null
    }

    private fun sortedFavoriteIndices(): List<Int> {
        val state = _uiState.value
        return state.cues.indices.filter { state.favoriteCueIndices.contains(it) }.sorted()
    }

    private fun clearRepeatSegment() {
        segmentStartMs = null
        segmentEndMs = null
        segmentRepeatsRemaining = 0
    }

    private fun ensurePlaybackService() {
        val context = getApplication<Application>()
        ContextCompat.startForegroundService(
            context,
            Intent(context, PlaybackService::class.java),
        )
    }

    private fun readText(input: java.io.InputStream?): String? {
        if (input == null) return null
        return input.use { stream -> stream.bufferedReader(Charsets.UTF_8).readText() }
    }

    override fun onCleared() {
        playbackMonitorJob?.cancel()
        exoPlayer.removeListener(playerListener)
        super.onCleared()
    }
}
