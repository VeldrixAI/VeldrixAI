"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SIDEBAR_GROUPS } from "@/lib/docs/pages";

export function DocsSidebar() {
  const pathname = usePathname();

  return (
    <aside className="docs-sidebar" aria-label="Documentation navigation">
      <nav>
        {SIDEBAR_GROUPS.map((group) => (
          <div key={group.label} className="docs-sidebar-group">
            <div className="docs-sidebar-group-label">{group.label}</div>
            <ul className="docs-sidebar-items">
              {group.items.map((item) => {
                const href = `/docs/${item.id}`;
                const isActive = pathname === href;
                return (
                  <li key={item.id}>
                    <Link
                      href={href}
                      className={`docs-sidebar-link${isActive ? " active" : ""}`}
                    >
                      {item.label}
                      {item.badge && (
                        <span
                          className={`docs-badge docs-badge-${item.badge.toLowerCase()}`}
                          aria-label={item.badge}
                        >
                          {item.badge}
                        </span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
    </aside>
  );
}
