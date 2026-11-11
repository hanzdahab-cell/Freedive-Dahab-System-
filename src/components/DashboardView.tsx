import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowRight, CircleDollarSign, Plus, RefreshCw, Users } from 'lucide-react';
import {
  User,
  Student,
  CourseSession,
  DailyActivity,
  Equipment,
  Invoice,
  CustomerRequest,
  Expense,
  Inquiry,
  FinanceCashSummary,
  FinanceOpeningBalances,
} from '../types';
import { apiRequest } from '../api';
import { NavTab } from './Navigation';
import { getFinancePeriodSummary, getInvoiceServiceMix, InvoiceServiceGroup } from '../utils/financeAnalytics';
import { getTodayActivityCapacity } from '../utils/dashboardAnalytics';

interface DashboardViewProps {
  currentUser: User | null;
  students: Student[];
  sessions: CourseSession[];
  activities: DailyActivity[];
  equipment: Equipment[];
  invoices: Invoice[];
  customerRequests: CustomerRequest[];
  expenses: Expense[];
  inquiries: Inquiry[];
  onNavigate: (tab: NavTab) => void;
  onOpenQuickModal: (modalType: 'student' | 'activity' | 'inquiry' | 'invoice' | 'gear') => void;
  onRefresh: () => Promise<void>;
}

const dateOnly = (value: Date) => {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const formatDate = (value: string) =>
  new Intl.DateTimeFormat('en', { weekday: 'short', month: 'short', day: 'numeric' }).format(new Date(`${value}T12:00:00`));

const formatMoney = (amount: number, currency: string) => {
  const formattedAmount = amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return ['EUR', 'USD', 'EGP'].includes(currency)
    ? new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: 2 }).format(amount)
    : `${currency} ${formattedAmount}`;
};

const cashCurrencies: (keyof FinanceOpeningBalances)[] = ['EUR', 'USD', 'EGP'];
const financePeriodOptions = [
  { days: 7 as const, label: '7 days' },
  { days: 30 as const, label: '30 days' },
  { days: 90 as const, label: '90 days' },
];
const serviceMixColors: Record<InvoiceServiceGroup, string> = {
  training: '#2563EB',
  activities: '#059669',
  stays: '#CA8A04',
  gear: '#DC2626',
  products: '#7C3AED',
};
const inquiryStatusColors: Record<Inquiry['status'], string> = {
  new: '#2563EB',
  contacted: '#059669',
  proposal_sent: '#CA8A04',
  booked: '#7C3AED',
  closed_lost: '#DC2626',
};
const financeChartWidth = 760;
const financeChartHeight = 260;
const financeChartPadding = { top: 18, right: 18, bottom: 38, left: 62 };

function getFinanceChartY(value: number, maximum: number): number {
  const plotHeight = financeChartHeight - financeChartPadding.top - financeChartPadding.bottom;
  return financeChartPadding.top + plotHeight * (1 - value / maximum);
}

function getFinanceChartPath(values: number[], maximum: number): string {
  const plotWidth = financeChartWidth - financeChartPadding.left - financeChartPadding.right;
  return values.map((value, index) => {
    const x = financeChartPadding.left + plotWidth * index / Math.max(1, values.length - 1);
    return `${index === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${getFinanceChartY(value, maximum).toFixed(1)}`;
  }).join(' ');
}

function getFinanceChartArea(values: number[], maximum: number): string {
  const line = getFinanceChartPath(values, maximum);
  const plotWidth = financeChartWidth - financeChartPadding.left - financeChartPadding.right;
  const lastX = financeChartPadding.left + plotWidth;
  const baseline = getFinanceChartY(0, maximum);
  return `${line} L ${lastX.toFixed(1)} ${baseline.toFixed(1)} L ${financeChartPadding.left} ${baseline.toFixed(1)} Z`;
}

type FinanceActivityType = 'payment' | 'expense' | 'invoice' | 'order';

