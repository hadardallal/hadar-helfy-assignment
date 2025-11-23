# FROM node:18-alpine AS builder

# WORKDIR /app

# COPY package*.json ./
# RUN npm ci --omit=dev || npm install --production

# COPY . .

# FROM node:18-alpine

# WORKDIR /app

# COPY --from=builder /app ./

# ENV NODE_ENV=production

# USER node

# CMD ["node", "index.js"]

FROM node:18

WORKDIR /app

COPY package*.json ./
RUN npm install --only=production

COPY . .

EXPOSE 9100

ENV NODE_ENV=production

CMD ["npm", "start"]
