# Name Collision Check

Date: 2026-06-18

Candidate:

```text
vynema
```

## Result

`vynema` is approved as the working product and repository name for this pre-alpha OSS project.

This is not a trademark clearance or legal review.
If the project moves beyond experimental OSS, run a separate trademark and domain review.

## Checks

| Surface | Result | Note |
|---|---|---|
| GitHub repository search | Low collision | GitHub API search for `vynema in:name` returned one close match, `ntando-deeev/vynemarket`, and no exact `vynema` repository in the visible result set. |
| GitHub `Saber5656/vynema` | Available by API check | `https://api.github.com/repos/Saber5656/vynema` returned `404` at check time. |
| GitHub user/org `vynema` | No visible exact account | `https://api.github.com/users/vynema` returned `404` at check time. |
| npm package `vynema` | No exact package found | `https://registry.npmjs.org/vynema` returned `404` at check time. |
| PyPI package `vynema` | No exact package found | `https://pypi.org/pypi/vynema/json` returned `404` at check time. |
| `vynema.com` | Not assumed available | DNS resolved and HTTP returned `200`; do not rely on this domain being available. |

## Decision

Use:

| Use | Name |
|---|---|
| Product | `vynema` |
| Repository | `vynema` |
| Future package or CLI | `vynema` |

## Follow-up

- Rename the GitHub repository before switching to public visibility if possible.
- Update local `origin` after the GitHub repository rename.
- Keep historical `AI-Theater` references only in private notes or clearly marked historical material.
