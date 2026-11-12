import fs from 'node:fs';
import path from 'node:path';

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('.')) {
    try {
      const parentUrl = new URL(context.parentURL);
      const parentDir = path.dirname(parentUrl.pathname);
      const resolvedPath = path.resolve(parentDir, specifier);
      if (!fs.existsSync(resolvedPath) && fs.existsSync(resolvedPath + '.js')) {
        return nextResolve(specifier + '.js', context);
      }
    } catch {}
  }
  return nextResolve(specifier, context);
}
