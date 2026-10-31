import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { setFormatLang } from '@/lib/format'

export type Role = 'admin' | 'driver'
export type RangePreset = 'today' | '7d' | '30d' | 'mtd' | '90d'

interface UIState {
  lang: 'en' | 'ar'
  role: Role
  driverId: string
  sidebarCollapsed: boolean
  mobileNavOpen: boolean
  range: RangePreset
  setLang: (l: 'en' | 'ar') => void
  setRole: (r: Role, driverId?: string) => void
  setDriver: (id: string) => void
  toggleSidebar: () => void
  setMobileNav: (v: boolean) => void
  setRange: (r: RangePreset) => void
  /** demo admin session */
  authed: boolean
  /** signed-in staff user (db.users id) */
  userId: string
  signIn: (userId: string) => void
  signOut: () => void
}

export const useUI = create<UIState>()(
  persist(
    (set) => ({
      lang: 'en',
      role: 'admin',
      driverId: 'drv_1',
      sidebarCollapsed: false,
      mobileNavOpen: false,
      range: '7d',
      setLang: (lang) => {
        setFormatLang(lang)
        set({ lang })
      },
      setRole: (role, driverId) => set((s) => ({ role, driverId: driverId ?? s.driverId })),
      setDriver: (driverId) => set({ driverId }),
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      setMobileNav: (mobileNavOpen) => set({ mobileNavOpen }),
      setRange: (range) => set({ range }),
      authed: false,
      userId: '',
      signIn: (userId) => set({ authed: true, userId, role: 'admin' }),
      signOut: () => set({ authed: false }),
    }),
    {
      name: 'meatflow-erp-ui',
      partialize: (s) => ({ lang: s.lang, role: s.role, driverId: s.driverId, sidebarCollapsed: s.sidebarCollapsed, range: s.range, authed: s.authed, userId: s.userId }),
      onRehydrateStorage: () => (s) => s && setFormatLang(s.lang),
    },
  ),
)
