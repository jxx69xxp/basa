import { supabase } from '../lib/supabase.js'
import { MAX_LEVEL, familyNames, familyLabel, stageLabel, lessonFor } from '../lib/levels.js'
import { esc, $ } from '../app.js'

// Every student across all classes, filtered in the browser (Gradebook mockup layout).
// Also the Reading page (#/read): same list, to pick who reads.
// ponytail: loads all rows at once; page it when a teacher has thousands of students.
export async function render(el) {
  const [{ data: students, error }, { data: sections }, { data: lessons }, { data: attempts }] = await Promise.all([
    supabase.from('students').select('id, name, level, family_no, section_id').is('archived_at', null).order('name'),
    supabase.from('sections').select('id, name').is('archived_at', null).order('name'),
    supabase.from('lessons').select('id, level, family, family_no').is('archived_at', null).order('created_at', { ascending: false }),
    supabase.from('attempts').select('student_id, score, passed, created_at').order('created_at', { ascending: false }),
  ])
  if (error) { el.innerHTML = `<p class="bad">${esc(error.message)}</p>`; return }
  const className = Object.fromEntries(sections.map(s => [s.id, s.name]))
  const fams = familyNames(lessons), reading = location.hash === '#/read'
  // per student: overall score (average of every reading) and the latest reading (attempts come newest first)
  const tally = {}, last = {}
  for (const a of attempts ?? []) { const t = tally[a.student_id] ??= { n: 0, sum: 0 }; t.n++; t.sum += a.score; last[a.student_id] ??= a }
  const overall = id => tally[id] ? tally[id].sum / tally[id].n : null
  const pct = x => x === null ? '—' : `${Math.round(x * 100)}%`
  const weekAgo = Date.now() - 7 * 864e5
  const readWeek = students.filter(s => last[s.id] && Date.parse(last[s.id].created_at) > weekAgo).length
  const done = students.filter(s => s.level >= MAX_LEVEL).length
  const ids = new Set(students.map(s => s.id)), all = (attempts ?? []).filter(a => ids.has(a.student_id)) // skip archived students' readings
  const avgAll = all.length ? all.reduce((t, a) => t + a.score, 0) / all.length : null

  const svg = d => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`
  const I = { kids: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><circle cx="17" cy="9" r="2.5"/><path d="M17 14.5a5 5 0 0 1 4.5 5"/>',
    chart: '<path d="M3 3v18h18"/><path d="m7 15 4-4 3 3 5-6"/>', mic: '<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v4"/>',
    flag: '<path d="M4 22V4M4 4h13l-2 4 2 4H4"/>', list: '<path d="M9 6h12M9 12h12M9 18h12M4 6h.01M4 12h.01M4 18h.01"/>', star: '<path d="m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z"/>' }
  const bigStat = (label, value, unit, icon, tone, fill, sub) => `<div class="gstat ${tone}"><div class="gstat-top"><span class="lbl">${label}</span><span class="gicon">${svg(I[icon])}</span></div>
    <p class="gnum"><b>${value}</b>${unit ? `<span>${unit}</span>` : ''}</p><div class="prog" aria-hidden="true"><span style="width:${Math.round(fill * 100)}%"></span></div><span class="sub">${sub}</span></div>`
  const n = students.length

  el.innerHTML = `<div class="flat"><div class="page-head"><div>
      <p class="head-meta"><span class="tag">${svg(I.star)}${reading ? 'Reading' : 'All classes'}</span><span class="muted small">· ${reading ? 'Pick who reads next' : `${sections.length} class${sections.length === 1 ? '' : 'es'}`}</span></p>
      <div class="head-line"><h1>${reading ? 'Who is reading today?' : 'Student List'}</h1>${n ? `<span class="live-pill"><i></i>${n} student${n === 1 ? '' : 's'}</span>` : ''}</div></div>
      <div class="acts">${reading ? '' : '<a href="#/read" class="cta-sun">Let a student read</a>'}<a href="#/"><button class="primary">Go to Classes</button></a></div></div>
    ${n ? `<div class="gstats">
      ${bigStat('Students', n, '', 'kids', '', 1, `in ${sections.length} class${sections.length === 1 ? '' : 'es'}`)}
      ${bigStat('Read this week', readWeek, `of ${n}`, 'mic', 'sun', readWeek / n, `${n - readWeek} still to read`)}
      ${bigStat('Overall score', pct(avgAll), '', 'chart', 'ok', avgAll ?? 0, `average of ${all.length} reading${all.length === 1 ? '' : 's'}`)}
      ${bigStat('All levels done', done, done === 1 ? 'student' : 'students', 'flag', 'blue', done / n, `of ${n} students`)}
    </div>` : ''}
    <section class="card">
    <div class="card-h roster-h"><span class="hicon">${svg(I.list)}</span><span><h2>${reading ? 'Choose a reader' : 'All students'}</h2><span class="muted small">${reading ? 'Find the student and press Read' : 'Level, overall score and last reading'}</span></span>
      <span class="roster-tools"><span class="find-in">${svg('<path d="M3 6h18M7 12h10M10 18h4"/>')}<input id="q" type="search" placeholder="Find student…" aria-label="Search students"></span>
        <select id="fc" aria-label="Filter by class"><option value="">All classes</option>${sections.map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('')}</select>
        <select id="fl" aria-label="Filter by level"><option value="">All levels</option>${Object.keys(fams).map(Number).sort((a, b) => a - b)
          .map(f => `<option value="${f}">${familyLabel(f, fams)}</option>`).join('')}<option value="done">All levels done</option></select>
        <span class="count-chip" id="count" role="status"></span></span></div>
    <table class="roster-table"><thead><tr><th>Student</th><th>Level</th><th>Overall</th><th>Last reading</th><th></th></tr></thead><tbody id="list"></tbody></table>
    <div class="roster-foot"><span class="muted small">Tip: tap a student to see every reading and the words they missed. To add, move or change students, go to <a href="#/">Classes</a>.</span></div>
    </section></div>`

  const when = iso => { const d = Math.floor((Date.now() - Date.parse(iso)) / 864e5); return d < 1 ? 'Today' : d < 2 ? 'Yesterday' : `${d} days ago` }
  const draw = () => {
    const q = $('#q', el).value.trim().toLowerCase(), fc = $('#fc', el).value, fl = $('#fl', el).value
    const inLevel = s => !fl || (fl === 'done' ? s.level >= MAX_LEVEL : s.level < MAX_LEVEL && s.family_no === +fl)
    const shown = students.filter(s => (!q || s.name.toLowerCase().includes(q)) && (!fc || s.section_id === fc) && inLevel(s))
    $('#count', el).innerHTML = `Showing <b>${shown.length}</b> of ${n}`
    $('#list', el).innerHTML = shown.map(s => {
      const l = lessonFor(lessons, s), o = overall(s.id), la = last[s.id]
      return `<tr data-href="#/students/${s.id}"><td class="name"><span class="who-cell"><span class="ini" aria-hidden="true">${esc(s.name.trim()[0] ?? '?')}</span><span><a href="#/students/${s.id}">${esc(s.name)}</a><br><span class="muted small">${esc(className[s.section_id] || '')}</span></span></span></td>
        <td data-label="Level">${s.level >= MAX_LEVEL ? '<b>All levels done</b>' : `<b class="nowrap">${esc(familyLabel(s.family_no, fams))}</b><br><span class="muted nowrap">${stageLabel(s.level)}</span>`}</td>
        <td data-label="Overall"><span class="ov"><b>${pct(o)}</b><span class="prog ok" aria-hidden="true"><span style="width:${(o ?? 0) * 100}%"></span></span></span></td>
        <td data-label="Last reading">${la ? `<span class="tag ${la.passed ? 'ok' : 'bad'}">${Math.round(la.score * 100)}% ${la.passed ? '✓' : '✗'}</span><br><span class="muted small">${when(la.created_at)}</span>` : '<span class="tag warn">Not yet</span>'}</td>
        <td class="act" style="text-align:right">${l ? `<a href="#/assess/${s.id}/${l.id}"><button class="primary">Read</button></a>` : ''}</td></tr>`
    }).join('') || `<tr><td colspan="5" class="muted">${n ? 'No students match.' : 'No students yet.'}</td></tr>`
  }
  ;['q', 'fc', 'fl'].forEach(id => $('#' + id, el).oninput = draw)
  try { $('#q', el).value = sessionStorage.getItem('find') ?? ''; sessionStorage.removeItem('find') } catch {} // from the top-bar search
  draw()
}
