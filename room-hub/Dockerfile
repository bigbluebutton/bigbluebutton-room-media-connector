FROM golang:1.21-alpine AS builder

WORKDIR /proj

COPY go.mod ./
COPY go.sum ./
RUN go mod download

COPY *.go ./

RUN go build

FROM scratch

COPY --from=builder /proj/server /server

EXPOSE 8080

CMD [ "/server", "-host=0.0.0.0" ]