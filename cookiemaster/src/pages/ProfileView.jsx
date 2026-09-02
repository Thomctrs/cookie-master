import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'

export default function ProfileView({ onBack }) {
  const { user } = useAuth()

  // États pour le nom / pseudonyme
  const [username, setUsername] = useState('')
  const [updatingProfile, setUpdatingProfile] = useState(false)
  const [profileMsg, setProfileMsg] = useState(null)

  // États pour le mot de passe
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [updatingPassword, setUpdatingPassword] = useState(false)
  const [passwordMsg, setPasswordMsg] = useState(null)

  useEffect(() => {
    async function fetchUserProfile() {
      if (!user) return
      const { data } = await supabase
        .from('profiles')
        .select('username')
        .eq('id', user.id)
        .maybeSingle()

      if (data?.username) {
        setUsername(data.username)
      } else if (user.user_metadata?.username) {
        setUsername(user.user_metadata.username)
      }
    }
    fetchUserProfile()
  }, [user])

  // Mettre à jour le pseudonyme
  const handleUpdateProfile = async (e) => {
    e.preventDefault()
    if (!username.trim()) {
      setProfileMsg({ type: 'error', text: 'Le pseudo ne peut pas être vide.' })
      return
    }

    setUpdatingProfile(true)
    setProfileMsg(null)

    // 1. Mise à jour dans la table public.profiles
    const { error: profileError } = await supabase
      .from('profiles')
      .upsert({ id: user.id, username: username.trim() })

    // 2. Mise à jour des métadonnées Supabase Auth
    const { error: authError } = await supabase.auth.updateUser({
      data: { username: username.trim() }
    })

    setUpdatingProfile(false)

    if (profileError || authError) {
      setProfileMsg({
        type: 'error',
        text: profileError?.message || authError?.message || 'Erreur lors de la mise à jour.'
      })
    } else {
      setProfileMsg({ type: 'success', text: 'Profil mis à jour avec succès !' })
    }
  }

  // Mettre à jour le mot de passe
  const handleUpdatePassword = async (e) => {
    e.preventDefault()
    setPasswordMsg(null)

    if (newPassword.length < 6) {
      setPasswordMsg({
        type: 'error',
        text: 'Le mot de passe doit contenir au moins 6 caractères.'
      })
      return
    }

    if (newPassword !== confirmPassword) {
      setPasswordMsg({ type: 'error', text: 'Les mots de passe ne correspondent pas.' })
      return
    }

    setUpdatingPassword(true)

    const { error } = await supabase.auth.updateUser({
      password: newPassword
    })

    setUpdatingPassword(false)

    if (error) {
      setPasswordMsg({ type: 'error', text: error.message })
    } else {
      setPasswordMsg({
        type: 'success',
        text: 'Mot de passe modifié avec succès !'
      })
      setNewPassword('')
      setConfirmPassword('')
    }
  }

  return (
    <div className="min-h-screen bg-amber-50/50 p-4 sm:p-6">
      <div className="max-w-xl mx-auto space-y-6">
        
        {/* En-tête */}
        <div className="flex items-center justify-between">
          <button
            onClick={onBack}
            className="text-xs font-bold text-amber-800 hover:text-amber-950 transition flex items-center gap-1 cursor-pointer"
          >
            ← Retour
          </button>
          <h1 className="text-xl font-extrabold text-amber-950">⚙️ Mon Profil</h1>
        </div>

        {/* Formulaire 1 : Nom / Pseudonyme */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-amber-100 space-y-4">
          <div>
            <h2 className="text-base font-bold text-amber-950">Informations personnelles</h2>
            <p className="text-xs text-amber-800/70">
              C'est le nom qui apparaîtra sous vos évaluations de cookies.
            </p>
          </div>

          {profileMsg && (
            <div
              className={`p-3 rounded-xl text-xs font-semibold ${
                profileMsg.type === 'error'
                  ? 'bg-red-50 text-red-700 border border-red-200'
                  : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
              }`}
            >
              {profileMsg.text}
            </div>
          )}

          <form onSubmit={handleUpdateProfile} className="space-y-3">
            <div>
              <label className="block text-xs font-semibold uppercase text-amber-900/80 mb-1">
                Adresse e-mail (non modifiable)
              </label>
              <input
                type="text"
                disabled
                value={user?.email || ''}
                className="w-full px-3 py-2 bg-amber-50/50 border border-amber-200 rounded-xl text-amber-800/60 text-sm cursor-not-allowed"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase text-amber-900/80 mb-1">
                Pseudonyme
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Ex: PâtissierDuDimanche"
                className="w-full px-3 py-2 bg-amber-50/30 border border-amber-200 rounded-xl text-amber-950 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>

            <button
              type="submit"
              disabled={updatingProfile}
              className="w-full bg-amber-800 hover:bg-amber-900 text-white font-bold py-2.5 rounded-xl shadow-sm transition disabled:opacity-50 cursor-pointer text-xs uppercase tracking-wider"
            >
              {updatingProfile ? 'Enregistrement...' : 'Enregistrer le pseudonyme'}
            </button>
          </form>
        </div>

        {/* Formulaire 2 : Changement de mot de passe */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-amber-100 space-y-4">
          <div>
            <h2 className="text-base font-bold text-amber-950">Sécurité</h2>
            <p className="text-xs text-amber-800/70">
              Modifier votre mot de passe de connexion.
            </p>
          </div>

          {passwordMsg && (
            <div
              className={`p-3 rounded-xl text-xs font-semibold ${
                passwordMsg.type === 'error'
                  ? 'bg-red-50 text-red-700 border border-red-200'
                  : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
              }`}
            >
              {passwordMsg.text}
            </div>
          )}

          <form onSubmit={handleUpdatePassword} className="space-y-3">
            <div>
              <label className="block text-xs font-semibold uppercase text-amber-900/80 mb-1">
                Nouveau mot de passe
              </label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="6 caractères minimum"
                className="w-full px-3 py-2 bg-amber-50/30 border border-amber-200 rounded-xl text-amber-950 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase text-amber-900/80 mb-1">
                Confirmer le nouveau mot de passe
              </label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Répétez le mot de passe"
                className="w-full px-3 py-2 bg-amber-50/30 border border-amber-200 rounded-xl text-amber-950 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>

            <button
              type="submit"
              disabled={updatingPassword}
              className="w-full bg-amber-800 hover:bg-amber-900 text-white font-bold py-2.5 rounded-xl shadow-sm transition disabled:opacity-50 cursor-pointer text-xs uppercase tracking-wider"
            >
              {updatingPassword ? 'Modification...' : 'Changer le mot de passe'}
            </button>
          </form>
        </div>

      </div>
    </div>
  )
}