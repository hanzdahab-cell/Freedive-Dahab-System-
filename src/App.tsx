/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  User,
  UserRole,
  Student,
  Course,
  CourseSession,
  Booking,
  DailyActivity,
  Invoice,
  InvoiceUpdateInput,
  CustomerRequest,
  CustomerRequestInput,
  PaymentInput,
  Expense,
  PayrollPeriod,
  PayrollRecord,
  Equipment,
  EquipmentCheckout,
  AuditLog,
  Inquiry,
} from './types';
import { Language, translations } from './i18n';
import { apiRequest, setApiToken } from './api';
import { ReferenceNavbar } from './components/ReferenceNavbar';
import { ReferenceSidebar } from './components/ReferenceSidebar';
import { NavTab } from './components/Navigation';
import { DashboardView } from './components/DashboardView';
import { StudentsCrmView } from './components/StudentsCrmView';
import { CoursesView } from './components/CoursesView';
import { CalendarView } from './components/CalendarView';
import { DailyOpsView } from './components/DailyOpsView';
import { StaffView } from './components/StaffView';
import { FinanceView } from './components/FinanceView';
import { PayrollView } from './components/PayrollView';
import { EquipmentView } from './components/EquipmentView';
import { AuditView } from './components/AuditView';
import { SettingsView } from './components/SettingsView';
import { NotificationsView } from './components/NotificationsView';
import { PosView } from './components/PosView';
import {
  Waves,
  Shield,
  Lock,
  ArrowRight,
  UserCheck,
  Compass,
  AlertCircle,
  Loader2,
} from 'lucide-react';

