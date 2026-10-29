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
        if (titleEl) titleEl.textContent = 'Request Payout';
        if (subtitleEl) subtitleEl.textContent = 'Submit a withdrawal request to receive cash or bank transfer from Admin';
        if (flwCard) flwCard.classList.add('hidden');
        if (flwTrust) flwTrust.classList.add('hidden');
        if (quickAmts) quickAmts.classList.add('hidden');
        if (withDest) withDest.classList.remove('hidden');
        if (submitText) submitText.textContent = 'Submit Pay Out Request';
        else if (submitBtn) submitBtn.textContent = 'Submit Pay Out Request';
      }
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

      // Collect optional destination bank details
      const bankNameInp = document.getElementById('payout-bank-name');
      const accNumInp   = document.getElementById('payout-account-number');
      const accNameInp  = document.getElementById('payout-account-name');

      let destNote = userNote;
      const bName = bankNameInp ? bankNameInp.value.trim() : '';
      const bNum  = accNumInp ? accNumInp.value.trim() : '';
      const bAcc  = accNameInp ? accNameInp.value.trim() : '';

      if (bName || bNum || bAcc) {
        const details = `Send to: ${bName} ${bNum} (${bAcc})`.trim();
        destNote = destNote ? `${destNote} | ${details}` : details;
      }

      DB.addTransaction({
        userId: currentUserId,
        type: 'withdrawal',
        amount,
        category,
        note: destNote,
        recordedBy: 'user',
        status: 'pending',
      });

      // Reset form
      amountInput.value = '';
      if (noteInput) noteInput.value = '';
      if (bankNameInp) bankNameInp.value = '';
      if (accNumInp) accNumInp.value = '';
      if (accNameInp) accNameInp.value = '';

      if (successEl) {
        successEl.textContent = `₦${formatAmount(amount)} Pay Out request submitted! Awaiting Admin approval.`;
        successEl.classList.remove('hidden');
        setTimeout(() => successEl.classList.add('hidden'), 4500);
      }

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
