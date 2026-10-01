# Spec validation: a throwaway stub and its mutants

**Evidence type: generated / throwaway test evidence.** This is a throwaway
reference stub used to test the discriminating power of the HTTP
specification. It is not application code and was never deployed.

`server.mjs` is an in-memory stand-in for the approved HTTP contract
(`GET /`, `POST /replace`, `GET /?at=N`). The `MUTANT` environment variable
breaks exactly one rule. The question it answers: does
`spec/theseus.test.ts` (commit `199ff8c`) pass when the behaviour is right, and
fail, at the right check, when a rule is broken? It isn't in the build, the
test run or the image: vitest only runs `spec/**/*.test.ts`, and nothing
imports this file.

## How it was run

From the repository root, once per mutant:

```sh
MUTANT=<name> PORT=<port> node docs/exploration/spec-validation/server.mjs &
APP_URL=http://127.0.0.1:<port> pnpm vitest run spec/theseus.test.ts --reporter=verbose
```

## Results (re-run 1 Oct 2026)

| Stub | Result | Failing check | First failing assertion |
| --- | --- | --- | --- |
| correct (no mutant) | 10 passed | none | none |
| `globalversion`: one version for the whole sentence | 1 failed, 9 passed | keeps a word fresh when a different word changes: staleness is per position | `expected 409 to be 303` |
| `textversion`: the word text is the "version" | 1 failed, 9 passed | treats a word that came back as changed: stale is about versions, not text | — |
| `spendonrefusal`: a refused attempt uses up the change | 2 failed, 8 passed | doesn't spend the change on a refused replacement; refuses a replacement of a word that changed since it was seen, without spending it | — |
| `noescape`: nothing escaped | 1 failed, 9 passed | shows a replacement word as text, never as markup, wherever it appears | `expected 's' to be '<x-theseus>s</x-theseus>'` (at the word's label) |
| `escapelabelonly`: label escaped, history and earlier forms raw | 1 failed, 9 passed | shows a replacement word as text, never as markup, wherever it appears | `the replaced word became an element on GET /` (in the history beneath the word, not at the label) |

Each broken rule was caught by the check written for it, and by no other
check except where two checks share the rule (`spendonrefusal`). The first
draft of the spec had no per-position check. A read-only review pointed out
that a global-version implementation would pass it (this mutant wasn't run
against that draft). The check was added because of that review.

The stub also places an "as you left it" `?at=` link before the
`rel="prev"` link, so the spec's Earlier-link locator is tested against a
decoy.