export default function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<NavTab>('dashboard');
  const [lang, setLang] = useState<Language>('en');
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  // Core ERP State
  const [students, setStudents] = useState<Student[]>([]);
  const [inquiries, setInquiries] = useState<Inquiry[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [sessions, setSessions] = useState<CourseSession[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [activities, setActivities] = useState<DailyActivity[]>([]);
  const [staff, setStaff] = useState<User[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [customerRequests, setCustomerRequests] = useState<CustomerRequest[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [payrollPeriods, setPayrollPeriods] = useState<PayrollPeriod[]>([]);
  const [payrollRecords, setPayrollRecords] = useState<PayrollRecord[]>([]);
  const [selectedPayrollPeriodId, setSelectedPayrollPeriodId] = useState<string>('');
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [equipmentCheckouts, setEquipmentCheckouts] = useState<EquipmentCheckout[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);

  // Login form state
  const [loginEmail, setLoginEmail] = useState('owner@freedivedahab.com');
  const [loginPassword, setLoginPassword] = useState('DahabOwner2026!');
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loginSubmitting, setLoginSubmitting] = useState(false);

  // Sync HTML dir attribute for bidirectional support (RTL / LTR)
  useEffect(() => {
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
    document.documentElement.lang = lang;
  }, [lang]);

  // Sync dark class on document root
  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  // Load all operational data
  const loadAllData = useCallback(async () => {
    try {
      const [
        studentsRes,
        inquiriesRes,
        coursesRes,
        sessionsRes,
        bookingsRes,
        activitiesRes,
        staffRes,
        equipmentRes,
        equipmentCheckoutsRes,
      ] = await Promise.all([
        apiRequest<Student[]>('/api/students').catch(() => []),
        apiRequest<Inquiry[]>('/api/inquiries').catch(() => []),
        apiRequest<Course[]>('/api/courses').catch(() => []),
        apiRequest<CourseSession[]>('/api/sessions').catch(() => []),
        apiRequest<Booking[]>('/api/bookings').catch(() => []),
        apiRequest<DailyActivity[]>('/api/activities').catch(() => []),
        apiRequest<User[]>('/api/users').catch(() => []),
        apiRequest<Equipment[]>('/api/equipment').catch(() => []),
        apiRequest<EquipmentCheckout[]>('/api/equipment/checkouts').catch(() => []),
      ]);

      setStudents(studentsRes);
      setInquiries(inquiriesRes);
      setCourses(coursesRes);
      setSessions(sessionsRes);
      setBookings(bookingsRes);
      setActivities(activitiesRes);
      setStaff(staffRes);
      setEquipment(equipmentRes);
      setEquipmentCheckouts(equipmentCheckoutsRes);

      // Load restricted data based on current user role
      if (currentUser && ['owner', 'finance'].includes(currentUser.role)) {
        const [invoicesRes, requestsRes, expensesRes] = await Promise.all([
          apiRequest<Invoice[]>('/api/finance/invoices').catch(() => []),
          apiRequest<CustomerRequest[]>('/api/customer-requests').catch(() => []),
          apiRequest<Expense[]>('/api/finance/expenses').catch(() => []),
        ]);
        setInvoices(invoicesRes);
        setCustomerRequests(requestsRes);
        setExpenses(expensesRes);
      } else if (currentUser?.role === 'front_desk_crm') {
        const requestsRes = await apiRequest<CustomerRequest[]>('/api/customer-requests').catch(() => []);
        setCustomerRequests(requestsRes);
        setInvoices([]);
        setExpenses([]);
      } else {
        setInvoices([]);
        setCustomerRequests([]);
        setExpenses([]);
      }

      if (currentUser && ['owner', 'finance', 'hr'].includes(currentUser.role)) {
        const periods = await apiRequest<PayrollPeriod[]>('/api/payroll/periods').catch(() => []);
        setPayrollPeriods(periods);
        if (periods.length > 0) {
          const activePid = selectedPayrollPeriodId || periods[0].id;
          setSelectedPayrollPeriodId(activePid);
          const records = await apiRequest<PayrollRecord[]>(`/api/payroll/records/${activePid}`).catch(() => []);
          setPayrollRecords(records);
        }
      } else {
        setPayrollPeriods([]);
        setPayrollRecords([]);
      }

      if (currentUser && currentUser.role === 'owner') {
        const logs = await apiRequest<AuditLog[]>('/api/audit-logs').catch(() => []);
        setAuditLogs(logs);
      } else {
        setAuditLogs([]);
      }
    } catch (err) {
      console.error('Failed to load operational data:', err);
    }
  }, [currentUser, selectedPayrollPeriodId]);

  // Initial session check on mount
  useEffect(() => {
    async function checkAuth() {
      try {
        const res = await apiRequest<{ user: User }>('/api/auth/me');
        if (res && res.user) {
          setCurrentUser(res.user);
        }
      } catch {
        // Fallback to demo login as Center Owner
        try {
          const loginRes = await apiRequest<{ token: string; user: User }>('/api/auth/switch-demo', {
            method: 'POST',
            body: JSON.stringify({ role: 'owner' }),
          });
          setApiToken(loginRes.token);
          setCurrentUser(loginRes.user);
        } catch {
          // Stay logged out
        }
      } finally {
        setLoading(false);
      }
    }
    checkAuth();
  }, []);

  // Reload data whenever user changes
  useEffect(() => {
    if (currentUser) {
      loadAllData();
    }
  }, [currentUser, loadAllData]);

  // Handle Role Switch
  const handleRoleSwitch = async (targetRole: UserRole) => {
    try {
      const res = await apiRequest<{ token: string; user: User }>('/api/auth/switch-demo', {
        method: 'POST',
        body: JSON.stringify({ role: targetRole }),
      });
      setApiToken(res.token);
      setCurrentUser(res.user);

      // Route away if current tab is restricted
      if (['finance', 'payroll', 'audit', 'pos'].includes(activeTab)) {
        if (activeTab === 'audit' && targetRole !== 'owner') {
          setActiveTab('dashboard');
        } else if (activeTab === 'pos' && !['owner', 'finance', 'front_desk_crm'].includes(targetRole)) {
          setActiveTab('dashboard');
        } else if (activeTab === 'finance' && !['owner', 'finance', 'front_desk_crm'].includes(targetRole)) {
          setActiveTab('dashboard');
        } else if (activeTab === 'payroll' && !['owner', 'finance', 'hr'].includes(targetRole)) {
          setActiveTab('dashboard');
        }
      }
    } catch (err: any) {
      alert(err.message || 'Failed to switch role');
    }
  };

  const handleTabChange = (tab: NavTab) => {
    setActiveTab(tab);
    setIsMobileSidebarOpen(false);
  };

  // Sign out
  const handleLogout = async () => {
    try {
      await apiRequest('/api/auth/logout', { method: 'POST' });
    } catch {
      // Ignore
    }
    setApiToken(null);
    setCurrentUser(null);
  };

  // Credentials login submit
  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);
    setLoginSubmitting(true);
    try {
      const res = await apiRequest<{ token: string; user: User }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: loginEmail, password: loginPassword }),
      });
      setApiToken(res.token);
      setCurrentUser(res.user);
    } catch (err: any) {
      setLoginError(err.message || 'Login failed. Please verify credentials.');
    } finally {
      setLoginSubmitting(false);
    }
  };

  const handleSelectPayrollPeriod = async (pid: string) => {
    setSelectedPayrollPeriodId(pid);
    try {
      const records = await apiRequest<PayrollRecord[]>(`/api/payroll/records/${pid}`);
      setPayrollRecords(records);
    } catch (err) {
      console.error(err);
    }
  };

  const handleOpenQuickModal = (modalType: 'student' | 'activity' | 'inquiry' | 'invoice' | 'gear') => {
    if (modalType === 'student') setActiveTab('students_crm');
    if (modalType === 'inquiry') setActiveTab('students_crm');
    if (modalType === 'activity') setActiveTab('daily_ops');
    if (modalType === 'invoice') setActiveTab('finance');
    if (modalType === 'gear') setActiveTab('equipment');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F4F6FA] dark:bg-[#0F172A] flex flex-col items-center justify-center text-[#28334E] dark:text-white">
        <Loader2 className="w-10 h-10 text-[#4C8BF5] animate-spin mb-4" />
        <h2 className="text-xl font-bold font-sans tracking-tight text-[#28334E] dark:text-white">
          FREEDIVE DAHAB ERP
        </h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
          Operations, CRM & Student Management System
        </p>
      </div>
    );
  }

  // Logged out portal
  if (!currentUser) {
    return (
      <div className="min-h-screen bg-[#F4F6FA] dark:bg-[#0F172A] flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-white dark:bg-[#1E293B] border border-[#E8EEF7] dark:border-slate-800 rounded-2xl shadow-xl p-8 space-y-6">
          <div className="text-center space-y-2">
            <div className="w-14 h-14 rounded-2xl bg-[#4C8BF5] flex items-center justify-center mx-auto text-white shadow-lg shadow-blue-500/20">
              <svg className="w-8 h-8" viewBox="0 0 40 40" fill="none">
                <path d="M20 5L31 11.5V23L20 29.5L9 23V11.5L20 5Z" stroke="white" strokeWidth="3" strokeLinejoin="round" />
                <path d="M14 17L20 13.5L26 17V24L20 27.5L14 24V17Z" fill="white" />
              </svg>
            </div>
            <h1 className="text-2xl font-black tracking-tight text-[#28334E] dark:text-white">
              Freedive Dahab
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
              Internal Business Operations & CRM System
            </p>
          </div>

          {loginError && (
            <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/80 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{loginError}</span>
            </div>
          )}

          <form onSubmit={handleLoginSubmit} className="space-y-4 text-xs">
            <div>
              <label className="block text-slate-600 dark:text-slate-400 mb-1 font-bold">Staff Email</label>
              <input
                type="email"
                required
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
                className="w-full bg-[#F4F6FA] dark:bg-[#0c1427] border border-[#E8EEF7] dark:border-slate-700 rounded-xl p-3 text-slate-900 dark:text-white focus:outline-none focus:border-[#4C8BF5]"
              />
            </div>
            <div>
              <label className="block text-slate-600 dark:text-slate-400 mb-1 font-bold">Password</label>
              <input
                type="password"
                required
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                className="w-full bg-[#F4F6FA] dark:bg-[#0c1427] border border-[#E8EEF7] dark:border-slate-700 rounded-xl p-3 text-slate-900 dark:text-white focus:outline-none focus:border-[#4C8BF5]"
              />
            </div>

            <button
              type="submit"
              disabled={loginSubmitting}
              className="w-full py-3 rounded-xl bg-[#4C8BF5] hover:bg-[#3B7BE8] text-white font-bold text-xs uppercase tracking-wider transition-colors cursor-pointer shadow-md shadow-blue-500/20"
            >
              {loginSubmitting ? 'Authenticating...' : 'Sign In to Operations'}
            </button>
          </form>

          {/* Quick Demo Sign-in Helper */}
          <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-2">
            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider text-center">
              Quick Role Test
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => handleRoleSwitch('owner')}
                className="p-2 rounded-xl bg-blue-50 dark:bg-slate-800 text-[#4C8BF5] dark:text-blue-300 border border-blue-200 dark:border-slate-700 text-xs font-bold cursor-pointer text-left"
              >
                <div>Center Owner</div>
                <div className="text-[10px] text-slate-500 font-normal">Full Authority</div>
              </button>
              <button
                onClick={() => handleRoleSwitch('instructor')}
                className="p-2 rounded-xl bg-amber-50 dark:bg-slate-800 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-slate-700 text-xs font-bold cursor-pointer text-left"
              >
                <div>Instructor</div>
                <div className="text-[10px] text-slate-500 font-normal">Operational View</div>
              </button>
              <button
                onClick={() => handleRoleSwitch('finance')}
                className="p-2 rounded-xl bg-emerald-50 dark:bg-slate-800 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-slate-700 text-xs font-bold cursor-pointer text-left"
              >
                <div>Finance Manager</div>
                <div className="text-[10px] text-slate-500 font-normal">Invoices & Cash</div>
              </button>
              <button
                onClick={() => handleRoleSwitch('front_desk_crm')}
                className="p-2 rounded-xl bg-purple-50 dark:bg-slate-800 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-slate-700 text-xs font-bold cursor-pointer text-left"
              >
                <div>Front Desk / CRM</div>
                <div className="text-[10px] text-slate-500 font-normal">Guest Roster</div>
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const instructorsList = staff.filter((s) => ['instructor', 'operations_manager', 'owner'].includes(s.role));
  const isDark = theme === 'dark';
  const notificationToday = new Date().toISOString().slice(0, 10);
  const notificationHorizon = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const operationalNotificationCount =
    inquiries.filter((inquiry) => inquiry.status === 'new').length +
    equipment.filter((item) => item.quantity_available <= item.low_stock_threshold).length +
    sessions.filter((session) =>
      session.status !== 'cancelled' &&
      session.start_date >= notificationToday &&
      session.start_date <= notificationHorizon,
    ).length +
    activities.filter((activity) =>
      activity.status !== 'completed' &&
      activity.status !== 'cancelled_weather' &&
      activity.activity_date >= notificationToday &&
      activity.activity_date <= notificationHorizon,
    ).length;

  return (
    <div className={`min-h-screen flex flex-col font-sans selection:bg-[#4C8BF5] selection:text-white ${
      isDark ? 'bg-[#0F172A] text-slate-100' : 'bg-[#F4F6FA] text-[#28334E]'
    }`}>
      {/* Sidebar matching Reference Picture (Left, Full Height with rounded-br-[42px]) */}
      <ReferenceSidebar
        activeTab={activeTab}
        onTabChange={handleTabChange}
        isMobileOpen={isMobileSidebarOpen}
        onCloseMobile={() => setIsMobileSidebarOpen(false)}
        userRole={currentUser.role}
        currentUser={currentUser}
        isCollapsed={isSidebarCollapsed}
        onToggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
        lang={lang}
        theme={theme}
      />

      {/* Main Panel matching Reference Picture */}
      <div
        className={`flex-1 flex flex-col min-h-screen transition-all duration-300 ${
          isSidebarCollapsed
            ? 'md:pl-20 rtl:md:pl-0 rtl:md:pr-20'
            : 'md:pl-64 rtl:md:pl-0 rtl:md:pr-64'
        }`}
      >
        {/* Top Navbar matching "Search" and "Hi, Tom" from Reference Picture */}
        <ReferenceNavbar
          currentUser={currentUser}
          onRoleSwitch={handleRoleSwitch}
          lang={lang}
          onLanguageChange={setLang}
          onLogout={handleLogout}
          theme={theme}
          onToggleTheme={() => setTheme(theme === 'light' ? 'dark' : 'light')}
          inquiries={inquiries}
          auditLogs={auditLogs}
          onNavigateTab={handleTabChange}
          onToggleMobileMenu={() => setIsMobileSidebarOpen((open) => !open)}
          notificationCount={operationalNotificationCount}
        />

        {/* Content Area */}
        <main className="flex-1 px-4 sm:px-8 py-4 space-y-6 max-w-7xl w-full mx-auto">
            {activeTab === 'dashboard' && (
              <DashboardView
                currentUser={currentUser}
                students={students}
                sessions={sessions}
                activities={activities}
                equipment={equipment}
                invoices={invoices}
                customerRequests={customerRequests}
                expenses={expenses}
                inquiries={inquiries}
                onNavigate={handleTabChange}
                onOpenQuickModal={handleOpenQuickModal}
                onRefresh={loadAllData}
              />
            )}

            {activeTab === 'students_crm' && (
              <StudentsCrmView
                students={students}
                inquiries={inquiries}
                userRole={currentUser.role}
                onRefresh={loadAllData}
                onRegisterStudent={async (data) => {
                  await apiRequest('/api/students', { method: 'POST', body: JSON.stringify(data) });
                }}
                onUpdateWaiver={async (id, signed, notes) => {
                  await apiRequest(`/api/students/${id}/waiver`, {
                    method: 'POST',
                    body: JSON.stringify({ signed, notes }),
                  });
                }}
                onUpdateMedicalClearance={async (id, status) => {
                  await apiRequest(`/api/students/${id}`, {
                    method: 'PATCH',
                    body: JSON.stringify({ medical_clearance_status: status }),
                  });
                }}
                onCreateInquiry={async (data) => {
                  await apiRequest('/api/inquiries', { method: 'POST', body: JSON.stringify(data) });
                }}
                onUpdateInquiryStatus={async (id, status) => {
                  await apiRequest(`/api/inquiries/${id}`, {
                    method: 'PATCH',
                    body: JSON.stringify({ status }),
                  });
                  await loadAllData();
                }}
                lang={lang}
              />
            )}

            {activeTab === 'courses' && (
              <CoursesView
                courses={courses}
                sessions={sessions}
                students={students}
                instructors={instructorsList}
                bookings={bookings}
                userRole={currentUser.role}
                onRefresh={loadAllData}
                onScheduleSession={async (data) => {
                  await apiRequest('/api/sessions', { method: 'POST', body: JSON.stringify(data) });
                }}
                onUpdateSession={async (id, data) => {
                  await apiRequest(`/api/sessions/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
                }}
                onUpdateBooking={async (id, data) => {
                  await apiRequest(`/api/bookings/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
                }}
                onEnrollBooking={async (data) => {
                  await apiRequest('/api/bookings', { method: 'POST', body: JSON.stringify(data) });
                }}
                lang={lang}
              />
            )}

            {activeTab === 'calendar' && (
              <CalendarView
                sessions={sessions}
                activities={activities}
                instructors={instructorsList}
                lang={lang}
              />
            )}

            {activeTab === 'notifications' && (
              <NotificationsView
                sessions={sessions}
                activities={activities}
                equipment={equipment}
                inquiries={inquiries}
                onNavigate={handleTabChange}
              />
            )}

            {activeTab === 'pos' && (
              <PosView
                students={students}
                equipment={equipment}
                onCreateCustomerRequest={async (data: CustomerRequestInput) => {
                  await apiRequest('/api/customer-requests', { method: 'POST', body: JSON.stringify(data) });
                }}
                onRefresh={loadAllData}
              />
            )}

            {activeTab === 'daily_ops' && (
              <DailyOpsView
                activities={activities}
                students={students}
                instructors={instructorsList}
                userRole={currentUser.role}
                onRefresh={loadAllData}
                onCreateActivity={async (data) => {
                  await apiRequest('/api/activities', { method: 'POST', body: JSON.stringify(data) });
                }}
                onUpdateActivityStatus={async (id, status) => {
                  await apiRequest(`/api/activities/${id}`, {
                    method: 'PATCH',
                    body: JSON.stringify({ status }),
                  });
                  await loadAllData();
                }}
                onAddParticipant={async (actId, pData) => {
                  await apiRequest(`/api/activities/${actId}/participants`, {
                    method: 'POST',
                    body: JSON.stringify(pData),
                  });
                }}
                lang={lang}
              />
            )}

            {activeTab === 'staff' && (
              <StaffView
                staff={staff}
                userRole={currentUser.role}
                onRefresh={loadAllData}
                onCreateStaff={async (data) => {
                  await apiRequest('/api/users', { method: 'POST', body: JSON.stringify(data) });
                }}
                lang={lang}
              />
            )}

            {activeTab === 'finance' && (
              <FinanceView
                invoices={invoices}
                customerRequests={customerRequests}
                expenses={expenses}
                students={students}
                userRole={currentUser.role}
                onRefresh={loadAllData}
                onCreateInvoice={async (data) => {
                  await apiRequest('/api/finance/invoices', { method: 'POST', body: JSON.stringify(data) });
                }}
                onUpdateInvoice={async (invoiceId: string, changes: InvoiceUpdateInput) => {
                  await apiRequest(`/api/finance/invoices/${invoiceId}`, {
                    method: 'PATCH',
                    body: JSON.stringify(changes),
                  });
                }}
                onRecordPayment={async (invId, pmt) => {
                  await apiRequest(`/api/finance/invoices/${invId}/payments`, {
                    method: 'POST',
                    body: JSON.stringify(pmt),
                  });
                }}
                onCreateCustomerRequest={async (data: CustomerRequestInput) => {
                  await apiRequest('/api/customer-requests', { method: 'POST', body: JSON.stringify(data) });
                }}
                onRecordCustomerRequestPayment={async (requestId: string, payment: PaymentInput) => {
                  await apiRequest(`/api/customer-requests/${requestId}/payments`, {
                    method: 'POST',
                    body: JSON.stringify(payment),
                  });
                }}
                onCreateExpense={async (data) => {
                  await apiRequest('/api/finance/expenses', { method: 'POST', body: JSON.stringify(data) });
                }}
                lang={lang}
              />
            )}

            {activeTab === 'payroll' && (
              <PayrollView
                periods={payrollPeriods}
                records={payrollRecords}
                selectedPeriodId={selectedPayrollPeriodId}
                onSelectPeriod={handleSelectPayrollPeriod}
                userRole={currentUser.role}
                onRefresh={loadAllData}
                onCreatePeriod={async (data) => {
                  await apiRequest('/api/payroll/periods', { method: 'POST', body: JSON.stringify(data) });
                }}
                onUpdateRecord={async (recId, data) => {
                  await apiRequest(`/api/payroll/records/${recId}`, {
                    method: 'PATCH',
                    body: JSON.stringify(data),
                  });
                }}
                onApprovePeriod={async (pid) => {
                  await apiRequest(`/api/payroll/periods/${pid}/approve`, { method: 'POST' });
                }}
                lang={lang}
              />
            )}

            {activeTab === 'equipment' && (
              <EquipmentView
                equipment={equipment}
                checkouts={equipmentCheckouts}
                students={students}
                instructors={instructorsList}
                userRole={currentUser.role}
                onRefresh={loadAllData}
                onAddEquipment={async (data) => {
                  await apiRequest('/api/equipment', { method: 'POST', body: JSON.stringify(data) });
                }}
                onCheckoutEquipment={async (eqId, data) => {
                  await apiRequest(`/api/equipment/${eqId}/checkout`, { method: 'POST', body: JSON.stringify(data) });
                }}
                onReturnEquipment={async (chkId, data) => {
                  await apiRequest(`/api/equipment/checkouts/${chkId}/return`, { method: 'POST', body: JSON.stringify(data) });
                }}
                lang={lang}
              />
            )}

            {activeTab === 'audit' && (
              <AuditView
                logs={auditLogs}
                userRole={currentUser.role}
                onRefresh={loadAllData}
                lang={lang}
              />
            )}

            {activeTab === 'settings' && (
              <SettingsView
                userRole={currentUser.role}
                lang={lang}
              />
            )}
          </main>

          {/* Footer matching Reference Design */}
          <footer
            className={`border-t py-4 px-8 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2 ${
              isDark ? 'border-slate-800 text-slate-500' : 'border-[#E8EEF7] text-slate-400'
            }`}
          >
            <div>
              <span>© 2026 </span>
              <strong className="text-[#4C8BF5] font-semibold">Freedive Dahab Operations & CRM ERP</strong>
              <span>. All rights reserved.</span>
            </div>
            <div className="flex items-center gap-3 text-[11px]">
              <span>Dahab, South Sinai, Egypt</span>
              <span>•</span>
              <span>Timezone: Africa/Cairo (UTC+2)</span>
            </div>
          </footer>
        </div>
      </div>
  );
}
