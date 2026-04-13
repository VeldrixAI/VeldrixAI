import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { SIDEBAR_GROUPS, getSectionForSlug, getPrevNext, ALL_PAGES } from "@/lib/docs/pages";
import { getDocPage } from "@/lib/docs/content";
import DocInteractivity from "@/components/docs/DocInteractivity";

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  return ALL_PAGES.map((page) => ({ slug: page.id }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const page = getDocPage(slug);
  if (!page) return { title: "Not Found" };
  return {
    title: page.title,
    description: page.leadText,
  };
}

export default async function DocSlugPage({ params }: Props) {
  const { slug } = await params;
  const page = getDocPage(slug);
  if (!page) notFound();

  const section = getSectionForSlug(slug);
  const { prev, next } = getPrevNext(slug);

  // Find the sidebar item for active state indicator (passed as data attr for client)
  const sidebarItem = SIDEBAR_GROUPS
    .flatMap((g) => g.items)
    .find((i) => i.id === slug);

  return (
    <>
      {/* DocInteractivity injects copy handlers + TOC observer (client component) */}
      <DocInteractivity slug={slug} toc={page.toc} />

      <div className="docs-content-inner">
        {/* Breadcrumb */}
        <nav className="docs-breadcrumb" aria-label="Breadcrumb">
          <span className="docs-breadcrumb-section">{section}</span>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M9 18l6-6-6-6"/>
          </svg>
          <span className="docs-breadcrumb-page">{page.title}</span>
        </nav>

        {/* Page header */}
        <div className="docs-page-header">
          <h1 className="docs-h1">{page.title}</h1>
          {page.leadText && <p className="docs-lead">{page.leadText}</p>}
        </div>

        {/* Right TOC panel */}
        {page.toc.length > 0 && (
          <aside className="docs-toc" aria-label="On this page">
            <div className="docs-toc-title">On this page</div>
            <ul className="docs-toc-list">
              {page.toc.map((entry) => (
                <li key={entry.id}>
                  <a
                    href={`#${entry.id}`}
                    className="docs-toc-link"
                    data-toc-target={entry.id}
                  >
                    {entry.label}
                  </a>
                </li>
              ))}
            </ul>
          </aside>
        )}

        {/* Main page content — HTML from content.ts */}
        <div
          className="docs-content"
          dangerouslySetInnerHTML={{ __html: page.htmlContent }}
        />

        {/* Prev / Next navigation */}
        <nav className="docs-prev-next" aria-label="Previous and next pages">
          {prev ? (
            <Link href={`/docs/${prev.id}`} className="docs-prev-link">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M19 12H5M12 19l-7-7 7-7"/>
              </svg>
              <div>
                <div className="docs-nav-hint">Previous</div>
                <div className="docs-nav-label">{prev.label}</div>
              </div>
            </Link>
          ) : <div />}
          {next && (
            <Link href={`/docs/${next.id}`} className="docs-next-link">
              <div>
                <div className="docs-nav-hint">Next</div>
                <div className="docs-nav-label">{next.label}</div>
              </div>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M5 12h14M12 5l7 7-7 7"/>
              </svg>
            </Link>
          )}
        </nav>

        {/* Feedback row */}
        <div className="docs-feedback" aria-label="Page feedback">
          <span className="docs-feedback-label">Was this page helpful?</span>
          <button type="button" className="docs-feedback-btn docs-feedback-yes" aria-label="Yes, this page was helpful">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3H14z"/>
              <path d="M7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/>
            </svg>
            Yes
          </button>
          <button type="button" className="docs-feedback-btn docs-feedback-no" aria-label="No, this page needs improvement">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3H10z"/>
              <path d="M17 2h2.67A2.31 2.31 0 0 1 22 4v7a2.31 2.31 0 0 1-2.33 2H17"/>
            </svg>
            No
          </button>
        </div>
      </div>
    </>
  );
}
