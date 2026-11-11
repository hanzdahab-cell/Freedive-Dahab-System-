import React, { useEffect, useState } from 'react';
import { Course, CourseSession, Student, User, UserRole, Booking } from '../types';
import { Language, translations } from '../i18n';
import { apiRequest } from '../api';
import {
  GraduationCap,
  Calendar,
  Users,
  Plus,
  Clock,
  Compass,
  DollarSign,
  AlertCircle,
  X,
  CheckCircle,
  UserCheck,
} from 'lucide-react';

interface BookingSafetyRules {
  waiver_valid_days: number;
  minimum_deposit_percent: number;
  max_divers_per_buoy: number;
  ras_mohamed_min_participants: number;
}

function isBookingSafetyRules(value: unknown): value is BookingSafetyRules {
  if (!value || typeof value !== 'object') return false;
  const rules = value as Record<string, unknown>;
  return typeof rules.waiver_valid_days === 'number' &&
    Number.isInteger(rules.waiver_valid_days) &&
    rules.waiver_valid_days >= 1 &&
    rules.waiver_valid_days <= 3650 &&
    typeof rules.minimum_deposit_percent === 'number' &&
    Number.isFinite(rules.minimum_deposit_percent) &&
    rules.minimum_deposit_percent >= 1 &&
    rules.minimum_deposit_percent <= 100 &&
    typeof rules.max_divers_per_buoy === 'number' &&
    Number.isInteger(rules.max_divers_per_buoy) &&
    rules.max_divers_per_buoy >= 1 &&
    rules.max_divers_per_buoy <= 10 &&
    typeof rules.ras_mohamed_min_participants === 'number' &&
    Number.isInteger(rules.ras_mohamed_min_participants) &&
    rules.ras_mohamed_min_participants >= 1 &&
    rules.ras_mohamed_min_participants <= 100;
}

interface CoursesViewProps {
  courses: Course[];
  sessions: CourseSession[];
  students: Student[];
  instructors: User[];
  bookings: Booking[];
  userRole: UserRole;
  onRefresh: () => void;
  onScheduleSession: (sessionData: any) => Promise<void>;
  onUpdateSession: (sessionId: string, sessionData: { buoy_count: number }) => Promise<void>;
  onUpdateBooking: (bookingId: string, data: { assigned_buoy: number }) => Promise<void>;
  onEnrollBooking: (bookingData: any) => Promise<void>;
  lang: Language;
}

