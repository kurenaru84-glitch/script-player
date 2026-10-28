package com.scriptplayer.app.ui

import android.content.Intent
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.FastForward
import androidx.compose.material.icons.filled.FastRewind
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.outlined.Info
import androidx.compose.material.icons.outlined.StarOutline
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.media3.ui.PlayerView
import com.scriptplayer.app.player.PlayerViewModel
import com.scriptplayer.app.subtitle.BilingualCue

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ScriptPlayerScreen(viewModel: PlayerViewModel) {
    val state by viewModel.uiState.collectAsState()
    val listState = rememberLazyListState()
    val context = LocalContext.current
    var showSettings by remember { mutableStateOf(false) }
    var apiKeyDraft by remember(state.apiKeyConfigured) {
        mutableStateOf(if (state.apiKeyConfigured) "********" else "")
    }

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
        val visible = viewModel.visibleCueIndices()
        val listPos = visible.indexOf(idx).takeIf { it >= 0 } ?: idx
        listState.animateScrollToItem(listPos.coerceAtLeast(0))
    }

    val visibleIndices = viewModel.visibleCueIndices()

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(Color(0xFFF7F7F7))
            .navigationBarsPadding()
            .padding(horizontal = 12.dp, vertical = 8.dp),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                text = state.videoLabel.ifBlank { "Script Player" },
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold,
                modifier = Modifier.weight(1f),
            )
            IconButton(onClick = { showSettings = true }) {
                Icon(Icons.Default.Settings, contentDescription = "設定")
            }
        }

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
            modifier = Modifier.padding(top = 6.dp, bottom = 4.dp),
        )

        StudyToolRow(
            repeatCount = state.repeatCount,
            showFavoritesOnly = state.showFavoritesOnly,
            favoriteCount = state.favoriteCueIndices.size,
            playlistActive = state.favoritePlaylistActive,
            onRepeatClick = viewModel::cycleRepeatCount,
            onToggleFavoritesFilter = { viewModel.setShowFavoritesOnly(!state.showFavoritesOnly) },
            onPlayFavorites = viewModel::playFavoritePlaylist,
            onStopPlaylist = viewModel::stopFavoritePlaylist,
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
                factory = { ctx ->
                    PlayerView(ctx).apply {
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
            items(visibleIndices, key = { it }) { index ->
                val cue = state.cues[index]
                CueRow(
                    cue = cue,
                    active = state.activeCueIndex == index,
                    favorite = state.favoriteCueIndices.contains(index),
                    onPlay = { viewModel.playCue(index) },
                    onToggleFavorite = { viewModel.toggleFavorite(index) },
                    onExplain = { viewModel.openExplanation(index) },
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
            modifier = Modifier.padding(bottom = 12.dp),
        )
    }

    if (showSettings) {
        AlertDialog(
            onDismissRequest = { showSettings = false },
            title = { Text("学習・解説設定") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(
                        "Gemini API キー（Google AI Studio）。端末内に保存。解説は端末にもキャッシュされます。",
                        style = MaterialTheme.typography.bodySmall,
                    )
                    OutlinedTextField(
                        value = apiKeyDraft,
                        onValueChange = { apiKeyDraft = it },
                        label = { Text("Gemini API キー") },
                        singleLine = true,
                        visualTransformation = PasswordVisualTransformation(),
                        modifier = Modifier.fillMaxWidth(),
                    )
                }
            },
            confirmButton = {
                TextButton(
                    onClick = {
                        if (apiKeyDraft != "********") {
                            viewModel.saveGeminiApiKey(apiKeyDraft)
                        }
                        showSettings = false
                    },
                ) {
                    Text("保存")
                }
            },
            dismissButton = {
                TextButton(onClick = { showSettings = false }) {
                    Text("閉じる")
                }
            },
        )
    }

    val explainIndex = state.explanationTargetIndex
    if (explainIndex != null) {
        val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
        val cue = state.cues.getOrNull(explainIndex)
        ModalBottomSheet(
            onDismissRequest = viewModel::dismissExplanation,
            sheetState = sheetState,
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 20.dp, vertical = 8.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text("セリフ解説", style = MaterialTheme.typography.titleMedium)
                    if (state.explanationFromCache && state.explanationText != null) {
                        Text("保存済み", style = MaterialTheme.typography.labelSmall, color = Color.Gray)
                    }
                }
                cue?.let {
                    Text(it.primary, fontWeight = FontWeight.SemiBold)
                    if (it.translation.isNotBlank()) {
                        Text(it.translation, color = Color.Gray)
                    }
                }
                when {
                    state.explanationLoading -> {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            CircularProgressIndicator(modifier = Modifier.size(24.dp))
                            Text("解説を生成中…", modifier = Modifier.padding(start = 12.dp))
                        }
                    }
                    state.explanationError != null -> {
                        Text(state.explanationError!!, color = Color(0xFFAA2222))
                        if (!state.apiKeyConfigured) {
                            Text("右上の設定から API キーを入力してください。", style = MaterialTheme.typography.bodySmall)
                        }
                        Button(onClick = { viewModel.refreshExplanation(explainIndex) }) {
                            Text("再試行")
                        }
                    }
                    state.explanationText != null -> {
                        Text(state.explanationText!!)
                        if (!state.explanationLoading) {
                            TextButton(onClick = { viewModel.refreshExplanation(explainIndex) }) {
                                Text("再生成")
                            }
                        }
                    }
                }
                Spacer(modifier = Modifier.navigationBarsPadding().height(16.dp))
            }
        }
    }
}

