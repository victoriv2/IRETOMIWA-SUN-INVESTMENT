// ============================================
// USER.JS - User Dashboard Logic
// ============================================

const UserApp = (() => {
  let currentUserId = null;
  let activePeriod  = 'day';
  let selectedFilterDate = new Date().toISOString().slice(0, 10);
  let clockInterval = null;
  let safelockActiveFilter = 'all';
  let safelockActiveSort   = 'due_asc';
  let safelockCountdownInterval = null;
  let safelockPreviousTab  = 'more';

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

  function isoToYMD(iso) { return (iso ? String(iso).slice(0, 10) : ''); }
  function isoToYM(iso)  { return (iso ? String(iso).slice(0, 7) : ''); }
  function isoToY(iso)   { return (iso ? String(iso).slice(0, 4) : ''); }

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
      const txDate = s.createdAt || s.date || '';
      if (activePeriod === 'day') {
        return isoToYMD(txDate) === buildDateISO();
      }
      if (activePeriod === 'month') {
        const ym = `${selectedYear}-${pad(selectedMonth + 1)}`;
        return isoToYM(txDate) === ym;
      }
      if (activePeriod === 'year') {
        return isoToY(txDate) === ('' + selectedYear);
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
    const sorted = [...filtered].sort((a, b) => new Date(b.createdAt || b.date || 0) - new Date(a.createdAt || a.date || 0));

    container.innerHTML = sorted.map(s => {
      const d = new Date(s.createdAt || s.date || Date.now());
      const dateStr = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
      const timeStr = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
      const isPayout = (s.type === 'withdrawal' || s.type === 'payout');
      const note = s.note || s.notes || (isPayout ? 'Cash payout' : 'Savings deposit');
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
                ` : (isPayout && s.disbursementStatus === 'scheduled') ? `
                  <span class="status-badge" style="background:#ede9fe; color:#6d28d9; border:1px solid #c4b5fd; font-size:11px; font-weight:700;">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                    Approved &bull; Scheduled Payout
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
            ${isPending ? `<span style="font-size: 10px; color: #b45309; font-weight: 700; display: block;">Awaiting Admin</span>` : (isPayout && s.disbursementStatus === 'scheduled') ? `<span style="font-size: 10px; color: #6d28d9; font-weight: 700; display: block;">Scheduled Payout</span>` : ''}
          </div>
        </div>`;
    }).join('');
  }

  function renderTotal() {
    const balance = DB.getUserBalance(currentUserId);
    const totalEl = document.getElementById('user-total-saved');
    const depEl   = document.getElementById('user-total-deposited');
    const wthEl   = document.getElementById('user-total-withdrawn');
    const lockEl  = document.getElementById('user-total-locked');
    const homeLockedAmt = document.getElementById('user-home-locked-amount');
    const homeLockedBadge = document.getElementById('user-home-locked-count-badge');

    if (totalEl) totalEl.textContent = '₦' + formatAmount(balance.availableBalance);
    if (depEl)   depEl.textContent   = '₦' + formatAmount(balance.totalDeposited);
    if (wthEl)   wthEl.textContent   = '₦' + formatAmount(balance.totalWithdrawn);
    if (lockEl)  lockEl.textContent  = '₦' + formatAmount(balance.lockedBalance || 0);
    if (homeLockedAmt) homeLockedAmt.textContent = '₦' + formatAmount(balance.lockedBalance || 0);

    const minRetain = (typeof DB !== 'undefined' && DB.getMinimumBalanceRetention) ? DB.getMinimumBalanceRetention() : 500;
    const maxWithdrawable = Math.max(0, balance.availableBalance - minRetain);
    const withAvailEl = document.getElementById('with-total-avail-bal');
    const withRetEl = document.getElementById('with-retained-min-bal');
    const withMaxEl = document.getElementById('with-max-withdrawable-bal');
    if (withAvailEl) withAvailEl.textContent = '₦' + formatAmount(balance.availableBalance);
    if (withRetEl) withRetEl.textContent = '-₦' + formatAmount(minRetain);
    if (withMaxEl) withMaxEl.textContent = '₦' + formatAmount(maxWithdrawable);

    const delayHours = (typeof DB !== 'undefined' && DB.getPayoutDelayHours) ? DB.getPayoutDelayHours() : 24;
    const withDelayEl = document.getElementById('with-processing-delay-label');
    if (withDelayEl) withDelayEl.textContent = (typeof DB !== 'undefined' && DB.getPayoutDelayLabel) ? DB.getPayoutDelayLabel(delayHours) : `${delayHours} Hours`;

    const activeLocks = (typeof DB.getUserActiveLocks === 'function') ? DB.getUserActiveLocks(currentUserId) : [];
    if (homeLockedBadge) {
      homeLockedBadge.textContent = `${activeLocks.length} Active Lock${activeLocks.length === 1 ? '' : 's'}`;
    }

    renderUserActiveLocks();

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

  // ---- SafeLock (Locked Savings) Active Cards Rendering ----
  function renderUserActiveLocks() {
    const container = document.getElementById('user-active-locks-container');
    if (!container) return;

    const activeLocks = (typeof DB.getUserActiveLocks === 'function') ? DB.getUserActiveLocks(currentUserId) : [];
    if (activeLocks.length === 0) {
      container.innerHTML = `
        <div style="text-align: center; padding: 12px 10px; background: rgba(254, 243, 199, 0.4); border-radius: 8px; border: 1px dashed #fde68a;">
          <p style="font-size: 12.5px; color: #92400e; margin: 0; font-weight: 500;">
            No active locked funds. Tap "+ Lock Money" to commit funds towards a target date.
          </p>
        </div>`;
      return;
    }

    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

    const html = activeLocks.map(l => {
      const dueStr = String(l.dueDate).slice(0, 10);
      const isEarly = (todayStr < dueStr);

      const dueObj = new Date(dueStr + 'T00:00:00');
      const dueFormatted = !isNaN(dueObj.getTime())
        ? dueObj.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
        : dueStr;

      let daysRemaining = 0;
      if (isEarly) {
        const nowDate = new Date(todayStr + 'T00:00:00');
        const diff = dueObj.getTime() - nowDate.getTime();
        daysRemaining = Math.max(1, Math.ceil(diff / (1000 * 60 * 60 * 24)));
      }

      const statusBadge = isEarly
        ? `<span style="background: #fef3c7; color: #92400e; padding: 3px 8px; border-radius: 999px; font-size: 11px; font-weight: 700; display: inline-flex; align-items: center; gap: 4px;">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            ${daysRemaining} day${daysRemaining === 1 ? '' : 's'} left
          </span>`
        : `<span style="background: #dcfce7; color: #15803d; padding: 3px 8px; border-radius: 999px; font-size: 11px; font-weight: 700; display: inline-flex; align-items: center; gap: 4px;">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
            Matured (0% Fee)
          </span>`;

      const actionBtn = isEarly
        ? `<button type="button" class="btn-outline btn-unlock-lock" data-lock-id="${l.id}" style="padding: 5px 11px; font-size: 11.5px; border-color: #d97706; color: #b45309; font-weight: 700; border-radius: 7px; background: #fff;">
            Unlock / Break
          </button>`
        : `<button type="button" class="btn-primary btn-unlock-lock" data-lock-id="${l.id}" style="padding: 5px 12px; font-size: 11.5px; background: #166534; font-weight: 700; border-radius: 7px;">
            Unlock Full Amount
          </button>`;

      return `
        <div style="background: #ffffff; border: 1.5px solid #fde68a; border-radius: 10px; padding: 12px 14px; margin-bottom: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.02);">
          <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 6px;">
            <div>
              <strong style="font-size: 13.5px; color: #1e293b; display: block;">${escapeHtml(l.title || 'SafeLock')}</strong>
              <span style="font-size: 11.5px; color: var(--text-muted);">Due: ${dueFormatted}</span>
            </div>
            ${statusBadge}
          </div>
          <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 8px; border-top: 1px dashed #f1f5f9; padding-top: 8px;">
            <div>
              <span style="font-size: 11px; color: var(--text-muted); display: block;">Locked Amount</span>
              <strong style="font-size: 15px; font-weight: 900; color: #78350f;">₦${formatAmount(l.amount)}</strong>
            </div>
            ${actionBtn}
          </div>
        </div>`;
    }).join('');

    container.innerHTML = html;

    container.querySelectorAll('.btn-unlock-lock').forEach(btn => {
      btn.addEventListener('click', () => {
        openUnlockModal(btn.dataset.lockId);
      });
    });
  }

  function getCountdownBreakdown(dueDate, lockedAt) {
    const dueStr = String(dueDate || '').slice(0, 10);
    const targetDate = new Date(dueStr + 'T00:00:00');
    const targetMs = targetDate.getTime();
    const nowMs = Date.now();
    const diffMs = targetMs - nowMs;

    const lockedMs = lockedAt ? new Date(lockedAt).getTime() : (targetMs - (30 * 86400000));
    const totalDurationMs = Math.max(1000, targetMs - lockedMs);
    const elapsedMs = Math.max(0, nowMs - lockedMs);
    const progressPercent = Math.min(100, Math.max(0, Math.round((elapsedMs / totalDurationMs) * 100)));

    if (diffMs <= 0 || isNaN(diffMs)) {
      return {
        isMatured: true,
        progressPercent: 100,
        text: 'Matured',
        boxes: [
          { val: '00', unit: 'Days' },
          { val: '00', unit: 'Hours' },
          { val: '00', unit: 'Mins' },
          { val: '00', unit: 'Secs' }
        ]
      };
    }

    let remaining = diffMs;
    const msPerSec = 1000;
    const msPerMin = msPerSec * 60;
    const msPerHour = msPerMin * 60;
    const msPerDay = msPerHour * 24;
    const msPerMonth = msPerDay * 30.4375;
    const msPerYear = msPerDay * 365.25;

    const years = Math.floor(remaining / msPerYear);
    remaining %= msPerYear;

    const months = Math.floor(remaining / msPerMonth);
    remaining %= msPerMonth;

    const days = Math.floor(remaining / msPerDay);
    remaining %= msPerDay;

    const hours = Math.floor(remaining / msPerHour);
    remaining %= msPerHour;

    const minutes = Math.floor(remaining / msPerMin);
    remaining %= msPerMin;

    const seconds = Math.floor(remaining / msPerSec);

    const boxes = [];
    if (years > 0) {
      boxes.push({ val: String(years).padStart(2, '0'), unit: years === 1 ? 'Year' : 'Years' });
    }
    if (months > 0 || years > 0) {
      boxes.push({ val: String(months).padStart(2, '0'), unit: months === 1 ? 'Month' : 'Months' });
    }
    boxes.push({ val: String(days).padStart(2, '0'), unit: 'Days' });
    boxes.push({ val: String(hours).padStart(2, '0'), unit: 'Hours' });
    boxes.push({ val: String(minutes).padStart(2, '0'), unit: 'Mins' });
    boxes.push({ val: String(seconds).padStart(2, '0'), unit: 'Secs' });

    return {
      isMatured: false,
      progressPercent,
      boxes
    };
  }

  function updateUnlockModalCountdown(lockId) {
    const lock = DB.getLockById(lockId);
    const wrap = document.getElementById('unlock-modal-countdown-wrap');
    if (!lock || !wrap) return;

    if (lock.status !== 'active') {
      wrap.innerHTML = '';
      return;
    }

    const cd = getCountdownBreakdown(lock.dueDate, lock.lockedAt);
    if (cd.isMatured) {
      wrap.innerHTML = `
        <div class="countdown-matured-banner" style="margin-bottom:0;">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
          <span>Target Reached! Matured with 0% Fee</span>
        </div>`;
    } else {
      const boxesHtml = cd.boxes.map((b, idx) => `
        <div class="countdown-box" style="min-width: 44px;">
          <span class="countdown-digits" style="font-size: 19px;" data-modal-cd-unit="${b.unit.toLowerCase()}">${b.val}</span>
          <span class="countdown-unit" style="font-size: 9px;">${b.unit}</span>
        </div>
        ${idx < cd.boxes.length - 1 ? '<span class="countdown-sep" style="font-size: 15px;">:</span>' : ''}
      `).join('');

      wrap.innerHTML = `
        <div style="text-align: center; margin-bottom: 5px;">
          <span style="font-size: 11px; font-weight: 700; color: #92400e; text-transform: uppercase; letter-spacing: 0.5px;">Remaining Time to Maturity</span>
        </div>
        <div class="countdown-container" style="margin-bottom: 0; padding: 8px 10px;">
          ${boxesHtml}
        </div>`;
    }
  }

  function openUnlockModal(lockId) {
    const lock = DB.getLockById(lockId);
    if (!lock) return;

    const modal = document.getElementById('modal-user-unlock-money');
    if (!modal) return;

    const titleEl   = document.getElementById('unlock-modal-title');
    const idInput   = document.getElementById('unlock-active-lock-id');
    const bannerEl  = document.getElementById('unlock-status-banner');
    const detTitle  = document.getElementById('unlock-detail-title');
    const detGross  = document.getElementById('unlock-detail-gross');
    const detLocked = document.getElementById('unlock-detail-locked-date');
    const detDue    = document.getElementById('unlock-detail-due');
    const detPenRow = document.getElementById('unlock-penalty-row');
    const detPenLbl = document.getElementById('unlock-penalty-label');
    const detPenAmt = document.getElementById('unlock-detail-penalty');
    const detNet    = document.getElementById('unlock-detail-net');
    const btnBal    = document.getElementById('btn-confirm-unlock-to-balance');
    const btnCancel = document.getElementById('btn-cancel-unlock');
    const errEl     = document.getElementById('user-unlock-error');
    const succEl    = document.getElementById('user-unlock-success');

    if (errEl) errEl.classList.add('hidden');
    if (succEl) succEl.classList.add('hidden');
    if (idInput) idInput.value = lock.id;

    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const dueStr = String(lock.dueDate).slice(0, 10);
    const isEarly = (todayStr < dueStr);

    const dueObj = new Date(dueStr + 'T00:00:00');
    const dueFormatted = !isNaN(dueObj.getTime())
      ? dueObj.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
      : dueStr;

    const lockedObj = lock.lockedAt ? new Date(lock.lockedAt) : null;
    const lockedFormatted = (lockedObj && !isNaN(lockedObj.getTime()))
      ? lockedObj.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
      : '--';

    if (detTitle)  detTitle.textContent  = lock.title || 'SafeLock';
    if (detGross)  detGross.textContent  = '₦' + formatAmount(lock.amount);
    if (detLocked) detLocked.textContent = lockedFormatted;
    if (detDue)    detDue.textContent    = dueFormatted;

    updateUnlockModalCountdown(lock.id);

    if (lock.status !== 'active') {
      if (titleEl) titleEl.textContent = 'SafeLock Details (Released)';
      if (bannerEl) {
        bannerEl.style.cssText = 'background: #f1f5f9; border: 1.5px solid #cbd5e1; border-radius: 10px; padding: 12px 14px; margin-bottom: 16px; color: #475569; font-size: 12.5px;';
        const unlDateStr = lock.unlockedAt ? new Date(lock.unlockedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : 'earlier date';
        bannerEl.innerHTML = `
          <strong style="display:block; font-size:13px; margin-bottom:3px; color:#1e293b;">SafeLock Already Released</strong>
          <span>This lock was unlocked on ${unlDateStr}. Net funds of ₦${formatAmount(lock.netReturned || lock.amount)} returned to your Main Balance.</span>`;
      }
      if (detPenRow) detPenRow.style.display = (lock.penaltyAmount && lock.penaltyAmount > 0) ? 'flex' : 'none';
      if (detPenLbl) detPenLbl.textContent = `Penalty Deducted (${lock.penaltyRate || lock.penaltyRateAtCreation || 5}%):`;
      if (detPenAmt) detPenAmt.textContent = `-₦${formatAmount(lock.penaltyAmount || 0)}`;
      if (detNet)    detNet.textContent    = `₦${formatAmount(lock.netReturned || lock.amount)}`;

      if (btnBal) btnBal.style.display = 'none';
      if (btnCancel) {
        btnCancel.textContent = 'Close';
        btnCancel.style.display = 'block';
      }
    } else if (isEarly) {
      const penaltyRate = DB.getLockPenaltyRate();
      const penaltyAmount = Math.round(lock.amount * (penaltyRate / 100) * 100) / 100;
      const netAmount = Math.max(0, Math.round((lock.amount - penaltyAmount) * 100) / 100);

      if (titleEl) titleEl.textContent = 'Early SafeLock Break';
      const nowDate = new Date(todayStr + 'T00:00:00');
      const diff = dueObj.getTime() - nowDate.getTime();
      const daysRemaining = Math.max(1, Math.ceil(diff / (1000 * 60 * 60 * 24)));

      if (bannerEl) {
        bannerEl.style.cssText = 'background: #fffbeb; border: 1.5px solid #fde68a; border-radius: 10px; padding: 12px 14px; margin-bottom: 16px; color: #92400e; font-size: 12.5px;';
        bannerEl.innerHTML = `
          <strong style="display:block; font-size:13px; margin-bottom:3px; color:#78350f;">Early Lock Break Notice</strong>
          <span>This lock is scheduled to mature on <strong>${dueFormatted}</strong> (${daysRemaining} day${daysRemaining === 1 ? '' : 's'} remaining). Unlocking before the due date incurs an Early Break Penalty of <strong>${penaltyRate}%</strong> (-₦${formatAmount(penaltyAmount)}). Net payout to Main Balance: <strong>₦${formatAmount(netAmount)}</strong>.</span>`;
      }

      if (detPenRow) detPenRow.style.display = 'flex';
      if (detPenLbl) detPenLbl.textContent = `Early Break Penalty (${penaltyRate}%):`;
      if (detPenAmt) detPenAmt.textContent = `-₦${formatAmount(penaltyAmount)}`;
      if (detNet)    detNet.textContent    = `₦${formatAmount(netAmount)}`;

      if (btnBal) {
        btnBal.style.display = 'block';
        btnBal.textContent = `Withdraw ₦${formatAmount(netAmount)} to Main Balance`;
      }
      if (btnCancel) {
        btnCancel.textContent = 'Keep Locked';
        btnCancel.style.display = 'block';
      }
    } else {
      if (titleEl) titleEl.textContent = 'SafeLock Matured';
      if (bannerEl) {
        bannerEl.style.cssText = 'background: #f0fdf4; border: 1.5px solid #86efac; border-radius: 10px; padding: 12px 14px; margin-bottom: 16px; color: #166534; font-size: 12.5px;';
        bannerEl.innerHTML = `
          <strong style="display:block; font-size:13px; margin-bottom:3px; color:#14532d;">SafeLock Reached Maturity!</strong>
          <span>Congratulations! Your lock reached its maturity date on <strong>${dueFormatted}</strong>. No penalty fee applies (0% fee). You receive 100% of your locked funds into your Main Balance.</span>`;
      }

      if (detPenRow) detPenRow.style.display = 'none';
      if (detNet)    detNet.textContent    = `₦${formatAmount(lock.amount)}`;

      if (btnBal) {
        btnBal.style.display = 'block';
        btnBal.textContent = `Withdraw Full ₦${formatAmount(lock.amount)} to Main Balance`;
      }
      if (btnCancel) {
        btnCancel.textContent = 'Keep in Vault';
        btnCancel.style.display = 'block';
      }
    }

    modal.classList.remove('hidden');
  }

  function openSafeLockHub(fromTab) {
    safelockPreviousTab = fromTab || 'more';

    const homeEl = document.getElementById('tab-home-content');
    const saveEl = document.getElementById('tab-save-content');
    const moreEl = document.getElementById('tab-more-content');
    const hubView = document.getElementById('view-safelock-hub');

    if (homeEl) homeEl.classList.add('hidden');
    if (saveEl) saveEl.classList.add('hidden');
    if (moreEl) moreEl.classList.add('hidden');

    if (hubView) hubView.classList.remove('hidden');

    renderSafeLockHub();
    startSafeLockCountdowns();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function closeSafeLockHub() {
    stopSafeLockCountdowns();
    const hubView = document.getElementById('view-safelock-hub');
    if (hubView) hubView.classList.add('hidden');
    switchTab(safelockPreviousTab || 'more');
  }

  function startSafeLockCountdowns() {
    stopSafeLockCountdowns();
    safelockCountdownInterval = setInterval(updateSafeLockCountdowns, 1000);
  }

  function stopSafeLockCountdowns() {
    if (safelockCountdownInterval) {
      clearInterval(safelockCountdownInterval);
      safelockCountdownInterval = null;
    }
  }

  function updateSafeLockCountdowns() {
    const hubView = document.getElementById('view-safelock-hub');
    const isHubOpen = hubView && !hubView.classList.contains('hidden');

    if (isHubOpen) {
      const cdContainers = document.querySelectorAll('.countdown-container[data-lock-cd]');
      cdContainers.forEach(container => {
        const lockId = container.getAttribute('data-lock-cd');
        if (lockId) {
          const lock = DB.getLockById(lockId);
          if (!lock || lock.status !== 'active') {
            renderSafeLockHub();
            return;
          }
        }
        const dueDate = container.getAttribute('data-due');
        const lockedAt = container.getAttribute('data-locked');
        const cd = getCountdownBreakdown(dueDate, lockedAt);

        if (cd.isMatured) {
          renderSafeLockHub();
          return;
        }

        cd.boxes.forEach(b => {
          const el = container.querySelector(`[data-cd-box="${b.unit.toLowerCase()}"]`);
          if (el && el.textContent !== b.val) {
            el.textContent = b.val;
          }
        });

        const card = container.closest('.safelock-item-card');
        if (card) {
          const fill = card.querySelector('.safelock-progress-fill');
          if (fill) fill.style.width = cd.progressPercent + '%';
        }
      });
    }

    const unlockModal = document.getElementById('modal-user-unlock-money');
    if (unlockModal && !unlockModal.classList.contains('hidden')) {
      const idInp = document.getElementById('unlock-active-lock-id');
      const lockId = idInp ? idInp.value : '';
      if (lockId) {
        const lock = DB.getLockById(lockId);
        if (lock && lock.status === 'active') {
          const cd = getCountdownBreakdown(lock.dueDate, lock.lockedAt);
          if (cd.isMatured) {
            updateUnlockModalCountdown(lockId);
          } else {
            cd.boxes.forEach(b => {
              const el = unlockModal.querySelector(`[data-modal-cd-unit="${b.unit.toLowerCase()}"]`);
              if (el && el.textContent !== b.val) {
                el.textContent = b.val;
              }
            });
          }
        } else {
          const wrap = document.getElementById('unlock-modal-countdown-wrap');
          if (wrap) wrap.innerHTML = '';
        }
      }
    }
  }

  function renderSafeLockHub() {
    const hubView = document.getElementById('view-safelock-hub');
    if (!hubView || hubView.classList.contains('hidden')) return;

    const allLocks = (typeof DB.getUserLocks === 'function') ? DB.getUserLocks(currentUserId) : [];
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

    let totalLockedBal = 0;
    let activeCount = 0;
    let maturedCount = 0;
    let releasedCount = 0;

    allLocks.forEach(l => {
      const isRel = (l.status !== 'active');
      if (isRel) {
        releasedCount++;
      } else {
        totalLockedBal += (parseFloat(l.amount) || 0);
        const dueStr = String(l.dueDate).slice(0, 10);
        if (todayStr >= dueStr) {
          maturedCount++;
        } else {
          activeCount++;
        }
      }
    });

    const userBal = (typeof DB.getUserBalance === 'function') ? DB.getUserBalance(currentUserId) : { availableBalance: 0 };

    const totalEl = document.getElementById('safelock-hub-total-bal');
    const actCountEl = document.getElementById('safelock-hub-active-count');
    const matCountEl = document.getElementById('safelock-hub-matured-count');
    const availBalEl = document.getElementById('safelock-hub-avail-bal');

    if (totalEl) totalEl.textContent = '₦' + formatAmount(totalLockedBal);
    if (actCountEl) actCountEl.textContent = activeCount;
    if (matCountEl) matCountEl.textContent = maturedCount;
    if (availBalEl) availBalEl.textContent = '₦' + formatAmount(userBal.availableBalance);

    // Update filter pill counts
    const cntAll = document.getElementById('count-filter-all');
    const cntAct = document.getElementById('count-filter-active');
    const cntMat = document.getElementById('count-filter-matured');
    const cntRel = document.getElementById('count-filter-released');

    if (cntAll) cntAll.textContent = allLocks.length;
    if (cntAct) cntAct.textContent = activeCount;
    if (cntMat) cntMat.textContent = maturedCount;
    if (cntRel) cntRel.textContent = releasedCount;

    // Filter locks
    const filtered = allLocks.filter(l => {
      const isRel = (l.status !== 'active');
      const dueStr = String(l.dueDate).slice(0, 10);
      const isMat = (!isRel && todayStr >= dueStr);
      const isAct = (!isRel && todayStr < dueStr);

      if (safelockActiveFilter === 'active') return isAct;
      if (safelockActiveFilter === 'matured') return isMat;
      if (safelockActiveFilter === 'released') return isRel;
      return true; // 'all'
    });

    // Sort locks
    filtered.sort((a, b) => {
      const aDue = new Date(String(a.dueDate).slice(0, 10) + 'T00:00:00').getTime() || 0;
      const bDue = new Date(String(b.dueDate).slice(0, 10) + 'T00:00:00').getTime() || 0;
      const aAmt = parseFloat(a.amount) || 0;
      const bAmt = parseFloat(b.amount) || 0;
      const aCreated = new Date(a.lockedAt || 0).getTime() || 0;
      const bCreated = new Date(b.lockedAt || 0).getTime() || 0;

      if (safelockActiveSort === 'due_asc') return aDue - bDue;
      if (safelockActiveSort === 'due_desc') return bDue - aDue;
      if (safelockActiveSort === 'amount_desc') return bAmt - aAmt;
      if (safelockActiveSort === 'amount_asc') return aAmt - bAmt;
      if (safelockActiveSort === 'newest') return bCreated - aCreated;
      return 0;
    });

    const listContainer = document.getElementById('safelock-hub-list');
    if (!listContainer) return;

    if (filtered.length === 0) {
      listContainer.innerHTML = `
        <div style="text-align: center; padding: 36px 16px; background: #ffffff; border-radius: 14px; border: 1.5px dashed #cbd5e1; margin-top: 8px;">
          <div style="width: 52px; height: 52px; margin: 0 auto 12px; border-radius: 50%; background: #fef3c7; display: flex; align-items: center; justify-content: center; color: #b45309;">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </svg>
          </div>
          <h4 style="font-size: 15px; font-weight: 800; color: #1e293b; margin: 0 0 6px;">No Locked Funds Found</h4>
          <p style="font-size: 12.5px; color: #64748b; margin: 0 0 16px; max-width: 320px; margin-inline: auto;">
            ${safelockActiveFilter === 'all' 
              ? 'You have not locked any savings yet. Lock money towards a future maturity date and avoid impulse spending.'
              : 'No locks match the current filter selection.'}
          </p>
          <button type="button" class="btn-primary" id="btn-safelock-empty-create" style="padding: 9px 18px; font-size: 13px; font-weight: 700; border-radius: 8px; display: inline-flex; align-items: center; gap: 6px;">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            <span>+ Lock Money Now</span>
          </button>
        </div>`;

      const emptyBtn = document.getElementById('btn-safelock-empty-create');
      if (emptyBtn) {
        emptyBtn.addEventListener('click', () => {
          const btnCreate = document.getElementById('btn-safelock-hub-create');
          if (btnCreate) btnCreate.click();
        });
      }
      return;
    }

    const html = filtered.map(l => {
      const isRel = (l.status !== 'active');
      const dueStr = String(l.dueDate).slice(0, 10);
      const isMat = (!isRel && todayStr >= dueStr);
      const cd = getCountdownBreakdown(l.dueDate, l.lockedAt);

      const dueObj = new Date(dueStr + 'T00:00:00');
      const dueFormatted = !isNaN(dueObj.getTime())
        ? dueObj.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
        : dueStr;

      let badgeHtml = '';
      if (isRel) {
        badgeHtml = `<span class="safelock-badge-released">Released</span>`;
      } else if (isMat || cd.isMatured) {
        badgeHtml = `<span class="safelock-badge-matured"><span class="pulse-indicator" style="background:#15803d;"></span> Matured (0% Fee)</span>`;
      } else {
        badgeHtml = `<span class="safelock-badge-running"><span class="pulse-indicator" style="background:#d97706;"></span> Running</span>`;
      }

      let countdownBoxHtml = '';
      if (isRel) {
        const unlObj = l.unlockedAt ? new Date(l.unlockedAt) : null;
        const unlDateStr = (unlObj && !isNaN(unlObj.getTime())) ? unlObj.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Completed';
        countdownBoxHtml = `
          <div class="countdown-matured-banner" style="background: #f1f5f9; border-color: #cbd5e1; color: #475569;">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
            <span>Lock Released on ${unlDateStr} &bull; Net ₦${formatAmount(l.netReturned || l.amount)}</span>
          </div>`;
      } else if (isMat || cd.isMatured) {
        countdownBoxHtml = `
          <div class="countdown-matured-banner">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            <span>Target Reached! Ready for 0% Free Payout</span>
          </div>`;
      } else {
        const boxesHtml = cd.boxes.map((b, idx) => `
          <div class="countdown-box">
            <span class="countdown-digits" data-cd-box="${b.unit.toLowerCase()}">${b.val}</span>
            <span class="countdown-unit">${b.unit}</span>
          </div>
          ${idx < cd.boxes.length - 1 ? '<span class="countdown-sep">:</span>' : ''}
        `).join('');

        countdownBoxHtml = `
          <div class="countdown-container" data-lock-cd="${l.id}" data-due="${l.dueDate}" data-locked="${l.lockedAt || ''}">
            ${boxesHtml}
          </div>`;
      }

      return `
        <div class="safelock-item-card ${isMat ? 'is-matured' : ''}" data-lock-id="${l.id}">
          <div class="safelock-item-header">
            <div>
              <h4 class="safelock-item-title">${escapeHtml(l.title || 'Target SafeLock')}</h4>
              <div class="safelock-item-dates">Maturity: <strong>${dueFormatted}</strong></div>
            </div>
            ${badgeHtml}
          </div>

          <div class="safelock-item-amount-row">
            <div>
              <span style="font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.3px;">Locked Principal</span>
              <div class="safelock-item-amount">₦${formatAmount(l.amount)}</div>
            </div>
          </div>

          ${countdownBoxHtml}

          <div class="safelock-progress-track">
            <div class="safelock-progress-fill" style="width: ${isRel ? 100 : cd.progressPercent}%;"></div>
          </div>

          <div class="safelock-item-footer">
            <span>Target: <strong>${dueFormatted}</strong></span>
            <span class="safelock-tap-hint">
              <span>${isRel ? 'View released details' : 'View details & withdraw'}</span>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg>
            </span>
          </div>
        </div>`;
    }).join('');

    listContainer.innerHTML = html;

    listContainer.querySelectorAll('.safelock-item-card').forEach(card => {
      card.addEventListener('click', () => {
        openUnlockModal(card.dataset.lockId);
      });
    });
  }

  function formatAmount(n) {
    const num = Math.abs(parseFloat(n) || 0);
    const parts = num.toFixed(2).split('.');
    const integerPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    const decimalPart = parts[1];
    return (parseFloat(n) < 0 ? '-' : '') + integerPart + '.' + decimalPart;
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

    const hubView = document.getElementById('view-safelock-hub');
    if (hubView) {
      hubView.classList.add('hidden');
      stopSafeLockCountdowns();
    }

    document.querySelectorAll('.tab-btn[data-tab]').forEach(b => {
      b.classList.toggle('active', b.dataset.tab === tab);
    });

    const homeEl = document.getElementById('tab-home-content');
    const saveEl = document.getElementById('tab-save-content');
    const moreEl = document.getElementById('tab-more-content');

    if (homeEl) homeEl.classList.toggle('hidden', tab !== 'home');
    if (saveEl) saveEl.classList.toggle('hidden', tab !== 'save');
    if (moreEl) moreEl.classList.toggle('hidden', tab !== 'more');

    if (tab === 'more') {
      renderMoreUserInfo();
    } else if (tab === 'home') {
      renderSavingsList();
      renderTotal();
      renderDedicatedAccountCard();
    }
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
    const phoneEl    = document.getElementById('more-user-phone');
    const emailEl    = document.getElementById('more-user-email');
    const initialsEl = document.getElementById('more-user-initials');
    const photoEl    = document.getElementById('more-user-photo');
    const idEl       = document.getElementById('more-user-id');
    const fn = DB.formatName(user.firstName || '');
    const ln = DB.formatName(user.lastName || '');
    if (nameEl)  nameEl.textContent  = `${fn} ${ln}`;
    if (idEl)    idEl.textContent    = user.id || '';
    if (phoneEl) {
      if (user.phone && user.phone.trim()) {
        phoneEl.textContent = user.phone.trim();
        phoneEl.style.display = 'block';
      } else {
        phoneEl.textContent = '';
        phoneEl.style.display = 'none';
      }
    }
    if (emailEl) {
      if (user.email && user.email.trim()) {
        emailEl.textContent = user.email.trim();
        emailEl.style.display = 'block';
      } else {
        emailEl.textContent = '';
        emailEl.style.display = 'none';
      }
    }
    if (photoEl && initialsEl) {
      if (user.passportPhoto) {
        photoEl.src = user.passportPhoto;
        photoEl.style.display = 'block';
        initialsEl.style.display = 'none';
      } else {
        photoEl.style.display = 'none';
        initialsEl.style.display = 'flex';
        const i1 = (user.firstName || '').trim().charAt(0);
        const i2 = (user.lastName || '').trim().charAt(0);
        initialsEl.textContent = (i1 + i2).toUpperCase() || 'U';
      }
    } else if (initialsEl) {
      const i1 = (user.firstName || '').trim().charAt(0);
      const i2 = (user.lastName || '').trim().charAt(0);
      initialsEl.textContent = (i1 + i2).toUpperCase() || 'U';
    }
    updateMoreTabBankSummary();
    updateMoreTabDedicatedSummary();
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

  function openPayoutSuccessModal({ gross, fee, net, bankName, accountNumber, balance, isInstant, delayHours }) {
    const modal = document.getElementById('modal-payout-success');
    if (!modal) return;

    const titleEl = document.getElementById('succ-payout-title');
    const descEl  = document.getElementById('succ-payout-desc');
    const grossEl = document.getElementById('succ-payout-gross');
    const feeEl   = document.getElementById('succ-payout-fee');
    const netEl   = document.getElementById('succ-payout-net');
    const bankEl  = document.getElementById('succ-payout-bank');
    const balEl   = document.getElementById('succ-payout-balance');

    const dHours = (delayHours !== undefined) ? delayHours : ((typeof DB !== 'undefined' && DB.getPayoutDelayHours) ? DB.getPayoutDelayHours() : 24);
    const delayLabel = (typeof DB !== 'undefined' && DB.getPayoutDelayLabel) ? DB.getPayoutDelayLabel(dHours) : `${dHours} Hours`;

    if (titleEl) titleEl.textContent = isInstant ? 'Payout Disbursed!' : 'Payout Request Submitted!';
    if (descEl) {
      descEl.textContent = isInstant
        ? `₦${formatAmount(net)} has been automatically disbursed to your bank account.`
        : `Your payout request of ₦${formatAmount(gross)} has been submitted. Processing window: ${delayLabel}. Scheduled for review and release.`;
    }
    if (grossEl) grossEl.textContent = `₦${formatAmount(gross)}`;
    if (feeEl)   feeEl.textContent   = `-₦${formatAmount(fee)}`;
    if (netEl)   netEl.textContent   = `₦${formatAmount(net)}`;
    if (bankEl)  bankEl.textContent  = `${bankName} • ${accountNumber}`;
    if (balEl)   balEl.textContent   = `₦${formatAmount(balance)}`;

    modal.classList.remove('hidden');
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
    let isWithdrawalSubmitting = false;

    function setFormMode(mode) {
      const amtInput = document.getElementById('save-amount');
      const minHint = document.getElementById('save-amount-min-hint');

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
        if (minHint) minHint.classList.add('hidden');
        if (amtInput) {
          amtInput.placeholder = '0.00';
          amtInput.min = '0';
        }
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
        const minWth = (typeof DB !== 'undefined' && DB.getMinimumWithdrawal) ? DB.getMinimumWithdrawal() : 500;
        const minRetain = (typeof DB !== 'undefined' && DB.getMinimumBalanceRetention) ? DB.getMinimumBalanceRetention() : 500;
        const userBal = DB.getUserBalance(currentUserId);
        const avail = (typeof userBal.availableBalance === 'number') ? userBal.availableBalance : userBal.balance;
        const maxWithdrawable = Math.max(0, avail - minRetain);

        const withAvailEl = document.getElementById('with-total-avail-bal');
        const withRetEl = document.getElementById('with-retained-min-bal');
        const withMaxEl = document.getElementById('with-max-withdrawable-bal');
        if (withAvailEl) withAvailEl.textContent = '₦' + formatAmount(avail);
        if (withRetEl) withRetEl.textContent = '-₦' + formatAmount(minRetain);
        if (withMaxEl) withMaxEl.textContent = '₦' + formatAmount(maxWithdrawable);

        const delayH = (typeof DB !== 'undefined' && DB.getPayoutDelayHours) ? DB.getPayoutDelayHours() : 24;
        const withDelayEl = document.getElementById('with-processing-delay-label');
        if (withDelayEl) withDelayEl.textContent = (typeof DB !== 'undefined' && DB.getPayoutDelayLabel) ? DB.getPayoutDelayLabel(delayH) : `${delayH} Hours`;

        const effectiveMin = Math.min(minWth, maxWithdrawable);
        if (withDest) withDest.classList.remove('hidden');
        if (minHint) {
          minHint.textContent = `(Min. ₦${formatAmount(effectiveMin)})`;
          minHint.classList.remove('hidden');
        }
        if (amtInput) {
          amtInput.placeholder = maxWithdrawable > 0 ? `Max: ${formatAmount(maxWithdrawable)}` : `Min. ${formatAmount(effectiveMin)}`;
          amtInput.min = String(effectiveMin);
        }
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
        if (res.resolvedBankCode && bankSelectEl) {
          bankSelectEl.value = res.resolvedBankCode;
        }
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

    // Dynamic Fee Breakdown Real-time Calculator
    const saveAmtInput = document.getElementById('save-amount');
    const withGrossEl  = document.getElementById('with-gross-amt');
    const withFeeEl    = document.getElementById('with-fee-amt');
    const withNetEl    = document.getElementById('with-net-amt');

    if (saveAmtInput) {
      if (typeof window.disableNumberInputWheelScroll === 'function') {
        window.disableNumberInputWheelScroll(saveAmtInput);
      } else {
        saveAmtInput.addEventListener('wheel', (e) => { e.preventDefault(); e.target.blur(); }, { passive: false });
      }
    }

    function updateFeeCalculations() {
      if (!saveAmtInput) return;
      const raw = String(saveAmtInput.value || '').replace(/,/g, '').trim();
      const gross = parseFloat(raw) || 0;
      const commRate = (typeof DB !== 'undefined' && DB.getCommissionRate) ? DB.getCommissionRate() : 4;
      const feeRate = commRate / 100;
      const fee = Math.round(gross * feeRate * 100) / 100;
      const net = Math.max(0, Math.round((gross - fee) * 100) / 100);

      // Dynamically update commission & minimum withdrawal badges in UI
      document.querySelectorAll('.comm-rate-badge').forEach(badge => {
        badge.textContent = `${commRate}%`;
      });
      if (typeof DB !== 'undefined' && DB.updateMinWithdrawalDOM) {
        DB.updateMinWithdrawalDOM();
      }

      if (withGrossEl) withGrossEl.textContent = `₦${formatAmount(gross)}`;
      if (withFeeEl)   withFeeEl.textContent   = `-₦${formatAmount(fee)}`;
      if (withNetEl)   withNetEl.textContent   = `₦${formatAmount(net)}`;

      if (typeInput && typeInput.value === 'withdrawal') {
        const btnText = submitText || submitBtn;
        const errEl = document.getElementById('err-save-amount');
        const minWth = (typeof DB !== 'undefined' && DB.getMinimumWithdrawal) ? DB.getMinimumWithdrawal() : 500;
        const minRetain = (typeof DB !== 'undefined' && DB.getMinimumBalanceRetention) ? DB.getMinimumBalanceRetention() : 500;
        const userBal = DB.getUserBalance(currentUserId);
        const avail = (typeof userBal.availableBalance === 'number') ? userBal.availableBalance : userBal.balance;
        const maxWithdrawable = Math.max(0, avail - minRetain);

        const withAvailEl = document.getElementById('with-total-avail-bal');
        const withRetEl = document.getElementById('with-retained-min-bal');
        const withMaxEl = document.getElementById('with-max-withdrawable-bal');
        if (withAvailEl) withAvailEl.textContent = '₦' + formatAmount(avail);
        if (withRetEl) withRetEl.textContent = '-₦' + formatAmount(minRetain);
        if (withMaxEl) withMaxEl.textContent = '₦' + formatAmount(maxWithdrawable);

        const delayH = (typeof DB !== 'undefined' && DB.getPayoutDelayHours) ? DB.getPayoutDelayHours() : 24;
        const withDelayEl = document.getElementById('with-processing-delay-label');
        if (withDelayEl) withDelayEl.textContent = (typeof DB !== 'undefined' && DB.getPayoutDelayLabel) ? DB.getPayoutDelayLabel(delayH) : `${delayH} Hours`;

        if (maxWithdrawable <= 0) {
          if (errEl) errEl.textContent = `You must maintain a minimum balance of ₦${formatAmount(minRetain)} in your account. Your available balance is ₦${formatAmount(avail)}, so no funds can be withdrawn at this time.`;
          saveAmtInput.classList.add('input-error');
          if (btnText) btnText.textContent = `Maintain Min. Balance ₦${formatAmount(minRetain)}`;
        } else if (gross > maxWithdrawable) {
          if (errEl) errEl.textContent = `Cannot withdraw ₦${formatAmount(gross)}. You must keep at least ₦${formatAmount(minRetain)} in your account. Maximum withdrawable is ₦${formatAmount(maxWithdrawable)}.`;
          saveAmtInput.classList.add('input-error');
          if (btnText) btnText.textContent = `Max Withdrawable is ₦${formatAmount(maxWithdrawable)}`;
        } else {
          const effectiveMin = Math.min(minWth, maxWithdrawable);
          if (gross > 0 && gross < effectiveMin) {
            if (errEl) errEl.textContent = `Minimum withdrawal is ₦${formatAmount(effectiveMin)} (₦${formatAmount(effectiveMin)} and above). Amounts below ₦${formatAmount(effectiveMin)} are not allowed.`;
            saveAmtInput.classList.add('input-error');
            if (btnText) btnText.textContent = `Minimum Withdrawal is ₦${formatAmount(effectiveMin)}`;
          } else {
            if (errEl) {
              errEl.textContent = '';
              saveAmtInput.classList.remove('input-error');
            }
            if (btnText) {
              btnText.textContent = gross > 0
                ? `Request Bank Payout of ₦${formatAmount(net)} (Net)`
                : 'Request Bank Payout via Flutterwave';
            }
          }
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

    // Quick amount pills for savings deposit/request form
    document.querySelectorAll('#save-quick-amounts .quick-amt-pill').forEach(pill => {
      pill.addEventListener('click', () => {
        const amtInput = document.getElementById('save-amount');
        if (!amtInput) return;
        const add = parseFloat(pill.dataset.amt) || 0;
        const current = parseFloat(String(amtInput.value || '').replace(/,/g, '')) || 0;
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

    // Close payout success modal
    const closePayoutSuccBtn = document.getElementById('btn-close-payout-success');
    const modalPayoutSucc    = document.getElementById('modal-payout-success');
    if (closePayoutSuccBtn && modalPayoutSucc) {
      closePayoutSuccBtn.addEventListener('click', () => {
        modalPayoutSucc.classList.add('hidden');
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
      const rawAmt      = String(amountInput.value || '').replace(/,/g, '').trim();
      const amount      = parseFloat(rawAmt);

      if (!rawAmt || isNaN(amount) || amount <= 0) {
        if (errEl) errEl.textContent = 'Enter a valid amount greater than 0.';
        amountInput.classList.add('input-error');
        return;
      }

      if (type === 'withdrawal') {
        const minRetain = (typeof DB !== 'undefined' && DB.getMinimumBalanceRetention) ? DB.getMinimumBalanceRetention() : 500;
        const userBal = DB.getUserBalance(currentUserId);
        const avail = (typeof userBal.availableBalance === 'number') ? userBal.availableBalance : userBal.balance;
        const maxWithdrawable = Math.max(0, avail - minRetain);

        if (maxWithdrawable <= 0) {
          if (errEl) errEl.textContent = `You must maintain a minimum balance of ₦${formatAmount(minRetain)} in your account. Your available balance is ₦${formatAmount(avail)}, so no funds can be withdrawn at this time.`;
          amountInput.classList.add('input-error');
          amountInput.focus();
          return;
        }

        if (amount > maxWithdrawable) {
          if (errEl) errEl.textContent = `Cannot withdraw ₦${formatAmount(amount)}. A minimum balance of ₦${formatAmount(minRetain)} must remain in your account. Your maximum withdrawable amount is ₦${formatAmount(maxWithdrawable)}.`;
          amountInput.classList.add('input-error');
          amountInput.focus();
          return;
        }

        const minWth = (typeof DB !== 'undefined' && DB.getMinimumWithdrawal) ? DB.getMinimumWithdrawal() : 500;
        const effectiveMin = Math.min(minWth, maxWithdrawable);
        if (amount < effectiveMin) {
          if (errEl) errEl.textContent = `Minimum withdrawal amount is ₦${formatAmount(effectiveMin)} (₦${formatAmount(effectiveMin)} and above). Amounts below ₦${formatAmount(effectiveMin)} are not allowed.`;
          amountInput.classList.add('input-error');
          amountInput.focus();
          return;
        }
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

        // Save pending deposit in localStorage before invoking Flutterwave
        try {
          localStorage.setItem('sun_pending_deposit', JSON.stringify({
            userId: currentUserId,
            amount: amount,
            category: category,
            txRef: txRef,
            userNote: userNote,
            timestamp: Date.now()
          }));
        } catch(e) {}

        const originalText = submitText ? submitText.textContent : 'Generate Bank Transfer Account';
        if (submitText) submitText.textContent = 'Generating Bank Transfer Account...';
        if (submitBtn) submitBtn.disabled = true;

        let flwInstance = null;

        function closeFlutterwaveModal() {
          try {
            if (flwInstance && typeof flwInstance.close === 'function') {
              flwInstance.close();
            }
          } catch(e) {}
          try {
            document.querySelectorAll('iframe[name="checkout"], iframe[src*="flutterwave"], iframe[src*="flw"], #flwpug_embed, .flwpug_embed, .flw-payment-modal').forEach(el => {
              try { el.remove(); } catch(e) {}
            });
            document.querySelectorAll('div[id*="flwpug"], div[class*="flw-payment"], div[style*="2147483647"]').forEach(el => {
              try { el.remove(); } catch(e) {}
            });
            document.body.style.overflow = '';
          } catch(e) {}
        }

        try {
          const redirectUrl = window.location.origin + window.location.pathname + '?flw_redirect=1';
          flwInstance = window.FlutterwaveCheckout({
            public_key: flwConfig.publicKey,
            tx_ref: txRef,
            amount: amount,
            currency: 'NGN',
            payment_options: 'banktransfer,card,ussd',
            redirect_url: redirectUrl,
            customer: {
              email: (user.email && user.email.trim()) ? user.email.trim() : 'iretomiwa.sun.investment@gmail.com',
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
                // Immediately close Flutterwave iframe so user is returned to the main app screen
                closeFlutterwaveModal();

                // Clear pending deposit
                try { localStorage.removeItem('sun_pending_deposit'); } catch(e) {}

                const txRefCode = response.tx_ref || response.transaction_id || txRef;
                const existingTxs = DB.getTransactions(currentUserId);
                const alreadyExists = existingTxs.some(t => t.flutterwaveRef === txRefCode || (response.transaction_id && t.flwId == response.transaction_id));

                if (!alreadyExists) {
                  DB.addTransaction({
                    userId: currentUserId,
                    type: 'deposit',
                    amount: amount,
                    category: category,
                    note: userNote ? `${userNote} (Flutterwave: ${txRefCode})` : `Flutterwave Bank Transfer (${txRefCode})`,
                    recordedBy: 'user',
                    status: 'approved',
                    paymentGateway: 'flutterwave',
                    flutterwaveRef: txRefCode,
                    flwId: response.transaction_id || null,
                  });
                }

                // Clear inputs
                amountInput.value = '';
                if (noteInput) noteInput.value = '';

                // REDIRECT TO MAIN DASHBOARD (Home tab)
                switchTab('home');
                renderSavingsList();
                renderTotal();

                // Show confirmation receipt modal on top of main dashboard
                const updatedBal = DB.getUserBalance(currentUserId).availableBalance;
                openDepositSuccessModal({
                  amount: amount,
                  category: category,
                  ref: txRefCode,
                  newBalance: updatedBal,
                });
              } else {
                if (errorEl) {
                  errorEl.textContent = 'Payment transfer was not completed. Please try again.';
                  errorEl.classList.remove('hidden');
                }
              }
            },
            onclose: function () {
              closeFlutterwaveModal();
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
      const minRetain = (typeof DB !== 'undefined' && DB.getMinimumBalanceRetention) ? DB.getMinimumBalanceRetention() : 500;
      const maxWithdrawable = Math.max(0, avail - minRetain);

      if (maxWithdrawable <= 0) {
        if (errEl) errEl.textContent = `You must maintain a minimum balance of ₦${formatAmount(minRetain)} in your account. Your available balance is ₦${formatAmount(avail)}, so no funds can be withdrawn at this time.`;
        amountInput.classList.add('input-error');
        amountInput.focus();
        return;
      }

      if (amount > maxWithdrawable) {
        if (errEl) {
          errEl.textContent = `Cannot withdraw ₦${formatAmount(amount)}. A minimum balance of ₦${formatAmount(minRetain)} must remain in your account. Your maximum withdrawable amount is ₦${formatAmount(maxWithdrawable)}.`;
        }
        amountInput.classList.add('input-error');
        amountInput.focus();
        return;
      }

      const minWthPayout = (typeof DB !== 'undefined' && DB.getMinimumWithdrawal) ? DB.getMinimumWithdrawal() : 500;
      const effectiveMin = Math.min(minWthPayout, maxWithdrawable);
      if (amount < effectiveMin) {
        if (errEl) errEl.textContent = `Minimum withdrawal amount is ₦${formatAmount(effectiveMin)} (₦${formatAmount(effectiveMin)} and above). Amounts below ₦${formatAmount(effectiveMin)} are not allowed.`;
        amountInput.classList.add('input-error');
        amountInput.focus();
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
        if (isWithdrawalSubmitting) {
          console.warn('[Withdrawal GUARD] Duplicate submission blocked. Request is already in progress.');
          return;
        }
        isWithdrawalSubmitting = true;

        const originalText = submitText ? submitText.textContent : 'Request Withdrawal';
        if (submitBtn) {
          submitBtn.disabled = true;
          submitBtn.style.pointerEvents = 'none';
        }
        if (submitText) submitText.textContent = 'Processing Instant Disbursement...';

        const commRate = (typeof DB !== 'undefined' && DB.getCommissionRate) ? DB.getCommissionRate() : 4;
        const feeRate = commRate / 100;
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

        const newTx = DB.addTransaction({
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

        if (!newTx) {
          console.error('[Withdrawal Error] DB.addTransaction returned null for amount:', amount);
          if (errorEl) {
            errorEl.textContent = `Could not submit withdrawal request for ₦${formatAmount(amount)}. Please ensure amount meets the minimum ₦${formatAmount(minWthPayout)}.`;
            errorEl.classList.remove('hidden');
          }
          isWithdrawalSubmitting = false;
          if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.style.pointerEvents = '';
          }
          if (submitText) submitText.textContent = originalText;
          return;
        }

        // Immediately push to cloud so Admin sees pending request in real time
        try {
          DB.syncPush().catch(e => console.warn('Pending withdrawal sync warning:', e));
        } catch (e) {}

        // Reset inputs
        amountInput.value = '';
        if (noteInput) noteInput.value = '';
        updateFeeCalculations();

        // 100% Instant Automatic Disbursement via 24/7 Railway Cloud Backend
        const clientLegalName = user ? `${DB.formatName(user.firstName)} ${DB.formatName(user.lastName)}` : 'Client';

        // Redirect user directly to Home tab and refresh balances/transactions
        switchTab('home');
        renderSavingsList();
        renderTotal();

        const currentBal = (typeof DB !== 'undefined' && DB.getUserBalance)
          ? DB.getUserBalance(currentUserId).availableBalance
          : 0;

        const flwCfg = (typeof DB !== 'undefined' && DB.getFlutterwaveConfig) ? DB.getFlutterwaveConfig() : {};
        const delayHours = (typeof DB !== 'undefined' && DB.getPayoutDelayHours) ? DB.getPayoutDelayHours() : 24;
        // Payout is only dispatched automatically if admin set processing window to 0 (Instant) AND enabled Auto Cashout
        const isAutoCashoutEnabled = flwCfg && flwCfg.autoCashout === true && delayHours === 0;

        if (isAutoCashoutEnabled && destinationBank.accountNumber && destinationBank.bankCode) {
          DB.disburseFlutterwaveTransfer({
            accountNumber: destinationBank.accountNumber,
            bankCode: destinationBank.bankCode,
            amount: netAmount,
            narration: `Payout to ${clientLegalName} - Iretomiwa Sun`,
            txId: newTx.id,
            clientName: clientLegalName,
            userId: currentUserId,
          }).then(res => {
            isWithdrawalSubmitting = false;
            if (submitBtn) {
              submitBtn.disabled = false;
              submitBtn.style.pointerEvents = '';
            }
            if (submitText) submitText.textContent = originalText;

            if (res && res.success) {
              DB.approveTransaction(newTx.id, {
                reviewedBy: 'system (100% instant auto-cashout)',
                paymentGateway: 'flutterwave',
                flutterwaveTransferId: res.transferId,
                flutterwaveRef: res.reference,
                grossAmount: amount,
                fee: fee,
                netAmount: netAmount,
                feeRate: feeRate,
              });
              renderSavingsList();
              renderTotal();
              openPayoutSuccessModal({
                gross: amount,
                fee: fee,
                net: netAmount,
                bankName: bName,
                accountNumber: bNum,
                balance: DB.getUserBalance(currentUserId).availableBalance,
                isInstant: true
              });
            } else {
              renderSavingsList();
              renderTotal();
              openPayoutSuccessModal({
                gross: amount,
                fee: fee,
                net: netAmount,
                bankName: bName,
                accountNumber: bNum,
                balance: DB.getUserBalance(currentUserId).availableBalance,
                isInstant: false
              });
            }
          }).catch(err => {
            console.warn('100% instant cashout transfer error:', err);
            isWithdrawalSubmitting = false;
            if (submitBtn) {
              submitBtn.disabled = false;
              submitBtn.style.pointerEvents = '';
            }
            if (submitText) submitText.textContent = originalText;
            renderSavingsList();
            renderTotal();
            openPayoutSuccessModal({
              gross: amount,
              fee: fee,
              net: netAmount,
              bankName: bName,
              accountNumber: bNum,
              balance: DB.getUserBalance(currentUserId).availableBalance,
              isInstant: false
            });
          });
        } else {
          isWithdrawalSubmitting = false;
          if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.style.pointerEvents = '';
          }
          if (submitText) submitText.textContent = originalText;
          openPayoutSuccessModal({
            gross: amount,
            fee: fee,
            net: netAmount,
            bankName: bName,
            accountNumber: bNum,
            balance: currentBal,
            isInstant: false,
            delayHours: delayHours,
          });
        }
      }
    });
  }

  // ---- Edit Profile Modal ----
  function initEditProfile() {
    const btn = document.getElementById('btn-edit-profile');
    if (!btn) return;

    let pendingPhotoDataUrl = null;

    btn.addEventListener('click', () => {
      const user = DB.getUserById(currentUserId);
      if (!user) return;
      pendingPhotoDataUrl = null;
      document.getElementById('edit-firstname').value = user.firstName;
      document.getElementById('edit-lastname').value  = user.lastName;
      document.getElementById('edit-email').value     = user.email;
      document.getElementById('edit-phone').value     = user.phone;
      document.getElementById('edit-profile-error').classList.add('hidden');
      document.getElementById('edit-profile-success').classList.add('hidden');

      const previewEl = document.getElementById('edit-profile-photo-preview');
      const initialsEl = document.getElementById('edit-profile-photo-initials');
      const statusEl = document.getElementById('user-photo-status');
      if (statusEl) statusEl.style.display = 'none';

      if (previewEl && initialsEl) {
        if (user.passportPhoto) {
          previewEl.src = user.passportPhoto;
          previewEl.style.display = 'block';
          initialsEl.style.display = 'none';
        } else {
          previewEl.style.display = 'none';
          initialsEl.style.display = 'inline';
          const i1 = (user.firstName || '').charAt(0);
          const i2 = (user.lastName || '').charAt(0);
          initialsEl.textContent = (i1 + i2).toUpperCase() || 'U';
        }
      }

      openModal('modal-edit-profile');
    });

    // Wire photo change button
    const photoBtn = document.getElementById('btn-user-change-photo');
    const photoInput = document.getElementById('user-photo-input');
    const photoStatus = document.getElementById('user-photo-status');

    if (photoBtn && photoInput) {
      photoBtn.addEventListener('click', (e) => {
        e.preventDefault();
        photoInput.click();
      });

      photoInput.addEventListener('change', async (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;

        if (photoStatus) {
          photoStatus.textContent = 'Compressing image...';
          photoStatus.style.display = 'block';
          photoStatus.style.color = 'var(--primary)';
        }

        try {
          const res = await DB.compressImage(file, { maxKB: 95, maxDimension: 480 });
          pendingPhotoDataUrl = res.dataUrl;

          const previewEl = document.getElementById('edit-profile-photo-preview');
          const initialsEl = document.getElementById('edit-profile-photo-initials');
          if (previewEl) {
            previewEl.src = res.dataUrl;
            previewEl.style.display = 'block';
          }
          if (initialsEl) initialsEl.style.display = 'none';

          if (photoStatus) {
            photoStatus.textContent = `New photo compressed to ${res.sizeKB} KB (under 100 KB). Click Save Changes to apply.`;
            photoStatus.style.color = '#166534';
          }
        } catch (err) {
          if (photoStatus) {
            photoStatus.textContent = 'Error processing photo: ' + (err.message || 'Unknown error');
            photoStatus.style.color = '#dc2626';
          }
        } finally {
          photoInput.value = '';
        }
      });
    }

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

      const updatePayload = { firstName, lastName, email, phone };
      if (pendingPhotoDataUrl) {
        updatePayload.passportPhoto = pendingPhotoDataUrl;
        updatePayload.photoUpdatedAt = new Date().toISOString();
      }

      DB.updateUser(currentUserId, updatePayload);
      pendingPhotoDataUrl = null;
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
        if (res.resolvedBankCode && bankSelect) {
          bankSelect.value = res.resolvedBankCode;
        }
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

  // ---- DEDICATED PERMANENT SAVINGS ACCOUNT ----
  function renderDedicatedAccountCard() {
    const wrap = document.getElementById('user-dedicated-account-card-wrap');
    if (!wrap || !currentUserId) return;
    const user = DB.getUserById(currentUserId);
    if (!user) return;

    const dedicated = DB.getUserDedicatedAccount(currentUserId);
    if (dedicated && dedicated.accountNumber) {
      const fullName = `${DB.formatName(user.firstName)} ${DB.formatName(user.lastName)}`.trim();
      wrap.innerHTML = `
        <div class="dedicated-account-card">
          <div class="dedicated-card-badge">Permanent Dedicated Savings Account</div>
          <div class="dedicated-card-body">
            <div class="dedicated-card-row">
              <span class="dedicated-label">Bank Name</span>
              <span class="dedicated-val">${escapeHtml(dedicated.bankName || 'Wema Bank')}</span>
            </div>
            <div class="dedicated-card-row dedicated-account-highlight">
              <div>
                <span class="dedicated-label">Account Number</span>
                <span class="dedicated-acc-num">${escapeHtml(dedicated.accountNumber)}</span>
              </div>
              <button type="button" class="btn-copy-dedicated" id="btn-copy-home-dedicated">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                </svg>
                <span class="copy-text">Copy</span>
              </button>
            </div>
            <div class="dedicated-card-row">
              <span class="dedicated-label">Account Name (Personal)</span>
              <span class="dedicated-val">${escapeHtml(dedicated.accountName || fullName)}</span>
            </div>
          </div>
          <div class="dedicated-card-footer">
            <span class="dedicated-dot"></span>
            <span>Transfer anytime from your bank app (OPay, PalmPay, GTBank, etc.). Balance records automatically.</span>
          </div>
        </div>
      `;

      const copyBtn = document.getElementById('btn-copy-home-dedicated');
      if (copyBtn) {
        copyBtn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          copyTextToClipboard(dedicated.accountNumber, () => {
            const span = copyBtn.querySelector('.copy-text');
            copyBtn.classList.add('copied');
            if (span) span.textContent = 'Copied!';
            setTimeout(() => {
              copyBtn.classList.remove('copied');
              if (span) span.textContent = 'Copy';
            }, 1800);
          });
        });
      }
    } else {
      wrap.innerHTML = `
        <div class="dedicated-promo-banner">
          <div class="dedicated-promo-content">
            <div class="dedicated-promo-title">Permanent Savings Account</div>
            <div class="dedicated-promo-sub">Get your personal Nigerian bank account. Transfer money anytime from OPay, PalmPay, or your bank and your savings update automatically without logging in.</div>
          </div>
          <button type="button" class="btn-primary btn-mini" id="btn-promo-open-dedicated" style="background:#f3a812; color:#06391a; font-weight:800; border:none; padding:8px 14px; border-radius:6px; cursor:pointer;">
            Generate Account
          </button>
        </div>
      `;

      const promoBtn = document.getElementById('btn-promo-open-dedicated');
      if (promoBtn) {
        promoBtn.addEventListener('click', (e) => {
          e.preventDefault();
          openDedicatedAccountModal();
        });
      }
    }
  }

  function updateMoreTabDedicatedSummary() {
    const subEl = document.getElementById('more-user-dedicated-sub');
    if (!subEl || !currentUserId) return;
    const dedicated = DB.getUserDedicatedAccount(currentUserId);
    if (dedicated && dedicated.accountNumber) {
      subEl.textContent = `${dedicated.bankName}   ${dedicated.accountNumber}`;
      subEl.style.color = 'var(--primary)';
      subEl.style.fontWeight = '600';
    } else {
      subEl.textContent = 'Generate your permanent account number';
      subEl.style.color = 'var(--text-muted)';
      subEl.style.fontWeight = 'normal';
    }
  }

  function openDedicatedAccountModal() {
    if (!currentUserId) return;
    if (typeof DB !== 'undefined' && DB.reconcileDedicatedDeposits) {
      DB.reconcileDedicatedDeposits();
    }
    const user = DB.getUserById(currentUserId);
    if (!user) return;

    const modal = document.getElementById('modal-user-dedicated-account');
    const formView = document.getElementById('dedicated-account-form-view');
    const activeView = document.getElementById('dedicated-account-active-view');
    const fnInput = document.getElementById('dedicated-form-fullname');
    const bvnInput = document.getElementById('dedicated-form-bvn');
    const phoneInput = document.getElementById('dedicated-form-phone');
    const errBox = document.getElementById('dedicated-account-error');
    const succBox = document.getElementById('dedicated-account-success');
    const errBvn = document.getElementById('err-dedicated-bvn');
    const errPhone = document.getElementById('err-dedicated-phone');

    if (errBox) errBox.classList.add('hidden');
    if (succBox) succBox.classList.add('hidden');
    if (errBvn) errBvn.textContent = '';
    if (errPhone) errPhone.textContent = '';

    const fullName = `${DB.formatName(user.firstName)} ${DB.formatName(user.lastName)}`.trim();
    if (fnInput) fnInput.value = fullName;
    if (phoneInput) phoneInput.value = user.phone || '';
    if (bvnInput) bvnInput.value = '';

    const dedicated = DB.getUserDedicatedAccount(currentUserId);
    if (dedicated && dedicated.accountNumber) {
      // Show active account view
      if (formView) formView.classList.add('hidden');
      if (activeView) activeView.classList.remove('hidden');

      const bankEl = document.getElementById('modal-dedicated-bank-name');
      const numEl  = document.getElementById('modal-dedicated-acc-num');
      const nameEl = document.getElementById('modal-dedicated-acc-name');
      if (bankEl) bankEl.textContent = dedicated.bankName || 'Wema Bank';
      if (numEl)  numEl.textContent  = dedicated.accountNumber || '';
      if (nameEl) nameEl.textContent = dedicated.accountName || fullName;
    } else {
      // Show form view
      if (formView) formView.classList.remove('hidden');
      if (activeView) activeView.classList.add('hidden');
    }

    if (modal) modal.classList.remove('hidden');
  }

  function initDedicatedAccountModal() {
    const moreBtn = document.getElementById('btn-user-dedicated-account');
    if (moreBtn) {
      moreBtn.addEventListener('click', (e) => {
        e.preventDefault();
        openDedicatedAccountModal();
      });
    }

    // Modal copy button
    const modalCopyBtn = document.getElementById('btn-modal-copy-dedicated');
    if (modalCopyBtn) {
      modalCopyBtn.addEventListener('click', (e) => {
        e.preventDefault();
        const dedicated = DB.getUserDedicatedAccount(currentUserId);
        if (dedicated && dedicated.accountNumber) {
          copyTextToClipboard(dedicated.accountNumber, () => {
            const span = modalCopyBtn.querySelector('.copy-text');
            modalCopyBtn.classList.add('copied');
            if (span) span.textContent = 'Copied!';
            setTimeout(() => {
              modalCopyBtn.classList.remove('copied');
              if (span) span.textContent = 'Copy';
            }, 1800);
          });
        }
      });
    }

    // Generate submit button
    const submitBtn = document.getElementById('btn-submit-generate-dedicated');
    if (submitBtn) {
      submitBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        if (!currentUserId) return;
        const user = DB.getUserById(currentUserId);
        if (!user) return;

        const bvnInput = document.getElementById('dedicated-form-bvn');
        const phoneInput = document.getElementById('dedicated-form-phone');
        const errBox = document.getElementById('dedicated-account-error');
        const succBox = document.getElementById('dedicated-account-success');
        const errBvn = document.getElementById('err-dedicated-bvn');
        const errPhone = document.getElementById('err-dedicated-phone');

        if (errBox) errBox.classList.add('hidden');
        if (succBox) succBox.classList.add('hidden');
        if (errBvn) errBvn.textContent = '';
        if (errPhone) errPhone.textContent = '';

        const rawBvn = bvnInput ? bvnInput.value.trim().replace(/\D/g, '') : '';
        const rawPhone = phoneInput ? phoneInput.value.trim().replace(/\D/g, '') : '';

        let valid = true;
        if (!rawBvn || rawBvn.length !== 11) {
          if (errBvn) errBvn.textContent = 'Please enter a valid 11-digit BVN or NIN.';
          valid = false;
        }
        if (!rawPhone || rawPhone.length < 10) {
          if (errPhone) errPhone.textContent = 'Please enter a valid phone number.';
          valid = false;
        }
        if (!valid) return;

        const origText = submitBtn.textContent;
        submitBtn.disabled = true;
        submitBtn.textContent = 'Generating Account...';

        try {
          const accountData = await DB.generateFlutterwaveDedicatedAccount({
            userId: user.id,
            bvn: rawBvn,
            phone: rawPhone,
            firstName: user.firstName,
            lastName: user.lastName,
            email: user.email
          });

          if (succBox) {
            succBox.textContent = `Account created successfully with ${accountData.bankName}!`;
            succBox.classList.remove('hidden');
          }

          renderDedicatedAccountCard();
          updateMoreTabDedicatedSummary();

          setTimeout(() => {
            openDedicatedAccountModal();
          }, 1000);
        } catch (err) {
          console.error('Dedicated account generation failed:', err);
          if (errBox) {
            errBox.textContent = err.message || 'Could not generate virtual account. Please check your BVN/NIN and try again.';
            errBox.classList.remove('hidden');
          }
        } finally {
          submitBtn.disabled = false;
          submitBtn.textContent = origText;
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

  function copyTextToClipboard(text, onSuccess, onError) {
    if (!text) return;
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(onSuccess).catch(() => {
        fallbackCopy(text, onSuccess, onError);
      });
    } else {
      fallbackCopy(text, onSuccess, onError);
    }
  }

  function fallbackCopy(text, onSuccess, onError) {
    try {
      const textArea = document.createElement('textarea');
      textArea.value = text;
      textArea.style.position = 'fixed';
      textArea.style.top = '0';
      textArea.style.left = '0';
      textArea.style.width = '2em';
      textArea.style.height = '2em';
      textArea.style.padding = '0';
      textArea.style.border = 'none';
      textArea.style.outline = 'none';
      textArea.style.boxShadow = 'none';
      textArea.style.background = 'transparent';
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      const successful = document.execCommand('copy');
      document.body.removeChild(textArea);
      if (successful) {
        if (onSuccess) onSuccess();
      } else {
        if (onError) onError();
      }
    } catch (err) {
      if (onError) onError();
    }
  }

  function initCopyIdButton() {
    const btnCopy = document.getElementById('btn-copy-user-id');
    const idEl = document.getElementById('more-user-id');
    if (!btnCopy || !idEl) return;

    btnCopy.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const text = (idEl.textContent || '').trim();
      if (!text) return;

      copyTextToClipboard(text, () => {
        const copyTextSpan = btnCopy.querySelector('.copy-text');
        const origText = copyTextSpan ? copyTextSpan.textContent : 'Copy';
        btnCopy.classList.add('copied');
        if (copyTextSpan) copyTextSpan.textContent = 'Copied!';
        setTimeout(() => {
          btnCopy.classList.remove('copied');
          if (copyTextSpan) copyTextSpan.textContent = origText;
        }, 1800);
      });
    });
  }

  function checkPendingFlutterwaveRedirect() {
    let urlParams;
    try {
      urlParams = new URLSearchParams(window.location.search);
    } catch(e) {
      return;
    }

    const status = urlParams.get('status');
    const txRef = urlParams.get('tx_ref');
    const transactionId = urlParams.get('transaction_id');
    const isFlw = urlParams.get('flw_redirect') === '1' || status || txRef || transactionId;

    if (!isFlw) return;

    let pending = null;
    try {
      const saved = localStorage.getItem('sun_pending_deposit');
      if (saved) pending = JSON.parse(saved);
    } catch(e) {}

    const isSuccessful = status === 'successful' || status === 'completed' || (!status && transactionId);

    if (isSuccessful && (pending || txRef)) {
      const targetUserId = (pending && pending.userId) ? pending.userId : (currentUserId || (DB.getSession() ? DB.getSession().userId : null));
      if (targetUserId) {
        currentUserId = targetUserId;
        const targetTxRef = txRef || (pending ? pending.txRef : null) || ('SUN-DEP-' + targetUserId + '-' + Date.now());
        const existingTxs = DB.getTransactions(targetUserId);
        const alreadyRecorded = existingTxs.some(t => {
          const refs = [t.reference, t.flutterwaveRef, t.flwId ? String(t.flwId) : null, t.id].map(r => String(r || '').trim());
          return (refs.includes(targetTxRef) || (transactionId && refs.includes(String(transactionId))));
        });

        const depositAmount = (pending && pending.amount > 0) ? pending.amount : (parseFloat(urlParams.get('amount')) || 0);

        if (!alreadyRecorded && depositAmount > 0) {
          DB.addTransaction({
            userId: targetUserId,
            type: 'deposit',
            amount: depositAmount,
            category: (pending && pending.category) ? pending.category : 'General Savings',
            note: (pending && pending.userNote) ? `${pending.userNote} (Flutterwave: ${targetTxRef})` : `Flutterwave Bank Transfer (${targetTxRef})`,
            recordedBy: 'user',
            status: 'approved',
            paymentGateway: 'flutterwave',
            flutterwaveRef: targetTxRef,
            flwId: transactionId || null,
          });
        }

        try { localStorage.removeItem('sun_pending_deposit'); } catch(e) {}

        // Clean URL query params without reloading the page
        try {
          window.history.replaceState({}, document.title, window.location.pathname + '#user');
        } catch(e) {}

        // REDIRECT TO MAIN HOME TAB
        switchTab('home');
        renderSavingsList();
        renderTotal();

        const updatedBal = DB.getUserBalance(targetUserId).availableBalance;
        openDepositSuccessModal({
          amount: depositAmount,
          category: pending ? pending.category : 'General Savings',
          ref: targetTxRef,
          newBalance: updatedBal,
        });
        return;
      }
    }

    // If cancelled or failed
    try { localStorage.removeItem('sun_pending_deposit'); } catch(e) {}
    try {
      window.history.replaceState({}, document.title, window.location.pathname + '#user');
    } catch(e) {}
  }

  // ---- SafeLock (Locked Savings) Modal & Interaction Handlers ----
  function initSafeLock() {
    const lockModal = document.getElementById('modal-user-lock-money');
    const unlockModal = document.getElementById('modal-user-unlock-money');

    function setLockDueDate(isoStr) {
      const dateInput = document.getElementById('lock-due-date-input');
      const dateLabel = document.getElementById('lock-due-date-label');
      if (dateInput) dateInput.value = isoStr;
      if (dateLabel) {
        if (isoStr) {
          const parts = isoStr.split('-');
          if (parts.length === 3) {
            const y = parseInt(parts[0], 10);
            const m = parseInt(parts[1], 10) - 1;
            const d = parseInt(parts[2], 10);
            const dObj = new Date(y, m, d);
            dateLabel.textContent = !isNaN(dObj.getTime())
              ? dObj.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
              : isoStr;
          } else {
            dateLabel.textContent = isoStr;
          }
        } else {
          dateLabel.textContent = 'Choose Target Maturity Date...';
        }
      }
      updateLockPreview();
    }

    function openLockForm() {
      if (!lockModal) return;
      const userBal = DB.getUserBalance(currentUserId);
      const availEl = document.getElementById('user-lock-modal-avail-bal');
      const rateTxt = document.getElementById('user-lock-modal-penalty-rate-txt');
      const amtInput = document.getElementById('lock-amount-input');
      const titleInput = document.getElementById('lock-title-input');
      const errEl = document.getElementById('user-lock-error');
      const succEl = document.getElementById('user-lock-success');

      if (errEl) errEl.classList.add('hidden');
      if (succEl) succEl.classList.add('hidden');
      if (availEl) availEl.textContent = '₦' + formatAmount(userBal.availableBalance);
      if (rateTxt) rateTxt.textContent = `${DB.getLockPenaltyRate()}%`;

      if (amtInput) {
        amtInput.value = '';
        if (typeof window.disableNumberInputWheelScroll === 'function') {
          window.disableNumberInputWheelScroll(amtInput);
        }
      }
      if (titleInput) titleInput.value = '';

      // Default to +30 days (1 month maturity)
      const defTarget = new Date(Date.now() + (30 * 86400000));
      const defY = defTarget.getFullYear();
      const defM = String(defTarget.getMonth() + 1).padStart(2, '0');
      const defD = String(defTarget.getDate()).padStart(2, '0');
      setLockDueDate(`${defY}-${defM}-${defD}`);

      updateLockPreview();
      lockModal.classList.remove('hidden');
    }

    const openLockModalBtns = [
      document.getElementById('btn-open-lock-modal'),
      document.getElementById('btn-safelock-hub-create')
    ];
    openLockModalBtns.forEach(btn => {
      if (btn) btn.addEventListener('click', openLockForm);
    });

    const openHubBtns = [
      document.getElementById('btn-user-more-safelock'),
      document.getElementById('btn-home-open-safelock-hub'),
      document.getElementById('btn-save-tab-open-lock')
    ];
    openHubBtns.forEach(btn => {
      if (btn) {
        btn.addEventListener('click', () => {
          let sourceTab = 'more';
          if (btn.id === 'btn-home-open-safelock-hub') sourceTab = 'home';
          else if (btn.id === 'btn-save-tab-open-lock') sourceTab = 'save';
          openSafeLockHub(sourceTab);
        });
      }
    });

    const backBtn = document.getElementById('btn-safelock-back');
    if (backBtn) {
      backBtn.addEventListener('click', closeSafeLockHub);
    }

    // Filter pills
    const pillContainer = document.getElementById('safelock-filter-pills');
    if (pillContainer) {
      pillContainer.querySelectorAll('.safelock-pill').forEach(pill => {
        pill.addEventListener('click', () => {
          pillContainer.querySelectorAll('.safelock-pill').forEach(p => p.classList.remove('active'));
          pill.classList.add('active');
          safelockActiveFilter = pill.getAttribute('data-filter') || 'all';
          renderSafeLockHub();
        });
      });
    }

    // Custom Modular Sort Picker
    const sortBtn = document.getElementById('safelock-sort-btn');
    if (sortBtn) {
      sortBtn.addEventListener('click', () => {
        if (typeof CustomPicker === 'undefined' || !CustomPicker.openCustomSelect) return;
        const sortOptions = [
          { label: 'Maturity: Soonest', value: 'due_asc', sublabel: 'Nearest due date first' },
          { label: 'Maturity: Furthest', value: 'due_desc', sublabel: 'Furthest due date first' },
          { label: 'Amount: Highest', value: 'amount_desc', sublabel: 'Largest locked principal first' },
          { label: 'Amount: Lowest', value: 'amount_asc', sublabel: 'Smallest locked principal first' },
          { label: 'Newest Created', value: 'newest', sublabel: 'Most recently locked first' }
        ];

        CustomPicker.openCustomSelect({
          title: 'Sort SafeLock Savings',
          options: sortOptions,
          selectedValue: safelockActiveSort,
          onSelect: (opt) => {
            safelockActiveSort = opt.value || 'due_asc';
            const labelEl = document.getElementById('safelock-sort-label');
            if (labelEl) labelEl.textContent = opt.label;
            renderSafeLockHub();
          }
        });
      });
    }

    // Custom in-app date picker trigger for Target Maturity Date
    const dueDateBtn = document.getElementById('lock-due-date-btn');
    if (dueDateBtn) {
      dueDateBtn.addEventListener('click', () => {
        const dateInput = document.getElementById('lock-due-date-input');
        const currentVal = dateInput ? dateInput.value : '';
        const tomorrow = new Date(Date.now() + 86400000);
        tomorrow.setHours(0, 0, 0, 0);

        if (typeof CustomPicker !== 'undefined' && CustomPicker.openDatePicker) {
          CustomPicker.openDatePicker({
            period: 'day',
            initialDate: currentVal,
            title: 'Target Maturity Date',
            hidePeriodSwitcher: true,
            allowFuture: true,
            minDate: tomorrow,
            onSelect: (data) => {
              if (data && data.dateISO) {
                setLockDueDate(data.dateISO);
              }
            }
          });
        }
      });
    }

    // Quick percentage pills (25%, 50%, 75%, 100%)
    document.querySelectorAll('.lock-amt-percent-pill').forEach(pill => {
      pill.addEventListener('click', () => {
        const amtInput = document.getElementById('lock-amount-input');
        if (!amtInput) return;
        const pct = parseFloat(pill.dataset.pct) || 100;
        const userBal = DB.getUserBalance(currentUserId);
        const calc = Math.max(0, Math.floor((userBal.availableBalance * (pct / 100)) * 100) / 100);
        amtInput.value = calc > 0 ? calc.toFixed(2) : '';
        updateLockPreview();
      });
    });

    // Quick duration pills (+7 Days, +30 Days, +90 Days, +180 Days, +365 Days)
    document.querySelectorAll('.lock-duration-pill').forEach(pill => {
      pill.addEventListener('click', () => {
        const days = parseInt(pill.dataset.days, 10) || 30;
        const targetDate = new Date(Date.now() + (days * 86400000));
        const y = targetDate.getFullYear();
        const m = String(targetDate.getMonth() + 1).padStart(2, '0');
        const d = String(targetDate.getDate()).padStart(2, '0');
        setLockDueDate(`${y}-${m}-${d}`);
      });
    });

    function updateLockPreview() {
      const amtInput = document.getElementById('lock-amount-input');
      const dateInput = document.getElementById('lock-due-date-input');
      const prevAmt = document.getElementById('lock-prev-amount');
      const prevDate = document.getElementById('lock-prev-due-date');
      const prevPen = document.getElementById('lock-prev-penalty');
      const prevRem = document.getElementById('lock-prev-rem-bal');

      const rawAmt = String((amtInput && amtInput.value) || 0).replace(/,/g, '').trim();
      const amt = parseFloat(rawAmt) || 0;
      const userBal = DB.getUserBalance(currentUserId);
      const rem = Math.max(0, userBal.availableBalance - amt);
      const penaltyRate = DB.getLockPenaltyRate();

      if (prevAmt) prevAmt.textContent = '₦' + formatAmount(amt);
      if (prevRem) prevRem.textContent = '₦' + formatAmount(rem);
      if (prevPen) prevPen.textContent = `${penaltyRate}% if broken early`;

      if (prevDate && dateInput && dateInput.value) {
        const dObj = new Date(dateInput.value + 'T00:00:00');
        prevDate.textContent = !isNaN(dObj.getTime())
          ? dObj.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
          : dateInput.value;
      } else if (prevDate) {
        prevDate.textContent = '--';
      }
    }

    const lockAmtInput = document.getElementById('lock-amount-input');
    const lockDateInput = document.getElementById('lock-due-date-input');
    if (lockAmtInput) lockAmtInput.addEventListener('input', updateLockPreview);
    if (lockDateInput) lockDateInput.addEventListener('input', updateLockPreview);

    // Handle Lock Form Submit
    const lockForm = document.getElementById('user-lock-money-form');
    if (lockForm) {
      lockForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const titleInp = document.getElementById('lock-title-input');
        const amtInp   = document.getElementById('lock-amount-input');
        const dateInp  = document.getElementById('lock-due-date-input');
        const errAmt   = document.getElementById('err-lock-amount');
        const errDate  = document.getElementById('err-lock-due-date');
        const errBox   = document.getElementById('user-lock-error');
        const succBox  = document.getElementById('user-lock-success');

        if (errAmt) errAmt.textContent = '';
        if (errDate) errDate.textContent = '';
        if (errBox) errBox.classList.add('hidden');
        if (succBox) succBox.classList.add('hidden');

        const titleVal = (titleInp && titleInp.value.trim()) || 'Target SafeLock';
        const rawAmt = String((amtInp && amtInp.value) || 0).replace(/,/g, '').trim();
        const amtVal = parseFloat(rawAmt) || 0;
        const dateVal = (dateInp && dateInp.value) || '';

        if (!amtVal || isNaN(amtVal) || amtVal <= 0) {
          if (errAmt) errAmt.textContent = 'Please enter a valid amount to lock.';
          if (amtInp) amtInp.classList.add('input-error');
          return;
        }

        const userBal = DB.getUserBalance(currentUserId);
        if (amtVal > userBal.availableBalance) {
          if (errAmt) errAmt.textContent = `Insufficient available balance. You only have ₦${formatAmount(userBal.availableBalance)} available to lock.`;
          if (amtInp) amtInp.classList.add('input-error');
          return;
        }

        if (!dateVal) {
          if (errDate) errDate.textContent = 'Please choose a target maturity date.';
          return;
        }

        const now = new Date();
        const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
        if (dateVal <= todayStr) {
          if (errDate) errDate.textContent = 'Maturity date must be a future date (tomorrow or later).';
          return;
        }

        try {
          const res = DB.createLock({
            userId: currentUserId,
            title: titleVal,
            amount: amtVal,
            dueDate: dateVal
          });

          if (res.success) {
            if (succBox) {
              succBox.textContent = `Successfully locked ₦${formatAmount(amtVal)} until ${res.lock.dueDate}.`;
              succBox.classList.remove('hidden');
            }
            renderTotal();
            renderSavingsList();
            renderSafeLockHub();
            setTimeout(() => {
              if (lockModal) lockModal.classList.add('hidden');
            }, 1200);
          }
        } catch (err) {
          if (errBox) {
            errBox.textContent = err.message || 'Error creating lock.';
            errBox.classList.remove('hidden');
          }
        }
      });
    }

    // Handle Unlock Actions
    const btnUnlockBal = document.getElementById('btn-confirm-unlock-to-balance');
    const btnCancelUnlock = document.getElementById('btn-cancel-unlock');

    if (btnCancelUnlock && unlockModal) {
      btnCancelUnlock.addEventListener('click', () => {
        unlockModal.classList.add('hidden');
      });
    }

    let isUnlockActionSubmitting = false;

    async function handleUnlockAction() {
      if (isUnlockActionSubmitting) return;
      const idInput = document.getElementById('unlock-active-lock-id');
      const lockId = idInput ? idInput.value : '';
      if (!lockId) return;

      isUnlockActionSubmitting = true;
      if (btnUnlockBal) btnUnlockBal.disabled = true;

      const errBox  = document.getElementById('user-unlock-error');
      const succBox = document.getElementById('user-unlock-success');
      if (errBox) errBox.classList.add('hidden');
      if (succBox) succBox.classList.add('hidden');

      try {
        const res = DB.unlockLock(lockId);
        if (res.success) {
          const msg = res.isEarly
            ? `Early unlock processed. ₦${formatAmount(res.penaltyAmount)} (${res.penaltyRate}%) penalty deducted. ₦${formatAmount(res.netAmount)} returned back to your Main Balance.`
            : `SafeLock unlocked successfully! Full ₦${formatAmount(res.netAmount)} returned back to your Main Balance.`;

          if (succBox) {
            succBox.textContent = msg;
            succBox.classList.remove('hidden');
          }

          if (btnUnlockBal) btnUnlockBal.style.display = 'none';

          renderTotal();
          renderSavingsList();
          renderSafeLockHub();

          setTimeout(() => {
            isUnlockActionSubmitting = false;
            if (btnUnlockBal) {
              btnUnlockBal.disabled = false;
              btnUnlockBal.style.display = 'block';
            }
            if (unlockModal) unlockModal.classList.add('hidden');
          }, 1500);
        } else {
          isUnlockActionSubmitting = false;
          if (btnUnlockBal) btnUnlockBal.disabled = false;
          if (errBox) {
            errBox.textContent = res.error || 'Failed to unlock funds.';
            errBox.classList.remove('hidden');
          }
        }
      } catch (err) {
        isUnlockActionSubmitting = false;
        if (btnUnlockBal) btnUnlockBal.disabled = false;
        if (errBox) {
          errBox.textContent = err.message || 'Error unlocking lock.';
          errBox.classList.remove('hidden');
        }
      }
    }

    if (btnUnlockBal) {
      btnUnlockBal.addEventListener('click', () => handleUnlockAction());
    }
  }

  // ---- Public API ----
  return {
    load(userId) {
      currentUserId = userId;
      activePeriod = 'day';

      // 1. Immediately start clock and live date so header is never stuck at --:--
      startClock();

      // 2. Safely restore user tab
      let savedTab = 'home';
      try {
        savedTab = localStorage.getItem('sun_user_tab') || 'home';
      } catch(e) {}

      selectedFilterDate = todayISO();
      try { updateFilterButtons(); } catch(e) { console.warn('updateFilterButtons error:', e); }
      try { renderSavingsList(); } catch(e) { console.warn('renderSavingsList error:', e); }
      try { renderTotal(); } catch(e) { console.warn('renderTotal error:', e); }
      try { renderMoreUserInfo(); } catch(e) { console.warn('renderMoreUserInfo error:', e); }
      try { renderDedicatedAccountCard(); } catch(e) { console.warn('renderDedicatedAccountCard error:', e); }

      try { switchTab(savedTab); } catch(e) { console.warn('switchTab error:', e); }

      try { checkPendingFlutterwaveRedirect(); } catch(e) { console.warn('checkPendingFlutterwaveRedirect error:', e); }
    },

    initOnce() {
      initTabs();
      initDateFilterGroup();
      initSaveForm();
      initSafeLock();
      initEditProfile();
      initUserBankDetailsModal();
      initDedicatedAccountModal();
      initChangePassword();
      initLogout();
      initModalClose();
      initUserExports();
      initCopyIdButton();
      checkPendingFlutterwaveRedirect();

      // Realtime cross-tab & cloud sync listeners for user view (payout delay, min balance retention, min withdrawal, commission, balance, transactions)
      window.addEventListener('storage', (e) => {
        if (!e.key || e.key === 'sun_payout_delay_hours' || e.key === 'sun_min_balance_retention' || e.key === 'sun_min_withdrawal_amount' || e.key === 'sun_commission_percentage' || e.key === 'sun_transactions' || e.key === 'sun_users' || e.key === 'sun_locked_savings') {
          if (typeof DB !== 'undefined' && DB.updateMinWithdrawalDOM) {
            DB.updateMinWithdrawalDOM();
          }
          if (typeof DB !== 'undefined' && DB.updateMinBalanceRetentionDOM) {
            DB.updateMinBalanceRetentionDOM();
          }
          if (typeof DB !== 'undefined' && DB.updatePayoutDelayDOM) {
            DB.updatePayoutDelayDOM();
          }
          try { renderTotal(); } catch(e) {}
          try { renderSavingsList(); } catch(e) {}
          try {
            const hub = document.getElementById('view-safelock-hub');
            if (hub && !hub.classList.contains('hidden')) renderSafeLockHub();
          } catch(e) {}
        }
      });

      if (typeof DB !== 'undefined' && DB.onSync) {
        DB.onSync(() => {
          if (typeof DB.updateMinWithdrawalDOM === 'function') {
            DB.updateMinWithdrawalDOM();
          }
          if (typeof DB.updateMinBalanceRetentionDOM === 'function') {
            DB.updateMinBalanceRetentionDOM();
          }
          if (typeof DB.updatePayoutDelayDOM === 'function') {
            DB.updatePayoutDelayDOM();
          }
          try { renderTotal(); } catch(e) {}
          try { renderSavingsList(); } catch(e) {}
          try {
            const hub = document.getElementById('view-safelock-hub');
            if (hub && !hub.classList.contains('hidden')) renderSafeLockHub();
          } catch(e) {}
        });
      }
    },

    refresh() {
      const uid = currentUserId || (DB.getSession() ? DB.getSession().userId : null);
      if (uid) {
        currentUserId = uid;
        startClock();
        try { if (DB.updateMinWithdrawalDOM) DB.updateMinWithdrawalDOM(); } catch(e) {}
        try { if (DB.updateMinBalanceRetentionDOM) DB.updateMinBalanceRetentionDOM(); } catch(e) {}
        try { if (DB.updatePayoutDelayDOM) DB.updatePayoutDelayDOM(); } catch(e) {}
        try { renderSavingsList(); } catch(e) {}
        try { renderTotal(); } catch(e) {}
        try { renderMoreUserInfo(); } catch(e) {}
        try { renderDedicatedAccountCard(); } catch(e) {}
        try {
          const hub = document.getElementById('view-safelock-hub');
          if (hub && !hub.classList.contains('hidden')) {
            renderSafeLockHub();
          }
        } catch(e) {}
      }
    },

    checkPendingFlutterwaveRedirect,
    switchTab,
    openSafeLockHub,
    closeSafeLockHub,
    renderSafeLockHub,
    openUnlockModal,
  };
})();

// Export to window
try {
  window.UserApp = UserApp;
} catch(e) {}
