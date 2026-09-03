import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'

export default function Hub({ onSelectLeague }) {
  const { user } = useAuth()
  const [userLeagues, setUserLeagues] = useState([])
  const [loading, setLoading] = useState(true)
  const [leagueName, setLeagueName] = useState('')
  const [leagueCode, setLeagueCode] = useState('')
  const [message, setMessage] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  const fetchUserLeagues = async () => {
    if (!user) return

    setLoading(true)
    const { data, error } = await supabase
      .from('leagues')
      .select(`
        id,
        name,
        code,
        status,
        created_by,
        created_at,
        league_members!inner (
          user_id
        )
      `)
      .eq('league_members.user_id', user.id)
      .order('created_at', { ascending: false })

    if (error) {
      console.error("Erreur lors de la récupération des ligues :", error.message)
      setMessage({ type: 'error', text: `Erreur : ${error.message}` })
    } else {
      setUserLeagues(data || [])
    }
    setLoading(false)
  }

  useEffect(() => {
    fetchUserLeagues()
  }, [user])

  const handleCreateLeague = async (e) => {
    e.preventDefault()
    if (!leagueName.trim() || !user) return

    setSubmitting(true)
    setMessage(null)

    const randomCode = Math.random().toString(36).substring(2, 8).toUpperCase()

    const { data: newLeague, error: leagueError } = await supabase
      .from('leagues')
      .insert([
        {
          name: leagueName.trim(),
          code: randomCode,
          status: 'recruiting',
          created_by: user.id
        }
      ])
      .select()
      .single()

    if (leagueError) {
      setMessage({ type: 'error', text: `Erreur création : ${leagueError.message}` })
      setSubmitting(false)
      return
    }

    const { error: memberError } = await supabase
      .from('league_members')
      .insert([
        {
          league_id: newLeague.id,
          user_id: user.id
        }
      ])

    if (memberError) {
      setMessage({ type: 'error', text: `Erreur ajout membre : ${memberError.message}` })
    } else {
      setLeagueName('')
      await fetchUserLeagues()
      onSelectLeague(newLeague.id)
    }
    setSubmitting(false)
  }

  const handleJoinLeague = async (e) => {
    e.preventDefault()
    if (!leagueCode.trim() || !user) return

    setSubmitting(true)
    setMessage(null)

    const { data: targetLeague, error: findError } = await supabase
      .from('leagues')
      .select('id, name')
      .eq('code', leagueCode.trim().toUpperCase())
      .maybeSingle()

    if (findError || !targetLeague) {
      setMessage({ type: 'error', text: 'Aucune ligue trouvée avec ce code.' })
      setSubmitting(false)
      return
    }

    const { error: joinError } = await supabase
      .from('league_members')
      .insert([
        {
          league_id: targetLeague.id,
          user_id: user.id
        }
      ])

    if (joinError) {
      setMessage({ type: 'error', text: `Erreur lors de l'adhésion : ${joinError.message}` })
    } else {
      setLeagueCode('')
      await fetchUserLeagues()
      onSelectLeague(targetLeague.id)
    }
    setSubmitting(false)
  }

  return (
    <div className="min-h-screen bg-amber-50/50 p-4 sm:p-6 space-y-6">
      <div className="max-w-4xl mx-auto space-y-6">
        
        {message && (
          <div className={`p-4 rounded-xl text-sm font-medium ${message.type === 'error' ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-800'}`}>
            {message.text}
          </div>
        )}

        <div className="grid md:grid-cols-2 gap-6">
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-amber-100 space-y-4">
            <h2 className="text-base font-bold text-amber-950">Créer une ligue</h2>
            <form onSubmit={handleCreateLeague} className="space-y-3">
              <input
                type="text"
                placeholder="Nom de la ligue"
                value={leagueName}
                onChange={(e) => setLeagueName(e.target.value)}
                className="w-full px-3 py-2 bg-amber-50/35 border border-amber-200 rounded-xl text-sm text-amber-950 focus:outline-none"
                required
              />
              <button
                type="submit"
                disabled={submitting}
                className="w-full bg-amber-800 hover:bg-amber-900 text-white font-bold py-2.5 rounded-xl text-sm transition cursor-pointer"
              >
                Créer la ligue
              </button>
            </form>
          </div>

          <div className="bg-white p-6 rounded-2xl shadow-sm border border-amber-100 space-y-4">
            <h2 className="text-base font-bold text-amber-950">Rejoindre avec un code</h2>
            <form onSubmit={handleJoinLeague} className="space-y-3">
              <input
                type="text"
                placeholder="Code de la ligue"
                value={leagueCode}
                onChange={(e) => setLeagueCode(e.target.value)}
                className="w-full px-3 py-2 bg-amber-50/35 border border-amber-200 rounded-xl text-sm text-amber-950 uppercase focus:outline-none"
                required
              />
              <button
                type="submit"
                disabled={submitting}
                className="w-full bg-amber-800 hover:bg-amber-900 text-white font-bold py-2.5 rounded-xl text-sm transition cursor-pointer"
              >
                Rejoindre la ligue
              </button>
            </form>
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl shadow-sm border border-amber-100 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-amber-950">Vos ligues activement rejointes</h2>
            <span className="bg-amber-100 text-amber-900 text-xs px-2.5 py-1 rounded-full font-bold">
              {userLeagues.length} ligues
            </span>
          </div>

          {loading ? (
            <p className="text-xs text-amber-800/70 py-4 text-center">Chargement de vos ligues...</p>
          ) : userLeagues.length === 0 ? (
            <p className="text-xs text-amber-800/70 italic py-4 text-center">Vous ne participez à aucune ligue pour le moment.</p>
          ) : (
            <div className="grid sm:grid-cols-2 gap-3">
              {userLeagues.map((league) => (
                <div key={league.id} className="p-4 rounded-xl border border-amber-200 bg-amber-50/30 flex items-center justify-between">
                  <div>
                    <h3 className="font-bold text-amber-950 text-sm">{league.name}</h3>
                    <p className="text-xs text-amber-800/70 font-mono">Code : {league.code}</p>
                  </div>
                  <button
                    onClick={() => onSelectLeague(league.id)}
                    className="px-3 py-1.5 bg-amber-800 hover:bg-amber-900 text-white text-xs font-bold rounded-lg transition cursor-pointer"
                  >
                    Ouvrir →
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  )
}