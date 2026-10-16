import type { MetadataRoute } from 'next'
import { siteUrl } from '@/lib/site'

// Only the landing page is public content. The app pages need a wallet, and
// claim links and receipts are personal, so crawlers are kept out of them.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: '*', allow: '/', disallow: ['/api/', '/claim/', '/receipt/'] }],
    sitemap: `${siteUrl()}/sitemap.xml`,
  }
}
