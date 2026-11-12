# Worksheet engine

The worksheet engine turns worksheet records into printable math worksheets
with answer keys. It is a subproject of Grade Guide that could be split out:
nothing under `worksheet/` depends on the rest of this repository.

## Records

A catalogue is a `Library` of fragments and worksheets, written as
textproto (`proto/v1/worksheet.proto`).

- A **fragment** is a reusable section: an instruction, a worked example,
  and either an item kind with the ranges its numbers come from, or
  authored items written in full. It says why it exists in a learning
  design.
- A **worksheet** places fragments in order, with a seed, a numbering style
  and a page limit.
- A **ComposedSheet** is a worksheet with its items generated, numbered and
  fitted to pages. The components draw only this.

Generated items have their answers computed by code. Authored items, such
as word problems, carry each answer with the working that produces it; the
composer checks that the working comes to the answer and uses only numbers
the item shows.

The same record, seed and engine always compose the same sheet.

## Layout

| Path | What it is |
|---|---|
| `proto/v1/` | The records: nodes (text, maths, widgets, answer spaces) and worksheets |
| `engine/` | Item generators, the composer, answer checks and widget geometry, in TypeScript with no Angular |
| `components/` | Angular components that draw a `ComposedSheet` |
| `gallery/` | A page that shows every worksheet in a library, filled in and not |
| `examples/` | Example fragments and worksheets, used by the tests and the gallery |
| `bazel/` | Build rules, including `worksheet_library` |

## Building

```bash
bazel test //worksheet/...
bazel build //worksheet/examples:examples_gallery
python3 -m http.server -d bazel-bin/worksheet/examples/examples_gallery
```

`worksheet_library` in `bazel/defs.bzl` builds a catalogue: it encodes it,
composes every worksheet as JSON (failing the build on any problem), and
builds a gallery for it. Add `?writing=large` to a gallery address to see
the sheets sized for a child who writes large.
