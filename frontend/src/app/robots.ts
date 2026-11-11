import { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://bingesensei.app';

  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/', '/privacy', '/terms'],
        disallow: [
          '/dashboard',
          '/dashboard/*',
          '/profile',
          '/profile/*',
          '/welcome',
          '/welcome/*',
          '/search',
          '/search/*',
          '/reset-password',
          '/reset-password/*',
          '/forgot-password',
          '/forgot-password/*',
          '/login/callback',
          '/login/callback/*',
          '/api/',
          '/api/*',
        ],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
