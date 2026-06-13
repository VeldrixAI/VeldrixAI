import Image from "next/image";

/**
 * VeldrixAI shield mark — the single source of truth for the brand glyph.
 * Renders the metallic shield logo (public/veldrix-shield.png). The artwork
 * has a transparent body, so it sits cleanly on any surface: on the dark
 * product theme the navy facets read as the full shield, and on light
 * surfaces the metallic linework carries the mark.
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
      src="/veldrix-shield.png"
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
