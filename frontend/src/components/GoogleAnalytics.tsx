'use client';

import Script from 'next/script';

export default function GoogleAnalytics() {
  const tagId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID || 'GTM-PWWN6VJK';

  if (!tagId) return null;

  const isGTM = tagId.startsWith('GTM-');
  const scriptSrc = isGTM
    ? `https://www.googletagmanager.com/gtm.js?id=${tagId}`
    : `https://www.googletagmanager.com/gtag/js?id=${tagId}`;

  return (
    <>
      <Script
        strategy="afterInteractive"
        src={scriptSrc}
      />
      <Script
        id="google-analytics"
        strategy="afterInteractive"
        dangerouslySetInnerHTML={{
          __html: `
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            ${!isGTM ? `gtag('config', '${tagId}', { page_path: window.location.pathname });` : ''}
          `,
        }}
      />
    </>
  );
}

