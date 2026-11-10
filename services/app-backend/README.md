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

To run the production-style build instead, use `npm run build` followed by `cargo run -p app-backend`; the backend serves the built React app and API on port 8000.

## API

- `GET /api/jobs` returns open jobs publicly.
- `GET /api/monitoring/positions` returns the position-to-division/department/unit mapping and requires an admin bearer token.
- `GET /api/monitoring/applications` returns application counts per position and requires an admin bearer token.
- `POST /api/admin/login` remains available as a legacy admin-only login endpoint.
- `POST /api/admin/logout` revokes the admin bearer token.
- `GET /api/admin/dashboard` returns position and application counts by status.
- `GET /api/admin/organization` returns the Divisi → Departemen → Biro hierarchy.
- `POST /api/admin/divisions`, `/api/admin/departments`, and `/api/admin/bureaus` create organization records; matching `PUT` and `DELETE` routes manage them.
- `GET /api/admin/jobs` lists all positions; `POST /api/admin/jobs` creates one.
- `POST /api/admin/jobs` and `PUT /api/admin/jobs/{id}` use `bureau_id`; hierarchy labels are resolved from its parent records.
- `PATCH /api/admin/jobs/{id}/status` opens or closes a position. Positions are not hard-deleted.
- `GET /api/admin/applications` lists applicant details; `GET /api/admin/applications/{id}` returns one application.
- `GET /api/admin/applications/{id}/documents/{document_id}` downloads a private application PDF and requires an admin bearer token.
- `PATCH /api/admin/applications/{id}/status` updates its review status.
- `GET /api/admin/accounts` lists applicant accounts and application counts; `POST /api/admin/accounts` creates an account.
- `PUT /api/admin/accounts/{id}` updates an account and optionally resets its password; `DELETE /api/admin/accounts/{id}` deactivates it without deleting application history.
- `PATCH /api/admin/accounts/{id}/status` reactivates or deactivates an account. Deactivation revokes active applicant sessions.
- `GET /api/admin/admin-accounts` lists administrator accounts; `POST /api/admin/admin-accounts` creates one.
- `PUT /api/admin/admin-accounts/{id}` updates another administrator and optionally resets its password; `DELETE /api/admin/admin-accounts/{id}` deactivates it.
- `PATCH /api/admin/admin-accounts/{id}/status` reactivates or deactivates an administrator. The current administrator and the final active administrator cannot be deactivated; status changes revoke active sessions.
- `POST /api/register` accepts `name`, `email`, and `password`, then returns an applicant session.
- `POST /api/login` accepts `email` and `password`, then returns an applicant or admin session with its `role`.
- `GET /api/applications` lists the signed-in applicant's applications.
- `POST /api/applications` accepts `multipart/form-data` with `job_id`, `employee_number`, `applicant_full_name`, `origin_division`, `origin_unit`, `education_level`, `study_field`, `motivation`, and one to five repeated `supporting_document` PDF fields. Each file is limited to 5 MB and requires an applicant bearer token.
- `POST /api/logout` revokes the current applicant token.

Passwords are stored as Argon2 hashes. Applicant tokens expire after 24 hours and admin tokens after 8 hours; both are stored as SHA-256 hashes.
All `/api/admin/*` data endpoints and both `/api/monitoring/*` endpoints require an admin bearer token.
Application details and PDF documents are persisted in PostgreSQL; document bytes are never exposed by public endpoints.
