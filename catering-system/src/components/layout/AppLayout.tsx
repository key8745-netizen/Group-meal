import { NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  ClipboardList,
  PackageSearch,
  ShoppingCart,
  BarChart2,
  ChefHat,
  ChevronRight,
  LogOut,
  UtensilsCrossed,
  BookOpen,
  Package,
  NotebookText,
  CalendarRange,
  ClipboardCheck,
} from 'lucide-react';
import { signOut } from 'firebase/auth';
import { auth } from '@/lib/firebase';

type NavItem = {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  end?: boolean;
};

const navGroups: { section: string; items: NavItem[] }[] = [
  {
    section: '總覽',
    items: [
      { to: '/', label: '儀表板', icon: LayoutDashboard, end: true },
    ],
  },
  {
    section: '日常作業',
    items: [
      { to: '/orders', label: '訂單管理', icon: ClipboardList },
      { to: '/menus', label: '菜單管理', icon: BookOpen },
      { to: '/plan', label: '備料規劃', icon: UtensilsCrossed },
    ],
  },
  {
    section: '基礎資料',
    items: [
      { to: '/ingredients-master', label: '食材主檔', icon: Package },
    ],
  },
  {
    section: '菜單與配方',
    items: [
      { to: '/recipes', label: '配方管理', icon: NotebookText },
      { to: '/recipe-menus', label: '菜單配方', icon: CalendarRange },
    ],
  },
  {
    section: '作業規劃',
    items: [
      { to: '/prep-plans', label: '備料快照', icon: ClipboardCheck },
      { to: '/purchase-demand-drafts', label: '採購需求草稿', icon: ClipboardList },
      { to: '/production-workflows', label: '製程規劃', icon: ClipboardCheck },
      { to: '/capacity-feasibility', label: '產能評估', icon: BarChart2 },
      { to: '/menu-mix-recommendations', label: '菜單組合建議', icon: ChefHat },
      { to: '/menu-drafts', label: '草稿菜單', icon: ClipboardCheck },
    ],
  },
  {
    section: '營運管理',
    items: [
      { to: '/inventory', label: '庫存管理', icon: PackageSearch },
      { to: '/purchase', label: '採購管理', icon: ShoppingCart },
    ],
  },
  {
    section: '分析',
    items: [
      { to: '/analytics', label: '報表分析', icon: BarChart2 },
    ],
  },
];

const navItems = navGroups.flatMap((g) => g.items);

export default function AppLayout() {
  const { pathname } = useLocation();
  const pageTitle = [...navItems].reverse().find(({ to, end }) =>
    end ? pathname === to : pathname.startsWith(to),
  )?.label ?? '';

  const user = auth.currentUser;
  const displayName = user?.displayName ?? user?.email?.split('@')[0] ?? '使用者';
  const initials = displayName.slice(0, 2).toUpperCase();

  return (
    <div className="flex h-screen overflow-hidden bg-background">

      {/* ── Sidebar ── */}
      <aside className="flex w-56 shrink-0 flex-col border-r bg-muted/30">

        {/* Logo */}
        <div className="flex h-14 items-center gap-2 border-b px-4">
          <ChefHat size={20} className="text-primary" />
          <span className="font-semibold tracking-tight">餐飲管理系統</span>
        </div>

        {/* Nav links */}
        <nav className="flex-1 space-y-0.5 p-2 pt-3">
          {navGroups.map(({ section, items }) => (
            <div key={section}>
              <div className="px-3 pb-1 pt-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground/60">
                {section}
              </div>
              {items.map(({ to, label, icon: Icon, end }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={end}
                  className={({ isActive }) =>
                    [
                      'flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                      isActive
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                    ].join(' ')
                  }
                >
                  <Icon size={16} />
                  {label}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        {/* User + footer */}
        <div className="border-t p-3 space-y-1">
          <div className="flex items-center gap-2 rounded-md px-3 py-2">
            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
              {initials}
            </div>
            <span className="truncate text-xs text-muted-foreground" title={user?.email ?? ''}>
              {displayName}
            </span>
          </div>
          <button
            onClick={() => signOut(auth)}
            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-xs text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
          >
            <LogOut size={13} />
            登出
          </button>
          <p className="px-3 text-xs text-muted-foreground/40">v0.1.0</p>
        </div>
      </aside>

      {/* ── Main content ── */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">

        {/* Top navbar with breadcrumb */}
        <header className="flex h-14 shrink-0 items-center gap-1.5 border-b px-6">
          <span className="text-sm text-muted-foreground">餐飲管理系統</span>
          {pageTitle && (
            <>
              <ChevronRight size={13} className="shrink-0 text-muted-foreground/40" />
              <span className="text-sm font-medium text-foreground">{pageTitle}</span>
            </>
          )}
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
