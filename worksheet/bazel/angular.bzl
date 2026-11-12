"""Starlark macros for Angular Ahead-of-Time (AOT) component compilation and unit spec execution."""

load("@aspect_rules_js//js:defs.bzl", "js_test")
load("@aspect_rules_ts//ts:defs.bzl", "ts_project")
load("@npm//:@angular/compiler-cli/package_json.bzl", compiler_cli = "bin")

def angular_ts_project(name, srcs, tsconfig = None, deps = [], **kwargs):
    """Compiles Angular components with AOT template type-checking.

    Angular component targets use this rule so their templates are checked at
    build time.
    """
    ngc_name = name + "_ngc"
    compiler_cli.ngc_binary(
        name = ngc_name,
    )

    extra_deps = [
        "//:node_modules/@angular/compiler-cli",
        "//:node_modules/@angular/compiler",
    ]
    combined_deps = list(deps)
    for d in extra_deps:
        if d not in combined_deps:
            combined_deps.append(d)

    ts_project(
        name = name,
        srcs = srcs,
        tsconfig = tsconfig,
        transpiler = "tsc",
        tsc = ":" + ngc_name,
        deps = combined_deps,
        **kwargs
    )

def angular_test(name, srcs, tsconfig = None, deps = [], **kwargs):
    """Compiles and executes Angular component and service unit specs hermetically.

    Compiles TypeScript unit specs (*.spec.ts) using ts_project and runs
    them in a JSDOM + Zone.js + Jasmine environment under Bazel js_test.
    """
    spec_ts_name = name + "_ts"

    extra_deps = [
        "//:node_modules/@angular/compiler-cli",
        "//:node_modules/@angular/compiler",
        "//:node_modules/@angular/core",
        "//:node_modules/@angular/common",
        "//:node_modules/@angular/platform-browser",
        "//:node_modules/@angular/platform-browser-dynamic",
        "//:node_modules/reflect-metadata",
        "//:node_modules/zone.js",
        "//:node_modules/rxjs",
        "//:node_modules/@types/node",
        "//:node_modules/@types/jasmine",
    ]
    combined_deps = list(deps)
    for d in extra_deps:
        if d not in combined_deps:
            combined_deps.append(d)

    ts_project_kwargs = {
        "name": spec_ts_name,
        "srcs": srcs,
        "declaration": True,
        "source_map": True,
        "transpiler": "tsc",
        "validate": False,
        "deps": combined_deps,
    }
    if tsconfig != None:
        ts_project_kwargs["tsconfig"] = tsconfig

    ts_project(**ts_project_kwargs)

    pkg = native.package_name()
    spec_js_files = []
    for s in srcs:
        if s.startswith("/"):
            s_path = s[1:]
        elif pkg and not s.startswith(pkg):
            s_path = pkg + "/" + s
        else:
            s_path = s

        if s_path.endswith(".ts"):
            spec_js_files.append(s_path[:-3] + ".js")
        else:
            spec_js_files.append(s_path)

    js_test_data = [
        ":" + spec_ts_name,
        "//worksheet/bazel:angular_spec_runner",
        "//worksheet/bazel:esm_loader",
        "//:node_modules/jsdom",
        "//:node_modules/jasmine",
        "//:node_modules/reflect-metadata",
        "//:node_modules/zone.js",
        "//:node_modules/@angular/core",
        "//:node_modules/@angular/common",
        "//:node_modules/@angular/compiler",
        "//:node_modules/@angular/platform-browser",
        "//:node_modules/@angular/platform-browser-dynamic",
        "//:node_modules/rxjs",
    ]
    for d in combined_deps:
        if d not in js_test_data:
            js_test_data.append(d)

    js_test(
        name = name,
        entry_point = "//worksheet/bazel:angular_spec_runner",
        args = spec_js_files,
        data = js_test_data,
        node_options = [
            "--experimental-default-type=module",
            "--loader=./worksheet/bazel/esm_loader.mjs",
        ],
        **kwargs
    )

angular_spec_test = angular_test
