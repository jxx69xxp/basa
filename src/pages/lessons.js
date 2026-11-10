import { supabase } from '../lib/supabase.js'
import { LEVELS, familyNames, familyLabel, stageLabel, lessonFor } from '../lib/levels.js'
import { synth } from '../lib/speech.js'
import { esc, $, ask } from '../app.js'

const LANGS = { 'en-US': 'English', 'fil-PH': 'Tagalog / Filipino', 'ceb-PH': 'Bisaya / Cebuano' }
let pending = null // draft handed over from the file drop (Task 7)
export const openDraft = draft => { pending = draft; location.hash = '#/lessons/new' }

export function render(el, [id]) { return id ? editor(el, id) : list(el) }

async function list(el) {
  const [{ data }, { data: students }, { data: attempts }] = await Promise.all([
    supabase.from('lessons').select('*').is('archived_at', null).order('family_no', { nullsFirst: true }).order('level').order('created_at'),
    supabase.from('students').select('id, name, level, family_no').is('archived_at', null),
    supabase.from('attempts').select('student_id, lesson_id, score, passed, created_at').order('created_at', { ascending: false }),
  ])
  const fams = familyNames(data), mine = data.filter(l => l.teacher_id), kids = students ?? [], tries = attempts ?? []
  let show = ''
  try { show = sessionStorage.getItem('lessonFilter') ?? '' } catch {}
  // no saved choice: your own lessons first if you have any, else start teachers at built-in Level 1
  if (!show || (show === 'mine' && !mine.length)) show = mine.length ? 'all' : '1'
  const byId = Object.fromEntries(data.map(l => [l.id, l])), kidName = Object.fromEntries(kids.map(k => [k.id, k.name]))
  // who is on which lesson now (the lesson the Read button would open for them)
  const onLesson = {}
  for (const k of kids) { const l = lessonFor(data, k); if (l) (onLesson[l.id] ??= []).push(k) }
  const DAY = 864e5, weekAgo = Date.now() - 7 * DAY, monthAgo = Date.now() - 30 * DAY
  const week = tries.filter(t => Date.parse(t.created_at) > weekAgo), month = tries.filter(t => Date.parse(t.created_at) > monthAgo)
  const featId = Object.keys(onLesson).sort((x, y) => onLesson[y].length - onLesson[x].length)[0], feat = byId[featId]
  const LANG_SHORT = { 'en-US': 'English', 'fil-PH': 'Tagalog', 'ceb-PH': 'Bisaya' }
  const svg = d => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`
  const BOOK = '<path d="M12 6.5C9.5 4.8 6 4.5 3 5.3v13c3-.8 6.5-.5 9 1.2 2.5-1.7 6-2 9-1.2v-13c-3-.8-6.5-.5-9 1.2zM12 6.5v13"/>'
  const pctOf = (n, d) => d ? Math.round((n / d) * 100) : 0
  const title = l => l.family_no ? `${familyLabel(l.family_no, fams)} · ${LEVELS[l.level] ?? ''}` : l.title

  const featWeek = feat ? week.filter(t => t.lesson_id === feat.id) : []
  const featPassed = featWeek.filter(t => t.passed).length, featKids = feat ? onLesson[feat.id].length : 0
  // students on the featured lesson who read it this week (a child can read it more than once)
  const featRead = feat ? onLesson[feat.id].filter(k => featWeek.some(t => t.student_id === k.id)).length : 0
  el.innerHTML = `<div class="flat"><div class="page-head"><div><span class="tag">Leveled reading</span><h1>Lessons</h1></div>
      <div class="acts"><a href="#/archive"><button>Archive</button></a>
        <button id="newBtn" class="primary" aria-expanded="false" aria-controls="newPanel">+ New lesson</button></div></div>
    <div id="newPanel" class="addbox" hidden>
      <b>Make a new lesson</b>
      <div class="row" style="margin:0"><a href="#/lessons/new"><button>Type the words myself</button></a><span class="muted">or make it from a file:</span></div>
      <div id="drop"></div>
    </div>
    <div class="row toolbar">
      <div class="seg-pills" role="group" aria-label="Which lessons"><button type="button" data-show="all">All lessons (${data.length})</button><button type="button" data-show="mine">My lessons <span class="tag">${mine.length}</span></button></div>
      <label for="lf" class="sr-only">Level</label><select id="lf" aria-label="Show one level"><option value="">Pick a level…</option>
        ${Object.keys(fams).map(Number).sort((a, b) => a - b).map(n => `<option value="${n}">${esc(familyLabel(n, fams))}</option>`).join('')}</select>
    </div>
    <div class="lhub"><div class="lmain">
    ${feat ? `<section class="feat" aria-label="Featured lesson">
      <div class="feat-main"><p class="lcard-tags"><span class="tag sunny">★ Most students are here</span><span class="tag glass">${esc(LANG_SHORT[feat.language] ?? feat.language ?? '')}</span></p>
        <h2>${esc(title(feat))}</h2>
        <p>${featKids} student${featKids === 1 ? ' is' : 's are'} on this lesson now. ${feat.level === 4 ? `Story: “${esc(feat.title)}”.` : `Stage ${feat.level} of 4 in this level.`}</p>
        <p class="feat-chips"><span>${svg('<circle cx="12" cy="12" r="10"/><path d="m8 12 3 3 5-6"/>')}${featPassed} passed this week</span><span>${svg(BOOK)}${esc(stageLabel(feat.level))}</span></p></div>
      <div class="feat-side"><p class="ccard-meta"><span>Read it this week</span><b>${featRead}<small>/${featKids}</small></b></p>
        <div class="prog sun" aria-hidden="true"><span style="width:${pctOf(featRead, featKids)}%"></span></div>
        <p class="ccard-meta small"><span>${featKids - featRead} still to read</span><span>${pctOf(featPassed, featWeek.length)}% of readings passed</span></p>
        <a href="#/play/${feat.id}" class="cta-sun">${svg(BOOK)}Open lesson</a><a href="#/read" class="feat-ghost">Let a student read →</a></div>
    </section>` : ''}
    <div class="sec-head"><h2>All lessons <span class="tag" id="lcount"></span></h2><span class="muted small">By level, then stage</span></div>
    <div id="lrows"></div></div>
    <aside class="lside">
      <section class="card"><span class="kicker">● Review queue</span><h2 class="side-h">Recent readings <span class="tag ${tries.length ? 'warn' : ''}">${Math.min(tries.length, 6)}</span></h2>
        <p class="muted small">Tap a reading to see the words a student missed.</p>
        ${tries.length ? `<div class="rq">${tries.slice(0, 6).map(t => `<a class="rq-row" href="#/students/${t.student_id}"><span class="ini" aria-hidden="true">${esc((kidName[t.student_id] ?? '?').trim()[0] ?? '?')}</span>
          <span><b>${esc(kidName[t.student_id] ?? 'Student')}</b><span class="muted small">${esc(byId[t.lesson_id] ? title(byId[t.lesson_id]) : 'Lesson')}</span></span>
          <span class="tag ${t.passed ? 'ok' : 'bad'}">${Math.round(t.score * 100)}%</span></a>`).join('')}</div>
          <a href="#/read" class="side-link">Start another reading →</a>` : '<p class="muted">No readings yet. Open <a href="#/read">Reading</a> to start.</p>'}
      </section>
      <section class="card mini-stat"><span class="kicker">Last 30 days</span><p><b>${month.length}</b> reading${month.length === 1 ? '' : 's'} · <b>${month.filter(t => t.passed).length}</b> passed</p></section>
    </aside></div>
    ${month.length ? `<section class="milestone"><span class="ms-icon" aria-hidden="true">★</span><span><b>${month.filter(t => t.passed).length} passed readings this month!</b><span class="muted small">${new Set(month.filter(t => t.passed).map(t => t.student_id)).size} students passed at least one lesson in the last 30 days.</span></span><a href="#/dashboard" class="side-link">See the class →</a></section>` : ''}
    </div>`

  // one group per level, its stages in order as cards
  const STAGE_TONE = { 1: 'ok', 2: 'warn', 3: '', 4: 'bad' }
  const total = Math.max(kids.length, 1)
  // lesson card = class card format; built-in lessons are templates (striped header + "Basa template" tag)
  const card = l => {
    const on = onLesson[l.id]?.length ?? 0, tpl = !l.teacher_id
    const name = l.family_no ? (l.level === 4 ? `“${l.title}”` : familyLabel(l.family_no, fams)) : l.title
    return `<article class="ccard lcard2">
      <div class="ccard-top st${l.level}${tpl ? ' tpl' : ''}"><span class="ccard-row"><span class="tag">${tpl ? 'Basa template' : 'My lesson'}</span><span class="cinit" title="Stage ${l.level}">${l.level}</span></span>
        <span><span class="ccard-sub">Stage ${l.level} · ${esc(LEVELS[l.level] ?? 'Lesson')}</span><h3>${esc(name)}</h3></span></div>
      <div class="ccard-body">
        <p class="ccard-meta"><span class="ic-line">${svg('<circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15 15 0 0 1 0 20M12 2a15 15 0 0 0 0 20"/>')}${esc(LANG_SHORT[l.language] ?? l.language ?? '')}</span><span class="tag ${STAGE_TONE[l.level] ?? ''}">${esc(LEVELS[l.level] ?? '')}</span></p>
        <div class="mission">${svg(BOOK)}<span><span class="kicker">${tpl ? 'Ready to use' : 'Made by you'}</span><b>${l.family_no ? esc(familyLabel(l.family_no, fams)) : 'Any level'}</b></span></div>
        <div><p class="ccard-meta small"><span>Students on this lesson</span><b>${on}<span class="muted"> / ${kids.length}</span></b></p>
          <div class="prog ${on ? '' : 'sun'}" aria-hidden="true"><span style="width:${pctOf(on, total)}%"></span></div></div>
        <div class="ccard-acts"><a href="#/play/${l.id}"><button class="primary">Open lesson</button></a>${tpl ? '' : `<a href="#/lessons/${l.id}" class="ibtn" title="Edit lesson" aria-label="Edit ${esc(l.title)}">${svg('<path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>')}</a>`}</div>
      </div></article>`
  }
  const group = (t, ls) => `<section class="lvl"><h3 class="lvl-h">${t} <span class="tag">${ls.length}</span></h3><div class="ccards">${ls.map(card).join('')}</div></section>`
  const draw = () => {
    // "My lessons" with none of your own yet → show the built-in ones instead of nothing
    const fallback = show === 'mine' && !mine.length
    const rows = fallback ? data.filter(l => !l.teacher_id)
      : data.filter(l => show === 'all' || (show === 'mine' ? l.teacher_id : l.family_no === +show))
    const own = rows.filter(l => !l.family_no), byLevel = {}
    for (const l of rows.filter(l => l.family_no)) (byLevel[l.family_no] ??= []).push(l)
    $('#lcount', el).textContent = rows.length
    el.querySelectorAll('[data-show]').forEach(b => b.setAttribute('aria-pressed', b.dataset.show === show))
    $('#lf', el).value = /^\d+$/.test(show) ? show : ''
    $('#lrows', el).innerHTML = (fallback ? `<p class="muted">You haven't made any lessons yet. Here are the lessons that come with Basa, ready to use.</p>` : '')
      + (own.length ? group('My lessons <span class="muted small">· any level</span>', own) : '')
      + Object.keys(byLevel).map(Number).sort((a, b) => a - b).map(n => group(esc(familyLabel(n, fams)), byLevel[n])).join('')
      || `<p class="muted">${show === 'mine' ? "You haven't made any lessons yet." : 'No lessons.'}</p>`
  }
  const pick = v => { show = v; try { sessionStorage.setItem('lessonFilter', show) } catch {} draw() }
  el.querySelectorAll('[data-show]').forEach(b => b.onclick = () => pick(b.dataset.show))
  $('#lf', el).onchange = e => e.target.value && pick(e.target.value)
  draw()
  ;(await import('./drop.js')).mountDrop($('#drop', el), openDraft)
  const panel = $('#newPanel', el), btn = $('#newBtn', el)
  const open = on => { panel.hidden = !on; btn.textContent = on ? '✕ Close' : '+ New lesson'; btn.setAttribute('aria-expanded', on) }
  btn.onclick = () => open(panel.hidden)
  if (!mine.length && show === 'mine') open(true) // no own lessons yet: show how to make one
}

