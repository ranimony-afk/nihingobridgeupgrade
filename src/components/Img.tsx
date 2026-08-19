import NextImage from "next/image";

/**
 * Thin wrapper over next/image.
 *
 * The app previously used raw `<img>` everywhere, which meant full-size
 * originals were shipped to phones, no AVIF/WebP negotiation, and no reserved
 * space — so every image caused layout shift as it loaded.
 *
 * `fill` is used when the parent controls the box, otherwise explicit
 * width/height reserve the space before the bytes arrive.
 */
export function Img({
  src,
  alt,
  className,
  width,
  height,
  priority = false,
  sizes,
  fill = false,
}: {
  src: string;
  alt: string;
  className?: string;
  width?: number;
  height?: number;
  priority?: boolean;
  sizes?: string;
  fill?: boolean;
}) {
  if (fill) {
    return (
      <NextImage
        src={src}
        alt={alt}
        fill
        className={className}
        priority={priority}
        sizes={sizes ?? "(max-width: 768px) 100vw, 50vw"}
      />
    );
  }
  return (
    <NextImage
      src={src}
      alt={alt}
      width={width ?? 400}
      height={height ?? 300}
      className={className}
      priority={priority}
      sizes={sizes}
    />
  );
}
