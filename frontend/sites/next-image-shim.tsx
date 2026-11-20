import * as React from "react";

type ImageProps = React.ImgHTMLAttributes<HTMLImageElement> & {
  fill?: boolean;
  priority?: boolean;
  sizes?: string;
  loader?: unknown;
  unoptimized?: boolean;
};

export default function Image({ fill, priority, sizes, loader, unoptimized, style, ...props }: ImageProps) {
  return (
    <img
      {...props}
      loading={priority ? "eager" : props.loading}
      style={fill ? { position: "absolute", inset: 0, width: "100%", height: "100%", ...style } : style}
    />
  );
}
