// ============================================
// STORAGE.JS - Data Layer (localStorage & Cloud Sync)
// ============================================

// ---- HARD SYSTEM RESET EPOCH ----
const SYSTEM_RESET_ID = 'RESET_IR00001_V3';

(function enforceSystemReset() {
  try {
    const currentEpoch = localStorage.getItem('sun_system_reset_epoch');
    if (currentEpoch !== SYSTEM_RESET_ID) {
      // Clear ALL local cache, user sessions, tabs, and credentials to start 100% fresh with Supabase
      localStorage.setItem('sun_system_reset_epoch', SYSTEM_RESET_ID);
      localStorage.setItem('sun_users', '[]');
      localStorage.setItem('sun_transactions', '[]');
      localStorage.setItem('sun_custom_categories', '[]');
      localStorage.removeItem('sun_session');
      localStorage.removeItem('sun_user_session');
      localStorage.removeItem('sun_active_user');
      localStorage.removeItem('sun_user_tab');
      localStorage.removeItem('sun_admin_session');
      localStorage.removeItem('sun_admin_tab');
      localStorage.removeItem('sun_last_reset_at');
      localStorage.removeItem('bridge_users');
      localStorage.removeItem('bridge_transactions');
      localStorage.removeItem('bridge_admin_session');
      try { sessionStorage.clear(); } catch(e) {}
      try {
        document.documentElement.classList.remove('is-user-logged-in');
        document.documentElement.classList.remove('is-admin-logged-in');
      } catch(e) {}
    }
  } catch(e) {}
})();

