# JustProjects

JustProjects is a multi-tenant project-management workspace for teams that
need a dependable customer-facing delivery story. It combines projects,
nested tasks, configurable workflows, milestones, public read-only pages, and
GitHub synchronization behind backend-owned sessions and authorization.

## Repository layout

- `services/frontend` — Next.js 16, React 19, shadcn/Base UI, and ReUI views.
- `services/backend` — Go, Gin, Bun, pgx/PostgreSQL, migrations, auth, and the
  PostgreSQL-backed outbox worker.
- `services/backend/api/openapi.yaml` — checked-in `/api/v1` contract.
- `docker-compose.yml` — local PostgreSQL, API, and worker services.

## Run locally

```bash
cp services/backend/.env.example services/backend/.env
cp services/frontend/.env.example services/frontend/.env.local
docker compose up -d postgres

# terminal 1
cd services/backend && go run .

# terminal 2
cd services/backend && go run ./cmd/worker

# terminal 3
cd services/frontend && pnpm install && pnpm dev
```

The frontend renders a complete seeded preview when `NEXT_PUBLIC_API_URL` is
unset. Set it to `http://localhost:8080` to use the API, then create an account
at `POST /api/v1/auth/register` or through the app’s account flow. Backend
migrations run automatically on API and worker startup.

## Contract generation

`make generate` refreshes the Go transport output and frontend TypeScript
types. The frontend command can also be run directly:

```bash
cd services/frontend
pnpm generate:api-types
```

The current HTTP server keeps the handlers explicit so repository-level tenant
authorization remains visible. The OpenAPI generation hook is in
`services/backend/internal/openapi/generate.go`; install `oapi-codegen` in the
backend toolchain before running the Go generation step.

## Security boundaries

Sessions are random opaque tokens stored as hashes and delivered in an
`HttpOnly` cookie. Passwords use Argon2id. GitHub access tokens are encrypted
at rest, webhook signatures are verified before persistence, delivery IDs are
deduplicated, public links store only hashes, and customer pages expose only
customer-visible records. Production deployments should provide a stable
`APP_ENCRYPTION_KEY`, HTTPS, restrictive `ALLOWED_ORIGINS`, and a real GitHub
webhook secret.

## Verification

```bash
cd services/backend && go test ./...
cd services/frontend && pnpm typecheck && pnpm lint && pnpm build
```

The first vertical slice includes unit coverage for password verification,
remote status mapping, and conflict detection. PostgreSQL integration,
Playwright smoke flows, and a richer authenticated customer-viewer
administration screen are the next hardening steps; the API already supports
the end-to-end import, webhook reconciliation, public-link, and customer-login
flows.
