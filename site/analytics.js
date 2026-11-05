// Cloudflare Web Analytics for playpile.net (4 November 2026).
// This is a public ingestion token, not an API key or dashboard credential.
// Reports: Cloudflare > Observability > Analytics > Web analytics > playpile.net.
// Report Visits and Page views separately; Visits are not unique people.
// Loaded by account.js on portal pages and mobile.js on standalone games.
// No profile names, scores, save codes or local-storage values are passed here.
(function () {
  'use strict';

  // Preview builds and embedded games must not inflate production traffic.
  if (location.hostname !== 'playpile.net' && location.hostname !== 'www.playpile.net') return;
  if (window.self !== window.top) return;
  if (document.querySelector('script[data-cf-beacon], script[src^="https://static.cloudflareinsights.com/beacon.min.js"]')) return;

  var beacon = document.createElement('script');
  beacon.type = 'module';
  beacon.src = 'https://static.cloudflareinsights.com/beacon.min.js';
  beacon.setAttribute('data-cf-beacon', JSON.stringify({
    token: '7b5cd74e226448058a279fb14d134bb3'
  }));
  document.head.appendChild(beacon);
}());
