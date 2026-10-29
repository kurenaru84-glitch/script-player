package com.scriptplayer.app.explain

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.TimeUnit

class LineExplainer(
    private val model: String = DEFAULT_MODEL,
    private val http: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(30, TimeUnit.SECONDS)
        .readTimeout(90, TimeUnit.SECONDS)
        .build(),
) {
    suspend fun explain(
        apiKey: String,
        primaryLine: String,
        translationLine: String,
    ): Result<String> = withContext(Dispatchers.IO) {
        if (apiKey.isBlank()) {
            return@withContext Result.failure(IllegalStateException("Gemini API キーが未設定です（設定から入力）"))
        }
        if (primaryLine.isBlank()) {
            return@withContext Result.failure(IllegalArgumentException("解説するセリフがありません"))
        }

        val prompt = buildString {
            appendLine("学習者向けに、次のセリフを解説してください。")
            appendLine("・重要な単語・熟語")
            appendLine("・文法ポイント（簡潔に）")
            appendLine("・聞き取りやすい読み/意味の補足")
            appendLine("日本語で、箇条書き中心、300字程度。")
            appendLine()
            appendLine("【学習言語のセリフ】")
            appendLine(primaryLine)
            if (translationLine.isNotBlank()) {
                appendLine()
                appendLine("【翻訳】")
                appendLine(translationLine)
            }
        }

        val body = JSONObject()
            .put(
                "contents",
                JSONArray().put(
                    JSONObject().put(
                        "parts",
                        JSONArray().put(JSONObject().put("text", prompt)),
                    ),
                ),
            )
            .put(
                "generationConfig",
                JSONObject()
                    .put("temperature", 0.4)
                    .put("maxOutputTokens", 768)
                    .put(
                        "thinkingConfig",
                        JSONObject().put("thinkingLevel", "low"),
                    ),
            )
            .toString()
            .toRequestBody("application/json".toMediaType())

        val url =
            "https://generativelanguage.googleapis.com/v1beta/models/$model:generateContent?key=$apiKey"
        val request = Request.Builder()
            .url(url)
            .post(body)
            .build()

        runCatching {
            http.newCall(request).execute().use { response ->
                val raw = response.body?.string().orEmpty()
                if (!response.isSuccessful) {
                    val detail = runCatching {
                        JSONObject(raw).optJSONObject("error")?.optString("message")
                    }.getOrNull()
                    throw IllegalStateException(detail ?: "Gemini API エラー (${response.code})")
                }
                val content = JSONObject(raw)
                    .getJSONArray("candidates")
                    .getJSONObject(0)
                    .getJSONObject("content")
                    .getJSONArray("parts")
                    .getJSONObject(0)
                    .getString("text")
                    .trim()
                if (content.isBlank()) throw IllegalStateException("空の応答でした")
                content
            }
        }
    }

    companion object {
        /** セリフ解説向け: 3.8 より軽い Flash（日常タスク向け） */
        const val DEFAULT_MODEL = "gemini-3.6-flash"
    }
}