async function editor(el, id) {
  let lesson = { title: '', level: 1, language: 'fil-PH' }, items = []
  if (id === 'new' && pending) { ({ items, ...lesson } = pending); pending = null }
  else if (id !== 'new') {
    const [{ data: l }, { data: its }] = await Promise.all([
      supabase.from('lessons').select('*').eq('id', id).single(),
      supabase.from('lesson_items').select('*').eq('lesson_id', id).order('position'),
    ])
    lesson = l; items = its
    if (l && !l.teacher_id) { // built-in lessons are shared by every teacher, so they are read-only
      el.innerHTML = `<div class="row" style="margin-top:0"><a href="#/lessons"><button>← All lessons</button></a></div>
        <h1>Basa lesson</h1><p class="muted">"${esc(l.title)}" comes with Basa and can't be edited. Make your own with <b>+ New lesson</b>.</p>
        <div class="row"><a href="#/play/${l.id}"><button class="primary">Open lesson</button></a></div>`
      return
    }
  }
  const texts = items.filter(i => !i.image_path && !i.image).map(i => i.text).join('\n')
  const pics = items.filter(i => i.image_path || i.image)
  const other = !(lesson.language in LANGS)

  el.innerHTML = `<div class="row" style="margin-top:0"><a href="#/lessons"><button>← All lessons</button></a></div>
    <h1>${id === 'new' ? 'New lesson' : 'Edit lesson'}</h1>
    <form id="f">
      <div class="row"><label style="flex:1">Title<br><input name="title" required value="${esc(lesson.title)}" placeholder="e.g. Animal words" style="width:100%"></label></div>
      <div class="row"><label>Stage <select name="level">${Object.keys(LEVELS).map(n =>
        `<option value="${n}" ${+n === lesson.level ? 'selected' : ''}>${stageLabel(+n)}</option>`).join('')}</select></label>
        <label>Language <select name="lang">${Object.entries(LANGS).map(([c, t]) =>
          `<option value="${c}" ${c === lesson.language ? 'selected' : ''}>${t}</option>`).join('')}
          <option value="other" ${other ? 'selected' : ''}>Other…</option></select></label>
        <input name="langOther" placeholder="Language code, e.g. ilo-PH" value="${other ? esc(lesson.language) : ''}" ${other ? '' : 'hidden'} aria-label="Other language code"></div>
      <label>Words / phrases / sentences — one per line<br><textarea name="items" rows="8" style="width:100%">${esc(texts)}</textarea></label>
      <h3>Pictures <span class="muted">(tap in the lesson to hear the label)</span></h3>
      <div id="pics"></div>
      <div class="row"><button type="button" id="addPic">Add picture</button></div>
      <div class="row"><button class="primary">Save lesson</button>${id !== 'new' ? '<button type="button" id="del">Delete lesson</button>' : ''}<span id="msg" class="muted"></span></div>
    </form>`

  const f = $('#f', el), picsEl = $('#pics', el)
  f.lang.onchange = () => { f.langOther.hidden = f.lang.value !== 'other' }
  const addPic = (p = {}) => {
    const row = document.createElement('div'); row.className = 'row'; row.pic = p
    row.innerHTML = `${p.image_path ? '<span class="muted">saved picture</span>' : '<input type="file" accept="image/*" aria-label="Picture">'}
      <input placeholder="What is this? e.g. aso" value="${esc(p.text ?? '')}" aria-label="Picture label" required><button type="button">✕</button>`
    if (p.image) row.querySelector('input[type=file]')?.replaceWith(Object.assign(document.createElement('span'), { className: 'muted', textContent: p.image.name }))
    row.querySelector('button').onclick = () => row.remove()
    picsEl.append(row)
  }
  pics.forEach(addPic)
  $('#addPic', el).onclick = () => addPic()
  $('#del', el)?.addEventListener('click', async () => {
    if (!await ask('Delete this lesson?', 'Are you sure? It moves to the Archive, where you can restore it.', 'Delete lesson')) return
    await supabase.from('lessons').update({ archived_at: new Date().toISOString() }).eq('id', id); location.hash = '#/lessons'
  })

  f.onsubmit = async e => {
    e.preventDefault()
    const msg = $('#msg', el), btn = f.querySelector('button.primary')
    const draft = {
      id: id === 'new' ? undefined : id,
      title: f.title.value.trim(), level: +f.level.value,
      language: f.lang.value === 'other' ? f.langOther.value.trim() || 'en-US' : f.lang.value,
      items: [
        ...f.items.value.split('\n').map(t => t.trim()).filter(Boolean).map(text => ({ text })),
        ...[...picsEl.children].map(r => ({ ...r.pic, text: r.querySelector('input:not([type=file])').value.trim(), image: r.pic.image ?? r.querySelector('input[type=file]')?.files[0] }))
          .filter(p => p.text && (p.image || p.image_path)),
      ],
    }
    if (!draft.items.length) return (msg.textContent = 'Add at least one word, sentence or picture.')
    btn.disabled = true
    try {
      const newId = await saveLesson(draft, (n, N) => (msg.textContent = `Preparing audio ${n}/${N}`))
      location.hash = `#/play/${newId}`
    } catch (err) { msg.textContent = err.message; btn.disabled = false }
  }
}

