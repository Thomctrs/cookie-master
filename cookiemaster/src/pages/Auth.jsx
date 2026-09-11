import { useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import logo from '../logo/logo.webp'

export default function Auth() {
  const [loading, setLoading] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [username, setUsername] = useState('')
  const [isSignUp, setIsSignUp] = useState(false)
  const [message, setMessage] = useState(null)

  const handleAuth = async (e) => {
    e.preventDefault()
    setLoading(true)
    setMessage(null)

    try {
      if (isSignUp) {
        if (!username.trim()) {
          throw new Error("Dis-nous comment t'appeler dans les classements !")
        }

        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { username: username.trim() }
          }
        })
        if (error) throw error

        if (data?.user) {
          const { error: profileError } = await supabase
            .from('profiles')
            .upsert({ id: data.user.id, username: username.trim() })
          
          if (profileError) console.error("Erreur profil:", profileError)
        }

        setMessage({ 
          type: 'success', 
          text: 'Compte créé avec succès ! Si demandé, va valider ton e-mail ou connecte-toi direct.' 
        })
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        })
        if (error) throw error
      }
    } catch (error) {
      setMessage({ type: 'error', text: error.message })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 via-orange-50/40 to-stone-100 flex items-center justify-center p-4 text-stone-800 font-sans">
      <div className="max-w-md w-full bg-white/90 backdrop-blur p-8 rounded-3xl border border-amber-200/60 shadow-xl space-y-6">
        
        {/* LOGO EN GROS AU DÉBUT */}
        <div className="flex flex-col items-center justify-center space-y-3 text-center">
          <div className="relative">
            <img 
              src={logo} 
              alt="Logo de la ligue" 
              className="relative w-24 h-24 sm:w-28 sm:h-28 object-contain rounded-2xl bg-white p-2 shadow-md border border-amber-200" 
            />
          </div>
          <div>
            <h1 className="text-2xl font-black text-stone-900 tracking-tight">
              {isSignUp ? "Rejoindre l'arène" : "Bon retour parmi nous !"}
            </h1>
            <p className="text-xs text-stone-500 mt-1">
              {isSignUp ? "Crée ton profil pour participer aux carnages du bureau." : "Connecte-toi pour noter les chefs-d'œuvre (ou les ratés)."}
            </p>
          </div>
        </div>

        {message && (
          <div className={`p-4 rounded-xl text-xs font-medium shadow-sm ${message.type === 'error' ? 'bg-red-100 text-red-800 border border-red-200' : 'bg-emerald-100 text-emerald-900 border border-emerald-200'}`}>
            {message.text}
          </div>
        )}

        <form onSubmit={handleAuth} className="space-y-4">
          {isSignUp && (
            <div className="space-y-1">
              <label className="text-[11px] font-bold uppercase tracking-wider text-stone-600">Pseudo / Nom</label>
              <input
                type="text"
                placeholder="Ex: LePâtissierMasqué"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required={isSignUp}
                className="w-full px-4 py-3 bg-amber-50/40 border border-amber-200/60 rounded-xl text-stone-900 text-xs focus:outline-none focus:ring-2 focus:ring-amber-500 placeholder:text-stone-400 shadow-inner"
              />
            </div>
          )}

          <div className="space-y-1">
            <label className="text-[11px] font-bold uppercase tracking-wider text-stone-600">Adresse e-mail</label>
            <input
              type="email"
              placeholder="nom@entreprise.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full px-4 py-3 bg-amber-50/40 border border-amber-200/60 rounded-xl text-stone-900 text-xs focus:outline-none focus:ring-2 focus:ring-amber-500 placeholder:text-stone-400 shadow-inner"
            />
          </div>

          <div className="space-y-1">
            <label className="text-[11px] font-bold uppercase tracking-wider text-stone-600">Mot de passe</label>
            <input
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full px-4 py-3 bg-amber-50/40 border border-amber-200/60 rounded-xl text-stone-900 text-xs focus:outline-none focus:ring-2 focus:ring-amber-500 placeholder:text-stone-400 shadow-inner"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-700 hover:to-orange-700 text-white text-xs font-bold uppercase tracking-wider py-3.5 rounded-xl transition shadow-md disabled:opacity-50 mt-2"
          >
            {loading ? 'Patientez...' : isSignUp ? "S'inscrire et aller aux fourneaux 🚀" : "Se connecter 🍰"}
          </button>
        </form>

        <div className="text-center pt-2 border-t border-amber-100">
          <button
            type="button"
            onClick={() => {
              setIsSignUp(!isSignUp)
              setMessage(null)
            }}
            className="text-xs font-semibold text-amber-700 hover:text-amber-900 transition underline"
          >
            {isSignUp ? "Déjà un compte ? Connecte-toi par ici." : "Pas encore de compte ? Crée ton profil !"}
          </button>
        </div>

      </div>
    </div>
  )
}