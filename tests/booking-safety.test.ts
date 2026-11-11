import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';

const originalDirectory = process.cwd();
const temporaryDirectory = mkdtempSync(path.join(tmpdir(), 'freedive-booking-safety-test-'));
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
const token = 'booking-safety-test-token';
const instructorToken = 'booking-safety-instructor-token';
const ownerToken = 'booking-safety-owner-token';

before(async () => {
  initializeDatabase();
  seedInitialData();
  const insertSession = db.prepare('INSERT INTO sessions (token, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)');
  const createdAt = new Date().toISOString();
  insertSession.run(token, 'usr_crm_01', Date.now() + 60_000, createdAt);
  insertSession.run(instructorToken, 'usr_inst_01', Date.now() + 60_000, createdAt);
  insertSession.run(ownerToken, 'usr_owner_01', Date.now() + 60_000, createdAt);

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
  for (let attempt = 0; ; attempt += 1) {
    try {
      rmSync(temporaryDirectory, { recursive: true, force: true });
      break;
    } catch (error) {
      if (attempt >= 4 || !(error instanceof Error && 'code' in error && ['EPERM', 'EACCES', 'EBUSY'].includes(String(error.code)))) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 100 * (attempt + 1)));
    }
  }
});

async function request(
  endpoint: string,
  method: 'GET' | 'POST' | 'PATCH' = 'GET',
  body?: unknown,
  requestToken = token,
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

function dateDaysAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
}

function createScenario(options: {
  location?: string;
  waiverSigned?: number;
  waiverDate?: string | null;
  clearance?: string;
  prerequisites?: string;
  buoyCount?: number;
  price?: number;
} = {}) {
  const now = new Date().toISOString();
  const studentId = `std_gate_${crypto.randomUUID().slice(0, 8)}`;
  const courseId = `crs_gate_${crypto.randomUUID().slice(0, 8)}`;
  const sessionId = `ses_gate_${crypto.randomUUID().slice(0, 8)}`;
  const price = options.price ?? 100;
  db.prepare(`
    INSERT INTO students (
      id, first_name, last_name, email, medical_waiver_signed, medical_waiver_date,
      medical_clearance_status, created_at, updated_at
    ) VALUES (?, 'Safety', 'Student', ?, ?, ?, ?, ?, ?)
  `).run(
    studentId,
    `${studentId}@example.test`,
    options.waiverSigned ?? 1,
    options.waiverDate === undefined ? dateDaysAgo(1) : options.waiverDate,
    options.clearance ?? 'cleared',
    now,
    now,
  );
  db.prepare(`
    INSERT INTO courses (
      id, code, title, agency, level, duration_days, max_capacity, price_eur,
      price_egp, prerequisites, is_active, created_at
    ) VALUES (?, ?, 'Gate Test Course', 'SSI', 'Beginner', 1, 10, ?, ?, ?, 1, ?)
  `).run(courseId, courseId.toUpperCase(), price, price * 50, options.prerequisites ?? 'Able to swim 100m.', now);
  db.prepare(`
    INSERT INTO course_sessions (
      id, course_id, start_date, end_date, location, status, max_capacity, buoy_count, created_at
    ) VALUES (?, ?, ?, ?, ?, 'scheduled', 10, ?, ?)
  `).run(
    sessionId,
    courseId,
    dateDaysAgo(-2),
    dateDaysAgo(-1),
    options.location ?? 'Blue Hole',
    options.buoyCount ?? 1,
    now,
  );
  return { studentId, courseId, sessionId, price };
}

async function createBooking(
  scenario: ReturnType<typeof createScenario>,
  overrides: Record<string, unknown> = {},
) {
  return request('/bookings', 'POST', {
    student_id: scenario.studentId,
    course_id: scenario.courseId,
    session_id: scenario.sessionId,
    price: scenario.price,
    currency: 'EUR',
    deposit_amount: scenario.price * 0.3,
    assigned_buoy: 1,
    payment_method: 'Cash EUR',
    payment_date: new Date().toISOString().slice(0, 10),
    prerequisites_verified: true,
    ...overrides,
  });
}

