# REST API & Security Specification

**Document 03 of 04 · API & Security Contract**
Node.js (Express) · JWT HttpOnly Cookie Auth · RBAC & Permission Middleware · **Version 1.1** (v1.0 + review fixes)

> **For AI coding agents:** This is the contract between `backend/` and `frontend/`. Data rules are in `02_DATABASE_SCHEMA.md`; behaviour rules in `01_SRS_...md`. Items tagged **[v1.1]** are new or changed.

## Changelog v1.0 → v1.1

- **Critical:** cookie/deployment rule fixed — `SameSite=Strict` cookies are *not sent* when frontend (Vercel) and API (Render) are on different sites. Use a same-origin proxy (§2).
- Added API conventions: response envelope, error format, status codes, pagination, validation.
- Added endpoints: change password, teacher by id, per-teacher attendance report, fee summary, dashboard, audit log, health.
- `DELETE` on teachers/students is now explicitly **archive**.
- PATCH endpoints use field **whitelists** (no mass-assignment of `role`, `password_hash`, flags by wrong actors).
- Fee endpoints return minimal student fields; payment revert is admin-only; amount_paid added.
- Login rate limiting, CSRF defence, session invalidation via `token_version`.

---

## 1. Conventions **[v1.1]**

- Base path `/api`. JSON only. Dates `YYYY-MM-DD` (Asia/Karachi calendar dates). Money as numbers with 2 decimals.
- **Success:** `200/201` with `{ "data": ..., "meta": { ... } }` (`meta` only for paginated lists: `page, pageSize, total`).
- **Error:** `{ "error": { "code": "VALIDATION_ERROR", "message": "Human readable", "details": [ { "field": "phone", "message": "Required" } ] } }`
- **Status codes:** `400` malformed · `401` not authenticated / deactivated · `403` missing permission · `404` not found (also for rows the caller may not know exist) · `409` conflict (duplicate username/CNIC/roll_no) · `422` valid JSON but business-rule violation · `429` rate limited · `500` generic (no stack traces in production).
- **Validation:** every body/query validated with a schema library (**zod** recommended) before touching the DB. Unknown body fields are rejected or stripped. SQL is always parameterised.
- **Pagination:** list endpoints accept `?page=1&pageSize=50` (max 200).
- **Phone** accepts digits with optional `+`/`-`; **CNIC** 13 digits (store digits only).

---

## 2. Security Model

### 2.1 Three-layer isolation
- **Layer 1 — `verifyAuth`:** reads the signed JWT from an HttpOnly cookie, loads the user from PostgreSQL, requires `is_active = TRUE` and `token.tv === users.token_version`, and attaches live `role` + 4 flags to `req.user`. Else **401**.
- **Layer 2 — `requirePermission(...flags)`:** admin passes; otherwise the teacher must hold **at least one** listed flag. Else **403**. (Implication rule: `can_manage_students` also satisfies "view students" — list both flags on read routes.)
- **Layer 3 — row scoping:** `/api/attendance/my` ignores any client-supplied id and binds to `req.user.id`.

### 2.2 Cookie & deployment rule **[v1.1 — critical]**
`SameSite=Strict; Secure; HttpOnly` cookies only work when the browser sees frontend and API as the **same site**. With the stack in the roadmap (Vercel + Render on different domains) login would silently fail. Choose one:

1. **Recommended — same-origin proxy:** the frontend calls relative `/api/...`; the host proxies to the backend. Vercel `vercel.json`:
   ```json
   { "rewrites": [ { "source": "/api/:path*", "destination": "https://YOUR-API.onrender.com/api/:path*" } ] }
   ```
   (Local dev: Vite `server.proxy` → `http://localhost:5000`.) Browser sees one origin → Strict cookies work, no CORS needed, no third-party-cookie problems.
2. **Custom domain:** `app.yourdomain.com` + `api.yourdomain.com` → same site; cookie `Domain=.yourdomain.com`, `SameSite=Lax`, CORS with `credentials: true` and an exact origin.
3. Avoid `SameSite=None` cross-site cookies — blocked by Safari / increasingly by other browsers.

Cookie: name `academy_token`, `HttpOnly`, `Secure` (production), `Path=/`, `Max-Age` = `JWT_EXPIRES_IN`. JWT payload: `{ sub: userId, tv: token_version }` — **no permissions in the token** (flags are read live).

### 2.3 Other hardening **[v1.1]**
- **CSRF:** SameSite plus an Origin/Referer check on state-changing methods (POST/PATCH/DELETE) against `CLIENT_ORIGIN`; reject mismatches with 403.
- **Rate limiting:** `express-rate-limit` on `/api/auth/login` (e.g. 10 / 15 min per IP) and a softer global limit. Set `app.set('trust proxy', 1)` when behind Render/Vercel so IPs and `Secure` cookies work.
- `helmet`, `cookie-parser`, body size limit (e.g. 100 kb), bcrypt cost ≥ 12, generic login error message, **timing-safe** behaviour (compare against a dummy hash when user not found).
- Never log passwords, hashes, CNIC or full request bodies.
- Mask CNIC in list responses (`*********1234`); return full CNIC only on `GET /api/teachers/:id` (admin).

