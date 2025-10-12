# Repository Guidelines

## Project Structure & Modules
- `src/index.js`: Entry point (Express + Stremio Addon SDK).
- `src/handlers/`: HTTP handlers (`manifest.js`, `catalog.js`, `meta.js`).
- `src/services/`: Core logic (`addonProxy.js`, `ratingsService.js`, `metadataEnhancer.js`, `stremioApi.js`, `kitsuMappingService.js`).
- `src/config/`: Runtime defaults and env-driven settings.
- `src/utils/`: Utilities (`logger.js`, `configParser.js`).

## Build, Test, and Development
- `npm install`: Install dependencies.
- `npm start`: Run the server (default `PORT=7000`).
- `npm run dev`: Run with nodemon for auto-reload during development.
- Tests: No script configured yet; see Testing Guidelines.

## Coding Style & Naming
- JavaScript (CommonJS: `require`/`module.exports`), Node 18+ recommended.
- Indentation: 2 spaces; semicolons required; single quotes preferred.
- Filenames: camelCase per module (e.g., `ratingsService.js`).
- Identifiers: camelCase for functions/vars, PascalCase for classes, UPPER_SNAKE for constants.
- Logging: use `utils/logger.js`; avoid `console.log` directly.
- Configuration: read via `src/config` and env vars; do not hardcode secrets.

## Testing Guidelines
- Preferred stack: Jest + Supertest; mock HTTP with `nock`.
- Location: `src/__tests__/` or colocate as `*.test.js` next to modules.
- Coverage focus: `services/` (business logic) and `handlers/` (route behavior).
- Example setup: add `"test": "jest"` in `package.json`, then run `npm test`.

## Commit & Pull Request Guidelines
- Commits: use Conventional Commits (e.g., `feat:`, `fix:`, `refactor:`, `docs:`).
- PRs: include a clear summary, linked issues, and sample requests/responses for affected endpoints.
- Verification checklist:
  - Server starts (`npm start` or `npm run dev`).
  - Health: `GET /health` returns OK.
  - Addon routes respond: `/:config/manifest.json`, `/:config/catalog/:type/:id.json`.

## Security & Configuration Tips
- Env vars: `PORT`, `LOG_LEVEL` (default `info`). Keep secrets out of VCS.
- Input validation: use `utils/configParser` to decode/validate URL config; never trust raw input.
- Network hygiene: timeouts and error handling for axios calls; avoid leaking sensitive URLs at `info` level.

