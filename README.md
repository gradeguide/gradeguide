# Grade Guide

Grade Guide shows parents what a child learns in K–8 math, month by month.
For each skill it gives a plain explanation, an example, an idea to try at
home, the skills it builds on and leads to, and printable worksheets.

This repository holds the skill graph, the text written for parents, and the
worksheet engine.

## Layout

| Path | What it is |
|---|---|
| `proto/graph/v1/graph.proto` | The skill graph: standards, smaller skills, prerequisites, curriculum units and lessons, and when each is taught |
| `proto/graph/v1/curated.proto` | The parent-facing layer: plain names, explanations, examples, try-at-home ideas, topics, and a review status on each |
| `content/math/` | The parent-facing text for every K–8 Common Core math standard, one file per grade |
| `data/` | The build of the imported skill graph, with its licence and credits |
| `graph/lcimport/` | The importer, which turns the source export into the skill graph |
| `graph/curated/` | Loads the parent-facing layer and checks it against the graph |
| `proto/graph/v1/alignment.proto` | Which skills in the graph each worksheet fragment covers |
| `graph/worksheets/` | Checks worksheet alignments against the graph and fills in each worksheet's header standards |
| `worksheet/` | The worksheet engine, a subproject with its own README: records, composer, components and gallery |

## Building

```bash
bazel test //...
```

The first build downloads the source export, about 1 GB, pinned by
release and SHA-256 in `MODULE.bazel`. The build imports it and fails if
any standard lacks parent-facing text, or if any entry names a record the
graph does not have.

To move to a new source release, change `KNOWLEDGE_GRAPH_VERSION` and the
two hashes in `MODULE.bazel`.

## Releasing the site

Apps that work offline bundle the built website from a release. Push a tag
such as `v2026.11.12`, or run the Release workflow with a new tag, and it
attaches `gradeguide-site-<tag>.tar.gz` to a release of that name. The
release notes give its SHA-256. The archive holds what the website serves,
and the same commit always packs to the same bytes.

## Reviewing the parent-facing text

Every entry in `content/math/` starts as `STATUS_DRAFT`. A teacher who
checks an entry sets its status to `STATUS_REVIEWED`, with their name and
the date, or to `STATUS_CHANGES_REQUESTED`.

## Licences

| Directory | Licence |
|---|---|
| Code, everywhere unless listed below | Apache License 2.0 (`LICENSE`) |
| `content/` | CC0 1.0 Universal (`content/LICENSE`) |
| `data/`, and the skill graph it builds | CC BY 4.0 (`data/LICENSE`); credits in `data/CREDITS` |

Text that comes from the imported data, or is paraphrased from it, goes in
`data/`, not in `content/`.
