"""The TypeScript compiler options every worksheet package uses."""

TSCONFIG = {
    "compilerOptions": {
        "target": "ES2022",
        "module": "ESNext",
        "moduleResolution": "bundler",
        "experimentalDecorators": True,
        "useDefineForClassFields": False,
        "sourceMap": True,
        "declaration": True,
        "strict": True,
        "skipLibCheck": True,
        "lib": ["ES2022", "DOM"],
        "types": [],
    },
    "angularCompilerOptions": {
        "strictTemplates": True,
    },
}

def tsconfig_with(types):
    """TSCONFIG with the given @types packages visible."""
    opts = dict(TSCONFIG["compilerOptions"])
    opts["types"] = types
    return {"compilerOptions": opts, "angularCompilerOptions": TSCONFIG["angularCompilerOptions"]}
