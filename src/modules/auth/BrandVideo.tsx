/**
 * Muted background footage for the sign-in brand panel: poultry and sheep clips cross-fade in a
 * loop at low opacity under a forest-green overlay. Only mounted on large screens (the panel is
 * hidden on phones) and skipped when the user prefers reduced motion.
 * Footage: Pexels (free licence) - "White Broiler Chickens" #4458054, "A Flock of Sheep Grazing and Resting" #5140591.
 */
import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'

const CLIPS = ['/media/poultry.mp4', '/media/sheep.mp4']

function useWideScreen() {
  const q = '(min-width: 1024px) and (prefers-reduced-motion: no-preference)'
  const [ok, setOk] = useState(() => typeof window !== 'undefined' && window.matchMedia(q).matches)
  useEffect(() => {
    const m = window.matchMedia(q)
    const on = () => setOk(m.matches)
    m.addEventListener('change', on)
    return () => m.removeEventListener('change', on)
  }, [])
  return ok
}

export function BrandVideo() {
  const show = useWideScreen()
  const [active, setActive] = useState(0)
  const refs = useRef<(HTMLVideoElement | null)[]>([])
  useEffect(() => {
    if (!show) return
    const v = refs.current[active]
    if (v) {
      v.currentTime = 0
      v.play().catch(() => {})
    }
  }, [active, show])
  if (!show) return null
  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden>
      {CLIPS.map((src, i) => (
        <video
          key={src}
          ref={(el) => { refs.current[i] = el }}
          src={src}
          muted
          playsInline
          autoPlay={i === 0}
          preload={i === 0 ? 'auto' : 'metadata'}
          onEnded={() => setActive((a) => (a + 1) % CLIPS.length)}
          className={cn('absolute inset-0 h-full w-full object-cover transition-opacity duration-[1500ms]', active === i ? 'opacity-25' : 'opacity-0')}
        />
      ))}
      {/* keep text readable: tint + vignette in brand forest green */}
      <div className="absolute inset-0 bg-gradient-to-b from-navy/70 via-navy/55 to-navy/85" />
    </div>
  )
}
