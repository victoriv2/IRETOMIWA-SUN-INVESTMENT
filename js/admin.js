// ============================================
// ADMIN.JS - Sun Investment Admin Portal Logic
// Handles 5 Admin Tabs:
// 1. Users: All registered clients, balances, ledger modal
// 2. Received: Physical cash collected from clients (inflows)
// 3. Record (+): Cashier ledger action to record deposit/payout
// 4. Payouts: Physical cash disbursed to clients (outflows)
// 5. More: Admin profile, stats, password change, logout
// Strictly NO EMOJIS! All icons are inline SVGs.
// ============================================

const AdminApp = (() => {
  // Navigation State
  let currentTab = 'users';

  // Filter States
  let recPeriod = 'day';
  let recFilterDate = new Date().toISOString().slice(0, 10);

  let payPeriod = 'day';
  let payFilterDate = new Date().toISOString().slice(0, 10);

  // Password toggle SVGs
  const eyeOpenSVG = `<svg class="eye-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`;
  const eyeOffSVG  = `<svg class="eye-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`;

  // ---- Format Helpers ----
  function formatAmount(n) {
    return Number(n || 0).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function escapeHtml(str) {
    const d = document.createElement('div');
    d.textContent = str || '';
    return d.innerHTML;
  }

  function formatDateTime(isoString) {
    if (!isoString) return '-';
    const d = new Date(isoString);
    const datePart = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    const timePart = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: true });
    return `${datePart}, ${timePart}`;
  }

  function isoToYM(iso) { return iso.slice(0, 7); }
  function isoToY(iso)  { return iso.slice(0, 4); }

  function filterTxByPeriod(txs, period, selectedDate) {
    return txs.filter(t => {
      const d = (t.createdAt || '').slice(0, 10);
      if (period === 'day')   return d === selectedDate;
      if (period === 'month') return isoToYM(t.createdAt) === isoToYM(selectedDate + 'T00:00:00');
      if (period === 'year')  return isoToY(t.createdAt) === isoToY(selectedDate);
      return true;
    });
  }

  // ============================================
  // TAB NAVIGATION
  // ============================================
  function switchTab(tabName) {
    currentTab = tabName;
    try {
      localStorage.setItem('sun_admin_tab', tabName);
    } catch(e) {}

    // Update bottom tab buttons
    document.querySelectorAll('.tab-btn[data-admin-tab]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.adminTab === tabName);
    });

    // Toggle tab panels
    const tabMap = {
      users: 'admin-tab-users-content',
      received: 'admin-tab-received-content',
      record: 'admin-tab-record-content',
      payouts: 'admin-tab-payouts-content',
      more: 'admin-tab-more-content',
    };

    Object.keys(tabMap).forEach(key => {
      const el = document.getElementById(tabMap[key]);
      if (el) {
        if (key === tabName) {
          el.classList.remove('hidden');
        } else {
          el.classList.add('hidden');
        }
      }
    });

    // Refresh data for active tab
    if (tabName === 'users')    renderUsersTab();
    if (tabName === 'received') renderReceivedTab();
    if (tabName === 'record')   setupRecordTab();
    if (tabName === 'payouts')  renderPayoutsTab();
    if (tabName === 'more')     renderMoreTab();
  }

  function initTabs() {
    document.querySelectorAll('.tab-btn[data-admin-tab]').forEach(btn => {
      btn.addEventListener('click', () => {
        switchTab(btn.dataset.adminTab);
      });
    });
  }

  // ============================================
  // TAB 1: USERS TAB
  // ============================================
  function renderUsersTab() {
    const users = DB.getUsers();
    const systemTotals = DB.getSystemTotals();

    // Top Summary Cards
    const balEl = document.getElementById('admin-total-balance');
    const usrEl = document.getElementById('admin-user-count');
    const depEl = document.getElementById('admin-all-deposits');
    const payEl = document.getElementById('admin-all-payouts');

    if (balEl) balEl.textContent = '₦' + formatAmount(systemTotals.totalBalance);
    if (usrEl) usrEl.textContent = users.length;
    if (depEl) depEl.textContent = '₦' + formatAmount(systemTotals.totalDeposited);
    if (payEl) payEl.textContent = '₦' + formatAmount(systemTotals.totalWithdrawn);

    // Filter by search query
    const searchInput = document.getElementById('admin-user-search');
    const q = searchInput ? searchInput.value.trim().toLowerCase() : '';

    const filteredUsers = users.filter(u => {
      if (!q) return true;
      const fullName = `${u.firstName || ''} ${u.lastName || ''}`.toLowerCase();
      const phone = (u.phone || '').toLowerCase();
      const email = (u.email || '').toLowerCase();
      return fullName.includes(q) || phone.includes(q) || email.includes(q);
    });

    const counterLabel = document.getElementById('admin-users-counter-label');
    if (counterLabel) {
      counterLabel.textContent = q ? `Showing ${filteredUsers.length} of ${users.length} clients` : `Showing all ${users.length} clients`;
    }

    const tbody = document.getElementById('admin-users-table-body');
    if (!tbody) return;

    if (filteredUsers.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" class="table-empty">${q ? 'No clients match your search.' : 'No registered clients found.'}</td></tr>`;
      return;
    }

    tbody.innerHTML = filteredUsers.map(u => {
      const userBalances = DB.getUserBalance(u.id);
      const fullName = DB.formatName(u.firstName) + ' ' + DB.formatName(u.lastName);

      return `
        <tr>
          <td class="user-name-cell">${escapeHtml(fullName)}</td>
          <td>${escapeHtml(u.phone)}</td>
          <td>${escapeHtml(u.email)}</td>
          <td class="amount-cell amount-cell--deposit">₦${formatAmount(userBalances.totalDeposited)}</td>
          <td class="amount-cell amount-cell--payout">₦${formatAmount(userBalances.totalWithdrawn)}</td>
          <td class="amount-cell" style="font-size:15px; font-weight:800;">₦${formatAmount(userBalances.balance)}</td>
          <td>
            <button type="button" class="btn-view" data-user-id="${escapeHtml(u.id)}">View Ledger</button>
          </td>
        </tr>`;
    }).join('');

    // Bind View Ledger buttons
    tbody.querySelectorAll('.btn-view').forEach(btn => {
      btn.addEventListener('click', () => openUserProfile(btn.dataset.userId));
    });
  }

  function initUserSearch() {
    const input = document.getElementById('admin-user-search');
    if (!input) return;
    input.addEventListener('input', () => {
      renderUsersTab();
    });
  }

  // Modal: View User Profile & Complete Ledger History
  function openUserProfile(userId) {
    const user = DB.getUserById(userId);
    if (!user) return;

    const userBal = DB.getUserBalance(userId);
    const txs = DB.getTransactions(userId);
    const joined = user.joinedAt
      ? new Date(user.joinedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
      : '-';

    const fnEl = document.getElementById('vp-fullname');
    const emEl = document.getElementById('vp-email');
    const phEl = document.getElementById('vp-phone');
    const depEl = document.getElementById('vp-deposited');
    const wthEl = document.getElementById('vp-withdrawn');
    const balEl = document.getElementById('vp-balance');
    const jnEl = document.getElementById('vp-joined');
    const initEl = document.getElementById('vp-initials');

    if (fnEl) fnEl.textContent = DB.formatName(user.firstName) + ' ' + DB.formatName(user.lastName);
    if (emEl) emEl.textContent = user.email;
    if (phEl) phEl.textContent = user.phone;
    if (depEl) depEl.textContent = '₦' + formatAmount(userBal.totalDeposited);
    if (wthEl) wthEl.textContent = '₦' + formatAmount(userBal.totalWithdrawn);
    if (balEl) balEl.textContent = '₦' + formatAmount(userBal.balance);
    if (jnEl) jnEl.textContent = joined;
    if (initEl) {
      const i1 = (user.firstName || '').trim().charAt(0);
      const i2 = (user.lastName || '').trim().charAt(0);
      initEl.textContent = (i1 + i2).toUpperCase() || 'U';
    }

    // Render client ledger table
    const tbody = document.getElementById('vp-ledger-tbody');
    if (tbody) {
      if (txs.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="table-empty">No transaction records found for this client.</td></tr>`;
      } else {
        tbody.innerHTML = txs.map(t => {
          const isDeposit = (t.type || 'deposit') === 'deposit';
          const badgeClass = isDeposit ? 'tx-badge--deposit' : 'tx-badge--payout';
          const badgeText = isDeposit ? 'Deposit' : 'Payout';
          const amtPrefix = isDeposit ? '+₦' : '-₦';
          const amtClass  = isDeposit ? 'amount-cell--deposit' : 'amount-cell--payout';

          return `
            <tr>
              <td>${formatDateTime(t.createdAt)}</td>
              <td><span class="tx-badge ${badgeClass}">${badgeText}</span></td>
              <td>${escapeHtml(t.category || 'General Savings')}</td>
              <td class="amount-cell ${amtClass}">${amtPrefix}${formatAmount(t.amount)}</td>
              <td>${escapeHtml(t.note || '-')}</td>
            </tr>`;
        }).join('');
      }
    }

    const modal = document.getElementById('modal-user-profile');
    if (modal) modal.classList.remove('hidden');
  }

  // ============================================
  // TAB 2: RECEIVED TAB (INFLOWS TO SAVE)
  // ============================================
  const todayDateObj = new Date();
  let recDay   = todayDateObj.getDate();
  let recMonth = todayDateObj.getMonth();
  let recYear  = todayDateObj.getFullYear();

  function pad(n) { return n < 10 ? '0' + n : '' + n; }

  function buildRecDateISO() {
    return `${recYear}-${pad(recMonth + 1)}-${pad(recDay)}`;
  }

  function updateReceivedFilterButtons() {
    const dayValEl   = document.getElementById('admin-rec-day-val');
    const monthValEl = document.getElementById('admin-rec-month-val');
    const yearValEl  = document.getElementById('admin-rec-year-val');

    const isToday = (recDay === todayDateObj.getDate() && recMonth === todayDateObj.getMonth() && recYear === todayDateObj.getFullYear());

    if (dayValEl)   dayValEl.textContent   = isToday ? `Today (${recDay})` : `Day ${recDay}`;
    if (monthValEl) monthValEl.textContent = CustomPicker.formatMonthLabel(new Date(recYear, recMonth, 1));
    if (yearValEl)  yearValEl.textContent  = '' + recYear;

    const dayBtn   = document.getElementById('admin-rec-filter-day');
    const monthBtn = document.getElementById('admin-rec-filter-month');
    const yearBtn  = document.getElementById('admin-rec-filter-year');

    if (dayBtn)   dayBtn.classList.toggle('active', recPeriod === 'day');
    if (monthBtn) monthBtn.classList.toggle('active', recPeriod === 'month');
    if (yearBtn)  yearBtn.classList.toggle('active', recPeriod === 'year');
  }

  function initReceivedPicker() {
    const dayBtn   = document.getElementById('admin-rec-filter-day');
    const monthBtn = document.getElementById('admin-rec-filter-month');
    const yearBtn  = document.getElementById('admin-rec-filter-year');

    if (dayBtn) {
      dayBtn.addEventListener('click', () => {
        CustomPicker.openDayModal({
          selectedDay: recDay,
          onSelect: (dayNum) => {
            recDay = dayNum;
            recPeriod = 'day';
            recFilterDate = buildRecDateISO();
            updateReceivedFilterButtons();
            renderReceivedTab();
          },
        });
      });
    }

    if (monthBtn) {
      monthBtn.addEventListener('click', () => {
        CustomPicker.openMonthModal({
          selectedMonth: recMonth,
          onSelect: (monthIdx) => {
            recMonth = monthIdx;
            recPeriod = 'month';
            recFilterDate = buildRecDateISO();
            updateReceivedFilterButtons();
            renderReceivedTab();
          },
        });
      });
    }

    if (yearBtn) {
      yearBtn.addEventListener('click', () => {
        CustomPicker.openYearModal({
          selectedYear: recYear,
          onSelect: (yearNum) => {
            recYear = yearNum;
            recPeriod = 'year';
            recFilterDate = buildRecDateISO();
            updateReceivedFilterButtons();
            renderReceivedTab();
          },
        });
      });
    }
  }

  function renderReceivedTab() {
    updateReceivedFilterButtons();

    const allTx = DB.getAllTransactions();
    const deposits = allTx.filter(t => (t.type || 'deposit') === 'deposit');
    const filtered = deposits.filter(t => {
      if (recPeriod === 'day')   return (t.createdAt || '').slice(0, 10) === buildRecDateISO();
      if (recPeriod === 'month') return (t.createdAt || '').slice(0, 7) === `${recYear}-${pad(recMonth + 1)}`;
      if (recPeriod === 'year')  return (t.createdAt || '').slice(0, 4) === ('' + recYear);
      return true;
    });

    const totalAmt = filtered.reduce((sum, t) => sum + (parseFloat(t.amount) || 0), 0);

    const totalEl = document.getElementById('admin-received-total');
    const countEl = document.getElementById('admin-received-count');
    if (totalEl) totalEl.textContent = '₦' + formatAmount(totalAmt);
    if (countEl) countEl.textContent = filtered.length;

    const tbody = document.getElementById('admin-received-table-body');
    if (!tbody) return;

    if (filtered.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" class="table-empty">No money received records for this period.</td></tr>`;
      return;
    }

    tbody.innerHTML = filtered.map(t => {
      const user = DB.getUserById(t.userId);
      const userName = user ? (DB.formatName(user.firstName) + ' ' + DB.formatName(user.lastName)) : 'Unknown Client';
      const phone = user ? user.phone : '-';

      return `
        <tr>
          <td>${formatDateTime(t.createdAt)}</td>
          <td class="user-name-cell">${escapeHtml(userName)}</td>
          <td>${escapeHtml(phone)}</td>
          <td><span class="tx-badge tx-badge--deposit">${escapeHtml(t.category || 'General Savings')}</span></td>
          <td class="amount-cell amount-cell--deposit">+₦${formatAmount(t.amount)}</td>
          <td>${escapeHtml(t.note || '-')}</td>
        </tr>`;
    }).join('');
  }

  // ============================================
  // TAB 3: PLUS (+) TAB - RECORD PHYSICAL CASH
  // ============================================
  const SAVINGS_CATEGORIES = [
    { label: 'General Savings', value: 'General Savings' },
    { label: 'Daily Thrift', value: 'Daily Thrift' },
    { label: 'Target Savings', value: 'Target Savings' },
    { label: 'Weekly Contribution', value: 'Weekly Contribution' },
    { label: 'Emergency Fund', value: 'Emergency Fund' },
    { label: 'Business Savings', value: 'Business Savings' },
  ];

  function setupRecordTab() {
    // Populate client selector if previously empty or refreshed
    const clientIdInput = document.getElementById('admin-record-client-id');
    const clientLabel   = document.getElementById('admin-record-client-label');
    if (clientIdInput && clientIdInput.value) {
      const u = DB.getUserById(clientIdInput.value);
      if (u && clientLabel) {
        clientLabel.textContent = DB.formatName(u.firstName) + ' ' + DB.formatName(u.lastName) + ' (' + u.phone + ')';
      }
    }
  }

  function initRecordForm() {
    // 1. Transaction Type segmented button
    const depBtn = document.getElementById('btn-admin-type-deposit');
    const payBtn = document.getElementById('btn-admin-type-payout');
    const typeInput = document.getElementById('admin-record-type');
    const submitBtn = document.getElementById('admin-record-submit-btn');

    if (depBtn && payBtn && typeInput) {
      depBtn.addEventListener('click', () => {
        depBtn.classList.add('active');
        payBtn.classList.remove('active');
        typeInput.value = 'deposit';
        if (submitBtn) submitBtn.textContent = 'Record Physical Deposit';
      });

      payBtn.addEventListener('click', () => {
        payBtn.classList.add('active');
        depBtn.classList.remove('active');
        typeInput.value = 'payout';
        if (submitBtn) submitBtn.textContent = 'Record Physical Payout';
      });
    }

    // 2. Client Picker Modal
    const clientBtn = document.getElementById('admin-record-client-btn');
    if (clientBtn) {
      clientBtn.addEventListener('click', () => {
        const users = DB.getUsers();
        if (users.length === 0) {
          alert('No registered clients exist yet. Please register a client first.');
          return;
        }

        const options = users.map(u => ({
          label: `${DB.formatName(u.firstName)} ${DB.formatName(u.lastName)} (${u.phone})`,
          value: u.id,
        }));

        const currentId = (document.getElementById('admin-record-client-id') || {}).value;

        CustomPicker.openCustomSelect({
          title: 'Select Client / User',
          options,
          selectedValue: currentId,
          onSelect: (opt) => {
            const labelEl = document.getElementById('admin-record-client-label');
            const idEl    = document.getElementById('admin-record-client-id');
            const errEl   = document.getElementById('err-admin-record-client');
            if (labelEl) labelEl.textContent = opt.label;
            if (idEl)    idEl.value = opt.value;
            if (errEl)   errEl.textContent = '';
          },
        });
      });
    }

    // 3. Quick Amount Pills
    document.querySelectorAll('.quick-amount-btn[data-amt]').forEach(pill => {
      pill.addEventListener('click', () => {
        const amtInput = document.getElementById('admin-record-amount');
        if (!amtInput) return;
        const current = parseFloat(amtInput.value) || 0;
        const add = parseFloat(pill.dataset.amt) || 0;
        amtInput.value = (current + add).toFixed(2);
      });
    });

    // 4. Category Selector
    const catBtn = document.getElementById('admin-record-category-btn');
    if (catBtn) {
      catBtn.addEventListener('click', () => {
        const catInput = document.getElementById('admin-record-category');
        const currentCat = catInput ? catInput.value : 'General Savings';

        CustomPicker.openCustomSelect({
          title: 'Select Savings Category',
          options: SAVINGS_CATEGORIES,
          selectedValue: currentCat,
          onSelect: (opt) => {
            const labelEl = document.getElementById('admin-record-category-label');
            if (labelEl)  labelEl.textContent = opt.label;
            if (catInput) catInput.value = opt.value;
          },
        });
      });
    }

    // 5. Submit Handler
    const form = document.getElementById('admin-record-form');
    if (!form) return;

    form.addEventListener('submit', (e) => {
      e.preventDefault();

      const errClient = document.getElementById('err-admin-record-client');
      const errAmt    = document.getElementById('err-admin-record-amount');
      const errBox    = document.getElementById('admin-record-error');
      const succBox   = document.getElementById('admin-record-success');

      if (errClient) errClient.textContent = '';
      if (errAmt)    errAmt.textContent = '';
      if (errBox)    errBox.classList.add('hidden');
      if (succBox)   succBox.classList.add('hidden');

      const clientId = (document.getElementById('admin-record-client-id') || {}).value;
      const type     = (document.getElementById('admin-record-type') || {}).value || 'deposit';
      const amtVal   = (document.getElementById('admin-record-amount') || {}).value;
      const catVal   = (document.getElementById('admin-record-category') || {}).value || 'General Savings';
      const noteVal  = ((document.getElementById('admin-record-note') || {}).value || '').trim();

      let valid = true;

      if (!clientId) {
        if (errClient) errClient.textContent = 'Please select a client.';
        valid = false;
      }

      const amount = parseFloat(amtVal);
      if (!amtVal || isNaN(amount) || amount <= 0) {
        if (errAmt) errAmt.textContent = 'Enter a valid amount greater than ₦0.';
        valid = false;
      }

      if (!valid) return;

      const client = DB.getUserById(clientId);
      if (!client) {
        if (errClient) errClient.textContent = 'Selected client could not be found.';
        return;
      }

      // If Payout, check if client has enough active savings balance
      if (type === 'payout' || type === 'withdrawal') {
        const clientBalance = DB.getUserBalance(clientId).balance;
        if (amount > clientBalance) {
          if (errBox) {
            errBox.textContent = `Insufficient balance. Client only has ₦${formatAmount(clientBalance)} in active savings.`;
            errBox.classList.remove('hidden');
          }
          return;
        }
      }

      // Add transaction to DB
      DB.addTransaction({
        userId: clientId,
        type: type,
        amount: amount,
        category: catVal,
        note: noteVal,
        recordedBy: 'admin',
      });

      // Show success
      const clientName = DB.formatName(client.firstName) + ' ' + DB.formatName(client.lastName);
      if (succBox) {
        succBox.textContent = type === 'deposit'
          ? `Successfully recorded physical deposit of ₦${formatAmount(amount)} for ${clientName}.`
          : `Successfully recorded physical payout of ₦${formatAmount(amount)} to ${clientName}.`;
        succBox.classList.remove('hidden');
      }

      // Reset form fields
      const amtInput = document.getElementById('admin-record-amount');
      const noteInput = document.getElementById('admin-record-note');
      if (amtInput) amtInput.value = '';
      if (noteInput) noteInput.value = '';

      // Refresh totals across tabs
      renderUsersTab();
      renderReceivedTab();
      renderPayoutsTab();
      renderMoreTab();
    });
  }

  // ============================================
  // TAB 4: PAYOUTS TAB (OUTFLOWS DISBURSED)
  // ============================================
  let payDay   = todayDateObj.getDate();
  let payMonth = todayDateObj.getMonth();
  let payYear  = todayDateObj.getFullYear();

  function buildPayDateISO() {
    return `${payYear}-${pad(payMonth + 1)}-${pad(payDay)}`;
  }

  function updatePayoutsFilterButtons() {
    const dayValEl   = document.getElementById('admin-pay-day-val');
    const monthValEl = document.getElementById('admin-pay-month-val');
    const yearValEl  = document.getElementById('admin-pay-year-val');

    const isToday = (payDay === todayDateObj.getDate() && payMonth === todayDateObj.getMonth() && payYear === todayDateObj.getFullYear());

    if (dayValEl)   dayValEl.textContent   = isToday ? `Today (${payDay})` : `Day ${payDay}`;
    if (monthValEl) monthValEl.textContent = CustomPicker.formatMonthLabel(new Date(payYear, payMonth, 1));
    if (yearValEl)  yearValEl.textContent  = '' + payYear;

    const dayBtn   = document.getElementById('admin-pay-filter-day');
    const monthBtn = document.getElementById('admin-pay-filter-month');
    const yearBtn  = document.getElementById('admin-pay-filter-year');

    if (dayBtn)   dayBtn.classList.toggle('active', payPeriod === 'day');
    if (monthBtn) monthBtn.classList.toggle('active', payPeriod === 'month');
    if (yearBtn)  yearBtn.classList.toggle('active', payPeriod === 'year');
  }

  function initPayoutsPicker() {
    const dayBtn   = document.getElementById('admin-pay-filter-day');
    const monthBtn = document.getElementById('admin-pay-filter-month');
    const yearBtn  = document.getElementById('admin-pay-filter-year');

    if (dayBtn) {
      dayBtn.addEventListener('click', () => {
        CustomPicker.openDayModal({
          selectedDay: payDay,
          onSelect: (dayNum) => {
            payDay = dayNum;
            payPeriod = 'day';
            payFilterDate = buildPayDateISO();
            updatePayoutsFilterButtons();
            renderPayoutsTab();
          },
        });
      });
    }

    if (monthBtn) {
      monthBtn.addEventListener('click', () => {
        CustomPicker.openMonthModal({
          selectedMonth: payMonth,
          onSelect: (monthIdx) => {
            payMonth = monthIdx;
            payPeriod = 'month';
            payFilterDate = buildPayDateISO();
            updatePayoutsFilterButtons();
            renderPayoutsTab();
          },
        });
      });
    }

    if (yearBtn) {
      yearBtn.addEventListener('click', () => {
        CustomPicker.openYearModal({
          selectedYear: payYear,
          onSelect: (yearNum) => {
            payYear = yearNum;
            payPeriod = 'year';
            payFilterDate = buildPayDateISO();
            updatePayoutsFilterButtons();
            renderPayoutsTab();
          },
        });
      });
    }
  }

  function renderPayoutsTab() {
    updatePayoutsFilterButtons();

    const allTx = DB.getAllTransactions();
    const payouts = allTx.filter(t => t.type === 'payout' || t.type === 'withdrawal');
    const filtered = payouts.filter(t => {
      if (payPeriod === 'day')   return (t.createdAt || '').slice(0, 10) === buildPayDateISO();
      if (payPeriod === 'month') return (t.createdAt || '').slice(0, 7) === `${payYear}-${pad(payMonth + 1)}`;
      if (payPeriod === 'year')  return (t.createdAt || '').slice(0, 4) === ('' + payYear);
      return true;
    });

    const totalAmt = filtered.reduce((sum, t) => sum + (parseFloat(t.amount) || 0), 0);

    const totalEl = document.getElementById('admin-payouts-total');
    const countEl = document.getElementById('admin-payouts-count');
    if (totalEl) totalEl.textContent = '₦' + formatAmount(totalAmt);
    if (countEl) countEl.textContent = filtered.length;

    const tbody = document.getElementById('admin-payouts-table-body');
    if (!tbody) return;

    if (filtered.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" class="table-empty">No payout records for this period.</td></tr>`;
      return;
    }

    tbody.innerHTML = filtered.map(t => {
      const user = DB.getUserById(t.userId);
      const userName = user ? (DB.formatName(user.firstName) + ' ' + DB.formatName(user.lastName)) : 'Unknown Client';
      const phone = user ? user.phone : '-';

      return `
        <tr>
          <td>${formatDateTime(t.createdAt)}</td>
          <td class="user-name-cell">${escapeHtml(userName)}</td>
          <td>${escapeHtml(phone)}</td>
          <td><span class="tx-badge tx-badge--payout">${escapeHtml(t.category || 'General Savings')}</span></td>
          <td class="amount-cell amount-cell--payout">-₦${formatAmount(t.amount)}</td>
          <td>${escapeHtml(t.note || '-')}</td>
        </tr>`;
    }).join('');
  }

  // ============================================
  // TAB 5: MORE TAB
  // ============================================
  function renderMoreTab() {
    const admin = DB.getAdmin();
    const systemTotals = DB.getSystemTotals();

    const nameEl  = document.getElementById('admin-more-name');
    const emailEl = document.getElementById('admin-more-email');
    if (nameEl)  nameEl.textContent = 'System Administrator';
    if (emailEl) emailEl.textContent = admin.email;

    const uEl = document.getElementById('more-stat-users');
    const bEl = document.getElementById('more-stat-balance');
    const dEl = document.getElementById('more-stat-deposits');
    const pEl = document.getElementById('more-stat-payouts');

    if (uEl) uEl.textContent = systemTotals.userCount;
    if (bEl) bEl.textContent = '₦' + formatAmount(systemTotals.totalBalance);
    if (dEl) dEl.textContent = '₦' + formatAmount(systemTotals.totalDeposited);
    if (pEl) pEl.textContent = '₦' + formatAmount(systemTotals.totalWithdrawn);
  }

  // Admin Change Password Modal
  function initAdminChangePassword() {
    const openBtn = document.getElementById('btn-admin-change-pw');
    const modal   = document.getElementById('modal-admin-change-password');
    const form    = document.getElementById('admin-change-password-form');

    if (openBtn && modal) {
      openBtn.addEventListener('click', () => {
        const errCurrent = document.getElementById('err-admin-cp-current');
        const errNew     = document.getElementById('err-admin-cp-new');
        const errConf    = document.getElementById('err-admin-cp-confirm');
        const errBox     = document.getElementById('admin-cp-error');
        const succBox    = document.getElementById('admin-cp-success');

        if (errCurrent) errCurrent.textContent = '';
        if (errNew)     errNew.textContent = '';
        if (errConf)    errConf.textContent = '';
        if (errBox)     errBox.classList.add('hidden');
        if (succBox)    succBox.classList.add('hidden');

        const f = document.getElementById('admin-change-password-form');
        if (f) f.reset();

        ['admin-cp-current', 'admin-cp-new', 'admin-cp-confirm'].forEach(id => {
          const inp = document.getElementById(id);
          if (inp) inp.type = 'password';
          const btn = document.querySelector(`.toggle-pw[data-target="${id}"]`);
          if (btn) {
            btn.innerHTML = eyeOpenSVG;
            btn.setAttribute('aria-label', 'Show password');
            btn.classList.remove('active');
          }
        });

        initPasswordToggles();
        modal.classList.remove('hidden');
      });
    }

    if (form) {
      form.addEventListener('submit', (e) => {
        e.preventDefault();

        const errCurrent = document.getElementById('err-admin-cp-current');
        const errNew     = document.getElementById('err-admin-cp-new');
        const errConf    = document.getElementById('err-admin-cp-confirm');
        const errBox     = document.getElementById('admin-cp-error');
        const succBox    = document.getElementById('admin-cp-success');

        if (errCurrent) errCurrent.textContent = '';
        if (errNew)     errNew.textContent = '';
        if (errConf)    errConf.textContent = '';
        if (errBox)     errBox.classList.add('hidden');
        if (succBox)    succBox.classList.add('hidden');

        const currentVal = (document.getElementById('admin-cp-current') || {}).value;
        const newVal     = (document.getElementById('admin-cp-new') || {}).value;
        const confVal    = (document.getElementById('admin-cp-confirm') || {}).value;

        const admin = DB.getAdmin();
        let valid = true;

        if (!currentVal) {
          if (errCurrent) errCurrent.textContent = 'Current password is required.';
          valid = false;
        } else if (currentVal !== admin.password) {
          if (errCurrent) errCurrent.textContent = 'Incorrect current password.';
          valid = false;
        }

        if (!newVal) {
          if (errNew) errNew.textContent = 'New password is required.';
          valid = false;
        } else if (newVal.length < 6) {
          if (errNew) errNew.textContent = 'Password must be at least 6 characters.';
          valid = false;
        } else if (!/[A-Z]/.test(newVal)) {
          if (errNew) errNew.textContent = 'Password must include at least 1 uppercase letter.';
          valid = false;
        } else if (!/[0-9]/.test(newVal)) {
          if (errNew) errNew.textContent = 'Password must include at least 1 number.';
          valid = false;
        } else if (!/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(newVal)) {
          if (errNew) errNew.textContent = 'Password must include at least 1 symbol.';
          valid = false;
        }

        if (!confVal) {
          if (errConf) errConf.textContent = 'Please confirm the new password.';
          valid = false;
        } else if (newVal !== confVal) {
          if (errConf) errConf.textContent = 'Passwords do not match.';
          valid = false;
        }

        if (!valid) return;

        DB.updateAdminPassword(newVal);

        if (succBox) {
          succBox.textContent = 'Admin password updated successfully.';
          succBox.classList.remove('hidden');
        }

        setTimeout(() => {
          if (modal) modal.classList.add('hidden');
        }, 1200);
      });
    }
  }

  // ============================================
  // AUTHENTICATION & LOGIN/LOGOUT
  // ============================================
  function showView(view) {
    const loginEl = document.getElementById('page-admin-login');
    const dashEl  = document.getElementById('page-admin');
    if (view === 'dashboard') {
      try {
        document.documentElement.classList.add('is-admin-logged-in');
      } catch(e) {}
      if (loginEl) {
        loginEl.classList.remove('active');
        loginEl.style.display = 'none';
      }
      if (dashEl) {
        dashEl.classList.add('active');
        dashEl.style.display = 'flex';
      }
      let savedTab = 'users';
      try {
        savedTab = localStorage.getItem('sun_admin_tab') || 'users';
      } catch(e) {}
      switchTab(savedTab);
    } else {
      try {
        document.documentElement.classList.remove('is-admin-logged-in');
      } catch(e) {}
      if (dashEl) {
        dashEl.classList.remove('active');
        dashEl.style.display = 'none';
      }
      if (loginEl) {
        loginEl.classList.add('active');
        loginEl.style.display = 'flex';
        const adminPw = document.getElementById('admin-password');
        if (adminPw) adminPw.type = 'password';
        const adminPwBtn = document.querySelector('.toggle-pw[data-target="admin-password"]');
        if (adminPwBtn) {
          adminPwBtn.innerHTML = eyeOpenSVG;
          adminPwBtn.setAttribute('aria-label', 'Show password');
          adminPwBtn.classList.remove('active');
        }
        initPasswordToggles();
      }
    }
  }

  function initLoginForm() {
    const form = document.getElementById('admin-login-form');
    if (!form) return;

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const errEmail = document.getElementById('err-admin-email');
      const errPw    = document.getElementById('err-admin-password');
      const errGen   = document.getElementById('admin-login-error');
      if (errEmail) errEmail.textContent = '';
      if (errPw)    errPw.textContent = '';
      if (errGen)   errGen.classList.add('hidden');

      const emailInput = document.getElementById('admin-email');
      const pwInput    = document.getElementById('admin-password');
      const email = emailInput ? emailInput.value.trim() : '';
      const pw    = pwInput ? pwInput.value : '';

      let valid = true;
      if (!email) {
        if (errEmail) errEmail.textContent = 'Admin email is required.';
        valid = false;
      }
      if (!pw) {
        if (errPw) errPw.textContent = 'Password is required.';
        valid = false;
      }
      if (!valid) return;

      const admin = DB.getAdmin();
      if (email.toLowerCase() === admin.email.toLowerCase() && pw === admin.password) {
        DB.setAdminSession({ role: 'admin' });
        if (window.App) {
          App.navigate('admin');
        } else {
          showView('dashboard');
        }
      } else {
        if (errGen) {
          errGen.textContent = 'Invalid administrator credentials.';
          errGen.classList.remove('hidden');
        }
      }
    });
  }

  function initLogout() {
    const handleLogout = () => {
      DB.clearAdminSession();
      try {
        document.documentElement.classList.remove('is-admin-logged-in');
      } catch(e) {}
      if (window.App) {
        App.navigate('adminLogin');
      } else if (document.getElementById('page-admin-login')) {
        showView('login');
      } else {
        window.location.href = '../index.html';
      }
    };

    const headerLogout = document.getElementById('admin-logout');
    if (headerLogout) headerLogout.addEventListener('click', handleLogout);

    const tabLogout = document.getElementById('btn-admin-logout-tab');
    if (tabLogout) tabLogout.addEventListener('click', handleLogout);

    // Return to User Portal buttons
    const userSideBtn = document.getElementById('admin-to-user-side');
    if (userSideBtn) {
      userSideBtn.addEventListener('click', () => {
        if (window.App) {
          const uSession = DB.getSession();
          if (uSession && uSession.userId) {
            App.navigate('user');
          } else {
            App.navigate('login');
          }
        } else {
          window.location.href = '../index.html';
        }
      });
    }

    const tabUserSideBtn = document.getElementById('btn-admin-to-user-tab');
    if (tabUserSideBtn) {
      tabUserSideBtn.addEventListener('click', () => {
        if (window.App) {
          const uSession = DB.getSession();
          if (uSession && uSession.userId) {
            App.navigate('user');
          } else {
            App.navigate('login');
          }
        } else {
          window.location.href = '../index.html';
        }
      });
    }
  }

  // Password visibility eye icon toggles on Admin side (Login & Modals)
  function initPasswordToggles() {
    const adminToggleBtns = document.querySelectorAll(
      '#page-admin-login .toggle-pw, #modal-admin-change-password .toggle-pw'
    );
    adminToggleBtns.forEach(btn => {
      if (btn._hasAdminToggleBound) return;
      btn._hasAdminToggleBound = true;

      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();

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
    });
  }

  // Generic modal close handler - handled universally by user.js and picker.js
  function initModalCloseHandlers() {}

  // ============================================
  // BOOTSTRAP
  // ============================================
  function initOnce(skipNavigation) {
    initLoginForm();
    initPasswordToggles();
    initTabs();
    initUserSearch();
    initReceivedPicker();
    initRecordForm();
    initPayoutsPicker();
    initAdminChangePassword();
    initLogout();
    initModalCloseHandlers();

    // Ensure admin credentials exist
    DB.getAdmin();

    // Session check - only navigate if not delegated to main App router
    if (!skipNavigation) {
      const session = DB.getAdminSession();
      if (session) {
        showView('dashboard');
      } else {
        showView('login');
      }
    }
  }

  return {
    refresh() {
      const session = DB.getAdminSession();
      if (!session) return;
      let activeTab = 'users';
      try {
        activeTab = localStorage.getItem('sun_admin_tab') || 'users';
      } catch(e) {}
      switchTab(activeTab);
    },
    initOnce,
    switchTab,
    showView,
  };
})();

// Auto-boot reliably on DOM Ready or immediately if already loaded
(() => {
  let booted = false;
  function bootAdmin() {
    if (booted) return;
    booted = true;
    if (!window.App) {
      AdminApp.initOnce();
    }
  }

  // Pre-boot instant session check to eliminate any login screen flicker
  try {
    const session = DB.getAdminSession();
    if (session) {
      const loginEl = document.getElementById('page-admin-login');
      const dashEl  = document.getElementById('page-admin');
      if (loginEl) {
        loginEl.classList.remove('active');
        loginEl.style.display = 'none';
      }
      if (dashEl) {
        dashEl.classList.add('active');
        dashEl.style.display = 'flex';
      }
    }
  } catch(e) {}

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootAdmin);
  } else {
    bootAdmin();
  }
})();