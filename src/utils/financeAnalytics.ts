import { Expense, Invoice, Payment } from '../types';

type AnalyticsInvoice = Pick<Invoice, 'currency' | 'status' | 'total_amount' | 'paid_amount' | 'due_date'> & {
  payments?: Array<Pick<Payment, 'currency' | 'payment_date' | 'amount'>>;
};
type AnalyticsExpense = Pick<Expense, 'currency' | 'status' | 'expense_date' | 'amount'>;

export interface DailyFinancePoint {
  date: string;
  label: string;
  income: number;
  expenses: number;
}

export interface FinancePeriodSummary {
  points: DailyFinancePoint[];
  income: number;
  expenses: number;
  net: number;
  outstanding: number;
  overdue: number;
}

export type InvoiceServiceGroup = 'training' | 'activities' | 'stays' | 'gear' | 'products';

export interface InvoiceServiceMixPoint {
  group: InvoiceServiceGroup;
  label: string;
  amount: number;
}

export function getFinancePeriodSummary(
  invoices: AnalyticsInvoice[],
  expenses: AnalyticsExpense[],
  currency: string,
  endDate: string,
  periodDays = 30,
): FinancePeriodSummary {
  const end = new Date(`${endDate}T00:00:00.000Z`);
  const days = Math.max(1, Math.floor(periodDays));
  const points = Array.from({ length: days }, (_, index) => {
    const date = new Date(end);
    date.setUTCDate(end.getUTCDate() - (days - 1 - index));
    const value = date.toISOString().slice(0, 10);
    return {
      date: value,
      label: new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(date),
      income: 0,
      expenses: 0,
    };
  });
  const pointByDate = new Map(points.map((point) => [point.date, point]));
  let outstanding = 0;
  let overdue = 0;

  for (const invoice of invoices) {
    if (invoice.currency !== currency || invoice.status === 'cancelled') continue;
    const balance = Math.max(0, invoice.total_amount - invoice.paid_amount);
    outstanding += balance;
    if (balance > 0 && invoice.due_date < endDate) overdue += balance;
    for (const payment of invoice.payments || []) {
      if (payment.currency !== currency) continue;
      const point = pointByDate.get(payment.payment_date);
      if (point) point.income += payment.amount;
    }
  }

  for (const expense of expenses) {
    if (expense.currency !== currency || expense.status === 'rejected') continue;
    const point = pointByDate.get(expense.expense_date);
    if (point) point.expenses += expense.amount;
  }

  const income = points.reduce((total, point) => total + point.income, 0);
  const expenseTotal = points.reduce((total, point) => total + point.expenses, 0);
  return {
    points,
    income: Math.round(income * 100) / 100,
    expenses: Math.round(expenseTotal * 100) / 100,
    net: Math.round((income - expenseTotal) * 100) / 100,
    outstanding: Math.round(outstanding * 100) / 100,
    overdue: Math.round(overdue * 100) / 100,
  };
}

export function getInvoiceServiceMix(
  invoices: Array<Pick<Invoice, 'currency' | 'status' | 'issue_date' | 'items'>>,
  currency: string,
  startDate: string,
  endDate: string,
): InvoiceServiceMixPoint[] {
  const groups: InvoiceServiceMixPoint[] = [
    { group: 'training', label: 'Training & courses', amount: 0 },
    { group: 'activities', label: 'Activities & packages', amount: 0 },
    { group: 'stays', label: 'Accommodation', amount: 0 },
    { group: 'gear', label: 'Gear rental', amount: 0 },
    { group: 'products', label: 'Products & other', amount: 0 },
  ];
  const groupByCategory: Record<string, InvoiceServiceGroup> = {
    course: 'training',
    training: 'training',
    workshop: 'training',
    activity: 'activities',
    package: 'activities',
    accommodation: 'stays',
    gear_rental: 'gear',
    shop: 'products',
    other: 'products',
  };
  const groupById = new Map(groups.map((group) => [group.group, group]));

  for (const invoice of invoices) {
    if (
      invoice.currency !== currency ||
      invoice.status === 'cancelled' ||
      invoice.status === 'draft' ||
      invoice.issue_date < startDate ||
      invoice.issue_date > endDate
    ) continue;

    for (const item of invoice.items || []) {
      const group = groupById.get(groupByCategory[item.category || 'other']);
      if (group) group.amount += item.total_price;
    }
  }

  return groups.map((group) => ({ ...group, amount: Math.round(group.amount * 100) / 100 }));
}
