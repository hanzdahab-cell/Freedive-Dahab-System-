import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pencil, Plus, Printer, Receipt, X } from 'lucide-react';
import { Invoice, InvoiceUpdateInput, UserRole } from '../types';

interface InvoiceBillDialogProps {
  invoice: Invoice;
  requestId?: string;
  userRole: UserRole;
  onClose: () => void;
  onSave: (invoiceId: string, changes: InvoiceUpdateInput) => Promise<void>;
  onRecordPayment: (invoice: Invoice, requestId?: string) => void;
}

type InvoiceCategory = NonNullable<NonNullable<Invoice['items']>[number]['category']>;

const serviceCategories: InvoiceCategory[] = [
  'course',
  'package',
  'accommodation',
  'activity',
  'workshop',
  'training',
  'gear_rental',
  'shop',
  'other',
];

const serviceCategoryLabels: Record<InvoiceCategory, string> = {
  course: 'Course',
  package: 'Package',
  accommodation: 'Accommodation',
  activity: 'Activity',
  workshop: 'Workshop',
  training: 'Training session',
  gear_rental: 'Gear rental',
  shop: 'Shop product',
  other: 'Other',
};

const serviceOptions: Record<InvoiceCategory, string[]> = {
  course: ['SSI Basic Freediver', 'SSI Freediver', 'Advanced Freediver', 'Performance Freediver'],
  package: ['Beginner Week', 'Advanced Week', 'Beginner + Advanced Combo', 'Training Week'],
  accommodation: ['Lighthouse Room', 'Blue Hole Room', 'Eel Garden Room', 'Islands Room'],
  activity: ['Blue Hole guided fun dive', 'Ras Mohamed dive trip', 'Night Freedive', 'Desert BBQ'],
  workshop: ['Equalisation workshop', 'Breathing workshop'],
  training: ['Group training session', 'Private training session', 'Training Techniques', 'Monofin class', 'No-Fins', 'Variable Weight'],
  gear_rental: ['Gear rental'],
  shop: ['Freedive Dahab nose clip', 'Freedive Dahab T-shirt', 'Freedive Dahab poncho'],
  other: [],
};

const CUSTOM_DESCRIPTION = '__custom_description__';

const currencyAmount = (currency: string, amount: number) =>
  new Intl.NumberFormat('en', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);

const formatInvoiceDate = (value: string) =>
  new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' })
    .format(new Date(`${value}T12:00:00`));

function getInvoiceDraft(invoice: Invoice): InvoiceUpdateInput {
  return {
    issue_date: invoice.issue_date,
    due_date: invoice.due_date,
    tax_rate: invoice.tax_rate,
    notes: invoice.notes || '',
    items: (invoice.items || []).map((item) => ({
      category: item.category || 'other',
      description: item.description,
      quantity: item.quantity,
      unit_price: item.unit_price,
    })),
  };
}

function daysUntil(dueDate: string): number {
  const [year, month, day] = dueDate.split('-').map(Number);
  const due = Date.UTC(year, month - 1, day);
  const nowParts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Cairo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const today = Object.fromEntries(nowParts.map(({ type, value }) => [type, value]));
  const todayUtc = Date.UTC(Number(today.year), Number(today.month) - 1, Number(today.day));
  return Math.round((due - todayUtc) / 86_400_000);
}

function getBalanceSummary(invoice: Invoice, balance: number, days: number): string {
  if (invoice.status === 'cancelled') return 'This invoice has been cancelled.';
  if (balance <= 0) return 'Paid in full. Thank you for diving with us.';
  const timing = days < 0
    ? `${Math.abs(days)} ${Math.abs(days) === 1 ? 'day' : 'days'} overdue`
    : days === 0
      ? 'Due today'
      : `Due in ${days} ${days === 1 ? 'day' : 'days'}`;
  if (invoice.paid_amount > 0) {
    return `${timing}, with ${currencyAmount(invoice.currency, invoice.paid_amount)} of ${currencyAmount(invoice.currency, invoice.total_amount)} paid.`;
  }
  return `${timing}.`;
}

