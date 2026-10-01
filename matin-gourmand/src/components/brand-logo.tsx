import Image from "next/image";

type BrandLogoProps = {
  compact?: boolean;
};

export function BrandLogo({ compact = false }: BrandLogoProps) {
  return (
    <span className={`brand-logo${compact ? " brand-logo-compact" : ""}`} role="img" aria-label="Matin Gourmand">
      <Image src="/images/logo-matin-gourmand.png" alt="" fill sizes={compact ? "132px" : "180px"} priority={!compact} />
    </span>
  );
}