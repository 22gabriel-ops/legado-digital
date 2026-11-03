import fs from 'node:fs';
const file='web/index.html';
let html=fs.readFileSync(file,'utf8');
const marker='window.LEGACY_APPLE_BILLING_READY = false;';
if(!html.includes(marker))throw Error('Billing gate missing');
html=html.replace(marker,'window.LEGACY_APPLE_BILLING_READY = true;');
fs.writeFileSync(file,html);
