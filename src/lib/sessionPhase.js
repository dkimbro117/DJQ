export function getCurrentPhase(startTime, setDurationMinutes, options = {}) {
  if (!startTime || !setDurationMinutes || Number(setDurationMinutes) <= 0) {
    return 'Building'
  }

  const start = new Date(startTime)
  if (Number.isNaN(start.getTime())) {
    return 'Building'
  }

  const totalPausedSeconds = Number(options.totalPausedSeconds || 0)
  const pausedAt = options.pausedAt ? new Date(options.pausedAt) : null
  const isPaused = Boolean(options.isPaused)
  const nowMs = typeof options.nowMs === 'number' ? options.nowMs : Date.now()

  if (nowMs < start.getTime()) {
    return 'Scheduled'
  }

  const effectiveNowMs =
    isPaused && pausedAt && !Number.isNaN(pausedAt.getTime())
      ? pausedAt.getTime()
      : nowMs

  const elapsedMs = effectiveNowMs - start.getTime() - totalPausedSeconds * 1000
  const elapsedMinutes = Math.max(0, elapsedMs / 60000)
  const ratio = elapsedMinutes / Number(setDurationMinutes)

  if (ratio < 0.3) return 'Building'
  if (ratio < 0.7) return 'Peaked'
  if (ratio < 0.9) return 'Cooling'
  return 'Closing'
}
