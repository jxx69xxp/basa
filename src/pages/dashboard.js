import { supabase } from '../lib/supabase.js'
import { MAX_LEVEL, passFor, familyNames, familyLabel, stageLabel } from '../lib/levels.js'
import { avatarHtml } from '../lib/avatar.js'
import { esc, $ } from '../app.js'

const DAY = 864e5
const pct = x => `${Math.round(x * 100)}%`
const avg = xs => xs.reduce((a, b) => a + b, 0) / xs.length
const remembered = () => { try { return localStorage.getItem('dashClass') || '' } catch { return '' } }

// ponytail: loads every attempt and filters to 30 days here, so the query URL never changes and the
// offline copy always matches; add a server-side date view when a teacher has many thousands.
export async function render(el) {
  const since = Date.now() - 30 * DAY
  const [{ data: sections }, { data: allStudents }, { data: everyAttempt }, { data: lessons }, { data: auth }] = await Promise.all([
    supabase.from('sections').select('id, name, grade, section').is('archived_at', null).order('name'),
    supabase.from('students').select('id, name, level, family_no, section_id').is('archived_at', null).order('name'),
    supabase.from('attempts').select('student_id, score, passed, created_at'),
    supabase.from('lessons').select('id, level, family, family_no').is('archived_at', null).order('created_at', { ascending: false }),
    supabase.auth.getSession(),
  ])
  const u = auth.session?.user, h = new Date().getHours()
  const name = u?.user_metadata?.name?.trim() || u?.email?.split('@')[0] || '' // offline: no session, so no name
  const PASS_SCORE = passFor(u?.user_metadata?.passing) // overall passing average from Setup, else the default
  const hello = `Good ${h < 12 ? 'morning' : h < 18 ? 'afternoon' : 'evening'}${name ? `, ${esc(name)}` : ''}!`
  const fams = familyNames(lessons)
  const progress = s => s.family_no * 10 + s.level // further family first, then further step
  const allAttempts = everyAttempt.filter(a => Date.parse(a.created_at) > since)
  const cls = sections.some(s => s.id === remembered()) ? remembered() : ''
  const students = allStudents.filter(s => !cls || s.section_id === cls)
  const ids = new Set(students.map(s => s.id))
  const attempts = allAttempts.filter(a => ids.has(a.student_id))
  const week = attempts.filter(a => Date.parse(a.created_at) > Date.now() - 7 * DAY)
  const className = Object.fromEntries(sections.map(s => [s.id, s.name]))

  // per-student stats over 30 days
  const stats = students.map(s => {
    const mine = attempts.filter(a => a.student_id === s.id)
    const last = mine.reduce((m, a) => Math.max(m, Date.parse(a.created_at)), 0)
    return { ...s, n: mine.length, avg: mine.length ? avg(mine.map(a => a.score)) : null, last }
  })
  const top = stats.filter(s => s.n && s.avg >= PASS_SCORE).sort((a, b) => progress(b) - progress(a) || b.avg - a.avg).slice(0, 5)
  const help = stats.filter(s => s.level < MAX_LEVEL && (s.avg === null || s.avg < PASS_SCORE || s.last < Date.now() - 14 * DAY))
    .sort((a, b) => (a.avg ?? -1) - (b.avg ?? -1)).slice(0, 5)
  // one bar per word family that has students (32 families would be too many bars), plus "All levels done"
  const perLevel = [...new Set(students.filter(s => s.level < MAX_LEVEL).map(s => s.family_no))].sort((a, b) => a - b)
    .map(no => [familyLabel(no, fams), students.filter(s => s.level < MAX_LEVEL && s.family_no === no).length])
  const done = students.filter(s => s.level >= MAX_LEVEL).length
  if (done) perLevel.push(['All levels done', done])
  const maxLevelCount = Math.max(1, ...perLevel.map(([, n]) => n))

  const svg = d => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`
  const I = {
    kids: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><circle cx="17" cy="9" r="2.5"/><path d="M17 14.5a5 5 0 0 1 4.5 5"/>',
    book: '<path d="M12 6.5C9.5 4.8 6 4.5 3 5.3v13c3-.8 6.5-.5 9 1.2 2.5-1.7 6-2 9-1.2v-13c-3-.8-6.5-.5-9 1.2zM12 6.5v13"/>',
    check: '<circle cx="12" cy="12" r="10"/><path d="m8 12 3 3 5-6"/>', chart: '<path d="M3 3v18h18"/><path d="m7 15 4-4 3 3 5-6"/>',
    mic: '<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v4"/>', layers: '<path d="M12 3 2 8l10 5 10-5zM2 13l10 5 10-5"/>',
    tune: '<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>',
    alert: '<circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/>', bolt: '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>', star: '<path d="m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z"/>',
    cal: '<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M8 2v4M16 2v4M3 10h18"/>', tip: '<path d="M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2z"/>',
  }
  const head = (icon, title, sub, href, link) => `<div class="card-h"><span class="hicon ${icon}">${svg(I[icon])}</span><span><h2>${title}</h2><span class="muted small">${sub}</span></span>${href ? `<a href="${href}" class="side-link">${link} →</a>` : ''}</div>`
  // banner stat tile (mockup): icon box, big number, label under it
  const tile = (label, value, icon, tone = '', note = '') => `<div class="tile"><span class="ticon ${tone}">${svg(I[icon])}</span><span><b>${value}</b><span class="muted">${label}</span>${note ? `<span class="muted small">${note}</span>` : ''}</span></div>`
  // name over class, level over stage: two short lines instead of one long line that wraps mid-phrase
  const who = s => `<a href="#/students/${s.id}">${esc(s.name)}</a><br><span class="muted small nowrap">${esc(className[s.section_id] ?? '')}</span>`
  const keep = t => t.split(' · ').map(p => `<span class="nw">${esc(p)}</span>`).join(' · ') // wrap only between parts, never inside "CVC -at"
  const lvl = s => s.level >= MAX_LEVEL ? '<b>All levels done</b>' : `<b>${keep(familyLabel(s.family_no, fams))}</b><br><span class="muted">${keep(stageLabel(s.level))}</span>`

  // one card per class (My Classes mockup): students, readings this week, pass rate this week
  const weekAll = allAttempts.filter(a => Date.parse(a.created_at) > Date.now() - 7 * DAY)
  const classCard = (s, i) => {
    const mine = allStudents.filter(st => st.section_id === s.id), kids = new Set(mine.map(st => st.id))
    const wk = weekAll.filter(a => kids.has(a.student_id)), rate = wk.length ? wk.filter(a => a.passed).length / wk.length : null
    // the level most of the class is on (ties: the lower one), shown where the mockup has "Current mission"
    const on = {}; for (const st of mine) { const k = st.level >= MAX_LEVEL ? 'All levels done' : familyLabel(st.family_no, fams); on[k] = (on[k] ?? 0) + 1 }
    const most = Object.entries(on).sort((x, y) => y[1] - x[1])[0]
    return `<article class="ccard" data-grade="${esc(s.grade ?? '')}">
      <div class="ccard-top v${i % 4}"><span class="ccard-row"><span class="tag">${esc(s.grade ?? 'Class')}</span><span class="cinit" aria-hidden="true">${esc((s.section ?? s.name).trim()[0] ?? '?')}</span></span>
        <span><span class="ccard-sub">Section</span><h3>${esc(s.section ?? s.name)}</h3></span></div>
      <div class="ccard-body">
        <p class="ccard-meta"><span class="ic-line">${svg(I.kids)}${mine.length} enrolled</span><span class="tag ${wk.length ? 'ok' : ''}">${wk.length ? `${wk.length} this week` : 'No readings yet'}</span></p>
        <div class="mission">${svg(I.layers)}<span><span class="kicker">Most students on</span><b>${most ? `${esc(most[0])} <span class="muted">(${most[1]})</span>` : 'No students yet'}</b></span></div>
        <div><p class="ccard-meta small"><span>Pass rate this week</span><b>${rate === null ? '—' : pct(rate)}</b></p>
          <div class="prog ok" aria-hidden="true"><span style="width:${(rate ?? 0) * 100}%"></span></div></div>
        <div class="ccard-acts"><a href="#/" data-cls="${s.id}"><button class="primary">Open class</button></a>
          <a href="#/lessons" class="ibtn" title="Lessons" aria-label="Lessons">${svg(I.book)}</a><a href="#/setup" class="ibtn" title="Class setup" aria-label="Class setup">${svg(I.tune)}</a></div>
      </div></article>`
  }
  const quick = (href, label, sub, d) => `<a class="qtool" href="${href}"><span class="qi"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg></span><span><b>${label}</b><span class="muted small">${sub}</span></span><span class="chev" aria-hidden="true">›</span></a>`

  const face = await avatarHtml(u, 'avatar sm')
  const today = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })
  el.innerHTML = `<div class="flat"><section class="hero" aria-label="Class overview">
    <div class="hero-top"><div class="hello">${face}<div><span class="hero-chip">${svg(I.cal)}${esc(today)}</span><h1>${hello}</h1>
      <p class="muted">${sections.length ? 'Ready to listen to your readers today? Here is how your classes are doing.' : 'Welcome to Basa. Start by adding your class in <b>Setup</b>.'}</p></div></div>
      <div class="hero-acts"><a href="#/read" class="cta-sun">${svg(I.mic)}Let a student read</a></div>
    </div>
    <div class="tiles">
      ${tile('Students', students.length, 'kids')}
      ${tile('Readings this week', week.length, 'book')}
      ${tile('Pass rate this week', week.length ? pct(week.filter(a => a.passed).length / week.length) : '—', 'check', 'sun')}
      ${tile('Average score this week', week.length ? pct(avg(week.map(a => a.score))) : '—', 'chart', 'mint', `pass mark ${pct(PASS_SCORE)}`)}
    </div></section>

    ${sections.length ? `<div class="page-head"><div><h2 style="margin:0">Your classes</h2><span class="muted small">Open a class to add students or start a reading.</span></div>
      <div class="acts">${sections.length > 1 ? `<div class="seg-pills" role="tablist" aria-label="Show one class">${[['', 'All classes'], ...sections.map(s => [s.id, s.section ?? s.name])]
        .map(([id, label]) => `<button type="button" role="tab" data-c="${id}" aria-selected="${id === cls}" aria-pressed="${id === cls}">${esc(label)}</button>`).join('')}</div>` : ''}
        <a href="#/setup"><button class="primary">+ New class</button></a></div></div>
    <div class="ccards">${sections.map(classCard).filter((_, i) => !cls || sections[i].id === cls).join('')}</div>` : ''}

    <div class="cols cols-2-1">
      <section class="card">${head('alert', 'Needs help', 'Below the pass mark, or no reading in 14 days', '#/read', 'Start a reading')}
        ${help.length ? `<div class="sess-grid">${help.map(s => `<a class="sess" href="#/students/${s.id}">
          <span class="sess-top"><span class="tag ${s.avg === null ? 'warn' : 'bad'}">${s.avg === null ? 'No reading yet' : `Avg ${pct(s.avg)}`}</span>${svg(I.mic)}</span>
          <span><b>${esc(s.name)}</b><span class="muted small">${s.level >= MAX_LEVEL ? 'All levels done' : `${esc(familyLabel(s.family_no, fams))} · ${esc(stageLabel(s.level))}`}</span></span>
          <span class="sess-foot"><span class="ini" aria-hidden="true">${esc(s.name.trim()[0] ?? '?')}</span>${esc(className[s.section_id] ?? '')}</span></a>`).join('')}</div>`
          : '<p class="muted">Everyone is on track.</p>'}</section>
      <section class="card">${head('bolt', 'Quick actions', 'Things you do every day')}<div class="qtools">
      ${quick('#/read', 'Let a student read', 'Pick a student and start a reading', '<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v4"/>')}
      ${quick('#/', 'Add students', 'Type or paste a list of names', '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0M19 8v6M16 11h6"/>')}
      ${quick('#/lessons/new', 'New lesson', 'Words, phrases, sentences or a story', '<path d="M12 6.5C9.5 4.8 6 4.5 3 5.3v13c3-.8 6.5-.5 9 1.2 2.5-1.7 6-2 9-1.2v-13c-3-.8-6.5-.5-9 1.2zM12 6.5v13"/>')}
      </div><p class="tipbar">${svg(I.tip)}<span>No signal at school? Open <a href="#/profile">Profile</a> and press <b>Get ready for offline</b>.</span></p></section>
    </div>

    <div class="cols">
      <section class="card">${head('star', 'Top students', 'At or above the pass mark, highest level first (30 days)')}
        ${top.length ? `<table><thead><tr><th>Student</th><th>Level</th><th>Avg</th></tr></thead><tbody>
          ${top.map(s => `<tr data-href="#/students/${s.id}"><td>${who(s)}</td><td>${lvl(s)}</td><td>${pct(s.avg)}</td></tr>`).join('')}</tbody></table>`
          : '<p class="muted">No one at the pass mark yet.</p>'}</section>
      <section class="card">${head('layers', 'Students per level', 'Where your readers are now')}
      <div class="bars" role="table" aria-label="Students per level">
        ${perLevel.map(([label, n]) => `<div class="bar-row" role="row">
          <span role="rowheader">${esc(label)}</span>
          <span class="bar-track" title="${n} student${n === 1 ? '' : 's'}">${n ? `<span class="bar" style="width:${(n / maxLevelCount) * 100}%"></span>` : ''}</span>
          <b role="cell">${n}</b></div>`).join('')}
      </div>${perLevel.length ? '' : '<p class="muted">No students yet.</p>'}</section>
    </div></div>`

  // class tabs: the whole dashboard (stats, cards, lists) shows one class or all of them
  el.querySelectorAll('.seg-pills [data-c]').forEach(b => b.onclick = () => { try { localStorage.setItem('dashClass', b.dataset.c) } catch {} render(el) })
  el.querySelectorAll('[data-cls]').forEach(a => a.onclick = () => { try { localStorage.setItem('class', a.dataset.cls) } catch {} })
}
