package com.mediascripts.app.voice

import android.content.Context
import android.media.MediaPlayer
import android.media.MediaRecorder
import android.os.Build
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * Record -> play, the same loop as vecho.sh (record from the mic, then play
 * the result back). vecho.sh's ffmpeg denoise/compress/loudnorm chain isn't
 * ported here yet (no ffmpeg CLI on Android) — this is the record/playback
 * core only; see tasks.md for the native-audio-API cleanup follow-up.
 */
class VoiceRecorder(private val context: Context) {
    private var recorder: MediaRecorder? = null
    private var player: MediaPlayer? = null
    private var currentFile: File? = null

    val recordingsDir: File
        get() = File(context.filesDir, "recordings").apply { mkdirs() }

    fun listRecordings(): List<File> =
        recordingsDir.listFiles { f -> f.extension == "m4a" }
            ?.sortedByDescending { it.lastModified() }
            ?: emptyList()

    fun startRecording(): File {
        stopPlayback()
        val name = "voice_" + SimpleDateFormat("yyyyMMdd_HHmmss", Locale.US).format(Date()) + ".m4a"
        val file = File(recordingsDir, name)

        @Suppress("DEPRECATION")
        val newRecorder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            MediaRecorder(context)
        } else {
            MediaRecorder()
        }
        newRecorder.apply {
            setAudioSource(MediaRecorder.AudioSource.MIC)
            setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
            setAudioEncoder(MediaRecorder.AudioEncoder.AAC)
            setAudioSamplingRate(48000)
            setOutputFile(file.absolutePath)
            prepare()
            start()
        }
        recorder = newRecorder
        currentFile = file
        return file
    }

    fun stopRecording(): File? {
        try {
            recorder?.apply {
                stop()
                release()
            }
        } catch (_: RuntimeException) {
            // stop() throws if start() never produced any data — drop the file.
            currentFile?.delete()
            currentFile = null
        }
        recorder = null
        return currentFile
    }

    fun play(file: File, onComplete: () -> Unit) {
        stopPlayback()
        player = MediaPlayer().apply {
            setDataSource(file.absolutePath)
            setOnCompletionListener {
                onComplete()
                stopPlayback()
            }
            prepare()
            start()
        }
    }

    fun stopPlayback() {
        player?.apply {
            if (isPlaying) stop()
            release()
        }
        player = null
    }

    fun release() {
        try {
            recorder?.release()
        } catch (_: RuntimeException) {
        }
        recorder = null
        stopPlayback()
    }
}
