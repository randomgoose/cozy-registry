import type { Metadata } from "next";
import { generateStaticParamsFor, importPage } from "nextra/pages";
import { useMDXComponents as getMDXComponents } from "@/mdx-components";

export const generateStaticParams = generateStaticParamsFor("mdxPath");

type PageProps = {
  params: Promise<{ mdxPath?: string[] }>;
};

export async function generateMetadata(props: PageProps): Promise<Metadata> {
  const params = await props.params;
  const result = await importPage(params.mdxPath ?? []);
  return result.metadata;
}

export default async function DocsCatchAllPage(props: PageProps) {
  const params = await props.params;
  const result = await importPage(params.mdxPath ?? []);
  const { default: MDXContent, toc, metadata, sourceCode } = result;
  const Wrapper = getMDXComponents({}).wrapper;

  return (
    <Wrapper toc={toc} metadata={metadata} sourceCode={sourceCode}>
      <MDXContent {...props} params={params} />
    </Wrapper>
  );
}
