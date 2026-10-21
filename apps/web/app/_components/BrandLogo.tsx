import Image from 'next/image'

/** The single source of truth for VivahSync branding across every surface. */
export default function BrandLogo({ className = '' }: { className?: string }) {
  return (
    <Image
      src="/logo.jpg"
      alt="VivahSync"
      width={1584}
      height={1417}
      sizes="(max-width: 640px) 52px, (max-width: 900px) 64px, 96px"
      className={`brand-logo ${className}`.trim()}
      priority
    />
  )
}
