import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

// Ensure data directory exists
const dataDir = path.resolve(process.cwd(), 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'freedive_dahab.db');
export const db = new Database(dbPath);

export type BookingSafetyRules = {
  waiver_valid_days: number;
  minimum_deposit_percent: number;
  max_divers_per_buoy: number;
  ras_mohamed_min_participants: number;
};

export const DEFAULT_BOOKING_SAFETY_RULES: BookingSafetyRules = {
  waiver_valid_days: 365,
  minimum_deposit_percent: 30,
  max_divers_per_buoy: 3,
  ras_mohamed_min_participants: 4,
};

// Enable WAL mode for high concurrency & foreign keys
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export function initializeDatabase() {
  db.exec(`
    -- Users and Staff Accounts
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      salt TEXT NOT NULL,
      full_name TEXT NOT NULL,
      role TEXT NOT NULL, -- 'owner', 'operations_manager', 'front_desk_crm', 'instructor', 'finance', 'hr', 'equipment_manager'
      is_active INTEGER NOT NULL DEFAULT 1,
      phone TEXT,
      emergency_contact TEXT,
      languages TEXT DEFAULT '["English"]',
      certifications TEXT DEFAULT '[]', -- e.g. ["AIDA Instructor", "Molchanovs W2I"]
      hourly_rate REAL DEFAULT 0,
      session_commission REAL DEFAULT 0,
      monthly_salary REAL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    -- User Sessions
    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    -- Security & Financial Audit Logs
    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      user_email TEXT,
      user_role TEXT,
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT,
      details TEXT,
      ip TEXT,
      created_at TEXT NOT NULL
    );

    -- Students & CRM
    CREATE TABLE IF NOT EXISTS students (
      id TEXT PRIMARY KEY,
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      phone TEXT,
      nationality TEXT,
      date_of_birth TEXT,
      certification_agency TEXT, -- 'AIDA', 'Molchanovs', 'SSI', 'PADI', 'None'
      certification_level TEXT,
      total_depth_pb REAL DEFAULT 0, -- Personal best depth in meters
      static_apnea_pb TEXT, -- e.g. "04:15"
      medical_waiver_signed INTEGER NOT NULL DEFAULT 0,
      medical_waiver_date TEXT,
      medical_clearance_status TEXT NOT NULL DEFAULT 'unknown',
      medical_notes TEXT, -- Confidential: only authorized roles (owner, operations_manager, hr)
      emergency_contact_name TEXT,
      emergency_contact_phone TEXT,
      insurance_details TEXT,
      source_channel TEXT DEFAULT 'Walk-in', -- 'Website', 'Instagram', 'WhatsApp', 'Walk-in', 'Referral'
      status TEXT NOT NULL DEFAULT 'active', -- 'lead', 'inquiry', 'active', 'certified', 'inactive'
      notes TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    -- CRM Communications & Inquiries
    CREATE TABLE IF NOT EXISTS inquiries (
      id TEXT PRIMARY KEY,
      student_id TEXT,
      lead_name TEXT,
      lead_email TEXT,
      lead_phone TEXT,
      course_interest TEXT,
      channel TEXT NOT NULL DEFAULT 'WhatsApp',
      status TEXT NOT NULL DEFAULT 'new', -- 'new', 'contacted', 'proposal_sent', 'booked', 'closed_lost'
      message TEXT,
      follow_up_date TEXT,
      assigned_to TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(student_id) REFERENCES students(id) ON DELETE SET NULL,
      FOREIGN KEY(assigned_to) REFERENCES users(id) ON DELETE SET NULL
    );

    -- Courses & Training Packages Catalog
    CREATE TABLE IF NOT EXISTS courses (
      id TEXT PRIMARY KEY,
      code TEXT UNIQUE NOT NULL,
      title TEXT NOT NULL,
      agency TEXT NOT NULL, -- 'AIDA', 'Molchanovs', 'Freedive Dahab Specialty'
      level TEXT NOT NULL, -- 'Beginner', 'Intermediate', 'Advanced', 'Master', 'Specialty'
      duration_days INTEGER NOT NULL DEFAULT 2,
      max_capacity INTEGER NOT NULL DEFAULT 4,
      price_eur REAL NOT NULL,
      price_egp REAL NOT NULL,
      description TEXT,
      prerequisites TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    );

    -- Course Sessions / Scheduled Courses
    CREATE TABLE IF NOT EXISTS course_sessions (
      id TEXT PRIMARY KEY,
      course_id TEXT NOT NULL,
      instructor_id TEXT,
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      location TEXT NOT NULL DEFAULT 'Lighthouse Bay / Blue Hole',
      status TEXT NOT NULL DEFAULT 'scheduled', -- 'scheduled', 'in_progress', 'completed', 'cancelled'
      max_capacity INTEGER NOT NULL DEFAULT 4,
      buoy_count INTEGER NOT NULL DEFAULT 0,
      notes TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY(course_id) REFERENCES courses(id) ON DELETE RESTRICT,
      FOREIGN KEY(instructor_id) REFERENCES users(id) ON DELETE SET NULL
    );

    -- Student Bookings & Enrollments
    CREATE TABLE IF NOT EXISTS bookings (
      id TEXT PRIMARY KEY,
      booking_number TEXT UNIQUE NOT NULL,
      student_id TEXT NOT NULL,
      course_id TEXT NOT NULL,
      session_id TEXT,
      booking_date TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'confirmed', -- 'pending', 'confirmed', 'attended', 'certified', 'cancelled'
      price REAL NOT NULL,
      currency TEXT NOT NULL DEFAULT 'EUR',
      payment_status TEXT NOT NULL DEFAULT 'unpaid', -- 'unpaid', 'partially_paid', 'paid', 'refunded'
      prerequisites_verified INTEGER NOT NULL DEFAULT 0,
      assigned_buoy INTEGER,
      notes TEXT,
      created_by TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(student_id) REFERENCES students(id) ON DELETE RESTRICT,
      FOREIGN KEY(course_id) REFERENCES courses(id) ON DELETE RESTRICT,
      FOREIGN KEY(session_id) REFERENCES course_sessions(id) ON DELETE SET NULL
    );

    -- Daily Dahab Activity Board & Ocean Events
    CREATE TABLE IF NOT EXISTS daily_activities (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      activity_type TEXT NOT NULL, -- 'course_session', 'depth_training', 'fun_dive_trip', 'safari_blue_hole', 'equalization_workshop', 'breathing_session'
      location TEXT NOT NULL, -- 'Lighthouse', 'Blue Hole', 'The Canyon', 'Eel Garden', 'The Bells', 'Ras Abu Galum'
      activity_date TEXT NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      lead_instructor_id TEXT,
      safety_diver_name TEXT,
      max_depth_target REAL,
      max_pax INTEGER DEFAULT 6,
      current_pax INTEGER DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'planned', -- 'planned', 'briefing_done', 'in_water', 'completed', 'cancelled_weather'
      sea_conditions TEXT DEFAULT 'Calm, 24°C, 30m visibility',
      notes TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY(lead_instructor_id) REFERENCES users(id) ON DELETE SET NULL
    );

    -- Activity Participants
    CREATE TABLE IF NOT EXISTS activity_participants (
      id TEXT PRIMARY KEY,
      activity_id TEXT NOT NULL,
      student_id TEXT NOT NULL,
      attendance_status TEXT NOT NULL DEFAULT 'checked_in', -- 'scheduled', 'checked_in', 'completed', 'no_show'
      depth_achieved REAL DEFAULT 0,
      notes TEXT,
      FOREIGN KEY(activity_id) REFERENCES daily_activities(id) ON DELETE CASCADE,
      FOREIGN KEY(student_id) REFERENCES students(id) ON DELETE CASCADE
    );

    -- Invoices (Customer billing)
    CREATE TABLE IF NOT EXISTS invoices (
      id TEXT PRIMARY KEY,
      invoice_number TEXT UNIQUE NOT NULL,
      student_id TEXT NOT NULL,
      booking_id TEXT,
      issue_date TEXT NOT NULL,
      due_date TEXT NOT NULL,
      currency TEXT NOT NULL DEFAULT 'EUR', -- 'EUR', 'EGP', 'USD'
      subtotal REAL NOT NULL DEFAULT 0,
      tax_rate REAL NOT NULL DEFAULT 0, -- Configurable (Egypt VAT or tourist center tax)
      tax_amount REAL NOT NULL DEFAULT 0,
      total_amount REAL NOT NULL DEFAULT 0,
      paid_amount REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'issued', -- 'draft', 'issued', 'partially_paid', 'paid', 'overdue', 'cancelled'
      notes TEXT,
      created_by TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(student_id) REFERENCES students(id) ON DELETE RESTRICT,
      FOREIGN KEY(booking_id) REFERENCES bookings(id) ON DELETE SET NULL
    );

    -- Invoice Line Items
    CREATE TABLE IF NOT EXISTS invoice_items (
      id TEXT PRIMARY KEY,
      invoice_id TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'other',
      description TEXT NOT NULL,
      quantity REAL NOT NULL DEFAULT 1,
      unit_price REAL NOT NULL DEFAULT 0,
      total_price REAL NOT NULL DEFAULT 0,
      FOREIGN KEY(invoice_id) REFERENCES invoices(id) ON DELETE CASCADE
    );

    -- Customer Payments
    CREATE TABLE IF NOT EXISTS payments (
      id TEXT PRIMARY KEY,
      invoice_id TEXT NOT NULL,
      amount REAL NOT NULL,
      currency TEXT NOT NULL DEFAULT 'EUR',
      payment_method TEXT NOT NULL DEFAULT 'Cash EUR', -- 'Cash EUR', 'Cash EGP', 'Credit Card', 'Bank Transfer', 'InstaPay Egypt'
      payment_date TEXT NOT NULL,
      reference_number TEXT,
      notes TEXT,
      recorded_by TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY(invoice_id) REFERENCES invoices(id) ON DELETE RESTRICT
    );

    -- Customer requests are invoiced through the existing billing ledger.
    CREATE TABLE IF NOT EXISTS customer_requests (
      id TEXT PRIMARY KEY,
      request_number TEXT UNIQUE NOT NULL,
      invoice_id TEXT UNIQUE NOT NULL,
      special_request TEXT,
      created_by TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(invoice_id) REFERENCES invoices(id) ON DELETE CASCADE,
      FOREIGN KEY(created_by) REFERENCES users(id) ON DELETE SET NULL
    );

    -- Supplier Bills & Center Expenses
    CREATE TABLE IF NOT EXISTS expenses (
      id TEXT PRIMARY KEY,
      expense_number TEXT UNIQUE NOT NULL,
      category TEXT NOT NULL, -- 'Boat Charter & Captain', 'Dive Site Entry Fees', 'Equipment Maintenance', 'Facility Rent & Utilities', 'Oxygen & Safety Gas', 'Marketing', 'Staff Welfare', 'Miscellaneous'
      vendor_name TEXT NOT NULL,
      amount REAL NOT NULL,
      currency TEXT NOT NULL DEFAULT 'EGP',
      expense_date TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'approved', -- 'pending_approval', 'approved', 'paid', 'rejected'
      approved_by TEXT,
      description TEXT NOT NULL,
      receipt_ref TEXT,
      created_by TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY(approved_by) REFERENCES users(id) ON DELETE SET NULL
    );

    -- Payroll Periods
    CREATE TABLE IF NOT EXISTS payroll_periods (
      id TEXT PRIMARY KEY,
      period_name TEXT NOT NULL, -- e.g. "October 2026", "November 2026"
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft', -- 'draft', 'submitted', 'approved', 'paid'
      approved_by TEXT,
      approved_at TEXT,
      notes TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY(approved_by) REFERENCES users(id) ON DELETE SET NULL
    );

    -- Payroll Records (Restricted to Owner, Finance, HR)
    CREATE TABLE IF NOT EXISTS payroll_records (
      id TEXT PRIMARY KEY,
      period_id TEXT NOT NULL,
      employee_id TEXT NOT NULL,
      base_salary REAL NOT NULL DEFAULT 0,
      session_commission REAL NOT NULL DEFAULT 0,
      sessions_taught INTEGER NOT NULL DEFAULT 0,
      bonuses REAL NOT NULL DEFAULT 0,
      deductions REAL NOT NULL DEFAULT 0, -- Configurable deductions (e.g. advance, gear charge)
      gross_pay REAL NOT NULL DEFAULT 0,
      tax_withholding REAL NOT NULL DEFAULT 0, -- Configurable & reviewable
      net_pay REAL NOT NULL DEFAULT 0,
      currency TEXT NOT NULL DEFAULT 'EUR',
      status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'approved', 'paid'
      notes TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY(period_id) REFERENCES payroll_periods(id) ON DELETE CASCADE,
      FOREIGN KEY(employee_id) REFERENCES users(id) ON DELETE RESTRICT
    );

    -- Equipment & Gear Inventory
    CREATE TABLE IF NOT EXISTS equipment (
      id TEXT PRIMARY KEY,
      barcode TEXT UNIQUE NOT NULL,
      item_name TEXT NOT NULL,
      category TEXT NOT NULL, -- 'wetsuits', 'bifins', 'monofins', 'masks_snorkels', 'lanyards', 'computers', 'buoys_weights', 'safety_o2'
      size TEXT, -- 'XS', 'S', 'M', 'L', 'XL', '40-41', 'Universal'
      brand_model TEXT,
      quantity_total INTEGER NOT NULL DEFAULT 1,
      quantity_available INTEGER NOT NULL DEFAULT 1,
      condition TEXT NOT NULL DEFAULT 'excellent', -- 'new', 'excellent', 'good', 'needs_service', 'retired'
      location TEXT NOT NULL DEFAULT 'Gear Room A - Dahab Main',
      last_inspected TEXT,
      low_stock_threshold INTEGER NOT NULL DEFAULT 2,
      notes TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    -- Equipment Checkouts
    CREATE TABLE IF NOT EXISTS equipment_checkouts (
      id TEXT PRIMARY KEY,
      equipment_id TEXT NOT NULL,
      student_id TEXT,
      instructor_id TEXT,
      checkout_time TEXT NOT NULL,
      expected_return TEXT,
      actual_return TEXT,
      condition_out TEXT NOT NULL DEFAULT 'good',
      condition_in TEXT,
      notes TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY(equipment_id) REFERENCES equipment(id) ON DELETE RESTRICT,
      FOREIGN KEY(student_id) REFERENCES students(id) ON DELETE SET NULL,
      FOREIGN KEY(instructor_id) REFERENCES users(id) ON DELETE SET NULL
    );

    -- System Configuration Settings
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    -- Indices for quick lookup and high performance
    CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at);
    CREATE INDEX IF NOT EXISTS idx_students_email ON students(email);
    CREATE INDEX IF NOT EXISTS idx_inquiries_status ON inquiries(status);
    CREATE INDEX IF NOT EXISTS idx_course_sessions_start ON course_sessions(start_date);
    CREATE INDEX IF NOT EXISTS idx_daily_act_date ON daily_activities(activity_date);
    CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
    CREATE INDEX IF NOT EXISTS idx_payroll_period ON payroll_records(period_id);
    CREATE INDEX IF NOT EXISTS idx_equipment_cat ON equipment(category);
    CREATE INDEX IF NOT EXISTS idx_customer_requests_created ON customer_requests(created_at);
  `);

  const invoiceItemColumns = db.pragma('table_info(invoice_items)') as Array<{ name: string }>;
  if (!invoiceItemColumns.some((column) => column.name === 'category')) {
    db.exec("ALTER TABLE invoice_items ADD COLUMN category TEXT NOT NULL DEFAULT 'other'");
  }

  const studentColumns = db.pragma('table_info(students)') as Array<{ name: string }>;
  if (!studentColumns.some((column) => column.name === 'medical_clearance_status')) {
    db.exec("ALTER TABLE students ADD COLUMN medical_clearance_status TEXT NOT NULL DEFAULT 'unknown'");
  }

  const courseSessionColumns = db.pragma('table_info(course_sessions)') as Array<{ name: string }>;
  if (!courseSessionColumns.some((column) => column.name === 'buoy_count')) {
    db.exec('ALTER TABLE course_sessions ADD COLUMN buoy_count INTEGER NOT NULL DEFAULT 0');
  }

  const bookingColumns = db.pragma('table_info(bookings)') as Array<{ name: string }>;
  if (!bookingColumns.some((column) => column.name === 'prerequisites_verified')) {
    db.exec('ALTER TABLE bookings ADD COLUMN prerequisites_verified INTEGER NOT NULL DEFAULT 0');
  }
  if (!bookingColumns.some((column) => column.name === 'assigned_buoy')) {
    db.exec('ALTER TABLE bookings ADD COLUMN assigned_buoy INTEGER');
  }

  db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)')
    .run('booking_safety_rules', JSON.stringify(DEFAULT_BOOKING_SAFETY_RULES));
}
