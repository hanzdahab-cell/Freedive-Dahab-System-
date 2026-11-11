import React, { useState } from 'react';
import { CourseSession, DailyActivity, User } from '../types';
import { Language, translations } from '../i18n';
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Clock,
  Compass,
  Users,
  Anchor,
  Filter,
} from 'lucide-react';

interface CalendarViewProps {
  sessions: CourseSession[];
  activities: DailyActivity[];
  instructors: User[];
  lang: Language;
}

export const CalendarView: React.FC<CalendarViewProps> = ({
  sessions,
  activities,
  instructors,
  lang,
}) => {
  const t = translations[lang];
  const [viewMode, setViewMode] = useState<'month' | 'week' | 'day'>('month');
  const [selectedInstructor, setSelectedInstructor] = useState('ALL');

  const [currentYear, setCurrentYear] = useState(() => new Date().getFullYear());
  const [currentMonth, setCurrentMonth] = useState(() => new Date().getMonth());
  const [today] = useState(() => new Date());

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  // Helper for calendar grid
  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  const firstDayIndex = new Date(currentYear, currentMonth, 1).getDay();

  const handlePrevMonth = () => {
    if (currentMonth === 0) {
      setCurrentMonth(11);
      setCurrentYear(currentYear - 1);
    } else {
      setCurrentMonth(currentMonth - 1);
    }
  };

  const handleNextMonth = () => {
    if (currentMonth === 11) {
      setCurrentMonth(0);
      setCurrentYear(currentYear + 1);
    } else {
      setCurrentMonth(currentMonth + 1);
    }
  };

  // Combine items for calendar days
  const getItemsForDate = (year: number, month: number, day: number) => {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

    const matchingSessions = sessions.filter((s) => {
      const matchInst = selectedInstructor === 'ALL' || s.instructor_id === selectedInstructor;
      return matchInst && dateStr >= s.start_date && dateStr <= s.end_date;
    });

    const matchingActivities = activities.filter((a) => {
      const matchInst = selectedInstructor === 'ALL' || a.lead_instructor_id === selectedInstructor;
      return matchInst && a.activity_date === dateStr;
    });

    return { sessions: matchingSessions, activities: matchingActivities };
  };

  return (
    <div className="space-y-6">
      {/* Calendar Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-[#E8EEF7] dark:border-slate-800">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-2xl bg-blue-50 dark:bg-slate-800 border border-blue-100 dark:border-slate-700 text-[#4C8BF5]">
            <CalendarIcon className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-xl font-extrabold text-[#28334E] dark:text-white flex items-center gap-2">
              <span>{monthNames[currentMonth]} {currentYear}</span>
              <span className="text-xs font-bold text-[#4C8BF5] bg-blue-50 dark:bg-slate-800 px-2.5 py-0.5 rounded-full border border-blue-100 dark:border-slate-700 font-mono">
                Africa/Cairo (UTC+2)
              </span>
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">Dahab freediving school, courses & ocean schedule</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Instructor Filter */}
          <div className="flex items-center gap-1.5 bg-white dark:bg-[#1E293B] border border-[#E8EEF7] dark:border-slate-800 rounded-xl px-3 py-2 shadow-xs">
            <Filter className="w-3.5 h-3.5 text-[#4C8BF5]" />
            <select
              value={selectedInstructor}
              onChange={(e) => setSelectedInstructor(e.target.value)}
              className="bg-transparent text-xs text-slate-700 dark:text-slate-200 focus:outline-none cursor-pointer"
            >
              <option value="ALL">All Instructors</option>
              {instructors.map((inst) => (
                <option key={inst.id} value={inst.id}>
                  {inst.full_name}
                </option>
              ))}
            </select>
          </div>

          {/* Month Navigation */}
          <div className="flex items-center bg-white dark:bg-[#1E293B] border border-[#E8EEF7] dark:border-slate-800 rounded-xl overflow-hidden shadow-xs">
            <button
              onClick={handlePrevMonth}
              className="p-2 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition-colors cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => {
                const now = new Date();
                setCurrentYear(now.getFullYear());
                setCurrentMonth(now.getMonth());
              }}
              className="px-3 py-1 text-xs font-bold text-slate-700 dark:text-slate-200 hover:text-[#4C8BF5] cursor-pointer"
            >
              Today
            </button>
            <button
              onClick={handleNextMonth}
              className="p-2 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition-colors cursor-pointer"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Month Calendar Grid */}
      <div className="bg-white dark:bg-[#1E293B] border border-[#E8EEF7] dark:border-slate-800 rounded-2xl overflow-hidden shadow-[0_2px_12px_rgba(40,51,78,0.02)]">
        {/* Days of week */}
        <div className="grid grid-cols-7 bg-[#F8FAFC] dark:bg-slate-800/60 border-b border-[#E8EEF7] dark:border-slate-800 text-center text-xs font-bold text-[#4C8BF5] py-2.5">
          <div>Sun</div>
          <div>Mon</div>
          <div>Tue</div>
          <div>Wed</div>
          <div>Thu</div>
          <div>Fri</div>
          <div>Sat</div>
        </div>

        {/* Calendar Day Cells */}
        <div className="grid grid-cols-7 auto-rows-fr divide-x divide-y divide-[#F1F5F9] dark:divide-slate-800 bg-white dark:bg-[#1E293B]">
          {/* Empty cells before month start */}
          {Array.from({ length: firstDayIndex }).map((_, idx) => (
            <div key={`empty-${idx}`} className="min-h-[110px] p-2 bg-slate-50/60 dark:bg-[#06111f]/40 opacity-40" />
          ))}

          {/* Days of month */}
          {Array.from({ length: daysInMonth }).map((_, idx) => {
            const dayNum = idx + 1;
            const { sessions: daySessions, activities: dayActivities } = getItemsForDate(
              currentYear,
              currentMonth,
              dayNum
            );
            const isToday =
              currentYear === today.getFullYear() &&
              currentMonth === today.getMonth() &&
              dayNum === today.getDate();

            return (
              <div
                key={`day-${dayNum}`}
                className={`min-h-[120px] p-2 flex flex-col justify-between transition-colors ${
                  isToday ? 'bg-blue-50/60 dark:bg-blue-950/20 ring-1 ring-[#4C8BF5]/30' : 'hover:bg-slate-50 dark:hover:bg-[#0c1e36]/40'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span
                    className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                      isToday
                        ? 'bg-[#4C8BF5] text-white shadow-xs'
                        : 'text-slate-800 dark:text-slate-300'
                    }`}
                  >
                    {dayNum}
                  </span>
                  {(daySessions.length > 0 || dayActivities.length > 0) && (
                    <span className="text-[10px] text-[#4C8BF5] font-mono font-bold">
                      {daySessions.length + dayActivities.length} items
                    </span>
                  )}
                </div>

                {/* Day events badges */}
                <div className="space-y-1 mt-1.5 flex-1">
                  {dayActivities.map((act) => (
                    <div
                      key={act.id}
                      className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-teal-950/90 text-teal-300 border border-teal-800/80 truncate flex items-center gap-1"
                      title={`${act.title} at ${act.location} (${act.start_time})`}
                    >
                      <Anchor className="w-2.5 h-2.5 text-teal-400 shrink-0" />
                      <span className="truncate">{act.title}</span>
                    </div>
                  ))}

                  {daySessions.map((ses) => (
                    <div
                      key={ses.id}
                      className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-cyan-950/90 text-cyan-300 border border-cyan-800/80 truncate flex items-center gap-1"
                      title={`${ses.course_title} (${ses.location}) - Inst: ${ses.instructor_name || 'Unassigned'}`}
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 shrink-0" />
                      <span className="truncate font-semibold">{ses.course_code}:</span>
                      <span className="truncate">{ses.instructor_name?.split(' ')[0] || 'Unassigned'}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Legend & Operations Notice */}
      <div className="p-4 rounded-2xl bg-white dark:bg-[#1E293B] border border-[#E8EEF7] dark:border-slate-800 text-xs text-slate-700 dark:text-slate-300 flex flex-wrap items-center justify-between gap-4 shadow-[0_2px_12px_rgba(40,51,78,0.02)]">
        <div className="flex items-center gap-4">
          <span className="font-bold text-[#28334E] dark:text-white">Event Color Guide:</span>
          <div className="flex items-center gap-1.5 text-[#4C8BF5] font-semibold">
            <span className="w-3 h-3 rounded bg-[#4C8BF5]" />
            <span>Course Sessions (AIDA / Molchanovs)</span>
          </div>
          <div className="flex items-center gap-1.5 text-teal-600 dark:text-teal-300 font-semibold">
            <span className="w-3 h-3 rounded bg-teal-500" />
            <span>Daily Ocean Activities (Blue Hole & Reefs)</span>
          </div>
        </div>

        <div className="text-slate-500 dark:text-slate-400 text-[11px]">
          Timezone configured: <strong className="text-[#4C8BF5] font-mono">Africa/Cairo (UTC+2)</strong>
        </div>
      </div>
    </div>
  );
};
