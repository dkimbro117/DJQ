import { useEffect, useMemo, useState } from 'react'
import {
  clearSongRequestsPlayed,
  clearSongRequestsUnplayed,
  createDjSession,
  deleteSongRequest,
  fetchDjSessionsRecent,
  isSupabaseConfigured,
  pauseDjSession,
  resumeDjSession,
  supabase,
} from '../lib/supabase'
import { isDjSessionLive, isDjSessionUpcoming, pickCurrentDjSession } from '../lib/djSession'
import { getCurrentPhase } from '../lib/sessionPhase'

const ENERGY_ORDER = ['Hype', 'Vibe', 'Slow', 'Afro', 'Wild Card']
const FIT_FILTERS = ['All', 'Good Fit', 'Hold']
const EVENT_TYPES = [
  'Wedding Ceremony',
  'Wedding Reception',
  'Birthday Party — Kids (under 13)',
  'Birthday Party — Teens (13–17)',
  'Birthday Party — Adult',
  'Sweet 16',
  'Quinceañera',
  'Corporate Event',
  'Nightclub / Bar',
  'School Dance',
  'College Party',
  'Outdoor Festival',
  'Celebration of Life / Memorial',
  'Other',
]
const GENRES = ['Hip-Hop', 'R&B', 'Afrobeats', 'Trap', 'Neo-Soul', 'Pop', 'House', 'Reggaeton', 'Old School']
const DURATIONS = [
  { label: '1 hour', minutes: 60 },
  { label: '2 hours', minutes: 120 },
  { label: '3 hours', minutes: 180 },
  { label: '4+ hours', minutes: 240 },
]

