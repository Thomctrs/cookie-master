import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'

const CRITERIA = [
  { id: 'taste', label: 'Goût', icon: '😋' },
  { id: 'texture', label: 'Texture', icon: '🤌' },
  { id: 'appearance', label: 'Apparence', icon: '👀' },
  { id: 'baking', label: 'Cuisson', icon: '🔥' },
  { id: 'indulgence', label: 'Gourmandise & Originalité', icon: '✨' }
]

export default function LeagueView({ leagueId, onBack }) {
  const { user } = useAuth()
  const [league, setLeague] = useState(null)
  const [ratings, setRatings] = useState([])
  
  const currentWeek = getWeekNumber(new Date())
  const currentYear = new Date().getFullYear()
  
  const [selectedWeekToRate, setSelectedWeekToRate] = useState(currentWeek)
  const [selectedWeekFilter, setSelectedWeekFilter] = useState('all')
  const [bakeMaster, setBakeMaster] = useState(null)
  const [fullSchedule, setFullSchedule] = useState([])
  const [leagueMembers, setLeagueMembers] = useState([])

  const [scores, setScores] = useState({
    taste: 5,
    texture: 5,
    appearance: 5,
    baking: 5,
    indulgence: 5
  })
  const [comment, setComment] = useState('')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState(null)
  const [copied, setCopied] = useState(false)

  function getWeekNumber(d) {
    const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
    const dayNum = date.getUTCDay() || 7
    date.setUTCDate(date.getUTCDate() + 4 - dayNum)
    const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1))
    return Math.ceil(((date - yearStart) / 86400000 + 1) / 7)
  }

  const fetchData = async () => {
    if (!leagueId) return

    // 1. Informations sur la ligue
    const { data: leagueData, error: leagueErr } = await supabase
      .from('leagues')
      .select('*')
      .eq('id', leagueId)
      .maybeSingle()

    if (!leagueErr) {
      setLeague(leagueData)
    }

    // 2. Récupération des membres de la ligue
    const { data: membersData, error: membersErr } = await supabase
      .from('league_members')
      .select(`
        user_id,
        profiles (
          id,
          username
        )
      `)
      .eq('league_id', leagueId)

    if (!membersErr) {
      setLeagueMembers(membersData || [])
    }

    // 3. Récupération du Pâtissier de la semaine en cours
    const { data: scheduleData, error: scheduleErr } = await supabase
      .from('league_schedule')
      .select(`
        week_number,
        year,
        assigned_user_id,
        profiles:assigned_user_id (
          username
        )
      `)
      .eq('league_id', leagueId)
      .eq('week_number', currentWeek)
      .eq('year', currentYear)
      .maybeSingle()

    if (!scheduleErr) {
      setBakeMaster(scheduleData)
    }

    // 4. Récupération du planning complet
    const { data: fullSchedData, error: fullSchedErr } = await supabase
      .from('league_schedule')
      .select(`
        id,
        week_number,
        year,
        profiles:assigned_user_id (
          username
        )
      `)
      .eq('league_id', leagueId)
      .eq('year', currentYear)
      .order('week_number', { ascending: true })

    if (!fullSchedErr) {
      setFullSchedule(fullSchedData || [])
    }

    // 5. Récupération des notes
    const { data: ratingsData, error: ratingsErr } = await supabase
      .from('ratings')
      .select(`
        id,
        score,
        taste,
        texture,
        appearance,
        baking,
        indulgence,
        comment,
        created_at,
        user_id,
        voter_id,
        week_number,
        profiles (
          username
        )
      `)
      .eq('league_id', leagueId)
      .order('created_at', { ascending: false })

    if (!ratingsErr) {
      const formattedRatings = ratingsData || []
      setRatings(formattedRatings)
    }

    setLoading(false)
  }

  // Chargement initial + Mise en place des abonnements Realtime
  useEffect(() => {
    fetchData()

    // Écoute en temps réel des modifications sur cette ligue et ses membres
    const channel = supabase
      .channel(`room-${leagueId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'leagues', filter: `id=eq.${leagueId}` },
        () => { fetchData() }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'league_members', filter: `league_id=eq.${leagueId}` },
        () => { fetchData() }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'league_schedule', filter: `league_id=eq.${leagueId}` },
        () => { fetchData() }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [leagueId, currentWeek])

  // Lancer la partie (Créateur uniquement) + Génération automatique du planning
  const handleStartLeague = async () => {
    // 1. Générer le planning de roulement des membres si pas encore fait
    if (leagueMembers.length > 0) {
      const scheduleInserts = leagueMembers.map((member, index) => {
        // Assigner une semaine par membre à partir de la semaine courante
        return {
          league_id: leagueId,
          week_number: currentWeek + index,
          year: currentYear,
          assigned_user_id: member.user_id
        }
      })

      await supabase.from('league_schedule').insert(scheduleInserts)
    }

    // 2. Changer le statut de la ligue à 'active'
    const { error } = await supabase
      .from('leagues')
      .update({ status: 'active' })
      .eq('id', leagueId)

    if (error) {
      setMessage({ type: 'error', text: "Erreur lors du lancement de la ligue." })
    } else {
      setMessage({ type: 'success', text: "La ligue est lancée ! 🍪" })
    }
  }

  const calculateAverage = (s) => {
    const sum = Number(s.taste) + Number(s.texture) + Number(s.appearance) + Number(s.baking) + Number(s.indulgence)
    return (sum / 5).toFixed(1)
  }

  const handleSubmitRating = async (e) => {
    e.preventDefault()
    if (!user?.id || !leagueId) return

    setSubmitting(true)
    setMessage(null)

    const globalScore = Number(calculateAverage(scores))
    const existingRating = ratings.find(
      (r) => 
        (r.user_id === user.id || r.voter_id === user.id) && 
        (r.week_number === selectedWeekToRate || (!r.week_number && selectedWeekToRate === currentWeek))
    )

    const payload = {
      league_id: leagueId,
      user_id: user.id,
      voter_id: user.id,
      score: globalScore,
      taste: Number(scores.taste),
      texture: Number(scores.texture),
      appearance: Number(scores.appearance),
      baking: Number(scores.baking),
      indulgence: Number(scores.indulgence),
      comment: comment.trim() || null,
      week_number: Number(selectedWeekToRate)
    }

    let error = null
    if (existingRating) {
      const res = await supabase.from('ratings').update(payload).eq('id', existingRating.id)
      error = res.error
    } else {
      const res = await supabase.from('ratings').insert([payload])
      error = res.error
    }

    if (error) {
      setMessage({ type: 'error', text: `Erreur : ${error.message}` })
    } else {
      setMessage({ type: 'success', text: `Évaluation de la semaine #${selectedWeekToRate} enregistrée ! 🍪` })
      fetchData()
    }
    setSubmitting(false)
  }

  const handleCopyCode = () => {
    if (!league?.code) return
    navigator.clipboard.writeText(league.code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2500)
  }

  const availableWeeks = [...new Set(ratings.map((r) => r.week_number || currentWeek))].sort((a, b) => b - a)
  if (!availableWeeks.includes(currentWeek)) availableWeeks.unshift(currentWeek)

  const filteredRatings = selectedWeekFilter === 'all' 
    ? ratings 
    : ratings.filter((r) => (r.week_number || currentWeek) === Number(selectedWeekFilter))

  const getCriteriaAverages = (items) => {
    if (items.length === 0) return null
    const totals = CRITERIA.reduce((acc, c) => ({ ...acc, [c.id]: 0 }), {})
    items.forEach((r) => {
      CRITERIA.forEach((c) => {
        let val = r[c.id] ?? r.score ?? 5
        totals[c.id] += Number(val)
      })
    })
    const averages = {}
    CRITERIA.forEach((c) => { averages[c.id] = (totals[c.id] / items.length).toFixed(1) })
    return averages
  }

  const criteriaAverages = getCriteriaAverages(filteredRatings)
  const leagueGlobalAverage = filteredRatings.length > 0
    ? (filteredRatings.reduce((acc, r) => acc + Number(r.score || 5), 0) / filteredRatings.length).toFixed(1)
    : null

  if (loading) {
    return (
      <div className="min-h-screen bg-amber-50/50 flex items-center justify-center p-4">
        <div className="text-amber-900 font-semibold flex items-center gap-2">
          <span className="animate-spin text-2xl">🍪</span> Chargement...
        </div>
      </div>
    )
  }

  if (!league) {
    return (
      <div className="min-h-screen bg-amber-50/50 p-6 flex flex-col items-center justify-center text-center">
        <p className="text-red-600 font-semibold mb-4">Ligue introuvable ou accès non autorisé.</p>
        <button onClick={onBack} className="px-4 py-2 bg-amber-800 text-white rounded-xl font-semibold cursor-pointer">
          ← Retour au Hub
        </button>
      </div>
    )
  }

  // ==========================================
  // LOBBY DE RECRUTEMENT
  // ==========================================
  if (league.status === 'recruiting') {
    const isCreator = user && league.created_by === user.id
    return (
      <div className="min-h-screen bg-amber-50/50 p-4 sm:p-6 flex items-center justify-center">
        <div className="max-w-md w-full bg-white p-6 sm:p-8 rounded-2xl shadow-sm border border-amber-100 space-y-6">
          <div>
            <button onClick={onBack} className="text-xs font-bold text-amber-800 hover:text-amber-950 transition flex items-center gap-1 mb-3 cursor-pointer">
              ← Retour au Hub
            </button>
            <div className="text-center space-y-2">
              <span className="text-4xl">⏳</span>
              <h1 className="text-2xl font-extrabold text-amber-950">{league.name}</h1>
              <p className="text-xs text-amber-800/80">Ligue en attente de participants...</p>
            </div>
          </div>

          <div className="bg-amber-50/60 p-4 rounded-xl border border-amber-200 text-center space-y-2">
            <span className="text-xs font-bold text-amber-900 uppercase">Code d'invitation à partager</span>
            <div className="text-xl font-mono font-black text-amber-950 bg-white py-2 rounded-lg border border-amber-200">
              {league.code}
            </div>
            <button onClick={handleCopyCode} className="text-xs font-bold text-amber-800 underline hover:text-amber-950 cursor-pointer">
              {copied ? 'Code copié !' : 'Copier le code'}
            </button>
          </div>

          <div className="space-y-2">
            <h2 className="text-sm font-bold text-amber-950 flex items-center justify-between">
              <span>Membres rejoints en direct</span>
              <span className="bg-amber-100 text-amber-900 text-xs px-2 py-0.5 rounded-full font-bold">
                {leagueMembers.length}
              </span>
            </h2>
            <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
              {leagueMembers.map((member) => (
                <div key={member.user_id} className="bg-white px-3 py-2 rounded-xl border border-amber-100 text-xs font-bold text-amber-950 flex items-center justify-between">
                  <span>{member.profiles?.username || 'Membre'}</span>
                  {member.user_id === league.created_by && (
                    <span className="text-[10px] bg-amber-200 text-amber-900 px-1.5 py-0.5 rounded">Organisateur</span>
                  )}
                </div>
              ))}
            </div>
          </div>

          {message && (
            <div className={`p-3 rounded-xl text-xs font-medium ${message.type === 'error' ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-800'}`}>
              {message.text}
            </div>
          )}

          {isCreator ? (
            <button
              onClick={handleStartLeague}
              className="w-full bg-amber-800 hover:bg-amber-900 text-white font-bold py-3 rounded-xl shadow-sm transition cursor-pointer text-sm"
            >
              🚀 Lancer la ligue et générer le planning
            </button>
          ) : (
            <div className="text-center p-3 bg-amber-100/50 rounded-xl text-xs font-medium text-amber-900">
              En attente que l'organisateur lance la ligue... La page se mettra à jour toute seule ! 🍪
            </div>
          )}
        </div>
      </div>
    )
  }

  // ==========================================
  // VUE PRINCIPALE (LIGUE ACTIVE)
  // ==========================================
  return (
    <div className="min-h-screen bg-amber-50/50 p-4 sm:p-6">
      <div className="max-w-5xl mx-auto space-y-6">
        
        <header className="bg-white p-6 rounded-2xl shadow-sm border border-amber-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <button onClick={onBack} className="text-xs font-bold text-amber-800 hover:text-amber-950 transition flex items-center gap-1 mb-2 cursor-pointer">
              ← Retour au Hub
            </button>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-amber-950 flex items-center gap-2">
              <span>🏆</span> {league.name}
            </h1>
          </div>

          {leagueGlobalAverage && (
            <div className="bg-amber-800 text-white p-3 rounded-xl text-center min-w-[100px]">
              <div className="text-2xl font-black">{leagueGlobalAverage} ★</div>
              <div className="text-[10px] text-amber-200 font-medium uppercase">Moyenne Globale</div>
            </div>
          )}
        </header>

        {/* Pâtissier de la semaine */}
        <div className="bg-gradient-to-r from-amber-100 to-amber-200/60 p-4 rounded-2xl border border-amber-300 shadow-sm flex items-center gap-4">
          <span className="text-3xl sm:text-4xl">👨‍🍳</span>
          <div className="space-y-0.5">
            <div className="text-[10px] uppercase font-bold tracking-wider text-amber-800">Fournée en cours</div>
            <div className="text-sm sm:text-base font-extrabold text-amber-950">
              Cette semaine (#{currentWeek}), c'est{' '}
              <span className="underline decoration-amber-600 decoration-2">
                {bakeMaster?.profiles?.username || 'un membre'}
              </span>{' '}
              qui régale avec ses cookies ! 🍪
            </div>
          </div>
        </div>

        {message && (
          <div className={`p-4 rounded-xl text-sm font-medium ${message.type === 'error' ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-800'}`}>
            {message.text}
          </div>
        )}

        <div className="grid md:grid-cols-12 gap-6">
          
          <div className="md:col-span-5 space-y-6">
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-amber-100 space-y-5">
              <h2 className="text-lg font-bold text-amber-950 flex items-center gap-2">
                <span>📝</span> Noter une fournée
              </h2>

              <form onSubmit={handleSubmitRating} className="space-y-4">
                {CRITERIA.map((criterion) => (
                  <div key={criterion.id} className="space-y-1.5 bg-amber-50/40 p-3 rounded-xl border border-amber-100">
                    <div className="flex items-center justify-between text-xs font-bold text-amber-950">
                      <span>{criterion.icon} {criterion.label}</span>
                      <span className="text-amber-800 font-mono">{scores[criterion.id]} / 5</span>
                    </div>
                    <div className="flex items-center justify-between pt-1">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <button
                          key={star}
                          type="button"
                          onClick={() => setScores({ ...scores, [criterion.id]: star })}
                          className={`text-xl transition-transform hover:scale-125 cursor-pointer ${star <= scores[criterion.id] ? 'opacity-100' : 'opacity-25 grayscale'}`}
                        >
                          ⭐
                        </button>
                      ))}
                    </div>
                  </div>
                ))}

                <div className="bg-amber-100/60 p-3 rounded-xl text-center flex items-center justify-between px-4 border border-amber-200">
                  <span className="text-xs font-bold text-amber-900">Note Globale :</span>
                  <span className="text-xl font-black text-amber-950">{calculateAverage(scores)} / 5</span>
                </div>

                <textarea
                  rows={3}
                  placeholder="Commentaires..."
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  className="w-full px-3 py-2 bg-amber-50/30 border border-amber-200 rounded-xl text-amber-950 text-sm focus:outline-none"
                />

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full bg-amber-800 hover:bg-amber-900 text-white font-bold py-3 rounded-xl shadow-sm transition cursor-pointer text-sm"
                >
                  {submitting ? 'Enregistrement...' : "Valider l'évaluation"}
                </button>
              </form>
            </div>

            {/* Planning complet */}
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-amber-100 space-y-3">
              <h3 className="text-base font-bold text-amber-950 flex items-center gap-2">
                <span>📅</span> Planning complet
              </h3>
              <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                {fullSchedule.map((sched) => {
                  const isCurrent = sched.week_number === currentWeek
                  return (
                    <div key={sched.id} className={`px-3 py-2 rounded-xl border text-xs flex items-center justify-between font-semibold ${isCurrent ? 'bg-amber-100 border-amber-300 text-amber-950 font-extrabold' : 'bg-amber-50/40 border-amber-100 text-amber-900'}`}>
                      <span>Semaine #{sched.week_number} {isCurrent && '(Actuelle)'}</span>
                      <span>{sched.profiles?.username || 'Non assigné'}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>

          <div className="md:col-span-7 bg-white p-6 rounded-2xl shadow-sm border border-amber-100 space-y-4 h-fit">
            <h2 className="text-lg font-bold text-amber-950 flex items-center gap-2">
              <span>💬</span> Historique des avis
            </h2>
            {filteredRatings.length === 0 ? (
              <p className="text-xs text-amber-800/70 italic py-6 text-center">Aucune évaluation pour le moment.</p>
            ) : (
              <div className="space-y-4">
                {filteredRatings.map((item) => (
                  <div key={item.id} className="p-4 rounded-xl border border-amber-100 bg-white space-y-2">
                    <div className="flex justify-between items-center text-xs font-bold text-amber-950">
                      <span>{item.profiles?.username} (Semaine #{item.week_number || currentWeek})</span>
                      <span className="bg-amber-100 px-2 py-0.5 rounded">{item.score} ★</span>
                    </div>
                    {item.comment && <p className="text-xs text-amber-900 italic">"{item.comment}"</p>}
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  )
}