/**
 * DJ session helpers (browser-local clock).
 * One "current" session: any live session (latest start if several), else earliest upcoming.
 */

export function isDjSessionLive(session, nowMs = Date.now()) {
  if (!session?.start_time || session.set_duration_minutes == null) return false
  const start = new Date(session.start_time)
  if (Number.isNaN(start.getTime())) return false
  if (nowMs < start.getTime()) return false

  const pausedAt = session.paused_at ? new Date(session.paused_at) : null
  const effectiveNowMs =
    session.is_paused && pausedAt && !Number.isNaN(pausedAt.getTime())
      ? pausedAt.getTime()
      : nowMs
  const elapsedMs =
    effectiveNowMs - start.getTime() - Number(session.total_paused_seconds || 0) * 1000
  const elapsedMinutes = Math.max(0, elapsedMs / 60000)
  return elapsedMinutes <= Number(session.set_duration_minutes)
}

export function isDjSessionUpcoming(session, nowMs = Date.now()) {
  if (!session?.start_time) return false
  const start = new Date(session.start_time)
  if (Number.isNaN(start.getTime())) return false
  return nowMs < start.getTime()
}

/**
 * @param {Array<Record<string, unknown>>} sessions
 * @returns {Record<string, unknown> | null}
 */
export function pickCurrentDjSession(sessions, nowMs = Date.now()) {
  const list = Array.isArray(sessions) ? sessions.filter(Boolean) : []
  if (!list.length) return null

  const live = list.filter((s) => isDjSessionLive(s, nowMs))
  if (live.length) {
    live.sort((a, b) => new Date(b.start_time).getTime() - new Date(a.start_time).getTime())
    return live[0]
  }

  const upcoming = list.filter((s) => isDjSessionUpcoming(s, nowMs))
  if (!upcoming.length) return null

  upcoming.sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())
  return upcoming[0]
}

/**
 * @returns {'live' | 'upcoming' | 'none'}
 */
export function getGuestRequestGate(session, nowMs = Date.now()) {
  if (!session) return 'none'
  if (isDjSessionLive(session, nowMs)) return 'live'
  if (isDjSessionUpcoming(session, nowMs)) return 'upcoming'
  return 'none'
}
