import { ScrollViewStyleReset } from 'expo-router/html';
import type { PropsWithChildren } from 'react';

/**
 * The HTML every web page is served inside (the chat, the legal pages and the business-owner side). It is server-rendered
 * only: nothing here runs in the app on a phone.
 *
 * It carries what a browser needs to offer "add to home screen", so a business owner can keep Nomi as an icon without
 * installing anything from a store: the manifest, the icons and a service worker that caches nothing (public/sw.js).
 * The owner pages replace the manifest with their own (public/business.webmanifest), so their icon opens /business.
 */
export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="mn">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no, viewport-fit=cover" />
        <meta name="theme-color" content="#164F43" />
        <link rel="manifest" href="/manifest.webmanifest" />
        <link rel="icon" href="/icon-192.png" />
        <link rel="apple-touch-icon" href="/icon-192.png" />
        {/* iOS has no manifest support: these are what make a home-screen Nomi open without Safari's bars. */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="Nomi" />
        {/* Keeps the body from scrolling twice on web (Expo Router's own reset). */}
        <ScrollViewStyleReset />
        {/*
          The owner pages are their own app: same site, different icon, and the icon opens /business rather than the chat.
          A browser reads the manifest as it parses the head, and Expo Router serves one HTML shell for every route, so the
          swap happens here, before that read, rather than from inside the page.
        */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{if(location.pathname.indexOf('/business')===0){var m=document.querySelector('link[rel=manifest]');if(m)m.href='/business.webmanifest';var t=document.querySelector('meta[name="apple-mobile-web-app-title"]');if(t)t.content='Nomi бизнес';}}catch(e){}})();
if('serviceWorker' in navigator){window.addEventListener('load',function(){navigator.serviceWorker.register('/sw.js').catch(function(){})})}`,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
