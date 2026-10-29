// ============================================
// STORAGE.JS - Data Layer (localStorage)
// ============================================

const DB = {
  // ---- CLOUD CONFIG (jsonbin.io) ----
  CLOUD: {
    BIN_ID: '6adcc870ffd5d1605388749f',
    MASTER_KEY: '$2a$10$nnSfeJQZY9FjkKghjfzlPuWFrIe/JV46TLSQbnho77T3kkmx/mMvK',
    BASE_URL: 'https://api.jsonbin.io/v3/b',
  },
  _pushTimeout: null,
  _isPulling: false,
  _syncListeners: [],

  onSync(fn) {
    if (typeof fn === 'function') this._syncListeners.push(fn);
  },

  notifySync(status, detail) {
    this._syncListeners.forEach(fn => {
      try { fn(status, detail); } catch(e) {}
    });
  },

  scheduleCloudPush() {
    if (this._pushTimeout) clearTimeout(this._pushTimeout);
    this._pushTimeout = setTimeout(() => {
      this.syncPush();
    }, 350);
  },

  async syncPush() {
    if (!navigator.onLine) return;
    try {
      this.notifySync('syncing');
      const payload = {
        users: this.getUsers(),
        transactions: this.getAllTransactions(),
        admin: this.getAdmin(),
        customCategories: this.getCustomCategories(),
        flutterwaveConfig: this.getFlutterwaveConfig(),
        resetAt: localStorage.getItem('sun_last_reset_at') || null,
        updatedAt: new Date().toISOString(),
      };

      const res = await fetch(`${this.CLOUD.BASE_URL}/${this.CLOUD.BIN_ID}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'X-Master-Key': this.CLOUD.MASTER_KEY,
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        throw new Error(`Sync Push HTTP ${res.status}`);
      }
      this.notifySync('synced');
    } catch (err) {
      console.warn('Cloud sync push:', err);
      this.notifySync('error', err);
    }
  },

  async syncPull(onComplete) {
    if (!navigator.onLine) {
      if (typeof onComplete === 'function') onComplete(false);
      return;
    }
    if (this._isPulling) return;
    this._isPulling = true;
    this.notifySync('syncing');

    try {
      const res = await fetch(`${this.CLOUD.BASE_URL}/${this.CLOUD.BIN_ID}/latest`, {
        method: 'GET',
        headers: {
          'X-Master-Key': this.CLOUD.MASTER_KEY,
        },
      });

      if (!res.ok) {
        throw new Error(`Sync Pull HTTP ${res.status}`);
      }

      const json = await res.json();
      const record = json.record || {};
      const cloudUsers = Array.isArray(record.users) ? record.users : [];
      const cloudTxs   = Array.isArray(record.transactions) ? record.transactions : [];
      const cloudAdmin = record.admin;

      // Check if a cloud factory reset happened
      const localResetAt = localStorage.getItem('sun_last_reset_at');
      const cloudResetAt = record.resetAt;
      const isNewReset = cloudResetAt && (!localResetAt || new Date(cloudResetAt) > new Date(localResetAt));

      if (isNewReset) {
        localStorage.setItem('sun_last_reset_at', cloudResetAt);
        localStorage.setItem('sun_users', JSON.stringify(cloudUsers));
        localStorage.setItem('sun_transactions', JSON.stringify(cloudTxs));
        localStorage.setItem('sun_custom_categories', JSON.stringify(record.customCategories || []));
        localStorage.removeItem('sun_user_session');
        localStorage.removeItem('sun_active_user');

        if (cloudAdmin && cloudAdmin.password) {
          localStorage.setItem('sun_admin', JSON.stringify(cloudAdmin));
        }
        if (record.flutterwaveConfig && typeof record.flutterwaveConfig === 'object') {
          localStorage.setItem('sun_flutterwave_config', JSON.stringify(record.flutterwaveConfig));
        }

        this._isPulling = false;
        this.notifySync('synced');

        if (window.UserApp && typeof window.UserApp.refresh === 'function') window.UserApp.refresh();
        if (window.AdminApp && typeof window.AdminApp.refresh === 'function') window.AdminApp.refresh();
        if (typeof onComplete === 'function') onComplete(true);
        return;
      }

      // Smart merge: Local and Cloud
      const localUsers = this.getUsers();
      const localTxs   = this.getAllTransactions();

      // 1. Merge users
      const userMap = new Map();
      localUsers.forEach(u => {
        const k = u.id || (u.email ? u.email.toLowerCase() : null);
        if (k) userMap.set(k, u);
      });
      cloudUsers.forEach(u => {
        const k = u.id || (u.email ? u.email.toLowerCase() : null);
        if (!k) return;
        if (!userMap.has(k)) {
          userMap.set(k, u);
        } else {
          const existing = userMap.get(k);
          userMap.set(k, { ...existing, ...u });
        }
      });
      const mergedUsers = Array.from(userMap.values());
      localStorage.setItem('sun_users', JSON.stringify(mergedUsers));

      // 2. Merge transactions
      const txMap = new Map();
      localTxs.forEach(t => {
        if (t.id) txMap.set(t.id, t);
      });
      cloudTxs.forEach(t => {
        if (!t.id) return;
        if (!txMap.has(t.id)) {
          txMap.set(t.id, t);
        } else {
          const localT = txMap.get(t.id);
          // If cloud has approved/declined or newer review date, prefer the reviewed status
          if (t.status && t.status !== 'pending' && localT.status === 'pending') {
            txMap.set(t.id, { ...localT, ...t });
          } else if (new Date(t.reviewedAt || 0) > new Date(localT.reviewedAt || 0)) {
            txMap.set(t.id, { ...localT, ...t });
          }
        }
      });
      const mergedTxs = Array.from(txMap.values());
      mergedTxs.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
      localStorage.setItem('sun_transactions', JSON.stringify(mergedTxs));

      // 3. Admin sync if exists
      if (cloudAdmin && cloudAdmin.password) {
        localStorage.setItem('sun_admin', JSON.stringify(cloudAdmin));
      }

      // 4. Custom Categories sync if exists
      if (Array.isArray(record.customCategories)) {
        const localCats = this.getCustomCategories();
        const mergedCats = Array.from(new Set([...localCats, ...record.customCategories]));
        localStorage.setItem('sun_custom_categories', JSON.stringify(mergedCats));
      }

      // 5. Flutterwave config sync
      if (record.flutterwaveConfig && typeof record.flutterwaveConfig === 'object') {
        const localCfg = this.getFlutterwaveConfig();
        if (record.flutterwaveConfig.updatedAt && (!localCfg.updatedAt || record.flutterwaveConfig.updatedAt > localCfg.updatedAt)) {
          localStorage.setItem('sun_flutterwave_config', JSON.stringify({ ...localCfg, ...record.flutterwaveConfig }));
        }
      }

      // Check if local had data that wasn't in cloud yet
      const hasLocalUsersMissing = localUsers.some(lu => !cloudUsers.some(cu => (cu.id && cu.id === lu.id) || (cu.email && cu.email.toLowerCase() === (lu.email || '').toLowerCase())));
      const hasLocalTxsMissing   = localTxs.some(lt => !cloudTxs.some(ct => ct.id === lt.id));
      const needsPush = hasLocalUsersMissing || hasLocalTxsMissing || (mergedUsers.length > cloudUsers.length) || (mergedTxs.length > cloudTxs.length);

      this._isPulling = false;
      this.notifySync('synced');

      // Refresh active views
      if (window.UserApp && typeof window.UserApp.refresh === 'function') {
        window.UserApp.refresh();
      }
      if (window.AdminApp && typeof window.AdminApp.refresh === 'function') {
        window.AdminApp.refresh();
      }

      if (needsPush) {
        this.scheduleCloudPush();
      }

      if (typeof onComplete === 'function') onComplete(true);
    } catch (err) {
      console.warn('Cloud sync pull:', err);
      this._isPulling = false;
      this.notifySync('error', err);
      if (typeof onComplete === 'function') onComplete(false);
    }
  },

  initCloudSync() {
    this.syncPull();
    window.addEventListener('online', () => this.syncPull());
    window.addEventListener('focus',  () => this.syncPull());
    // Auto sync poll every 20 seconds
    setInterval(() => {
      if (navigator.onLine && !document.hidden) {
        this.syncPull();
      }
    }, 20000);
  },

  // ---- NAME CAPITALIZATION HELPER ----
  formatName(str) {
    if (!str) return '';
    return str
      .trim()
      .split(/\s+/)
      .map(word => {
        return word
          .split('-')
          .map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
          .join('-');
      })
      .join(' ');
  },

  // ---- MIGRATION: Auto-Capitalize First/Last Names of Existing Records ----
  migrateExistingRecords() {
    try {
      const users = this.getUsers();
      let modified = false;
      const updated = users.map(user => {
        const capitalizedFirst = this.formatName(user.firstName);
        const capitalizedLast  = this.formatName(user.lastName);
        if (capitalizedFirst !== user.firstName || capitalizedLast !== user.lastName) {
          modified = true;
          return {
            ...user,
            firstName: capitalizedFirst,
            lastName: capitalizedLast,
          };
        }
        return user;
      });
      if (modified) {
        this.saveUsers(updated);
      }
    } catch (e) {
      console.error('Migration error:', e);
    }
  },

  // ---- USERS ----
  getUsers() {
    return JSON.parse(localStorage.getItem('sun_users') || '[]');
  },
  saveUsers(users) {
    localStorage.setItem('sun_users', JSON.stringify(users));
    this.scheduleCloudPush();
  },
  getUserByEmail(email) {
    if (!email) return null;
    const cleanEmail = email.trim().toLowerCase();
    return this.getUsers().find(u => u.email && u.email.trim().toLowerCase() === cleanEmail) || null;
  },
  getUserByPhone(phone) {
    if (!phone) return null;
    const cleanPhone = phone.trim().replace(/\D/g, '');
    return this.getUsers().find(u => u.phone && u.phone.replace(/\D/g, '') === cleanPhone) || null;
  },
  getUserByIdentifier(identifier) {
    if (!identifier) return null;
    const clean = identifier.trim().toLowerCase();
    const cleanDigits = identifier.trim().replace(/\D/g, '');
    return this.getUsers().find(u => {
      const emailMatch = Boolean(u.email && u.email.trim().toLowerCase() === clean);
      const phoneMatch = Boolean(cleanDigits.length >= 10 && u.phone && u.phone.replace(/\D/g, '') === cleanDigits);
      return emailMatch || phoneMatch;
    }) || null;
  },
  getUserById(id) {
    return this.getUsers().find(u => u.id === id) || null;
  },
  createUser(data) {
    const users = this.getUsers();
    const newUser = {
      id: 'u_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
      firstName: this.formatName(data.firstName),
      lastName:  this.formatName(data.lastName),
      email: data.email ? data.email.trim().toLowerCase() : '',
      phone: data.phone.trim(),
      password: data.password,
      joinedAt: new Date().toISOString(),
    };
    users.push(newUser);
    this.saveUsers(users);
    return newUser;
  },
  updateUser(id, fields) {
    const users = this.getUsers();
    const idx = users.findIndex(u => u.id === id);
    if (idx === -1) return null;

    const fieldsToUpdate = { ...fields };
    if (fieldsToUpdate.firstName) {
      fieldsToUpdate.firstName = this.formatName(fieldsToUpdate.firstName);
    }
    if (fieldsToUpdate.lastName) {
      fieldsToUpdate.lastName = this.formatName(fieldsToUpdate.lastName);
    }

    users[idx] = { ...users[idx], ...fieldsToUpdate };
    this.saveUsers(users);
    return users[idx];
  },

  // ---- SESSION ----
  getSession() {
    try {
      const raw = localStorage.getItem('sun_session');
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return (parsed && parsed.userId) ? parsed : null;
    } catch (e) {
      return null;
    }
  },
  setSession(session) {
    try {
      localStorage.setItem('sun_session', JSON.stringify(session));
    } catch (e) {
      console.error('Failed to save session:', e);
    }
  },
  clearSession() {
    try {
      localStorage.removeItem('sun_session');
      localStorage.removeItem('sun_user_tab');
    } catch (e) {}
  },

  // ---- TRANSACTIONS (DEPOSITS & WITHDRAWALS) ----
  getTransactions(userId) {
    const all = this.getAllTransactions();
    if (!userId) return all;
    return all.filter(t => t.userId === userId);
  },
  getAllTransactions() {
    return JSON.parse(localStorage.getItem('sun_transactions') || '[]');
  },
  getPendingRequests() {
    const all = this.getAllTransactions();
    return all.filter(t => t.status === 'pending');
  },
  addTransaction({ userId, type, amount, category, note, recordedBy, status, paymentGateway, flutterwaveRef, flwId, destinationBank }) {
    const all = this.getAllTransactions();
    const isUser = (recordedBy === 'user');
    const assignedStatus = status || (isUser ? 'pending' : 'approved');

    const tx = {
      id: 'tx_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
      userId,
      type: type || 'deposit', // 'deposit' (saved) | 'withdrawal' (payout)
      amount: parseFloat(amount) || 0,
      category: category || 'General Savings',
      note: note || '',
      destinationBank: destinationBank || null,
      recordedBy: recordedBy || 'admin',
      status: assignedStatus, // 'pending' | 'approved' | 'declined'
      paymentGateway: paymentGateway || null,
      flutterwaveRef: flutterwaveRef || null,
      flwId: flwId || null,
      reviewedAt: (assignedStatus === 'approved') ? new Date().toISOString() : null,
      reviewedBy: (assignedStatus === 'approved') ? (paymentGateway ? 'flutterwave' : (recordedBy || 'admin')) : null,
      declineReason: null,
      createdAt: new Date().toISOString(),
    };
    all.push(tx);
    localStorage.setItem('sun_transactions', JSON.stringify(all));
    this.scheduleCloudPush();
    return tx;
  },

  approveTransaction(txId, reviewMeta = {}) {
    const all = this.getAllTransactions();
    const tx = all.find(t => t.id === txId);
    if (!tx) return { success: false, error: 'Transaction not found.' };

    // If it's a withdrawal, verify user has enough balance
    if (tx.type === 'withdrawal' || tx.type === 'payout') {
      const userBal = this.getUserBalance(tx.userId);
      if (tx.amount > userBal.balance) {
        return {
          success: false,
          error: `Insufficient user balance. Client only has ₦${Number(userBal.balance).toLocaleString('en-NG', { minimumFractionDigits: 2 })} available.`
        };
      }
    }

    tx.status = 'approved';
    tx.reviewedAt = new Date().toISOString();
    tx.reviewedBy = reviewMeta.reviewedBy || 'admin';
    if (reviewMeta.paymentGateway) tx.paymentGateway = reviewMeta.paymentGateway;
    if (reviewMeta.flutterwaveRef) tx.flutterwaveRef = reviewMeta.flutterwaveRef;
    if (reviewMeta.flutterwaveTransferId) tx.flutterwaveTransferId = reviewMeta.flutterwaveTransferId;

    localStorage.setItem('sun_transactions', JSON.stringify(all));
    this.scheduleCloudPush();
    return { success: true, tx };
  },

  declineTransaction(txId, reason = '') {
    const all = this.getAllTransactions();
    const tx = all.find(t => t.id === txId);
    if (!tx) return { success: false, error: 'Transaction not found.' };

    tx.status = 'declined';
    tx.declineReason = reason ? reason.trim() : '';
    tx.reviewedAt = new Date().toISOString();
    tx.reviewedBy = 'admin';

    localStorage.setItem('sun_transactions', JSON.stringify(all));
    this.scheduleCloudPush();
    return { success: true, tx };
  },

  // Calculate balance, total deposits, and total withdrawals for a user
  getUserBalance(userId) {
    const txs = this.getTransactions(userId);
    let totalDeposited = 0;
    let totalWithdrawn = 0;
    let pendingDeposits = 0;
    let pendingWithdrawn = 0;

    txs.forEach(t => {
      const amt = parseFloat(t.amount) || 0;
      const status = t.status || 'approved'; // existing legacy records default to approved
      const isPayout = (t.type === 'withdrawal' || t.type === 'payout');

      if (status === 'approved') {
        if (isPayout) {
          totalWithdrawn += amt;
        } else {
          totalDeposited += amt;
        }
      } else if (status === 'pending') {
        if (isPayout) {
          pendingWithdrawn += amt;
        } else {
          pendingDeposits += amt;
        }
      }
    });

    const balance = Math.max(0, totalDeposited - totalWithdrawn);
    const availableBalance = Math.max(0, balance - pendingWithdrawn);

    return {
      totalDeposited,
      totalWithdrawn,
      balance,
      availableBalance,
      pendingDeposits,
      pendingWithdrawn,
    };
  },

  // ---- CUSTOM SAVINGS CATEGORIES ----
  getCustomCategories() {
    try {
      const raw = localStorage.getItem('sun_custom_categories');
      return raw ? JSON.parse(raw) : [];
    } catch(e) {
      return [];
    }
  },
  saveCustomCategory(name) {
    if (!name || typeof name !== 'string') return;
    const trimmed = name.trim();
    if (!trimmed) return;
    const list = this.getCustomCategories();
    if (!list.some(c => c.toLowerCase() === trimmed.toLowerCase())) {
      list.push(trimmed);
      localStorage.setItem('sun_custom_categories', JSON.stringify(list));
      this.scheduleCloudPush();
    }
  },
  removeCustomCategory(name) {
    if (!name) return;
    const trimmed = name.trim().toLowerCase();
    const list = this.getCustomCategories().filter(c => c.toLowerCase() !== trimmed);
    localStorage.setItem('sun_custom_categories', JSON.stringify(list));
    this.scheduleCloudPush();
  },

  // Calculate system-wide totals across all users
  getSystemTotals() {
    const all = this.getAllTransactions();
    const users = this.getUsers();
    let totalDeposited = 0;
    let totalWithdrawn = 0;
    let pendingCount = 0;
    let pendingDeposits = 0;
    let pendingPayouts = 0;

    all.forEach(t => {
      const amt = parseFloat(t.amount) || 0;
      const status = t.status || 'approved';
      const isPayout = (t.type === 'withdrawal' || t.type === 'payout');

      if (status === 'approved') {
        if (isPayout) {
          totalWithdrawn += amt;
        } else {
          totalDeposited += amt;
        }
      } else if (status === 'pending') {
        pendingCount++;
        if (isPayout) {
          pendingPayouts += amt;
        } else {
          pendingDeposits += amt;
        }
      }
    });

    return {
      totalDeposited,
      totalWithdrawn,
      totalBalance: Math.max(0, totalDeposited - totalWithdrawn),
      userCount: users.length,
      pendingCount,
      pendingDeposits,
      pendingPayouts,
    };
  },

  // ---- SAVINGS BACKWARD COMPATIBILITY ----
  getSavings(userId) {
    return this.getTransactions(userId);
  },
  getAllSavings() {
    return this.getAllTransactions();
  },
  addSaving(userId, amount, note, type) {
    return this.addTransaction({
      userId,
      type: type || 'deposit',
      amount,
      note,
      category: 'General Savings',
      recordedBy: 'user',
    });
  },

  // ---- MIGRATION: LEGACY SAVINGS TO TRANSACTIONS ----
  migrateTransactions() {
    try {
      const legacy = JSON.parse(localStorage.getItem('sun_savings') || '[]');
      const current = JSON.parse(localStorage.getItem('sun_transactions') || 'null');
      if (current === null && legacy.length > 0) {
        const converted = legacy.map(s => ({
          id: s.id || ('tx_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7)),
          userId: s.userId,
          type: 'deposit',
          amount: parseFloat(s.amount) || 0,
          category: 'General Savings',
          note: s.note || '',
          recordedBy: 'user',
          createdAt: s.createdAt || new Date().toISOString(),
        }));
        localStorage.setItem('sun_transactions', JSON.stringify(converted));
      }
    } catch (e) {
      console.error('Transaction migration error:', e);
    }
  },

  // ---- ADMIN ----
  getAdmin() {
    // Seed default admin if not exists
    let admin = JSON.parse(localStorage.getItem('sun_admin') || 'null');
    if (!admin) {
      admin = { email: 'admin@suninvestment.com', password: 'Admin@123' };
      localStorage.setItem('sun_admin', JSON.stringify(admin));
    }
    return admin;
  },
  updateAdminPassword(newPassword) {
    const admin = this.getAdmin();
    admin.password = newPassword;
    localStorage.setItem('sun_admin', JSON.stringify(admin));
    this.scheduleCloudPush();
    return true;
  },
  getAdminSession() {
    try {
      const raw = localStorage.getItem('sun_admin_session');
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return (parsed && parsed.role === 'admin') ? parsed : null;
    } catch (e) {
      return null;
    }
  },
  setAdminSession(val) {
    try {
      localStorage.setItem('sun_admin_session', JSON.stringify(val || { role: 'admin' }));
    } catch (e) {
      console.error('Failed to save admin session:', e);
    }
  },
  clearAdminSession() {
    try {
      localStorage.removeItem('sun_admin_session');
      localStorage.removeItem('sun_admin_tab');
    } catch (e) {}
  },

  // ---- FLUTTERWAVE GATEWAY CONFIG ----
  getFlutterwaveConfig() {
    try {
      const raw = localStorage.getItem('sun_flutterwave_config');
      if (raw) {
        const parsed = JSON.parse(raw);
        return {
          publicKey: parsed.publicKey || 'FLWPUBK-570758bf49301716d7e0133dce781024-X',
          secretKey: parsed.secretKey || 'FLWSECK-fc044b9b11bc1da34e06422d381602d4-1a1872431eevt-X',
          encryptionKey: parsed.encryptionKey || 'fc044b9b11bc9d09633290a0',
          mode: parsed.mode || 'live',
          merchantName: 'John Idowu (Iretomiwa Sun Investment)',
          isEnabled: parsed.isEnabled !== false,
          updatedAt: parsed.updatedAt || '2026-10-29T11:20:00.000Z',
        };
      }
    } catch(e) {}
    return {
      publicKey: 'FLWPUBK-570758bf49301716d7e0133dce781024-X',
      secretKey: 'FLWSECK-fc044b9b11bc1da34e06422d381602d4-1a1872431eevt-X',
      encryptionKey: 'fc044b9b11bc9d09633290a0',
      mode: 'live',
      merchantName: 'John Idowu (Iretomiwa Sun Investment)',
      isEnabled: true,
      updatedAt: '2026-10-29T11:20:00.000Z',
    };
  },
  setFlutterwaveConfig(cfg) {
    const current = this.getFlutterwaveConfig();
    const updated = {
      ...current,
      ...cfg,
      updatedAt: new Date().toISOString(),
    };
    localStorage.setItem('sun_flutterwave_config', JSON.stringify(updated));
    this.scheduleCloudPush();
    return updated;
  },

  // ---- NIGERIAN BANKS LIST (73 BANKS) ----
  getNigerianBanks() {
    return [
      { code: '120001', name: '9 Payment Service Bank (9PSB)' },
      { code: '50001', name: 'AB Microfinance Bank' },
      { code: '070010', name: 'Abbey Mortgage Bank' },
      { code: '044', name: 'Access Bank' },
      { code: '50036', name: 'Accion Microfinance Bank' },
      { code: '060003', name: 'Alpha Morgan Bank' },
      { code: '090001', name: 'ASO Savings and Loans' },
      { code: '060002', name: 'Bank of Agriculture (BOA)' },
      { code: '060004', name: 'Bank of Industry (BOI)' },
      { code: '50094', name: 'Baobab Microfinance Bank' },
      { code: '50823', name: 'Branch Microfinance Bank' },
      { code: '070015', name: 'Brent Mortgage Bank' },
      { code: '50541', name: 'Carbon' },
      { code: '023', name: 'Citibank Nigeria' },
      { code: '559', name: 'Coronation Merchant Bank' },
      { code: '060005', name: 'Development Bank of Nigeria (DBN)' },
      { code: '50163', name: 'Dot Microfinance Bank' },
      { code: '050', name: 'Ecobank Nigeria' },
      { code: '50126', name: 'Eyowo Microfinance Bank' },
      { code: '50645', name: 'FairMoney' },
      { code: '560', name: 'FBNQuest Merchant Bank' },
      { code: '060006', name: 'Federal Mortgage Bank of Nigeria (FMBN)' },
      { code: '070', name: 'Fidelity Bank' },
      { code: '011', name: 'First Bank of Nigeria' },
      { code: '214', name: 'First City Monument Bank (FCMB)' },
      { code: '103', name: 'Globus Bank' },
      { code: '100022', name: 'Gomoney (Sterling MFB)' },
      { code: '562', name: 'Greenwich Merchant Bank' },
      { code: '058', name: 'Guaranty Trust Bank (GTBank)' },
      { code: '120002', name: 'Hope Payment Service Bank' },
      { code: '070016', name: 'Infinity Trust Mortgage Bank' },
      { code: '301', name: 'Jaiz Bank' },
      { code: '082', name: 'Keystone Bank' },
      { code: '50211', name: 'Kuda' },
      { code: '50457', name: 'LAPO Microfinance Bank' },
      { code: '070007', name: 'LivingTrust Mortgage Bank' },
      { code: '303', name: 'Lotus Bank' },
      { code: '50304', name: 'Mintyn' },
      { code: '120003', name: 'MoMo PSB' },
      { code: '120005', name: 'MoneyMaster PSB' },
      { code: '50515', name: 'Moniepoint' },
      { code: '060001', name: 'Nigerian Export-Import Bank (NEXIM)' },
      { code: '561', name: 'Nova Commercial Bank' },
      { code: '50638', name: 'NowNow Digital Systems (NowNow MFB)' },
      { code: '50629', name: 'NPF Microfinance Bank' },
      { code: '999992', name: 'OPay' },
      { code: '107', name: 'Optimus Bank' },
      { code: '999991', name: 'PalmPay' },
      { code: '104', name: 'Parallex Bank' },
      { code: '076', name: 'Polaris Bank' },
      { code: '105', name: 'PremiumTrust Bank' },
      { code: '101', name: 'Providus Bank' },
      { code: '101', name: 'ProvidusUnity Bank' },
      { code: '502', name: 'Rand Merchant Bank Nigeria (RMB)' },
      { code: '090110', name: 'Raven Bank (Raven MFB)' },
      { code: '50767', name: 'Renmoney Microfinance Bank' },
      { code: '50280', name: 'Rubies Bank' },
      { code: '106', name: 'Signature Bank' },
      { code: '120004', name: 'SmartCash PSB' },
      { code: '51204', name: 'Sparkle' },
      { code: '221', name: 'Stanbic IBTC Bank' },
      { code: '068', name: 'Standard Chartered Bank Nigeria' },
      { code: '232', name: 'Sterling Bank' },
      { code: '51336', name: 'Summit Bank' },
      { code: '100', name: 'SunTrust Bank' },
      { code: '302', name: 'TAJBank' },
      { code: '51337', name: 'Tatum Bank' },
      { code: '305', name: 'The Alternative Bank' },
      { code: '032', name: 'Union Bank' },
      { code: '033', name: 'United Bank for Africa (UBA)' },
      { code: '566', name: 'VFD Microfinance Bank' },
      { code: '035', name: 'Wema Bank' },
      { code: '057', name: 'Zenith Bank' },
    ];
  },

  // ---- FLUTTERWAVE REAL-TIME ACCOUNT RESOLUTION ----
  async resolveFlutterwaveAccount(accountNumber, bankCode) {
    if (!accountNumber || accountNumber.length !== 10) {
      return { success: false, error: 'Account number must be 10 digits.' };
    }
    if (!bankCode) {
      return { success: false, error: 'Please select a bank.' };
    }
    const cfg = this.getFlutterwaveConfig();
    try {
      const res = await fetch('https://api.flutterwave.com/v3/accounts/resolve', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${cfg.secretKey}`,
        },
        body: JSON.stringify({
          account_number: accountNumber.trim(),
          account_bank: bankCode.trim(),
        }),
      });

      const json = await res.json();
      if (res.ok && json.status === 'success' && json.data) {
        return {
          success: true,
          accountNumber: json.data.account_number,
          accountName: json.data.account_name,
        };
      }
      return {
        success: false,
        error: json.message || 'Account details could not be verified.',
      };
    } catch (err) {
      console.warn('Flutterwave account resolve error:', err);
      return {
        success: false,
        error: 'Unable to reach account verification service. Check internet connection.',
      };
    }
  },

  // ---- FLUTTERWAVE DISBURSEMENT / TRANSFER ----
  async disburseFlutterwaveTransfer({ accountNumber, bankCode, amount, narration, txId, clientName }) {
    const cfg = this.getFlutterwaveConfig();
    const cleanAmount = parseFloat(amount);
    if (!cleanAmount || cleanAmount <= 0) {
      return { success: false, error: 'Invalid payout amount.' };
    }
    if (!accountNumber || !bankCode) {
      return { success: false, error: 'Destination bank code and account number are required.' };
    }

    const reference = 'TXF_' + (txId || Date.now()) + '_' + Math.random().toString(36).slice(2, 7);
    const payload = {
      account_bank: bankCode.trim(),
      account_number: accountNumber.trim(),
      amount: cleanAmount,
      narration: narration || `Iretomiwa Sun Investment payout to ${clientName || 'Client'}`,
      currency: 'NGN',
      reference: reference,
      debit_currency: 'NGN',
    };

    try {
      const res = await fetch('https://api.flutterwave.com/v3/transfers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${cfg.secretKey}`,
        },
        body: JSON.stringify(payload),
      });

      const json = await res.json();
      if (res.ok && json.status === 'success' && json.data) {
        return {
          success: true,
          transferId: json.data.id,
          reference: json.data.reference || reference,
          status: json.data.status,
          accountName: json.data.full_name,
          raw: json.data,
        };
      }

      return {
        success: false,
        error: json.message || 'Transfer disbursement failed on Flutterwave.',
      };
    } catch (err) {
      console.error('Flutterwave transfer error:', err);
      return {
        success: false,
        error: 'Network error communicating with Flutterwave: ' + (err.message || 'Check connection'),
      };
    }
  },

  // ---- FLUTTERWAVE WALLET BALANCE ----
  async getFlutterwaveBalance() {
    const cfg = this.getFlutterwaveConfig();
    try {
      const res = await fetch('https://api.flutterwave.com/v3/balances/NGN', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${cfg.secretKey}`,
        },
      });
      const json = await res.json();
      if (res.ok && json.status === 'success' && json.data) {
        return {
          success: true,
          balance: json.data.available_balance || 0,
          ledger: json.data.ledger_balance || 0,
          currency: json.data.currency || 'NGN',
        };
      }
      return {
        success: false,
        error: json.message || 'Could not fetch Flutterwave wallet balance.',
      };
    } catch (err) {
      return {
        success: false,
        error: 'Network error checking wallet balance.',
      };
    }
  },

  // ---- USER PAYOUT BANK PREFERENCES ----
  saveUserPayoutBank(userId, bankData) {
    const users = this.getUsers();
    const user = users.find(u => u.id === userId);
    if (!user) return false;
    user.payoutBank = {
      bankCode: bankData.bankCode || '',
      bankName: bankData.bankName || '',
      accountNumber: bankData.accountNumber || '',
      accountName: bankData.accountName || '',
      updatedAt: new Date().toISOString(),
    };
    this.saveUsers(users);
    return true;
  },
  getUserPayoutBank(userId) {
    const user = this.getUserById(userId);
    return (user && user.payoutBank) ? user.payoutBank : null;
  },

  // ---- FACTORY RESET SYSTEM ----
  async factoryReset() {
    const resetTimestamp = new Date().toISOString();
    localStorage.setItem('sun_last_reset_at', resetTimestamp);
    localStorage.setItem('sun_users', '[]');
    localStorage.setItem('sun_transactions', '[]');
    localStorage.setItem('sun_custom_categories', '[]');
    localStorage.removeItem('sun_user_session');
    localStorage.removeItem('sun_active_user');

    const payload = {
      users: [],
      transactions: [],
      admin: this.getAdmin(),
      customCategories: [],
      flutterwaveConfig: this.getFlutterwaveConfig(),
      resetAt: resetTimestamp,
      updatedAt: resetTimestamp,
    };

    try {
      const res = await fetch(`${this.CLOUD.BASE_URL}/${this.CLOUD.BIN_ID}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'X-Master-Key': this.CLOUD.MASTER_KEY,
        },
        body: JSON.stringify(payload),
      });
      return res.ok;
    } catch (e) {
      console.error('Factory reset error:', e);
      return false;
    }
  },
};

// Automatically capitalize first/last names and migrate legacy transactions on load
DB.migrateExistingRecords();
DB.migrateTransactions();
DB.initCloudSync();
