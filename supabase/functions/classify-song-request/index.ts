import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

type ClassifyPayload = {
  request_id: string
  song: string
  artist: string
}

type SessionContext = {
  event_type: string
  audience_flag: string
  anchor_genres: string[]
  hard_avoids: string[]
  start_time: string
  set_duration_minutes: number
  is_paused: boolean
  paused_at: string | null
  total_paused_seconds: number
}

function getCurrentPhase(
  startTime: string,
  setDurationMinutes: number,
  options: {
    isPaused?: boolean
    pausedAt?: string | null
    totalPausedSeconds?: number
  } = {}
) {
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
  const effectiveNowMs =
    isPaused && pausedAt && !Number.isNaN(pausedAt.getTime())
      ? pausedAt.getTime()
      : Date.now()
  const elapsedMs = effectiveNowMs - start.getTime() - totalPausedSeconds * 1000
  const elapsedMinutes = Math.max(0, elapsedMs / 60000)
  const ratio = elapsedMinutes / Number(setDurationMinutes)
  if (ratio < 0.3) return 'Building'
  if (ratio < 0.7) return 'Peaked'
  if (ratio < 0.9) return 'Cooling'
  return 'Closing'
}

function parseClaudeJson(raw: string) {
  const trimmed = raw.trim()
  const first = trimmed.indexOf('{')
  const last = trimmed.lastIndexOf('}')
  if (first < 0 || last < 0 || last <= first) {
    throw new Error('Claude response did not contain JSON object.')
  }
  return JSON.parse(trimmed.slice(first, last + 1))
}

