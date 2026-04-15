import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'

function normalize(value) {
  return (value || '').trim().toLowerCase()
}

function groupRequests(rows) {
  const groupedMap = new Map()

  for (const row of rows) {
    const song = (row.song || '').trim()
    const artist = (row.artist || '').trim()
    const key = `${normalize(song)}__${normalize(artist)}`

    if (!groupedMap.has(key)) {
      groupedMap.set(key, {
        key,
        song,
        artist,
        count: 0,
        requesters: [],
      })
    }

    const group = groupedMap.get(key)
    group.count += 1
    if (row.requested_by && row.requested_by.trim()) {
      group.requesters.push(row.requested_by.trim())
    }
  }

  return [...groupedMap.values()].sort((a, b) => b.count - a.count)
}

export default function DJPage({ navigateTo }) {
  const [passwordInput, setPasswordInput] = useState('')
  const [isUnlocked, setIsUnlocked] = useState(false)
  const [authError, setAuthError] = useState('')
  const [requests, setRequests] = useState([])
  const [isLoading, setIsLoading] = useState(false)
  const [actionError, setActionError] = useState('')

  const expectedPassword = import.meta.env.VITE_DJ_PASSWORD

  const groupedRequests = useMemo(() => groupRequests(requests), [requests])

  const fetchRequests = async () => {
    setIsLoading(true)
    try {
      const { data, error } = await supabase.from('song_requests').select('*')
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

  useEffect(() => {
    if (!isUnlocked) {
      return undefined
    }

    fetchRequests()

    const channel = supabase
      .channel('dj-song-requests')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'song_requests' },
        () => {
          fetchRequests()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [isUnlocked])

  const handleUnlock = (event) => {
    event.preventDefault()
    if (passwordInput === expectedPassword) {
      setIsUnlocked(true)
      setAuthError('')
      return
    }
    setAuthError('Incorrect password')
  }

  const handleDeleteGroup = async (group) => {
    try {
      setActionError('')
      const songMatches = requests
        .filter(
          (row) =>
            normalize(row.song) === normalize(group.song) &&
            normalize(row.artist) === normalize(group.artist)
        )
        .map((row) => row.id)

      if (!songMatches.length) {
        return
      }

      const { error } = await supabase
        .from('song_requests')
        .delete()
        .in('id', songMatches)

      if (error) {
        throw error
      }

      fetchRequests()
    } catch (error) {
      setActionError(error.message || 'Could not delete song requests.')
    }
  }

  const handleClearAll = async () => {
    try {
      setActionError('')
      const { error } = await supabase
        .from('song_requests')
        .delete()
        .neq('id', 0)
      if (error) {
        throw error
      }
      setRequests([])
    } catch (error) {
      setActionError(error.message || 'Could not clear queue.')
    }
  }

  if (!isUnlocked) {
    return (
      <main className="min-h-screen bg-[#0a0a0f] text-white px-4 py-10">
        <div className="mx-auto w-full max-w-md rounded-xl border border-white/10 bg-black/20 p-5">
          <div className="mb-6 flex items-center justify-between gap-3">
            <h1 className="text-2xl font-semibold">DJ Lock</h1>
            <button
              type="button"
              onClick={() => navigateTo('guest')}
              className="rounded-md border border-white/20 px-3 py-2 text-sm hover:border-white/40"
            >
              Guest View
            </button>
          </div>
          <form onSubmit={handleUnlock} className="space-y-4">
            <input
              type="password"
              value={passwordInput}
              onChange={(event) => setPasswordInput(event.target.value)}
              placeholder="Enter DJ password"
              className="w-full rounded-md border border-white/15 bg-white/5 px-3 py-2 outline-none focus:border-[#f5a623]"
            />
            <button
              type="submit"
              className="w-full rounded-md bg-[#f5a623] px-4 py-2 font-semibold text-black"
            >
              Unlock
            </button>
            {authError && <p className="text-sm text-red-400">{authError}</p>}
          </form>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-[#0a0a0f] text-white px-4 py-8">
      <div className="mx-auto w-full max-w-4xl">
        <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold">DJ Queue</h1>
            <p className="text-sm text-white/70">
              {groupedRequests.length} unique songs
            </p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => navigateTo('guest')}
              className="rounded-md border border-white/20 px-3 py-2 text-sm hover:border-white/40"
            >
              Guest View
            </button>
            <button
              type="button"
              onClick={handleClearAll}
              className="rounded-md border border-red-400/60 px-3 py-2 text-sm text-red-300 hover:bg-red-500/10"
            >
              Clear All
            </button>
          </div>
        </header>

        {actionError && (
          <p className="mb-4 rounded-md border border-red-400/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">
            {actionError}
          </p>
        )}

        {isLoading ? (
          <p className="text-white/70">Loading queue...</p>
        ) : groupedRequests.length === 0 ? (
          <p className="rounded-lg border border-white/10 bg-black/20 p-4 text-white/70">
            No song requests yet.
          </p>
        ) : (
          <div className="space-y-3">
            {groupedRequests.map((group, index) => {
              const requesters = group.requesters
              const shownRequesters = requesters.slice(0, 2)
              const overflowCount = requesters.length - shownRequesters.length

              return (
                <article
                  key={group.key}
                  className={`rounded-lg border p-4 ${
                    group.count > 1
                      ? 'border-[#f5a623] bg-[#f5a623]/10'
                      : 'border-white/10 bg-black/20'
                  }`}
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <p className="text-sm text-white/60">#{index + 1}</p>
                      <h2 className="truncate text-lg font-semibold">
                        {group.song || 'Unknown song'}
                      </h2>
                      <p className="truncate text-sm text-white/75">
                        {group.artist || 'Unknown artist'}
                      </p>
                      <p className="mt-2 text-sm text-white/80">
                        Requested by:{' '}
                        {shownRequesters.join(', ') || 'Anonymous'}
                        {overflowCount > 0 ? ` +${overflowCount} more` : ''}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="rounded-full bg-white/10 px-3 py-1 text-sm font-semibold">
                        {group.count}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleDeleteGroup(group)}
                        className="rounded-md border border-white/20 px-3 py-1.5 text-sm hover:border-white/40"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </div>
    </main>
  )
}
