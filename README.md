# Gary

AI assistant superintendent. The full V1 spec is in `GARY_V1_SPEC.md`.

**Status:** Milestone 1 (Skeleton) complete — Nov 3, 2026. Live at https://gary-8ac9.vercel.app, installed on phone. Next: Milestone 2 (Document vault).

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
- `doc_chunks.embedding` is sized for OpenAI `text-embedding-3-small` (1536). Change it before Milestone 2 if you pick another embedding model.
