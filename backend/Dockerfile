FROM golang:1.24-alpine AS build

WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -o /out/stockroom-server ./cmd/server

FROM alpine:3.22
RUN adduser -D -H stockroom
COPY --from=build /out/stockroom-server /usr/local/bin/stockroom-server
USER stockroom
EXPOSE 8080
ENTRYPOINT ["/usr/local/bin/stockroom-server"]
