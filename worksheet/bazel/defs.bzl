"""worksheet_library: a catalogue of worksheets, checked, composed and viewable."""

load("@aspect_bazel_lib//lib:write_source_files.bzl", "write_source_files")
load("@aspect_bazel_lib//lib:run_binary.bzl", "run_binary")
load("@aspect_rules_js//js:defs.bzl", "js_run_binary")

def worksheet_library(name, srcs = [], library = None, composed_dir = None):
    """Builds a worksheet catalogue.

    Targets:
      <name>: the catalogue as a binary Library, <name>.binpb.
      <name>_composed: every worksheet composed, one JSON ComposedSheet per
        worksheet. The build fails if any worksheet has a problem.
      <name>_gallery: a directory to serve that shows every worksheet.
      <name>_prints: every worksheet as <id>.pdf, <id>-answers.pdf and a
        page-one <id>.png, rendered in a pinned headless Chromium.
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
            "//worksheet/fonts:OFL.txt",
            "@andika_regular//file",
            "@andika_bold//file",
        ],
        outs = [
            name + "_gallery/index.html",
            name + "_gallery/gallery.js",
            name + "_gallery/library.binpb",
            name + "_gallery/fonts/Andika-Regular.ttf",
            name + "_gallery/fonts/Andika-Bold.ttf",
            name + "_gallery/fonts/OFL.txt",
        ],
        cmd = """
          d=$(RULEDIR)/{name}_gallery
          cp $(location //worksheet/gallery:index.html) $$d/index.html
          cp $(location //worksheet/gallery) $$d/gallery.js
          cp $(location :{name}) $$d/library.binpb
          cp $(location @andika_regular//file) $$d/fonts/Andika-Regular.ttf
          cp $(location @andika_bold//file) $$d/fonts/Andika-Bold.ttf
          cp $(location //worksheet/fonts:OFL.txt) $$d/fonts/OFL.txt
        """.format(name = name),
    )

    # Every worksheet as print files: <id>.pdf, <id>-answers.pdf and <id>.png,
    # page one about 240 pixels wide.
    run_binary(
        name = name + "_prints",
        srcs = [":" + name + "_gallery"],
        args = [
            "--gallery=$(RULEDIR)/" + name + "_gallery",
            "--out=$(RULEDIR)/" + name + "_prints",
        ],
        out_dirs = [name + "_prints"],
        tool = "//worksheet/render:render-worksheets",
    )

    if composed_dir:
        write_source_files(
            name = name + "_golden",
            files = {composed_dir: ":" + name + "_composed"},
        )
