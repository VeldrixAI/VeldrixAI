import Image from "next/image";

/**
 * VeldrixAI brand mark — the single source of truth for the brand glyph.
 * Renders the metallic swirl/blade mark (public/veldrix-logo.png). The artwork
 * has a transparent background, so it sits cleanly on any surface — the blades
 * stay opaque on both the dark product theme and light surfaces (favicon, PDF).
 *
 * NOTE: the component is still named `ShieldMark` for call-site compatibility
 * (it is imported in ~30 places); the shield artwork was replaced by the swirl
 * mark project-wide. Treat this as the canonical brand glyph component.
 */
export function ShieldMark({
  size = 36,
  className = "",
  priority = false,
}: {
  size?: number;
  className?: string;
  priority?: boolean;
}) {
  return (
    <Image
      src="/veldrix-logo.png"
      alt=""
      width={size}
      height={size}
      priority={priority}
      draggable={false}
      className={`shield-mark ${className}`.trim()}
      style={{ width: size, height: "auto", objectFit: "contain" }}
    />
  );
}
