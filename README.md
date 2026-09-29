# StockScanner (Dhaka Stock Exchange Halal Screener)

A minimal, clean dashboard and screener for Shariah-compliant equities listed on the Dhaka Stock Exchange (DSE).

## Architecture

```
stockscanner/
├── package.json                 # Monorepo configuration (npm workspaces, shared node_modules)
├── .gitignore
├── Frontend/                    # React + TypeScript + Vite + Tailwind CSS + Shadcn
│   ├── src/
│   │   ├── components/ui/       # Shadcn UI components (Claude theme)
│   │   │   ├── badge.tsx
│   │   │   ├── button.tsx
│   │   │   ├── card.tsx
│   │   │   ├── input.tsx
│   │   │   └── table.tsx
│   │   ├── lib/
│   │   │   └── utils.ts
│   │   ├── App.tsx              # Minimal Halal Screener dashboard
│   │   ├── index.css            # Tailwind v4 + Claude theme configuration
│   │   └── main.tsx
│   ├── components.json          # Shadcn configuration
│   ├── package.json
│   ├── tsconfig.json
│   └── vite.config.ts
└── Backend/                     # Express.js (JavaScript / No TypeScript)
    ├── prisma/
    │   ├── dev.db               # SQLite database
    │   └── schema.prisma        # Prisma ORM schema
    ├── src/
    │   ├── controllers/
    │   │   └── stock.controller.js
    │   ├── lib/
    │   │   └── prisma.js        # Prisma client singleton
    │   ├── middleware/
    │   │   ├── errorHandler.js  # Centralized error handler
    │   │   └── logger.js        # Morgan HTTP request logger
    │   ├── routes/
    │   │   ├── health.routes.js
    │   │   ├── stock.routes.js
    │   │   └── index.js
    │   ├── utils/
    │   │   └── logger.js        # Timestamped structured logger
    │   ├── app.js               # Express application configuration
    │   └── index.js             # Server entry point
    ├── .env
    ├── .env.example
    └── package.json
```

---

## Getting Started

### 1. Install Dependencies (Shared `node_modules`)
All dependencies are hoisted to the root directory using npm workspaces:
```bash
npm install
```

### 2. Running in Development

Run both or individually from the root:

- **Frontend only:**
  ```bash
  npm run dev:frontend
  ```
  Runs at [http://localhost:5173](http://localhost:5173)

- **Backend only:**
  ```bash
  npm run dev:backend
  ```
  Runs at [http://localhost:5000](http://localhost:5000)

### 3. Backend Database Commands (Prisma + SQLite)
Navigate into `Backend/` or use npm workspace:
```bash
# Push schema updates to SQLite dev.db
npm run db:migrate --workspace=Backend

# Generate Prisma Client
npm run db:generate --workspace=Backend

# Open Prisma Studio GUI
npm run db:studio --workspace=Backend
```

---

## API Endpoints (Starter)
- `GET /api/health` - Server health status and uptime
- `GET /api/stocks` - List stocks (supports `?halalOnly=true` & `?sector=...`)
- `GET /api/stocks/:symbol` - Retrieve single stock by ticker symbol
