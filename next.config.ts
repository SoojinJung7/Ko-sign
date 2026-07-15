import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The Korean fallback face in lib/fonts.ts is read from disk at request time,
  // so the tracer can't see it referenced. Ship it with the routes that
  // finalize a PDF: the signer's submit endpoint, and the owner's document page
  // (whose server action retries a finalize that failed).
  outputFileTracingIncludes: {
    "/api/sign/\\[token\\]/submit": ["./assets/fonts/**"],
    "/documents/\\[id\\]": ["./assets/fonts/**"],
  },
};

export default nextConfig;
