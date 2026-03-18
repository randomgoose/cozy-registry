import type { ReactNode } from "react";
import { Footer, Layout, Navbar } from "nextra-theme-docs";
import { getPageMap } from "nextra/page-map";
import "nextra-theme-docs/style.css";

export default async function DocsLayout(props: { children: ReactNode }) {
  const pageMap = await getPageMap("/docs");

  return (
    <Layout
      pageMap={pageMap}
      docsRepositoryBase="https://github.com/indeed-cozy/cozy-registry/tree/main/content/docs"
      navbar={
        <Navbar
          logo={<span className="font-semibold">Cozy Registry Docs</span>}
          logoLink="/docs"
          projectLink="https://github.com/indeed-cozy/cozy-registry"
        />
      }
      footer={
        <Footer>
          Cozy Registry Docs
        </Footer>
      }
      sidebar={{ defaultMenuCollapseLevel: 1, autoCollapse: true }}
      toc={{ title: "On This Page" }}
      editLink="Edit this page"
      feedback={{ content: "Question? Give us feedback" }}
    >
      {props.children}
    </Layout>
  );
}
