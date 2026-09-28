import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The chat app lives at the root; /chat was a duplicate of it. Temporary
  // (307) so browsers don't cache it if /chat ever becomes its own page.
  async redirects() {
    return [{ source: "/chat", destination: "/", permanent: false }];
  },
};

export default nextConfig;
