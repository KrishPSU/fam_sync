# FamSync

A real-time family organizer that keeps everyone on the same page — events, tasks, notes, files, and quick messages, all synced the moment something changes.

---

## Why It Exists

Keeping a family coordinated across different schedules and devices is messy. Texts get buried, shared calendars go stale, and important notes live in five different apps. FamSync puts everything in one place with live updates so every family member always sees the current picture — no refreshing, no chasing people down.

---

## Features

### Today Dashboard
Your daily home base. See all of today's events with times, a task checklist, quick notes/cards, and a live local weather forecast pulled from the National Weather Service.

### Tasks & Events
Create events with specific times or tasks with checkboxes. Mark items as private (visible only to you) or shared with the whole family. Everything syncs instantly across all connected devices.

### Cards / Notes
Free-form note cards for anything that doesn't fit a task or event — shopping lists, reminders, ideas. Cards support file attachments (PDFs, Word docs, images, and more).

### Pings
Send a quick one-tap message to a specific family member or everyone at once. Delivered as a web push notification even when they have the app closed. A fallback in-app banner handles cases where push delivery fails. Includes a full sent/received message history.

### Files
Upload and share files through cards. View all family-shared files or just your own in a dual-tab layout. Supports download, metadata display, and the files are automatically indexed so the AI assistant can read them.

### AI Assistant
Ask questions about your family's schedule, tasks, notes, or uploaded files in plain English. Powered by Llama 3.3 70B (via Groq) and scoped to only what you're authorized to see. It cites the specific items or files it references. Rate-limited to 20 requests per hour.

### Family Management
Create a family or join one with an invite code. See all members with their display names and avatars. Manage settings and membership from a single panel.

### PWA — Works Like a Native App
Installable on iOS (Safari) and Android (Chrome) as a home screen app. Service workers handle push notifications and offline-ready behavior.

---

## Tech Stack

| Layer | Tools |
|---|---|
| Frontend | Vanilla HTML/CSS/JS, Socket.IO client, Supabase JS |
| Backend | Node.js, Express, Socket.IO |
| Database | PostgreSQL via Supabase with Row-Level Security |
| Auth | Google OAuth via Supabase |
| AI | Groq SDK (Llama 3.3 70B) |
| Files | Multer, Supabase Storage, pdf-parse, mammoth |
| Notifications | Web Push (VAPID), Service Workers |
| Weather | National Weather Service API |

---

## Security

- Row-Level Security enforced at the PostgreSQL level — the database itself blocks unauthorized reads, not just the app.
- Every Socket.IO connection uses a user-scoped Supabase client so RLS is applied to all real-time queries.
- Privacy tiers let you mark any item private before the family ever sees it.

---

## Project Structure

```
fam_sync/
├── app/
│   ├── pages/          # HTML pages (landing, sign-in, main app)
│   ├── js/             # Frontend modules (auth, pages, events, AI, files…)
│   └── css/            # Stylesheets
├── index.js            # Express server + Socket.IO + REST API
├── ai.js               # AI assistant logic
├── file-indexer.js     # PDF/Word text extraction and chunking
└── db/                 # SQL migrations and RLS policies
```
