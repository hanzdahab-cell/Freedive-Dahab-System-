import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getFinancePeriodSummary, getInvoiceServiceMix } from '../src/utils/financeAnalytics.ts';

test('finance period summary groups only in-range payments and non-rejected expenses in one currency', () => {
  const invoices = [{
    currency: 'EUR',
    status: 'partially_paid' as const,
    total_amount: 250,
    paid_amount: 75,
    due_date: '2026-11-08',
    payments: [
      { currency: 'EUR', payment_date: '2026-11-10', amount: 25 },
      { currency: 'EUR', payment_date: '2026-11-09', amount: 50 },
      { currency: 'USD', payment_date: '2026-11-10', amount: 100 },
      { currency: 'EUR', payment_date: '2026-09-01', amount: 20 },
    ],
  }];
  const expenses = [
    { currency: 'EUR', status: 'approved' as const, expense_date: '2026-11-10', amount: 8.5 },
    { currency: 'EUR', status: 'rejected' as const, expense_date: '2026-11-10', amount: 30 },
    { currency: 'USD', status: 'approved' as const, expense_date: '2026-11-10', amount: 15 },
  ];

  const summary = getFinancePeriodSummary(invoices, expenses, 'EUR', '2026-11-10');
  const today = summary.points.at(-1);
  assert.equal(summary.points.length, 30);
  assert.equal(summary.points[0].date, '2026-10-12');
  assert.deepEqual(today, {
    date: '2026-11-10',
    label: 'Nov 10',
    income: 25,
    expenses: 8.5,
  });
  assert.equal(summary.income, 75);
  assert.equal(summary.expenses, 8.5);
  assert.equal(summary.net, 66.5);
  assert.equal(summary.outstanding, 175);
  assert.equal(summary.overdue, 175);
});

test('finance period summary excludes cancelled invoices from receivables', () => {
  const invoices = [{
    currency: 'EGP',
    status: 'cancelled' as const,
    total_amount: 500,
    paid_amount: 0,
    due_date: '2026-11-01',
    payments: [],
  }];

  const summary = getFinancePeriodSummary(invoices, [], 'EGP', '2026-11-10');
  assert.equal(summary.outstanding, 0);
  assert.equal(summary.overdue, 0);
  assert.equal(summary.net, 0);
});

test('finance period summary follows the selected reporting range', () => {
  const invoices = [{
    currency: 'EUR',
    status: 'paid' as const,
    total_amount: 80,
    paid_amount: 80,
    due_date: '2026-11-10',
    payments: [
      { currency: 'EUR', payment_date: '2026-11-10', amount: 25 },
      { currency: 'EUR', payment_date: '2026-11-03', amount: 55 },
    ],
  }];

  const summary = getFinancePeriodSummary(invoices, [], 'EUR', '2026-11-10', 7);
  assert.equal(summary.points.length, 7);
  assert.equal(summary.points[0].date, '2026-11-04');
  assert.equal(summary.income, 25);
});

test('invoice service mix groups issued line totals by five service families', () => {
  const invoices = [
    {
      currency: 'EUR',
      status: 'issued' as const,
      issue_date: '2026-11-10',
      items: [
        { category: 'course' as const, total_price: 300 },
        { category: 'training' as const, total_price: 80 },
        { category: 'activity' as const, total_price: 120 },
        { category: 'gear_rental' as const, total_price: 40 },
        { category: 'shop' as const, total_price: 30 },
        { category: 'accommodation' as const, total_price: 200 },
      ],
    },
    {
      currency: 'EUR',
      status: 'draft' as const,
      issue_date: '2026-11-10',
      items: [{ category: 'course' as const, total_price: 900 }],
    },
    {
      currency: 'USD',
      status: 'paid' as const,
      issue_date: '2026-11-10',
      items: [{ category: 'course' as const, total_price: 500 }],
    },
  ];

  assert.deepEqual(
    getInvoiceServiceMix(invoices, 'EUR', '2026-11-01', '2026-11-30'),
    [
      { group: 'training', label: 'Training & courses', amount: 380 },
      { group: 'activities', label: 'Activities & packages', amount: 120 },
      { group: 'stays', label: 'Accommodation', amount: 200 },
      { group: 'gear', label: 'Gear rental', amount: 40 },
      { group: 'products', label: 'Products & other', amount: 30 },
    ],
  );
});
