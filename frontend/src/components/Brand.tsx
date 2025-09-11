import React from 'react'

// Images are served from /public/brands
const tuxUrl = '/brands/tux.jpg'
const codeVidyaUrl = '/brands/coding_club.jpg'
const roboVigyanUrl = '/brands/robotics_club.jpg'

type BrandHeaderProps = {
  subtitle?: React.ReactNode
}

export function BrandHeader({ subtitle }: BrandHeaderProps) {
  return (
    <header className="sticky top-0 z-40 header-blur safe-pt">
      <div className="max-w-6xl mx-auto px-3 sm:px-6 py-2 sm:py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <img src={tuxUrl} alt="TuxTalk 25" className="h-10 sm:h-16 md:h-20 block rounded" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
          <div className="leading-tight">
            <div className="font-extrabold tracking-tight text-white">TuxTalk 25</div>
            <div className="text-xs text-slate-300">Think Open. Build Better</div>
          </div>
        </div>
  {/* Top header shows only Tux Talk branding */}
        {subtitle && (
          <div className="ml-4 text-xs sm:text-sm text-slate-300 whitespace-nowrap">{subtitle}</div>
        )}
      </div>
    </header>
  )
}

export function BrandLayout({ children, subtitle }: React.PropsWithChildren<{ subtitle?: React.ReactNode }>) {
  return (
    <div className="brand">
      <BrandHeader subtitle={subtitle} />
  <main className="max-w-6xl mx-auto px-3 sm:px-6 py-4 sm:py-6 safe-pb">
        {children}
      </main>
    </div>
  )
}

export function GlassCard({ children, className = '' }: React.PropsWithChildren<{ className?: string }>) {
  return <div className={`card glass ${className}`}>{children}</div>
}

export function BrandButton(props: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'muted' }) {
  const { variant = 'primary', className = '', ...rest } = props
  const base = variant === 'primary' ? 'btn-brand' : 'btn-muted'
  return <button className={`${base} ${className}`} {...rest} />
}

export function BrandStrip() {
  return (
  <div className="mt-6 hidden sm:flex items-center justify-center gap-4 opacity-90">
      <img src={codeVidyaUrl} alt="Code Vidya" className="h-8 sm:h-10 rounded" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
      <span className="text-slate-400 text-base sm:text-lg">×</span>
      <img src={roboVigyanUrl} alt="Robo Gyan" className="h-8 sm:h-10 rounded" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
    </div>
  )
}
