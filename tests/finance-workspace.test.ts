import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';

const originalDirectory = process.cwd();
const temporaryDirectory = mkdtempSync(path.join(tmpdir(), 'freedive-finance-workspace-test-'));
process.chdir(temporaryDirectory);

const [{ db, initializeDatabase }, { seedInitialData }, { apiRouter }, expressModule] = await Promise.all([
  import('../server/db.js'),
  import('../server/seed.js'),
  import('../server/api.js'),
  import('express'),
]);

const express = expressModule.default;
let server: ReturnType<ReturnType<typeof express>['listen']>;
let baseUrl = '';
const ownerToken = 'finance-workspace-owner-token';
const financeToken = 'finance-workspace-finance-token';
const instructorToken = 'finance-workspace-instructor-token';

before(async () => {
  initializeDatabase();
  seedInitialData();
  const insertSession = db.prepare('INSERT INTO sessions (token, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)');
  const createdAt = new Date().toISOString();
  insertSession.run(ownerToken, 'usr_owner_01', Date.now() + 60_000, createdAt);
  insertSession.run(financeToken, 'usr_fin_01', Date.now() + 60_000, createdAt);
  insertSession.run(instructorToken, 'usr_inst_01', Date.now() + 60_000, createdAt);

  const app = express();
  app.use(express.json());
  app.use('/api', apiRouter);
  server = app.listen(0);
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  baseUrl = `http://127.0.0.1:${address.port}/api`;
});

after(async () => {
  if (server) {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  }
  db.pragma('wal_checkpoint(TRUNCATE)');
  db.close();
  process.chdir(originalDirectory);
  rmSync(temporaryDirectory, { recursive: true, force: true });
});

