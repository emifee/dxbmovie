import { MetadataRoute } from 'next'
import { siteUrl } from '@/lib/brand'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/api/', '/card/'], // don't need Google indexing backend routes or user cards as heavily
    },
    sitemap: siteUrl('/sitemap.xml'),
  }
}
