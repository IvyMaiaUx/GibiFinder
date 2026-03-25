# Workspace

## Overview

pnpm workspace monorepo using TypeScript. GibiFinder — AI-powered comic book identifier using Google Gemini vision.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)
- **Frontend**: React + Vite (artifacts/gibifinder)
- **AI**: Google Gemini 1.5 Flash (via GEMINI_API_KEY)

## Structure

```text
artifacts-monorepo/
├── artifacts/              # Deployable applications
│   ├── api-server/         # Express API server
│   └── gibifinder/         # React + Vite frontend (comic book aesthetic)
├── lib/                    # Shared libraries
│   ├── api-spec/           # OpenAPI spec + Orval codegen config
│   ├── api-client-react/   # Generated React Query hooks
│   ├── api-zod/            # Generated Zod schemas from OpenAPI
│   └── db/                 # Drizzle ORM schema + DB connection
├── scripts/                # Utility scripts
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── tsconfig.json
└── package.json
```

## Features

- **Image identification**: Upload 1-3 comic images → Gemini AI identifies title, publisher, characters, description, confidence score
- **OCR balloon text**: Automatically extracts speech bubble text from images
- **Text search**: Search by character name or title via Gemini
- **Quote search**: Find comics by speech bubble text stored in DB
- **History** (`/historico`): Full history with filter by title/publisher, click-to-expand cards
- **Weekly ranking** (`/ranking`): Top 10 most searched comics this week, resets weekly
- **Rating system**: 👍👎 buttons after each result, average rating shown in history
- **Shareable links** (`/gibi/:id`): Public shareable page for each identified comic

## API Routes

- `POST /api/comics/identify` — identify from images (base64)
- `POST /api/comics/search` — text search via Gemini
- `POST /api/comics/quote-search` — search by balloon text quote
- `GET /api/comics/:id` — get comic by ID
- `GET /api/history` — history with filters + pagination
- `GET /api/ranking` — weekly top 10
- `POST /api/ratings` — submit 👍/👎 rating

## Database Schema (lib/db/src/schema/comics.ts)

- `comics` — all identified comics (title, publisher, characters JSON, description, confidence, balloon text, image thumbnail base64, search type, week start)
- `ratings` — user ratings per comic (0=thumbs down, 1=thumbs up)

## Environment Variables

- `GEMINI_API_KEY` — Google Gemini API key (secret)
- `DATABASE_URL` — PostgreSQL connection string (auto-provided by Replit)

## UI Style

Comic book aesthetic: Bangers font (headings), Nunito (body), yellow #FFD93D, red #E63946, cyan #06D6A0, dark #0a0a0a, paper #faf6e9. Halftone dot background, 3px solid black borders, comic panel box shadows, press effect on buttons.
