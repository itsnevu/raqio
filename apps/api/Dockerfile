# Go 1.25 (tag minor supaya patch keamanan ikut saat rebuild). Dependabot (docker, apps/api) mengusulkan versi baru.
FROM golang:1.25-alpine AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /api .

# Runtime distroless tanpa shell, user nonroot (65532). Tag + digest supaya image tidak berubah diam-diam;
# perbarui digest dengan: docker buildx imagetools inspect gcr.io/distroless/static-debian12:nonroot
FROM gcr.io/distroless/static-debian12:nonroot@sha256:afa5c872c891853ca7fcf1f12c3edb23f7eeef36189728842dd51042ff57f7ab
COPY --from=build /api /api
EXPOSE 8080
USER nonroot
ENTRYPOINT ["/api"]
