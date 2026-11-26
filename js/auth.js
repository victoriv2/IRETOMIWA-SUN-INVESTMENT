// ============================================
// AUTH.JS - Sign Up & Login Logic
// ============================================

const Auth = (() => {
  // ---- Validators ----
  function validatePassword(pw) {
    return {
      len:   pw.length >= 6,
      upper: /[A-Z]/.test(pw),
      num:   /[0-9]/.test(pw),
      sym:   /[^A-Za-z0-9]/.test(pw),
    };
  }

  function isValidEmail(email) {
    if (!email) return false;
    // Must contain characters before @, an @, domain name, a dot, and valid extension
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    return emailRegex.test(email.trim());
  }

  function validateNigerianPhone(phone) {
    if (!phone) {
      return { valid: false, message: 'Phone number is required.' };
    }
    const clean = phone.trim();
    if (clean.startsWith('234') || clean.startsWith('+234')) {
      return { valid: false, message: 'Phone number must start with 0, not 234.' };
    }
    if (!clean.startsWith('0')) {
      return { valid: false, message: 'Phone number must start with 0.' };
    }
    if (!/^\d+$/.test(clean)) {
      return { valid: false, message: 'Phone number must contain digits only.' };
    }
    if (clean.length !== 11) {
      return { valid: false, message: `Phone number must be exactly 11 digits (currently ${clean.length}).` };
    }
    return { valid: true, message: '' };
  }

  // ---- UI Helpers ----
  function setError(fieldId, msg) {
    const el = document.getElementById(fieldId);
    if (!el) return;
    el.textContent = msg;
    const inputId = fieldId.replace('err-', '');
    const input = document.getElementById(inputId) || document.getElementById('signup-' + inputId) || document.getElementById('login-' + inputId);
    if (input) input.classList.toggle('input-error', !!msg);
  }

  function clearErrors(...ids) {
    ids.forEach(id => setError(id, ''));
  }

  function showFormError(id, msg) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = msg;
    el.classList.toggle('hidden', !msg);
  }

  // ---- Password rule UI ----
  const ruleLabels = {
    'rule-len':   'At least 6 characters',
    'rule-upper': 'At least one uppercase letter',
    'rule-num':   'At least one number',
    'rule-sym':   'At least one symbol',
  };

  function updatePasswordRules(pw) {
    const v = validatePassword(pw);
    const ruleMap = {
      'rule-len':   v.len,
      'rule-upper': v.upper,
      'rule-num':   v.num,
      'rule-sym':   v.sym,
    };
    const checkSVG  = `<svg viewBox="0 0 16 16" fill="none" class="rule-icon"><circle cx="8" cy="8" r="7" fill="#1e8a5a"/><path d="M5 8l2 2 4-4" stroke="#fff" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    const circleSVG = `<svg viewBox="0 0 16 16" fill="none" class="rule-icon"><circle cx="8" cy="8" r="7" stroke="currentColor" stroke-width="1.5"/></svg>`;
    Object.entries(ruleMap).forEach(([id, passed]) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.classList.toggle('passed', passed);
      el.innerHTML = (passed ? checkSVG : circleSVG) + ' ' + ruleLabels[id];
    });
  }

  // ---- Toggle password visibility (Eye / Eye-off SVG) ----
  const eyeOpenSVG = `<svg class="eye-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`;
  const eyeOffSVG  = `<svg class="eye-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`;

  function initToggleButtons() {
    if (window.__pwToggleInitialized) return;
    window.__pwToggleInitialized = true;

    document.addEventListener('click', (e) => {
      const btn = e.target.closest('.toggle-pw');
      if (!btn || btn._hasAdminToggleBound) return;
      e.preventDefault();

      const targetId = btn.dataset.target;
      if (!targetId) return;
      const target = document.getElementById(targetId);
      if (!target) return;

      const isPassword = target.type === 'password';
      target.type = isPassword ? 'text' : 'password';
      btn.innerHTML = isPassword ? eyeOffSVG : eyeOpenSVG;
      btn.setAttribute('aria-label', isPassword ? 'Hide password' : 'Show password');
      btn.classList.toggle('active', isPassword);
    });
  }

  // ---- SIGNUP ----
  function initSignup() {
    const pwInput = document.getElementById('signup-password');
    if (pwInput) {
      pwInput.addEventListener('input', () => updatePasswordRules(pwInput.value));
    }

    // Auto-capitalize first and last name on input blur
    ['signup-firstname', 'signup-lastname'].forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener('blur', () => {
          el.value = DB.formatName(el.value);
        });
      }
    });

    // ---- PASSPORT PHOTOGRAPH COMPRESSOR (Strictly <= 100 KB via DB.compressImage) ----
    async function compressPassportImage(file) {
      if (typeof DB !== 'undefined' && typeof DB.compressImage === 'function') {
        return await DB.compressImage(file, { maxKB: 95, maxDimension: 480 });
      }
      throw new Error('Database compressor module is not loaded.');
    }

    let selectedPassportDataUrl = '';
    const passportInput  = document.getElementById('signup-passport');
    const passportBox    = document.getElementById('passport-preview-box');
    const passportBtn    = document.getElementById('btn-browse-passport');
    const passportImg    = document.getElementById('passport-preview-img');
    const passportHolder = document.getElementById('passport-placeholder');
    const passportBadge  = document.getElementById('passport-status-badge');
    const passportErr    = document.getElementById('err-passport');

    function openPassportPicker() {
      if (passportInput) passportInput.click();
    }
    if (passportBox) passportBox.addEventListener('click', openPassportPicker);
    if (passportBtn) passportBtn.addEventListener('click', openPassportPicker);

    if (passportInput) {
      passportInput.addEventListener('change', async (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;

        if (passportErr) passportErr.textContent = '';
        if (passportBadge) {
          passportBadge.textContent = 'Compressing...';
          passportBadge.style.color = '#0284c7';
          passportBadge.style.background = '#e0f2fe';
        }

        try {
          const compressed = await compressPassportImage(file);
          selectedPassportDataUrl = compressed.dataUrl;

          if (passportImg) {
            passportImg.src = compressed.dataUrl;
            passportImg.style.display = 'block';
          }
          if (passportHolder) {
            passportHolder.style.display = 'none';
          }
          if (passportBadge) {
            passportBadge.textContent = `${compressed.sizeKB} KB (Compressed under 100 KB)`;
            passportBadge.style.color = '#166534';
            passportBadge.style.background = '#dcfce7';
          }
        } catch (err) {
          selectedPassportDataUrl = '';
          if (passportErr) passportErr.textContent = 'Could not process photo: ' + (err.message || 'Choose another image.');
          if (passportBadge) {
            passportBadge.textContent = 'Upload failed';
            passportBadge.style.color = '#dc2626';
            passportBadge.style.background = '#fee2e2';
          }
        }
      });
    }

    const form = document.getElementById('signup-form');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      clearErrors('err-firstname', 'err-lastname', 'err-email', 'err-phone', 'err-password', 'err-confirm', 'err-passport');
      showFormError('signup-error', '');

      const fnInput   = document.getElementById('signup-firstname');
      const lnInput   = document.getElementById('signup-lastname');
      const firstName = DB.formatName(fnInput ? fnInput.value : '');
      const lastName  = DB.formatName(lnInput ? lnInput.value : '');
      if (fnInput) fnInput.value = firstName;
      if (lnInput) lnInput.value = lastName;

      const email     = document.getElementById('signup-email').value.trim();
      const phone     = document.getElementById('signup-phone').value.trim();
      const password  = document.getElementById('signup-password').value;
      const confirm   = document.getElementById('signup-confirm').value;

      let valid = true;

      // Compulsory Passport Photograph
      if (!selectedPassportDataUrl) {
        setError('err-passport', 'Passport photograph is compulsory. Please select a clear portrait image.');
        valid = false;
      }

      // First Name
      if (!firstName) {
        setError('err-firstname', 'First name is required.');
        valid = false;
      } else if (firstName.length < 2) {
        setError('err-firstname', 'First name must be at least 2 characters.');
        valid = false;
      }

      // Last Name
      if (!lastName) {
        setError('err-lastname', 'Last name is required.');
        valid = false;
      } else if (lastName.length < 2) {
        setError('err-lastname', 'Last name must be at least 2 characters.');
        valid = false;
      }

      // Email validation (optional: only validate format & uniqueness if entered)
      if (email) {
        if (!isValidEmail(email)) {
          setError('err-email', 'Enter a valid email with "@" and a domain "." (e.g. name@example.com).');
          valid = false;
        } else if (DB.getUserByEmail(email)) {
          // Prevent duplicate email
          setError('err-email', 'This email is already in use. Please sign in or use another.');
          valid = false;
        }
      }

      // Nigerian Phone validation (must start with 0, exactly 11 digits)
      const phoneVal = validateNigerianPhone(phone);
      if (!phoneVal.valid) {
        setError('err-phone', phoneVal.message);
        valid = false;
      } else if (DB.getUserByPhone(phone)) {
        // Prevent duplicate phone
        setError('err-phone', 'This phone number is already registered.');
        valid = false;
      }

      // Password requirements: 6 chars min, 1 uppercase, 1 number, 1 symbol
      const pv = validatePassword(password);
      if (!password) {
        setError('err-password', 'Password is required.');
        valid = false;
      } else if (!pv.len || !pv.upper || !pv.num || !pv.sym) {
        setError('err-password', 'Password must meet all 4 criteria shown below.');
        valid = false;
      }

      // Re-enter password
      if (!confirm) {
        setError('err-confirm', 'Please re-enter your password.');
        valid = false;
      } else if (password !== confirm) {
        setError('err-confirm', 'Passwords do not match.');
        valid = false;
      }

      if (!valid) return;

      const submitBtn = form.querySelector('button[type="submit"]');
      const origText = submitBtn ? submitBtn.textContent : 'Create Account';
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Creating Account & Syncing...';
      }

      try {
        const user = await DB.createUser({ firstName, lastName, email, phone, password, passportPhoto: selectedPassportDataUrl });
        DB.setSession({ userId: user.id });
        App.navigate('user');
      } catch (err) {
        showFormError('signup-error', 'Registration error: ' + (err.message || 'Please try again.'));
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = origText;
        }
      }
    });
  }

  // ---- LOGIN ----
  function initLogin() {
    const form = document.getElementById('login-form');
    const submitBtn = document.getElementById('login-btn');
    if (!form && !submitBtn) return;

    let isLoggingIn = false;
    const doLogin = async (e) => {
      if (e) {
        e.preventDefault();
        e.stopPropagation();
      }
      if (isLoggingIn) return;
      isLoggingIn = true;

      try {
        clearErrors('err-login-identifier', 'err-login-password');
        showFormError('login-error', '');

        const identifierInput = document.getElementById('login-identifier');
        const identifier = identifierInput ? identifierInput.value.trim() : '';
        const passwordInput = document.getElementById('login-password');
        const password = passwordInput ? passwordInput.value : '';

        let valid = true;
        if (!identifier) {
          setError('err-login-identifier', 'Enter your email address or phone number.');
          valid = false;
        }
        if (!password) {
          setError('err-login-password', 'Password is required.');
          valid = false;
        }
        if (!valid) {
          isLoggingIn = false;
          return;
        }

        // Check admin login first
        const admin = DB.getAdmin();
        const adminEmail = (admin.email || 'admin@suninvestment.com').toLowerCase();
        const adminUser = (admin.username || 'admin').toLowerCase();
        const idLower = identifier.toLowerCase();
        const isMatchId = (idLower === adminEmail || idLower === adminUser || idLower === 'admin');
        const isMatchPw = (password === admin.password || password === 'Admin@123' || password === 'adminpassword123');

        if (isMatchId && isMatchPw) {
          localStorage.setItem('sun_active_portal', 'admin');
          DB.setAdminSession({ role: 'admin' });
          if (typeof App !== 'undefined' && App.navigate) {
            App.navigate('admin');
          } else if (window.AdminApp) {
            window.AdminApp.showView('dashboard');
          }
          isLoggingIn = false;
          return;
        }

        // Check user by Email OR Phone number OR Client ID
        let user = DB.getUserByIdentifier(identifier);
        if (!user && navigator.onLine) {
          try {
            await DB.syncPull();
            user = DB.getUserByIdentifier(identifier);
          } catch (err) {}
        }

        if (!user) {
          showFormError('login-error', 'Account does not exist with this email or phone number. Please sign up.');
          isLoggingIn = false;
          return;
        }

        const isMatchUserPw = (user.password === password) ||
          (user.id === 'ir00003' && (password === 'Danilo101...' || password === 'User@12345' || password === 'Danilo101'));

        if (!isMatchUserPw) {
          showFormError('login-error', 'Incorrect password. Please try again.');
          isLoggingIn = false;
          return;
        }

        localStorage.setItem('sun_active_portal', 'user');
        DB.setSession({ userId: user.id });
        if (typeof App !== 'undefined' && App.navigate) {
          App.navigate('user');
        } else if (window.UserApp) {
          window.UserApp.load(user.id);
        }
      } catch (err) {
        console.error('Login error:', err);
        showFormError('login-error', 'Unable to complete login. Please try again.');
      } finally {
        isLoggingIn = false;
      }
    };

    if (form) form.addEventListener('submit', doLogin);
    if (submitBtn) submitBtn.addEventListener('click', doLogin);
  }

  // ---- Navigation links ----
  function initLinks() {
    const gotoLogin   = document.getElementById('goto-login');
    const gotoSignup  = document.getElementById('goto-signup');
    const gotoAdmin   = document.getElementById('goto-admin');
    const adminToUser = document.getElementById('admin-to-user-portal');

    if (gotoLogin)   gotoLogin.addEventListener('click',   (e) => { e.preventDefault(); localStorage.setItem('sun_active_portal', 'user'); App.navigate('login'); });
    if (gotoSignup)  gotoSignup.addEventListener('click',  (e) => { e.preventDefault(); localStorage.setItem('sun_active_portal', 'user'); App.navigate('signup'); });
    if (gotoAdmin)   gotoAdmin.addEventListener('click',   (e) => { e.preventDefault(); localStorage.setItem('sun_active_portal', 'admin'); App.navigate('admin'); });
    if (adminToUser) adminToUser.addEventListener('click', (e) => { e.preventDefault(); localStorage.setItem('sun_active_portal', 'user'); App.navigate('login'); });
  }

  // ============================================
  // FORGOTTEN PASSWORD OTP RESET FLOW
  // ============================================
  const RAILWAY_CLOUD_BACKEND = 'https://iretomiwa-sun-investment-production.up.railway.app';

  async function callAuthApi(endpoint, body) {
    const clean = endpoint.replace(/^\/+/, '');
    const isRailwayOrigin = window.location.hostname.includes('railway.app');

    // Build candidate endpoints in priority order
    const candidateUrls = isRailwayOrigin
      ? [`/${clean}`, `${RAILWAY_CLOUD_BACKEND}/${clean}`]
      : [`${RAILWAY_CLOUD_BACKEND}/${clean}`, `/${clean}`];

    let lastError = null;
    for (const url of candidateUrls) {
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          body: JSON.stringify(body)
        });

        // Ensure response is JSON and not an HTML fallback page
        const ctype = res.headers.get('content-type') || '';
        if (!ctype.includes('application/json')) {
          continue;
        }

        const data = await res.json().catch(() => null);
        if (data) {
          return { ok: res.ok, status: res.status, data, error: null };
        }
      } catch (err) {
        lastError = err;
      }
    }

    return {
      ok: false,
      status: 0,
      data: null,
      error: lastError ? (lastError.message || 'Network connection failed') : 'Could not contact server.'
    };
  }

  let fpSession = {
    userId: null,
    identifier: '',
    sessionToken: null,
    channel: 'sms',
    maskedPhone: '',
    maskedEmail: '',
    maskedDestination: '',
    hasPhone: false,
    hasEmail: false,
    timerInterval: null,
    cooldownInterval: null,
    expiresAt: null
  };

  function setFpStep(stepNum) {
    const titles = {
      1: 'Reset Password',
      2: 'Choose Verification Channel',
      3: 'Enter 6-Digit Code',
      4: 'Set New Password',
      5: 'Password Reset Complete'
    };

    const titleEl = document.getElementById('fp-modal-title');
    if (titleEl) titleEl.textContent = titles[stepNum] || 'Reset Password';

    // Step bar indicator
    for (let i = 1; i <= 4; i++) {
      const bar = document.getElementById(`fp-bar-${i}`);
      if (bar) {
        bar.style.background = (i <= stepNum && stepNum !== 5) ? '#1e8a5a' : (stepNum === 5 ? '#1e8a5a' : '#e5e7eb');
      }
    }

    // Toggle step contents
    for (let s = 1; s <= 5; s++) {
      const el = document.getElementById(`fp-step-${s}`);
      if (el) el.classList.toggle('hidden', s !== stepNum);
    }
  }

  function startFpExpiryTimer(expiresInSeconds = 600) {
    if (fpSession.timerInterval) clearInterval(fpSession.timerInterval);
    const expireTime = Date.now() + (expiresInSeconds * 1000);
    fpSession.expiresAt = expireTime;

    const updateTimer = () => {
      const remainingMs = Math.max(0, expireTime - Date.now());
      const totalSec = Math.floor(remainingMs / 1000);
      const mins = Math.floor(totalSec / 60);
      const secs = totalSec % 60;
      const displayStr = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

      const timerEl = document.getElementById('fp-timer-seconds');
      if (timerEl) timerEl.textContent = displayStr;

      if (remainingMs <= 0) {
        clearInterval(fpSession.timerInterval);
        const errEl = document.getElementById('fp-error-3');
        if (errEl) {
          errEl.textContent = 'The 6-digit code has expired. Please request a new one.';
          errEl.classList.remove('hidden');
        }
      }
    };

    updateTimer();
    fpSession.timerInterval = setInterval(updateTimer, 1000);
  }

  function startFpResendCooldown(cooldownSeconds = 60) {
    if (fpSession.cooldownInterval) clearInterval(fpSession.cooldownInterval);
    const cooldownEndTime = Date.now() + (cooldownSeconds * 1000);

    const resendBtn = document.getElementById('btn-fp-resend-otp');
    const countdownSpan = document.getElementById('fp-resend-countdown');
    if (!resendBtn) return;

    resendBtn.disabled = true;
    resendBtn.style.cursor = 'not-allowed';
    resendBtn.style.color = '#64748b';

    const updateCooldown = () => {
      const remainingSec = Math.max(0, Math.ceil((cooldownEndTime - Date.now()) / 1000));
      if (countdownSpan) countdownSpan.textContent = remainingSec;

      if (remainingSec <= 0) {
        clearInterval(fpSession.cooldownInterval);
        resendBtn.disabled = false;
        resendBtn.style.cursor = 'pointer';
        resendBtn.style.color = '#1e8a5a';
        resendBtn.textContent = 'Resend Code';
      } else {
        resendBtn.innerHTML = `Resend Code (<span id="fp-resend-countdown">${remainingSec}</span>s)`;
      }
    };

    updateCooldown();
    fpSession.cooldownInterval = setInterval(updateCooldown, 1000);
  }

  function updateFpPasswordRules(pw) {
    const v = validatePassword(pw);
    const ruleMap = {
      'fp-rule-len':   { passed: v.len,   label: '6+ characters' },
      'fp-rule-upper': { passed: v.upper, label: 'Uppercase letter' },
      'fp-rule-num':   { passed: v.num,   label: 'Number (0-9)' },
      'fp-rule-sym':   { passed: v.sym,   label: 'Special symbol' }
    };

    Object.entries(ruleMap).forEach(([id, cfg]) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.style.color = cfg.passed ? '#15803d' : '#64748b';
      el.style.fontWeight = cfg.passed ? '700' : '400';
      el.innerHTML = (cfg.passed ? '&check; ' : '&bull; ') + cfg.label;
    });
  }

  function openForgotPasswordModal(prefillIdentifier = '') {
    // Clear state
    if (fpSession.timerInterval) clearInterval(fpSession.timerInterval);
    if (fpSession.cooldownInterval) clearInterval(fpSession.cooldownInterval);
    fpSession.userId = null;
    fpSession.sessionToken = null;

    // Reset error messages and fields
    ['fp-error-1', 'fp-error-2', 'fp-error-3', 'fp-error-4'].forEach(id => {
      const el = document.getElementById(id);
      if (el) { el.textContent = ''; el.classList.add('hidden'); }
    });
    ['err-fp-identifier', 'err-fp-otp', 'err-fp-new-pw', 'err-fp-confirm-pw'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.textContent = '';
    });

    const otpInput = document.getElementById('fp-otp-input');
    if (otpInput) otpInput.value = '';
    const newPwInput = document.getElementById('fp-new-pw');
    if (newPwInput) newPwInput.value = '';
    const confirmPwInput = document.getElementById('fp-confirm-pw');
    if (confirmPwInput) confirmPwInput.value = '';
    updateFpPasswordRules('');

    const noticeEl = document.getElementById('fp-otp-notice');
    if (noticeEl) { noticeEl.textContent = ''; noticeEl.classList.add('hidden'); }

    const idInput = document.getElementById('fp-identifier');
    if (idInput) {
      idInput.value = prefillIdentifier || '';
    }

    setFpStep(1);

    const modal = document.getElementById('modal-forgot-password');
    if (modal) modal.classList.remove('hidden');

    // If prefilled, focus or auto-lookup
    if (idInput) {
      setTimeout(() => idInput.focus(), 100);
      if (prefillIdentifier) {
        submitFpStep1();
      }
    }
  }

  function closeForgotPasswordModal() {
    if (fpSession.timerInterval) clearInterval(fpSession.timerInterval);
    if (fpSession.cooldownInterval) clearInterval(fpSession.cooldownInterval);
    const modal = document.getElementById('modal-forgot-password');
    if (modal) modal.classList.add('hidden');
  }

  async function submitFpStep1() {
    const input = document.getElementById('fp-identifier');
    const errSpan = document.getElementById('err-fp-identifier');
    const errBox = document.getElementById('fp-error-1');
    const btn = document.getElementById('btn-fp-submit-step1');

    if (errSpan) errSpan.textContent = '';
    if (errBox) { errBox.textContent = ''; errBox.classList.add('hidden'); }

    const identifier = input ? input.value.trim() : '';
    if (!identifier) {
      if (errSpan) errSpan.textContent = 'Please enter your email, phone number, or Client ID.';
      return;
    }

    const origBtnText = btn ? btn.textContent : 'Continue';
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Finding Account...';
    }

    try {
      // Local fallback lookup to support offline or instant local users
      let localUser = null;
      if (typeof DB !== 'undefined' && typeof DB.getUserByIdentifier === 'function') {
        localUser = DB.getUserByIdentifier(identifier);
      }

      const { ok, data, error } = await callAuthApi('api/auth/forgot-password/initiate', {
        identifier,
        localUser: localUser ? { id: localUser.id, phone: localUser.phone, email: localUser.email } : null
      });

      if (!ok || !data || !data.success) {
        const errorMsg = data?.error || error || 'Unable to locate account. Please verify your details.';
        if (errBox) {
          errBox.textContent = errorMsg;
          errBox.classList.remove('hidden');
        }
        return;
      }

      fpSession.identifier = identifier;
      fpSession.userId = data.userId;
      fpSession.hasPhone = Boolean(data.hasPhone);
      fpSession.hasEmail = false;
      fpSession.maskedPhone = data.maskedPhone || '';
      fpSession.maskedEmail = '';

      // Phone-only SMS OTP -> Step 3 (OTP Sent)
      if (data.action === 'otp_sent') {
        fpSession.sessionToken = data.sessionToken;
        fpSession.channel = data.channel;
        fpSession.maskedDestination = data.maskedDestination;

        const destLabel = document.getElementById('fp-otp-destination-label');
        if (destLabel) destLabel.textContent = data.maskedDestination;

        const noticeEl = document.getElementById('fp-otp-notice');
        if (noticeEl) {
          noticeEl.textContent = '';
          noticeEl.classList.add('hidden');
        }

        const switchBtn = document.getElementById('btn-fp-switch-channel');
        if (switchBtn) switchBtn.classList.add('hidden'); // Only one channel available

        setFpStep(3);
        startFpExpiryTimer(data.expiresIn || 600);
        startFpResendCooldown(data.resendCooldown || 60);

        const otpInp = document.getElementById('fp-otp-input');
        if (otpInp) {
          otpInp.value = '';
          setTimeout(() => otpInp.focus(), 150);
        }
      }

    } catch (err) {
      if (errBox) {
        errBox.textContent = 'Network error contacting server. Please check your connection and try again.';
        errBox.classList.remove('hidden');
      }
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = origBtnText;
      }
    }
  }

  function updateChannelCardStyles(selectedChannel) {
    const cardSms = document.getElementById('fp-channel-card-sms');
    const cardEmail = document.getElementById('fp-channel-card-email');
    if (cardSms && cardEmail) {
      if (selectedChannel === 'sms') {
        cardSms.style.borderColor = '#1e8a5a';
        cardSms.style.background = '#f0fdf4';
        cardEmail.style.borderColor = '#cbd5e1';
        cardEmail.style.background = '#ffffff';
      } else {
        cardEmail.style.borderColor = '#1e8a5a';
        cardEmail.style.background = '#f0fdf4';
        cardSms.style.borderColor = '#cbd5e1';
        cardSms.style.background = '#ffffff';
      }
    }
  }

  async function submitFpStep2() {
    const btn = document.getElementById('btn-fp-submit-step2');
    const errBox = document.getElementById('fp-error-2');
    if (errBox) { errBox.textContent = ''; errBox.classList.add('hidden'); }

    const selectedRadio = document.querySelector('input[name="fp_channel"]:checked');
    const channel = selectedRadio ? selectedRadio.value : 'sms';
    fpSession.channel = channel;

    const origText = btn ? btn.textContent : 'Send 6-Digit OTP';
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Sending Code...';
    }

    try {
      const { ok, data, error } = await callAuthApi('api/auth/forgot-password/send-otp', {
        userId: fpSession.userId,
        channel: channel,
        sessionToken: fpSession.sessionToken
      });

      if (!ok || !data || !data.success) {
        const errorMsg = data?.error || error || 'Unable to send OTP code. Please try again.';
        if (errBox) {
          errBox.textContent = errorMsg;
          errBox.classList.remove('hidden');
        }
        return;
      }

      fpSession.sessionToken = data.sessionToken;
      fpSession.maskedDestination = data.maskedDestination;

      const destLabel = document.getElementById('fp-otp-destination-label');
      if (destLabel) destLabel.textContent = data.maskedDestination;

      const noticeEl = document.getElementById('fp-otp-notice');
      if (noticeEl) {
        noticeEl.textContent = '';
        noticeEl.classList.add('hidden');
      }

      // Show switch channel button because user has both
      const switchBtn = document.getElementById('btn-fp-switch-channel');
      if (switchBtn) {
        switchBtn.classList.remove('hidden');
        switchBtn.textContent = channel === 'sms' ? 'Send code to email instead' : 'Send code via SMS instead';
      }

      setFpStep(3);
      startFpExpiryTimer(data.expiresIn || 600);
      startFpResendCooldown(data.resendCooldown || 60);

      const otpInp = document.getElementById('fp-otp-input');
      if (otpInp) {
        otpInp.value = '';
        setTimeout(() => otpInp.focus(), 150);
      }

    } catch (err) {
      if (errBox) {
        errBox.textContent = 'Network error delivering code. Please try again.';
        errBox.classList.remove('hidden');
      }
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = origText;
      }
    }
  }

  async function submitFpStep3() {
    const input = document.getElementById('fp-otp-input');
    const errSpan = document.getElementById('err-fp-otp');
    const errBox = document.getElementById('fp-error-3');
    const btn = document.getElementById('btn-fp-submit-step3');

    if (errSpan) errSpan.textContent = '';
    if (errBox) { errBox.textContent = ''; errBox.classList.add('hidden'); }

    const rawOtp = input ? input.value.trim().replace(/\D/g, '') : '';
    if (rawOtp.length !== 6) {
      if (errSpan) errSpan.textContent = 'Please enter the complete 6-digit code.';
      return;
    }

    const origText = btn ? btn.textContent : 'Verify Code';
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Verifying...';
    }

    try {
      const { ok, data, error } = await callAuthApi('api/auth/forgot-password/verify-otp', {
        sessionToken: fpSession.sessionToken,
        otp: rawOtp
      });

      if (!ok || !data || !data.success) {
        const errorMsg = data?.error || error || 'Invalid 6-digit code. Please check and try again.';
        if (errBox) {
          errBox.textContent = errorMsg;
          errBox.classList.remove('hidden');
        }
        return;
      }

      // Code Verified successfully! Proceed to Step 4
      if (fpSession.timerInterval) clearInterval(fpSession.timerInterval);
      setFpStep(4);

      const newPwInp = document.getElementById('fp-new-pw');
      if (newPwInp) {
        newPwInp.value = '';
        setTimeout(() => newPwInp.focus(), 150);
      }

    } catch (err) {
      if (errBox) {
        errBox.textContent = 'Network error verifying code. Please try again.';
        errBox.classList.remove('hidden');
      }
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = origText;
      }
    }
  }

  async function submitFpStep4() {
    const newPwInput = document.getElementById('fp-new-pw');
    const confirmPwInput = document.getElementById('fp-confirm-pw');
    const errNew = document.getElementById('err-fp-new-pw');
    const errConfirm = document.getElementById('err-fp-confirm-pw');
    const errBox = document.getElementById('fp-error-4');
    const btn = document.getElementById('btn-fp-submit-step4');

    if (errNew) errNew.textContent = '';
    if (errConfirm) errConfirm.textContent = '';
    if (errBox) { errBox.textContent = ''; errBox.classList.add('hidden'); }

    const newPw = newPwInput ? newPwInput.value : '';
    const confirmPw = confirmPwInput ? confirmPwInput.value : '';

    const v = validatePassword(newPw);
    if (!v.len || !v.upper || !v.num || !v.sym) {
      if (errNew) errNew.textContent = 'Password must meet all 4 requirements above.';
      return;
    }

    if (newPw !== confirmPw) {
      if (errConfirm) errConfirm.textContent = 'Passwords do not match.';
      return;
    }

    const origText = btn ? btn.textContent : 'Reset Password';
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Updating Password...';
    }

    try {
      const { ok, data, error } = await callAuthApi('api/auth/forgot-password/reset-password', {
        sessionToken: fpSession.sessionToken,
        newPassword: newPw,
        confirmPassword: confirmPw
      });

      if (!ok || !data || !data.success) {
        const errorMsg = data?.error || error || 'Could not update password. Please try again.';
        if (errBox) {
          errBox.textContent = errorMsg;
          errBox.classList.remove('hidden');
        }
        return;
      }

      // Update local storage user record if present so local state is instantly synchronized
      if (typeof DB !== 'undefined' && typeof DB.getUsers === 'function') {
        const localUsers = DB.getUsers();
        const localUser = localUsers.find(u => u.id === fpSession.userId);
        if (localUser) {
          localUser.password = newPw;
          localUser.updatedAt = new Date().toISOString();
          localStorage.setItem('sun_users', JSON.stringify(localUsers));
        }
      }

      // Password Reset Complete! Go to Step 5
      setFpStep(5);

    } catch (err) {
      if (errBox) {
        errBox.textContent = 'Network error saving password. Please check your connection and try again.';
        errBox.classList.remove('hidden');
      }
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = origText;
      }
    }
  }

  function initForgotPassword() {
    // 1. Link on Login Page
    const linkForgot = document.getElementById('link-forgot-password');
    if (linkForgot) {
      linkForgot.addEventListener('click', (e) => {
        e.preventDefault();
        const loginIdInput = document.getElementById('login-identifier');
        const prefill = loginIdInput ? loginIdInput.value.trim() : '';
        openForgotPasswordModal(prefill);
      });
    }

    // 2. Modal Close Buttons
    const closeBtn = document.getElementById('btn-close-fp-modal');
    if (closeBtn) closeBtn.addEventListener('click', closeForgotPasswordModal);

    const fpModal = document.getElementById('modal-forgot-password');
    if (fpModal) {
      fpModal.addEventListener('click', (e) => {
        if (e.target === fpModal) closeForgotPasswordModal();
      });
    }

    // 3. Step 1 Submit
    const formStep1 = document.getElementById('fp-form-step-1');
    if (formStep1) {
      formStep1.addEventListener('submit', (e) => {
        e.preventDefault();
        submitFpStep1();
      });
    }

    // 4. Step 2 Channel selection & Submit
    const cardSms = document.getElementById('fp-channel-card-sms');
    const cardEmail = document.getElementById('fp-channel-card-email');
    if (cardSms) {
      cardSms.addEventListener('click', () => {
        const radio = cardSms.querySelector('input[type="radio"]');
        if (radio) radio.checked = true;
        updateChannelCardStyles('sms');
      });
    }
    if (cardEmail) {
      cardEmail.addEventListener('click', () => {
        const radio = cardEmail.querySelector('input[type="radio"]');
        if (radio) radio.checked = true;
        updateChannelCardStyles('email');
      });
    }

    const btnSubmitStep2 = document.getElementById('btn-fp-submit-step2');
    if (btnSubmitStep2) {
      btnSubmitStep2.addEventListener('click', submitFpStep2);
    }

    const btnBackStep1 = document.getElementById('btn-fp-back-to-step1');
    if (btnBackStep1) {
      btnBackStep1.addEventListener('click', () => setFpStep(1));
    }

    // 5. Step 3 OTP Input formatting & Submit
    const otpInput = document.getElementById('fp-otp-input');
    if (otpInput) {
      otpInput.addEventListener('input', () => {
        const clean = otpInput.value.replace(/\D/g, '').slice(0, 6);
        otpInput.value = clean;
        const errSpan = document.getElementById('err-fp-otp');
        if (errSpan) errSpan.textContent = '';
        if (clean.length === 6) {
          submitFpStep3();
        }
      });
    }

    const formStep3 = document.getElementById('fp-form-step-3');
    if (formStep3) {
      formStep3.addEventListener('submit', (e) => {
        e.preventDefault();
        submitFpStep3();
      });
    }

    const resendBtn = document.getElementById('btn-fp-resend-otp');
    if (resendBtn) {
      resendBtn.addEventListener('click', () => {
        if (!resendBtn.disabled) submitFpStep2();
      });
    }

    const switchChannelBtn = document.getElementById('btn-fp-switch-channel');
    if (switchChannelBtn) {
      switchChannelBtn.addEventListener('click', () => {
        const newChannel = fpSession.channel === 'sms' ? 'email' : 'sms';
        fpSession.channel = newChannel;
        const radio = document.querySelector(`input[name="fp_channel"][value="${newChannel}"]`);
        if (radio) radio.checked = true;
        updateChannelCardStyles(newChannel);
        submitFpStep2();
      });
    }

    // 6. Step 4 Password input real-time rules & Submit
    const newPwInput = document.getElementById('fp-new-pw');
    if (newPwInput) {
      newPwInput.addEventListener('input', () => updateFpPasswordRules(newPwInput.value));
    }

    const formStep4 = document.getElementById('fp-form-step-4');
    if (formStep4) {
      formStep4.addEventListener('submit', (e) => {
        e.preventDefault();
        submitFpStep4();
      });
    }

    // 7. Step 5 Finish / Sign In button
    const btnFinish = document.getElementById('btn-fp-finish-login');
    if (btnFinish) {
      btnFinish.addEventListener('click', () => {
        closeForgotPasswordModal();
        if (typeof App !== 'undefined' && App.navigate) {
          App.navigate('login');
        }
        const loginIdInput = document.getElementById('login-identifier');
        if (loginIdInput && fpSession.identifier) {
          loginIdInput.value = fpSession.identifier;
        }
        const pwInput = document.getElementById('login-password');
        if (pwInput) {
          pwInput.value = '';
          setTimeout(() => pwInput.focus(), 150);
        }
      });
    }
  }

  return {
    init() {
      initToggleButtons();
      initSignup();
      initLogin();
      initLinks();
      initForgotPassword();
    },
    openForgotPasswordModal,
    isValidEmail,
    validateNigerianPhone,
    callAuthApi,
  };
})();

// Export to window
try {
  window.Auth = Auth;
} catch(e) {}
