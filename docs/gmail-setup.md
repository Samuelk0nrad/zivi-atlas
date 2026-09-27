# Gmail drafts with attachments

Zivi Atlas can create an unsent Gmail copy containing the message and every saved attachment. You review and send it in Gmail. The application never calls a send endpoint or overwrites Gmail drafts. It archives a saved copy only after a positively matched sent message or your explicit confirmation.

## One-time Google setup

1. Open [Google Cloud Console](https://console.cloud.google.com/), create or select a project, and enable **Gmail API** under **APIs & Services → Library**.
2. Open **Google Auth Platform → Branding → Get started**. Use **Zivi Atlas** as the application name and enter your support/contact email. Choose **External**. Under **Audience**, keep **Testing** and add your Gmail address as a test user.
3. Under **Data Access**, add these scopes:
   - `https://www.googleapis.com/auth/gmail.compose`
   - `https://www.googleapis.com/auth/gmail.metadata`
   - `https://www.googleapis.com/auth/userinfo.email`
4. Under **Clients → Create client**, choose **Web application**. Add the site's exact origin under **Authorized JavaScript origins**. For the current private site:

   ```text
   https://zivildienst-karte-samuel.samuel-0xk.chatgpt.site
   ```

   For local development, also add `http://localhost` and `http://localhost:5173`. Add `http://127.0.0.1:5173` only if using that hostname. Origins have no path or trailing slash. Leave redirect URIs empty for this popup token flow.
5. Copy the **Client ID** ending in `.apps.googleusercontent.com`. Set the production runtime variable **GOOGLE_GMAIL_CLIENT_ID** through Sites and publish the updated environment. For local development, put it in the ignored `.env` and restart the preview. No client secret or API key is needed.
6. Open Zivi Atlas in a regular Chrome or Brave tab, open an email draft, and select **Gmail verbinden** (or **Gmail-Entwurf erstellen**). Choose your Gmail account and approve the requested permissions. The selected account appears below the draft buttons and is reused for subsequent drafts. Use **Konto wechseln** to choose another account, or **Konto vergessen** to clear the local preference and token. After creation, use **In Gmail öffnen** to find the copy under Drafts. Check its text and attachments before sending.

The setup is not complete until Google accepts the configured origin and an authorized synthetic draft has been checked in Gmail. Testing authorizations expire after seven days and may require renewed consent. Google does not support authorization inside controlled embedded browsers; use a regular browser if the in-app browser is rejected. Personal Testing setup is distinct from public OAuth verification, which may require a domain you control.

## Data and behavior

- Google access tokens remain in browser memory and are reused until 60 seconds before Google's reported expiry, including when closing and reopening the draft editor. They are never sent to Zivi Atlas, stored in its database/local storage, or logged. Missing or invalid expiry disables reuse. No refresh token is requested.
- Only the chosen email address is remembered in this browser's local storage, separately for each Atlas user and OAuth client. After reload or token expiry, the next click requests access with `prompt: ''` and `login_hint` for that account. Google may briefly reopen authorization or require renewed consent; this browser flow does not promise a permanently silent connection. The returned account is verified before uploading. An account mismatch requires explicitly choosing **Konto wechseln**.
- **Konto vergessen** clears the local account preference and token; it does not revoke the existing Google grant. Google permissions can be removed in your Google Account. Rejected access invalidates the cached token without replaying a draft upload automatically.
- `gmail.compose` is the narrowest general Gmail draft scope; Google also grants sending capability with it. Zivi Atlas implements draft creation only. Email identity is used to open the correct Gmail account.
- The browser fetches the authenticated `.eml` export with the saved draft revision, then sends its MIME content directly to Google's draft API. Concurrent edits are rejected before transfer. No public attachment links are created.
- Each handoff also persists a private snapshot and random correlation marker, scoped to the Atlas owner and Gmail account. The button remembers its open-Gmail shortcut while the editor is mounted. Further edits create a new Gmail copy, preserving Gmail-side changes. Reloading the app clears this in-memory receipt; creating again can produce another copy.
- An uncertain network result is not automatically retried. Check Gmail Drafts before retrying to avoid duplicates.
- The Mail-App composer link remains text-only; `.eml` includes attachments for compatible mail clients. ChatGPT-created Zivi Atlas drafts can use this same website handoff; this browser authorization does not grant the remote MCP server Gmail access.

## Validation

`node --import ./tests/register.mjs --test tests/gmail*.test.mjs` checks account reuse, expiry, account switching and isolation, as well as exact attachment bytes with an independent MIME parser, owner/revision checks, concurrent changes, and failure handling using synthetic data and fake Google transports. A real Google account/client is required for the final authorization and Gmail readback check.

References: [Google draft API](https://developers.google.com/workspace/gmail/api/guides/drafts), [attachment example](https://developers.google.com/workspace/gmail/api/guides/sending), [browser token model](https://developers.google.com/identity/oauth2/web/guides/use-token-model), [OAuth client setup](https://developers.google.com/identity/oauth2/web/guides/get-google-api-clientid), [Gmail scopes](https://developers.google.com/workspace/gmail/api/auth/scopes).

## Sent status

After upgrading an existing setup, add `gmail.metadata` under Google Auth Platform → Data Access. Click **Gmail abgleichen** in Atlas and approve the additional Google permission. It can read mailbox headers and labels, not message bodies; Google does not offer a Sent-folder-only scope.

- While the page has an unexpired connection, returning to Atlas checks pending Gmail copies. There is also a manual **Gmail abgleichen** button. Expired/reloaded sessions need a click to reconnect; no OAuth popup is opened by a timer.
- Recognition requires a `SENT` message, an exact per-copy marker, and the original recipient in the actual To addresses. A missing Gmail draft, shared thread, subject match, or API error never counts as sent. Searches are bounded to the known threads and up to 100 recent sent-message headers per check.
- Gmail does not document preserving custom headers or RFC Message-ID through every composer edit. If no exact match remains, use **Als gesendet markieren** after sending. Drafts created before this release have no marker and need that manual action.
- Confirmed items move from **Entwürfe** to **Gesendet** and appear under **Bewerbungen**. Saved text and attachments remain available, explicitly labeled as the saved draft copy: edits made later inside Gmail are not imported by metadata sync. Newer Atlas edits remain active. Advanced manual application statuses remain unchanged.
- ChatGPT can use `mark_email_draft_sent` with the current revision after your confirmation or positively matched Gmail SENT evidence. `list_email_drafts` with `state: "sent"` opens the archive. No Gmail sending capability is exposed by these tools.
