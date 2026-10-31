import { lazy, Suspense, useEffect } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { Toaster } from 'sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { ConfirmProvider, LoadingState } from '@/components/common'
import { AppShell } from '@/components/layout/AppShell'
import { useUI } from '@/store/useUI'
import { setFormatLang } from '@/lib/format'

const Dashboard = lazy(() => import('@/modules/dashboard'))
const Purchases = lazy(() => import('@/modules/purchases'))
const Imports = lazy(() => import('@/modules/imports'))
const GRN = lazy(() => import('@/modules/grn'))
const Inventory = lazy(() => import('@/modules/inventory'))
const Customers = lazy(() => import('@/modules/customers'))
const CustomerDetail = lazy(() => import('@/modules/customers/CustomerDetail'))
const Sales = lazy(() => import('@/modules/sales'))
const Fleet = lazy(() => import('@/modules/fleet'))
const DriverDetail = lazy(() => import('@/modules/fleet/DriverDetail'))
const Distribution = lazy(() => import('@/modules/distribution'))
const Collections = lazy(() => import('@/modules/collections'))
const Settlement = lazy(() => import('@/modules/settlement'))
const Accounts = lazy(() => import('@/modules/accounts'))
const Reports = lazy(() => import('@/modules/reports'))
const Settings = lazy(() => import('@/modules/settings'))
const DriverApp = lazy(() => import('@/modules/driver-app'))
const Login = lazy(() => import('@/modules/auth/Login'))

// demo convenience: ?lang=ar / ?lang=en in any URL switches the interface language
const urlLang = new URLSearchParams(window.location.search).get('lang')
if (urlLang === 'ar' || urlLang === 'en') useUI.getState().setLang(urlLang)

export default function App() {
  const lang = useUI((s) => s.lang)
  useEffect(() => {
    setFormatLang(lang)
    document.documentElement.lang = lang
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr'
  }, [lang])
  setFormatLang(lang)
  return (
    <TooltipProvider delayDuration={200}>
      <ConfirmProvider>
        <BrowserRouter>
          <Suspense fallback={<div className="p-6"><LoadingState /></div>}>
            {/* key on language so every formatted number / label re-renders on switch */}
            <Routes key={lang}>
              <Route path="/login" element={<Login />} />
              <Route path="/driver/*" element={<DriverApp />} />
              <Route element={<AppShell />}>
                <Route index element={<Dashboard />} />
                <Route path="purchases" element={<Purchases />} />
                <Route path="imports" element={<Imports />} />
                <Route path="grn" element={<GRN />} />
                <Route path="inventory" element={<Inventory />} />
                <Route path="customers" element={<Customers />} />
                <Route path="customers/:id" element={<CustomerDetail />} />
                <Route path="sales" element={<Sales />} />
                <Route path="fleet" element={<Fleet />} />
                <Route path="fleet/drivers/:id" element={<DriverDetail />} />
                <Route path="distribution" element={<Distribution />} />
                <Route path="collections" element={<Collections />} />
                <Route path="settlement" element={<Settlement />} />
                <Route path="accounts" element={<Accounts />} />
                <Route path="reports" element={<Reports />} />
                <Route path="settings" element={<Settings />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Route>
            </Routes>
          </Suspense>
        </BrowserRouter>
        <Toaster position={lang === 'ar' ? 'top-left' : 'top-right'} richColors closeButton dir={lang === 'ar' ? 'rtl' : 'ltr'} />
      </ConfirmProvider>
    </TooltipProvider>
  )
}
