import { supabase } from '../lib/supabase.js'
import { LEVELS, MAX_LEVEL, familyNames, familyLabel, stageLabel, lessonFor } from '../lib/levels.js'
import { esc, $, ask } from '../app.js'

// a student's level = CVC family; step inside it = Words → Phrases → Sentences → Short Story (5 = all done)
const famOpts = (fams, cur) => Object.keys(fams).map(Number).sort((a, b) => a - b)
  .map(n => `<option value="${n}" ${n === cur ? 'selected' : ''}>${familyLabel(n, fams)}</option>`).join('')
const remembered = () => { try { return localStorage.getItem('class') } catch { return null } }
const remember = id => { try { localStorage.setItem('class', id) } catch {} }

// One class at a time (picked from a dropdown), so teachers never mix up sections.
export async function render(el) {
  const [{ data: sections }, { data: lessons }] = await Promise.all([
    supabase.from('sections').select('id, name').is('archived_at', null).order('name'),
    supabase.from('lessons').select('id, level, family, family_no').is('archived_at', null).order('created_at', { ascending: false }),
  ])
  const setupBtn = label => `<a href="#/setup"><button>${label}</button></a>`
  if (!sections.length) {
    el.innerHTML = `<h1>Classes</h1><p class="muted">No classes yet. Add a grade level and section first.</p><div class="row">${setupBtn('Open Setup')}</div>`
    return
  }
  const cls = sections.find(s => s.id === remembered()) || sections[0]
  const { data: students } = await supabase.from('students').select('id, name, level, family_no, prev_level, prev_family_no').is('archived_at', null).eq('section_id', cls.id).order('name')
  // latest reading score per student per level (attempts come newest first, so the first one seen wins)
  const { data: attempts } = students.length
    ? await supabase.from('attempts').select('student_id, score, passed, created_at, lessons(level, family_no)').in('student_id', students.map(s => s.id)).order('created_at', { ascending: false })
    : { data: [] }
  const latest = {}
  for (const a of attempts ?? []) latest[`${a.student_id}:${a.lessons?.family_no ?? ''}:${a.lessons?.level}`] ??= a
  // overall score = average of every reading a student has done (same definition as the student page)
  const tally = {}
  for (const a of attempts ?? []) { const t = tally[a.student_id] ??= { n: 0, sum: 0 }; t.n++; t.sum += a.score }
  const overall = st => tally[st.id] ? tally[st.id].sum / tally[st.id].n : null
  const pct = x => x === null ? '—' : `${Math.round(x * 100)}%`
  const total = (attempts ?? []).length ? attempts.reduce((t, a) => t + a.score, 0) / attempts.length : null
  // a teacher's own lessons have no family, so they count for whichever family the student is in
  const scoreAt = (st, fam, lv) => latest[`${st.id}:${fam}:${lv}`] ?? latest[`${st.id}::${lv}`]
  const fams = familyNames(lessons)
  const scoreTag = a => a ? `<span class="nowrap"><b class="${a.passed ? 'ok' : ''}">${Math.round(a.score * 100)}%</b> <span class="muted small">${a.passed ? '✓' : '✗'}</span></span>` : ''
  const short = (fam, n) => n >= MAX_LEVEL ? 'All done' : `L${fam}${fams[fam] ? ` ${fams[fam]}` : ''} · S${n} ${LEVELS[n]}`
  const others = sections.filter(s => s.id !== cls.id)

  const done = students.filter(st => st.level >= MAX_LEVEL).length
  const svg = d => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`
  const I = { chart: '<path d="M3 3v18h18"/><path d="m7 15 4-4 3 3 5-6"/>', book: '<path d="M12 6.5C9.5 4.8 6 4.5 3 5.3v13c3-.8 6.5-.5 9 1.2 2.5-1.7 6-2 9-1.2v-13c-3-.8-6.5-.5-9 1.2zM12 6.5v13"/>',
    check: '<circle cx="12" cy="12" r="10"/><path d="m8 12 3 3 5-6"/>', flag: '<path d="M4 22V4M4 4h13l-2 4 2 4H4"/>', mic: '<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v4"/>',
    list: '<path d="M9 6h12M9 12h12M9 18h12M4 6h.01M4 12h.01M4 18h.01"/>', print: '<path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>',
    school: '<path d="M2 10 12 5l10 5-10 5z"/><path d="M6 12v5c3 2 9 2 12 0v-5"/>', star: '<path d="m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z"/>', layers: '<path d="M12 3 2 8l10 5 10-5zM2 13l10 5 10-5"/>' }
  const all = attempts ?? [], passed = all.filter(a => a.passed).length, readers = new Set(all.map(a => a.student_id)).size
  const weekAgo = Date.now() - 7 * 864e5, readThisWeek = new Set(all.filter(a => Date.parse(a.created_at) > weekAgo).map(a => a.student_id))
  const waiting = students.filter(st => st.level < MAX_LEVEL && !readThisWeek.has(st.id))
  const bigStat = (label, value, unit, icon, tone, fill, sub) => `<div class="gstat ${tone}"><div class="gstat-top"><span class="lbl">${label}</span><span class="gicon">${svg(I[icon])}</span></div>
    <p class="gnum"><b>${value}</b>${unit ? `<span>${unit}</span>` : ''}</p><div class="prog" aria-hidden="true"><span style="width:${Math.round(fill * 100)}%"></span></div><span class="sub">${sub}</span></div>`
  // students per stage (Words, Phrases, Sentences, Story) for the bottom card
  const byStage = [1, 2, 3, 4].map(n => [n, students.filter(st => st.level === n).length])
  const ranked = students.filter(st => overall(st) !== null).sort((x, y) => overall(y) - overall(x))
  el.innerHTML = `<div class="flat"><div class="page-head"><div><p class="head-meta"><span class="tag">${svg(I.star)}Class roster</span><span class="muted small">· Reading progress</span></p>
      <div class="head-line"><h1>Classes</h1>${students.length ? `<span class="live-pill"><i></i>${students.length} student${students.length === 1 ? '' : 's'}</span>` : ''}</div></div>
      <div class="acts">
        <span class="sel-chip">${svg(I.school)}<select id="cls" aria-label="Class">${sections.map(s => `<option value="${s.id}" ${s.id === cls.id ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select></span>
        <button id="addBtn" class="sunbtn" aria-expanded="false" aria-controls="add">+ Add students</button>
        ${students.length ? '<button id="pickMode" aria-pressed="false">Move students</button>' : ''}
      </div>
    </div>
    ${students.length ? `<div class="gstats">
      ${bigStat('Class overall', pct(total), '', 'chart', '', total ?? 0, `average of ${all.length} reading${all.length === 1 ? '' : 's'}`)}
      ${bigStat('Readings', all.length, '', 'book', 'sun', students.length ? readers / students.length : 0, `${readers} of ${students.length} students have read`)}
      ${bigStat('Passed', passed, '', 'check', 'ok', all.length ? passed / all.length : 0, `${all.length ? Math.round((passed / all.length) * 100) : 0}% of readings passed`)}
      ${bigStat('All levels done', done, done === 1 ? 'student' : 'students', 'flag', 'blue', students.length ? done / students.length : 0, `of ${students.length} in this class`)}
    </div>
    ${waiting.length ? `<section class="spot"><span class="spot-icon">${svg(I.mic)}</span><span class="spot-text"><span class="row" style="margin:0;gap:8px"><span class="tag glass">Still to read this week</span><span class="small">${esc(cls.name)}</span></span>
      <b>${waiting.length} student${waiting.length === 1 ? ' hasn’t' : 's haven’t'} read this week</b><span class="small">${waiting.slice(0, 4).map(st => esc(st.name)).join(', ')}${waiting.length > 4 ? ` and ${waiting.length - 4} more` : ''}</span></span>
      <a href="#/read" class="spot-btn">Let a student read</a></section>` : ''}` : ''}

      <form id="add" class="addbox" novalidate hidden>
        <b>Add students to ${esc(cls.name)}</b>
        <table><thead><tr><th>Student name</th><th>Starting level</th><th style="width:56px"></th></tr></thead><tbody id="rows"></tbody></table>
        <p class="muted small" style="margin:0">Press Enter for the next row. Pasting a list of names fills one row each.</p>
        <div class="row" style="margin:0"><button type="button" id="addRow">+ Add row</button>
          <span style="margin-left:auto" class="row"><button type="button" id="cancelAdd">Cancel</button><button class="primary">Save students</button></span></div>
      </form>
    <p id="msg" role="status" aria-live="polite"></p>

    ${students.length ? `
    <section class="card">
    <div class="print-head"><b>Basa · ${esc(cls.name)}</b> · ${new Date().toLocaleDateString()} · Class overall ${pct(total)} from ${attempts.length} reading${attempts.length === 1 ? '' : 's'}</div>
    <div class="card-h roster-h"><span class="hicon">${svg(I.list)}</span><span><h2>Student roster</h2><span class="muted small">Level, latest stage score and overall score</span></span>
      <span class="roster-tools"><span class="find-in">${svg('<path d="M3 6h18M7 12h10M10 18h4"/>')}<input id="rfind" type="search" placeholder="Find student…" aria-label="Find student"></span><span class="count-chip">Showing <b id="rcount">${students.length}</b> of ${students.length}</span></span></div>
    <div class="row bulk" id="bulk" hidden>
      <b id="count">Tick the students to move</b>
      ${others.length ? `<select id="moveTo" aria-label="Move to class" disabled><option value="">Move to…</option>${others.map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('')}</select>` : ''}
      <select id="setLevel" aria-label="Set level" disabled><option value="">Set level…</option>${famOpts(fams, 0)}</select>
      <button id="delSel" disabled>Remove</button>    </div>
    <table id="list"><thead><tr>
      <th class="pick" style="width:40px"><input type="checkbox" id="all" aria-label="Select all students"></th>
      <th>Student</th><th>Prev level</th><th>Level</th><th>Stage score</th><th>Overall</th><th class="act"></th></tr></thead><tbody>
    ${students.map(st => {
      const l = lessonFor(lessons, st), a = scoreAt(st, st.family_no, st.level)
      return `<tr data-stu="${st.id}" data-href="#/students/${st.id}" data-name="${esc(st.name.toLowerCase())}">
        <td class="pick"><input type="checkbox" data-pick aria-label="Select ${esc(st.name)}"></td>
        <td class="name"><span class="who-cell"><span class="ini" aria-hidden="true">${esc(st.name.trim()[0] ?? '?')}</span><a href="#/students/${st.id}">${esc(st.name)}</a></span></td>
        <td data-label="Prev level"><span class="muted">${st.prev_level ? short(st.prev_family_no ?? st.family_no, st.prev_level) : '—'}</span> ${st.prev_level ? scoreTag(scoreAt(st, st.prev_family_no ?? st.family_no, st.prev_level)) : ''}</td>
        <td data-label="Level">${st.level >= MAX_LEVEL ? '<b>All levels done</b>' : `<b class="nowrap">${esc(familyLabel(st.family_no, fams))}</b><br><span class="muted nowrap">${stageLabel(st.level)}</span>`}</td>
        <td data-label="Stage score">${a ? `<span class="tag ${a.passed ? 'ok' : 'bad'}">${Math.round(a.score * 100)}% ${a.passed ? '✓' : '✗'}</span>` : '<span class="muted">—</span>'}</td>
        <td data-label="Overall"><span class="ov"><b>${pct(overall(st))}</b><span class="prog ok" aria-hidden="true"><span style="width:${(overall(st) ?? 0) * 100}%"></span></span></span></td>
        <td class="act">${l ? `<a href="#/assess/${st.id}/${l.id}"><button class="primary">Read</button></a>`
          : `<span class="muted small nowrap">${st.level < MAX_LEVEL ? 'No lesson yet' : 'Finished'}</span>`}</td></tr>`
    }).join('')}
    </tbody></table>
    <div class="roster-foot"><span class="muted small">Tip: tap a student to see every reading and the words they missed.</span>
      <span class="row" style="margin:0"><button id="csv">Download for Excel</button><button id="print" class="primary">${svg(I.print)} Print / Save as PDF</button></span></div></section>
    <div class="cols cols-2-1">
      <section class="card">${`<div class="card-h"><span class="hicon star">${svg(I.layers)}</span><span><h2>Class by stage</h2><span class="muted small">Where this class's readers are now</span></span><span class="tag">${students.length - done} reading</span></div>`}
        <div class="stage-grid">${byStage.map(([n, c]) => `<div class="stage-m"><p class="ccard-meta"><b>${LEVELS[n]}</b><span class="tag ${['', 'ok', 'warn', '', 'bad'][n]}">${c}</span></p>
          <div class="prog ${['', 'ok', 'sun', '', ''][n]}" aria-hidden="true"><span style="width:${students.length ? (c / students.length) * 100 : 0}%"></span></div><span class="muted small">Stage ${n} · ${students.length ? Math.round((c / students.length) * 100) : 0}% of class</span></div>`).join('')}</div>
        ${ranked[0] ? `<p class="tipbar">${svg(I.star)}<span><b>Celebrate ${esc(ranked[0].name)}</b> — highest overall score in this class (${pct(overall(ranked[0]))}).</span><a href="#/students/${ranked[0].id}" class="side-link">See progress →</a></p>` : ''}</section>
      <section class="card"><div class="card-h"><span class="hicon bolt">${svg(I.star)}</span><span><h2>Top readers</h2><span class="muted small">Best overall score</span></span></div>
        ${ranked.length ? `<div class="rq">${ranked.slice(0, 3).map((st, i) => `<a class="rq-row" href="#/students/${st.id}"><span class="ini" aria-hidden="true">${i + 1}</span><span><b>${esc(st.name)}</b><span class="muted small">${tally[st.id].n} reading${tally[st.id].n === 1 ? '' : 's'}</span></span><span class="tag ok">${pct(overall(st))}</span></a>`).join('')}</div>`
          : '<p class="muted">No readings yet.</p>'}
        <a href="#/read" class="side-link">Start a reading →</a></section>
    </div>` : `<p class="muted card">No students in ${esc(cls.name)} yet.</p>`}</div>`

  const msg = $('#msg', el)
  const say = (text, kind = '') => { msg.textContent = text; msg.className = kind }
  const run = async (q, done) => {
    const { error } = await q
    if (error) return say(error.message, 'bad')
    await render(el) // redraw replaces #msg, so report success on the new one
    if (done) Object.assign($('#msg', el), { textContent: done, className: 'ok' })
  }

  // ponytail: CSV opens in Excel; a real .xlsx needs a library. PDF = the browser's print dialog ("Save as PDF").
  $('#print', el)?.addEventListener('click', () => print())
  $('#csv', el)?.addEventListener('click', () => {
    const cell = v => `"${String(v ?? '').replace(/"/g, '""')}"`
    const rows = [['Student', 'Class', 'Level', 'Stage', 'Stage score', 'Overall score', 'Readings']].concat(students.map(st => {
      const a = scoreAt(st, st.family_no, st.level), done = st.level >= MAX_LEVEL
      return [st.name, cls.name, done ? 'All levels done' : familyLabel(st.family_no, fams), done ? '' : stageLabel(st.level),
        a ? pct(a.score) : '', pct(overall(st)).replace('—', ''), tally[st.id]?.n ?? 0]
    })).concat([['Class overall', '', '', '', '', pct(total).replace('—', ''), attempts.length]])
    const url = URL.createObjectURL(new Blob(['\uFEFF' + rows.map(r => r.map(cell).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' }))
    Object.assign(document.createElement('a'), { href: url, download: `${cls.name}.csv` }).click()
    URL.revokeObjectURL(url)
  })

  $('#cls', el).onchange = e => { remember(e.target.value); render(el) }
  $('#rfind', el)?.addEventListener('input', e => {
    const q = e.target.value.trim().toLowerCase(); let n = 0
    el.querySelectorAll('#list tbody tr').forEach(tr => { const hit = !q || tr.dataset.name.includes(q); tr.hidden = !hit; n += hit })
    $('#rcount', el).textContent = n
  })

  // add-students table: one row per student, each with its own starting level
  const rows = $('#rows', el)
  const addRow = (name = '', level = +(rows.lastElementChild?.querySelector('select').value || 1)) => {
    const tr = document.createElement('tr')
    tr.innerHTML = `<td><input aria-label="Student name" placeholder="Juan Dela Cruz" autocomplete="off"></td>
      <td><select aria-label="Starting level (word family)">${famOpts(fams, level)}</select></td>
      <td><button type="button" aria-label="Remove row">✕</button></td>`
    const input = $('input', tr)
    input.value = name
    input.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); addRow().focus() } }
    input.onpaste = e => { // a pasted list becomes one row per name
      const names = e.clipboardData.getData('text').split(/\r?\n/).map(n => n.trim()).filter(Boolean)
      if (names.length < 2) return
      e.preventDefault()
      input.value = names.shift()
      names.forEach(n => addRow(n, +$('select', tr).value))
    }
    $('button', tr).onclick = () => { tr.remove(); rows.children.length || addRow() }
    rows.append(tr)
    return input
  }
  addRow()
  $('#addRow', el).onclick = () => addRow().focus()
  // one panel at a time: opening "Add students" closes "Move students" and vice versa
  let closeMove = () => {}
  const addOpen = on => {
    $('#add', el).hidden = !on
    $('#addBtn', el).textContent = on ? '✕ Close' : '+ Add students'
    $('#addBtn', el).setAttribute('aria-expanded', on)
    if (on) { closeMove(); $('input', rows).focus() } else { rows.replaceChildren(); addRow(); say('') }
  }
  $('#addBtn', el).onclick = () => addOpen($('#add', el).hidden)
  $('#cancelAdd', el).onclick = () => addOpen(false)
  if (!students.length) addOpen(true) // empty class: start with the form open

  $('#add', el).onsubmit = e => {
    e.preventDefault()
    const seen = new Set(), list = []
    for (const tr of rows.children) {
      const name = $('input', tr).value.trim()
      if (name && !seen.has(name.toLowerCase())) { seen.add(name.toLowerCase()); list.push({ section_id: cls.id, name, family_no: +$('select', tr).value, level: 1 }) }
    }
    if (!list.length) { $('input', rows).focus(); return say('Type at least one student name.', 'bad') }
    run(supabase.from('students').insert(list), `Added ${list.length} student${list.length > 1 ? 's' : ''}.`)
  }


  // "Move students" mode: tick boxes + action bar appear only while moving, so they don't take space otherwise
  if (!students.length) return
  const picks = [...el.querySelectorAll('[data-pick]')]
  const chosen = () => picks.filter(p => p.checked).map(p => p.closest('tr').dataset.stu)
  let picking = false
  const mode = on => {
    picking = on
    $('#list', el).classList.toggle('picking', on)
    $('#bulk', el).hidden = !on
    $('#pickMode', el).textContent = on ? '✕ Close' : 'Move students' // same button opens and closes
    $('#pickMode', el).setAttribute('aria-pressed', on)
    if (!on) { picks.forEach(p => p.checked = false); sync() } else { if (!$('#add', el).hidden) addOpen(false); picks[0]?.focus() }
  }
  closeMove = () => picking && mode(false)
  $('#pickMode', el).onclick = () => mode(!picking)
  $('#bulk', el).onkeydown = $('#list', el).onkeydown = e => { if (e.key === 'Escape' && picking) mode(false) }
  const sync = () => {
    const n = chosen().length
    $('#count', el).textContent = n ? `${n} selected` : 'Tick the students to move'
    el.querySelectorAll('#moveTo, #setLevel, #delSel').forEach(c => { c.disabled = !n })
    $('#all', el).checked = n === picks.length
    $('#all', el).indeterminate = n > 0 && n < picks.length
  }
  picks.forEach(p => p.onchange = sync)
  // while moving students, a row click ticks the student instead of opening their page
  $('#list', el).addEventListener('click', e => {
    const tr = e.target.closest('tr[data-stu]')
    if (!picking || !tr || e.target.closest('a, button, select, input, label')) return
    e.stopPropagation()
    const box = $('[data-pick]', tr); box.checked = !box.checked; sync()
  })
  $('#all', el).onchange = e => { picks.forEach(p => p.checked = e.target.checked); sync() }
  $('#moveTo', el)?.addEventListener('change', e => e.target.value &&
    run(supabase.from('students').update({ section_id: e.target.value }).in('id', chosen()), 'Moved.'))
  $('#setLevel', el).onchange = e => e.target.value &&
    run(supabase.from('students').update({ family_no: +e.target.value, level: 1 }).in('id', chosen()), 'Level updated.')
  $('#delSel', el).onclick = async () => {
    const n = chosen().length
    if (!await ask(`Remove ${n} student${n === 1 ? '' : 's'}?`, 'Are you sure? They move to the Archive, where you can restore them with all their readings.', 'Remove')) return
    run(supabase.from('students').update({ archived_at: new Date().toISOString() }).in('id', chosen()), 'Moved to the Archive.')
  }
}
