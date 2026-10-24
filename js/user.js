// ============================================
// USER.JS - User Dashboard Logic
// ============================================

const UserApp = (() => {
  let currentUserId = null;
  let activePeriod  = 'day';
  let selectedFilterDate = new Date().toISOString().slice(0, 10);
  let clockInterval = null;

  // ---- Date / Time ----
  function startClock() {
    updateClock();
    clockInterval = setInterval(updateClock, 1000);
  }

  function stopClock() {
    if (clockInterval) { clearInterval(clockInterval); clockInterval = null; }
  }

  function updateClock() {
    const now = new Date();
    const dateEl = document.getElementById('home-date');
    const timeEl = document.getElementById('home-time');
    if (dateEl) dateEl.textContent = now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    if (timeEl) timeEl.textContent = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }

  // ---- Date utilities ----
  function todayISO() {
    return new Date().toISOString().slice(0, 10);
  }

  function isoToYMD(iso) { return iso.slice(0, 10); }
  function isoToYM(iso)  { return iso.slice(0, 7); }
  function isoToY(iso)   { return iso.slice(0, 4); }

  const todayDateObj = new Date();
  let selectedDay   = todayDateObj.getDate();
  let selectedMonth = todayDateObj.getMonth();
  let selectedYear  = todayDateObj.getFullYear();

  function pad(n) { return n < 10 ? '0' + n : '' + n; }

  function buildDateISO() {
    return `${selectedYear}-${pad(selectedMonth + 1)}-${pad(selectedDay)}`;
  }

  function updateFilterButtons() {
    const dayValEl   = document.getElementById('user-filter-day-val');
    const monthValEl = document.getElementById('user-filter-month-val');
    const yearValEl  = document.getElementById('user-filter-year-val');

    const isToday = (selectedDay === todayDateObj.getDate() && selectedMonth === todayDateObj.getMonth() && selectedYear === todayDateObj.getFullYear());

    if (dayValEl)   dayValEl.textContent   = isToday ? `Today (${selectedDay})` : `Day ${selectedDay}`;
    if (monthValEl) monthValEl.textContent = CustomPicker.formatMonthLabel(new Date(selectedYear, selectedMonth, 1));
    if (yearValEl)  yearValEl.textContent  = '' + selectedYear;

    const dayBtn   = document.getElementById('user-filter-day');
    const monthBtn = document.getElementById('user-filter-month');
    const yearBtn  = document.getElementById('user-filter-year');

    if (dayBtn)   dayBtn.classList.toggle('active', activePeriod === 'day');
    if (monthBtn) monthBtn.classList.toggle('active', activePeriod === 'month');
    if (yearBtn)  yearBtn.classList.toggle('active', activePeriod === 'year');
  }

  // ---- 3-Button Modular Date Filter Listeners (Dedicated Day, Month, Year) ----
  function initDateFilterGroup() {
    const dayBtn   = document.getElementById('user-filter-day');
    const monthBtn = document.getElementById('user-filter-month');
    const yearBtn  = document.getElementById('user-filter-year');

    if (dayBtn) {
      dayBtn.addEventListener('click', () => {
        CustomPicker.openDayModal({
          selectedDay: selectedDay,
          onSelect: (dayNum) => {
            selectedDay = dayNum;
            activePeriod = 'day';
            selectedFilterDate = buildDateISO();
            updateFilterButtons();
            renderSavingsList();
            renderTotal();
          },
        });
      });
    }

    if (monthBtn) {
      monthBtn.addEventListener('click', () => {
        CustomPicker.openMonthModal({
          selectedMonth: selectedMonth,
          onSelect: (monthIdx) => {
            selectedMonth = monthIdx;
            activePeriod = 'month';
            selectedFilterDate = buildDateISO();
            updateFilterButtons();
            renderSavingsList();
            renderTotal();
          },
        });
      });
    }

    if (yearBtn) {
      yearBtn.addEventListener('click', () => {
        CustomPicker.openYearModal({
          selectedYear: selectedYear,
          onSelect: (yearNum) => {
            selectedYear = yearNum;
            activePeriod = 'year';
            selectedFilterDate = buildDateISO();
            updateFilterButtons();
            renderSavingsList();
            renderTotal();
          },
        });
      });
    }
  }

  // ---- Savings List Rendering ----
  function getFilteredSavings() {
    const savings = DB.getSavings(currentUserId);

    return savings.filter(s => {
      if (activePeriod === 'day') {
        return isoToYMD(s.createdAt) === buildDateISO();
      }
      if (activePeriod === 'month') {
        const ym = `${selectedYear}-${pad(selectedMonth + 1)}`;
        return isoToYM(s.createdAt) === ym;
      }
      if (activePeriod === 'year') {
        return isoToY(s.createdAt) === ('' + selectedYear);
      }
      return true;
    });
  }

  function renderSavingsList() {
    const container = document.getElementById('savings-list');
    if (!container) return;

    const filtered = getFilteredSavings();

    if (filtered.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" width="56" height="56">
            <rect x="8" y="16" width="48" height="36" rx="4" stroke="#c0c7d0" stroke-width="2.5"/>
            <path d="M8 24h48" stroke="#c0c7d0" stroke-width="2.5"/>
            <path d="M20 36h24" stroke="#c0c7d0" stroke-width="2" stroke-linecap="round"/>
            <path d="M20 42h16" stroke="#c0c7d0" stroke-width="2" stroke-linecap="round"/>
          </svg>
          <p>No savings records for this period</p>
        </div>`;
      return;
    }

    // Sort newest first
    const sorted = [...filtered].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    container.innerHTML = sorted.map(s => {
      const d = new Date(s.createdAt);
      const dateStr = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
      const timeStr = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
      const isPayout = (s.type === 'withdrawal' || s.type === 'payout');
      const note = s.note || (isPayout ? 'Cash payout' : 'Savings deposit');

      return `
        <div class="savings-item">
          <div class="savings-item-left">
            <div class="savings-item-icon ${isPayout ? 'savings-item-icon--payout' : ''}">
              ${isPayout ? `
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                  <line x1="7" y1="17" x2="17" y2="7"/>
                  <polyline points="7 7 17 7 17 17"/>
                </svg>
              ` : `
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                  <line x1="17" y1="7" x2="7" y2="17"/>
                  <polyline points="17 17 7 17 7 7"/>
                </svg>
              `}
            </div>
            <div>
              <div style="display:flex; align-items:center; gap:6px; margin-bottom:2px;">
                <span class="tx-badge ${isPayout ? 'tx-badge--payout' : 'tx-badge--deposit'}">${isPayout ? 'Payout' : 'Deposit'}</span>
                <span class="savings-item-date">${dateStr} &middot; ${timeStr}</span>
              </div>
              <p class="savings-item-note">${escapeHtml(note)}</p>
            </div>
          </div>
          <p class="savings-item-amount ${isPayout ? 'tx-amount--debit' : 'tx-amount--credit'}">
            ${isPayout ? '-₦' : '+₦'}${formatAmount(s.amount)}
          </p>
        </div>`;
    }).join('');
  }

  function renderTotal() {
    const balance = DB.getUserBalance(currentUserId);
    const totalEl = document.getElementById('user-total-saved');
    const depEl   = document.getElementById('user-total-deposited');
    const wthEl   = document.getElementById('user-total-withdrawn');
    if (totalEl) totalEl.textContent = '₦' + formatAmount(balance.balance);
    if (depEl)   depEl.textContent   = '₦' + formatAmount(balance.totalDeposited);
    if (wthEl)   wthEl.textContent   = '₦' + formatAmount(balance.totalWithdrawn);
  }

  function formatAmount(n) {
    return Number(n).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function escapeHtml(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  // ---- Period Filter Buttons (Legacy wrapper) ----
  function initPeriodButtons() {
    // Handled by initDateFilterGroup()
  }

  // ---- Tab Navigation ----
  function switchTab(tab) {
    if (!tab) tab = 'home';
    try {
      localStorage.setItem('sun_user_tab', tab);
    } catch(e) {}

    document.querySelectorAll('.tab-btn[data-tab]').forEach(b => {
      b.classList.toggle('active', b.dataset.tab === tab);
    });

    const homeEl = document.getElementById('tab-home-content');
    const saveEl = document.getElementById('tab-save-content');
    const moreEl = document.getElementById('tab-more-content');

    if (homeEl) homeEl.classList.toggle('hidden', tab !== 'home');
    if (saveEl) saveEl.classList.toggle('hidden', tab !== 'save');
    if (moreEl) moreEl.classList.toggle('hidden', tab !== 'more');
  }

  function initTabs() {
    document.querySelectorAll('.tab-btn[data-tab]').forEach(btn => {
      btn.addEventListener('click', () => {
        switchTab(btn.dataset.tab);
      });
    });
  }

  // ---- More Tab: User Info ----
  function renderMoreUserInfo() {
    const user = DB.getUserById(currentUserId);
    if (!user) return;
    const nameEl     = document.getElementById('more-user-name');
    const emailEl    = document.getElementById('more-user-email');
    const initialsEl = document.getElementById('more-user-initials');
    const fn = DB.formatName(user.firstName || '');
    const ln = DB.formatName(user.lastName || '');
    if (nameEl)  nameEl.textContent  = `${fn} ${ln}`;
    if (emailEl) emailEl.textContent = user.email || '';
    if (initialsEl) {
      const i1 = (user.firstName || '').trim().charAt(0);
      const i2 = (user.lastName || '').trim().charAt(0);
      initialsEl.textContent = (i1 + i2).toUpperCase() || 'U';
    }
  }

  // ---- Save / Payout Form & Custom Select Action Sheet ----
  function initSaveForm() {
    // Type toggle buttons (Deposit vs Payout)
    const btnDeposit = document.getElementById('btn-type-deposit');
    const btnPayout  = document.getElementById('btn-type-payout');
    const typeInput  = document.getElementById('save-type');
    const submitBtn  = document.getElementById('save-submit-btn');

    if (btnDeposit && btnPayout && typeInput) {
      btnDeposit.addEventListener('click', () => {
        btnDeposit.classList.add('active');
        btnPayout.classList.remove('active');
        typeInput.value = 'deposit';
        if (submitBtn) submitBtn.textContent = 'Record Deposit';
      });

      btnPayout.addEventListener('click', () => {
        btnPayout.classList.add('active');
        btnDeposit.classList.remove('active');
        typeInput.value = 'withdrawal';
        if (submitBtn) submitBtn.textContent = 'Request Payout';
      });
    }

    const categoryBtn = document.getElementById('save-category-btn');
    if (categoryBtn) {
      categoryBtn.addEventListener('click', () => {
        const catInput = document.getElementById('save-category');
        const currentVal = catInput ? catInput.value : 'General Savings';

        CustomPicker.openCustomSelect({
          title: 'Select Category / Purpose',
          selectedValue: currentVal,
          allowCustom: true,
          customPlaceholder: 'Type custom savings category (e.g. School Fees)...',
          options: [
            { label: 'General Savings', value: 'General Savings' },
            { label: 'Personal Savings', value: 'Personal Savings' },
            { label: 'Emergency Fund', value: 'Emergency Fund' },
            { label: 'Business Growth', value: 'Business Growth' },
            { label: 'Target Investment', value: 'Target Investment' },
            { label: 'Education & Learning', value: 'Education & Learning' },
            { label: 'Special Project', value: 'Special Project' },
          ],
          onSelect: (selectedOpt) => {
            if (catInput) catInput.value = selectedOpt.value;
            const labelEl = document.getElementById('save-category-label');
            if (labelEl) labelEl.textContent = selectedOpt.label;
          },
        });
      });
    }

    const form = document.getElementById('save-form');
    if (!form) return;

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const errEl     = document.getElementById('err-save-amount');
      const errorEl   = document.getElementById('save-error');
      const successEl = document.getElementById('save-success');

      if (errEl)     errEl.textContent = '';
      if (errorEl)   errorEl.classList.add('hidden');
      if (successEl) successEl.classList.add('hidden');

      const amountInput = document.getElementById('save-amount');
      const noteInput   = document.getElementById('save-note');
      const catInput    = document.getElementById('save-category');
      const type        = (typeInput ? typeInput.value : 'deposit');
      const amount      = parseFloat(amountInput.value);

      if (!amountInput.value || isNaN(amount) || amount <= 0) {
        if (errEl) errEl.textContent = 'Enter a valid amount greater than 0.';
        amountInput.classList.add('input-error');
        return;
      }

      // Check balance for withdrawal
      if (type === 'withdrawal') {
        const userBal = DB.getUserBalance(currentUserId).balance;
        if (amount > userBal) {
          if (errEl) errEl.textContent = `Insufficient balance. Your current savings balance is ₦${formatAmount(userBal)}.`;
          amountInput.classList.add('input-error');
          return;
        }
      }

      amountInput.classList.remove('input-error');
      const category = catInput ? catInput.value : 'General Savings';
      const userNote = noteInput ? noteInput.value.trim() : '';

      DB.addTransaction({
        userId: currentUserId,
        type,
        amount,
        category,
        note: userNote,
        recordedBy: 'user',
      });

      // Reset form
      amountInput.value = '';
      if (noteInput) noteInput.value = '';

      if (successEl) {
        const labelText = type === 'withdrawal' ? 'Payout recorded' : 'Savings deposited';
        successEl.textContent = `₦${formatAmount(amount)} ${labelText} successfully.`;
        successEl.classList.remove('hidden');
        setTimeout(() => successEl.classList.add('hidden'), 3500);
      }

      // Refresh home data in background
      renderSavingsList();
      renderTotal();
    });
  }

  // ---- Edit Profile Modal ----
  function initEditProfile() {
    const btn = document.getElementById('btn-edit-profile');
    if (!btn) return;

    btn.addEventListener('click', () => {
      const user = DB.getUserById(currentUserId);
      if (!user) return;
      document.getElementById('edit-firstname').value = user.firstName;
      document.getElementById('edit-lastname').value  = user.lastName;
      document.getElementById('edit-email').value     = user.email;
      document.getElementById('edit-phone').value     = user.phone;
      document.getElementById('edit-profile-error').classList.add('hidden');
      document.getElementById('edit-profile-success').classList.add('hidden');
      openModal('modal-edit-profile');
    });

    // Auto-capitalize first and last name on blur in profile edit
    ['edit-firstname', 'edit-lastname'].forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener('blur', () => {
          el.value = DB.formatName(el.value);
        });
      }
    });

    const form = document.getElementById('edit-profile-form');
    if (!form) return;

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      document.getElementById('edit-profile-error').classList.add('hidden');
      document.getElementById('edit-profile-success').classList.add('hidden');
      document.getElementById('err-edit-firstname').textContent = '';
      document.getElementById('err-edit-lastname').textContent  = '';
      document.getElementById('err-edit-email').textContent     = '';
      document.getElementById('err-edit-phone').textContent     = '';

      const fnInput   = document.getElementById('edit-firstname');
      const lnInput   = document.getElementById('edit-lastname');
      const firstName = DB.formatName(fnInput ? fnInput.value : '');
      const lastName  = DB.formatName(lnInput ? lnInput.value : '');
      if (fnInput) fnInput.value = firstName;
      if (lnInput) lnInput.value = lastName;

      const email     = document.getElementById('edit-email').value.trim();
      const phone     = document.getElementById('edit-phone').value.trim();

      let valid = true;
      if (!firstName) {
        document.getElementById('err-edit-firstname').textContent = 'First name is required.';
        valid = false;
      }
      if (!lastName) {
        document.getElementById('err-edit-lastname').textContent = 'Last name is required.';
        valid = false;
      }

      // Email validation (must have @ and .)
      const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
      if (!email || !emailRegex.test(email)) {
        document.getElementById('err-edit-email').textContent = 'Enter a valid email with "@" and "." (e.g. name@example.com).';
        valid = false;
      }

      // Nigerian phone validation (starts with 0, 11 digits)
      if (!phone) {
        document.getElementById('err-edit-phone').textContent = 'Phone number is required.';
        valid = false;
      } else if (phone.startsWith('234') || phone.startsWith('+234')) {
        document.getElementById('err-edit-phone').textContent = 'Phone number must start with 0, not 234.';
        valid = false;
      } else if (!phone.startsWith('0')) {
        document.getElementById('err-edit-phone').textContent = 'Phone number must start with 0.';
        valid = false;
      } else if (!/^\d+$/.test(phone)) {
        document.getElementById('err-edit-phone').textContent = 'Phone number must contain digits only.';
        valid = false;
      } else if (phone.length !== 11) {
        document.getElementById('err-edit-phone').textContent = `Phone number must be exactly 11 digits (currently ${phone.length}).`;
        valid = false;
      }

      if (!valid) return;

      // Check email conflict
      const existingEmail = DB.getUserByEmail(email);
      if (existingEmail && existingEmail.id !== currentUserId) {
        document.getElementById('edit-profile-error').textContent = 'This email is already in use by another account.';
        document.getElementById('edit-profile-error').classList.remove('hidden');
        return;
      }

      // Check phone conflict
      const existingPhone = DB.getUserByPhone(phone);
      if (existingPhone && existingPhone.id !== currentUserId) {
        document.getElementById('edit-profile-error').textContent = 'This phone number is already in use by another account.';
        document.getElementById('edit-profile-error').classList.remove('hidden');
        return;
      }

      DB.updateUser(currentUserId, { firstName, lastName, email, phone });
      renderMoreUserInfo();
      document.getElementById('edit-profile-success').textContent = 'Profile updated successfully.';
      document.getElementById('edit-profile-success').classList.remove('hidden');
      setTimeout(() => closeModal('modal-edit-profile'), 1500);
    });
  }

  // ---- Change Password Modal ----
  function initChangePassword() {
    const btn = document.getElementById('btn-change-password');
    if (!btn) return;

    btn.addEventListener('click', () => {
      document.getElementById('cp-current').value  = '';
      document.getElementById('cp-new').value      = '';
      document.getElementById('cp-confirm').value  = '';
      document.getElementById('cp-error').classList.add('hidden');
      document.getElementById('cp-success').classList.add('hidden');
      document.getElementById('err-cp-current').textContent = '';
      document.getElementById('err-cp-new').textContent     = '';
      document.getElementById('err-cp-confirm').textContent = '';

      // Reset password toggle states to hidden / eye-open
      const eyeOpenSVG = `<svg class="eye-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`;
      ['cp-current', 'cp-new', 'cp-confirm'].forEach(id => {
        const inp = document.getElementById(id);
        if (inp) inp.type = 'password';
        const toggleBtn = document.querySelector(`.toggle-pw[data-target="${id}"]`);
        if (toggleBtn) {
          toggleBtn.innerHTML = eyeOpenSVG;
          toggleBtn.setAttribute('aria-label', 'Show password');
          toggleBtn.classList.remove('active');
        }
      });

      openModal('modal-change-password');
    });

    const form = document.getElementById('change-password-form');
    if (!form) return;

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      document.getElementById('cp-error').classList.add('hidden');
      document.getElementById('cp-success').classList.add('hidden');
      document.getElementById('err-cp-current').textContent = '';
      document.getElementById('err-cp-new').textContent     = '';
      document.getElementById('err-cp-confirm').textContent = '';

      const current = document.getElementById('cp-current').value;
      const newPw   = document.getElementById('cp-new').value;
      const confirm = document.getElementById('cp-confirm').value;

      const user = DB.getUserById(currentUserId);
      let valid = true;

      if (!current) { document.getElementById('err-cp-current').textContent = 'Required.'; valid = false; }
      else if (user.password !== current) {
        document.getElementById('err-cp-current').textContent = 'Current password is incorrect.'; valid = false;
      }

      const pv = {
        len:   newPw.length >= 6,
        upper: /[A-Z]/.test(newPw),
        num:   /[0-9]/.test(newPw),
        sym:   /[^A-Za-z0-9]/.test(newPw),
      };
      if (!pv.len || !pv.upper || !pv.num || !pv.sym) {
        document.getElementById('err-cp-new').textContent = 'Password must be 6+ chars, include uppercase, number, and symbol.';
        valid = false;
      }
      if (newPw !== confirm) {
        document.getElementById('err-cp-confirm').textContent = 'Passwords do not match.'; valid = false;
      }
      if (!valid) return;

      DB.updateUser(currentUserId, { password: newPw });
      document.getElementById('cp-success').textContent = 'Password changed successfully.';
      document.getElementById('cp-success').classList.remove('hidden');
      setTimeout(() => closeModal('modal-change-password'), 1500);
    });
  }

  // ---- Logout ----
  function initLogout() {
    const btn = document.getElementById('btn-logout');
    if (!btn) return;
    btn.addEventListener('click', () => {
      DB.clearSession();
      try {
        localStorage.removeItem('sun_user_tab');
        document.documentElement.classList.remove('is-user-logged-in');
      } catch(e) {}
      stopClock();
      App.navigate('login');
    });
  }

  // ---- Modal Helpers ----
  function openModal(id) {
    const el = document.getElementById(id);
    if (el) el.classList.remove('hidden');
  }

  function closeModal(id) {
    const el = document.getElementById(id);
    if (el) el.classList.add('hidden');
  }

  function initModalClose() {
    document.querySelectorAll('.modal-close').forEach(btn => {
      btn.addEventListener('click', () => closeModal(btn.dataset.modal));
    });
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closeModal(overlay.id);
      });
    });
  }

  // ---- Account Statement Exports ----
  function initUserExports() {
    const btnExcel = document.getElementById('btn-user-export-excel');
    const btnPdf   = document.getElementById('btn-user-export-pdf');

    function getUserStatementData() {
      const u = (currentUserId ? DB.getUserById(currentUserId) : null) || (typeof currentUser !== 'undefined' ? currentUser : null);
      if (!u) {
        alert('Please log in to export your account statement.');
        return null;
      }
      const savings = DB.getSavings(u.id);
      if (!savings || savings.length === 0) {
        alert('No savings or transaction records found to export.');
        return null;
      }

      const bal = DB.getUserBalance(u.id);
      const sorted = [...savings].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      const clientName = (DB.formatName ? DB.formatName(u.firstName) + ' ' + DB.formatName(u.lastName) : `${u.firstName || ''} ${u.lastName || ''}`).trim();

      const headers = ['Date & Time', 'Type', 'Category', 'Description / Note', 'Amount (₦)'];
      const rows = sorted.map(s => {
        const d = new Date(s.createdAt);
        const dtStr = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) + ' ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
        const isPayout = (s.type === 'withdrawal' || s.type === 'payout');
        const typeStr = isPayout ? 'Withdrawal' : 'Deposit';
        const amtStr = (isPayout ? '-₦' : '+₦') + Number(s.amount || 0).toLocaleString('en-NG', { minimumFractionDigits: 2 });
        return [
          dtStr,
          typeStr,
          s.category || 'General',
          s.note || '-',
          amtStr
        ];
      });

      return {
        user: u,
        clientName,
        bal,
        headers,
        rows,
        totalCount: savings.length
      };
    }

    if (btnExcel) {
      btnExcel.addEventListener('click', () => {
        const data = getUserStatementData();
        if (!data) return;
        const filename = `Account_Statement_${data.clientName.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}`;
        DataExporter.toExcel({
          title: `Account Statement - ${data.clientName}`,
          filename,
          headers: data.headers,
          rows: data.rows
        });
      });
    }

    if (btnPdf) {
      btnPdf.addEventListener('click', () => {
        const data = getUserStatementData();
        if (!data) return;
        DataExporter.toPDF({
          title: 'Official Account Statement',
          subtitle: `Client Statement: ${data.clientName} (${data.user.phone || ''})`,
          filename: `Account_Statement_${data.clientName.replace(/\s+/g, '_')}`,
          headers: data.headers,
          rows: data.rows,
          meta: [
            { label: 'Client Name', value: data.clientName },
            { label: 'Phone Number', value: data.user.phone || '-' },
            { label: 'Email', value: data.user.email || '-' },
            { label: 'Total Records', value: data.totalCount.toString() }
          ],
          summary: [
            { label: 'Total Deposited', value: '₦' + Number(data.bal.totalDeposited || 0).toLocaleString('en-NG', { minimumFractionDigits: 2 }), color: '#095426' },
            { label: 'Total Withdrawn', value: '₦' + Number(data.bal.totalWithdrawn || 0).toLocaleString('en-NG', { minimumFractionDigits: 2 }), color: '#b91c1c' },
            { label: 'Net Available Balance', value: '₦' + Number(data.bal.balance || 0).toLocaleString('en-NG', { minimumFractionDigits: 2 }), color: '#095426' }
          ]
        });
      });
    }
  }

  // ---- Public API ----
  return {
    load(userId) {
      currentUserId = userId;
      activePeriod = 'day';

      let savedTab = 'home';
      try {
        savedTab = localStorage.getItem('sun_user_tab') || 'home';
      } catch(e) {}
      switchTab(savedTab);

      selectedFilterDate = todayISO();
      updateFilterButtons();
      renderSavingsList();
      renderTotal();
      renderMoreUserInfo();
      startClock();
    },

    initOnce() {
      initTabs();
      initDateFilterGroup();
      initSaveForm();
      initEditProfile();
      initChangePassword();
      initLogout();
      initModalClose();
      initUserExports();
    },

    refresh() {
      if (currentUser && currentUser.id) {
        const freshUser = DB.getUserById(currentUser.id);
        if (freshUser) currentUser = freshUser;
        renderSavingsList();
        renderTotal();
        renderMoreUserInfo();
      }
    },

    switchTab,
  };
})();
