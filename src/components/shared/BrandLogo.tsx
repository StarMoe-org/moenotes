interface BrandLogoProps {
  className?: string;
  light?: boolean;
}

/** The original vector signature; both assets are decorative under one accessible name. */
export default function BrandLogo({ className = "", light = false }: BrandLogoProps) {
  return (
    <span className={`mn-brand ${light ? "mn-brand-light" : ""} ${className}`} role="img" aria-label="Moenotes">
      <img className="mn-brand-ink" src="/assets/brand/moenotes-signature.svg" width="780" height="300" alt="" aria-hidden="true" />
      <img className="mn-brand-starlight" src="/assets/brand/moenotes-signature-light.svg" width="780" height="300" alt="" aria-hidden="true" />
    </span>
  );
}
