import { useEffect, useState } from 'react'
import { io, Socket } from 'socket.io-client'
import { api, SOCKET_URL, SOCKET_PATH } from '../config'

type LifelinesState = { '5050': boolean; hint: boolean }

const SAMPLE_QUESTIONS = `[
  {"id":"q1","text":"2 + 2 = ?","choices":[{"id":"a","text":"3"},{"id":"b","text":"4"},{"id":"c","text":"5"},{"id":"d","text":"22"}],"answer":"b","duration":20,"hint":"Even number"},
  {"id":"q2","text":"Capital of France?","choices":[{"id":"a","text":"Berlin"},{"id":"b","text":"Madrid"},{"id":"c","text":"Paris"},{"id":"d","text":"Rome"}],"answer":"c","duration":25,"hint":"City of Light"}
]`

export default function Admin() {
  const [token, setToken] = useState('changeme')
  const [socket, setSocket] = useState<Socket | null>(null)
  const [connected, setConnected] = useState(false)
  const [leaderboard, setLeaderboard] = useState<any[]>([])
  const [status, setStatus] = useState<any>(null)
  const [questionJson, setQuestionJson] = useState('')
  const [builderOpen, setBuilderOpen] = useState(false)
  const [builderQ, setBuilderQ] = useState<any>({ id: '', text: '', duration: 30, hint: '', choices: [{ id: 'a', text: '' }, { id: 'b', text: '' }], answer: '' })
  const [builderList, setBuilderList] = useState<any[]>([])
  const [qsets, setQsets] = useState<{ name: string; count: number }[]>([])
  const [lifelines, setLifelines] = useState<LifelinesState>({ '5050': true, hint: true })
  const [logs, setLogs] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [allowedEmailsText, setAllowedEmailsText] = useState('')
  const [showAllowed, setShowAllowed] = useState(false)

  function appendLog(line: string) { setLogs(l => [new Date().toLocaleTimeString() + ' ' + line, ...l].slice(0, 200)) }

  function connectSocket() {
    if (socket) socket.disconnect()
    // Connect to default namespace with custom path (proxy handles /ws/* to backend)
  const s = io(SOCKET_URL, { path: SOCKET_PATH, transports: ['websocket'] })
    s.on('connect', () => {
      setConnected(true)
      s.emit('admin_join', { token }) // global quiz (code omitted)
      appendLog('Socket connected')
    })
    s.on('connect_error', (err) => { appendLog('connect_error: ' + err.message) })
    s.on('error', (err) => { appendLog('error event: ' + (err?.message || JSON.stringify(err))) })
    s.io.on('reconnect_attempt', (n: number) => appendLog('reconnect attempt #' + n))
    s.on('disconnect', () => { setConnected(false); appendLog('Socket disconnected') })
    s.on('leaderboard', (lb) => { setLeaderboard(lb) })
    s.on('status', (st) => setStatus(st))
    s.on('lifelines', (lf) => setLifelines(lf))
  s.on('answer_submitted', (ans) => appendLog(`Answer locked: ${ans.name}`))
    s.on('lifeline_used', (lf) => appendLog(`Lifeline: ${lf.name} used ${lf.lifeline}`))
    s.on('question', (q) => appendLog(`Question broadcast: ${q.text}`))
    setSocket(s)
  }

  async function ensureSession() {
    // Create/ensure global session exists (idempotent)
  await fetch(api('/api/admin/quiz'), { method: 'POST', headers: { 'X-Admin-Token': token } })
  }

  async function uploadQuestions() {
    if (!questionJson.trim()) return
    try {
      await ensureSession()
      const questions = JSON.parse(questionJson)
  const r = await fetch(api(`/api/admin/questions`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Admin-Token': token },
        body: JSON.stringify({ questions }),
      })
      if (!r.ok) throw new Error('Upload failed')
      appendLog(`Uploaded ${questions.length} questions`)
    } catch (e: any) {
      appendLog('Upload error: ' + (e.message || 'invalid JSON'))
      alert('Invalid or failed JSON upload')
    }
  }

  async function listQsets() {
  const r = await fetch(api('/api/admin/question_sets'), { headers: { 'X-Admin-Token': token } })
    if (r.ok) {
      const data = await r.json()
      setQsets(data.items || [])
    }
  }

  async function saveQset(name: string) {
    const payload = builderList.length ? builderList : (questionJson.trim() ? JSON.parse(questionJson) : [])
  const r = await fetch(api('/api/admin/question_sets/save'), { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Admin-Token': token }, body: JSON.stringify({ name, questions: payload }) })
    if (r.ok) { appendLog('Saved question set: ' + name); listQsets() }
  }

  async function loadQset(name: string) {
  const r = await fetch(api('/api/admin/question_sets/load'), { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Admin-Token': token }, body: JSON.stringify({ name }) })
    if (r.ok) {
      const data = await r.json()
      setQuestionJson(JSON.stringify(data.questions, null, 2))
      setBuilderList(data.questions)
      appendLog('Loaded set: ' + name)
    }
  }

  async function applyQset(name: string) {
    await ensureSession()
  const r = await fetch(api('/api/admin/question_sets/apply'), { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Admin-Token': token }, body: JSON.stringify({ name }) })
    if (r.ok) { const d = await r.json(); appendLog(`Applied set '${name}' (${d.count} questions)`) }
  }

  async function exportCurrent() {
  const r = await fetch(api('/api/admin/questions/export'), { method: 'POST', headers: { 'X-Admin-Token': token } })
    if (r.ok) {
      const data = await r.json()
      setQuestionJson(JSON.stringify(data.questions, null, 2))
      appendLog('Exported current questions to editor')
    }
  }

  useEffect(() => { if (token) listQsets() }, [token])

  function addChoice() {
    setBuilderQ((q: any) => ({ ...q, choices: [...(q.choices || []), { id: String.fromCharCode(97 + (q.choices?.length || 0)), text: '' }] }))
  }
  function addQuestionToList() {
    if (!builderQ.id || !builderQ.text) { alert('Please fill id and text'); return }
    setBuilderList(list => [...list, builderQ])
    setBuilderQ({ id: '', text: '', duration: 30, hint: '', choices: [{ id: 'a', text: '' }, { id: 'b', text: '' }], answer: '' })
  }
  function removeFromList(idx: number) { setBuilderList(list => list.filter((_, i) => i !== idx)) }
  function useListInEditor() { setQuestionJson(JSON.stringify(builderList, null, 2)); appendLog('Loaded builder list into editor') }

  async function startQuiz() {
    await ensureSession()
  await fetch(api(`/api/admin/start`), { method: 'POST', headers: { 'X-Admin-Token': token } })
    appendLog('Quiz started')
  }
  async function next() {
  const r = await fetch(api(`/api/admin/next`), { method: 'POST', headers: { 'X-Admin-Token': token } })
    if (r.ok) {
      const data = await r.json().catch(() => ({}))
      if (data?.revealed) appendLog('Reveal executed (first press)')
      else appendLog('Advanced to next question')
    }
  }
  async function pause() { await fetch(api(`/api/admin/pause`), { method: 'POST', headers: { 'X-Admin-Token': token } }); appendLog('Quiz paused/resumed') }
  async function reset() { await fetch(api(`/api/admin/reset`), { method: 'POST', headers: { 'X-Admin-Token': token } }); appendLog('Quiz reset') }
  async function reveal() { await fetch(api(`/api/admin/reveal`), { method: 'POST', headers: { 'X-Admin-Token': token } }); appendLog('Reveal triggered') }
  async function updateLifelines() { await fetch(api(`/api/admin/lifelines`), { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Admin-Token': token }, body: JSON.stringify({ lifelines }) }); appendLog('Lifelines updated') }

  async function loadAllowed() {
  const r = await fetch(api('/api/admin/allowed_emails'), { headers: { 'X-Admin-Token': token } })
    if (r.ok) {
      const data = await r.json()
      setAllowedEmailsText(data.emails.join('\n'))
      appendLog('Loaded allowed emails')
    }
  }
  async function saveAllowed(mode: string = 'replace') {
    const emails = allowedEmailsText.split(/\n|,/).map(e => e.trim()).filter(Boolean)
  const r = await fetch(api('/api/admin/allowed_emails'), { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Admin-Token': token }, body: JSON.stringify({ emails, mode }) })
    if (r.ok) {
      const data = await r.json()
      appendLog(`Saved allowed emails (${data.count})`)
    } else {
      appendLog('Failed saving allowed emails')
    }
  }

  async function uploadAndStart() {
    await uploadQuestions()
    await startQuiz()
  }

  function loadSample() { setQuestionJson(SAMPLE_QUESTIONS); appendLog('Loaded sample questions') }

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-8">
      <h1 className="text-3xl font-bold mb-1">Admin Console (Global Quiz)</h1>
      <p className="text-slate-600 mb-4">Steps: 1) Enter admin token 2) (Optional) Load sample & Upload 3) Start 4) Next / Pause / Reveal / Reset.</p>

      <section className="border border-slate-200 rounded-xl p-4 mb-4">
        <h2 className="text-lg font-semibold">Connection</h2>
        <div className="flex flex-wrap gap-3 items-center mt-2">
          <div>
            <label className="block mb-1">Admin Token</label>
            <input className="w-40" value={token} onChange={e => setToken(e.target.value)} />
          </div>
          <button onClick={() => connectSocket()} disabled={!token}>{connected ? 'Reconnect WS' : 'Connect WS'}</button>
          <span className={`text-xs px-2 py-0.5 rounded ${connected ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}`}>{connected ? 'Connected' : 'Disconnected'}</span>
        </div>
      </section>
  <section className="border border-slate-200 rounded-xl p-4 mb-4">
        <h2 style={{ marginTop: 0, fontSize: 18, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          Allowed Emails
          <button style={{ fontSize: 12 }} onClick={() => { setShowAllowed(s => !s); if (!showAllowed) loadAllowed() }}>{showAllowed ? 'Hide' : 'Show'}</button>
        </h2>
        {showAllowed && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <textarea rows={6} placeholder='one email per line' style={{ width: '100%', fontFamily: 'monospace', fontSize: 12 }} value={allowedEmailsText} onChange={e => setAllowedEmailsText(e.target.value)} />
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button disabled={!token} onClick={() => saveAllowed('replace')}>Replace</button>
              <button disabled={!token} onClick={() => saveAllowed('append')}>Append</button>
              <button disabled={!token} onClick={() => saveAllowed('remove')}>Remove Listed</button>
              <button disabled={!token} onClick={loadAllowed}>Reload</button>
            </div>
            <p style={{ fontSize: 12, color: '#666', margin: 0 }}>If list is empty, anyone can register. Case-insensitive comparison.</p>
          </div>
        )}
      </section>

      <section className="border border-slate-200 rounded-xl p-4 mb-4">
        <h2 style={{ marginTop: 0, fontSize: 18 }}>Questions</h2>
        <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
          <button onClick={loadSample}>Load Sample</button>
          <button onClick={() => setBuilderOpen(o => !o)}>{builderOpen ? 'Hide Builder' : 'Show Builder'}</button>
          <button onClick={uploadQuestions} disabled={!token}>Upload Only</button>
          <button onClick={uploadAndStart} disabled={!token}>Upload & Start</button>
          <button onClick={exportCurrent} disabled={!token}>Export Current</button>
        </div>
        {builderOpen && (
          <div className="border border-slate-200 rounded-lg p-3 mb-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-slate-600">ID</label>
                <input value={builderQ.id} onChange={e => setBuilderQ({ ...builderQ, id: e.target.value })} />
              </div>
              <div>
                <label className="block text-xs text-slate-600">Duration (s)</label>
                <input type="number" value={builderQ.duration} onChange={e => setBuilderQ({ ...builderQ, duration: Number(e.target.value || 0) })} />
              </div>
            </div>
            <div className="mt-2">
              <label className="block text-xs text-slate-600">Question Text</label>
              <textarea rows={2} value={builderQ.text} onChange={e => setBuilderQ({ ...builderQ, text: e.target.value })} />
            </div>
            <div className="mt-2">
              <label className="block text-xs text-slate-600">Hint</label>
              <input value={builderQ.hint} onChange={e => setBuilderQ({ ...builderQ, hint: e.target.value })} />
            </div>
            <div className="mt-2">
              <div className="flex items-center justify-between">
                <label className="text-xs text-slate-600">Choices</label>
                <button onClick={addChoice}>Add Choice</button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-2">
                {(builderQ.choices || []).map((c: any, idx: number) => (
                  <div key={idx} className="flex gap-2 items-center">
                    <input className="w-16" value={c.id} onChange={e => {
                      const val = e.target.value
                      setBuilderQ((q: any) => ({ ...q, choices: q.choices.map((cc: any, i: number) => i === idx ? { ...cc, id: val } : cc) }))
                    }} />
                    <input className="flex-1" value={c.text} onChange={e => {
                      const val = e.target.value
                      setBuilderQ((q: any) => ({ ...q, choices: q.choices.map((cc: any, i: number) => i === idx ? { ...cc, text: val } : cc) }))
                    }} />
                  </div>
                ))}
              </div>
              <div className="mt-2">
                <label className="block text-xs text-slate-600">Correct Answer (choice id or text for open-ended)</label>
                <input value={builderQ.answer} onChange={e => setBuilderQ({ ...builderQ, answer: e.target.value })} />
              </div>
              <div className="mt-3 flex gap-2">
                <button onClick={addQuestionToList}>Add to List</button>
                <button onClick={useListInEditor} disabled={builderList.length === 0}>Use List in Editor</button>
              </div>
            </div>
            {builderList.length > 0 && (
              <div className="mt-4">
                <div className="text-sm font-semibold mb-1">Questions in Builder ({builderList.length})</div>
                <ul className="space-y-1">
                  {builderList.map((q, i) => (
                    <li key={i} className="flex items-center justify-between text-sm border border-slate-200 rounded px-2 py-1">
                      <div className="truncate"><span className="text-slate-500 mr-2">{q.id}</span>{q.text}</div>
                      <button onClick={() => removeFromList(i)}>Remove</button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
        <textarea rows={10} style={{ width: '100%', fontFamily: 'monospace', fontSize: 13 }} value={questionJson} onChange={e => setQuestionJson(e.target.value)} placeholder='Paste questions JSON array here' />
        <div className="mt-2 flex flex-wrap gap-2 text-sm">
          <input placeholder="Set name" id="qset-name" />
          <button onClick={() => {
            const el = document.getElementById('qset-name') as HTMLInputElement
            const name = el?.value?.trim()
            if (!name) { alert('Enter a name'); return }
            try { saveQset(name) } catch { alert('Invalid JSON') }
          }} disabled={!token}>Save as Set</button>
          <button onClick={() => listQsets()} disabled={!token}>Refresh Sets</button>
        </div>
        {qsets.length > 0 && (
          <div className="mt-3 border border-slate-200 rounded-lg p-2">
            <div className="text-sm font-semibold mb-1">Saved Sets</div>
            <div className="flex flex-wrap gap-2">
              {qsets.map(s => (
                <div key={s.name} className="border border-slate-200 rounded px-2 py-1 text-sm flex items-center gap-2">
                  <span>{s.name} <span className="text-slate-500">({s.count})</span></span>
                  <button onClick={() => loadQset(s.name)} disabled={!token}>Load</button>
                  <button onClick={() => applyQset(s.name)} disabled={!token}>Apply to Quiz</button>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      <section className="border border-slate-200 rounded-xl p-4 mb-4">
        <h2 className="text-lg font-semibold">Controls</h2>
        <div className="flex gap-2 flex-wrap mt-2">
          <button onClick={startQuiz} disabled={!token}>Start</button>
          <button onClick={next} disabled={!token}>Next</button>
          <button onClick={pause} disabled={!token}>Pause/Resume</button>
          <button onClick={reveal} disabled={!token}>Reveal</button>
          <button onClick={async () => { await fetch(api('/api/admin/leaderboard/show'), { method: 'POST', headers: { 'X-Admin-Token': token } }) }} disabled={!token}>Show Leaderboard</button>
          <button onClick={async () => { await fetch(api('/api/admin/leaderboard/hide'), { method: 'POST', headers: { 'X-Admin-Token': token } }) }} disabled={!token}>Hide Leaderboard</button>
          <button onClick={reset} disabled={!token}>Reset</button>
        </div>
        {status && (
          <div className="mt-2 text-sm text-slate-700 flex items-center gap-3">
            <span>Question {status.index + 1} / {status.total}</span>
            {status.paused && <span className="text-amber-800 bg-amber-100 px-2 py-0.5 rounded text-xs">Paused</span>}
            {status.revealed && <span className="text-sky-800 bg-sky-100 px-2 py-0.5 rounded text-xs">Revealed</span>}
          </div>
        )}
      </section>

      <section className="border border-slate-200 rounded-xl p-4 mb-4">
        <h2 className="text-lg font-semibold">Lifelines</h2>
        <div className="flex gap-4 flex-wrap text-sm mt-2">
          <label><input type="checkbox" checked={lifelines['5050']} onChange={e => setLifelines(l => ({ ...l, '5050': e.target.checked }))} /> 50-50</label>
          <label><input type="checkbox" checked={lifelines.hint} onChange={e => setLifelines(l => ({ ...l, hint: e.target.checked }))} /> Hint</label>
          <button onClick={updateLifelines} disabled={!token}>Apply</button>
        </div>
      </section>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <section className="border border-slate-200 rounded-xl p-4 min-h-[260px] bg-white">
          <h2 className="text-lg font-semibold">Leaderboard</h2>
          {leaderboard.length === 0 && <p className="text-sm text-slate-600">No players yet.</p>}
          {leaderboard.length > 0 && (
            <table className="w-full text-sm">
              <thead><tr className="text-left"><th>#</th><th>Name</th><th>Email Code</th><th className="text-right">Score</th></tr></thead>
              <tbody>
                {leaderboard.map((p, i) => (
                  <tr key={p.id} className="border-t border-slate-100"><td>{i + 1}</td><td>{p.name}</td><td>{p.participantCode || ''}</td><td className="text-right">{p.score}</td></tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
        <section className="border border-slate-200 rounded-xl p-4 min-h-[260px] bg-white">
          <h2 className="text-lg font-semibold">Event Log</h2>
          <div className="font-mono text-xs max-h-[220px] overflow-y-auto bg-slate-50 p-2 border border-slate-100 rounded">
            {logs.map((l, i) => <div key={i}>{l}</div>)}
            {logs.length === 0 && <div className="text-slate-500">No events yet.</div>}
          </div>
        </section>
      </div>
    </div>
  )
}
