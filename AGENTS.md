# AGENTS.md

Project: Academy Management System (Grade 1–12 academy). Specs live in /docs — read all four before coding.
Stack: React+Vite+Tailwind (frontend), Node+Express (backend), PostgreSQL 15+.

Rules:
1. Follow the build order in docs/04 phases. One phase at a time; run tests before moving on.
2. Authorization is server-side only. Every route uses verifyAuth then requirePermission/requireAdmin. Never trust the client or UI hiding.
3. Never hard-delete students, teachers, fees or attendance — archive instead.
4. Dates are Asia/Karachi calendar dates. Never use the server's UTC "today".
5. Validate all input with zod; parameterised SQL only; never log passwords, hashes, CNIC.
6. Do not put permissions inside the JWT; read flags from the DB on every request.
7. Fee sheet must include students with no fee_records row (unpaid). fee_amount is a snapshot.
8. If a spec is ambiguous or conflicts, ask the user — do not invent; list assumptions in the PR/summary.
9. Keep docs in /docs in sync when behaviour changes.
