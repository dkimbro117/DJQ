import { useCallback, useEffect, useState } from 'react'
import { fetchDjSessionsRecent, isSupabaseConfigured, submitSongRequest } from '../lib/supabase'
import { getGuestRequestGate, pickCurrentDjSession } from '../lib/djSession'

export default function GuestPage({ navigateTo }) {
  const [song, setSong] = useState('')
  const [artist, setArtist] = useState('')
  const [errors, setErrors] = useState({})
  const [submitError, setSubmitError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSubmitted, setIsSubmitted] = useState(false)
  const [requestGate, setRequestGate] = useState('none')
  const [opensAtLabel, setOpensAtLabel] = useState('')

  const refreshRequestGate = useCallback(async () => {
    if (!isSupabaseConfigured) return
    try {
      const { data, error } = await fetchDjSessionsRecent()
      if (error) throw error
      const session = pickCurrentDjSession(data || [])
      const gate = getGuestRequestGate(session)
      setRequestGate(gate)
      if (gate === 'upcoming' && session?.start_time) {
        setOpensAtLabel(
          new Date(session.start_time).toLocaleString(undefined, {
            dateStyle: 'medium',
            timeStyle: 'short',
          })
        )
      } else {
        setOpensAtLabel('')
      }
    } catch {
      setRequestGate('none')
      setOpensAtLabel('')
    }
  }, [])

  useEffect(() => {
    if (!isSupabaseConfigured) return undefined
    refreshRequestGate()
    const id = window.setInterval(refreshRequestGate, 20000)
    return () => {
      window.clearInterval(id)
    }
  }, [refreshRequestGate])

  const handleSubmit = async (event) => {
    event.preventDefault()

    const trimmedSong = song.trim()
    const trimmedArtist = artist.trim()
    const nextErrors = {}

    if (!trimmedSong) nextErrors.song = 'Song is required.'
    if (!trimmedArtist) nextErrors.artist = 'Artist is required.'
    setErrors(nextErrors)
    setSubmitError('')

    if (Object.keys(nextErrors).length > 0) return

    if (requestGate !== 'live') {
      setSubmitError('Requests are not open yet. This page updates automatically when the set goes live.')
      return
    }

    setIsSubmitting(true)

    try {
      const payload = {
        song: trimmedSong,
        artist: trimmedArtist,
      }

      const { error: insertError } = await submitSongRequest(payload)

      if (insertError) {
        throw insertError
      }

      setIsSubmitted(true)
    } catch (error) {
      setSubmitError(error.message || 'Unable to send request right now.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleRequestAnother = () => {
    setSong('')
    setArtist('')
    setErrors({})
    setSubmitError('')
    setIsSubmitted(false)
  }

  const formDisabled = !isSupabaseConfigured || requestGate !== 'live'

  return (
    <main className="guest-request-shell">
      <div className="guest-request-container">
        <section className="guest-request-header">
          <p className="guest-request-label">DJ HIGH CALIBER</p>
          <h1 className="guest-request-title">Request a song</h1>
          <p className="guest-request-subline">Drop your track — I'll work it in</p>
          <p className="guest-live-row">
            <span className="guest-live-dot" aria-hidden="true" />
            <span>Live tonight</span>
          </p>
          <button
            type="button"
            onClick={() => navigateTo('dj')}
            className="guest-dj-link-btn"
          >
            DJ View
          </button>
        </section>

        <section className="guest-request-card">
          {isSubmitted ? (
            <div className="guest-success">
              <span className="guest-success-icon" aria-hidden="true">♪</span>
              <h2 className="guest-success-title">Request sent!</h2>
              <p className="guest-success-message">I'll work it in.</p>
              <button type="button" className="guest-submit-btn" onClick={handleRequestAnother}>
                Request another
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="guest-request-form" noValidate>
              {!isSupabaseConfigured && (
                <p className="guest-submit-error" role="alert">
                  Requests are unavailable: add <code className="guest-code">VITE_SUPABASE_URL</code> and{' '}
                  <code className="guest-code">VITE_SUPABASE_ANON_KEY</code> to <code className="guest-code">.env.local</code>{' '}
                  (local) or production environment variables, then restart the dev server.
                </p>
              )}
              {isSupabaseConfigured && requestGate === 'none' && (
                <p className="guest-session-gate" role="status">
                  Song requests are closed right now. Check back when the DJ has started the set.
                </p>
              )}
              {isSupabaseConfigured && requestGate === 'upcoming' && (
                <p className="guest-session-gate" role="status">
                  Requests open when the set starts{opensAtLabel ? ` (${opensAtLabel})` : ''}. This page will update
                  automatically.
                </p>
              )}
              <div>
                <label htmlFor="song" className="guest-input-label">
                  Song
                </label>
                <p className="guest-input-label-note">Track title</p>
                <input
                  id="song"
                  value={song}
                  onChange={(event) => {
                    setSong(event.target.value)
                    if (errors.song) {
                      setErrors((prev) => ({ ...prev, song: '' }))
                    }
                  }}
                  className={`guest-input ${errors.song ? 'guest-input-error' : ''}`}
                  aria-invalid={Boolean(errors.song)}
                  disabled={formDisabled}
                />
              </div>

              <div>
                <label htmlFor="artist" className="guest-input-label">
                  Artist
                </label>
                <p className="guest-input-label-note">Artist name</p>
                <input
                  id="artist"
                  value={artist}
                  onChange={(event) => {
                    setArtist(event.target.value)
                    if (errors.artist) {
                      setErrors((prev) => ({ ...prev, artist: '' }))
                    }
                  }}
                  className={`guest-input ${errors.artist ? 'guest-input-error' : ''}`}
                  aria-invalid={Boolean(errors.artist)}
                  disabled={formDisabled}
                />
              </div>

              {submitError && <p className="guest-submit-error">{submitError}</p>}

              <button type="submit" disabled={isSubmitting || formDisabled} className="guest-submit-btn">
                {isSubmitting ? 'Sending...' : 'Send Request'}
              </button>
            </form>
          )}
        </section>
      </div>
    </main>
  )
}
