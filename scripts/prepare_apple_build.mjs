import fs from 'node:fs';

const file = 'web/index.html';
let html = fs.readFileSync(file, 'utf8');
const disabledMarker = 'window.LEGACY_APPLE_BILLING_READY = false;';
const enabledMarker = 'window.LEGACY_APPLE_BILLING_READY = true;';

if (!html.includes(disabledMarker)) {
  if (html.includes(enabledMarker)) {
    console.log('Apple billing gate already enabled');
    process.exit(0);
  }
  throw Error('Billing gate missing');
}

html = html.replace(disabledMarker, enabledMarker);
fs.writeFileSync(file, html);
console.log('Apple billing gate enabled for the dedicated test build');