// Saves a lesson and its items (replacing old items). Returns the lesson id.
export async function saveLesson({ id, title, level, language, items }, onProgress = () => {}) {
  const { data: { user } } = await supabase.auth.getUser()
  const ok = ({ data, error }) => { if (error) throw error; return data }
  const row = { title, level, language }
  const lesson = ok(id ? await supabase.from('lessons').update(row).eq('id', id).select().single()
                       : await supabase.from('lessons').insert(row).select().single())
  const rows = []
  for (const [position, it] of items.entries()) {
    let image_path = it.image_path ?? null
    if (it.image) {
      if (it.image.size > 10e6) throw new Error(`${it.image.name} is over 10 MB`)
      image_path = `${user.id}/${crypto.randomUUID()}-${it.image.name.replace(/[^\w.-]/g, '_')}`
      ok(await supabase.storage.from('lesson-images').upload(image_path, it.image))
    }
    rows.push({ lesson_id: lesson.id, position, text: it.text, image_path })
  }
  const saved = ok(await supabase.from('lesson_items').insert(rows).select())
  // Old items are removed only after the new ones are safely in, so a failed save never empties a lesson.
  // ponytail: old audio files stay in Storage (clean up if the 1 GB free limit gets close)
  if (id) ok(await supabase.from('lesson_items').delete().eq('lesson_id', id).not('id', 'in', `(${saved.map(i => i.id).join(',')})`))
  for (const [n, it] of saved.entries()) {
    onProgress(n + 1, saved.length)
    const blob = await synth(it.text, language)
    if (!blob) break // no voice for this language on this computer: player falls back to the browser voice
    const audio_path = `${user.id}/audio/${it.id}.wav`
    ok(await supabase.storage.from('lesson-images').upload(audio_path, blob, { upsert: true }))
    ok(await supabase.from('lesson_items').update({ audio_path }).eq('id', it.id))
  }
  return lesson.id
}
