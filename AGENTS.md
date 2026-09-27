# Working on Zivi Atlas

- Commit after every completed logical change, before beginning the next change. Run the relevant verification first and use a descriptive commit message.
- Inspect the working tree before editing. Stage only files belonging to your change; preserve unrelated work. Do not rewrite existing commits or push without authorization.
- Never commit secrets, tokens, `.env` files, local runtime storage, private CVs or imported personal emails. Use synthetic fixtures for checks and examples.
- Preserve owner scoping, revision checks and attachment access controls when changing persistence or MCP tools.
- Local development uses a loopback-only mock sign-in identity. Production relies on a trusted authentication gateway. Do not describe local checks as proof of production behavior, and do not deploy the Worker publicly without an authenticated, protected entry point.
- Keep the German interface concise and preserve the compact map layout. Prefer the existing components and styles for additions.
- Use Node.js 24 for development checks. Relevant commands are `npm run typecheck`, `npm test`, and `npm run build`. Run checks appropriate to the change; do not send email or modify real application records during tests.
- Preserve third-party license notices and map attribution. Public source publication does not authorize publishing private application data.
