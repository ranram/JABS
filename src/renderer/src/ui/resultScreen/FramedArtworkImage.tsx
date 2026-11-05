import type { MediaTransform } from '@shared/mediaPlacement';
import { CatalogImage } from '../CatalogImage';
import { mediaTransformCss } from '../mediaTransformCss';

export function FramedArtworkImage({
  src,
  fallbackSrc,
  className,
  entrance,
  transform
}: {
  src: string;
  fallbackSrc?: string;
  className: string;
  entrance?: string;
  transform?: MediaTransform;
}) {
  const shadow = className.includes('victory-shadow') ? 'translate(-32px, 12px) ' : '';
  return (
    <CatalogImage
      src={src}
      fallbackSrc={fallbackSrc}
      className={className}
      entrance={entrance}
      style={
        transform ? { transform: shadow + mediaTransformCss(transform, transform.flipped, 1, 'overlay') } : undefined
      }
    />
  );
}
