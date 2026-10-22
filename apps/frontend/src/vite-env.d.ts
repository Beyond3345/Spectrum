/// <reference types="vite/client" />

declare module '*?url' {
  const src: string;
  export default src;
}

/** Spectrum's version, from the root package.json (vite.config.ts) */
declare const __APP_VERSION__: string;
