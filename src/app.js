import { supabase } from './lib/supabase.js'
import { startOffline, flush, pending } from './lib/offline.js'
import { autoTour } from './lib/guide.js'
import { GRADES } from './lib/levels.js'
import { strength, LABELS } from './lib/strength.js'
import { GOOGLE_LOGIN } from '../config.js'

export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`)
export const $ = (sel, el = document) => el.querySelector(sel)

// Confirmation box (native <dialog>: backdrop, Esc and focus handling built in). Resolves true on OK.
export function ask(title, body, okLabel) {
  const dlg = $('#askDlg')
  $('#askTitle').textContent = title; $('#askBody').textContent = body; $('#askOk').textContent = okLabel
  dlg.returnValue = ''
  dlg.showModal()
  return new Promise(done => dlg.addEventListener('close', () => done(dlg.returnValue === 'ok'), { once: true }))
}


const routes = [
  [/^#\/$/, () => import('./pages/sections.js')],
  [/^#\/setup$/, () => import('./pages/setup.js')],
  [/^#\/archive$/, () => import('./pages/archive.js')],
  [/^#\/students$/, () => import('./pages/students.js')],
  [/^#\/read$/, () => import('./pages/students.js')], // Reading: the same list, to pick who reads
  [/^#\/students\/([\w-]+)$/, () => import('./pages/progress.js')],
  [/^#\/dashboard$/, () => import('./pages/dashboard.js')],
  [/^#\/profile$/, () => import('./pages/profile.js')],
  [/^#\/guide$/, () => import('./pages/guide.js')],
  [/^#\/lessons$/, () => import('./pages/lessons.js')],
  [/^#\/lessons\/([\w-]+)$/, () => import('./pages/lessons.js')],
  [/^#\/play\/([\w-]+)$/, () => import('./pages/player.js')],
  [/^#\/assess\/([\w-]+)\/([\w-]+)$/, () => import('./pages/assess.js')],
]


async function login(el) {
  const ic = d => `<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`
  const ICON = {
    person: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>', group: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><circle cx="17" cy="9" r="2.5"/><path d="M17 14.5a5 5 0 0 1 4.5 5"/>',
    mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>', lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
    mic: '<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v4"/>', layers: '<path d="M12 3 2 8l10 5 10-5zM2 13l10 5 10-5M2 18l10 5 10-5"/>',
    wifi: '<path d="M2 9a15 15 0 0 1 20 0M5.5 12.5a10 10 0 0 1 13 0M9 16a5 5 0 0 1 6 0M12 20h.01"/>', shield: '<path d="M12 2 4 5v6c0 5 3.4 9.4 8 11 4.6-1.6 8-6 8-11V5z"/><path d="m9 12 2 2 4-4"/>',
    check: '<circle cx="12" cy="12" r="10"/><path d="m8 12 3 3 5-6"/>',
    login: '<path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M15 12H3"/>', plus: '<circle cx="12" cy="12" r="10"/><path d="M12 8v8M8 12h8"/>',
  }
  el.innerHTML = `<div class="auth-wrap"><aside class="auth-story" aria-label="About Basa">
      <div class="story-hero">
        <span class="eyebrow">${ic(ICON.check)}For Kinder to Grade 6 teachers</span>
        <h2>Help every child read with confidence.</h2>
        <p>Build leveled lessons in English, Tagalog or Bisaya. Kids read aloud, Basa listens and marks each word, and passing readers move up a level.</p>
        <div class="preview" aria-hidden="true">
          <p class="pv-words"><span class="w ok">The</span><span class="w ok">cat</span><span class="w ok">sat</span><span class="w bad">on</span><span class="w next">the</span><span class="w">mat.</span></p>
          <div class="float-chip"><span class="itile mint">${ic(ICON.mic)}</span><span><b>Speech check</b><em>Each word marked as they read</em></span><span class="pill">3 languages</span></div>
        </div>
        <div class="bento">
          <div><span class="itile sun">${ic(ICON.layers)}</span><span><b>Leveled lessons</b>Words, phrases, sentences, stories</span></div>
          <div><span class="itile sky">${ic(ICON.wifi)}</span><span><b>Works offline</b>Keep reading when the signal drops</span></div>
        </div>
      </div>
    </aside><section class="auth">
      <div class="auth-head">
        <span class="auth-brand"><svg viewBox="0 0 32 32" aria-hidden="true">${$('.brand svg').innerHTML}</svg>Basa</span><br>
        <span class="kicker">Teacher access</span>
        <h1>Welcome, teacher</h1>
        <p class="muted" id="sub">Sign in to manage your classes and lessons.</p>
      </div>
      <div class="seg" role="group" aria-label="Log in or create an account">
        <button type="button" id="tabIn" aria-pressed="true">${ic(ICON.login)}Log in</button>
        <button type="button" id="tabUp" aria-pressed="false">${ic(ICON.plus)}Create account</button>
      </div>
      ${GOOGLE_LOGIN ? `<button type="button" id="google" class="sso"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z" fill="#34A853"/><path d="M5.84 14.09a6.6 6.6 0 0 1 0-4.18V7.07H2.18a11 11 0 0 0 0 9.86z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15A11 11 0 0 0 2.18 7.07l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z" fill="#EA4335"/></svg>Continue with Google</button>
      <p class="or"><span>or use your email</span></p>` : ''}
      <form novalidate>
        <div id="extra" hidden>
          <label for="fname"><span>Your name</span><span class="hint">Shown on your profile</span></label>
          <div class="field">${ic(ICON.person)}<input id="fname" autocomplete="name" placeholder="e.g. Maria Santos"></div>
          <label for="handling">Classes you handle</label>
          <div class="field">${ic(ICON.group)}<input id="handling" placeholder="e.g. Sampaguita, Rosal"></div>
          <fieldset class="chips"><legend><span>Advisory level</span><span class="hint">Choose one</span></legend>
            ${[...GRADES, 'No advisory class'].map(g => `<label><input type="radio" name="advisory" value="${g}"><span>${g}</span></label>`).join('')}</fieldset>
        </div>
        <label for="email">Email</label>
        <div class="field">${ic(ICON.mail)}<input id="email" type="email" autocomplete="email" required placeholder="you@school.edu.ph" aria-describedby="msg"></div>
        <label for="pw">Password</label>
        <div class="pw field">${ic(ICON.lock)}<input id="pw" type="password" autocomplete="current-password" required aria-describedby="msg">
          <button type="button" id="eye" aria-label="Show password" aria-pressed="false"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/><path class="slash" d="M3 3l18 18"/></svg></button></div>
        <div class="meter-pw" id="pwMeter" hidden><span class="segs" data-n="0"><i></i><i></i><i></i><i></i></span><span class="small">Password strength: <b id="pwLabel">Too short</b></span></div>
        <div class="trust">${ic(ICON.shield)}<span><b>Your classes stay private</b>Only you can see your students and their readings.</span></div>
        <button class="primary cta">Log in</button>
        <button type="button" id="link">Email me a sign-in link instead</button>
      </form>
      <p id="msg" role="status" aria-live="polite"></p>
      <p class="switch"><span id="ask">New to Basa?</span> <button type="button" class="linkish" id="mode">Create an account</button></p>
    </section></div>
    <footer class="auth-foot"><b>Basa</b><span>Reading practice for early-grade learners</span></footer>`
  const msg = $('#msg', el)
  // msg moves next to whatever it is about, so errors sit under their field
  const say = (text, kind = '', near = $('#link', el)) => { (near.closest('.field, .chips') || near).after(msg); msg.textContent = text; msg.className = kind }
  const email = $('#email', el), pw = $('#pw', el)
  $('#eye', el).onclick = e => {
    const show = pw.type === 'password'
    pw.type = show ? 'text' : 'password'
    e.currentTarget.setAttribute('aria-pressed', show)
    e.currentTarget.setAttribute('aria-label', show ? 'Hide password' : 'Show password')
  }
  const bad = (input, text) => { input.setAttribute('aria-invalid', 'true'); input.focus(); say(text, 'bad', input) }
  const emailOk = () => email.checkValidity() || bad(email, 'Enter a valid email, like you@school.edu.ph.')
  const busy = (btn, label) => { const old = btn.textContent; btn.disabled = true; btn.textContent = label; say(''); return () => { btn.disabled = false; btn.textContent = old } }
  el.querySelectorAll('input').forEach(i => i.oninput = () => { i.removeAttribute('aria-invalid'); say('') })

  const meterSegs = $('#pwMeter .segs', el)
  pw.addEventListener('input', () => { const n = strength(pw.value); meterSegs.dataset.n = n; $('#pwLabel', el).textContent = LABELS[n] })
  if (GOOGLE_LOGIN) $('#google', el).onclick = async () => {
    const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: location.origin + location.pathname } })
    if (error) say(error.message, 'bad', $('#google', el))
  }

  let signup = false
  $('#tabIn', el).onclick = () => signup && $('#mode', el).click()
  $('#tabUp', el).onclick = () => signup || $('#mode', el).click()
  $('#mode', el).onclick = () => {
    signup = !signup
    $('#tabIn', el).setAttribute('aria-pressed', !signup); $('#tabUp', el).setAttribute('aria-pressed', signup)
    $('#pwMeter', el).hidden = !signup
    $('h1', el).textContent = signup ? 'Create your account' : 'Welcome, teacher'
    $('form .primary', el).textContent = signup ? 'Create account' : 'Log in'
    $('#sub', el).textContent = signup ? 'Free for teachers. Set up your classes in minutes.' : 'Sign in to manage your classes and lessons.'
    $('#link', el).hidden = signup
    $('#extra', el).hidden = !signup
    pw.autocomplete = signup ? 'new-password' : 'current-password'
    pw.placeholder = signup ? 'At least 8 characters' : ''
    $('#ask', el).textContent = signup ? 'Already have an account?' : 'New to Basa?'
    $('#mode', el).textContent = signup ? 'Log in' : 'Create an account'
    say(''); email.focus(); countdown()
  }

  // ponytail: browser-side lockout is UX only (attackers can call the API directly);
  // the real limit is Supabase Auth's per-IP rate limit (Dashboard → Auth → Rate Limits).
  const MAX_FAILS = 5, LOCK_MS = 60_000
  const lock = { get: () => { try { return JSON.parse(localStorage.getItem('loginLock')) || { fails: 0, until: 0 } } catch { return { fails: 0, until: 0 } } },
                 set: v => { try { localStorage.setItem('loginLock', JSON.stringify(v)) } catch {} } }
  const loginBtn = $('form .primary', el)
  const countdown = () => {
    const left = Math.ceil((lock.get().until - Date.now()) / 1000)
    if (left > 0 && el.isConnected && !signup) { loginBtn.disabled = true; say(`Too many tries. Try again in ${left}s.`, 'bad', pw); setTimeout(countdown, 1000) }
    else if (loginBtn.disabled) { loginBtn.disabled = false; say('') }
  }
  countdown()

  $('form', el).onsubmit = async e => {
    e.preventDefault()
    if (!signup && lock.get().until > Date.now()) return countdown()
    if (signup) {
      if (!$('#fname', el).value.trim()) return bad($('#fname', el), 'Enter your name.')
      if (!$('#handling', el).value.trim()) return bad($('#handling', el), 'Enter the classes you handle.')
      if (!$('[name=advisory]:checked', el)) return bad($('[name=advisory]', el), 'Choose your advisory level.')
    }
    if (!emailOk()) return
    if (!pw.value) return bad(pw, 'Enter your password.')
    if (signup) {
      if (pw.value.length < 8) return bad(pw, 'Use at least 8 characters.')
      const done = busy($('form .primary', el), 'Creating account…')
      const { data, error } = await supabase.auth.signUp({ email: email.value, password: pw.value, options: { emailRedirectTo: location.origin + location.pathname,
        data: { name: $('#fname', el).value.trim(), handling: $('#handling', el).value.trim(), advisory: $('[name=advisory]:checked', el).value } } })
      done()
      if (error) return /registered/i.test(error.message) ? bad(email, 'This email already has an account. Log in instead.') : say(error.message, 'bad', $('form .primary', el))
      // with email confirmation on there is no session yet; onAuthStateChange routes in when there is
      // with email confirmation on there is no session yet; onAuthStateChange routes in when there is
      if (!data.session) say(`Almost done! Check ${email.value} to confirm your account.`, 'ok', $('form .primary', el))
      return
    }
    const done = busy($('form .primary', el), 'Logging in…')
    const { error } = await supabase.auth.signInWithPassword({ email: email.value, password: pw.value })
    done()
    if (!error) return lock.set({ fails: 0, until: 0 })
    if (error.message !== 'Invalid login credentials') return bad(pw, error.message) // incl. Supabase's own rate-limit message
    const fails = lock.get().fails + 1
    if (fails >= MAX_FAILS) { lock.set({ fails: 0, until: Date.now() + LOCK_MS }); return countdown() }
    lock.set({ fails, until: 0 })
    bad(pw, `Wrong email or password. ${MAX_FAILS - fails} ${MAX_FAILS - fails === 1 ? 'try' : 'tries'} left.`)
  }
  $('#link', el).onclick = async e => {
    if (!emailOk()) return
    const done = busy(e.target, 'Sending…')
    const { error } = await supabase.auth.signInWithOtp({ email: email.value, options: { emailRedirectTo: location.origin + location.pathname } })
    done()
    error ? say(error.message, 'bad') : say(`Check ${email.value} for your sign-in link.`, 'ok')
  }
}

let seq = 0
async function route() {
  const el = $('#app'), hash = location.hash || '#/dashboard', mine = ++seq
  // server unreachable (paused project, DNS, firewall): the token refresh retries for minutes, so stop
  // waiting after 8s and show the login page instead of an endless splash
  const { data } = await Promise.race([supabase.auth.getSession(),
    new Promise(r => setTimeout(() => r({ data: { session: null } }), 8000))])
  if (mine !== seq) return
  // offline, an expired token can't refresh, so getSession returns none; the saved login still counts
  const session = data.session || (!navigator.onLine && hasSavedLogin())
  const u = data.session?.user
  $('#me span').textContent = u?.user_metadata?.name?.split(/\s+/)[0] || u?.email?.split('@')[0] || 'Profile' // name, else email; "Profile" only offline with no session
  hash === '#/profile' ? $('#me').setAttribute('aria-current', 'page') : $('#me').removeAttribute('aria-current')
  // just signed in: swap the login card for the splash until the first page is ready
  if (session && document.body.classList.contains('signed-out')) el.replaceChildren($('#splash').content.cloneNode(true))
  document.body.classList.toggle('signed-out', !session)
  if (!session) return login(el)
  // highlight the menu item for this page; reading pages belong to their section
  const page = { assess: '#/read', play: '#/lessons', students: '#/students', archive: '#/setup' }[hash.split('/')[1]] || hash.match(/^#\/\w*/)[0]
  document.querySelectorAll('header nav a, .tools a').forEach(a =>
    a.getAttribute('href') === page ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current'))
  for (const [re, load] of routes) {
    const m = hash.match(re)
    if (!m) continue
    // render off-screen, then swap in only if the user hasn't moved on; a slow page can't overwrite a newer one
    const box = document.createElement('div')
    try { await (await load()).render(box, m.slice(1)) }
    catch (err) {
      if (navigator.onLine) throw err
      // offline and this page's data was never saved on the device
      box.innerHTML = `<h1>Not saved for offline yet</h1><p class="muted">Connect to the internet once, then tap
        <b>Get ready for offline</b> in your Profile.</p><div class="row"><a href="#/profile"><button class="primary">Profile</button></a></div>`
    }
    if (mine === seq) { el.replaceChildren(box); autoTour() }
    return
  }
  el.innerHTML = '<h1>Page not found</h1><div class="row"><a href="#/"><button class="primary">Go to classes</button></a></div>'
}

function hasSavedLogin() {
  try { return Object.keys(localStorage).some(k => k.startsWith('sb-') && k.endsWith('-auth-token')) } catch { return false }
}

// Sign out: upload saved readings first (they belong to this teacher), then wipe this teacher's offline data.
export async function askSignOut() {
  const dlg = $('#outDlg'), warn = $('#outWarn'), ok = $('#outOk')
  await flush()
  const n = pending()
  warn.hidden = !n
  warn.textContent = n === 1
    ? "1 reading saved on this device hasn't uploaded yet. Connect to the internet first so it isn't lost."
    : `${n} readings saved on this device haven't uploaded yet. Connect to the internet first so they aren't lost.`
  ok.disabled = n > 0 // readings belong to this teacher; signing out would strand them
  dlg.returnValue = ''
  dlg.showModal()
}
$('#outDlg').onclose = async () => {
  if ($('#outDlg').returnValue !== 'ok') return
  await caches?.delete('basa-data').catch(() => {})
  supabase.auth.signOut()
}
for (const d of ['#outDlg', '#askDlg']) // tap the dim backdrop to cancel
  $(d).onclick = e => { if (e.target === e.currentTarget) e.currentTarget.close('cancel') }
startOffline()

// Clickable list rows: <tr data-href="#/..."> opens on a click anywhere in the row,
// except on its own controls (dropdowns, buttons, tick boxes, links keep their job).
// The name link inside the row stays for keyboard users.
document.addEventListener('click', e => {
  const tr = e.target.closest('tr[data-href]')
  if (!tr || e.target.closest('a, button, select, input, textarea, label') || getSelection().toString()) return
  location.hash = tr.dataset.href
})
supabase.auth.onAuthStateChange(() => setTimeout(() => { route(); flush() })) // setTimeout: awaiting supabase inside this callback can deadlock; flush: upload saved readings after sign-in
addEventListener('hashchange', route)
// top-bar search (wide screens): hands the text to the Student List, which filters by it
$('#find').onsubmit = e => {
  e.preventDefault()
  try { sessionStorage.setItem('find', e.target.q.value.trim()) } catch {}
  e.target.q.value = ''
  location.hash === '#/students' ? route() : (location.hash = '#/students')
}
$('#fabMenu').onclick = e => e.target.closest('a') && e.currentTarget.hidePopover() // also when the link is the page you are already on
