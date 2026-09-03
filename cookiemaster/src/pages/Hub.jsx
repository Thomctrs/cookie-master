import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import LeagueView from './LeagueView' // Assurez-vous que le chemin d'importation est correct

export default function Hub() {
  const { user, signOut } = useAuth()
  const [leagues, setLeagues] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedLeagueId, setSelectedLeagueId] = useState(null)

  // États pour les modales / formulaires
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showJoinModal, setShowJoinModal] = useState(false)
  const [newLeagueName, setNewLeagueName] = useState('')
  const [joinCode, setJoinCode] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState(null)

  // Récupérer uniquement les ligues de l'utilisateur connecté
  const fetchUserLeagues = async () => {
    if (!user) return
    setLoading(true)

    try {
      // On récupère les ligues où l'utilisateur est soit le créateur, soit membre
      // Pour éviter les doublons si l'utilisateur est créateur ET membre, on gère proprement via une requête combinée ou une vue,
      // mais la méthode la plus simple et robuste avec Supabase est de récupérer les IDs des ligues de l'utilisateur.
      
      const { data: memberships, error: memberErr } = await supabase
        .from('league_members')
        .select('league_id')
        .eq('user_id', user.id)

      if (memberErr) throw memberErr

      const leagueIds = memberships ? memberships.map(m => m.league_id) : []

      // On récupère les ligues correspondantes aux IDs ou créées par l'utilisateur
      const { data: leaguesData, error: leaguesErr } = await supabase
        .from('leagues')
        .select('*')
        .or(`id.in.(${leagueIds.length > 0 ? leagueIds.join(',') : 'null'}),created_by.eq.${user.id}`)
        .order('created_at', { ascending: false })

      if (leaguesErr) throw leaguesErr

      setLeagues(leaguesData || [])
    } catch (err) {
      console.error('Erreur lors du chargement des ligues :', err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchUserLeagues()
  }, [user])

  // Créer une nouvelle ligue
  const handleCreateLeague = async (e) => {
    e.preventDefault()
    if (!newLeagueName.trim() || !user) return

    setSubmitting(true)
    setMessage(null)

    try {
      // Générer un code aléatoire à 6 caractères
      const code = Math.random().toString(36).substring(2, 8).toUpperCase()

      // 1. Insérer la ligue
      const { data: newLeague, error: leagueError } = await supabase
        .from('leagues')
        .insert([
          {
            name: newLeagueName.trim(),
            code: code,
            status: 'recruiting',
            created_by: user.id
          }
        ])
        .select()
        .single()

      if (leagueError) throw leagueError

      // 2. Ajouter automatiquement le créateur dans league_members
      const { error: memberError } = await supabase
        .from('league_members')
        .insert([
          {
            league_id: newLeague.id,
            user_id: user.id
          }
        ])

      if (memberError) throw memberError

      setNewLeagueName('')
      setShowCreateModal(false)
      fetchUserLeagues()
      
      // Ouvrir directement la ligue créée
      setSelectedLeagueId(newLeague.id)
    } catch (err) {
      setMessage({ type: 'error', text: `Erreur : ${err.message}` })
    } finally {
      setSubmitting(false)
    }
  }

  // Rejoindre une ligue via un code
  const handleJoinLeague = async (e) => {
    e.preventDefault()
    if (!joinCode.trim() || !user) return

    setSubmitting(true)
    setMessage(null)

    try {
      // 1. Chercher la ligue correspondante au code
      const { data: targetLeague, error: searchError } = await supabase
        .from('leagues')
        .select('*')
        .eq('code', joinCode.trim().toUpperCase())
        .maybeSingle()

      if (searchError || !targetLeague) {
        throw new Error("Aucune ligue ne correspond à ce code d'invitation.")
      }

      // 2. Vérifier si l'utilisateur est déjà membre
      const { data: existingMember } = await supabase
        .from('league_members')
        .select('*')
        .eq('league_id', targetLeague.id)
        .eq('user_id', user.id)
        .maybeSingle()

      if (!existingMember) {
        // 3. Ajouter l'utilisateur dans league_members
        const { error: joinError } = await supabase
          .from('league_members')
          .insert([
            {
              league_id: targetLeague.id,
              user_id: user.id
            }
          ])

        if (joinError) throw joinError
      }

      setJoinCode('')
      setShowJoinModal(false)
      fetchUserLeagues()
      setSelectedLeagueId(targetLeague.id)
    } catch (err) {
      setMessage({ type: 'error', text: err.message })
    } finally {
      setSubmitting(false)
    }
  }

  // Si une ligue est sélectionnée, on affiche la vue de la ligue
  if (selectedLeagueId) {
    return (
      <LeagueView 
        leagueId={selectedLeagueId} 
        onBack={() => {
          setSelectedLeagueId(null)
          fetchUserLeagues()
        }} 
      />
    )
  }

  return (
    <div className="min-h-screen bg-amber-50/50 p-4 sm:p-8">
      <div className="max-w-4xl mx-auto space-y-8">
        
        {/* Header du Hub */}
        <header className="bg-white p-6 rounded-2xl shadow-sm border border-amber-100 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="space-y-1 text-center sm:text-left">
            <h1 className="text-2xl sm:text-3xl font-extrabold text-amber-950 flex items-center justify-center sm:justify-start gap-2">
              <span>🍪</span> Cookie League Hub
            </h1>
            <p className="text-xs text-amber-800/80">Gérez vos ligues de pâtisserie et suivez les classements.</p>
          </div>
          <button 
            onClick={signOut} 
            className="text-xs font-bold text-red-600 hover:text-red-800 bg-red-50 px-4 py-2 rounded-xl transition cursor-pointer"
          >
            Se déconnecter
          </button>
        </header>

        {/* Message d'alerte global si besoin */}
        {message && (
          <div className={`p-4 rounded-xl text-xs font-medium ${message.type === 'error' ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-800'}`}>
            {message.text}
          </div>
        )}

        {/* Boutons d'action principaux */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <button
            onClick={() => { setShowCreateModal(true); setMessage(null); }}
            className="bg-amber-800 hover:bg-amber-900 text-white font-bold p-4 rounded-2xl shadow-sm transition flex items-center justify-center gap-2 cursor-pointer text-sm"
          >
            <span>✨</span> Créer une nouvelle ligue
          </button>
          <button
            onClick={() => { setShowJoinModal(true); setMessage(null); }}
            className="bg-white hover:bg-amber-50 text-amber-950 border border-amber-200 font-bold p-4 rounded-2xl shadow-sm transition flex items-center justify-center gap-2 cursor-pointer text-sm"
          >
            <span>🔗</span> Rejoindre avec un code
          </button>
        </div>

        {/* Liste des ligues de l'utilisateur */}
        <div className="space-y-4">
          <h2 className="text-lg font-bold text-amber-950 flex items-center gap-2">
            <span>🏆</span> Mes ligues ({leagues.length})
          </h2>

          {loading ? (
            <div className="text-center py-12 text-amber-900 font-medium text-sm">
              <span className="animate-spin inline-block mr-2">🍪</span> Chargement de vos ligues...
            </div>
          ) : leagues.length === 0 ? (
            <div className="bg-white p-8 rounded-2xl border border-amber-100 text-center space-y-3">
              <p className="text-sm text-amber-800/80">Vous ne participez à aucune ligue pour l'instant.</p>
              <p className="text-xs text-amber-700">Créez-en une ou rejoignez un groupe existant pour commencer !</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {leagues.map((league) => (
                <div 
                  key={league.id}
                  onClick={() => setSelectedLeagueId(league.id)}
                  className="bg-white p-5 rounded-2xl border border-amber-100 hover:border-amber-300 shadow-sm transition cursor-pointer flex flex-col justify-between space-y-4"
                >
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${league.status === 'active' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-900'}`}>
                        {league.status === 'active' ? '🟢 Active' : '⏳ En recrutement'}
                      </span>
                      <span className="text-xs font-mono text-amber-800 font-bold bg-amber-50 px-2 py-0.5 rounded">
                        {league.code}
                      </span>
                    </div>
                    <h3 className="text-base font-extrabold text-amber-950 pt-2">{league.name}</h3>
                  </div>
                  <div className="text-xs font-bold text-amber-800 flex items-center justify-between pt-2 border-t border-amber-50">
                    <span>Accéder au salon</span>
                    <span>→</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* MODALE : Créer une ligue */}
        {showCreateModal && (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
            <div className="bg-white max-w-md w-full p-6 rounded-2xl shadow-xl border border-amber-100 space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-bold text-amber-950">Créer une ligue</h3>
                <button onClick={() => setShowCreateModal(false)} className="text-amber-800 hover:text-amber-950 font-bold text-sm cursor-pointer">✕</button>
              </div>
              <form onSubmit={handleCreateLeague} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-amber-900 mb-1">Nom de la ligue</label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: Les mordus du cookie"
                    value={newLeagueName}
                    onChange={(e) => setNewLeagueName(e.target.value)}
                    className="w-full px-3 py-2 bg-amber-50/40 border border-amber-200 rounded-xl text-sm text-amber-950 focus:outline-none"
                  />
                </div>
                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full bg-amber-800 hover:bg-amber-900 text-white font-bold py-3 rounded-xl transition text-sm cursor-pointer disabled:opacity-50"
                >
                  {submitting ? 'Création...' : 'Créer et lancer le salon'}
                </button>
              </form>
            </div>
          </div>
        )}

        {/* MODALE : Rejoindre une ligue */}
        {showJoinModal && (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
            <div className="bg-white max-w-md w-full p-6 rounded-2xl shadow-xl border border-amber-100 space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-bold text-amber-950">Rejoindre une ligue</h3>
                <button onClick={() => setShowJoinModal(false)} className="text-amber-800 hover:text-amber-950 font-bold text-sm cursor-pointer">✕</button>
              </div>
              <form onSubmit={handleJoinLeague} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-amber-900 mb-1">Code d'invitation à 6 caractères</label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: A3F9Z2"
                    value={joinCode}
                    onChange={(e) => setJoinCode(e.target.value)}
                    className="w-full px-3 py-2 bg-amber-50/40 border border-amber-200 rounded-xl text-sm uppercase text-amber-950 focus:outline-none font-mono tracking-wider"
                  />
                </div>
                {message && (
                  <p className="text-xs text-red-600 font-medium">{message.text}</p>
                )}
                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full bg-amber-800 hover:bg-amber-900 text-white font-bold py-3 rounded-xl transition text-sm cursor-pointer disabled:opacity-50"
                >
                  {submitting ? 'Recherche...' : 'Rejoindre la ligue'}
                </button>
              </form>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}