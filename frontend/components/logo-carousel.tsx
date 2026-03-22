"use client";

const logos = [
  { name: "Anthropic", src: "/logos/anthropic.svg" },
  { name: "OpenAI", src: "/logos/openai.svg" },
  { name: "Google", src: "/logos/google.svg" },
  { name: "Microsoft", src: "/logos/microsoft.svg" },
  { name: "Meta", src: "/logos/meta.svg" },
  { name: "Cohere", src: "/logos/cohere.svg" },
  { name: "AWS", src: "/logos/aws.svg" },
  { name: "NVIDIA", src: "/logos/nvidia.svg" },
  { name: "Databricks", src: "/logos/databricks.svg" },
  { name: "Snowflake", src: "/logos/snowflake.svg" },
];

export function LogoCarousel() {
  return (
    <div className="logo-carousel">
      <div className="logo-track">
        {logos.map((logo, i) => (
          <div key={`a-${i}`} className="logo-item" aria-label={logo.name}>
            <img src={logo.src} alt={logo.name} />
          </div>
        ))}
        {logos.map((logo, i) => (
          <div key={`b-${i}`} className="logo-item" aria-hidden="true">
            <img src={logo.src} alt="" />
          </div>
        ))}
      </div>
    </div>
  );
}
