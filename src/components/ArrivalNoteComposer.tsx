/**
 * The note that waits at a haunt until someone arrives.
 *
 * Text or voice, never both — recording clears what was typed, and typing clears
 * the recording, because the person arriving should find one thing left for them
 * rather than a form that was filled in.
 *
 * Recording uses `MediaRecorder` and degrades to text-only wherever it or
 * microphone access is unavailable. `AudioNotePlayer` is exported separately so
 * Haunt Detail can play a note back without the composer around it.
 */
import { useEffect, useRef, useState } from 'react'
import { Mic, Pause, Play, Square, X } from 'lucide-react'

const MAX_RECORDING_SECONDS = 15
const WAVEFORM_BARS = [0.35, 0.62, 0.46, 0.78, 0.54, 0.9, 0.42, 0.7, 0.58, 0.84, 0.5, 0.74, 0.4, 0.66, 0.52, 0.8, 0.45, 0.68, 0.56, 0.76, 0.38, 0.64, 0.48, 0.72]

function formatDuration(seconds: number) {
  const total = Math.max(0, Math.round(seconds))
  const minutes = Math.floor(total / 60)
  const remainder = String(total % 60).padStart(2, '0')
  return `${minutes}:${remainder}`
}

function AudioWaveform({ live = false, elapsed = 0 }: { live?: boolean; elapsed?: number }) {
  return (
    <span className={`notes-audio-waveform ${live ? 'is-live' : ''}`} aria-hidden="true">
      {WAVEFORM_BARS.map((height, index) => {
        const liveOffset = live ? Math.sin(elapsed * 5 + index * 0.9) * 0.16 : 0
        const barHeight = Math.max(0.18, Math.min(1, height + liveOffset))
        return <i key={index} style={{ height: `${barHeight * 100}%` }} />
      })}
    </span>
  )
}

export function AudioNotePlayer({
  src,
  duration = 0,
  onClear,
}: {
  src: string
  duration?: number
  onClear?: () => void
}) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const [playing, setPlaying] = useState(false)
  const [metadataDuration, setMetadataDuration] = useState(duration)

  useEffect(() => {
    setPlaying(false)
    setMetadataDuration(duration)
    audioRef.current?.pause()
  }, [src, duration])

  const togglePlayback = () => {
    const audio = audioRef.current
    if (!audio) return
    if (audio.paused) {
      audio.play().then(() => setPlaying(true)).catch(() => setPlaying(false))
    } else {
      audio.pause()
      setPlaying(false)
    }
  }

  return (
    <div className="notes-recorded-field">
      <button
        type="button"
        className="notes-audio-play pressable"
        onClick={togglePlayback}
        aria-label={playing ? 'Pause recorded note' : 'Play recorded note'}
      >
        {playing ? <Pause size={13} fill="currentColor" /> : <Play size={13} fill="currentColor" className="translate-x-px" />}
      </button>
      <AudioWaveform />
      <span className="notes-audio-duration">{formatDuration(metadataDuration)}</span>
      {onClear && (
        <button
          type="button"
          className="notes-audio-clear pressable"
          onClick={onClear}
          aria-label="Clear recording"
        >
          <X size={14} strokeWidth={1.7} />
        </button>
      )}
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        className="notes-audio-native"
        onLoadedMetadata={(event) => {
          if (Number.isFinite(event.currentTarget.duration)) setMetadataDuration(event.currentTarget.duration)
        }}
        onEnded={() => setPlaying(false)}
      />
    </div>
  )
}

export default function ArrivalNoteComposer({
  value,
  audioUrl,
  audioDuration,
  onTextChange,
  onAudioChange,
}: {
  value: string
  audioUrl: string | null
  audioDuration: number
  onTextChange: (value: string) => void
  onAudioChange: (url: string | null, duration: number) => void
}) {
  const recorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const timerRef = useRef<number | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const startedAtRef = useRef(0)
  const mountedRef = useRef(true)
  const [recording, setRecording] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const clearTimer = () => {
    if (timerRef.current !== null) window.clearInterval(timerRef.current)
    timerRef.current = null
  }

  const stopStream = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
  }

  const stopRecording = () => {
    const recorder = recorderRef.current
    if (recorder && recorder.state !== 'inactive') recorder.stop()
    clearTimer()
    setRecording(false)
  }

  useEffect(
    () => () => {
      mountedRef.current = false
      clearTimer()
      const recorder = recorderRef.current
      if (recorder && recorder.state !== 'inactive') recorder.stop()
      stopStream()
    },
    [],
  )

  const startRecording = async () => {
    if (recording || value.length > 0 || audioUrl) return
    setError(null)
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      setError('microphone recording is not available here')
      return
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      const recorder = new MediaRecorder(stream)
      recorderRef.current = recorder
      chunksRef.current = []
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data)
      }
      recorder.onstop = () => {
        const seconds = Math.max(1, Math.min(MAX_RECORDING_SECONDS, (Date.now() - startedAtRef.current) / 1000))
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' })
        if (mountedRef.current) {
          onAudioChange(URL.createObjectURL(blob), seconds)
          setElapsed(seconds)
        }
        stopStream()
      }
      startedAtRef.current = Date.now()
      setElapsed(0)
      setRecording(true)
      recorder.start(100)
      timerRef.current = window.setInterval(() => {
        const seconds = (Date.now() - startedAtRef.current) / 1000
        setElapsed(seconds)
        if (seconds >= MAX_RECORDING_SECONDS) stopRecording()
      }, 100)
    } catch {
      stopStream()
      setError('microphone access was not granted')
    }
  }

  const clearRecording = () => {
    if (audioUrl) URL.revokeObjectURL(audioUrl)
    onAudioChange(null, 0)
    setError(null)
  }

  if (recording) {
    return (
      <div>
        <div className="notes-recording-field">
          <button
            type="button"
            className="notes-audio-stop pressable"
            onClick={stopRecording}
            aria-label="Stop recording"
          >
            <Square size={12} fill="currentColor" />
          </button>
          <AudioWaveform live elapsed={elapsed} />
          <span className="notes-audio-duration">{formatDuration(elapsed)}</span>
        </div>
        {error && <p className="notes-arrival-error">{error}</p>}
      </div>
    )
  }

  if (audioUrl) {
    return (
      <div>
        <AudioNotePlayer src={audioUrl} duration={audioDuration} onClear={clearRecording} />
        <p className="notes-arrival-audio-hint">tap x to clear and start over</p>
        {error && <p className="notes-arrival-error">{error}</p>}
      </div>
    )
  }

  const hasText = value.length > 0
  return (
    <div>
      <div className="notes-arrival-field">
        <textarea
          value={value}
          aria-label="arrival note"
          rows={3}
          maxLength={280}
          onChange={(event) => onTextChange(event.target.value.slice(0, 280))}
          placeholder="say something, or tap the mic to record it instead"
          className="notes-arrival-editor"
        />
        {!hasText && (
          <button
            type="button"
            className="notes-arrival-mic pressable"
            onClick={startRecording}
            aria-label="Record a note"
          >
            <Mic size={13} strokeWidth={1.7} />
          </button>
        )}
      </div>
      {hasText && <p className="notes-arrival-counter">{value.length} / 280</p>}
      {error && <p className="notes-arrival-error">{error}</p>}
    </div>
  )
}
