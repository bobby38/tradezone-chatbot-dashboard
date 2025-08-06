## Cursor project spec — “Izacc Logs” MVP

> **Stack** Next.js 14 · Supabase (Postgres + Auth) · Tailwind · Recharts
> **Goal** A dead-simple admin site that shows chat traffic coming from n8n and asks the user to sign in first. After that we’ll layer on goodies (GitHub export, theming, etc.).

---

### 1 Modules / folders

```
tz-admin/
│
├─ app/                # Next.js App Router
│   ├─ login/          # magic-link screen
│   ├─ overview/       # key numbers + tiny chart
│   ├─ logs/           # last 200 chats
│   ├─ emails/         # outgoing e-mails
│   └─ layout.tsx      # nav + guard
│
├─ lib/
│   ├─ supa.ts         # Supabase client makers
│   └─ hooks/          # useChats(), useEmails()
│
├─ public/brand/       # logo + favicons
└─ .env.example
```

---

### 2 Core user stories

| ID       | Story                                                                                            | Accept test                                                             |
| -------- | ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------- |
| **AU-1** | As an admin I enter my e-mail, click **Send link**, and land in the dash after opening the link. | `auth.users` row created; session cookie present.                       |
| **LG-1** | I open **Chat Logs** and see the last 200 chats in reverse time order.                           | Table shows `created_at`, `session_id` (8 chars), `prompt`, `response`. |
| **OV-1** | I open **Overview** and see total chats this week + a line chart per day.                        | SQL function `chats_per_day()` drives Recharts line.                    |
| **EM-1** | I open **Emails** and see a list of e-mails the workflow fired.                                  | Table shows `send_to`, `subject`, `sent_at`.                            |

---

### 3 Tasks (rough order)

| Task                                                              | Who | Est.    |
| ----------------------------------------------------------------- | --- | ------- |
| T-01 Boot new repo with `create-next-app`, Tailwind, auth helpers | Dev | 0.5 d   |
| T-02 Add Supabase env vars, test magic-link sign-in               | Dev | 0.5 d   |
| T-03 Layout: side bar + protected wrapper                         | Dev | 0.5 d   |
| T-04 Implement `/logs` fetch + table                              | Dev | 0.5 d   |
| T-05 SQL function `chats_per_day()` + `/overview` card + chart    | Dev | 0.5 d   |
| T-06 Emails page                                                  | Dev | 0.25 d  |
| T-07 README with env setup + `vercel.json`                        | Dev | 0.25 d  |
| **Total**                                                         |     | **3 d** |

---

### 4 Growth hooks to leave in place

* **Reusable theming** – `public/brand` assets and CSS vars for colors.
* **Tenant column** (future) – leave placeholder `tenant_id` nullable in all tables.
* **GitHub export** – plan to add `/api/export` route that dumps CSV and commits; keep a folder `scripts/` ready.

---

### 5 Deliverables for this PR

1. **tz-admin repo** with working login and the three pages.
2. **.env.example** that asks only for `NEXT_PUBLIC_SUPABASE_URL` and `ANON_KEY`.
3. **Deploy** button (Vercel).
4. Short Loom video: login, browse logs, click chart.

No need for fancy churn; once this is merged we can slice-in GitHub export or client-specific styling one PR at a time.