---

## 3. Authentication (`/api/auth`)

| Method | Endpoint | Access | Contract |
|---|---|---|---|
| POST | `/api/auth/login` | Public (rate limited) | Body `{ username, password }` → sets cookie; returns `{ data: { user } }`. Updates `last_login_at`. |
| POST | `/api/auth/logout` | Authenticated | Clears cookie; `{ data: { message: "Logged out" } }` |
| GET | `/api/auth/me` | Authenticated | Live `{ id, full_name, username, role, permissions: { can_view_students, can_manage_students, can_mark_all_attendance, can_manage_fees } }` |
| POST | `/api/auth/change-password` **[v1.1]** | Authenticated | Body `{ current_password, new_password }` (min 8). Bumps `token_version`, re-issues cookie for the current session. Audit-logged. |

## 4. Teachers (`/api/teachers`) — admin only

| Method | Endpoint | Description & payload |
|---|---|---|
| GET | `/api/teachers` | List teachers + 4 flags. Filters `?is_active=true&search=`. Paginated. |
| GET | `/api/teachers/:id` **[v1.1]** | Single teacher profile (full CNIC). |
| POST | `/api/teachers` | Required `full_name, username, password, phone`; optional `cnic, subject_specialty, joining_date, permissions{4 flags}`. `role` is always `teacher` (server-set). 409 on duplicate username/CNIC. |
| PATCH | `/api/teachers/:id` | **Whitelist:** `full_name, phone, cnic, subject_specialty, joining_date, is_active, password (reset), can_* flags`. Password reset bumps `token_version`. Rejects `role`, `id`, `password_hash`. Cannot target the admin account. Permission/active changes are audit-logged. |
| DELETE | `/api/teachers/:id` | **Archive** (`is_active=false`) — never a physical delete. Equivalent to PATCH `is_active:false`. Cannot archive the admin. |

## 5. Students (`/api/students`)

Read: **admin OR `can_view_students` OR `can_manage_students`**. Write: **admin OR `can_manage_students`**.

| Method | Endpoint | Access | Description & payload |
|---|---|---|---|
| GET | `/api/students` | read | `?grade=1..12&stream=&status=active&search=&page=&pageSize=`. Search matches name or roll no (case-insensitive). Default `status=active`. |
| GET | `/api/students/:id` | read | Full profile. |
| POST | `/api/students` | write | Required `full_name, guardian_phone, grade, stream, monthly_fee`; optional `roll_no, guardian_name, admission_date, fee_due_day, fee_note`. Blank `roll_no` → DB sequence. 409 on duplicate roll_no. |
| PATCH | `/api/students/:id` | write | Any editable field: `full_name, guardian_name, guardian_phone, grade, stream, monthly_fee, fee_due_day, fee_note, admission_date, roll_no, status`. Fee changes audit-logged; existing `fee_records.fee_amount` snapshots are untouched. |
| DELETE | `/api/students/:id` | write | **Archive** (`status='inactive'`). History preserved. Restore via PATCH `status:'active'`. |

## 6. Fees (`/api/fees`) — admin OR `can_manage_fees`

Responses contain only: `student_id, roll_no, full_name, grade, stream, fee_due_day, fee_note` plus ledger fields — **no guardian phone/CNIC** (unless caller separately has a student-view flag and uses `/api/students`).

| Method | Endpoint | Description & payload |
|---|---|---|
| GET | `/api/fees` | Monthly sheet: `?month=11&year=2026&grade=9&status=unpaid\|paid\|overdue&search=`. Includes **all eligible active students** (implicit unpaid rows) using the query in schema doc §4.1. Each row: `fee_amount, amount_paid, status, is_overdue, due_date, paid_date, remarks`. |
| GET | `/api/fees/summary` **[v1.1]** | `?month=&year=&grade=` → `{ expected, collected, pending, counts: { paid, unpaid, overdue } }`. |
| GET | `/api/fees/student/:id` | Chronological lifetime ledger from admission month to current month (skipped months shown as unpaid). |
| POST | `/api/fees/record` | Upsert: `{ student_id, billing_month, billing_year, status, paid_date?, amount_paid?, fee_amount?, remarks? }`. Rules below. |

**`POST /api/fees/record` rules [v1.1]**
- `status:'paid'` requires `paid_date` (not in the future) and `amount_paid > 0`; if `amount_paid` omitted it defaults to `fee_amount`. If `amount_paid < fee_amount` → **422** (v1 = full payments only; see SRS FR-FEE-09).
- `fee_amount` defaults to the student's current `monthly_fee` on first insert; on update it is **not** overwritten (snapshot).
- Period must be ≥ the student's admission month and not in the far future → else 422.
- `status:'unpaid'` on an existing paid row (**revert**) is **admin only** (403 otherwise); clears `paid_date`/`amount_paid`; audit-logged.
- Every create/update is audit-logged with before/after.

