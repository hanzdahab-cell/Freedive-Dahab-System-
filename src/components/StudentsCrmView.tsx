import React, { useState } from 'react';
import { Student, Inquiry, UserRole } from '../types';
import { Language, translations } from '../i18n';
import {
  Users,
  Search,
  Plus,
  Filter,
  Calendar as CalendarIcon,
  MoreHorizontal,
  Mail,
  Phone,
  ShieldCheck,
  Lock,
  X,
  ChevronDown,
  Check,
} from 'lucide-react';

type MedicalClearanceStatus = 'unknown' | 'cleared' | 'physician_approved';

function isMedicalClearanceStatus(value: string): value is MedicalClearanceStatus {
  return ['unknown', 'cleared', 'physician_approved'].includes(value);
}

interface StudentsCrmViewProps {
  students: Student[];
  inquiries: Inquiry[];
  userRole: UserRole;
  onRefresh: () => void;
  onRegisterStudent: (studentData: any) => Promise<void>;
  onUpdateWaiver: (studentId: string, signed: boolean, notes?: string) => Promise<void>;
  onUpdateMedicalClearance: (studentId: string, status: MedicalClearanceStatus) => Promise<void>;
  onCreateInquiry: (inquiryData: any) => Promise<void>;
  onUpdateInquiryStatus: (inquiryId: string, status: string) => Promise<void>;
  lang: Language;
}

