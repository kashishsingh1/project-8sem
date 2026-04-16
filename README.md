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

## 📧 Email Flow
The system uses `mailService.js` for:
1. **Invites**: Secure 32-byte token generation with 48h expiry.
2. **Project Setup**: AI-generated plan confirmations.

Always ensure `FRONTEND_URL` is set in the `.env` to generate valid invitation links.
