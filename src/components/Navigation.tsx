import React from 'react';
import { UserRole } from '../types';
import { Language, translations } from '../i18n';
import {
  LayoutDashboard,
  Users,
  GraduationCap,
  Calendar,
  Anchor,
  UserCheck,
  Receipt,
  DollarSign,
  Package,
  ShieldAlert,
  Sliders,
  Lock,
  Bell,
} from 'lucide-react';

export type NavTab =
  | 'dashboard'
  | 'students_crm'
  | 'courses'
  | 'calendar'
  | 'daily_ops'
  | 'staff'
  | 'finance'
  | 'payroll'
  | 'equipment'
  | 'audit'
  | 'notifications'
  | 'pos'
  | 'settings';

interface NavigationProps {
  activeTab: NavTab;
  onTabChange: (tab: NavTab) => void;
  userRole: UserRole;
  lang: Language;
}

export const Navigation: React.FC<NavigationProps> = ({
  activeTab,
  onTabChange,
  userRole,
  lang,
}) => {
  const t = translations[lang];

  // Role permissions check for navigation visibility / lock indicators
  const canAccessFinance = ['owner', 'finance'].includes(userRole);
  const canAccessCustomerRequests = canAccessFinance || userRole === 'front_desk_crm';
  const canAccessPayroll = ['owner', 'finance', 'hr'].includes(userRole);
  const canAccessAudit = userRole === 'owner';

  const navItems: {
    id: NavTab;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    locked?: boolean;
    lockReason?: string;
  }[] = [
    { id: 'dashboard', label: t.navDashboard, icon: LayoutDashboard },
    { id: 'calendar', label: 'Planner Calendar', icon: Calendar },
    {
      id: 'finance',
      label: 'Invoices & Bills',
      icon: Receipt,
      locked: !canAccessCustomerRequests,
      lockReason: 'Owner, Finance & Front Desk only',
    },
    { id: 'notifications', label: 'Notifications', icon: Bell },
    {
      id: 'pos',
      label: 'POS',
      icon: Receipt,
      locked: !['owner', 'finance', 'front_desk_crm'].includes(userRole),
      lockReason: 'Owner, Finance & Front Desk only',
    },
    { id: 'students_crm', label: t.navStudentsCRM, icon: Users },
    { id: 'courses', label: t.navCourses, icon: GraduationCap },
    { id: 'daily_ops', label: t.navDailyOps, icon: Anchor },
    { id: 'staff', label: t.navStaff, icon: UserCheck },
    {
      id: 'payroll',
      label: t.navPayroll,
      icon: DollarSign,
      locked: !canAccessPayroll,
      lockReason: 'Owner, Finance & HR only',
    },
    { id: 'equipment', label: t.navEquipment, icon: Package },
    {
      id: 'audit',
      label: t.navAudit,
      icon: ShieldAlert,
      locked: !canAccessAudit,
      lockReason: 'Owner only',
    },
    { id: 'settings', label: t.navSettings, icon: Sliders },
  ];

  return (
    <nav className="w-full bg-[#0a182b] border-b md:border-b-0 md:border-r border-cyan-900/30 p-2 md:p-3 flex md:flex-col gap-1 overflow-x-auto md:overflow-y-auto no-scrollbar md:w-64 shrink-0">
      <div className="text-[11px] font-bold text-cyan-400/80 uppercase tracking-wider px-3 py-1.5 hidden md:block">
        Operations Core
      </div>
      {navItems.map((item) => {
        const Icon = item.icon;
        const isActive = activeTab === item.id;
        const isLocked = item.locked;

        return (
          <button
            key={item.id}
            onClick={() => onTabChange(item.id)}
            className={`group relative flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs sm:text-sm font-medium transition-all text-left whitespace-nowrap cursor-pointer ${
              isActive
                ? 'bg-gradient-to-r from-cyan-600 to-teal-600 text-white shadow-md shadow-cyan-950/40 font-semibold'
                : isLocked
                ? 'text-slate-500 hover:text-slate-400 hover:bg-slate-900/40'
                : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <Icon
              className={`w-4 h-4 shrink-0 transition-colors ${
                isActive ? 'text-white' : isLocked ? 'text-slate-600' : 'text-cyan-400 group-hover:text-cyan-300'
              }`}
            />
            <span className="flex-1">{item.label}</span>

            {isLocked && (
              <span
                title={item.lockReason}
                className="flex items-center gap-1 text-[10px] text-slate-500 bg-slate-900/60 px-1.5 py-0.5 rounded border border-slate-800"
              >
                <Lock className="w-3 h-3 text-amber-500/70" />
              </span>
            )}
          </button>
        );
      })}
    </nav>
  );
};
