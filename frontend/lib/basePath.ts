export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || "";

export const withBase = (path: string) => `${BASE_PATH}${path.startsWith("/") ? path : `/${path}`}`;

export const DEFAULT_COVER = withBase("/default-cover.svg");

export const coverFallback = (event: React.SyntheticEvent<HTMLImageElement>) => {
  const image = event.currentTarget;
  if (image.dataset.fallback) return;
  image.dataset.fallback = "1";
  image.src = DEFAULT_COVER;
};
