import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  ClipboardList,
  PackageSearch,
  ShoppingCart,
  BarChart2,
  ChefHat,
  ChevronRight,
  ChevronDown,
  LogOut,
  Menu,
  Package,
  NotebookText,
  CalendarRange,
  ClipboardCheck,
  FileUp,
  TrendingUp,
  CalendarClock,
  ListChecks,
  CalendarDays,
  Rocket,
  Settings2,
  X,
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
    section: '每天用這裡',
    items: [
      { to: '/', label: '今日開工', icon: Rocket, end: true },
      { to: '/daily-ops', label: '每日工作總覽', icon: ListChecks },
      { to: '/week-plan', label: '週間規劃', icon: CalendarDays },
    ],
  },
  {
    section: '菜與食材',
    items: [
      { to: '/recipes', label: '配方管理', icon: NotebookText },
      { to: '/ingredients-master', label: '食材主檔', icon: Package },
      { to: '/menu-import', label: '月菜單匯入', icon: FileUp },
    ],
  },
  {
    section: '買與存',
    items: [
      { to: '/purchase', label: '採購管理', icon: ShoppingCart },
      { to: '/inventory', label: '庫存管理', icon: PackageSearch },
      { to: '/market-prices', label: '市場行情', icon: TrendingUp },
    ],
  },
  {
    section: '設定',
    items: [
      { to: '/kitchen-settings', label: '我的廚房設定', icon: Settings2 },
    ],
  },
];

/** Detail pages behind the one-click flow — collapsed by default. */
const advancedItems: NavItem[] = [
  { to: '/dashboard', label: '儀表板', icon: LayoutDashboard },
  { to: '/recipe-menus', label: '菜單配方', icon: CalendarRange },
  { to: '/menu-drafts', label: '草稿菜單', icon: ClipboardCheck },
  { to: '/menu-suggestions', label: '菜單建議', icon: ChefHat },
  { to: '/prep-plans', label: '備料快照', icon: ClipboardCheck },
  { to: '/purchase-demand-drafts', label: '採購需求草稿', icon: ClipboardList },
  { to: '/production-workflows', label: '製程規劃', icon: ClipboardCheck },
  { to: '/production-schedules', label: '生產排程', icon: CalendarClock },
  { to: '/analytics', label: '報表分析', icon: BarChart2 },
];

const navItems = [...navGroups.flatMap((g) => g.items), ...advancedItems];

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  [
    'flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors',
    isActive
      ? 'bg-primary text-primary-foreground'
      : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
  ].join(' ');

/** Shared sidebar body — rendered in the desktop aside AND the mobile drawer. */
function SidebarContent({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  const user = auth.currentUser;
  const displayName = user?.displayName ?? user?.email?.split('@')[0] ?? '使用者';
  const initials = displayName.slice(0, 2).toUpperCase();

  return (
    <>
      {/* Nav links */}
      <nav className="flex-1 space-y-0.5 overflow-y-auto p-2 pt-3">
        {navGroups.map(({ section, items }) => (
          <div key={section}>
            <div className="px-3 pb-1 pt-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground/60">
              {section}
            </div>
            {items.map(({ to, label, icon: Icon, end }) => (
              <NavLink key={to} to={to} end={end} className={navLinkClass} onClick={onNavigate}>
                <Icon size={16} />
                {label}
              </NavLink>
            ))}
          </div>
        ))}

        {/* 進階：一鍵流程背後的細部頁面，預設收合 */}
        <details open={advancedItems.some(({ to }) => pathname.startsWith(to))} className="group">
          <summary className="flex cursor-pointer list-none items-center gap-1 px-3 pb-1 pt-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground/60 [&::-webkit-details-marker]:hidden">
            <ChevronDown size={12} className="-rotate-90 transition-transform group-open:rotate-0" />
            進階功能
          </summary>
          {advancedItems.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} className={navLinkClass} onClick={onNavigate}>
              <Icon size={16} />
              {label}
            </NavLink>
          ))}
        </details>
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
    </>
  );
}

export default function AppLayout() {
  const { pathname } = useLocation();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  // 換頁時自動收起行動版選單（返回鍵/連結皆涵蓋）。
  useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname]);

  const pageTitle = [...navItems].reverse().find(({ to, end }) =>
    end ? pathname === to : pathname.startsWith(to),
  )?.label ?? '';

  return (
    <div className="flex h-screen overflow-hidden bg-background">

      {/* ── Sidebar（桌面）── */}
      <aside className="hidden w-56 shrink-0 flex-col border-r bg-muted/30 lg:flex">
        <div className="flex h-14 items-center gap-2 border-b px-4">
          <ChefHat size={20} className="text-primary" />
          <span className="font-semibold tracking-tight">餐飲管理系統</span>
        </div>
        <SidebarContent pathname={pathname} />
      </aside>

      {/* ── Sidebar（行動版抽屜）── */}
      {mobileNavOpen && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setMobileNavOpen(false)}
            aria-hidden="true"
          />
          <aside className="absolute inset-y-0 left-0 flex w-64 max-w-[80vw] flex-col border-r bg-background shadow-xl">
            <div className="flex h-14 items-center justify-between border-b px-4">
              <span className="flex items-center gap-2">
                <ChefHat size={20} className="text-primary" />
                <span className="font-semibold tracking-tight">餐飲管理系統</span>
              </span>
              <button
                onClick={() => setMobileNavOpen(false)}
                className="rounded-md p-1.5 text-muted-foreground hover:bg-accent"
                aria-label="關閉選單"
              >
                <X size={18} />
              </button>
            </div>
            <SidebarContent pathname={pathname} onNavigate={() => setMobileNavOpen(false)} />
          </aside>
        </div>
      )}

      {/* ── Main content ── */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">

        {/* Top navbar with breadcrumb */}
        <header className="flex h-14 shrink-0 items-center gap-1.5 border-b px-4 sm:px-6">
          <button
            onClick={() => setMobileNavOpen(true)}
            className="mr-1 rounded-md p-1.5 text-muted-foreground hover:bg-accent lg:hidden"
            aria-label="開啟選單"
          >
            <Menu size={20} />
          </button>
          <span className="hidden text-sm text-muted-foreground sm:inline">餐飲管理系統</span>
          {pageTitle && (
            <>
              <ChevronRight size={13} className="hidden shrink-0 text-muted-foreground/40 sm:inline" />
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
