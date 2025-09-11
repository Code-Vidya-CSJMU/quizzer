import { useEffect, useRef, useState } from 'react'
import { io, Socket } from 'socket.io-client'
import { SOCKET_URL, SOCKET_PATH } from '../config'

export default function Display() {
  const [socket, setSocket] = useState<Socket | null>(null)
  const [question, setQuestion] = useState<any>(null)
  const [status, setStatus] = useState<any>(null)
  const [timeLeft, setTimeLeft] = useState<number>(0)
  const [showLB, setShowLB] = useState<boolean>(false)
  const [leaderboard, setLeaderboard] = useState<any[]>([])
  const [revealed, setRevealed] = useState<boolean>(false)
  const [revealAnswer, setRevealAnswer] = useState<string | null>(null)
  const serverSkewRef = useRef<number>(0)
  const timerRef = useRef<number | null>(null)

  useEffect(() => {
    const s = io(SOCKET_URL, { path: SOCKET_PATH, transports: ['websocket'] })
    s.on('connect', () => { s.emit('display_join', {}) })
    s.on('question', (payload) => {
      const q = payload?.question || payload
      setQuestion(q)
      setShowLB(false)
      setRevealed(false)
      setRevealAnswer(null)
      // timing
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
      if (typeof st?.revealed === 'boolean') setRevealed(!!st.revealed)
      if (typeof st?.serverTime === 'number') {
        const clientNow = Date.now() / 1000
        serverSkewRef.current = st.serverTime - clientNow
      }
      if (typeof st?.remaining === 'number') setTimeLeft(Math.ceil(st.remaining))
    })
    s.on('reveal', (data) => {
      setRevealAnswer(data?.correctAnswer || null)
      setRevealed(true)
    })
    s.on('leaderboard', (lb) => setLeaderboard(lb || []))
    s.on('leaderboard_show', (lb) => { setLeaderboard(lb || []); setShowLB(true) })
    s.on('leaderboard_hide', () => setShowLB(false))
    setSocket(s)
    return () => { s.disconnect() }
  }, [])

  useEffect(() => {
    if (status?.paused || revealed) return
    if (timeLeft <= 0) return
    if (timerRef.current) window.clearTimeout(timerRef.current)
    timerRef.current = window.setTimeout(() => setTimeLeft(t => Math.max(0, t - 1)), 1000)
    return () => { if (timerRef.current) window.clearTimeout(timerRef.current) }
  }, [timeLeft, status?.paused, revealed])

  return (
    <div className="display-root">
      <header className="display-header">
        <div className="logos">
          <img src="/brands/coding_club.jpg" alt="Code Vidya" />
          <span className="x">×</span>
          <img src="/brands/robotics_club.jpg" alt="Robo Gyan" />
        </div>
        <div className="timer">{Math.max(0, timeLeft)}s</div>
      </header>

      {!showLB && (
        <main className="display-main">
          {question ? (
            <div className="question-card">
              <div className="q-text">{question.text}</div>
              {question.choices && (
                <div className="choices">
                  {question.choices.map((c: any) => {
                    const isCorrect = revealed && !!revealAnswer && c.id === revealAnswer
                    return (
                      <div key={c.id} className={`choice${isCorrect ? ' correct' : ''}`}>{c.text}</div>
                    )
                  })}
                </div>
              )}
              {!question.choices && revealed && revealAnswer && (
                <div className="reveal-text"><strong>Correct answer:</strong> {revealAnswer}</div>
              )}
            </div>
          ) : (
            <div className="waiting">Waiting for question…</div>
          )}
        </main>
      )}

      {showLB && (
        <div className="lb-overlay">
          <div className="lb-panel">
            <h1 className="lb-title">Leaderboard</h1>
            <div className="lb-table-wrap">
              <table className="lb-table">
                <thead>
                  <tr><th className="rank">#</th><th>Name</th><th>Email</th><th className="score">Score</th></tr>
                </thead>
                <tbody>
                  {leaderboard.map((p, i) => (
                    <tr key={p.id}>
                      <td className="rank">{i + 1}</td>
                      <td>{p.name}</td>
                      <td className="email">{p.email || ''}</td>
                      <td className="score">{p.score}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .display-root { background: radial-gradient(100% 100% at 0% 0%, #0f172a 0%, #020617 100%); color: #fff; min-height: 100vh; }
        .display-header { display:flex; align-items:center; justify-content:space-between; padding: 24px 36px; border-bottom: 1px solid rgba(255,255,255,0.08); }
        .logos { display:flex; align-items:center; gap: 12px; opacity: 0.95; }
        .logos img { height: 52px; border-radius: 8px; }
        .logos .x { color:#94a3b8; font-size: 24px; }
        .timer { font-size: 42px; font-weight: 800; letter-spacing: -0.02em; background: linear-gradient(90deg, #60a5fa, #22d3ee); -webkit-background-clip:text; background-clip:text; color:transparent; }
        .display-main { padding: 48px 36px; }
        .question-card { max-width: 1400px; margin: 0 auto; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.12); border-radius: 16px; padding: 32px; box-shadow: 0 10px 30px rgba(0,0,0,0.25); }
        .q-text { font-size: 40px; font-weight: 800; line-height: 1.1; margin-bottom: 24px; }
        .choices { display:grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
  .choice { background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.12); border-radius: 12px; padding: 14px 16px; font-size: 22px; }
  .choice.correct { background: rgba(16,185,129,0.18); border-color: rgba(16,185,129,0.55); box-shadow: 0 0 0 2px rgba(16,185,129,0.25) inset; }
  .reveal-text { margin-top: 18px; font-size: 28px; color: #a7f3d0; }
        .waiting { text-align:center; color:#cbd5e1; font-size: 22px; }
        .lb-overlay { position:fixed; inset:0; display:flex; align-items:center; justify-content:center; background: rgba(2,6,23,0.85); z-index:50; }
        .lb-panel { width: min(1400px, 92vw); background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.12); border-radius: 20px; padding: 28px 28px 18px; box-shadow: 0 20px 60px rgba(0,0,0,0.45); }
        .lb-title { font-size: 52px; font-weight: 900; letter-spacing: -0.02em; margin: 0 0 16px; text-align:center; }
        .lb-table-wrap { max-height: 68vh; overflow:auto; border-radius: 12px; }
        .lb-table { width:100%; border-collapse: collapse; font-size: 22px; }
        .lb-table thead tr { background: rgba(255,255,255,0.08); }
        .lb-table th, .lb-table td { padding: 12px 16px; border-bottom: 1px solid rgba(255,255,255,0.08); }
        .lb-table td.rank, .lb-table th.rank { width: 60px; text-align: center; }
        .lb-table td.score, .lb-table th.score { text-align: right; width: 140px; }
        .lb-table td.email { color:#cbd5e1; }
      `}</style>
    </div>
  )
}
