import { supabase } from '../lib/supabase.js'
import { GRADES, LEVELS } from '../lib/levels.js'
import { getPassing, savePassing } from '../lib/passing.js'
import { esc, $, ask } from '../app.js'

const pctVal = x => x == null ? '' : Math.round(x * 100)

// Grade level + section setup. Required and unique are enforced by the DB (migration 0002).
export async function render(el) {
  const [{ data: sections, error }, passing, { data: kids }] = await Promise.all([
    supabase.from('sections').select('id, grade, section').is('archived_at', null).order('section'),
    getPassing(),
    supabase.from('students').select('section_id').is('archived_at', null),
  ])
  const count = id => (kids ?? []).filter(k => k.section_id === id).length
  const svg = d => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`
  const KIDS = '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><circle cx="17" cy="9" r="2.5"/><path d="M17 14.5a5 5 0 0 1 4.5 5"/>'
  const PEN = '<path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>', BIN = '<path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/>'
  // one class card per section (same card as the Dashboard, My Classes mockup)
  const card = (s, i) => { const n = count(s.id); return `<article class="ccard" data-id="${s.id}" data-grade="${esc(s.grade)}" data-name="${esc(s.section)}">
      <div class="ccard-top v${i % 4}"><span class="ccard-row"><span class="tag">${esc(s.grade)}</span><span class="cinit" aria-hidden="true">${esc(s.section.trim()[0] ?? '?')}</span></span>
        <span><span class="ccard-sub">Section</span><h3>${esc(s.section)}</h3></span></div>
      <div class="ccard-body">
        <p class="ccard-meta"><span class="ic-line">${svg(KIDS)}${n} student${n === 1 ? '' : 's'}</span><span class="tag ${n ? 'ok' : 'warn'}">${n ? 'Ready' : 'No students yet'}</span></p>
        <div class="rename-slot"></div>
        <div class="ccard-acts"><a href="#/" data-cls="${s.id}"><button class="primary">${n ? 'Open class' : 'Add students'}</button></a>
          <button type="button" class="ibtn" data-rename title="Rename" aria-label="Rename ${esc(s.grade)} – ${esc(s.section)}">${svg(PEN)}</button>
          <button type="button" class="ibtn" data-del title="Delete" aria-label="Delete ${esc(s.grade)} – ${esc(s.section)}">${svg(BIN)}</button></div>
      </div></article>` }
  if (error) { el.innerHTML = `<p class="bad">${esc(error.message)}</p>`; return }

  const step = (n, label, sub, href) => `<a class="wstep${n === 1 ? ' now' : ''}" href="${href}"${n === 1 ? ' aria-current="step"' : ''}><span class="wnum">${n}</span><span><span class="kicker">Step ${n}</span><b>${label}</b><span class="muted small">${sub}</span></span></a>`
  el.innerHTML = `<div class="flat"><div class="page-head"><div><span class="tag">Class setup</span><h1>Set up your classes</h1>
      <p class="muted" style="margin:4px 0 0">Add each grade level and section you teach. Every section becomes a class.</p></div>
      <div class="acts"><a href="#/archive"><button>Archive</button></a></div></div>
    <nav class="wsteps card" aria-label="Getting started">
      ${step(1, 'Add a class', 'Grade and section', '#/setup')}${step(2, 'Add students', 'Names and starting level', '#/')}
      ${step(3, 'Pick lessons', 'Ready-made or your own', '#/lessons')}${step(4, 'Start reading', 'Basa listens and scores', '#/students')}
    </nav>
    <div class="tabs" role="tablist">
      <button type="button" role="tab" id="t-sec" aria-controls="tab-sec" aria-selected="true">Level &amp; Section</button>
      <button type="button" role="tab" id="t-pass" aria-controls="tab-pass" aria-selected="false">Passing Average</button>
    </div>
    <div id="tab-sec" role="tabpanel" aria-labelledby="t-sec" class="flat">
    <form id="add" class="card wcard" novalidate>
      <h2><span class="wn">01</span>Class details</h2>
      <fieldset class="chips"><legend>Grade level</legend>
        ${GRADES.map(g => `<label><input type="radio" name="grade" value="${g}" required><span>${g}</span></label>`).join('')}</fieldset>
      <label for="sec-name">Section name</label>
      <div class="row" style="margin:0"><input id="sec-name" name="section" required placeholder="e.g. Sampaguita" autocomplete="off" style="flex:1;min-width:200px">
        <button class="primary">Add section</button></div>
      <p id="msg" role="status" aria-live="polite"></p>
    </form>
    <section class="wcard"><h2><span class="wn">02</span>Your classes <span class="tag">${sections.length}</span></h2>
    ${sections.length ? `<div class="ccards">${GRADES.flatMap(g => sections.filter(s => s.grade === g)).map(card).join('')}</div>` : '<p class="muted card">No sections yet.</p>'}
    ${sections.length ? '<div class="row" style="margin-bottom:0"><a href="#/"><button class="primary">Next: add students →</button></a></div>' : ''}
    </section>
    </div>
    <div id="tab-pass" role="tabpanel" aria-labelledby="t-pass" class="card" hidden>
    <p class="muted" style="margin-top:0">The average a student needs to pass a reading. Leave a box empty to use the default (80%). A stage box beats the overall one.</p>
    <form id="pass" class="prof" novalidate>
      <div class="wide"><label for="p-overall">Overall average (%) <span class="muted">(used for every stage without its own)</span></label>
        <input id="p-overall" type="number" min="1" max="100" inputmode="numeric" placeholder="80 (default)" value="${pctVal(passing.overall)}"></div>
      <div class="wide"><b>Per stage</b> <span class="muted">(optional, e.g. Words 70%, Short Story 90%)</span></div>
      ${Object.entries(LEVELS).map(([n, name]) => `<div><label for="p-s${n}">Stage ${n} · ${name} (%)</label>
        <input id="p-s${n}" data-stage="${n}" type="number" min="1" max="100" inputmode="numeric" placeholder="default" value="${pctVal(passing.stage?.[n])}"></div>`).join('')}
      <div class="row wide"><button class="primary">Save passing average</button><span id="pmsg" role="status"></span></div>
    </form>
    </div></div>`

  for (const tab of el.querySelectorAll('[role=tab]')) tab.onclick = () => {
    for (const t of el.querySelectorAll('[role=tab]')) {
      t.setAttribute('aria-selected', t === tab)
      $('#' + t.getAttribute('aria-controls'), el).hidden = t !== tab
    }
  }
  const pmsg = $('#pmsg', el)
  $('#pass', el).onsubmit = async e => {
    e.preventDefault()
    const say = (t, k = '') => { pmsg.textContent = t; pmsg.className = k }
    const cfg = { stage: {} }
    for (const input of e.target.querySelectorAll('input')) {
      const raw = input.value.trim()
      if (!raw) continue // empty = use the default
      const v = Number(raw)
      if (!(v >= 1 && v <= 100)) { input.focus(); return say('Use a number from 1 to 100, or leave it empty.', 'bad') }
      if (input.id === 'p-overall') cfg.overall = v / 100
      else cfg.stage[input.dataset.stage] = v / 100
    }
    say('Saving…')
    const { error } = await savePassing(cfg)
    error ? say(error.message, 'bad') : say('Saved.', 'ok')
  }
  const msg = $('#msg', el)
  const fail = (text, input) => { msg.textContent = text; msg.className = 'bad'; if (input) { input.setAttribute('aria-invalid', 'true'); input.focus() } }
  const why = (e, grade, section) => e.code === '23505' ? `${grade} – ${section} already exists.` : e.message
  el.querySelectorAll('#add [name]').forEach(i => i.oninput = () => { i.removeAttribute('aria-invalid'); msg.textContent = '' })

  $('#add', el).onsubmit = async e => {
    e.preventDefault()
    const f = e.target, grade = f.grade.value, section = f.section.value.trim()
    if (!grade) return fail('Choose a grade level.', $('[name=grade]', f))
    if (!section) return fail('Enter a section name.', f.section)
    const { error } = await supabase.from('sections').insert({ grade, section })
    error ? fail(why(error, grade, section), f.section) : render(el)
  }
  el.querySelectorAll('[data-cls]').forEach(x => x.onclick = () => { try { localStorage.setItem('class', x.dataset.cls) } catch {} })
  el.querySelectorAll('.ccard[data-id]').forEach(card => {
    const id = card.dataset.id, grade = card.dataset.grade, old = card.dataset.name
    // inline rename: a text box opens inside the card; Enter saves, Escape cancels
    $('[data-rename]', card).onclick = () => {
      const slot = $('.rename-slot', card)
      slot.innerHTML = `<form class="row" style="margin:0"><input value="${esc(old)}" aria-label="New section name" required style="flex:1;min-width:0">
        <button class="primary">Save</button><button type="button">Cancel</button></form>`
      const form = $('form', slot), input = $('input', form)
      input.focus(); input.select()
      $('[type=button]', form).onclick = () => render(el)
      input.onkeydown = e => e.key === 'Escape' && render(el)
      form.onsubmit = async e => {
        e.preventDefault()
        const section = input.value.trim()
        if (!section) return fail('Enter a section name.', input)
        if (section === old) return render(el)
        const { error } = await supabase.from('sections').update({ section }).eq('id', id)
        error ? fail(why(error, grade, section), input) : render(el)
      }
    }
    $('[data-del]', card).onclick = async () => {
      const name = `${grade} – ${old}`
      if (!await ask(`Delete ${name}?`, 'Are you sure? The class and its students move to the Archive, where you can restore them.', 'Delete class')) return
      const at = new Date().toISOString()
      const { error } = await supabase.from('sections').update({ archived_at: at }).eq('id', id)
      if (error) return fail(error.message)
      await supabase.from('students').update({ archived_at: at }).eq('section_id', id).is('archived_at', null)
      render(el)
    }
  })
}
