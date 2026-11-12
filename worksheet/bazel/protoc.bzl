# The protoc binary that proto toolchain resolution picked.
#
# .bazelrc turns on --incompatible_enable_proto_toolchain_resolution and
# --@protobuf//bazel/toolchains:prefer_prebuilt_protoc, which together make
# proto_library run a protoc downloaded from a protobuf release rather than one
# compiled here. That covers proto_library and nothing else.
#
# A genrule naming //tools/bazel:protoc in its tools bypasses resolution
# entirely and asks for the source target by label, so Bazel builds it: protoc
# links libprotoc, and libprotoc is every code generator protobuf ships. One
# such genrule pulls in 270 protobuf compiler targets, including the PHP, Ruby,
# Rust, Kotlin and Objective-C generators that nothing here uses, and around
# 1,450 C++ translation units. On a cold cache that is most of an hour.
#
# This rule asks the toolchain the same question proto_library asks and hands
# back the answer, so a genrule can use the resolved protoc as a tool without
# naming a repository whose canonical name encodes the host platform.

def _resolved_protoc_impl(ctx):
    toolchain = ctx.toolchains["@protobuf//bazel/private:proto_toolchain_type"]
    # The prebuilt protoc is one static binary, so its own file is the whole
    # of what a caller needs. Symlinked rather than copied, because a genrule
    # runs the tool from its execroot path and copying a 30MB binary into every
    # consumer's outputs would cost more than the rule saves.
    protoc = toolchain.proto.proto_compiler.executable
    link = ctx.actions.declare_file(ctx.label.name + "_bin")
    ctx.actions.symlink(output = link, target_file = protoc, is_executable = True)
    return [DefaultInfo(
        files = depset([link]),
        executable = link,
        runfiles = ctx.runfiles(files = [link]),
    )]

resolved_protoc = rule(
    implementation = _resolved_protoc_impl,
    executable = True,
    toolchains = ["@protobuf//bazel/private:proto_toolchain_type"],
    doc = "Exposes the protoc chosen by proto toolchain resolution as an executable.",
)
