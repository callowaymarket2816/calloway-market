// Type declarations for static asset imports (e.g. `import logo from
// "./assets/calloway-logo.png"`). Vite's bundler handles these imports
// correctly at build time regardless, but this declaration keeps
// TypeScript's own checker (tsc --noEmit, our `lint` script) from
// reporting an error on the import.
declare module "*.png" {
  const src: string;
  export default src;
}
declare module "*.jpg" {
  const src: string;
  export default src;
}
declare module "*.jpeg" {
  const src: string;
  export default src;
}
declare module "*.svg" {
  const src: string;
  export default src;
}
