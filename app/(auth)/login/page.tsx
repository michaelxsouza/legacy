'use client'
import { signIn } from 'next-auth/react'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

// Pre-computed particle data to avoid hydration mismatch
const PARTICLES = [
  { id: 0,  left: '5%',   delay: '0s',    dur: '9s',  size: 2, driftX: 18,  opacity: 0.55 },
  { id: 1,  left: '12%',  delay: '1.4s',  dur: '12s', size: 3, driftX: -22, opacity: 0.40 },
  { id: 2,  left: '20%',  delay: '2.8s',  dur: '8s',  size: 2, driftX: 14,  opacity: 0.65 },
  { id: 3,  left: '28%',  delay: '0.6s',  dur: '14s', size: 2, driftX: -10, opacity: 0.35 },
  { id: 4,  left: '35%',  delay: '3.5s',  dur: '10s', size: 3, driftX: 25,  opacity: 0.50 },
  { id: 5,  left: '43%',  delay: '1.8s',  dur: '7s',  size: 2, driftX: -18, opacity: 0.60 },
  { id: 6,  left: '50%',  delay: '4.2s',  dur: '11s', size: 2, driftX: 12,  opacity: 0.45 },
  { id: 7,  left: '57%',  delay: '0.3s',  dur: '13s', size: 3, driftX: -20, opacity: 0.38 },
  { id: 8,  left: '63%',  delay: '2.1s',  dur: '9s',  size: 2, driftX: 22,  opacity: 0.58 },
  { id: 9,  left: '70%',  delay: '5.0s',  dur: '8s',  size: 2, driftX: -14, opacity: 0.48 },
  { id: 10, left: '77%',  delay: '1.0s',  dur: '15s', size: 3, driftX: 16,  opacity: 0.32 },
  { id: 11, left: '84%',  delay: '3.3s',  dur: '10s', size: 2, driftX: -24, opacity: 0.55 },
  { id: 12, left: '91%',  delay: '0.8s',  dur: '12s', size: 2, driftX: 10,  opacity: 0.42 },
  { id: 13, left: '96%',  delay: '2.5s',  dur: '8s',  size: 3, driftX: -16, opacity: 0.62 },
  { id: 14, left: '9%',   delay: '6.0s',  dur: '11s', size: 2, driftX: 20,  opacity: 0.40 },
  { id: 15, left: '24%',  delay: '4.5s',  dur: '9s',  size: 2, driftX: -12, opacity: 0.52 },
  { id: 16, left: '39%',  delay: '7.2s',  dur: '14s', size: 3, driftX: 18,  opacity: 0.35 },
  { id: 17, left: '54%',  delay: '3.0s',  dur: '8s',  size: 2, driftX: -22, opacity: 0.60 },
  { id: 18, left: '68%',  delay: '5.8s',  dur: '12s', size: 2, driftX: 14,  opacity: 0.44 },
  { id: 19, left: '82%',  delay: '1.6s',  dur: '10s', size: 3, driftX: -18, opacity: 0.50 },
]

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPwd, setShowPwd] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => { setMounted(true) }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const res = await signIn('credentials', { email, password, redirect: false })
    if (res?.error) {
      setError('E-mail ou senha inválidos')
      setLoading(false)
    } else {
      router.push('/dashboard')
    }
  }

  return (
    <div className="min-h-screen bg-[#060606] flex items-center justify-center p-4 relative overflow-hidden">

      <style>{`
        @keyframes ember-rise {
          0%   { transform: translateY(0px) translateX(0px); opacity: 0; }
          10%  { opacity: 1; }
          85%  { opacity: 0.6; }
          100% { transform: translateY(-110vh) translateX(var(--drift)); opacity: 0; }
        }
        @keyframes orb-breathe {
          0%, 100% { transform: translate(-50%, -50%) scale(1);   opacity: 0.9; }
          50%       { transform: translate(-50%, -50%) scale(1.18); opacity: 1;   }
        }
        @keyframes orb-drift-a {
          0%, 100% { transform: translate(0, 0) scale(1);    opacity: 0.7; }
          33%       { transform: translate(40px, -30px) scale(1.1); opacity: 0.9; }
          66%       { transform: translate(-20px, 20px) scale(0.95); opacity: 0.7; }
        }
        @keyframes orb-drift-b {
          0%, 100% { transform: translate(0, 0) scale(1);    opacity: 0.6; }
          40%       { transform: translate(-50px, 40px) scale(1.12); opacity: 0.85; }
          70%       { transform: translate(30px, -20px) scale(0.9); opacity: 0.6; }
        }
        @keyframes grid-pan {
          0%   { background-position: 0 0; }
          100% { background-position: 0 96px; }
        }
        @keyframes card-in {
          0%   { opacity: 0; transform: translateY(28px) scale(0.97); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes glow-pulse {
          0%, 100% { opacity: 0.7; }
          50%       { opacity: 1; }
        }
        .ember {
          position: absolute;
          bottom: -8px;
          border-radius: 50%;
          animation: ember-rise linear infinite;
          background: radial-gradient(circle, #fb923c 0%, #f97316 40%, transparent 100%);
          box-shadow: 0 0 6px 1px rgba(249,115,22,0.6);
        }
        .orb-center {
          position: absolute;
          top: 50%; left: 50%;
          animation: orb-breathe 6s ease-in-out infinite;
          border-radius: 50%;
        }
        .orb-a {
          animation: orb-drift-a 14s ease-in-out infinite;
        }
        .orb-b {
          animation: orb-drift-b 18s ease-in-out infinite;
        }
        .grid-anim {
          animation: grid-pan 4s linear infinite;
        }
        .card-animate {
          animation: card-in 0.75s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        .glow-line {
          animation: glow-pulse 3s ease-in-out infinite;
        }
      `}</style>

      {/* ── Animated background layer ── */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">

        {/* Slowly moving grid */}
        <div
          className="grid-anim absolute inset-0 opacity-[0.028]"
          style={{
            backgroundImage:
              'linear-gradient(rgba(255,255,255,0.25) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.25) 1px, transparent 1px)',
            backgroundSize: '48px 48px',
          }}
        />

        {/* Center breathing orb */}
        <div
          className="orb-center w-[720px] h-[720px]"
          style={{ background: 'radial-gradient(circle, rgba(249,115,22,0.13) 0%, transparent 65%)', marginLeft: '-360px', marginTop: '-360px' }}
        />

        {/* Drifting side orbs */}
        <div
          className="orb-a absolute -top-40 -left-40 w-[550px] h-[550px] rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(234,88,12,0.09) 0%, transparent 70%)' }}
        />
        <div
          className="orb-b absolute -bottom-40 -right-40 w-[600px] h-[600px] rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(249,115,22,0.08) 0%, transparent 70%)' }}
        />
        <div
          className="orb-a absolute top-1/3 -right-60 w-[400px] h-[400px] rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(251,146,60,0.07) 0%, transparent 70%)', animationDelay: '-5s' }}
        />

        {/* Ember particles */}
        {PARTICLES.map(p => (
          <div
            key={p.id}
            className="ember"
            style={{
              left: p.left,
              width: `${p.size}px`,
              height: `${p.size}px`,
              opacity: p.opacity,
              animationDuration: p.dur,
              animationDelay: p.delay,
              '--drift': `${p.driftX}px`,
            } as React.CSSProperties}
          />
        ))}

        {/* Vignette */}
        <div
          className="absolute inset-0"
          style={{ background: 'radial-gradient(ellipse 80% 80% at 50% 50%, transparent 40%, rgba(0,0,0,0.6) 100%)' }}
        />
      </div>

      {/* ── Card ── */}
      <div className={`relative w-full max-w-[420px] ${mounted ? 'card-animate' : 'opacity-0'}`}>

        {/* Top glow line */}
        <div className="glow-line absolute -top-px left-10 right-10 h-px bg-gradient-to-r from-transparent via-orange-500/80 to-transparent" />

        <div className="bg-[#0C0C0C]/96 backdrop-blur-2xl border border-white/[0.07] rounded-2xl px-8 pt-10 pb-8 shadow-[0_32px_80px_rgba(0,0,0,0.85),0_0_0_1px_rgba(249,115,22,0.04)]">

          {/* Logo */}
          <div className="flex flex-col items-center mb-10">
            <div className="relative mb-2">
              <div className="absolute -inset-8 bg-orange-500/20 rounded-full blur-3xl" />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/logo.png"
                alt="Legacy"
                style={{
                  width: '210px',
                  height: 'auto',
                  position: 'relative',
                  filter: 'drop-shadow(0 0 18px rgba(249,115,22,0.55))',
                  display: 'block',
                }}
              />
            </div>
            <p className="text-gray-500 text-sm tracking-wide mt-4">Acesse sua conta para continuar</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">

            {/* Email */}
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-gray-500 uppercase tracking-widest">E-mail</label>
              <div className="relative">
                <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-600 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
                </svg>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  placeholder="seu@email.com"
                  className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl pl-10 pr-4 py-3 text-sm text-white placeholder-gray-700 focus:outline-none focus:border-orange-500/50 focus:bg-white/[0.06] transition-all"
                />
              </div>
            </div>

            {/* Password */}
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-gray-500 uppercase tracking-widest">Senha</label>
              <div className="relative">
                <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-600 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                </svg>
                <input
                  type={showPwd ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  placeholder="••••••••"
                  className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl pl-10 pr-11 py-3 text-sm text-white placeholder-gray-700 focus:outline-none focus:border-orange-500/50 focus:bg-white/[0.06] transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPwd(v => !v)}
                  tabIndex={-1}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-600 hover:text-gray-400 transition-colors"
                >
                  {showPwd ? (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
                    </svg>
                  ) : (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            {/* Error */}
            {error && (
              <div className="flex items-center gap-2.5 bg-red-500/[0.07] border border-red-500/20 rounded-xl px-4 py-3">
                <svg className="w-4 h-4 text-red-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                </svg>
                <p className="text-red-300 text-sm">{error}</p>
              </div>
            )}

            {/* Submit */}
            <div className="pt-1">
              <button
                type="submit"
                disabled={loading}
                className="relative w-full py-3.5 rounded-xl text-sm font-bold text-black overflow-hidden group disabled:opacity-60 disabled:cursor-not-allowed transition-opacity"
                style={{ background: 'linear-gradient(135deg, #FB923C 0%, #EA580C 100%)' }}
              >
                <span className="absolute inset-0 bg-white/[0.08] opacity-0 group-hover:opacity-100 transition-opacity duration-200" />
                <span className="relative flex items-center justify-center gap-2.5">
                  {loading ? (
                    <>
                      <span className="w-4 h-4 border-2 border-black/20 border-t-black rounded-full animate-spin" />
                      Entrando...
                    </>
                  ) : (
                    'Entrar'
                  )}
                </span>
              </button>
            </div>
          </form>

          <p className="text-center text-gray-700 text-[11px] mt-7">
            © {new Date().getFullYear()} Legacy · Todos os direitos reservados
          </p>
        </div>

        {/* Bottom glow line */}
        <div className="absolute -bottom-px left-10 right-10 h-px bg-gradient-to-r from-transparent via-orange-500/30 to-transparent" />
      </div>
    </div>
  )
}
