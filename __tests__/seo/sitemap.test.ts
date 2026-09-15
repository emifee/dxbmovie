/**
 * The sitemap is the only discovery path for two of this app's static pages.
 *
 * /reels is real content that nothing else links to, and /data-deletion is the
 * page Meta requires to be publicly reachable for app review (this app uses
 * Instagram webhooks). Both were absent from the sitemap and neither absence
 * was visible from anywhere in the app — WZ-0241.
 *
 * Two separate things are asserted, because either alone lets the bug back in:
 *   1. every static page that belongs in the sitemap is listed; and
 *   2. every URL is built from SITE_ORIGIN, not hardcoded. A literal
 *      "https://cinema.wazhop.com/..." would still pass (1) while quietly
 *      undoing the reason lib/brand.ts exists.
 *
 * The exclusions are asserted too. /profile is auth-gated and user-specific,
 * /admin is not for crawlers, and the dynamic routes need real IDs enumerated
 * from the database — listing any of them is a regression, not an improvement.
 */

import sitemap from '@/app/sitemap'
import { SITE_ORIGIN } from '@/lib/brand'

const EXPECTED_PATHS = ['/', '/reels', '/login', '/terms', '/privacy', '/data-deletion']

const MUST_NOT_APPEAR = ['/profile', '/admin', '/m/', '/r/', '/list/', '/card/']

describe('app/sitemap', () => {
  const entries = sitemap()
  const urls = entries.map((e) => e.url)
  const paths = urls.map((u) => new URL(u).pathname)

  it('lists exactly the static pages that belong in it', () => {
    expect([...paths].sort()).toEqual([...EXPECTED_PATHS].sort())
  })

  it('includes /reels, which nothing in the app links to', () => {
    expect(paths).toContain('/reels')
  })

  it('includes /data-deletion, which Meta requires to be publicly reachable', () => {
    expect(paths).toContain('/data-deletion')
  })

  it('builds every URL from SITE_ORIGIN rather than hardcoding the origin', () => {
    for (const url of urls) {
      expect(new URL(url).origin).toBe(new URL(SITE_ORIGIN).origin)
    }
  })

  it('omits auth-gated, admin and dynamic routes', () => {
    for (const excluded of MUST_NOT_APPEAR) {
      expect(paths.some((p) => p === excluded || p.startsWith(excluded))).toBe(false)
    }
  })

  it('gives every entry a lastModified and a priority', () => {
    for (const entry of entries) {
      expect(entry.lastModified).toBeInstanceOf(Date)
      expect(typeof entry.priority).toBe('number')
    }
  })
})
