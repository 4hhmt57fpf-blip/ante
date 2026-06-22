const $ = id => document.getElementById(id);

// Prefill the Canvas URL from the active tab if it's a Canvas page.
chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
  try {
    const u = new URL(tabs[0].url);
    if (u.hostname.endsWith('instructure.com')) $('host').value = u.hostname;
  } catch (e) {}
});

$('sync').onclick = async () => {
  const host = $('host').value.trim().replace(/^https?:\/\//, '').replace(/\/+$/, '');
  const server = $('server').value.trim().replace(/\/+$/, '');
  const status = $('status');
  if (!host) { status.textContent = '⚠️ Enter your Canvas URL.'; return; }
  status.textContent = '⏳ Reading Canvas…';
  try {
    const base = `https://${host}/api/v1`;
    const opt = { credentials: 'include', headers: { 'Accept': 'application/json' } };

    const profile = await fetch(`${base}/users/self/profile`, opt).then(r => {
      if (r.status === 401 || r.status === 403) throw new Error('Not logged into Canvas in this browser — log in, then retry.');
      if (!r.ok) throw new Error('Canvas returned ' + r.status);
      return r.json();
    });
    const missing = await fetch(`${base}/users/self/missing_submissions?include[]=course&per_page=100`, opt)
      .then(r => r.ok ? r.json() : []).catch(() => []);
    const upcoming = await fetch(`${base}/users/self/upcoming_events?per_page=50`, opt)
      .then(r => r.ok ? r.json() : []).catch(() => []);

    const payload = {
      host,
      profile,
      missing: Array.isArray(missing) ? missing : [],
      upcoming: Array.isArray(upcoming) ? upcoming : [],
      syncedAt: Date.now()
    };

    const res = await fetch(`${server}/__canvas_data`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error('Could not reach the Ante server at ' + server);

    status.textContent = `✅ Synced as ${profile.name || 'you'} — ${payload.missing.length} missing assignment(s). Go back to Ante and tap "check".`;
  } catch (e) {
    status.textContent = '❌ ' + e.message;
  }
};
