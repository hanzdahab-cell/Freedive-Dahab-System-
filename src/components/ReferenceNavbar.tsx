import React, { useState, useEffect } from 'react';
import { User, UserRole, Inquiry, AuditLog } from '../types';
import { Language, translations } from '../i18n';
import {
  Search,
  ChevronDown,
  Globe,
  Sun,
  Moon,
  Clock,
  Compass,
  Waves,
  Shield,
  UserCheck,
  LogOut,
  Bell,
  CheckCircle2,
  Menu,
} from 'lucide-react';
import { NavTab } from './Navigation';

interface ReferenceNavbarProps {
  currentUser: User | null;
  onRoleSwitch: (role: UserRole) => void;
  lang: Language;
  onLanguageChange: (lang: Language) => void;
  onLogout: () => void;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  onToggleMobileMenu: () => void;
  notificationCount: number;
  inquiries: Inquiry[];
  auditLogs: AuditLog[];
  onNavigateTab: (tab: NavTab) => void;
}

export const ReferenceNavbar: React.FC<ReferenceNavbarProps> = ({
  currentUser,
  onRoleSwitch,
  lang,
  onLanguageChange,
  onLogout,
  theme,
  onToggleTheme,
  onToggleMobileMenu,
  notificationCount,
  inquiries,
  auditLogs,
  onNavigateTab,
}) => {
  const t = translations[lang];
  const [cairoTime, setCairoTime] = useState<string>('');
  const [roleMenuOpen, setRoleMenuOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [searchValue, setSearchValue] = useState('');

  useEffect(() => {
    const updateTime = () => {
      try {
        const timeStr = new Intl.DateTimeFormat('en-GB', {
          timeZone: 'Africa/Cairo',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false,
        }).format(new Date());
        setCairoTime(timeStr);
      } catch {
        setCairoTime(new Date().toLocaleTimeString());
      }
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  const demoRoles: { role: UserRole; title: string; subtitle: string }[] = [
    { role: 'owner', title: t.roleOwner, subtitle: 'Full Authority & Audit Access' },
    { role: 'operations_manager', title: t.roleOpsManager, subtitle: 'Courses, Calendar, Ops & Gear' },
    { role: 'front_desk_crm', title: t.roleFrontDesk, subtitle: 'Inquiries, Students & Bookings' },
    { role: 'instructor', title: t.roleInstructor, subtitle: 'Sessions & Assigned Student Roster' },
    { role: 'finance', title: t.roleFinance, subtitle: 'Invoices, Expenses & Cashflow' },
    { role: 'equipment_manager', title: t.roleEquipmentManager, subtitle: 'Gear Locker & Inspections' },
  ];

  const firstName = currentUser?.full_name?.split(' ')[0] || 'Tom';

  return (
    <header className="w-full pt-4 pb-3 px-4 sm:px-8 flex items-center justify-between gap-4">
      {/* 1. Large Rounded Search Pill matching Reference Picture */}
      <button
        type="button"
        onClick={onToggleMobileMenu}
        aria-label="Open navigation"
        className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#E8EEF7] bg-white text-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#4C8BF5] dark:border-slate-800 dark:bg-[#1E293B] dark:text-slate-200 md:hidden"
      >
        <Menu className="h-4 w-4" aria-hidden="true" />
      </button>

      <div className="hidden max-w-xl flex-1 sm:block">
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2 rtl:left-auto rtl:right-4" />
          <input
            type="text"
            placeholder="Search"
            value={searchValue}
            onChange={(e) => setSearchValue(e.target.value)}
            className="w-full bg-white dark:bg-[#1E293B] border border-[#E8EEF7] dark:border-slate-800 rounded-2xl pl-11 pr-4 rtl:pl-4 rtl:pr-11 py-3 text-xs text-slate-800 dark:text-white placeholder-slate-400 focus:outline-none focus:border-[#4C8BF5] shadow-[0_2px_12px_rgba(40,51,78,0.02)] transition-all"
          />
        </div>
      </div>

      {/* 2. Right Section matching "Hi, Tom" + Avatar in Reference Picture */}
      <div className="flex items-center gap-3">
        {/* Dahab Conditions Pill */}
        <div className="hidden xl:flex items-center gap-2 px-3 py-1.5 rounded-full bg-white dark:bg-[#1E293B] border border-[#E8EEF7] dark:border-slate-800 text-[11px] text-slate-600 dark:text-slate-300 shadow-xs">
          <Waves className="w-3.5 h-3.5 text-[#4C8BF5]" />
          <span>Dahab: 25°C • 14 kts NNE</span>
          <span className="text-slate-300 dark:text-slate-700">|</span>
          <Clock className="w-3.5 h-3.5 text-cyan-500" />
          <span className="font-mono">{cairoTime || '14:00'} (Cairo)</span>
        </div>

        {/* Language Switcher */}
        <button
          onClick={() => onLanguageChange(lang === 'en' ? 'ar' : 'en')}
          title="Switch Language / RTL"
          className="flex items-center gap-1 px-3 py-2 rounded-xl bg-white dark:bg-[#1E293B] border border-[#E8EEF7] dark:border-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:border-[#4C8BF5] shadow-xs cursor-pointer transition-colors"
        >
          <Globe className="w-3.5 h-3.5 text-[#4C8BF5]" />
          <span>{lang === 'en' ? 'العربية' : 'English'}</span>
        </button>

        {/* Theme Toggle */}
        <button
          type="button"
          onClick={onToggleTheme}
          aria-label="Toggle light and dark mode"
          title="Toggle Light / Dark Mode"
          className="w-10 h-10 rounded-xl bg-white dark:bg-[#1E293B] border border-[#E8EEF7] dark:border-slate-800 flex items-center justify-center text-slate-600 dark:text-slate-300 hover:text-[#4C8BF5] shadow-xs cursor-pointer transition-colors"
        >
          {theme === 'dark' ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4" />}
        </button>

        <button
          type="button"
          onClick={() => onNavigateTab('notifications')}
          aria-label={`Notifications, ${notificationCount} active updates`}
          className="relative inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#E8EEF7] bg-white text-slate-600 shadow-xs transition-colors hover:text-[#4C8BF5] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#4C8BF5] dark:border-slate-800 dark:bg-[#1E293B] dark:text-slate-300"
        >
          <Bell className="h-4 w-4" aria-hidden="true" />
          {notificationCount > 0 && (
            <span className="absolute -right-1 -top-1 inline-flex min-h-5 min-w-5 items-center justify-center rounded-full bg-rose-600 px-1 text-[10px] font-bold text-white">
              {notificationCount > 99 ? '99+' : notificationCount}
            </span>
          )}
        </button>

        {/* Role Simulator Pill */}
        <div className="relative">
          <button
            onClick={() => setRoleMenuOpen(!roleMenuOpen)}
            className="hidden sm:flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white dark:bg-[#1E293B] border border-[#E8EEF7] dark:border-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:border-[#4C8BF5] shadow-xs cursor-pointer transition-colors"
          >
            <Shield className="w-3.5 h-3.5 text-[#4C8BF5]" />
            <span className="capitalize">{currentUser?.role?.replace('_', ' ') || 'Role'}</span>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
          </button>

          {roleMenuOpen && (
            <div className="absolute right-0 rtl:right-auto rtl:left-0 top-12 w-64 bg-white dark:bg-[#1E293B] rounded-2xl shadow-xl border border-slate-200 dark:border-slate-700 p-2 z-50 animate-in fade-in zoom-in-95">
              <div className="px-3 py-1.5 text-[10px] font-bold uppercase text-slate-400 tracking-wider">
                Simulate System Role
              </div>
              <div className="space-y-1">
                {demoRoles.map((r) => {
                  const isCurrent = currentUser?.role === r.role;
                  return (
                    <button
                      key={r.role}
                      onClick={() => {
                        onRoleSwitch(r.role);
                        setRoleMenuOpen(false);
                      }}
                      className={`w-full text-left rtl:text-right px-3 py-2 rounded-xl text-xs flex items-center justify-between cursor-pointer transition-colors ${
                        isCurrent
                          ? 'bg-blue-50 dark:bg-blue-950/50 text-[#4C8BF5] font-bold'
                          : 'text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800'
                      }`}
                    >
                      <div>
                        <div>{r.title}</div>
                        <div className="text-[10px] text-slate-400 font-normal">{r.subtitle}</div>
                      </div>
                      {isCurrent && <CheckCircle2 className="w-4 h-4 text-[#4C8BF5]" />}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* User Greeting & Avatar matching the reference: "Hi, Tom" with circle avatar */}
        <div className="relative">
          <button
            onClick={() => setProfileMenuOpen(!profileMenuOpen)}
            className="flex items-center gap-3 pl-2 cursor-pointer group"
          >
            <span className="hidden text-sm font-semibold text-slate-700 dark:text-slate-200 sm:inline">
              Hi, <span className="font-bold text-slate-900 dark:text-white">{firstName}</span>
            </span>

            <div className="w-10 h-10 rounded-full overflow-hidden bg-slate-200 ring-2 ring-white dark:ring-slate-800 shadow-sm shrink-0 flex items-center justify-center">
              {/* Profile Image with fallback */}
              <img
                src="https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&h=100&fit=crop&crop=faces"
                alt={currentUser?.full_name || 'Staff User'}
                className="w-full h-full object-cover"
                onError={(e) => {
                  (e.target as HTMLElement).style.display = 'none';
                }}
              />
              <span className="font-bold text-xs text-slate-600 uppercase">
                {firstName[0]}
              </span>
            </div>
          </button>

          {profileMenuOpen && (
            <div className="absolute right-0 rtl:right-auto rtl:left-0 top-14 w-56 bg-white dark:bg-[#1E293B] rounded-2xl shadow-xl border border-slate-200 dark:border-slate-700 p-2 z-50">
              <div className="px-3 py-2 border-b border-slate-100 dark:border-slate-800">
                <div className="font-bold text-xs text-slate-900 dark:text-white truncate">
                  {currentUser?.full_name}
                </div>
                <div className="text-[10px] text-slate-400 truncate">{currentUser?.email}</div>
                <div className="text-[10px] text-[#4C8BF5] font-mono font-bold uppercase mt-0.5">
                  {currentUser?.role?.replace('_', ' ')}
                </div>
              </div>

              <div className="py-1">
                <button
                  onClick={() => {
                    onNavigateTab('settings');
                    setProfileMenuOpen(false);
                  }}
                  className="w-full text-left rtl:text-right px-3 py-2 rounded-xl text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                >
                  Settings & Preferences
                </button>
                {currentUser?.role === 'owner' && (
                  <button
                    type="button"
                    onClick={() => {
                      onNavigateTab('audit');
                      setProfileMenuOpen(false);
                    }}
                    className="w-full min-h-9 text-left rtl:text-right px-3 py-2 rounded-xl text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                  >
                    Security Audit Logs
                  </button>
                )}
              </div>

              <div className="pt-1 border-t border-slate-100 dark:border-slate-800">
                <button
                  onClick={() => {
                    setProfileMenuOpen(false);
                    onLogout();
                  }}
                  className="w-full text-left rtl:text-right px-3 py-2 rounded-xl text-xs text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 flex items-center gap-2 cursor-pointer font-medium"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Sign Out</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
