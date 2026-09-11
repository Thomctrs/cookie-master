import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import logo from '../logo/logo.webp'

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

    const { data: newLeague, error: leagueError } = await supabase.rpc('create_league', {
      p_name: leagueName.trim(),
      p_code: randomCode
    })

    if (leagueError) {
      setMessage({ type: 'error', text: `Erreur création : ${leagueError.message}` })
      setSubmitting(false)
      return
    }

    setLeagueName('')
    if (newLeague?.id) onSelectLeague(newLeague.id)
    setSubmitting(false)
  }

  const handleJoinLeague = async (e) => {
    e.preventDefault()
    if (!leagueCode.trim() || !user) return

    setSubmitting(true)
    setMessage(null)

    const { data: leagueId, error } = await supabase.rpc('join_league', {
      p_code: leagueCode.trim().toUpperCase()
    })

    if (error) {
      setMessage({ type: 'error', text: `Erreur : ${error.message}` })
      setSubmitting(false)
      return
    }

    setLeagueCode('')
    if (leagueId && onSelectLeague) onSelectLeague(leagueId)
    setSubmitting(false)
  }

  return (
    <div className="min-h-screen bg-[#FDF8F2] bg-[radial-gradient(#E8D8C4_1px,transparent_1px)] [background-size:18px_18px] p-4 sm:p-6 text-[#3D2513] font-sans">
      <div className="max-w-4xl mx-auto space-y-6">
        
        {/* En-tête / Tableau de bord */}
        <header className="bg-white/95 backdrop-blur p-6 rounded-3xl border border-[#D9BFA8] shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <img 
              src={logo} 
              alt="Logo Cookie Challenge" 
              className="w-14 h-14 object-contain rounded-2xl shadow-xs border border-[#D9BFA8] bg-[#F5EBE1] shrink-0" 
            />
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#8C6239]">Tableau de bord</span>
              <h1 className="text-2xl sm:text-3xl font-black text-[#2A180C] tracking-tight">
                Cookie Challenge 🍪
              </h1>
              <p className="text-xs text-[#734A2C] mt-0.5">
                Pilote tes ligues d'openspace, crée de nouvelles fournées ou rejoins tes collègues gourmands.
              </p>
            </div>
          </div>
        </header>

        {message && (
          <div className={`p-4 rounded-2xl text-xs font-medium shadow-sm ${message.type === 'error' ? 'bg-rose-50 text-rose-900 border border-rose-200' : 'bg-emerald-50 text-emerald-900 border border-emerald-200'}`}>
            {message.text}
          </div>
        )}

        <div className="grid md:grid-cols-2 gap-6">
          {/* Créer une ligue */}
          <div className="bg-white/95 backdrop-blur p-6 rounded-3xl border border-[#D9BFA8] shadow-sm space-y-4">
            <h2 className="text-xs font-black uppercase tracking-wider text-[#2A180C]">Créer une ligue</h2>
            <form onSubmit={handleCreateLeague} className="space-y-3">
              <input
                type="text"
                placeholder="Nom de la ligue (ex: Les becs sucrés)"
                value={leagueName}
                onChange={(e) => setLeagueName(e.target.value)}
                className="w-full px-4 py-3 bg-[#FAF2EB]/40 border border-[#D9BFA8] rounded-2xl text-xs text-[#3D2513] focus:outline-none focus:ring-2 focus:ring-[#8C6239] placeholder:text-[#A68A72] shadow-inner"
                required
              />
              <button
                type="submit"
                disabled={submitting}
                className="w-full bg-[#5C3A21] hover:bg-[#3D2513] text-[#FDF8F2] text-xs font-bold uppercase tracking-wider py-3.5 rounded-2xl transition shadow-md cursor-pointer disabled:opacity-50"
              >
                Créer la ligue 🍪
              </button>
            </form>
          </div>

          {/* Rejoindre avec un code */}
          <div className="bg-white/95 backdrop-blur p-6 rounded-3xl border border-[#D9BFA8] shadow-sm space-y-4">
            <h2 className="text-xs font-black uppercase tracking-wider text-[#2A180C]">Rejoindre avec un code</h2>
            <form onSubmit={handleJoinLeague} className="space-y-3">
              <input
                type="text"
                placeholder="Code de la ligue (ex: AB12CD)"
                value={leagueCode}
                onChange={(e) => setLeagueCode(e.target.value)}
                className="w-full px-4 py-3 bg-[#FAF2EB]/40 border border-[#D9BFA8] rounded-2xl text-xs text-[#3D2513] uppercase focus:outline-none focus:ring-2 focus:ring-[#8C6239] placeholder:text-[#A68A72] shadow-inner font-mono tracking-widest"
                required
              />
              <button
                type="submit"
                disabled={submitting}
                className="w-full bg-[#5C3A21] hover:bg-[#3D2513] text-[#FDF8F2] text-xs font-bold uppercase tracking-wider py-3.5 rounded-2xl transition shadow-md cursor-pointer disabled:opacity-50"
              >
                Rejoindre la ligue ✨
              </button>
            </form>
          </div>
        </div>

        {/* Liste des ligues actives */}
        <div className="bg-white/95 backdrop-blur p-6 rounded-3xl border border-[#D9BFA8] shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-black uppercase tracking-wider text-[#2A180C]">Vos ligues actives</h2>
            <span className="bg-[#EEDCC7] text-[#5C3A21] text-xs px-3 py-1 rounded-full font-bold border border-[#D9BFA8] shadow-2xs">
              {userLeagues.length} ligue(s)
            </span>
          </div>

          {loading ? (
            <p className="text-xs text-[#A68A72] italic py-6 text-center">Chargement de vos douceurs...</p>
          ) : userLeagues.length === 0 ? (
            <p className="text-xs text-[#A68A72] italic py-6 text-center">Vous ne participez à aucune ligue pour le moment. Créez-en une ou rejoignez un groupe !</p>
          ) : (
            <div className="grid sm:grid-cols-2 gap-3.5">
              {userLeagues.map((league) => (
                <div key={league.id} className="p-4 rounded-2xl border border-[#D9BFA8] bg-[#FAF2EB]/30 flex items-center justify-between shadow-2xs">
                  <div>
                    <h3 className="font-black text-[#2A180C] text-sm">{league.name}</h3>
                    <p className="text-xs text-[#8C6239] font-mono mt-0.5">Code : {league.code}</p>
                  </div>
                  <button
                    onClick={() => onSelectLeague(league.id)}
                    className="px-3.5 py-2 bg-[#5C3A21] hover:bg-[#3D2513] text-[#FDF8F2] text-xs font-bold rounded-xl transition cursor-pointer shadow-xs"
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