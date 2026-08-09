'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import useSWR from 'swr'
import {
  LayoutDashboard, Database, Bell, AlertTriangle, Phone,
  Terminal, Brain, Shield, Timer, Bot, Users, Settings,
  LogOut, X, ChevronRight, Server, Landmark, Boxes, ShoppingCart, Factory, UserRound,
  Package, ClipboardList,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface NavItem {
  href: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  group?: string
}

const NAV: NavItem[] = [
  // System
  { href: '/overview',      label: 'Overview',         icon: LayoutDashboard,  group: 'System' },
  { href: '/tenants',       label: 'ERP Systems',      icon: Database,         group: 'System' },
  { href: '/services',      label: 'Connector Health', icon: Server,           group: 'System' },
  { href: '/alerts',        label: 'Alerts',           icon: Bell,             group: 'System' },
  // Modules
  { href: '/fi',            label: 'FI',               icon: Landmark,         group: 'Modules' },
  { href: '/mm',            label: 'MM',               icon: Boxes,            group: 'Modules' },
  { href: '/sd',            label: 'SD',               icon: ShoppingCart,     group: 'Modules' },
  { href: '/pp',            label: 'PP',               icon: Factory,          group: 'Modules' },
  { href: '/hcm',           label: 'HCM',              icon: UserRound,        group: 'Modules' },
  // Operations
  { href: '/incidents',     label: 'Incidents',        icon: AlertTriangle,    group: 'Ops' },
  { href: '/oncall',        label: 'On-Call',          icon: Phone,            group: 'Ops' },
  { href: '/sla',           label: 'SLA Tracker',      icon: Timer,            group: 'Ops' },
  { href: '/automation',    label: 'Automation',       icon: Terminal,         group: 'Ops' },
  { href: '/autonomous',    label: 'Autonomous Ops',   icon: Brain,            group: 'Ops' },
  { href: '/transport',     label: 'Transport Gov.',   icon: Package,          group: 'Ops' },
  // Platform
  { href: '/security',      label: 'Security',         icon: Shield,           group: 'Platform' },
  { href: '/copilot',       label: 'AI Copilot',       icon: Bot,              group: 'Platform' },
  { href: '/audit',         label: 'Audit Log',        icon: ClipboardList,    group: 'Platform' },
]

const BOTTOM: NavItem[] = [
  { href: '/team',     label: 'Team',     icon: Users },
  { href: '/settings', label: 'Settings', icon: Settings },
]

const fetcher = (url: string) => fetch(url).then(r => r.json())

function GroupLabel({ label }: { label: string }) {
  return <div className="px-3 pt-3 pb-1 text-[9px] font-bold uppercase tracking-widest text-slate-600">{label}</div>
}

function NavLink({ item, active, onClick }: { item: NavItem; active: boolean; onClick?: () => void }) {
  const Icon = item.icon
  return (
    <Link href={item.href} onClick={onClick}
      className={cn(
        'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors group',
        active
          ? 'bg-blue-500/15 text-blue-400 border border-blue-500/25'
          : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
      )}>
      <Icon className={cn('w-4 h-4 flex-shrink-0', active ? 'text-blue-400' : 'text-slate-500 group-hover:text-slate-300')} />
      <span className="flex-1 truncate">{item.label}</span>
      {active && <ChevronRight className="w-3 h-3 text-blue-500 flex-shrink-0" />}
    </Link>
  )
}

export function Sidebar({ onClose }: { onClose?: () => void }) {
  const pathname = usePathname()
  const router = useRouter()
  const { data: me } = useSWR('/api/auth/me', fetcher)

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/login')
    router.refresh()
  }

  const groups = ['System', 'Modules', 'Ops', 'Platform']

  return (
    <div className="flex flex-col h-full bg-[#0a1020] border-r border-slate-800/60">
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-4 py-4 border-b border-slate-800/60">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-400 flex items-center justify-center flex-shrink-0 shadow-md shadow-blue-500/30">
          <Database className="w-4 h-4 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-white font-black text-base leading-none">VynSAP</div>
          <div className="text-slate-500 text-[10px] leading-none mt-0.5">SAP ERP Ops</div>
        </div>
        {onClose && (
          <button onClick={onClose} className="text-slate-400 hover:text-white lg:hidden">
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-2 py-2">
        {groups.map(group => {
          const items = NAV.filter(n => n.group === group)
          return (
            <div key={group}>
              <GroupLabel label={group} />
              {items.map(item => (
                <NavLink key={item.href} item={item} active={pathname === item.href} onClick={onClose} />
              ))}
            </div>
          )
        })}
        <div className="border-t border-slate-800/60 mt-2 pt-2">
          {BOTTOM.map(item => (
            <NavLink key={item.href} item={item} active={pathname === item.href} onClick={onClose} />
          ))}
        </div>
      </nav>

      {/* User */}
      <div className="border-t border-slate-800/60 p-3">
        <div className="flex items-center gap-3 px-2 py-1.5">
          <div className="w-7 h-7 rounded-full bg-blue-500/20 border border-blue-500/30 flex items-center justify-center flex-shrink-0">
            <span className="text-blue-400 text-xs font-bold">
              {me?.name ? me.name.charAt(0).toUpperCase() : '?'}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[11px] font-bold text-white truncate">{me?.name ?? '…'}</div>
            <div className="text-[9px] text-slate-500 uppercase font-bold">{me?.role ?? ''}</div>
          </div>
          <button onClick={handleLogout} title="Sign out"
            className="text-slate-500 hover:text-red-400 transition-colors">
            <LogOut className="w-4 h-4" />
          </button>
        </div>
        <div className="px-2 pt-2 text-[10px] text-slate-600">
          Part of the <span className="text-slate-500">VynOps Suite</span>
        </div>
      </div>
    </div>
  )
}
