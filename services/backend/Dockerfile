FROM golang:1.26-alpine AS build

WORKDIR /src
COPY services/backend/go.mod services/backend/go.sum ./
RUN go mod download
COPY services/backend/ ./
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/api .
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/worker ./cmd/worker

FROM alpine:3.22
ARG APP_VERSION=dev
LABEL org.opencontainers.image.version=$APP_VERSION
RUN addgroup -S app && adduser -S -G app app
WORKDIR /app
COPY --from=build /out/api /app/api
COPY --from=build /out/worker /app/worker
COPY --from=build /src/internal/db/migrations /app/internal/db/migrations
RUN apk add --no-cache ca-certificates
USER app
EXPOSE 8080
ENTRYPOINT ["/app/api"]
