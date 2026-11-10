# app-backend

Axum recruitment API with PostgreSQL, applicant accounts, bearer-token authentication, and the React build served from the same origin.

## Requirements

- Rust and Cargo
- PostgreSQL
- Node.js and npm for the React frontend

## Run locally

From the project root, copy the example environment file, set the PostgreSQL connection, and configure all three `ADMIN_*` bootstrap values with a unique password of at least 12 characters:

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

Open `http://127.0.0.1:8000`. Vite serves the frontend on port 8000 and proxies `/api` to the Rust backend on internal port 8001. SQLx applies the schema and six sample positions on startup. Press `Ctrl+C` to stop both processes.

To enable forgotten-password emails, set `SMTP_HOST`, `SMTP_PORT`, `SMTP_USERNAME`, `SMTP_PASSWORD`, `SMTP_FROM`, and `APP_PUBLIC_URL` in the server environment. Do not commit SMTP credentials.

To run the production-style build instead, use `npm run build` followed by `cargo run -p app-backend`; the backend serves the built React app and API on port 8000.

## API

- `GET /api/jobs` returns open jobs publicly.
- `GET /api/monitoring/positions` returns the position-to-division/department/unit mapping and requires an admin bearer token.
- `POST /api/admin/login` remains available as a legacy admin-only login endpoint.
- `POST /api/admin/logout` revokes the admin bearer token.
- `GET /api/admin/dashboard` returns position and application counts by status.
- `GET /api/admin/job-types` lists managed job types; `POST` creates one, `PUT /api/admin/job-types/{id}` renames one, and `DELETE` removes an unused type.
- `GET /api/admin/organization` returns the Divisi → Departemen → Biro hierarchy.
- `POST /api/admin/divisions`, `/api/admin/departments`, and `/api/admin/bureaus` create organization records; matching `PUT` and `DELETE` routes manage them.
- `GET /api/admin/jobs` lists all positions; `POST /api/admin/jobs` creates one.
- `DELETE /api/admin/jobs/{id}` permanently deletes only a position with no applications; positions with application history can only be closed.
- `POST /api/admin/jobs` and `PUT /api/admin/jobs/{id}` use `bureau_id`; hierarchy labels are resolved from its parent records.
- Job posting `job_type` values must match a type from `/api/admin/job-types`; types used by existing jobs cannot be deleted.
- `PATCH /api/admin/jobs/{id}/status` opens or closes a position.
- `GET /api/admin/applications` lists applicant details; `GET /api/admin/applications/{id}` returns one application.
- `GET /api/admin/applications/{id}/documents/{document_id}` downloads a private application PDF and requires an admin bearer token.
- `PATCH /api/admin/applications/{id}/status` accepts `status` and an optional `reason` (up to 1000 characters), updates the review status, and creates a notification for the applicant when the status changes. A reason is required when the new status is `rejected`; any supplied reason is included in the notification.
- `GET /api/admin/accounts` lists applicant accounts and application counts; `POST /api/admin/accounts` creates an account.
- `PUT /api/admin/accounts/{id}` updates an account and optionally resets its password; `DELETE /api/admin/accounts/{id}` deactivates it without deleting application history.
- `PATCH /api/admin/accounts/{id}/status` reactivates or deactivates an account. Deactivation revokes active applicant sessions.
- `GET /api/admin/admin-accounts` lists administrator accounts; `POST /api/admin/admin-accounts` creates one.
- `PUT /api/admin/admin-accounts/{id}` updates another administrator and optionally resets its password; `DELETE /api/admin/admin-accounts/{id}` deactivates it.
- `PATCH /api/admin/admin-accounts/{id}/status` reactivates or deactivates an administrator. The current administrator and the final active administrator cannot be deactivated; status changes revoke active sessions.
- `POST /api/register` accepts `name`, `email`, and `password`, then returns an applicant session.
- `POST /api/login` accepts `email` and `password`, then returns an applicant or admin session with its `role`.
- `GET /api/applications` lists the signed-in applicant's applications.
- `GET /api/notifications` lists the signed-in applicant's application-status notifications and unread count; `PATCH /api/notifications/{id}/read` marks an owned notification as read.
- `POST /api/applications` accepts `multipart/form-data` with `job_id`, `employee_number`, `applicant_full_name`, `origin_division`, `origin_unit`, `education_level`, `study_field`, `motivation`, and one to five repeated `supporting_document` PDF fields. Each file is limited to 5 MB and requires an applicant bearer token.
- `POST /api/logout` revokes the current applicant token.
- `GET /api/account/profile` returns the signed-in applicant/admin profile; `PATCH` updates the display name.
- `GET`, `POST`, and `DELETE /api/account/avatar` view, upload, or remove the signed-in account's JPG, PNG, or WebP profile photo (maximum 2 MB).
- `POST /api/account/password` changes the signed-in user's password after verifying the current password.
- `POST /api/password/forgot` sends a one-hour, single-use reset link when SMTP is configured; `POST /api/password/reset` consumes the link and invalidates active sessions.

Passwords are stored as Argon2 hashes. Applicant tokens expire after 24 hours and admin tokens after 8 hours; both are stored as SHA-256 hashes.
All `/api/admin/*` data endpoints and `/api/monitoring/positions` require an admin bearer token.
Application IDs exposed in API routes are ULIDs; numeric database IDs remain internal. Existing applications receive a ULID on startup. Application details and PDF documents are persisted in PostgreSQL; document bytes are never exposed by public endpoints.
