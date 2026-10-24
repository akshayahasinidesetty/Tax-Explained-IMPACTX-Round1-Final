# Deployment setup and failure checks

This is a Next.js application (not a static-only HTML site). The repository includes `netlify.toml` for the Netlify build command and Node runtime.

## Netlify

1. Import the Git repository and set the **Base directory** to the folder that contains this project's `package.json`.
2. Use `npm run build` as the build command. `netlify.toml` also declares this command and Node 22.
3. Let Netlify detect its built-in Next.js runtime. If the UI requires a publish directory, use `.next`. Do not add a `/* /index.html 200` catch-all rewrite and do not enable static export; middleware and server-rendered routes need Next.js runtime support.
4. The public guest demo does not require Supabase environment variables. To enable real authentication, add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` in Netlify environment settings, configure the corresponding redirect URLs in Supabase, and deploy again.
5. Check the build log from the *first* error line. A deployment cannot be reliably diagnosed from only the final “deploy failed” message.

## Local checks before deploy

```bash
node --version
npm install
npm run typecheck
npm test
npm run build
```

Use Node 22 (minimum supported by this package is Node 20.9). The production build must complete successfully before treating deployment as verified.

## Known constraints

The package needs an npm registry connection to install dependencies. If installation fails with `EAI_AGAIN`, `ENOTFOUND`, or a network timeout, that is a registry/DNS connectivity problem rather than a source-code build result. The current package does not include a generated lockfile; use `npm install`, not `npm ci`, until a lockfile is generated and committed.

The document workflow and limited tax estimator are prototype scope, not production-grade taxpayer software. Read `README.md` for limitations before demoing them.
