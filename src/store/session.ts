/** The signed-in staff user, their role and what they may open. */
import { useStore } from './useStore'
import { useUI } from './useUI'
import { ALL_MODULES, canAccess, mobileTabsFor, type ModuleKey } from '@/lib/rbac'

export function useSession() {
  const userId = useUI((s) => s.userId)
  const users = useStore((s) => s.db.users)
  const roles = useStore((s) => s.db.roles)
  const user = users.find((u) => u.id === userId)
  const role = roles.find((r) => r.key === user?.roleKey)
  const modules: ModuleKey[] = role?.key === 'owner' ? ALL_MODULES : ((role?.modules ?? []) as ModuleKey[])
  return {
    user,
    role,
    /** staff user that is active and holds a staff role */
    valid: !!user && user.active && role?.kind === 'staff',
    modules,
    can: (k: ModuleKey) => canAccess(role, k),
    tabs: mobileTabsFor(modules),
  }
}
