import type { MDXComponents } from "nextra/mdx-components";
import { useMDXComponents as getDocsMDXComponents } from "nextra-theme-docs";

export function useMDXComponents(components: MDXComponents) {
  return getDocsMDXComponents(components);
}
