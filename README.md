# PlanAI: Database & Development Guidelines

This document contains critical learnings and specific configuration details for the **PlanAI** SaaS platform, particularly regarding its integration with Neon PostgreSQL and the cross-environment development workflow.

## 🗄️ Database Management (Neon PostgreSQL)

### 🚀 Migration Strategy
- **Auto-Migration**: The server is configured to run `src/migrations/rbac_setup.js` automatically on every startup in `src/index.js`.
- **Manual Execution**: To manually trigger a migration or debug script, use the absolute path to Node:
  ```bash
  /usr/local/bin/node src/migrations/rbac_setup.js
  ```
- **Resilience**: Always use `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` in migration scripts. This prevents "Duplicate Column" or "Undefined Column" errors when working with an evolving schema in a live Neon environment.

### 🔍 Debugging Schema
If you encounter "Undefined Column" errors (PostgreSQL code `42703`), verify the bridge between existing tables and new migration requirements using a script like `debug_perms.js`. 
> [!NOTE]
> The `permissions` table was previously created with a `category` column; the current standard uses `group_name` for consistency with the Role CRUD interface.

## 🛠 Development Workflow

### ⚡ Environment Context
- **Node Binary**: On this system, `node` is located at `/usr/local/bin/node`. If the shell reports `command not found`, use the absolute path.
- **Auto-Reloading**: This project uses a standard `node` process via `npm run dev`. **It does not use nodemon.** 
  - *Action*: You MUST manually restart the backend process after changing controller logic or adding new routes to pick up changes.

### 🔐 RBAC Logic
- **Granting Access**: Project visibility is dynamic. A member "gains" a project automatically when an Admin assigns them a task.
- **Access Rule**: 
  ```sql
  WHERE p.org_id = $1 AND (is_admin OR user_has_task_in_project)
  ```

---

## 🚀 Vercel Deployment (Production)

The platform is architected as a **Monorepo** and is optimized for the Vercel Serverless environment.

### 1. Project Orchestration
- **Root Configuration**: The [vercel.json](file:///Users/kashishsingh/Desktop/%20project%208sem/vercel.json) orchestrates the entire deployment.
- **Rewrites**: All `/api/*` traffic is routed to the Express backend (`api/index.js`), while all other traffic is handled by the React frontend.

### 2. Required Environment Variables
You must provision the following secrets in your Vercel Project Settings (Production Scope) to ensure full functionality:

| Variable | Description |
| :--- | :--- |
| `DATABASE_URL` | Neon PostgreSQL connection string (use Pooled version) |
| `JWT_SECRET` | Secure string for signing auth tokens |
| `GEMINI_API_KEY_1` | Primary Google Gemini Pro AI Key |
| `SMTP_HOST` | e.g., `smtp.gmail.com` |
| `SMTP_PORT` | `587` (Standard) or `465` (Secure) |
| `SMTP_USER` | Your email address |
| `SMTP_PASS` | Your App Password (NOT your regular password) |
| `SMTP_FROM` | The sender name/email displayed to users |

> [!IMPORTANT]
> **No Newlines**: Ensure there are no trailing carriage returns or newlines in your Vercel environment variables, as this will cause "EBUSY" or "getaddrinfo" DNS errors for the SMTP and Database connections.

### 3. Deployment Command
To avoid native binding issues with Vite/Rolldown in the cloud builder, it is highly recommended to use the **Local Pre-build** method:

```bash
# 1. Pull settings & fresh environment
vercel pull --yes

# 2. Build the project locally (using Vercel's logic)
vercel build --prod

# 3. Deploy the pre-packaged assets directly
vercel deploy --prebuilt --prod --yes
```

### 4. Serverless Constraints
- **Background Tasks**: The standard `setInterval` scheduler is disabled on Vercel. Use **Vercel Cron Jobs** to trigger the `/api/index.js` endpoints for daily/weekly reporting.
- **Cold Starts**: The `mailService.js` is optimized with a factory pattern to verify connections on every request, ensuring emails never fail due to stale sockets.