test('accepts a waiver exactly 365 days old with physician clearance and an exact 30% recorded deposit', async () => {
  const scenario = createScenario({
    waiverDate: dateDaysAgo(365),
    clearance: 'physician_approved',
  });

  const result = await createBooking(scenario);

  assert.equal(result.status, 201);
  assert.equal(result.data.status, 'confirmed');
  const invoice = db.prepare('SELECT paid_amount, total_amount FROM invoices WHERE id = ?').get(result.data.invoiceId) as { paid_amount: number; total_amount: number };
  assert.equal(invoice.paid_amount, 30);
  assert.equal(invoice.total_amount, 100);
  assert.equal((db.prepare('SELECT COUNT(*) AS count FROM payments WHERE invoice_id = ?').get(result.data.invoiceId) as { count: number }).count, 1);
});

test('blocks bookings with expired or missing safety criteria regardless of caller-supplied payment status', async () => {
  const expiredWaiver = createScenario({ waiverDate: dateDaysAgo(366), clearance: 'unknown' });
  const expired = await createBooking(expiredWaiver, { payment_status: 'paid' });
  assert.equal(expired.status, 409);
  assert.match(expired.data.blockers.join(' '), /waiver dated within the last 365 days/);
  assert.match(expired.data.blockers.join(' '), /Medical clearance is missing/);

  const unsignedWaiver = createScenario({ waiverSigned: 0 });
  const unsigned = await createBooking(unsignedWaiver);
  assert.equal(unsigned.status, 409);
  assert.match(unsigned.data.blockers.join(' '), /signed waiver/);

  const futureWaiver = createScenario({ waiverDate: dateDaysAgo(-1) });
  const future = await createBooking(futureWaiver);
  assert.equal(future.status, 409);
  assert.match(future.data.blockers.join(' '), /signed waiver/);

  const lowDeposit = createScenario();
  const depositResult = await createBooking(lowDeposit, { deposit_amount: 29.99 });
  assert.equal(depositResult.status, 409);
  assert.match(depositResult.data.blockers.join(' '), /at least 30%/);

  const unmetPrerequisite = createScenario();
  const prerequisiteResult = await createBooking(unmetPrerequisite, { prerequisites_verified: false });
  assert.equal(prerequisiteResult.status, 409);
  assert.match(prerequisiteResult.data.blockers.join(' '), /prerequisites/);

  const noBuoys = createScenario({ buoyCount: 0 });
  const buoyResult = await createBooking(noBuoys);
  assert.equal(buoyResult.status, 409);
  assert.match(buoyResult.data.blockers.join(' '), /assigned buoy count/);

  const noAssignment = createScenario();
  const unassignedResult = await createBooking(noAssignment, { assigned_buoy: undefined });
  assert.equal(unassignedResult.status, 409);
  assert.match(unassignedResult.data.blockers.join(' '), /explicit buoy assignment/);

  const fakePaid = createScenario({ prerequisites: '' });
  const fakePaidResult = await createBooking(fakePaid, {
    deposit_amount: undefined,
    payment_method: undefined,
    payment_date: undefined,
    payment_status: 'paid',
  });
  assert.equal(fakePaidResult.status, 400);
});

test('rechecks medical eligibility on booking status changes and rejects mismatched sessions', async () => {
  const scenario = createScenario({ prerequisites: '' });
  const created = await createBooking(scenario);
  assert.equal(created.status, 201);

  db.prepare("UPDATE students SET medical_clearance_status = 'unknown' WHERE id = ?").run(scenario.studentId);
  const statusChange = await request(`/bookings/${created.data.id}`, 'PATCH', { status: 'attended' });
  assert.equal(statusChange.status, 409);
  assert.match(statusChange.data.blockers.join(' '), /Medical clearance is missing/);

  const otherSession = createScenario({ prerequisites: '' });
  const mismatched = await createBooking({ ...scenario, sessionId: otherSession.sessionId });
  assert.equal(mismatched.status, 400);
});

