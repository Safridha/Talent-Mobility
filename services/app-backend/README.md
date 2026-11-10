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
- `GET /api/monitoring/positions` returns the position-to-division/department/unit mapping.
- `GET /api/monitoring/applications` returns application counts per position without applicant names or email addresses.
- `POST /api/admin/login` accepts the configured admin email and password.
- `POST /api/admin/logout` revokes the admin bearer token.
- `GET /api/admin/dashboard` returns position and application counts by status.
- `GET /api/admin/jobs` lists all positions; `POST /api/admin/jobs` creates one.
- `PUT /api/admin/jobs/{id}` updates a position; `PATCH /api/admin/jobs/{id}/status` opens or closes it. Positions are not hard-deleted.
- `GET /api/admin/applications` lists applicant details; `GET /api/admin/applications/{id}` returns one application.
- `PATCH /api/admin/applications/{id}/status` updates its review status.
- `POST /api/register` accepts `name`, `email`, and `password`, then returns an applicant session.
- `POST /api/login` accepts `email` and `password`, then returns an applicant session.
- `GET /api/applications` lists the signed-in applicant's applications.
- `POST /api/applications` accepts `job_id` and requires `Authorization: Bearer <token>`.
- `POST /api/logout` revokes the current applicant token.

Passwords are stored as Argon2 hashes. API tokens expire after 24 hours and are stored as SHA-256 hashes.
All `/api/admin/*` data endpoints require an admin bearer token. Public monitoring only exposes aggregate application counts.
