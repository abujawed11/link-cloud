import { useCallback, useEffect, useRef, useState } from 'react'

const RATES = [0.5, 0.75, 1, 1.25, 1.5, 2]
const SKIP_SECONDS = 10
const HIDE_DELAY_MS = 2800

function formatTime(sec) {
  if (!Number.isFinite(sec) || sec < 0) return '0:00'
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = Math.floor(sec % 60)
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m)
  const ss = String(s).padStart(2, '0')
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`
}

function Icon({ name }) {
  const common = { viewBox: '0 0 24 24', width: 20, height: 20, fill: 'none' }
  switch (name) {
    case 'play':
      return (
        <svg {...common}>
          <path d="M7 4.5v15l13-7.5-13-7.5Z" fill="currentColor" />
        </svg>
      )
    case 'pause':
      return (
        <svg {...common}>
          <rect x="6" y="4.5" width="4" height="15" rx="1" fill="currentColor" />
          <rect x="14" y="4.5" width="4" height="15" rx="1" fill="currentColor" />
        </svg>
      )
    case 'replay':
      return (
        <svg {...common} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 12a9 9 0 1 0 3-6.7" />
          <path d="M3 4v5h5" />
        </svg>
      )
    case 'skip-back':
      return (
        <svg {...common} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M11 19 2 12l9-7v14Z" fill="currentColor" stroke="none" />
          <path d="M22 19 13 12l9-7v14Z" fill="currentColor" stroke="none" />
        </svg>
      )
    case 'skip-forward':
      return (
        <svg {...common} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M13 5l9 7-9 7V5Z" fill="currentColor" stroke="none" />
          <path d="M2 5l9 7-9 7V5Z" fill="currentColor" stroke="none" />
        </svg>
      )
    case 'volume-high':
      return (
        <svg {...common} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 9v6h4l5 5V4L8 9H4Z" fill="currentColor" stroke="none" />
          <path d="M16.5 8.5a5 5 0 0 1 0 7" />
          <path d="M19 6a8.5 8.5 0 0 1 0 12" />
        </svg>
      )
    case 'volume-low':
      return (
        <svg {...common} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 9v6h4l5 5V4L8 9H4Z" fill="currentColor" stroke="none" />
          <path d="M16.5 9.5a3.5 3.5 0 0 1 0 5" />
        </svg>
      )
    case 'volume-mute':
      return (
        <svg {...common} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 9v6h4l5 5V4L8 9H4Z" fill="currentColor" stroke="none" />
          <path d="M16 9l5 6M21 9l-5 6" />
        </svg>
      )
    case 'fullscreen-enter':
      return (
        <svg {...common} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M8 21H5a2 2 0 0 1-2-2v-3M16 21h3a2 2 0 0 0 2-2v-3" />
        </svg>
      )
    case 'fullscreen-exit':
      return (
        <svg {...common} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 3v4a2 2 0 0 1-2 2H3M15 3v4a2 2 0 0 0 2 2h4M9 21v-4a2 2 0 0 0-2-2H3M15 21v-4a2 2 0 0 1 2-2h4" />
        </svg>
      )
    case 'settings':
      return (
        <svg {...common} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
        </svg>
      )
    default:
      return null
  }
}

export default function VideoPlayer({ src, poster, autoPlay = true }) {
  const videoRef = useRef(null)
  const containerRef = useRef(null)
  const hideTimer = useRef(null)
  const scrubbingRef = useRef(false)
  const playingRef = useRef(false)

  const [playing, setPlaying] = useState(false)
  const [ended, setEnded] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [buffered, setBuffered] = useState(0)
  const [volume, setVolume] = useState(1)
  const [muted, setMuted] = useState(false)
  const [rate, setRate] = useState(1)
  const [loading, setLoading] = useState(true)
  const [controlsVisible, setControlsVisible] = useState(true)
  const [showSpeedMenu, setShowSpeedMenu] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => {
    playingRef.current = playing
  }, [playing])

  // Controls only auto-hide while something is actually playing; paused,
  // ended, or still loading, they stay up so a click-to-pause doesn't leave
  // the user staring at a bar that vanishes on its own.
  const scheduleHide = useCallback(() => {
    clearTimeout(hideTimer.current)
    if (!playingRef.current) return
    hideTimer.current = setTimeout(() => {
      if (!scrubbingRef.current) setControlsVisible(false)
    }, HIDE_DELAY_MS)
  }, [])

  const wake = useCallback(() => {
    setControlsVisible(true)
    scheduleHide()
  }, [scheduleHide])

  useEffect(() => {
    return () => clearTimeout(hideTimer.current)
  }, [])

  // Native listeners (not React's synthetic onMouseMove/onClick) so activity
  // is still picked up reliably once the container is promoted to the
  // Fullscreen API's top layer.
  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const handleActivity = () => wake()
    const handleClick = (e) => {
      if (e.target === videoRef.current) togglePlay()
    }

    el.addEventListener('mousemove', handleActivity)
    el.addEventListener('mousedown', handleActivity)
    el.addEventListener('touchstart', handleActivity, { passive: true })
    el.addEventListener('click', handleClick)
    return () => {
      el.removeEventListener('mousemove', handleActivity)
      el.removeEventListener('mousedown', handleActivity)
      el.removeEventListener('touchstart', handleActivity)
      el.removeEventListener('click', handleClick)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wake])

  useEffect(() => {
    const v = videoRef.current
    if (!v) return

    const onTimeUpdate = () => setCurrentTime(v.currentTime)
    const onDuration = () => setDuration(v.duration || 0)
    const onPlay = () => {
      setPlaying(true)
      setEnded(false)
      wake() // start the auto-hide countdown now that playback has begun
    }
    const onPause = () => {
      setPlaying(false)
      clearTimeout(hideTimer.current)
      setControlsVisible(true)
    }
    const onEnded = () => {
      setPlaying(false)
      setEnded(true)
      clearTimeout(hideTimer.current)
      setControlsVisible(true)
    }
    const onWaiting = () => setLoading(true)
    const onPlaying = () => setLoading(false)
    const onCanPlay = () => setLoading(false)
    const onProgress = () => {
      if (v.buffered.length) {
        try {
          setBuffered(v.buffered.end(v.buffered.length - 1))
        } catch {
          /* ignore */
        }
      }
    }
    const onError = () => {
      setLoading(false)
      setErrorMsg("Can't play this file in the browser. Try Download instead.")
    }
    const onVolumeChange = () => {
      setVolume(v.volume)
      setMuted(v.muted)
    }

    v.addEventListener('timeupdate', onTimeUpdate)
    v.addEventListener('durationchange', onDuration)
    v.addEventListener('loadedmetadata', onDuration)
    v.addEventListener('play', onPlay)
    v.addEventListener('pause', onPause)
    v.addEventListener('ended', onEnded)
    v.addEventListener('waiting', onWaiting)
    v.addEventListener('playing', onPlaying)
    v.addEventListener('canplay', onCanPlay)
    v.addEventListener('progress', onProgress)
    v.addEventListener('error', onError)
    v.addEventListener('volumechange', onVolumeChange)

    return () => {
      v.removeEventListener('timeupdate', onTimeUpdate)
      v.removeEventListener('durationchange', onDuration)
      v.removeEventListener('loadedmetadata', onDuration)
      v.removeEventListener('play', onPlay)
      v.removeEventListener('pause', onPause)
      v.removeEventListener('ended', onEnded)
      v.removeEventListener('waiting', onWaiting)
      v.removeEventListener('playing', onPlaying)
      v.removeEventListener('canplay', onCanPlay)
      v.removeEventListener('progress', onProgress)
      v.removeEventListener('error', onError)
      v.removeEventListener('volumechange', onVolumeChange)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const onFsChange = () => setIsFullscreen(document.fullscreenElement === containerRef.current)
    document.addEventListener('fullscreenchange', onFsChange)
    return () => document.removeEventListener('fullscreenchange', onFsChange)
  }, [])

  const togglePlay = useCallback(() => {
    const v = videoRef.current
    if (!v) return
    if (v.paused || v.ended) v.play().catch(() => {})
    else v.pause()
  }, [])

  const skip = useCallback((delta) => {
    const v = videoRef.current
    if (!v) return
    v.currentTime = Math.min(Math.max(0, v.currentTime + delta), duration || v.duration || Infinity)
  }, [duration])

  const seekTo = useCallback((time) => {
    const v = videoRef.current
    if (!v) return
    v.currentTime = Math.min(Math.max(0, time), duration || v.duration || 0)
  }, [duration])

  const toggleMute = useCallback(() => {
    const v = videoRef.current
    if (!v) return
    v.muted = !v.muted
    if (!v.muted && v.volume === 0) v.volume = 0.5
  }, [])

  const changeVolume = useCallback((val) => {
    const v = videoRef.current
    if (!v) return
    v.volume = val
    v.muted = val === 0
  }, [])

  const changeRate = useCallback((r) => {
    const v = videoRef.current
    if (!v) return
    v.playbackRate = r
    setRate(r)
    setShowSpeedMenu(false)
  }, [])

  const toggleFullscreen = useCallback(() => {
    const el = containerRef.current
    if (!el) return
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {})
    else el.requestFullscreen().catch(() => {})
  }, [])

  const onKeyDown = useCallback(
    (e) => {
      switch (e.key) {
        case ' ':
        case 'k':
          e.preventDefault()
          togglePlay()
          break
        case 'ArrowRight':
          e.preventDefault()
          skip(SKIP_SECONDS)
          break
        case 'ArrowLeft':
          e.preventDefault()
          skip(-SKIP_SECONDS)
          break
        case 'ArrowUp':
          e.preventDefault()
          changeVolume(Math.min(1, volume + 0.1))
          break
        case 'ArrowDown':
          e.preventDefault()
          changeVolume(Math.max(0, volume - 0.1))
          break
        case 'm':
          toggleMute()
          break
        case 'f':
          toggleFullscreen()
          break
        default:
          break
      }
      wake()
    },
    [togglePlay, skip, changeVolume, volume, toggleMute, toggleFullscreen, wake]
  )

  const progressPct = duration ? (currentTime / duration) * 100 : 0
  const bufferedPct = duration ? (buffered / duration) * 100 : 0

  function onScrubChange(e) {
    const t = parseFloat(e.target.value)
    setCurrentTime(t)
    seekTo(t)
  }

  function volumeIcon() {
    if (muted || volume === 0) return 'volume-mute'
    if (volume < 0.5) return 'volume-low'
    return 'volume-high'
  }

  return (
    <div
      className={`vp ${controlsVisible ? 'vp-controls-visible' : 'vp-controls-hidden'}`}
      ref={containerRef}
      tabIndex={0}
      onKeyDown={onKeyDown}
    >
      <video
        ref={videoRef}
        className="vp-video"
        src={src}
        poster={poster}
        autoPlay={autoPlay}
        onDoubleClick={toggleFullscreen}
      />

      {loading && !errorMsg && (
        <div className="vp-spinner" aria-hidden="true">
          <span />
        </div>
      )}

      {errorMsg && <div className="vp-error">{errorMsg}</div>}

      {!loading && !errorMsg && (!playing || ended) && (
        <button type="button" className="vp-big-play" onClick={togglePlay} aria-label="Play">
          <Icon name={ended ? 'replay' : 'play'} />
        </button>
      )}

      {!errorMsg && (
        <div className="vp-bar">
          <div className="vp-seek">
            <div className="vp-seek-track">
              <div className="vp-seek-buffered" style={{ width: `${bufferedPct}%` }} />
              <div className="vp-seek-played" style={{ width: `${progressPct}%` }} />
              <div className="vp-seek-thumb" style={{ left: `${progressPct}%` }} />
            </div>
            <input
              type="range"
              className="vp-seek-input"
              min={0}
              max={duration || 0}
              step="0.01"
              value={currentTime}
              onChange={onScrubChange}
              onMouseDown={() => (scrubbingRef.current = true)}
              onMouseUp={() => (scrubbingRef.current = false)}
              aria-label="Seek"
            />
          </div>

          <div className="vp-row">
            <div className="vp-row-left">
              <button type="button" className="vp-btn" onClick={togglePlay} aria-label={playing ? 'Pause' : 'Play'}>
                <Icon name={playing ? 'pause' : 'play'} />
              </button>
              <button type="button" className="vp-btn" onClick={() => skip(-SKIP_SECONDS)} aria-label="Back 10 seconds">
                <Icon name="skip-back" />
              </button>
              <button type="button" className="vp-btn" onClick={() => skip(SKIP_SECONDS)} aria-label="Forward 10 seconds">
                <Icon name="skip-forward" />
              </button>

              <div className="vp-volume">
                <button type="button" className="vp-btn" onClick={toggleMute} aria-label={muted ? 'Unmute' : 'Mute'}>
                  <Icon name={volumeIcon()} />
                </button>
                <div className="vp-volume-slider">
                  <div className="vp-volume-track">
                    <div className="vp-volume-fill" style={{ width: `${(muted ? 0 : volume) * 100}%` }} />
                    <div className="vp-volume-thumb" style={{ left: `${(muted ? 0 : volume) * 100}%` }} />
                  </div>
                  <input
                    type="range"
                    className="vp-volume-input"
                    min={0}
                    max={1}
                    step="0.01"
                    value={muted ? 0 : volume}
                    onChange={(e) => changeVolume(parseFloat(e.target.value))}
                    aria-label="Volume"
                  />
                </div>
              </div>

              <span className="vp-time">
                {formatTime(currentTime)} / {formatTime(duration)}
              </span>
            </div>

            <div className="vp-row-right">
              <div className="vp-speed-wrap">
                <button
                  type="button"
                  className="vp-btn"
                  onClick={() => setShowSpeedMenu((v) => !v)}
                  aria-label="Playback speed"
                >
                  <Icon name="settings" />
                </button>
                {showSpeedMenu && (
                  <ul className="vp-speed-menu" onMouseLeave={() => setShowSpeedMenu(false)}>
                    {RATES.map((r) => (
                      <li key={r}>
                        <button
                          type="button"
                          className={r === rate ? 'active' : ''}
                          onClick={() => changeRate(r)}
                        >
                          {r === 1 ? 'Normal' : `${r}x`}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <button
                type="button"
                className="vp-btn"
                onClick={toggleFullscreen}
                aria-label={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
              >
                <Icon name={isFullscreen ? 'fullscreen-exit' : 'fullscreen-enter'} />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
