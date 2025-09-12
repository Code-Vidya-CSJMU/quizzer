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
  const [participants, setParticipants] = useState<any[]>([])
  const [status, setStatus] = useState<any>(null)
  const [questionJson, setQuestionJson] = useState('')
  const [builderOpen, setBuilderOpen] = useState(false)
  const [builderQ, setBuilderQ] = useState<any>({ id: '', text: '', duration: 30, hint: '', choices: [{ id: 'a', text: '' }, { id: 'b', text: '' }], answer: '' })
  const [builderList, setBuilderList] = useState<any[]>([])
  const [qsets, setQsets] = useState<{ name: string; count: number }[]>([])
  const [snapshots, setSnapshots] = useState<{ name: string; file: string; createdAt: string; count: number }[]>([])
  const [lifelines, setLifelines] = useState<LifelinesState>({ '5050': true, hint: true })
  const [logs, setLogs] = useState<string[]>([])
  const [lockedStats, setLockedStats] = useState<{ lockedCount: number; playersCount: number; locked: { id: string; name: string }[]; unlocked?: { id: string; name: string }[]; players?: { id: string; name: string }[] } | null>(null)
  const [busy, setBusy] = useState(false)
  const [allowedEmailsText, setAllowedEmailsText] = useState('')
  const [allowedEmails, setAllowedEmails] = useState<string[]>([])
  const [showAllowed, setShowAllowed] = useState(false)
  const [search, setSearch] = useState('')
  const [gotoIndex, setGotoIndex] = useState<string>('')
  const [questions, setQuestions] = useState<any[]>([])
  const [topN, setTopN] = useState<string>('3')

  function appendLog(line: string) { setLogs(l => [new Date().toLocaleTimeString() + ' ' + line, ...l].slice(0, 200)) }

  function connectSocket() {
    if (socket) socket.disconnect()
    // Connect to default namespace with custom path (proxy handles /ws/* to backend)
  const s = io(SOCKET_URL, { path: SOCKET_PATH, transports: ['websocket'] })
    s.on('connect', () => {
      setConnected(true)
      s.emit('admin_join', { token }) // global quiz (code omitted)
      appendLog('Socket connected')
      refreshParticipants()
      loadAllowed()
    })
    s.on('connect_error', (err) => { appendLog('connect_error: ' + err.message) })
    s.on('error', (err) => { appendLog('error event: ' + (err?.message || JSON.stringify(err))) })
    s.io.on('reconnect_attempt', (n: number) => appendLog('reconnect attempt #' + n))
    s.on('disconnect', () => { setConnected(false); appendLog('Socket disconnected') })
    s.on('leaderboard', (lb) => { setLeaderboard(lb) })
  s.on('status', (st) => setStatus(st))
    s.on('answers_progress', (p) => {
      setLockedStats(p)
      appendLog(`Locked ${p.lockedCount}/${p.playersCount}`)
      refreshParticipants()
    })
    s.on('lifelines', (lf) => setLifelines(lf))
  s.on('answer_submitted', (ans) => { appendLog(`Answer locked: ${ans.name}`); refreshParticipants() })
    s.on('lifeline_used', (lf) => appendLog(`Lifeline: ${lf.name} used ${lf.lifeline}`))
    s.on('question', (q) => appendLog(`Question broadcast: ${q.text}`))
    setSocket(s)
  }

  async function refreshParticipants() {
    try {
  const r = await fetch(api('/api/admin/leaderboard'), { headers: { 'X-Admin-Token': token } })
      if (r.ok) {
        const data = await r.json()
        setParticipants(Array.isArray(data) ? data : [])
      }
    } catch {}
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
  loadCurrentQuestions()
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
  if (r.ok) { const d = await r.json(); appendLog(`Applied set '${name}' (${d.count} questions)`); loadCurrentQuestions() }
  }

  async function exportCurrent() {
  const r = await fetch(api('/api/admin/questions/export'), { method: 'POST', headers: { 'X-Admin-Token': token } })
    if (r.ok) {
      const data = await r.json()
      setQuestionJson(JSON.stringify(data.questions, null, 2))
      appendLog('Exported current questions to editor')
    }
  }

  async function listSnapshots() {
    const r = await fetch(api('/api/admin/leaderboard/snapshots'), { headers: { 'X-Admin-Token': token } })
    if (r.ok) {
      const data = await r.json()
      setSnapshots(data.items || [])
      appendLog('Loaded leaderboard snapshots')
    }
  }

  async function loadCurrentQuestions() {
    try {
      const r = await fetch(api('/api/admin/questions/export'), { method: 'POST', headers: { 'X-Admin-Token': token } })
      if (r.ok) {
        const data = await r.json()
        const arr = Array.isArray(data.questions) ? data.questions : []
        setQuestions(arr)
      }
    } catch {}
  }

  async function applySnapshot(file: string) {
    const r = await fetch(api('/api/admin/leaderboard/snapshots/apply'), { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Admin-Token': token }, body: JSON.stringify({ file }) })
    if (r.ok) {
      appendLog('Applied snapshot: ' + file)
    } else {
      appendLog('Failed applying snapshot: ' + file)
    }
  }

  async function disconnectAll() {
    if (!token) return
    if (!confirm('Disconnect all connected clients?')) return
    const r = await fetch(api('/api/admin/disconnect_all'), { method: 'POST', headers: { 'X-Admin-Token': token } })
    if (r.ok) {
      const d = await r.json().catch(() => ({}))
      appendLog(`Disconnected ${d.disconnected ?? '?'} clients`)
      refreshParticipants()
    } else {
      appendLog('Disconnect all failed')
      alert('Failed to disconnect clients')
    }
  }

  async function clearSnapshots() {
    if (!token) return
    if (!confirm('Delete all leaderboard snapshots for the current quiz?')) return
    const r = await fetch(api('/api/admin/leaderboard/snapshots/clear'), { method: 'POST', headers: { 'X-Admin-Token': token } })
    if (r.ok) {
      const d = await r.json().catch(() => ({}))
      appendLog(`Deleted ${d.deleted ?? 0} leaderboard snapshots`)
      listSnapshots()
    } else {
      appendLog('Clearing leaderboard snapshots failed')
      alert('Failed to clear snapshots')
    }
  }

  useEffect(() => { if (token) { listQsets(); refreshParticipants(); loadAllowed(); listSnapshots(); loadCurrentQuestions() } }, [token])

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

  async function suddenDeathStart() {
    const n = Number(topN)
    const body: any = {}
    if (Number.isInteger(n) && n > 0) body.topN = n
    const r = await fetch(api('/api/admin/sudden_death/start'), { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Admin-Token': token }, body: JSON.stringify(body) })
    if (r.ok) {
      const d = await r.json().catch(() => ({}))
      appendLog(`Sudden death started (allowed ${d.count ?? '?'})`)
    } else {
      appendLog('Failed to start sudden death')
    }
  }
  async function suddenDeathStop() {
    const r = await fetch(api('/api/admin/sudden_death/stop'), { method: 'POST', headers: { 'X-Admin-Token': token } })
    if (r.ok) appendLog('Sudden death stopped')
    else appendLog('Failed to stop sudden death')
  }
  async function fetchFinalResults() {
    const r = await fetch(api('/api/admin/final_results'), { headers: { 'X-Admin-Token': token } })
    if (r.ok) {
      const d = await r.json().catch(() => ({}))
      const top = (d.leaderboard || []).slice(0, 5).map((p: any, i: number) => `${i + 1}. ${p.name} (${p.score}) firsts:${p.firsts} time:${p.cumTime}s`).join(' | ')
      appendLog('Final results: ' + top)
    } else {
      appendLog('Failed to fetch final results')
    }
  }

  async function gotoQuestionIndex() {
    const val = gotoIndex.trim()
    if (!val) return
    const idx = Number(val)
    if (!Number.isInteger(idx)) { alert('Enter a valid integer index (0-based)'); return }
    const r = await fetch(api(`/api/admin/goto`), { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Admin-Token': token }, body: JSON.stringify({ index: idx }) })
    if (r.ok) {
      const d = await r.json().catch(() => ({}))
      appendLog(`Jumped to question index ${d.index ?? idx}`)
    } else {
      alert('Failed to jump to that index')
    }
  }

  async function loadAllowed() {
  const r = await fetch(api('/api/admin/allowed_emails'), { headers: { 'X-Admin-Token': token } })
    if (r.ok) {
      const data = await r.json()
  const list = Array.isArray(data.emails) ? data.emails : []
  setAllowedEmailsText(list.join('\n'))
  setAllowedEmails(list)
      appendLog('Loaded allowed emails')
    }
  }
  async function saveAllowed(mode: string = 'replace') {
    const emails = allowedEmailsText.split(/\n|,/).map(e => e.trim()).filter(Boolean)
  const r = await fetch(api('/api/admin/allowed_emails'), { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Admin-Token': token }, body: JSON.stringify({ emails, mode }) })
    if (r.ok) {
      const data = await r.json()
  setAllowedEmails(data.emails || emails)
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
        <h2 className="text-lg font-semibold">Answers Progress</h2>
        {!lockedStats && (
          <p className="text-sm text-slate-600 mt-1">No data yet. Start the quiz or wait for a question.</p>
        )}
        {lockedStats && (
          <>
            <div className="mt-2 text-sm text-slate-700 flex items-center gap-3">
              <span className="text-indigo-800 bg-indigo-100 px-2 py-0.5 rounded text-xs">Locked {lockedStats.lockedCount}/{lockedStats.playersCount}</span>
            </div>
            <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-2 text-xs text-slate-700">
              <div>
                <div className="font-semibold mb-1">Answered ({lockedStats.lockedCount})</div>
                <ul className="space-y-1 max-h-32 overflow-auto">
                  {lockedStats.locked.map((p: any) => (
                    <li key={p.id} className="border border-emerald-200 bg-emerald-50 text-emerald-900 rounded px-2 py-1">{p.name}</li>
                  ))}
                  {lockedStats.locked.length === 0 && <li className="text-slate-500">None yet</li>}
                </ul>
              </div>
              <div>
                <div className="font-semibold mb-1">Not Answered ({Math.max(0, (lockedStats.playersCount || 0) - (lockedStats.lockedCount || 0))})</div>
                <ul className="space-y-1 max-h-32 overflow-auto">
                  {(lockedStats.unlocked || (lockedStats.players || []).filter((pl: any) => !lockedStats.locked.find((lp: any) => lp.id === pl.id))).map((p: any) => (
                    <li key={p.id} className="border border-rose-200 bg-rose-50 text-rose-900 rounded px-2 py-1">{p.name}</li>
                  ))}
                  {((lockedStats.unlocked || []).length === 0) && <li className="text-slate-500">All answered</li>}
                </ul>
              </div>
            </div>
          </>
        )}
      </section>

      <section className="border border-slate-200 rounded-xl p-4 mb-4">
        <h2 className="text-lg font-semibold">Leaderboard Snapshots</h2>
        <div className="mt-2 flex gap-2 flex-wrap items-center">
          <button onClick={listSnapshots} disabled={!token}>Refresh</button>
        </div>
        {snapshots.length === 0 && <p className="text-sm text-slate-600 mt-2">No snapshots yet. A snapshot is saved automatically after each reveal.</p>}
    {snapshots.length > 0 && (
          <div className="mt-2">
            <table className="w-full text-sm">
      <thead><tr className="text-left"><th>When (UTC)</th><th>Entries</th><th>File</th><th>Action</th></tr></thead>
              <tbody>
                {snapshots.map(s => (
                  <tr key={s.file} className="border-t border-slate-100">
        <td>{(s as any).createdAtHuman || s.createdAt || '-'}</td>
                    <td>{s.count}</td>
                    <td className="truncate">{s.file}</td>
                    <td><button onClick={() => applySnapshot(s.file)} disabled={!token}>Apply</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="border border-slate-200 rounded-xl p-4 mb-4">
        <h2 className="text-lg font-semibold">Participants</h2>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <input className="w-64" placeholder="Search name or email" value={search} onChange={e => setSearch(e.target.value)} />
          {(() => {
            const online = participants.filter((p: any) => !!p.online)
            const onlineEmails = new Set(online.map((p: any) => (p.participantCode || '').toLowerCase()).filter(Boolean))
            const notJoinedCount = allowedEmails.length ? Math.max(0, allowedEmails.length - onlineEmails.size) : 0
            return (
              <span className="text-xs text-slate-600">Joined: <span className="font-semibold text-emerald-700">{online.length}</span>{allowedEmails.length ? <> · Not joined: <span className="font-semibold text-rose-700">{notJoinedCount}</span></> : null}</span>
            )
          })()}
        </div>
        <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="border border-emerald-200 bg-emerald-50 rounded-lg p-3">
            <div className="text-sm font-semibold text-emerald-800 mb-2">Joined</div>
            <ul className="space-y-1 max-h-56 overflow-auto">
              {participants
                .filter((p: any) => !!p.online)
                .filter(p => {
                  const q = search.trim().toLowerCase()
                  if (!q) return true
                  const email = (p.participantCode || '').toLowerCase()
                  return p.name.toLowerCase().includes(q) || email.includes(q)
                })
                .map(p => (
                  <li key={p.id} className="flex items-center justify-between text-sm text-emerald-900 bg-white/70 border border-emerald-200 rounded px-2 py-1">
                    <span className="truncate"><span className="font-medium">{p.name}</span> <span className="text-slate-500">({p.participantCode || '—'})</span></span>
                    <span className="text-emerald-700 text-xs">joined</span>
                  </li>
                ))}
              {participants.filter((p: any) => !!p.online).length === 0 && <li className="text-xs text-slate-500">No one online yet.</li>}
            </ul>
          </div>
          <div className="border border-rose-200 bg-rose-50 rounded-lg p-3">
            <div className="text-sm font-semibold text-rose-800 mb-2">Not Joined {allowedEmails.length ? `(${allowedEmails.length})` : ''}</div>
            <ul className="space-y-1 max-h-56 overflow-auto">
              {(() => {
                const online = participants.filter((p: any) => !!p.online)
                const joined = new Set(online.map((p: any) => (p.participantCode || '').toLowerCase()).filter(Boolean))
                const items = (allowedEmails || [])
                  .filter(e => e && !joined.has(e.toLowerCase()))
                  .filter(e => e.toLowerCase().includes(search.trim().toLowerCase()))
                return items.length > 0 ? items.map(e => (
                  <li key={e} className="text-sm text-rose-900 bg-white/70 border border-rose-200 rounded px-2 py-1">{e}</li>
                )) : <li className="text-xs text-slate-500">{allowedEmails.length ? 'All allowed participants have joined.' : 'No allowed list configured.'}</li>
              })()}
            </ul>
          </div>
        </div>
      </section>

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
          <button onClick={async () => { await fetch(api('/api/admin/leaderboard/reset'), { method: 'POST', headers: { 'X-Admin-Token': token } }); appendLog('Leaderboard reset to zero') }} disabled={!token}>Reset Leaderboard</button>
          <button onClick={async () => { if (confirm('Full reset will disconnect everyone and clear all sessions. Continue?')) { await fetch(api('/api/admin/full_reset'), { method: 'POST', headers: { 'X-Admin-Token': token } }); appendLog('Full reset executed') } }} disabled={!token}>
            Full Reset (Fresh Start)
          </button>
          <div className="flex items-center gap-2 ml-2">
            <select className="min-w-[16rem]" value={gotoIndex} onChange={e => setGotoIndex(e.target.value)} disabled={!token || questions.length === 0}>
              <option value="">Go to question…</option>
              {questions.map((q: any, i: number) => (
                <option key={q.id || i} value={String(i)}>
                  {`${i + 1}. ${q.id ? '[' + q.id + '] ' : ''}${String(q.text || '').slice(0, 80)}`}
                </option>
              ))}
            </select>
            <button onClick={gotoQuestionIndex} disabled={!token || !gotoIndex.trim()}>Go</button>
            <button title="Refresh questions" onClick={loadCurrentQuestions} disabled={!token}>↻</button>
          </div>
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
              <thead><tr className="text-left"><th>#</th><th>Name</th><th>Email</th><th>Email Code</th><th className="text-right">Score</th><th className="text-right">Firsts</th><th className="text-right">Cum Time (s)</th></tr></thead>
              <tbody>
                {leaderboard.map((p, i) => (
                  <tr key={p.id} className="border-t border-slate-100"><td>{i + 1}</td><td>{p.name}</td><td>{p.email || ''}</td><td>{p.participantCode || ''}</td><td className="text-right">{p.score}</td><td className="text-right">{(p as any).firsts ?? '-'}</td><td className="text-right">{(p as any).cumTime ?? '-'}</td></tr>
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

      <section className="border border-slate-200 rounded-xl p-4 mt-4 mb-8 bg-white">
        <h2 className="text-lg font-semibold">Maintenance</h2>
        <div className="flex gap-2 flex-wrap mt-2">
          <button onClick={disconnectAll} disabled={!token}>Disconnect Everyone</button>
          <button onClick={clearSnapshots} disabled={!token}>Clear Leaderboard Snapshots</button>
          <span className="ml-2 text-slate-500">|</span>
          <input className="w-24" placeholder="Top N" value={topN} onChange={e => setTopN(e.target.value)} />
          <button onClick={suddenDeathStart} disabled={!token}>Start Sudden Death</button>
          <button onClick={suddenDeathStop} disabled={!token}>Stop Sudden Death</button>
          <button onClick={fetchFinalResults} disabled={!token}>Final Results</button>
        </div>
        <p className="text-xs text-slate-600 mt-1">These actions are immediate and cannot be undone.</p>
      </section>
    </div>
  )
}
