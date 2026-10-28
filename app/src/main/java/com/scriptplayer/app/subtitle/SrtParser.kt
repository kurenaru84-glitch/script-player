package com.scriptplayer.app.subtitle

import java.util.Locale

object SrtParser {
    fun parse(raw: String): List<SubtitleCue> {
        val normalized = raw.replace("\uFEFF", "").replace("\r\n", "\n").trim()
        if (normalized.isEmpty()) return emptyList()

        val blocks = normalized.split(Regex("\n\\s*\n"))
        val cues = mutableListOf<SubtitleCue>()
        var autoIndex = 1

        for (block in blocks) {
            val lines = block.lines().map { it.trim() }.filter { it.isNotEmpty() }
            if (lines.size < 2) continue

            var lineIdx = 0
            val maybeIndex = lines[lineIdx].toIntOrNull()
            if (maybeIndex != null) {
                autoIndex = maybeIndex
                lineIdx++
            }

            if (lineIdx >= lines.size) continue
            val timingLine = lines[lineIdx]
            val timing = parseTiming(timingLine) ?: continue
            lineIdx++

            val text = lines.drop(lineIdx).joinToString("\n").trim()
            if (text.isEmpty()) continue

            cues += SubtitleCue(
                index = autoIndex,
                startMs = timing.first,
                endMs = timing.second,
                text = text,
            )
            autoIndex++
        }

        return cues.sortedBy { it.startMs }
    }

    private fun parseTiming(line: String): Pair<Long, Long>? {
        val parts = line.split("-->")
        if (parts.size != 2) return null
        val start = parseTimestamp(parts[0].trim()) ?: return null
        val end = parseTimestamp(parts[1].trim()) ?: return null
        if (end <= start) return start to (start + 500)
        return start to end
    }

    private fun parseTimestamp(value: String): Long? {
        val cleaned = value.replace(',', '.')
        val chunks = cleaned.split(":")
        if (chunks.size != 3) return null

        return try {
            val hours = chunks[0].toLong()
            val minutes = chunks[1].toLong()
            val secondsParts = chunks[2].split('.')
            val seconds = secondsParts[0].toLong()
            val millis = if (secondsParts.size > 1) {
                secondsParts[1].padEnd(3, '0').take(3).toLong()
            } else {
                0L
            }
            ((hours * 3600 + minutes * 60 + seconds) * 1000) + millis
        } catch (_: NumberFormatException) {
            null
        }
    }

    fun formatMs(ms: Long): String {
        val totalSeconds = ms / 1000
        val hours = totalSeconds / 3600
        val minutes = (totalSeconds % 3600) / 60
        val seconds = totalSeconds % 60
        val millis = ms % 1000
        return if (hours > 0) {
            String.format(Locale.US, "%d:%02d:%02d.%03d", hours, minutes, seconds, millis)
        } else {
            String.format(Locale.US, "%02d:%02d.%03d", minutes, seconds, millis)
        }
    }
}
