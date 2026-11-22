import { useEffect, useRef } from 'react'
import VideoPlayer from './VideoPlayer'

export default function MediaPlayer({ file, onClose }) {
  const overlayRef = useRef(null)

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  if (!file) return null

  const src = `/api/files/${file.id}/stream`
  const mime = file.mime_type || ''
  const isVideo = mime.startsWith('video/')
  const isAudio = mime.startsWith('audio/')
  const isImage = mime.startsWith('image/')

  function onOverlayClick(e) {
    if (e.target === overlayRef.current) onClose()
  }

  return (
    <div className="player-overlay" ref={overlayRef} onClick={onOverlayClick}>
      <div className="player-box">
        <div className="player-header">
          <span className="player-title" title={file.original_name}>
            {file.original_name}
          </span>
          <div className="player-header-actions">
            <a className="btn" href={`/api/files/${file.id}/download`}>
              Download
            </a>
            <button type="button" className="player-close" onClick={onClose} aria-label="Close">
              &times;
            </button>
          </div>
        </div>
        <div className="player-body">
          {isVideo && <VideoPlayer src={src} />}
          {isAudio && (
            <audio className="player-media player-audio" src={src} controls autoPlay>
              Your browser does not support audio playback.
            </audio>
          )}
          {isImage && <img className="player-media" src={src} alt={file.original_name} />}
          {!isVideo && !isAudio && !isImage && (
            <p className="muted">This file type can't be previewed. Use Download instead.</p>
          )}
        </div>
      </div>
    </div>
  )
}
