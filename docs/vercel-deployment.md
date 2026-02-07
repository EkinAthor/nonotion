# Nonotion Vercel Deployment Guide

This guide covers deploying the Nonotion monorepo to Vercel, connecting it to an existing Supabase PostgreSQL database.

## Prerequisites

1.  **Vercel Account**: Sign up at [vercel.com](https://vercel.com).
2.  **Supabase Project**: An active Supabase project with a PostgreSQL database.
3.  **Vercel CLI (Optional)**: Useful for local testing and manual deployments.

---

## 1. Supabase Preparation

Ensure your Supabase database is ready:
1.  Go to your Supabase Project Settings > Database.
2.  Copy the **Connection string** (URI). It should look like:
    `postgresql://postgres:[YOUR-PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres`

---

## 2. Deploying the API (apps/api)

The API is a Fastify application that will run as a Vercel Serverless Function.

1.  **Create a New Project** in Vercel.
2.  **Connect your Repository**.
3.  **Project Settings**:
    *   **Project Name**: `nonotion-api` (or similar)
    *   **Framework Preset**: `Other`
    *   **Root Directory**: `apps/api`
    *   **Build Command**: `pnpm build`
    *   **Output Directory**: `dist` (if applicable) or leave default.
4.  **Environment Variables**:
    Add the following variables in Vercel:
    *   `STORAGE_TYPE`: `postgres`
    *   `DATABASE_URL`: Your Supabase connection string.
    *   `JWT_SECRET`: A secure random string.
    *   `CORS_ORIGINS`: The URL of your Web deployment (e.g., `https://nonotion-web.vercel.app`).
    *   `ADMIN_EMAIL`: Your initial admin email.

> [!NOTE]
> The API automatically runs Drizzle migrations on startup when `STORAGE_TYPE=postgres` is set.

---

## 3. Deploying the Web Client (apps/web)

The Web client is a Vite/React application.

1.  **Create another New Project** in Vercel.
2.  **Connect your Repository**.
3.  **Project Settings**:
    *   **Project Name**: `nonotion-web`
    *   **Framework Preset**: `Vite`
    *   **Root Directory**: `apps/web`
4.  **Environment Variables**:
    *   `VITE_API_URL`: The URL of your API deployment (e.g., `https://nonotion-api.vercel.app`).

---

## 4. Troubleshooting

*   **CORS Issues**: Ensure `CORS_ORIGINS` in the API project exactly matches the URL of your Web project (including protocol, no trailing slash).
*   **Database Connection**: If the API fails to start, verify the `DATABASE_URL` is correct and Supabase isn't blocking the connection.
*   **Monorepo Support**: Vercel handles monorepos well. Ensure the "Root Directory" setting is correctly pointed to either `apps/api` or `apps/web` for each respective project.

---

## 5. Updates & Migrations

Whenever you push changes:
1.  Vercel will automatically redeploy.
2.  Schema changes are applied automatically by the API server on boot.
