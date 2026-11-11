import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';
import { db } from './db.js';

export interface AuthUser {
  id: string;
  email: string;
  full_name: string;
  role: 'owner' | 'operations_manager' | 'front_desk_crm' | 'instructor' | 'finance' | 'hr' | 'equipment_manager';
  is_active: number;
  phone?: string;
  languages?: string;
  certifications?: string;
}

// Extend Express Request
declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
      sessionToken?: string;
    }
  }
}

// Hash password with salt using standard Node crypto scrypt
export function hashPassword(password: string): { hash: string; salt: string } {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return { hash, salt };
}

export function verifyPassword(password: string, hash: string, salt: string): boolean {
  try {
    const derived = crypto.scryptSync(password, salt, 64).toString('hex');
    const a = Buffer.from(derived, 'hex');
    const b = Buffer.from(hash, 'hex');
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export function generateSessionToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

// Audit logging helper
export function logAudit(params: {
  userId?: string;
  userEmail?: string;
  userRole?: string;
  action: string;
  entityType: string;
  entityId?: string;
  details?: any;
  ip?: string;
}) {
  try {
    const id = 'aud_' + crypto.randomUUID().slice(0, 12);
    const detailsStr = params.details ? JSON.stringify(params.details) : null;
    const stmt = db.prepare(`
      INSERT INTO audit_logs (id, user_id, user_email, user_role, action, entity_type, entity_id, details, ip, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      id,
      params.userId || null,
      params.userEmail || null,
      params.userRole || null,
      params.action,
      params.entityType,
      params.entityId || null,
      detailsStr,
      params.ip || null,
      new Date().toISOString()
    );
  } catch (err) {
    console.error('Failed to log audit:', err);
  }
}

// Extract auth token from Authorization Header or Cookie
export function getAuthToken(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }
  if (req.cookies && req.cookies.freedive_session) {
    return req.cookies.freedive_session;
  }
  return null;
}

// Authentication middleware
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const token = getAuthToken(req);
  if (!token) {
    res.status(401).json({ error: 'Authentication required. Please sign in.' });
    return;
  }

  const sessionStmt = db.prepare(`
    SELECT s.token, s.user_id, s.expires_at, u.id, u.email, u.full_name, u.role, u.is_active, u.phone, u.languages, u.certifications
    FROM sessions s
    JOIN users u ON s.user_id = u.id
    WHERE s.token = ?
  `);
  const session = sessionStmt.get(token) as any;

  if (!session) {
    res.status(401).json({ error: 'Invalid or expired session. Please sign in again.' });
    return;
  }

  if (Date.now() > session.expires_at) {
    db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
    res.status(401).json({ error: 'Session expired. Please sign in again.' });
    return;
  }

  if (!session.is_active) {
    res.status(403).json({ error: 'This user account has been disabled. Please contact the Dahab center owner.' });
    return;
  }

  req.user = {
    id: session.id,
    email: session.email,
    full_name: session.full_name,
    role: session.role,
    is_active: session.is_active,
    phone: session.phone,
    languages: session.languages,
    certifications: session.certifications,
  };
  req.sessionToken = token;
  next();
}

// Role-based authorization middleware
export function requireRole(allowedRoles: Array<AuthUser['role']>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    // Owner always has full access
    if (req.user.role === 'owner') {
      next();
      return;
    }

    if (!allowedRoles.includes(req.user.role)) {
      logAudit({
        userId: req.user.id,
        userEmail: req.user.email,
        userRole: req.user.role,
        action: 'ACCESS_DENIED',
        entityType: 'ENDPOINT',
        entityId: req.originalUrl,
        details: { requiredRoles: allowedRoles, method: req.method },
        ip: req.ip,
      });

      res.status(403).json({
        error: `Permission denied. Your role '${req.user.role}' is not authorized to access this section.`,
        requiredRoles: allowedRoles,
      });
      return;
    }

    next();
  };
}

// Student medical & health privacy helper:
// Restricts medical notes and detailed questionnaire answers to owner, operations manager, and hr.
// Instructors only see "Medical Waiver: Signed / Cleared" without sensitive diagnosis details.
export function maskStudentData(student: any, userRole: string) {
  if (!student) return student;
  const isAuthorizedHealthRole = ['owner', 'operations_manager', 'hr'].includes(userRole);
  if (!isAuthorizedHealthRole) {
    return {
      ...student,
      medical_notes: student.medical_waiver_signed ? '[Restricted: Health clearance on file]' : '[Restricted: Pending waiver]',
      medical_clearance_status: undefined,
    };
  }
  return student;
}
