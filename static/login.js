'use strict';
(() => {
  const form = document.getElementById('login-form');
  const pw = document.getElementById('password');
  const code = document.getElementById('code');
  const btn = document.getElementById('login-btn');
  const err = document.getElementById('login-error');
  let lockTimer = null;

  const showError = (msg) => { err.textContent = msg; err.hidden = !msg; };

  function lockFor(sec) {
    clearInterval(lockTimer);
    let left = sec;
    btn.disabled = true;
    const tick = () => {
      if (left <= 0) { clearInterval(lockTimer); btn.disabled = false; btn.textContent = 'เข้าสู่ระบบ'; showError(''); return; }
      btn.textContent = `รออีก ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
      left--;
    };
    tick();
    lockTimer = setInterval(tick, 1000);
  }

  code.addEventListener('input', () => {
    code.value = code.value.replace(/\D/g, '').slice(0, 6);
    if (code.value.length === 6 && pw.value) form.requestSubmit();
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (btn.disabled) return;
    if (!pw.value) { showError('กรุณาใส่รหัสผ่าน'); pw.focus(); return; }
    if (!/^\d{6}$/.test(code.value)) { showError('รหัส TOTP ต้องเป็นตัวเลข 6 หลัก'); code.focus(); return; }
    btn.disabled = true;
    btn.textContent = 'กำลังตรวจสอบ…';
    showError('');
    try {
      const r = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: pw.value, code: code.value }),
      });
      const d = await r.json().catch(() => ({}));
      if (r.ok) { location.replace('/'); return; }
      showError(d.error || 'เข้าสู่ระบบไม่สำเร็จ');
      code.value = '';
      if (r.status === 429 && d.retry_after) { lockFor(d.retry_after); return; }
      code.focus();
    } catch (_) {
      showError('ติดต่อเซิร์ฟเวอร์ไม่ได้');
    }
    btn.disabled = false;
    btn.textContent = 'เข้าสู่ระบบ';
  });

  fetch('/api/auth-status').then((r) => r.json()).then((d) => {
    if (d.logged_in || !d.auth_enabled) location.replace('/');
    else if (d.retry_after) lockFor(d.retry_after);
  }).catch(() => { });
})();