export const InvoiceBillDialog: React.FC<InvoiceBillDialogProps> = ({
  invoice,
  requestId,
  userRole,
  onClose,
  onSave,
  onRecordPayment,
}) => {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const canEdit = ['owner', 'finance'].includes(userRole) && invoice.status !== 'cancelled';
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState(() => getInvoiceDraft(invoice));

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
    return () => {
      if (dialog?.open) dialog.close();
    };
  }, []);

  const subtotal = useMemo(
    () => draft.items.reduce((amount, item) => amount + Math.round(item.quantity * item.unit_price * 100), 0) / 100,
    [draft.items],
  );
  const taxAmount = Math.round(subtotal * draft.tax_rate) / 100;
  const total = subtotal + taxAmount;
  const displayedTotal = editing ? total : invoice.total_amount;
  const balance = Math.max(0, displayedTotal - invoice.paid_amount);
  const daysUntilDue = daysUntil(editing ? draft.due_date : invoice.due_date);
  const isOverdue = balance > 0 && daysUntilDue < 0 && invoice.status !== 'cancelled';
  const summary = getBalanceSummary({ ...invoice, total_amount: displayedTotal }, balance, daysUntilDue);

  const updateItem = (index: number, patch: Partial<InvoiceUpdateInput['items'][number]>) => {
    setDraft((current) => ({
      ...current,
      items: current.items.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item),
    }));
  };

  const beginEditing = () => {
    setDraft(getInvoiceDraft(invoice));
    setError(null);
    setEditing(true);
  };

  const cancelEditing = () => {
    setDraft(getInvoiceDraft(invoice));
    setError(null);
    setEditing(false);
  };

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await onSave(invoice.id, draft);
      setEditing(false);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'The invoice could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="invoice-bill-title"
      onClose={onClose}
      className="invoice-print-dialog m-auto max-h-[94vh] w-[min(96vw,1040px)] overflow-hidden rounded-xl border border-slate-300 bg-white p-0 text-slate-900 shadow-2xl backdrop:bg-slate-950/70"
    >
      <form id="invoice-bill-form" onSubmit={handleSave} className="flex max-h-[94vh] flex-col">
        <div className="invoice-print-actions sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-[#f7f9fc] px-4 py-3 sm:px-7">
          <div className="flex min-w-0 items-center gap-2">
            <Receipt className="h-5 w-5 shrink-0 text-[#3069C4]" aria-hidden="true" />
            <h2 id="invoice-bill-title" className="truncate text-sm font-bold text-slate-900">
              Invoice · {invoice.invoice_number}
            </h2>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3069C4]"
            >
              <Printer className="h-4 w-4" aria-hidden="true" />
              Print invoice
            </button>
            {editing ? (
              <>
                <button
                  type="button"
                  disabled={saving}
                  onClick={cancelEditing}
                  className="min-h-10 rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3069C4]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  form="invoice-bill-form"
                  disabled={saving || draft.items.length === 0 || !Number.isFinite(total) || total < invoice.paid_amount}
                  className="min-h-10 rounded-lg bg-[#3069C4] px-4 text-xs font-semibold text-white hover:bg-[#2459ad] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3069C4]"
                >
                  {saving ? 'Saving…' : 'Save changes'}
                </button>
              </>
            ) : (
              <>
                {canEdit && (
                  <button
                    type="button"
                    onClick={beginEditing}
                    className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3069C4]"
                  >
                    <Pencil className="h-4 w-4" aria-hidden="true" />
                    Edit invoice
                  </button>
                )}
                <button
                  type="button"
                  aria-label="Close invoice"
                  onClick={() => dialogRef.current?.close()}
                  className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3069C4]"
                >
                  <X className="h-5 w-5" aria-hidden="true" />
                </button>
              </>
            )}
          </div>
        </div>

        <div className="invoice-print-scroll min-h-0 overflow-y-auto">
          <article className="invoice-print-document mx-auto max-w-[880px] space-y-8 px-5 py-7 sm:px-10 sm:py-10">
            <header className="flex flex-col justify-between gap-6 border-b border-slate-200 pb-6 sm:flex-row sm:items-start">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[#3069C4]/25 text-[#3069C4]" aria-hidden="true">
                  <Receipt className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-lg font-bold tracking-tight text-slate-950">Freedive Dahab</p>
                  <p className="mt-1 text-sm text-slate-600">Dahab, Egypt</p>
                </div>
              </div>
              <div className="sm:text-right">
                <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                  <h1 id="invoice-document-heading" className="text-xl font-bold tracking-tight text-slate-950">Invoice</h1>
                  <span className={`inline-flex min-h-6 items-center rounded-full border px-2.5 text-xs font-semibold capitalize ${
                    isOverdue
                      ? 'border-rose-300 bg-rose-50 text-rose-800'
                      : balance <= 0
                        ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
                        : 'border-slate-300 bg-slate-100 text-slate-700'
                  }`}>
                    {isOverdue ? 'Overdue' : balance <= 0 ? 'Paid' : invoice.status.replace('_', ' ')}
                  </span>
                </div>
                <p className="mt-1 font-mono text-sm font-semibold text-slate-700">{invoice.invoice_number}</p>
                {(invoice.customer_request_number || requestId) && (
                  <p className="mt-1 text-xs text-slate-500">Order {invoice.customer_request_number || requestId}</p>
                )}
              </div>
            </header>

            <section aria-labelledby="invoice-balance-heading" className="grid gap-6 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
              <div>
                <h2 id="invoice-balance-heading" className="text-sm font-semibold text-slate-600">
                  {balance <= 0 ? 'Amount paid' : 'Amount due'}
                </h2>
                <p className="mt-1 text-3xl font-bold tracking-tight tabular-nums text-slate-950 sm:text-4xl">
                  {currencyAmount(invoice.currency, balance <= 0 ? invoice.total_amount : balance)}
                </p>
                <p className={`mt-2 max-w-[62ch] text-sm ${isOverdue ? 'font-medium text-rose-800' : 'text-slate-600'}`}>
                  {summary}
                </p>
              </div>
              <dl className="grid grid-cols-2 gap-x-8 gap-y-3 border-t border-slate-200 pt-4 text-sm sm:min-w-[280px] sm:border-l sm:border-t-0 sm:pl-6 sm:pt-0">
                <dt className="text-slate-500">Issued</dt>
                <dd className="text-right font-medium text-slate-800">{formatInvoiceDate(invoice.issue_date)}</dd>
                <dt className="text-slate-500">Due</dt>
                <dd className="text-right font-medium text-slate-800">
                  {editing ? (
                    <input
                      aria-label="Due date"
                      required
                      type="date"
                      value={draft.due_date}
                      onChange={(event) => setDraft({ ...draft, due_date: event.target.value })}
                      className="min-h-9 rounded-md border border-slate-300 bg-white px-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#3069C4]"
                    />
                  ) : formatInvoiceDate(invoice.due_date)}
                </dd>
                <dt className="text-slate-500">Currency</dt>
                <dd className="text-right font-medium text-slate-800">{invoice.currency}</dd>
              </dl>
            </section>

            {editing && (
              <div className="flex flex-wrap items-center gap-3 rounded-lg bg-slate-50 p-3 text-sm">
                <label htmlFor="invoice-issue-date" className="font-medium text-slate-700">Invoice date</label>
                <input
                  id="invoice-issue-date"
                  required
                  type="date"
                  value={draft.issue_date}
                  onChange={(event) => setDraft({ ...draft, issue_date: event.target.value })}
                  className="min-h-9 rounded-md border border-slate-300 bg-white px-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#3069C4]"
                />
              </div>
            )}

            <section aria-label="Invoice parties" className="grid gap-8 border-y border-slate-200 py-6 sm:grid-cols-2">
              <div>
                <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">From</h2>
                <p className="mt-2 font-semibold text-slate-900">Freedive Dahab</p>
                <p className="mt-1 text-sm text-slate-600">Dahab, Egypt</p>
              </div>
              <div>
                <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Bill to</h2>
                <p className="mt-2 font-semibold text-slate-900">{invoice.first_name} {invoice.last_name}</p>
                {invoice.student_email && <p className="mt-1 break-all text-sm text-slate-600">{invoice.student_email}</p>}
                {invoice.student_phone && <p className="mt-1 text-sm text-slate-600">{invoice.student_phone}</p>}
              </div>
            </section>

            <section aria-labelledby="invoice-lines-heading">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <h2 id="invoice-lines-heading" className="text-base font-semibold text-slate-900">Line items</h2>
                {editing && (
                  <button
                    type="button"
                    onClick={() => setDraft((current) => ({
                      ...current,
                      items: [...current.items, { category: 'other', description: '', quantity: 1, unit_price: 1 }],
                    }))}
                    className="inline-flex min-h-9 items-center gap-2 rounded-md border border-slate-300 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#3069C4]"
                  >
                    <Plus className="h-4 w-4" aria-hidden="true" />
                    Add service
                  </button>
                )}
              </div>
              <div className="overflow-x-auto border-y border-slate-200">
                <table className="w-full min-w-[610px] border-collapse text-left text-sm">
                  <thead className="border-b border-slate-200 text-xs font-semibold text-slate-500">
                    <tr>
                      <th scope="col" className="py-3 pr-4">Description</th>
                      <th scope="col" className="w-24 px-3 py-3 text-right">Qty</th>
                      <th scope="col" className="w-32 px-3 py-3 text-right">Original unit price</th>
                      <th scope="col" className="w-36 py-3 pl-3 text-right">Line total</th>
                      {editing && <th scope="col" className="w-20 py-3 pl-3 text-right"><span className="sr-only">Actions</span></th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {draft.items.map((item, index) => (
                      <tr key={invoice.items?.[index]?.id || `service-${index}`} className="align-top">
                        <td className="py-4 pr-4">
                          {editing ? (
                            <div className="grid gap-2 sm:grid-cols-[140px_minmax(180px,1fr)]">
                              <label className="sr-only" htmlFor={`bill-category-${index}`}>Service category</label>
                              <select
                                id={`bill-category-${index}`}
                                value={item.category}
                                onChange={(event) => updateItem(index, { category: event.target.value as NonNullable<Invoice['items']>[number]['category'] })}
                                className="min-h-10 rounded-md border border-slate-300 bg-white px-2 text-xs capitalize focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#3069C4]"
                              >
                                {serviceCategories.map((category) => <option key={category} value={category}>{serviceCategoryLabels[category]}</option>)}
                              </select>
                              {(() => {
                                const category = item.category || 'other';
                                const options = serviceOptions[category];
                                const isKnownDescription = options.includes(item.description);
                                const descriptionSelection = isKnownDescription ? item.description : CUSTOM_DESCRIPTION;
                                return (
                                  <div className="min-w-0 space-y-2">
                                    <label className="sr-only" htmlFor={`bill-description-${index}`}>Product or service</label>
                                    <select
                                      id={`bill-description-${index}`}
                                      value={descriptionSelection}
                                      onChange={(event) => updateItem(index, {
                                        description: event.target.value === CUSTOM_DESCRIPTION ? '' : event.target.value,
                                      })}
                                      className="min-h-10 w-full min-w-0 rounded-md border border-slate-300 bg-white px-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#3069C4]"
                                    >
                                      {options.map((option) => <option key={option} value={option}>{option}</option>)}
                                      <option value={CUSTOM_DESCRIPTION}>Other — enter a description</option>
                                    </select>
                                    {descriptionSelection === CUSTOM_DESCRIPTION && (
                                      <>
                                        <label className="sr-only" htmlFor={`bill-description-custom-${index}`}>Custom product or service description</label>
                                        <input
                                          id={`bill-description-custom-${index}`}
                                          required
                                          maxLength={200}
                                          value={item.description}
                                          onChange={(event) => updateItem(index, { description: event.target.value })}
                                          className="min-h-10 w-full min-w-0 rounded-md border border-slate-300 px-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#3069C4]"
                                        />
                                      </>
                                    )}
                                  </div>
                                );
                              })()}
                            </div>
                          ) : (
                            <>
                              <p className="font-medium text-slate-900">{item.description}</p>
                              <p className="mt-1 text-xs capitalize text-slate-500">{item.category?.replace('_', ' ') || 'service'}</p>
                            </>
                          )}
                        </td>
                        <td className="px-3 py-4 text-right tabular-nums text-slate-700">
                          {editing ? (
                            <input
                              aria-label={`Quantity for ${item.description || `service ${index + 1}`}`}
                              required
                              type="number"
                              min="0.01"
                              max="1000"
                              step="0.01"
                              value={item.quantity}
                              onChange={(event) => updateItem(index, { quantity: Number(event.target.value) })}
                              className="min-h-10 w-20 rounded-md border border-slate-300 px-2 text-right focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#3069C4]"
                            />
                          ) : item.quantity}
                        </td>
                        <td className="px-3 py-4 text-right tabular-nums text-slate-700">
                          {editing ? (
                            <input
                              aria-label={`Unit price for ${item.description || `service ${index + 1}`}`}
                              required
                              type="number"
                              min="0.01"
                              max="10000000"
                              step="0.01"
                              value={item.unit_price}
                              onChange={(event) => updateItem(index, { unit_price: Number(event.target.value) })}
                              className="min-h-10 w-28 rounded-md border border-slate-300 px-2 text-right focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#3069C4]"
                            />
                          ) : currencyAmount(invoice.currency, item.unit_price)}
                        </td>
                        <td className="py-4 pl-3 text-right font-medium tabular-nums text-slate-900">
                          {currencyAmount(invoice.currency, Math.round(item.quantity * item.unit_price * 100) / 100)}
                        </td>
                        {editing && (
                          <td className="py-4 pl-3 text-right">
                            <button
                              type="button"
                              aria-label={`Remove ${item.description || `service ${index + 1}`}`}
                              disabled={draft.items.length === 1}
                              onClick={() => setDraft((current) => ({ ...current, items: current.items.filter((_, itemIndex) => itemIndex !== index) }))}
                              className="min-h-9 rounded px-2 text-xs font-medium text-rose-700 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-rose-600"
                            >
                              Remove
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                    {draft.items.length === 0 && (
                      <tr><td colSpan={editing ? 5 : 4} className="py-8 text-center text-sm text-slate-500">Add a service or product to this invoice.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            <div className="grid gap-8 border-b border-slate-200 pb-7 sm:grid-cols-[minmax(0,1fr)_300px]">
              <section aria-labelledby="invoice-payment-instructions-heading">
                <h2 id="invoice-payment-instructions-heading" className="text-sm font-semibold text-slate-900">How to pay</h2>
                <p className="mt-2 max-w-[58ch] text-sm leading-6 text-slate-600">
                  Choose a payment method accepted by the center and use <span className="font-mono font-medium text-slate-800">{invoice.invoice_number}</span> as the reference. Installments are recorded against this invoice.
                </p>
                <p className="mt-3 text-xs text-slate-500">Cash · Bank transfer · Card terminal · InstaPay Egypt</p>
              </section>
              <section aria-label="Invoice totals" className="space-y-3 text-sm">
                <div className="flex justify-between gap-4 text-slate-600">
                  <span>Subtotal</span>
                  <span className="tabular-nums text-slate-900">{currencyAmount(invoice.currency, editing ? subtotal : invoice.subtotal)}</span>
                </div>
                <div className="flex items-center justify-between gap-4 text-slate-600">
                  {editing ? (
                    <label htmlFor="bill-tax-rate">Sales tax</label>
                  ) : <span>Sales tax ({invoice.tax_rate}%)</span>}
                  {editing ? (
                    <span className="flex items-center gap-2">
                      <input
                        id="bill-tax-rate"
                        type="number"
                        min="0"
                        max="100"
                        step="0.01"
                        value={draft.tax_rate}
                        onChange={(event) => setDraft({ ...draft, tax_rate: Number(event.target.value) })}
                        className="min-h-9 w-20 rounded-md border border-slate-300 px-2 text-right focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#3069C4]"
                      />
                      <span>%</span>
                      <span className="tabular-nums text-slate-900">{currencyAmount(invoice.currency, taxAmount)}</span>
                    </span>
                  ) : <span className="tabular-nums text-slate-900">{currencyAmount(invoice.currency, invoice.tax_amount)}</span>}
                </div>
                <div className="flex justify-between gap-4 border-t border-slate-200 pt-3 font-semibold text-slate-900">
                  <span>Total</span>
                  <span className="tabular-nums">{currencyAmount(invoice.currency, editing ? total : invoice.total_amount)}</span>
                </div>
                <div className="flex justify-between gap-4 text-slate-600">
                  <span>Customer paid to date</span>
                  <span className="tabular-nums text-slate-900">{currencyAmount(invoice.currency, invoice.paid_amount)}</span>
                </div>
                <div className="flex justify-between gap-4 border-t border-slate-200 pt-3 text-base font-bold text-slate-950">
                  <span>Amount remaining</span>
                  <span className="tabular-nums">{currencyAmount(invoice.currency, editing ? Math.max(0, total - invoice.paid_amount) : balance)}</span>
                </div>
              </section>
            </div>

            <div className="grid gap-7 sm:grid-cols-2">
              <section aria-labelledby="invoice-notes-heading">
                <h2 id="invoice-notes-heading" className="text-sm font-semibold text-slate-900">Notes</h2>
                {editing ? (
                  <textarea
                    aria-label="Invoice notes"
                    maxLength={2000}
                    rows={4}
                    value={draft.notes}
                    onChange={(event) => setDraft({ ...draft, notes: event.target.value })}
                    className="mt-2 min-h-24 w-full rounded-md border border-slate-300 p-3 text-sm leading-6 text-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#3069C4]"
                  />
                ) : (
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-600">
                    {invoice.notes || 'Thank you for choosing Freedive Dahab.'}
                  </p>
                )}
              </section>
              <section aria-labelledby="invoice-payments-heading">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h2 id="invoice-payments-heading" className="text-sm font-semibold text-slate-900">Payments received</h2>
                  {balance > 0 && !editing && (
                    <button
                      type="button"
                      onClick={() => onRecordPayment(invoice, requestId)}
                      className="min-h-9 rounded-md bg-[#3069C4] px-3 text-xs font-semibold text-white hover:bg-[#2459ad] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3069C4]"
                    >
                      Record payment
                    </button>
                  )}
                </div>
                {invoice.payments?.length ? (
                  <div className="mt-3 overflow-x-auto">
                    <table className="w-full min-w-[420px] border-y border-slate-200 text-left text-sm">
                      <thead className="border-b border-slate-200 text-xs font-semibold text-slate-500">
                        <tr>
                          <th scope="col" className="py-2 pr-3">Payment date</th>
                          <th scope="col" className="py-2 px-3">Method / reference</th>
                          <th scope="col" className="py-2 pl-3 text-right">Amount paid</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {invoice.payments.map((payment) => (
                          <tr key={payment.id}>
                            <td className="py-3 pr-3 text-slate-600">{formatInvoiceDate(payment.payment_date)}</td>
                            <td className="py-3 px-3 text-slate-600">
                              <span>{payment.payment_method}</span>
                              {(payment.notes || payment.reference_number) && (
                                <span className="mt-1 block text-xs text-slate-500">
                                  {[payment.notes, payment.reference_number].filter(Boolean).join(' · ')}
                                </span>
                              )}
                            </td>
                            <td className="py-3 pl-3 text-right font-medium tabular-nums text-slate-900">
                              {currencyAmount(payment.currency, payment.amount)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="mt-3 text-sm text-slate-500">No payments have been recorded for this invoice.</p>
                )}
              </section>
            </div>

            {error && <p role="alert" className="rounded-lg border border-rose-300 bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}

            <footer className="border-t border-slate-200 pt-4 text-xs text-slate-500">
              <p className="font-medium text-slate-700">Freedive Dahab · Dahab, Egypt</p>
              <p className="mt-1">Please include the invoice number when making or asking about a payment.</p>
            </footer>
          </article>
        </div>
      </form>
    </dialog>
  );
};
