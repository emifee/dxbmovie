import { MetadataRoute } from 'next'
 
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/api/', '/card/'], // don't need Google indexing backend routes or user cards as heavily
    },
    sitemap: 'https://dxbmovie.online/sitemap.xml',
  }
}
