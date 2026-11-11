import React, { useEffect, useRef, useState } from 'react';
import {
  CustomerRequest,
  CustomerRequestInput,
  Expense,
  Invoice,
  InvoiceUpdateInput,
  PaymentInput,
  Student,
  UserRole,
} from '../types';
import { Language, translations } from '../i18n';
import {
  Receipt,
  DollarSign,
  Plus,
  CreditCard,
  Search,
  CheckCircle,
  AlertCircle,
  ArrowUpRight,
  ArrowDownRight,
  Lock,
  X,
  FileText,
} from 'lucide-react';
import { InvoiceBillDialog } from './InvoiceBillDialog';

type RequestCategory = Exclude<CustomerRequestInput['items'][number]['category'], 'gear_rental'>;

interface RequestCatalogItem {
  description: string;
  price: number;
  unit?: string;
}

interface RequestDraftItem {
  category: RequestCategory;
  description: string;
  quantity: number;
  unit_price: number;
}

const requestCatalog: Record<RequestCategory, RequestCatalogItem[]> = {
  course: [
    { description: 'SSI Basic Freediver', price: 150 },
    { description: 'SSI Freediver', price: 310 },
    { description: 'SSI Advanced Freediver', price: 360 },
    { description: 'SSI Performance Freediver', price: 480 },
  ],
  package: [
    { description: 'Combo Week — Beginner + Advanced, diving only', price: 690 },
    { description: 'Combo Week — Beginner + Advanced, 10 nights low season', price: 870 },
    { description: 'Combo Week — Beginner + Advanced, 10 nights high season', price: 920 },
    { description: 'Beginner Week — diving only', price: 450 },
    { description: 'Beginner Week — 8 nights, low season', price: 595 },
    { description: 'Beginner Week — 8 nights, high season', price: 635 },
    { description: 'Training Week — diving only', price: 300 },
    { description: 'Training Week — 8 nights, low season', price: 445 },
    { description: 'Training Week — 8 nights, high season', price: 485 },
    { description: 'Underwater Photography Week', price: 580 },
    { description: 'Equalisation Intensive', price: 380 },
    { description: 'Instructor Pathway', price: 2945 },
    { description: 'Master Program — confirm option in special notes', price: 0 },
  ],
  accommodation: [
    { description: 'Lighthouse Room', price: 0, unit: 'night' },
    { description: 'Blue Hole Room', price: 0, unit: 'night' },
    { description: 'Eal Garden Room', price: 0, unit: 'night' },
    { description: 'Islands Room', price: 0, unit: 'night' },
  ],
  activity: [
    { description: 'Blue Hole guided fun dive', price: 0 },
    { description: 'Ras Mohamed dive trip', price: 0 },
  ],
  workshop: [
    { description: 'Equalisation workshop', price: 0 },
    { description: 'Breathing workshop', price: 0 },
  ],
  training: [
    { description: 'Group training session', price: 0, unit: 'session' },
    { description: 'Private training session', price: 0, unit: 'session' },
    { description: 'Training Techniques', price: 160, unit: 'session' },
    { description: 'Monofin class', price: 125, unit: 'session' },
  ],
  shop: [
    { description: 'Freedive Dahab Nose Clip', price: 0 },
    { description: 'Freedive Dahab T-shirt', price: 0 },
    { description: 'Freedive Dahab Poncho', price: 0 },
  ],
  other: [{ description: 'Other customer request', price: 0 }],
};

interface FinanceViewProps {
  invoices: Invoice[];
  customerRequests: CustomerRequest[];
  expenses: Expense[];
  students: Student[];
  userRole: UserRole;
  onRefresh: () => void;
  onCreateInvoice: (invoiceData: any) => Promise<void>;
  onUpdateInvoice: (invoiceId: string, changes: InvoiceUpdateInput) => Promise<void>;
  onRecordPayment: (invoiceId: string, paymentData: any) => Promise<void>;
  onCreateExpense: (expenseData: any) => Promise<void>;
  onCreateCustomerRequest: (data: CustomerRequestInput) => Promise<void>;
  onRecordCustomerRequestPayment: (requestId: string, paymentData: PaymentInput) => Promise<void>;
  lang: Language;
}