test('restricts booking creation and status changes to authorized operations roles', async () => {
  const scenario = createScenario({ prerequisites: '' });
  const created = await createBooking(scenario);
  assert.equal(created.status, 201);

  const unauthorizedCreate = await request('/bookings', 'POST', {}, instructorToken);
  assert.equal(unauthorizedCreate.status, 403);
  const unauthorizedUpdate = await request(
    `/bookings/${created.data.id}`,
    'PATCH',
    { status: 'attended' },
    instructorToken,
  );
  assert.equal(unauthorizedUpdate.status, 403);
  const unauthorizedClearance = await request(
    `/students/${scenario.studentId}`,
    'PATCH',
    { medical_clearance_status: 'cleared' },
    instructorToken,
  );
  assert.equal(unauthorizedClearance.status, 403);
  const unauthorizedWaiver = await request(
    `/students/${scenario.studentId}/waiver`,
    'POST',
    { signed: true },
    instructorToken,
  );
  assert.equal(unauthorizedWaiver.status, 403);
});

test('blocks a fourth diver when one buoy already supports three divers', async () => {
  const firstScenario = createScenario({ prerequisites: '', buoyCount: 1 });
  for (let index = 0; index < 3; index += 1) {
    const scenario = index === 0 ? firstScenario : createScenario({
      location: 'Blue Hole',
      prerequisites: '',
      buoyCount: 1,
    });
    const booking = await createBooking({ ...scenario, sessionId: firstScenario.sessionId, courseId: firstScenario.courseId });
    assert.equal(booking.status, 201);
  }
  const fourth = createScenario({ prerequisites: '', buoyCount: 1 });
  const blocked = await createBooking({ ...fourth, sessionId: firstScenario.sessionId, courseId: firstScenario.courseId });
  assert.equal(blocked.status, 409);
  assert.match(blocked.data.blockers.join(' '), /Buoy 1 is full|Buoy 1 exceeds the limit/);
});

test('prevents duplicate active bookings and lowering session capacity below the roster', async () => {
  const firstScenario = createScenario({ prerequisites: '' });
  const first = await createBooking(firstScenario);
  assert.equal(first.status, 201);

  const duplicate = await createBooking(firstScenario);
  assert.equal(duplicate.status, 409);
  assert.match(duplicate.data.error, /already has an active booking/);

  const secondScenario = createScenario({ prerequisites: '' });
  const second = await createBooking({ ...secondScenario, sessionId: firstScenario.sessionId, courseId: firstScenario.courseId });
  assert.equal(second.status, 201);

  const lowerCapacity = await request(`/sessions/${firstScenario.sessionId}`, 'PATCH', { max_capacity: 1 });
  assert.equal(lowerCapacity.status, 400);
  assert.match(lowerCapacity.data.error, /cannot be below the current roster/);
});

