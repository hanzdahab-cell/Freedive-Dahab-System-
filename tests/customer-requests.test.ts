import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';

const originalDirectory = process.cwd();
const temporaryDirectory = mkdtempSync(path.join(tmpdir(), 'freedive-request-test-'));
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
let frontDeskToken = '';
let financeToken = '';

before(async () => {
  initializeDatabase();
  seedInitialData();

  const app = express();
  app.use(express.json());
  app.use('/api', apiRouter);
  server = app.listen(0);
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  baseUrl = `http://127.0.0.1:${address.port}/api`;

  const insertSession = db.prepare(`
    INSERT INTO sessions (token, user_id, expires_at, created_at)
    VALUES (?, ?, ?, ?)
  `);
  const createdAt = new Date().toISOString();
  frontDeskToken = 'test-front-desk-token';
  financeToken = 'test-finance-token';
  insertSession.run(frontDeskToken, 'usr_crm_01', Date.now() + 60_000, createdAt);
  insertSession.run(financeToken, 'usr_fin_01', Date.now() + 60_000, createdAt);
});

after(async () => {
  if (server) {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  }
  db.close();
  process.chdir(originalDirectory);
  rmSync(temporaryDirectory, { recursive: true, force: true });
});

async function request(
  endpoint: string,
  token?: string,
  body?: unknown,
): Promise<{ status: number; data: any }> {
  const response = await fetch(`${baseUrl}${endpoint}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: response.status, data: await response.json() };
}

test('front desk requests create invoices and deposit payments without finance-ledger access', async () => {
  const noAuth = await request('/customer-requests');
  assert.equal(noAuth.status, 401);

  const deniedInvoices = await request('/finance/invoices', frontDeskToken);
  const deniedExpenses = await request('/finance/expenses', frontDeskToken);
  assert.equal(deniedInvoices.status, 403);
  assert.equal(deniedExpenses.status, 403);

  const student = db.prepare('SELECT id FROM students ORDER BY id LIMIT 1').get() as { id: string };
  const today = new Date().toISOString().slice(0, 10);
  const dueDate = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const invalidDeposit = await request('/customer-requests', frontDeskToken, {
    student_id: student.id,
    currency: 'EUR',
    due_date: dueDate,
    special_request: '',
    items: [{ category: 'course', description: 'SSI Freediver', quantity: 1, unit_price: 310 }],
    initial_payment: {
      amount: 311,
      payment_method: 'Cash EUR',
      payment_date: today,
    },
  });
  assert.equal(invalidDeposit.status, 400);
  assert.equal((db.prepare('SELECT COUNT(*) AS count FROM customer_requests').get() as { count: number }).count, 0);

  const belowMinimumDeposit = await request('/customer-requests', frontDeskToken, {
    student_id: student.id,
    currency: 'EUR',
    due_date: dueDate,
    special_request: '',
    items: [
      { category: 'course', description: 'SSI Freediver', quantity: 1, unit_price: 310 },
      { category: 'training', description: 'Group training session', quantity: 1, unit_price: 40 },
      { category: 'shop', description: 'Freedive Dahab T-shirt', quantity: 2, unit_price: 15 },
    ],
    initial_payment: {
      amount: 101,
      payment_method: 'Cash EUR',
      payment_date: today,
    },
  });
  assert.equal(belowMinimumDeposit.status, 400);
  assert.match(belowMinimumDeposit.data.error, /30%/);

  const created = await request('/customer-requests', frontDeskToken, {
    student_id: student.id,
    currency: 'EUR',
    due_date: dueDate,
    special_request: 'Accommodation dates to be confirmed; T-shirt size M.',
    items: [
      { category: 'course', description: 'SSI Freediver', quantity: 1, unit_price: 310 },
      { category: 'training', description: 'Group training session', quantity: 1, unit_price: 40 },
      { category: 'shop', description: 'Freedive Dahab T-shirt', quantity: 2, unit_price: 15 },
    ],
    initial_payment: {
      amount: 114,
      payment_method: 'Cash EUR',
      payment_date: today,
      reference_number: 'CASH-RECEIPT-1',
      notes: 'Deposit received',
    },
  });
  assert.equal(created.status, 201);

  const requestList = await request('/customer-requests', frontDeskToken);
  assert.equal(requestList.status, 200);
  assert.equal(requestList.data.length, 1);
  assert.equal(requestList.data[0].request_number, created.data.requestNumber);
  assert.equal(requestList.data[0].total_amount, 380);
  assert.equal(requestList.data[0].paid_amount, 114);
  assert.equal(requestList.data[0].items.length, 3);
  assert.equal(requestList.data[0].items[1].category, 'training');
  assert.equal(requestList.data[0].payments.length, 1);

  const nextPayment = await request(`/customer-requests/${created.data.id}/payments`, frontDeskToken, {
    amount: 266,
    payment_method: 'Bank Transfer',
    payment_date: today,
    reference_number: 'BANK-TRANSFER-2',
    notes: '',
  });
  assert.equal(nextPayment.status, 201);
  assert.equal(nextPayment.data.newPaidAmount, 380);
  assert.equal(nextPayment.data.status, 'paid');

  const overpayment = await request(`/customer-requests/${created.data.id}/payments`, frontDeskToken, {
    amount: 0.01,
    payment_method: 'Cash EUR',
    payment_date: today,
  });
  assert.equal(overpayment.status, 400);

  const financeInvoices = await request('/finance/invoices', financeToken);
  const linkedInvoice = financeInvoices.data.find((invoice: any) => invoice.id === created.data.invoiceId);
  assert.ok(linkedInvoice);
  assert.equal(linkedInvoice.customer_request_number, created.data.requestNumber);
  assert.equal(linkedInvoice.paid_amount, 380);
  assert.equal(linkedInvoice.status, 'paid');
  assert.deepEqual(
    linkedInvoice.payments.map((payment: { amount: number }) => payment.amount).sort(),
    [114, 266],
  );
});

test('gear rentals reserve stock with the customer bill and can be returned by checkout id', async () => {
  const student = db.prepare('SELECT id FROM students ORDER BY id LIMIT 1').get() as { id: string };
  const today = new Date().toISOString().slice(0, 10);
  const returnDate = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const equipmentId = 'eq_pos_rental_test';
  db.prepare(`
    INSERT INTO equipment (
      id, barcode, item_name, category, size, brand_model, quantity_total,
      quantity_available, condition, location, low_stock_threshold, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, 1, 1, 'good', 'Test locker', 0, ?, ?)
  `).run(equipmentId, 'POS-TEST-1', 'Rental test fins', 'bifins', 'M', 'Test Model', today, today);

  const requestCountBefore = (db.prepare('SELECT COUNT(*) AS count FROM customer_requests').get() as { count: number }).count;
  const created = await request('/customer-requests', frontDeskToken, {
    student_id: student.id,
    currency: 'EUR',
    due_date: returnDate,
    special_request: '',
    items: [{
      category: 'gear_rental',
      description: 'Untrusted gear description',
      quantity: 1,
      unit_price: 20,
      equipment_id: equipmentId,
      expected_return: returnDate,
    }],
    initial_payment: { amount: 6, payment_method: 'Cash EUR', payment_date: today },
  });
  assert.equal(created.status, 201);
  assert.equal(created.data.rentalUnits, 1);
  assert.equal((db.prepare('SELECT quantity_available FROM equipment WHERE id = ?').get(equipmentId) as { quantity_available: number }).quantity_available, 0);

  const activeCheckouts = await request('/equipment/checkouts', frontDeskToken);
  assert.equal(activeCheckouts.status, 200);
  const rental = activeCheckouts.data.find((checkout: { equipment_id: string }) => checkout.equipment_id === equipmentId);
  assert.ok(rental);
  assert.equal(rental.student_id, student.id);
  assert.equal(rental.expected_return, returnDate);
  const invoiceItem = db.prepare('SELECT category, description FROM invoice_items WHERE invoice_id = ?').get(created.data.invoiceId) as {
    category: string;
    description: string;
  };
  assert.equal(invoiceItem.category, 'gear_rental');
  assert.equal(invoiceItem.description, 'Gear rental — Rental test fins (M)');

  const returned = await request(`/equipment/checkouts/${rental.id}/return`, frontDeskToken, {
    condition_in: 'good',
    notes: 'Returned after rental',
  });
  assert.equal(returned.status, 200);
  assert.equal((db.prepare('SELECT quantity_available FROM equipment WHERE id = ?').get(equipmentId) as { quantity_available: number }).quantity_available, 1);

  const oversubscribed = await request('/customer-requests', frontDeskToken, {
    student_id: student.id,
    currency: 'EUR',
    due_date: returnDate,
    special_request: '',
    items: [{
      category: 'gear_rental',
      description: 'Rental test fins',
      quantity: 2,
      unit_price: 20,
      equipment_id: equipmentId,
      expected_return: returnDate,
    }],
    initial_payment: { amount: 12, payment_method: 'Cash EUR', payment_date: today },
  });
  assert.equal(oversubscribed.status, 409);
  assert.equal(
    (db.prepare('SELECT COUNT(*) AS count FROM customer_requests').get() as { count: number }).count,
    requestCountBefore + 1,
  );
  assert.equal((db.prepare('SELECT quantity_available FROM equipment WHERE id = ?').get(equipmentId) as { quantity_available: number }).quantity_available, 1);
});
