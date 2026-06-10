# Employee Attendance Manager — Plan

Mobile-first single-admin app for managing employees and tracking attendance via QR codes. Built on TanStack Start + Lovable Cloud (Postgres, Auth, Storage, scheduled functions).

## ID format (resolved)

You picked **2-digit department codes**, which means the original 5-digit format expands to **6 digits** to accommodate all 9 departments and future growth:

```
[DD][G][NNN]
 │   │   └─ 3-digit sequential per (dept, gender) bucket, starting 001
 │   └───── Gender (1=Male, 2=Female)
 └───────── Department (01–99; initial: 01=Kitchen, 02=House, 03=Bar,
            04=Hall, 05=Social Media, 06=Admin, 07=Financial Affairs,
            08=Security, 09=Cashier)
```

Example: a male employee in Financial Affairs, 4th hire in that bucket → `071004`.
QR payload = the ID string. If you'd rather strictly keep 5 digits and cap at 9 departments, say so and I'll switch — but 6 digits is the only clean way to honor "2-digit dept codes."

## Stack

- TanStack Start (existing scaffold), Tailwind, shadcn/ui
- Lovable Cloud: Postgres + Auth (email/password) + Storage + scheduled server function
- `html5-qrcode` for camera scanning
- `qrcode` lib to render QR; `jspdf` for QR PDF download
- `xlsx` for Excel export
- All time math in **Africa/Cairo (GMT+2)** via `date-fns-tz`

## Auth

Email/password login (Lovable Cloud). Single admin role enforced via `user_roles` table + `has_role()` security-definer function. App is fully gated under `_authenticated`; no public surfaces beyond `/auth`.

## Database

- `departments(id, code int unique, name text)` — seeded with the 9 departments
- `employees(id uuid, employee_code text unique, full_name, gender smallint, department_id, seq int, created_at)` — code generated server-side
- `attendance(id, employee_id, date date, check_in timestamptz, check_out timestamptz, status text)` — unique `(employee_id, date)`
- RLS: only authenticated admin can read/write. Standard GRANTs to `authenticated` + `service_role`.

## Server functions (`createServerFn`)

- `createEmployee({name, gender, departmentCode})` — atomically computes next `seq` for `(department, gender)` bucket, builds `employee_code`, inserts.
- `scanQr({code})` — looks up employee, finds today's row (Cairo TZ); first scan → `check_in`, second → `check_out`; debounced (ignore re-scans within 10s).
- `getEmployeeAttendance({id, month})` — returns calendar data + counts.
- `exportMaster({month?})` — returns rows for Excel export.
- `markAbsentees()` — scheduled daily at 00:01 Cairo; inserts `status='absent'` rows for employees with no check-in for the previous Cairo day.

## Tabs (bottom nav, mobile-first)

1. **Scanner** — full-screen camera; toast on scan showing employee name + check-in/out action.
2. **Directory** — accordion grouped by department; search by name / ID / QR scan. Employee detail page shows profile, monthly calendar (green=attended, red=absent, gray=future), totals.
3. **Manage** — list with search; Add (name, gender, department) → on save shows generated ID + QR + "Download QR PDF" (QR + name + ID). Edit (name, department only). Delete (confirm).
4. **Master** — table grid of employees × days for selected month with check-in/out times + status; "Export to Excel" button.

## Absence automation

Scheduled server function runs daily at **00:01 Africa/Cairo** via Lovable Cloud cron, marking any employee without a check-in for the previous Cairo day as Absent.

## Out of scope

- Employee-facing UI, multi-admin roles, payroll, shift scheduling.

## Open question

Confirm the **6-digit ID** expansion is acceptable (or revert to strict 5 digits, capping at 9 departments using digit 1–9). I'll proceed with 6 digits by default.

