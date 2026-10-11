# DataPulse - AI-Powered Data Analytics Dashboard

DataPulse turns CSV and Excel files into interactive dashboards, charts, tables and plain-language insights.
Upload a file, clean it without code, and get KPIs and charts generated from the detected column types.

## Features

| Area | What it does |
| --- | --- |
| Accounts | Register/login, bcrypt password hashing (cost 12), JWT auth enforced by the API, change password, delete account |
| Upload | Drag-and-drop or browse `.csv`, `.xlsx`, `.xls`. Preview before import. Multi-sheet workbooks with sheet picker. Type detection, validation warnings, progress |
| Data Explorer | Edit cells, add/delete/rename columns and rows, sort, search, filter (AND/OR groups), remove duplicates, find & replace, missing-value handling (remove / mean / median / mode / custom), convert types, calculated columns (safe expression parser), undo/redo, reset to raw, export CSV/Excel |
| Overview & KPIs | Auto KPIs only where the data supports them: records, sum, average, min, max, growth rate, unique customers, missing values |
| Charts | Bar, stacked, line, area, pie, donut, scatter, histogram, correlation heatmap, table. Choose X/Y, multiple series, aggregation (sum/avg/count/min/max), month/quarter/year grouping, per-chart filters, legends/labels/tooltips, duplicate/delete, PNG export |
| Dashboard Builder | Auto-generated or blank dashboards, drag/resize widgets on a 12-column grid, add KPI/chart/table/text/filter widgets, global filters, per-chart filters, rename, duplicate, delete, preview mode, print / save as PDF |
| AI Insights | Dataset summary, trends, top/lowest performers, outliers (IQR), correlations, quality issues, suggested charts, recommendations, natural-language questions. Local statistics by default; optional OpenAI call from the backend |
| Reports | Save snapshots of KPIs, charts and findings; reopen and print them later |
| Themes | Light, dark, system |

### Limits (communicated in the UI)

- Upload size: **10 MB** per file
- Rows: **200,000** per dataset
- Columns: **200** per dataset
- JSON request body: 2 MB
- Upload rate limit: 60 uploads per 15 minutes per IP; global API limit 2,000 requests per 15 minutes per IP

DataPulse is designed for analytical datasets of this size. It is not a warehouse; do not expect unlimited scale.

## Architecture

```
dashb 2/
├── client/                    React + Vite SPA (deploy: Render Static Site)
│   └── src/
│       ├── components/        ui (shadcn-style primitives), charts, filters, dashboard
│       ├── pages/             Auth, Overview, Datasets, Upload, Explorer, Charts,
│       │                      Dashboards, DashboardBuilder, Insights, Reports, Settings
│       ├── layouts/           AppLayout (collapsible sidebar, top bar with search)
│       ├── hooks/             useWorkingDataset (load + undo/redo + persistence), useFilteredRows
│       ├── services/          api (fetch + upload progress), fileParser (browser preview), exporters
│       ├── utils/             transforms (cleaning op log), filters, analytics, recommend, insights
│       ├── context/           Auth, Theme, Toast
│       └── styles/            Tailwind layers and print styles
└── server/                    Express API (deploy: Render Web Service)
    ├── config/                env validation, MongoDB connection
    ├── models/                User, Dataset, DatasetChunk, DatasetTransformation, Dashboard, Report
    ├── routes/                /api routes (auth-guarded)
    ├── controllers/           request handlers (ownership enforced in every query)
    ├── middleware/            auth (JWT), validate (zod), upload (multer, type+size), error handler
    ├── services/              fileParser (CSV/XLSX), datasetService (import, cascade delete)
    ├── utils/                 ApiError, logger, zod schemas
    ├── shared/                data normaliser + expression engine (shared with client)
    └── server.js              app bootstrap, security headers, CORS, rate limits, health checks
```

### Data model

