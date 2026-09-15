import { MetadataRoute } from 'next'
import { SITE_ORIGIN, siteUrl } from '@/lib/brand'

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: SITE_ORIGIN,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 1,
    },
    {
      url: siteUrl('/reels'),
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.9,
    },
    {
      url: siteUrl('/login'),
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.8,
    },
    {
      url: siteUrl('/terms'),
      lastModified: new Date(),
      changeFrequency: 'yearly',
      priority: 0.5,
    },
    {
      url: siteUrl('/privacy'),
      lastModified: new Date(),
      changeFrequency: 'yearly',
      priority: 0.5,
    },
    // Meta requires a publicly reachable data-deletion page for app review, and
    // this app uses Instagram webhooks. Nothing in the app links to it, so a
    // crawler has no path to it other than the sitemap.
    {
      url: siteUrl('/data-deletion'),
      lastModified: new Date(),
      changeFrequency: 'yearly',
      priority: 0.3,
    },
  ]
}
