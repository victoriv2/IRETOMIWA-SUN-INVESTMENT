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
  let currentViewedUserId = null;

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
      requests: 'admin-tab-requests-content',
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
    if (tabName === 'requests') renderRequestsTab();
    if (tabName === 'received') renderReceivedTab();
    if (tabName === 'record')   setupRecordTab();
    if (tabName === 'payouts')  renderPayoutsTab();
    if (tabName === 'more')     renderMoreTab();
    updatePendingBadge();
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
    updatePendingBadge();

    // Filter by search query
    const searchInput = document.getElementById('admin-user-search');
    const q = searchInput ? searchInput.value.trim().toLowerCase() : '';

    const filteredUsers = users.filter(u => {
      if (!q) return true;
      const id = (u.id || '').toLowerCase();
      const fullName = `${u.firstName || ''} ${u.lastName || ''}`.toLowerCase();
      const phone = (u.phone || '').toLowerCase();
      const email = (u.email || '').toLowerCase();
      return id.includes(q) || fullName.includes(q) || phone.includes(q) || email.includes(q);
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
      const hasPhoto = Boolean(u.passportPhoto);
      const photoHtml = hasPhoto
        ? `<img src="${escapeHtml(u.passportPhoto)}" alt="Passport" style="width:38px; height:44px; border-radius:6px; object-fit:cover; border:1px solid #cbd5e1; flex-shrink:0; background:#f1f5f9;" />`
        : `<div style="width:38px; height:44px; border-radius:6px; background:#e2e8f0; color:#475569; font-weight:700; font-size:12px; display:flex; align-items:center; justify-content:center; flex-shrink:0;">${escapeHtml(((u.firstName||'').charAt(0)+(u.lastName||'').charAt(0)).toUpperCase() || 'U')}</div>`;

      return `
        <tr>
          <td>
            <div style="display:flex; align-items:center; gap:10px;">
              ${photoHtml}
              <div>
                <div style="font-weight:700; color:#0f172a;">${escapeHtml(fullName)}</div>
                <div style="margin-top:2px;">
                  <span style="font-size:11px; font-weight:800; color:#1e40af; background:#dbeafe; padding:1px 6px; border-radius:4px; letter-spacing:0.3px;">${escapeHtml(u.id || '')}</span>
                </div>
              </div>
            </div>
          </td>
          <td>${escapeHtml(u.phone)}</td>
          <td>${escapeHtml(u.email || '-')}</td>
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
    currentViewedUserId = userId;
    const user = DB.getUserById(userId);
    if (!user) return;

    const userBal = DB.getUserBalance(userId);
    const txs = DB.getTransactions(userId);
    const joined = user.joinedAt
      ? new Date(user.joinedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
      : '-';

    const idEl   = document.getElementById('vp-client-id');
    const photoEl= document.getElementById('vp-photo');
    const fnEl   = document.getElementById('vp-fullname');
    const emEl   = document.getElementById('vp-email');
    const phEl   = document.getElementById('vp-phone');
    const depEl  = document.getElementById('vp-deposited');
    const wthEl  = document.getElementById('vp-withdrawn');
    const balEl  = document.getElementById('vp-balance');
    const jnEl   = document.getElementById('vp-joined');
    const initEl = document.getElementById('vp-initials');

    if (idEl) idEl.textContent = user.id || '-';
    if (fnEl) fnEl.textContent = DB.formatName(user.firstName) + ' ' + DB.formatName(user.lastName);
    if (emEl) emEl.textContent = user.email || 'None';
    if (phEl) phEl.textContent = user.phone;
    if (depEl) depEl.textContent = '₦' + formatAmount(userBal.totalDeposited);
    if (wthEl) wthEl.textContent = '₦' + formatAmount(userBal.totalWithdrawn);
    if (balEl) balEl.textContent = '₦' + formatAmount(userBal.balance);
    if (jnEl) jnEl.textContent = joined;

    if (photoEl && initEl) {
      if (user.passportPhoto) {
        photoEl.src = user.passportPhoto;
        photoEl.style.display = 'block';
        initEl.style.display = 'none';
      } else {
        photoEl.style.display = 'none';
        initEl.style.display = 'flex';
        const i1 = (user.firstName || '').trim().charAt(0);
        const i2 = (user.lastName || '').trim().charAt(0);
        initEl.textContent = (i1 + i2).toUpperCase() || 'U';
      }
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
          const status    = t.status || 'approved';
          let statusBadge = '';
          if (status === 'pending') {
            statusBadge = ` <span class="status-badge status-badge--pending" style="font-size:10px; margin-left:4px;">Pending</span>`;
          } else if (status === 'declined') {
            statusBadge = ` <span class="status-badge status-badge--declined" style="font-size:10px; margin-left:4px;">Declined</span>`;
          }

          return `
            <tr>
              <td>${formatDateTime(t.createdAt)}</td>
              <td><span class="tx-badge ${badgeClass}">${badgeText}</span>${statusBadge}</td>
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
  // TAB: REQUESTS (CLIENT PAY IN & PAY OUT APPROVALS)
  // ============================================
  let reqFilterStatus = 'pending';
  let activeRequestTxId = null;

  function updatePendingBadge() {
    const pendingList = DB.getPendingRequests();
    const count = pendingList.length;

    // Bottom tab bar badge
    const tabBadge = document.getElementById('admin-pending-badge');
    if (tabBadge) {
      if (count > 0) {
        tabBadge.textContent = count > 99 ? '99+' : count;
        tabBadge.classList.remove('hidden');
      } else {
        tabBadge.classList.add('hidden');
      }
    }

    // Users tab summary card counter
    const cardCounter = document.getElementById('admin-pending-approvals-count');
    if (cardCounter) {
      cardCounter.textContent = count;
    }
  }

  function renderRequestsTab() {
    updatePendingBadge();

    const allTx = DB.getAllTransactions();
    // A request is any transaction that was submitted by a user or has status/review metadata
    const requestTxs = allTx.filter(t => t.recordedBy === 'user' || t.status === 'pending' || t.status === 'declined' || t.reviewedBy);

    // Summary counts for all pending requests
    const pendingTxs = allTx.filter(t => (t.status || 'approved') === 'pending');
    let pendingDepTotal = 0;
    let pendingPayTotal = 0;
    pendingTxs.forEach(t => {
      const amt = parseFloat(t.amount) || 0;
      if (t.type === 'deposit') pendingDepTotal += amt;
      else pendingPayTotal += amt;
    });

    const pendingCountEl = document.getElementById('admin-req-summary-pending');
    const pendingDepEl   = document.getElementById('admin-req-summary-deposits');
    const pendingPayEl   = document.getElementById('admin-req-summary-payouts');

    if (pendingCountEl) pendingCountEl.textContent = pendingTxs.length;
    if (pendingDepEl)   pendingDepEl.textContent   = '₦' + formatAmount(pendingDepTotal);
    if (pendingPayEl)   pendingPayEl.textContent   = '₦' + formatAmount(pendingPayTotal);

    // Filter pills state
    document.querySelectorAll('.requests-filter-pill').forEach(pill => {
      pill.classList.toggle('active', pill.dataset.reqFilter === reqFilterStatus);
    });

    // Filter by status pill
    let filtered = requestTxs.filter(t => {
      const st = t.status || 'approved';
      if (reqFilterStatus === 'pending')  return st === 'pending';
      if (reqFilterStatus === 'approved') return st === 'approved';
      if (reqFilterStatus === 'declined') return st === 'declined';
      return true; // 'all'
    });

    // Filter by search input
    const searchInput = document.getElementById('admin-requests-search');
    const q = searchInput ? searchInput.value.trim().toLowerCase() : '';

    if (q) {
      filtered = filtered.filter(t => {
        const u = DB.getUserById(t.userId);
        const name = u ? `${u.firstName || ''} ${u.lastName || ''}`.toLowerCase() : '';
        const phone = u ? (u.phone || '').toLowerCase() : '';
        const email = u ? (u.email || '').toLowerCase() : '';
        const cat = (t.category || '').toLowerCase();
        const note = (t.note || '').toLowerCase();
        return name.includes(q) || phone.includes(q) || email.includes(q) || cat.includes(q) || note.includes(q);
      });
    }

    // Sort: newest first
    filtered.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    const counterLabel = document.getElementById('admin-requests-counter-label');
    if (counterLabel) {
      const totalFiltered = filtered.length;
      if (reqFilterStatus === 'pending') {
        counterLabel.textContent = q ? `Showing ${totalFiltered} matching pending request${totalFiltered === 1 ? '' : 's'}` : `${totalFiltered} pending request${totalFiltered === 1 ? '' : 's'} awaiting approval`;
      } else {
        counterLabel.textContent = `Showing ${totalFiltered} request${totalFiltered === 1 ? '' : 's'}`;
      }
    }

    const tbody = document.getElementById('admin-requests-table-body');
    if (!tbody) return;

    if (filtered.length === 0) {
      const emptyText = q
        ? 'No requests match your search.'
        : (reqFilterStatus === 'pending'
          ? 'No pending client requests at this time.'
          : `No ${reqFilterStatus} requests found.`);
      tbody.innerHTML = `<tr><td colspan="8" class="table-empty">${emptyText}</td></tr>`;
      return;
    }

    tbody.innerHTML = filtered.map(t => {
      const u = DB.getUserById(t.userId);
      const fullName = u ? `${DB.formatName(u.firstName)} ${DB.formatName(u.lastName)}` : 'Unknown Client';
      const phone = u ? u.phone : '-';
      const userBal = u ? DB.getUserBalance(u.id) : { balance: 0, availableBalance: 0 };
      const isDeposit = (t.type || 'deposit') === 'deposit';
      const typeBadge = isDeposit
        ? '<span class="tx-badge tx-badge--deposit">Pay In</span>'
        : '<span class="tx-badge tx-badge--payout">Pay Out</span>';
      const amtClass = isDeposit ? 'amount-cell--deposit' : 'amount-cell--payout';
      const amtPrefix = isDeposit ? '+₦' : '-₦';

      const status = t.status || 'approved';
      let statusHtml = '';
      let actionHtml = '';

      if (status === 'pending') {
        statusHtml = '<span class="status-badge status-badge--pending">Pending Approval</span>';
        actionHtml = `
          <div class="request-actions">
            <button type="button" class="btn-approve" data-tx-id="${t.id}">Approve</button>
            <button type="button" class="btn-decline" data-tx-id="${t.id}">Decline</button>
          </div>
        `;
      } else if (status === 'approved') {
        const isFlw = t.paymentGateway === 'flutterwave';
        statusHtml = `<span class="status-badge status-badge--approved">${isFlw ? 'Paid &bull; Flutterwave' : 'Approved'}</span>`;
        actionHtml = `<small style="color:var(--color-text-muted); font-size:11.5px; white-space:nowrap;">${isFlw ? 'Transfer Verified' : 'Reviewed by Admin'} &bull; ${formatDateTime(t.reviewedAt)}</small>`;
      } else if (status === 'declined') {
        statusHtml = '<span class="status-badge status-badge--declined">Declined</span>';
        actionHtml = `<small style="color:var(--color-danger); font-size:11.5px; white-space:nowrap;">${t.declineReason ? escapeHtml(t.declineReason) + ' &bull; ' : ''}${formatDateTime(t.reviewedAt)}</small>`;
      }

      const balDisplay = `₦${formatAmount(userBal.balance)}${!isDeposit && userBal.pendingWithdrawn > 0 ? ` <small style="color:var(--color-text-muted); font-size:11.5px;">(Avail: ₦${formatAmount(userBal.availableBalance)})</small>` : ''}`;
      const grossAmt = t.grossAmount || t.amount;
      const feeAmt = t.fee !== undefined ? t.fee : (grossAmt * 0.10);
      const netAmt = t.netAmount !== undefined ? t.netAmount : (grossAmt - feeAmt);
      const feeNote = (!isDeposit && feeAmt > 0)
        ? `<div style="font-size:11px; color:#15803d; font-weight:700; margin-top:2px;">Net: ₦${formatAmount(netAmt)} <span style="color:#b91c1c; font-weight:600;">(Fee: ₦${formatAmount(feeAmt)})</span></div>`
        : '';

      return `
        <tr>
          <td style="white-space:nowrap;">${formatDateTime(t.createdAt)}</td>
          <td class="user-name-cell" style="white-space:nowrap;">${escapeHtml(fullName)}</td>
          <td style="white-space:nowrap;">${escapeHtml(phone)}</td>
          <td style="white-space:nowrap;">${typeBadge}</td>
          <td class="amount-cell ${amtClass}" style="white-space:nowrap;">
            ${amtPrefix}${formatAmount(t.amount)}
            ${feeNote}
          </td>
          <td style="white-space:nowrap;">
            <strong>${escapeHtml(t.category || 'General Savings')}</strong>
            ${t.note ? `<div style="color:var(--color-text-muted); font-size:11.5px; white-space:nowrap;">${escapeHtml(t.note)}</div>` : ''}
          </td>
          <td class="amount-cell" style="font-weight:700; white-space:nowrap;">${balDisplay}</td>
          <td style="white-space:nowrap;">
            <div class="request-status-action-wrap">
              ${statusHtml}
              ${actionHtml}
            </div>
          </td>
        </tr>
      `;
    }).join('');

    // Bind action buttons
    tbody.querySelectorAll('.btn-approve').forEach(btn => {
      btn.addEventListener('click', () => openApproveModal(btn.dataset.txId));
    });

    tbody.querySelectorAll('.btn-decline').forEach(btn => {
      btn.addEventListener('click', () => openDeclineModal(btn.dataset.txId));
    });
  }

  function openApproveModal(txId) {
    activeRequestTxId = txId;
    const allTx = DB.getAllTransactions();
    const t = allTx.find(x => x.id === txId);
    if (!t) return;

    const u = DB.getUserById(t.userId);
    const clientName = u ? `${DB.formatName(u.firstName)} ${DB.formatName(u.lastName)}` : 'Client';
    const isDeposit = (t.type || 'deposit') === 'deposit';
    const userBal = u ? DB.getUserBalance(u.id) : { balance: 0, availableBalance: 0 };

    const nameEl  = document.getElementById('approve-client-name');
    const badgeEl = document.getElementById('approve-type-badge');
    const amtEl   = document.getElementById('approve-amount');
    const balEl   = document.getElementById('approve-client-balance');
    const descEl  = document.getElementById('approve-modal-desc');

    const destBox     = document.getElementById('approve-payout-dest-box');
    const feeBox      = document.getElementById('approve-fee-breakdown');
    const grossEl     = document.getElementById('approve-gross-amt');
    const feeEl       = document.getElementById('approve-fee-amt');
    const netEl       = document.getElementById('approve-net-amt');
    const bankNameEl  = document.getElementById('approve-bank-name');
    const accNumEl    = document.getElementById('approve-account-number');
    const accNameEl   = document.getElementById('approve-account-name');
    const actionsDep  = document.getElementById('approve-actions-deposit');
    const actionsWith = document.getElementById('approve-actions-withdrawal');
    const flwErrEl    = document.getElementById('approve-flw-error');
    const btnFlwText  = document.getElementById('btn-confirm-approve-flw-text') || document.getElementById('btn-approve-flw-text');
    const btnManualApprove = document.getElementById('btn-confirm-approve-manual');

    if (flwErrEl) {
      flwErrEl.textContent = '';
      flwErrEl.classList.add('hidden');
    }

    if (nameEl)  nameEl.textContent = `${clientName} (${(u && u.phone) || '-'})`;
    if (badgeEl) badgeEl.innerHTML = isDeposit ? '<span class="tx-badge tx-badge--deposit">Pay In (Deposit)</span>' : '<span class="tx-badge tx-badge--payout">Pay Out (Withdrawal)</span>';
    if (amtEl)   amtEl.textContent = '₦' + formatAmount(t.amount);
    if (balEl)   balEl.textContent = '₦' + formatAmount(userBal.balance);

    if (isDeposit) {
      if (feeBox) feeBox.classList.add('hidden');
      if (descEl) descEl.textContent = `Approve ₦${formatAmount(t.amount)} deposit for ${clientName}? This will credit their active savings balance immediately.`;
      if (destBox) destBox.classList.add('hidden');
      if (actionsDep) actionsDep.classList.remove('hidden');
      if (actionsWith) actionsWith.classList.add('hidden');
    } else {
      // Withdrawal / Pay Out with 10% Admin Fee
      const grossAmt = t.grossAmount || t.amount;
      const feeRate = 0.10;
      const feeAmt = t.fee !== undefined ? t.fee : Math.round(grossAmt * feeRate * 100) / 100;
      const netAmt = t.netAmount !== undefined ? t.netAmount : Math.max(0, Math.round((grossAmt - feeAmt) * 100) / 100);

      if (feeBox) feeBox.classList.remove('hidden');
      if (grossEl) grossEl.textContent = `₦${formatAmount(grossAmt)}`;
      if (feeEl)   feeEl.textContent   = `-₦${formatAmount(feeAmt)}`;
      if (netEl)   netEl.textContent   = `₦${formatAmount(netAmt)}`;

      if (btnFlwText) btnFlwText.textContent = `Disburse ₦${formatAmount(netAmt)} via Flutterwave`;
      if (btnManualApprove) btnManualApprove.textContent = `Record Manual Payout of ₦${formatAmount(netAmt)}`;

      const destBank = t.destinationBank;
      if (destBank && (destBank.accountNumber || destBank.bankName)) {
        if (destBox) destBox.classList.remove('hidden');
        if (bankNameEl) bankNameEl.textContent = destBank.bankName || 'Nigerian Bank';
        if (accNumEl) accNumEl.textContent = destBank.accountNumber || '-';
        if (accNameEl) accNameEl.textContent = destBank.accountName || clientName;
      } else {
        if (destBox) destBox.classList.add('hidden');
      }

      if (descEl) {
        descEl.textContent = `Approve withdrawal for ${clientName}? Gross: ₦${formatAmount(grossAmt)} | 10% Admin Fee: ₦${formatAmount(feeAmt)} | Net Payout: ₦${formatAmount(netAmt)}.`;
      }

      if (actionsDep) actionsDep.classList.add('hidden');
      if (actionsWith) actionsWith.classList.remove('hidden');
    }

    const modal = document.getElementById('modal-approve-request');
    if (modal) modal.classList.remove('hidden');
  }

  function openDeclineModal(txId) {
    activeRequestTxId = txId;
    const allTx = DB.getAllTransactions();
    const t = allTx.find(x => x.id === txId);
    if (!t) return;

    const u = DB.getUserById(t.userId);
    const clientName = u ? `${DB.formatName(u.firstName)} ${DB.formatName(u.lastName)}` : 'Client';
    const isDeposit = (t.type || 'deposit') === 'deposit';

    const descEl = document.getElementById('decline-modal-desc');
    if (descEl) {
      descEl.textContent = `Decline ${isDeposit ? 'Pay In' : 'Pay Out'} request of ₦${formatAmount(t.amount)} for ${clientName}?`;
    }

    const reasonInput = document.getElementById('decline-reason-input');
    if (reasonInput) reasonInput.value = '';

    const modal = document.getElementById('modal-decline-request');
    if (modal) modal.classList.remove('hidden');
  }

  function initRequestsTab() {
    // Filter Pills
    document.querySelectorAll('.requests-filter-pill').forEach(pill => {
      pill.addEventListener('click', () => {
        reqFilterStatus = pill.dataset.reqFilter || 'pending';
        renderRequestsTab();
      });
    });

    // Search Box
    const searchInput = document.getElementById('admin-requests-search');
    if (searchInput) {
      searchInput.addEventListener('input', () => {
        renderRequestsTab();
      });
    }

    // Pending card link in Users tab
    const pendingCard = document.getElementById('admin-summary-pending-card');
    if (pendingCard) {
      pendingCard.addEventListener('click', () => {
        switchTab('requests');
      });
    }

    // Approve Modal Buttons (Standard Deposit / Generic)
    const btnCancelApprove  = document.getElementById('btn-cancel-approve-request');
    const btnConfirmApprove = document.getElementById('btn-confirm-approve-request');
    const modalApprove      = document.getElementById('modal-approve-request');

    if (btnCancelApprove && modalApprove) {
      btnCancelApprove.addEventListener('click', () => {
        modalApprove.classList.add('hidden');
        activeRequestTxId = null;
      });
    }

    if (modalApprove) {
      modalApprove.addEventListener('click', (e) => {
        if (e.target === modalApprove) {
          modalApprove.classList.add('hidden');
          activeRequestTxId = null;
        }
      });
    }

    if (btnConfirmApprove && modalApprove) {
      btnConfirmApprove.addEventListener('click', () => {
        if (!activeRequestTxId) return;
        const res = DB.approveTransaction(activeRequestTxId, { reviewedBy: 'admin' });
        modalApprove.classList.add('hidden');
        activeRequestTxId = null;

        if (res.error) {
          console.error(res.error);
        }

        renderRequestsTab();
        renderUsersTab();
        renderReceivedTab();
        renderPayoutsTab();
        renderMoreTab();
      });
    }

    // Withdrawal Specific Actions: Automated Flutterwave Disburse vs Manual Approve
    const btnFlwDisburse = document.getElementById('btn-confirm-approve-flw');
    const btnFlwText     = document.getElementById('btn-confirm-approve-flw-text');
    const btnManualApprove = document.getElementById('btn-confirm-approve-manual');
    const btnCancelWithdrawal = document.getElementById('btn-cancel-approve-withdrawal');
    const flwErrEl = document.getElementById('approve-flw-error');

    if (btnCancelWithdrawal && modalApprove) {
      btnCancelWithdrawal.addEventListener('click', () => {
        modalApprove.classList.add('hidden');
        activeRequestTxId = null;
      });
    }

    if (btnManualApprove && modalApprove) {
      btnManualApprove.addEventListener('click', () => {
        if (!activeRequestTxId) return;
        const allTx = DB.getAllTransactions();
        const t = allTx.find(x => x.id === activeRequestTxId);
        const grossAmt = t ? (t.grossAmount || t.amount) : 0;
        const feeRate = 0.10;
        const feeAmt = t && t.fee !== undefined ? t.fee : Math.round(grossAmt * feeRate * 100) / 100;
        const netAmt = t && t.netAmount !== undefined ? t.netAmount : Math.max(0, Math.round((grossAmt - feeAmt) * 100) / 100);

        const res = DB.approveTransaction(activeRequestTxId, {
          reviewedBy: 'admin (manual)',
          grossAmount: grossAmt,
          fee: feeAmt,
          netAmount: netAmt,
          feeRate: feeRate,
        });
        modalApprove.classList.add('hidden');
        activeRequestTxId = null;

        renderRequestsTab();
        renderUsersTab();
        renderReceivedTab();
        renderPayoutsTab();
        renderMoreTab();
      });
    }

    if (btnFlwDisburse && modalApprove) {
      btnFlwDisburse.addEventListener('click', async () => {
        if (!activeRequestTxId) return;
        const allTx = DB.getAllTransactions();
        const t = allTx.find(x => x.id === activeRequestTxId);
        if (!t) return;

        const u = DB.getUserById(t.userId);
        const clientName = u ? `${DB.formatName(u.firstName)} ${DB.formatName(u.lastName)}` : 'Client';
        const destBank = t.destinationBank || {};

        if (!destBank.accountNumber || !destBank.bankCode) {
          if (flwErrEl) {
            flwErrEl.textContent = 'Destination bank code or account number is missing. Please use manual approval.';
            flwErrEl.classList.remove('hidden');
          }
          return;
        }

        const grossAmt = t.grossAmount || t.amount;
        const feeRate = 0.10;
        const feeAmt = t.fee !== undefined ? t.fee : Math.round(grossAmt * feeRate * 100) / 100;
        const netAmt = t.netAmount !== undefined ? t.netAmount : Math.max(0, Math.round((grossAmt - feeAmt) * 100) / 100);

        const originalText = btnFlwText ? btnFlwText.textContent : 'Disburse via Flutterwave Transfer';
        if (btnFlwText) btnFlwText.textContent = `Sending ₦${formatAmount(netAmt)} via Flutterwave...`;
        btnFlwDisburse.disabled = true;

        if (flwErrEl) {
          flwErrEl.textContent = '';
          flwErrEl.classList.add('hidden');
        }

        try {
          const res = await DB.disburseFlutterwaveTransfer({
            accountNumber: destBank.accountNumber,
            bankCode: destBank.bankCode,
            amount: netAmt, // Transfer net payout amount (90%) to client bank
            narration: `Payout to ${clientName} (Net of 10% admin fee) - Iretomiwa Sun`,
            txId: t.id,
            clientName: clientName,
          });

          if (res.success) {
            DB.approveTransaction(t.id, {
              reviewedBy: 'admin (flutterwave)',
              paymentGateway: 'flutterwave',
              flutterwaveTransferId: res.transferId,
              flutterwaveRef: res.reference,
              grossAmount: grossAmt,
              fee: feeAmt,
              netAmount: netAmt,
              feeRate: feeRate,
            });

            modalApprove.classList.add('hidden');
            activeRequestTxId = null;

            renderRequestsTab();
            renderUsersTab();
            renderReceivedTab();
            renderPayoutsTab();
            renderMoreTab();
          } else {
            if (flwErrEl) {
              flwErrEl.textContent = `Flutterwave Disbursal Failed: ${res.error || 'Transfer failed'}. The client balance remains untouched.`;
              flwErrEl.classList.remove('hidden');
            }
          }
        } catch (err) {
          if (flwErrEl) {
            flwErrEl.textContent = `Transfer error: ${err.message || 'Check network connection'}`;
            flwErrEl.classList.remove('hidden');
          }
        } finally {
          if (btnFlwText) btnFlwText.textContent = originalText;
          btnFlwDisburse.disabled = false;
        }
      });
    }

    // Decline Modal Buttons
    const btnCancelDecline = document.getElementById('btn-cancel-decline-request');
    const btnConfirmDecline = document.getElementById('btn-confirm-decline-request');
    const modalDecline = document.getElementById('modal-decline-request');

    if (btnCancelDecline && modalDecline) {
      btnCancelDecline.addEventListener('click', () => {
        modalDecline.classList.add('hidden');
        activeRequestTxId = null;
      });
    }

    if (modalDecline) {
      modalDecline.addEventListener('click', (e) => {
        if (e.target === modalDecline) {
          modalDecline.classList.add('hidden');
          activeRequestTxId = null;
        }
      });
    }

    if (btnConfirmDecline && modalDecline) {
      btnConfirmDecline.addEventListener('click', () => {
        if (!activeRequestTxId) return;
        const reasonInput = document.getElementById('decline-reason-input');
        const reason = reasonInput ? reasonInput.value.trim() : '';

        DB.declineTransaction(activeRequestTxId, reason);
        modalDecline.classList.add('hidden');
        activeRequestTxId = null;

        renderRequestsTab();
        renderUsersTab();
        renderReceivedTab();
        renderPayoutsTab();
        renderMoreTab();
      });
    }
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

  function updateReceivedFilterButtons() {
    const fullDateEl = document.getElementById('admin-rec-full-date');
    if (fullDateEl) {
      fullDateEl.textContent = `${recDay} ${monthNames[recMonth]} ${recYear}`;
    }
    const isToday = isDateToday(recYear, recMonth, recDay);
    const todayBtn = document.getElementById('admin-rec-date-today');
    if (todayBtn) todayBtn.classList.toggle('active', isToday);

    const nextBtn = document.getElementById('admin-rec-date-next');
    if (nextBtn) {
      const atOrAfterToday = isToday || isDateFuture(recYear, recMonth, recDay);
      nextBtn.disabled = atOrAfterToday;
      nextBtn.classList.toggle('disabled', atOrAfterToday);
    }
  }

  function initReceivedPicker() {
    const prevBtn    = document.getElementById('admin-rec-date-prev');
    const nextBtn    = document.getElementById('admin-rec-date-next');
    const triggerBtn = document.getElementById('admin-rec-picker-trigger');
    const todayBtn   = document.getElementById('admin-rec-date-today');

    if (prevBtn) {
      prevBtn.addEventListener('click', () => {
        const cur = new Date(recYear, recMonth, recDay);
        cur.setDate(cur.getDate() - 1);
        recDay   = cur.getDate();
        recMonth = cur.getMonth();
        recYear  = cur.getFullYear();
        recPeriod = 'day';
        recFilterDate = buildRecDateISO();
        updateReceivedFilterButtons();
        renderReceivedTab();
      });
    }

    if (nextBtn) {
      nextBtn.addEventListener('click', () => {
        const cur = new Date(recYear, recMonth, recDay);
        cur.setDate(cur.getDate() + 1);
        if (isDateFuture(cur.getFullYear(), cur.getMonth(), cur.getDate())) {
          return; // Strictly no future date!
        }
        recDay   = cur.getDate();
        recMonth = cur.getMonth();
        recYear  = cur.getFullYear();
        recPeriod = 'day';
        recFilterDate = buildRecDateISO();
        updateReceivedFilterButtons();
        renderReceivedTab();
      });
    }

    if (todayBtn) {
      todayBtn.addEventListener('click', () => {
        const now = new Date();
        recDay   = now.getDate();
        recMonth = now.getMonth();
        recYear  = now.getFullYear();
        recPeriod = 'day';
        recFilterDate = buildRecDateISO();
        updateReceivedFilterButtons();
        renderReceivedTab();
      });
    }

    if (triggerBtn) {
      triggerBtn.addEventListener('click', () => {
        CustomPicker.openDatePicker({
          period: 'day',
          initialDate: buildRecDateISO(),
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
            recYear  = y;
            recMonth = m;
            recDay   = d;
            recPeriod = 'day';
            recFilterDate = buildRecDateISO();
            updateReceivedFilterButtons();
            renderReceivedTab();
          }
        });
      });
    }
  }

  function renderReceivedTab() {
    updateReceivedFilterButtons();

    const allTx = DB.getAllTransactions();
    const deposits = allTx.filter(t => (t.type || 'deposit') === 'deposit' && (t.status || 'approved') === 'approved');
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
          <td>
            <span class="tx-badge tx-badge--deposit">${escapeHtml(t.category || 'General Savings')}</span>
            ${t.paymentGateway === 'flutterwave' ? ` <span class="badge-flw">Flutterwave</span>` : ''}
          </td>
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
    const balWrap       = document.getElementById('admin-record-client-balance-wrap');
    const balEl         = document.getElementById('admin-record-client-balance');
    if (clientIdInput && clientIdInput.value) {
      const u = DB.getUserById(clientIdInput.value);
      if (u) {
        if (clientLabel) clientLabel.textContent = `${DB.formatName(u.firstName)} ${DB.formatName(u.lastName)} (${u.phone})`;
        const bal = DB.getUserBalance(u.id);
        if (balEl) balEl.textContent = '₦' + formatAmount(bal.balance);
        if (balWrap) balWrap.classList.remove('hidden');
      } else {
        if (balWrap) balWrap.classList.add('hidden');
      }
    } else {
      if (balWrap) balWrap.classList.add('hidden');
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

    // 2. Client Picker Modal (Searchable with Balances)
    const clientBtn = document.getElementById('admin-record-client-btn');
    if (clientBtn) {
      clientBtn.addEventListener('click', () => {
        const users = DB.getUsers();
        if (users.length === 0) {
          alert('No registered clients exist yet. Please register a client first.');
          return;
        }

        const options = users.map(u => {
          const bal = DB.getUserBalance(u.id);
          return {
            label: `${DB.formatName(u.firstName)} ${DB.formatName(u.lastName)} (${u.phone})`,
            sublabel: `Available Balance: ₦${formatAmount(bal.balance)}`,
            balance: bal.balance,
            value: u.id,
          };
        });

        const currentId = (document.getElementById('admin-record-client-id') || {}).value;

        CustomPicker.openCustomSelect({
          title: 'Select Client / User',
          options,
          selectedValue: currentId,
          searchable: true,
          searchPlaceholder: 'Search client by name or phone...',
          onSelect: (opt) => {
            const labelEl = document.getElementById('admin-record-client-label');
            const idEl    = document.getElementById('admin-record-client-id');
            const errEl   = document.getElementById('err-admin-record-client');
            const balWrap = document.getElementById('admin-record-client-balance-wrap');
            const balEl   = document.getElementById('admin-record-client-balance');

            if (labelEl) labelEl.textContent = opt.label;
            if (idEl)    idEl.value = opt.value;
            if (errEl)   errEl.textContent = '';

            const userBal = DB.getUserBalance(opt.value);
            if (balEl)   balEl.textContent = '₦' + formatAmount(userBal.balance);
            if (balWrap) balWrap.classList.remove('hidden');
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

    // 4. Category Selector (with Custom Option)
    const catBtn = document.getElementById('admin-record-category-btn');
    if (catBtn) {
      catBtn.addEventListener('click', () => {
        const catInput = document.getElementById('admin-record-category');
        const currentCat = catInput ? catInput.value : 'General Savings';

        CustomPicker.openCustomSelect({
          title: 'Select Savings Category',
          options: SAVINGS_CATEGORIES,
          selectedValue: currentCat,
          allowCustom: true,
          customPlaceholder: 'Type custom savings category (e.g. School Fees, Rent)...',
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

      // Reset form fields & update client balance display
      const amtInput = document.getElementById('admin-record-amount');
      const noteInput = document.getElementById('admin-record-note');
      if (amtInput) amtInput.value = '';
      if (noteInput) noteInput.value = '';

      const updatedBal = DB.getUserBalance(clientId);
      const balEl = document.getElementById('admin-record-client-balance');
      if (balEl) balEl.textContent = '₦' + formatAmount(updatedBal.balance);

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
    const fullDateEl = document.getElementById('admin-pay-full-date');
    if (fullDateEl) {
      fullDateEl.textContent = `${payDay} ${monthNames[payMonth]} ${payYear}`;
    }
    const isToday = isDateToday(payYear, payMonth, payDay);
    const todayBtn = document.getElementById('admin-pay-date-today');
    if (todayBtn) todayBtn.classList.toggle('active', isToday);

    const nextBtn = document.getElementById('admin-pay-date-next');
    if (nextBtn) {
      const atOrAfterToday = isToday || isDateFuture(payYear, payMonth, payDay);
      nextBtn.disabled = atOrAfterToday;
      nextBtn.classList.toggle('disabled', atOrAfterToday);
    }
  }

  function initPayoutsPicker() {
    const prevBtn    = document.getElementById('admin-pay-date-prev');
    const nextBtn    = document.getElementById('admin-pay-date-next');
    const triggerBtn = document.getElementById('admin-pay-picker-trigger');
    const todayBtn   = document.getElementById('admin-pay-date-today');

    if (prevBtn) {
      prevBtn.addEventListener('click', () => {
        const cur = new Date(payYear, payMonth, payDay);
        cur.setDate(cur.getDate() - 1);
        payDay   = cur.getDate();
        payMonth = cur.getMonth();
        payYear  = cur.getFullYear();
        payPeriod = 'day';
        payFilterDate = buildPayDateISO();
        updatePayoutsFilterButtons();
        renderPayoutsTab();
      });
    }

    if (nextBtn) {
      nextBtn.addEventListener('click', () => {
        const cur = new Date(payYear, payMonth, payDay);
        cur.setDate(cur.getDate() + 1);
        if (isDateFuture(cur.getFullYear(), cur.getMonth(), cur.getDate())) {
          return; // Strictly no future date!
        }
        payDay   = cur.getDate();
        payMonth = cur.getMonth();
        payYear  = cur.getFullYear();
        payPeriod = 'day';
        payFilterDate = buildPayDateISO();
        updatePayoutsFilterButtons();
        renderPayoutsTab();
      });
    }

    if (todayBtn) {
      todayBtn.addEventListener('click', () => {
        const now = new Date();
        payDay   = now.getDate();
        payMonth = now.getMonth();
        payYear  = now.getFullYear();
        payPeriod = 'day';
        payFilterDate = buildPayDateISO();
        updatePayoutsFilterButtons();
        renderPayoutsTab();
      });
    }

    if (triggerBtn) {
      triggerBtn.addEventListener('click', () => {
        CustomPicker.openDatePicker({
          period: 'day',
          initialDate: buildPayDateISO(),
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
            payYear  = y;
            payMonth = m;
            payDay   = d;
            payPeriod = 'day';
            payFilterDate = buildPayDateISO();
            updatePayoutsFilterButtons();
            renderPayoutsTab();
          }
        });
      });
    }
  }

  function renderPayoutsTab() {
    updatePayoutsFilterButtons();

    const allTx = DB.getAllTransactions();
    const payouts = allTx.filter(t => (t.type === 'payout' || t.type === 'withdrawal') && (t.status || 'approved') === 'approved');
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
      const isFlw = (t.paymentGateway === 'flutterwave');
      const flwBadge = isFlw ? `<div style="margin-top:3px;"><span style="display:inline-block; font-size:10.5px; font-weight:700; color:#166534; background:#dcfce7; border:1px solid #86efac; border-radius:4px; padding:2px 6px;">Flutterwave Transfer</span></div>` : '';
      const destBankInfo = t.destinationBank ? `<div style="font-size:11.5px; color:var(--text-secondary); margin-top:3px;">${escapeHtml(t.destinationBank.bankName || '')} &bull; <span style="font-family:monospace;">${escapeHtml(t.destinationBank.accountNumber || '')}</span> (${escapeHtml(t.destinationBank.accountName || '')})</div>` : '';
      const grossAmt = t.grossAmount || t.amount;
      const feeAmt = t.fee !== undefined ? t.fee : (grossAmt * 0.10);
      const netAmt = t.netAmount !== undefined ? t.netAmount : (grossAmt - feeAmt);
      const feeBadge = (feeAmt > 0) ? `<div style="font-size:11px; margin-top:3px; color:#166534; font-weight:700;">Net: ₦${formatAmount(netAmt)} <span style="color:#b91c1c; font-weight:600;">(Fee: ₦${formatAmount(feeAmt)})</span></div>` : '';

      return `
        <tr>
          <td>${formatDateTime(t.createdAt)}</td>
          <td class="user-name-cell">${escapeHtml(userName)}</td>
          <td>${escapeHtml(phone)}</td>
          <td>
            <span class="tx-badge tx-badge--payout">${escapeHtml(t.category || 'General Savings')}</span>
            ${flwBadge}
          </td>
          <td class="amount-cell amount-cell--payout">
            -₦${formatAmount(t.amount)}
            ${feeBadge}
          </td>
          <td>
            ${escapeHtml(t.note || '-')}
            ${destBankInfo}
            ${t.flutterwaveRef ? `<div style="font-size:11px; color:var(--text-muted); font-family:monospace; margin-top:2px;">Ref: ${escapeHtml(t.flutterwaveRef)}</div>` : ''}
          </td>
        </tr>`;
    }).join('');
  }

  // ============================================
  // TAB 5: MORE TAB
  // ============================================
  let _flwBalanceFetching = false;

  async function fetchAndRenderFlwBalance() {
    const balEl    = document.getElementById('admin-flw-live-balance');
    const ledgerEl = document.getElementById('admin-flw-ledger-balance');
    const refBtn   = document.getElementById('btn-refresh-flw-balance');

    if (!balEl) return;
    if (_flwBalanceFetching) return;
    _flwBalanceFetching = true;

    if (refBtn) refBtn.disabled = true;
    balEl.textContent = 'Checking...';

    try {
      const res = await DB.getFlutterwaveBalance();
      if (res.success) {
        balEl.textContent = '₦' + formatAmount(res.balance);
        if (ledgerEl) {
          ledgerEl.textContent = `(Ledger: ₦${formatAmount(res.ledger)})`;
        }
      } else {
        balEl.textContent = '₦0.00';
        if (ledgerEl) {
          ledgerEl.textContent = `(${res.error || 'Check credentials'})`;
        }
      }
    } catch (e) {
      balEl.textContent = '₦0.00';
    } finally {
      _flwBalanceFetching = false;
      if (refBtn) refBtn.disabled = false;
    }
  }

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

    // Populate Flutterwave Configuration fields
    const flwCfg = DB.getFlutterwaveConfig();
    const flwKeyInp    = document.getElementById('admin-flw-public-key');
    const flwSecretInp = document.getElementById('admin-flw-secret-key');
    const flwModeSel   = document.getElementById('admin-flw-mode');
    const flwBadge     = document.getElementById('admin-flw-status-badge');

    if (flwKeyInp && !flwKeyInp.dataset.userEdited) {
      flwKeyInp.value = flwCfg.publicKey || '';
    }
    if (flwSecretInp && !flwSecretInp.dataset.userEdited) {
      flwSecretInp.value = flwCfg.secretKey || '';
    }
    if (flwModeSel) {
      flwModeSel.value = flwCfg.mode || 'live';
    }
    const flwModeLbl = document.getElementById('admin-flw-mode-label');
    if (flwModeLbl) {
      flwModeLbl.textContent = (flwCfg.mode === 'live')
        ? 'Live Mode (Real Bank Account Transfers - John Idowu)'
        : 'Test Mode (Sandbox / Demo Transfers)';
    }
    if (flwBadge) {
      flwBadge.textContent = (flwCfg.mode === 'live') ? 'Live Mode' : 'Test Mode';
      flwBadge.className = 'status-badge ' + (flwCfg.mode === 'live' ? 'status-badge--approved' : 'status-badge--pending');
    }

    // Fetch live Flutterwave wallet balance
    fetchAndRenderFlwBalance();
  }

  // Flutterwave Admin Settings Form Handler
  function initAdminFlutterwaveSettings() {
    const form = document.getElementById('admin-flw-config-form');
    const keyInp = document.getElementById('admin-flw-public-key');
    const secretInp = document.getElementById('admin-flw-secret-key');
    const refreshBtn = document.getElementById('btn-refresh-flw-balance');
    const flwModeBtn = document.getElementById('admin-flw-mode-btn');
    const flwModeLbl = document.getElementById('admin-flw-mode-label');
    const flwModeSel = document.getElementById('admin-flw-mode');

    if (flwModeBtn) {
      flwModeBtn.addEventListener('click', () => {
        const modeOptions = [
          { label: 'Live Mode (Real Bank Account Transfers - John Idowu)', value: 'live' },
          { label: 'Test Mode (Sandbox / Demo Transfers)', value: 'test' },
        ];
        const currentVal = flwModeSel ? flwModeSel.value : 'live';

        CustomPicker.openCustomSelect({
          title: 'Gateway Environment',
          options: modeOptions,
          selectedValue: currentVal,
          onSelect: (opt) => {
            if (flwModeSel) flwModeSel.value = opt.value;
            if (flwModeLbl) flwModeLbl.textContent = opt.label;
          },
        });
      });
    }

    if (keyInp) {
      keyInp.addEventListener('input', () => {
        keyInp.dataset.userEdited = 'true';
      });
    }

    if (secretInp) {
      secretInp.addEventListener('input', () => {
        secretInp.dataset.userEdited = 'true';
      });
    }

    if (refreshBtn) {
      refreshBtn.addEventListener('click', (e) => {
        e.preventDefault();
        fetchAndRenderFlwBalance();
      });
    }

    if (!form) return;

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const modeSel = document.getElementById('admin-flw-mode');
      const msgBox  = document.getElementById('admin-flw-msg');

      const pubKey = (keyInp ? keyInp.value.trim() : '') || 'FLWPUBK-570758bf49301716d7e0133dce781024-X';
      const secKey = (secretInp ? secretInp.value.trim() : '') || 'FLWSECK-fc044b9b11bc1da34e06422d381602d4-1a1872431eevt-X';
      const mode   = modeSel ? modeSel.value : 'live';

      DB.setFlutterwaveConfig({
        publicKey: pubKey,
        secretKey: secKey,
        mode: mode,
        isEnabled: true,
      });

      if (keyInp) delete keyInp.dataset.userEdited;
      if (secretInp) delete secretInp.dataset.userEdited;

      if (msgBox) {
        msgBox.textContent = 'Flutterwave gateway settings saved and synced successfully!';
        msgBox.style.background = '#dcfce7';
        msgBox.style.color = '#15803d';
        msgBox.style.border = '1px solid #bbf7d0';
        msgBox.classList.remove('hidden');
        setTimeout(() => msgBox.classList.add('hidden'), 3500);
      }

      renderMoreTab();
    });
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

  // Admin Factory Reset System
  function initAdminFactoryReset() {
    const openBtn    = document.getElementById('btn-admin-factory-reset');
    const modal      = document.getElementById('modal-admin-factory-reset');
    const cancelBtn  = document.getElementById('btn-cancel-factory-reset');
    const confirmBtn = document.getElementById('btn-confirm-factory-reset');
    const confirmTxt = document.getElementById('btn-confirm-factory-reset-text');
    const inputEl    = document.getElementById('admin-reset-confirm-text');
    const errEl      = document.getElementById('err-admin-reset');

    if (openBtn && modal) {
      openBtn.addEventListener('click', () => {
        if (inputEl) inputEl.value = '';
        if (errEl) errEl.textContent = '';
        if (confirmBtn) confirmBtn.disabled = false;
        if (confirmTxt) confirmTxt.textContent = 'Reset Everything';
        modal.classList.remove('hidden');
      });
    }

    if (cancelBtn && modal) {
      cancelBtn.addEventListener('click', () => {
        modal.classList.add('hidden');
      });
    }

    if (modal) {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.classList.add('hidden');
      });
    }

    if (confirmBtn && modal) {
      confirmBtn.addEventListener('click', async () => {
        const val = inputEl ? inputEl.value.trim().toUpperCase() : '';
        if (val !== 'RESET') {
          if (errEl) errEl.textContent = 'Please type RESET in capital letters to confirm.';
          if (inputEl) inputEl.focus();
          return;
        }

        if (errEl) errEl.textContent = '';
        if (confirmTxt) confirmTxt.textContent = 'Resetting System...';
        confirmBtn.disabled = true;

        try {
          await DB.factoryReset();
          modal.classList.add('hidden');

          // Refresh all views
          renderUsersTab();
          renderRequestsTab();
          renderReceivedTab();
          renderPayoutsTab();
          renderMoreTab();

          alert('Factory reset complete! All clients and transaction records have been cleared. You are starting fresh.');
        } catch (e) {
          if (errEl) errEl.textContent = 'Reset encountered an issue: ' + (e.message || 'Error');
        } finally {
          if (confirmTxt) confirmTxt.textContent = 'Reset Everything';
          confirmBtn.disabled = false;
        }
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

  // Admin Data Exporters (Excel & PDF)
  function initAdminExports() {
    // 1. Export All Registered Clients
    const btnUserExcel = document.getElementById('btn-admin-export-users-excel');
    const btnUserPdf   = document.getElementById('btn-admin-export-users-pdf');

    if (btnUserExcel) {
      btnUserExcel.addEventListener('click', () => {
        const users = DB.getUsers();
        if (users.length === 0) {
          alert('No client records to export.');
          return;
        }
        const headers = ['Client Name', 'Phone Number', 'Email Address', 'Total Deposited (₦)', 'Total Withdrawn (₦)', 'Available Balance (₦)', 'Registration Date'];
        const rows = users.map(u => {
          const bal = DB.getUserBalance(u.id);
          const fullName = DB.formatName(u.firstName) + ' ' + DB.formatName(u.lastName);
          const joined = u.joinedAt ? new Date(u.joinedAt).toLocaleDateString('en-GB') : '-';
          return [
            fullName,
            u.phone || '-',
            u.email || '-',
            formatAmount(bal.totalDeposited),
            formatAmount(bal.totalWithdrawn),
            formatAmount(bal.balance),
            joined,
          ];
        });
        Exporter.toExcel({
          filename: `Iretomiwa_Sun_Clients_${new Date().toISOString().slice(0, 10)}`,
          headers,
          rows,
        });
      });
    }

    if (btnUserPdf) {
      btnUserPdf.addEventListener('click', () => {
        const users = DB.getUsers();
        const totals = DB.getSystemTotals();
        if (users.length === 0) {
          alert('No client records to export.');
          return;
        }
        const headers = ['Client Name', 'Phone', 'Email', 'Deposited (₦)', 'Withdrawn (₦)', 'Balance (₦)'];
        const rows = users.map(u => {
          const bal = DB.getUserBalance(u.id);
          const fullName = DB.formatName(u.firstName) + ' ' + DB.formatName(u.lastName);
          return [
            fullName,
            u.phone || '-',
            u.email || '-',
            '₦' + formatAmount(bal.totalDeposited),
            '₦' + formatAmount(bal.totalWithdrawn),
            '₦' + formatAmount(bal.balance),
          ];
        });
        Exporter.toPDF({
          title: 'Registered Clients & System Balances',
          subtitle: 'Official Client Master Ledger',
          meta: [
            { label: 'Total Clients', value: users.length },
            { label: 'System Status', value: 'Active Official Operations' },
          ],
          summary: [
            { label: 'Active Balance', value: '₦' + formatAmount(totals.totalBalance) },
            { label: 'Total Inflows', value: '₦' + formatAmount(totals.totalDeposited) },
            { label: 'Total Payouts', value: '₦' + formatAmount(totals.totalWithdrawn), isDebit: true },
          ],
          headers,
          rows,
        });
      });
    }

    // 2. Export Single Client Transaction Ledger
    const btnLedgerExcel = document.getElementById('btn-admin-export-ledger-excel');
    const btnLedgerPdf   = document.getElementById('btn-admin-export-ledger-pdf');

    if (btnLedgerExcel) {
      btnLedgerExcel.addEventListener('click', () => {
        if (!currentViewedUserId) return;
        const u = DB.getUserById(currentViewedUserId);
        const txs = DB.getTransactions(currentViewedUserId);
        const fullName = u ? `${DB.formatName(u.firstName)} ${DB.formatName(u.lastName)}` : 'Client';

        const headers = ['Date & Time', 'Transaction Type', 'Category', 'Amount (₦)', 'Note / Remarks'];
        const rows = txs.map(t => {
          const isDeposit = (t.type || 'deposit') === 'deposit';
          const amtPrefix = isDeposit ? '+₦' : '-₦';
          return [
            formatDateTime(t.createdAt),
            isDeposit ? 'Deposit (Inflow)' : 'Payout (Disbursed)',
            t.category || 'General Savings',
            amtPrefix + formatAmount(t.amount),
            t.note || '-',
          ];
        });

        Exporter.toExcel({
          filename: `Statement_${fullName.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}`,
          headers,
          rows,
        });
      });
    }

    if (btnLedgerPdf) {
      btnLedgerPdf.addEventListener('click', () => {
        if (!currentViewedUserId) return;
        const u = DB.getUserById(currentViewedUserId);
        const userBal = DB.getUserBalance(currentViewedUserId);
        const txs = DB.getTransactions(currentViewedUserId);
        const fullName = u ? `${DB.formatName(u.firstName)} ${DB.formatName(u.lastName)}` : 'Client';

        const headers = ['Date & Time', 'Type', 'Category', 'Amount (₦)', 'Note / Remarks'];
        const rows = txs.map(t => {
          const isDeposit = (t.type || 'deposit') === 'deposit';
          const amtPrefix = isDeposit ? '+₦' : '-₦';
          return [
            formatDateTime(t.createdAt),
            isDeposit ? 'Deposit' : 'Payout',
            t.category || 'General Savings',
            amtPrefix + formatAmount(t.amount),
            t.note || '-',
          ];
        });

        Exporter.toPDF({
          title: `Account Statement - ${fullName}`,
          subtitle: 'Official Client Passbook Record',
          meta: [
            { label: 'Client', value: fullName },
            { label: 'Phone', value: (u && u.phone) || '-' },
            { label: 'Email', value: (u && u.email) || '-' },
          ],
          summary: [
            { label: 'Available Balance', value: '₦' + formatAmount(userBal.balance) },
            { label: 'Total Saved', value: '₦' + formatAmount(userBal.totalDeposited) },
            { label: 'Total Withdrawn', value: '₦' + formatAmount(userBal.totalWithdrawn), isDebit: true },
          ],
          headers,
          rows,
        });
      });
    }

    // 3. Export Client Requests
    const btnReqExcel = document.getElementById('btn-admin-export-requests-excel');
    const btnReqPdf   = document.getElementById('btn-admin-export-requests-pdf');

    if (btnReqExcel) {
      btnReqExcel.addEventListener('click', () => {
        const allTx = DB.getAllTransactions();
        const requestTxs = allTx.filter(t => t.recordedBy === 'user' || t.status === 'pending' || t.status === 'declined' || t.reviewedBy);
        if (requestTxs.length === 0) return;

        const headers = ['Date & Time', 'Client Name', 'Phone', 'Type', 'Amount (₦)', 'Category', 'Note', 'Status', 'Reviewed Date', 'Decline Reason'];
        const rows = requestTxs.map(t => {
          const u = DB.getUserById(t.userId);
          const fullName = u ? `${DB.formatName(u.firstName)} ${DB.formatName(u.lastName)}` : 'Unknown';
          const isDeposit = (t.type || 'deposit') === 'deposit';
          return [
            formatDateTime(t.createdAt),
            fullName,
            (u && u.phone) || '-',
            isDeposit ? 'Pay In (Deposit)' : 'Pay Out (Withdrawal)',
            formatAmount(t.amount),
            t.category || 'General Savings',
            t.note || '-',
            (t.status || 'approved').toUpperCase(),
            t.reviewedAt ? formatDateTime(t.reviewedAt) : '-',
            t.declineReason || '-',
          ];
        });

        Exporter.toExcel({
          filename: `Sun_Client_Requests_${new Date().toISOString().slice(0, 10)}`,
          headers,
          rows,
        });
      });
    }

    if (btnReqPdf) {
      btnReqPdf.addEventListener('click', () => {
        const allTx = DB.getAllTransactions();
        const requestTxs = allTx.filter(t => t.recordedBy === 'user' || t.status === 'pending' || t.status === 'declined' || t.reviewedBy);
        if (requestTxs.length === 0) return;

        const headers = ['Date', 'Client', 'Phone', 'Type', 'Amount (₦)', 'Category', 'Status'];
        const rows = requestTxs.map(t => {
          const u = DB.getUserById(t.userId);
          const fullName = u ? `${DB.formatName(u.firstName)} ${DB.formatName(u.lastName)}` : 'Unknown';
          const isDeposit = (t.type || 'deposit') === 'deposit';
          const st = (t.status || 'approved').toUpperCase();
          return [
            formatDateTime(t.createdAt),
            fullName,
            (u && u.phone) || '-',
            isDeposit ? 'Pay In' : 'Pay Out',
            formatAmount(t.amount),
            t.category || 'General Savings',
            st,
          ];
        });

        const pendingCount = allTx.filter(t => (t.status || 'approved') === 'pending').length;

        Exporter.toPDF({
          title: 'Client Pay In & Pay Out Requests',
          subtitle: 'Official Requests Log',
          meta: [
            { label: 'Total Requests', value: requestTxs.length },
            { label: 'Pending Approvals', value: pendingCount },
          ],
          summary: [
            { label: 'Pending Requests', value: pendingCount },
          ],
          headers,
          rows,
        });
      });
    }
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
    initRequestsTab();
    initReceivedPicker();
    initRecordForm();
    initPayoutsPicker();
    initAdminChangePassword();
    initAdminFactoryReset();
    initAdminFlutterwaveSettings();
    initAdminExports();
    initLogout();
    initModalCloseHandlers();
    updatePendingBadge();

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
      updatePendingBadge();
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

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootAdmin);
  } else {
    bootAdmin();
  }
})();