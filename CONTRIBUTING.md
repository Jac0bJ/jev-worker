# Contributing

Use Node.js 22 or newer. Install dependencies with `npm ci`, then run `npm run lint`, `npm run typecheck`, and `npm test` before opening a pull request. Use `npm run types` after changing `wrangler.jsonc` bindings and include the generated type changes.

Keep tests local and deterministic. CI must not call live Jev inference or require Cloudflare credentials. Never commit `.dev.vars`, API keys, customer text, or raw model responses with private data. For changes to the provider contract, check [the API notes](docs/jev-api-notes.md) and add a focused test for the behavior.

Pull requests run checks without repository secrets, including from forks. A maintainer's `v*` tag can deploy after the tag's checks pass. Please describe what changed, how you tested it, and any billing or compatibility impact.

By contributing, you agree that your contributions are licensed under the MIT License.