async function request(
  endpoint: string,
  method: 'GET' | 'POST' | 'PATCH' = 'GET',
  body?: unknown,
  requestToken = financeToken,
): Promise<{ status: number; data: any }> {
  const response = await fetch(`${baseUrl}${endpoint}`, {
    method,
    headers: {
      Authorization: `Bearer ${requestToken}`,
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: response.status, data: await response.json() };
}

test('opening cash balances are saved by currency and used for current cash positions', async () => {
  const saved = await request('/finance/cash-balances', 'PATCH', {
    opening_balances: { EUR: 100.25, USD: 200, EGP: 3000.75 },
  }, ownerToken);
  assert.equal(saved.status, 200);

  const loaded = await request('/finance/cash-balances');
  assert.equal(loaded.status, 200);
  assert.deepEqual(loaded.data.opening_balances, { EUR: 100.25, USD: 200, EGP: 3000.75 });
  assert.deepEqual(loaded.data.current_balances, {
    EUR: Math.round((100.25 + loaded.data.income_by_currency.EUR - loaded.data.expenses_by_currency.EUR) * 100) / 100,
    USD: Math.round((200 + loaded.data.income_by_currency.USD - loaded.data.expenses_by_currency.USD) * 100) / 100,
    EGP: Math.round((3000.75 + loaded.data.income_by_currency.EGP - loaded.data.expenses_by_currency.EGP) * 100) / 100,
  });
});

test('current cash positions track payment and expense changes independently in EUR, USD, and EGP', async () => {
  const initial = await request('/finance/cash-balances');
  const student = db.prepare('SELECT id FROM students LIMIT 1').get() as { id: string };
  const now = new Date().toISOString();
  const changes = [
    { currency: 'EUR', payment: 25.5, expense: 5.25 },
    { currency: 'USD', payment: 40, expense: 7.5 },
    { currency: 'EGP', payment: 500, expense: 50 },
  ];

  for (const change of changes) {
    const invoiceId = `inv_cash_${change.currency.toLowerCase()}`;
    db.prepare(`
      INSERT INTO invoices (
        id, invoice_number, student_id, issue_date, due_date, currency, subtotal,
        tax_rate, tax_amount, total_amount, paid_amount, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, 1000, 0, 0, 1000, ?, 'partially_paid', ?, ?)
    `).run(
      invoiceId,
      `INV-CASH-${change.currency}`,
      student.id,
      now.slice(0, 10),
      now.slice(0, 10),
      change.currency,
      change.payment,
      now,
      now,
    );
    db.prepare(`
      INSERT INTO payments (id, invoice_id, amount, currency, payment_method, payment_date, recorded_by, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      `pmt_cash_${change.currency.toLowerCase()}`,
      invoiceId,
      change.payment,
      change.currency,
      `Cash ${change.currency}`,
      now.slice(0, 10),
      'usr_fin_01',
      now,
    );
    db.prepare(`
      INSERT INTO expenses (
        id, expense_number, category, vendor_name, amount, currency, expense_date,
        status, description, created_by, created_at
      ) VALUES (?, ?, 'Test', 'Test vendor', ?, ?, ?, 'approved', 'Finance dashboard test', 'usr_fin_01', ?)
    `).run(
      `exp_cash_${change.currency.toLowerCase()}`,
      `EXP-CASH-${change.currency}`,
      change.expense,
      change.currency,
      now.slice(0, 10),
      now,
    );
  }

  const updated = await request('/finance/cash-balances');
  assert.equal(updated.status, 200);
  for (const change of changes) {
    assert.equal(
      Math.round((updated.data.current_balances[change.currency] - initial.data.current_balances[change.currency]) * 100) / 100,
      Math.round((change.payment - change.expense) * 100) / 100,
    );
  }
});

test('opening balances reject invalid values and remain restricted to finance roles', async () => {
  const invalid = await request('/finance/cash-balances', 'PATCH', {
    opening_balances: { EUR: 1, USD: -1, EGP: 3 },
  });
  assert.equal(invalid.status, 400);

  const unauthorized = await request('/finance/cash-balances', 'PATCH', {
    opening_balances: { EUR: 1, USD: 2, EGP: 3 },
  }, instructorToken);
  assert.equal(unauthorized.status, 403);
});

test('invoice edits persist service details and totals without rewriting payments', async () => {
  const student = db.prepare('SELECT id FROM students LIMIT 1').get() as { id: string };
  const now = new Date().toISOString();
  const invoiceId = 'inv_finance_edit_test';
  db.prepare(`
    INSERT INTO invoices (
      id, invoice_number, student_id, issue_date, due_date, currency, subtotal,
      tax_rate, tax_amount, total_amount, paid_amount, status, notes, created_by, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, 'EUR', 100, 0, 0, 100, 30, 'partially_paid', 'Original note', 'usr_fin_01', ?, ?)
  `).run(invoiceId, 'INV-FINANCE-EDIT-TEST', student.id, now.slice(0, 10), now.slice(0, 10), now, now);
  db.prepare(`
    INSERT INTO invoice_items (id, invoice_id, category, description, quantity, unit_price, total_price)
    VALUES ('item_finance_edit_test', ?, 'course', 'Freediver course', 1, 100, 100)
  `).run(invoiceId);
  db.prepare(`
    INSERT INTO payments (id, invoice_id, amount, currency, payment_method, payment_date, recorded_by, created_at)
    VALUES ('pmt_finance_edit_test', ?, 30, 'EUR', 'Cash EUR', ?, 'usr_fin_01', ?)
  `).run(invoiceId, now.slice(0, 10), now);

  const saved = await request(`/finance/invoices/${invoiceId}`, 'PATCH', {
    issue_date: now.slice(0, 10),
    due_date: now.slice(0, 10),
    tax_rate: 10,
    notes: 'Updated service details',
    items: [{ category: 'training', description: 'Group training session', quantity: 2, unit_price: 60 }],
  });
  assert.equal(saved.status, 200);
  assert.equal(saved.data.total_amount, 132);

  const invoice = db.prepare('SELECT total_amount, paid_amount, status, notes FROM invoices WHERE id = ?').get(invoiceId) as {
    total_amount: number;
    paid_amount: number;
    status: string;
    notes: string;
  };
  const items = db.prepare('SELECT category, description, quantity, unit_price, total_price FROM invoice_items WHERE invoice_id = ?').all(invoiceId);
  const paymentCount = (db.prepare('SELECT COUNT(*) AS count FROM payments WHERE invoice_id = ?').get(invoiceId) as { count: number }).count;
  assert.deepEqual(invoice, { total_amount: 132, paid_amount: 30, status: 'partially_paid', notes: 'Updated service details' });
  assert.deepEqual(items, [{ category: 'training', description: 'Group training session', quantity: 2, unit_price: 60, total_price: 120 }]);
  assert.equal(paymentCount, 1);
});

test('invoice edits reject invalid services and totals below payments already received', async () => {
  const tooSmall = await request('/finance/invoices/inv_finance_edit_test', 'PATCH', {
    issue_date: '2026-01-01',
    due_date: '2026-01-01',
    tax_rate: 0,
    notes: '',
    items: [{ category: 'course', description: 'Small service', quantity: 1, unit_price: 20 }],
  });
  assert.equal(tooSmall.status, 409);

  const invalidCategory = await request('/finance/invoices/inv_finance_edit_test', 'PATCH', {
    issue_date: '2026-01-01',
    due_date: '2026-01-01',
    tax_rate: 0,
    notes: '',
    items: [{ category: 'unlisted', description: 'Service', quantity: 1, unit_price: 50 }],
  });
  assert.equal(invalidCategory.status, 400);
});
