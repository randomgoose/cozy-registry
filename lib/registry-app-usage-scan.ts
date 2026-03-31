const APP_HOOK_PATTERNS = [
  "useLanguage(",
  "useI18n(",
  "useTranslations(",
  "useAuth(",
  "useSession(",
  "useWallet(",
  "useRouter(",
  "useSearchParams(",
  "useQueryClient(",
  "useQuery(",
  "useMutation(",
];

const APP_PROVIDER_PATTERNS = [
  "LanguageProvider",
  "I18nProvider",
  "AuthProvider",
  "SessionProvider",
  "WalletProvider",
  "QueryClientProvider",
  "RouterProvider",
];

/** Detect app-coupled hooks/providers that registry bundles should not embed. */
export function findAppSpecificUsage(sources: string[]): string[] {
  const hits = new Set<string>();
  for (const src of sources) {
    if (typeof src !== "string") continue;
    for (const p of APP_HOOK_PATTERNS) {
      if (src.includes(p)) hits.add(p.replace("(", ""));
    }
    for (const p of APP_PROVIDER_PATTERNS) {
      if (src.includes(`<${p}`) || src.includes(`${p} `)) hits.add(p);
    }
  }
  return Array.from(hits).sort();
}
