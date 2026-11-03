# Gary

AI assistant superintendent. The full V1 spec is in `GARY_V1_SPEC.md`.

**Status:** Milestone 1 (Skeleton) complete — Nov 3, 2026. Live at https://gary-8ac9.vercel.app, installed on phone. Milestone 2 (Document vault) built — run migration 0003, then upload specs on the Docs tab.

## Milestone 1 setup

1. **Supabase** (supabase.com): create a project. In **SQL Editor**, paste and run `supabase/migrations/0001_initial_schema.sql`.
2. **Turn off public sign-ups:** Authentication → Sign In / Providers → turn off "Allow new users to sign up". Then Authentication → Users → **Add user** with your email and a password. Gary is single-user in V1, so only accounts you create can sign in.
3. **Keys:** Project Settings → API. Copy the Project URL and the `anon` public key into `.env.local` (copy `.env.example`), and into Vercel's Environment Variables.
4. **GitHub:** private repo, push this folder.
5. **Vercel:** import the GitHub repo, add the two env vars, deploy.
6. **Phone:** open the Vercel URL, sign in, then Share → Add to Home Screen (iPhone) or menu → Install app (Android).

**Done when:** you log in on your phone from the home screen icon.

## Local development

```bash
npm install
cp .env.example .env.local   # fill in your Supabase URL and anon key
npm run dev
```

## Notes

- Next.js 16: the auth gate lives in `src/proxy.ts` (the renamed `middleware`).
- The `anon` key is safe in the browser; row-level security limits each user to their own rows. Never put the `service_role` key in a `NEXT_PUBLIC_` variable.
- Embeddings: Voyage AI `voyage-4`, 1024 dimensions (migration `0002`). Index chunks with `input_type: "document"` and search with `input_type: "query"`. Keys starting `pa-` use `https://api.voyageai.com/v1`; keys from MongoDB Atlas start `al-` and use `https://ai.mongodb.com/v1`.

## Milestone 2: document vault

- Run `supabase/migrations/0003_document_search.sql` in the Supabase SQL Editor (after 0001 and 0002).
- Vercel needs `VOYAGE_API_KEY` (server-only).
- Docs tab → Choose PDFs. The browser uploads straight to Supabase Storage; then `/api/documents/[id]/index` extracts text and splits it into chunks, and `/api/documents/[id]/embed` adds Voyage embeddings in batches until done.
- Search: a section number ("07 92 00", "079200") jumps to that section; anything else runs keyword + meaning search. A section that isn't in the set (e.g. 08 71 00 on FS18, listed as "Future Document") shows where it's mentioned instead.
- Citations show document, section, printed section page and PDF page.
- Scanned PDFs with no text layer aren't supported yet (OCR is a later step).
