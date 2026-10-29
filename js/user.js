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

  function isDateToday(y, m, d) {
    const n = new Date();
    return y === n.getFullYear() && m === n.getMonth() && d === n.getDate();
  }

  function isDateFuture(y, m, d) {
    const n = new Date();
    const cur = new Date(y, m, d);
    const todayZero = new Date(n.getFullYear(), n.getMonth(), n.getDate());
    return cur > todayZero;
  }

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  function updateFilterButtons() {
    const fullDateEl = document.getElementById('user-filter-full-date');
    if (fullDateEl) {
      fullDateEl.textContent = `${selectedDay} ${monthNames[selectedMonth]} ${selectedYear}`;
    }

    const isCurrentDay = isDateToday(selectedYear, selectedMonth, selectedDay);
    const todayBtn = document.getElementById('user-date-today');
    if (todayBtn) {
      todayBtn.classList.toggle('active', isCurrentDay);
    }

    const nextBtn = document.getElementById('user-date-next');
    if (nextBtn) {
      const atOrAfterToday = isCurrentDay || isDateFuture(selectedYear, selectedMonth, selectedDay);
      nextBtn.disabled = atOrAfterToday;
      nextBtn.classList.toggle('disabled', atOrAfterToday);
    }
  }

  // ---- Unified Date Filter Listeners (dd Month yyyy) ----
  function initDateFilterGroup() {
    const prevBtn    = document.getElementById('user-date-prev');
    const nextBtn    = document.getElementById('user-date-next');
    const triggerBtn = document.getElementById('user-date-picker-trigger');
    const todayBtn   = document.getElementById('user-date-today');

    if (prevBtn) {
      prevBtn.addEventListener('click', () => {
        const cur = new Date(selectedYear, selectedMonth, selectedDay);
        cur.setDate(cur.getDate() - 1);
        selectedDay   = cur.getDate();
        selectedMonth = cur.getMonth();
        selectedYear  = cur.getFullYear();
        activePeriod  = 'day';
        selectedFilterDate = buildDateISO();
        updateFilterButtons();
        renderSavingsList();
        renderTotal();
      });
    }

    if (nextBtn) {
      nextBtn.addEventListener('click', () => {
        const cur = new Date(selectedYear, selectedMonth, selectedDay);
        cur.setDate(cur.getDate() + 1);
        if (isDateFuture(cur.getFullYear(), cur.getMonth(), cur.getDate())) {
          return; // Strictly no future date!
        }
        selectedDay   = cur.getDate();
        selectedMonth = cur.getMonth();
        selectedYear  = cur.getFullYear();
        activePeriod  = 'day';
        selectedFilterDate = buildDateISO();
        updateFilterButtons();
        renderSavingsList();
        renderTotal();
      });
    }

    if (todayBtn) {
      todayBtn.addEventListener('click', () => {
        const now = new Date();
        selectedDay   = now.getDate();
        selectedMonth = now.getMonth();
        selectedYear  = now.getFullYear();
        activePeriod  = 'day';
        selectedFilterDate = buildDateISO();
        updateFilterButtons();
        renderSavingsList();
        renderTotal();
      });
    }

    if (triggerBtn) {
      triggerBtn.addEventListener('click', () => {
        CustomPicker.openDatePicker({
          period: 'day',
          initialDate: buildDateISO(),
          title: 'Select Date',
          hidePeriodSwitcher: true,
          onSelect: (res) => {
            const str = (res && (res.isoString || res.dateISO)) || '';
            if (!str) return;
            const parts = str.split('-');
            const y = parseInt(parts[0], 10);
            const m = parseInt(parts[1], 10) - 1;
            const d = parseInt(parts[2], 10);
            if (isDateFuture(y, m, d)) return; // Strictly no future date!
            selectedYear  = y;
            selectedMonth = m;
            selectedDay   = d;
            activePeriod  = 'day';
            selectedFilterDate = buildDateISO();
            updateFilterButtons();
            renderSavingsList();
            renderTotal();
          }
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
      const status = s.status || 'approved';
      const isPending = (status === 'pending');
      const isDeclined = (status === 'declined');

      return `
        <div class="savings-item ${isPending ? 'savings-item--pending' : ''}">
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
              <div style="display:flex; align-items:center; gap:6px; margin-bottom:2px; flex-wrap:wrap;">
                <span class="tx-badge ${isPayout ? 'tx-badge--payout' : 'tx-badge--deposit'}">${isPayout ? 'Payout' : 'Deposit'}</span>
                ${isPending ? `
                  <span class="status-badge status-badge--pending">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                    Pending Approval
                  </span>
                ` : isDeclined ? `
                  <span class="status-badge status-badge--declined" title="${escapeHtml(s.declineReason || 'Declined by Admin')}">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    Declined
                  </span>
                ` : `
                  <span class="status-badge status-badge--approved">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                    Approved
                  </span>
                `}
                <span class="savings-item-date">${dateStr} &middot; ${timeStr}</span>
              </div>
              <p class="savings-item-note">${escapeHtml(note)} ${isDeclined && s.declineReason ? `<span style="color:#b91c1c; font-size:11.5px; font-weight:600;">(Reason: ${escapeHtml(s.declineReason)})</span>` : ''}</p>
            </div>
          </div>
          <div style="text-align: right;">
            <p class="savings-item-amount ${isPayout ? 'tx-amount--debit' : 'tx-amount--credit'}" style="${isPending ? 'opacity: 0.75;' : isDeclined ? 'text-decoration: line-through; opacity: 0.5;' : ''}">
              ${isPayout ? '-₦' : '+₦'}${formatAmount(s.amount)}
            </p>
            ${isPayout && (s.fee || s.netAmount) ? `<span style="font-size: 11px; color: #166534; font-weight: 700; display: block;">Net: ₦${formatAmount(s.netAmount || (s.amount * 0.90))}</span>` : ''}
            ${isPending ? `<span style="font-size: 10px; color: #b45309; font-weight: 700; display: block;">Awaiting Admin</span>` : ''}
          </div>
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

    const pendingNotice = document.getElementById('user-pending-notice');
    if (pendingNotice) {
      if (balance.pendingDeposits > 0 || balance.pendingWithdrawn > 0) {
        const parts = [];
        if (balance.pendingDeposits > 0) parts.push(`<strong>₦${formatAmount(balance.pendingDeposits)}</strong> Pay In`);
        if (balance.pendingWithdrawn > 0) parts.push(`<strong>₦${formatAmount(balance.pendingWithdrawn)}</strong> Pay Out`);
        pendingNotice.innerHTML = `
          <div class="user-pending-alert">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            <span>You have ${parts.join(' and ')} request(s) waiting for Admin approval.</span>
          </div>`;
        pendingNotice.classList.remove('hidden');
      } else {
        pendingNotice.classList.add('hidden');
      }
    }
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
  function updateMoreTabBankSummary() {
    const subEl = document.getElementById('more-user-bank-sub');
    if (!subEl || !currentUserId) return;
    const saved = DB.getUserPayoutBank(currentUserId);
    if (saved && saved.accountNumber && saved.bankName) {
      subEl.textContent = `${saved.bankName} • ${saved.accountNumber}`;
      subEl.style.color = 'var(--primary)';
      subEl.style.fontWeight = '600';
    } else {
      subEl.textContent = 'Set payout account for withdrawals';
      subEl.style.color = 'var(--text-muted)';
      subEl.style.fontWeight = 'normal';
    }
  }

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
    updateMoreTabBankSummary();
  }

  // ---- Save / Payout Form & Flutterwave Bank Transfer ----
  function openDepositSuccessModal({ amount, category, ref, newBalance }) {
    const amtEl = document.getElementById('succ-deposit-amount');
    const catEl = document.getElementById('succ-deposit-category');
    const refEl = document.getElementById('succ-deposit-ref');
    const balEl = document.getElementById('succ-deposit-balance');
    const modal = document.getElementById('modal-deposit-success');

    if (amtEl) amtEl.textContent = '+₦' + formatAmount(amount);
    if (catEl) catEl.textContent = category || 'General Savings';
    if (refEl) refEl.textContent = ref || '-';
    if (balEl) balEl.textContent = '₦' + formatAmount(newBalance);

    if (modal) modal.classList.remove('hidden');
  }

  function initSaveForm() {
    // Type toggle buttons (Deposit vs Payout)
    const btnDeposit  = document.getElementById('btn-type-deposit');
    const btnPayout   = document.getElementById('btn-type-payout');
    const typeInput   = document.getElementById('save-type');
    const submitBtn   = document.getElementById('save-submit-btn');
    const submitText  = document.getElementById('save-submit-btn-text');
    const titleEl     = document.getElementById('save-page-title');
    const subtitleEl  = document.getElementById('save-page-subtitle');
    const flwCard     = document.getElementById('deposit-flw-card');
    const flwTrust    = document.getElementById('save-flw-trust');
    const quickAmts   = document.getElementById('save-quick-amounts');
    const withDest    = document.getElementById('withdrawal-dest-fields');

    function setFormMode(mode) {
      if (mode === 'deposit') {
        if (btnDeposit) btnDeposit.classList.add('active');
        if (btnPayout) btnPayout.classList.remove('active');
        if (typeInput) typeInput.value = 'deposit';
        if (titleEl) titleEl.textContent = 'Save Money';
        if (subtitleEl) subtitleEl.textContent = 'Transfer money directly to your savings via Flutterwave Bank Transfer';
        if (flwCard) flwCard.classList.remove('hidden');
        if (flwTrust) flwTrust.classList.remove('hidden');
        if (quickAmts) quickAmts.classList.remove('hidden');
        if (withDest) withDest.classList.add('hidden');
        if (submitText) submitText.textContent = 'Generate Bank Transfer Account';
        else if (submitBtn) submitBtn.textContent = 'Generate Bank Transfer Account';
      } else {
        if (btnPayout) btnPayout.classList.add('active');
        if (btnDeposit) btnDeposit.classList.remove('active');
        if (typeInput) typeInput.value = 'withdrawal';
        if (titleEl) titleEl.textContent = 'Request Bank Payout';
        if (subtitleEl) subtitleEl.textContent = 'Enter your Nigerian bank account details to receive your savings payout';
        if (flwCard) flwCard.classList.add('hidden');
        if (flwTrust) flwTrust.classList.add('hidden');
        if (quickAmts) quickAmts.classList.add('hidden');
        if (withDest) withDest.classList.remove('hidden');
        if (submitText) submitText.textContent = 'Request Bank Payout via Flutterwave';
        else if (submitBtn) submitBtn.textContent = 'Request Bank Payout via Flutterwave';
        loadSavedPayoutBank();
        updateFeeCalculations();
      }
    }

    // Auto-load saved user payout bank details
    function loadSavedPayoutBank() {
      if (!currentUserId) return;
      const saved = DB.getUserPayoutBank(currentUserId);
      const bankSelect = document.getElementById('payout-bank-select');
      const bankLabel = document.getElementById('payout-bank-label');
      const bankNameInp = document.getElementById('payout-bank-name');
      const accNumInp = document.getElementById('payout-account-number');
      const accNameInp = document.getElementById('payout-account-name');
      const resCard = document.getElementById('payout-resolution-card');
      const resText = document.getElementById('payout-resolution-text');
      const resIcon = document.getElementById('payout-resolution-icon');

      if (saved && saved.accountNumber) {
        if (bankSelect && saved.bankCode) bankSelect.value = saved.bankCode;
        if (bankLabel && saved.bankName) bankLabel.textContent = saved.bankName;
        if (bankNameInp) bankNameInp.value = saved.bankName || '';
        if (accNumInp) accNumInp.value = saved.accountNumber;
        if (accNameInp) accNameInp.value = saved.accountName || '';

        if (saved.accountName && resCard && resText && resIcon) {
          resCard.className = '';
          resCard.style.cssText = 'margin-top: -6px; margin-bottom: 14px; padding: 10px 14px; border-radius: 8px; font-size: 13px; display: flex; align-items: center; gap: 8px; background: #f0fdf4; border: 1.5px solid #86efac; color: #166534;';
          resIcon.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>';
          resText.innerHTML = `Verified Bank Account: <strong>${escapeHtml(saved.accountName)}</strong>`;
        }
      }
    }

    // Real-time Account Verification Handlers
    const bankSelectEl   = document.getElementById('payout-bank-select');
    const payoutBankBtn  = document.getElementById('payout-bank-btn');
    const payoutBankLbl  = document.getElementById('payout-bank-label');
    const accNumEl       = document.getElementById('payout-account-number');
    const accNameEl      = document.getElementById('payout-account-name');
    const bankNameEl     = document.getElementById('payout-bank-name');
    const resCardEl      = document.getElementById('payout-resolution-card');
    const resTextEl      = document.getElementById('payout-resolution-text');
    const resIconEl      = document.getElementById('payout-resolution-icon');
    let resolveDebounce = null;

    // Custom Modular Picker / Bottom Sheet for Bank Selection (Bank names only, no code clutter)
    if (payoutBankBtn) {
      payoutBankBtn.addEventListener('click', () => {
        const bankOptions = DB.getNigerianBanks().map(b => ({
          label: b.name,
          value: b.code,
        }));
        const currentVal = bankSelectEl ? bankSelectEl.value : '';

        CustomPicker.openCustomSelect({
          title: 'Select Destination Bank',
          options: bankOptions,
          selectedValue: currentVal,
          searchable: true,
          searchPlaceholder: 'Search 70+ Nigerian Banks...',
          onSelect: (opt) => {
            if (bankSelectEl) bankSelectEl.value = opt.value;
            if (payoutBankLbl) payoutBankLbl.textContent = opt.label;
            if (bankNameEl) bankNameEl.value = opt.label;
            triggerAccountResolution();
          },
        });
      });
    }

    async function triggerAccountResolution() {
      if (!bankSelectEl || !accNumEl || !resCardEl || !resTextEl || !resIconEl) return;
      const bankCode = bankSelectEl.value.trim();
      const rawNum = accNumEl.value.replace(/\D/g, '').slice(0, 10);
      accNumEl.value = rawNum;

      if (rawNum.length < 10 || !bankCode) {
        resCardEl.classList.add('hidden');
        if (accNameEl) accNameEl.value = '';
        return;
      }

      // Show verifying loading state
      resCardEl.classList.remove('hidden');
      resCardEl.style.cssText = 'margin-top: -6px; margin-bottom: 14px; padding: 10px 14px; border-radius: 8px; font-size: 13px; display: flex; align-items: center; gap: 8px; background: #fffbeb; border: 1.5px solid #fde68a; color: #92400e;';
      resIconEl.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="animate-spin"><circle cx="12" cy="12" r="10" stroke-opacity="0.25"/><path d="M12 2a10 10 0 0 1 10 10"/></svg>';
      resTextEl.textContent = 'Resolving account name with bank...';

      const res = await DB.resolveFlutterwaveAccount(rawNum, bankCode, currentUserId);

      if (res.success && res.accountName) {
        resCardEl.style.cssText = 'margin-top: -6px; margin-bottom: 14px; padding: 10px 14px; border-radius: 8px; font-size: 13px; display: flex; align-items: center; gap: 8px; background: #f0fdf4; border: 1.5px solid #86efac; color: #166534;';
        resIconEl.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>';
        if (res.source === 'profile') {
          resTextEl.innerHTML = `Auto-detected Account Name: <strong>${escapeHtml(res.accountName)}</strong> <span style="font-size:11.5px; opacity:0.85;">(from profile)</span>`;
        } else {
          resTextEl.innerHTML = `Verified Bank Account: <strong>${escapeHtml(res.accountName)}</strong>`;
        }
        if (accNameEl) accNameEl.value = res.accountName;
      } else {
        resCardEl.style.cssText = 'margin-top: -6px; margin-bottom: 14px; padding: 10px 14px; border-radius: 8px; font-size: 13px; display: flex; align-items: center; gap: 8px; background: #fffbeb; border: 1.5px solid #fde68a; color: #92400e;';
        resIconEl.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>';
        resTextEl.textContent = 'Could not auto-verify name. Please ensure your bank and 10-digit account number are correct.';
        if (accNameEl) accNameEl.value = '';
      }
    }

    if (accNumEl) {
      accNumEl.addEventListener('input', () => {
        if (resolveDebounce) clearTimeout(resolveDebounce);
        resolveDebounce = setTimeout(triggerAccountResolution, 300);
      });
    }

    // 10% Fee Breakdown Real-time Calculator
    const saveAmtInput = document.getElementById('save-amount');
    const withGrossEl  = document.getElementById('with-gross-amt');
    const withFeeEl    = document.getElementById('with-fee-amt');
    const withNetEl    = document.getElementById('with-net-amt');

    function updateFeeCalculations() {
      if (!saveAmtInput) return;
      const gross = parseFloat(saveAmtInput.value) || 0;
      const fee = Math.round(gross * 0.10 * 100) / 100;
      const net = Math.max(0, Math.round((gross - fee) * 100) / 100);

      if (withGrossEl) withGrossEl.textContent = `₦${formatAmount(gross)}`;
      if (withFeeEl)   withFeeEl.textContent   = `-₦${formatAmount(fee)}`;
      if (withNetEl)   withNetEl.textContent   = `₦${formatAmount(net)}`;

      if (typeInput && typeInput.value === 'withdrawal') {
        const btnText = submitText || submitBtn;
        if (btnText) {
          btnText.textContent = gross > 0
            ? `Request Bank Payout of ₦${formatAmount(net)} (Net)`
            : 'Request Bank Payout via Flutterwave';
        }
      }
    }

    if (saveAmtInput) {
      saveAmtInput.addEventListener('input', updateFeeCalculations);
    }

    if (btnDeposit && btnPayout && typeInput) {
      btnDeposit.addEventListener('click', () => setFormMode('deposit'));
      btnPayout.addEventListener('click', () => setFormMode('withdrawal'));
    }

    // Quick amount pills
    document.querySelectorAll('.quick-amt-pill').forEach(pill => {
      pill.addEventListener('click', () => {
        const amtInput = document.getElementById('save-amount');
        if (!amtInput) return;
        const add = parseFloat(pill.dataset.amt) || 0;
        const current = parseFloat(amtInput.value) || 0;
        amtInput.value = (current + add).toFixed(2);
        updateFeeCalculations();
      });
    });

    // Close deposit success modal
    const closeSuccBtn = document.getElementById('btn-close-deposit-success');
    const modalSucc    = document.getElementById('modal-deposit-success');
    if (closeSuccBtn && modalSucc) {
      closeSuccBtn.addEventListener('click', () => {
        modalSucc.classList.add('hidden');
        switchTab('home');
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

      amountInput.classList.remove('input-error');
      const category = catInput ? catInput.value : 'General Savings';
      const userNote = noteInput ? noteInput.value.trim() : '';
      const user = DB.getUserById(currentUserId);
      if (!user) return;

      // ---- 1. DEPOSIT: FLUTTERWAVE BANK TRANSFER ----
      if (type === 'deposit') {
        const flwConfig = DB.getFlutterwaveConfig();
        const txRef = 'SUN-DEP-' + currentUserId + '-' + Date.now();

        // Check if Flutterwave checkout script is available
        if (typeof window.FlutterwaveCheckout !== 'function') {
          // Graceful fallback to manual deposit request if script blocked
          DB.addTransaction({
            userId: currentUserId,
            type: 'deposit',
            amount,
            category,
            note: userNote ? `${userNote} (Manual Request)` : 'Manual Cash Deposit Request',
            recordedBy: 'user',
            status: 'pending',
          });
          amountInput.value = '';
          if (noteInput) noteInput.value = '';
          if (successEl) {
            successEl.textContent = `₦${formatAmount(amount)} deposit request submitted for Admin verification.`;
            successEl.classList.remove('hidden');
            setTimeout(() => successEl.classList.add('hidden'), 4500);
          }
          renderSavingsList();
          renderTotal();
          return;
        }

        const originalText = submitText ? submitText.textContent : 'Generate Bank Transfer Account';
        if (submitText) submitText.textContent = 'Generating Bank Transfer Account...';
        if (submitBtn) submitBtn.disabled = true;

        try {
          window.FlutterwaveCheckout({
            public_key: flwConfig.publicKey,
            tx_ref: txRef,
            amount: amount,
            currency: 'NGN',
            payment_options: 'banktransfer,card,ussd',
            customer: {
              email: user.email || (user.phone ? `${user.phone}@iretomiwasun.com` : `client_${currentUserId}@iretomiwasun.com`),
              phone_number: user.phone || '',
              name: `${DB.formatName(user.firstName)} ${DB.formatName(user.lastName)}`.trim() || 'Valued Saver',
            },
            customizations: {
              title: 'Iretomiwa Sun Investment',
              description: `Savings Deposit - ${category}`,
              logo: window.location.origin + '/assets/logo.png',
            },
            meta: {
              userId: currentUserId,
              category: category,
              userPhone: user.phone || '',
            },
            callback: function (response) {
              if (response && (response.status === 'successful' || response.status === 'completed')) {
                const newTx = DB.addTransaction({
                  userId: currentUserId,
                  type: 'deposit',
                  amount: amount,
                  category: category,
                  note: userNote ? `${userNote} (Flutterwave: ${response.tx_ref || response.transaction_id})` : `Flutterwave Bank Transfer (${response.tx_ref || response.transaction_id})`,
                  recordedBy: 'user',
                  status: 'approved',
                  paymentGateway: 'flutterwave',
                  flutterwaveRef: response.tx_ref || response.transaction_id || response.flw_ref,
                  flwId: response.transaction_id || null,
                });

                // Clear inputs
                amountInput.value = '';
                if (noteInput) noteInput.value = '';

                // Show receipt modal
                const updatedBal = DB.getUserBalance(currentUserId).balance;
                openDepositSuccessModal({
                  amount: amount,
                  category: category,
                  ref: response.tx_ref || response.transaction_id,
                  newBalance: updatedBal,
                });

                renderSavingsList();
                renderTotal();
              } else {
                if (errorEl) {
                  errorEl.textContent = 'Payment transfer was not completed. Please try again.';
                  errorEl.classList.remove('hidden');
                }
              }
            },
            onclose: function () {
              if (submitText) submitText.textContent = originalText;
              if (submitBtn) submitBtn.disabled = false;
            }
          });
        } catch (err) {
          console.error('Flutterwave initiation error:', err);
          if (errorEl) {
            errorEl.textContent = 'Could not open Flutterwave transfer: ' + (err.message || 'Error occurred');
            errorEl.classList.remove('hidden');
          }
        } finally {
          if (submitText) submitText.textContent = originalText;
          if (submitBtn) submitBtn.disabled = false;
        }
        return;
      }

      // ---- 2. PAYOUT (WITHDRAWAL) ----
      const userBal = DB.getUserBalance(currentUserId);
      const avail = (typeof userBal.availableBalance === 'number') ? userBal.availableBalance : userBal.balance;
      if (amount > avail) {
        if (errEl) {
          if (userBal.pendingWithdrawn && userBal.pendingWithdrawn > 0) {
            errEl.textContent = `Insufficient available balance. You have ₦${formatAmount(avail)} available (₦${formatAmount(userBal.pendingWithdrawn)} pending payout).`;
          } else {
            errEl.textContent = `Insufficient balance. Your current savings balance is ₦${formatAmount(userBal.balance)}.`;
          }
        }
        amountInput.classList.add('input-error');
        return;
      }

      // Collect destination bank details
      const bankSelect  = document.getElementById('payout-bank-select');
      const bankNameInp = document.getElementById('payout-bank-name');
      const accNumInp   = document.getElementById('payout-account-number');
      const accNameInp  = document.getElementById('payout-account-name');
      const saveCheck   = document.getElementById('payout-save-bank-checkbox');

      const bankCode = bankSelect ? bankSelect.value.trim() : '';
      const bName    = (bankNameInp && bankNameInp.value.trim()) || (document.getElementById('payout-bank-label') ? document.getElementById('payout-bank-label').textContent.trim() : 'Nigerian Bank');
      const bNum     = accNumInp ? accNumInp.value.trim().replace(/\D/g, '') : '';
      let   bAcc     = accNameInp ? accNameInp.value.trim() : '';

      if (!bankCode) {
        if (errorEl) {
          errorEl.textContent = 'Please select your destination bank.';
          errorEl.classList.remove('hidden');
        }
        const bankBtn = document.getElementById('payout-bank-btn');
        if (bankBtn) bankBtn.focus();
        return;
      }

      if (!bNum || bNum.length !== 10) {
        if (errorEl) {
          errorEl.textContent = 'Please enter a valid 10-digit Nigerian bank account number.';
          errorEl.classList.remove('hidden');
        }
        if (accNumInp) accNumInp.focus();
        return;
      }

      // If account name is not yet verified, try verifying on submit
      if (!bAcc) {
        const verifyBtn = submitText || submitBtn;
        const prevText = verifyBtn ? verifyBtn.textContent : '';
        if (verifyBtn) verifyBtn.textContent = 'Verifying Bank Account...';
        if (submitBtn) submitBtn.disabled = true;

        DB.resolveFlutterwaveAccount(bNum, bankCode, currentUserId).then(resolveRes => {
          if (submitBtn) submitBtn.disabled = false;
          if (verifyBtn) verifyBtn.textContent = prevText;

          if (resolveRes.success && resolveRes.accountName) {
            bAcc = resolveRes.accountName;
            if (accNameInp) accNameInp.value = bAcc;
          }

          proceedWithPayoutSubmission();
        }).catch(() => {
          if (submitBtn) submitBtn.disabled = false;
          if (verifyBtn) verifyBtn.textContent = prevText;
          proceedWithPayoutSubmission();
        });
        return;
      }

      proceedWithPayoutSubmission();

      function proceedWithPayoutSubmission() {
        const feeRate = 0.10;
        const fee = Math.round(amount * feeRate * 100) / 100;
        const netAmount = Math.max(0, Math.round((amount - fee) * 100) / 100);

        const destinationBank = {
          bankCode: bankCode,
          bankName: bName,
          accountNumber: bNum,
          accountName: bAcc || `${DB.formatName(user.firstName)} ${DB.formatName(user.lastName)}`,
        };

        if (saveCheck && saveCheck.checked) {
          DB.saveUserPayoutBank(currentUserId, destinationBank);
        }

        const details = `Payout to: ${bName} ${bNum} (${destinationBank.accountName}) | Net: ₦${formatAmount(netAmount)} (Fee: ₦${formatAmount(fee)})`.trim();
        const destNote = userNote ? `${userNote} | ${details}` : details;

        DB.addTransaction({
          userId: currentUserId,
          type: 'withdrawal',
          amount, // Total deducted from user's savings balance
          grossAmount: amount,
          fee: fee,
          netAmount: netAmount,
          feeRate: feeRate,
          category,
          note: destNote,
          destinationBank,
          recordedBy: 'user',
          status: 'pending',
        });

        // Reset inputs
        amountInput.value = '';
        if (noteInput) noteInput.value = '';
        updateFeeCalculations();

        if (successEl) {
          successEl.textContent = `Pay Out request submitted! Gross: ₦${formatAmount(amount)} | 10% Fee: ₦${formatAmount(fee)} | Net Transfer: ₦${formatAmount(netAmount)}. Awaiting Admin approval.`;
          successEl.classList.remove('hidden');
          setTimeout(() => successEl.classList.add('hidden'), 6000);
        }

        renderSavingsList();
        renderTotal();
      }
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

      // Email validation (optional: only validate if entered)
      const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
      if (email && !emailRegex.test(email)) {
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

      // Check email conflict (only if email is provided)
      if (email) {
        const existingEmail = DB.getUserByEmail(email);
        if (existingEmail && existingEmail.id !== currentUserId) {
          document.getElementById('edit-profile-error').textContent = 'This email is already in use by another account.';
          document.getElementById('edit-profile-error').classList.remove('hidden');
          return;
        }
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

  // ---- User Bank Account Details Modal ----
  function initUserBankDetailsModal() {
    const btn        = document.getElementById('btn-user-bank-details');
    const form       = document.getElementById('user-bank-details-form');
    const bankSelect = document.getElementById('profile-bank-select');
    const bankBtn    = document.getElementById('profile-bank-btn');
    const bankLabel  = document.getElementById('profile-bank-label');
    const accNumInp  = document.getElementById('profile-bank-account-number');
    const bankNameInp= document.getElementById('profile-bank-name');
    const accNameInp = document.getElementById('profile-bank-account-name');
    const resCard    = document.getElementById('profile-bank-resolution-card');
    const resText    = document.getElementById('profile-bank-resolution-text');
    const resIcon    = document.getElementById('profile-bank-resolution-icon');
    const errBox     = document.getElementById('user-bank-error');
    const succBox    = document.getElementById('user-bank-success');
    const removeBtn  = document.getElementById('btn-remove-user-bank');
    let resolveDebounce = null;

    // Custom Modular Picker / Bottom Sheet for Bank Selection (Bank names only, no code clutter)
    if (bankBtn) {
      bankBtn.addEventListener('click', () => {
        const bankOptions = DB.getNigerianBanks().map(b => ({
          label: b.name,
          value: b.code,
        }));
        const currentVal = bankSelect ? bankSelect.value : '';

        CustomPicker.openCustomSelect({
          title: 'Select Your Bank',
          options: bankOptions,
          selectedValue: currentVal,
          searchable: true,
          searchPlaceholder: 'Search 70+ Nigerian Banks...',
          onSelect: (opt) => {
            if (bankSelect) bankSelect.value = opt.value;
            if (bankLabel) bankLabel.textContent = opt.label;
            if (bankNameInp) bankNameInp.value = opt.label;
            triggerProfileResolution();
          },
        });
      });
    }

    function populateCurrentBankDetails() {
      if (!currentUserId) return;
      const saved = DB.getUserPayoutBank(currentUserId);
      if (errBox) errBox.classList.add('hidden');
      if (succBox) succBox.classList.add('hidden');

      if (saved && saved.accountNumber) {
        if (bankSelect) bankSelect.value = saved.bankCode || '';
        if (bankLabel && saved.bankName) bankLabel.textContent = saved.bankName;
        if (bankNameInp) bankNameInp.value = saved.bankName || '';
        if (accNumInp) accNumInp.value = saved.accountNumber || '';
        if (accNameInp) accNameInp.value = saved.accountName || '';

        if (saved.accountName && resCard && resText && resIcon) {
          resCard.classList.remove('hidden');
          resCard.style.cssText = 'margin-top: -4px; margin-bottom: 16px; padding: 10px 14px; border-radius: 8px; font-size: 13px; display: flex; align-items: center; gap: 8px; background: #f0fdf4; border: 1.5px solid #86efac; color: #166534;';
          resIcon.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>';
          resText.innerHTML = `Verified Bank Account: <strong>${escapeHtml(saved.accountName)}</strong>`;
        }
        if (removeBtn) removeBtn.classList.remove('hidden');
      } else {
        if (bankSelect) bankSelect.value = '';
        if (bankLabel) bankLabel.textContent = 'Choose Nigerian Bank';
        if (bankNameInp) bankNameInp.value = '';
        if (accNumInp) accNumInp.value = '';
        if (accNameInp) accNameInp.value = '';
        if (resCard) resCard.classList.add('hidden');
        if (removeBtn) removeBtn.classList.add('hidden');
      }
    }

    if (btn) {
      btn.addEventListener('click', () => {
        populateCurrentBankDetails();
        openModal('modal-user-bank-details');
      });
    }

    async function triggerProfileResolution() {
      if (!bankSelect || !accNumInp || !resCard || !resText || !resIcon) return;
      const bankCode = bankSelect.value.trim();
      const rawNum = accNumInp.value.replace(/\D/g, '').slice(0, 10);
      accNumInp.value = rawNum;

      if (rawNum.length < 10 || !bankCode) {
        resCard.classList.add('hidden');
        if (accNameInp) accNameInp.value = '';
        return;
      }

      resCard.classList.remove('hidden');
      resCard.style.cssText = 'margin-top: -4px; margin-bottom: 16px; padding: 10px 14px; border-radius: 8px; font-size: 13px; display: flex; align-items: center; gap: 8px; background: #fffbeb; border: 1.5px solid #fde68a; color: #92400e;';
      resIcon.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="animate-spin"><circle cx="12" cy="12" r="10" stroke-opacity="0.25"/><path d="M12 2a10 10 0 0 1 10 10"/></svg>';
      resText.textContent = 'Resolving account name with bank...';

      const res = await DB.resolveFlutterwaveAccount(rawNum, bankCode, currentUserId);

      if (res.success && res.accountName) {
        resCard.style.cssText = 'margin-top: -4px; margin-bottom: 16px; padding: 10px 14px; border-radius: 8px; font-size: 13px; display: flex; align-items: center; gap: 8px; background: #f0fdf4; border: 1.5px solid #86efac; color: #166534;';
        resIcon.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>';
        if (res.source === 'profile') {
          resText.innerHTML = `Auto-detected Account Name: <strong>${escapeHtml(res.accountName)}</strong> <span style="font-size:11.5px; opacity:0.85;">(from profile)</span>`;
        } else {
          resText.innerHTML = `Verified Bank Account: <strong>${escapeHtml(res.accountName)}</strong>`;
        }
        if (accNameInp) accNameInp.value = res.accountName;
      } else {
        resCard.style.cssText = 'margin-top: -4px; margin-bottom: 16px; padding: 10px 14px; border-radius: 8px; font-size: 13px; display: flex; align-items: center; gap: 8px; background: #fffbeb; border: 1.5px solid #fde68a; color: #92400e;';
        resIcon.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>';
        resText.textContent = 'Could not auto-verify name. Please ensure your bank and 10-digit account number are correct.';
        if (accNameInp) accNameInp.value = '';
      }
    }

    if (accNumInp) {
      accNumInp.addEventListener('input', () => {
        if (resolveDebounce) clearTimeout(resolveDebounce);
        resolveDebounce = setTimeout(triggerProfileResolution, 300);
      });
    }

    if (form) {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (errBox) errBox.classList.add('hidden');
        if (succBox) succBox.classList.add('hidden');

        const bankCode = bankSelect ? bankSelect.value.trim() : '';
        const bName = (bankNameInp && bankNameInp.value.trim()) || (bankLabel ? bankLabel.textContent.trim() : '');
        const rawNum = accNumInp ? accNumInp.value.replace(/\D/g, '').trim() : '';
        let bAcc = accNameInp ? accNameInp.value.trim() : '';

        if (!bankCode) {
          if (errBox) {
            errBox.textContent = 'Please choose your Nigerian bank from the list.';
            errBox.classList.remove('hidden');
          }
          if (bankBtn) bankBtn.focus();
          return;
        }

        if (rawNum.length !== 10) {
          if (errBox) {
            errBox.textContent = 'Please enter a valid 10-digit account number.';
            errBox.classList.remove('hidden');
          }
          return;
        }

        // If not verified yet, resolve now
        if (!bAcc) {
          const res = await DB.resolveFlutterwaveAccount(rawNum, bankCode, currentUserId);
          if (res.success && res.accountName) {
            bAcc = res.accountName;
            if (accNameInp) accNameInp.value = bAcc;
          } else {
            if (errBox) {
              errBox.textContent = 'Could not verify account with bank. Please check your account number and selected bank.';
              errBox.classList.remove('hidden');
            }
            return;
          }
        }

        const user = DB.getUserById(currentUserId);
        const resolvedName = bAcc || (user ? `${DB.formatName(user.firstName)} ${DB.formatName(user.lastName)}` : 'Client Account');

        DB.saveUserPayoutBank(currentUserId, {
          bankCode,
          bankName: bName,
          accountNumber: rawNum,
          accountName: resolvedName,
        });

        updateMoreTabBankSummary();

        if (succBox) {
          succBox.textContent = 'Bank details saved successfully!';
          succBox.classList.remove('hidden');
        }

        setTimeout(() => {
          closeModal('modal-user-bank-details');
        }, 1200);
      });
    }

    if (removeBtn) {
      removeBtn.addEventListener('click', () => {
        const users = DB.getUsers();
        const u = users.find(x => x.id === currentUserId);
        if (u) {
          delete u.payoutBank;
          DB.saveUsers(users);
        }
        populateCurrentBankDetails();
        updateMoreTabBankSummary();
        if (succBox) {
          succBox.textContent = 'Bank details removed.';
          succBox.classList.remove('hidden');
          setTimeout(() => succBox.classList.add('hidden'), 2500);
        }
      });
    }
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
      initUserBankDetailsModal();
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
