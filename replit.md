# Gibi Finder

## Overview

A comic-book identification web app — "Shazam for comics" — built with a React + Vite frontend and Express backend. Users can identify Brazilian comics (gibis) from images, text descriptions, character names, or remembered quotes, powered by Google Gemini AI.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **Frontend**: React + Vite (artifacts/gibi-finder)
- **Backend API**: Express 5 (artifacts/api-server)
- **AI**: Google Gemini API (@google/generative-ai)
- **Database**: Supabase (@supabase/supabase-js)
- **Validation**: Zod, Drizzle (via api-zod)
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild

## Environment Variables

| Variable | Description |
|----------|-------------|
| GEMINI_API_KEY | Google Gemini API key |
| GEMINI_MODEL | Gemini model name (default: gemini-2.5-flash) |
| SUPABASE_URL | Supabase project URL |
| SUPABASE_ANON_KEY | Supabase anonymous key |
| PORT | Port for the API server (set automatically) |

## Supabase Setup

Run the SQL in `supabase-schema.sql` in your Supabase SQL Editor to create the required tables:
- `search_history` — stores all search results
- `result_feedback` — stores user feedback (correct/wrong/correction)

## Structure

```text
artifacts/
├── api-server/         # Express API server
│   └── src/
│       ├── lib/
│       │   ├── gemini.ts     # Gemini AI integration
│       │   └── supabase.ts   # Supabase client
│       └── routes/
│           ├── gibi.ts       # All Gibi Finder API routes
│           └── health.ts     # Health check
├── gibi-finder/        # React + Vite frontend (served at /)
│   └── src/
│       ├── pages/      # Home, History, Ranking, ResultDetail
│       ├── components/ # Layout, Hero, SearchPanel, ResultView, etc.
│       └── hooks/      # use-search-actions.ts
lib/
├── api-spec/           # OpenAPI spec + Orval codegen config
├── api-client-react/   # Generated React Query hooks
├── api-zod/            # Generated Zod schemas
└── db/                 # Drizzle ORM (not used for Supabase)
supabase-schema.sql     # SQL to run in Supabase dashboard
```

## API Routes

All routes are prefixed with `/api`:

| Method | Path | Description |
|--------|------|-------------|
| GET | /healthz | Health check |
| POST | /identify | Identify comic from images (base64) |
| POST | /search | Search by text description |
| POST | /character-search | Search by character name |
| POST | /quote-search | Search by balloon text / quote |
| GET | /history | Get search history (with filters) |
| GET | /ranking | Get weekly ranking |
| GET | /result/:id | Get public result by ID |
| POST | /feedback | Submit feedback on a result |

## Frontend Pages

- `/` — Home page with hero section and search panel (4 modes)
- `/historico` — Search history with comic-style cards
- `/ranking` — Weekly ranking of most searched comics
- `/gibi/:id` — Public result page

## Visual Style

- Yellow header (#F4D03F) with comic-style GIBI FINDER logo
- Off-white paper background (#F7F3EA) with halftone dot pattern
- Primary red (#E63946) for accents
- Thick black borders everywhere (comic aesthetic)
- Fonts: Bangers (headings) + Nunito (body)
- Detective illustration + "QUAL É O GIBI?!" speech bubble hero
