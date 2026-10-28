package com.scriptplayer.app.player

import android.app.Application
import android.net.Uri
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.MimeTypes
import androidx.media3.common.Player
import androidx.media3.common.TrackSelectionOverride
import androidx.media3.common.Tracks
import androidx.media3.exoplayer.ExoPlayer
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
)

class PlayerViewModel(application: Application) : AndroidViewModel(application) {
    private val _uiState = MutableStateFlow(PlayerUiState())
    val uiState: StateFlow<PlayerUiState> = _uiState.asStateFlow()

    val exoPlayer: ExoPlayer = ExoPlayer.Builder(application).build().apply {
        playWhenReady = false
        addListener(
            object : Player.Listener {
                override fun onIsPlayingChanged(isPlaying: Boolean) {
                    _uiState.update { it.copy(isPlaying = isPlaying) }
                }

                override fun onTracksChanged(tracks: Tracks) {
                    refreshTrackOptions(tracks)
                }

                override fun onPlaybackStateChanged(playbackState: Int) {
                    if (playbackState == Player.STATE_READY) {
                        _uiState.update { it.copy(durationMs = exoPlayer.duration.coerceAtLeast(0L)) }
                    }
                }
            },
        )
    }

    private var segmentEndMs: Long? = null
    private var segmentMonitorJob: Job? = null

    fun setVideo(uri: Uri, label: String) {
        segmentEndMs = null
        segmentMonitorJob?.cancel()
        _uiState.update {
            it.copy(
                videoUri = uri,
                videoLabel = label,
                statusMessage = "字幕ファイルを選ぶか、埋め込み字幕トラックを選んでください",
            )
        }
        rebuildMediaItem()
    }

    fun setPrimarySrt(uri: Uri) {
        _uiState.update { it.copy(primarySrtUri = uri) }
        reloadCues()
    }

    fun setTranslationSrt(uri: Uri) {
        _uiState.update { it.copy(translationSrtUri = uri) }
        reloadCues()
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
        val cue = _uiState.value.cues.getOrNull(index) ?: return
        segmentEndMs = cue.endMs
        _uiState.update { it.copy(activeCueIndex = index) }
        exoPlayer.seekTo(cue.startMs)
        exoPlayer.playWhenReady = true
        startSegmentMonitor()
    }

    fun togglePlayPause() {
        if (exoPlayer.isPlaying) {
            exoPlayer.pause()
        } else {
            segmentEndMs = null
            exoPlayer.play()
        }
    }

    fun seekBy(deltaMs: Long) {
        val target = (exoPlayer.currentPosition + deltaMs).coerceAtLeast(0L)
        exoPlayer.seekTo(target)
    }

    fun setSpeed(speed: Float) {
        exoPlayer.setPlaybackSpeed(speed)
        _uiState.update { it.copy(playbackSpeed = speed) }
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

    private fun startSegmentMonitor() {
        segmentMonitorJob?.cancel()
        segmentMonitorJob = viewModelScope.launch {
            while (isActive) {
                val end = segmentEndMs
                if (end != null && exoPlayer.currentPosition >= end - 40) {
                    exoPlayer.pause()
                    exoPlayer.seekTo(end)
                    segmentEndMs = null
                }
                _uiState.update { it.copy(positionMs = exoPlayer.currentPosition.coerceAtLeast(0L)) }
                delay(80)
            }
        }
    }

    private fun readText(input: java.io.InputStream?): String? {
        if (input == null) return null
        return input.use { stream -> stream.bufferedReader(Charsets.UTF_8).readText() }
    }

    override fun onCleared() {
        segmentMonitorJob?.cancel()
        exoPlayer.release()
        super.onCleared()
    }
}
