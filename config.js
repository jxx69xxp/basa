// Public values from Supabase → Project Settings → API. The anon key is safe in the browser (RLS protects data).
export const SUPABASE_URL = 'https://bdlhfgojopjrbluphfye.supabase.co'
export const SUPABASE_ANON_KEY = 'sb_publishable_Abf53UdNFPR0Jw6rTX394A_jGlNOWwZ'
// Hugging Face id of the ONNX-converted Cebuano voice (see README). Empty = Bisaya uses the Filipino voice.
export const CEB_TTS_MODEL = ''
// Voicebox voice profile id for English lesson audio (see README). Empty = English uses the browser voice.
export const VOICEBOX_PROFILE = ''
// Show "Continue with Google" on the login page. Turn on only after enabling Google in Supabase → Authentication → Providers.
export const GOOGLE_LOGIN = false