export const CoursesView: React.FC<CoursesViewProps> = ({
  courses,
  sessions,
  students,
  instructors,
  bookings,
  userRole,
  onRefresh,
  onScheduleSession,
  onUpdateSession,
  onUpdateBooking,
  onEnrollBooking,
  lang,
}) => {
  const t = translations[lang];
  const [activeTab, setActiveTab] = useState<'sessions' | 'catalog'>('sessions');

  // Modals
  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);
  const [isEnrollModalOpen, setIsEnrollModalOpen] = useState(false);
  const [selectedSessionForEnroll, setSelectedSessionForEnroll] = useState<CourseSession | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [sessionBuoyEdits, setSessionBuoyEdits] = useState<Record<string, string>>({});
  const [sessionUpdateError, setSessionUpdateError] = useState<string | null>(null);
  const [safetyRules, setSafetyRules] = useState<BookingSafetyRules | null>(null);

  useEffect(() => {
    let active = true;
    apiRequest<Record<string, string>>('/api/settings')
      .then((settings) => {
        if (!active || !settings.booking_safety_rules) return;
        const parsed: unknown = JSON.parse(settings.booking_safety_rules);
        if (isBookingSafetyRules(parsed)) setSafetyRules(parsed);
      })
      .catch(() => {
        if (active) setSafetyRules(null);
      });
    return () => {
      active = false;
    };
  }, []);

  // New session state
  const [newSession, setNewSession] = useState({
    course_id: courses[0]?.id || '',
    instructor_id: instructors[0]?.id || '',
    start_date: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
    end_date: new Date(Date.now() + 4 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
    location: 'Lighthouse Bay & Blue Hole',
    max_capacity: 4,
    buoy_count: 1,
    notes: '',
  });

  // Enroll booking state
  const [enrollData, setEnrollData] = useState({
    student_id: students[0]?.id || '',
    session_id: '',
    course_id: '',
    price: 320,
    currency: 'EUR',
    deposit_amount: 0,
    payment_method: 'Cash EUR',
    payment_date: new Date().toISOString().slice(0, 10),
    prerequisites_verified: false,
    assigned_buoy: '',
    notes: '',
  });

  const canManageCourses = ['owner', 'operations_manager'].includes(userRole);
  const canManageBookingOperations = ['owner', 'operations_manager', 'front_desk_crm'].includes(userRole);

  const handleScheduleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setSubmitting(true);
    try {
      await onScheduleSession(newSession);
      setIsScheduleModalOpen(false);
      await onRefresh();
    } catch (err: any) {
      setFormError(err.message || 'Failed to schedule session');
    } finally {
      setSubmitting(false);
    }
  };

  const handleEnrollSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setSubmitting(true);
    try {
      await onEnrollBooking(enrollData);
      setIsEnrollModalOpen(false);
      await onRefresh();
    } catch (err: any) {
      setFormError(err.message || 'Failed to enroll student');
    } finally {
      setSubmitting(false);
    }
  };

  const openEnrollModal = (ses: CourseSession) => {
    setSelectedSessionForEnroll(ses);
    setEnrollData({
      student_id: students[0]?.id || '',
      session_id: ses.id,
      course_id: ses.course_id,
      price: ses.price_eur || 320,
      currency: 'EUR',
      deposit_amount: 0,
      payment_method: 'Cash EUR',
      payment_date: new Date().toISOString().slice(0, 10),
      prerequisites_verified: false,
      assigned_buoy: '',
      notes: `Enrolled in ${ses.course_title}`,
    });
    setIsEnrollModalOpen(true);
  };

  const saveSessionBuoyCount = async (sessionId: string, value: string) => {
    const buoyCount = Number(value);
    if (!Number.isInteger(buoyCount) || buoyCount < 1) {
      setSessionUpdateError('Assign at least one buoy before bookings can be confirmed.');
      return;
    }
    setSessionUpdateError(null);
    try {
      await onUpdateSession(sessionId, { buoy_count: buoyCount });
      setSessionBuoyEdits((edits) => {
        const next = { ...edits };
        delete next[sessionId];
        return next;
      });
      await onRefresh();
    } catch (err: any) {
      setSessionUpdateError(err.message || 'Failed to update session buoy count');
    }
  };

  const assignBookingBuoy = async (bookingId: string, value: string) => {
    const assignedBuoy = Number(value);
    if (!Number.isInteger(assignedBuoy) || assignedBuoy < 1) {
      setSessionUpdateError('Choose a numbered buoy assignment for every active diver.');
      return;
    }
    setSessionUpdateError(null);
    try {
      await onUpdateBooking(bookingId, { assigned_buoy: assignedBuoy });
      await onRefresh();
    } catch (err: any) {
      setSessionUpdateError(err.message || 'Failed to assign the diver to a buoy');
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header & Tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-[#E8EEF7] dark:border-slate-800">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab('sessions')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'sessions'
                ? 'bg-[#4C8BF5] text-white shadow-xs'
                : 'bg-white dark:bg-[#1E293B] text-slate-600 dark:text-slate-300 hover:text-[#4C8BF5] border border-[#E8EEF7] dark:border-slate-700'
            }`}
          >
            Scheduled Course Sessions ({sessions.length})
          </button>
          <button
            onClick={() => setActiveTab('catalog')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'catalog'
                ? 'bg-[#4C8BF5] text-white shadow-xs'
                : 'bg-white dark:bg-[#1E293B] text-slate-600 dark:text-slate-300 hover:text-[#4C8BF5] border border-[#E8EEF7] dark:border-slate-700'
            }`}
          >
            Course Catalog & Pricing ({courses.length})
          </button>
        </div>

        {canManageCourses && (
          <button
            onClick={() => setIsScheduleModalOpen(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#4C8BF5] hover:bg-[#3B7BE8] text-white font-semibold text-xs shadow-md shadow-blue-500/20 transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Schedule Course Session</span>
          </button>
        )}
      </div>

      {/* SESSIONS VIEW */}
      {activeTab === 'sessions' && (
        <div className="space-y-4">
          {sessionUpdateError && (
            <p role="alert" className="rounded-lg bg-rose-950/80 border border-rose-800 px-4 py-3 text-rose-300 text-xs">
              {sessionUpdateError}
            </p>
          )}
          <div className="bg-white dark:bg-[#0c1427] border border-[#e4e8ec] dark:border-[#1e293b] rounded-2xl overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-600 dark:text-slate-300">
                <thead className="bg-[#f8f9fa] dark:bg-[#071424] text-slate-500 dark:text-slate-400 font-bold border-b border-[#e4e8ec] dark:border-slate-800 uppercase tracking-wider text-[10px]">
                  <tr>
                    <th className="py-3 px-4">Course & Level</th>
                    <th className="py-3 px-4">Dates</th>
                    <th className="py-3 px-4">Location</th>
                    <th className="py-3 px-4">Assigned Instructor</th>
                    <th className="py-3 px-4">Capacity / Roster</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-cyan-900/30">
                  {sessions.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="text-center py-8 text-slate-500">
                        No course sessions scheduled.
                      </td>
                    </tr>
                  ) : (
                    sessions.map((ses) => {
                      const isFull = (ses.enrolled_count || 0) >= ses.max_capacity;
                      return (
                        <tr key={ses.id} className="hover:bg-[#0e213b]/60 transition-colors">
                          <td className="py-3 px-4">
                            <div className="font-semibold text-white flex items-center gap-2">
                              <span>{ses.course_title}</span>
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-cyan-950 text-cyan-300 border border-cyan-800">
                                {ses.course_code}
                              </span>
                            </div>
                            <div className="text-[11px] text-slate-400 mt-0.5">
                              {ses.agency} • €{ses.price_eur} / {ses.price_egp?.toLocaleString()} EGP
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            <div className="font-medium text-slate-200">
                              {ses.start_date} to {ses.end_date}
                            </div>
                          </td>
                          <td className="py-3 px-4 text-cyan-300">
                            {ses.location}
                          </td>
                          <td className="py-3 px-4">
                            {ses.instructor_name ? (
                              <div className="flex items-center gap-1.5 text-slate-200 font-medium">
                                <UserCheck className="w-3.5 h-3.5 text-cyan-400" />
                                <span>{ses.instructor_name}</span>
                              </div>
                            ) : (
                              <span className="text-amber-400 text-[11px]">Unassigned</span>
                            )}
                          </td>
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-2">
                              <div className="w-20 bg-slate-800 rounded-full h-2 overflow-hidden">
                                <div
                                  className={`h-full rounded-full ${isFull ? 'bg-amber-400' : 'bg-cyan-400'}`}
                                  style={{ width: `${Math.min(100, ((ses.enrolled_count || 0) / ses.max_capacity) * 100)}%` }}
                                />
                              </div>
                              <span className="font-mono text-xs">
                                {ses.enrolled_count || 0}/{ses.max_capacity}
                              </span>
                            </div>
                            {canManageBookingOperations ? (
                              <label className="mt-2 flex items-center gap-2 text-[10px] text-slate-400">
                                <span>Buoys (limit configured in Settings)</span>
                                <input
                                  aria-label={`Assigned buoys for ${ses.course_title}`}
                                  type="number"
                                  min={1}
                                  step={1}
                                  value={sessionBuoyEdits[ses.id] ?? String(ses.buoy_count || 0)}
                                  onChange={(event) => setSessionBuoyEdits({ ...sessionBuoyEdits, [ses.id]: event.target.value })}
                                  onBlur={(event) => {
                                    const edited = sessionBuoyEdits[ses.id];
                                    if (edited !== undefined && edited !== String(ses.buoy_count || 0)) {
                                      void saveSessionBuoyCount(ses.id, event.target.value);
                                    }
                                  }}
                                  className="w-14 rounded border border-cyan-900/60 bg-[#071322] px-1.5 py-1 text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400"
                                />
                              </label>
                            ) : (
                              <p className="mt-2 text-[10px] text-slate-400">Assigned buoys: {ses.buoy_count || 'Not set'}</p>
                            )}
                            <div className="mt-2 space-y-1">
                              {bookings
                                .filter((booking) => booking.session_id === ses.id && booking.status !== 'cancelled')
                                .map((booking) => (
                                  <label key={booking.id} className="flex items-center justify-between gap-2 text-[10px] text-slate-400">
                                    <span>{booking.first_name} {booking.last_name}</span>
                                    {canManageBookingOperations ? (
                                      <select
                                        aria-label={`Buoy assignment for ${booking.first_name} ${booking.last_name}`}
                                        value={booking.assigned_buoy ?? ''}
                                        onChange={(event) => {
                                          if (event.target.value) void assignBookingBuoy(booking.id, event.target.value);
                                        }}
                                        className="w-16 rounded border border-cyan-900/60 bg-[#071322] px-1.5 py-1 text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400"
                                      >
                                        <option value="">Unassigned</option>
                                        {Array.from({ length: Math.max(0, ses.buoy_count || 0) }, (_, index) => (
                                          <option key={index + 1} value={index + 1}>Buoy {index + 1}</option>
                                        ))}
                                      </select>
                                    ) : (
                                      <span>{booking.assigned_buoy ? `Buoy ${booking.assigned_buoy}` : 'Unassigned'}</span>
                                    )}
                                  </label>
                                ))}
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            <span className="px-2 py-0.5 rounded-full text-[11px] font-medium capitalize bg-cyan-950 text-cyan-300 border border-cyan-800">
                              {ses.status}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right">
                            <button
                              disabled={isFull}
                              onClick={() => openEnrollModal(ses)}
                              className={`px-3 py-1 rounded text-xs font-semibold transition-all cursor-pointer ${
                                isFull
                                  ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                                  : 'bg-cyan-500 hover:bg-cyan-400 text-[#071322] shadow-sm'
                              }`}
                            >
                              {isFull ? 'Full' : '+ Enroll Diver'}
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* CATALOG VIEW */}
      {activeTab === 'catalog' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {courses.map((crs) => (
            <div
              key={crs.id}
              className="p-5 rounded-2xl bg-[#0a182a] border border-cyan-900/50 hover:border-cyan-500/50 transition-all flex flex-col justify-between space-y-4 shadow-sm"
            >
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-cyan-950 text-cyan-300 border border-cyan-800">
                    {crs.agency} • {crs.level}
                  </span>
                  <span className="text-xs font-mono text-slate-400">{crs.code}</span>
                </div>

                <h3 className="text-base font-bold text-white">{crs.title}</h3>

                <p className="text-xs text-slate-300 leading-relaxed">
                  {crs.description || 'Professional freediving curriculum in Dahab.'}
                </p>

                {crs.prerequisites && (
                  <div className="text-[11px] text-slate-400 bg-[#071322] p-2.5 rounded-lg border border-cyan-950">
                    <strong className="text-cyan-400">Prerequisites:</strong> {crs.prerequisites}
                  </div>
                )}
              </div>

              <div className="pt-3 border-t border-cyan-900/40 flex items-center justify-between">
                <div>
                  <div className="text-lg font-bold text-cyan-300 font-mono">
                    €{crs.price_eur}
                  </div>
                  <div className="text-[11px] text-slate-400">
                    {crs.price_egp?.toLocaleString()} EGP • {crs.duration_days} days
                  </div>
                </div>

                <div className="text-xs text-slate-400">
                  Max: <strong className="text-white">{crs.max_capacity}</strong> students
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* SCHEDULE COURSE SESSION MODAL */}
      {isScheduleModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#091728] border border-cyan-800/60 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto text-slate-200 shadow-2xl">
            <div className="p-5 border-b border-cyan-900/50 flex items-center justify-between bg-[#071322]">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Calendar className="w-4 h-4 text-cyan-400" />
                <span>Schedule New Course Session</span>
              </h3>
              <button
                onClick={() => setIsScheduleModalOpen(false)}
                className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleScheduleSubmit} className="p-6 space-y-4 text-xs">
              {formError && (
                <div className="p-3 rounded-lg bg-rose-950/80 border border-rose-800 text-rose-300 text-xs">
                  {formError}
                </div>
              )}

              <div>
                <label className="block text-slate-400 mb-1">Select Course *</label>
                <select
                  required
                  value={newSession.course_id}
                  onChange={(e) => setNewSession({ ...newSession, course_id: e.target.value })}
                  className="w-full bg-[#071322] border border-cyan-900/60 rounded-lg p-2 text-white focus:outline-none focus:border-cyan-400"
                >
                  {courses.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.code} - {c.title} (€{c.price_eur})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Assigned Lead Instructor</label>
                <select
                  value={newSession.instructor_id}
                  onChange={(e) => setNewSession({ ...newSession, instructor_id: e.target.value })}
                  className="w-full bg-[#071322] border border-cyan-900/60 rounded-lg p-2 text-white focus:outline-none focus:border-cyan-400"
                >
                  <option value="">Unassigned</option>
                  {instructors.map((inst) => (
                    <option key={inst.id} value={inst.id}>
                      {inst.full_name} ({inst.role})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1">Start Date *</label>
                  <input
                    type="date"
                    required
                    value={newSession.start_date}
                    onChange={(e) => setNewSession({ ...newSession, start_date: e.target.value })}
                    className="w-full bg-[#071322] border border-cyan-900/60 rounded-lg p-2 text-white focus:outline-none focus:border-cyan-400"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">End Date *</label>
                  <input
                    type="date"
                    required
                    value={newSession.end_date}
                    onChange={(e) => setNewSession({ ...newSession, end_date: e.target.value })}
                    className="w-full bg-[#071322] border border-cyan-900/60 rounded-lg p-2 text-white focus:outline-none focus:border-cyan-400"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1">Location</label>
                  <input
                    type="text"
                    value={newSession.location}
                    onChange={(e) => setNewSession({ ...newSession, location: e.target.value })}
                    className="w-full bg-[#071322] border border-cyan-900/60 rounded-lg p-2 text-white focus:outline-none focus:border-cyan-400"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">Max Capacity (Students)</label>
                  <input
                    type="number"
                    min={1}
                    max={12}
                    value={newSession.max_capacity}
                    onChange={(e) => setNewSession({ ...newSession, max_capacity: Number(e.target.value) })}
                    className="w-full bg-[#071322] border border-cyan-900/60 rounded-lg p-2 text-white focus:outline-none focus:border-cyan-400"
                  />
                </div>
              </div>
              <div>
                <label className="block text-slate-400 mb-1" htmlFor="session-buoy-count">Assigned Buoys *</label>
                <input
                  id="session-buoy-count"
                  type="number"
                  required
                  min={1}
                  step={1}
                  value={newSession.buoy_count}
                  onChange={(e) => setNewSession({ ...newSession, buoy_count: Number(e.target.value) })}
                  className="w-full bg-[#071322] border border-cyan-900/60 rounded-lg p-2 text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Operational Notes</label>
                <textarea
                  rows={2}
                  value={newSession.notes}
                  onChange={(e) => setNewSession({ ...newSession, notes: e.target.value })}
                  placeholder="Classroom time, boat logistics, equipment requirements..."
                  className="w-full bg-[#071322] border border-cyan-900/60 rounded-lg p-2 text-white focus:outline-none focus:border-cyan-400"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-cyan-900/50">
                <button
                  type="button"
                  onClick={() => setIsScheduleModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-[#071322] font-semibold cursor-pointer shadow-md"
                >
                  {submitting ? 'Scheduling...' : 'Schedule Session'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ENROLL STUDENT MODAL */}
      {isEnrollModalOpen && selectedSessionForEnroll && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#091728] border border-cyan-800/60 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto text-slate-200 shadow-2xl">
            <div className="p-5 border-b border-cyan-900/50 flex items-center justify-between bg-[#071322]">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <UserCheck className="w-4 h-4 text-cyan-400" />
                  <span>Enroll Diver into Session</span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  {selectedSessionForEnroll.course_title} ({selectedSessionForEnroll.start_date})
                </p>
              </div>
              <button
                onClick={() => setIsEnrollModalOpen(false)}
                className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleEnrollSubmit} className="p-6 space-y-4 text-xs">
              {formError && (
                <div className="p-3 rounded-lg bg-rose-950/80 border border-rose-800 text-rose-300 text-xs">
                  {formError}
                </div>
              )}

              <div>
                <label htmlFor="booking-student" className="block text-slate-400 mb-1">Select Student *</label>
                <select
                  id="booking-student"
                  required
                  value={enrollData.student_id}
                  onChange={(e) => setEnrollData({ ...enrollData, student_id: e.target.value })}
                  className="w-full bg-[#071322] border border-cyan-900/60 rounded-lg p-2 text-white focus:outline-none focus:border-cyan-400"
                >
                  {students.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.first_name} {s.last_name} ({s.certification_agency} {s.certification_level}) - {s.medical_waiver_signed ? 'Waiver signed' : 'Waiver pending'}, clearance {s.medical_clearance_status || 'restricted'}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="booking-price" className="block text-slate-400 mb-1">Booking Total</label>
                  <input
                    id="booking-price"
                    type="number"
                    min={0.01}
                    step={0.01}
                    value={enrollData.price}
                    onChange={(e) => setEnrollData({ ...enrollData, price: Number(e.target.value) })}
                    className="w-full bg-[#071322] border border-cyan-900/60 rounded-lg p-2 text-white focus:outline-none focus:border-cyan-400"
                  />
                </div>
                <div>
                  <label htmlFor="booking-currency" className="block text-slate-400 mb-1">Currency</label>
                  <select
                    id="booking-currency"
                    value={enrollData.currency}
                    onChange={(e) => setEnrollData({
                      ...enrollData,
                      currency: e.target.value,
                      price: e.target.value === 'EGP' ? selectedSessionForEnroll.price_egp || enrollData.price : e.target.value === 'USD' ? enrollData.price : selectedSessionForEnroll.price_eur || enrollData.price,
                      payment_method: `Cash ${e.target.value}`,
                    })}
                    className="w-full bg-[#071322] border border-cyan-900/60 rounded-lg p-2 text-white focus:outline-none focus:border-cyan-400"
                  >
                    <option value="EUR">EUR (€)</option>
                    <option value="EGP">EGP (Egyptian Pound)</option>
                    <option value="USD">USD ($)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="booking-deposit" className="block text-slate-400 mb-1">
                    Recorded Deposit{ safetyRules ? ` (min ${enrollData.currency} ${(Math.ceil(enrollData.price * safetyRules.minimum_deposit_percent - 1e-9) / 100).toFixed(2)})` : ' (minimum configured in Settings)' } *
                  </label>
                  <input
                    id="booking-deposit"
                    type="number"
                    required
                    step={0.01}
                    value={enrollData.deposit_amount || ''}
                    onChange={(e) => setEnrollData({ ...enrollData, deposit_amount: Number(e.target.value) })}
                    className="w-full bg-[#071322] border border-cyan-900/60 rounded-lg p-2 text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400"
                  />
                </div>
                <div>
                  <label htmlFor="booking-payment-date" className="block text-slate-400 mb-1">Payment Date *</label>
                  <input
                    id="booking-payment-date"
                    type="date"
                    required
                    value={enrollData.payment_date}
                    onChange={(e) => setEnrollData({ ...enrollData, payment_date: e.target.value })}
                    className="w-full bg-[#071322] border border-cyan-900/60 rounded-lg p-2 text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400"
                  />
                </div>
              </div>
              <div>
                <label htmlFor="booking-payment-method" className="block text-slate-400 mb-1">Payment Method *</label>
                <select
                  id="booking-payment-method"
                  required
                  value={enrollData.payment_method}
                  onChange={(e) => setEnrollData({ ...enrollData, payment_method: e.target.value })}
                  className="w-full bg-[#071322] border border-cyan-900/60 rounded-lg p-2 text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400"
                >
                  <option value={`Cash ${enrollData.currency}`}>Cash {enrollData.currency}</option>
                  <option value="Credit Card">Credit Card</option>
                  <option value="Bank Transfer">Bank Transfer</option>
                  <option value="InstaPay Egypt">InstaPay Egypt</option>
                </select>
              </div>
              {selectedSessionForEnroll.prerequisites?.trim() && (
                <label className="flex items-start gap-2 rounded-lg border border-amber-900/60 bg-amber-950/30 p-3 text-amber-100">
                  <input
                    type="checkbox"
                    checked={enrollData.prerequisites_verified}
                    onChange={(e) => setEnrollData({ ...enrollData, prerequisites_verified: e.target.checked })}
                    className="mt-0.5 h-4 w-4 accent-cyan-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400"
                  />
                  <span>Prerequisites reviewed and verified as met: {selectedSessionForEnroll.prerequisites}</span>
                </label>
              )}
              <div>
                <label htmlFor="booking-assigned-buoy" className="block text-slate-400 mb-1">Assigned Buoy *</label>
                <select
                  id="booking-assigned-buoy"
                  required
                  value={enrollData.assigned_buoy}
                  onChange={(e) => setEnrollData({ ...enrollData, assigned_buoy: e.target.value })}
                  className="w-full bg-[#071322] border border-cyan-900/60 rounded-lg p-2 text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400"
                >
                  <option value="">Select a buoy</option>
                  {Array.from({ length: Math.max(0, selectedSessionForEnroll.buoy_count || 0) }, (_, index) => (
                    <option key={index + 1} value={index + 1}>Buoy {index + 1}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-slate-400 mb-1">Notes / Gear Requirements</label>
                <input
                  type="text"
                  value={enrollData.notes}
                  onChange={(e) => setEnrollData({ ...enrollData, notes: e.target.value })}
                  className="w-full bg-[#071322] border border-cyan-900/60 rounded-lg p-2 text-white focus:outline-none focus:border-cyan-400"
                />
              </div>

              <div className="p-3 rounded-lg bg-[#071322] border border-cyan-950 text-slate-400 text-[11px]">
                A booking cannot be confirmed without a valid waiver, medical clearance, sufficient recorded deposit, verified prerequisites (when required), and an explicit buoy assignment within the configured per-buoy limit. Ras Mohamed reservations remain pending until the configured participant minimum is met.
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-cyan-900/50">
                <button
                  type="button"
                  onClick={() => setIsEnrollModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-[#071322] font-semibold cursor-pointer shadow-md"
                >
                  {submitting ? 'Recording...' : 'Record Deposit & Enroll'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
