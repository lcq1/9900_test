FROM node:22-alpine AS dependencies

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

FROM dependencies AS build

COPY . .
RUN npm run build

FROM nginx:stable-alpine AS runtime

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

# Production: docker build --target runtime -t comp9900-9900-test-frontend-prod .

CMD ["nginx", "-g", "daemon off;"]

# Default: Vite development server with hot reload.
FROM dependencies AS development

COPY . .

# EXPOSE 80
EXPOSE 5173

# CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "80", "--strictPort"]
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "5173", "--strictPort"]
