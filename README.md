# Zivi Atlas

A map for finding Austrian Zivildienst placements and keeping track of applications. Built with React, TypeScript, [Vinext](https://github.com/cloudflare/vinext), Leaflet, Cloudflare D1 and R2. The interface is in German.

## Features

- Search Einrichtungen and Einsatzorte on a map, with filters for dates, availability, activity and region.
- Save institutions to collections and add personal colored labels.
- Browse email drafts by institution, attach documents and create Gmail draft copies including attachments after Google authorization.
- Track application status and review imported sent emails and replies.
- Manage collections, labels, drafts, attachments and applications from ChatGPT through an authenticated MCP connection.

The optional [Gmail connection](docs/gmail-setup.md) creates unsent drafts with the saved attachment bytes. It requires a Google OAuth web client ID; Google access tokens stay in browser memory. The app never sends mail. The text-only composer fallback and `.eml` export remain available. Gmail history is imported on request through ChatGPT and a separately connected Gmail tool. There is no automatic Gmail synchronization.

## Run locally

Use **Node.js 24** and npm. A clean clone uses the portable development profile and requires no Cloudflare account or production credentials.

```sh
git clone https://github.com/Samuelk0nrad/zivi-atlas.git
cd zivi-atlas
npm ci
npm run build
```

The build generates `dist/server/wrangler.json`. Before using saved collections, drafts or applications, initialize the **fresh local database** by applying the existing migrations in filename order. Run this command from the project root:

```sh
node --input-type=module -e '
import { readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
for (const file of readdirSync("drizzle").filter(name => name.endsWith(".sql")).sort()) {
  execFileSync(process.execPath, [
    "--import", "./scripts/sites-env.mjs", "./node_modules/wrangler/bin/wrangler.js",
    "d1", "execute", "DB", "--local", "--config", "dist/server/wrangler.json",
    "--persist-to", ".wrangler/state", "--file", "drizzle/" + file
  ], { stdio: "inherit" });
}'
```

This initialization is for an empty database. It does not record migration history: when updating an existing checkout, apply only migrations that have not already been run. Local D1 and R2 state lives in ignored `.wrangler/state/`.

```sh
npm run dev
```

Open the localhost URL printed by the server, normally `http://localhost:5173`. Visit `/signin-with-chatgpt?return_to=/` on that same origin to use the mock account `local_seedy`. This is a loopback-only development identity, not a real ChatGPT login. Keep the development server on localhost.

`npm start` previews a completed build through Wrangler, using the same local database and storage. That built preview does not include the mock sign-in middleware; use `npm run dev` to test signed-in browser features locally.

## Development

```sh
npm run typecheck
npm test
npm run build
```

CI runs these checks on Node.js 24. Tests use isolated SQLite databases and synthetic fixtures; they do not need Gmail, a live MCP tunnel or deployment secrets.

| Path | Purpose |
| --- | --- |
| `app/` | Map, dialogs and HTTP routes |
| `lib/` | Shared contracts, filtering, MCP tool definitions and server logic |
| `db/`, `drizzle/` | Database schema and SQL migrations |
| `public/data/snapshot.json` | Fallback copy of the public placement catalogue |
| `public/vendor/` | Vendored map libraries |
| `tests/` | Contract and persistence tests |
| `ops/` | Optional MCP connection examples and integration checks |

Keep credentials, database files, CVs and imported personal emails out of Git. Commit each completed logical change before starting the next one; see [AGENTS.md](AGENTS.md).

## Data and availability

The catalogue comes from the [Zivildienstserviceagentur's placement listing](https://www.zivildienst.gv.at/zivildienst-stellen/platzangebot.html). The server requests the public organisations endpoint and caches successful responses for five minutes. If the source is unavailable, it uses the bundled snapshot and displays its date.

Available places belong to an **Einrichtung** and can cover several **Einsatzorte**. A marker does not establish availability at that individual location; confirm details with the institution. Zivi Atlas is an independent project and is not affiliated with the Zivildienstserviceagentur.

## Hosting and authentication

The existing deployment uses **OpenAI Sites**, with D1 bound as `DB`, R2 bound as `BUCKET`, and a trusted authentication gateway. The repository's `.openai/hosting.json` declares the bindings but does not include a personal deployment ID or credentials. Use the Sites publishing workflow when deploying through Sites.

The application expects the gateway to authenticate visitors, strip incoming identity headers and inject the trusted `oai-authenticated-user-id` header. **Do not expose the built Worker directly to the public internet without replacing or protecting that authentication boundary.** A standalone host needs an authentication adapter or trusted gateway, protected access to the Worker, configured D1/R2 bindings, migrations and appropriate access controls. The current server reads identity headers; it cannot distinguish genuine gateway headers from client-supplied headers on an unprotected origin.

GitHub hosts this source repository and its checks. GitHub Pages cannot run the server routes, D1 or R2 services required by the full application.

## ChatGPT / MCP

`POST /api/mcp` exposes 27 tools over stateless MCP Streamable HTTP. Browser actions and MCP tools use the same owner-scoped storage. Revisions protect drafts and application records from concurrent edits.

MCP access is optional and separate from browser sign-in. A deployment must configure `COLLECTIONS_MCP_TOKEN_SHA256` and `COLLECTIONS_MCP_OWNER_ID`, then provide the corresponding bearer token through a trusted client or secure tunnel. On private Sites, the tunnel also needs its own gateway access credential. Never publish these credentials or include an owner ID in tool arguments. See [ops/README.md](ops/README.md) for connection setup and checks.

ChatGPT can reuse attachments already uploaded through the website. Upload new local files with the draft editor's file picker. Imported emails are stored snapshots; importing them neither sends nor modifies mail in Gmail.

## License and credits

Application code is available under the [MIT License](LICENSE), copyright 2026 Samuel Konrad. Vendored dependencies retain their own licenses and notices, including the Sites Vite plugin and Leaflet libraries. The MIT license does not relicense the external placement data or map data. See [third-party notices](THIRD_PARTY_NOTICES.md). Map data is provided by [OpenStreetMap contributors](https://www.openstreetmap.org/copyright); retain the map attribution and respect the tile provider's usage policy.
