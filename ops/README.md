# Connection and integration tools

The dashboard and `POST /api/mcp` share owner-scoped D1 storage for collections,
labels, email drafts and applications. Attachments use private R2 storage. MCP uses
stateless Streamable HTTP with JSON responses. These scripts operate on an already
configured instance; they do not deploy it, connect to Gmail or send mail.

## Authentication

Browser authentication currently relies on the Sites gateway to supply trusted
`oai-authenticated-user-*` headers. The local preview supplies mock authentication.
A separately hosted public server must provide a trusted authentication boundary
before accepting those headers.

Configure the server with `COLLECTIONS_MCP_TOKEN_SHA256` (the SHA-256 hex digest of
its raw MCP bearer token) and `COLLECTIONS_MCP_OWNER_ID` (the authenticated owner's
stable user ID). The token is `zivi_` followed by 43 URL-safe base64 characters,
generated from 32 cryptographically random bytes. The signed-in `/connection` page
identifies the account for setup. The MCP owner must match the browser user to
share state; locally, use the preview's configured local user ID. Never commit raw
credentials or put them in command arguments.

| Client variable | Purpose |
| --- | --- |
| `ZIVI_BASE_URL` | Target origin; defaults to `http://localhost:5173`. |
| `ZIVI_MCP_TOKEN` | Raw application bearer token. |
| `ZIVI_SITES_TOKEN` | Raw gateway bypass token for a private Sites deployment. |
| `ZIVI_AUTHORIZATION` | Complete application `Bearer …` header; overrides `ZIVI_MCP_TOKEN`. |
| `ZIVI_SITES_AUTHORIZATION` | Complete gateway header; overrides `ZIVI_SITES_TOKEN`. |
| `ZIVI_USE_KEYRING` | Set to `1` to enable optional Linux `secret-tool` fallback; disabled by default. |
| `ZIVI_KEYRING_SERVICE` | Keyring service name; defaults to `zivildienst-mcp-tunnel`. |

Environment values take precedence. When enabled, keyring fallback looks up the
`credential` entries `app-bearer` and `sites-bypass`; the tunnel wrapper also uses
`runtime`. Scripts do not print credentials or load `.env` files themselves. Export
the required client variables into their process environment.

## Checks

Start the local preview with D1 migrations, R2 and its MCP credentials configured.
Local browser checks use the preview's `__sites_local_auth=1` cookie, which is not
production authentication. Install Node dependencies first. The attachment check
also needs `python3` for independent MIME parsing.

```sh
node ops/check-mcp.mjs
node ops/check-mcp.mjs --write-check
node ops/check-labels.mjs
node ops/check-drafts.mjs
node ops/check-applications.mjs
node ops/check-attachments.mjs
```

The first command only discovers tools and lists collections. `--write-check`
tests a collection's lifecycle. Other checks create disposable records and attempt
cleanup in `finally` blocks. Use isolated test data: the application check requires
institution `70193` to have no existing application, and checks assume no
simultaneous changes to their fixture data. Label, draft and application checks
exercise browser and MCP access locally; remotely, they use MCP. The attachment
check requires the local preview because upload/download routes need browser auth.

Set `ZIVI_BASE_URL` to change the local port or choose a remote origin. `--local`
forces `http://localhost:5173`, overriding that variable. Remote origins require
HTTPS. Remote mutations additionally require `--allow-remote-writes`, checked
before credentials are loaded or requests sent:

```sh
ZIVI_BASE_URL=https://your-site.example node ops/check-mcp.mjs
ZIVI_BASE_URL=https://your-site.example node ops/check-drafts.mjs --allow-remote-writes
```

The remote collection write check needs both `--write-check` and
`--allow-remote-writes`. The attachment check rejects remote targets even with the
flag. Checks never send email. Configuration tests need no server or credentials:
`node --test ops/connection.test.mjs`.

## Optional secure tunnel

Install a compatible Secure MCP Tunnel client separately. Copy
`zivildienst.yaml.example` to a private configuration directory as `zivildienst.yaml`
and replace `YOUR_TUNNEL_ID` and `YOUR_SITE_HOST`. The template targets a private
Sites deployment with separate gateway and application bearer headers. The gateway
credential alone cannot access owner data. Remove its header from the profile only
if your target does not use the Sites gateway.

The `zivildienst-tunnel` wrapper accepts the credential variables above plus
`CONTROL_PLANE_API_KEY`. Use a runtime key restricted to your tunnel's required
permissions. `TUNNEL_CLIENT` defaults to `tunnel-client` on `PATH`; override it with
an executable path when needed. After configuring credentials:

```sh
sh ops/zivildienst-tunnel run --profile zivildienst --profile-dir "$HOME/.config/zivi-atlas"
```

`zivildienst-mcp-tunnel.service.example` is an optional Linux user service template.
Replace the checkout path, supply a private `~/.config/zivi-atlas/tunnel.env` file
(mode `0600`), and install the customized unit in your user systemd configuration.
Its environment file may need an explicit `TUNNEL_CLIENT` path because systemd's
`PATH` differs from your shell's. An enabled keyring must be unlocked when the
service starts. The readiness endpoint is `http://127.0.0.1:8091/readyz`; change the
profile's port if occupied. Keep your configured profile and credentials outside Git.

Connect your tunnel in a compatible MCP client. Use tunnel access controls when
it supplies upstream credentials; do not expose an unauthenticated public endpoint.
Verify readiness and an actual read-only MCP request. To disconnect, stop the
tunnel and remove its client connection. Removing the server's MCP token hash and
owner configuration revokes application access.

## Application imports

`import-applications.mjs` accepts one JSON line on stdin, hides terminal input,
imports batches of five and verifies readback. It does not save input payloads to
disk. The input structure is:

```json
{
  "sourceAccount": "your-account@example.org",
  "groups": [
    {
      "organisationCode": 70193,
      "messages": [],
      "notes": "Optional notes",
      "status": "automatic"
    }
  ]
}
```

Populate `messages` with actual verified snapshots; the empty array only illustrates
the structure. Fields follow `lib/application-tools.ts`: actual message/thread IDs,
direction, timestamp, headers and decoded plain text. Match the institution first,
exclude Gmail drafts, include observed Gmail labels for Send-As aliases, and set
`bodyTruncated` when shortening a body beyond 20,000 characters. Attachments stay
in Gmail. Optional `notes` and `status` are applied after import.

The importer shares the checks' target and credential settings. Remote imports
require `--allow-remote-writes`; local is the default. Imports are persistent,
unlike disposable checks. Account/message IDs deduplicate snapshots. Automatic
status follows the latest actual message timestamp; explicit statuses survive
imports. Set interview, acceptance or rejection only from explicit evidence. The
importer neither reads Gmail nor enables background syncing.

## Drafts and attachments

Draft changes and attachment mutations require `expectedRevision` to avoid
concurrent overwrites. `/?draft=<id>` and `/?application=<id>` link to saved records.
Gmail and `mailto:` links open composers without sending or marking a message as
sent. Users review and send in their chosen mail client.

Attachments allow five files, 5 MiB each and 15 MiB total. Downloads require the
owner and disable caching. Deleted file metadata remains a tombstone until R2
cleanup succeeds; later mutations retry cleanup. MCP can list, copy and remove an
already uploaded file; new files use the website picker. Composer URLs transfer
text only, so Gmail files must be attached manually. Authenticated `.eml` export
contains actual file bytes and `X-Unsent: 1` for compatible desktop mail apps; it
is not Gmail draft import.
