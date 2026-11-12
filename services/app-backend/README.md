# app-backend

Axum recruitment API with PostgreSQL, applicant accounts, HttpOnly cookie sessions, and the React build served from the same origin.

## Requirements

- Rust and Cargo
- PostgreSQL
- Node.js and npm for the React frontend

## Run locally

From the project root, copy the example environment file, set the PostgreSQL connection, and configure all three `ADMIN_*` bootstrap values with a unique password of 8–128 characters containing uppercase and lowercase letters, a number, and a symbol:

```powershell
Copy-Item .env.example .env
```

Create the `talent_mobility` database if it does not exist, then install the React dependencies:

```powershell
npm install
```

Start the frontend and backend together from the project root:

```powershell
npm run dev
```

Open `http://127.0.0.1:8000`. Vite serves the frontend on port 8000 and proxies `/api` to the Rust backend on internal port 8001. SQLx applies the schema and seeds the official organization hierarchy on startup. The Super Admin bootstrap account is created from `ADMIN_NAME`, `ADMIN_EMAIL`, and `ADMIN_PASSWORD` when that email is not already registered. Press `Ctrl+C` to stop both processes.

PWA assets are built from `pwa-assets/`; the service worker caches the application shell and static assets, but never API responses. Web Push is optional: configure a matching VAPID public/private key pair using `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY`, plus an optional `VAPID_SUBJECT` (`mailto:` or HTTPS URL). Browser subscriptions are stored per active account and can be removed from its notification panel. Push is sent to admins in the application scope when a new application arrives and to applicants when their application status changes. Production origins must use HTTPS.

To run the production-style build instead, use `npm run build` followed by `cargo run -p app-backend`; the backend serves the built React app and API on port 8000.

## Verify PostgreSQL migrations

The CI backend job starts a disposable PostgreSQL 16 service and runs every checked-in migration against a fresh test database. To run the same integration test locally, use a PostgreSQL connection whose role can create databases; SQLx creates and cleans up a separate temporary database for the test:

```powershell
$env:DATABASE_URL = "postgres://postgres:YOUR_PASSWORD@127.0.0.1:5432/postgres"
cargo test -p app-backend --features postgres-migration-tests --test migrations
Remove-Item Env:DATABASE_URL
```

Use a local or disposable PostgreSQL instance, never production. The regular `cargo test --workspace` suite does not require PostgreSQL; the migration integration test is enabled explicitly with `postgres-migration-tests`.

## API

- `GET /api/monitoring/positions` returns the position-to-division/department/unit mapping and requires an admin session cookie.
- `POST /api/admin/login` remains available as a legacy admin-only login endpoint.
- `POST /api/admin/logout` revokes the admin session and clears its cookie.
- `GET /api/admin/dashboard` returns direct-application counts by status within the administrator's organization scope.
- `GET /api/admin/organization` returns the Divisi → Departemen → Biro hierarchy.
- `POST /api/admin/divisions`, `/api/admin/departments`, and `/api/admin/bureaus` create organization records; matching `PUT` and `DELETE` routes manage them.
- Legacy job-posting, job-type, and employee-directory management endpoints are no longer registered.
- `GET /api/admin/applications` lists applicant details; `GET /api/admin/applications/{id}` returns one application.
- `GET /api/admin/applications/{id}/documents/{document_id}` downloads a private application PDF and requires an admin session cookie.
- `PATCH /api/admin/applications/{id}/status` accepts `status` and an optional `reason` (up to 1000 characters), updates the review status, and creates a notification for the applicant when the status changes. A reason is required when the new status is `rejected`; any supplied reason is included in the notification.
- `GET /api/admin/accounts` lists applicant accounts, application counts, and whether the initial password still needs changing; `POST /api/admin/accounts` creates an account and marks its admin-set initial password for mandatory first-login replacement.
- `PUT /api/admin/accounts/{id}` updates an account and optionally resets its password (which must be changed at next login); `DELETE /api/admin/accounts/{id}` deactivates it without deleting application history.
- `PATCH /api/admin/accounts/{id}/status` reactivates or deactivates an account. Deactivation revokes active applicant sessions.
- `GET /api/admin/admin-accounts` lists administrator accounts; `POST /api/admin/admin-accounts` creates one.
- `PUT /api/admin/admin-accounts/{id}` updates another administrator and optionally resets its password; `DELETE /api/admin/admin-accounts/{id}` deactivates it.
- `PATCH /api/admin/admin-accounts/{id}/status` reactivates or deactivates an administrator. The current administrator and the final active administrator cannot be deactivated; status changes revoke active sessions.
- `POST /api/login` accepts `email` and `password`, then returns an applicant or admin session with its `role`. A newly created or admin-reset applicant account must change its password before using the application.
- Applicant and admin accounts are temporarily suspended for 15 minutes after five failed login attempts; a successful login or password reset clears the failure count.
- `GET /api/session` restores the current session from its HttpOnly cookie.
- `GET /api/applications` lists the signed-in applicant's applications.
- `GET /api/notifications` lists the signed-in applicant's application-status notifications and unread count; `PATCH /api/notifications/{id}/read` marks an owned notification as read.
- `POST /api/applications` accepts `multipart/form-data` with `target_department_id`, optional `target_bureau_id`, `employee_number`, `applicant_full_name`, `origin_division`, `origin_unit`, `education_level`, `study_field`, `motivation`, a required `cv` PDF, and up to four additional `supporting_document` PDFs. Each file is limited to 5 MB and requires an applicant session cookie.
- `POST /api/logout` revokes the current applicant session and clears its cookie.
- `GET /api/account/profile` returns the signed-in applicant/admin profile; `PATCH` updates the display name.
- `GET`, `POST`, and `DELETE /api/account/avatar` view, upload, or remove the signed-in account's JPG, PNG, or WebP profile photo (maximum 2 MB).
- `POST /api/account/password` changes the signed-in user's password after verifying the current password.

Admin accounts combine a fixed role/scope with per-account grants. Super Admin always has full access; only Super Admin can manage administrator accounts or the organization structure. Other administrators can be granted `applications.view/change_status/download_documents`; only the unscoped Admin role can also receive `applicant_accounts.manage`. Write and document permissions require application-view permission. Division and department scope is still enforced by backend queries and mutations, regardless of grants. Applicant accounts are created by an authorized admin with an initial password; the applicant must change it before accessing application data. Public applicant registration is disabled. Resetting an applicant password through account management also requires a change at the next login. Stored job-posting, job-type, and employee-directory tables and records are retained for historical references; the application no longer exposes management endpoints for them.

Passwords are stored as Argon2 hashes. Applicant and admin sessions expire after 30 days; session identifiers are stored as SHA-256 hashes and delivered only in an `HttpOnly`, `SameSite=Strict` cookie. The cookie is marked `Secure` when `APP_PUBLIC_URL` uses HTTPS, and all state-changing requests must have a matching `Origin` and `Host`.
All `/api/admin/*` data endpoints and `/api/monitoring/positions` require an admin session cookie.
Application IDs exposed in API routes are ULIDs; numeric database IDs remain internal. Existing applications receive a ULID on startup. Application details and PDF documents are persisted in PostgreSQL; document bytes are never exposed by public endpoints.

All API responses include `Cache-Control: no-store`. If Cloudflare is used, configure `/api/*` to bypass cache and do not enable Cache Everything for API routes.
