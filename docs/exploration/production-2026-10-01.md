# First production use, 2026-10-01

**REAL PRODUCTION OBSERVATION.** One real human contribution on the live site,
and the agent's read-only checks around it. All times are UTC.

Live URL: https://comp4020-final-baizhenh884-dev.fly.dev

## Who did what

- **Human (the maker):** opened the live site in a browser and made the only
  production contribution, Make → Keep, through the page's own form.
- **Agent (Claude Code):** deployed, and verified using reads only: page GETs,
  logs, and read-only inspection of the database on the volume. The agent
  never sent a POST to `/replace` in production. The spec's sentence-changing
  checks skip themselves when `APP_URL` isn't local, so `pnpm check` against
  production ran 4 checks and skipped 10 by design.

## Sequence

1. **First deploy** of commit `57a9bd8` (image
   `deployment-01M3TZM2E3GE0AQ01P8V581RWV`): one shared-cpu-1x machine with
   256 MB and one volume mounted at `/data`. The log showed
   `[theseus] database: /data/theseus.db`. The database was created about
   05:42.
2. **Before any human contribution** (agent, read-only): the page showed the
   maker's sentence, "Make a website that people would miss if it
   disappeared.", with 10 positions at version 1 and 0 visitor changes.
   Production `pnpm check`: 4 passed, 10 skipped.
3. **First legitimate human contribution**, at 05:54:34: position 0, Make →
   Keep. Afterwards the database held exactly 1 change from 1 visitor, and
   position 0 was at version 2.
4. **Usability defect found by hand** during that use: focusing a word opened
   the editing field beside the word instead of in its place. This widened the
   word and broke the sentence's layout apart.
5. **Correction:** `0d61ca7 fix: keep word editing inline`, verified locally
   with the full suite on the image (14 of 14) and a measured 0 px layout shift
   on focus.
6. **Redeploy** of `0d61ca7` (image `deployment-01M3V0ZB3EKMTRCV31KQMP4GTA`) to
   the same Fly machine and the same volume; no new machine or volume was
   created.
7. **After the redeploy, then after one Fly machine restart** (agent,
   read-only, both times):
   - `/data/theseus.db` was still mounted from the volume, and the log again
     showed `[theseus] database: /data/theseus.db`;
   - the sentence read "Keep a website that people would miss if it
     disappeared.";
   - `/?at=0` showed the maker's sentence, and `/?at=1` showed Make → Keep;
   - the change count was still exactly 1;
   - production `pnpm check`: 4 passed, 10 skipped.

## Re-check while writing this (06:35:59, agent, read-only GETs)

`/?at=0` showed the maker's sentence, `/?at=1` showed the Keep sentence,
`/?at=2` returned 404, and `/` linked back to `?at=0`. So there was still
exactly 1 change. This was still the `0d61ca7` deploy; the history-navigation
commits were not deployed.

## Not recorded here

The visitor cookie value and visitor id, tokens and secrets, and account
details are left out on purpose. One person's contribution is not user
testing: this record shows that the live slice works and persists, not how
strangers use it.
