---
name: deploy-workflow
description: "This Vercel project has no GitHub auto-deploy — git push to main does NOT trigger a production deploy; must run `npx vercel --prod` manually"
metadata: 
  node_type: memory
  type: project
  originSessionId: faa2eedf-133a-4f2c-8159-3462188bbbf9
---

The `dk-safety` Vercel project (`prj_XdKtSMTZXg9a2WAVXLhnl4M34CGe`, team `lakkk-1934s-projects`) is linked locally via `.vercel/project.json` for CLI deploys, but has no GitHub integration configured. Confirmed 2026-06-13: `vercel inspect` on recent deployments shows no git source metadata, and pushing commit `4c40df3` to `main` produced zero new deployments after 5+ minutes of polling.

**Why it matters**: any code change meant to be live on dkansim.com or its subdomains (hq/report/agent/contents.dkansim.com) requires `npx vercel --prod` after `git push` — the push alone does nothing. Forgetting this means the live site silently keeps serving the old build (e.g. old middleware without a new subdomain rewrite falls through to `/home`, which is exactly what happened with `contents.dkansim.com` before this was diagnosed).

**How to apply**: after committing+pushing any user-visible change, run `npx vercel --prod` (it builds and aliases to `dkansim.com` automatically) and verify with `curl -i` against the relevant subdomain before declaring the task done. Related: [[content-command-center-setup]], [[youtube-gemini-pipeline-setup]].
