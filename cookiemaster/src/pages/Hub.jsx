import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'

export default function Hub({ onSelectLeague }) {
  const { user, profile, signOut } = useAuth()
  const [leagues, setLeagues] = useState([])
  const [newLeagueName, setNewLeagueName] = useState('')
  const [joinCode, setJoinCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState(null)

  // Récupération de la liste des ligues
  const fetchLeagues = async () => {
    if (!user) return
    const { data, error } = await supabase
      .from('leagues')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Erreur lors du chargement des ligues :', error)
    } else {
      setLeagues(data || [])
    }
  }

  useEffect(() => {
    fetchLeagues()
  }, [user])

  // Création d'une nouvelle ligue
  const createLeague = async (e) => {
    e.preventDefault()
    if (!newLeagueName.trim()) return

    // Vérification de la présence de l'utilisateur connecté
    if (!user?.id) {
      setMessage({ 
        type: 'error', 
        text: 'Erreur : Session utilisateur manquante. Veuillez rafraîchir la page ou vous reconnecter.' 
      })
      return
    }

    setLoading(true)
    setMessage(null)

    // Génération d'un code unique à 6 caractères
    const code = Math.random().toString(36).substring(2, 8).toUpperCase()

    const { data, error } = await supabase
      .from('leagues')
      .insert([
        {
          name: newLeagueName.trim(),
          code: code,
          created_by: user.id
        }
      ])
      .select()

    if (error) {
      console.error('Erreur Supabase lors de la création de la ligue :', error)
      setMessage({ 
        type: 'error', 
        text: `Erreur (${error.code || '400'}) : ${error.message || 'Impossible de créer la ligue.'}` 
      })
    } else {
      setMessage({ 
        type: 'success', 
        text: `Ligue "${newLeagueName.trim()}" créée avec succès ! Code : ${code}` 
      })
      setNewLeagueName('')
      fetchLeagues()
      if (data && data[0]) {
        onSelectLeague(data[0].id)
      }
    }
    setLoading(false)
  }

  // Rejoindre une ligue par code d'accès
  const joinLeague = async (e) => {
    e.preventDefault()
    if (!joinCode.trim()) return

    setLoading(true)
    setMessage(null)

    const cleanCode = joinCode.trim().toUpperCase()

    // maybeSingle() évite le rejet 406 si aucun résultat n'est trouvé
    const { data, error } = await supabase
      .from('leagues')
      .select('*')
      .eq('code', cleanCode)
      .maybeSingle()

    if (error || !data) {
      setMessage({ type: 'error', text: 'Aucune ligue trouvée avec ce code.' })
    } else {
      setMessage({ type: 'success', text: `Ligue "${data.name}" rejointe !` })
      setJoinCode('')
      onSelectLeague(data.id)
    }
    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-amber-50/50 p-4 sm:p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        
        {/* En-tête profil & déconnexion */}
        <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl shadow-sm border border-amber-100">
          <div className="flex items-center gap-3">
            <span className="text-4xl">🍪</span>
            <div>
              <h1 className="text-2xl font-bold text-amber-950">
                Bonjour, {profile?.username || user?.email?.split('@')[0] || 'Gourmand'} !
              </h1>
              <p className="text-amber-800/80 text-sm">
                Bienvenue sur CookieMaster. Choisissez ou rejoignez une ligue.
              </p>
            </div>
          </div>
          <button
            onClick={signOut}
            className="self-start sm:self-auto px-4 py-2 text-sm font-semibold text-amber-900 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-xl transition cursor-pointer"
          >
            Déconnexion
          </button>
        </header>

        {/* Bannière de notification */}
        {message && (
          <div
            className={`p-4 rounded-xl text-sm font-medium transition ${
              message.type === 'error'
                ? 'bg-red-50 text-red-700 border border-red-200'
                : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
            }`}
          >
            {message.text}
          </div>
        )}

        {/* Panneaux d'actions */}
        <div className="grid md:grid-cols-2 gap-6">
          
          {/* Créer une ligue */}
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-amber-100 space-y-4">
            <div className="flex items-center gap-2">
              <span className="text-2xl">✨</span>
              <h2 className="text-lg font-bold text-amber-950">Créer une ligue</h2>
            </div>
            <p className="text-xs text-amber-800/70">
              Organisez un tournoi de dégustation hebdomadaire au bureau.
            </p>
            <form onSubmit={createLeague} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold uppercase text-amber-900/80 mb-1">
                  Nom de la ligue
                </label>
                <input
                  type="text"
                  required
                  placeholder="ex: Pâtissiers du 3e étage"
                  value={newLeagueName}
                  onChange={(e) => setNewLeagueName(e.target.value)}
                  className="w-full px-4 py-2.5 bg-amber-50/30 border border-amber-200 rounded-xl text-amber-950 placeholder-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-amber-800 hover:bg-amber-900 text-white font-semibold py-2.5 rounded-xl shadow-sm transition disabled:opacity-50 cursor-pointer"
              >
                {loading ? 'Création...' : 'Créer la ligue'}
              </button>
            </form>
          </div>

          {/* Rejoindre une ligue */}
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-amber-100 space-y-4">
            <div className="flex items-center gap-2">
              <span className="text-2xl">🔑</span>
              <h2 className="text-lg font-bold text-amber-950">Rejoindre avec un code</h2>
            </div>
            <p className="text-xs text-amber-800/70">
              Entrez le code d'accès à 6 caractères partagé par un collègue.
            </p>
            <form onSubmit={joinLeague} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold uppercase text-amber-900/80 mb-1">
                  Code de la ligue
                </label>
                <input
                  type="text"
                  required
                  maxLength={6}
                  placeholder="ex: X7K9AB"
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value)}
                  className="w-full px-4 py-2.5 bg-amber-50/30 border border-amber-200 rounded-xl text-amber-950 uppercase placeholder-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-500 font-mono tracking-wider"
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-amber-900/10 hover:bg-amber-900/20 text-amber-950 font-semibold py-2.5 rounded-xl border border-amber-300 transition disabled:opacity-50 cursor-pointer"
              >
                {loading ? 'Recherche...' : 'Rejoindre la ligue'}
              </button>
            </form>
          </div>

        </div>

        {/* Liste des ligues */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-amber-100 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-amber-950">Vos ligues activement rejointes</h2>
            <span className="text-xs font-semibold px-2.5 py-1 bg-amber-100 text-amber-900 rounded-full">
              {leagues.length} ligue{leagues.length > 1 ? 's' : ''}
            </span>
          </div>

          {leagues.length === 0 ? (
            <div className="text-center py-8 bg-amber-50/40 rounded-xl border border-dashed border-amber-200">
              <span className="text-3xl block mb-1">🥣</span>
              <p className="text-sm font-medium text-amber-900">Vous ne faites partie d'aucune ligue.</p>
              <p className="text-xs text-amber-700/70 mt-0.5">Créez-en une ci-dessus ou rejoignez la ligue de votre équipe.</p>
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 gap-3">
              {leagues.map((league) => (
                <button
                  key={league.id}
                  onClick={() => onSelectLeague(league.id)}
                  className="group text-left p-4 rounded-xl border border-amber-100 bg-amber-50/20 hover:bg-amber-100/50 hover:border-amber-300 transition flex items-center justify-between cursor-pointer"
                >
                  <div>
                    <h3 className="font-bold text-amber-950 group-hover:text-amber-900 transition">
                      {league.name}
                    </h3>
                    <p className="text-xs text-amber-700/70 mt-0.5 font-mono">
                      Code : {league.code}
                    </p>
                  </div>
                  <span className="text-amber-800 text-sm font-semibold group-hover:translate-x-1 transition-transform">
                    Ouvrir →
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  )
}