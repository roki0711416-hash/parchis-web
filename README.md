This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Production Deployment (Vercel)

### 1) Environments (Dev / Preview / Production)

- Local development uses `.env.local` (not committed).
- Vercel provides environment separation out of the box:
	- **Preview**: for PR deployments
	- **Production**: for the main branch deployment

Create `.env.local` from the template:

```bash
cp .env.example .env.local
```

### 2) Database & migrations (Prisma)

This repo includes Prisma as an optional foundation for adding persistence.

- Schema: `prisma/schema.prisma`
- Local migration (creates a migration folder you should commit):

```bash
npm run db:migrate:dev
```

- Production migration on Vercel:
	- Set `DATABASE_URL` in **Production** env vars.
	- Set **Build Command** in Vercel to:

```bash
npm run vercel-build
```

This runs:
- `prisma generate`
- `prisma migrate deploy`
- `next build`

Note: `prisma migrate deploy` expects committed migrations under `prisma/migrations/`.

### 3) Error monitoring (Sentry)

Sentry is wired via `@sentry/nextjs` and these config files:

- `sentry.client.config.ts`
- `sentry.server.config.ts`
- `sentry.edge.config.ts`

On Vercel, set at minimum:

- `NEXT_PUBLIC_SENTRY_DSN` (client)
- `SENTRY_DSN` (server; can be the same DSN)

If you want sourcemaps uploaded during build, also set:

- `SENTRY_AUTH_TOKEN`
- `SENTRY_ORG`
- `SENTRY_PROJECT`

### 4) Uploads / images (Object Storage)

This repo currently does not include server-side file uploads.
If you add uploads later, avoid writing to the server filesystem on Vercel (ephemeral).
Use S3-compatible object storage (AWS S3 / Cloudflare R2) with presigned URLs.
