import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { db, type BookingSafetyRules } from './db.js';
import {
  hashPassword,
  verifyPassword,
  generateSessionToken,
  requireAuth,
  requireRole,
  logAudit,
  maskStudentData,
} from './auth.js';

export const apiRouter = Router();

// ==========================================
// 1. AUTHENTICATION & SESSION MANAGEMENT
// ==========================================

apiRouter.post('/auth/login', (req: Request, res: Response): void => {
  const { email, password } = req.body;
  if (!email || !password) {
    res.status(400).json({ error: 'Email and password are required' });
    return;
  }

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase().trim()) as any;
  if (!user) {
    logAudit({
      userEmail: email,
      action: 'LOGIN_FAILED',
      entityType: 'AUTH',
      details: { reason: 'User not found' },
      ip: req.ip,
    });
    res.status(401).json({ error: 'Invalid email or password' });
    return;
  }

  if (!user.is_active) {
    res.status(403).json({ error: 'This account has been disabled. Please contact the Dahab center owner.' });
    return;
  }

  const isValid = verifyPassword(password, user.password_hash, user.salt);
  if (!isValid) {
    logAudit({
      userId: user.id,
      userEmail: user.email,
      userRole: user.role,
      action: 'LOGIN_FAILED',
      entityType: 'AUTH',
      details: { reason: 'Incorrect password' },
      ip: req.ip,
    });
    res.status(401).json({ error: 'Invalid email or password' });
    return;
  }

  // Create session (valid for 7 days)
  const token = generateSessionToken();
  const expiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000;
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO sessions (token, user_id, expires_at, created_at)
    VALUES (?, ?, ?, ?)
  `).run(token, user.id, expiresAt, now);

  // Set HTTP-only cookie
  res.cookie('freedive_session', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });

  logAudit({
    userId: user.id,
    userEmail: user.email,
    userRole: user.role,
    action: 'LOGIN_SUCCESS',
    entityType: 'AUTH',
    details: { loginMethod: 'credentials' },
    ip: req.ip,
  });

  res.json({
    token,
    user: {
      id: user.id,
      email: user.email,
      full_name: user.full_name,
      role: user.role,
      phone: user.phone,
      languages: JSON.parse(user.languages || '[]'),
      certifications: JSON.parse(user.certifications || '[]'),
    },
  });
});

apiRouter.post('/auth/logout', requireAuth, (req: Request, res: Response): void => {
  if (req.sessionToken) {
    db.prepare('DELETE FROM sessions WHERE token = ?').run(req.sessionToken);
  }
  res.clearCookie('freedive_session');
  logAudit({
    userId: req.user?.id,
    userEmail: req.user?.email,
    userRole: req.user?.role,
    action: 'LOGOUT',
    entityType: 'AUTH',
    ip: req.ip,
  });
  res.json({ success: true, message: 'Logged out successfully' });
});

apiRouter.get('/auth/me', requireAuth, (req: Request, res: Response): void => {
  res.json({
    user: {
      ...req.user,
      languages: typeof req.user?.languages === 'string' ? JSON.parse(req.user.languages) : req.user?.languages,
      certifications: typeof req.user?.certifications === 'string' ? JSON.parse(req.user.certifications) : req.user?.certifications,
    },
  });
});

// Role switcher helper for demonstration & evaluation of permissions
apiRouter.post('/auth/switch-demo', (req: Request, res: Response): void => {
  const { role, email } = req.body;
  let targetUser: any;

  if (email) {
    targetUser = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  } else if (role) {
    targetUser = db.prepare('SELECT * FROM users WHERE role = ? AND is_active = 1 LIMIT 1').get(role);
  }

  if (!targetUser) {
    res.status(404).json({ error: 'Target user role not found' });
    return;
  }

  const token = generateSessionToken();
  const expiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000;
  db.prepare(`
    INSERT INTO sessions (token, user_id, expires_at, created_at)
    VALUES (?, ?, ?, ?)
  `).run(token, targetUser.id, expiresAt, new Date().toISOString());

  res.cookie('freedive_session', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });

  logAudit({
    userId: targetUser.id,
    userEmail: targetUser.email,
    userRole: targetUser.role,
    action: 'ROLE_SWITCHED_DEMO',
    entityType: 'AUTH',
    details: { switchedTo: targetUser.role },
    ip: req.ip,
  });

  res.json({
    token,
    user: {
      id: targetUser.id,
      email: targetUser.email,
      full_name: targetUser.full_name,
      role: targetUser.role,
      phone: targetUser.phone,
      languages: JSON.parse(targetUser.languages || '[]'),
      certifications: JSON.parse(targetUser.certifications || '[]'),
    },
  });
});

// ==========================================
// 2. STAFF & EMPLOYEE MANAGEMENT
// ==========================================

apiRouter.get('/users', requireAuth, (req: Request, res: Response): void => {
  // If instructor or front desk, only return public staff directory (name, email, role, certs, phone)
  const isPrivileged = ['owner', 'operations_manager', 'hr', 'finance'].includes(req.user!.role);
  
  if (isPrivileged) {
    const users = db.prepare(`
      SELECT id, email, full_name, role, is_active, phone, emergency_contact, languages, certifications,
             hourly_rate, session_commission, monthly_salary, created_at
      FROM users ORDER BY full_name ASC
    `).all();
    res.json(users.map((u: any) => ({
      ...u,
      languages: JSON.parse(u.languages || '[]'),
      certifications: JSON.parse(u.certifications || '[]'),
    })));
  } else {
    // Limited directory for instructors / gear team
    const users = db.prepare(`
      SELECT id, email, full_name, role, phone, languages, certifications
      FROM users WHERE is_active = 1 ORDER BY full_name ASC
    `).all();
    res.json(users.map((u: any) => ({
      ...u,
      languages: JSON.parse(u.languages || '[]'),
      certifications: JSON.parse(u.certifications || '[]'),
    })));
  }
});

apiRouter.post('/users', requireAuth, requireRole(['owner', 'hr']), (req: Request, res: Response): void => {
  const {
    email,
    password,
    full_name,
    role,
    phone,
    emergency_contact,
    languages,
    certifications,
    monthly_salary,
    hourly_rate,
    session_commission,
  } = req.body;

  if (!email || !password || !full_name || !role) {
    res.status(400).json({ error: 'Email, password, full name, and role are required' });
    return;
  }

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase().trim());
  if (existing) {
    res.status(400).json({ error: 'A staff user with this email already exists' });
    return;
  }

  const { hash, salt } = hashPassword(password);
  const id = 'usr_' + crypto.randomUUID().slice(0, 10);
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO users (id, email, password_hash, salt, full_name, role, is_active, phone, emergency_contact, languages, certifications, monthly_salary, hourly_rate, session_commission, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    email.toLowerCase().trim(),
    hash,
    salt,
    full_name,
    role,
    phone || null,
    emergency_contact || null,
    JSON.stringify(languages || ['English']),
    JSON.stringify(certifications || []),
    monthly_salary || 0,
    hourly_rate || 0,
    session_commission || 0,
    now,
    now
  );

  logAudit({
    userId: req.user!.id,
    userEmail: req.user!.email,
    userRole: req.user!.role,
    action: 'CREATE_USER',
    entityType: 'USER',
    entityId: id,
    details: { email, role, full_name },
    ip: req.ip,
  });

  res.status(201).json({ id, message: 'Staff member account created successfully' });
});

apiRouter.patch('/users/:id', requireAuth, requireRole(['owner', 'hr']), (req: Request, res: Response): void => {
  const { id } = req.params;
  const {
    full_name,
    role,
    is_active,
    phone,
    emergency_contact,
    languages,
    certifications,
    monthly_salary,
    hourly_rate,
    session_commission,
    password,
  } = req.body;

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id) as any;
  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  // Prevent disabling the last owner
  if (user.role === 'owner' && is_active === 0) {
    const ownerCount = (db.prepare('SELECT COUNT(*) as count FROM users WHERE role = "owner" AND is_active = 1').get() as any).count;
    if (ownerCount <= 1) {
      res.status(400).json({ error: 'Cannot deactivate the sole system owner account.' });
      return;
    }
  }

  const updates: string[] = ['updated_at = ?'];
  const values: any[] = [new Date().toISOString()];

  if (full_name !== undefined) { updates.push('full_name = ?'); values.push(full_name); }
  if (role !== undefined) { updates.push('role = ?'); values.push(role); }
  if (is_active !== undefined) { updates.push('is_active = ?'); values.push(is_active ? 1 : 0); }
  if (phone !== undefined) { updates.push('phone = ?'); values.push(phone); }
  if (emergency_contact !== undefined) { updates.push('emergency_contact = ?'); values.push(emergency_contact); }
  if (languages !== undefined) { updates.push('languages = ?'); values.push(JSON.stringify(languages)); }
  if (certifications !== undefined) { updates.push('certifications = ?'); values.push(JSON.stringify(certifications)); }
  if (monthly_salary !== undefined) { updates.push('monthly_salary = ?'); values.push(Number(monthly_salary)); }
  if (hourly_rate !== undefined) { updates.push('hourly_rate = ?'); values.push(Number(hourly_rate)); }
  if (session_commission !== undefined) { updates.push('session_commission = ?'); values.push(Number(session_commission)); }
  if (password) {
    const { hash, salt } = hashPassword(password);
    updates.push('password_hash = ?', 'salt = ?');
    values.push(hash, salt);
  }

  values.push(id);
  db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...values);

  // If user was deactivated, terminate all their active sessions immediately
  if (is_active === 0) {
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(id);
  }

  logAudit({
    userId: req.user!.id,
    userEmail: req.user!.email,
    userRole: req.user!.role,
    action: 'UPDATE_USER',
    entityType: 'USER',
    entityId: id,
    details: { updatedFields: Object.keys(req.body) },
    ip: req.ip,
  });

  res.json({ message: 'User updated successfully' });
});

// ==========================================
// 3. STUDENTS & CRM MODULE
// ==========================================

apiRouter.get('/students', requireAuth, (req: Request, res: Response): void => {
  const { search, agency, status } = req.query;
  let query = 'SELECT * FROM students WHERE 1=1';
  const params: any[] = [];

  if (search) {
    query += ' AND (first_name LIKE ? OR last_name LIKE ? OR email LIKE ? OR phone LIKE ?)';
    const term = `%${search}%`;
    params.push(term, term, term, term);
  }

  if (agency) {
    query += ' AND certification_agency = ?';
    params.push(agency);
  }

  if (status) {
    query += ' AND status = ?';
    params.push(status);
  }

  query += ' ORDER BY created_at DESC';

  const rows = db.prepare(query).all(...params) as any[];

  // Apply server-side medical data restriction for non-authorized roles
  const masked = rows.map((s) => maskStudentData(s, req.user!.role));
  res.json(masked);
});

apiRouter.get('/students/:id', requireAuth, (req: Request, res: Response): void => {
  const student = db.prepare('SELECT * FROM students WHERE id = ?').get(req.params.id) as any;
  if (!student) {
    res.status(404).json({ error: 'Student not found' });
    return;
  }

  // Get student's bookings
  const bookings = db.prepare(`
    SELECT b.*, c.title as course_title, c.code as course_code
    FROM bookings b
    JOIN courses c ON b.course_id = c.id
    WHERE b.student_id = ?
    ORDER BY b.booking_date DESC
  `).all(student.id);

  // Get student's inquiries
  const inquiries = db.prepare(`
    SELECT * FROM inquiries WHERE student_id = ? ORDER BY created_at DESC
  `).all(student.id);

  // Invoices (only for owner & finance)
  let invoices: any[] = [];
  if (['owner', 'finance'].includes(req.user!.role)) {
    invoices = db.prepare(`
      SELECT * FROM invoices WHERE student_id = ? ORDER BY issue_date DESC
    `).all(student.id);
  }

  const masked = maskStudentData(student, req.user!.role);
  res.json({
    student: masked,
    bookings,
    inquiries,
    invoices,
  });
});

apiRouter.post('/students', requireAuth, (req: Request, res: Response): void => {
  const {
    first_name,
    last_name,
    email,
    phone,
    nationality,
    date_of_birth,
    certification_agency,
    certification_level,
    total_depth_pb,
    static_apnea_pb,
    medical_waiver_signed,
    medical_waiver_date,
    medical_notes,
    emergency_contact_name,
    emergency_contact_phone,
    insurance_details,
    source_channel,
    status,
    notes,
  } = req.body;

  if (!first_name || !last_name || !email) {
    res.status(400).json({ error: 'First name, last name, and email are required' });
    return;
  }
  if (medical_waiver_signed !== undefined &&
      typeof medical_waiver_signed !== 'boolean' &&
      medical_waiver_signed !== 0 &&
      medical_waiver_signed !== 1) {
    res.status(400).json({ error: 'Waiver signed status must be true or false' });
    return;
  }
  const waiverIsSigned = medical_waiver_signed === true || medical_waiver_signed === 1;
  if (medical_notes && !['owner', 'operations_manager', 'hr'].includes(req.user!.role)) {
    res.status(403).json({ error: 'Only authorized health roles may record medical notes' });
    return;
  }
  if (waiverIsSigned && !['owner', 'operations_manager', 'front_desk_crm', 'hr'].includes(req.user!.role)) {
    res.status(403).json({ error: 'Only authorized operations roles may record a signed waiver' });
    return;
  }
  if (waiverIsSigned && (!isValidDate(medical_waiver_date) || medical_waiver_date > new Date().toISOString().slice(0, 10))) {
    res.status(400).json({ error: 'A valid, non-future waiver date is required when the waiver is signed' });
    return;
  }

  const existing = db.prepare('SELECT id FROM students WHERE email = ?').get(email.toLowerCase().trim());
  if (existing) {
    res.status(400).json({ error: 'A student with this email already exists' });
    return;
  }

  const id = 'std_' + crypto.randomUUID().slice(0, 10);
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO students (
      id, first_name, last_name, email, phone, nationality, date_of_birth,
      certification_agency, certification_level, total_depth_pb, static_apnea_pb,
      medical_waiver_signed, medical_waiver_date, medical_notes,
      emergency_contact_name, emergency_contact_phone, insurance_details,
      source_channel, status, notes, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    first_name.trim(),
    last_name.trim(),
    email.toLowerCase().trim(),
    phone || null,
    nationality || null,
    date_of_birth || null,
    certification_agency || 'None',
    certification_level || 'Beginner',
    Number(total_depth_pb) || 0,
    static_apnea_pb || '00:00',
    medical_waiver_signed ? 1 : 0,
    medical_waiver_date || null,
    medical_notes || null,
    emergency_contact_name || null,
    emergency_contact_phone || null,
    insurance_details || null,
    source_channel || 'Walk-in',
    status || 'active',
    notes || null,
    now,
    now
  );

  logAudit({
    userId: req.user!.id,
    userEmail: req.user!.email,
    userRole: req.user!.role,
    action: 'CREATE_STUDENT',
    entityType: 'STUDENT',
    entityId: id,
    details: { name: `${first_name} ${last_name}`, email },
    ip: req.ip,
  });

  res.status(201).json({ id, message: 'Student registered successfully' });
});

apiRouter.patch('/students/:id', requireAuth, (req: Request, res: Response): void => {
  const { id } = req.params;
  const existing = db.prepare('SELECT * FROM students WHERE id = ?').get(id) as any;
  if (!existing) {
    res.status(404).json({ error: 'Student not found' });
    return;
  }
  const waiverFieldsChanged =
    req.body.medical_waiver_signed !== undefined ||
    req.body.medical_waiver_date !== undefined;
  if (waiverFieldsChanged && !['owner', 'operations_manager', 'front_desk_crm', 'hr'].includes(req.user!.role)) {
    res.status(403).json({ error: 'Only authorized operations roles may update waiver records' });
    return;
  }
  if (req.body.medical_waiver_signed !== undefined &&
      typeof req.body.medical_waiver_signed !== 'boolean' &&
      req.body.medical_waiver_signed !== 0 &&
      req.body.medical_waiver_signed !== 1) {
    res.status(400).json({ error: 'Waiver signed status must be true or false' });
    return;
  }
  if (waiverFieldsChanged) {
    const waiverIsSigned = req.body.medical_waiver_signed === undefined
      ? existing.medical_waiver_signed === 1
      : req.body.medical_waiver_signed === true || req.body.medical_waiver_signed === 1;
    const waiverDate = req.body.medical_waiver_date === undefined
      ? existing.medical_waiver_date
      : req.body.medical_waiver_date;
    if (waiverIsSigned && (!isValidDate(waiverDate) || waiverDate > new Date().toISOString().slice(0, 10))) {
      res.status(400).json({ error: 'A valid, non-future waiver date is required when the waiver is signed' });
      return;
    }
    if (waiverDate !== null && waiverDate !== undefined && !isValidDate(waiverDate)) {
      res.status(400).json({ error: 'Waiver date must be a valid calendar date' });
      return;
    }
  }

  const allowedFields = [
    'first_name', 'last_name', 'phone', 'nationality', 'date_of_birth',
    'certification_agency', 'certification_level', 'total_depth_pb',
    'static_apnea_pb', 'medical_waiver_signed', 'medical_waiver_date',
    'medical_clearance_status', 'medical_notes', 'emergency_contact_name', 'emergency_contact_phone',
    'insurance_details', 'source_channel', 'status', 'notes'
  ];

  const updates: string[] = ['updated_at = ?'];
  const values: any[] = [new Date().toISOString()];

  // If role is instructor or front desk, restrict updating medical_notes
  const isHealthAuthorized = ['owner', 'operations_manager', 'hr'].includes(req.user!.role);

  for (const field of allowedFields) {
    if (req.body[field] !== undefined) {
      if (field === 'medical_notes' && !isHealthAuthorized) {
        continue;
      }
      if (field === 'medical_clearance_status') {
        if (!isHealthAuthorized) {
          res.status(403).json({ error: 'Only authorized health roles may update medical clearance' });
          return;
        }
        if (!['unknown', 'cleared', 'physician_approved'].includes(req.body[field])) {
          res.status(400).json({ error: 'Medical clearance status must be unknown, cleared, or physician_approved' });
          return;
        }
      }
      updates.push(`${field} = ?`);
      let val = req.body[field];
      if (field === 'medical_waiver_signed') val = val === true || val === 1 ? 1 : 0;
      values.push(val);
    }
  }

  values.push(id);
  db.prepare(`UPDATE students SET ${updates.join(', ')} WHERE id = ?`).run(...values);

  logAudit({
    userId: req.user!.id,
    userEmail: req.user!.email,
    userRole: req.user!.role,
    action: 'UPDATE_STUDENT',
    entityType: 'STUDENT',
    entityId: id,
    details: { updatedFields: Object.keys(req.body) },
    ip: req.ip,
  });

  res.json({ message: 'Student updated successfully' });
});

// Update medical waiver status with confirmation and audit
apiRouter.post('/students/:id/waiver', requireAuth, requireRole(['owner', 'operations_manager', 'front_desk_crm', 'hr']), (req: Request, res: Response): void => {
  const { id } = req.params;
  const { signed, date, notes } = req.body;

  if (typeof signed !== 'boolean') {
    res.status(400).json({ error: 'Signed status must be true or false' });
    return;
  }
  if (signed && date !== undefined && (!isValidDate(date) || date > new Date().toISOString().slice(0, 10))) {
    res.status(400).json({ error: 'Waiver date must be a valid, non-future date' });
    return;
  }

  const student = db.prepare('SELECT id, first_name, last_name FROM students WHERE id = ?').get(id) as any;
  if (!student) {
    res.status(404).json({ error: 'Student not found' });
    return;
  }

  const now = new Date().toISOString();
  db.prepare(`
    UPDATE students
    SET medical_waiver_signed = ?, medical_waiver_date = ?, medical_notes = COALESCE(?, medical_notes), updated_at = ?
    WHERE id = ?
  `).run(signed ? 1 : 0, signed ? date || now.slice(0, 10) : null, notes || null, now, id);

  logAudit({
    userId: req.user!.id,
    userEmail: req.user!.email,
    userRole: req.user!.role,
    action: signed ? 'MEDICAL_WAIVER_SIGNED' : 'MEDICAL_WAIVER_REVOKED',
    entityType: 'STUDENT_HEALTH',
    entityId: id,
    details: { studentName: `${student.first_name} ${student.last_name}`, date: date || now },
    ip: req.ip,
  });

  res.json({ success: true, message: 'Medical waiver status updated' });
});

// ==========================================
// 4. CRM INQUIRIES & LEADS PIPELINE
// ==========================================

apiRouter.get('/inquiries', requireAuth, (req: Request, res: Response): void => {
  const inquiries = db.prepare(`
    SELECT i.*, u.full_name as assigned_to_name
    FROM inquiries i
    LEFT JOIN users u ON i.assigned_to = u.id
    ORDER BY i.created_at DESC
  `).all();
  res.json(inquiries);
});

apiRouter.post('/inquiries', requireAuth, (req: Request, res: Response): void => {
  const {
    student_id,
    lead_name,
    lead_email,
    lead_phone,
    course_interest,
    channel,
    status,
    message,
    follow_up_date,
    assigned_to,
  } = req.body;

  if (!lead_name) {
    res.status(400).json({ error: 'Lead name is required' });
    return;
  }

  const id = 'inq_' + crypto.randomUUID().slice(0, 10);
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO inquiries (
      id, student_id, lead_name, lead_email, lead_phone, course_interest,
      channel, status, message, follow_up_date, assigned_to, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    student_id || null,
    lead_name,
    lead_email || null,
    lead_phone || null,
    course_interest || null,
    channel || 'WhatsApp',
    status || 'new',
    message || null,
    follow_up_date || null,
    assigned_to || req.user!.id,
    now,
    now
  );

  res.status(201).json({ id, message: 'Inquiry logged successfully' });
});

apiRouter.patch('/inquiries/:id', requireAuth, (req: Request, res: Response): void => {
  const { id } = req.params;
  const { status, message, follow_up_date, assigned_to, course_interest } = req.body;

  const updates: string[] = ['updated_at = ?'];
  const values: any[] = [new Date().toISOString()];

  if (status !== undefined) { updates.push('status = ?'); values.push(status); }
  if (message !== undefined) { updates.push('message = ?'); values.push(message); }
  if (follow_up_date !== undefined) { updates.push('follow_up_date = ?'); values.push(follow_up_date); }
  if (assigned_to !== undefined) { updates.push('assigned_to = ?'); values.push(assigned_to); }
  if (course_interest !== undefined) { updates.push('course_interest = ?'); values.push(course_interest); }

  values.push(id);
  db.prepare(`UPDATE inquiries SET ${updates.join(', ')} WHERE id = ?`).run(...values);

  res.json({ message: 'Inquiry updated' });
});

// ==========================================
// 5. COURSES, SESSIONS & BOOKINGS
// ==========================================

apiRouter.get('/courses', requireAuth, (req: Request, res: Response): void => {
  const courses = db.prepare('SELECT * FROM courses ORDER BY price_eur ASC').all();
  res.json(courses);
});

apiRouter.post('/courses', requireAuth, requireRole(['owner', 'operations_manager']), (req: Request, res: Response): void => {
  const { code, title, agency, level, duration_days, max_capacity, price_eur, price_egp, description, prerequisites } = req.body;
  if (!code || !title || !agency || !level || !price_eur) {
    res.status(400).json({ error: 'Code, title, agency, level, and price in EUR are required' });
    return;
  }

  const id = 'crs_' + crypto.randomUUID().slice(0, 10);
  db.prepare(`
    INSERT INTO courses (id, code, title, agency, level, duration_days, max_capacity, price_eur, price_egp, description, prerequisites, is_active, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
  `).run(
    id,
    code.trim().toUpperCase(),
    title.trim(),
    agency,
    level,
    duration_days || 2,
    max_capacity || 4,
    Number(price_eur),
    Number(price_egp) || Number(price_eur) * 52,
    description || '',
    prerequisites || '',
    new Date().toISOString()
  );

  res.status(201).json({ id, message: 'Course added to catalog' });
});

apiRouter.get('/sessions', requireAuth, (req: Request, res: Response): void => {
  const sessions = db.prepare(`
    SELECT s.*, c.title as course_title, c.code as course_code, c.agency, c.price_eur, c.price_egp, c.prerequisites,
           u.full_name as instructor_name,
           (SELECT COUNT(*) FROM bookings b WHERE b.session_id = s.id AND b.status != 'cancelled') as enrolled_count
    FROM course_sessions s
    JOIN courses c ON s.course_id = c.id
    LEFT JOIN users u ON s.instructor_id = u.id
    ORDER BY s.start_date ASC
  `).all();

  // If instructor, flag their own assigned sessions
  res.json(sessions);
});

apiRouter.post('/sessions', requireAuth, requireRole(['owner', 'operations_manager', 'front_desk_crm']), (req: Request, res: Response): void => {
  const { course_id, instructor_id, start_date, end_date, location, max_capacity, buoy_count, notes } = req.body;
  if (!course_id || !start_date || !end_date) {
    res.status(400).json({ error: 'Course, start date, and end date are required' });
    return;
  }
  if (!Number.isInteger(Number(buoy_count)) || Number(buoy_count) < 1) {
    res.status(400).json({ error: 'At least one assigned buoy is required before scheduling a session' });
    return;
  }

  // Conflict check for assigned instructor
  if (instructor_id) {
    const conflict = db.prepare(`
      SELECT id, start_date, end_date FROM course_sessions
      WHERE instructor_id = ? AND status != 'cancelled'
        AND NOT (end_date < ? OR start_date > ?)
    `).get(instructor_id, start_date, end_date);

    if (conflict) {
      res.status(409).json({
        error: 'Instructor conflict detected! This instructor is already assigned to another session during these dates.',
        conflictSession: conflict,
      });
      return;
    }
  }

  const id = 'ses_' + crypto.randomUUID().slice(0, 10);
  db.prepare(`
    INSERT INTO course_sessions (id, course_id, instructor_id, start_date, end_date, location, status, max_capacity, buoy_count, notes, created_at)
    VALUES (?, ?, ?, ?, ?, ?, 'scheduled', ?, ?, ?, ?)
  `).run(
    id,
    course_id,
    instructor_id || null,
    start_date,
    end_date,
    location || 'Lighthouse Bay / Blue Hole',
    max_capacity || 4,
    Number(buoy_count),
    notes || null,
    new Date().toISOString()
  );

  res.status(201).json({ id, message: 'Course session scheduled' });
});

apiRouter.patch('/sessions/:id', requireAuth, requireRole(['owner', 'operations_manager', 'front_desk_crm']), (req: Request, res: Response): void => {
  const { id } = req.params;
  const { instructor_id, status, location, notes, max_capacity, buoy_count } = req.body;
  const session = db.prepare('SELECT max_capacity FROM course_sessions WHERE id = ?').get(id) as { max_capacity: number } | undefined;
  if (!session) {
    res.status(404).json({ error: 'Session not found' });
    return;
  }

  const updates: string[] = [];
  const values: any[] = [];

  if (instructor_id !== undefined) { updates.push('instructor_id = ?'); values.push(instructor_id || null); }
  if (status !== undefined) { updates.push('status = ?'); values.push(status); }
  if (location !== undefined) { updates.push('location = ?'); values.push(location); }
  if (notes !== undefined) { updates.push('notes = ?'); values.push(notes); }
  if (max_capacity !== undefined) {
    const maxCapacity = Number(max_capacity);
    const activeParticipants = (db.prepare("SELECT COUNT(DISTINCT student_id) AS count FROM bookings WHERE session_id = ? AND status != 'cancelled'").get(id) as { count: number }).count;
    if (!Number.isInteger(maxCapacity) || maxCapacity < 1 || maxCapacity < activeParticipants) {
      res.status(400).json({ error: `Session capacity must be a positive whole number and cannot be below the current roster (${activeParticipants})` });
      return;
    }
    updates.push('max_capacity = ?');
    values.push(maxCapacity);
  }
  if (buoy_count !== undefined) {
    const buoyCount = Number(buoy_count);
    const safetyRules = getBookingSafetyRules();
    if (!safetyRules) {
      res.status(503).json({ error: 'Booking safety configuration is invalid; an owner must correct it before changing buoy assignments' });
      return;
    }
    if (!Number.isInteger(buoyCount) || buoyCount < 1) {
      res.status(400).json({ error: 'Buoy count must be a positive whole number' });
      return;
    }
    const assignments = db.prepare(`
      SELECT assigned_buoy, COUNT(DISTINCT student_id) AS count
      FROM bookings
      WHERE session_id = ? AND status != 'cancelled'
      GROUP BY assigned_buoy
    `).all(id) as Array<{ assigned_buoy: number | null; count: number }>;
    if (assignments.some((assignment) =>
      assignment.assigned_buoy !== null &&
      (!Number.isInteger(assignment.assigned_buoy) ||
       assignment.assigned_buoy < 1 ||
       assignment.assigned_buoy > buoyCount ||
       assignment.count > safetyRules.max_divers_per_buoy)
    )) {
      res.status(400).json({ error: 'Existing numbered buoy assignments must remain within the new buoy count and per-buoy limit' });
      return;
    }
    updates.push('buoy_count = ?');
    values.push(buoyCount);
  }

  if (updates.length === 0) {
    res.json({ message: 'No updates provided' });
    return;
  }

  values.push(id);
  db.prepare(`UPDATE course_sessions SET ${updates.join(', ')} WHERE id = ?`).run(...values);
  res.json({ message: 'Session updated' });
});

apiRouter.get('/bookings', requireAuth, (req: Request, res: Response): void => {
  const isInstructor = req.user!.role === 'instructor';
  
  let query = `
    SELECT b.*,
           s.first_name, s.last_name, s.email as student_email, s.phone as student_phone, s.nationality, s.medical_waiver_signed,
           c.title as course_title, c.code as course_code,
           cs.start_date, cs.end_date, cs.location, cs.instructor_id,
           u.full_name as instructor_name
    FROM bookings b
    JOIN students s ON b.student_id = s.id
    JOIN courses c ON b.course_id = c.id
    LEFT JOIN course_sessions cs ON b.session_id = cs.id
    LEFT JOIN users u ON cs.instructor_id = u.id
  `;

  // Instructors only see their own assigned course bookings or general bookings without sensitive pricing
  const rows = db.prepare(query + ' ORDER BY b.booking_date DESC').all() as any[];

  if (isInstructor) {
    // Hide payment financial figures from instructors
    res.json(rows.map(r => ({
      ...r,
      price: undefined,
      payment_status: undefined,
    })));
  } else {
    res.json(rows);
  }
});

function normalizeBookingSafetyRules(value: unknown): BookingSafetyRules | null {
  let rules = value;
  if (typeof rules === 'string') {
    try {
      rules = JSON.parse(rules);
    } catch {
      return null;
    }
  }
  if (!rules || typeof rules !== 'object' || Array.isArray(rules)) return null;
  const candidate = rules as Record<string, unknown>;
  const waiverDays = candidate.waiver_valid_days;
  const depositPercent = candidate.minimum_deposit_percent;
  const diversPerBuoy = candidate.max_divers_per_buoy;
  const rasMohamedMin = candidate.ras_mohamed_min_participants;
  if (typeof waiverDays !== 'number' || !Number.isInteger(waiverDays) || waiverDays < 1 || waiverDays > 3650 ||
      typeof depositPercent !== 'number' || !Number.isFinite(depositPercent) || depositPercent < 1 || depositPercent > 100 ||
      typeof diversPerBuoy !== 'number' || !Number.isInteger(diversPerBuoy) || diversPerBuoy < 1 || diversPerBuoy > 10 ||
      typeof rasMohamedMin !== 'number' || !Number.isInteger(rasMohamedMin) || rasMohamedMin < 1 || rasMohamedMin > 100) {
    return null;
  }
  return {
    waiver_valid_days: waiverDays,
    minimum_deposit_percent: depositPercent,
    max_divers_per_buoy: diversPerBuoy,
    ras_mohamed_min_participants: rasMohamedMin,
  };
}

function getBookingSafetyRules(): BookingSafetyRules | null {
  const stored = db.prepare("SELECT value FROM settings WHERE key = 'booking_safety_rules'").get() as { value: string } | undefined;
  return stored ? normalizeBookingSafetyRules(stored.value) : null;
}

function minimumBookingDeposit(totalAmount: number, rules: BookingSafetyRules): number {
  return Math.ceil(totalAmount * rules.minimum_deposit_percent - 1e-9) / 100;
}

function getBookingSafetyIssues(
  student: { medical_waiver_signed: number; medical_waiver_date: string | null; medical_clearance_status: string },
  course: { prerequisites: string | null },
  session: { location: string; buoy_count: number },
  assignedBuoy: number | null,
  buoyOccupancy: number,
  totalAmount: number,
  paidAmount: number,
  prerequisitesVerified: boolean,
  rules: BookingSafetyRules,
): string[] {
  const issues: string[] = [];
  const today = new Date();
  const todayDate = today.toISOString().slice(0, 10);
  const waiverDate = student.medical_waiver_date;
  const waiverAge = waiverDate && isValidDate(waiverDate)
    ? Math.floor((Date.parse(`${todayDate}T00:00:00.000Z`) - Date.parse(`${waiverDate}T00:00:00.000Z`)) / 86_400_000)
    : null;

  if (student.medical_waiver_signed !== 1 || waiverAge === null || waiverAge < 0 || waiverAge > rules.waiver_valid_days) {
    issues.push(`A signed waiver dated within the last ${rules.waiver_valid_days} days is required`);
  }
  if (!['cleared', 'physician_approved'].includes(student.medical_clearance_status)) {
    issues.push('Medical clearance is missing; status must be cleared or physician_approved');
  }
  if (!Number.isFinite(totalAmount) || totalAmount <= 0 || !Number.isFinite(paidAmount) ||
      paidAmount + 1e-9 < minimumBookingDeposit(totalAmount, rules)) {
    issues.push(`A recorded deposit of at least ${rules.minimum_deposit_percent}% of the booking total is required`);
  }
  if (course.prerequisites?.trim() && !prerequisitesVerified) {
    issues.push('Course prerequisites must be reviewed and verified as met');
  }
  if (!Number.isInteger(session.buoy_count) || session.buoy_count < 1) {
    issues.push('An assigned buoy count is required');
  } else if (!Number.isInteger(assignedBuoy) || assignedBuoy === null || assignedBuoy < 1 || assignedBuoy > session.buoy_count) {
    issues.push('An explicit buoy assignment within the session buoy count is required');
  } else if (buoyOccupancy > rules.max_divers_per_buoy) {
    issues.push(`Buoy ${assignedBuoy} exceeds the limit of ${rules.max_divers_per_buoy} divers`);
  }
  return issues;
}

apiRouter.post('/bookings', requireAuth, requireRole(['owner', 'operations_manager', 'front_desk_crm']), (req: Request, res: Response): void => {
  const {
    student_id,
    course_id,
    session_id,
    price,
    currency,
    deposit_amount,
    assigned_buoy,
    payment_method,
    payment_date,
    prerequisites_verified,
    notes,
  } = req.body;
  if (!student_id || !course_id || !session_id) {
    res.status(400).json({ error: 'Student, course, and scheduled session are required' });
    return;
  }

  const student = db.prepare(`
    SELECT medical_waiver_signed, medical_waiver_date, medical_clearance_status
    FROM students WHERE id = ?
  `).get(student_id) as { medical_waiver_signed: number; medical_waiver_date: string | null; medical_clearance_status: string } | undefined;
  const course = db.prepare('SELECT id, title, prerequisites FROM courses WHERE id = ?').get(course_id) as { id: string; title: string; prerequisites: string | null } | undefined;
  const session = db.prepare('SELECT * FROM course_sessions WHERE id = ?').get(session_id) as { id: string; course_id: string; location: string; status: string; max_capacity: number; buoy_count: number } | undefined;
  if (!student || !course || !session || session.course_id !== course_id) {
    res.status(400).json({ error: 'Student, course, and matching scheduled session must exist' });
    return;
  }
  if (session.status === 'cancelled' || session.status === 'completed') {
    res.status(409).json({ error: `Cannot book a ${session.status} session` });
    return;
  }

  const totalAmount = Number(price);
  const depositAmount = Number(deposit_amount);
  const bookingCurrency = String(currency || 'EUR').toUpperCase();
  const todayDate = new Date().toISOString().slice(0, 10);
  if (!Number.isFinite(totalAmount) || totalAmount <= 0 || !billingCurrencies.has(bookingCurrency)) {
    res.status(400).json({ error: 'A positive booking total and supported currency are required' });
    return;
  }
  if (!Number.isFinite(depositAmount) || depositAmount <= 0 || depositAmount > totalAmount ||
      typeof payment_method !== 'string' || !isValidCashMethod(payment_method, bookingCurrency) ||
      !isValidDate(payment_date) || payment_date > todayDate) {
    res.status(400).json({ error: 'A recorded deposit amount, valid payment method, and payment date are required' });
    return;
  }

  const duplicate = db.prepare("SELECT id FROM bookings WHERE session_id = ? AND student_id = ? AND status != 'cancelled'").get(session_id, student_id);
  if (duplicate) {
    res.status(409).json({ error: 'This student already has an active booking in the selected session' });
    return;
  }
  const currentEnrolled = (db.prepare("SELECT COUNT(DISTINCT student_id) AS count FROM bookings WHERE session_id = ? AND status != 'cancelled'").get(session_id) as { count: number }).count;
  if (currentEnrolled >= session.max_capacity) {
    res.status(409).json({ error: `Session is full (Capacity: ${session.max_capacity} students).` });
    return;
  }
  const unassignedEnrolled = (db.prepare(`
    SELECT COUNT(*) AS count FROM bookings
    WHERE session_id = ? AND status != 'cancelled' AND assigned_buoy IS NULL
  `).get(session_id) as { count: number }).count;
  if (unassignedEnrolled > 0) {
    res.status(409).json({ error: 'Assign every existing participant to a buoy before adding another diver to this session' });
    return;
  }

  const safetyRules = getBookingSafetyRules();
  if (!safetyRules) {
    res.status(503).json({ error: 'Booking safety configuration is invalid; an owner must correct it before bookings can be created' });
    return;
  }
  const safetyIssues = getBookingSafetyIssues(
    student,
    course,
    session,
    Number.isInteger(Number(assigned_buoy)) && Number(assigned_buoy) > 0 ? Number(assigned_buoy) : null,
    Number.isInteger(Number(assigned_buoy)) && Number(assigned_buoy) > 0 && Number(assigned_buoy) <= session.buoy_count
      ? (db.prepare("SELECT COUNT(DISTINCT student_id) AS count FROM bookings WHERE session_id = ? AND assigned_buoy = ? AND status != 'cancelled'").get(session_id, Number(assigned_buoy)) as { count: number }).count + 1
      : 0,
    totalAmount,
    depositAmount,
    prerequisites_verified === true,
    safetyRules,
  );
  if (safetyIssues.length > 0) {
    res.status(409).json({ error: 'Booking blocked by safety gate', blockers: safetyIssues });
    return;
  }

  const id = 'bkg_' + crypto.randomUUID().slice(0, 10);
  const bookingNumber = `FD-${new Date().getFullYear()}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
  const now = new Date().toISOString();

  const isRasMohamed = /\bras\s+mohamed\b/i.test(session.location);
  const bookingStatus = isRasMohamed ? 'pending' : 'confirmed';
  let finalBookingStatus = bookingStatus;
  const paymentStatus = depositAmount >= totalAmount ? 'paid' : 'partially_paid';
  const invoiceStatus = paymentStatus === 'paid' ? 'paid' : 'partially_paid';
  const invoiceId = 'inv_' + crypto.randomUUID().slice(0, 10);
  const invoiceNumber = `INV-${new Date().getFullYear()}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
  const bookingInsert = db.prepare(`
    INSERT INTO bookings (
      id, booking_number, student_id, course_id, session_id, booking_date,
      status, price, currency, payment_status, prerequisites_verified, assigned_buoy,
      notes, created_by, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const invoiceInsert = db.prepare(`
    INSERT INTO invoices (
      id, invoice_number, student_id, booking_id, issue_date, due_date,
      currency, subtotal, tax_rate, tax_amount, total_amount, paid_amount,
      status, notes, created_by, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?, ?, ?, ?, ?, ?)
  `);
  const itemInsert = db.prepare(`
    INSERT INTO invoice_items (id, invoice_id, description, quantity, unit_price, total_price)
    VALUES (?, ?, ?, 1, ?, ?)
  `);
  const paymentInsert = db.prepare(`
    INSERT INTO payments (id, invoice_id, amount, currency, payment_method, payment_date, recorded_by, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const createBooking = db.transaction(() => {
    bookingInsert.run(
    id,
    bookingNumber,
    student_id,
    course_id,
    session_id || null,
    now.slice(0, 10),
    bookingStatus,
    totalAmount,
    bookingCurrency,
    paymentStatus,
    course.prerequisites?.trim() ? 1 : 0,
    Number(assigned_buoy),
    notes || null,
    req.user!.id,
    now,
    now
  );

    invoiceInsert.run(
      invoiceId,
      invoiceNumber,
      student_id,
      id,
      now.slice(0, 10),
      now.slice(0, 10),
      bookingCurrency,
      totalAmount,
      totalAmount,
      depositAmount,
      invoiceStatus,
      `Automatic invoice for ${course.title} booking ${bookingNumber}`,
      req.user!.id,
      now,
      now
    );

    itemInsert.run(`item_${invoiceId}`, invoiceId, course.title, totalAmount, totalAmount);
    paymentInsert.run(
      'pay_' + crypto.randomUUID().slice(0, 10),
      invoiceId,
      depositAmount,
      bookingCurrency,
      payment_method,
      payment_date,
      req.user!.id,
      now,
    );

    if (isRasMohamed && currentEnrolled + 1 >= safetyRules.ras_mohamed_min_participants) {
      const pendingBookings = db.prepare(`
        SELECT b.id, b.price, b.prerequisites_verified, b.assigned_buoy, s.medical_waiver_signed,
               s.medical_waiver_date, s.medical_clearance_status, c.prerequisites,
               cs.location, cs.buoy_count,
               COALESCE(SUM(p.amount), 0) AS paid_amount
        FROM bookings b
        JOIN students s ON s.id = b.student_id
        JOIN courses c ON c.id = b.course_id
        JOIN course_sessions cs ON cs.id = b.session_id
        LEFT JOIN invoices i ON i.booking_id = b.id
        LEFT JOIN payments p ON p.invoice_id = i.id
        WHERE b.session_id = ? AND b.status != 'cancelled'
        GROUP BY b.id
      `).all(session_id) as Array<{
        id: string; price: number; prerequisites_verified: number; assigned_buoy: number | null;
        medical_waiver_signed: number; medical_waiver_date: string | null;
        medical_clearance_status: string; prerequisites: string | null;
        location: string; buoy_count: number; paid_amount: number;
      }>;
      const participantCount = (db.prepare("SELECT COUNT(DISTINCT student_id) AS count FROM bookings WHERE session_id = ? AND status != 'cancelled'").get(session_id) as { count: number }).count;
      const buoyOccupancies = db.prepare(`
        SELECT assigned_buoy, COUNT(DISTINCT student_id) AS count
        FROM bookings WHERE session_id = ? AND status != 'cancelled'
        GROUP BY assigned_buoy
      `).all(session_id) as Array<{ assigned_buoy: number | null; count: number }>;
      const occupancyByBuoy = new Map(
        buoyOccupancies
          .filter((occupancy): occupancy is { assigned_buoy: number; count: number } => occupancy.assigned_buoy !== null)
          .map((occupancy) => [occupancy.assigned_buoy, occupancy.count]),
      );
      const groupIssues = pendingBookings.flatMap((booking) => getBookingSafetyIssues(
        booking,
        booking,
        booking,
        booking.assigned_buoy,
        booking.assigned_buoy === null ? 0 : occupancyByBuoy.get(booking.assigned_buoy) || 0,
        booking.price,
        booking.paid_amount,
        booking.prerequisites_verified === 1,
        safetyRules,
      ));
      if (groupIssues.length === 0 && participantCount >= safetyRules.ras_mohamed_min_participants) {
        db.prepare("UPDATE bookings SET status = 'confirmed', updated_at = ? WHERE session_id = ? AND status = 'pending'")
          .run(now, session_id);
        finalBookingStatus = 'confirmed';
      }
    }
  });
  createBooking();

  logAudit({
    userId: req.user!.id,
    userEmail: req.user!.email,
    userRole: req.user!.role,
    action: 'CREATE_BOOKING',
    entityType: 'BOOKING',
    entityId: id,
    details: { bookingNumber, student_id, course_id, price: totalAmount, deposit_amount: depositAmount, status: finalBookingStatus },
    ip: req.ip,
  });

  res.status(201).json({
    id,
    bookingNumber,
    invoiceId,
    status: finalBookingStatus,
    message: finalBookingStatus === 'confirmed'
      ? 'Booking confirmed and deposit recorded'
      : `Booking is pending until at least ${safetyRules.ras_mohamed_min_participants} participants are enrolled for Ras Mohamed`,
  });
});

apiRouter.patch('/bookings/:id', requireAuth, requireRole(['owner', 'operations_manager', 'front_desk_crm']), (req: Request, res: Response): void => {
  const { id } = req.params;
  const { status, notes, session_id, assigned_buoy } = req.body;
  if (req.body.payment_status !== undefined) {
    res.status(400).json({ error: 'Payment status is derived from recorded invoice payments' });
    return;
  }
  const booking = db.prepare(`
    SELECT b.*, s.medical_waiver_signed, s.medical_waiver_date,
           s.medical_clearance_status, c.prerequisites, cs.location, cs.buoy_count,
           cs.max_capacity, cs.status AS session_status,
           COALESCE((SELECT SUM(p.amount) FROM invoices i JOIN payments p ON p.invoice_id = i.id WHERE i.booking_id = b.id), 0) AS paid_amount
    FROM bookings b
    JOIN students s ON s.id = b.student_id
    JOIN courses c ON c.id = b.course_id
    JOIN course_sessions cs ON cs.id = COALESCE(?, b.session_id)
    WHERE b.id = ?
  `).get(session_id || null, id) as any;
  if (!booking) {
    res.status(404).json({ error: 'Booking or scheduled session not found' });
    return;
  }
  if (status !== undefined && !['pending', 'confirmed', 'attended', 'certified', 'cancelled'].includes(status)) {
    res.status(400).json({ error: 'Invalid booking status' });
    return;
  }
  if (session_id !== undefined && session_id !== booking.session_id) {
    res.status(409).json({ error: 'Moving an existing booking to another session is not supported by the safety gate' });
    return;
  }
  const effectiveBuoy = assigned_buoy === undefined ? booking.assigned_buoy : Number(assigned_buoy);
  let safetyRules: BookingSafetyRules | null = null;
  if (assigned_buoy !== undefined) {
    safetyRules = getBookingSafetyRules();
    if (!safetyRules) {
      res.status(503).json({ error: 'Booking safety configuration is invalid; an owner must correct it before changing buoy assignments' });
      return;
    }
    if (!Number.isInteger(effectiveBuoy) || effectiveBuoy < 1 || effectiveBuoy > booking.buoy_count) {
      res.status(400).json({ error: 'Choose a buoy number within the session buoy count' });
      return;
    }
    const otherOccupants = (db.prepare(`
      SELECT COUNT(DISTINCT student_id) AS count FROM bookings
      WHERE session_id = ? AND assigned_buoy = ? AND status != 'cancelled' AND id != ?
    `).get(booking.session_id, effectiveBuoy, id) as { count: number }).count;
    if (otherOccupants + 1 > safetyRules.max_divers_per_buoy) {
      res.status(409).json({ error: `Buoy ${effectiveBuoy} is full (maximum ${safetyRules.max_divers_per_buoy} divers)` });
      return;
    }
  }
  if (status !== undefined && ['confirmed', 'attended', 'certified'].includes(status)) {
    safetyRules = safetyRules || getBookingSafetyRules();
    if (!safetyRules) {
      res.status(503).json({ error: 'Booking safety configuration is invalid; an owner must correct it before bookings can be confirmed' });
      return;
    }
    const buoyOccupancy = Number.isInteger(effectiveBuoy) && effectiveBuoy !== null
      ? (db.prepare(`
        SELECT COUNT(DISTINCT student_id) AS count FROM bookings
        WHERE session_id = ? AND assigned_buoy = ? AND status != 'cancelled'
      `).get(booking.session_id, effectiveBuoy) as { count: number }).count
      : 0;
    const safetyIssues = getBookingSafetyIssues(
      booking,
      booking,
      booking,
      effectiveBuoy,
      buoyOccupancy,
      booking.price,
      booking.paid_amount,
      booking.prerequisites_verified === 1,
      safetyRules,
    );
    if (safetyIssues.length > 0) {
      res.status(409).json({ error: 'Booking blocked by safety gate', blockers: safetyIssues });
      return;
    }
    const activeCount = (db.prepare("SELECT COUNT(DISTINCT student_id) AS count FROM bookings WHERE session_id = ? AND status != 'cancelled'").get(booking.session_id) as { count: number }).count;
    if (/\bras\s+mohamed\b/i.test(booking.location) && activeCount < safetyRules.ras_mohamed_min_participants) {
      res.status(409).json({ error: `Ras Mohamed bookings require at least ${safetyRules.ras_mohamed_min_participants} participants before confirmation` });
      return;
    }
  }

  const updates: string[] = ['updated_at = ?'];
  const values: any[] = [new Date().toISOString()];

  if (status !== undefined) { updates.push('status = ?'); values.push(status); }
  if (notes !== undefined) { updates.push('notes = ?'); values.push(notes); }
  if (session_id !== undefined) { updates.push('session_id = ?'); values.push(session_id || null); }
  if (assigned_buoy !== undefined) { updates.push('assigned_buoy = ?'); values.push(Number(assigned_buoy)); }

  values.push(id);
  db.prepare(`UPDATE bookings SET ${updates.join(', ')} WHERE id = ?`).run(...values);

  res.json({ message: 'Booking updated' });
});

// ==========================================
// 6. DAILY DAHAB ACTIVITY BOARD & OCEAN OPS
// ==========================================

apiRouter.get('/activities', requireAuth, (req: Request, res: Response): void => {
  const { date } = req.query;
  let query = `
    SELECT a.*, u.full_name as lead_instructor_name
    FROM daily_activities a
    LEFT JOIN users u ON a.lead_instructor_id = u.id
  `;
  const params: any[] = [];
  if (date) {
    query += ' WHERE a.activity_date = ?';
    params.push(date);
  }
  query += ' ORDER BY a.activity_date DESC, a.start_time ASC';

  const activities = db.prepare(query).all(...params) as any[];

  // Attach participant rosters to each activity
  const getParticipants = db.prepare(`
    SELECT ap.*, s.first_name, s.last_name, s.certification_agency, s.certification_level, s.medical_waiver_signed
    FROM activity_participants ap
    JOIN students s ON ap.student_id = s.id
    WHERE ap.activity_id = ?
  `);

  const enriched = activities.map((act) => ({
    ...act,
    participants: getParticipants.all(act.id),
  }));

  res.json(enriched);
});

apiRouter.post('/activities', requireAuth, requireRole(['owner', 'operations_manager', 'instructor']), (req: Request, res: Response): void => {
  const {
    title,
    activity_type,
    location,
    activity_date,
    start_time,
    end_time,
    lead_instructor_id,
    safety_diver_name,
    max_depth_target,
    max_pax,
    sea_conditions,
    notes,
  } = req.body;

  if (!title || !location || !activity_date || !start_time || !end_time) {
    res.status(400).json({ error: 'Title, location, date, start time, and end time are required' });
    return;
  }

  const id = 'act_' + crypto.randomUUID().slice(0, 10);
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO daily_activities (
      id, title, activity_type, location, activity_date, start_time, end_time,
      lead_instructor_id, safety_diver_name, max_depth_target, max_pax, current_pax,
      status, sea_conditions, notes, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 'planned', ?, ?, ?)
  `).run(
    id,
    title,
    activity_type || 'depth_training',
    location,
    activity_date,
    start_time,
    end_time,
    lead_instructor_id || null,
    safety_diver_name || null,
    Number(max_depth_target) || 0,
    Number(max_pax) || 6,
    sea_conditions || 'Calm, 24°C, 30m visibility',
    notes || null,
    now
  );

  res.status(201).json({ id, message: 'Dahab ocean activity scheduled' });
});

apiRouter.patch('/activities/:id', requireAuth, (req: Request, res: Response): void => {
  const { id } = req.params;
  const { status, sea_conditions, notes, lead_instructor_id, safety_diver_name, current_pax } = req.body;
  const activity = db.prepare('SELECT location FROM daily_activities WHERE id = ?').get(id) as { location: string } | undefined;
  if (!activity) {
    res.status(404).json({ error: 'Activity not found' });
    return;
  }
  if (status === 'in_water' && /\bras\s+mohamed\b/i.test(activity.location)) {
    const safetyRules = getBookingSafetyRules();
    if (!safetyRules) {
      res.status(503).json({ error: 'Booking safety configuration is invalid; an owner must correct it before ocean activities can start' });
      return;
    }
    const participants = (db.prepare(`
      SELECT COUNT(DISTINCT student_id) AS count FROM activity_participants
      WHERE activity_id = ? AND attendance_status != 'no_show'
    `).get(id) as { count: number }).count;
    if (participants < safetyRules.ras_mohamed_min_participants) {
      res.status(409).json({ error: `Ras Mohamed activities require at least ${safetyRules.ras_mohamed_min_participants} registered participants before entering the water` });
      return;
    }
  }

  const updates: string[] = [];
  const values: any[] = [];

  if (status !== undefined) { updates.push('status = ?'); values.push(status); }
  if (sea_conditions !== undefined) { updates.push('sea_conditions = ?'); values.push(sea_conditions); }
  if (notes !== undefined) { updates.push('notes = ?'); values.push(notes); }
  if (lead_instructor_id !== undefined) { updates.push('lead_instructor_id = ?'); values.push(lead_instructor_id); }
  if (safety_diver_name !== undefined) { updates.push('safety_diver_name = ?'); values.push(safety_diver_name); }
  if (current_pax !== undefined) { updates.push('current_pax = ?'); values.push(Number(current_pax)); }

  if (updates.length === 0) {
    res.json({ message: 'No updates provided' });
    return;
  }

  values.push(id);
  db.prepare(`UPDATE daily_activities SET ${updates.join(', ')} WHERE id = ?`).run(...values);
  res.json({ message: 'Activity board updated' });
});

apiRouter.post('/activities/:id/participants', requireAuth, (req: Request, res: Response): void => {
  const { id } = req.params;
  const { student_id, attendance_status, depth_achieved, notes } = req.body;

  if (!student_id) {
    res.status(400).json({ error: 'Student ID required' });
    return;
  }
  const activity = db.prepare('SELECT max_pax FROM daily_activities WHERE id = ?').get(id) as { max_pax: number } | undefined;
  if (!activity) {
    res.status(404).json({ error: 'Activity not found' });
    return;
  }
  const existing = db.prepare('SELECT id FROM activity_participants WHERE activity_id = ? AND student_id = ?').get(id, student_id);
  if (existing) {
    res.status(409).json({ error: 'This student is already registered for the activity' });
    return;
  }
  const currentParticipants = (db.prepare(`
    SELECT COUNT(DISTINCT student_id) AS count FROM activity_participants
    WHERE activity_id = ? AND attendance_status != 'no_show'
  `).get(id) as { count: number }).count;
  if (currentParticipants >= activity.max_pax) {
    res.status(409).json({ error: `Activity is full (Capacity: ${activity.max_pax} participants)` });
    return;
  }

  const partId = 'ap_' + crypto.randomUUID().slice(0, 10);
  db.prepare(`
    INSERT INTO activity_participants (id, activity_id, student_id, attendance_status, depth_achieved, notes)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(partId, id, student_id, attendance_status || 'checked_in', Number(depth_achieved) || 0, notes || null);

  // Update current_pax count
  const count = (db.prepare('SELECT COUNT(*) as c FROM activity_participants WHERE activity_id = ?').get(id) as any).c;
  db.prepare('UPDATE daily_activities SET current_pax = ? WHERE id = ?').run(count, id);

  res.status(201).json({ id: partId, message: 'Participant added to ocean session' });
});

// ==========================================
// 7. FINANCE & BILLING MODULE (Strict Auth)
// ==========================================

const customerRequestRoles: Array<'owner' | 'finance' | 'front_desk_crm'> = ['owner', 'finance', 'front_desk_crm'];
const customerRequestCategories = new Set(['course', 'package', 'accommodation', 'activity', 'workshop', 'training', 'gear_rental', 'shop', 'other']);
const billingCurrencies = new Set(['EUR', 'EGP', 'USD']);
const paymentMethods = new Set(['Cash EUR', 'Cash EGP', 'Cash USD', 'Credit Card', 'Bank Transfer', 'InstaPay Egypt']);

function isValidDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function isValidCashMethod(method: unknown, currency: string): boolean {
  return typeof method === 'string' &&
    paymentMethods.has(method) &&
    (!method.startsWith('Cash ') || method === `Cash ${currency}`);
}

apiRouter.get('/customer-requests', requireAuth, requireRole(customerRequestRoles), (req: Request, res: Response): void => {
  const requests = db.prepare(`
    SELECT cr.id AS request_id, cr.request_number, cr.special_request,
           inv.*, s.first_name, s.last_name, s.email AS student_email, s.phone AS student_phone
    FROM customer_requests cr
    JOIN invoices inv ON cr.invoice_id = inv.id
    JOIN students s ON inv.student_id = s.id
    ORDER BY cr.created_at DESC
    LIMIT 250
  `).all() as any[];

  if (requests.length === 0) {
    res.json([]);
    return;
  }

  const invoiceIds = requests.map((request) => request.id);
  const placeholders = invoiceIds.map(() => '?').join(', ');
  const items = db.prepare(`SELECT * FROM invoice_items WHERE invoice_id IN (${placeholders})`).all(...invoiceIds) as any[];
  const payments = db.prepare(`
    SELECT * FROM payments
    WHERE invoice_id IN (${placeholders})
    ORDER BY payment_date DESC, created_at DESC
  `).all(...invoiceIds) as any[];
  const itemsByInvoice = new Map<string, any[]>();
  const paymentsByInvoice = new Map<string, any[]>();

  for (const item of items) {
    const invoiceItems = itemsByInvoice.get(item.invoice_id) || [];
    invoiceItems.push(item);
    itemsByInvoice.set(item.invoice_id, invoiceItems);
  }
  for (const payment of payments) {
    const invoicePayments = paymentsByInvoice.get(payment.invoice_id) || [];
    invoicePayments.push(payment);
    paymentsByInvoice.set(payment.invoice_id, invoicePayments);
  }

  res.json(requests.map((request) => ({
    ...request,
    items: itemsByInvoice.get(request.id) || [],
    payments: paymentsByInvoice.get(request.id) || [],
  })));
});

apiRouter.post('/customer-requests', requireAuth, requireRole(customerRequestRoles), (req: Request, res: Response): void => {
  const {
    student_id,
    currency,
    due_date,
    special_request,
    items,
    initial_payment,
  } = req.body || {};

  if (typeof student_id !== 'string' || !student_id.trim()) {
    res.status(400).json({ error: 'Select a customer' });
    return;
  }
  if (!billingCurrencies.has(currency)) {
    res.status(400).json({ error: 'Currency must be EUR, EGP, or USD' });
    return;
  }
  if (!isValidDate(due_date)) {
    res.status(400).json({ error: 'A valid payment due date is required' });
    return;
  }
  if (typeof special_request !== 'undefined' && (typeof special_request !== 'string' || special_request.length > 2000)) {
    res.status(400).json({ error: 'Special request must be 2000 characters or fewer' });
    return;
  }
  if (!Array.isArray(items) || items.length === 0 || items.length > 30) {
    res.status(400).json({ error: 'Add between 1 and 30 request items' });
    return;
  }
  if (!initial_payment || typeof initial_payment !== 'object') {
    res.status(400).json({ error: 'A deposit is required to record a customer request' });
    return;
  }
  if (!isValidCashMethod(initial_payment.payment_method, currency) || !isValidDate(initial_payment.payment_date)) {
    res.status(400).json({ error: 'Choose a valid payment method and date' });
    return;
  }
  if (
    (typeof initial_payment.reference_number !== 'undefined' && typeof initial_payment.reference_number !== 'string') ||
    (typeof initial_payment.notes !== 'undefined' && typeof initial_payment.notes !== 'string')
  ) {
    res.status(400).json({ error: 'Payment reference and notes must be text' });
    return;
  }
  if ((initial_payment.reference_number || '').length > 100) {
    res.status(400).json({ error: 'Payment reference must be 100 characters or fewer' });
    return;
  }
  if ((initial_payment.notes || '').length > 500) {
    res.status(400).json({ error: 'Payment notes must be 500 characters or fewer' });
    return;
  }

  const student = db.prepare('SELECT id FROM students WHERE id = ?').get(student_id) as { id: string } | undefined;
  if (!student) {
    res.status(404).json({ error: 'Customer not found' });
    return;
  }

  const normalizedItems: Array<{
    category: string;
    description: string;
    quantity: number;
    unitPrice: number;
    total: number;
    equipmentId?: string;
    expectedReturn?: string;
    conditionOut?: string;
  }> = [];
  let totalCents = 0;
  for (const item of items) {
    let description = typeof item?.description === 'string' ? item.description.trim() : '';
    const category = item?.category;
    const quantity = Number(item?.quantity);
    const unitPrice = Number(item?.unit_price);
    if (
      !customerRequestCategories.has(category) ||
      !description ||
      description.length > 200 ||
      !Number.isInteger(quantity) ||
      quantity < 1 ||
      quantity > 1000 ||
      !Number.isFinite(unitPrice) ||
      unitPrice <= 0 ||
      unitPrice > 10_000_000
    ) {
      res.status(400).json({ error: 'Each item needs a valid category, description, quantity, and unit price' });
      return;
    }

    let equipmentId: string | undefined;
    let expectedReturn: string | undefined;
    let conditionOut: string | undefined;
    if (item?.equipment_id !== undefined) {
      if (
        typeof item.equipment_id !== 'string' ||
        !item.equipment_id.trim() ||
        (category !== 'shop' && category !== 'gear_rental') ||
        !isValidDate(item.expected_return) ||
        item.expected_return < new Date().toISOString().slice(0, 10)
      ) {
        res.status(400).json({ error: 'A valid rental item and expected return date are required' });
        return;
      }

      const equipment = db.prepare(`
        SELECT id, item_name, size, condition, quantity_available
        FROM equipment
        WHERE id = ?
      `).get(item.equipment_id) as {
        id: string;
        item_name: string;
        size: string | null;
        condition: string;
        quantity_available: number;
      } | undefined;
      if (!equipment) {
        res.status(404).json({ error: 'Rental equipment not found' });
        return;
      }
      if (quantity > equipment.quantity_available) {
        res.status(409).json({ error: `Only ${equipment.quantity_available} unit(s) of ${equipment.item_name} are available` });
        return;
      }

      equipmentId = equipment.id;
      expectedReturn = item.expected_return;
      conditionOut = equipment.condition;
      description = `Gear rental — ${equipment.item_name}${equipment.size ? ` (${equipment.size})` : ''}`;
    } else if (item?.expected_return !== undefined) {
      res.status(400).json({ error: 'An expected return date can only be set for a gear rental' });
      return;
    }

    const roundedUnitPrice = Math.round(unitPrice * 100) / 100;
    const lineTotalCents = Math.round(roundedUnitPrice * quantity * 100);
    totalCents += lineTotalCents;
    normalizedItems.push({
      category,
      description,
      quantity,
      unitPrice: roundedUnitPrice,
      total: lineTotalCents / 100,
      equipmentId,
      expectedReturn,
      conditionOut,
    });
  }

  const rentalQuantities = new Map<string, number>();
  for (const item of normalizedItems) {
    if (item.equipmentId) {
      rentalQuantities.set(item.equipmentId, (rentalQuantities.get(item.equipmentId) || 0) + item.quantity);
    }
  }
  for (const [equipmentId, quantity] of rentalQuantities) {
    const equipment = db.prepare('SELECT item_name, quantity_available FROM equipment WHERE id = ?').get(equipmentId) as {
      item_name: string;
      quantity_available: number;
    };
    if (quantity > equipment.quantity_available) {
      res.status(409).json({ error: `Only ${equipment.quantity_available} unit(s) of ${equipment.item_name} are available` });
      return;
    }
  }

  const depositCents = Math.round(Number(initial_payment.amount) * 100);
  const minimumDepositCents = Math.ceil(totalCents * 0.3);
  if (!Number.isFinite(depositCents) || depositCents < minimumDepositCents || depositCents > totalCents) {
    res.status(400).json({ error: 'Deposit must be at least 30% of the request total and no more than the total' });
    return;
  }

  const now = new Date().toISOString();
  const invoiceId = `inv_${crypto.randomUUID()}`;
  const invoiceNumber = `INV-${now.slice(0, 4)}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
  const requestId = `req_${crypto.randomUUID()}`;
  const requestNumber = `CR-${now.slice(0, 4)}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
  const paymentId = `pmt_${crypto.randomUUID()}`;
  const totalAmount = totalCents / 100;
  const depositAmount = depositCents / 100;
  const invoiceStatus = depositCents === totalCents ? 'paid' : 'partially_paid';
  const issueDate = now.slice(0, 10);

  const createRequest = db.transaction(() => {
    db.prepare(`
      INSERT INTO invoices (
        id, invoice_number, student_id, issue_date, due_date, currency,
        subtotal, tax_rate, tax_amount, total_amount, paid_amount, status,
        notes, created_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      invoiceId,
      invoiceNumber,
      student_id,
      issueDate,
      due_date,
      currency,
      totalAmount,
      totalAmount,
      depositAmount,
      invoiceStatus,
      special_request?.trim() || null,
      req.user!.id,
      now,
      now,
    );

    db.prepare(`
      INSERT INTO customer_requests (
        id, request_number, invoice_id, special_request, created_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(requestId, requestNumber, invoiceId, special_request?.trim() || null, req.user!.id, now, now);

    const insertItem = db.prepare(`
      INSERT INTO invoice_items (id, invoice_id, category, description, quantity, unit_price, total_price)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    normalizedItems.forEach((item, index) => {
      insertItem.run(`item_${invoiceId}_${index}`, invoiceId, item.category, item.description, item.quantity, item.unitPrice, item.total);
    });

    for (const item of normalizedItems) {
      if (!item.equipmentId) continue;

      const reserved = db.prepare(`
        UPDATE equipment
        SET quantity_available = quantity_available - ?, updated_at = ?
        WHERE id = ? AND quantity_available >= ?
      `).run(item.quantity, now, item.equipmentId, item.quantity);
      if (reserved.changes !== 1) {
        const conflict = new Error('RENTAL_STOCK_CONFLICT');
        conflict.name = 'RentalStockConflict';
        throw conflict;
      }

      const insertCheckout = db.prepare(`
        INSERT INTO equipment_checkouts (
          id, equipment_id, student_id, instructor_id, checkout_time, expected_return,
          condition_out, notes, created_at
        ) VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?)
      `);
      for (let unit = 0; unit < item.quantity; unit += 1) {
        insertCheckout.run(
          `chk_${crypto.randomUUID()}`,
          item.equipmentId,
          student_id,
          now,
          item.expectedReturn,
          item.conditionOut || 'good',
          `Rental billed on ${requestNumber}`,
          now,
        );
      }
    }

    db.prepare(`
      INSERT INTO payments (
        id, invoice_id, amount, currency, payment_method, payment_date,
        reference_number, notes, recorded_by, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      paymentId,
      invoiceId,
      depositAmount,
      currency,
      initial_payment.payment_method,
      initial_payment.payment_date,
      initial_payment.reference_number?.trim() || null,
      initial_payment.notes?.trim() || null,
      req.user!.id,
      now,
    );
  });

  try {
    createRequest();
  } catch (error) {
    if (error instanceof Error && error.name === 'RentalStockConflict') {
      res.status(409).json({ error: 'Rental inventory changed while saving. Review availability and try again.' });
      return;
    }
    throw error;
  }
  logAudit({
    userId: req.user!.id,
    userEmail: req.user!.email,
    userRole: req.user!.role,
    action: 'CREATE_CUSTOMER_REQUEST',
    entityType: 'CUSTOMER_REQUEST',
    entityId: requestId,
    details: { requestNumber, invoiceId, student_id, totalAmount, depositAmount, currency },
    ip: req.ip,
  });

  res.status(201).json({
    id: requestId,
    requestNumber,
    invoiceId,
    invoiceNumber,
    rentalUnits: normalizedItems.reduce((sum, item) => sum + (item.equipmentId ? item.quantity : 0), 0),
    message: 'Customer request recorded',
  });
});

apiRouter.post('/customer-requests/:id/payments', requireAuth, requireRole(customerRequestRoles), (req: Request, res: Response): void => {
  const requestId = req.params.id;
  const { amount, payment_method, payment_date, reference_number, notes } = req.body || {};
  const request = db.prepare(`
    SELECT cr.id, cr.request_number, inv.id AS invoice_id, inv.currency,
           inv.total_amount, inv.paid_amount, inv.status
    FROM customer_requests cr
    JOIN invoices inv ON cr.invoice_id = inv.id
    WHERE cr.id = ?
  `).get(requestId) as any;

  if (!request) {
    res.status(404).json({ error: 'Customer request not found' });
    return;
  }
  if (!isValidCashMethod(payment_method, request.currency) || !isValidDate(payment_date)) {
    res.status(400).json({ error: 'Choose a valid payment method and date' });
    return;
  }
  if (
    (typeof reference_number !== 'undefined' && typeof reference_number !== 'string') ||
    (typeof notes !== 'undefined' && typeof notes !== 'string')
  ) {
    res.status(400).json({ error: 'Payment reference and notes must be text' });
    return;
  }
  if ((reference_number || '').length > 100) {
    res.status(400).json({ error: 'Payment reference must be 100 characters or fewer' });
    return;
  }
  if ((notes || '').length > 500) {
    res.status(400).json({ error: 'Payment notes must be 500 characters or fewer' });
    return;
  }

  const paymentCents = Math.round(Number(amount) * 100);
  const balanceCents = Math.round((request.total_amount - request.paid_amount) * 100);
  if (!Number.isFinite(paymentCents) || paymentCents <= 0 || paymentCents > balanceCents) {
    res.status(400).json({ error: 'Payment must be greater than zero and no more than the outstanding balance' });
    return;
  }

  const paymentId = `pmt_${crypto.randomUUID()}`;
  const now = new Date().toISOString();
  const newPaidAmount = (Math.round(request.paid_amount * 100) + paymentCents) / 100;
  const newStatus = newPaidAmount >= request.total_amount ? 'paid' : 'partially_paid';
  const recordPayment = db.transaction(() => {
    db.prepare(`
      INSERT INTO payments (
        id, invoice_id, amount, currency, payment_method, payment_date,
        reference_number, notes, recorded_by, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      paymentId,
      request.invoice_id,
      paymentCents / 100,
      request.currency,
      payment_method,
      payment_date,
      reference_number?.trim() || null,
      notes?.trim() || null,
      req.user!.id,
      now,
    );
    db.prepare('UPDATE invoices SET paid_amount = ?, status = ?, updated_at = ? WHERE id = ?')
      .run(newPaidAmount, newStatus, now, request.invoice_id);
    db.prepare('UPDATE customer_requests SET updated_at = ? WHERE id = ?').run(now, requestId);
  });

  recordPayment();
  logAudit({
    userId: req.user!.id,
    userEmail: req.user!.email,
    userRole: req.user!.role,
    action: 'RECORD_CUSTOMER_REQUEST_PAYMENT',
    entityType: 'PAYMENT',
    entityId: paymentId,
    details: { requestId, requestNumber: request.request_number, amount: paymentCents / 100, newPaidAmount, newStatus },
    ip: req.ip,
  });

  res.status(201).json({ paymentId, newPaidAmount, status: newStatus, message: 'Payment recorded in customer bill and income ledger' });
});

apiRouter.get('/finance/invoices', requireAuth, requireRole(['owner', 'finance']), (req: Request, res: Response): void => {
  const invoices = db.prepare(`
    SELECT inv.*, s.first_name, s.last_name, s.email as student_email,
           s.phone as student_phone,
           cr.request_number AS customer_request_number
    FROM invoices inv
    JOIN students s ON inv.student_id = s.id
    LEFT JOIN customer_requests cr ON cr.invoice_id = inv.id
    ORDER BY inv.issue_date DESC
  `).all() as any[];

  const getItems = db.prepare('SELECT * FROM invoice_items WHERE invoice_id = ?');
  const getPayments = db.prepare('SELECT * FROM payments WHERE invoice_id = ? ORDER BY payment_date DESC');

  const enriched = invoices.map(inv => ({
    ...inv,
    items: getItems.all(inv.id),
    payments: getPayments.all(inv.id),
  }));

  res.json(enriched);
});

apiRouter.patch('/finance/invoices/:id', requireAuth, requireRole(['owner', 'finance']), (req: Request, res: Response): void => {
  const { id } = req.params;
  const { issue_date, due_date, tax_rate, notes, items } = req.body || {};
  const invoice = db.prepare('SELECT id, paid_amount, currency, status FROM invoices WHERE id = ?').get(id) as {
    id: string;
    paid_amount: number;
    currency: string;
    status: string;
  } | undefined;

  if (!invoice) {
    res.status(404).json({ error: 'Invoice not found' });
    return;
  }
  if (invoice.status === 'cancelled') {
    res.status(409).json({ error: 'Cancelled invoices cannot be edited' });
    return;
  }
  if (!isValidDate(issue_date) || !isValidDate(due_date) || due_date < issue_date) {
    res.status(400).json({ error: 'Enter valid invoice and due dates; the due date cannot be before the invoice date' });
    return;
  }
  if (typeof tax_rate !== 'number' || !Number.isFinite(tax_rate) || tax_rate < 0 || tax_rate > 100) {
    res.status(400).json({ error: 'Tax rate must be between 0 and 100%' });
    return;
  }
  if (typeof notes !== 'string' || notes.length > 2000) {
    res.status(400).json({ error: 'Invoice notes must be 2000 characters or fewer' });
    return;
  }
  if (!Array.isArray(items) || items.length === 0 || items.length > 30) {
    res.status(400).json({ error: 'An invoice must contain between 1 and 30 service items' });
    return;
  }

  const normalizedItems: Array<{ category: string; description: string; quantity: number; unitPrice: number; totalCents: number }> = [];
  let subtotalCents = 0;
  for (const item of items) {
    const category = item?.category;
    const description = typeof item?.description === 'string' ? item.description.trim() : '';
    const quantity = Number(item?.quantity);
    const unitPrice = Number(item?.unit_price);
    if (
      !customerRequestCategories.has(category) ||
      !description ||
      description.length > 200 ||
      !Number.isFinite(quantity) ||
      quantity <= 0 ||
      quantity > 1000 ||
      !Number.isFinite(unitPrice) ||
      unitPrice <= 0 ||
      unitPrice > 10_000_000
    ) {
      res.status(400).json({ error: 'Each service needs a valid category, description, quantity, and unit price' });
      return;
    }

    const roundedUnitPrice = Math.round(unitPrice * 100) / 100;
    const totalCents = Math.round(quantity * roundedUnitPrice * 100);
    subtotalCents += totalCents;
    normalizedItems.push({ category, description, quantity, unitPrice: roundedUnitPrice, totalCents });
  }

  const taxCents = Math.round(subtotalCents * tax_rate / 100);
  const totalCents = subtotalCents + taxCents;
  const paidCents = Math.round(invoice.paid_amount * 100);
  if (totalCents <= 0 || totalCents < paidCents) {
    res.status(409).json({ error: 'Invoice total cannot be less than payments already recorded' });
    return;
  }

  const subtotal = subtotalCents / 100;
  const taxAmount = taxCents / 100;
  const totalAmount = totalCents / 100;
  const paidAmount = paidCents / 100;
  const status = paidCents === totalCents ? 'paid' : paidCents > 0 ? 'partially_paid' : 'issued';
  const now = new Date().toISOString();
  const updateInvoice = db.transaction(() => {
    db.prepare(`
      UPDATE invoices
      SET issue_date = ?, due_date = ?, subtotal = ?, tax_rate = ?, tax_amount = ?,
          total_amount = ?, status = ?, notes = ?, updated_at = ?
      WHERE id = ?
    `).run(issue_date, due_date, subtotal, tax_rate, taxAmount, totalAmount, status, notes.trim() || null, now, id);

    db.prepare('DELETE FROM invoice_items WHERE invoice_id = ?').run(id);
    const insertItem = db.prepare(`
      INSERT INTO invoice_items (id, invoice_id, category, description, quantity, unit_price, total_price)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    normalizedItems.forEach((item, index) => {
      insertItem.run(
        `item_${id}_${index}_${crypto.randomUUID().slice(0, 8)}`,
        id,
        item.category,
        item.description,
        item.quantity,
        item.unitPrice,
        item.totalCents / 100,
      );
    });
    db.prepare('UPDATE customer_requests SET special_request = ?, updated_at = ? WHERE invoice_id = ?')
      .run(notes.trim() || null, now, id);
    if (invoice.status !== status) {
      db.prepare('UPDATE bookings SET payment_status = ? WHERE id IN (SELECT booking_id FROM invoices WHERE id = ?) AND booking_id IS NOT NULL')
        .run(status, id);
    }
  });
  updateInvoice();

  logAudit({
    userId: req.user!.id,
    userEmail: req.user!.email,
    userRole: req.user!.role,
    action: 'UPDATE_INVOICE',
    entityType: 'INVOICE',
    entityId: id,
    details: { subtotal, tax_rate, taxAmount, totalAmount, paidAmount, status },
    ip: req.ip,
  });

  res.json({ message: 'Invoice updated successfully', subtotal, tax_amount: taxAmount, total_amount: totalAmount, paid_amount: paidAmount, status });
});

apiRouter.post('/finance/invoices', requireAuth, requireRole(['owner', 'finance']), (req: Request, res: Response): void => {
  const { student_id, booking_id, issue_date, due_date, currency, tax_rate, items, notes } = req.body;
  if (!student_id || !items || !Array.isArray(items) || items.length === 0) {
    res.status(400).json({ error: 'Student and at least one line item are required' });
    return;
  }
  if (!billingCurrencies.has(currency || 'EUR')) {
    res.status(400).json({ error: 'Currency must be EUR, EGP, or USD' });
    return;
  }
  if (typeof tax_rate !== 'undefined' && (!Number.isFinite(Number(tax_rate)) || Number(tax_rate) < 0 || Number(tax_rate) > 100)) {
    res.status(400).json({ error: 'Tax rate must be between 0 and 100%' });
    return;
  }
  if (items.some((item: any) =>
    !item ||
    (item.category !== undefined && !customerRequestCategories.has(item.category)) ||
    typeof item.description !== 'string' ||
    !item.description.trim() ||
    item.description.trim().length > 200 ||
    !Number.isFinite(Number(item.quantity)) ||
    Number(item.quantity) <= 0 ||
    Number(item.quantity) > 1000 ||
    !Number.isFinite(Number(item.unit_price)) ||
    Number(item.unit_price) <= 0 ||
    Number(item.unit_price) > 10_000_000
  )) {
    res.status(400).json({ error: 'Each service needs a valid category, description, quantity, and unit price' });
    return;
  }

  let subtotal = 0;
  for (const it of items) {
    subtotal += Number(it.quantity) * Number(it.unit_price);
  }

  const taxRate = Number(tax_rate) || 0;
  const taxAmount = (subtotal * taxRate) / 100;
  const totalAmount = subtotal + taxAmount;

  const id = 'inv_' + crypto.randomUUID().slice(0, 10);
  const invoiceNumber = 'INV-' + new Date().getFullYear() + '-' + Math.floor(1000 + Math.random() * 9000);
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO invoices (
      id, invoice_number, student_id, booking_id, issue_date, due_date,
      currency, subtotal, tax_rate, tax_amount, total_amount, paid_amount,
      status, notes, created_by, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 'issued', ?, ?, ?, ?)
  `).run(
    id,
    invoiceNumber,
    student_id,
    booking_id || null,
    issue_date || now.slice(0, 10),
    due_date || now.slice(0, 10),
    currency || 'EUR',
    subtotal,
    taxRate,
    taxAmount,
    totalAmount,
    notes || null,
    req.user!.id,
    now,
    now
  );

  const insertItem = db.prepare(`
    INSERT INTO invoice_items (id, invoice_id, category, description, quantity, unit_price, total_price)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const qty = Number(item.quantity);
    const unitPrice = Number(item.unit_price);
    insertItem.run(`item_${id}_${i}`, id, item.category || 'other', item.description.trim(), qty, unitPrice, qty * unitPrice);
  }

  logAudit({
    userId: req.user!.id,
    userEmail: req.user!.email,
    userRole: req.user!.role,
    action: 'CREATE_INVOICE',
    entityType: 'INVOICE',
    entityId: id,
    details: { invoiceNumber, student_id, totalAmount, currency: currency || 'EUR' },
    ip: req.ip,
  });

  res.status(201).json({ id, invoiceNumber, message: 'Invoice created successfully' });
});

apiRouter.post('/finance/invoices/:id/payments', requireAuth, requireRole(['owner', 'finance']), (req: Request, res: Response): void => {
  const { id } = req.params;
  const { amount, currency, payment_method, payment_date, reference_number, notes } = req.body;

  const invoice = db.prepare('SELECT * FROM invoices WHERE id = ?').get(id) as any;
  if (!invoice) {
    res.status(404).json({ error: 'Invoice not found' });
    return;
  }

  const pmtAmount = Number(amount);
  if (!pmtAmount || pmtAmount <= 0) {
    res.status(400).json({ error: 'Valid payment amount is required' });
    return;
  }

  const paymentId = 'pmt_' + crypto.randomUUID().slice(0, 10);
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO payments (id, invoice_id, amount, currency, payment_method, payment_date, reference_number, notes, recorded_by, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    paymentId,
    id,
    pmtAmount,
    currency || invoice.currency,
    payment_method || 'Cash EUR',
    payment_date || now.slice(0, 10),
    reference_number || null,
    notes || null,
    req.user!.id,
    now
  );

  const newPaidAmount = invoice.paid_amount + pmtAmount;
  let newStatus = invoice.status;
  if (newPaidAmount >= invoice.total_amount) {
    newStatus = 'paid';
  } else if (newPaidAmount > 0) {
    newStatus = 'partially_paid';
  }

  db.prepare(`
    UPDATE invoices
    SET paid_amount = ?, status = ?, updated_at = ?
    WHERE id = ?
  `).run(newPaidAmount, newStatus, now, id);

  // If this invoice is tied to a booking, keep booking payment_status synchronized!
  if (invoice.booking_id) {
    db.prepare('UPDATE bookings SET payment_status = ? WHERE id = ?').run(newStatus, invoice.booking_id);
  }

  logAudit({
    userId: req.user!.id,
    userEmail: req.user!.email,
    userRole: req.user!.role,
    action: 'RECORD_PAYMENT',
    entityType: 'PAYMENT',
    entityId: paymentId,
    details: { invoiceId: id, amount: pmtAmount, payment_method, newPaidAmount, newStatus },
    ip: req.ip,
  });

  res.status(201).json({ paymentId, newPaidAmount, status: newStatus, message: 'Payment recorded in ledger' });
});

apiRouter.get('/finance/expenses', requireAuth, requireRole(['owner', 'finance']), (req: Request, res: Response): void => {
  const expenses = db.prepare(`
    SELECT e.*, u.full_name as approved_by_name
    FROM expenses e
    LEFT JOIN users u ON e.approved_by = u.id
    ORDER BY e.expense_date DESC
  `).all();
  res.json(expenses);
});

apiRouter.post('/finance/expenses', requireAuth, requireRole(['owner', 'finance']), (req: Request, res: Response): void => {
  const { category, vendor_name, amount, currency, expense_date, description, receipt_ref } = req.body;
  if (!category || !vendor_name || !amount || !description) {
    res.status(400).json({ error: 'Category, vendor name, amount, and description are required' });
    return;
  }

  const id = 'exp_' + crypto.randomUUID().slice(0, 10);
  const expenseNumber = 'EXP-' + new Date().getFullYear() + '-' + Math.floor(100 + Math.random() * 900);
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO expenses (
      id, expense_number, category, vendor_name, amount, currency,
      expense_date, status, approved_by, description, receipt_ref, created_by, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'approved', ?, ?, ?, ?, ?)
  `).run(
    id,
    expenseNumber,
    category,
    vendor_name,
    Number(amount),
    currency || 'EGP',
    expense_date || now.slice(0, 10),
    req.user!.id,
    description,
    receipt_ref || null,
    req.user!.id,
    now
  );

  logAudit({
    userId: req.user!.id,
    userEmail: req.user!.email,
    userRole: req.user!.role,
    action: 'RECORD_EXPENSE',
    entityType: 'EXPENSE',
    entityId: id,
    details: { expenseNumber, category, vendor_name, amount, currency: currency || 'EGP' },
    ip: req.ip,
  });

  res.status(201).json({ id, expenseNumber, message: 'Expense recorded' });
});

const financeCurrencies = ['EUR', 'USD', 'EGP'] as const;
type FinanceCurrency = (typeof financeCurrencies)[number];
type FinanceOpeningBalances = Record<FinanceCurrency, number>;

function getFinanceOpeningBalances(): FinanceOpeningBalances | null {
  const stored = db.prepare("SELECT value FROM settings WHERE key = 'finance_opening_balances'").get() as { value: string } | undefined;
  if (!stored) return { EUR: 0, USD: 0, EGP: 0 };

  try {
    const parsed: unknown = JSON.parse(stored.value);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const balances = parsed as Record<string, unknown>;
    if (!financeCurrencies.every((currency) => typeof balances[currency] === 'number' && Number.isFinite(balances[currency]) && balances[currency] >= 0)) {
      return null;
    }
    return {
      EUR: Math.round((balances.EUR as number) * 100) / 100,
      USD: Math.round((balances.USD as number) * 100) / 100,
      EGP: Math.round((balances.EGP as number) * 100) / 100,
    };
  } catch {
    return null;
  }
}

apiRouter.get('/finance/cash-balances', requireAuth, requireRole(['owner', 'finance']), (_req: Request, res: Response): void => {
  const openingBalances = getFinanceOpeningBalances();
  if (!openingBalances) {
    res.status(503).json({ error: 'Saved opening cash balances are invalid; a finance manager must correct them' });
    return;
  }

  const incomeRows = db.prepare(`
    SELECT currency, SUM(amount) AS total
    FROM payments
    GROUP BY currency
  `).all() as Array<{ currency: string; total: number | null }>;
  const expenseRows = db.prepare(`
    SELECT currency, SUM(amount) AS total
    FROM expenses
    WHERE status != 'rejected'
    GROUP BY currency
  `).all() as Array<{ currency: string; total: number | null }>;
  const incomeByCurrency: FinanceOpeningBalances = { EUR: 0, USD: 0, EGP: 0 };
  const expensesByCurrency: FinanceOpeningBalances = { EUR: 0, USD: 0, EGP: 0 };
  for (const row of incomeRows) {
    if (financeCurrencies.includes(row.currency as FinanceCurrency)) {
      incomeByCurrency[row.currency as FinanceCurrency] = Math.round((row.total || 0) * 100) / 100;
    }
  }
  for (const row of expenseRows) {
    if (financeCurrencies.includes(row.currency as FinanceCurrency)) {
      expensesByCurrency[row.currency as FinanceCurrency] = Math.round((row.total || 0) * 100) / 100;
    }
  }
  const currentBalances = Object.fromEntries(financeCurrencies.map((currency) => [
    currency,
    Math.round((openingBalances[currency] + incomeByCurrency[currency] - expensesByCurrency[currency]) * 100) / 100,
  ])) as FinanceOpeningBalances;
  res.json({
    opening_balances: openingBalances,
    income_by_currency: incomeByCurrency,
    expenses_by_currency: expensesByCurrency,
    current_balances: currentBalances,
  });
});

apiRouter.patch('/finance/cash-balances', requireAuth, requireRole(['owner', 'finance']), (req: Request, res: Response): void => {
  const balances = req.body?.opening_balances;
  if (!balances || typeof balances !== 'object' || Array.isArray(balances) ||
      !financeCurrencies.every((currency) => typeof balances[currency] === 'number' && Number.isFinite(balances[currency]) && balances[currency] >= 0 && balances[currency] <= 1_000_000_000)) {
    res.status(400).json({ error: 'Opening balances must include non-negative EUR, USD, and EGP amounts' });
    return;
  }

  const openingBalances: FinanceOpeningBalances = {
    EUR: Math.round(balances.EUR * 100) / 100,
    USD: Math.round(balances.USD * 100) / 100,
    EGP: Math.round(balances.EGP * 100) / 100,
  };
  const now = new Date().toISOString();
  db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)')
    .run('finance_opening_balances', JSON.stringify(openingBalances));

  logAudit({
    userId: req.user!.id,
    userEmail: req.user!.email,
    userRole: req.user!.role,
    action: 'UPDATE_FINANCE_OPENING_BALANCES',
    entityType: 'SETTINGS',
    details: { currencies: financeCurrencies, updatedAt: now },
    ip: req.ip,
  });
  res.json({ opening_balances: openingBalances, message: 'Opening cash balances saved' });
});

apiRouter.get('/finance/summary', requireAuth, requireRole(['owner', 'finance']), (req: Request, res: Response): void => {
  // Aggregate revenue and expenses by currency
  const invoiceStats = db.prepare(`
    SELECT currency,
           COUNT(*) as invoice_count,
           SUM(total_amount) as total_invoiced,
           SUM(paid_amount) as total_collected,
           SUM(total_amount - paid_amount) as outstanding
    FROM invoices
    WHERE status != 'cancelled'
    GROUP BY currency
  `).all();

  const expenseStats = db.prepare(`
    SELECT currency,
           COUNT(*) as expense_count,
           SUM(amount) as total_expenses
    FROM expenses
    WHERE status != 'rejected'
    GROUP BY currency
  `).all();

  const overdueInvoices = db.prepare(`
    SELECT COUNT(*) as count, SUM(total_amount - paid_amount) as amount
    FROM invoices
    WHERE status IN ('issued', 'partially_paid') AND due_date < date('now')
  `).get();

  res.json({
    invoiceStats,
    expenseStats,
    overdueInvoices,
  });
});

// ==========================================
// 8. PAYROLL MODULE (Strict Auth: Owner, Finance, HR)
// ==========================================

apiRouter.get('/payroll/periods', requireAuth, requireRole(['owner', 'finance', 'hr']), (req: Request, res: Response): void => {
  const periods = db.prepare(`
    SELECT p.*, u.full_name as approved_by_name,
           (SELECT COUNT(*) FROM payroll_records r WHERE r.period_id = p.id) as staff_count,
           (SELECT SUM(gross_pay) FROM payroll_records r WHERE r.period_id = p.id) as total_gross,
           (SELECT SUM(net_pay) FROM payroll_records r WHERE r.period_id = p.id) as total_net
    FROM payroll_periods p
    LEFT JOIN users u ON p.approved_by = u.id
    ORDER BY p.start_date DESC
  `).all();
  res.json(periods);
});

apiRouter.post('/payroll/periods', requireAuth, requireRole(['owner', 'finance', 'hr']), (req: Request, res: Response): void => {
  const { period_name, start_date, end_date, notes } = req.body;
  if (!period_name || !start_date || !end_date) {
    res.status(400).json({ error: 'Period name, start date, and end date are required' });
    return;
  }

  const id = 'pr_' + crypto.randomUUID().slice(0, 10);
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO payroll_periods (id, period_name, start_date, end_date, status, notes, created_at)
    VALUES (?, ?, ?, ?, 'draft', ?, ?)
  `).run(id, period_name, start_date, end_date, notes || null, now);

  // Automatically generate draft records for all active staff
  const staff = db.prepare('SELECT id, role, monthly_salary, session_commission FROM users WHERE is_active = 1').all() as any[];
  const insertRecord = db.prepare(`
    INSERT INTO payroll_records (
      id, period_id, employee_id, base_salary, session_commission, sessions_taught,
      bonuses, deductions, gross_pay, tax_withholding, net_pay, currency, status, notes, created_at
    ) VALUES (?, ?, ?, ?, ?, 0, 0, 0, ?, 0, ?, 'EUR', 'pending', ?, ?)
  `);

  for (const s of staff) {
    const recId = 'rec_' + crypto.randomUUID().slice(0, 10);
    const base = s.monthly_salary || 0;
    insertRecord.run(
      recId,
      id,
      s.id,
      base,
      s.session_commission || 0,
      base,
      base,
      'Base monthly compensation draft',
      now
    );
  }

  logAudit({
    userId: req.user!.id,
    userEmail: req.user!.email,
    userRole: req.user!.role,
    action: 'CREATE_PAYROLL_PERIOD',
    entityType: 'PAYROLL',
    entityId: id,
    details: { period_name, start_date, end_date },
    ip: req.ip,
  });

  res.status(201).json({ id, message: 'Payroll period initialized for active staff' });
});

apiRouter.get('/payroll/records/:periodId', requireAuth, requireRole(['owner', 'finance', 'hr']), (req: Request, res: Response): void => {
  const { periodId } = req.params;
  const records = db.prepare(`
    SELECT r.*, u.full_name, u.role, u.email
    FROM payroll_records r
    JOIN users u ON r.employee_id = u.id
    WHERE r.period_id = ?
    ORDER BY u.full_name ASC
  `).all(periodId);
  res.json(records);
});

apiRouter.patch('/payroll/records/:id', requireAuth, requireRole(['owner', 'finance', 'hr']), (req: Request, res: Response): void => {
  const { id } = req.params;
  const { base_salary, sessions_taught, session_commission, bonuses, deductions, tax_withholding, notes, status } = req.body;

  const rec = db.prepare('SELECT * FROM payroll_records WHERE id = ?').get(id) as any;
  if (!rec) {
    res.status(404).json({ error: 'Payroll record not found' });
    return;
  }

  const base = base_salary !== undefined ? Number(base_salary) : rec.base_salary;
  const sessions = sessions_taught !== undefined ? Number(sessions_taught) : rec.sessions_taught;
  const commRate = session_commission !== undefined ? Number(session_commission) : rec.session_commission;
  const bonus = bonuses !== undefined ? Number(bonuses) : rec.bonuses;
  const deduct = deductions !== undefined ? Number(deductions) : rec.deductions;
  const tax = tax_withholding !== undefined ? Number(tax_withholding) : rec.tax_withholding;

  const totalCommission = sessions * commRate;
  const gross = base + totalCommission + bonus;
  const net = gross - deduct - tax;

  db.prepare(`
    UPDATE payroll_records
    SET base_salary = ?, sessions_taught = ?, session_commission = ?, bonuses = ?,
        deductions = ?, tax_withholding = ?, gross_pay = ?, net_pay = ?,
        notes = COALESCE(?, notes), status = COALESCE(?, status)
    WHERE id = ?
  `).run(base, sessions, commRate, bonus, deduct, tax, gross, net, notes || null, status || null, id);

  logAudit({
    userId: req.user!.id,
    userEmail: req.user!.email,
    userRole: req.user!.role,
    action: 'UPDATE_PAYROLL_RECORD',
    entityType: 'PAYROLL_RECORD',
    entityId: id,
    details: { gross, net, sessions, bonus, deduct },
    ip: req.ip,
  });

  res.json({ message: 'Payroll record updated', gross, net });
});

apiRouter.post('/payroll/periods/:id/approve', requireAuth, requireRole(['owner']), (req: Request, res: Response): void => {
  const { id } = req.params;
  const now = new Date().toISOString();

  db.prepare(`
    UPDATE payroll_periods
    SET status = 'approved', approved_by = ?, approved_at = ?
    WHERE id = ?
  `).run(req.user!.id, now, id);

  db.prepare(`
    UPDATE payroll_records
    SET status = 'approved'
    WHERE period_id = ?
  `).run(id);

  logAudit({
    userId: req.user!.id,
    userEmail: req.user!.email,
    userRole: req.user!.role,
    action: 'APPROVE_PAYROLL_PERIOD',
    entityType: 'PAYROLL',
    entityId: id,
    details: { approvedAt: now },
    ip: req.ip,
  });

  res.json({ success: true, message: 'Payroll period approved by Center Owner' });
});

// ==========================================
// 9. EQUIPMENT & GEAR INVENTORY
// ==========================================

apiRouter.get('/equipment', requireAuth, (req: Request, res: Response): void => {
  const { category, lowStock } = req.query;
  let query = 'SELECT * FROM equipment WHERE 1=1';
  const params: any[] = [];

  if (category) {
    query += ' AND category = ?';
    params.push(category);
  }

  if (lowStock === 'true') {
    query += ' AND quantity_available <= low_stock_threshold';
  }

  query += ' ORDER BY item_name ASC';
  const items = db.prepare(query).all(...params);
  res.json(items);
});

apiRouter.get('/equipment/checkouts', requireAuth, (req: Request, res: Response): void => {
  const checkouts = db.prepare(`
    SELECT c.id, c.equipment_id, e.item_name, e.size, c.student_id,
           s.first_name || ' ' || s.last_name AS student_name,
           c.instructor_id, c.checkout_time, c.expected_return, c.condition_out, c.notes
    FROM equipment_checkouts c
    JOIN equipment e ON e.id = c.equipment_id
    LEFT JOIN students s ON s.id = c.student_id
    WHERE c.actual_return IS NULL
    ORDER BY c.expected_return ASC, c.checkout_time ASC
  `).all();
  res.json(checkouts);
});

apiRouter.post('/equipment', requireAuth, requireRole(['owner', 'operations_manager', 'equipment_manager']), (req: Request, res: Response): void => {
  const { item_name, category, size, brand_model, quantity_total, condition, location, low_stock_threshold, notes } = req.body;
  if (!item_name || !category) {
    res.status(400).json({ error: 'Item name and category are required' });
    return;
  }

  const id = 'eq_' + crypto.randomUUID().slice(0, 10);
  const barcode = 'FD-GEAR-' + Math.floor(1000 + Math.random() * 9000);
  const now = new Date().toISOString();
  const qty = Number(quantity_total) || 1;

  db.prepare(`
    INSERT INTO equipment (
      id, barcode, item_name, category, size, brand_model,
      quantity_total, quantity_available, condition, location,
      last_inspected, low_stock_threshold, notes, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    barcode,
    item_name,
    category,
    size || null,
    brand_model || null,
    qty,
    qty,
    condition || 'excellent',
    location || 'Gear Room A - Dahab Main',
    now.slice(0, 10),
    Number(low_stock_threshold) || 2,
    notes || null,
    now,
    now
  );

  res.status(201).json({ id, barcode, message: 'Gear registered in inventory' });
});

apiRouter.patch('/equipment/:id', requireAuth, requireRole(['owner', 'operations_manager', 'equipment_manager']), (req: Request, res: Response): void => {
  const { id } = req.params;
  const { condition, quantity_total, quantity_available, location, last_inspected, notes } = req.body;

  const updates: string[] = ['updated_at = ?'];
  const values: any[] = [new Date().toISOString()];

  if (condition !== undefined) { updates.push('condition = ?'); values.push(condition); }
  if (quantity_total !== undefined) { updates.push('quantity_total = ?'); values.push(Number(quantity_total)); }
  if (quantity_available !== undefined) { updates.push('quantity_available = ?'); values.push(Number(quantity_available)); }
  if (location !== undefined) { updates.push('location = ?'); values.push(location); }
  if (last_inspected !== undefined) { updates.push('last_inspected = ?'); values.push(last_inspected); }
  if (notes !== undefined) { updates.push('notes = ?'); values.push(notes); }

  values.push(id);
  db.prepare(`UPDATE equipment SET ${updates.join(', ')} WHERE id = ?`).run(...values);
  res.json({ message: 'Equipment inventory updated' });
});

apiRouter.post('/equipment/:id/checkout', requireAuth, (req: Request, res: Response): void => {
  const { id } = req.params;
  const { student_id, instructor_id, expected_return, condition_out, notes } = req.body;

  const item = db.prepare('SELECT * FROM equipment WHERE id = ?').get(id) as any;
  if (!item) {
    res.status(404).json({ error: 'Equipment not found' });
    return;
  }

  if (item.quantity_available <= 0) {
    res.status(400).json({ error: 'No units available for checkout. Item is out of stock.' });
    return;
  }

  const checkoutId = 'chk_' + crypto.randomUUID().slice(0, 10);
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO equipment_checkouts (id, equipment_id, student_id, instructor_id, checkout_time, expected_return, condition_out, notes, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    checkoutId,
    id,
    student_id || null,
    instructor_id || null,
    now,
    expected_return || null,
    condition_out || item.condition,
    notes || null,
    now
  );

  db.prepare('UPDATE equipment SET quantity_available = quantity_available - 1, updated_at = ? WHERE id = ?').run(now, id);

  res.status(201).json({ checkoutId, message: 'Gear checkout recorded' });
});

apiRouter.post('/equipment/checkouts/:id/return', requireAuth, (req: Request, res: Response): void => {
  const { id } = req.params;
  const { condition_in, notes } = req.body;

  const chk = db.prepare('SELECT * FROM equipment_checkouts WHERE id = ?').get(id) as any;
  if (!chk) {
    res.status(404).json({ error: 'Checkout record not found' });
    return;
  }

  if (chk.actual_return) {
    res.status(400).json({ error: 'Gear has already been returned' });
    return;
  }

  const now = new Date().toISOString();
  db.prepare(`
    UPDATE equipment_checkouts
    SET actual_return = ?, condition_in = ?, notes = COALESCE(?, notes)
    WHERE id = ?
  `).run(now, condition_in || 'good', notes || null, id);

  db.prepare('UPDATE equipment SET quantity_available = quantity_available + 1, condition = COALESCE(?, condition), updated_at = ? WHERE id = ?')
    .run(condition_in || null, now, chk.equipment_id);

  res.json({ success: true, message: 'Gear returned to inventory' });
});

// ==========================================
// 10. AUDIT LOGS (Owner Only)
// ==========================================

apiRouter.get('/audit-logs', requireAuth, requireRole(['owner']), (req: Request, res: Response): void => {
  const { search, limit } = req.query;
  let query = 'SELECT * FROM audit_logs WHERE 1=1';
  const params: any[] = [];

  if (search) {
    query += ' AND (action LIKE ? OR entity_type LIKE ? OR user_email LIKE ? OR details LIKE ?)';
    const term = `%${search}%`;
    params.push(term, term, term, term);
  }

  query += ' ORDER BY created_at DESC LIMIT ?';
  params.push(Number(limit) || 100);

  const logs = db.prepare(query).all(...params);
  res.json(logs);
});

// ==========================================
// 11. SYSTEM SETTINGS & SECURE BACKUP
// ==========================================

apiRouter.get('/settings', requireAuth, (req: Request, res: Response): void => {
  const settingsRows = db.prepare('SELECT key, value FROM settings').all() as any[];
  const settingsMap: Record<string, string> = {};
  for (const s of settingsRows) {
    settingsMap[s.key] = s.value;
  }
  res.json(settingsMap);
});

apiRouter.patch('/settings', requireAuth, requireRole(['owner']), (req: Request, res: Response): void => {
  const { settings } = req.body;
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
    res.status(400).json({ error: 'Invalid settings object' });
    return;
  }

  const hasBookingSafetyRules = Object.prototype.hasOwnProperty.call(settings, 'booking_safety_rules');
  const bookingSafetyRules = hasBookingSafetyRules
    ? normalizeBookingSafetyRules(settings.booking_safety_rules)
    : null;
  if (hasBookingSafetyRules && !bookingSafetyRules) {
    res.status(400).json({
      error: 'Booking safety rules must include waiver_valid_days (1-3650), minimum_deposit_percent (1-100), max_divers_per_buoy (1-10), and ras_mohamed_min_participants (1-100)',
    });
    return;
  }

  const upsert = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
  for (const [key, value] of Object.entries(settings)) {
    upsert.run(key, key === 'booking_safety_rules' ? JSON.stringify(bookingSafetyRules) : String(value));
  }

  logAudit({
    userId: req.user!.id,
    userEmail: req.user!.email,
    userRole: req.user!.role,
    action: 'UPDATE_SYSTEM_SETTINGS',
    entityType: 'SETTINGS',
    details: { changedKeys: Object.keys(settings) },
    ip: req.ip,
  });

  res.json({ message: 'Settings saved successfully' });
});

// Full database backup export in JSON format
apiRouter.get('/backup/export', requireAuth, requireRole(['owner']), (req: Request, res: Response): void => {
  const tables = [
    'users', 'students', 'inquiries', 'courses', 'course_sessions', 'bookings',
    'daily_activities', 'activity_participants', 'invoices', 'invoice_items', 'customer_requests',
    'payments', 'expenses', 'payroll_periods', 'payroll_records', 'equipment',
    'equipment_checkouts', 'settings', 'audit_logs'
  ];

  const backupData: Record<string, any[]> = {};
  for (const t of tables) {
    // Redact password hash and salt for users export
    if (t === 'users') {
      backupData[t] = db.prepare(`
        SELECT id, email, full_name, role, is_active, phone, emergency_contact, languages, certifications,
               hourly_rate, session_commission, monthly_salary, created_at, updated_at
        FROM users
      `).all();
    } else {
      backupData[t] = db.prepare(`SELECT * FROM ${t}`).all();
    }
  }

  logAudit({
    userId: req.user!.id,
    userEmail: req.user!.email,
    userRole: req.user!.role,
    action: 'EXPORT_DATABASE_BACKUP',
    entityType: 'DATABASE',
    details: { timestamp: new Date().toISOString() },
    ip: req.ip,
  });

  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename="freedive_dahab_backup_${new Date().toISOString().slice(0, 10)}.json"`);
  res.json({
    exportVersion: '1.0.0',
    centerName: 'Freedive Dahab Egypt',
    exportedAt: new Date().toISOString(),
    exportedBy: req.user!.email,
    data: backupData,
  });
});
