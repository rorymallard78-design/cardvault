// CardVault development-only pilot scanner connector.
// Pilot codes and backend URL are browser-local settings. No Anthropic key in client.
(() => {
  'use strict';
  const URL_KEY = 'cv_dev_pilot_api_url';
  const CODE_KEY = 'cv_dev_pilot_invite';
  const $ = id => document.getElementById(id);
  const read = key => (localStorage.getItem(key) || '').trim();
  function endpoint() {
    const url = read(URL_KEY).replace(/\/+$/, '');
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== 'https:' || !/^https:\/\/[-a-zA-Z0-9.]+(?::443)?$/.test(url)) return '';
      return url;
    } catch { return ''; }
  }
  function invitation() {
    const v = read(CODE_KEY).toUpperCase();
    return /^CV-[A-F0-9]{32}$/.test(v) ? v : '';
  }
  function enabled() { return !!(endpoint() && invitation()); }
  window.cvPilotEnabled = enabled;
  const previousScan = scanCardPhoto;
  scanCardPhoto = async function cardVaultPilotScan(image) {
    if (!enabled()) return previousScan(image);
    const response = await fetch(endpoint() + '/v1/scan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-CardVault-Invite': invitation() },
      body: JSON.stringify({ image })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.ok || !payload.card) {
      throw new Error(payload.error || 'AI scan unavailable');
    }
    showRemaining(payload.remaining, 50);
    return payload.card;
  };
  function showRemaining(remaining, total) {
    const el = $('cv-pilot-remaining');
    if (el) el.textContent = remaining + ' of ' + total + ' free scans remaining';
  }
  async function checkStatus() {
    const output = $('cv-pilot-status');
    if (!output) return;
    if (!enabled()) {
      output.textContent = 'Enter the secure backend URL and your invitation code.';
      return;
    }
    output.textContent = 'Checking allowance…';
    try {
      const response = await fetch(endpoint() + '/v1/status', {
        headers: { 'X-CardVault-Invite': invitation() }
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw Error(payload.error || 'Unable to check invitation');
      showRemaining(payload.remaining, payload.quota);
      output.textContent = 'Invitation accepted. AI scanning is enabled for this device.';
    } catch (e) {
      output.textContent = 'Connection failed: ' + e.message;
    }
  }
  function settings() {
    const target = $('page-settings');
    if (!target || $('cv-pilot-setup')) return;
    const box = document.createElement('section');
    box.id = 'cv-pilot-setup';
    box.style.cssText = 'margin:20px 0;padding:15px;border:1px solid var(--border2);border-radius:12px;background:var(--bg2)';
    box.innerHTML = `
      <div style="font-weight:700;font-size:16px;margin-bottom:5px">🧪 AI Pilot — 50 Free Scans</div>
      <p style="font-size:12px;color:var(--text2);margin-bottom:12px">Development preview. When the secure pilot service is deployed, paste its URL and your invite code. AI scanning uses the pilot service instead of a personal Anthropic key; other paid AI features still require your own key.</p>
      <label class="form-label" for="cv-pilot-url">Pilot API URL (administrator supplies this)</label>
      <input class="form-input" id="cv-pilot-url" type="url" placeholder="https://your-worker.your-subdomain.workers.dev" autocomplete="off">
      <label class="form-label" style="margin-top:12px" for="cv-pilot-code">Invitation code</label>
      <input class="form-input" id="cv-pilot-code" type="text" maxlength="35" placeholder="CV-..." autocapitalize="characters" autocomplete="off" spellcheck="false">
      <button id="cv-pilot-save" class="btn btn-primary" style="margin-top:12px">Save &amp; Check Allowance</button>
      <div id="cv-pilot-remaining" style="font-weight:700;margin-top:12px"></div>
      <div id="cv-pilot-status" style="font-size:12px;color:var(--text2);margin-top:5px"></div>
    `;
    target.appendChild(box);
    $('cv-pilot-url').value = read(URL_KEY);
    $('cv-pilot-code').value = read(CODE_KEY);
    $('cv-pilot-save').addEventListener('click', async () => {
      const url = $('cv-pilot-url').value.trim().replace(/\/+$/, '');
      const code = $('cv-pilot-code').value.trim().toUpperCase().replace(/\s+/g, '');
      if (!/^CV-[A-F0-9]{32}$/.test(code)) {
        $('cv-pilot-status').textContent = 'Enter a valid invitation code.';
        return;
      }
      try {
        const parsed = new URL(url);
        if (parsed.protocol !== 'https:' || !parsed.hostname) throw Error();
      } catch {
        $('cv-pilot-status').textContent = 'Enter a valid https:// backend address.';
        return;
      }
      localStorage.setItem(URL_KEY, url);
      localStorage.setItem(CODE_KEY, code);
      await checkStatus();
    });
    if (enabled()) checkStatus();
  }
  settings();
})();
