package com.scriptplayer.app.subtitle

object BilingualAligner {
    private const val MAX_GAP_MS = 1200L

    fun merge(primary: List<SubtitleCue>, translation: List<SubtitleCue>): List<BilingualCue> {
        if (primary.isEmpty() && translation.isEmpty()) return emptyList()
        if (primary.isEmpty()) {
            return translation.map {
                BilingualCue(it.index, it.startMs, it.endMs, primary = "", translation = it.text)
            }
        }
        if (translation.isEmpty()) {
            return primary.map {
                BilingualCue(it.index, it.startMs, it.endMs, primary = it.text, translation = "")
            }
        }

        return primary.mapIndexed { idx, cue ->
            val match = translation.minByOrNull { kotlin.math.abs(it.startMs - cue.startMs) }
            val translationText = if (match != null && kotlin.math.abs(match.startMs - cue.startMs) <= MAX_GAP_MS) {
                match.text
            } else {
                ""
            }
            BilingualCue(
                index = cue.index.takeIf { it > 0 } ?: (idx + 1),
                startMs = cue.startMs,
                endMs = cue.endMs,
                primary = cue.text,
                translation = translationText,
            )
        }
    }
}