- **User** – name, email (unique), `passwordHash` (never returned), preferences.
- **Dataset** – owner, name, source metadata (original file name, extension, size, sheet names), column schema (`key`, `name`, `type`, `missing`, `unique`), row/column counts, processing info and warnings.
- **DatasetChunk** – raw rows of a dataset in chunks of 1,000 (keeps every document far below MongoDB's 16 MB limit). Raw rows are never modified.
- **DatasetTransformation** – ordered cleaning log (`sequence`, `operation`, `params`). The working table is the raw chunks replayed through this log, so undo/reset never destroys the original import.
- **Dashboard** – owner, dataset, name, global filters, theme, widgets (`type`, `title`, `config`, `layout` on a 12-column grid).
- **Report** – owner, dataset, optional dashboard, title, summary, frozen snapshot.

Every query filters by `owner` taken from the verified JWT. A record that belongs to another user returns **404**, not 403, so the existence of other users' data is not revealed.

### Security

- Passwords hashed with bcrypt (cost 12); login returns the same error for unknown email and wrong password.
- JWT signed with `JWT_SECRET` (HS256, issuer and audience checked, expiry configurable). The user is re-loaded on each request.
- Helmet security headers, CORS restricted to `CLIENT_ORIGINS`, `hpp`, JSON body limit, `x-powered-by` disabled.
- Rate limits: auth (30 / 15 min), uploads (60 / 15 min), AI (10 / min), global (2,000 / 15 min).
- Uploads are validated by extension and MIME type, and by size (multer limit + explicit check). Files are parsed in memory and not stored.
- Input validation with zod on every write endpoint; MongoDB ObjectIds validated on every route parameter.
- Expression engine (calculated columns) is a tokenizer and parser with an allow-listed function set. It never calls `eval` or `Function`.
- AI: the API key lives only on the server (`OPENAI_API_KEY`). The client sends an aggregated statistical summary (never raw rows) and only after the user ticks a consent box.
- Only `VITE_*` variables reach the browser. Secrets stay in server environment variables.
- Logs record method, path and status; they do not log request bodies, passwords, tokens or file contents.

## Local setup

Prerequisites: Node.js 18+ (20 recommended), npm, and a MongoDB Atlas cluster or a local MongoDB.

```bash
# 1. Install
npm run install:all            # or: cd server && npm install ; cd ../client && npm install

# 2. Configure the server
cp server/.env.example server/.env
# edit server/.env: MONGODB_URI and JWT_SECRET (see "MongoDB Atlas setup")

# 3. Configure the client (optional in development: the Vite proxy handles /api)
cp client/.env.example client/.env.local

# 4. Run both (two terminals)
npm run dev:server             # API on http://localhost:5000
npm run dev:client             # UI on  http://localhost:5173
```

Open http://localhost:5173, create an account, and upload a file. A sample file is included at `samples/sales-sample.csv`.

Health checks:

- `GET http://localhost:5000/healthz` – returns `200` when MongoDB is connected
- `GET http://localhost:5000/api/health` – liveness only

## MongoDB Atlas setup

1. **Create a cluster.** In Atlas, create a free M0 cluster in a region close to your Render region.
2. **Create a database user.** *Database Access → Add New Database User → Password*. Grant **Read and write to any database** only if you need it; preferably restrict it to the `datapulse` database. Use a strong generated password.
3. **Network access.** *Network Access → Add IP Address*:
   - For Render, Render does not publish fixed outbound IPs on the free plan. Either add `0.0.0.0/0` and rely on the strong database password plus TLS (the pragmatic choice for free tiers), or use a paid Render plan with static outbound IPs and allow only those addresses.
   - For local development, add your own public IP.
4. **Get the connection string.** *Connect → Drivers → Node.js*. Replace `<password>` with the user's password (URL-encode special characters) and set the database name to `datapulse`:
   ```
   mongodb+srv://<user>:<password>@<cluster>.mongodb.net/datapulse?retryWrites=true&w=majority
   ```
5. Collections and indexes are created automatically by Mongoose on first use. No manual schema setup is needed.

## Environment variables

### Server (`server/.env`, or Render → Environment)

| Variable | Required | Description |
| --- | --- | --- |
| `NODE_ENV` | yes | `development` or `production` |
| `PORT` | no | Defaults to `5000`. Render sets this automatically |
| `MONGODB_URI` | yes | Atlas connection string (secret) |
| `JWT_SECRET` | yes | At least 32 characters in production (secret) |
| `JWT_EXPIRES_IN` | no | Default `7d` |
| `CLIENT_ORIGINS` | yes (prod) | Comma-separated frontend origins, e.g. `https://datapulse-web.onrender.com` |
| `OPENAI_API_KEY` | no | Enables LLM-backed answers in AI Insights (secret) |
| `OPENAI_MODEL` | no | Default `gpt-4o-mini` |
| `LOG_LEVEL` | no | `error`, `warn`, `info` (default) or `debug` |

### Client (`client/.env.local`, or Render → Static Site → Environment)

| Variable | Description |
| --- | --- |
| `VITE_API_BASE_URL` | Full API base URL including `/api`, e.g. `https://datapulse-api.onrender.com/api`. Empty in development |

Generate a secret:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

## Pushing to GitHub

```bash
cd "dashb 2"
git init
git add .
git status            # confirm no .env or node_modules files are listed
git commit -m "Initial commit: DataPulse analytics dashboard"
git branch -M main
git remote add origin https://github.com/<you>/datapulse.git
git push -u origin main
```

`.gitignore` excludes `node_modules/`, `.env*` (except `.env.example`), build output and logs.

## Deployment on Render

You can deploy with the included `render.yaml` Blueprint, or create the two services manually.

### 1. Backend: Web Service

1. Render → **New → Web Service** → connect your GitHub repo.
2. **Root directory:** `server`
3. **Runtime:** Node · **Build command:** `npm ci --omit=dev` · **Start command:** `npm start`
4. **Health check path:** `/healthz`
5. **Environment variables:**
   - `NODE_ENV` = `production`
   - `MONGODB_URI` = your Atlas string
   - `JWT_SECRET` = a 48-byte random hex string
   - `CLIENT_ORIGINS` = the URL of your static site (see step 2), e.g. `https://datapulse-web.onrender.com`
   - `OPENAI_API_KEY` = optional
6. Deploy. Confirm `https://<api>.onrender.com/healthz` returns `{"status":"ok","db":"connected"}`.

### 2. Frontend: Static Site

1. Render → **New → Static Site** → same repo.
2. **Root directory:** `client`
3. **Build command:** `npm ci && npm run build` · **Publish directory:** `dist`
4. **Environment variable:** `VITE_API_BASE_URL` = `https://<api>.onrender.com/api`
5. **Redirects/Rewrites:** source `/*` → destination `/index.html` (action: *Rewrite*). This is required so that deep links such as `/app/explorer/...` work on refresh.
6. Deploy, then set the static site URL as `CLIENT_ORIGINS` on the API service and redeploy the API.

> `VITE_*` values are embedded into the built JavaScript at build time. If you change `VITE_API_BASE_URL`, trigger a new static-site deploy.

### 3. Verify

- Visit the static site, register, upload `samples/sales-sample.csv`, clean a column, open a chart, save a dashboard and reload the page: the dashboard should reload with the same layout.
- Check the browser console for CORS errors. If you see one, `CLIENT_ORIGINS` on the API does not exactly match the static site origin (scheme, host and no trailing slash).

## Scripts

| Command | Where | Purpose |
| --- | --- | --- |
| `npm run dev:server` | root | API with auto-restart (`node --watch`) |
| `npm run dev:client` | root | Vite dev server with `/api` proxy |
| `npm run build` | root | Production build of the client into `client/dist` |
| `npm start` | root | Start the API in production mode |

## Troubleshooting

- **`Missing required environment variable: MONGODB_URI`** – the server did not find `server/.env` or the Render variable is empty.
- **`MongoServerSelectionError` / connection timeout** – Atlas Network Access does not allow the caller's IP, or the password in the URI was not URL-encoded.
- **CORS error in browser** – `CLIENT_ORIGINS` does not include the exact frontend origin.
- **401 after a while** – the JWT expired (default 7 days). Sign in again.
- **Upload rejected: "File is larger than the 10 MB limit"** – split the file or remove unused columns and rows.

## Known limitations

- Dataset processing for the working table runs in the browser (cleaning, filtering, charts). The server stores and serves chunks; very large datasets near the 200,000-row limit can be slow on low-end devices.
- Files are parsed in memory and are not kept as originals; only the normalised rows are stored.
- The AI answer path requires an OpenAI-compatible key; without it, answers come from local statistics.
- PDF export uses the browser's print dialog ("Save as PDF").
#   d a s h b o a r d _ e x c e l  
 