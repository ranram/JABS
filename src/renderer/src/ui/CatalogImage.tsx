import type { CSSProperties } from 'react';
import { useImageFallback } from './useImageFallback';
import './playerPhoto.css';

export function CatalogImage({
  src,
  className,
  entrance,
  fallbackSrc,
  style
}: {
  src: string;
  className?: string;
  entrance?: string;
  fallbackSrc?: string;
  style?: CSSProperties;
}) {
  const image = useImageFallback(src, fallbackSrc);
  return (
    <img
      className={[className, 'is-loaded', image.placeholder && 'is-placeholder'].filter(Boolean).join(' ')}
      src={image.src}
      style={style}
      data-entrance={entrance}
      alt=""
      aria-hidden="true"
      onLoad={image.onLoad}
      onError={image.onError}
    />
  );
}
