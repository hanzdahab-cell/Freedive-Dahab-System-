import React, { useState } from 'react';
import { User, UserRole } from '../types';
import { Language, translations } from '../i18n';
import { NavTab } from './Navigation';
import {
  Users,
  BarChart3,
  Briefcase,
  Calendar as CalendarIcon,
  Bell,
  Settings as SettingsIcon,
  HelpCircle,
  GraduationCap,
  UserCheck,
  Receipt,
  DollarSign,
  Package,
  ShieldAlert,
  ArrowLeft,
  Menu,
  Lock,
  ChevronDown,
  X,
  Phone,
  Radio,
  LifeBuoy,
} from 'lucide-react';

interface ReferenceSidebarProps {
  activeTab: NavTab;
  onTabChange: (tab: NavTab) => void;
  isMobileOpen: boolean;
  onCloseMobile: () => void;
  userRole: UserRole;
  currentUser: User | null;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  lang: Language;
  theme: 'light' | 'dark';
}

export const ReferenceSidebar: React.FC<ReferenceSidebarProps> = ({
  activeTab,
  onTabChange,
  isMobileOpen,
  onCloseMobile,
  userRole,
  currentUser,
  isCollapsed,
  onToggleCollapse,
  lang,
  theme,
}) => {
  const t = translations[lang];
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [showMoreErp, setShowMoreErp] = useState(true);

  const canAccessFinance = ['owner', 'finance'].includes(userRole);
  const canAccessCustomerRequests = canAccessFinance || userRole === 'front_desk_crm';
  const canAccessPayroll = ['owner', 'finance', 'hr'].includes(userRole);
  const canAccessAudit = userRole === 'owner';

  // Keep the five daily work areas at the top; less frequent modules remain grouped below.
  const primaryNavItems = [
    {
      id: 'dashboard' as NavTab,
      label: 'Dashboard',
      icon: BarChart3,
    },
    {
      id: 'calendar' as NavTab,
      label: 'Planner',
      icon: CalendarIcon,
    },
    {
      id: 'finance' as NavTab,
      label: 'Invoices & Bills',
      icon: Receipt,
      locked: !canAccessCustomerRequests,
      lockReason: 'Owner, Finance & Front Desk only',
    },
    {
      id: 'notifications' as NavTab,
      label: 'Notifications',
      icon: Bell,
    },
    {
      id: 'pos' as NavTab,
      label: 'POS',
      icon: DollarSign,
      locked: !canAccessCustomerRequests,
      lockReason: 'Owner, Finance & Front Desk only',
    },
  ];

  // Secondary ERP modules for Freedive Dahab operations
  const erpNavItems = [
    {
      id: 'students_crm' as NavTab,
      label: 'Contacts',
      icon: Users,
    },
    {
      id: 'daily_ops' as NavTab,
      label: 'Tasks',
      icon: Briefcase,
    },
    {
      id: 'courses' as NavTab,
      label: 'Courses',
      icon: GraduationCap,
    },
    {
      id: 'staff' as NavTab,
      label: 'Staff',
      icon: UserCheck,
    },
    {
      id: 'payroll' as NavTab,
      label: 'Payroll',
      icon: DollarSign,
      locked: !canAccessPayroll,
      lockReason: 'Payroll & HR only',
    },
    {
      id: 'audit' as NavTab,
      label: 'Security Audit',
      icon: ShieldAlert,
      locked: !canAccessAudit,
      lockReason: 'Owner only',
    },
    {
      id: 'equipment' as NavTab,
      label: 'Equipment',
      icon: Package,
    },
    {
      id: 'settings' as NavTab,
      label: 'Settings',
      icon: SettingsIcon,
    },
  ];

  return (
    <>
      {isMobileOpen && (
        <button
          type="button"
          aria-label="Close navigation"
          onClick={onCloseMobile}
          className="fixed inset-0 z-30 bg-slate-950/50 md:hidden"
        />
      )}
      <aside
        className={`fixed top-0 bottom-0 left-0 z-40 transition-all duration-300 flex flex-col justify-between ${
          isCollapsed ? 'w-20' : 'w-64'
        } ${
          isMobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0 rtl:translate-x-full rtl:md:translate-x-0'
        } bg-[#28334E] text-[#94A3B8] rounded-br-[42px] rtl:rounded-br-none rtl:rounded-bl-[42px] rtl:left-auto rtl:right-0 shadow-xl overflow-hidden`}
      >
        {/* Top Header / Logo Area */}
        <div className="p-5 pb-4">
          <div className="flex items-center justify-between">
            {/* Custom Geometric Folded Ribbon Hexagon Logo from Reference Picture */}
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 relative flex items-center justify-center shrink-0">
                <svg
                  viewBox="0 0 48 48"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                  className="w-full h-full drop-shadow-md"
                >
                  {/* Outer geometric folded S-ribbon shape */}
                  <path
                    d="M24 4L10 12V22L17 26V16L24 12L34 18V28L24 34L17 30V37L24 41L38 33V23L31 19V29L24 33L14 27V17L24 11L31 15V8L24 4Z"
                    fill="url(#ref_logo_gradient)"
                  />
                  <defs>
                    <linearGradient
                      id="ref_logo_gradient"
                      x1="10"
                      y1="4"
                      x2="38"
                      y2="41"
                      gradientUnits="userSpaceOnUse"
                    >
                      <stop stopColor="#60A5FA" />
                      <stop offset="0.5" stopColor="#4C8BF5" />
                      <stop offset="1" stopColor="#38BDF8" />
                    </linearGradient>
                  </defs>
                </svg>
              </div>

              {!isCollapsed && (
                <div className="leading-tight truncate">
                  <div className="font-extrabold text-white text-base tracking-tight">
                    Freedive<span className="text-[#60A5FA]">Dahab</span>
                  </div>
                  <div className="text-[10px] text-slate-400 font-medium tracking-wide uppercase">
                    Operations ERP
                  </div>
                </div>
              )}
            </div>

            {/* Collapse / Expand Toggle Button */}
            {!isCollapsed ? (
              <>
                <button
                  type="button"
                  onClick={onCloseMobile}
                  aria-label="Close navigation"
                  className="md:hidden w-9 h-9 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-700/50 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={onToggleCollapse}
                  title="Collapse sidebar"
                  aria-label="Collapse sidebar"
                  className="hidden md:flex w-8 h-8 rounded-lg items-center justify-center text-slate-400 hover:text-white hover:bg-slate-700/50 transition-colors cursor-pointer"
                >
                  <ArrowLeft className="w-4 h-4 rtl:rotate-180" />
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={onToggleCollapse}
                title="Expand sidebar"
                aria-label="Expand sidebar"
                className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-700/50 transition-colors cursor-pointer mx-auto"
              >
                <Menu className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Scrollable Navigation Area */}
        <div className="flex-1 overflow-y-auto px-3 py-2 space-y-6 no-scrollbar">
          {/* Primary Reference Navigation Items */}
          <nav aria-label="Primary navigation" className="space-y-1.5">
            {primaryNavItems.map((item) => {
              const isActive = activeTab === item.id;
              const Icon = item.icon;

              if (item.locked) {
                return (
                  <div
                    key={item.id}
                    title={item.lockReason}
                    className={`flex items-center gap-3.5 px-3 py-3 rounded-xl text-xs font-medium opacity-40 cursor-not-allowed ${
                      isCollapsed ? 'justify-center px-0' : ''
                    }`}
                  >
                    <Icon className="w-5 h-5 shrink-0" />
                    {!isCollapsed && (
                      <span className="truncate flex items-center justify-between flex-1">
                        {item.label}
                        <Lock className="w-3.5 h-3.5 text-slate-400" />
                      </span>
                    )}
                  </div>
                );
              }

              return (
                <button
                  type="button"
                  key={item.id}
                  onClick={() => onTabChange(item.id)}
                  title={item.label}
                  className={`w-full flex items-center gap-3.5 py-3 rounded-xl text-xs font-semibold transition-all cursor-pointer group ${
                    isCollapsed ? 'justify-center px-0' : 'px-3.5'
                  } ${
                    isActive
                      ? isCollapsed
                        ? 'text-white'
                        : 'text-white bg-slate-700/40 shadow-xs'
                      : 'text-slate-400 hover:text-white hover:bg-slate-700/25'
                  }`}
                >
                  {isCollapsed ? (
                    <div
                      className={`w-11 h-11 rounded-full flex items-center justify-center transition-all ${
                        isActive
                          ? 'bg-[#4C8BF5] text-white shadow-lg shadow-blue-500/30'
                          : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
                      }`}
                    >
                      <Icon className="w-5 h-5" />
                    </div>
                  ) : (
                    <>
                      <div
                        className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-colors ${
                          isActive
                            ? 'bg-[#4C8BF5] text-white shadow-sm shadow-blue-500/20'
                            : 'text-slate-400 group-hover:text-white'
                        }`}
                      >
                        <Icon className="w-4 h-4" />
                      </div>
                      <span className="truncate flex-1 text-left rtl:text-right text-[13px]">
                        {item.label}
                      </span>
                      {isActive && (
                        <div className="w-1.5 h-1.5 rounded-full bg-[#4C8BF5] shrink-0" />
                      )}
                    </>
                  )}
                </button>
              );
            })}
          </nav>

          {/* ERP Operations Sub-section */}
          {!isCollapsed && (
            <div className="pt-2 border-t border-slate-700/40">
              <button
                type="button"
                onClick={() => setShowMoreErp(!showMoreErp)}
                aria-expanded={showMoreErp}
                className="w-full flex items-center justify-between px-3 text-[11px] font-bold text-slate-400 hover:text-slate-300 tracking-wider uppercase mb-2 cursor-pointer"
              >
                <span>ERP Operations</span>
                <ChevronDown
                  className={`w-3.5 h-3.5 transition-transform ${
                    showMoreErp ? '' : '-rotate-90'
                  }`}
                />
              </button>

              {showMoreErp && (
                <div className="space-y-1">
                  {erpNavItems.map((item) => {
                    const isActive = activeTab === item.id;
                    const Icon = item.icon;

                    if (item.locked) {
                      return (
                        <div
                          key={item.id}
                          title={item.lockReason}
                          className="flex items-center gap-3 px-3.5 py-2 rounded-xl text-xs font-medium opacity-40 cursor-not-allowed"
                        >
                          <Icon className="w-4 h-4 shrink-0" />
                          <span className="truncate flex-1 flex items-center justify-between">
                            {item.label}
                            <Lock className="w-3 h-3 text-slate-400" />
                          </span>
                        </div>
                      );
                    }

                    return (
                      <button
                        type="button"
                        key={item.id}
                        onClick={() => onTabChange(item.id)}
                        className={`w-full flex items-center gap-3 px-3.5 py-2 rounded-xl text-xs font-medium transition-all cursor-pointer ${
                          isActive
                            ? 'text-white bg-slate-700/40'
                            : 'text-slate-400 hover:text-white hover:bg-slate-700/20'
                        }`}
                      >
                        <Icon className="w-4 h-4 shrink-0 text-slate-400" />
                        <span className="truncate flex-1 text-left rtl:text-right">
                          {item.label}
                        </span>
                        {isActive && (
                          <div className="w-1.5 h-1.5 rounded-full bg-[#4C8BF5] shrink-0" />
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Bottom Help Area (Matches `? Help` in Reference Picture) */}
        <div className="p-4 pt-3 border-t border-slate-700/40">
          <button
            onClick={() => setIsHelpOpen(true)}
            title="Freedive Dahab Help & Support"
            className={`w-full flex items-center gap-3 py-2.5 rounded-xl text-xs font-medium text-slate-400 hover:text-white hover:bg-slate-700/30 transition-all cursor-pointer ${
              isCollapsed ? 'justify-center px-0' : 'px-3'
            }`}
          >
            <HelpCircle className="w-5 h-5 shrink-0" />
            {!isCollapsed && <span className="font-semibold">Help</span>}
          </button>
        </div>
      </aside>

      {/* Help Modal */}
      {isHelpOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#1E293B] rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl border border-slate-200 dark:border-slate-700">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-700">
              <div className="flex items-center gap-2">
                <LifeBuoy className="w-5 h-5 text-[#4C8BF5]" />
                <h3 className="font-bold text-slate-900 dark:text-white text-base">
                  Freedive Dahab Operations & ERP Help
                </h3>
              </div>
              <button
                onClick={() => setIsHelpOpen(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-white p-1 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              <p>
                Welcome to the internal operations system for <strong>Freedive Dahab</strong>.
                This system provides real-time tracking for Red Sea student training, instructor workloads,
                daily ocean activities, gear locker checkout, invoices, and audit logging.
              </p>

              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800 space-y-2 border border-slate-200 dark:border-slate-700">
                <div className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                  <Phone className="w-4 h-4 text-emerald-500" />
                  <span>Dahab Emergency Numbers</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <div>
                    <span className="text-slate-400">Hyperbaric Chamber:</span>
                    <strong className="block text-slate-800 dark:text-slate-200">+20 69 364 0530</strong>
                  </div>
                  <div>
                    <span className="text-slate-400">Dahab Ambulance:</span>
                    <strong className="block text-slate-800 dark:text-slate-200">123</strong>
                  </div>
                  <div>
                    <span className="text-slate-400">Tourism Police:</span>
                    <strong className="block text-slate-800 dark:text-slate-200">126</strong>
                  </div>
                  <div>
                    <span className="text-slate-400">Blue Hole Station:</span>
                    <strong className="block text-slate-800 dark:text-slate-200">VHF Channel 16</strong>
                  </div>
                </div>
              </div>

              <div className="space-y-1">
                <span className="font-bold text-slate-900 dark:text-white">Active User Profile:</span>
                <div className="text-[11px] text-slate-500 dark:text-slate-400">
                  Logged in as <strong>{currentUser?.full_name}</strong> ({currentUser?.email}) with role{' '}
                  <span className="font-mono uppercase text-[#4C8BF5] font-bold">
                    {currentUser?.role?.replace('_', ' ')}
                  </span>
                  .
                </div>
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                onClick={() => setIsHelpOpen(false)}
                className="px-4 py-2 rounded-xl bg-[#4C8BF5] hover:bg-[#3B7BE8] text-white font-medium text-xs shadow-md shadow-blue-500/20 cursor-pointer"
              >
                Close Help
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
