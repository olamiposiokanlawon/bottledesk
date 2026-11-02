# Builds the web app and runs the BottleDesk server. Records are kept in the /data folder (mount a disk there!).
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=3000 DATA_DIR=/data
COPY package.json ./
COPY server ./server
COPY src/lib ./src/lib
COPY --from=build /app/dist ./dist
VOLUME /data
EXPOSE 3000
CMD ["node", "server/index.js"]