async function updateRequestTags(
  admin: ReturnType<typeof createClient>,
  requestId: string,
  payload: {
    set_phase: string
    recognized: boolean | null
    confidence: string | null
    content_flag: string | null
    energy: string | null
    genre: string | null
    bpm_range: string | null
    fit: string | null
    fit_reason: string | null
  }
) {
  const { error } = await admin
    .from('song_requests')
    .update(payload)
    .eq('id', requestId)
  return error
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY')
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    if (!anthropicKey || !supabaseUrl || !serviceRoleKey) {
      return new Response(
        JSON.stringify({ error: 'Missing ANTHROPIC_API_KEY or Supabase service env vars.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const body = await req.json() as ClassifyPayload
    if (!body?.request_id || !body?.song || !body?.artist) {
      return new Response(
        JSON.stringify({ error: 'request_id, song, and artist are required.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const admin = createClient(supabaseUrl, serviceRoleKey)
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const { data: session } = await admin
      .from('dj_sessions')
      .select('event_type, audience_flag, anchor_genres, hard_avoids, start_time, set_duration_minutes, is_paused, paused_at, total_paused_seconds, created_at')
      .gte('created_at', today.toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    const sessionContext: SessionContext | null = session
      ? {
          event_type: session.event_type || 'Unknown',
          audience_flag: session.audience_flag || 'all_ages',
          anchor_genres: Array.isArray(session.anchor_genres) ? session.anchor_genres : [],
          hard_avoids: Array.isArray(session.hard_avoids) ? session.hard_avoids : [],
          start_time: session.start_time,
          set_duration_minutes: session.set_duration_minutes,
          is_paused: Boolean(session.is_paused),
          paused_at: session.paused_at || null,
          total_paused_seconds: Number(session.total_paused_seconds || 0),
        }
      : null

    const setPhase = sessionContext?.start_time && sessionContext?.set_duration_minutes
      ? getCurrentPhase(sessionContext.start_time, sessionContext.set_duration_minutes, {
        isPaused: sessionContext.is_paused,
        pausedAt: sessionContext.paused_at,
        totalPausedSeconds: sessionContext.total_paused_seconds,
      })
      : 'Building'

    try {
      const userMessage = [
        `Song (as submitted): ${body.song}`,
        `Artist (as submitted): ${body.artist}`,
        `Alternate interpretation if swapped -> Song: ${body.artist}`,
        `Alternate interpretation if swapped -> Artist: ${body.song}`,
        `Event type: ${sessionContext?.event_type || 'Unknown'}`,
        `Audience: ${sessionContext?.audience_flag || 'all_ages'}`,
        `Anchor genres: ${sessionContext?.anchor_genres?.join(', ') || 'None'}`,
        `Hard avoids: ${sessionContext?.hard_avoids?.join(', ') || 'None'}`,
        `Set phase: ${setPhase}`,
        'Return ONLY this JSON:',
        '{',
        '  "recognized": boolean,',
        '  "confidence": "high" | "medium" | "low",',
        '  "energy": "Hype" | "Vibe" | "Slow" | "Afro" | "Wild Card",',
        '  "genre": string,',
        '  "bpm_range": string (e.g. "90–100"),',
        '  "fit": "Good Fit" | "Hold" | "Not Tonight",',
        '  "fit_reason": string (one short sentence, max 8 words),',
        '  "content_flag": "clean" | "explicit" | "unknown"',
        '}',
      ].join('\n')

      const anthropicResponse = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': anthropicKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 260,
          temperature: 0,
          system: [
            'You are a DJ set assistant with knowledge of popular music up to early 2025.',
            'Given a song request and set context, return ONLY a JSON object with no preamble, explanation, or markdown. Be concise and accurate.',
            'Only assert genre, BPM, and content ratings you are reasonably confident about from your training data.',
            'If you do not recognize the song or artist, set recognized to false.',
            'Never guess BPM or explicitness - use null bpm_range and content_flag "unknown" when uncertain.',
            'Before answering, evaluate whether the submitted song/artist may be swapped.',
            'Use the interpretation (submitted or swapped) that is more musically plausible and recognized.',
            '',
            'Content filtering rules - apply strictly based on audience_flag:',
            "- family_safe: If the requested song has explicit lyrics, sexual themes, or drug references, set fit to 'Not Tonight' and set fit_reason to 'Explicit content - family safe event'. If a clean version exists, note it in fit_reason instead: 'Play clean version only'.",
            "- teens: If the requested song has heavy explicit content or adult themes, set fit to 'Hold' and set fit_reason to 'Explicit content - teens present'. Mild content is acceptable.",
            "- all_ages: Flag clearly explicit tracks as 'Hold' with fit_reason 'Confirm clean version available'.",
            '- adults_only: No content filtering applied.',
          ].join('\n'),
          messages: [
            {
              role: 'user',
              content: userMessage,
            },
          ],
        }),
      })

      if (!anthropicResponse.ok) {
        throw new Error(`Anthropic request failed: ${await anthropicResponse.text()}`)
      }

      const anthropicData = await anthropicResponse.json()
      const responseText =
        anthropicData?.content?.find((item: { type: string }) => item.type === 'text')?.text || ''
      const parsed = parseClaudeJson(responseText)

      const allowedEnergy = new Set(['Hype', 'Vibe', 'Slow', 'Afro', 'Wild Card'])
      const allowedFit = new Set(['Good Fit', 'Hold', 'Not Tonight'])
      const allowedConfidence = new Set(['high', 'medium', 'low'])
      const allowedContentFlag = new Set(['clean', 'explicit', 'unknown'])

      const recognized = Boolean(parsed.recognized)
      const confidence = allowedConfidence.has(String(parsed.confidence || '').toLowerCase())
        ? String(parsed.confidence).toLowerCase()
        : 'low'
      const contentFlag = allowedContentFlag.has(String(parsed.content_flag || '').toLowerCase())
        ? String(parsed.content_flag).toLowerCase()
        : 'unknown'
      const energy = allowedEnergy.has(parsed.energy) ? parsed.energy : 'Wild Card'
      let genre = String(parsed.genre || '').trim() || null
      let bpmRange = String(parsed.bpm_range || '').trim() || null
      let fit = allowedFit.has(parsed.fit) ? parsed.fit : 'Hold'
      let fitReason = String(parsed.fit_reason || '').trim() || 'Needs quick DJ judgment.'

      if (!recognized) {
        genre = null
        bpmRange = null
        fit = 'Hold'
        fitReason = 'Song not recognized — review manually.'
      }

      if (confidence === 'low') {
        fit = 'Hold'
        fitReason = 'Low confidence — review manually.'
      }

      const audience = sessionContext?.audience_flag || 'all_ages'
      if (audience === 'family_safe' && contentFlag === 'unknown') {
        fit = 'Hold'
        fitReason = 'Content unverified — family safe event.'
      }

      if (
        genre &&
        sessionContext?.hard_avoids?.some(
          (item) => item.toLowerCase() === genre.toLowerCase()
        )
      ) {
        fit = 'Not Tonight'
        fitReason = 'Matches hard avoid genre.'
      }

      const updateError = await updateRequestTags(admin, body.request_id, {
        set_phase: setPhase,
        recognized,
        confidence,
        content_flag: contentFlag,
        energy,
        genre,
        bpm_range: bpmRange,
        fit,
        fit_reason: fitReason,
      })

      if (updateError) {
        return new Response(
          JSON.stringify({ error: 'Could not update song request.', details: updateError.message }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      return new Response(
        JSON.stringify({
          success: true,
          recognized,
          confidence,
          content_flag: contentFlag,
          energy,
          genre,
          bpm_range: bpmRange,
          fit,
          fit_reason: fitReason,
          set_phase: setPhase,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    } catch (_error) {
      const updateError = await updateRequestTags(admin, body.request_id, {
        set_phase: setPhase,
        recognized: null,
        confidence: null,
        content_flag: null,
        energy: null,
        genre: null,
        bpm_range: null,
        fit: null,
        fit_reason: null,
      })
      if (updateError) {
        return new Response(
          JSON.stringify({ error: 'Could not persist fallback null tags.', details: updateError.message }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
      return new Response(
        JSON.stringify({ success: true, fallback: true, set_phase: setPhase }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
  } catch (error) {
    return new Response(
      JSON.stringify({ error: (error as Error).message || 'Unexpected error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
