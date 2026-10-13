FROM node:22-alpine
WORKDIR /app
COPY server.js package.json ./
COPY public ./public
ENV NODE_ENV=production
# ACCESS_PASSWORD must be provided by the host (the server refuses to start publicly without it)
EXPOSE 8787
USER node
CMD ["node", "server.js"]
