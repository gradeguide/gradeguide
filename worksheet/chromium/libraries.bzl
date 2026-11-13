"""Unpacks Debian packages into one directory of shared libraries."""

# Every package except glibc's, unpacked in order, and the multiarch library
# directories copied into the output.
#
# glibc is left out because the host's dynamic loader runs the binary, and a
# loader can only load the libc it was built with. Every other library comes
# from the packages.
#
# Debian packages keep libraries in two places, /lib/x86_64-linux-gnu and
# /usr/lib/x86_64-linux-gnu, and rules_distroless unpacks them without merging
# the two. Both are copied into one directory, keeping their subdirectories:
# libnss3 loads libsoftokn3 from the nss/ directory beside itself.
#
# A symlink with an absolute target points at the host, and one whose target
# is missing points nowhere. Both are removed, so the directory resolves to
# nothing outside itself.
_SCRIPT = """
set -euo pipefail
out="$1"
bsdtar="$2"
shift 2

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

for package in "$@"; do
  "$bsdtar" -tf "$package" > "$work/listing"
  if grep -Eq '(^|/)libc[.]so[.]6$' "$work/listing"; then
    continue
  fi
  mkdir -p "$work/root"
  "$bsdtar" -xf "$package" -C "$work/root"
done

for dir in lib/x86_64-linux-gnu usr/lib/x86_64-linux-gnu; do
  if [ -d "$work/root/$dir" ]; then
    cp -a "$work/root/$dir/." "$out/"
  fi
done

find "$out" -type l -lname '/*' -delete
find "$out" -xtype l -delete
"""

def _deb_libraries_impl(ctx):
    out = ctx.actions.declare_directory(ctx.label.name)
    bsdtar = ctx.toolchains["@aspect_bazel_lib//lib:tar_toolchain_type"].tarinfo.binary

    args = ctx.actions.args()
    args.add(out.path)
    args.add(bsdtar)
    args.add_all(ctx.files.packages)

    ctx.actions.run_shell(
        command = _SCRIPT,
        arguments = [args],
        inputs = ctx.files.packages,
        tools = [bsdtar],
        outputs = [out],
        mnemonic = "DebLibraries",
        progress_message = "Unpacking the shared libraries in %{label}",
    )
    return [DefaultInfo(
        files = depset([out]),
        runfiles = ctx.runfiles(files = [out]),
    )]

deb_libraries = rule(
    implementation = _deb_libraries_impl,
    doc = """A directory holding the shared libraries from a set of Debian packages, except glibc.

The output is a tree artifact that LD_LIBRARY_PATH can name directly. glibc's
package is recognised by its libc.so.6 and skipped, because the host's loader
cannot load any libc but its own.
""",
    attrs = {
        "packages": attr.label_list(
            doc = "The packages' content tarballs, such as a rules_distroless dependency set's :packages target.",
            allow_files = True,
            mandatory = True,
        ),
    },
    toolchains = ["@aspect_bazel_lib//lib:tar_toolchain_type"],
)
