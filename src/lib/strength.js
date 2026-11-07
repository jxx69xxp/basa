// Password strength hint for the sign-up form: 0 (too short) to 4 (strong). UX only; Supabase enforces the real rules.
export const LABELS = ['Too short', 'Weak', 'Okay', 'Good', 'Strong']
export const strength = pw => pw.length < 8 ? 0
  : 1 + (pw.length >= 12) + (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) + /[\d\W_]/.test(pw)
