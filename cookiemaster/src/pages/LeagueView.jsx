import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import logo from '../logo/logo.PNG'

const CRITERIA = [
  { id: 'taste', label: 'Goût' },
  { id: 'texture', label: 'Texture' },
  { id: 'appearance', label: 'Esthétique' },
  { id: 'baking', label: 'Cuisson' },
  { id: 'indulgence', label: 'Gourmandise' }
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
    taste: 0,
    texture: 0,
    appearance: 0,
    baking: 0,
    indulgence: 0
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

    setLoading(true)

    const { data: leagueData } = await supabase
      .from('leagues')
      .select('*')
      .eq('id', leagueId)
      .maybeSingle()

    if (leagueData) setLeague(leagueData)

    const { data: membersData } = await supabase
      .from('league_members')
      .select('user_id')
      .eq('league_id', leagueId)

    let enrichedMembers = []
    if (membersData && membersData.length > 0) {
      const userIds = membersData.map(m => m.user_id)
      const { data: profilesData } = await supabase
        .from('profiles')
        .select('id, username')
        .in('id', userIds)

      enrichedMembers = membersData.map(m => {
        const profile = profilesData?.find(p => p.id === m.user_id)
        return {
          user_id: m.user_id,
          profiles: profile || { username: 'Membre' }
        }
      })
    }
    setLeagueMembers(enrichedMembers)

    const { data: fullSchedData } = await supabase
      .from('league_schedule')
      .select('*')
      .eq('league_id', leagueId)
      .eq('year', currentYear)
      .order('week_number', { ascending: true })

    let currentMasterItem = null
    let currentSchedule = fullSchedData || []

    // AUTO-AJOUT : Si la ligue est active et qu'un membre n'a pas de tour assigné, on l'ajoute automatiquement à la fin
    if (leagueData?.status === 'active' && enrichedMembers.length > 0) {
      const assignedUserIds = new Set(currentSchedule.map(s => s.assigned_user_id))
      const unassignedMembers = enrichedMembers.filter(m => !assignedUserIds.has(m.user_id))

      if (unassignedMembers.length > 0) {
        const lastWeek = currentSchedule.length > 0 
          ? Math.max(...currentSchedule.map(s => s.week_number)) 
          : currentWeek - 1

        const newInserts = unassignedMembers.map((member, idx) => ({
          league_id: leagueId,
          week_number: lastWeek + 1 + idx,
          year: currentYear,
          assigned_user_id: member.user_id,
          turn_order: currentSchedule.length + idx + 1
        }))

        const { data: insertedData, error: insertErr } = await supabase
          .from('league_schedule')
          .insert(newInserts)
          .select()

        if (!insertErr && insertedData) {
          currentSchedule = [...currentSchedule, ...insertedData]
        }
      }
    }

    if (currentSchedule.length > 0) {
      const userIds = currentSchedule.map(s => s.assigned_user_id).filter(Boolean)
      let profilesData = []
      if (userIds.length > 0) {
        const { data: profs } = await supabase
          .from('profiles')
          .select('id, username')
          .in('id', userIds)
        profilesData = profs || []
      }

      const enrichedSchedule = currentSchedule.map(s => ({
        ...s,
        profiles: profilesData.find(p => p.id === s.assigned_user_id) || { username: 'Membre' }
      })).sort((a, b) => a.week_number - b.week_number)

      setFullSchedule(enrichedSchedule)
      currentMasterItem = enrichedSchedule.find(s => s.week_number === currentWeek)
      setBakeMaster(currentMasterItem || null)
    } else {
      setFullSchedule([])
      setBakeMaster(null)
    }

    const { data: ratingsData } = await supabase
      .from('ratings')
      .select('*')
      .eq('league_id', leagueId)
      .order('created_at', { ascending: false })

    if (ratingsData && ratingsData.length > 0) {
      const userIds = ratingsData.map(r => r.user_id || r.voter_id).filter(Boolean)
      let profilesData = []
      if (userIds.length > 0) {
        const { data: profs } = await supabase
          .from('profiles')
          .select('id, username')
          .in('id', userIds)
        profilesData = profs || []
      }

      const enrichedRatings = ratingsData.map(r => ({
        ...r,
        profiles: profilesData.find(p => p.id === (r.user_id || r.voter_id)) || { username: 'Membre' }
      }))

      setRatings(enrichedRatings)

      const existing = enrichedRatings.find(
        r => (r.user_id === user?.id || r.voter_id === user?.id) && 
             (r.week_number === selectedWeekToRate || (!r.week_number && selectedWeekToRate === currentWeek))
      )
      if (existing) {
        setScores({
          taste: existing.taste || 0,
          texture: existing.texture || 0,
          appearance: existing.appearance || 0,
          baking: existing.baking || 0,
          indulgence: existing.indulgence || 0
        })
        setComment(existing.comment || '')
      } else {
        setScores({ taste: 0, texture: 0, appearance: 0, baking: 0, indulgence: 0 })
        setComment('')
      }
    } else {
      setRatings([])
      setScores({ taste: 0, texture: 0, appearance: 0, baking: 0, indulgence: 0 })
      setComment('')
    }

    setLoading(false)
  }

  useEffect(() => {
    fetchData()

    const channel = supabase
      .channel(`room-${leagueId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'leagues', filter: `id=eq.${leagueId}` }, () => fetchData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'league_members', filter: `league_id=eq.${leagueId}` }, () => fetchData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'league_schedule', filter: `league_id=eq.${leagueId}` }, () => fetchData())
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [leagueId, currentWeek, user?.id, selectedWeekToRate])

  const handleStartLeague = async () => {
    setMessage(null)
    setSubmitting(true)

    try {
      if (leagueMembers.length > 0) {
        const scheduleInserts = leagueMembers.map((member, index) => ({
          league_id: leagueId,
          week_number: currentWeek + index,
          year: currentYear,
          assigned_user_id: member.user_id,
          turn_order: index + 1
        }))

        const { error: schedError } = await supabase
          .from('league_schedule')
          .insert(scheduleInserts)

        if (schedError) throw schedError
      }

      const { error: updateError } = await supabase
        .from('leagues')
        .update({ status: 'active' })
        .eq('id', leagueId)

      if (updateError) throw updateError

      await fetchData()
      setMessage({ type: 'success', text: `La ligue est lancée pour ${leagueMembers.length} semaines.` })

    } catch (err) {
      console.error(err)
      setMessage({ type: 'error', text: `Erreur lors du lancement : ${err.message}` })
    } finally {
      setSubmitting(false)
    }
  }

  const calculateAverage = (s) => {
    const sum = Number(s.taste) + Number(s.texture) + Number(s.appearance) + Number(s.baking) + Number(s.indulgence)
    return (sum / 5).toFixed(1)
  }

  const isSelfRating = () => {
    const targetSchedule = fullSchedule.find(s => s.week_number === selectedWeekToRate)
    if (!targetSchedule) return false
    return targetSchedule.assigned_user_id === user?.id
  }

  const handleSubmitRating = async (e) => {
    e.preventDefault()
    if (!user?.id || !leagueId) return

    if (selectedWeekToRate > currentWeek) {
      setMessage({ type: 'error', text: "Impossible de noter une semaine future qui n'a pas encore démarré." })
      return
    }

    if (isSelfRating()) {
      setMessage({ type: 'error', text: "Vous ne pouvez pas évaluer votre propre réalisation." })
      return
    }

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
      setSubmitting(false)
    } else {
      if (onBack) onBack()
    }
  }

  const handleCopyCode = () => {
    if (!league?.code) return
    navigator.clipboard.writeText(league.code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2500)
  }

  const filteredRatings = ratings.filter((r) => {
    const rWeek = r.week_number || currentWeek
    if (rWeek === currentWeek) return false
    if (selectedWeekFilter !== 'all' && rWeek !== Number(selectedWeekFilter)) return false
    return true
  })

  const rankingMap = {}
  filteredRatings.forEach(r => {
    const weekNum = r.week_number || currentWeek
    const scheduleItem = fullSchedule.find(s => s.week_number === weekNum)
    const bakerId = scheduleItem?.assigned_user_id || r.user_id
    const bakerName = scheduleItem?.profiles?.username || r.profiles?.username || 'Membre'

    if (!rankingMap[bakerId]) {
      rankingMap[bakerId] = {
        username: bakerName,
        totalScore: 0,
        count: 0,
        taste: 0,
        texture: 0,
        appearance: 0,
        baking: 0,
        indulgence: 0
      }
    }

    rankingMap[bakerId].totalScore += Number(r.score || 0)
    rankingMap[bakerId].taste += Number(r.taste || 0)
    rankingMap[bakerId].texture += Number(r.texture || 0)
    rankingMap[bakerId].appearance += Number(r.appearance || 0)
    rankingMap[bakerId].baking += Number(r.baking || 0)
    rankingMap[bakerId].indulgence += Number(r.indulgence || 0)
    rankingMap[bakerId].count += 1
  })

  const leaderboard = Object.values(rankingMap).map(entry => ({
    username: entry.username,
    avgGlobal: (entry.totalScore / entry.count).toFixed(1),
    taste: (entry.taste / entry.count).toFixed(1),
    texture: (entry.texture / entry.count).toFixed(1),
    appearance: (entry.appearance / entry.count).toFixed(1),
    baking: (entry.baking / entry.count).toFixed(1),
    indulgence: (entry.indulgence / entry.count).toFixed(1),
  })).sort((a, b) => b.avgGlobal - a.avgGlobal)

  const leagueGlobalAverage = filteredRatings.length > 0
    ? (filteredRatings.reduce((acc, r) => acc + Number(r.score || 0), 0) / filteredRatings.length).toFixed(1)
    : null

  if (loading) {
    return (
      <div className="min-h-screen bg-amber-50/50 flex items-center justify-center p-4">
        <div className="text-amber-800 font-medium animate-pulse">Chargement de la ligue...</div>
      </div>
    )
  }

  if (!league) {
    return (
      <div className="min-h-screen bg-amber-50/50 p-6 flex flex-col items-center justify-center text-center">
        <p className="text-stone-600 mb-4">Ligue introuvable.</p>
        <button onClick={onBack} className="px-4 py-2 bg-amber-600 text-white text-sm rounded-lg hover:bg-amber-700 transition shadow-sm">
          Retour au tableau de bord
        </button>
      </div>
    )
  }

  if (league.status === 'recruiting') {
    const isCreator = user && league.created_by === user.id
    return (
      <div className="min-h-screen bg-gradient-to-br from-amber-50 via-orange-50/30 to-stone-100 p-4 sm:p-6 flex items-center justify-center text-stone-800">
        <div className="max-w-md w-full bg-white/90 backdrop-blur p-6 rounded-2xl border border-amber-200/60 shadow-xl space-y-6">
          <div className="flex items-center gap-3">
            <img 
              src={logo} 
              alt="Logo" 
              className="w-12 h-12 object-contain rounded-xl shadow-xs border border-amber-200" 
            />
            <div>
              <button onClick={onBack} className="text-xs font-bold uppercase tracking-wider text-amber-700 hover:text-amber-900 transition mb-1 inline-block">
                ← Retour
              </button>
              <h1 className="text-xl font-black text-stone-900 tracking-tight">{league.name}</h1>
            </div>
          </div>

          <div className="bg-amber-50/80 p-4 rounded-xl border border-amber-200 text-center space-y-2">
            <span className="text-[11px] uppercase font-bold tracking-wider text-amber-800">Code d'invitation secret</span>
            <div className="text-xl font-mono font-black text-amber-950 bg-white py-2.5 rounded-lg border border-amber-200 shadow-inner tracking-widest">
              {league.code}
            </div>
            <button onClick={handleCopyCode} className="text-xs font-semibold text-amber-700 hover:text-amber-900 underline">
              {copied ? '✨ Code copié dans le presse-papier !' : 'Copier le code'}
            </button>
          </div>

          <div className="space-y-2">
            <h2 className="text-xs font-bold uppercase tracking-wider text-stone-600">
              Pâtissiers inscrits ({leagueMembers.length})
            </h2>
            <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
              {leagueMembers.map((member) => (
                <div key={member.user_id} className="bg-amber-50/40 px-3.5 py-2.5 rounded-xl text-xs text-stone-800 flex items-center justify-between border border-amber-100 font-medium">
                  <span>{member.profiles?.username || 'Membre'}</span>
                  {member.user_id === league.created_by && (
                    <span className="text-[10px] font-bold bg-amber-200 text-amber-900 px-2 py-0.5 rounded-full shadow-xs">Chef Opérateur</span>
                  )}
                </div>
              ))}
            </div>
          </div>

          {message && (
            <div className={`p-3.5 rounded-xl text-xs font-medium ${message.type === 'error' ? 'bg-red-100 text-red-800 border border-red-200' : 'bg-emerald-100 text-emerald-900 border border-emerald-200'}`}>
              {message.text}
            </div>
          )}

          {isCreator ? (
            <button
              onClick={handleStartLeague}
              disabled={submitting}
              className="w-full bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-700 hover:to-orange-700 text-white text-xs font-bold uppercase tracking-wider py-3.5 rounded-xl transition shadow-md disabled:opacity-50"
            >
              {submitting ? 'Lancement en cours...' : `Lancer la saison (${leagueMembers.length} pâtissiers)`}
            </button>
          ) : (
            <div className="text-center p-3.5 bg-amber-50 text-xs font-medium text-amber-900/80 rounded-xl border border-amber-200/50">
              En attente du chef de ligue pour lancer le grand départ.
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50/70 via-orange-50/20 to-stone-100 p-4 sm:p-6 text-stone-800 font-sans">
      <div className="max-w-5xl mx-auto space-y-6">
        
        <header className="bg-white/90 backdrop-blur p-6 rounded-2xl border border-amber-200/60 shadow-md flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <img 
              src={logo} 
              alt="Logo" 
              className="w-12 h-12 object-contain rounded-xl shadow-xs border border-amber-200 shrink-0" 
            />
            <div>
              <button onClick={onBack} className="text-xs font-bold uppercase tracking-wider text-amber-700 hover:text-amber-900 transition mb-1 inline-flex items-center gap-1">
                ← Retour au tableau de bord
              </button>
              <h1 className="text-2xl sm:text-3xl font-black text-stone-900 tracking-tight">
                {league.name}
              </h1>
            </div>
          </div>

          {leagueGlobalAverage && (
            <div className="bg-gradient-to-br from-amber-600 to-orange-600 text-white p-3.5 rounded-xl text-center min-w-[130px] shadow-sm">
              <div className="text-2xl font-black">{leagueGlobalAverage} <span className="text-sm font-normal text-amber-200">/ 5</span></div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-amber-100">Moyenne de la Ligue</div>
            </div>
          )}
        </header>

        {/* Pâtissier de la semaine */}
        <div className="bg-gradient-to-r from-amber-500 to-orange-500 text-white p-5 rounded-2xl shadow-md flex items-center gap-4">
          <div className="text-3xl bg-white/20 p-3 rounded-xl backdrop-blur-sm">👑</div>
          <div className="space-y-0.5">
            <div className="text-xs font-bold uppercase tracking-wider text-amber-100">Pâtissier à l'honneur cette semaine</div>
            <div className="text-base sm:text-lg font-bold">
              Semaine #{currentWeek} — C'est au tour de{' '}
              <span className="underline decoration-amber-200 decoration-2 underline-offset-4">
                {bakeMaster?.profiles?.username || 'un membre'}
              </span> !
            </div>
          </div>
        </div>

        {message && (
          <div className={`p-4 rounded-xl text-xs font-medium shadow-sm ${message.type === 'error' ? 'bg-red-100 text-red-800 border border-red-200' : 'bg-emerald-100 text-emerald-900 border border-emerald-200'}`}>
            {message.text}
          </div>
        )}

        <div className="grid md:grid-cols-12 gap-6">
          
          <div className="md:col-span-5 space-y-6">
            <div className="bg-white/90 backdrop-blur p-6 rounded-2xl border border-amber-200/60 shadow-md space-y-5">
              <div className="flex items-center justify-between">
                <h2 className="text-xs font-black uppercase tracking-wider text-stone-900">
                  ✨ Formulaire d'évaluation
                </h2>
                <select
                  value={selectedWeekToRate}
                  onChange={(e) => setSelectedWeekToRate(Number(e.target.value))}
                  className="bg-amber-50 border border-amber-200 text-xs font-bold text-amber-900 rounded-lg px-3 py-1.5 outline-none shadow-inner cursor-pointer"
                >
                  {fullSchedule
                    .filter(s => s.week_number <= currentWeek) // Empêche de sélectionner une semaine future
                    .map(s => (
                      <option key={s.week_number} value={s.week_number}>
                        Semaine #{s.week_number} {s.week_number === currentWeek ? '(En cours)' : ''}
                      </option>
                    ))
                  }
                </select>
              </div>

              {selectedWeekToRate > currentWeek ? (
                <div className="p-4 bg-amber-50/50 border border-amber-200/60 rounded-xl text-center space-y-1">
                  <p className="text-xs font-bold text-amber-900">
                    🕒 Semaine future non ouverte
                  </p>
                  <p className="text-xs text-stone-600">
                    Il n'est pas possible de voter en avance pour une semaine qui n'a pas encore démarré.
                  </p>
                </div>
              ) : isSelfRating() ? (
                <div className="p-4 bg-amber-50/50 border border-amber-200/60 rounded-xl text-center space-y-1">
                  <p className="text-xs font-bold text-amber-900">
                    🛡️ Auto-évaluation non autorisée
                  </p>
                  <p className="text-xs text-stone-600">
                    Vous étiez le pâtissier assigné pour la semaine #{selectedWeekToRate}. Seuls vos pairs peuvent noter votre création.
                  </p>
                </div>
              ) : (
                <form onSubmit={handleSubmitRating} className="space-y-4">
                  {CRITERIA.map((criterion) => (
                    <div key={criterion.id} className="space-y-1.5 bg-amber-50/40 p-3.5 rounded-xl border border-amber-100 shadow-2xs">
                      <div className="flex items-center justify-between text-xs font-bold text-stone-900">
                        <span>{criterion.label}</span>
                        <span className="font-mono text-amber-800 bg-amber-100/80 px-2 py-0.5 rounded text-[11px]">{scores[criterion.id]} / 5</span>
                      </div>
                      <div className="flex items-center justify-between pt-1">
                        {[1, 2, 3, 4, 5].map((star) => (
                          <button
                            key={star}
                            type="button"
                            onClick={() => setScores({ ...scores, [criterion.id]: star })}
                            className={`text-xl transition-transform hover:scale-125 ${star <= scores[criterion.id] ? 'opacity-100 drop-shadow' : 'opacity-25 grayscale'}`}
                          >
                            ⭐
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}

                  <div className="bg-gradient-to-r from-stone-900 to-stone-800 text-white p-3.5 rounded-xl text-center flex items-center justify-between px-4 shadow-sm">
                    <span className="text-xs font-bold uppercase tracking-wider text-amber-400">Note Finale attribuée</span>
                    <span className="text-xl font-black">{calculateAverage(scores)} <span className="text-xs text-stone-400 font-normal">/ 5</span></span>
                  </div>

                  <textarea
                    rows={3}
                    placeholder="Laissez un commentaire gourmand..."
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-amber-50/40 border border-amber-200/60 rounded-xl text-stone-900 text-xs focus:outline-none focus:ring-2 focus:ring-amber-500 placeholder:text-stone-400 shadow-inner"
                  />

                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-700 hover:to-orange-700 text-white text-xs font-bold uppercase tracking-wider py-3.5 rounded-xl transition shadow-md"
                  >
                    {submitting ? 'Validation...' : "Valider mon évaluation 🎯"}
                  </button>
                </form>
              )}
            </div>

            {/* Calendrier */}
            <div className="bg-white/90 backdrop-blur p-6 rounded-2xl border border-amber-200/60 shadow-md space-y-3">
              <h3 className="text-xs font-black uppercase tracking-wider text-stone-900">
                📅 Planning de la saison ({fullSchedule.length} sem.)
              </h3>
              <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                {fullSchedule.length === 0 ? (
                  <p className="text-xs text-stone-400 italic text-center py-2">Aucun calendrier généré.</p>
                ) : (
                  fullSchedule.map((sched) => {
                    const isCurrent = sched.week_number === currentWeek
                    return (
                      <div key={sched.id} className={`px-3.5 py-2.5 rounded-xl border text-xs flex items-center justify-between transition ${isCurrent ? 'bg-amber-100/90 border-amber-400 font-bold text-amber-950 shadow-xs' : 'bg-amber-50/30 border-amber-100 text-stone-700'}`}>
                        <span>Semaine #{sched.week_number} {isCurrent && '🔥 (En cours)'}</span>
                        <span className="font-semibold">{sched.profiles?.username || 'Membre'}</span>
                      </div>
                    )
                  })
                )}
              </div>
            </div>
          </div>

          <div className="md:col-span-7 space-y-6">
            
            {/* Classement */}
            <div className="bg-white/90 backdrop-blur p-6 rounded-2xl border border-amber-200/60 shadow-md space-y-4">
              <h2 className="text-xs font-black uppercase tracking-wider text-stone-900">
                🏆 Classement Général des Pâtissiers
              </h2>
              {leaderboard.length === 0 ? (
                <p className="text-xs text-stone-400 italic py-6 text-center">Aucune note validée pour le moment. Le podium vous attend !</p>
              ) : (
                <div className="space-y-3.5">
                  {leaderboard.map((entry, idx) => (
                    <div key={entry.username} className="p-4 border border-amber-200/60 rounded-xl bg-gradient-to-r from-amber-50/40 to-orange-50/20 space-y-3 shadow-2xs">
                      <div className="flex justify-between items-center">
                        <div className="flex items-center gap-2.5 text-stone-900 text-xs font-bold">
                          <span className={`w-6 h-6 rounded-full flex items-center justify-center font-mono text-xs shadow-xs ${idx === 0 ? 'bg-amber-400 text-amber-950 font-black' : idx === 1 ? 'bg-stone-300 text-stone-900 font-bold' : idx === 2 ? 'bg-amber-700/40 text-amber-950 font-bold' : 'bg-stone-100 text-stone-700'}`}>
                            {idx + 1}
                          </span>
                          <span className="text-sm">{entry.username}</span>
                        </div>
                        <div className="bg-gradient-to-r from-amber-600 to-orange-600 text-white px-2.5 py-1 rounded-lg text-xs font-black shadow-2xs">
                          {entry.avgGlobal} / 5
                        </div>
                      </div>

                      {/* Détail par critères */}
                      <div className="grid grid-cols-5 gap-1.5 pt-2 border-t border-amber-200/50 text-center">
                        {CRITERIA.map(crit => (
                          <div key={crit.id} className="bg-white/80 p-1.5 rounded-lg border border-amber-100 shadow-2xs">
                            <div className="text-[10px] font-bold text-stone-500 uppercase">{crit.label}</div>
                            <div className="text-[11px] font-mono font-black text-amber-900 mt-0.5">
                              {entry[crit.id]}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Historique */}
            <div className="bg-white/90 backdrop-blur p-6 rounded-2xl border border-amber-200/60 shadow-md space-y-4">
              <h2 className="text-xs font-black uppercase tracking-wider text-stone-900">
                📜 Historique des dégustations passées
              </h2>
              {filteredRatings.length === 0 ? (
                <p className="text-xs text-stone-400 italic py-6 text-center">Aucun avis publié pour les semaines précédentes.</p>
              ) : (
                <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
                  {filteredRatings.map((item) => (
                    <div key={item.id} className="p-4 border border-amber-100 rounded-xl bg-amber-50/20 space-y-2 shadow-2xs">
                      <div className="flex justify-between items-center text-xs text-stone-800">
                        <span className="font-bold">
                          {item.profiles?.username} <span className="font-normal text-amber-800/80">(Semaine #{item.week_number || currentWeek})</span>
                        </span>
                        <span className="bg-amber-100 text-amber-950 px-2.5 py-0.5 rounded-md border border-amber-200 font-black">
                          {item.score} / 5
                        </span>
                      </div>
                      {item.comment && <p className="text-xs text-stone-600 italic bg-white/60 p-2.5 rounded-lg border border-amber-100/50">"{item.comment}"</p>}
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>

        </div>
      </div>
    </div>
  )
}