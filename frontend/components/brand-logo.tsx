import Link from "next/link";
import { ShieldMark } from "./shield-mark";

export function BrandLogo({ href = "/" }: { href?: string }) {
  return (
    <Link className="brand" href={href} aria-label="Veldrix home">
      <ShieldMark className="brand-icon" />
      <span>Veldrix</span>
    </Link>
  );
}
