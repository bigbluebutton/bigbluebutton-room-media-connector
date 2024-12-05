FROM golang:1.21-alpine as builder

WORKDIR /proj

COPY go.mod ./
COPY go.sum ./
RUN go mod download

COPY *.go ./

RUN go build -o bbb-room-hub

FROM scratch

COPY --from=builder /proj/bbb-room-hub /bbb-room-hub

EXPOSE 8080

CMD [ "/bbb-room-hub" ]