@Composable
private fun StudyToolRow(
    repeatCount: Int,
    showFavoritesOnly: Boolean,
    favoriteCount: Int,
    playlistActive: Boolean,
    onRepeatClick: () -> Unit,
    onToggleFavoritesFilter: () -> Unit,
    onPlayFavorites: () -> Unit,
    onStopPlaylist: () -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(bottom = 6.dp),
        horizontalArrangement = Arrangement.spacedBy(6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        FilterChip(
            selected = false,
            onClick = onRepeatClick,
            label = { Text("リピート ×$repeatCount") },
        )
        FilterChip(
            selected = showFavoritesOnly,
            onClick = onToggleFavoritesFilter,
            label = { Text("★のみ ($favoriteCount)") },
        )
        if (playlistActive) {
            OutlinedButton(onClick = onStopPlaylist, modifier = Modifier.height(32.dp)) {
                Text("連続再生停止", style = MaterialTheme.typography.labelMedium)
            }
        } else {
            OutlinedButton(
                onClick = onPlayFavorites,
                enabled = favoriteCount > 0,
                modifier = Modifier.height(32.dp),
            ) {
                Text("★連続再生", style = MaterialTheme.typography.labelMedium)
            }
        }
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
    favorite: Boolean,
    onPlay: () -> Unit,
    onToggleFavorite: () -> Unit,
    onExplain: () -> Unit,
) {
    val bg = if (active) Color(0xFFE8F1FF) else Color.White
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(bg, MaterialTheme.shapes.medium)
            .clickable(onClick = onPlay)
            .padding(start = 12.dp, end = 4.dp, top = 8.dp, bottom = 8.dp),
        verticalAlignment = Alignment.Top,
    ) {
        Column(modifier = Modifier.weight(1f)) {
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
        Column {
            IconButton(onClick = onToggleFavorite) {
                Icon(
                    imageVector = if (favorite) Icons.Filled.Star else Icons.Outlined.StarOutline,
                    contentDescription = "お気に入り",
                    tint = if (favorite) Color(0xFFE6A800) else Color.Gray,
                )
            }
            IconButton(onClick = onExplain) {
                Icon(Icons.Outlined.Info, contentDescription = "解説", tint = Color(0xFF336699))
            }
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
    modifier: Modifier = Modifier,
) {
    Row(
        modifier = modifier
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
