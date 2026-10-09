# Starting prompt

Open the `church-parking` folder in Claude Code and paste the prompt below as your first message.

---

We're starting the Church Parking project. Planning is finished and there's no code yet.

1. Read CLAUDE.md, then every file in docs/. Look at the style reference in references/.
2. Check that I have what the build needs: Node 20 or newer, pnpm, Git and the Supabase CLI. Tell me what is missing and how to install it on Windows. We are not using Docker: development uses a free hosted Supabase project (see decision D-09). Tell me when you need me to create the project and paste its keys into `.env.local`.
3. Before writing code, give me a short plan for milestone M0: the folders and files you'll create and the packages you'll install. Ask me anything the docs don't answer. Wait for my go-ahead.
4. After I approve, build M0 only:
   - Scaffold Next.js (App Router), TypeScript strict, Tailwind, ESLint, Vitest and Playwright with pnpm, in this folder. Keep CLAUDE.md, README.md, docs/ and references/ as they are.
   - Link the Supabase CLI to the hosted dev project and add `.env.example` with no real secrets. Make sure `.env.local` is git-ignored.
   - Add Tailwind theme tokens that follow the visual direction in CLAUDE.md. Include one sample page that shows the tokens: the colours, a card, a main button and a selected state.
   - Add the pnpm scripts listed in CLAUDE.md.
   - Run `git init` and make a first commit.
5. Run `pnpm typecheck`, `pnpm lint` and `pnpm test` and show me the results. Check M0's acceptance checks in docs/roadmap.md.
6. Stop after M0. Tell me what you built, anything you couldn't do, and what M1 will involve. Don't start M1 until I ask.

Rules throughout: follow docs/security.md exactly, don't change any decision in docs/decisions.md without asking me, and keep the UI wording plain for non-technical church volunteers.
