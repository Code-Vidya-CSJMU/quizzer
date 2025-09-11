import { api } from '../config'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BrandLayout, GlassCard, BrandButton, BrandStrip } from '../components/Brand'

export default function Lobby() {
  // Global quiz - no code needed
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
    const vResp = await fetch(api(`/api/quiz/validate`))
      if (!vResp.ok) throw new Error('Quiz not available')
      const v = await vResp.json()
      if (!v.valid) throw new Error('Quiz not available')
    const regResp = await fetch(api(`/api/quiz/register`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email }),
      })
      if (!regResp.ok) {
        if (regResp.status === 409) throw new Error('Email already registered')
        if (regResp.status === 403) throw new Error('Email not allowed')
        throw new Error('Registration failed')
      }
      const reg = await regResp.json()
      navigate('/quiz', { state: { name, email, playerId: reg.playerId, participantCode: reg.participantCode } })
    } catch (err: any) {
      setError(err.message || 'Join failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <BrandLayout subtitle={<span className="hidden sm:inline">Live Quiz</span>}>
      <div className="max-w-3xl mx-auto">
        <div className="mb-6 sm:mb-8 flex items-center justify-center gap-4 sm:gap-6 opacity-95">
          <img src="/brands/coding_club.jpg" alt="Code Vidya" className="h-10 sm:h-14 rounded" />
          <span className="text-slate-300">×</span>
          <img src="/brands/robotics_club.jpg" alt="Robo Gyan" className="h-10 sm:h-14 rounded" />
        </div>
        <div className="max-w-md mx-auto">
        <GlassCard>
          <div className="text-center mb-6">
            <h1 className="text-3xl font-extrabold tracking-tight">Join the Quiz</h1>
            <p className="text-sm text-slate-300 mt-1">Enter your name and email to get started.</p>
          </div>
          <form onSubmit={handleJoin} className="space-y-4">
            <div>
              <label className="block mb-1 text-slate-400">Your Name</label>
              <input className="w-full" value={name} onChange={e => setName(e.target.value)} required />
            </div>
            <div>
              <label className="block mb-1 text-slate-400">Email (used as your code)</label>
              <input className="w-full" type="email" value={email} onChange={e => setEmail(e.target.value)} required />
            </div>
            <BrandButton className="w-full" type="submit" disabled={loading}>
              {loading ? 'Joining…' : 'Enter Quiz'}
            </BrandButton>
          </form>
          {error && <p className="text-rose-400 text-sm mt-4">{error}</p>}
          <p className="text-center text-xs text-slate-400 mt-6">By joining you agree to follow the host’s instructions.</p>
            <BrandStrip />
        </GlassCard>
        </div>
      </div>
    </BrandLayout>
  )
}
