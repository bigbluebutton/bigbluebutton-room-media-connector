# Stage 1: Build the JavaScript bundle
FROM node:18 AS build

WORKDIR /app

COPY package*.json ./

RUN npm install

COPY . .

RUN npm run build-bundle

# Stage 2: Copy bundle to the host
FROM alpine:latest
WORKDIR /output

COPY --from=build /app/dist /output
COPY --from=build /app/manifest.json /output

# Copy the bundle to the hosts file system
CMD ["sh", "-c", "cp -r /output/* /plugins/plugins/room-connector-plugin"]
