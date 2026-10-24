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
      if (!btn) return;
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

    const form = document.getElementById('signup-form');
    if (!form) return;

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      clearErrors('err-firstname', 'err-lastname', 'err-email', 'err-phone', 'err-password', 'err-confirm');
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

      // Email validation (must have @ and .)
      if (!email) {
        setError('err-email', 'Email address is required.');
        valid = false;
      } else if (!isValidEmail(email)) {
        setError('err-email', 'Enter a valid email with "@" and a domain "." (e.g. name@example.com).');
        valid = false;
      } else if (DB.getUserByEmail(email)) {
        // Prevent duplicate email
        setError('err-email', 'This email is already in use. Please sign in or use another.');
        valid = false;
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

      const user = DB.createUser({ firstName, lastName, email, phone, password });
      DB.setSession({ userId: user.id });
      App.navigate('user');
    });
  }

  // ---- LOGIN ----
  function initLogin() {
    const form = document.getElementById('login-form');
    if (!form) return;

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      clearErrors('err-login-identifier', 'err-login-password');
      showFormError('login-error', '');

      const identifierInput = document.getElementById('login-identifier');
      const identifier = identifierInput ? identifierInput.value.trim() : '';
      const password   = document.getElementById('login-password').value;

      let valid = true;
      if (!identifier) {
        setError('err-login-identifier', 'Enter your email address or phone number.');
        valid = false;
      }
      if (!password) {
        setError('err-login-password', 'Password is required.');
        valid = false;
      }
      if (!valid) return;

      // Check admin login first
      const admin = DB.getAdmin();
      if ((identifier.toLowerCase() === admin.email.toLowerCase() || identifier === admin.password) && password === admin.password) {
        DB.setAdminSession({ role: 'admin' });
        App.navigate('admin');
        return;
      }

      // Check user by Email OR Phone number
      const user = DB.getUserByIdentifier(identifier);
      if (!user || user.password !== password) {
        showFormError('login-error', 'Invalid email/phone number or password.');
        return;
      }

      DB.setSession({ userId: user.id });
      App.navigate('user');
    });
  }

  // ---- Navigation links ----
  function initLinks() {
    const gotoLogin   = document.getElementById('goto-login');
    const gotoSignup  = document.getElementById('goto-signup');
    const gotoAdmin   = document.getElementById('goto-admin');
    const adminToUser = document.getElementById('admin-to-user-portal');

    if (gotoLogin)   gotoLogin.addEventListener('click',   (e) => { e.preventDefault(); App.navigate('login'); });
    if (gotoSignup)  gotoSignup.addEventListener('click',  (e) => { e.preventDefault(); App.navigate('signup'); });
    if (gotoAdmin)   gotoAdmin.addEventListener('click',   (e) => { e.preventDefault(); App.navigate('admin'); });
    if (adminToUser) adminToUser.addEventListener('click', (e) => { e.preventDefault(); App.navigate('login'); });
  }

  return {
    init() {
      initToggleButtons();
      initSignup();
      initLogin();
      initLinks();
    },
    isValidEmail,
    validateNigerianPhone,
  };
})();
