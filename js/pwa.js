// PWA: registra el service worker y asegura que el botón "INSTALAR APP" aparezca cuando el navegador permita instalar.
if ('serviceWorker' in navigator) addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
let puede = false;
const mostrar = () => { const b = document.getElementById('btnInstalar'); if (b && puede) b.removeAttribute('hidden'); };
addEventListener('beforeinstallprompt', () => { puede = true; mostrar(); });
addEventListener('appinstalled', () => { puede = false; document.getElementById('btnInstalar')?.setAttribute('hidden', ''); });
const app = document.getElementById('app');
if (app) new MutationObserver(mostrar).observe(app, {childList:true});