test('allows legacy unassigned bookings to receive an explicit buoy after session capacity is configured', async () => {
  const scenario = createScenario({ buoyCount: 0 });
  const bookingId = `bkg_legacy_${crypto.randomUUID().slice(0, 8)}`;
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO bookings (
      id, booking_number, student_id, course_id, session_id, booking_date,
      status, price, currency, payment_status, prerequisites_verified,
      assigned_buoy, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, 'pending', 100, 'EUR', 'unpaid', 1, NULL, ?, ?)
  `).run(bookingId, `FD-LEGACY-${crypto.randomUUID().slice(0, 8)}`, scenario.studentId, scenario.courseId, scenario.sessionId, now.slice(0, 10), now, now);

  const configured = await request(`/sessions/${scenario.sessionId}`, 'PATCH', { buoy_count: 2 });
  assert.equal(configured.status, 200);
  const assigned = await request(`/bookings/${bookingId}`, 'PATCH', { assigned_buoy: 2 });
  assert.equal(assigned.status, 200);
  assert.equal(
    (db.prepare('SELECT assigned_buoy FROM bookings WHERE id = ?').get(bookingId) as { assigned_buoy: number }).assigned_buoy,
    2,
  );
});

test('keeps Ras Mohamed bookings pending until four participants pass the gate', async () => {
  const firstScenario = createScenario({ location: 'Ras Mohamed', prerequisites: '', buoyCount: 2 });
  const results: Array<{ data: any }> = [];
  for (let index = 0; index < 4; index += 1) {
    const scenario = index === 0 ? firstScenario : createScenario({
      location: 'Ras Mohamed',
      prerequisites: '',
      buoyCount: 2,
    });
    results.push(await createBooking(
      { ...scenario, sessionId: firstScenario.sessionId, courseId: firstScenario.courseId },
      { assigned_buoy: index % 2 + 1 },
    ));
    assert.equal(results[index].data.status, index < 3 ? 'pending' : 'confirmed');
  }
  assert.equal(
    (db.prepare("SELECT COUNT(*) AS count FROM bookings WHERE session_id = ? AND status = 'confirmed'").get(firstScenario.sessionId) as { count: number }).count,
    4,
  );
});

test('prevents a Ras Mohamed activity from entering the water with fewer than four registered participants', async () => {
  const activityId = `activity_gate_${crypto.randomUUID().slice(0, 8)}`;
  const today = new Date().toISOString().slice(0, 10);
  db.prepare(`
    INSERT INTO daily_activities (
      id, title, activity_type, location, activity_date, start_time, end_time, max_pax, created_at
    ) VALUES (?, 'Ras Mohamed test', 'fun_dive_trip', 'Ras Mohamed', ?, '09:00', '12:00', 6, ?)
  `).run(activityId, today, new Date().toISOString());

  const blocked = await request(`/activities/${activityId}`, 'PATCH', { status: 'in_water', current_pax: 4 });
  assert.equal(blocked.status, 409);

  const scenarios = Array.from({ length: 4 }, () => createScenario({ prerequisites: '' }));
  for (const [index, scenario] of scenarios.entries()) {
    db.prepare(`
      INSERT INTO activity_participants (id, activity_id, student_id, attendance_status)
      VALUES (?, ?, ?, ?)
    `).run(
      `part_${crypto.randomUUID().slice(0, 8)}`,
      activityId,
      scenario.studentId,
      index === 3 ? 'no_show' : 'scheduled',
    );
  }
  const noShow = await request(`/activities/${activityId}`, 'PATCH', { status: 'in_water' });
  assert.equal(noShow.status, 409);
  db.prepare("UPDATE activity_participants SET attendance_status = 'checked_in' WHERE activity_id = ? AND attendance_status = 'no_show'")
    .run(activityId);
  const allowed = await request(`/activities/${activityId}`, 'PATCH', { status: 'in_water' });
  assert.equal(allowed.status, 200);
});

test('owner-configured safety rules are persisted, validated, and applied by the booking gate', async () => {
  const settingsResult = await request('/settings');
  assert.equal(settingsResult.status, 200);
  const originalRules = JSON.parse(settingsResult.data.booking_safety_rules);

  const updatedRules = { ...originalRules, minimum_deposit_percent: 35 };
  const saved = await request('/settings', 'PATCH', {
    settings: { booking_safety_rules: updatedRules },
  }, ownerToken);
  assert.equal(saved.status, 200);

  const scenario = createScenario({ prerequisites: '' });
  const belowConfiguredThreshold = await createBooking(scenario, { deposit_amount: 34.99 });
  assert.equal(belowConfiguredThreshold.status, 409);
  assert.match(belowConfiguredThreshold.data.blockers.join(' '), /at least 35%/);

  const invalid = await request('/settings', 'PATCH', {
    settings: { booking_safety_rules: { ...updatedRules, max_divers_per_buoy: 0 } },
  }, ownerToken);
  assert.equal(invalid.status, 400);

  const restored = await request('/settings', 'PATCH', {
    settings: { booking_safety_rules: originalRules },
  }, ownerToken);
  assert.equal(restored.status, 200);
});
