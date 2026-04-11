type ClassValue = string | false | null | undefined

export function cn<TArgs extends unknown[]>(
  ...parts: Array<ClassValue | ((...args: TArgs) => ClassValue)>
) {
  if (parts.some((part) => typeof part === "function")) {
    return (...args: TArgs) =>
      parts
        .map((part) => (typeof part === "function" ? part(...args) : part))
        .filter(Boolean)
        .join(" ")
  }

  return parts.filter(Boolean).join(" ")
}
