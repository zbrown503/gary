# Gary V1 Build Spec

Nov 3, 2026 · @Zach

## Purpose and scope

V1 is a single-user, single-project assistant superintendent: one web app that installs on your phone, answers from your project documents, drafts Outlook emails, and edits your look-ahead. The test of V1 is simple: you use it every day on a real job for two weeks and it saves you time.

The core rule for every version: **Gary drafts, you send.** Gary never sends an email, posts to Procore, or changes a schedule without your one-tap approval.

**In V1**

- One user (you), one active project at a time
- Ask Gary: chat or voice, answered from your specs, contract, sub directory and notes, with citations
- Document vault: upload specs, contract, plan sheets, sub directory
- Look-ahead: editable 6-week grid, Excel import and export
- Field notes: quick voice or text capture, turned into to-dos and daily log drafts
- Drafts: Gary writes emails into your Outlook Drafts folder via Microsoft Graph
- Today screen: what's due, what's waiting on you, drafts to review

**Not in V1 (later versions)**

- Procore connection (V2, read-only first)
- "Hey Gary" hands-free wake word (V1 uses a press-and-hold mic button)
- Multiple users, companies, billing (V4)
- Native App Store and Play Store apps (the installable web app covers it)
- Plan conflict checking (V1 only finds things in plans; it doesn't certify them)

**Use test data or your own documents until Stevens approves connecting company systems.**

## Tech stack and accounts

Everything below has a free or low-cost tier; expect roughly $20–60/month in V1, mostly Claude API usage. Confirm current pricing when you sign up.

| Layer | Choice | Why | Account to create |
| --- | --- | --- | --- |
| App framework | Next.js (React, TypeScript) | One codebase for web and installable phone app (PWA); Claude Code knows it well | None |
| Styling | Tailwind CSS + shadcn/ui | Fast, clean, mobile-first components | None |
| Database, login, file storage | Supabase (Postgres + pgvector + Storage + Auth) | One service for data, documents, search index and sign-in | supabase.com |
| Hosting | Vercel | One-click deploys from GitHub | vercel.com |
| AI | Claude API (Sonnet for daily work) | Tool use, long documents, reads images of plan sheets | console.anthropic.com |
| Voice to text | OpenAI Whisper API or Deepgram | Accurate on jobsite jargon; pick one | Either provider |
| Microsoft 365 | Microsoft Graph API | Outlook drafts, calendar, OneDrive files | Azure app registration (portal.azure.com) |
| Excel import/export | SheetJS | Read and write .xlsx look-aheads in the browser | None |
| Code home | GitHub (private repo) | Version history; Vercel deploys from it | github.com |
| Builder | Claude Code | Writes and runs the code with you | Claude subscription |

Use your personal accounts and a personal Microsoft 365 or Outlook.com test mailbox for development, so ownership of the product stays clearly yours.

## Screens

Six screens, Facebook-style: a feed home screen, a bottom tab bar on phone (sidebar on desktop), and a big mic button that floats on every screen. Large tap targets and plain labels so a super can use it with gloves on and no training.

| Screen | What it shows | What you can do | Phone vs desktop |
| --- | --- | --- | --- |
| Today (home) | Feed of cards: to-dos due, items waiting on others, inspections this week, look-ahead activities starting in 3 days, drafts ready to review | Tap a card to open it; check off to-dos; "Morning brief" button summarizes the day | Main phone screen |
| Ask Gary | Chat thread with Gary; every answer cites its source (spec section, page, note) | Type or hold the mic; quick-ask chips like "What's the spec on...", "Who's the sub for...", "Draft an email to..." | Both |
| Look-ahead | 6-week grid: activity, trade, start, finish, duration, status, constraints; weeks as columns with bars | Edit cells, drag bars, or tell Gary "push drywall 3 days" and approve the change; import/export Excel | Desktop-first; phone is view + quick edits |
| Drafts | List of emails Gary has written, with recipient, subject, and why it was drafted | Edit, approve (pushes to Outlook Drafts), or discard | Both |
| Docs | Project vault: specs, contract, plan sheets, sub directory, photos, with upload status | Upload files; search; open a page; ask Gary about this document | Desktop-first |
| Notes | Your field notes in time order, each tagged (to-do, RFI candidate, daily log, sub issue) | Capture by voice or text; convert to to-do, email draft, or daily log line; end-of-day "Build my daily log" | Phone-first |

Settings sits behind the hamburger menu: project info, connect Microsoft account, your email signature, look-ahead export template, distribution lists.

## Gary's tools

Gary is Claude with these tools. Read tools run freely; write tools only create drafts or proposed changes that you approve in the app. Nothing on this list can send, post, or delete.

| Tool | Type | What it does | Inputs | Returns |
| --- | --- | --- | --- | --- |
| `search_docs` | Read | Finds the most relevant passages across specs, contract, notes | query, optional doc type filter | Top passages with doc name, section, page |
| `get_doc_page` | Read | Pulls a full page or plan sheet (sheets go to Claude as images) | doc id, page number | Page text or image |
| `lookup_contact` | Read | Finds a sub, vendor, or team member | name, trade, or company | Name, company, trade, email, phone |
| `get_lookahead` | Read | Returns current look-ahead activities | date range, optional trade | Activity list |
| `list_open_items` | Read | Open to-dos, RFI candidates, waiting-on items | status, owner filter | Item list |
| `get_notes` | Read | Field notes for a date or topic | date range, query | Notes with timestamps |
| `get_calendar` | Read | Your Outlook calendar (Graph) | date range | Events |
| `draft_email` | Draft | Writes an email and saves it to the Drafts screen | to, cc, bcc, subject, body, attachments, reason | Draft id |
| `propose_lookahead_change` | Draft | Proposes edits to activities (dates, durations, notes) | list of changes + reason | Change id shown as a before/after card for approval |
| `create_todo` | Draft | Adds a to-do or waiting-on item | title, due date, owner, linked note | To-do id |
| `draft_daily_log` | Draft | Builds a daily log from the day's notes, weather, and look-ahead | date | Daily log draft |
| `draft_rfi` | Draft | Writes an RFI question with spec and sheet references | subject, question, references | RFI draft (paste into Procore in V1) |

When you approve a `draft_email`, the app (not Gary) calls Graph to place it in your Outlook Drafts folder. You still press Send in Outlook.

## Data model

Ten tables in Supabase. Every table carries `user_id` (and every project-scoped table carries `project_id`) from day one, so V4 (multiple users and companies) doesn't require a rebuild. The fields below list them explicitly; build them exactly as listed.

| Table | Key fields | Notes |
| --- | --- | --- |
| `projects` | id, user\_id, name, number, address, owner, architect, start, substantial completion | One active in V1 |
| `documents` | id, project\_id, user\_id, name, type (spec, contract, plan, directory, other), file\_path, page\_count, status (uploading, indexing, ready) | Files live in Supabase Storage |
| `doc_chunks` | id, document\_id, project\_id, user\_id, section, page, text, embedding (vector) | The searchable index behind `search_docs` |
| `contacts` | id, project\_id, user\_id, name, company, trade, role, email, phone | Imported from your sub directory |
| `activities` | id, project\_id, user\_id, name, trade, start, finish, duration\_days, status, constraints, notes, sort\_order | The look-ahead |
| `activity_changes` | id, activity\_id, project\_id, user\_id, field, old\_value, new\_value, reason, status (proposed, approved, rejected), created\_at, approved\_by, approved\_at | Audit trail for every schedule change |
| `notes` | id, project\_id, user\_id, text, audio\_path, tag, created\_at, location | Field capture |
| `todos` | id, project\_id, user\_id, title, owner, due, status, source\_note\_id | Includes waiting-on items |
| `drafts` | id, project\_id, user\_id, kind (email, daily log, RFI), to, cc, bcc, subject, body, reason, status (pending, approved, sent\_to\_outlook, discarded), graph\_message\_id, created\_at, approved\_by, approved\_at | Everything Gary writes |
| `chat_messages` | id, project\_id, user\_id, role, content, tool\_calls, created\_at | Conversation history for Ask Gary |

Turn on Supabase row-level security so a user can only ever read rows with their own `user_id`.

## Document pipeline

No model training. Documents are split into searchable pieces, and Gary pulls the right pieces into each answer (retrieval-augmented generation, RAG).

1. **Upload.** File goes to Supabase Storage; a `documents` row is created with status "uploading".
2. **Extract text.** Specs and contracts: extract text page by page (pdf-parse or a PDF text service). Scanned pages with no text: run OCR, or send the page image to Claude to transcribe.
3. **Split smartly.** Specs split on section numbers (e.g. 08 71 00) and article headings; contracts on article and clause numbers. Keep each chunk 500–1,000 words with its section number, title, and page attached.
4. **Index.** Create an embedding for each chunk and store it in `doc_chunks` (pgvector). Also keep a plain keyword search, because supers search for exact section numbers and product names.
5. **Plans.** Store each sheet as an image with its sheet number and title. In V1, Gary finds sheets by number, title, and any extractable text, then looks at the image when asked. Answers about plans say "verify on sheet X".
6. **Sub directory.** Import a CSV or Excel directly into `contacts`.
7. **Ready.** Status flips to "ready" and the document appears in Docs.

Every answer Gary gives from documents must cite document, section, and page so you can check it in seconds.

## Integrations

**Microsoft 365 (V1).** Register an app in Azure (Entra ID), sign in with Microsoft OAuth, and request the smallest permissions that work:

- `Mail.ReadWrite` to create drafts in your Drafts folder (no `Mail.Send` in V1, so Gary physically cannot send). Graph has no drafts-only scope, so this permission also allows reading, moving and deleting mail. The app's code only ever calls the create-draft endpoint, and none of Gary's tools can read, move or delete mail; state this plainly in the IT security summary.
- `Calendars.Read` for the Today screen and morning brief
- `Files.Read` (optional) to import look-ahead workbooks and specs from OneDrive
- `offline_access` and `User.Read` to stay signed in

Start with a personal Microsoft 365 or Outlook.com mailbox. Connecting a company mailbox later needs that company's IT admin to approve the app.

**Procore (prep in V1, build in V2).** Create a developer account, register an app in the Procore Developer Portal, and build against the sandbox company Procore provides. V2 starts read-only: RFIs, submittals, daily logs, drawings, directory. Writing to Procore (creating RFI drafts, daily logs) comes after the read side proves reliable. Using it on a real company account requires that company's Procore admin to install the app. Check Procore's current developer docs for endpoints and app review requirements before starting V2.

## Gary's system prompt

This is the starting instruction sent to Claude with every conversation. Project details are filled in from the `projects` table. Tune it as you use it.

```markdown
You are Gary, an assistant superintendent for a commercial construction project.
You work for the superintendent, {user_name}, on {project_name} ({project_number}) at {project_address}.
Today is {date}. Weather today: {weather}.

How you work:
- Be brief and practical. Supers read on a phone between tasks. Lead with the answer.
- Answer from the project documents using search_docs. Always cite document, section, and page.
- If the documents don't answer it, say so plainly. Never guess at spec requirements, dimensions, or contract terms.
- For plans, say what you found and tell the super which sheet to verify on.
- You can draft, never send. Emails go to draft_email; schedule edits go to propose_lookahead_change.
- Write emails in a professional, direct construction tone. Short paragraphs. Clear ask and due date.
- When the super gives a field note, pull out to-dos, RFI candidates, and daily log items, and offer to create them.
- Use trade and contact names from lookup_contact. Never invent an email address.
- If a request is ambiguous and getting it wrong would cost time or money, ask one short question first.
```

## Security and guardrails

These are the answers an IT reviewer will ask for, so build them in from the start rather than bolting them on.

- **Draft-only by design.** No `Mail.Send` permission, no Procore write access in V1–V2. Gary's tools can only create drafts and proposals. `Mail.ReadWrite` technically allows reading, moving and deleting mail; the app uses it only to create drafts (see Integrations).
- **Approval log.** Every approved email and schedule change is recorded with who approved it and when (`approved_by`, `approved_at` on `drafts` and `activity_changes`).
- **No training on your data.** Use the paid Claude API, which by default does not train on API inputs. Confirm the current terms and keep a link for IT.
- **Keys stay on the server.** Claude, Microsoft, and Whisper keys live in Vercel environment variables, never in the browser.
- **Row-level security** in Supabase so each user only sees their own data.
- **Encrypted storage** for documents (Supabase default) and signed, expiring links to view files.
- **Microsoft tokens** stored encrypted; you can disconnect from Settings at any time.
- **One-page security summary** to hand an IT department: what data is stored, where, who can see it, what Gary can and cannot do.
- **Company data and time.** Build and test on your own time with personal accounts and test documents. Connect a company's Microsoft or Procore only with written approval.

## Build plan

Seven milestones, each usable on its own, at roughly 5–8 evening hours each. Don't start the next until the current one passes its done-when test.

1. **Skeleton.** Next.js app, Supabase project, sign-in, deploy to Vercel, installable on your phone. *Done when:* you log in on your phone from the home screen icon.
2. **Document vault.** Upload specs and a contract, extract, chunk, index. *Done when:* a search for "08 71 00" returns the right section and page.
3. **Ask Gary.** Chat screen, Claude API with `search_docs`, `get_doc_page`, `lookup_contact`. *Done when:* Gary answers 10 real spec questions with correct citations.
4. **Notes and Today.** Voice and text capture, transcription, tagging, to-dos, Today feed. *Done when:* a 30-second voice note becomes tagged to-dos on the Today screen.
5. **Drafts and Outlook.** `draft_email`, Drafts screen, Microsoft Graph connection. *Done when:* an approved draft appears in your Outlook Drafts folder with correct recipients.
6. **Look-ahead.** Grid, Excel import/export, `propose_lookahead_change` with before/after approval. *Done when:* you import a real look-ahead, say "push drywall 3 days," approve it, and export a clean Excel.
7. **Daily log and morning brief.** `draft_daily_log`, morning brief button, calendar. *Done when:* you use Gary for two straight weeks and keep a list of what saved time and what got in the way.

After milestone 7, decide on V2 (Procore read-only) from that list.

**Kickoff prompt for Claude Code** (paste this, with this doc, into a new Claude Code session in an empty folder):

```markdown
I'm building "Gary," an AI assistant superintendent web app (PWA) for construction supers.
The full V1 spec is in GARY_V1_SPEC.md in this folder. Read it fully before writing code.

We're starting Milestone 1 only: Next.js (TypeScript, App Router) + Tailwind + shadcn/ui,
Supabase auth and database, PWA manifest so it installs on a phone, deployed to Vercel from GitHub.
Create the full Supabase schema from the Data model section now, with row-level security.

Work step by step. Explain each account or setting I need to create and wait for me to confirm.
Keep all secrets in environment variables. When Milestone 1 meets its done-when test, stop and summarize.
```