export const FinanceView: React.FC<FinanceViewProps> = ({
  invoices,
  customerRequests,
  expenses,
  students,
  userRole,
  onRefresh,
  onCreateInvoice,
  onUpdateInvoice,
  onRecordPayment,
  onCreateExpense,
  onCreateCustomerRequest,
  onRecordCustomerRequestPayment,
  lang,
}) => {
  const t = translations[lang];
  const canAccessFinance = ['owner', 'finance'].includes(userRole);
  const canAccessCustomerRequests = canAccessFinance || userRole === 'front_desk_crm';
  const frontDeskOnly = userRole === 'front_desk_crm';

  const [activeTab, setActiveTab] = useState<'requests' | 'income' | 'expenses' | 'invoices'>(
    frontDeskOnly ? 'requests' : 'income',
  );
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  // Modals
  const [isInvoiceModalOpen, setIsInvoiceModalOpen] = useState(false);
  const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false);
  const [isRequestModalOpen, setIsRequestModalOpen] = useState(false);
  const [selectedInvoiceForPayment, setSelectedInvoiceForPayment] = useState<Invoice | null>(null);
  const [paymentRequestId, setPaymentRequestId] = useState<string | null>(null);
  const [selectedBill, setSelectedBill] = useState<{ invoice: Invoice; requestId?: string } | null>(null);
  const requestDialogRef = useRef<HTMLDivElement>(null);
  const requestButtonRef = useRef<HTMLButtonElement>(null);
  const paymentDialogRef = useRef<HTMLDivElement>(null);
  const paymentReturnFocusRef = useRef<HTMLElement | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // New invoice state
  const [newInvoice, setNewInvoice] = useState({
    student_id: students[0]?.id || '',
    currency: 'EUR',
    tax_rate: 0,
    items: [{
      category: 'course' as NonNullable<Invoice['items']>[number]['category'],
      description: 'AIDA 2 Freediver Course Tuition',
      quantity: 1,
      unit_price: 320,
    }],
    due_date: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
    notes: 'Payment required prior to ocean day 1.',
  });

  // Payment state
  const [paymentData, setPaymentData] = useState({
    amount: 0,
    currency: 'EUR',
    payment_method: 'Cash EUR',
    payment_date: new Date().toISOString().slice(0, 10),
    reference_number: '',
    notes: '',
  });

  const [newCustomerRequest, setNewCustomerRequest] = useState({
    student_id: students[0]?.id || '',
    currency: 'EUR',
    due_date: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
    special_request: '',
    initial_payment: {
      amount: 0,
      payment_method: 'Cash EUR',
      payment_date: new Date().toISOString().slice(0, 10),
      reference_number: '',
      notes: '',
    },
  });
  const [requestItems, setRequestItems] = useState<RequestDraftItem[]>([
    { category: 'course', description: 'SSI Freediver', quantity: 1, unit_price: 310 },
  ]);

  // New expense state
  const [newExpense, setNewExpense] = useState({
    category: 'Oxygen & Safety Gas',
    vendor_name: 'Dahab Medical Gases',
    amount: 3200,
    currency: 'EGP',
    expense_date: new Date().toISOString().slice(0, 10),
    description: 'Medical oxygen cylinders refill for emergency kits',
    receipt_ref: 'REC-' + Math.floor(1000 + Math.random() * 9000),
  });

  useEffect(() => {
    if (frontDeskOnly) setActiveTab('requests');
  }, [frontDeskOnly]);

  useEffect(() => {
    if (!newCustomerRequest.student_id && students[0]) {
      setNewCustomerRequest((current) => ({ ...current, student_id: students[0].id }));
    }
  }, [newCustomerRequest.student_id, students]);

  useEffect(() => {
    if (!isRequestModalOpen) return;
    const dialog = requestDialogRef.current;
    if (!dialog) return;
    const getFocusable = () => dialog.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled])',
    );
    getFocusable()[0]?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsRequestModalOpen(false);
        requestButtonRef.current?.focus();
      } else if (event.key === 'Tab') {
        const focusable = getFocusable();
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    dialog.addEventListener('keydown', handleKeyDown);
    return () => dialog.removeEventListener('keydown', handleKeyDown);
  }, [isRequestModalOpen]);

  useEffect(() => {
    if (!selectedInvoiceForPayment) return;
    const dialog = paymentDialogRef.current;
    if (!dialog) return;
    const getFocusable = () => dialog.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled])',
    );
    getFocusable()[0]?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setSelectedInvoiceForPayment(null);
        setPaymentRequestId(null);
      } else if (event.key === 'Tab') {
        const focusable = getFocusable();
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    dialog.addEventListener('keydown', handleKeyDown);
    return () => {
      dialog.removeEventListener('keydown', handleKeyDown);
      const returnTarget = paymentReturnFocusRef.current;
      paymentReturnFocusRef.current = null;
      window.requestAnimationFrame(() => {
        if (returnTarget?.isConnected) returnTarget.focus();
        else document.getElementById(`${activeTab === 'requests' ? 'finance-requests' : `finance-${activeTab}`}-tab`)?.focus();
      });
    };
  }, [activeTab, selectedInvoiceForPayment]);

  if (!canAccessCustomerRequests) {
    return (
      <div className="p-8 rounded-2xl bg-[#091728] border border-cyan-900/50 text-center max-w-xl mx-auto space-y-4 shadow-xl">
        <div className="w-12 h-12 rounded-full bg-rose-950/60 text-rose-400 border border-rose-800 flex items-center justify-center mx-auto">
          <Lock className="w-6 h-6" />
        </div>
        <h2 className="text-xl font-bold text-white">Access Denied: Financial Ledger</h2>
        <p className="text-xs text-slate-300 leading-relaxed">
          Your active role (<strong className="text-cyan-300 uppercase">{userRole.replace('_', ' ')}</strong>) is not authorized to inspect customer billing or financial records. Server-side security blocks all unauthorized requests to this endpoint.
        </p>
        <div className="p-3 rounded-lg bg-[#071322] border border-cyan-950 text-slate-400 text-[11px]">
          ℹ To evaluate this module, use the Role Access Simulator in the top header and switch to <strong>Center Owner</strong> or <strong>Finance Manager</strong>.
        </div>
      </div>
    );
  }

  // Financial aggregates
  const totalInvoicedEur = invoices.reduce((acc, inv) => acc + (inv.currency === 'EUR' ? inv.total_amount : 0), 0);
  const totalCollectedEur = invoices.reduce((acc, inv) => acc + (inv.currency === 'EUR' ? inv.paid_amount : 0), 0);
  const totalOutstandingEur = totalInvoicedEur - totalCollectedEur;
  const totalExpensesEgp = expenses.reduce((acc, exp) => acc + (exp.currency === 'EGP' ? exp.amount : 0), 0);
  const totalExpensesEur = expenses.reduce((acc, exp) => acc + (exp.currency === 'EUR' ? exp.amount : 0), 0);

  const dailyIncome = invoices.flatMap((invoice) =>
    (invoice.payments || [])
      .filter((payment) => payment.payment_date === selectedDate)
      .map((payment) => ({ ...payment, invoice })),
  );
  const dailyExpenses = expenses.filter((expense) => expense.expense_date === selectedDate);
  const dailyIncomeTotals = dailyIncome.reduce<Record<string, number>>((totals, payment) => {
    totals[payment.currency] = (totals[payment.currency] || 0) + payment.amount;
    return totals;
  }, {});
  const dailyExpenseTotals = dailyExpenses.reduce<Record<string, number>>((totals, expense) => {
    totals[expense.currency] = (totals[expense.currency] || 0) + expense.amount;
    return totals;
  }, {});

  const filteredInvoices = invoices.filter((inv) => {
    const matchesSearch =
      inv.invoice_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
      `${inv.first_name} ${inv.last_name}`.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'ALL' || inv.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const handleInvoiceSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setSubmitting(true);
    try {
      await onCreateInvoice(newInvoice);
      setIsInvoiceModalOpen(false);
      await onRefresh();
    } catch (err: any) {
      setFormError(err.message || 'Failed to create invoice');
    } finally {
      setSubmitting(false);
    }
  };

  const handlePaymentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedInvoiceForPayment) return;
    setFormError(null);
    setSubmitting(true);
    try {
      if (paymentRequestId) {
        await onRecordCustomerRequestPayment(paymentRequestId, paymentData);
      } else {
        await onRecordPayment(selectedInvoiceForPayment.id, paymentData);
      }
      setSelectedInvoiceForPayment(null);
      setPaymentRequestId(null);
      await onRefresh();
    } catch (err: any) {
      setFormError(err.message || 'Failed to record payment');
    } finally {
      setSubmitting(false);
    }
  };

  const requestTotal = requestItems.reduce((total, item) => total + item.quantity * item.unit_price, 0);
  const minimumRequestDeposit = Math.ceil(requestTotal * 0.3 * 100) / 100;

  const handleCustomerRequestSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!newCustomerRequest.student_id || requestItems.length === 0 || requestItems.some((item) => item.unit_price <= 0)) {
      setFormError('Choose a customer and enter a confirmed price for every request item.');
      return;
    }
    if (newCustomerRequest.initial_payment.amount < minimumRequestDeposit || newCustomerRequest.initial_payment.amount > requestTotal) {
      setFormError(`The deposit must be at least 30% (${newCustomerRequest.currency} ${minimumRequestDeposit}) and no more than the total bill.`);
      return;
    }

    setSubmitting(true);
    try {
      await onCreateCustomerRequest({
        ...newCustomerRequest,
        items: requestItems,
      });
      setIsRequestModalOpen(false);
      requestButtonRef.current?.focus();
      setNewCustomerRequest((current) => ({
        ...current,
        special_request: '',
        initial_payment: { ...current.initial_payment, amount: 0, reference_number: '', notes: '' },
      }));
      setRequestItems([{ category: 'course', description: 'SSI Freediver', quantity: 1, unit_price: 310 }]);
      await onRefresh();
    } catch (err: any) {
      setFormError(err.message || 'Failed to record customer request');
    } finally {
      setSubmitting(false);
    }
  };

  const handleExpenseSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setSubmitting(true);
    try {
      await onCreateExpense(newExpense);
      setIsExpenseModalOpen(false);
      await onRefresh();
    } catch (err: any) {
      setFormError(err.message || 'Failed to record expense');
    } finally {
      setSubmitting(false);
    }
  };

  const openPaymentModal = (inv: Invoice, requestId?: string) => {
    paymentReturnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setSelectedInvoiceForPayment(inv);
    setPaymentRequestId(requestId || null);
    const balance = inv.total_amount - inv.paid_amount;
    const cashMethod = inv.currency === 'EGP' ? 'Cash EGP' : inv.currency === 'USD' ? 'Cash USD' : 'Cash EUR';
    setPaymentData({
      amount: balance,
      currency: inv.currency,
      payment_method: cashMethod,
      payment_date: new Date().toISOString().slice(0, 10),
      reference_number: '',
      notes: `Payment for ${inv.items?.map((item) => item.description).join(', ') || inv.invoice_number}`,
    });
  };

  const closePaymentModal = () => {
    setSelectedInvoiceForPayment(null);
    setPaymentRequestId(null);
  };

  const getRequestId = (invoice: Invoice) =>
    customerRequests.find((request) => request.id === invoice.id)?.request_id;

  const openBill = (invoice: Invoice, requestId = getRequestId(invoice)) => {
    setSelectedBill({ invoice, requestId });
  };

  const handleBillSave = async (invoiceId: string, changes: InvoiceUpdateInput) => {
    await onUpdateInvoice(invoiceId, changes);
    setSelectedBill(null);
    await onRefresh();
  };

  const handleBillPayment = (invoice: Invoice, requestId?: string) => {
    setSelectedBill(null);
    openPaymentModal(invoice, requestId);
  };

  const updateRequestItem = (index: number, patch: Partial<RequestDraftItem>) => {
    setRequestItems((current) => current.map((item, itemIndex) => (
      itemIndex === index ? { ...item, ...patch } : item
    )));
  };

  const changeRequestItemCategory = (index: number, category: RequestCategory) => {
    const catalogItem = requestCatalog[category][0];
    updateRequestItem(index, {
      category,
      description: catalogItem.description,
      unit_price: newCustomerRequest.currency === 'EUR' ? catalogItem.price : 0,
    });
  };

  const changeRequestItemDescription = (index: number, description: string) => {
    const item = requestItems[index];
    const catalogItem = requestCatalog[item.category].find((entry) => entry.description === description);
    updateRequestItem(index, {
      description,
      unit_price: newCustomerRequest.currency === 'EUR' ? catalogItem?.price || 0 : 0,
    });
  };

  const changeRequestCurrency = (currency: string) => {
    const cashMethod = currency === 'EGP' ? 'Cash EGP' : currency === 'USD' ? 'Cash USD' : 'Cash EUR';
    setNewCustomerRequest((current) => ({
      ...current,
      currency,
      initial_payment: { ...current.initial_payment, payment_method: cashMethod },
    }));
    setRequestItems((current) => current.map((item) => {
      const catalogItem = requestCatalog[item.category].find((entry) => entry.description === item.description);
      return { ...item, unit_price: currency === 'EUR' ? catalogItem?.price || 0 : 0 };
    }));
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200 dark:border-slate-800">
        <div>
          <h2 className="text-xl font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
            <Receipt className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            <span>{frontDeskOnly ? 'Customer Requests' : 'Finance & Billing Ledger'}</span>
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {frontDeskOnly
              ? 'Record the confirmed request and deposit, then track the customer bill and later payments.'
              : 'Audit-tracked customer requests, invoices, payments, vendor expenses, and center cashflow.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2">
          <button
            ref={requestButtonRef}
            onClick={() => {
              setFormError(null);
              setIsRequestModalOpen(true);
            }}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#4C8BF5] hover:bg-[#3B7BE8] text-white font-semibold text-xs shadow-md shadow-blue-500/20 transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>New Customer Request</span>
          </button>
          {canAccessFinance && (
            <>
              <button
                onClick={() => setIsInvoiceModalOpen(true)}
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-white dark:bg-slate-800 text-slate-700 dark:text-cyan-200 border border-[#E8EEF7] dark:border-slate-700 text-xs font-semibold transition-all cursor-pointer shadow-xs hover:border-[#4C8BF5]"
              >
                <Plus className="w-4 h-4 text-[#4C8BF5]" />
                <span>New Invoice</span>
              </button>
              <button
                onClick={() => setIsExpenseModalOpen(true)}
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-white dark:bg-slate-800 text-slate-700 dark:text-cyan-200 border border-[#E8EEF7] dark:border-slate-700 text-xs font-semibold transition-all cursor-pointer shadow-xs hover:border-[#4C8BF5]"
              >
                <Plus className="w-4 h-4 text-[#4C8BF5]" />
                <span>Record Expense</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Financial Summary Cards */}
      {canAccessFinance && <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-5 rounded-2xl bg-white dark:bg-[#1E293B] border border-[#E8EEF7] dark:border-slate-800 shadow-[0_2px_12px_rgba(40,51,78,0.02)]">
          <span className="text-[10px] font-bold uppercase text-slate-400">Total Invoiced (EUR)</span>
          <div className="text-2xl font-extrabold text-[#28334E] dark:text-white mt-1 font-mono">
            €{totalInvoicedEur.toLocaleString()}
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">{invoices.length} invoices generated</div>
        </div>

        <div className="p-5 rounded-2xl bg-white dark:bg-[#1E293B] border border-emerald-100 dark:border-emerald-900/40 shadow-[0_2px_12px_rgba(40,51,78,0.02)]">
          <span className="text-[10px] font-bold uppercase text-emerald-600 dark:text-emerald-400">Collected Revenue</span>
          <div className="text-2xl font-extrabold text-emerald-600 dark:text-emerald-400 mt-1 font-mono">
            €{totalCollectedEur.toLocaleString()}
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">Settled via cash, cards & InstaPay</div>
        </div>

        <div className="p-5 rounded-2xl bg-white dark:bg-[#1E293B] border border-amber-100 dark:border-amber-900/40 shadow-[0_2px_12px_rgba(40,51,78,0.02)]">
          <span className="text-[10px] font-bold uppercase text-amber-600 dark:text-amber-400">Outstanding Receivable</span>
          <div className="text-2xl font-extrabold text-amber-600 dark:text-amber-400 mt-1 font-mono">
            €{totalOutstandingEur.toLocaleString()}
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">Awaiting customer payment</div>
        </div>

        <div className="p-5 rounded-2xl bg-white dark:bg-[#1E293B] border border-rose-100 dark:border-rose-900/40 shadow-[0_2px_12px_rgba(40,51,78,0.02)]">
          <span className="text-[10px] font-bold uppercase text-rose-600 dark:text-rose-400">Center Expenses</span>
          <div className="text-xl font-extrabold text-[#28334E] dark:text-white mt-1 font-mono">
            {totalExpensesEgp.toLocaleString()} EGP <span className="text-xs text-slate-400 font-normal">/ €{totalExpensesEur}</span>
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">Protectorate fees, O2, maintenance</div>
        </div>
      </div>}

      {/* Tab Switcher */}
      <div role="tablist" aria-label="Customer request and finance views" className="flex flex-wrap items-center gap-2 border-b border-[#E8EEF7] dark:border-slate-800 pb-2">
        <button
          type="button"
          role="tab"
          id="finance-requests-tab"
          aria-selected={activeTab === 'requests'}
          aria-controls="finance-requests-panel"
          onClick={() => setActiveTab('requests')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            activeTab === 'requests'
              ? 'bg-[#4C8BF5] text-white shadow-xs'
              : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:text-[#4C8BF5] border border-[#E8EEF7] dark:border-slate-700'
          }`}
        >
          Customer Requests ({customerRequests.length})
        </button>
        {canAccessFinance && <>
        <button
          type="button"
          role="tab"
          id="finance-income-tab"
          aria-selected={activeTab === 'income'}
          aria-controls="finance-income-panel"
          onClick={() => setActiveTab('income')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            activeTab === 'income'
              ? 'bg-[#4C8BF5] text-white shadow-xs'
              : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:text-[#4C8BF5] border border-[#E8EEF7] dark:border-slate-700'
          }`}
        >
          Daily Income ({dailyIncome.length})
        </button>
        <button
          type="button"
          role="tab"
          id="finance-expenses-tab"
          aria-selected={activeTab === 'expenses'}
          aria-controls="finance-expenses-panel"
          onClick={() => setActiveTab('expenses')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            activeTab === 'expenses'
              ? 'bg-[#4C8BF5] text-white shadow-xs'
              : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:text-[#4C8BF5] border border-[#E8EEF7] dark:border-slate-700'
          }`}
        >
          Daily Expenses ({dailyExpenses.length})
        </button>
        <button
          type="button"
          role="tab"
          id="finance-invoices-tab"
          aria-selected={activeTab === 'invoices'}
          aria-controls="finance-invoices-panel"
          onClick={() => setActiveTab('invoices')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            activeTab === 'invoices'
              ? 'bg-[#4C8BF5] text-white shadow-xs'
              : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:text-[#4C8BF5] border border-[#E8EEF7] dark:border-slate-700'
          }`}
        >
          Customer Invoices ({invoices.length})
        </button>
        </>}
      </div>

      {activeTab === 'requests' && (
        <section
          id="finance-requests-panel"
          role="tabpanel"
          aria-labelledby="finance-requests-tab"
          className="space-y-4"
        >
          <div>
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">Customer Requests & Bills</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Each request has its own invoice and payment history. New requests are saved with the deposit Gabriella records.
            </p>
          </div>
          <div className="bg-[#0a182a] border border-cyan-900/40 rounded-xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px] text-left text-xs text-slate-300">
                <thead className="bg-[#071424] text-cyan-400/90 font-semibold border-b border-cyan-900/50 uppercase tracking-wider text-[11px]">
                  <tr>
                    <th scope="col" className="py-3 px-4">Request / Bill</th>
                    <th scope="col" className="py-3 px-4">Customer</th>
                    <th scope="col" className="py-3 px-4">Requested items & notes</th>
                    <th scope="col" className="py-3 px-4">Payments</th>
                    <th scope="col" className="py-3 px-4">Total / balance</th>
                    <th scope="col" className="py-3 px-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-cyan-900/30">
                  {customerRequests.map((request) => {
                    const balance = Math.max(0, request.total_amount - request.paid_amount);
                    return (
                      <tr key={request.request_id} className="align-top hover:bg-[#0e213b]/60 transition-colors">
                        <td className="py-3 px-4 font-mono">
                          <div className="font-bold text-white">{request.request_number}</div>
                          <button
                            type="button"
                            onClick={() => openBill(request, request.request_id)}
                            className="mt-1 min-h-8 rounded px-1 text-left text-[10px] text-cyan-300 underline decoration-dotted underline-offset-2 hover:text-cyan-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300"
                          >
                            Open bill · {request.invoice_number}
                          </button>
                          <div className="text-[10px] text-slate-500">{request.issue_date}</div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-semibold text-white">{request.first_name} {request.last_name}</div>
                          <div className="text-[11px] text-slate-400">{request.student_email}</div>
                        </td>
                        <td className="py-3 px-4">
                          <ul className="space-y-1">
                            {(request.items || []).map((item) => (
                              <li key={item.id || item.description}>
                                <span className="text-cyan-200 capitalize">{item.category || 'other'}:</span> {item.description} × {item.quantity}
                              </li>
                            ))}
                          </ul>
                          {request.special_request && (
                            <p className="mt-2 max-w-xs whitespace-pre-wrap text-slate-400">{request.special_request}</p>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          {(request.payments || []).length > 0 ? (
                            <ul className="space-y-1">
                              {(request.payments || []).map((payment) => (
                                <li key={payment.id}>
                                  <span className="text-slate-400">{payment.payment_date} · {payment.payment_method}</span>
                                  <div className="font-mono text-emerald-300">{payment.currency} {payment.amount.toLocaleString()}</div>
                                </li>
                              ))}
                            </ul>
                          ) : <span className="text-rose-300">No payment recorded</span>}
                        </td>
                        <td className="py-3 px-4 font-mono">
                          <div className="font-bold text-white">{request.currency} {request.total_amount.toLocaleString()}</div>
                          <div className="text-emerald-300">Paid: {request.currency} {request.paid_amount.toLocaleString()}</div>
                          {balance > 0 && <div className="text-amber-300">Due: {request.currency} {balance.toLocaleString()}</div>}
                          <span className="mt-1 inline-block rounded-full border border-cyan-900 px-2 py-0.5 text-[10px] uppercase text-cyan-200">
                            {request.status.replace('_', ' ')}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right">
                          {balance > 0 ? (
                            <button
                              type="button"
                              onClick={() => openPaymentModal(request, request.request_id)}
                              className="min-h-8 rounded-lg bg-emerald-600 px-2.5 py-1 font-semibold text-white shadow-sm transition-colors hover:bg-emerald-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300"
                            >
                              + Record payment
                            </button>
                          ) : <span className="text-emerald-300">Settled</span>}
                        </td>
                      </tr>
                    );
                  })}
                  {customerRequests.length === 0 && (
                    <tr><td colSpan={6} className="py-8 text-center text-slate-500">Confirmed requests will appear here after the deposit is recorded.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      {canAccessFinance && activeTab === 'income' && (
        <section
          id="finance-income-panel"
          role="tabpanel"
          aria-labelledby="finance-income-tab"
          className="space-y-4"
        >
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
            <div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">Daily Income</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Recorded customer payments for the selected date.
              </p>
            </div>
            <div>
              <label htmlFor="daily-income-date" className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                Income date
              </label>
              <input
                id="daily-income-date"
                type="date"
                value={selectedDate}
                onChange={(event) => setSelectedDate(event.target.value)}
                className="min-h-10 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-sm text-slate-800 dark:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {Object.entries(dailyIncomeTotals).length > 0 ? Object.entries(dailyIncomeTotals).map(([currency, total]) => (
              <div key={currency} className="p-4 rounded-xl bg-white dark:bg-[#1E293B] border border-emerald-100 dark:border-emerald-900/40">
                <span className="text-[10px] font-bold uppercase text-emerald-700 dark:text-emerald-400">Income · {currency}</span>
                <div className="text-xl font-extrabold text-emerald-700 dark:text-emerald-300 mt-1 font-mono">
                  {currency} {total.toLocaleString()}
                </div>
              </div>
            )) : (
              <div className="sm:col-span-2 lg:col-span-4 p-4 rounded-xl bg-white dark:bg-[#1E293B] border border-[#E8EEF7] dark:border-slate-800 text-sm text-slate-500 dark:text-slate-400">
                No payments recorded for {selectedDate}.
              </div>
            )}
          </div>

          <div className="bg-[#0a182a] border border-cyan-900/40 rounded-xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-[#071424] text-cyan-400/90 font-semibold border-b border-cyan-900/50 uppercase tracking-wider text-[11px]">
                  <tr>
                    <th scope="col" className="py-3 px-4">Payment Date</th>
                    <th scope="col" className="py-3 px-4">Customer</th>
                    <th scope="col" className="py-3 px-4">Invoice / Request</th>
                    <th scope="col" className="py-3 px-4">Payment Method</th>
                    <th scope="col" className="py-3 px-4 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-cyan-900/30">
                  {dailyIncome.map((payment) => (
                    <tr key={payment.id} className="hover:bg-[#0e213b]/60 transition-colors">
                      <td className="py-3 px-4 text-slate-400">{payment.payment_date}</td>
                      <td className="py-3 px-4 font-semibold text-white">{payment.invoice.first_name} {payment.invoice.last_name}</td>
                      <td className="py-3 px-4 font-mono">
                        <button
                          type="button"
                          onClick={() => openBill(payment.invoice)}
                          className="min-h-8 rounded px-1 text-left text-cyan-300 underline decoration-dotted underline-offset-2 hover:text-cyan-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300"
                        >
                          {payment.invoice.invoice_number}
                        </button>
                        {payment.invoice.customer_request_number && (
                          <div className="text-[10px] text-cyan-300">{payment.invoice.customer_request_number}</div>
                        )}
                      </td>
                      <td className="py-3 px-4">{payment.payment_method}</td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-emerald-300">
                        {payment.currency} {payment.amount.toLocaleString()}
                      </td>
                    </tr>
                  ))}
                  {dailyIncome.length === 0 && (
                    <tr><td colSpan={5} className="py-8 text-center text-slate-500">Payments recorded on this date will appear here.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      {/* INVOICES TABLE */}
      {canAccessFinance && activeTab === 'invoices' && (
        <div id="finance-invoices-panel" role="tabpanel" aria-labelledby="finance-invoices-tab" className="space-y-4">
          <div className="flex flex-col sm:flex-row items-center gap-3 bg-[#0a182a] p-3 rounded-xl border border-cyan-900/40">
            <div className="relative flex-1 w-full">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search by invoice number or student name..."
                aria-label="Search invoices by invoice number or student name"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-[#071322] border border-cyan-900/50 rounded-lg pl-9 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300"
              />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-[#071322] border border-cyan-900/50 rounded-lg px-2.5 py-1.5 text-xs text-slate-300 focus:outline-none focus:border-cyan-400"
            >
              <option value="ALL">All Statuses</option>
              <option value="paid">Paid in Full</option>
              <option value="partially_paid">Partially Paid</option>
              <option value="issued">Issued / Unpaid</option>
              <option value="overdue">Overdue</option>
            </select>
          </div>

          <div className="bg-[#0a182a] border border-cyan-900/40 rounded-xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-[#071424] text-cyan-400/90 font-semibold border-b border-cyan-900/50 uppercase tracking-wider text-[11px]">
                  <tr>
                    <th scope="col" className="py-3 px-4">Invoice #</th>
                    <th scope="col" className="py-3 px-4">Student</th>
                    <th scope="col" className="py-3 px-4">Dates</th>
                    <th scope="col" className="py-3 px-4">Total Amount</th>
                    <th scope="col" className="py-3 px-4">Paid / Balance</th>
                    <th scope="col" className="py-3 px-4">Status</th>
                    <th scope="col" className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-cyan-900/30">
                  {filteredInvoices.map((inv) => {
                    const balance = inv.total_amount - inv.paid_amount;
                    return (
                      <tr key={inv.id} className="hover:bg-[#0e213b]/60 transition-colors">
                        <td className="py-3 px-4 font-mono font-bold text-white">
                          <button
                            type="button"
                            onClick={() => openBill(inv)}
                            className="min-h-8 rounded px-1 text-left text-cyan-300 underline decoration-dotted underline-offset-2 hover:text-cyan-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300"
                          >
                            {inv.invoice_number}
                          </button>
                          {inv.customer_request_number && (
                            <div className="text-[10px] font-normal text-cyan-300">{inv.customer_request_number}</div>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-semibold text-white">
                            {inv.first_name} {inv.last_name}
                          </div>
                          <div className="text-[11px] text-slate-400">{inv.student_email}</div>
                        </td>
                        <td className="py-3 px-4 text-slate-400">
                          <div>Issued: {inv.issue_date}</div>
                          <div className="text-[10px]">Due: {inv.due_date}</div>
                        </td>
                        <td className="py-3 px-4 font-mono font-bold text-white">
                          {inv.currency} {inv.total_amount}
                        </td>
                        <td className="py-3 px-4 font-mono">
                          <div className="text-emerald-400">Paid: {inv.currency} {inv.paid_amount}</div>
                          {balance > 0 && (
                            <div className="text-amber-400 text-[10px]">Due: {inv.currency} {balance}</div>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                            inv.status === 'paid'
                              ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                              : inv.status === 'partially_paid'
                              ? 'bg-blue-950 text-blue-400 border border-blue-800'
                              : 'bg-amber-950 text-amber-400 border border-amber-800'
                          }`}>
                            {inv.status.replace('_', ' ')}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right">
                          {balance > 0 ? (
                            <button
                              onClick={() => openPaymentModal(inv, getRequestId(inv))}
                              type="button"
                              className="min-h-9 px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs shadow-sm cursor-pointer transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300"
                            >
                              + Record Payment
                            </button>
                          ) : (
                            <span className="text-emerald-400 text-xs font-semibold flex items-center justify-end gap-1">
                              <CheckCircle className="w-3.5 h-3.5" />
                              <span>Settled</span>
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* EXPENSES TABLE */}
      {canAccessFinance && activeTab === 'expenses' && (
        <section id="finance-expenses-panel" role="tabpanel" aria-labelledby="finance-expenses-tab" className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
            <div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">Daily Expenses</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Recorded center expenses for the selected date.
              </p>
            </div>
            <div>
              <label htmlFor="daily-expenses-date" className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                Expense date
              </label>
              <input
                id="daily-expenses-date"
                type="date"
                value={selectedDate}
                onChange={(event) => setSelectedDate(event.target.value)}
                className="min-h-10 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-sm text-slate-800 dark:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {Object.entries(dailyExpenseTotals).length > 0 ? Object.entries(dailyExpenseTotals).map(([currency, total]) => (
              <div key={currency} className="p-4 rounded-xl bg-white dark:bg-[#1E293B] border border-rose-100 dark:border-rose-900/40">
                <span className="text-[10px] font-bold uppercase text-rose-700 dark:text-rose-400">Expenses · {currency}</span>
                <div className="text-xl font-extrabold text-rose-700 dark:text-rose-300 mt-1 font-mono">
                  {currency} {total.toLocaleString()}
                </div>
              </div>
            )) : (
              <div className="sm:col-span-2 lg:col-span-4 p-4 rounded-xl bg-white dark:bg-[#1E293B] border border-[#E8EEF7] dark:border-slate-800 text-sm text-slate-500 dark:text-slate-400">
                No expenses recorded for {selectedDate}.
              </div>
            )}
          </div>

          <div className="bg-[#0a182a] border border-cyan-900/40 rounded-xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-[#071424] text-cyan-400/90 font-semibold border-b border-cyan-900/50 uppercase tracking-wider text-[11px]">
                <tr>
                  <th scope="col" className="py-3 px-4">Expense #</th>
                  <th scope="col" className="py-3 px-4">Category</th>
                  <th scope="col" className="py-3 px-4">Vendor</th>
                  <th scope="col" className="py-3 px-4">Amount</th>
                  <th scope="col" className="py-3 px-4">Date</th>
                  <th scope="col" className="py-3 px-4">Receipt Ref</th>
                  <th scope="col" className="py-3 px-4">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-cyan-900/30">
                {dailyExpenses.map((exp) => (
                  <tr key={exp.id} className="hover:bg-[#0e213b]/60 transition-colors">
                    <td className="py-3 px-4 font-mono font-bold text-white">
                      {exp.expense_number}
                    </td>
                    <td className="py-3 px-4 font-semibold text-cyan-300">
                      {exp.category}
                    </td>
                    <td className="py-3 px-4">
                      <div className="text-white font-medium">{exp.vendor_name}</div>
                      <div className="text-[11px] text-slate-400 italic">{exp.description}</div>
                    </td>
                    <td className="py-3 px-4 font-mono font-bold text-white">
                      {exp.currency} {exp.amount.toLocaleString()}
                    </td>
                    <td className="py-3 px-4 text-slate-400">
                      {exp.expense_date}
                    </td>
                    <td className="py-3 px-4 font-mono text-slate-400">
                      {exp.receipt_ref || '—'}
                    </td>
                    <td className="py-3 px-4">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-950 text-emerald-400 border border-emerald-800">
                        {exp.status}
                      </span>
                    </td>
                  </tr>
                ))}
                {dailyExpenses.length === 0 && (
                  <tr><td colSpan={7} className="py-8 text-center text-slate-500">Expenses recorded on this date will appear here.</td></tr>
                )}
              </tbody>
            </table>
          </div>
          </div>
        </section>
      )}

      {/* CREATE CUSTOMER REQUEST MODAL */}
      {isRequestModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div
            ref={requestDialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="customer-request-title"
            className="bg-[#091728] border border-cyan-800/60 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto text-slate-200 shadow-2xl"
          >
            <div className="p-5 border-b border-cyan-900/50 flex items-center justify-between bg-[#071322]">
              <h3 id="customer-request-title" className="text-base font-bold text-white flex items-center gap-2">
                <FileText className="w-4 h-4 text-emerald-400" />
                <span>Record Customer Request & Deposit</span>
              </h3>
              <button
                type="button"
                aria-label="Close customer request form"
                onClick={() => {
                  setIsRequestModalOpen(false);
                  requestButtonRef.current?.focus();
                }}
                className="min-h-8 min-w-8 p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCustomerRequestSubmit} className="p-5 sm:p-6 space-y-5 text-xs">
              {formError && (
                <div role="alert" className="p-3 rounded-lg bg-rose-950/80 border border-rose-800 text-rose-300 text-xs">
                  {formError}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="request-customer" className="block text-slate-300 mb-1">Customer *</label>
                  <select
                    id="request-customer"
                    required
                    disabled={students.length === 0}
                    value={newCustomerRequest.student_id}
                    onChange={(event) => setNewCustomerRequest({ ...newCustomerRequest, student_id: event.target.value })}
                    className="w-full min-h-10 bg-[#071322] border border-cyan-900/60 rounded-lg p-2 text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400"
                  >
                    {students.map((student) => (
                      <option key={student.id} value={student.id}>
                        {student.first_name} {student.last_name} ({student.email})
                      </option>
                    ))}
                    {students.length === 0 && <option value="">No customer records available</option>}
                  </select>
                </div>
                <div>
                  <label htmlFor="request-due-date" className="block text-slate-300 mb-1">Bill due date *</label>
                  <input
                    id="request-due-date"
                    type="date"
                    required
                    value={newCustomerRequest.due_date}
                    onChange={(event) => setNewCustomerRequest({ ...newCustomerRequest, due_date: event.target.value })}
                    className="w-full min-h-10 bg-[#071322] border border-cyan-900/60 rounded-lg p-2 text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400"
                  />
                </div>
                <div>
                  <label htmlFor="request-currency" className="block text-slate-300 mb-1">Bill currency *</label>
                  <select
                    id="request-currency"
                    value={newCustomerRequest.currency}
                    onChange={(event) => changeRequestCurrency(event.target.value)}
                    className="w-full min-h-10 bg-[#071322] border border-cyan-900/60 rounded-lg p-2 text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400"
                  >
                    <option value="EUR">EUR (€)</option>
                    <option value="EGP">EGP (Egyptian Pound)</option>
                    <option value="USD">USD ($)</option>
                  </select>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <h4 className="font-semibold text-white">Courses, packages, activities, accommodation & shop</h4>
                  <button
                    type="button"
                    onClick={() => setRequestItems((current) => [
                      ...current,
                      { category: 'course', description: requestCatalog.course[0].description, quantity: 1, unit_price: newCustomerRequest.currency === 'EUR' ? requestCatalog.course[0].price : 0 },
                    ])}
                    className="min-h-8 rounded-lg border border-cyan-800 px-3 py-1 text-cyan-200 hover:bg-cyan-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400"
                  >
                    + Add item
                  </button>
                </div>
                {requestItems.map((item, index) => {
                  const unit = requestCatalog[item.category].find((entry) => entry.description === item.description)?.unit;
                  return (
                    <div key={`${index}-${item.category}`} className="grid grid-cols-1 sm:grid-cols-12 gap-3 rounded-xl border border-cyan-900/50 bg-[#0c1f36] p-3">
                      <div className="sm:col-span-3">
                        <label htmlFor={`request-category-${index}`} className="block text-slate-300 mb-1">Type</label>
                        <select
                          id={`request-category-${index}`}
                          value={item.category}
                          onChange={(event) => changeRequestItemCategory(index, event.target.value as RequestCategory)}
                          className="w-full min-h-10 bg-[#071322] border border-cyan-900/60 rounded-lg p-2 text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400"
                        >
                          <option value="course">Course</option>
                          <option value="package">Package</option>
                          <option value="activity">Activity</option>
                          <option value="workshop">Workshop</option>
                          <option value="training">Training session</option>
                          <option value="accommodation">Accommodation</option>
                          <option value="shop">Shop product</option>
                          <option value="other">Other</option>
                        </select>
                      </div>
                      <div className="sm:col-span-5">
                        <label htmlFor={`request-description-${index}`} className="block text-slate-300 mb-1">Item *</label>
                        <select
                          id={`request-description-${index}`}
                          required
                          value={item.description}
                          onChange={(event) => changeRequestItemDescription(index, event.target.value)}
                          className="w-full min-h-10 bg-[#071322] border border-cyan-900/60 rounded-lg p-2 text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400"
                        >
                          {requestCatalog[item.category].map((catalogItem) => (
                            <option key={catalogItem.description} value={catalogItem.description}>
                              {catalogItem.description}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="sm:col-span-2">
                        <label htmlFor={`request-quantity-${index}`} className="block text-slate-300 mb-1">{unit === 'night' ? 'Nights' : 'Quantity'} *</label>
                        <input
                          id={`request-quantity-${index}`}
                          type="number"
                          required
                          min={1}
                          step={1}
                          value={item.quantity}
                          onChange={(event) => updateRequestItem(index, { quantity: Number(event.target.value) })}
                          className="w-full min-h-10 bg-[#071322] border border-cyan-900/60 rounded-lg p-2 text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400"
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <label htmlFor={`request-price-${index}`} className="block text-slate-300 mb-1">Price / {unit || 'item'} *</label>
                        <input
                          id={`request-price-${index}`}
                          type="number"
                          required
                          min={minimumRequestDeposit}
                          step="0.01"
                          value={item.unit_price || ''}
                          onChange={(event) => updateRequestItem(index, { unit_price: Number(event.target.value) })}
                          className="w-full min-h-10 bg-[#071322] border border-cyan-900/60 rounded-lg p-2 text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400"
                        />
                      </div>
                      {requestItems.length > 1 && (
                        <div className="sm:col-span-12 flex justify-end">
                          <button
                            type="button"
                            onClick={() => setRequestItems((current) => current.filter((_, itemIndex) => itemIndex !== index))}
                            className="min-h-8 px-3 text-rose-300 hover:text-rose-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-rose-400"
                          >
                            Remove item
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
                <p className="text-[11px] text-slate-400">
                  Website course and package prices are suggested in EUR. Accommodation is season/occupancy dependent, and shop prices are not published; enter the agreed price. Add dates, room needs, sizes, or other details in special notes.
                </p>
                <div className="text-right font-mono text-sm font-bold text-white">
                  Request total: {newCustomerRequest.currency} {requestTotal.toLocaleString()}
                </div>
              </div>

              <div>
                <label htmlFor="request-special-notes" className="block text-slate-300 mb-1">Special request / notes</label>
                <textarea
                  id="request-special-notes"
                  rows={3}
                  maxLength={2000}
                  value={newCustomerRequest.special_request}
                  onChange={(event) => setNewCustomerRequest({ ...newCustomerRequest, special_request: event.target.value })}
                  placeholder="Dates, accommodation nights/occupancy, shirt size, customer preferences..."
                  className="w-full bg-[#071322] border border-cyan-900/60 rounded-lg p-2 text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400"
                />
              </div>

              <fieldset className="space-y-3 rounded-xl border border-emerald-900/50 bg-emerald-950/20 p-4">
                <legend className="px-2 font-semibold text-emerald-200">Deposit received *</legend>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="request-deposit" className="block text-slate-300 mb-1">
                      Amount ({newCustomerRequest.currency}) * — minimum 30% ({minimumRequestDeposit})
                    </label>
                    <input
                      id="request-deposit"
                      type="number"
                      required
                      min="0.01"
                      max={requestTotal}
                      step="0.01"
                      value={newCustomerRequest.initial_payment.amount || ''}
                      onChange={(event) => setNewCustomerRequest({
                        ...newCustomerRequest,
                        initial_payment: { ...newCustomerRequest.initial_payment, amount: Number(event.target.value) },
                      })}
                      className="w-full min-h-10 bg-[#071322] border border-cyan-900/60 rounded-lg p-2 text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-400"
                    />
                  </div>
                  <div>
                    <label htmlFor="request-payment-method" className="block text-slate-300 mb-1">Method *</label>
                    <select
                      id="request-payment-method"
                      value={newCustomerRequest.initial_payment.payment_method}
                      onChange={(event) => setNewCustomerRequest({
                        ...newCustomerRequest,
                        initial_payment: { ...newCustomerRequest.initial_payment, payment_method: event.target.value },
                      })}
                      className="w-full min-h-10 bg-[#071322] border border-cyan-900/60 rounded-lg p-2 text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-400"
                    >
                      <option value={`Cash ${newCustomerRequest.currency}`}>Cash ({newCustomerRequest.currency})</option>
                      <option value="Credit Card">Credit card</option>
                      <option value="Bank Transfer">Bank transfer</option>
                      <option value="InstaPay Egypt">InstaPay Egypt</option>
                    </select>
                  </div>
                  <div>
                    <label htmlFor="request-payment-date" className="block text-slate-300 mb-1">Payment date *</label>
                    <input
                      id="request-payment-date"
                      type="date"
                      required
                      value={newCustomerRequest.initial_payment.payment_date}
                      onChange={(event) => setNewCustomerRequest({
                        ...newCustomerRequest,
                        initial_payment: { ...newCustomerRequest.initial_payment, payment_date: event.target.value },
                      })}
                      className="w-full min-h-10 bg-[#071322] border border-cyan-900/60 rounded-lg p-2 text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-400"
                    />
                  </div>
                  <div>
                    <label htmlFor="request-payment-reference" className="block text-slate-300 mb-1">Payment reference</label>
                    <input
                      id="request-payment-reference"
                      maxLength={100}
                      value={newCustomerRequest.initial_payment.reference_number}
                      onChange={(event) => setNewCustomerRequest({
                        ...newCustomerRequest,
                        initial_payment: { ...newCustomerRequest.initial_payment, reference_number: event.target.value },
                      })}
                      className="w-full min-h-10 bg-[#071322] border border-cyan-900/60 rounded-lg p-2 text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-400"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label htmlFor="request-payment-notes" className="block text-slate-300 mb-1">Deposit notes</label>
                    <input
                      id="request-payment-notes"
                      maxLength={500}
                      value={newCustomerRequest.initial_payment.notes}
                      onChange={(event) => setNewCustomerRequest({
                        ...newCustomerRequest,
                        initial_payment: { ...newCustomerRequest.initial_payment, notes: event.target.value },
                      })}
                      className="w-full min-h-10 bg-[#071322] border border-cyan-900/60 rounded-lg p-2 text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-400"
                    />
                  </div>
                </div>
              </fieldset>

              <div className="flex justify-end gap-2 pt-3 border-t border-cyan-900/50">
                <button
                  type="button"
                  onClick={() => {
                    setIsRequestModalOpen(false);
                    requestButtonRef.current?.focus();
                  }}
                  className="min-h-10 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting || students.length === 0 || requestItems.some((item) => item.unit_price <= 0)}
                  className="min-h-10 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold shadow-md disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-300"
                >
                  {submitting ? 'Saving request...' : 'Save request & deposit'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* RECORD PAYMENT MODAL */}
      {selectedInvoiceForPayment && (
        <div
          ref={paymentDialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="finance-payment-title"
          tabIndex={-1}
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4"
        >
          <div className="bg-[#091728] border border-cyan-800/60 rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto text-slate-200 shadow-2xl">
            <div className="p-5 border-b border-cyan-900/50 flex items-center justify-between bg-[#071322]">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-emerald-400" />
                <span id="finance-payment-title">Record Customer Payment</span>
              </h3>
              <button
                type="button"
                aria-label="Close payment form"
                onClick={closePaymentModal}
                className="min-h-10 min-w-10 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300"
              >
                <X className="w-5 h-5 mx-auto" aria-hidden="true" />
              </button>
            </div>

            <form onSubmit={handlePaymentSubmit} className="p-6 space-y-4 text-xs">
              {formError && (
                <div role="alert" className="p-3 rounded-lg bg-rose-950/80 border border-rose-800 text-rose-300 text-xs">
                  {formError}
                </div>
              )}

              <div className="p-3 rounded-lg bg-[#071322] border border-cyan-950 text-slate-300">
                <div className="flex justify-between">
                  <span>Invoice: <strong>{selectedInvoiceForPayment.invoice_number}</strong></span>
                  <span>Student: <strong>{selectedInvoiceForPayment.first_name} {selectedInvoiceForPayment.last_name}</strong></span>
                </div>
                <div className="mt-1 text-slate-400">
                  Total: {selectedInvoiceForPayment.currency} {selectedInvoiceForPayment.total_amount} • Remaining: <strong>{selectedInvoiceForPayment.currency} {selectedInvoiceForPayment.total_amount - selectedInvoiceForPayment.paid_amount}</strong>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="finance-payment-amount" className="block text-slate-400 mb-1">Amount *</label>
                  <input
                    id="finance-payment-amount"
                    type="number"
                    required
                    min="0.01"
                    max={selectedInvoiceForPayment.total_amount - selectedInvoiceForPayment.paid_amount}
                    step="0.01"
                    value={paymentData.amount}
                    onChange={(e) => setPaymentData({ ...paymentData, amount: Number(e.target.value) })}
                    className="w-full bg-[#071322] border border-cyan-900/60 rounded-lg p-2 text-white focus:outline-none focus:border-cyan-400 font-mono"
                  />
                </div>
                <div>
                  <label htmlFor="finance-payment-method" className="block text-slate-400 mb-1">Payment Method *</label>
                  <select
                    id="finance-payment-method"
                    value={paymentData.payment_method}
                    onChange={(e) => setPaymentData({ ...paymentData, payment_method: e.target.value })}
                    className="w-full bg-[#071322] border border-cyan-900/60 rounded-lg p-2 text-white focus:outline-none focus:border-cyan-400"
                  >
                    <option value={`Cash ${paymentData.currency}`}>Cash ({paymentData.currency})</option>
                    <option value="Credit Card">Credit Card Terminal</option>
                    <option value="Bank Transfer">International Wire / SEPA</option>
                    <option value="InstaPay Egypt">InstaPay Egypt</option>
                  </select>
                </div>
              </div>

              <div>
                <label htmlFor="finance-payment-reference" className="block text-slate-400 mb-1">Transaction / Reference #</label>
                <input
                  id="finance-payment-reference"
                  type="text"
                  value={paymentData.reference_number}
                  onChange={(e) => setPaymentData({ ...paymentData, reference_number: e.target.value })}
                  placeholder="e.g. CC-STR-941824 or Cash Receipt #"
                  className="w-full bg-[#071322] border border-cyan-900/60 rounded-lg p-2 text-white focus:outline-none focus:border-cyan-400 font-mono"
                />
              </div>

              <div>
                <label htmlFor="finance-payment-notes" className="block text-slate-400 mb-1">Audit Ledger Notes</label>
                <input
                  id="finance-payment-notes"
                  type="text"
                  value={paymentData.notes}
                  onChange={(e) => setPaymentData({ ...paymentData, notes: e.target.value })}
                  className="w-full bg-[#071322] border border-cyan-900/60 rounded-lg p-2 text-white focus:outline-none focus:border-cyan-400"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-cyan-900/50">
                <button
                  type="button"
                  onClick={closePaymentModal}
                  className="min-h-10 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold cursor-pointer shadow-md"
                >
                  {submitting ? 'Recording...' : 'Record Payment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CREATE INVOICE MODAL */}
      {isInvoiceModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#091728] border border-cyan-800/60 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto text-slate-200 shadow-2xl">
            <div className="p-5 border-b border-cyan-900/50 flex items-center justify-between bg-[#071322]">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Receipt className="w-4 h-4 text-emerald-400" />
                <span>Issue Customer Invoice</span>
              </h3>
              <button
                onClick={() => setIsInvoiceModalOpen(false)}
                className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleInvoiceSubmit} className="p-6 space-y-4 text-xs">
              {formError && (
                <div className="p-3 rounded-lg bg-rose-950/80 border border-rose-800 text-rose-300 text-xs">
                  {formError}
                </div>
              )}

              <div>
                <label className="block text-slate-400 mb-1">Student / Client *</label>
                <select
                  required
                  value={newInvoice.student_id}
                  onChange={(e) => setNewInvoice({ ...newInvoice, student_id: e.target.value })}
                  className="w-full bg-[#071322] border border-cyan-900/60 rounded-lg p-2 text-white focus:outline-none focus:border-cyan-400"
                >
                  {students.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.first_name} {s.last_name} ({s.email})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1">Currency</label>
                  <select
                    value={newInvoice.currency}
                    onChange={(e) => setNewInvoice({ ...newInvoice, currency: e.target.value })}
                    className="w-full bg-[#071322] border border-cyan-900/60 rounded-lg p-2 text-white focus:outline-none focus:border-cyan-400"
                  >
                    <option value="EUR">EUR (€)</option>
                    <option value="EGP">EGP (Egyptian Pound)</option>
                    <option value="USD">USD ($)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">Payment Due Date</label>
                  <input
                    type="date"
                    required
                    value={newInvoice.due_date}
                    onChange={(e) => setNewInvoice({ ...newInvoice, due_date: e.target.value })}
                    className="w-full bg-[#071322] border border-cyan-900/60 rounded-lg p-2 text-white focus:outline-none focus:border-cyan-400"
                  />
                </div>
              </div>

              {/* Line item */}
              <div className="p-3 rounded-xl bg-[#0c1f36] border border-cyan-900/40 space-y-3">
                <h4 className="text-slate-300 font-semibold text-xs">Line Item Details</h4>
                <div>
                  <label htmlFor="new-invoice-category" className="block text-slate-400 mb-1">Service type</label>
                  <select
                    id="new-invoice-category"
                    value={newInvoice.items[0]?.category}
                    onChange={(e) => {
                      const items = [...newInvoice.items];
                      items[0] = { ...items[0], category: e.target.value as NonNullable<Invoice['items']>[number]['category'] };
                      setNewInvoice({ ...newInvoice, items });
                    }}
                    className="w-full bg-[#071322] border border-cyan-900/60 rounded-lg p-2 text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400"
                  >
                    {['course', 'package', 'accommodation', 'activity', 'workshop', 'training', 'gear_rental', 'shop', 'other'].map((category) => (
                      <option key={category} value={category}>{category === 'training' ? 'Training session' : category.replace('_', ' ')}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="new-invoice-description" className="block text-slate-400 mb-1">Description</label>
                  <input
                    id="new-invoice-description"
                    type="text"
                    required
                    value={newInvoice.items[0]?.description}
                    onChange={(e) => {
                      const items = [...newInvoice.items];
                      items[0].description = e.target.value;
                      setNewInvoice({ ...newInvoice, items });
                    }}
                    className="w-full bg-[#071322] border border-cyan-900/60 rounded-lg p-2 text-white focus:outline-none focus:border-cyan-400"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-400 mb-1">Quantity</label>
                    <input
                      type="number"
                      min={1}
                      value={newInvoice.items[0]?.quantity}
                      onChange={(e) => {
                        const items = [...newInvoice.items];
                        items[0].quantity = Number(e.target.value);
                        setNewInvoice({ ...newInvoice, items });
                      }}
                      className="w-full bg-[#071322] border border-cyan-900/60 rounded-lg p-2 text-white focus:outline-none focus:border-cyan-400"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 mb-1">Unit Price ({newInvoice.currency})</label>
                    <input
                      type="number"
                      value={newInvoice.items[0]?.unit_price}
                      onChange={(e) => {
                        const items = [...newInvoice.items];
                        items[0].unit_price = Number(e.target.value);
                        setNewInvoice({ ...newInvoice, items });
                      }}
                      className="w-full bg-[#071322] border border-cyan-900/60 rounded-lg p-2 text-white focus:outline-none focus:border-cyan-400"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Notes / Terms</label>
                <input
                  type="text"
                  value={newInvoice.notes}
                  onChange={(e) => setNewInvoice({ ...newInvoice, notes: e.target.value })}
                  className="w-full bg-[#071322] border border-cyan-900/60 rounded-lg p-2 text-white focus:outline-none focus:border-cyan-400"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-cyan-900/50">
                <button
                  type="button"
                  onClick={() => setIsInvoiceModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold cursor-pointer shadow-md"
                >
                  {submitting ? 'Generating...' : 'Issue Invoice'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CREATE EXPENSE MODAL */}
      {isExpenseModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#091728] border border-cyan-800/60 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto text-slate-200 shadow-2xl">
            <div className="p-5 border-b border-cyan-900/50 flex items-center justify-between bg-[#071322]">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-cyan-400" />
                <span>Record Operational Expense</span>
              </h3>
              <button
                onClick={() => setIsExpenseModalOpen(false)}
                className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleExpenseSubmit} className="p-6 space-y-4 text-xs">
              {formError && (
                <div className="p-3 rounded-lg bg-rose-950/80 border border-rose-800 text-rose-300 text-xs">
                  {formError}
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1">Expense Category *</label>
                  <select
                    value={newExpense.category}
                    onChange={(e) => setNewExpense({ ...newExpense, category: e.target.value })}
                    className="w-full bg-[#071322] border border-cyan-900/60 rounded-lg p-2 text-white focus:outline-none focus:border-cyan-400"
                  >
                    <option value="Boat Charter & Captain">Boat Charter & Captain</option>
                    <option value="Dive Site Entry Fees">Dive Site Entry Fees (Protectorate)</option>
                    <option value="Equipment Maintenance">Equipment Maintenance</option>
                    <option value="Facility Rent & Utilities">Facility Rent & Utilities</option>
                    <option value="Oxygen & Safety Gas">Oxygen & Safety Gas</option>
                    <option value="Marketing">Marketing</option>
                    <option value="Staff Welfare">Staff Welfare</option>
                  </select>
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">Vendor / Payee *</label>
                  <input
                    type="text"
                    required
                    value={newExpense.vendor_name}
                    onChange={(e) => setNewExpense({ ...newExpense, vendor_name: e.target.value })}
                    className="w-full bg-[#071322] border border-cyan-900/60 rounded-lg p-2 text-white focus:outline-none focus:border-cyan-400"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1">Amount *</label>
                  <input
                    type="number"
                    required
                    value={newExpense.amount}
                    onChange={(e) => setNewExpense({ ...newExpense, amount: Number(e.target.value) })}
                    className="w-full bg-[#071322] border border-cyan-900/60 rounded-lg p-2 text-white focus:outline-none focus:border-cyan-400 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">Currency</label>
                  <select
                    value={newExpense.currency}
                    onChange={(e) => setNewExpense({ ...newExpense, currency: e.target.value })}
                    className="w-full bg-[#071322] border border-cyan-900/60 rounded-lg p-2 text-white focus:outline-none focus:border-cyan-400"
                  >
                    <option value="EGP">EGP (Egyptian Pound)</option>
                    <option value="EUR">EUR (€)</option>
                    <option value="USD">USD ($)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Description / Bill Memo *</label>
                <input
                  type="text"
                  required
                  value={newExpense.description}
                  onChange={(e) => setNewExpense({ ...newExpense, description: e.target.value })}
                  className="w-full bg-[#071322] border border-cyan-900/60 rounded-lg p-2 text-white focus:outline-none focus:border-cyan-400"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1">Date</label>
                  <input
                    type="date"
                    value={newExpense.expense_date}
                    onChange={(e) => setNewExpense({ ...newExpense, expense_date: e.target.value })}
                    className="w-full bg-[#071322] border border-cyan-900/60 rounded-lg p-2 text-white focus:outline-none focus:border-cyan-400"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">Receipt Reference #</label>
                  <input
                    type="text"
                    value={newExpense.receipt_ref}
                    onChange={(e) => setNewExpense({ ...newExpense, receipt_ref: e.target.value })}
                    className="w-full bg-[#071322] border border-cyan-900/60 rounded-lg p-2 text-white focus:outline-none focus:border-cyan-400 font-mono"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-cyan-900/50">
                <button
                  type="button"
                  onClick={() => setIsExpenseModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-[#071322] font-semibold cursor-pointer shadow-md"
                >
                  {submitting ? 'Saving...' : 'Record Expense'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {selectedBill && (
        <InvoiceBillDialog
          invoice={selectedBill.invoice}
          requestId={selectedBill.requestId}
          userRole={userRole}
          onClose={() => setSelectedBill(null)}
          onSave={handleBillSave}
          onRecordPayment={handleBillPayment}
        />
      )}
    </div>
  );
};
