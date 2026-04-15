import { useRef, useState } from 'react'
import { supabase } from '../lib/supabase'

function normalize(value) {
  return (value || '').trim().toLowerCase()
}

export default function GuestPage({ navigateTo }) {
  const [song, setSong] = useState('')
  const [artist, setArtist] = useState('')
  const [requestedBy, setRequestedBy] = useState('')
  const [toast, setToast] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const songInputRef = useRef(null)

  const showToast = (message) => {
    setToast(message)
    window.setTimeout(() => {
      setToast('')
    }, 2500)
  }

  const handleSubmit = async (event) => {
    event.preventDefault()

    const trimmedSong = song.trim()
    const trimmedArtist = artist.trim()
    const trimmedRequestedBy = requestedBy.trim()

    if (!trimmedSong) {
      songInputRef.current?.focus()
      return
    }

    setIsSubmitting(true)

    try {
      const { data: existingRows, error: fetchError } = await supabase
        .from('song_requests')
        .select('song, artist, requested_by')
        .ilike('song', trimmedSong)
        .ilike('artist', trimmedArtist || '')

      if (fetchError) {
        throw fetchError
      }

      const duplicateExists = (existingRows || []).some((row) => {
        const sameSong = normalize(row.song) === normalize(trimmedSong)
        const sameArtist = normalize(row.artist) === normalize(trimmedArtist)
        const sameRequester =
          normalize(row.requested_by) === normalize(trimmedRequestedBy)

        return sameSong && sameArtist && sameRequester && normalize(trimmedRequestedBy)
      })

      if (duplicateExists) {
        showToast('You already requested this!')
        return
      }

      const payload = {
        song: trimmedSong,
        artist: trimmedArtist,
        requested_by: trimmedRequestedBy,
      }

      const { error: insertError } = await supabase
        .from('song_requests')
        .insert(payload)

      if (insertError) {
        throw insertError
      }

      showToast('Request submitted!')
      setSong('')
      setArtist('')
      setRequestedBy('')
      songInputRef.current?.focus()
    } catch (error) {
      showToast(error.message || 'Unable to submit request.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="min-h-screen bg-[#0a0a0f] text-white px-4 py-10">
      <div className="mx-auto w-full max-w-xl">
        <div className="mb-8 flex items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold">DJ Song Requests</h1>
          <button
            type="button"
            onClick={() => navigateTo('dj')}
            className="rounded-md border border-white/20 px-3 py-2 text-sm hover:border-white/40"
          >
            DJ View
          </button>
        </div>

        <form
          onSubmit={handleSubmit}
          className="w-full rounded-xl border border-white/10 bg-black/20 p-5 space-y-4"
        >
          <div>
            <label htmlFor="song" className="mb-1 block text-sm text-white/80">
              Song Title *
            </label>
            <input
              id="song"
              ref={songInputRef}
              value={song}
              onChange={(event) => setSong(event.target.value)}
              placeholder="Enter song title"
              className="w-full rounded-md border border-white/15 bg-white/5 px-3 py-2 outline-none focus:border-[#f5a623]"
            />
          </div>

          <div>
            <label htmlFor="artist" className="mb-1 block text-sm text-white/80">
              Artist
            </label>
            <input
              id="artist"
              value={artist}
              onChange={(event) => setArtist(event.target.value)}
              placeholder="Enter artist"
              className="w-full rounded-md border border-white/15 bg-white/5 px-3 py-2 outline-none focus:border-[#f5a623]"
            />
          </div>

          <div>
            <label
              htmlFor="requestedBy"
              className="mb-1 block text-sm text-white/80"
            >
              Your Name
            </label>
            <input
              id="requestedBy"
              value={requestedBy}
              onChange={(event) => setRequestedBy(event.target.value)}
              placeholder="Tell us your name"
              className="w-full rounded-md border border-white/15 bg-white/5 px-3 py-2 outline-none focus:border-[#f5a623]"
            />
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded-md bg-[#f5a623] px-4 py-2 font-semibold text-black disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? 'Submitting...' : 'Submit Request'}
          </button>
        </form>
      </div>

      {toast && (
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 rounded-md bg-white px-4 py-2 text-sm font-medium text-black shadow-lg">
          {toast}
        </div>
      )}
    </main>
  )
}