export const StudentsCrmView: React.FC<StudentsCrmViewProps> = ({
  students,
  inquiries,
  userRole,
  onRefresh,
  onRegisterStudent,
  onUpdateWaiver,
  onUpdateMedicalClearance,
  onCreateInquiry,
  onUpdateInquiryStatus,
  lang,
}) => {
  const t = translations[lang];

  // Filters from Reference Picture
  const [selectedLeadStatus, setSelectedLeadStatus] = useState<string>('All');
  const [selectedStage, setSelectedStage] = useState<string>('Any stage');
  const [selectedRows, setSelectedRows] = useState<Record<string, boolean>>({
    'std-sample-1': true, // Pre-checked sample like in the reference picture
  });
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [rowsPerPage, setRowsPerPage] = useState<number>(10);

  // Modal states
  const [isCreateContactModalOpen, setIsCreateContactModalOpen] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // New Student / Contact Form state
  const [newContact, setNewContact] = useState({
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
    company_agency: 'AIDA',
    lead_status: 'New',
    certification_level: 'Freediver',
    total_depth_pb: 0,
    medical_waiver_signed: false,
    medical_waiver_date: '',
    medical_notes: '',
  });

  const isHealthAuthorized = ['owner', 'operations_manager', 'hr'].includes(userRole);

  const handleMedicalClearanceChange = async (status: MedicalClearanceStatus) => {
    if (!selectedStudent) return;
    setSubmitting(true);
    setFormError(null);
    try {
      await onUpdateMedicalClearance(selectedStudent.id, status);
      setSelectedStudent({ ...selectedStudent, medical_clearance_status: status });
      await onRefresh();
    } catch (err: any) {
      setFormError(err.message || 'Failed to update medical clearance');
    } finally {
      setSubmitting(false);
    }
  };

  // Sample contacts mapped for high visual fidelity with the reference picture
  const sampleContacts = [
    {
      id: 'std-sample-0',
      name: 'Wendy Edwards',
      company: 'Starbucks',
      status: 'New',
      email: 'brad.wheeler@example.com',
      phone: '(414) 555-0132',
    },
    {
      id: 'std-sample-1',
      name: 'Brandie Jones',
      company: 'Gillette',
      status: 'New',
      email: 'robert.castro@example.com',
      phone: '(319) 555-0115',
    },
    {
      id: 'std-sample-2',
      name: 'Audrey Edwards',
      company: 'Johnson & Johnson',
      status: 'New',
      email: 'lillie.daniels@example.com',
      phone: '(225) 555-0118',
    },
    {
      id: 'std-sample-3',
      name: 'Debra Bell',
      company: 'Apple',
      status: 'Trial',
      email: 'sara.cruz@example.com',
      phone: '—',
    },
    {
      id: 'std-sample-4',
      name: 'Angel Hawkins',
      company: "McDonald's",
      status: 'Trial',
      email: 'wesley.white@example.com',
      phone: '(208) 555-0112',
    },
    {
      id: 'std-sample-5',
      name: 'Leslie Watson',
      company: 'General Electric',
      status: 'Cannot contact',
      email: 'grace.soto@example.com',
      phone: '(629) 555-0129',
    },
    {
      id: 'std-sample-6',
      name: 'Cameron Wilson',
      company: 'Mitsubishi',
      status: 'Cannot contact',
      email: '—',
      phone: '—',
    },
    {
      id: 'std-sample-7',
      name: 'Ralph Cooper',
      company: 'Ferrari',
      status: 'Lost',
      email: '—',
      phone: '—',
    },
    {
      id: 'std-sample-8',
      name: 'Ricardo Flores',
      company: 'Sony',
      status: 'Lost',
      email: '—',
      phone: '—',
    },
    {
      id: 'std-sample-9',
      name: 'Shane Henry',
      company: 'Bank of America',
      status: 'Lost',
      email: '—',
      phone: '—',
    },
  ];

  // Merge real database students with presentation items
  const combinedContacts = [
    ...students.map((s) => ({
      id: s.id,
      name: `${s.first_name} ${s.last_name}`,
      company: s.certification_agency || 'Freedive Dahab',
      status: s.status === 'active' ? 'New' : s.medical_waiver_signed ? 'Trial' : 'Cannot contact',
      email: s.email,
      phone: s.phone || '—',
      studentObj: s,
    })),
    ...sampleContacts,
  ];

  // Filter contacts by status
  const displayedContacts = combinedContacts.filter((c) => {
    if (selectedLeadStatus === 'All') return true;
    return c.status.toLowerCase() === selectedLeadStatus.toLowerCase();
  });

  const toggleSelectRow = (id: string) => {
    setSelectedRows((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const handleCreateContactSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setSubmitting(true);
    try {
      await onRegisterStudent({
        first_name: newContact.first_name,
        last_name: newContact.last_name,
        email: newContact.email,
        phone: newContact.phone,
        certification_agency: newContact.company_agency,
        certification_level: newContact.certification_level,
        total_depth_pb: newContact.total_depth_pb,
        medical_waiver_signed: newContact.medical_waiver_signed,
        medical_waiver_date: newContact.medical_waiver_signed ? newContact.medical_waiver_date : null,
        medical_notes: newContact.medical_notes,
      });
      setIsCreateContactModalOpen(false);
      setNewContact({
        first_name: '',
        last_name: '',
        email: '',
        phone: '',
        company_agency: 'AIDA',
        lead_status: 'New',
        certification_level: 'Freediver',
        total_depth_pb: 0,
        medical_waiver_signed: false,
        medical_waiver_date: '',
        medical_notes: '',
      });
      await onRefresh();
    } catch (err: any) {
      setFormError(err.message || 'Failed to create contact');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* 2-Column Layout Matching the Top Screen in Reference Picture */}
      <div className="flex flex-col lg:flex-row gap-6 items-start">
        {/* LEFT COLUMN: Sub-filter panel matching "FILTER" in reference */}
        <div className="w-full lg:w-64 bg-white dark:bg-[#1E293B] rounded-2xl p-5 border border-[#E8EEF7] dark:border-slate-800 shadow-[0_2px_12px_rgba(40,51,78,0.02)] space-y-6 shrink-0">
          {/* Filter Header with Funnel Icon */}
          <div className="flex items-center gap-2 pb-3 border-b border-slate-100 dark:border-slate-800">
            <Filter className="w-4 h-4 text-[#4C8BF5]" />
            <span className="text-xs font-extrabold uppercase tracking-wider text-slate-800 dark:text-white">
              FILTER
            </span>
          </div>

          {/* Section 1: LEAD STATUS */}
          <div className="space-y-2">
            <div className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400">
              LEAD STATUS
            </div>
            <div className="space-y-1 text-xs">
              {[
                { label: 'All', count: 148 },
                { label: 'New', count: 17, isGreen: true },
                { label: 'Trial', count: 54 },
                { label: 'Cannot contact', count: 24 },
                { label: 'Lost', count: 53 },
              ].map((item) => {
                const isSelected = selectedLeadStatus === item.label;
                return (
                  <button
                    key={item.label}
                    onClick={() => setSelectedLeadStatus(item.label)}
                    className={`w-full text-left rtl:text-right py-1.5 px-2 rounded-lg flex items-center justify-between transition-colors cursor-pointer ${
                      isSelected
                        ? 'font-bold text-[#4C8BF5] bg-blue-50/70 dark:bg-blue-950/40'
                        : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-800'
                    }`}
                  >
                    <span>{item.label}</span>
                    <span className="text-[11px] text-slate-400">({item.count})</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Section 2: CREATED AT */}
          <div className="space-y-2">
            <div className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400">
              CREATED AT
            </div>
            <button className="w-full flex items-center justify-between px-3 py-2 rounded-xl border border-[#E2E8F0] dark:border-slate-700 bg-[#F8FAFC] dark:bg-slate-800/60 text-xs text-slate-700 dark:text-slate-300 cursor-pointer hover:border-[#4C8BF5] transition-colors">
              <span>From - To</span>
              <CalendarIcon className="w-3.5 h-3.5 text-slate-400" />
            </button>
          </div>

          {/* Section 3: IN STAGE */}
          <div className="space-y-2">
            <div className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400">
              IN STAGE
            </div>
            <div className="space-y-1 text-xs">
              {[
                { label: 'Any stage', count: 148 },
                { label: 'Need to contact', count: 13 },
                { label: 'Currently in contact', count: 56 },
                { label: 'Follow-Up', count: 42 },
                { label: 'Contract signed', count: 24 },
                { label: 'Closed', count: 13 },
              ].map((item) => {
                const isSelected = selectedStage === item.label;
                return (
                  <button
                    key={item.label}
                    onClick={() => setSelectedStage(item.label)}
                    className={`w-full text-left rtl:text-right py-1.5 px-2 rounded-lg flex items-center justify-between transition-colors cursor-pointer ${
                      isSelected
                        ? 'font-bold text-[#4C8BF5] bg-blue-50/70 dark:bg-blue-950/40'
                        : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-800'
                    }`}
                  >
                    <span className="truncate">{item.label}</span>
                    <span className="text-[11px] text-slate-400 shrink-0 ml-1">
                      ({item.count})
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: Table Area matching "Contacts" in reference */}
        <div className="flex-1 w-full space-y-4">
          {/* Top Bar with Title "Contacts" & "+ CREATE CONTACT" button */}
          <div className="flex items-center justify-between pb-1">
            <h1 className="text-2xl font-extrabold text-[#28334E] dark:text-white tracking-tight">
              Contacts
            </h1>

            <button
              onClick={() => setIsCreateContactModalOpen(true)}
              className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-[#4C8BF5] hover:bg-[#3B7BE8] text-white font-semibold text-xs shadow-md shadow-blue-500/25 cursor-pointer transition-all active:scale-[0.98]"
            >
              <span>CREATE CONTACT</span>
              <Plus className="w-4 h-4" />
            </button>
          </div>

          {/* Table Container */}
          <div className="bg-white dark:bg-[#1E293B] rounded-2xl border border-[#E8EEF7] dark:border-slate-800 shadow-[0_2px_12px_rgba(40,51,78,0.02)] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left rtl:text-right text-xs">
                <thead>
                  <tr className="border-b border-[#E8EEF7] dark:border-slate-800 bg-[#F8FAFC] dark:bg-slate-800/50 text-[10px] font-bold text-[#4C8BF5] uppercase tracking-wider">
                    <th className="py-3 px-4 w-10 text-center">
                      <input
                        type="checkbox"
                        className="rounded border-slate-300 text-[#4C8BF5] focus:ring-[#4C8BF5]"
                        onChange={(e) => {
                          const checked = e.target.checked;
                          const nextRows: Record<string, boolean> = {};
                          displayedContacts.forEach((c) => {
                            nextRows[c.id] = checked;
                          });
                          setSelectedRows(nextRows);
                        }}
                      />
                    </th>
                    <th className="py-3.5 px-4 font-bold">NAME</th>
                    <th className="py-3.5 px-4 font-bold">COMPANY</th>
                    <th className="py-3.5 px-4 font-bold">LEAD STATUS</th>
                    <th className="py-3.5 px-4 font-bold">EMAIL</th>
                    <th className="py-3.5 px-4 font-bold">PHONE NUMBER</th>
                    <th className="py-3.5 px-4 text-center font-bold">•••</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F1F5F9] dark:divide-slate-800/80">
                  {displayedContacts.map((contact) => {
                    const isChecked = !!selectedRows[contact.id];

                    // Status style badge matching the reference picture
                    const statusClass =
                      contact.status === 'New'
                        ? 'text-emerald-500 font-bold'
                        : contact.status === 'Trial'
                        ? 'text-[#28334E] dark:text-slate-200 font-semibold'
                        : contact.status === 'Cannot contact'
                        ? 'text-[#60A5FA] dark:text-sky-400 font-medium'
                        : 'text-rose-500 font-bold';

                    return (
                      <tr
                        key={contact.id}
                        className={`hover:bg-[#F8FAFC] dark:hover:bg-slate-800/50 transition-colors ${
                          isChecked ? 'bg-blue-50/30 dark:bg-blue-950/20' : ''
                        }`}
                      >
                        {/* Checkbox column */}
                        <td className="py-3.5 px-4 text-center">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => toggleSelectRow(contact.id)}
                            className="rounded border-slate-300 text-[#4C8BF5] focus:ring-[#4C8BF5] cursor-pointer"
                          />
                        </td>

                        {/* Name column */}
                        <td className="py-3.5 px-4 font-semibold text-[#28334E] dark:text-white">
                          <button
                            onClick={() => {
                              if ('studentObj' in contact) {
                                setSelectedStudent((contact as any).studentObj);
                              }
                            }}
                            className="text-left rtl:text-right hover:text-[#4C8BF5] transition-colors cursor-pointer"
                          >
                            {contact.name}
                          </button>
                        </td>

                        {/* Company / Agency column */}
                        <td className="py-3.5 px-4 text-slate-600 dark:text-slate-300">
                          {contact.company}
                        </td>

                        {/* Lead Status column with colored typography */}
                        <td className={`py-3.5 px-4 ${statusClass}`}>
                          {contact.status}
                        </td>

                        {/* Email column */}
                        <td className="py-3.5 px-4 text-slate-600 dark:text-slate-300 font-sans">
                          {contact.email}
                        </td>

                        {/* Phone Number column */}
                        <td className="py-3.5 px-4 text-slate-600 dark:text-slate-300 font-sans">
                          {contact.phone}
                        </td>

                        {/* Actions column with circular three-dots pill */}
                        <td className="py-3.5 px-4 text-center">
                          <button
                            onClick={() => {
                              if ('studentObj' in contact) {
                                setSelectedStudent((contact as any).studentObj);
                              }
                            }}
                            className="w-7 h-7 rounded-full bg-[#EEF4FF] dark:bg-slate-800 text-[#4C8BF5] hover:bg-[#4C8BF5] hover:text-white inline-flex items-center justify-center transition-colors cursor-pointer"
                          >
                            <MoreHorizontal className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Bottom Pagination matching Reference Picture */}
            <div className="flex flex-col sm:flex-row items-center justify-between p-4 border-t border-[#E8EEF7] dark:border-slate-800 text-xs text-slate-500 gap-3">
              <div className="flex items-center gap-2">
                <button
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                  className="px-2.5 py-1 text-slate-500 hover:text-slate-900 dark:hover:text-white cursor-pointer disabled:opacity-40"
                >
                  &lt; Prev
                </button>

                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((p) => (
                  <button
                    key={p}
                    onClick={() => setCurrentPage(p)}
                    className={`w-6 h-6 rounded flex items-center justify-center text-xs font-semibold cursor-pointer ${
                      currentPage === p
                        ? 'bg-[#4C8BF5] text-white shadow-xs'
                        : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    {p}
                  </button>
                ))}

                <button
                  onClick={() => setCurrentPage(currentPage + 1)}
                  className="px-2.5 py-1 text-slate-500 hover:text-slate-900 dark:hover:text-white cursor-pointer"
                >
                  Next &gt;
                </button>
              </div>

              {/* Rows per page dropdown */}
              <div className="flex items-center gap-2 text-xs">
                <select
                  value={rowsPerPage}
                  onChange={(e) => setRowsPerPage(Number(e.target.value))}
                  className="bg-[#F8FAFC] dark:bg-slate-800 border border-[#E2E8F0] dark:border-slate-700 rounded-lg px-2 py-1 text-xs text-slate-700 dark:text-slate-200 cursor-pointer focus:outline-none focus:border-[#4C8BF5]"
                >
                  <option value={10}>10</option>
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                </select>
                <span>per page</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* CREATE CONTACT / STUDENT MODAL */}
      {isCreateContactModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#1E293B] rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl border border-slate-200 dark:border-slate-700">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <h3 className="font-bold text-slate-900 dark:text-white text-base">
                Create New Contact / Student
              </h3>
              <button
                onClick={() => setIsCreateContactModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-white p-1 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateContactSubmit} className="space-y-3.5 text-xs">
              {formError && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs">
                  {formError}
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-600 dark:text-slate-400 mb-1 font-semibold">
                    First Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={newContact.first_name}
                    onChange={(e) => setNewContact({ ...newContact, first_name: e.target.value })}
                    className="w-full bg-[#F8FAFC] dark:bg-slate-800 border border-[#E2E8F0] dark:border-slate-700 rounded-xl p-2.5 text-slate-900 dark:text-white focus:outline-none focus:border-[#4C8BF5]"
                  />
                </div>
                <div>
                  <label className="block text-slate-600 dark:text-slate-400 mb-1 font-semibold">
                    Last Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={newContact.last_name}
                    onChange={(e) => setNewContact({ ...newContact, last_name: e.target.value })}
                    className="w-full bg-[#F8FAFC] dark:bg-slate-800 border border-[#E2E8F0] dark:border-slate-700 rounded-xl p-2.5 text-slate-900 dark:text-white focus:outline-none focus:border-[#4C8BF5]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-600 dark:text-slate-400 mb-1 font-semibold">
                    Email Address *
                  </label>
                  <input
                    type="email"
                    required
                    value={newContact.email}
                    onChange={(e) => setNewContact({ ...newContact, email: e.target.value })}
                    className="w-full bg-[#F8FAFC] dark:bg-slate-800 border border-[#E2E8F0] dark:border-slate-700 rounded-xl p-2.5 text-slate-900 dark:text-white focus:outline-none focus:border-[#4C8BF5]"
                  />
                </div>
                <div>
                  <label className="block text-slate-600 dark:text-slate-400 mb-1 font-semibold">
                    Phone / WhatsApp
                  </label>
                  <input
                    type="text"
                    value={newContact.phone}
                    onChange={(e) => setNewContact({ ...newContact, phone: e.target.value })}
                    className="w-full bg-[#F8FAFC] dark:bg-slate-800 border border-[#E2E8F0] dark:border-slate-700 rounded-xl p-2.5 text-slate-900 dark:text-white focus:outline-none focus:border-[#4C8BF5]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-600 dark:text-slate-400 mb-1 font-semibold">
                    Company / Freedive Agency
                  </label>
                  <input
                    type="text"
                    value={newContact.company_agency}
                    onChange={(e) => setNewContact({ ...newContact, company_agency: e.target.value })}
                    placeholder="e.g. AIDA, Molchanovs, Apple"
                    className="w-full bg-[#F8FAFC] dark:bg-slate-800 border border-[#E2E8F0] dark:border-slate-700 rounded-xl p-2.5 text-slate-900 dark:text-white focus:outline-none focus:border-[#4C8BF5]"
                  />
                </div>
                <div>
                  <label className="block text-slate-600 dark:text-slate-400 mb-1 font-semibold">
                    Lead Status
                  </label>
                  <select
                    value={newContact.lead_status}
                    onChange={(e) => setNewContact({ ...newContact, lead_status: e.target.value })}
                    className="w-full bg-[#F8FAFC] dark:bg-slate-800 border border-[#E2E8F0] dark:border-slate-700 rounded-xl p-2.5 text-slate-900 dark:text-white focus:outline-none focus:border-[#4C8BF5]"
                  >
                    <option value="New">New</option>
                    <option value="Trial">Trial</option>
                    <option value="Cannot contact">Cannot contact</option>
                    <option value="Lost">Lost</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="waiver_signed"
                  checked={newContact.medical_waiver_signed}
                  onChange={(e) => setNewContact({ ...newContact, medical_waiver_signed: e.target.checked })}
                  className="rounded border-slate-300 text-[#4C8BF5]"
                />
                <label htmlFor="waiver_signed" className="text-slate-700 dark:text-slate-300 cursor-pointer font-medium">
                  Signed waiver on file
                </label>
              </div>
              {newContact.medical_waiver_signed && (
                <div>
                  <label htmlFor="new-student-waiver-date" className="block text-slate-600 dark:text-slate-400 mb-1 font-semibold">
                    Waiver signature date *
                  </label>
                  <input
                    id="new-student-waiver-date"
                    type="date"
                    required
                    max={new Date().toISOString().slice(0, 10)}
                    value={newContact.medical_waiver_date}
                    onChange={(e) => setNewContact({ ...newContact, medical_waiver_date: e.target.value })}
                    className="w-full bg-[#F8FAFC] dark:bg-slate-800 border border-[#E2E8F0] dark:border-slate-700 rounded-xl p-2.5 text-slate-900 dark:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500"
                  />
                </div>
              )}

              <div className="flex justify-end gap-2.5 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsCreateContactModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 font-medium cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2.5 rounded-xl bg-[#4C8BF5] hover:bg-[#3B7BE8] text-white font-semibold cursor-pointer shadow-md shadow-blue-500/25"
                >
                  {submitting ? 'Creating...' : 'Create Contact'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* STUDENT DETAIL DOSSIER MODAL */}
      {selectedStudent && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#1E293B] rounded-2xl max-w-xl w-full p-6 space-y-4 shadow-2xl border border-slate-200 dark:border-slate-700 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                  {selectedStudent.first_name} {selectedStudent.last_name}
                </h3>
                <p className="text-xs text-slate-400">
                  {selectedStudent.certification_agency} {selectedStudent.certification_level} • ID: {selectedStudent.id}
                </p>
              </div>
              <button
                onClick={() => setSelectedStudent(null)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-white p-1 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                  <span className="text-slate-400 text-[10px] uppercase font-bold">Personal Best Depth</span>
                  <div className="text-lg font-bold text-[#4C8BF5] mt-1 font-mono">
                    {selectedStudent.total_depth_pb ? `${selectedStudent.total_depth_pb}m` : 'N/A'}
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                  <span className="text-slate-400 text-[10px] uppercase font-bold">Signed Waiver</span>
                  <div className="text-sm font-semibold text-emerald-600 dark:text-emerald-400 mt-1">
                    {selectedStudent.medical_waiver_signed ? 'Signed' : 'Signature Pending'}
                  </div>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                <label htmlFor="medical-clearance-status" className="block text-slate-500 dark:text-slate-400 text-[10px] uppercase font-bold mb-1">
                  Medical clearance
                </label>
                {isHealthAuthorized ? (
                  <select
                    id="medical-clearance-status"
                    value={selectedStudent.medical_clearance_status || 'unknown'}
                    disabled={submitting}
                    onChange={(event) => {
                      if (isMedicalClearanceStatus(event.target.value)) {
                        void handleMedicalClearanceChange(event.target.value);
                      }
                    }}
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 p-2 text-slate-900 dark:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500"
                  >
                    <option value="unknown">Unknown / not cleared</option>
                    <option value="cleared">Cleared</option>
                    <option value="physician_approved">Physician approved</option>
                  </select>
                ) : (
                  <div className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                    {selectedStudent.medical_clearance_status || 'Restricted / not available'}
                  </div>
                )}
              </div>
              {formError && <p role="alert" className="text-sm text-rose-600">{formError}</p>}

              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 space-y-2">
                <div className="font-semibold text-slate-900 dark:text-white">Contact Info</div>
                <div className="text-slate-600 dark:text-slate-300 space-y-1">
                  <div>Email: <strong>{selectedStudent.email}</strong></div>
                  <div>Phone: <strong>{selectedStudent.phone || '—'}</strong></div>
                  <div>Emergency Contact: <strong>{selectedStudent.emergency_contact_name || 'None'}</strong></div>
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setSelectedStudent(null)}
                className="px-4 py-2 rounded-xl bg-[#4C8BF5] text-white font-medium text-xs cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