interface FinanceActivityItem {
  id: string;
  date: string;
  type: FinanceActivityType;
  title: string;
  detail: string;
  currency: string;
  amount: number;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  currentUser,
  students,
  sessions,
  activities,
  equipment,
  invoices,
  customerRequests,
  expenses,
  inquiries,
  onNavigate,
  onOpenQuickModal,
  onRefresh,
}) => {
  const today = dateOnly(new Date());
  const nextWeek = dateOnly(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000));
  const canSeeFinance = ['owner', 'finance'].includes(currentUser?.role || '');
  const [cashSummary, setCashSummary] = useState<FinanceCashSummary | null>(null);
  const [openingBalances, setOpeningBalances] = useState<FinanceOpeningBalances>({ EUR: 0, USD: 0, EGP: 0 });
  const [cashLoading, setCashLoading] = useState(canSeeFinance);
  const [cashSaving, setCashSaving] = useState(false);
  const [cashError, setCashError] = useState<string | null>(null);
  const [cashSaved, setCashSaved] = useState(false);
  const [financeChartCurrency, setFinanceChartCurrency] = useState<keyof FinanceOpeningBalances>('EUR');
  const [financeChartDays, setFinanceChartDays] = useState<7 | 30 | 90>(30);
  const [financeRefreshing, setFinanceRefreshing] = useState(false);
  const [financeRefreshError, setFinanceRefreshError] = useState<string | null>(null);
  const [hoveredRevenueIndex, setHoveredRevenueIndex] = useState<number | null>(null);

  const handleRefreshFinance = async () => {
    setFinanceRefreshError(null);
    setFinanceRefreshing(true);
    try {
      const [, summary] = await Promise.all([
        onRefresh(),
        apiRequest<FinanceCashSummary>('/api/finance/cash-balances'),
      ]);
      setCashSummary(summary);
      setOpeningBalances(summary.opening_balances);
    } catch (error) {
      setFinanceRefreshError(error instanceof Error ? error.message : 'Could not refresh dashboard data');
    } finally {
      setFinanceRefreshing(false);
    }
  };

  useEffect(() => {
    if (!canSeeFinance) return;
    let active = true;
    setCashLoading(true);
    apiRequest<FinanceCashSummary>('/api/finance/cash-balances')
      .then((summary) => {
        if (!active) return;
        setCashSummary(summary);
        setOpeningBalances(summary.opening_balances);
      })
      .catch((error: Error) => {
        if (active) setCashError(error.message || 'Failed to load cash balances');
      })
      .finally(() => {
        if (active) setCashLoading(false);
      });
    return () => {
      active = false;
    };
  }, [canSeeFinance]);

  const handleSaveCashBalances = async (event: React.FormEvent) => {
    event.preventDefault();
    setCashError(null);
    setCashSaved(false);
    setCashSaving(true);
    try {
      await apiRequest('/api/finance/cash-balances', {
        method: 'PATCH',
        body: JSON.stringify({ opening_balances: openingBalances }),
      });
      const summary = await apiRequest<FinanceCashSummary>('/api/finance/cash-balances');
      setCashSummary(summary);
      setOpeningBalances(summary.opening_balances);
      setCashSaved(true);
    } catch (error) {
      setCashError(error instanceof Error ? error.message : 'Failed to save cash balances');
    } finally {
      setCashSaving(false);
    }
  };

  const upcoming = useMemo(() => [
    ...sessions
      .filter((session) => session.status !== 'cancelled' && session.start_date >= today && session.start_date <= nextWeek)
      .map((session) => ({
        id: `session-${session.id}`,
        date: session.start_date,
        title: session.course_title || session.course_code || 'Course session',
        detail: `${session.location} · ${session.instructor_name || 'Instructor unassigned'}`,
        type: 'Course',
      })),
    ...activities
      .filter((activity) =>
        activity.status !== 'completed' &&
        activity.status !== 'cancelled_weather' &&
        activity.activity_date >= today &&
        activity.activity_date <= nextWeek,
      )
      .map((activity) => ({
        id: `activity-${activity.id}`,
        date: activity.activity_date,
        title: activity.title,
        detail: `${activity.start_time} · ${activity.location} · ${activity.current_pax}/${activity.max_pax} participants`,
        type: 'Activity',
      })),
  ].sort((a, b) => a.date.localeCompare(b.date)).slice(0, 7), [activities, nextWeek, sessions, today]);

  const newLeads = useMemo(
    () => inquiries
      .filter((inquiry) => inquiry.status === 'new')
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, 5),
    [inquiries],
  );
  const lowStock = equipment.filter((item) => item.quantity_available <= item.low_stock_threshold);
  const openInquiries = inquiries.filter((inquiry) => !['booked', 'closed_lost'].includes(inquiry.status)).length;
  const activeStudents = students.filter((student) => student.status === 'active').length;
  const todayActivityCapacity = useMemo(
    () => getTodayActivityCapacity(activities, today),
    [activities, today],
  );
  const capacityProgress = todayActivityCapacity.totalSlots
    ? todayActivityCapacity.remainingSlots / todayActivityCapacity.totalSlots
    : 0;
  const capacityColor = capacityProgress > 0.5
    ? '#059669'
    : capacityProgress > 0
      ? '#CA8A04'
      : '#DC2626';
  const financeActivity = useMemo<FinanceActivityItem[]>(() => {
    if (!canSeeFinance) return [];
    const entries: FinanceActivityItem[] = [
      ...invoices.map((invoice) => ({
        id: `invoice-${invoice.id}`,
        date: invoice.issue_date,
        type: 'invoice' as const,
        title: `Invoice ${invoice.invoice_number}`,
        detail: `${[invoice.first_name, invoice.last_name].filter(Boolean).join(' ') || 'Customer'} · ${invoice.status}`,
        currency: invoice.currency,
        amount: invoice.total_amount,
      })),
      ...customerRequests.map((request) => ({
        id: `order-${request.request_id}`,
        date: request.issue_date,
        type: 'order' as const,
        title: `Order ${request.request_number}`,
        detail: `${[request.first_name, request.last_name].filter(Boolean).join(' ') || 'Customer'} · ${request.status}`,
        currency: request.currency,
        amount: request.total_amount,
      })),
      ...invoices.flatMap((invoice) => (invoice.payments || []).map((payment) => ({
        id: `payment-${payment.id}`,
        date: payment.payment_date,
        type: 'payment' as const,
        title: `Payment · ${invoice.invoice_number}`,
        detail: `${payment.payment_method} · ${[invoice.first_name, invoice.last_name].filter(Boolean).join(' ') || 'Customer'}`,
        currency: payment.currency,
        amount: payment.amount,
      }))),
      ...expenses
        .filter((expense) => expense.status !== 'rejected')
        .map((expense) => ({
          id: `expense-${expense.id}`,
          date: expense.expense_date,
          type: 'expense' as const,
          title: `Expense ${expense.expense_number}`,
          detail: `${expense.category} · ${expense.vendor_name} · ${expense.status.replace('_', ' ')}`,
          currency: expense.currency,
          amount: expense.amount,
        })),
    ];
    return entries.sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8);
  }, [canSeeFinance, customerRequests, expenses, invoices]);
  const financeChart = useMemo(
    () => getFinancePeriodSummary(invoices, expenses, financeChartCurrency, today, financeChartDays),
    [expenses, financeChartCurrency, financeChartDays, invoices, today],
  );
  const financeChartStartDate = financeChart.points[0]?.date || today;
  const serviceMix = useMemo(
    () => getInvoiceServiceMix(invoices, financeChartCurrency, financeChartStartDate, today),
    [financeChartCurrency, financeChartStartDate, invoices, today],
  );
  const serviceMixTotal = serviceMix.reduce((total, item) => total + item.amount, 0);
  const inquiryPipeline: Array<{ status: Inquiry['status']; label: string; count: number }> = [
    { status: 'new' as const, label: 'New', count: 0 },
    { status: 'contacted' as const, label: 'Contacted', count: 0 },
    { status: 'proposal_sent' as const, label: 'Proposal sent', count: 0 },
    { status: 'booked' as const, label: 'Booked', count: 0 },
    { status: 'closed_lost' as const, label: 'Closed', count: 0 },
  ].map((item) => ({
    ...item,
    count: inquiries.filter((inquiry) => inquiry.status === item.status).length,
  }));
  const financeChartAverage = financeChart.income / Math.max(1, financeChart.points.length);
  const bestRevenueDay = financeChart.points.reduce(
    (best, point) => point.income > best.income ? point : best,
    financeChart.points[0] || { date: today, label: 'Today', income: 0, expenses: 0 },
  );
  const financeChartMaximum = Math.max(
    1,
    Math.ceil(Math.max(...financeChart.points.flatMap((point) => [point.income, point.expenses])) / 4) * 4,
  );
  const financeChartTicks = Array.from({ length: 5 }, (_, index) => financeChartMaximum * (4 - index) / 4);
  const financeChartLabelIndices = Array.from(new Set([
    0,
    Math.floor((financeChart.points.length - 1) / 4),
    Math.floor((financeChart.points.length - 1) / 2),
    Math.floor(3 * (financeChart.points.length - 1) / 4),
    financeChart.points.length - 1,
  ]));
  const revenueChartMaximum = Math.max(1, Math.ceil(
    Math.max(...financeChart.points.map((point) => point.income), financeChartAverage) / 4,
  ) * 4);
  const revenueChartTicks = Array.from({ length: 5 }, (_, index) => revenueChartMaximum * (4 - index) / 4);
  const hoveredRevenuePoint = hoveredRevenueIndex === null ? null : financeChart.points[hoveredRevenueIndex];

  const handleRevenuePointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    if (!bounds.width) return;
    const viewBoxX = (event.clientX - bounds.left) / bounds.width * financeChartWidth;
    const plotWidth = financeChartWidth - financeChartPadding.left - financeChartPadding.right;
    if (viewBoxX < financeChartPadding.left || viewBoxX > financeChartPadding.left + plotWidth) {
      setHoveredRevenueIndex(null);
      return;
    }
    const index = Math.round((viewBoxX - financeChartPadding.left) / plotWidth * (financeChart.points.length - 1));
    setHoveredRevenueIndex((current) => current === index ? current : index);
  };

  const metrics = [
    { label: 'Students', value: students.length, detail: `${activeStudents} active`, tab: 'students_crm' as NavTab },
    { label: 'Open inquiries', value: openInquiries, detail: 'Not yet booked or closed', tab: 'students_crm' as NavTab },
    { label: 'Next 7 days', value: upcoming.length, detail: 'Sessions and activities', tab: 'calendar' as NavTab },
    { label: 'Gear at low stock', value: lowStock.length, detail: 'At or below restock threshold', tab: 'equipment' as NavTab },
  ];

  return (
    <div className="space-y-7 pb-8">
      <header className="flex flex-col gap-4 border-b border-[#E8EEF7] pb-5 dark:border-slate-800 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-[#28334E] dark:text-white">Dashboard</h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Today at Freedive Dahab · {new Intl.DateTimeFormat('en', { weekday: 'long', month: 'long', day: 'numeric' }).format(new Date())}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => onOpenQuickModal('inquiry')}
            className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-[#E2E8F0] bg-white px-4 text-sm font-semibold text-slate-700 hover:border-[#4C8BF5] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#4C8BF5] dark:border-slate-700 dark:bg-[#1E293B] dark:text-slate-200"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            Add lead
          </button>
          <button
            type="button"
            onClick={() => onNavigate('pos')}
            className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-[#4C8BF5] px-4 text-sm font-semibold text-white hover:bg-[#3B7BE8] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#4C8BF5]"
          >
            <CircleDollarSign className="h-4 w-4" aria-hidden="true" />
            New sale
          </button>
        </div>
      </header>

      <section aria-label="Operational totals" className="overflow-hidden rounded-2xl border border-[#E8EEF7] bg-white dark:border-slate-800 dark:bg-[#1E293B]">
        <dl className="grid grid-cols-2 divide-x divide-y divide-[#E8EEF7] dark:divide-slate-800 lg:grid-cols-4 lg:divide-y-0">
          {metrics.map((metric) => (
            <button
              key={metric.label}
              type="button"
              onClick={() => onNavigate(metric.tab)}
              className="min-w-0 p-4 text-left transition-colors hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-[#4C8BF5] dark:hover:bg-slate-800/60 sm:p-5"
            >
              <dt className="text-sm font-semibold text-slate-600 dark:text-slate-400">{metric.label}</dt>
              <span className="mt-1 block text-2xl font-bold tabular-nums text-[#28334E] dark:text-white">{metric.value}</span>
              <span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">{metric.detail}</span>
            </button>
          ))}
        </dl>
      </section>

      <section
        aria-labelledby="dashboard-todays-capacity-title"
        className="flex flex-col gap-5 rounded-2xl border border-[#E8EEF7] bg-white p-5 dark:border-slate-800 dark:bg-[#1E293B] sm:flex-row sm:items-center sm:gap-6 sm:p-6"
      >
        <div className="relative h-24 w-24 shrink-0 self-center sm:self-auto">
          <svg
            viewBox="0 0 100 100"
            className="h-full w-full -rotate-90"
            role="img"
            aria-label={`${todayActivityCapacity.remainingSlots} of ${todayActivityCapacity.totalSlots} student slots remaining today`}
          >
            <circle cx="50" cy="50" r="42" fill="none" stroke="currentColor" strokeWidth="8" className="text-slate-200 dark:text-slate-700" />
            {todayActivityCapacity.totalSlots > 0 && (
              <circle
                cx="50"
                cy="50"
                r="42"
                fill="none"
                stroke={capacityColor}
                strokeWidth="8"
                strokeLinecap="round"
                strokeDasharray={`${2 * Math.PI * 42 * capacityProgress} ${2 * Math.PI * 42}`}
              />
            )}
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center" aria-hidden="true">
            <span className="text-2xl font-extrabold leading-none tabular-nums text-[#28334E] dark:text-white">
              {todayActivityCapacity.remainingSlots}
            </span>
            <span className="mt-1 text-[10px] font-semibold text-slate-600 dark:text-slate-300">left</span>
          </div>
        </div>
        <div className="min-w-0 flex-1 text-center sm:text-left">
          <h2 id="dashboard-todays-capacity-title" className="text-lg font-bold text-[#28334E] dark:text-white">Today&apos;s Capacity</h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            {todayActivityCapacity.activities === 0
              ? 'No activities scheduled today.'
              : `${todayActivityCapacity.remainingSlots} student ${todayActivityCapacity.remainingSlots === 1 ? 'slot' : 'slots'} remaining out of ${todayActivityCapacity.totalSlots} across ${todayActivityCapacity.activities} ${todayActivityCapacity.activities === 1 ? 'activity' : 'activities'}.`}
          </p>
        </div>
        <button
          type="button"
          onClick={() => onNavigate('daily_ops')}
          className="inline-flex min-h-11 shrink-0 items-center justify-center gap-1 self-stretch rounded-lg px-3 text-sm font-semibold text-[#3069C4] hover:bg-blue-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#4C8BF5] dark:text-blue-300 dark:hover:bg-slate-800 sm:self-center"
        >
          View today&apos;s activities <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </button>
      </section>

      {canSeeFinance && (
        <section aria-labelledby="dashboard-cash-title" className="space-y-4 rounded-2xl border border-[#E8EEF7] bg-white p-5 dark:border-slate-800 dark:bg-[#1E293B] sm:p-6">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 id="dashboard-cash-title" className="text-lg font-bold text-[#28334E] dark:text-white">Current cash position</h2>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">Opening balance + recorded payments − recorded expenses. Currencies are not converted.</p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('finance')}
              className="inline-flex min-h-10 shrink-0 items-center gap-1 self-start rounded-lg px-2 text-sm font-semibold text-[#3069C4] hover:bg-blue-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#4C8BF5] dark:text-blue-300 dark:hover:bg-slate-800 sm:self-auto"
            >
              Finance records <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>

          {cashError && (
            <p role="alert" className="rounded-xl border border-rose-300 bg-rose-50 p-3 text-sm text-rose-800 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-200">
              {cashError}
            </p>
          )}
          {cashLoading && <p role="status" aria-live="polite" className="text-sm text-slate-600 dark:text-slate-400">Loading cash position…</p>}
          {!cashLoading && cashSummary && (
            <>
              <div className="grid gap-3 sm:grid-cols-3">
                {cashCurrencies.map((currency) => (
                  <article key={currency} className="rounded-xl border border-[#E8EEF7] bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900/40">
                    <h3 className="text-sm font-bold text-slate-600 dark:text-slate-300">{currency}</h3>
                    <p className="mt-1 text-2xl font-extrabold tabular-nums text-[#28334E] dark:text-white">
                      {formatMoney(cashSummary.current_balances[currency], currency)}
                    </p>
                    <dl className="mt-3 space-y-1 text-xs text-slate-600 dark:text-slate-400">
                      <div className="flex justify-between gap-2"><dt>Opening balance</dt><dd className="tabular-nums">{formatMoney(cashSummary.opening_balances[currency], currency)}</dd></div>
                      <div className="flex justify-between gap-2"><dt>Payments recorded</dt><dd className="tabular-nums">+{formatMoney(cashSummary.income_by_currency[currency], currency)}</dd></div>
                      <div className="flex justify-between gap-2"><dt>Expenses recorded</dt><dd className="tabular-nums">−{formatMoney(cashSummary.expenses_by_currency[currency], currency)}</dd></div>
                    </dl>
                  </article>
                ))}
              </div>

              <form onSubmit={handleSaveCashBalances} className="border-t border-[#E8EEF7] pt-4 dark:border-slate-800">
                <fieldset disabled={cashSaving}>
                  <legend className="text-sm font-semibold text-[#28334E] dark:text-white">Edit opening cash balances</legend>
                  <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">Enter the starting cash amounts for each currency. This does not change recorded payments or expenses.</p>
                  <div className="mt-3 grid gap-3 sm:grid-cols-3">
                    {cashCurrencies.map((currency) => (
                      <div key={currency}>
                        <label htmlFor={`opening-balance-${currency}`} className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-300">Opening {currency}</label>
                        <input
                          id={`opening-balance-${currency}`}
                          name={`opening_balance_${currency.toLowerCase()}`}
                          type="number"
                          min="0"
                          max="1000000000"
                          step="0.01"
                          required
                          value={openingBalances[currency]}
                          onChange={(event) => setOpeningBalances((current) => ({ ...current, [currency]: Number(event.target.value) }))}
                          className="min-h-11 w-full rounded-xl border border-[#E2E8F0] bg-white p-2.5 text-sm text-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 dark:border-slate-700 dark:bg-[#071322] dark:text-white"
                        />
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                    <p role="status" aria-live="polite" className="text-xs text-emerald-700 dark:text-emerald-300">
                      {cashSaved ? 'Opening balances saved.' : ''}
                    </p>
                    <button
                      type="submit"
                      disabled={cashSaving}
                      className="inline-flex min-h-11 items-center rounded-xl bg-[#4C8BF5] px-4 text-sm font-semibold text-white hover:bg-[#3B7BE8] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#4C8BF5] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {cashSaving ? 'Saving…' : 'Save opening balances'}
                    </button>
                  </div>
                </fieldset>
              </form>
            </>
          )}
        </section>
      )}

      {canSeeFinance && (
        <section aria-labelledby="dashboard-finance-trends-title" className="space-y-5 rounded-2xl border border-[#E8EEF7] bg-white p-5 dark:border-slate-800 dark:bg-[#1E293B] sm:p-6">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <h2 id="dashboard-finance-trends-title" className="text-lg font-bold text-[#28334E] dark:text-white">Revenue</h2>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                Daily payments received compared with the average for the selected period.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-[minmax(8rem,1fr)_minmax(8rem,1fr)_auto] xl:w-auto">
              <div>
                <label htmlFor="dashboard-finance-period" className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-300">Reporting period</label>
                <select
                  id="dashboard-finance-period"
                  value={financeChartDays}
                  onChange={(event) => {
                    setFinanceChartDays(Number(event.target.value) as 7 | 30 | 90);
                    setHoveredRevenueIndex(null);
                  }}
                  className="min-h-10 w-full rounded-lg border border-[#E2E8F0] bg-white px-3 text-sm text-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#4C8BF5] dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                >
                  {financePeriodOptions.map((option) => <option key={option.days} value={option.days}>{option.label}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="dashboard-finance-currency" className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-300">Currency</label>
                <select
                  id="dashboard-finance-currency"
                  value={financeChartCurrency}
                  onChange={(event) => setFinanceChartCurrency(event.target.value as keyof FinanceOpeningBalances)}
                  className="min-h-10 w-full rounded-lg border border-[#E2E8F0] bg-white px-3 text-sm text-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#4C8BF5] dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                >
                  {cashCurrencies.map((currency) => <option key={currency} value={currency}>{currency}</option>)}
                </select>
              </div>
              <button
                type="button"
                onClick={handleRefreshFinance}
                disabled={financeRefreshing}
                className="inline-flex min-h-10 items-center justify-center gap-2 self-end rounded-lg border border-[#E2E8F0] bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#4C8BF5] disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                <RefreshCw className={`h-4 w-4 ${financeRefreshing ? 'animate-spin motion-reduce:animate-none' : ''}`} aria-hidden="true" />
                {financeRefreshing ? 'Refreshing…' : 'Refresh'}
              </button>
            </div>
          </div>

          {financeRefreshError && (
            <p role="alert" className="rounded-xl border border-rose-300 bg-rose-50 p-3 text-sm text-rose-800 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-200">
              Dashboard refresh failed: {financeRefreshError}
            </p>
          )}
          <dl className="grid grid-cols-2 gap-x-5 gap-y-4 border-y border-[#E8EEF7] py-4 dark:border-slate-800 sm:grid-cols-3">
            <div>
              <dt className="text-xs font-semibold text-slate-600 dark:text-slate-400">Revenue · {financeChartDays} days</dt>
              <dd className="mt-1 text-2xl font-extrabold tabular-nums text-[#28334E] dark:text-white">{formatMoney(financeChart.income, financeChartCurrency)}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold text-slate-600 dark:text-slate-400">Daily average</dt>
              <dd className="mt-1 text-lg font-bold tabular-nums text-[#28334E] dark:text-white">{formatMoney(financeChartAverage, financeChartCurrency)}</dd>
            </div>
            <div className="col-span-2 sm:col-span-1">
              <dt className="text-xs font-semibold text-slate-600 dark:text-slate-400">Best day</dt>
              <dd className="mt-1 text-lg font-bold text-[#28334E] dark:text-white">
                {bestRevenueDay && bestRevenueDay.income > 0
                  ? `${formatDate(bestRevenueDay.date)} · ${formatMoney(bestRevenueDay.income, financeChartCurrency)}`
                  : 'No payments in this period'}
              </dd>
            </div>
          </dl>

          <figure aria-labelledby="dashboard-revenue-chart-caption">
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 pb-3 text-xs font-medium text-slate-600 dark:text-slate-300">
              <span className="inline-flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-blue-600" aria-hidden="true" /> Payments received</span>
              <span className="inline-flex items-center gap-2"><span className="w-5 border-t-2 border-dashed border-amber-600" aria-hidden="true" /> Daily average</span>
            </div>
            <div className="w-full">
              <svg
                viewBox={`0 0 ${financeChartWidth} ${financeChartHeight}`}
                className="h-auto w-full touch-pan-y"
                role="img"
                aria-labelledby="dashboard-revenue-chart-title dashboard-revenue-chart-description"
                onPointerMove={handleRevenuePointerMove}
                onPointerDown={handleRevenuePointerMove}
                onPointerLeave={() => setHoveredRevenueIndex(null)}
              >
                <title id="dashboard-revenue-chart-title">{financeChartCurrency} revenue over {financeChartDays} days</title>
                <desc id="dashboard-revenue-chart-description">
                  Daily recorded payments with a horizontal line at the {financeChartDays}-day average. Hover the chart for a date and value. The accessible data table follows.
                </desc>
                {revenueChartTicks.map((tick) => {
                  const y = getFinanceChartY(tick, revenueChartMaximum);
                  return (
                    <g key={tick}>
                      <line
                        x1={financeChartPadding.left}
                        x2={financeChartWidth - financeChartPadding.right}
                        y1={y}
                        y2={y}
                        stroke="currentColor"
                        strokeOpacity="0.12"
                        strokeDasharray={tick === 0 ? undefined : '3 5'}
                      />
                      <text x={financeChartPadding.left - 8} y={y + 4} textAnchor="end" className="fill-slate-500 text-[11px]">
                        {tick.toLocaleString(undefined, { notation: 'compact', maximumFractionDigits: 1 })}
                      </text>
                    </g>
                  );
                })}
                <line
                  x1={financeChartPadding.left}
                  x2={financeChartWidth - financeChartPadding.right}
                  y1={getFinanceChartY(financeChartAverage, revenueChartMaximum)}
                  y2={getFinanceChartY(financeChartAverage, revenueChartMaximum)}
                  stroke={serviceMixColors.stays}
                  strokeWidth="2"
                  strokeDasharray="5 5"
                />
                <text x={financeChartPadding.left + 5} y={getFinanceChartY(financeChartAverage, revenueChartMaximum) - 7} className="fill-amber-700 text-[11px] font-semibold dark:fill-amber-300">
                  Average {formatMoney(financeChartAverage, financeChartCurrency)}
                </text>
                <path
                  d={getFinanceChartArea(financeChart.points.map((point) => point.income), revenueChartMaximum)}
                  fill={serviceMixColors.training}
                  fillOpacity="0.1"
                />
                <path
                  d={getFinanceChartPath(financeChart.points.map((point) => point.income), revenueChartMaximum)}
                  fill="none"
                  stroke={serviceMixColors.training}
                  strokeWidth="3"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
                {financeChartLabelIndices.map((index) => {
                  const point = financeChart.points[index];
                  if (!point) return null;
                  const plotWidth = financeChartWidth - financeChartPadding.left - financeChartPadding.right;
                  const x = financeChartPadding.left + plotWidth * index / Math.max(1, financeChart.points.length - 1);
                  return (
                    <text
                      key={point.date}
                      x={x}
                      y={financeChartHeight - 8}
                      textAnchor={index === 0 ? 'start' : index === financeChart.points.length - 1 ? 'end' : 'middle'}
                      className="fill-slate-500 text-[11px]"
                    >
                      {point.label}
                    </text>
                  );
                })}
                {hoveredRevenuePoint && hoveredRevenueIndex !== null && (() => {
                  const plotWidth = financeChartWidth - financeChartPadding.left - financeChartPadding.right;
                  const x = financeChartPadding.left + plotWidth * hoveredRevenueIndex / Math.max(1, financeChart.points.length - 1);
                  const y = getFinanceChartY(hoveredRevenuePoint.income, revenueChartMaximum);
                  const tooltipX = Math.min(
                    financeChartWidth - financeChartPadding.right - 146,
                    Math.max(financeChartPadding.left, x - 73),
                  );
                  const tooltipY = Math.max(financeChartPadding.top, y - 58);
                  return (
                    <g aria-hidden="true" pointerEvents="none">
                      <line x1={x} x2={x} y1={financeChartPadding.top} y2={financeChartHeight - financeChartPadding.bottom} stroke={serviceMixColors.training} strokeOpacity="0.35" strokeDasharray="3 4" />
                      <circle cx={x} cy={y} r="5" fill={serviceMixColors.training} stroke="white" strokeWidth="2" />
                      <rect x={tooltipX} y={tooltipY} width="146" height="48" rx="8" fill="#172033" />
                      <text x={tooltipX + 10} y={tooltipY + 18} fill="white" fontSize="11">{hoveredRevenuePoint.label}</text>
                      <text x={tooltipX + 10} y={tooltipY + 37} fill="white" fontSize="13" fontWeight="700">{formatMoney(hoveredRevenuePoint.income, financeChartCurrency)}</text>
                    </g>
                  );
                })()}
              </svg>
            </div>
            <figcaption id="dashboard-revenue-chart-caption" className="mt-2 text-xs text-slate-500 dark:text-slate-400">
              Revenue is recorded from payment dates in {financeChartCurrency}. Amounts are not converted between currencies.
            </figcaption>
          </figure>

          <details className="border-t border-[#E8EEF7] pt-3 dark:border-slate-800">
            <summary className="min-h-9 cursor-pointer py-2 text-sm font-semibold text-[#3069C4] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#4C8BF5] dark:text-blue-300">
              View daily revenue data
            </summary>
            <div className="mt-2 max-h-64 overflow-auto">
              <table className="w-full text-left text-sm">
                <caption className="sr-only">Daily revenue in {financeChartCurrency} over the last {financeChartDays} days</caption>
                <thead className="sticky top-0 bg-white text-xs text-slate-500 dark:bg-[#1E293B] dark:text-slate-400">
                  <tr><th scope="col" className="py-2 pr-3">Date</th><th scope="col" className="px-3 py-2 text-right">Revenue</th><th scope="col" className="py-2 pl-3 text-right">Daily average</th></tr>
                </thead>
                <tbody className="divide-y divide-[#E8EEF7] dark:divide-slate-800">
                  {financeChart.points.map((point) => (
                    <tr key={point.date}>
                      <th scope="row" className="py-2 pr-3 font-medium text-slate-700 dark:text-slate-300">{formatDate(point.date)}</th>
                      <td className="px-3 py-2 text-right tabular-nums text-slate-700 dark:text-slate-300">{formatMoney(point.income, financeChartCurrency)}</td>
                      <td className="py-2 pl-3 text-right tabular-nums text-slate-700 dark:text-slate-300">{formatMoney(financeChartAverage, financeChartCurrency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>

          <div className="space-y-4 border-t border-[#E8EEF7] pt-5 dark:border-slate-800">
            <div>
              <h3 className="text-base font-bold text-[#28334E] dark:text-white">Income &amp; expenses</h3>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                Recorded cash flow over the same {financeChartDays}-day period.
              </p>
            </div>
          </div>

          <dl className="grid grid-cols-2 divide-x divide-y divide-[#E8EEF7] overflow-hidden rounded-xl border border-[#E8EEF7] dark:divide-slate-800 dark:border-slate-800 lg:grid-cols-4 lg:divide-y-0">
            <div className="p-3 sm:p-4">
              <dt className="text-xs font-semibold text-slate-600 dark:text-slate-400">Payments received</dt>
              <dd className="mt-1 text-lg font-bold tabular-nums text-[#28334E] dark:text-white">{formatMoney(financeChart.income, financeChartCurrency)}</dd>
            </div>
            <div className="p-3 sm:p-4">
              <dt className="text-xs font-semibold text-slate-600 dark:text-slate-400">Expenses recorded</dt>
              <dd className="mt-1 text-lg font-bold tabular-nums text-red-700 dark:text-red-300">{formatMoney(financeChart.expenses, financeChartCurrency)}</dd>
            </div>
            <div className="p-3 sm:p-4">
              <dt className="text-xs font-semibold text-slate-600 dark:text-slate-400">Net cash flow</dt>
              <dd className={`mt-1 text-lg font-bold tabular-nums ${financeChart.net < 0 ? 'text-red-700 dark:text-red-300' : 'text-emerald-700 dark:text-emerald-300'}`}>{formatMoney(financeChart.net, financeChartCurrency)}</dd>
            </div>
            <div className="p-3 sm:p-4">
              <dt className="text-xs font-semibold text-slate-600 dark:text-slate-400">Overdue invoice balance</dt>
              <dd className="mt-1 text-lg font-bold tabular-nums text-amber-700 dark:text-amber-300">{formatMoney(financeChart.overdue, financeChartCurrency)}</dd>
            </div>
          </dl>

          <figure aria-labelledby="dashboard-finance-chart-caption">
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 pb-3 text-xs font-medium text-slate-600 dark:text-slate-300">
              <span className="inline-flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-blue-600" aria-hidden="true" /> Payments received</span>
              <span className="inline-flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-rose-600" aria-hidden="true" /> Expenses recorded</span>
            </div>
            <div className="w-full">
              <svg
                viewBox={`0 0 ${financeChartWidth} ${financeChartHeight}`}
                className="h-auto w-full"
                role="img"
                aria-labelledby="dashboard-finance-chart-title dashboard-finance-chart-description"
              >
                <title id="dashboard-finance-chart-title">{financeChartCurrency} daily payments and expenses</title>
                <desc id="dashboard-finance-chart-description">
                  A {financeChartDays}-day area chart comparing recorded payments with expenses in {financeChartCurrency}. Daily data is also available in the table below.
                </desc>
                {financeChartTicks.map((tick) => {
                  const y = getFinanceChartY(tick, financeChartMaximum);
                  return (
                    <g key={tick}>
                      <line
                        x1={financeChartPadding.left}
                        x2={financeChartWidth - financeChartPadding.right}
                        y1={y}
                        y2={y}
                        stroke="currentColor"
                        strokeOpacity="0.12"
                        strokeDasharray={tick === 0 ? undefined : '3 5'}
                      />
                      <text x={financeChartPadding.left - 8} y={y + 4} textAnchor="end" className="fill-slate-500 text-[11px]">
                        {tick.toLocaleString(undefined, { notation: 'compact', maximumFractionDigits: 1 })}
                      </text>
                    </g>
                  );
                })}
                <path d={getFinanceChartArea(financeChart.points.map((point) => point.income), financeChartMaximum)} fill={serviceMixColors.training} fillOpacity="0.12" />
                <path d={getFinanceChartArea(financeChart.points.map((point) => point.expenses), financeChartMaximum)} fill={serviceMixColors.gear} fillOpacity="0.1" />
                <path d={getFinanceChartPath(financeChart.points.map((point) => point.income), financeChartMaximum)} fill="none" stroke={serviceMixColors.training} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
                <path d={getFinanceChartPath(financeChart.points.map((point) => point.expenses), financeChartMaximum)} fill="none" stroke={serviceMixColors.gear} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
                {financeChartLabelIndices.map((index) => {
                  const point = financeChart.points[index];
                  if (!point) return null;
                  const plotWidth = financeChartWidth - financeChartPadding.left - financeChartPadding.right;
                  const x = financeChartPadding.left + plotWidth * index / Math.max(1, financeChart.points.length - 1);
                  return <text key={point.date} x={x} y={financeChartHeight - 8} textAnchor={index === 0 ? 'start' : index === financeChart.points.length - 1 ? 'end' : 'middle'} className="fill-slate-500 text-[11px]">{point.label}</text>;
                })}
              </svg>
            </div>
            <figcaption id="dashboard-finance-chart-caption" className="mt-2 text-xs text-slate-500 dark:text-slate-400">
              Payments are grouped by payment date; expenses are grouped by expense date. All amounts are in {financeChartCurrency}.
            </figcaption>
          </figure>

          <details className="border-t border-[#E8EEF7] pt-3 dark:border-slate-800">
            <summary className="min-h-9 cursor-pointer py-2 text-sm font-semibold text-[#3069C4] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#4C8BF5] dark:text-blue-300">
              View daily chart data
            </summary>
            <div className="mt-2 max-h-64 overflow-auto">
              <table className="w-full text-left text-sm">
                <caption className="sr-only">Daily payments and expenses in {financeChartCurrency} over the last {financeChartDays} days</caption>
                <thead className="sticky top-0 bg-white text-xs text-slate-500 dark:bg-[#1E293B] dark:text-slate-400">
                  <tr><th scope="col" className="py-2 pr-3">Date</th><th scope="col" className="px-3 py-2 text-right">Payments</th><th scope="col" className="py-2 pl-3 text-right">Expenses</th></tr>
                </thead>
                <tbody className="divide-y divide-[#E8EEF7] dark:divide-slate-800">
                  {financeChart.points.map((point) => (
                    <tr key={point.date}>
                      <th scope="row" className="py-2 pr-3 font-medium text-slate-700 dark:text-slate-300">{formatDate(point.date)}</th>
                      <td className="px-3 py-2 text-right tabular-nums text-slate-700 dark:text-slate-300">{formatMoney(point.income, financeChartCurrency)}</td>
                      <td className="py-2 pl-3 text-right tabular-nums text-slate-700 dark:text-slate-300">{formatMoney(point.expenses, financeChartCurrency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </section>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {canSeeFinance && (
          <section aria-labelledby="dashboard-service-mix-title" className="min-w-0 rounded-2xl border border-[#E8EEF7] bg-white p-5 dark:border-slate-800 dark:bg-[#1E293B] sm:p-6">
            <div>
              <h2 id="dashboard-service-mix-title" className="text-lg font-bold text-[#28334E] dark:text-white">Invoice line totals by service</h2>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                Issued invoice line totals in {financeChartCurrency} over the selected {financeChartDays} days. Payments are not allocated to individual services.
              </p>
            </div>
            {serviceMixTotal > 0 ? (
              <div className="mt-5 space-y-4" role="list" aria-label="Invoice value by service category">
                {serviceMix.map((item) => (
                  <div key={item.group} role="listitem">
                    <div className="mb-1.5 flex items-center justify-between gap-3 text-sm">
                      <span className="font-medium text-slate-700 dark:text-slate-200">{item.label}</span>
                      <span className="shrink-0 font-semibold tabular-nums text-[#28334E] dark:text-white">{formatMoney(item.amount, financeChartCurrency)}</span>
                    </div>
                    <div
                      className="h-2.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800"
                      role="meter"
                      aria-label={`${item.label} invoice value`}
                      aria-valuemin={0}
                      aria-valuemax={serviceMixTotal}
                      aria-valuenow={item.amount}
                    >
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${Math.min(100, item.amount / serviceMixTotal * 100)}%`,
                          backgroundColor: serviceMixColors[item.group],
                        }}
                      />
                    </div>
                  </div>
                ))}
                <p className="border-t border-[#E8EEF7] pt-3 text-sm font-bold text-[#28334E] dark:border-slate-800 dark:text-white">
                  Total line value <span className="float-right tabular-nums">{formatMoney(serviceMixTotal, financeChartCurrency)}</span>
                </p>
              </div>
            ) : (
              <p className="mt-5 rounded-xl border border-dashed border-slate-300 px-4 py-8 text-center text-sm text-slate-600 dark:border-slate-700 dark:text-slate-400">
                No issued invoice line items match this period and currency.
              </p>
            )}
          </section>
        )}

        <section aria-labelledby="dashboard-inquiry-pipeline-title" className="min-w-0 rounded-2xl border border-[#E8EEF7] bg-white p-5 dark:border-slate-800 dark:bg-[#1E293B] sm:p-6">
          <div>
            <h2 id="dashboard-inquiry-pipeline-title" className="text-lg font-bold text-[#28334E] dark:text-white">Lead pipeline</h2>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">Current inquiries by status, from first contact through booking.</p>
          </div>
          {inquiries.length > 0 ? (
            <div className="mt-5 space-y-4" role="list" aria-label="Inquiry counts by status">
              {inquiryPipeline.map((item) => (
                <div key={item.status} role="listitem">
                  <div className="mb-1.5 flex items-center justify-between gap-3 text-sm">
                    <span className="font-medium text-slate-700 dark:text-slate-200">{item.label}</span>
                    <span className="font-semibold tabular-nums text-[#28334E] dark:text-white">{item.count}</span>
                  </div>
                  <div
                    className="h-2.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800"
                    role="meter"
                    aria-label={`${item.label} inquiries`}
                    aria-valuemin={0}
                    aria-valuemax={Math.max(1, ...inquiryPipeline.map((status) => status.count))}
                    aria-valuenow={item.count}
                  >
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${Math.max(0, item.count / Math.max(1, ...inquiryPipeline.map((status) => status.count)) * 100)}%`,
                        backgroundColor: inquiryStatusColors[item.status],
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-5 rounded-xl border border-dashed border-slate-300 px-4 py-8 text-center text-sm text-slate-600 dark:border-slate-700 dark:text-slate-400">
              No inquiries have been recorded yet.
            </p>
          )}
        </section>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(320px,0.8fr)]">
        <section aria-labelledby="dashboard-schedule-title" className="min-w-0">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <h2 id="dashboard-schedule-title" className="text-lg font-bold text-[#28334E] dark:text-white">Coming up</h2>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">Sessions and activities scheduled for the next seven days.</p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('calendar')}
              className="inline-flex min-h-10 shrink-0 items-center gap-1 rounded-lg px-3 text-sm font-semibold text-[#3069C4] hover:bg-blue-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#4C8BF5] dark:text-blue-300 dark:hover:bg-slate-800"
            >
              Planner <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
          {upcoming.length ? (
            <ul className="divide-y divide-[#E8EEF7] rounded-2xl border border-[#E8EEF7] bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-[#1E293B]">
              {upcoming.map((item) => (
                <li key={item.id} className="grid gap-2 px-4 py-3 sm:grid-cols-[6.5rem_minmax(0,1fr)_5rem] sm:items-center sm:px-5">
                  <time dateTime={item.date} className="text-xs font-semibold text-slate-600 dark:text-slate-400">{formatDate(item.date)}</time>
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-[#28334E] dark:text-white">{item.title}</p>
                    <p className="mt-0.5 truncate text-xs text-slate-600 dark:text-slate-400">{item.detail}</p>
                  </div>
                  <span className="w-fit rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-[#3069C4] dark:bg-blue-950/50 dark:text-blue-300">{item.type}</span>
                </li>
              ))}
            </ul>
          ) : (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-5 py-9 text-sm text-slate-600 dark:border-slate-700 dark:bg-[#1E293B] dark:text-slate-400">
              Nothing is scheduled for the next seven days. Use the planner to add a course or activity.
            </div>
          )}
        </section>

        <section aria-labelledby="dashboard-leads-title" className="min-w-0">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <h2 id="dashboard-leads-title" className="text-lg font-bold text-[#28334E] dark:text-white">New leads</h2>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">Requests waiting for a first response.</p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('students_crm')}
              className="inline-flex min-h-10 shrink-0 items-center gap-1 rounded-lg px-2 text-sm font-semibold text-[#3069C4] hover:bg-blue-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#4C8BF5] dark:text-blue-300 dark:hover:bg-slate-800"
            >
              Contacts <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
          {newLeads.length ? (
            <ul className="divide-y divide-[#E8EEF7] rounded-2xl border border-[#E8EEF7] bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-[#1E293B]">
              {newLeads.map((lead) => (
                <li key={lead.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-[#28334E] dark:text-white">{lead.lead_name}</p>
                    <p className="mt-0.5 truncate text-xs text-slate-600 dark:text-slate-400">
                      {lead.course_interest || 'Course interest not specified'} · {lead.channel}
                    </p>
                  </div>
                  <time dateTime={lead.created_at} className="shrink-0 text-xs text-slate-500 dark:text-slate-400">
                    {formatDate(lead.created_at.slice(0, 10))}
                  </time>
                </li>
              ))}
            </ul>
          ) : (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-5 py-9 text-sm text-slate-600 dark:border-slate-700 dark:bg-[#1E293B] dark:text-slate-400">
              No new leads need a first response.
            </div>
          )}
        </section>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section aria-labelledby="dashboard-stock-title" className="min-w-0">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-1 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true" />
              <div>
                <h2 id="dashboard-stock-title" className="text-lg font-bold text-[#28334E] dark:text-white">Equipment to check</h2>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">Items at or below their configured restock threshold.</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('equipment')}
              className="inline-flex min-h-10 shrink-0 items-center gap-1 rounded-lg px-2 text-sm font-semibold text-[#3069C4] hover:bg-blue-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#4C8BF5] dark:text-blue-300 dark:hover:bg-slate-800"
            >
              Equipment <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
          {lowStock.length ? (
            <ul className="divide-y divide-[#E8EEF7] rounded-2xl border border-[#E8EEF7] bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-[#1E293B]">
              {lowStock.slice(0, 5).map((item) => (
                <li key={item.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-[#28334E] dark:text-white">{item.item_name}</p>
                    <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-400">{item.category.replace('_', ' ')} · threshold {item.low_stock_threshold}</p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${item.quantity_available === 0 ? 'bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300' : 'bg-amber-50 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300'}`}>
                    {item.quantity_available} available
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-5 py-9 text-sm text-slate-600 dark:border-slate-700 dark:bg-[#1E293B] dark:text-slate-400">
              All tracked equipment is above its restock threshold.
            </div>
          )}
        </section>

        {canSeeFinance && (
          <section aria-labelledby="dashboard-income-title" className="min-w-0">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="flex items-start gap-3">
                <CircleDollarSign className="mt-1 h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                <div>
                  <h2 id="dashboard-income-title" className="text-lg font-bold text-[#28334E] dark:text-white">Recent finance activity</h2>
                  <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">Latest bills, orders, payments, and expenses. Select a record to open Finance.</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => onNavigate('finance')}
                className="inline-flex min-h-10 shrink-0 items-center gap-1 rounded-lg px-2 text-sm font-semibold text-[#3069C4] hover:bg-blue-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#4C8BF5] dark:text-blue-300 dark:hover:bg-slate-800"
              >
                All finance records <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
            {financeActivity.length ? (
              <ul className="divide-y divide-[#E8EEF7] rounded-2xl border border-[#E8EEF7] bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-[#1E293B]">
                {financeActivity.map((item) => {
                  const sign = item.type === 'payment' ? '+' : item.type === 'expense' ? '−' : '';
                  const typeLabel = item.type === 'payment' ? 'Payment received' : item.type === 'expense' ? 'Expense' : item.type === 'invoice' ? 'Bill / invoice' : 'Order';
                  return (
                    <li key={item.id}>
                      <button
                        type="button"
                        onClick={() => onNavigate('finance')}
                        className="flex min-h-16 w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-[#4C8BF5] dark:hover:bg-slate-800/60"
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-semibold text-[#28334E] dark:text-white">{typeLabel} · {item.title}</span>
                          <span className="mt-1 block truncate text-xs text-slate-600 dark:text-slate-400">{formatDate(item.date)} · {item.detail}</span>
                        </span>
                        <span className="shrink-0 text-right text-sm font-bold tabular-nums text-[#28334E] dark:text-white">
                          {sign}{formatMoney(item.amount, item.currency)}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-5 py-9 text-sm text-slate-600 dark:border-slate-700 dark:bg-[#1E293B] dark:text-slate-400">
                No finance records are available yet.
              </div>
            )}
          </section>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#E8EEF7] bg-white px-4 py-3 text-sm dark:border-slate-800 dark:bg-[#1E293B]">
        <span className="inline-flex items-center gap-2 text-slate-600 dark:text-slate-400">
          <Users className="h-4 w-4" aria-hidden="true" />
          Current totals reflect the records available to your role.
        </span>
        <button
          type="button"
          onClick={() => onNavigate('notifications')}
          className="inline-flex min-h-9 items-center gap-1 font-semibold text-[#3069C4] hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#4C8BF5] dark:text-blue-300"
        >
          View operational notifications <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
};
