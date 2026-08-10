import Image from "next/image";

export function BrandLogo({ compact = false, className = "" }: { compact?: boolean; className?: string }) {
  return (
    <div className={`brand-logo-wrap ${compact ? "brand-logo-compact" : ""} ${className}`}>
      <Image
        src="/greenbridge-logo.png"
        alt="GreenBridge"
        width={209}
        height={80}
        priority
        className="brand-logo-image"
      />
    </div>
  );
}
