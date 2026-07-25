/**
 * The running app's version, shown in the footer.
 *
 * It comes from the build (next.config.ts reads it out of package.json and
 * hands it over as an env var) rather than from a direct `import
 * packageJson from "../../package.json"`, which would pull the entire manifest
 * — dependency list and all — into whatever bundle imported it.
 *
 * "dev" is the fallback for a context that didn't go through the Next build,
 * such as a unit test importing this module directly.
 */
export const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? "dev";
