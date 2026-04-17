import { createClient } from '@supabase/supabase-js'

const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL || '').trim()
const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim()

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey)

let supabaseClient = null

function getSupabase() {
  if (!supabaseClient) {
    if (!isSupabaseConfigured) {
      throw new Error(
        'Supabase is not configured. In Vercel: Project → Settings → Environment Variables, add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (Production and Preview), then redeploy.'
      )
    }
    supabaseClient = createClient(supabaseUrl, supabaseAnonKey)
  }
  return supabaseClient
}

/** Lazily creates the client on first use so the app shell can render when env is missing (e.g. misconfigured Vercel build). */
export const supabase = new Proxy(
  {},
  {
    get(_target, prop) {
      const client = getSupabase()
      const value = Reflect.get(client, prop, client)
      return typeof value === 'function' ? value.bind(client) : value
    },
  }
)

export async function submitSongRequest(payload) {
  const requestedBy =
    typeof payload?.requested_by === 'string' && payload.requested_by.trim()
      ? payload.requested_by.trim()
      : 'Anonymous'

  const enrichedPayload = {
    ...payload,
    requested_by: requestedBy,
    queue_position: Date.now(),
  }

  const { data, error } = await supabase
    .from('song_requests')
    .insert(enrichedPayload)
    .select('*')
    .single()

  if (error) {
    return { data: null, error }
  }

  const { error: classifyError } = await supabase.functions.invoke(
    'classify-song-request',
    {
      body: {
        request_id: data.id,
        song: data.song,
        artist: data.artist,
      },
    }
  )

  return { data, error: null, classifyError: classifyError || null }
}

export async function createBookingRequest(payload) {
  const { data, error } = await supabase
    .from('booking_requests')
    .insert(payload)
    .select('*')
    .single()

  return { data, error }
}

export async function fetchBookingRequests() {
  const { data, error } = await supabase
    .from('booking_requests')
    .select('*')
    .order('created_at', { ascending: false })

  return { data: data || [], error }
}

export async function updateBookingRequestStatus(id, status) {
  const { data, error } = await supabase
    .from('booking_requests')
    .update({ status })
    .eq('id', id)
    .select('*')
    .single()

  return { data, error }
}

export async function notifyBookingSubmission(booking) {
  const { data, error } = await supabase.functions.invoke(
    'send-booking-notification',
    {
      body: { booking },
    }
  )

  return { data, error }
}

/** Recent sessions by wall-clock start (browser uses result for local picking). */
export async function fetchDjSessionsRecent() {
  const since = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString()

  const { data, error } = await supabase
    .from('dj_sessions')
    .select('*')
    .gte('start_time', since)
    .order('start_time', { ascending: false })
    .limit(40)

  return { data: data || [], error }
}

export async function deleteSongRequest(id) {
  const { error } = await supabase.from('song_requests').delete().eq('id', id)
  return { error }
}

export async function clearSongRequestsUnplayed() {
  const { error } = await supabase.from('song_requests').delete().eq('played', false)
  return { error }
}

export async function clearSongRequestsPlayed() {
  const { error } = await supabase.from('song_requests').delete().eq('played', true)
  return { error }
}

export async function createDjSession(payload) {
  const { data, error } = await supabase
    .from('dj_sessions')
    .insert(payload)
    .select('*')
    .single()

  return { data, error }
}

export async function pauseDjSession(sessionId) {
  const { data, error } = await supabase
    .from('dj_sessions')
    .update({
      is_paused: true,
      paused_at: new Date().toISOString(),
    })
    .eq('id', sessionId)
    .select('*')
    .single()

  return { data, error }
}

export async function resumeDjSession(session) {
  const pausedAt = session?.paused_at ? new Date(session.paused_at) : null
  const now = new Date()
  const secondsJustPaused =
    pausedAt && !Number.isNaN(pausedAt.getTime())
      ? Math.max(0, Math.floor((now.getTime() - pausedAt.getTime()) / 1000))
      : 0

  const totalPausedSeconds = Number(session?.total_paused_seconds || 0) + secondsJustPaused

  const { data, error } = await supabase
    .from('dj_sessions')
    .update({
      is_paused: false,
      paused_at: null,
      total_paused_seconds: totalPausedSeconds,
    })
    .eq('id', session.id)
    .select('*')
    .single()

  return { data, error }
}
