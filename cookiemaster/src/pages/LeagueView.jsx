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

  const currentWeek = getWeekNumber(new Date())

  // Fonction utilitaire pour le numéro de semaine ISO
  function getWeekNumber(d) {
    const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
    const dayNum = date.getUTCDay() || 7
    date.setUTCDate(date.getUTCDate() + 4 - dayNum)
    const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1))
    return Math.ceil(((date - yearStart) / 86400000 + 1) / 7)
  }

  // Chargement des données de la ligue et des avis
  const fetchData = async () => {
    if (!leagueId) return
    setLoading(true)

    // 1. Informations sur la ligue
    const { data: leagueData, error: leagueErr } = await supabase
      .from('leagues')
      .select('*')
      .eq('id', leagueId)
      .maybeSingle()

    if (leagueErr) {
      console.error('Erreur ligue :', leagueErr)
    } else {
      setLeague(leagueData)
    }

    // 2. Récupération des notes de la ligue
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
        week_number,
        profiles (
          username
        )
      `)
      .eq('league_id', leagueId)
      .order('created_at', { ascending: false })

    if (ratingsErr) {
      console.error('Erreur notes :', ratingsErr)
    } else {
      setRatings(ratingsData || [])

      // Si l'utilisateur a déjà noté cette semaine, préremplir le formulaire
      if (user) {
        const existing = (ratingsData || []).find(
          (r) => r.user_id === user.id && (r.week_number === currentWeek || !r.week_number)
        )
        if (existing) {
          setScores({
            taste: existing.taste || 5,
            texture: existing.texture || 5,
            appearance: existing.appearance || 5,
            baking: existing.baking || 5,
            indulgence: existing.indulgence || 5
          })
          setComment(existing.comment || '')
        }
      }
    }

    setLoading(false)
  }

  useEffect(() => {
    fetchData()
  }, [leagueId, user])

  // Calcul du score moyen global d'un avis
  const calculateAverage = (s) => {
    const sum = Number(s.taste) + Number(s.texture) + Number(s.appearance) + Number(s.baking) + Number(s.indulgence)
    return (sum / 5).toFixed(1)
  }

  // Soumission de l'évaluation
 const handleSubmitRating = async (e) => {
    e.preventDefault()
    if (!user?.id || !leagueId) {
      setMessage({ type: 'error', text: 'Session ou ligue invalide.' })
      return
    }

    setSubmitting(true)
    setMessage(null)

    const globalScore = Number(calculateAverage(scores))
    const existingRating = ratings.find(
      (r) => (r.user_id === user.id || r.voter_id === user.id) && r.week_number === currentWeek
    )

    // Déclaration du payload avant toute utilisation
    const payload = {
  league_id: leagueId,
  user_id: user.id,
  voter_id: user.id,
  score: globalScore,
  // Critères (anglais)
  taste: Number(scores.taste),
  texture: Number(scores.texture),
  appearance: Number(scores.appearance),
  baking: Number(scores.baking),
  indulgence: Number(scores.indulgence),
  originality: Number(scores.indulgence), // <-- Ajouté ici
  // Critères (français)
  gout: Number(scores.taste),
  apparence: Number(scores.appearance),
  cuisson: Number(scores.baking),
  gourmandise: Number(scores.indulgence),
  originalite: Number(scores.indulgence), // <-- Ajouté ici
  comment: comment.trim() || null,
  week_number: currentWeek
}

    let error = null

    if (existingRating) {
      const res = await supabase
        .from('ratings')
        .update(payload)
        .eq('id', existingRating.id)
      error = res.error
    } else {
      const res = await supabase
        .from('ratings')
        .insert([payload])
      error = res.error
    }

    if (error) {
      console.error('Erreur enregistrement :', error)
      setMessage({
        type: 'error',
        text: `Erreur (${error.code || '400'}) : ${error.message || 'Impossible d\'enregistrer votre note.'}`
      })
    } else {
      setMessage({
        type: 'success',
        text: 'Évaluation de la semaine enregistrée avec succès ! 🍪'
      })
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

  // Moyennes globales par critère
  const getCriteriaAverages = () => {
    if (ratings.length === 0) return null
    const totals = CRITERIA.reduce((acc, c) => ({ ...acc, [c.id]: 0 }), {})
    ratings.forEach((r) => {
      CRITERIA.forEach((c) => {
        totals[c.id] += Number(r[c.id] || r.score || 5)
      })
    })
    const averages = {}
    CRITERIA.forEach((c) => {
      averages[c.id] = (totals[c.id] / ratings.length).toFixed(1)
    })
    return averages
  }

  const criteriaAverages = getCriteriaAverages()

  const leagueGlobalAverage =
    ratings.length > 0
      ? (ratings.reduce((acc, r) => acc + Number(r.score || 5), 0) / ratings.length).toFixed(1)
      : null

  if (loading) {
    return (
      <div className="min-h-screen bg-amber-50/50 flex items-center justify-center p-4">
        <div className="text-amber-900 font-semibold flex items-center gap-2">
          <span className="animate-spin text-2xl">🍪</span>
          Chargement de la ligue...
        </div>
      </div>
    )
  }

  if (!league) {
    return (
      <div className="min-h-screen bg-amber-50/50 p-6 flex flex-col items-center justify-center text-center">
        <p className="text-red-600 font-semibold mb-4">Ligue introuvable ou indisponible.</p>
        <button
          onClick={onBack}
          className="px-4 py-2 bg-amber-800 text-white rounded-xl font-semibold hover:bg-amber-900 transition cursor-pointer"
        >
          ← Retour au Hub
        </button>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-amber-50/50 p-4 sm:p-6">
      <div className="max-w-5xl mx-auto space-y-6">
        
        {/* En-tête de la Ligue */}
        <header className="bg-white p-6 rounded-2xl shadow-sm border border-amber-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <button
              onClick={onBack}
              className="text-xs font-bold text-amber-800 hover:text-amber-950 transition flex items-center gap-1 mb-2 cursor-pointer"
            >
              ← Retour au Hub
            </button>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-amber-950 flex items-center gap-2">
              <span>🏆</span> {league.name}
            </h1>
            <div className="flex items-center gap-3 text-xs text-amber-800/80 pt-1">
              <span>
                Code invitation :{' '}
                <strong className="font-mono bg-amber-100 text-amber-900 px-2 py-0.5 rounded">
                  {league.code}
                </strong>
              </span>
              <button
                onClick={handleCopyCode}
                className="text-amber-700 hover:text-amber-900 underline cursor-pointer"
              >
                {copied ? 'Copié !' : 'Copier'}
              </button>
            </div>
          </div>

          {/* Badge de la semaine & Moyenne globale */}
          <div className="flex items-center gap-3 self-start md:self-auto">
            <div className="bg-amber-100/60 p-3 rounded-xl border border-amber-200 text-center">
              <div className="text-xs text-amber-800 font-semibold uppercase">Semaine</div>
              <div className="text-xl font-black text-amber-950">#{currentWeek}</div>
            </div>
            {leagueGlobalAverage && (
              <div className="bg-amber-800 text-white p-3 rounded-xl text-center min-w-[110px]">
                <div className="text-2xl font-black">{leagueGlobalAverage} ★</div>
                <div className="text-[10px] text-amber-200 font-medium uppercase">Moyenne Globale</div>
              </div>
            )}
          </div>
        </header>

        {/* Rappel du système hebdomadaire & Notification par mail */}
        <div className="bg-amber-100/50 border border-amber-200/80 p-4 rounded-xl flex items-start gap-3 text-amber-950 text-xs sm:text-sm">
          <span className="text-2xl">📧</span>
          <div className="space-y-0.5">
            <strong className="font-bold">Rappel des fournées :</strong> Chaque <strong>vendredi soir</strong>, un e-mail est automatiquement envoyé pour désigner le membre en charge des cookies de la semaine suivante.
          </div>
        </div>

        {/* Bannières de confirmation ou d'erreur */}
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

        {/* Moyennes Détaillées par Critère */}
        {criteriaAverages && (
          <section className="bg-white p-5 rounded-2xl border border-amber-100 shadow-sm space-y-3">
            <h2 className="text-sm font-bold text-amber-950 uppercase tracking-wide">
              📊 Score moyen de la ligue par critère
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              {CRITERIA.map((c) => (
                <div key={c.id} className="bg-amber-50/60 p-3 rounded-xl border border-amber-200/60 text-center space-y-1">
                  <div className="text-xl">{c.icon}</div>
                  <div className="text-xs font-semibold text-amber-900 truncate">{c.label}</div>
                  <div className="text-lg font-black text-amber-950">{criteriaAverages[c.id]} / 5</div>
                </div>
              ))}
            </div>
          </section>
        )}

        <div className="grid md:grid-cols-12 gap-6">
          
          {/* Formulaire de Notation Multi-Critères (5/12) */}
          <div className="md:col-span-5 bg-white p-6 rounded-2xl shadow-sm border border-amber-100 space-y-5 h-fit">
            <div>
              <h2 className="text-lg font-bold text-amber-950 flex items-center gap-2">
                <span>📝</span> Évaluer la fournée N°{currentWeek}
              </h2>
              <p className="text-xs text-amber-800/70 mt-0.5">
                Attribuez une note de 1 à 5 pour chaque critère.
              </p>
            </div>

            <form onSubmit={handleSubmitRating} className="space-y-4">
              
              {/* Les 5 critères avec étoiles */}
              {CRITERIA.map((criterion) => (
                <div key={criterion.id} className="space-y-1.5 bg-amber-50/40 p-3 rounded-xl border border-amber-100">
                  <div className="flex items-center justify-between text-xs font-bold text-amber-950">
                    <span className="flex items-center gap-1.5">
                      <span>{criterion.icon}</span>
                      {criterion.label}
                    </span>
                    <span className="text-amber-800 font-mono">{scores[criterion.id]} / 5</span>
                  </div>
                  <div className="flex items-center justify-between pt-1">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button
                        key={star}
                        type="button"
                        onClick={() => setScores({ ...scores, [criterion.id]: star })}
                        className={`text-xl transition-transform hover:scale-125 cursor-pointer ${
                          star <= scores[criterion.id] ? 'opacity-100' : 'opacity-25 grayscale'
                        }`}
                      >
                        ⭐
                      </button>
                    ))}
                  </div>
                </div>
              ))}

              {/* Aperçu de la note finale calculée */}
              <div className="bg-amber-100/60 p-3 rounded-xl text-center flex items-center justify-between px-4 border border-amber-200">
                <span className="text-xs font-bold text-amber-900">Note Globale calculée :</span>
                <span className="text-xl font-black text-amber-950">{calculateAverage(scores)} / 5</span>
              </div>

              {/* Commentaire */}
              <div>
                <label className="block text-xs font-semibold uppercase text-amber-900/80 mb-1">
                  Commentaires & Remarques
                </label>
                <textarea
                  rows={3}
                  placeholder="Générosité, pépites fondantes, croustillant..."
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  className="w-full px-3 py-2 bg-amber-50/30 border border-amber-200 rounded-xl text-amber-950 placeholder-amber-400 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full bg-amber-800 hover:bg-amber-900 text-white font-bold py-3 rounded-xl shadow-sm transition disabled:opacity-50 cursor-pointer text-sm"
              >
                {submitting ? 'Enregistrement...' : 'Valider mon évaluation hebdomadaire'}
              </button>
            </form>
          </div>

          {/* Liste des avis et notes détaillées (7/12) */}
          <div className="md:col-span-7 bg-white p-6 rounded-2xl shadow-sm border border-amber-100 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-amber-950 flex items-center gap-2">
                <span>💬</span> Historique des évaluations
              </h2>
              <span className="text-xs font-semibold px-2.5 py-1 bg-amber-100 text-amber-900 rounded-full">
                {ratings.length} avis
              </span>
            </div>

            {ratings.length === 0 ? (
              <div className="text-center py-12 bg-amber-50/30 rounded-xl border border-dashed border-amber-200 space-y-2">
                <span className="text-4xl block">🍪</span>
                <p className="text-sm font-semibold text-amber-900">Aucune évaluation enregistrée pour l'instant.</p>
                <p className="text-xs text-amber-700/70">
                  Attribuez vos notes pour lancer la compétition de la ligue !
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {ratings.map((item) => (
                  <div
                    key={item.id}
                    className={`p-4 rounded-xl border transition space-y-3 ${
                      item.user_id === user?.id
                        ? 'bg-amber-50/80 border-amber-300'
                        : 'bg-white border-amber-100'
                    }`}
                  >
                    {/* Header de l'avis */}
                    <div className="flex items-center justify-between border-b border-amber-100/80 pb-2">
                      <div className="flex items-center gap-2">
                        <span className="font-extrabold text-sm text-amber-950">
                          {item.profiles?.username || 'Membre anonyme'}
                        </span>
                        {item.user_id === user?.id && (
                          <span className="text-[10px] bg-amber-200 text-amber-900 font-extrabold px-1.5 py-0.5 rounded">
                            Vous
                          </span>
                        )}
                        {item.week_number && (
                          <span className="text-[10px] bg-amber-100 text-amber-800 font-semibold px-1.5 py-0.5 rounded">
                            Semaine #{item.week_number}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1 text-amber-900 font-black text-base bg-amber-100/80 px-2 py-0.5 rounded-lg">
                        {item.score} <span className="text-amber-500 text-xs">★</span>
                      </div>
                    </div>

                    {/* Badge des 5 critères */}
                    <div className="grid grid-cols-5 gap-1 text-[11px] font-semibold text-center">
                      <div className="bg-amber-50 p-1.5 rounded border border-amber-100">
                        <div className="text-[10px] text-amber-700">Goût</div>
                        <div className="font-bold text-amber-950">{item.taste || item.score}/5</div>
                      </div>
                      <div className="bg-amber-50 p-1.5 rounded border border-amber-100">
                        <div className="text-[10px] text-amber-700">Texture</div>
                        <div className="font-bold text-amber-950">{item.texture || item.score}/5</div>
                      </div>
                      <div className="bg-amber-50 p-1.5 rounded border border-amber-100">
                        <div className="text-[10px] text-amber-700">Apparence</div>
                        <div className="font-bold text-amber-950">{item.appearance || item.score}/5</div>
                      </div>
                      <div className="bg-amber-50 p-1.5 rounded border border-amber-100">
                        <div className="text-[10px] text-amber-700">Cuisson</div>
                        <div className="font-bold text-amber-950">{item.baking || item.score}/5</div>
                      </div>
                      <div className="bg-amber-50 p-1.5 rounded border border-amber-100">
                        <div className="text-[10px] text-amber-700">Gourmand.</div>
                        <div className="font-bold text-amber-950">{item.indulgence || item.score}/5</div>
                      </div>
                    </div>

                    {/* Commentaire optionnel */}
                    {item.comment && (
                      <p className="text-xs text-amber-900/90 bg-white/80 p-2.5 rounded-lg border border-amber-100/80 italic">
                        "{item.comment}"
                      </p>
                    )}

                    <div className="text-[10px] text-amber-700/60 text-right">
                      {new Date(item.created_at).toLocaleDateString('fr-FR', {
                        day: 'numeric',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </div>
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