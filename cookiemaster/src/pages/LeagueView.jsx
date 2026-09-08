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
          profiles: profile || { username: 'Collègue mystère' }
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
        profiles: profilesData.find(p => p.id === s.assigned_user_id) || { username: 'Collègue' }
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
        profiles: profilesData.find(p => p.id === (r.user_id || r.voter_id)) || { username: 'Collègue' }
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
      setMessage({ type: 'success', text: `C'est parti ! La ligue est lancée pour ${leagueMembers.length} semaines de régals.` })

    } catch (err) {
      console.error(err)
      setMessage({ type: 'error', text: `Oups, impossible de lancer la machine : ${err.message}` })
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
      setMessage({ type: 'error', text: "On se calme ! Tu ne peux pas noter une semaine du futur." })
      return
    }

    if (isSelfRating()) {
      setMessage({ type: 'error', text: "Auto-évaluation interdite. Laisse tes collègues juger !" })
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
    const bakerName = scheduleItem?.profiles?.username || r.profiles?.username || 'Collègue'

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
      <div className="min-h-screen bg-[#FDF8F2] flex items-center justify-center p-4">
        <div className="text-[#5C3A21] font-medium animate-pulse">On sort les pépites de chocolat du placard...</div>
      </div>
    )
  }

  if (!league) {
    return (
      <div className="min-h-screen bg-[#FDF8F2] p-6 flex flex-col items-center justify-center text-center">
        <p className="text-[#5C3A21] mb-4">Oups, impossible de mettre la main sur cette ligue.</p>
        <button onClick={onBack} className="px-4 py-2 bg-[#5C3A21] text-[#FDF8F2] text-sm rounded-xl hover:bg-[#3D2513] transition shadow-sm font-medium">
          Retour au QG
        </button>
      </div>
    )
  }

  if (league.status === 'recruiting') {
    const isCreator = user && league.created_by === user.id
    return (
      <div className="min-h-screen bg-[#FDF8F2] bg-[radial-gradient(#E8D8C4_1px,transparent_1px)] [background-size:16px_16px] p-4 sm:p-6 flex items-center justify-center text-[#3D2513]">
        <div className="max-w-md w-full bg-white/95 backdrop-blur p-6 rounded-3xl border border-[#D9BFA8] shadow-xl space-y-6">
          <div className="flex items-center gap-3">
            <img 
              src={logo} 
              alt="Logo" 
              className="w-12 h-12 object-contain rounded-2xl shadow-xs border border-[#D9BFA8] bg-[#F5EBE1]" 
            />
            <div>
              <button onClick={onBack} className="text-xs font-bold uppercase tracking-wider text-[#8C6239] hover:text-[#3D2513] transition mb-1 inline-block">
                ← Retour
              </button>
              <h1 className="text-xl font-black text-[#2A180C] tracking-tight">{league.name}</h1>
            </div>
          </div>

          <div className="bg-[#FAF2EB] p-4 rounded-2xl border border-[#D9BFA8] text-center space-y-2">
            <span className="text-[11px] uppercase font-bold tracking-wider text-[#8C6239]">Code secret de l'openspace</span>
            <div className="text-xl font-mono font-black text-[#3D2513] bg-white py-2.5 rounded-xl border border-[#D9BFA8] shadow-inner tracking-widest">
              {league.code}
            </div>
            <button onClick={handleCopyCode} className="text-xs font-semibold text-[#8C6239] hover:text-[#3D2513] underline">
              {copied ? '✨ Code copié, balance-le aux collègues !' : 'Copier le code'}
            </button>
          </div>

          <div className="space-y-2">
            <h2 className="text-xs font-bold uppercase tracking-wider text-[#8C6239]">
              Les gourmands inscrits ({leagueMembers.length})
            </h2>
            <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
              {leagueMembers.map((member) => (
                <div key={member.user_id} className="bg-[#FDF8F2] px-3.5 py-2.5 rounded-xl text-xs text-[#3D2513] flex items-center justify-between border border-[#E4D1BE] font-medium">
                  <span>{member.profiles?.username || 'Collègue'}</span>
                  {member.user_id === league.created_by && (
                    <span className="text-[10px] font-bold bg-[#E6A15C] text-[#2A180C] px-2.5 py-0.5 rounded-full shadow-2xs border border-[#D48D47]">Chef de Bande</span>
                  )}
                </div>
              ))}
            </div>
          </div>

          {message && (
            <div className={`p-3.5 rounded-xl text-xs font-medium ${message.type === 'error' ? 'bg-rose-50 text-rose-900 border border-rose-200' : 'bg-emerald-50 text-emerald-900 border border-emerald-200'}`}>
              {message.text}
            </div>
          )}

          {isCreator ? (
            <button
              onClick={handleStartLeague}
              disabled={submitting}
              className="w-full bg-[#5C3A21] hover:bg-[#3D2513] text-[#FDF8F2] text-xs font-bold uppercase tracking-wider py-3.5 rounded-2xl transition shadow-md disabled:opacity-50"
            >
              {submitting ? 'Lancement...' : `Lancer la ligue (${leagueMembers.length} participants) 🍪`}
            </button>
          ) : (
            <div className="text-center p-3.5 bg-[#FAF2EB] text-xs font-medium text-[#734A2C] rounded-2xl border border-[#D9BFA8]">
              En attente que le créateur lance les hostilités de la première fournée.
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#FDF8F2] bg-[radial-gradient(#E8D8C4_1px,transparent_1px)] [background-size:18px_18px] p-4 sm:p-6 text-[#3D2513] font-sans">
      <div className="max-w-5xl mx-auto space-y-6">
        
        <header className="bg-white/95 backdrop-blur p-6 rounded-3xl border border-[#D9BFA8] shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <img 
              src={logo} 
              alt="Logo" 
              className="w-12 h-12 object-contain rounded-2xl shadow-xs border border-[#D9BFA8] shrink-0 bg-[#F5EBE1]" 
            />
            <div>
              <button onClick={onBack} className="text-xs font-bold uppercase tracking-wider text-[#8C6239] hover:text-[#3D2513] transition mb-1 inline-flex items-center gap-1">
                ← Retour au tableau de bord
              </button>
              <h1 className="text-2xl sm:text-3xl font-black text-[#2A180C] tracking-tight">
                {league.name}
              </h1>
            </div>
          </div>

          {leagueGlobalAverage && (
            <div className="bg-[#5C3A21] text-[#FDF8F2] p-4 rounded-2xl text-center min-w-[130px] shadow-sm border border-[#3D2513]">
              <div className="text-2xl font-black">{leagueGlobalAverage} <span className="text-sm font-normal text-[#D9BFA8]">/ 5</span></div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-[#EEDCC7]">Note globale du bureau</div>
            </div>
          )}
        </header>

        {/* Cuisinier de la semaine */}
        <div className="bg-gradient-to-r from-[#F5EBE1] via-[#FAF2EB] to-[#EEDCC7] border border-[#D9BFA8] text-[#3D2513] p-5 rounded-3xl shadow-xs flex items-center gap-4">
          <div className="text-3xl bg-white/80 p-3 rounded-2xl shadow-2xs backdrop-blur-sm border border-[#D9BFA8] shrink-0">🍪</div>
          <div className="space-y-0.5">
            <div className="text-xs font-bold uppercase tracking-wider text-[#8C6239]">Cible de la semaine (ou Chef prodige)</div>
            <div className="text-base sm:text-lg font-bold text-[#2A180C]">
              Semaine #{currentWeek} — C'est au tour de{' '}
              <span className="text-[#5C3A21] underline decoration-[#D48D47] decoration-2 underline-offset-4">
                {bakeMaster?.profiles?.username || 'un collègue'}
              </span> de nous régaler ! (Pas de pression 😇)
            </div>
          </div>
        </div>

        {message && (
          <div className={`p-4 rounded-2xl text-xs font-medium shadow-sm ${message.type === 'error' ? 'bg-rose-50 text-rose-900 border border-rose-200' : 'bg-emerald-50 text-emerald-900 border border-emerald-200'}`}>
            {message.text}
          </div>
        )}

        <div className="grid md:grid-cols-12 gap-6">
          
          <div className="md:col-span-5 space-y-6">
            <div className="bg-white/95 backdrop-blur p-6 rounded-3xl border border-[#D9BFA8] shadow-sm space-y-5">
              <div className="flex items-center justify-between">
                <h2 className="text-xs font-black uppercase tracking-wider text-[#2A180C]">
                  🎯 Noter la fournée
                </h2>
                <select
                  value={selectedWeekToRate}
                  onChange={(e) => setSelectedWeekToRate(Number(e.target.value))}
                  className="bg-[#FAF2EB] border border-[#D9BFA8] text-xs font-bold text-[#3D2513] rounded-xl px-3.5 py-2 outline-none shadow-inner cursor-pointer"
                >
                  {fullSchedule
                    .filter(s => s.week_number <= currentWeek)
                    .map(s => (
                      <option key={s.week_number} value={s.week_number}>
                        Semaine #{s.week_number} {s.week_number === currentWeek ? '(Actuelle)' : ''}
                      </option>
                    ))
                  }
                </select>
              </div>

              {selectedWeekToRate > currentWeek ? (
                <div className="p-4 bg-[#FAF2EB] border border-[#D9BFA8] rounded-2xl text-center space-y-1">
                  <p className="text-xs font-bold text-[#3D2513]">
                    🕒 Un peu de patience !
                  </p>
                  <p className="text-xs text-[#734A2C]">
                    Tu ne peux pas noter une semaine qui n'a pas encore commencé.
                  </p>
                </div>
              ) : isSelfRating() ? (
                <div className="p-4 bg-[#FAF2EB] border border-[#D9BFA8] rounded-2xl text-center space-y-1">
                  <p className="text-xs font-bold text-[#3D2513]">
                    🕵️‍♂️ Auto-jugement interdit
                  </p>
                  <p className="text-xs text-[#734A2C]">
                    C'était ton tour en Semaine #{selectedWeekToRate}. Laisse tes collègues juger ton chef-d'œuvre.
                  </p>
                </div>
              ) : (
                <form onSubmit={handleSubmitRating} className="space-y-4">
                  {CRITERIA.map((criterion) => (
                    <div key={criterion.id} className="space-y-1.5 bg-[#FAF2EB]/60 p-3.5 rounded-2xl border border-[#D9BFA8]/60 shadow-2xs">
                      <div className="flex items-center justify-between text-xs font-bold text-[#3D2513]">
                        <span>{criterion.label}</span>
                        <span className="font-mono text-[#5C3A21] bg-white px-2.5 py-0.5 rounded-lg text-[11px] border border-[#D9BFA8]">{scores[criterion.id]} / 5</span>
                      </div>
                      <div className="flex items-center justify-between pt-1">
                        {[1, 2, 3, 4, 5].map((star) => (
                          <button
                            key={star}
                            type="button"
                            onClick={() => setScores({ ...scores, [criterion.id]: star })}
                            className={`text-xl transition-transform hover:scale-125 ${star <= scores[criterion.id] ? 'opacity-100 drop-shadow-xs' : 'opacity-25 grayscale'}`}
                          >
                            🍪
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}

                  <div className="bg-[#5C3A21] text-[#FDF8F2] p-4 rounded-2xl text-center flex items-center justify-between px-4 shadow-sm border border-[#3D2513]">
                    <span className="text-xs font-bold uppercase tracking-wider text-[#EEDCC7]">Note du jury (Toi)</span>
                    <span className="text-xl font-black">{calculateAverage(scores)} <span className="text-xs text-[#D9BFA8] font-normal">/ 5</span></span>
                  </div>

                  <textarea
                    rows={3}
                    placeholder="Un petit mot doux pour décrire ton expérience..."
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    className="w-full px-4 py-3 bg-[#FAF2EB]/40 border border-[#D9BFA8] rounded-2xl text-[#3D2513] text-xs focus:outline-none focus:ring-2 focus:ring-[#8C6239] placeholder:text-[#A68A72] shadow-inner"
                  />

                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full bg-[#5C3A21] hover:bg-[#3D2513] text-[#FDF8F2] text-xs font-bold uppercase tracking-wider py-3.5 rounded-2xl transition shadow-md"
                  >
                    {submitting ? 'Enregistrement...' : "Envoyer les notes 🎯"}
                  </button>
                </form>
              )}
            </div>

            {/* Calendrier */}
            <div className="bg-white/95 backdrop-blur p-6 rounded-3xl border border-[#D9BFA8] shadow-sm space-y-3">
              <h3 className="text-xs font-black uppercase tracking-wider text-[#2A180C]">
                📅 Les prochains cuistots ({fullSchedule.length} sem.)
              </h3>
              <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                {fullSchedule.length === 0 ? (
                  <p className="text-xs text-[#A68A72] italic text-center py-2">Le planning est vide pour l'instant.</p>
                ) : (
                  fullSchedule.map((sched) => {
                    const isCurrent = sched.week_number === currentWeek
                    return (
                      <div key={sched.id} className={`px-4 py-2.5 rounded-2xl border text-xs flex items-center justify-between transition ${isCurrent ? 'bg-[#EEDCC7] border-[#C8A88A] font-bold text-[#2A180C] shadow-2xs' : 'bg-[#FAF2EB]/30 border-[#D9BFA8]/60 text-[#734A2C]'}`}>
                        <span>Semaine #{sched.week_number} {isCurrent && '🔥 (C\'est le moment !)'}</span>
                        <span className="font-semibold">{sched.profiles?.username || 'Collègue'}</span>
                      </div>
                    )
                  })
                )}
              </div>
            </div>
          </div>

          <div className="md:col-span-7 space-y-6">
            
            {/* Classement */}
            <div className="bg-white/95 backdrop-blur p-6 rounded-3xl border border-[#D9BFA8] shadow-sm space-y-4">
              <h2 className="text-xs font-black uppercase tracking-wider text-[#2A180C]">
                🏆 Classement de l'openspace
              </h2>
              {leaderboard.length === 0 ? (
                <p className="text-xs text-[#A68A72] italic py-6 text-center">Aucune note validée pour l'instant. Personne n'a encore pris de risque en cuisine !</p>
              ) : (
                <div className="space-y-3.5">
                  {leaderboard.map((entry, idx) => (
                    <div key={entry.username} className="p-4 border border-[#D9BFA8] rounded-2xl bg-[#FAF2EB]/40 space-y-3 shadow-2xs">
                      <div className="flex justify-between items-center">
                        <div className="flex items-center gap-2.5 text-[#3D2513] text-xs font-bold">
                          <span className={`w-7 h-7 rounded-xl flex items-center justify-center font-mono text-xs shadow-2xs ${idx === 0 ? 'bg-[#5C3A21] text-[#FDF8F2] font-black' : idx === 1 ? 'bg-[#D48D47] text-[#2A180C] font-bold' : idx === 2 ? 'bg-[#E6A15C] text-[#2A180C] font-bold' : 'bg-[#EEDCC7] text-[#5C3A21]'}`}>
                            {idx + 1}
                          </span>
                          <span className="text-sm font-black text-[#2A180C]">{entry.username}</span>
                        </div>
                        <div className="bg-[#5C3A21] text-[#FDF8F2] px-3 py-1 rounded-xl text-xs font-black shadow-2xs border border-[#3D2513]">
                          {entry.avgGlobal} / 5
                        </div>
                      </div>

                      {/* Détail par critères */}
                      <div className="grid grid-cols-5 gap-1.5 pt-2 border-t border-[#D9BFA8]/60 text-center">
                        {CRITERIA.map(crit => (
                          <div key={crit.id} className="bg-white p-2 rounded-xl border border-[#D9BFA8] shadow-2xs">
                            <div className="text-[10px] font-bold text-[#8C6239] uppercase">{crit.label}</div>
                            <div className="text-[11px] font-mono font-black text-[#5C3A21] mt-0.5">
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
            <div className="bg-white/95 backdrop-blur p-6 rounded-3xl border border-[#D9BFA8] shadow-sm space-y-4">
              <h2 className="text-xs font-black uppercase tracking-wider text-[#2A180C]">
                📜 Les archives de la machine à café (Historique)
              </h2>
              {filteredRatings.length === 0 ? (
                <p className="text-xs text-[#A68A72] italic py-6 text-center">Rien à signaler pour les semaines passées.</p>
              ) : (
                <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
                  {filteredRatings.map((item) => (
                    <div key={item.id} className="p-4 border border-[#D9BFA8] rounded-2xl bg-[#FAF2EB]/30 space-y-2 shadow-2xs">
                      <div className="flex justify-between items-center text-xs text-[#3D2513]">
                        <span className="font-bold">
                          {item.profiles?.username} <span className="font-normal text-[#8C6239]">(Semaine #{item.week_number || currentWeek})</span>
                        </span>
                        <span className="bg-[#EEDCC7] text-[#5C3A21] px-2.5 py-1 rounded-xl border border-[#D9BFA8] font-black shadow-2xs">
                          {item.score} / 5
                        </span>
                      </div>
                      {item.comment && <p className="text-xs text-[#734A2C] italic bg-white p-3 rounded-xl border border-[#D9BFA8] shadow-inner">"{item.comment}"</p>}
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