import signatureLight from "@/assets/brand/moenotes-signature-light.svg?raw";
import signatureInk from "@/assets/brand/moenotes-signature.svg?raw";

interface BrandLogoProps {
  className?: string;
  light?: boolean;
}

/**
 * The signature travels in the markup as a data URI instead of a URL. `/assets/` answers `no-cache`, so the top app
 * bar's capsule stayed empty until the browser had revalidated the SVG on every page load; inline, the mark is in the
 * first frame and no request is made.
 *
 * The copies under src/assets/brand exist because Vite cannot import from public/; the public files stay the brand's
 * source of truth, and tests/brand-logo.test.tsx fails when the two drift apart.
 */
const inlineSignature = (svg: string): string => `data:image/svg+xml,${encodeURIComponent(svg.replace(/\r\n/g, "\n"))}`;
const INK = inlineSignature(signatureInk);
const STARLIGHT = inlineSignature(signatureLight);

/** The original vector signature; both assets are decorative under one accessible name. */
export default function BrandLogo({ className = "", light = false }: BrandLogoProps) {
  return (
    <span className={`mn-brand ${light ? "mn-brand-light" : ""} ${className}`} role="img" aria-label="Moenotes">
      <img className="mn-brand-ink" src={INK} width="780" height="300" alt="" aria-hidden="true" />
      <img className="mn-brand-starlight" src={STARLIGHT} width="780" height="300" alt="" aria-hidden="true" />
    </span>
  );
}
