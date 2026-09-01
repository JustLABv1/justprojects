FRONTEND_DIR := services/frontend
BACKEND_DIR := services/backend

.PHONY: dev db backend worker frontend generate format test

db:
	docker compose up -d postgres

backend:
	cd $(BACKEND_DIR) && go run .

worker:
	cd $(BACKEND_DIR) && go run ./cmd/worker

frontend:
	cd $(FRONTEND_DIR) && pnpm dev

generate:
	cd $(BACKEND_DIR) && go generate ./internal/openapi
	cd $(FRONTEND_DIR) && pnpm generate:api-types

format:
	cd $(BACKEND_DIR) && gofmt -w $$(find . -name '*.go' -not -path './vendor/*')
	cd $(FRONTEND_DIR) && pnpm exec prettier --write '**/*.{ts,tsx}'

test:
	cd $(BACKEND_DIR) && go test ./...
	cd $(FRONTEND_DIR) && pnpm typecheck && pnpm lint && pnpm build
