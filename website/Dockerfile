# Unique Care UK public website — standalone Next.js deployment.
# This is a separate app/deployment from the Unique Care UK application.

FROM node:20-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM node:20-slim AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Public (non-secret) config — the anon key is publishable by design and only
# ever grants read access to published jobs / insert into website_ tables.
ENV NEXT_PUBLIC_JOBS_SUPABASE_URL=https://xjfihknleuwiocoaxsaw.supabase.co
ENV NEXT_PUBLIC_SUPABASE_URL=https://xjfihknleuwiocoaxsaw.supabase.co
# Public anon (publishable) key — permits only: read published jobs,
# insert website_ rows, read approved reviews. Safe to bake into the image.
ENV NEXT_PUBLIC_JOBS_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhqZmloa25sZXV3aW9jb2F4c2F3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI3Nzk4NDUsImV4cCI6MjEwODM1NTg0NX0.l_oh52oWdKNPNW_Yczu790zqKa8Jv1JN6XnmHYPphro
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhqZmloa25sZXV3aW9jb2F4c2F3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI3Nzk4NDUsImV4cCI6MjEwODM1NTg0NX0.l_oh52oWdKNPNW_Yczu790zqKa8Jv1JN6XnmHYPphro
# Existing application's landing page (footer "Admin portal" link + Apply links).
# Flagged for client confirmation (brief section 15.7) — set at build time:
ARG NEXT_PUBLIC_ADMIN_PORTAL_URL=""
ENV NEXT_PUBLIC_ADMIN_PORTAL_URL=$NEXT_PUBLIC_ADMIN_PORTAL_URL

RUN npm run build

FROM node:20-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public

EXPOSE 3000
CMD ["node", "server.js"]