function formatTimestamp(value) {
  if (!value) return '--'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '--'
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

function formatDateInputLocal(d) {
  const x = new Date(d)
  const y = x.getFullYear()
  const m = String(x.getMonth() + 1).padStart(2, '0')
  const day = String(x.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function mapEventTypeToAudienceFlag(eventType) {
  const mapping = {
    'Wedding Ceremony': 'all_ages',
    'Wedding Reception': 'all_ages',
    'Birthday Party — Kids (under 13)': 'family_safe',
    'Birthday Party — Teens (13–17)': 'teens',
    'Birthday Party — Adult': 'adults_only',
    'Sweet 16': 'teens',
    'Quinceañera': 'all_ages',
    'Corporate Event': 'all_ages',
    'Nightclub / Bar': 'adults_only',
    'School Dance': 'family_safe',
    'College Party': 'adults_only',
    'Outdoor Festival': 'all_ages',
    'Celebration of Life / Memorial': 'all_ages',
    Other: 'all_ages',
  }
  return mapping[eventType] || 'all_ages'
}

export default function DJPage({ navigateTo }) {
  const [passwordInput, setPasswordInput] = useState('')
  const [isUnlocked, setIsUnlocked] = useState(false)
  const [authError, setAuthError] = useState('')
  const [isAuthChecking, setIsAuthChecking] = useState(false)
  const [requests, setRequests] = useState([])
  const [isLoading, setIsLoading] = useState(false)
  const [actionError, setActionError] = useState('')
  const [playedOpen, setPlayedOpen] = useState(false)
  const [busyRequestId, setBusyRequestId] = useState('')
  const [fitFilter, setFitFilter] = useState('All')
  const [expandedFitReasonId, setExpandedFitReasonId] = useState('')
  const [isSessionLoading, setIsSessionLoading] = useState(false)
  const [currentSession, setCurrentSession] = useState(null)
  const [currentPhase, setCurrentPhase] = useState('Building')
  const [isSessionPauseBusy, setIsSessionPauseBusy] = useState(false)
  const [showOnboarding, setShowOnboarding] = useState(false)
  const [isSavingSession, setIsSavingSession] = useState(false)
  const [sessionErrors, setSessionErrors] = useState({})
  const [sessionForm, setSessionForm] = useState(() => ({
    eventType: EVENT_TYPES[0],
    anchorGenres: ['Hip-Hop'],
    hardAvoids: [],
    setDurationLabel: DURATIONS[1].label,
    sessionStartMode: 'now',
    sessionStartDate: formatDateInputLocal(new Date()),
    startTime: new Date().toTimeString().slice(0, 5),
  }))

  const deriveSessionPhase = (session) =>
    getCurrentPhase(session?.start_time, session?.set_duration_minutes, {
      isPaused: session?.is_paused,
      pausedAt: session?.paused_at,
      totalPausedSeconds: session?.total_paused_seconds,
    })

  const resolveSelectedDuration = () =>
    DURATIONS.find((duration) => duration.label === sessionForm.setDurationLabel) || DURATIONS[1]

  const loadSessionState = async () => {
    setIsSessionLoading(true)
    try {
      const { data: rows, error } = await fetchDjSessionsRecent()
      if (error) throw error
      const picked = pickCurrentDjSession(rows || [])
      if (picked && isDjSessionLive(picked)) {
        setCurrentSession(picked)
        setCurrentPhase(deriveSessionPhase(picked))
        setShowOnboarding(false)
      } else if (picked && isDjSessionUpcoming(picked)) {
        setCurrentSession(picked)
        setCurrentPhase(deriveSessionPhase(picked))
        setShowOnboarding(false)
      } else {
        setCurrentSession(null)
        setCurrentPhase('Building')
        setShowOnboarding(true)
      }
    } catch (error) {
      setActionError(error.message || 'Failed to load DJ session.')
      setShowOnboarding(true)
    } finally {
      setIsSessionLoading(false)
    }
  }

  const fetchRequests = async () => {
    setIsLoading(true)
    try {
      const { data, error } = await supabase
        .from('song_requests')
        .select('*')
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
      if (error) {
        throw error
      }
      setRequests(data || [])
    } catch (error) {
      setActionError(error.message || 'Failed to fetch requests.')
    } finally {
      setIsLoading(false)
    }
  }

  const activeQueue = useMemo(
    () => requests.filter((request) => !request.played),
    [requests]
  )
  const playedQueue = useMemo(
    () =>
      requests
        .filter((request) => request.played)
        .sort((a, b) => new Date(b.played_at || 0).getTime() - new Date(a.played_at || 0).getTime()),
    [requests]
  )
  const energyCounts = useMemo(() => {
    const counts = Object.fromEntries(ENERGY_ORDER.map((energy) => [energy, 0]))
    for (const request of activeQueue) {
      const energy = ENERGY_ORDER.includes(request.energy) ? request.energy : 'Wild Card'
      counts[energy] += 1
    }
    return counts
  }, [activeQueue])
  const fitCounts = useMemo(() => {
    const counts = { 'Good Fit': 0, Hold: 0, 'Not Tonight': 0, Unscored: 0 }
    for (const request of activeQueue) {
      if (request.fit === 'Good Fit') counts['Good Fit'] += 1
      else if (request.fit === 'Hold') counts.Hold += 1
      else if (request.fit === 'Not Tonight') counts['Not Tonight'] += 1
      else counts.Unscored += 1
    }
    return counts
  }, [activeQueue])
  const filteredQueue = useMemo(() => {
    if (fitFilter === 'All') return activeQueue
    if (fitFilter === 'Good Fit') {
      return activeQueue.filter((request) => request.fit === 'Good Fit')
    }
    if (fitFilter === 'Hold') {
      return activeQueue.filter((request) => request.fit === 'Hold')
    }
    return activeQueue
  }, [activeQueue, fitFilter])

  useEffect(() => {
    if (!isUnlocked) {
      return undefined
    }

    if (!isSupabaseConfigured) {
      setActionError(
        'This deployment is missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. Add both under Vercel → Settings → Environment Variables (include Preview if you use preview URLs), then redeploy.'
      )
      return undefined
    }

    fetchRequests()
    loadSessionState()

    const channel = supabase
      .channel('dj-song-requests')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'song_requests' },
        () => {
          fetchRequests()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [isUnlocked])

  useEffect(() => {
    if (!isUnlocked || !currentSession) {
      return undefined
    }
    setCurrentPhase(deriveSessionPhase(currentSession))
    const timer = window.setInterval(() => {
      setCurrentPhase(deriveSessionPhase(currentSession))
    }, 60000)
    return () => {
      window.clearInterval(timer)
    }
  }, [isUnlocked, currentSession])

  useEffect(() => {
    if (!isUnlocked || !currentSession || !isDjSessionUpcoming(currentSession)) {
      return undefined
    }
    const timer = window.setInterval(() => {
      loadSessionState()
    }, 15000)
    return () => {
      window.clearInterval(timer)
    }
  }, [isUnlocked, currentSession])

  const handlePauseResumeSession = async () => {
    if (!currentSession?.id || isSessionPauseBusy) {
      return
    }
    if (isDjSessionUpcoming(currentSession)) {
      return
    }
    setIsSessionPauseBusy(true)
    setActionError('')
    try {
      const result = currentSession.is_paused
        ? await resumeDjSession(currentSession)
        : await pauseDjSession(currentSession.id)
      if (result.error) {
        throw result.error
      }
      setCurrentSession(result.data)
      setCurrentPhase(deriveSessionPhase(result.data))
    } catch (error) {
      setActionError(error.message || 'Could not update set pause status.')
    } finally {
      setIsSessionPauseBusy(false)
    }
  }

  const handleUnlock = async (event) => {
    event.preventDefault()
    setIsAuthChecking(true)
    try {
      const response = await fetch('/api/dj-auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: passwordInput }),
      })

      if (!response.ok) {
        throw new Error('Could not verify DJ password.')
      }

      const data = await response.json()
      if (data.authorized) {
        setIsUnlocked(true)
        setAuthError('')
        setPasswordInput('')
        return
      }
      setAuthError('Incorrect password')
    } catch (error) {
      setAuthError(error.message || 'Could not verify DJ password.')
    } finally {
      setIsAuthChecking(false)
    }
  }
  
  const handleDeleteRequest = async (requestId) => {
    try {
      setActionError('')
      setBusyRequestId(requestId)
      const { error } = await deleteSongRequest(requestId)
      if (error) throw error
      fetchRequests()
    } catch (error) {
      setActionError(error.message || 'Could not delete request.')
    } finally {
      setBusyRequestId('')
    }
  }

  const handleClearUnplayed = async () => {
    if (!window.confirm('Remove every song in the active queue? This cannot be undone.')) return
    try {
      setActionError('')
      const { error } = await clearSongRequestsUnplayed()
      if (error) throw error
      fetchRequests()
    } catch (error) {
      setActionError(error.message || 'Could not clear queue.')
    }
  }

  const handleClearPlayed = async () => {
    if (!window.confirm('Remove all played requests from history? This cannot be undone.')) return
    try {
      setActionError('')
      const { error } = await clearSongRequestsPlayed()
      if (error) throw error
      fetchRequests()
    } catch (error) {
      setActionError(error.message || 'Could not clear played list.')
    }
  }

  const handleMarkPlayed = async (requestId) => {
    try {
      setActionError('')
      setBusyRequestId(requestId)
      const { error } = await supabase
        .from('song_requests')
        .update({ played: true, played_at: new Date().toISOString() })
        .eq('id', requestId)

      if (error) {
        throw error
      }

      fetchRequests()
    } catch (error) {
      setActionError(error.message || 'Could not mark request as played.')
    } finally {
      setBusyRequestId('')
    }
  }

  const handleToggleMultiSelect = (field, value) => {
    setSessionForm((prev) => {
      const currentValues = prev[field]
      const isSelected = currentValues.includes(value)
      const nextValues = isSelected
        ? currentValues.filter((item) => item !== value)
        : [...currentValues, value]
      return { ...prev, [field]: nextValues }
    })
    if (field === 'anchorGenres') {
      setSessionErrors((prev) => ({ ...prev, anchorGenres: '' }))
    }
  }

  const handleStartNewSession = () => {
    setCurrentSession(null)
    setShowOnboarding(true)
    setSessionErrors({})
    setSessionForm((prev) => ({
      ...prev,
      sessionStartMode: 'now',
      sessionStartDate: formatDateInputLocal(new Date()),
      startTime: new Date().toTimeString().slice(0, 5),
    }))
  }

  const handleSubmitSession = async (event) => {
    event.preventDefault()
    const nextErrors = {}
    if (!sessionForm.anchorGenres.length) {
      nextErrors.anchorGenres = 'Select at least one anchor genre.'
    }

    let startAt
    if (sessionForm.sessionStartMode === 'now') {
      startAt = new Date()
    } else {
      const parts = sessionForm.sessionStartDate.split('-').map((v) => Number(v))
      const y = parts[0]
      const mo = parts[1]
      const d = parts[2]
      const [hours, minutes] = sessionForm.startTime.split(':').map((value) => Number(value))
      startAt = new Date(
        Number.isNaN(y) ? 1970 : y,
        Number.isNaN(mo) ? 0 : mo - 1,
        Number.isNaN(d) ? 1 : d,
        Number.isNaN(hours) ? 0 : hours,
        Number.isNaN(minutes) ? 0 : minutes,
        0,
        0
      )
      if (Number.isNaN(startAt.getTime())) {
        nextErrors.startTime = 'Enter a valid date and time.'
      } else {
        const minLeadMs = 60_000
        if (startAt.getTime() < Date.now() + minLeadMs) {
          nextErrors.startTime = 'Scheduled start must be at least one minute from now.'
        }
      }
    }

    setSessionErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return

    setIsSavingSession(true)
    try {
      const selectedDuration = resolveSelectedDuration()

      const payload = {
        event_type: sessionForm.eventType,
        audience_flag: mapEventTypeToAudienceFlag(sessionForm.eventType),
        anchor_genres: sessionForm.anchorGenres,
        hard_avoids: sessionForm.hardAvoids,
        set_duration_minutes: selectedDuration.minutes,
        start_time: startAt.toISOString(),
        is_paused: false,
        paused_at: null,
        total_paused_seconds: 0,
      }

      const { data, error } = await createDjSession(payload)
      if (error) throw error

      setCurrentSession(data)
      setCurrentPhase(deriveSessionPhase(data))
      setShowOnboarding(false)
      setSessionErrors({})
    } catch (error) {
      setActionError(error.message || 'Could not start DJ session.')
    } finally {
      setIsSavingSession(false)
    }
  }

  if (!isUnlocked) {
    return (
      <main className="app-shell">
        <div className="content-wrap mobile-safe-bottom dj-lock-layout">
          <section className="dj-lock-panel animate-rise">
            <div className="glass-panel neon-border dj-lock-card">
              <div className="dj-lock-head">
                <div>
                  <p className="lock-kicker">
                    Secure Access
                  </p>
                  <h1 className="lock-title">DJ Lock</h1>
                </div>
                <span className="lock-badge">
                  Private
                </span>
              </div>

              <form onSubmit={handleUnlock} className="stack-mobile">
                <label htmlFor="dj-password" className="sr-only">
                  DJ password
                </label>
                <input
                  id="dj-password"
                  type="password"
                  value={passwordInput}
                  onChange={(event) => setPasswordInput(event.target.value)}
                  placeholder="Enter DJ password"
                  className="field"
                />
                <button type="submit" className="btn btn-primary btn-block">
                  {isAuthChecking ? 'Unlocking...' : 'Unlock Queue'}
                </button>
                {authError && (
                  <p className="animate-fade lock-error">
                    {authError}
                  </p>
                )}
              </form>
            </div>

            <div className="dj-lock-nav">
              <button
                type="button"
                onClick={() => navigateTo('guest')}
                className="btn btn-secondary guest-nav-btn"
              >
                Guest View
              </button>
            </div>
          </section>
        </div>
      </main>
    )
  }

  return (
    <main className="dj-request-shell">
      <div className="dj-request-container">
        <header className="dj-request-header">
          <h1 className="dj-request-title">DJ View</h1>
          <div className="dj-energy-pills">
            {ENERGY_ORDER.map((energy) => (
              <span key={energy} className={`dj-energy-pill dj-energy-pill-${energy.toLowerCase().replace(/\s+/g, '-')}`}>
                {energy} {energyCounts[energy]}
              </span>
            ))}
          </div>
          <p className="dj-fit-summary">
            {fitCounts['Good Fit']} Good Fit · {fitCounts.Hold} Hold · {fitCounts['Not Tonight']} Not Tonight
          </p>
          <button type="button" onClick={() => navigateTo('guest')} className="dj-back-link">
            Guest View
          </button>
          <button type="button" onClick={handleStartNewSession} className="dj-back-link">
            New Session
          </button>
        </header>

        {currentSession && (
          <div className="dj-session-banner">
            <p className="dj-session-banner-title">
              {isDjSessionUpcoming(currentSession) ? 'Upcoming session' : 'Current session'}
            </p>
            <p className="dj-session-banner-copy">
              {currentSession.event_type} · {currentSession.audience_flag || 'all_ages'} ·{' '}
              {currentSession.anchor_genres?.join(', ') || 'No anchors'} · {currentSession.set_duration_minutes} min
              {isDjSessionUpcoming(currentSession) && currentSession.start_time && (
                <>
                  {' '}
                  · Starts{' '}
                  {new Date(currentSession.start_time).toLocaleString(undefined, {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  })}
                </>
              )}
            </p>
            <div className="dj-session-controls-row">
              <span className={`dj-session-phase-badge ${currentSession.is_paused ? 'dj-session-phase-badge-paused' : ''}`}>
                {currentSession.is_paused ? 'Paused' : currentPhase}
              </span>
              <button
                type="button"
                className={`dj-session-pause-btn ${currentSession.is_paused ? 'dj-session-pause-btn-resume' : ''}`}
                onClick={handlePauseResumeSession}
                disabled={isSessionPauseBusy || isDjSessionUpcoming(currentSession)}
              >
                {currentSession.is_paused ? 'Resume Set' : 'Pause Set'}
              </button>
            </div>
          </div>
        )}

        {actionError && <p className="dj-action-error">{actionError}</p>}

        <section className="dj-queue-card-wrap">
          <div className="dj-filter-bar">
            {FIT_FILTERS.map((filterLabel) => (
              <button
                key={filterLabel}
                type="button"
                onClick={() => setFitFilter(filterLabel)}
                className={`dj-filter-btn ${fitFilter === filterLabel ? 'dj-filter-btn-active' : ''}`}
              >
                {filterLabel}
              </button>
            ))}
            <span className="dj-filter-spacer" aria-hidden="true" />
            <button type="button" className="dj-filter-btn dj-filter-btn-danger" onClick={handleClearUnplayed}>
              Clear queue
            </button>
            <button type="button" className="dj-filter-btn dj-filter-btn-danger" onClick={handleClearPlayed}>
              Clear played
            </button>
          </div>
          {isLoading ? (
            <p className="dj-empty-text">Loading queue...</p>
          ) : filteredQueue.length === 0 ? (
            <p className="dj-empty-text">No active requests yet.</p>
          ) : (
            <ul className="dj-queue-list">
              {filteredQueue.map((request) => {
                const energy = ENERGY_ORDER.includes(request.energy) ? request.energy : 'Wild Card'
                const isBusy = busyRequestId === request.id
                const fit = request.fit || 'Unscored'
                const genreLabel = request.genre || 'Unknown'
                const fitBadgeClass =
                  fit === 'Good Fit'
                    ? 'dj-fit-badge-good-fit'
                    : fit === 'Hold'
                      ? 'dj-fit-badge-hold'
                      : fit === 'Not Tonight'
                        ? 'dj-fit-badge-not-tonight'
                        : 'dj-fit-badge-unscored'
                const isReasonExpanded = expandedFitReasonId === request.id
                return (
                  <li key={request.id} className="dj-queue-row">
                    <div className="dj-row-main">
                      <p className="dj-row-song">{request.song || 'Unknown song'}</p>
                      {request.fit_reason && (
                        <button
                          type="button"
                          className={`dj-fit-reason ${isReasonExpanded ? 'dj-fit-reason-expanded' : ''}`}
                          onClick={() =>
                            setExpandedFitReasonId((prev) => (prev === request.id ? '' : request.id))
                          }
                          title={request.fit_reason}
                        >
                          {request.fit_reason}
                        </button>
                      )}
                      <p className="dj-row-meta">
                        {request.artist || 'Unknown artist'} · {request.requested_by || 'Anonymous'}
                      </p>
                      <div className="dj-row-tags">
                        <span className={`dj-energy-badge dj-energy-badge-${energy.toLowerCase().replace(/\s+/g, '-')}`}>
                          {energy}
                        </span>
                        <span className={`dj-data-chip ${request.genre ? '' : 'dj-data-chip-unknown'}`}>
                          {genreLabel}
                        </span>
                        {request.bpm_range && <span className="dj-data-chip">{request.bpm_range}</span>}
                        <span className={`dj-fit-badge ${fitBadgeClass}`}>{fit}</span>
                        <span className="dj-time-chip">{formatTimestamp(request.created_at)}</span>
                      </div>
                    </div>
                    <div className="dj-row-actions">
                      <button
                        type="button"
                        onClick={() => handleDeleteRequest(request.id)}
                        disabled={isBusy}
                        className="dj-action-btn"
                      >
                        Remove
                      </button>
                      <button
                        type="button"
                        onClick={() => handleMarkPlayed(request.id)}
                        disabled={isBusy}
                        className="dj-action-btn dj-action-btn-gold"
                      >
                        Mark Played
                      </button>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        <section className="dj-played-drawer">
          <button
            type="button"
            onClick={() => setPlayedOpen((prev) => !prev)}
            className="dj-drawer-toggle"
          >
            Played ({playedQueue.length})
          </button>
          {playedOpen && (
            <ul className="dj-played-list">
              {playedQueue.length === 0 ? (
                <li className="dj-played-row dj-played-empty">No played tracks yet.</li>
              ) : (
                playedQueue.map((request) => (
                  <li key={request.id} className="dj-played-row">
                    <span>{request.song || 'Unknown song'} - {request.artist || 'Unknown artist'}</span>
                    <span>{request.requested_by || 'Anonymous'}</span>
                  </li>
                ))
              )}
            </ul>
          )}
        </section>
      </div>

      {isUnlocked && !isSessionLoading && showOnboarding && (
        <div className="dj-onboarding-overlay">
          <form className="dj-onboarding-card" onSubmit={handleSubmitSession}>
            <h2 className="dj-onboarding-title">Start New DJ Session</h2>

            <label className="dj-onboarding-label">
              Event type
              <select
                className="dj-onboarding-select"
                value={sessionForm.eventType}
                onChange={(event) => setSessionForm((prev) => ({ ...prev, eventType: event.target.value }))}
              >
                {EVENT_TYPES.map((item) => (
                  <option key={item} value={item}>{item}</option>
                ))}
              </select>
            </label>

            <fieldset className="dj-onboarding-fieldset">
              <legend>Anchor genres (select at least one)</legend>
              <div className="dj-onboarding-check-grid">
                {GENRES.map((genre) => (
                  <label key={genre} className="dj-onboarding-check">
                    <input
                      type="checkbox"
                      checked={sessionForm.anchorGenres.includes(genre)}
                      onChange={() => handleToggleMultiSelect('anchorGenres', genre)}
                    />
                    <span>{genre}</span>
                  </label>
                ))}
              </div>
              {sessionErrors.anchorGenres && (
                <p className="dj-onboarding-error">{sessionErrors.anchorGenres}</p>
              )}
            </fieldset>

            <fieldset className="dj-onboarding-fieldset">
              <legend>Hard avoids (optional)</legend>
              <div className="dj-onboarding-check-grid">
                {GENRES.map((genre) => (
                  <label key={`avoid-${genre}`} className="dj-onboarding-check">
                    <input
                      type="checkbox"
                      checked={sessionForm.hardAvoids.includes(genre)}
                      onChange={() => handleToggleMultiSelect('hardAvoids', genre)}
                    />
                    <span>{genre}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            <label className="dj-onboarding-label">
              Set duration
              <select
                className="dj-onboarding-select"
                value={sessionForm.setDurationLabel}
                onChange={(event) => setSessionForm((prev) => ({ ...prev, setDurationLabel: event.target.value }))}
              >
                {DURATIONS.map((duration) => (
                  <option key={duration.label} value={duration.label}>{duration.label}</option>
                ))}
              </select>
            </label>

            <fieldset className="dj-onboarding-fieldset">
              <legend>When does the set start? (your device time)</legend>
              <label className="dj-onboarding-check dj-onboarding-radio">
                <input
                  type="radio"
                  name="sessionStartMode"
                  checked={sessionForm.sessionStartMode === 'now'}
                  onChange={() =>
                    setSessionForm((prev) => ({
                      ...prev,
                      sessionStartMode: 'now',
                      sessionStartDate: formatDateInputLocal(new Date()),
                      startTime: new Date().toTimeString().slice(0, 5),
                    }))
                  }
                />
                <span>Start now</span>
              </label>
              <label className="dj-onboarding-check dj-onboarding-radio">
                <input
                  type="radio"
                  name="sessionStartMode"
                  checked={sessionForm.sessionStartMode === 'schedule'}
                  onChange={() => setSessionForm((prev) => ({ ...prev, sessionStartMode: 'schedule' }))}
                />
                <span>Schedule for later</span>
              </label>
            </fieldset>

            {sessionForm.sessionStartMode === 'schedule' && (
              <>
                <label className="dj-onboarding-label">
                  Date
                  <input
                    className="dj-onboarding-select"
                    type="date"
                    value={sessionForm.sessionStartDate}
                    onChange={(event) =>
                      setSessionForm((prev) => ({ ...prev, sessionStartDate: event.target.value }))
                    }
                  />
                </label>
                <label className="dj-onboarding-label">
                  Start time
                  <input
                    className="dj-onboarding-select"
                    type="time"
                    value={sessionForm.startTime}
                    onChange={(event) =>
                      setSessionForm((prev) => ({ ...prev, startTime: event.target.value }))
                    }
                  />
                </label>
              </>
            )}
            {sessionErrors.startTime && <p className="dj-onboarding-error">{sessionErrors.startTime}</p>}

            <button type="submit" className="dj-onboarding-submit" disabled={isSavingSession}>
              {isSavingSession
                ? 'Saving…'
                : sessionForm.sessionStartMode === 'now'
                  ? 'Start session now'
                  : 'Schedule session'}
            </button>
          </form>
        </div>
      )}
    </main>
  )
}
