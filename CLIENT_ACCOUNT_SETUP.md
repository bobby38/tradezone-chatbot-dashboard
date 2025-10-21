# Client Account Setup Guide

## Overview
This guide explains how to create a secure client account with appropriate permissions while protecting critical system operations.

---

## Current Role System

Your system uses a **3-tier role hierarchy**:

| Role | Permissions | Use Case |
|------|------------|----------|
| **admin** | Full access to organization settings, can modify ChatKit config, manage users | Your account (owner) |
| **editor** | Can view/create/edit content, view analytics, manage submissions | ✅ **Recommended for clients** |
| **viewer** | Read-only access to analytics and content | Limited access clients |

---

## What Clients CAN Access (Editor Role)

### ✅ Safe Operations
- **Dashboard Overview** - View all analytics and metrics
- **Chat Logs** - View conversation history, search, filter, export CSV
- **Session Management** - View chat sessions and session details
- **Form Submissions** - Create, view, edit, delete submissions
- **AI Content Generation** - Generate content drafts with AI
- **Email Management** - View extracted emails, manage contacts
- **Analytics** - Full access to:
  - Google Analytics 4 data
  - Search Console metrics
  - WooCommerce orders
  - AI Insights
- **Chat Interface** - Use text and voice chat (ChatKit)
- **Profile Settings** - Update their own profile info

### ❌ What Clients CANNOT Access (Protected Operations)

**Critical System Settings** (Admin-only):
- ❌ ChatKit configuration (API keys, models, prompts)
- ❌ Organization settings (webhook config, API credentials)
- ❌ User management (cannot add/remove users)
- ❌ RLS policies and database schema
- ❌ Environment variables
- ❌ Security settings and rate limits
- ❌ Integration credentials (Google, WooCommerce, OpenAI)
- ❌ Budget controls and spending limits

**Database Operations** (System-only):
- ❌ Direct database access
- ❌ SQL migrations
- ❌ Table modifications
- ❌ RLS policy changes

---

## Step-by-Step: Create Client Account

### Method 1: Via Supabase Dashboard (Recommended)

**Step 1: Create User in Supabase Auth**
```bash
1. Go to: https://supabase.com/dashboard/project/YOUR_PROJECT/auth/users
2. Click "Add user" → "Create new user"
3. Enter:
   - Email: client@example.com
   - Password: (Generate strong password)
   - Auto Confirm User: ✅ (checked)
4. Click "Create user"
5. Copy the User ID (UUID) - you'll need this next
```

**Step 2: Create Profile**
```sql
-- Run in Supabase SQL Editor
INSERT INTO profiles (id, email, full_name)
VALUES (
  'USER_ID_FROM_STEP_1'::uuid,
  'client@example.com',
  'Client Name'
);
```

**Step 3: Link User to Organization (Editor Role)**
```sql
-- Run in Supabase SQL Editor
-- Replace YOUR_ORG_ID with your organization's ID
INSERT INTO user_organizations (user_id, org_id, role)
VALUES (
  'USER_ID_FROM_STEP_1'::uuid,
  'YOUR_ORG_ID'::uuid,
  'editor'  -- ✅ Safe client role
);
```

**Step 4: Verify Setup**
```sql
-- Check the user was created correctly
SELECT 
  p.email, 
  p.full_name, 
  uo.role, 
  o.name as organization
FROM profiles p
JOIN user_organizations uo ON p.id = uo.user_id
JOIN organizations o ON uo.org_id = o.id
WHERE p.email = 'client@example.com';
```

---

## Getting Your Organization ID

```sql
-- Run in Supabase SQL Editor
SELECT id, name, slug FROM organizations;
```

Or check your current setup:
```sql
-- See what org you're currently in
SELECT o.id, o.name, uo.role
FROM organizations o
JOIN user_organizations uo ON o.id = uo.org_id
WHERE uo.user_id = auth.uid();
```

---

## Client Onboarding Checklist

After creating the account, send this to your client:

