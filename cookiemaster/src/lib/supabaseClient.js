import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://placeholder.supabase.co'
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'placeholder'

if (!import.meta.env.VITE_SUPABASE_URL || !import.meta.env.VITE_SUPABASE_ANON_KEY) {
  console.error("Erreur : Les variables VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY sont manquantes dans le fichier .env.local à la racine du projet.")
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)