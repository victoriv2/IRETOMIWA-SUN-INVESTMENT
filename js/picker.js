// ============================================
// PICKER.JS - Custom Modular Picker & Action Sheet
// Replaces native <select> and native date inputs with:
// - Custom Modal Dialog (on desktop)
// - Bottom Sheet Modal / Action Sheet (on mobile)
// Dedicated Standalone Modals:
// 1. Day Modal: ONLY shows Day (current day and previous days)
// 2. Month Modal: ONLY shows Month (current month and previous months)
// 3. Year Modal: ONLY shows Year (2000 to current year)
// Strictly NO EMOJIS! All icons are inline SVGs.
// ============================================

const CustomPicker = (() => {
  // Current date boundary (No future dates allowed)
  const now = new Date();
  const maxYear  = now.getFullYear();
  const maxMonth = now.getMonth(); // 0-indexed
  const maxDate  = now.getDate();

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  const monthShort = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  // State
  let activeCallback = null;
  let currentPeriod = 'day'; // 'day' | 'month' | 'year'
  let selectedDate = new Date(); // Current picked date

  // Calendar browsing state
  let browsingYear  = maxYear;
  let browsingMonth = maxMonth;

  // Format helpers
  function pad(n) { return n < 10 ? '0' + n : '' + n; }

  function formatDateISO(d) {
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  function formatDayLabel(d) {
    const isToday = formatDateISO(d) === formatDateISO(now);
    if (isToday) return 'Today (' + d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) + ')';
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  }

  function formatMonthLabel(d) {
    return monthNames[d.getMonth()];
  }

  function formatYearLabel(d) {
    return '' + d.getFullYear();
  }

  function formatDisplayLabel(d, period) {
    if (period === 'day') return formatDayLabel(d);
    if (period === 'month') return formatMonthLabel(d);
    if (period === 'year') return formatYearLabel(d);
    return formatDateISO(d);
  }

  function isFutureDate(year, month, day) {
    if (year > maxYear) return true;
    if (year === maxYear && month > maxMonth) return true;
    if (year === maxYear && month === maxMonth && day > maxDate) return true;
    return false;
  }

  function isFutureMonth(year, month) {
    if (year > maxYear) return true;
    if (year === maxYear && month > maxMonth) return true;
    return false;
  }

  // ============================================
  // STANDALONE MODALS (STRICT SEPARATION: DAY ONLY, MONTH ONLY, YEAR ONLY)
  // ============================================

  // 1. Day Modal: ONLY shows Day (Current day & previous days)
  function openDayModal({ selectedDay, onSelect }) {
    const modal = document.getElementById('modal-day-picker');
    const grid  = document.getElementById('standalone-days-grid');
    if (!modal || !grid) return;

    grid.innerHTML = '';
    const todayDate = now.getDate();
    const activeDay = selectedDay || todayDate;

    // Quick Today Button
    const todayBtn = document.getElementById('quick-day-today');
    if (todayBtn) {
      todayBtn.textContent = 'Today (Day ' + todayDate + ')';
      todayBtn.onclick = () => {
        if (onSelect) onSelect(todayDate);
        modal.classList.add('hidden');
      };
    }

    // Days 1 through 31: Current day and previous days enabled, future days disabled
    for (let d = 1; d <= 31; d++) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'day-cell';
      btn.textContent = d;

      const isToday = (d === todayDate);
      const isSelected = (d === activeDay);
      const isFuture = (d > todayDate);

      if (isToday) btn.classList.add('day-cell--today');
      if (isSelected) btn.classList.add('day-cell--selected');

      if (isFuture) {
        btn.classList.add('day-cell--disabled');
        btn.disabled = true;
      } else {
        btn.addEventListener('click', () => {
          if (onSelect) onSelect(d);
          modal.classList.add('hidden');
        });
      }

      grid.appendChild(btn);
    }

    modal.classList.remove('hidden');
  }

  // 2. Month Modal: ONLY shows Month (Current month & previous months)
  function openMonthModal({ selectedMonth, onSelect }) {
    const modal = document.getElementById('modal-month-picker');
    const grid  = document.getElementById('standalone-months-grid');
    if (!modal || !grid) return;

    grid.innerHTML = '';
    const currentMonthIdx = now.getMonth();
    const activeMonth = (typeof selectedMonth === 'number') ? selectedMonth : currentMonthIdx;

    monthNames.forEach((name, idx) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'month-cell-standalone';
      btn.textContent = name;

      const isCurrent = (idx === currentMonthIdx);
      const isSelected = (idx === activeMonth);
      const isFuture = (idx > currentMonthIdx);

      if (isCurrent) btn.classList.add('month-cell-standalone--current');
      if (isSelected) btn.classList.add('month-cell-standalone--selected');

      if (isFuture) {
        btn.classList.add('month-cell-standalone--disabled');
        btn.disabled = true;
      } else {
        btn.addEventListener('click', () => {
          if (onSelect) onSelect(idx, name);
          modal.classList.add('hidden');
        });
      }

      grid.appendChild(btn);
    });

    modal.classList.remove('hidden');
  }

  // 3. Year Modal: ONLY shows Year (2000 to Current Year)
  function openYearModal({ selectedYear, onSelect }) {
    const modal = document.getElementById('modal-year-picker');
    const grid  = document.getElementById('standalone-years-grid');
    if (!modal || !grid) return;

    grid.innerHTML = '';
    const currentYearNum = now.getFullYear();
    const activeYear = selectedYear || currentYearNum;

    for (let y = currentYearNum; y >= 2000; y--) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'year-cell-standalone';
      btn.textContent = y;

      const isCurrent = (y === currentYearNum);
      const isSelected = (y === activeYear);

      if (isCurrent) btn.classList.add('year-cell-standalone--current');
      if (isSelected) btn.classList.add('year-cell-standalone--selected');

      btn.addEventListener('click', () => {
        if (onSelect) onSelect(y);
        modal.classList.add('hidden');
      });

      grid.appendChild(btn);
    }

    modal.classList.remove('hidden');
  }

  // ============================================
  // LEGACY DATE PICKER (Compatibility wrapper)
  // ============================================
  function applyAndClose() {
    const iso = formatDateISO(selectedDate);
    const label = formatDisplayLabel(selectedDate, currentPeriod);
    const dayLabel = formatDayLabel(selectedDate);
    const monthLabel = formatMonthLabel(selectedDate);
    const yearLabel = formatYearLabel(selectedDate);

    if (activeCallback) {
      activeCallback({
        period: currentPeriod,
        dateISO: iso,
        displayLabel: label,
        dateObj: selectedDate,
        dayLabel,
        monthLabel,
        yearLabel,
      });
    }

    const modal = document.getElementById('modal-date-picker');
    if (modal) modal.classList.add('hidden');
  }

  function openDayPicker({ initialDate, onSelect }) {
    openDayModal({
      selectedDay: initialDate ? parseInt(initialDate.split('-')[2], 10) : now.getDate(),
      onSelect: (dayNum) => {
        const d = new Date(now.getFullYear(), now.getMonth(), dayNum);
        if (onSelect) {
          onSelect({
            period: 'day',
            dateISO: formatDateISO(d),
            displayLabel: formatDayLabel(d),
            dateObj: d,
            dayLabel: 'Day ' + dayNum,
            monthLabel: monthNames[now.getMonth()],
            yearLabel: '' + now.getFullYear(),
            dayNum: dayNum,
          });
        }
      },
    });
  }

  function openMonthPicker({ initialDate, onSelect }) {
    openMonthModal({
      selectedMonth: initialDate ? parseInt(initialDate.split('-')[1], 10) - 1 : now.getMonth(),
      onSelect: (monthIdx, monthName) => {
        const d = new Date(now.getFullYear(), monthIdx, 1);
        if (onSelect) {
          onSelect({
            period: 'month',
            dateISO: formatDateISO(d),
            displayLabel: monthName,
            dateObj: d,
            monthLabel: monthName,
            yearLabel: '' + now.getFullYear(),
            monthIdx: monthIdx,
          });
        }
      },
    });
  }

  function openYearPicker({ initialDate, onSelect }) {
    openYearModal({
      selectedYear: initialDate ? parseInt(initialDate.split('-')[0], 10) : now.getFullYear(),
      onSelect: (yearNum) => {
        const d = new Date(yearNum, 0, 1);
        if (onSelect) {
          onSelect({
            period: 'year',
            dateISO: formatDateISO(d),
            displayLabel: '' + yearNum,
            dateObj: d,
            yearLabel: '' + yearNum,
            yearNum: yearNum,
          });
        }
      },
    });
  }

  function openDatePicker({ period, initialDate, title, hidePeriodSwitcher, onSelect }) {
    currentPeriod = period || 'day';
    activeCallback = onSelect;

    if (initialDate) {
      const parts = initialDate.split('-');
      const y = parseInt(parts[0], 10);
      const m = parseInt(parts[1], 10) - 1;
      const d = parts[2] ? parseInt(parts[2], 10) : 1;
      selectedDate = new Date(y, m, d);
    } else {
      selectedDate = new Date();
    }

    if (selectedDate > now) selectedDate = new Date();

    browsingYear  = selectedDate.getFullYear();
    browsingMonth = selectedDate.getMonth();

    const titleEl = document.getElementById('date-picker-modal-title');
    if (titleEl && title) titleEl.textContent = title;

    const switcher = document.querySelector('.picker-period-segmented');
    if (switcher) switcher.style.display = hidePeriodSwitcher ? 'none' : 'flex';

    setPeriodMode(currentPeriod);

    const modal = document.getElementById('modal-date-picker');
    if (modal) modal.classList.remove('hidden');
  }

  function setPeriodMode(mode) {
    currentPeriod = mode;

    document.querySelectorAll('.segmented-btn[data-picker-mode]').forEach(b => {
      b.classList.toggle('active', b.dataset.pickerMode === mode);
    });

    const dayView   = document.getElementById('picker-day-view');
    const monthView = document.getElementById('picker-month-view');
    const yearView  = document.getElementById('picker-year-view');

    if (dayView)   dayView.classList.toggle('hidden', mode !== 'day');
    if (monthView) monthView.classList.toggle('hidden', mode !== 'month');
    if (yearView)  yearView.classList.toggle('hidden', mode !== 'year');

    if (mode === 'day') renderDayGrid();
    if (mode === 'month') renderMonthGrid();
    if (mode === 'year') renderYearList();
  }

  function renderDayGrid() {
    const labelEl = document.getElementById('cal-month-year-label');
    if (labelEl) labelEl.textContent = monthNames[browsingMonth] + ' ' + browsingYear;

    const grid = document.getElementById('cal-days-grid');
    if (!grid) return;
    grid.innerHTML = '';

    const firstDayIndex = (new Date(browsingYear, browsingMonth, 1).getDay() + 6) % 7;
    const daysInMonth = new Date(browsingYear, browsingMonth + 1, 0).getDate();

    for (let i = 0; i < firstDayIndex; i++) {
      const blank = document.createElement('span');
      blank.className = 'cal-day cal-day--empty';
      grid.appendChild(blank);
    }

    for (let d = 1; d <= daysInMonth; d++) {
      const dayBtn = document.createElement('button');
      dayBtn.type = 'button';
      dayBtn.className = 'cal-day';
      dayBtn.textContent = d;

      const isFuture = isFutureDate(browsingYear, browsingMonth, d);
      const isSelected = (
        selectedDate.getFullYear() === browsingYear &&
        selectedDate.getMonth() === browsingMonth &&
        selectedDate.getDate() === d
      );
      const isToday = (
        now.getFullYear() === browsingYear &&
        now.getMonth() === browsingMonth &&
        now.getDate() === d
      );

      if (isToday) dayBtn.classList.add('cal-day--today');
      if (isSelected) dayBtn.classList.add('cal-day--selected');

      if (isFuture) {
        dayBtn.classList.add('cal-day--disabled');
        dayBtn.disabled = true;
      } else {
        dayBtn.addEventListener('click', () => {
          selectedDate = new Date(browsingYear, browsingMonth, d);
          renderDayGrid();
          applyAndClose();
        });
      }

      grid.appendChild(dayBtn);
    }
  }

  function renderMonthGrid() {
    const labelEl = document.getElementById('cal-year-label-m');
    if (labelEl) labelEl.textContent = browsingYear;

    const grid = document.getElementById('cal-months-grid');
    if (!grid) return;
    grid.innerHTML = '';

    for (let m = 0; m < 12; m++) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'month-cell';
      btn.textContent = monthShort[m];

      const isFuture = isFutureMonth(browsingYear, m);
      const isSelected = (
        selectedDate.getFullYear() === browsingYear &&
        selectedDate.getMonth() === m
      );

      if (isSelected) btn.classList.add('month-cell--selected');

      if (isFuture) {
        btn.classList.add('month-cell--disabled');
        btn.disabled = true;
      } else {
        btn.addEventListener('click', () => {
          selectedDate = new Date(browsingYear, m, 1);
          renderMonthGrid();
          applyAndClose();
        });
      }

      grid.appendChild(btn);
    }
  }

  function renderYearList() {
    const list = document.getElementById('cal-years-list');
    if (!list) return;
    list.innerHTML = '';

    for (let y = maxYear; y >= 2000; y--) {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'year-item';
      item.textContent = y;

      const isSelected = selectedDate.getFullYear() === y;
      if (isSelected) {
        item.classList.add('year-item--selected');
        item.innerHTML = `<span>${y}</span><svg class="check-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;
      }

      item.addEventListener('click', () => {
        selectedDate = new Date(y, selectedDate.getMonth(), 1);
        if (selectedDate > now) selectedDate = new Date(y, maxMonth, 1);
        renderYearList();
        applyAndClose();
      });

      list.appendChild(item);
    }
  }

  // ---- Custom Select Action Sheet ----
  function openCustomSelect({
    title,
    options,
    selectedValue,
    onSelect,
    searchable = false,
    searchPlaceholder = 'Search...',
    allowCustom = false,
    customPlaceholder = 'Type custom option...',
  }) {
    const modal       = document.getElementById('modal-custom-select');
    const titleEl     = document.getElementById('custom-select-title');
    const container   = document.getElementById('custom-select-options');
    const searchWrap  = document.getElementById('custom-select-search-wrap');
    const searchInput = document.getElementById('custom-select-search-input');
    const customWrap  = document.getElementById('custom-select-custom-wrap');
    const customInput = document.getElementById('custom-select-custom-input');
    const customApply = document.getElementById('custom-select-custom-apply');

    if (!modal || !container) return;

    if (titleEl && title) titleEl.textContent = title;

    // Load custom persistent categories if allowCustom is enabled
    let allOptions = [...options];
    if (allowCustom && typeof DB !== 'undefined' && DB.getCustomCategories) {
      const savedCustom = DB.getCustomCategories();
      savedCustom.forEach(name => {
        if (!allOptions.some(o => o.value.toLowerCase() === name.toLowerCase())) {
          allOptions.push({ label: name, value: name, isCustom: true });
        }
      });
    }

    // 1. Search Bar Setup
    if (searchWrap && searchInput) {
      if (searchable) {
        searchWrap.classList.remove('hidden');
        searchInput.value = '';
        searchInput.placeholder = searchPlaceholder;
        setTimeout(() => searchInput.focus(), 80);
      } else {
        searchWrap.classList.add('hidden');
      }
    }

    // 2. Custom Category Input Setup
    if (customWrap && customInput) {
      if (allowCustom) {
        customWrap.classList.remove('hidden');
        customInput.placeholder = customPlaceholder;
        const isStandard = allOptions.some(o => o.value === selectedValue);
        customInput.value = (!isStandard && selectedValue) ? selectedValue : '';
      } else {
        customWrap.classList.add('hidden');
      }
    }

    // 3. Render List
    function renderItems(filterQuery = '') {
      container.innerHTML = '';
      const q = filterQuery.trim().toLowerCase();

      const filtered = allOptions.filter(opt => {
        if (!q) return true;
        const text = `${opt.label || ''} ${opt.sublabel || ''}`.toLowerCase();
        return text.includes(q);
      });

      if (filtered.length === 0) {
        const emptyDiv = document.createElement('div');
        emptyDiv.className = 'action-sheet-empty';
        emptyDiv.textContent = 'No matching options found.';
        container.appendChild(emptyDiv);
        return;
      }

      filtered.forEach(opt => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'action-sheet-item';
        const isSelected = opt.value === selectedValue;
        if (isSelected) btn.classList.add('action-sheet-item--active');

        btn.innerHTML = `
          <div class="action-sheet-label-group">
            <span class="action-sheet-label">${escapeHtml(opt.label)}</span>
            ${opt.sublabel ? `<span class="action-sheet-sublabel">${escapeHtml(opt.sublabel)}</span>` : ''}
          </div>
          <div class="action-sheet-item-right" style="display: flex; align-items: center; gap: 8px;">
            ${isSelected ? `
              <svg class="action-sheet-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="20 6 9 17 4 12"/>
              </svg>` : ''}
            ${opt.isCustom ? `
              <span class="btn-remove-custom" title="Remove custom category">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"/>
                  <line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </span>` : ''}
          </div>
        `;

        // Handle item select
        btn.addEventListener('click', (e) => {
          // If the remove button was clicked, do not select
          if (e.target.closest('.btn-remove-custom')) return;
          if (onSelect) onSelect(opt);
          modal.classList.add('hidden');
        });

        // Handle remove custom category
        const removeBtn = btn.querySelector('.btn-remove-custom');
        if (removeBtn) {
          removeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const catToRemove = opt.value;

            // Show custom modal confirmation (NOT browser alert / confirm)
            const confirmModal = document.getElementById('modal-confirm-delete-category');
            const msgEl = document.getElementById('delete-category-confirm-msg');
            const confirmBtn = document.getElementById('btn-confirm-delete-category');
            const cancelBtn = document.getElementById('btn-cancel-delete-category');

            if (msgEl) {
              msgEl.innerHTML = `Are you sure you want to remove the category <strong>"${escapeHtml(catToRemove)}"</strong>?`;
            }

            if (confirmModal) {
              confirmModal.classList.remove('hidden');

              const cleanup = () => {
                confirmModal.classList.add('hidden');
                if (confirmBtn) confirmBtn.onclick = null;
                if (cancelBtn) cancelBtn.onclick = null;
              };

              if (cancelBtn) {
                cancelBtn.onclick = cleanup;
              }

              if (confirmBtn) {
                confirmBtn.onclick = () => {
                  if (typeof DB !== 'undefined' && DB.removeCustomCategory) {
                    DB.removeCustomCategory(catToRemove);
                  }
                  allOptions = allOptions.filter(o => o.value !== catToRemove);
                  cleanup();
                  renderItems(searchInput ? searchInput.value : '');
                };
              }
            }
          });
        }

        container.appendChild(btn);
      });
    }

    renderItems('');

    // Bind Search Input
    if (searchInput) {
      searchInput.oninput = () => {
        renderItems(searchInput.value);
      };
    }

    // Bind Custom Input Apply
    if (customApply && customInput) {
      const handleCustomApply = () => {
        const val = customInput.value.trim();
        if (!val) {
          customInput.focus();
          return;
        }

        // Save custom category to DB so it persists for future
        if (typeof DB !== 'undefined' && DB.saveCustomCategory) {
          DB.saveCustomCategory(val);
        }

        if (onSelect) {
          onSelect({ label: val, value: val, isCustom: true });
        }
        modal.classList.add('hidden');
      };

      customApply.onclick = handleCustomApply;
      customInput.onkeydown = (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          handleCustomApply();
        }
      };
    }

    modal.classList.remove('hidden');
  }

  function escapeHtml(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  function init() {
    // Segmented period switch buttons
    document.querySelectorAll('.segmented-btn[data-picker-mode]').forEach(btn => {
      btn.addEventListener('click', () => {
        setPeriodMode(btn.dataset.pickerMode);
      });
    });

    // Modal background click to close
    [
      'modal-date-picker',
      'modal-custom-select',
      'modal-day-picker',
      'modal-month-picker',
      'modal-year-picker'
    ].forEach(id => {
      const modal = document.getElementById(id);
      if (modal) {
        modal.addEventListener('click', (e) => {
          if (e.target === modal) modal.classList.add('hidden');
        });
      }
    });

    document.querySelectorAll('.modal-close[data-modal]').forEach(btn => {
      btn.addEventListener('click', () => {
        const target = document.getElementById(btn.dataset.modal);
        if (target) target.classList.add('hidden');
      });
    });
  }

  return {
    init,
    openDayModal,
    openMonthModal,
    openYearModal,
    openDatePicker,
    openDayPicker,
    openMonthPicker,
    openYearPicker,
    openCustomSelect,
    formatDisplayLabel,
    formatDayLabel,
    formatMonthLabel,
    formatYearLabel,
    formatDateISO,
    setPeriodMode,
  };
})();

// Auto-init on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  CustomPicker.init();
});