```
✅ Account Created!

Login URL: https://your-dashboard.com/login
Email: client@example.com
Password: [SEND_VIA_SECURE_CHANNEL]

What you can do:
- View all analytics and chat logs
- Create and edit content submissions
- Use AI chat assistant
- Export data to CSV
- View WooCommerce orders
- Access Google Analytics and Search Console data

What you cannot do:
- Change API keys or system settings
- Add/remove users
- Modify ChatKit configuration
- Access billing or security settings

Need help? Contact: your-email@example.com
```

---

## Security Boundaries (Technical Details)

### RLS Policies in Effect

**Profiles Table:**
- Users can only view/update their own profile
- Cannot delete profiles

**Organizations Table:**
- **Editor role**: Can VIEW organization data
- **Admin role**: Can VIEW + UPDATE organization settings
- Cannot DELETE organizations

**User Organizations Table:**
- Users can only view their own memberships
- Cannot modify roles (prevents privilege escalation)

**Submissions Table:**
- Can create/view/edit submissions in their organization
- Scoped to organization via RLS

**Chat Logs Table:**
- Currently uses service role key (webhook endpoint)
- Client can VIEW via dashboard UI
- Cannot directly INSERT (protected by API layer)

**Settings Table:**
- Admin-only access via RLS
- Editors cannot read or write settings

---

## Upgrading/Downgrading Roles

### Upgrade Editor → Admin (Careful!)
```sql
UPDATE user_organizations
SET role = 'admin'
WHERE user_id = 'CLIENT_USER_ID'::uuid
AND org_id = 'YOUR_ORG_ID'::uuid;
```

### Downgrade Admin → Editor
```sql
UPDATE user_organizations
SET role = 'editor'
WHERE user_id = 'CLIENT_USER_ID'::uuid
AND org_id = 'YOUR_ORG_ID'::uuid;
```

### Downgrade to Viewer (Read-only)
```sql
UPDATE user_organizations
SET role = 'viewer'
WHERE user_id = 'CLIENT_USER_ID'::uuid
AND org_id = 'YOUR_ORG_ID'::uuid;
```

---

## Removing Client Access

### Soft Delete (Recommended)
```sql
-- Remove organization membership (keeps auth user)
DELETE FROM user_organizations
WHERE user_id = 'CLIENT_USER_ID'::uuid
AND org_id = 'YOUR_ORG_ID'::uuid;
```

### Hard Delete (Nuclear Option)
```sql
-- 1. Remove org membership
DELETE FROM user_organizations WHERE user_id = 'CLIENT_USER_ID'::uuid;

-- 2. Delete profile
DELETE FROM profiles WHERE id = 'CLIENT_USER_ID'::uuid;

-- 3. Delete from Supabase Auth (do this via Dashboard)
-- Go to: Auth → Users → [Select User] → Delete User
```

---

## Monitoring Client Activity

### View Client's Recent Actions
```sql
-- Chat activity
SELECT 
  session_id,
  prompt,
  created_at
FROM chat_logs
WHERE user_id = 'CLIENT_USER_ID'
ORDER BY created_at DESC
LIMIT 50;

-- Submissions created
SELECT 
  title,
  content_type,
  status,
  created_at
FROM submissions
WHERE user_id = 'CLIENT_USER_ID'::uuid
ORDER BY created_at DESC;
```

### Security Event Monitoring
```sql
-- Check for suspicious activity
SELECT * FROM chat_security_events
WHERE session_id LIKE '%CLIENT_USER_ID%'
ORDER BY timestamp DESC;
```

---

## Best Practices

1. **Always use 'editor' role for clients** - Safer than admin
2. **Never share your admin account** - Create separate accounts
3. **Use strong passwords** - Generate via password manager
4. **Review access quarterly** - Remove inactive users
5. **Monitor usage metrics** - Check `chat_usage_metrics` table
6. **Document who has access** - Keep a spreadsheet/doc

---

## Summary

**Recommended Setup for Clients:**
- ✅ Role: **editor**
- ✅ Access: Dashboard, analytics, content, chat
- ❌ Cannot: Change settings, API keys, user management
- ✅ Protected: All critical system operations via RLS + API keys