const DB = {
  // ---- CLOUD CONFIG (Supabase Database & Realtime Sync) ----
  SUPABASE: {
    URL: 'https://cmzfqeifdlktavqsoyjt.supabase.co',
    ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNtemZxZWlmZGxrdGF2cXNveWp0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMyODM1NjksImV4cCI6MjEwODg1OTU2OX0.AnWfzXrkNc3kCEy7EfKbeP3A191OKO_B8DK8kfeFdZM',
    TABLE: 'app_sync',
    SYNC_ID: 'prod_v2',
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

  // Safe user object merger: NEVER lets empty/null photo or bank clobber real data!
  _mergeUser(baseUser, updatedUser) {
    if (!baseUser) return updatedUser || null;
    if (!updatedUser) return baseUser || null;

    // Critical identity guard: If both have phones and they don't match, they are different clients!
    const p1 = (baseUser.phone || '').trim().replace(/^\+234/, '0');
    const p2 = (updatedUser.phone || '').trim().replace(/^\+234/, '0');
    if (p1 && p2 && p1 !== p2) {
      // Do NOT overwrite baseUser with a completely different person's info!
      return baseUser;
    }

    const merged = { ...baseUser, ...updatedUser };

    // Critical: Never overwrite a valid passportPhoto with null, undefined, or empty string!
    const basePhoto = baseUser.passportPhoto;
    const updPhoto  = updatedUser.passportPhoto;
    if (updPhoto && typeof updPhoto === 'string' && updPhoto.length > 50) {
      merged.passportPhoto = updPhoto;
    } else if (basePhoto && typeof basePhoto === 'string' && basePhoto.length > 50) {
      merged.passportPhoto = basePhoto;
    } else {
      merged.passportPhoto = null;
    }

    // Never overwrite registered payoutBank with empty/null
    const baseBank = baseUser.payoutBank || baseUser.bankDetails;
    const updBank  = updatedUser.payoutBank || updatedUser.bankDetails;
    if (updBank && (updBank.accountNumber || updBank.bankName)) {
      merged.payoutBank = updBank;
    } else if (baseBank && (baseBank.accountNumber || baseBank.bankName)) {
      merged.payoutBank = baseBank;
    }

    // Preserve non-empty phone, email, password, names
    if (!merged.phone && baseUser.phone) merged.phone = baseUser.phone;
    if (!merged.email && baseUser.email) merged.email = baseUser.email;
    if (!merged.password && baseUser.password) merged.password = baseUser.password;
    if (!merged.firstName && baseUser.firstName) merged.firstName = baseUser.firstName;
    if (!merged.lastName && baseUser.lastName) merged.lastName = baseUser.lastName;

    return merged;
  },

  // Secure Supabase API Call (Direct with Local/Edge Server Proxy fallback)
  async fetchSupabase(endpoint, options = {}) {
    const cleanEndpoint = endpoint.replace(/^\/+/, '');
    const directUrl = `${this.SUPABASE.URL}/${cleanEndpoint}`;
    const proxyUrl  = `/api/supabase/${cleanEndpoint}`;

    const headers = {
      'apikey': this.SUPABASE.ANON_KEY,
      'Authorization': `Bearer ${this.SUPABASE.ANON_KEY}`,
      'Accept': 'application/json',
      ...(options.headers || {})
    };

    const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    const urls = isLocalhost ? [directUrl, proxyUrl] : [directUrl];

    let lastError = null;
    for (const url of urls) {
      try {
        const res = await fetch(url, { ...options, headers });
        const rawText = await res.text();
        let json = null;
        try { json = JSON.parse(rawText); } catch(e) { json = null; }

        if (!json && res.status >= 400 && url.startsWith('/')) {
          continue;
        }

        return { ok: res.ok, status: res.status, data: json, rawText: rawText };
      } catch (err) {
        lastError = err;
        continue;
      }
    }
    throw lastError || new Error('Network error connecting to Supabase database.');
  },

  async syncPush() {
    if (!navigator.onLine) return false;
    try {
      this.notifySync('syncing');

      // Fetch latest state from Supabase to merge bidirectionally and prevent clobbering
      let cloudUsers = [];
      let cloudTxs = [];
      let cloudCats = [];
      let cloudFlw = null;
      let cloudComm = null;
      let cloudResetId = null;

      try {
        const pullRes = await this.fetchSupabase(`rest/v1/${this.SUPABASE.TABLE}?id=eq.${this.SUPABASE.SYNC_ID}&select=*`, {
          method: 'GET',
        });
        if (pullRes.ok && pullRes.data) {
          const rows = pullRes.data;
          const rec = (Array.isArray(rows) && rows[0]) ? rows[0] : (rows || {});
          cloudUsers = Array.isArray(rec.users) ? rec.users : [];
          cloudTxs = Array.isArray(rec.transactions) ? rec.transactions : [];
          cloudCats = Array.isArray(rec.custom_categories || rec.customCategories) ? (rec.custom_categories || rec.customCategories) : [];
          cloudFlw = rec.flutterwave_config || rec.flutterwaveConfig || null;
          cloudComm = (cloudFlw && cloudFlw.commission_percentage !== undefined)
            ? cloudFlw.commission_percentage
            : (rec.commission_percentage !== undefined ? rec.commission_percentage : rec.commissionPercentage);
          cloudResetId = rec.reset_id || rec.resetId || null;
        }
      } catch (e) {
        console.warn('Pre-push fetch notice:', e);
      }

      // If cloud had a factory reset that local hasn't processed, pull first
      const localEpoch = localStorage.getItem('sun_system_reset_epoch');
      if (cloudResetId && cloudResetId !== localEpoch) {
        await this.syncPull();
        return true;
      }

      // Merge Users (Union by ID, keeping all unique accounts and protecting photos)
      const localUsers = this.getUsers();
      const userMap = new Map();
      cloudUsers.forEach(u => {
        if (u && u.id) userMap.set(u.id, u);
      });
      localUsers.forEach(u => {
        if (u && u.id) {
          const existing = userMap.get(u.id);
          if (existing) {
            const p1 = (existing.phone || '').trim().replace(/^\+234/, '0');
            const p2 = (u.phone || '').trim().replace(/^\+234/, '0');
            if (p1 && p2 && p1 !== p2) {
              // ID collision detected between different clients! Reassign local user to next sequential ID
              let maxNum = 0;
              userMap.forEach(usr => {
                const match = (usr.id || '').match(/^ir(\d+)$/i);
                if (match) {
                  const n = parseInt(match[1], 10);
                  if (!isNaN(n) && n > maxNum) maxNum = n;
                }
              });
              const newId = 'ir' + String(maxNum + 1).padStart(5, '0');
              userMap.set(newId, { ...u, id: newId });
            } else {
              userMap.set(u.id, this._mergeUser(existing, u));
            }
          } else {
            userMap.set(u.id, u);
          }
        }
      });
      const mergedUsers = Array.from(userMap.values());
      localStorage.setItem('sun_users', JSON.stringify(mergedUsers));

      // Merge Transactions (Union by ID, keeping all records and preserving approved/declined statuses)
      const localTxs = this.getAllTransactions().filter(t => t && !t.id.startsWith('tx_179364800000'));
      const txMap = new Map();
      cloudTxs.filter(t => t && !t.id.startsWith('tx_179364800000')).forEach(t => {
        if (t && t.id) txMap.set(t.id, t);
      });
      localTxs.forEach(t => {
        if (t && t.id) {
          const existing = txMap.get(t.id);
          if (existing) {
            const isLocalReviewed = t.status === 'approved' || t.status === 'declined';
            const isCloudReviewed = existing.status === 'approved' || existing.status === 'declined';
            txMap.set(t.id, isLocalReviewed ? { ...existing, ...t } : (isCloudReviewed ? { ...t, ...existing } : { ...existing, ...t }));
          } else {
            txMap.set(t.id, t);
          }
        }
      });
      const mergedTxs = Array.from(txMap.values());
      localStorage.setItem('sun_transactions', JSON.stringify(mergedTxs));

      // Merge custom categories
      const localCats = this.getCustomCategories();
      const mergedCats = Array.from(new Set([...cloudCats, ...localCats]));
      localStorage.setItem('sun_custom_categories', JSON.stringify(mergedCats));

      // Merge Flutterwave config
      let mergedFlw = this.getFlutterwaveConfig();
      if (cloudFlw && typeof cloudFlw === 'object') {
        if (cloudFlw.updatedAt && (!mergedFlw.updatedAt || cloudFlw.updatedAt >= mergedFlw.updatedAt)) {
          mergedFlw = { ...mergedFlw, ...cloudFlw };
          localStorage.setItem('sun_flutterwave_config', JSON.stringify(mergedFlw));
        }
      }

      // Merge Commission Rate
      const localComm = this.getCommissionRate();
      const localCommUpdated = localStorage.getItem('sun_commission_updated_at') || '2000-01-01T00:00:00.000Z';
      const cloudCommUpdated = (cloudFlw && (cloudFlw.commission_updated_at || cloudFlw.updatedAt)) || '2000-01-01T00:00:00.000Z';

      let finalComm = localComm;
      if (cloudComm !== undefined && cloudComm !== null && !isNaN(Number(cloudComm)) && cloudCommUpdated > localCommUpdated) {
        finalComm = Number(cloudComm);
        localStorage.setItem('sun_commission_percentage', String(finalComm));
        localStorage.setItem('sun_commission_updated_at', cloudCommUpdated);
      }

      // Safely embed commission rate in flutterwave_config JSON to match Supabase schema
      if (mergedFlw && typeof mergedFlw === 'object') {
        mergedFlw.commission_percentage = finalComm;
        mergedFlw.commission_updated_at = localCommUpdated > cloudCommUpdated ? localCommUpdated : cloudCommUpdated;
      }

      const payload = {
        id: this.SUPABASE.SYNC_ID,
        users: mergedUsers,
        transactions: mergedTxs,
        admin: this.getAdmin(),
        custom_categories: mergedCats,
        flutterwave_config: mergedFlw,
        reset_id: SYSTEM_RESET_ID,
        updated_at: new Date().toISOString(),
      };

      const res = await this.fetchSupabase(`rest/v1/${this.SUPABASE.TABLE}?on_conflict=id`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Prefer': 'resolution=merge-duplicates,return=minimal',
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        throw new Error(`Supabase Sync Push HTTP ${res.status}`);
      }
      this.notifySync('synced');
      return true;
    } catch (err) {
      console.warn('Supabase sync push error:', err);
      this.notifySync('error', err);
      return false;
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
      const res = await this.fetchSupabase(`rest/v1/${this.SUPABASE.TABLE}?id=eq.${this.SUPABASE.SYNC_ID}&select=*`, {
        method: 'GET',
      });

      if (!res.ok) {
        throw new Error(`Supabase Sync Pull HTTP ${res.status}`);
      }

      const rows = res.data;
      const record = (Array.isArray(rows) && rows[0]) ? rows[0] : (rows || {});
      const cloudUsers = Array.isArray(record.users) ? record.users : [];
      const cloudTxs   = Array.isArray(record.transactions) ? record.transactions : [];
      const cloudAdmin = record.admin;

      // Check if cloud has a new reset epoch that this device has not processed yet
      const cloudResetId = record.reset_id || record.resetId;
      const localEpoch = localStorage.getItem('sun_system_reset_epoch');

      if (cloudResetId && cloudResetId !== localEpoch) {
        localStorage.setItem('sun_system_reset_epoch', cloudResetId);
        localStorage.setItem('sun_users', '[]');
        localStorage.setItem('sun_transactions', '[]');
        localStorage.setItem('sun_custom_categories', '[]');
        localStorage.removeItem('sun_session');
        localStorage.removeItem('sun_user_session');
        localStorage.removeItem('sun_active_user');
        localStorage.removeItem('sun_user_tab');
        localStorage.removeItem('sun_admin_session');
        localStorage.removeItem('sun_admin_tab');

        const activeFlw = record.flutterwave_config || record.flutterwaveConfig;
        if (cloudAdmin && cloudAdmin.password) {
          localStorage.setItem('sun_admin', JSON.stringify(cloudAdmin));
        }
        if (activeFlw && typeof activeFlw === 'object') {
          localStorage.setItem('sun_flutterwave_config', JSON.stringify(activeFlw));
        }
        const cloudComm = record.commission_percentage !== undefined ? record.commission_percentage : record.commissionPercentage;
        if (cloudComm !== undefined && cloudComm !== null && !isNaN(Number(cloudComm))) {
          localStorage.setItem('sun_commission_percentage', String(cloudComm));
        }

        this._isPulling = false;
        this.notifySync('synced');

        if (window.UserApp && typeof window.UserApp.refresh === 'function') window.UserApp.refresh();
        if (window.AdminApp && typeof window.AdminApp.refresh === 'function') window.AdminApp.refresh();
        if (typeof onComplete === 'function') onComplete(true);
        return;
      }

      // Bidirectional Merge: Cloud is authoritative, but NEVER delete locally created accounts that haven't synced yet
      const localUsers = this.getUsers();
      const userMap = new Map();
      cloudUsers.forEach(cu => { if (cu && cu.id) userMap.set(cu.id, cu); });
      let needsPushToCloud = false;
      localUsers.forEach(lu => {
        if (lu && lu.id) {
          if (!userMap.has(lu.id)) {
            userMap.set(lu.id, lu);
            needsPushToCloud = true;
          } else {
            const cloudU = userMap.get(lu.id);
            const p1 = (cloudU.phone || '').trim().replace(/^\+234/, '0');
            const p2 = (lu.phone || '').trim().replace(/^\+234/, '0');
            if (p1 && p2 && p1 !== p2) {
              // ID collision detected! Local user has an ID assigned that cloud already gave to someone else.
              let maxNum = 0;
              userMap.forEach(usr => {
                const match = (usr.id || '').match(/^ir(\d+)$/i);
                if (match) {
                  const n = parseInt(match[1], 10);
                  if (!isNaN(n) && n > maxNum) maxNum = n;
                }
              });
              const newId = 'ir' + String(maxNum + 1).padStart(5, '0');
              userMap.set(newId, { ...lu, id: newId });
              needsPushToCloud = true;
            } else {
              userMap.set(lu.id, this._mergeUser(cloudU, lu));
            }
          }
        }
      });
      const finalUsers = Array.from(userMap.values());
      localStorage.setItem('sun_users', JSON.stringify(finalUsers));

      // Bidirectional Merge for Transactions
      const localTxs = this.getAllTransactions().filter(t => t && !t.id.startsWith('tx_179364800000'));
      const txMap = new Map();
      cloudTxs.filter(ct => ct && !ct.id.startsWith('tx_179364800000')).forEach(ct => { if (ct && ct.id) txMap.set(ct.id, ct); });
      localTxs.forEach(lt => {
        if (lt && lt.id) {
          if (!txMap.has(lt.id)) {
            txMap.set(lt.id, lt);
            needsPushToCloud = true;
          } else {
            const cloudT = txMap.get(lt.id);
            const isLocalReviewed = lt.status === 'approved' || lt.status === 'declined';
            const isCloudReviewed = cloudT.status === 'approved' || cloudT.status === 'declined';
            txMap.set(lt.id, isLocalReviewed ? { ...cloudT, ...lt } : (isCloudReviewed ? { ...lt, ...cloudT } : { ...cloudT, ...lt }));
          }
        }
      });
      const finalTxs = Array.from(txMap.values());
      localStorage.setItem('sun_transactions', JSON.stringify(finalTxs));

      // Validate active user session against merged users
      const currentSession = this.getSession();
      if (currentSession && currentSession.userId) {
        const stillExists = finalUsers.some(u => u.id === currentSession.userId);
        if (!stillExists) {
          this.clearSession();
          if (window.App && typeof window.App.navigate === 'function') {
            window.App.navigate('login');
          }
        }
      }

      // 3. Admin sync if exists
      if (cloudAdmin && cloudAdmin.password) {
        const mergedAdmin = {
          email: cloudAdmin.email || 'admin@suninvestment.com',
          username: cloudAdmin.username || 'admin',
          password: cloudAdmin.password || 'Admin@123',
          name: cloudAdmin.name || 'System Admin',
        };
        localStorage.setItem('sun_admin', JSON.stringify(mergedAdmin));
      }

      // 4. Custom Categories sync if exists
      const cloudCats = record.custom_categories || record.customCategories;
      if (Array.isArray(cloudCats)) {
        localStorage.setItem('sun_custom_categories', JSON.stringify(cloudCats));
      }

      // 5. Flutterwave config sync
      const cloudFlw = record.flutterwave_config || record.flutterwaveConfig || {};
      if (cloudFlw && typeof cloudFlw === 'object' && Object.keys(cloudFlw).length > 0) {
        const localCfg = this.getFlutterwaveConfig();
        if (cloudFlw.updatedAt && (!localCfg.updatedAt || cloudFlw.updatedAt >= localCfg.updatedAt)) {
          localStorage.setItem('sun_flutterwave_config', JSON.stringify({ ...localCfg, ...cloudFlw }));
        }
      }

      // 6. Commission percentage sync
      const cloudComm = (cloudFlw && cloudFlw.commission_percentage !== undefined)
        ? cloudFlw.commission_percentage
        : (record.commission_percentage !== undefined ? record.commission_percentage : record.commissionPercentage);
      const cloudCommUpdated = (cloudFlw && (cloudFlw.commission_updated_at || cloudFlw.updatedAt)) || '';
      const localCommUpdated = localStorage.getItem('sun_commission_updated_at') || '';

      if (cloudComm !== undefined && cloudComm !== null && !isNaN(Number(cloudComm))) {
        if (!localCommUpdated || !cloudCommUpdated || cloudCommUpdated >= localCommUpdated) {
          const numComm = Number(cloudComm);
          localStorage.setItem('sun_commission_percentage', String(numComm));
          if (cloudCommUpdated) {
            localStorage.setItem('sun_commission_updated_at', cloudCommUpdated);
          }
          // Update dynamic fee badges everywhere in DOM
          document.querySelectorAll('.comm-rate-badge').forEach(b => {
            b.textContent = `${numComm}%`;
          });
          const adminBadge = document.getElementById('admin-more-commission-badge');
          if (adminBadge) adminBadge.textContent = `${numComm}%`;
        }
      }

      this._isPulling = false;
      this.notifySync('synced');

      // If local storage had unsynced records, push merged state up to Supabase immediately
      if (needsPushToCloud) {
        this.scheduleCloudPush();
      }

      // Refresh active views with clean database data
      if (window.UserApp && typeof window.UserApp.refresh === 'function') {
        window.UserApp.refresh();
      }
      if (window.AdminApp && typeof window.AdminApp.refresh === 'function') {
        window.AdminApp.refresh();
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
      const idMatch = Boolean(u.id && u.id.toLowerCase() === clean);
      const emailMatch = Boolean(u.email && u.email.trim().toLowerCase() === clean);
      const phoneMatch = Boolean(cleanDigits.length >= 10 && u.phone && u.phone.replace(/\D/g, '') === cleanDigits);
      return idMatch || emailMatch || phoneMatch;
    }) || null;
  },
  getUserById(id) {
    return this.getUsers().find(u => u.id === id) || null;
  },
  async createUser(data) {
    // Quick pull to ensure sequential ID reflects any recent accounts across devices
    if (navigator.onLine) {
      try {
        await this.syncPull();
      } catch(e) {}
    }

    const users = this.getUsers();

    // Unique Sequential Client ID: ir00001, ir00002, ..., ir99999
    let maxNum = 0;
    users.forEach(u => {
      const match = (u.id || '').match(/^ir(\d+)$/i);
      if (match) {
        const n = parseInt(match[1], 10);
        if (!isNaN(n) && n > maxNum) maxNum = n;
      }
    });
    const nextNum = maxNum + 1;
    const newId = 'ir' + String(nextNum).padStart(5, '0');

    const newUser = {
      id: newId,
      firstName: this.formatName(data.firstName),
      lastName:  this.formatName(data.lastName),
      email: data.email ? data.email.trim().toLowerCase() : '',
      phone: data.phone.trim(),
      password: data.password,
      passportPhoto: data.passportPhoto || '',
      joinedAt: new Date().toISOString(),
    };
    users.push(newUser);
    localStorage.setItem('sun_users', JSON.stringify(users));

    // Push to Supabase immediately and await confirmation
    if (navigator.onLine) {
      try {
        await this.syncPush();
      } catch (e) {
        console.warn('Initial account push error:', e);
      }
    } else {
      this.scheduleCloudPush();
    }

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
      localStorage.setItem('sun_active_portal', 'user');
    } catch (e) {
      console.error('Failed to save session:', e);
    }
  },
  clearSession() {
    try {
      localStorage.removeItem('sun_session');
      localStorage.removeItem('sun_user_tab');
      localStorage.removeItem('sun_user_session');
      localStorage.removeItem('sun_active_user');
      if (localStorage.getItem('sun_active_portal') === 'user') {
        localStorage.removeItem('sun_active_portal');
      }
      if (typeof document !== 'undefined' && document.documentElement) {
        document.documentElement.classList.remove('is-user-logged-in');
      }
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
    if (reviewMeta.flutterwaveTransferId) {
      tx.flwId = reviewMeta.flutterwaveTransferId;
      tx.flutterwaveTransferId = reviewMeta.flutterwaveTransferId;
    }
    if (reviewMeta.grossAmount !== undefined) tx.grossAmount = reviewMeta.grossAmount;
    if (reviewMeta.fee !== undefined) tx.fee = reviewMeta.fee;
    if (reviewMeta.netAmount !== undefined) tx.netAmount = reviewMeta.netAmount;
    if (reviewMeta.feeRate !== undefined) tx.feeRate = reviewMeta.feeRate;

    // Update transaction note with complete payout details
    if (reviewMeta.flutterwaveTransferId && (!tx.note || !tx.note.includes('FLW:'))) {
      const bankInfo = tx.destinationBank ? `${tx.destinationBank.bankName || 'Bank'} ${tx.destinationBank.accountNumber}` : '';
      const netStr = tx.netAmount ? `Net: ₦${Number(tx.netAmount).toFixed(2)}` : '';
      const feeStr = tx.fee ? `(Fee: ₦${Number(tx.fee).toFixed(2)})` : '';
      tx.note = `Payout to: ${bankInfo} | ${netStr} ${feeStr} | FLW: ${reviewMeta.flutterwaveTransferId}`.trim();
    }

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
    let admin = null;
    try {
      admin = JSON.parse(localStorage.getItem('sun_admin') || 'null');
    } catch (e) {}
    if (!admin || typeof admin !== 'object') {
      admin = {};
    }
    if (!admin.email) {
      admin.email = 'admin@suninvestment.com';
    }
    if (!admin.username) {
      admin.username = 'admin';
    }
    if (!admin.password) {
      admin.password = 'Admin@123';
    }
    try {
      localStorage.setItem('sun_admin', JSON.stringify(admin));
    } catch (e) {}
    return admin;
  },
  updateAdminPassword(newPassword) {
    const admin = this.getAdmin();
    admin.password = newPassword;
    localStorage.setItem('sun_admin', JSON.stringify(admin));
    this.scheduleCloudPush();
    return true;
  },
  updateAdminEmail(newEmail) {
    if (!newEmail || typeof newEmail !== 'string' || !newEmail.includes('@')) {
      throw new Error('Please enter a valid email address.');
    }
    const admin = this.getAdmin();
    admin.email = newEmail.trim().toLowerCase();
    localStorage.setItem('sun_admin', JSON.stringify(admin));
    this.scheduleCloudPush();
    return admin.email;
  },
  getCommissionRate() {
    try {
      const stored = localStorage.getItem('sun_commission_percentage');
      if (stored !== null && stored !== undefined && stored !== '') {
        const parsed = parseFloat(stored);
        if (!isNaN(parsed) && parsed >= 0 && parsed <= 100) {
          return parsed;
        }
      }
    } catch (e) {}
    return 4; // Default 4% commission as requested
  },
  setCommissionRate(rate) {
    const num = parseFloat(rate);
    if (isNaN(num) || num < 0 || num > 100) {
      throw new Error('Commission rate must be a valid percentage between 0% and 100%.');
    }
    const rounded = Math.round(num * 100) / 100;
    const nowIso = new Date().toISOString();
    localStorage.setItem('sun_commission_percentage', String(rounded));
    localStorage.setItem('sun_commission_updated_at', nowIso);

    try {
      const flwCfg = this.getFlutterwaveConfig();
      flwCfg.commission_percentage = rounded;
      flwCfg.commission_updated_at = nowIso;
      flwCfg.updatedAt = nowIso;
      localStorage.setItem('sun_flutterwave_config', JSON.stringify(flwCfg));
    } catch (e) {}

    document.querySelectorAll('.comm-rate-badge').forEach(b => {
      b.textContent = `${rounded}%`;
    });
    const adminBadge = document.getElementById('admin-more-commission-badge');
    if (adminBadge) adminBadge.textContent = `${rounded}%`;

    this.scheduleCloudPush();
    return rounded;
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
      localStorage.setItem('sun_active_portal', 'admin');
    } catch (e) {
      console.error('Failed to save admin session:', e);
    }
  },
  clearAdminSession() {
    try {
      localStorage.removeItem('sun_admin_session');
      localStorage.removeItem('sun_admin_tab');
      if (localStorage.getItem('sun_active_portal') === 'admin') {
        localStorage.removeItem('sun_active_portal');
      }
      if (typeof document !== 'undefined' && document.documentElement) {
        document.documentElement.classList.remove('is-admin-logged-in');
      }
    } catch (e) {}
  },

  // ---- FLUTTERWAVE GATEWAY CONFIG ----
  getFlutterwaveConfig() {
    const defaultPub = 'FLWPUBK-570758bf49301716d7e0133dce781024-X';
    const defaultSec = 'FLWSECK-fc044b9b11bc1da34e06422d381602d4-1a1872431eevt-X';
    try {
      const raw = localStorage.getItem('sun_flutterwave_config');
      if (raw) {
        const parsed = JSON.parse(raw);
        let pub = parsed.publicKey;
        let sec = parsed.secretKey;
        if (!pub || pub.includes('@') || !pub.startsWith('FLWPUBK')) pub = defaultPub;
        if (!sec || !sec.startsWith('FLWSECK')) sec = defaultSec;
        return {
          publicKey: pub,
          secretKey: sec,
          encryptionKey: parsed.encryptionKey || 'fc044b9b11bc9d09633290a0',
          mode: parsed.mode || 'live',
          merchantName: 'John Idowu (Iretomiwa Sun Investment)',
          isEnabled: parsed.isEnabled !== false,
          autoCashout: parsed.autoCashout !== false, // Enabled by default for API payouts
          updatedAt: parsed.updatedAt || '2026-11-03T11:50:00.000Z',
        };
      }
    } catch(e) {}
    return {
      publicKey: defaultPub,
      secretKey: defaultSec,
      encryptionKey: 'fc044b9b11bc9d09633290a0',
      mode: 'live',
      merchantName: 'John Idowu (Iretomiwa Sun Investment)',
      isEnabled: true,
      autoCashout: true,
      updatedAt: '2026-11-03T11:50:00.000Z',
    };
  },
  setFlutterwaveConfig(cfg) {
    const defaultPub = 'FLWPUBK-570758bf49301716d7e0133dce781024-X';
    const defaultSec = 'b1zBtYkgc8TzebSKJAeHyriyI3NsyRPjtMRZhIYI0meRr2BUcrSTRETnCeu4SaQ6mimPJcyXH4PjkWLqgbFKDO';
    const current = this.getFlutterwaveConfig();
    let pub = (cfg.publicKey || current.publicKey || '').trim();
    let sec = (cfg.secretKey || current.secretKey || '').trim();
    if (!pub || pub.includes('@') || !pub.startsWith('FLWPUBK')) pub = defaultPub;
    if (!sec || sec.length < 20) sec = defaultSec;

    const updated = {
      ...current,
      ...cfg,
      publicKey: pub,
      secretKey: sec,
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
      { code: '100033', name: 'PalmPay' },
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

  // ---- SECURE FLUTTERWAVE API CALL (WITH LOCAL/NETLIFY CORS PROXY & FALLBACK) ----
  async fetchFlutterwave(endpoint, options = {}) {
    const cleanEndpoint = endpoint.replace(/^\/+/, '');
    const cfg = this.getFlutterwaveConfig();
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${cfg.secretKey}`,
      ...(options.headers || {})
    };

    // Candidate routes to prevent browser CORS and IP restriction blocks:
    // 1. Local / Server Proxy (/api/flw/...) - connects through local PC IP or edge proxy
    // 2. Netlify Serverless Function (/.netlify/functions/flw) - fallback on cloud
    // 3. Direct Flutterwave API - fallback
    const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    const candidates = isLocalhost
      ? [
          `/api/flw/${cleanEndpoint}`,
          `https://api.flutterwave.com/v3/${cleanEndpoint}`
        ]
      : [
          `/api/flw/${cleanEndpoint}`,
          `/.netlify/functions/flw?path=${encodeURIComponent(cleanEndpoint)}`,
          `https://api.flutterwave.com/v3/${cleanEndpoint}`
        ];

    let lastError = null;

    for (const url of candidates) {
      try {
        const res = await fetch(url, {
          ...options,
          headers
        });

        const rawText = await res.text();
        let json = null;
        try {
          json = JSON.parse(rawText);
        } catch (e) {
          json = null;
        }

        // If proxy returned HTML (e.g. 404 page or Cloudflare challenge), try next route
        if (!json && res.status >= 400 && url.startsWith('/')) {
          console.warn(`Proxy route ${url} returned non-JSON HTTP ${res.status}, trying fallback route...`);
          continue;
        }

        return { ok: res.ok, status: res.status, json: json, rawText: rawText };
      } catch (err) {
        lastError = err;
        continue;
      }
    }

    throw lastError || new Error('Network connection error contacting Flutterwave.');
  },

  // Bank Code Alias Resolver for Flutterwave routing (OPay, PalmPay, Moniepoint, etc.)
  getBankCodeCandidates(bankCode) {
    const c = String(bankCode || '').trim();
    if (['100004', '999992', '090110', 'opay', 'paycom'].includes(c.toLowerCase())) {
      return ['100004', '090110', '999992'];
    }
    if (['999991', '100033', '090405', 'palmpay'].includes(c.toLowerCase())) {
      return ['100033', '999991', '090405'];
    }
    if (['50515', '090405', '090392', 'moniepoint'].includes(c.toLowerCase())) {
      return ['50515', '090405', '090392'];
    }
    if (['50211', '090267', 'kuda'].includes(c.toLowerCase())) {
      return ['50211', '090267'];
    }
    return [c];
  },

  // ---- FLUTTERWAVE REAL-TIME ACCOUNT RESOLUTION ----
  async resolveFlutterwaveAccount(accountNumber, bankCode, userId = null) {
    if (!accountNumber || accountNumber.length !== 10) {
      return { success: false, error: 'Account number must be 10 digits.' };
    }
    if (!bankCode) {
      return { success: false, error: 'Please select a bank.' };
    }
    const cfg = this.getFlutterwaveConfig();
    const candidates = this.getBankCodeCandidates(bankCode);

    if (cfg && cfg.secretKey) {
      for (const cand of candidates) {
        try {
          const response = await this.fetchFlutterwave('accounts/resolve', {
            method: 'POST',
            body: JSON.stringify({
              account_number: accountNumber.trim(),
              account_bank: cand.trim(),
            }),
          });

          const json = response.json;
          if (json && json.status === 'success' && json.data && json.data.account_name) {
            return {
              success: true,
              accountNumber: json.data.account_number || accountNumber.trim(),
              accountName: json.data.account_name.toUpperCase(),
              resolvedBankCode: cand,
              source: 'bank',
            };
          }
        } catch (err) {
          console.warn(`Resolve candidate ${cand} error:`, err);
        }
      }
    }

    // Fallback: If user is logged in, auto-fill and verify against client registered legal name
    if (userId) {
      const u = this.getUserById(userId);
      if (u && (u.firstName || u.lastName)) {
        const fullName = `${this.formatName(u.firstName)} ${this.formatName(u.lastName)}`.trim().toUpperCase();
        return {
          success: true,
          accountNumber: accountNumber.trim(),
          accountName: fullName,
          resolvedBankCode: candidates[0],
          source: 'profile',
        };
      }
    }

    return {
      success: false,
      error: 'Could not auto-verify name. Please enter account name as registered with the bank.',
    };
  },

  // ---- FLUTTERWAVE DISBURSEMENT / TRANSFER ----
  async disburseFlutterwaveTransfer({ accountNumber, bankCode, amount, narration, txId, clientName }) {
    const cleanAmount = parseFloat(amount);
    if (!cleanAmount || cleanAmount <= 0) {
      return { success: false, error: 'Invalid payout amount.' };
    }
    if (!accountNumber || !bankCode) {
      return { success: false, error: 'Destination bank code and account number are required.' };
    }

    // Pre-transfer account verification: try all candidate codes for fintechs like OPay/Paycom/Palmpay
    const candidates = this.getBankCodeCandidates(bankCode);
    let workingBankCode = candidates[0];
    let verifiedAccountName = clientName;

    try {
      for (const cand of candidates) {
        const verifyRes = await this.fetchFlutterwave('accounts/resolve', {
          method: 'POST',
          body: JSON.stringify({
            account_number: accountNumber.trim(),
            account_bank: cand.trim(),
          }),
        });
        const vj = verifyRes.json;
        if (vj && vj.status === 'success' && vj.data && vj.data.account_name) {
          workingBankCode = cand;
          verifiedAccountName = vj.data.account_name.toUpperCase();
          break;
        }
      }
    } catch (verifyErr) {
      console.warn('Pre-transfer verify check warning:', verifyErr);
    }

    // For OPay, Flutterwave standard transfer routing code is 100004
    const isOpay = ['100004', '999992', '090110', 'opay', 'paycom'].includes(String(workingBankCode).toLowerCase());
    const flwBankCode = isOpay ? '100004' : workingBankCode;

    const reference = 'TXF_' + (txId || Date.now()) + '_' + Math.random().toString(36).slice(2, 7);
    const payload = {
      account_bank: flwBankCode,
      account_number: accountNumber.trim(),
      amount: cleanAmount,
      narration: (narration || `Iretomiwa Sun payout to ${verifiedAccountName || clientName || 'Client'}`).slice(0, 100),
      currency: 'NGN',
      reference: reference,
      beneficiary_name: (verifiedAccountName || clientName) ? (verifiedAccountName || clientName).trim() : undefined,
    };

    try {
      const response = await this.fetchFlutterwave('transfers', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      const json = response.json;
      if (json && json.status === 'success' && json.data) {
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
        error: (json && json.message)
          ? json.message
          : (response.status === 403
              ? 'Flutterwave Access Denied (403): Ensure IP Whitelisting is turned ON in your Flutterwave dashboard (Settings -> Security) and your PC IP is added.'
              : (response.status === 502
                  ? 'Flutterwave API gateway temporarily busy (502). Please retry in a few moments.'
                  : (response.status ? `Flutterwave response code ${response.status}` : 'Transfer disbursement failed on Flutterwave.'))),
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
    try {
      const response = await this.fetchFlutterwave('balances/NGN', {
        method: 'GET',
      });
      const json = response.json;
      if (json && json.status === 'success' && json.data) {
        return {
          success: true,
          balance: json.data.available_balance || 0,
          ledger: json.data.ledger_balance || 0,
          currency: json.data.currency || 'NGN',
        };
      }
      return {
        success: false,
        error: (json && json.message) || 'Could not fetch Flutterwave wallet balance.',
      };
    } catch (err) {
      return {
        success: false,
        error: err.message || 'Network error fetching wallet balance.',
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
    localStorage.setItem('sun_system_reset_epoch', SYSTEM_RESET_ID);
    localStorage.setItem('sun_last_reset_at', resetTimestamp);
    localStorage.setItem('sun_users', '[]');
    localStorage.setItem('sun_transactions', '[]');
    localStorage.setItem('sun_custom_categories', '[]');
    localStorage.removeItem('sun_session');
    localStorage.removeItem('sun_user_session');
    localStorage.removeItem('sun_active_user');
    localStorage.removeItem('sun_user_tab');
    if (typeof document !== 'undefined' && document.documentElement) {
      document.documentElement.classList.remove('is-user-logged-in');
    }

    const payload = {
      id: this.SUPABASE.SYNC_ID,
      users: [],
      transactions: [],
      admin: this.getAdmin(),
      custom_categories: [],
      flutterwave_config: this.getFlutterwaveConfig(),
      reset_id: SYSTEM_RESET_ID,
      updated_at: resetTimestamp,
    };

    try {
      const res = await fetch(`${this.SUPABASE.URL}/rest/v1/${this.SUPABASE.TABLE}?on_conflict=id`, {
        method: 'POST',
        headers: {
          'apikey': this.SUPABASE.ANON_KEY,
          'Authorization': `Bearer ${this.SUPABASE.ANON_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'resolution=merge-duplicates,return=minimal',
        },
        body: JSON.stringify(payload),
      });
      return res.ok;
    } catch (e) {
      console.error('Supabase factory reset error:', e);
      return false;
    }
  },
};

// Initialize Authoritative Cloud Sync on boot
DB.initCloudSync();
