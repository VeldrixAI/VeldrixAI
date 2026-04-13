"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import Link from "next/link";
import { ALL_PAGES, SIDEBAR_GROUPS } from "@/lib/docs/pages";

interface TocEntry {
  id: string;
  label: string;
}

interface Props {
  slug: string;
  toc: TocEntry[];
}

// ── Search modal ──────────────────────────────────────────────────────────────
function SearchModal({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  const allItems = SIDEBAR_GROUPS.flatMap((g) =>
    g.items.map((item) => ({ ...item, section: g.label }))
  );

  const results =
    query.trim() === ""
      ? allItems.slice(0, 8)
      : allItems.filter(
          (item) =>
            item.label.toLowerCase().includes(query.toLowerCase()) ||
            item.section.toLowerCase().includes(query.toLowerCase())
        );

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowDown") setSelected((s) => Math.min(s + 1, results.length - 1));
      if (e.key === "ArrowUp") setSelected((s) => Math.max(s - 1, 0));
      if (e.key === "Enter" && results[selected]) {
        router.push(`/docs/${results[selected].id}`);
        onClose();
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [results, selected, onClose, router]);

  return (
    <div
      className="docs-search-overlay"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      role="dialog"
      aria-modal="true"
      aria-label="Search documentation"
    >
      <div className="docs-search-modal">
        <div className="docs-search-input-row">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0, color: "rgba(240,242,255,0.3)" }} aria-hidden="true">
            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
          </svg>
          <input
            ref={inputRef}
            className="docs-search-input"
            placeholder="Search documentation..."
            value={query}
            onChange={(e) => { setQuery(e.target.value); setSelected(0); }}
            aria-label="Search query"
          />
          <button type="button" className="docs-search-close" onClick={onClose} aria-label="Close search">Esc</button>
        </div>
        <div className="docs-search-results" role="listbox">
          {results.length === 0 ? (
            <div className="docs-search-empty">No results for &ldquo;{query}&rdquo;</div>
          ) : (
            results.map((item, i) => (
              <Link
                key={item.id}
                href={`/docs/${item.id}`}
                className={`docs-search-result${i === selected ? " selected" : ""}`}
                onClick={onClose}
                role="option"
                aria-selected={i === selected}
              >
                <div className="docs-search-result-title">{item.label}</div>
                <div className="docs-search-result-section">{item.section}</div>
              </Link>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

// ── DocInteractivity ──────────────────────────────────────────────────────────
export default function DocInteractivity({ slug, toc }: Props) {
  const pathname = usePathname();
  const [searchOpen, setSearchOpen] = useState(false);

  // Mark active sidebar link
  useEffect(() => {
    const links = document.querySelectorAll<HTMLAnchorElement>(".docs-sidebar-link");
    links.forEach((link) => {
      link.classList.toggle(
        "active",
        link.getAttribute("href") === `/docs/${slug}`
      );
    });
  }, [slug]);

  // Copy-to-clipboard for code blocks
  useEffect(() => {
    const buttons = document.querySelectorAll<HTMLButtonElement>(".docs-content .cbcopy");
    buttons.forEach((btn) => {
      btn.addEventListener("click", () => {
        const pre = btn.closest(".cblk")?.querySelector<HTMLPreElement>("pre:not([style*='display:none'])");
        const text = pre?.textContent ?? "";
        navigator.clipboard.writeText(text).then(() => {
          const orig = btn.textContent;
          btn.textContent = "Copied!";
          btn.classList.add("copied");
          setTimeout(() => {
            btn.textContent = orig;
            btn.classList.remove("copied");
          }, 1500);
        });
      });
    });
  }, [pathname]);

  // Code block tab switching
  useEffect(() => {
    const tabs = document.querySelectorAll<HTMLButtonElement>(".docs-content .cbt");
    tabs.forEach((tab) => {
      tab.addEventListener("click", () => {
        const block = tab.closest(".cblk");
        if (!block) return;
        const lang = tab.dataset.lang;
        block.querySelectorAll<HTMLButtonElement>(".cbt").forEach((t) => {
          t.classList.toggle("active", t.dataset.lang === lang);
        });
        block.querySelectorAll<HTMLPreElement>("pre[data-lang]").forEach((pre) => {
          pre.style.display = pre.dataset.lang === lang ? "" : "none";
        });
      });
    });
  }, [pathname]);

  // IntersectionObserver for TOC highlighting
  useEffect(() => {
    if (toc.length === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const id = entry.target.id;
            document.querySelectorAll<HTMLAnchorElement>(".docs-toc-link").forEach((link) => {
              link.classList.toggle("toc-active", link.dataset.tocTarget === id);
            });
          }
        }
      },
      { rootMargin: "-20% 0% -70% 0%" }
    );
    toc.forEach(({ id }) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, [toc, pathname]);

  // Keyboard shortcut: ⌘K / Ctrl+K opens search
  useEffect(() => {
    function handleKeydown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setSearchOpen(true);
      }
    }
    window.addEventListener("keydown", handleKeydown);

    // Also attach to the search trigger button
    const trigger = document.getElementById("docs-search-trigger");
    const openSearch = () => setSearchOpen(true);
    trigger?.addEventListener("click", openSearch);

    return () => {
      window.removeEventListener("keydown", handleKeydown);
      trigger?.removeEventListener("click", openSearch);
    };
  }, []);

  return searchOpen ? <SearchModal onClose={() => setSearchOpen(false)} /> : null;
}
