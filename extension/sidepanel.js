const frame = document.getElementById('app');
const offline = document.getElementById('offline');
document.getElementById('app-url').textContent = APP_URL;

async function appReachable() {
  try {
    const res = await fetch(APP_URL + '/login', { method: 'GET', cache: 'no-store' });
    return res.ok || (res.status >= 300 && res.status < 400);
  } catch {
    return false;
  }
}

async function load() {
  const ok = await appReachable();
  offline.hidden = ok;
  frame.hidden = !ok;
  if (ok) frame.src = APP_URL + '/read/new';
}

document.getElementById('reload').addEventListener('click', load);
document.getElementById('open-window').addEventListener('click', () => {
  // The framed app is cross-origin, so reading its location throws; fall back to the root.
  let url = APP_URL;
  try {
    if (!frame.hidden && frame.contentWindow) url = frame.contentWindow.location.href;
  } catch {}
  chrome.runtime.sendMessage({ type: 'open-window', url });
});

load();
