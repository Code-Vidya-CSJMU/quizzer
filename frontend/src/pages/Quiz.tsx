import { useEffect, useRef, useState } from 'react'
import { io, Socket } from 'socket.io-client'
import { SOCKET_URL, SOCKET_PATH } from '../config'
import { useLocation, useNavigate } from 'react-router-dom'
import { BrandLayout, GlassCard, BrandButton, BrandStrip } from '../components/Brand'

export default function Quiz() {
  const nav = useNavigate()
  const loc = useLocation() as any
  const { name, email, playerId, participantCode } = loc.state || {}
  const [socket, setSocket] = useState<Socket | null>(null)
  const [question, setQuestion] = useState<any>(null)
  const [questionIndex, setQuestionIndex] = useState<number | null>(null)
  const [status, setStatus] = useState<any>(null)
  const [result, setResult] = useState<any>(null)
  const [timeLeft, setTimeLeft] = useState<number>(0)
  const serverSkewRef = useRef<number>(0) // serverTime - clientNow
  const [keepIds, setKeepIds] = useState<string[] | null>(null)
  const [hint, setHint] = useState<string | null>(null)
  const [lifelineStatus, setLifelineStatus] = useState<{ [k: string]: boolean }>({ '5050': true, hint: true })
  const [lifelineMsg, setLifelineMsg] = useState<string | null>(null)
  const [locked, setLocked] = useState<boolean>(false)
  const [lockedAnswer, setLockedAnswer] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState<boolean>(false)
  const [revealAnswer, setRevealAnswer] = useState<string | null>(null)
  const [rejectedReason, setRejectedReason] = useState<string | null>(null)
  const [paused, setPaused] = useState<boolean>(false)
  const [revealed, setRevealed] = useState<boolean>(false)
  const timerRef = useRef<number | null>(null)
  const [showLB, setShowLB] = useState<boolean>(false)
  const [leaderboard, setLeaderboard] = useState<any[]>([])

  useEffect(() => {
  if (!name || !playerId) {
      nav('/')
      return
    }
  const s = io(SOCKET_URL, { path: SOCKET_PATH, transports: ['websocket'] })
    s.on('connect', () => {
      s.emit('join_quiz', { name, playerId, email })
    })
  s.on('connect_error', (err) => console.warn('socket connect_error', err.message))
  s.on('error', (err) => console.warn('socket error', err))
    s.on('joined', (j) => {
      if (j?.participantCode) {
        setResult((r: any) => ({ ...(r || {}), participantCode: j.participantCode }))
      }
    })
    s.on('question', (payload) => {
        // New payload shape: { question: {...}, index }
        const q = payload?.question || payload
        setQuestion(q)
        setQuestionIndex(payload?.index ?? null)
        setResult(null)
        setHint(null)
        setKeepIds(null)
        setLocked(false)
        setLockedAnswer(null)
        setRevealAnswer(null)
        setRejectedReason(null)
        setRevealed(false)
    // compute initial time left from server
    const clientNow = Date.now() / 1000
    const serverNow = typeof payload?.serverTime === 'number' ? payload.serverTime : clientNow
    serverSkewRef.current = serverNow - clientNow
    const duration = payload?.duration ?? q?.duration ?? 30
    const startedAt = payload?.startedAt ?? clientNow
    const remaining = typeof payload?.remaining === 'number' ? payload.remaining : Math.max(0, duration - Math.max(0, (serverNow - startedAt)))
    setTimeLeft(Math.ceil(remaining))
      })
    s.on('status', (st) => {
        setStatus(st)
        if (typeof st?.paused === 'boolean') setPaused(st.paused)
        if (typeof st?.revealed === 'boolean') setRevealed(st.revealed)
        // resync time if provided
        if (typeof st?.serverTime === 'number') {
          const clientNow = Date.now() / 1000
          serverSkewRef.current = st.serverTime - clientNow
        }
        if (typeof st?.remaining === 'number') {
          setTimeLeft(Math.ceil(st.remaining))
        }
      })
    s.on('answer_result', (r) => setResult(r))
    s.on('answer_locked', (payload) => { setLocked(true); setSubmitting(false); if (payload?.answer) setLockedAnswer(String(payload.answer)) })
    s.on('answer_rejected', (r) => {
        setRejectedReason(r?.reason || 'rejected')
        setSubmitting(false)
        // If we optimistically set a choice, clear it when rejected
        if (!locked) setLockedAnswer(null)
      })
    s.on('paused', () => { setPaused(true); setStatus((prev: any) => ({ ...(prev || {}), paused: true })) })
    s.on('resumed', () => { setPaused(false); setStatus((prev: any) => ({ ...(prev || {}), paused: false })) })
    s.on('reveal', (data) => {
        setRevealAnswer(data?.correctAnswer || null)
        setRevealed(true)
      })
  s.on('complete', () => setStatus((prev: any) => ({ ...(prev || {}), complete: true })))
    s.on('lifeline_5050', (data) => setKeepIds(data.keepIds))
    s.on('lifeline_hint', (data) => setHint(data.hint || null))
  s.on('lifeline_status', (st) => setLifelineStatus(st || { '5050': true, hint: true }))
  s.on('lifeline_denied', (d) => setLifelineMsg(`Lifeline unavailable: ${d?.lifeline}`))
  s.on('leaderboard', (lb) => setLeaderboard(lb))
  s.on('leaderboard_show', (lb) => { setLeaderboard(lb || []); setShowLB(true) })
  s.on('leaderboard_hide', () => setShowLB(false))
    s.on('reset', () => {
      try { s.disconnect() } catch {}
      nav('/')
    })
    s.on('replaced', () => {
      alert('You were disconnected because another tab connected with your email.')
      s.disconnect()
      nav('/')
    })
    setSocket(s)
    return () => { s.disconnect() }
  }, [name, playerId])

  // countdown synced to server; freeze when paused or revealed
  useEffect(() => {
    if (paused || revealed) return
    if (timeLeft <= 0) return
    if (timerRef.current) window.clearTimeout(timerRef.current)
    timerRef.current = window.setTimeout(() => {
      // recompute based on server skew to avoid drift
      setTimeLeft(t => Math.max(0, t - 1))
    }, 1000)
    return () => { if (timerRef.current) window.clearTimeout(timerRef.current) }
  }, [timeLeft, paused, revealed])

  function submitAnswer(answer: string) {
    const disallowed = locked || revealed || paused || submitting || (timeLeft <= 0)
    if (disallowed) return
    setSubmitting(true)
    setLockedAnswer(answer)
    socket?.emit('submit_answer', { answer })
  }

  function useLifeline(kind: string) {
  socket?.emit('lifeline_request', { lifeline: kind })
  }

  return (
    <BrandLayout
      subtitle={
        <div className="flex items-center gap-3">
          <div className="ring" style={{ ['--p' as any]: `${Math.max(0, Math.min(100, (timeLeft || 0) / Math.max(1, status?.duration || question?.duration || 30) * 100))}%` }}>
            <span>{Math.max(0, timeLeft)}s</span>
          </div>
          {(participantCode || result?.participantCode) && (
            <span className="hidden sm:inline text-slate-300">Code: <span className="font-semibold text-white">{participantCode || result?.participantCode}</span></span>
          )}
        </div>
      }
    >
      <div className="max-w-3xl mx-auto">
        <GlassCard>
          {question ? (
            <div>
              {paused && !revealed && (
                <div className="mb-3 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-amber-200">
                  <strong>Paused</strong> – answers disabled
                </div>
              )}
              <div className={paused && !revealed ? 'pointer-events-none select-none blur-[2px]' : ''}>
                <div className="flex items-baseline justify-between mb-2">
                  <h3 className="text-xl font-semibold text-white">{question.text}</h3>
                  {typeof questionIndex === 'number' && <span className="tag">Q{questionIndex + 1}</span>}
                </div>
              {revealed && (
                <div className="mb-3 rounded-md border border-sky-500/30 bg-sky-500/10 px-3 py-2 text-sky-200">
                  Answer revealed
                </div>
              )}
              {question.choices ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {(keepIds ? question.choices.filter((c: any) => keepIds.includes(c.id)) : question.choices).map((c: any) => {
                    const disabled = locked || revealed || paused || submitting || (timeLeft <= 0)
                    const isLocked = lockedAnswer === c.id
                    const isCorrect = revealed && revealAnswer && c.id === revealAnswer
                    const isWrongLocked = revealed && isLocked && revealAnswer && c.id !== revealAnswer
                    let classes = 'choice'
                    if (isCorrect) classes += ' correct'
                    else if (isWrongLocked) classes += ' wrong'
                    else if (isLocked) classes += ' locked'
                    return (
                      <button
                        key={c.id}
                        disabled={disabled}
                        onClick={() => submitAnswer(c.id)}
                        className={classes}
                      >
                        <div className="py-1 sm:py-0 text-base sm:text-[15px] leading-snug">{c.text}</div>
                      </button>
                    )
                  })}
                </div>
              ) : (
                <form
                  onSubmit={(e) => {
                    e.preventDefault()
                    if (locked || revealed || paused || submitting || (timeLeft <= 0)) return
                    const val = (e.target as any).ans.value
                    setSubmitting(true)
                    setLockedAnswer(val)
                    submitAnswer(val)
                  }}
                  className="flex gap-2"
                >
                  <input className="flex-1" name="ans" placeholder="Type your answer" disabled={locked || revealed || paused || submitting || (timeLeft <= 0)} />
                  <BrandButton className="min-w-[120px]" type="submit" disabled={locked || revealed || paused || submitting || (timeLeft <= 0)}>{submitting ? 'Locking…' : 'Submit'}</BrandButton>
                </form>
              )}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-4 text-sm text-slate-300">
                <span>Time left: {timeLeft}s</span>
                {submitting && !locked && !revealed && <span>Locking…</span>}
                {locked && !revealed && <span>Answer locked</span>}
                {locked && lockedAnswer && revealed && result && (
                  <span className={result.correct ? 'text-emerald-300' : 'text-rose-300'}>You answered: {lockedAnswer}</span>
                )}
                {!locked && revealed && <span>You did not answer</span>}
              </div>
              {hint && <p className="mt-2 text-sm text-slate-300"><em>Hint:</em> {hint}</p>}
              {revealed && revealAnswer && question.choices && (
                <p className="mt-3 text-slate-200"><strong>Correct answer:</strong> {question.choices.find((c: any) => c.id === revealAnswer)?.text || revealAnswer}</p>
              )}
              {revealed && revealAnswer && !question.choices && (
                <p className="mt-3 text-slate-200"><strong>Correct answer:</strong> {revealAnswer}</p>
              )}
              {rejectedReason && !locked && !revealed && (
                <p className="mt-3 text-amber-300">Answer rejected: {rejectedReason.replace(/_/g, ' ')}</p>
              )}
              {/* Leaderboard visibility now controlled by admin */}
            </div>
          ) : (
            <p className="text-slate-300">Waiting for next question…</p>
          )}
        </GlassCard>

        <div className="mt-6">
          <div className="text-sm font-semibold mb-2 text-slate-300">Lifelines</div>
          <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-2">
            <BrandButton className="w-full" variant="muted" onClick={() => useLifeline('5050')} disabled={!lifelineStatus['5050'] || paused || revealed || locked || submitting || (timeLeft <= 0)}>50-50</BrandButton>
            <BrandButton className="w-full" variant="muted" onClick={() => useLifeline('hint')} disabled={!lifelineStatus['hint'] || paused || revealed || locked || submitting || (timeLeft <= 0)}>Hint</BrandButton>
          </div>
          {lifelineMsg && <div className="mt-2 text-xs text-slate-400">{lifelineMsg}</div>}
        </div>

        {result && revealed && (
          <p className={`mt-4 font-medium ${result.correct ? 'text-emerald-300' : 'text-rose-300'}`}>
            {result.correct ? 'Correct!' : 'Wrong!'} Score: {result.score}
          </p>
        )}
      </div>
  <BrandStrip />
      {showLB && (
        <div className="fixed inset-0 z-50" style={{ background: 'rgba(0,0,0,0.6)' }}>
          <div className="flex flex-col h-full">
            <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-white/10 glass flex items-center justify-between">
              <h3 className="text-2xl font-bold text-white">Leaderboard</h3>
              <span className="text-sm text-slate-300">Shown by host</span>
            </div>
            <div className="flex-1 overflow-auto p-4 sm:p-6 brand">
              <div className="max-w-4xl mx-auto">
                {leaderboard.length === 0 && <p className="text-base text-slate-300">No entries yet.</p>}
                {leaderboard.length > 0 && (
                  <table className="w-full text-base">
                    <thead>
                      <tr className="text-left border-b border-white/10 text-slate-300">
                        <th className="py-2 w-12">#</th>
                        <th className="py-2">Name</th>
                        <th className="py-2 text-right">Score</th>
                      </tr>
                    </thead>
                    <tbody>
                      {leaderboard.map((p, i) => (
                        <tr key={p.id} className="border-b border-white/5 text-slate-200">
                          <td className="py-2">{i + 1}</td>
                          <td className="py-2">{p.name}</td>
                          <td className="py-2 text-right">{p.score}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </BrandLayout>
  )
}