## 7. Teacher Attendance (`/api/attendance`)

| Method | Endpoint | Access | Description & payload |
|---|---|---|---|
| GET | `/api/attendance/my` | Any authenticated | Strictly `req.user.id`. `?month=11&year=2026` → `{ records: [...], counts: { present, absent, late, leave, notMarked } }`. |
| GET | `/api/attendance` | admin OR `can_mark_all_attendance` | `?date=YYYY-MM-DD` (default today) → all **active** teachers with status or `null` (not marked). |
| POST | `/api/attendance/bulk` | admin OR `can_mark_all_attendance` | `{ date, records: [{ teacher_id, status, remarks? }] }`. Single transaction upsert. Rules: no future dates; delegated teachers → today only (admin any past date); a delegated teacher cannot include their **own** `teacher_id` (403/422); only active teachers; `marked_by = req.user.id`. Edits to past dates audit-logged. |
| GET | `/api/attendance/teacher/:id` **[v1.1]** | admin OR `can_mark_all_attendance` | `?month=&year=` → that teacher's log + counts. |

## 8. Dashboard, Audit, Health **[v1.1]**

| Method | Endpoint | Access | Description |
|---|---|---|---|
| GET | `/api/dashboard/summary` | Authenticated | Admin: `{ activeTeachers, activeStudents, attendanceToday: {present, absent, late, leave, notMarked}, fees: { month, expected, collected, pending, overdue } }`. Teacher: own month counts + sections only for flags held. |
| GET | `/api/audit-logs` | admin only | `?entity_type=&actor_id=&from=&to=&page=` — read only. |
| GET | `/api/health` | Public | `{ status: "ok" }` (also use for uptime pings). Does a trivial DB `SELECT 1`. |

---

## 9. Middleware Reference Implementation

```js
// middleware/verifyAuth.js
const jwt = require('jsonwebtoken');
const pool = require('../config/db');

module.exports = async function verifyAuth(req, res, next) {
  try {
    const token = req.cookies?.academy_token;
    if (!token) return res.status(401).json({ error: { code: 'UNAUTHENTICATED', message: 'Authentication required' } });
    const payload = jwt.verify(token, process.env.JWT_SECRET); // throws if invalid/expired
    const { rows } = await pool.query(
      `SELECT id, full_name, username, role, is_active, token_version,
              can_view_students, can_manage_students, can_mark_all_attendance, can_manage_fees
         FROM users WHERE id = $1`, [payload.sub]);
    const user = rows[0];
    if (!user || !user.is_active || user.token_version !== payload.tv) {
      return res.status(401).json({ error: { code: 'UNAUTHENTICATED', message: 'Session invalid' } });
    }
    req.user = user;
    next();
  } catch (e) {
    return res.status(401).json({ error: { code: 'UNAUTHENTICATED', message: 'Session invalid' } });
  }
};
```

```js
// middleware/requirePermission.js
const requirePermission = (...allowedFlags) => (req, res, next) => {
  if (!req.user) return res.status(401).json({ error: { code: 'UNAUTHENTICATED', message: 'Authentication required' } });
  if (req.user.role === 'admin') return next(); // Principal: unrestricted
  const ok = allowedFlags.some((flag) => req.user[flag] === true);
  if (!ok) return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Access denied: insufficient permissions' } });
  next();
};
module.exports = requirePermission;

// Usage examples
// router.get('/students',  verifyAuth, requirePermission('can_view_students','can_manage_students'), listStudents);
// router.post('/students', verifyAuth, requirePermission('can_manage_students'), createStudent);
// router.get('/fees',      verifyAuth, requirePermission('can_manage_fees'), feeSheet);
// router.get('/teachers',  verifyAuth, requireAdmin, listTeachers);   // requireAdmin = role === 'admin'
```

## 10. Endpoint × Role Test Matrix (write automated tests for each row)

| Endpoint group | No cookie | Teacher, no flags | Teacher with matching flag | Admin |
|---|---|---|---|---|
| `/api/teachers*` | 401 | 403 | 403 (admin only) | 2xx |
| `/api/students` read | 401 | 403 | 2xx (`view` or `manage`) | 2xx |
| `/api/students` write | 401 | 403 | 2xx (`manage`) / 403 (`view` only) | 2xx |
| `/api/fees*` | 401 | 403 | 2xx (`fees`) | 2xx |
| fee revert | 401 | 403 | 403 | 2xx |
| `/api/attendance/my` | 401 | 2xx (own rows only) | 2xx | 2xx |
| `/api/attendance` (all) / bulk | 401 | 403 | 2xx (`mark_all`), own id rejected | 2xx |
| `/api/audit-logs` | 401 | 403 | 403 | 2xx |
| Archived teacher with old cookie | — | 401 | 401 | — |
