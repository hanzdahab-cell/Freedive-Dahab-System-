import React, { useMemo, useState } from 'react';
import { AlertTriangle, Anchor, Bell, CalendarDays, ChevronRight, Package, Users } from 'lucide-react';
import { NavTab } from './Navigation';
import { CourseSession, DailyActivity, Equipment, Inquiry } from '../types';

type NotificationKind = 'schedule' | 'crm' | 'stock';

interface NotificationViewProps {
  sessions: CourseSession[];
  activities: DailyActivity[];
  equipment: Equipment[];
  inquiries: Inquiry[];
  onNavigate: (tab: NavTab) => void;
}

interface OperationalAlert {
  id: string;
  kind: NotificationKind;
  title: string;
  detail: string;
  date: string;
  action: string;
  tab: NavTab;
  urgency: number;
}

const dateOnly = (value: Date) => {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const formatDate = (value: string) =>
  new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' }).format(new Date(`${value}T12:00:00`));

export const NotificationsView: React.FC<NotificationViewProps> = ({
  sessions,
  activities,
  equipment,
  inquiries,
  onNavigate,
}) => {
  const [filter, setFilter] = useState<NotificationKind | 'all'>('all');
  const alerts = useMemo(() => {
    const now = new Date();
    const today = dateOnly(now);
    const horizon = new Date(now);
    horizon.setDate(horizon.getDate() + 7);
    const until = dateOnly(horizon);
    const upcoming: OperationalAlert[] = [];

    sessions
      .filter((session) =>
        session.status !== 'cancelled' &&
        session.start_date >= today &&
        session.start_date <= until,
      )
      .forEach((session) => {
        upcoming.push({
          id: `session-${session.id}`,
          kind: 'schedule',
          title: session.course_title || session.course_code || 'Course session',
          detail: `${session.location} · ${session.instructor_name || 'Instructor unassigned'}`,
          date: session.start_date,
          action: 'Open planner',
          tab: 'calendar',
          urgency: session.start_date === today ? 0 : 1,
        });
      });

    activities
      .filter((activity) =>
        activity.status !== 'completed' &&
        activity.status !== 'cancelled_weather' &&
        activity.activity_date >= today &&
        activity.activity_date <= until,
      )
      .forEach((activity) => {
        upcoming.push({
          id: `activity-${activity.id}`,
          kind: 'schedule',
          title: activity.title,
          detail: `${activity.location} · ${activity.start_time} · ${activity.current_pax}/${activity.max_pax} participants`,
          date: activity.activity_date,
          action: 'Open planner',
          tab: 'calendar',
          urgency: activity.activity_date === today ? 0 : 1,
        });
      });

    inquiries
      .filter((inquiry) => inquiry.status === 'new')
      .forEach((inquiry) => {
        const received = inquiry.created_at.slice(0, 10);
        upcoming.push({
          id: `inquiry-${inquiry.id}`,
          kind: 'crm',
          title: inquiry.lead_name || 'New inquiry',
          detail: inquiry.course_interest
            ? `New ${inquiry.channel} inquiry · ${inquiry.course_interest}`
            : `New inquiry from ${inquiry.channel}`,
          date: received,
          action: 'Review inquiry',
          tab: 'students_crm',
          urgency: 0,
        });
      });

    equipment
      .filter((item) => item.quantity_available <= item.low_stock_threshold)
      .forEach((item) => {
        upcoming.push({
          id: `stock-${item.id}`,
          kind: 'stock',
          title: `${item.item_name} is low`,
          detail: `${item.quantity_available} available of ${item.quantity_total} · threshold ${item.low_stock_threshold}`,
          date: today,
          action: 'Review equipment',
          tab: 'equipment',
          urgency: item.quantity_available === 0 ? 0 : 2,
        });
      });

    return upcoming.sort((a, b) =>
      a.urgency - b.urgency || a.date.localeCompare(b.date) || a.title.localeCompare(b.title),
    );
  }, [activities, equipment, inquiries, sessions]);

  const visibleAlerts = alerts.filter((alert) => filter === 'all' || alert.kind === filter);
  const filters: Array<{ id: NotificationKind | 'all'; label: string }> = [
    { id: 'all', label: 'All updates' },
    { id: 'schedule', label: 'Schedule' },
    { id: 'crm', label: 'New leads' },
    { id: 'stock', label: 'Equipment' },
  ];

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-2 border-b border-[#E8EEF7] pb-4 dark:border-slate-800 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-[#28334E] dark:text-white">Notifications</h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Operational follow-ups from the planner, CRM, and equipment room.
          </p>
        </div>
        <p className="text-sm font-semibold text-slate-600 dark:text-slate-300" aria-live="polite">
          {alerts.length} active {alerts.length === 1 ? 'update' : 'updates'}
        </p>
      </header>

      <div className="flex flex-wrap gap-2" role="group" aria-label="Filter notifications">
        {filters.map((item) => (
          <button
            key={item.id}
            type="button"
            aria-pressed={filter === item.id}
            onClick={() => setFilter(item.id)}
            className={`min-h-10 rounded-xl px-4 text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#4C8BF5] ${
              filter === item.id
                ? 'bg-[#28334E] text-white'
                : 'border border-[#E2E8F0] bg-white text-slate-700 hover:border-[#4C8BF5] dark:border-slate-700 dark:bg-[#1E293B] dark:text-slate-200'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {visibleAlerts.length ? (
        <ul className="divide-y divide-[#E8EEF7] rounded-2xl border border-[#E8EEF7] bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-[#1E293B]">
          {visibleAlerts.map((alert) => {
            const Icon = alert.kind === 'schedule' ? CalendarDays : alert.kind === 'crm' ? Users : Package;
            return (
              <li key={alert.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                <div className="flex min-w-0 items-start gap-3">
                  <span className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                    alert.urgency === 0
                      ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300'
                      : 'bg-blue-50 text-[#3069C4] dark:bg-blue-950/50 dark:text-blue-300'
                  }`}>
                    {alert.kind === 'stock' && alert.urgency === 0
                      ? <AlertTriangle className="h-4 w-4" aria-hidden="true" />
                      : <Icon className="h-4 w-4" aria-hidden="true" />}
                  </span>
                  <div className="min-w-0">
                    <p className="font-semibold text-[#28334E] dark:text-white">{alert.title}</p>
                    <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{alert.detail}</p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center justify-between gap-4 sm:justify-end">
                  <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                    {alert.kind === 'crm' ? `Received ${formatDate(alert.date)}` : formatDate(alert.date)}
                  </span>
                  <button
                    type="button"
                    onClick={() => onNavigate(alert.tab)}
                    className="inline-flex min-h-10 items-center gap-1 rounded-lg px-3 text-sm font-semibold text-[#3069C4] hover:bg-blue-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#4C8BF5] dark:text-blue-300 dark:hover:bg-slate-800"
                  >
                    {alert.action}
                    <ChevronRight className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <section className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center dark:border-slate-700 dark:bg-[#1E293B]">
          <Bell className="mx-auto h-8 w-8 text-slate-400" aria-hidden="true" />
          <h2 className="mt-3 font-semibold text-[#28334E] dark:text-white">You’re up to date</h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            New leads, upcoming sessions, and low-stock gear will appear here when action is needed.
          </p>
          {filter !== 'all' && (
            <button
              type="button"
              onClick={() => setFilter('all')}
              className="mt-4 min-h-10 rounded-lg px-4 text-sm font-semibold text-[#3069C4] hover:bg-blue-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#4C8BF5] dark:text-blue-300 dark:hover:bg-slate-800"
            >
              Show all updates
            </button>
          )}
        </section>
      )}
    </div>
  );
};
