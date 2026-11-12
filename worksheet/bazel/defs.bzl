"""worksheet_library: a catalogue of worksheets, checked, composed and viewable."""

load("@aspect_bazel_lib//lib:write_source_files.bzl", "write_source_files")
load("@aspect_rules_js//js:defs.bzl", "js_run_binary")

def worksheet_library(name, srcs = [], library = None, composed_dir = None):
    """Builds a worksheet catalogue.

    Targets:
      <name>: the catalogue as a binary Library, <name>.binpb.
      <name>_composed: every worksheet composed, one JSON ComposedSheet per
        worksheet. The build fails if any worksheet has a problem.
      <name>_gallery: a directory to serve that shows every worksheet.
      <name>_golden and <name>_golden_test, when composed_dir is set: the
        target that rewrites the checked-in composed sheets in composed_dir,
        and the test that they match.

    Args:
      name: target name.
      srcs: textproto files, each holding top-level Library fields.
      library: instead of srcs, a target producing the catalogue as a binary
        Library, for a catalogue that is built rather than written.
      composed_dir: a source directory holding the published composed sheets.
    """
    if library:
        native.genrule(
            name = name,
            srcs = [library],
            outs = [name + ".binpb"],
            cmd = "cp $< $@",
        )
    else:
        native.genrule(
            name = name,
            srcs = srcs + [
                "//worksheet/proto/v1:nodes.proto",
                "//worksheet/proto/v1:worksheet.proto",
            ],
            outs = [name + ".binpb"],
            cmd = """
              cat {srcs} | $(location //worksheet/bazel:protoc) -I. \
                  --encode=gradeguide.worksheet.v1.Library \
                  worksheet/proto/v1/worksheet.proto > $@
            """.format(srcs = " ".join(["$(location %s)" % s for s in srcs])),
            tools = ["//worksheet/bazel:protoc"],
        )

    js_run_binary(
        name = name + "_composed",
        srcs = [":" + name],
        args = ["$(rootpath :%s)" % name, native.package_name() + "/" + name + "_composed"],
        out_dirs = [name + "_composed"],
        tool = "//worksheet/engine:compose_library",
    )

    native.genrule(
        name = name + "_gallery",
        srcs = [
            ":" + name,
            "//worksheet/gallery",
            "//worksheet/gallery:index.html",
        ],
        outs = [
            name + "_gallery/index.html",
            name + "_gallery/gallery.js",
            name + "_gallery/library.binpb",
        ],
        cmd = """
          d=$(RULEDIR)/{name}_gallery
          cp $(location //worksheet/gallery:index.html) $$d/index.html
          cp $(location //worksheet/gallery) $$d/gallery.js
          cp $(location :{name}) $$d/library.binpb
        """.format(name = name),
    )

    if composed_dir:
        write_source_files(
            name = name + "_golden",
            files = {composed_dir: ":" + name + "_composed"},
        )
