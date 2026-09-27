# Gmail drafts with attachments

Zivi Atlas can create an unsent Gmail copy containing the message and every saved attachment. You review and send it in Gmail. The application does not call a send endpoint, mark an application as sent, or overwrite existing Gmail drafts.

## One-time Google setup

1. Open [Google Cloud Console](https://console.cloud.google.com/), create or select a project, and enable **Gmail API** under **APIs & Services → Library**.
2. Open **Google Auth Platform → Branding → Get started**. Use **Zivi Atlas** as the application name and enter your support/contact email. Choose **External**. Under **Audience**, keep **Testing** and add your Gmail address as a test user.
3. Under **Data Access**, add these scopes:
   - `https://www.googleapis.com/auth/gmail.compose`
   - `https://www.googleapis.com/auth/userinfo.email`
4. Under **Clients → Create client**, choose **Web application**. Add the site's exact origin under **Authorized JavaScript origins**. For example, replace this with your deployment's origin:

   ```text
   https://your-site.example
   ```

   For local development, also add `http://localhost` and `http://localhost:5173`. Add `http://127.0.0.1:5173` only if using that hostname. Origins have no path or trailing slash. Leave redirect URIs empty for this popup token flow.
5. Copy the **Client ID** ending in `.apps.googleusercontent.com`. Set the production runtime variable **GOOGLE_GMAIL_CLIENT_ID** through Sites and publish the updated environment. For local development, put it in the ignored `.env` and restart the preview. No client secret or API key is needed.
6. Open Zivi Atlas in a regular Chrome or Brave tab, open a saved email, and select **Gmail-Entwurf erstellen**. Choose your Gmail account and approve the requested permissions. After creation, use **In Gmail öffnen** to find the copy under Drafts. Check its text and attachments before sending.

The setup is not complete until Google accepts the configured origin and an authorized synthetic draft has been checked in Gmail. Testing authorizations expire after seven days and may require renewed consent. Google does not support authorization inside controlled embedded browsers; use a regular browser if the in-app browser is rejected. Personal Testing setup is distinct from public OAuth verification, which may require a domain you control.

## Data and behavior

- Google access tokens remain in browser memory for the operation. They are never sent to Zivi Atlas, stored in its database/local storage, or logged. No refresh token is requested.
- `gmail.compose` is the narrowest general Gmail draft scope; Google also grants sending capability with it. Zivi Atlas implements draft creation only. Email identity is used to open the correct Gmail account.
- The browser fetches the authenticated `.eml` export with the saved draft revision, then sends its MIME content directly to Google's draft API. Concurrent edits are rejected before transfer. No public attachment links are created.
- The button remembers a successful copy while the editor is mounted. Further edits create a new Gmail copy, preserving Gmail-side changes. Reloading the app clears this in-memory receipt; creating again can produce another copy.
- An uncertain network result is not automatically retried. Check Gmail Drafts before retrying to avoid duplicates.
- The Mail-App composer link remains text-only; `.eml` includes attachments for compatible mail clients. ChatGPT-created Zivi Atlas drafts can use this same website handoff; this browser authorization does not grant the remote MCP server Gmail access.

## Validation

`node --import ./tests/register.mjs --test tests/gmail.test.mjs` checks exact attachment bytes with an independent MIME parser, owner/revision checks, concurrent changes, and failure handling using synthetic data and a fake Google transport. A real Google account/client is required for the final authorization and Gmail readback check.

References: [Google draft API](https://developers.google.com/workspace/gmail/api/guides/drafts), [attachment example](https://developers.google.com/workspace/gmail/api/guides/sending), [browser token model](https://developers.google.com/identity/oauth2/web/guides/use-token-model), [OAuth client setup](https://developers.google.com/identity/oauth2/web/guides/get-google-api-clientid), [Gmail scopes](https://developers.google.com/workspace/gmail/api/auth/scopes).
