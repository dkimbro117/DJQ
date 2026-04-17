type BookingRequest = {
  id: string
  name: string
  email: string
  phone?: string | null
  event_date: string
  event_type: string
  venue?: string | null
  city?: string | null
  guest_count?: number | null
  budget?: string | null
  message?: string | null
  status?: string
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const resendApiKey = Deno.env.get('RESEND_API_KEY')
    const toEmail = Deno.env.get('BOOKING_NOTIFY_TO')
    const fromEmail = Deno.env.get('BOOKING_NOTIFY_FROM') || 'DJ High Caliber <onboarding@resend.dev>'

    if (!resendApiKey || !toEmail) {
      return new Response(
        JSON.stringify({ error: 'Missing RESEND_API_KEY or BOOKING_NOTIFY_TO' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const body = await req.json()
    const booking = body?.booking as BookingRequest | undefined

    if (!booking?.name || !booking?.email || !booking?.event_date || !booking?.event_type) {
      return new Response(
        JSON.stringify({ error: 'Missing required booking fields.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const subject = `New Booking Request - ${booking.event_date} - ${booking.name}`
    const html = `
      <h2>New Booking Request</h2>
      <p><strong>Name:</strong> ${escapeHtml(booking.name)}</p>
      <p><strong>Email:</strong> ${escapeHtml(booking.email)}</p>
      <p><strong>Phone:</strong> ${escapeHtml(booking.phone || 'N/A')}</p>
      <p><strong>Event Date:</strong> ${escapeHtml(booking.event_date)}</p>
      <p><strong>Event Type:</strong> ${escapeHtml(booking.event_type)}</p>
      <p><strong>Venue:</strong> ${escapeHtml(booking.venue || 'N/A')}</p>
      <p><strong>City:</strong> ${escapeHtml(booking.city || 'N/A')}</p>
      <p><strong>Guest Count:</strong> ${escapeHtml(String(booking.guest_count ?? 'N/A'))}</p>
      <p><strong>Budget:</strong> ${escapeHtml(booking.budget || 'N/A')}</p>
      <p><strong>Message:</strong> ${escapeHtml(booking.message || 'N/A')}</p>
    `

    const resendResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [toEmail],
        subject,
        html,
      }),
    })

    if (!resendResponse.ok) {
      const errBody = await resendResponse.text()
      return new Response(
        JSON.stringify({ error: 'Failed to send email', details: errBody }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const resendData = await resendResponse.json()
    return new Response(
      JSON.stringify({ success: true, resend: resendData }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ error: (error as Error).message || 'Unexpected error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
