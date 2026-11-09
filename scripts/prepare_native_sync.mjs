// Capacitor runs this official hook before copy/update, including the implicit
// sync inside `cap add ios`. Prepare the generated Podfile before its first pod
// install; doing this only after `cap add` is too late for an iOS 16 plugin.
if (process.env.CAPACITOR_PLATFORM_NAME === 'ios') {
  await import('./prepare_apple_native.mjs');
}
