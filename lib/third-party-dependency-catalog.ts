import Module from "node:module";

export const RUNTIME_PROVIDED_DEPENDENCIES = [
  "react",
  "react-dom",
  "react-dom/client",
  "react/jsx-runtime",
] as const;

export const TRUSTED_BUILT_IN_DEPENDENCIES = [
  "lucide-react",
  "clsx",
  "class-variance-authority",
  "tailwind-merge",
] as const;

export const TRUSTED_BUILT_IN_NAMESPACE_PREFIXES = [
  "@base-ui/",
  "@hugeicons/",
  "@radix-ui/",
] as const;

export const BLOCKED_THIRD_PARTY_DEPENDENCIES = [
  "@aws-sdk/client-s3",
  "@prisma/client",
  "better-sqlite3",
  "bcrypt",
  "canvas",
  "child_process",
  "fsevents",
  "fs",
  "mongodb",
  "next",
  "node-gyp",
  "path",
  "pg-native",
  "sharp",
  "sqlite3",
] as const;

export const NODE_BUILTIN_DEPENDENCIES = Array.from(
  new Set(
    Module.builtinModules.flatMap((name) =>
      name.startsWith("node:") ? [name, name.slice(5)] : [name, `node:${name}`],
    ),
  ),
).sort();
