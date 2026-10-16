/**
 * The address the site is served from, for metadata, the sitemap and social
 * previews. ninjapay.xyz isn't attached to the deployment yet, so absolute
 * links pointed there broke link previews.
 *
 * Set NEXT_PUBLIC_SITE_URL once a custom domain is attached. Until then this
 * uses the production address Vercel provides at build time, then localhost.
 */
export function siteUrl(env: Record<string, string | undefined> = process.env): string {
  const explicit = env.NEXT_PUBLIC_SITE_URL?.trim()
  if (explicit) return explicit.replace(/\/+$/, '')
  const vercel = env.VERCEL_PROJECT_PRODUCTION_URL?.trim()
  if (vercel) return `https://${vercel}`
  return 'http://localhost:3000'
}
