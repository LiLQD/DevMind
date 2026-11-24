const apiOrigin = process.env.VERCEL_API_ORIGIN;

function parseApiOrigin(value: string) {
  const url = new URL(value);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw new Error("VERCEL_API_ORIGIN must be a bare HTTPS origin.");
  }
  return url.origin;
}

export const config = apiOrigin
  ? {
      rewrites: [
        {
          source: "/api/:path*",
          destination: `${parseApiOrigin(apiOrigin)}/api/:path*`,
        },
      ],
      headers: [
        {
          source: "/api/:path*",
          headers: [{ key: "x-vercel-enable-rewrite-caching", value: "0" }],
        },
      ],
    }
  : {};
