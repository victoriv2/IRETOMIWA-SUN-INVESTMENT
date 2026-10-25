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
  addTransaction({ userId, type, amount, category, note, recordedBy, status }) {
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
      recordedBy: recordedBy || 'admin',
      status: assignedStatus, // 'pending' | 'approved' | 'declined'
      reviewedAt: (assignedStatus === 'approved') ? new Date().toISOString() : null,
      reviewedBy: (assignedStatus === 'approved') ? (recordedBy || 'admin') : null,
      declineReason: null,
      createdAt: new Date().toISOString(),
    };
    all.push(tx);
    localStorage.setItem('sun_transactions', JSON.stringify(all));
    this.scheduleCloudPush();
    return tx;
  },

  approveTransaction(txId) {
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
    tx.reviewedBy = 'admin';

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
};

// Automatically capitalize first/last names and migrate legacy transactions on load
DB.migrateExistingRecords();
DB.migrateTransactions();
DB.initCloudSync();
