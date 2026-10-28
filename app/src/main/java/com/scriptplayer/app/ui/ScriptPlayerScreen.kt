package com.scriptplayer.app.ui

import android.content.Intent
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.FastForward
import androidx.compose.material.icons.filled.FastRewind
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.media3.ui.PlayerView
import com.scriptplayer.app.player.PlayerViewModel
import com.scriptplayer.app.subtitle.BilingualCue

@Composable
fun ScriptPlayerScreen(viewModel: PlayerViewModel) {
    val state by viewModel.uiState.collectAsState()
    val listState = rememberLazyListState()
    val context = LocalContext.current

    fun persistUri(uri: android.net.Uri) {
        try {
            context.contentResolver.takePersistableUriPermission(
                uri,
                Intent.FLAG_GRANT_READ_URI_PERMISSION,
            )
        } catch (_: SecurityException) {
            // OpenDocument usually grants persistable permission; ignore if not.
        }
    }

    val pickVideo = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        if (uri != null) {
            persistUri(uri)
            val label = uri.lastPathSegment?.substringAfterLast('/') ?: "video"
            viewModel.setVideo(uri, label)
        }
    }
    val pickPrimarySrt = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        if (uri != null) {
            persistUri(uri)
            viewModel.setPrimarySrt(uri)
        }
    }
    val pickTranslationSrt = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        if (uri != null) {
            persistUri(uri)
            viewModel.setTranslationSrt(uri)
        }
    }

    LaunchedEffect(state.activeCueIndex) {
        val idx = state.activeCueIndex ?: return@LaunchedEffect
        listState.animateScrollToItem(idx.coerceAtLeast(0))
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(Color(0xFFF7F7F7))
            .padding(horizontal = 12.dp, vertical = 8.dp),
    ) {
        Text(
            text = state.videoLabel.ifBlank { "Script Player" },
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.SemiBold,
            modifier = Modifier.padding(bottom = 8.dp),
        )

        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedButton(onClick = { pickVideo.launch(arrayOf("video/*")) }) {
                Text("動画")
            }
            OutlinedButton(onClick = { pickPrimarySrt.launch(arrayOf("application/x-subrip", "text/*", "*/*")) }) {
                Text("学習字幕")
            }
            OutlinedButton(onClick = { pickTranslationSrt.launch(arrayOf("application/x-subrip", "text/*", "*/*")) }) {
                Text("翻訳字幕")
            }
        }

        Text(
            text = state.statusMessage,
            style = MaterialTheme.typography.bodySmall,
            color = Color.Gray,
            modifier = Modifier.padding(top = 6.dp, bottom = 8.dp),
        )

        if (state.audioTracks.isNotEmpty()) {
            TrackRow(
                title = "音声",
                options = state.audioTracks.map { it.label },
                selected = state.selectedAudioTrack?.label,
                onSelect = { label ->
                    state.audioTracks.firstOrNull { it.label == label }?.let(viewModel::selectAudioTrack)
                },
            )
        }

        if (state.textTracks.isNotEmpty()) {
            TrackRow(
                title = "埋め込み字幕",
                options = listOf("オフ") + state.textTracks.map { it.label },
                selected = state.selectedTextTrack?.label ?: "オフ",
                onSelect = { label ->
                    if (label == "オフ") {
                        viewModel.selectTextTrack(null)
                    } else {
                        state.textTracks.firstOrNull { it.label == label }?.let(viewModel::selectTextTrack)
                    }
                },
            )
        }

        Card(modifier = Modifier.fillMaxWidth()) {
            AndroidView(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(180.dp),
                factory = { context ->
                    PlayerView(context).apply {
                        useController = true
                        player = viewModel.exoPlayer
                    }
                },
                update = { it.player = viewModel.exoPlayer },
            )
        }

        Spacer(modifier = Modifier.height(8.dp))

        LazyColumn(
            state = listState,
            modifier = Modifier.weight(1f),
            verticalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            itemsIndexed(state.cues, key = { _, cue -> cue.index }) { index, cue ->
                CueRow(
                    cue = cue,
                    active = state.activeCueIndex == index,
                    onClick = { viewModel.playCue(index) },
                )
            }
        }

        ControlBar(
            speed = state.playbackSpeed,
            isPlaying = state.isPlaying,
            onToggle = viewModel::togglePlayPause,
            onRewind = { viewModel.seekBy(-3000) },
            onForward = { viewModel.seekBy(3000) },
            onSpeed = {
                val next = when (state.playbackSpeed) {
                    0.75f -> 1.0f
                    1.0f -> 1.25f
                    else -> 0.75f
                }
                viewModel.setSpeed(next)
            },
        )
    }
}

@Composable
private fun TrackRow(
    title: String,
    options: List<String>,
    selected: String?,
    onSelect: (String) -> Unit,
) {
    Column(modifier = Modifier.padding(bottom = 6.dp)) {
        Text(text = title, style = MaterialTheme.typography.labelMedium)
        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            options.forEach { option ->
                FilterChip(
                    selected = option == selected,
                    onClick = { onSelect(option) },
                    label = { Text(option) },
                )
            }
        }
    }
}

@Composable
private fun CueRow(
    cue: BilingualCue,
    active: Boolean,
    onClick: () -> Unit,
) {
    val bg = if (active) Color(0xFFE8F1FF) else Color.White
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .background(bg, MaterialTheme.shapes.medium)
            .clickable(onClick = onClick)
            .padding(horizontal = 12.dp, vertical = 10.dp),
    ) {
        Text(
            text = "#${cue.index}",
            style = MaterialTheme.typography.labelSmall,
            color = Color(0xFFCC3333),
            fontWeight = FontWeight.Bold,
        )
        Text(
            text = cue.primary,
            style = MaterialTheme.typography.bodyLarge,
            modifier = Modifier.padding(top = 2.dp),
        )
        if (cue.translation.isNotBlank()) {
            Text(
                text = cue.translation,
                style = MaterialTheme.typography.bodyMedium,
                color = Color(0xFF444444),
                modifier = Modifier.padding(top = 4.dp),
            )
        }
    }
}

@Composable
private fun ControlBar(
    speed: Float,
    isPlaying: Boolean,
    onToggle: () -> Unit,
    onRewind: () -> Unit,
    onForward: () -> Unit,
    onSpeed: () -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(top = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        Button(onClick = onSpeed) {
            Text("x${"%.2f".format(speed).removeSuffix(".00")}")
        }
        Row(verticalAlignment = Alignment.CenterVertically) {
            IconButton(onClick = onRewind) {
                Icon(Icons.Default.FastRewind, contentDescription = "Rewind")
            }
            IconButton(onClick = onToggle, modifier = Modifier.size(56.dp)) {
                Icon(
                    if (isPlaying) Icons.Default.Pause else Icons.Default.PlayArrow,
                    contentDescription = "Play/Pause",
                    modifier = Modifier.size(36.dp),
                )
            }
            IconButton(onClick = onForward) {
                Icon(Icons.Default.FastForward, contentDescription = "Forward")
            }
        }
        Spacer(modifier = Modifier.size(48.dp))
    }
}
