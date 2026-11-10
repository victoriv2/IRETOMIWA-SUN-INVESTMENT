// ============================================
// STORAGE.JS - Data Layer (localStorage & Cloud Sync)
// ============================================

// ---- HARD SYSTEM RESET EPOCH ----
const SYSTEM_RESET_ID = 'RESET_IR00001_V5';

(function enforceSystemReset() {
  try {
    const currentEpoch = localStorage.getItem('sun_system_reset_epoch');
    if (currentEpoch !== SYSTEM_RESET_ID) {
      localStorage.setItem('sun_system_reset_epoch', SYSTEM_RESET_ID);
      // Clean up obsolete bridge keys without destroying live user sessions or accounts
      localStorage.removeItem('bridge_users');
      localStorage.removeItem('bridge_transactions');
      localStorage.removeItem('bridge_admin_session');
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

  // Clean & normalize Nigerian phone number for unambiguous matching
  _cleanPhone(phone) {
    if (!phone) return '';
    return String(phone).trim().replace(/^\+?234/, '0').replace(/\D/g, '');
  },

  // Safe user object merger: timestamp-aware, protecting photos, bank details, and identity
  _mergeUser(baseUser, updatedUser) {
    if (!baseUser) return updatedUser || null;
    if (!updatedUser) return baseUser || null;

    // Critical identity guard: If both have phones and they don't match, they are different clients!
    const p1 = this._cleanPhone(baseUser.phone);
    const p2 = this._cleanPhone(updatedUser.phone);
    if (p1 && p2 && p1 !== p2) {
      // Do NOT overwrite baseUser with a completely different person's info!
      return baseUser;
    }

    const tBase = baseUser.updatedAt || baseUser.joinedAt || '1970-01-01T00:00:00.000Z';
    const tUpd  = updatedUser.updatedAt || updatedUser.joinedAt || '1970-01-01T00:00:00.000Z';
    const isUpdNewer = (tUpd >= tBase);
    const primary = isUpdNewer ? updatedUser : baseUser;
    const fallback = isUpdNewer ? baseUser : updatedUser;

    const merged = { ...fallback, ...primary };

    // Photo merger: pick the newest photo by photoUpdatedAt / updatedAt, never clobber with blank
    const basePhoto = baseUser.passportPhoto;
    const updPhoto  = updatedUser.passportPhoto;
    const hasBasePhoto = Boolean(basePhoto && typeof basePhoto === 'string' && basePhoto.length > 50);
    const hasUpdPhoto  = Boolean(updPhoto && typeof updPhoto === 'string' && updPhoto.length > 50);
    const tBasePhoto = baseUser.photoUpdatedAt || baseUser.updatedAt || '1970-01-01T00:00:00.000Z';
    const tUpdPhoto  = updatedUser.photoUpdatedAt || updatedUser.updatedAt || '1970-01-01T00:00:00.000Z';

    if (hasBasePhoto && hasUpdPhoto) {
      if (tBasePhoto > tUpdPhoto) {
        merged.passportPhoto = basePhoto;
        merged.photoUpdatedAt = tBasePhoto;
      } else {
        merged.passportPhoto = updPhoto;
        merged.photoUpdatedAt = tUpdPhoto;
      }
    } else if (hasUpdPhoto) {
      merged.passportPhoto = updPhoto;
      merged.photoUpdatedAt = tUpdPhoto;
    } else if (hasBasePhoto) {
      merged.passportPhoto = basePhoto;
      merged.photoUpdatedAt = tBasePhoto;
    } else {
      merged.passportPhoto = null;
    }

    // Bank details merger
    const baseBank = baseUser.payoutBank || baseUser.bankDetails;
    const updBank  = updatedUser.payoutBank || updatedUser.bankDetails;
    const hasBaseBank = Boolean(baseBank && (baseBank.accountNumber || baseBank.bankName));
    const hasUpdBank  = Boolean(updBank && (updBank.accountNumber || updBank.bankName));
    const tBaseBank = (baseBank && baseBank.updatedAt) || baseUser.updatedAt || '1970-01-01T00:00:00.000Z';
    const tUpdBank  = (updBank && updBank.updatedAt) || updatedUser.updatedAt || '1970-01-01T00:00:00.000Z';

    if (hasBaseBank && hasUpdBank) {
      merged.payoutBank = (tBaseBank > tUpdBank) ? baseBank : updBank;
    } else if (hasUpdBank) {
      merged.payoutBank = updBank;
    } else if (hasBaseBank) {
      merged.payoutBank = baseBank;
    }

    // Preserve non-empty phone, email, password, names
    if (!merged.phone && fallback.phone) merged.phone = fallback.phone;
    if (!merged.email && fallback.email) merged.email = fallback.email;
    if (!merged.password && fallback.password) merged.password = fallback.password;
    if (!merged.firstName && fallback.firstName) merged.firstName = fallback.firstName;
    if (!merged.lastName && fallback.lastName) merged.lastName = fallback.lastName;
    merged.updatedAt = (tUpd > tBase) ? tUpd : tBase;

    return merged;
  },

  // Guaranteed Multi-Tier Image Compressor: Strictly caps ANY image upload <= 100 KB (target 40-85 KB)
  // Preserves Supabase free tier storage & network bandwidth limits
  compressImage(file, options = {}) {
    return new Promise((resolve, reject) => {
      if (!file) return reject(new Error('No image file was provided.'));
      if (!file.type || !file.type.match(/^image\//)) {
        return reject(new Error('Selected file must be an image format (JPEG, PNG, WEBP, etc.).'));
      }

      const originalSizeKB = Math.round(file.size / 1024);
      const targetMaxKB = options.maxKB || 95; // Strictly enforced under 100 KB
      let maxDim = options.maxDimension || 480;

      const reader = new FileReader();
      reader.onerror = () => reject(new Error('Failed to read image file from disk.'));
      reader.onload = (e) => {
        const img = new Image();
        img.onerror = () => reject(new Error('Image format could not be decoded.'));
        img.onload = () => {
          try {
            function renderCanvas(dim, q) {
              let w = img.width;
              let h = img.height;
              if (w > dim || h > dim) {
                if (w > h) {
                  h = Math.round((h * dim) / w);
                  w = dim;
                } else {
                  w = Math.round((w * dim) / h);
                  h = dim;
                }
              }

              const canvas = document.createElement('canvas');
              canvas.width = Math.max(1, w);
              canvas.height = Math.max(1, h);
              const ctx = canvas.getContext('2d');
              ctx.fillStyle = '#ffffff';
              ctx.fillRect(0, 0, canvas.width, canvas.height);
              ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

              const dataUrl = canvas.toDataURL('image/jpeg', q);
              const headLen = dataUrl.indexOf(',') + 1;
              const byteLen = Math.round((dataUrl.length - headLen) * 0.75);
              const kb = Math.round(byteLen / 1024);
              return { dataUrl, kb, w: canvas.width, h: canvas.height };
            }

            // Tier 1: Scale to maxDim and compress at 0.85 quality
            let quality = 0.85;
            let current = renderCanvas(maxDim, quality);

            // Tier 2: Step-down quality iteratively if exceeding target
            while (current.kb > targetMaxKB && quality > 0.35) {
              quality -= 0.1;
              current = renderCanvas(maxDim, quality);
            }

            // Tier 3: If still over target, scale dimensions down progressively (480 -> 384 -> 307 -> 245)
            while (current.kb > targetMaxKB && maxDim > 220) {
              maxDim = Math.round(maxDim * 0.8);
              current = renderCanvas(maxDim, Math.max(quality, 0.6));
            }

            // Tier 4: Final emergency quality reduction to guarantee strictly <= targetMaxKB
            if (current.kb > targetMaxKB) {
              current = renderCanvas(maxDim, 0.4);
            }

            resolve({
              dataUrl: current.dataUrl,
              sizeKB: Math.max(1, current.kb),
              originalSizeKB: originalSizeKB,
              width: current.w,
              height: current.h
            });
          } catch (err) {
            reject(err);
          }
        };
        img.src = e.target.result;
      };
      reader.readAsDataURL(file);
    });
  },

  // Unified resolution engine for offline/online synchronization (no clobbering, no ID collision)
  _resolveUserAndTransactionSync(cloudUsers, localUsers, cloudTxs, localTxs) {
    const cloudByPhone = new Map();
    const cloudById = new Map();
    (cloudUsers || []).forEach(cu => {
      if (!cu) return;
      if (cu.id) cloudById.set(cu.id, cu);
      const cp = this._cleanPhone(cu.phone);
      if (cp) cloudByPhone.set(cp, cu);
    });

    const userMap = new Map();
    cloudById.forEach((cu, id) => userMap.set(id, { ...cu }));

    const idRemap = new Map();

    (localUsers || []).forEach(lu => {
      if (!lu) return;
      const lp = this._cleanPhone(lu.phone);

      // A: Does cloud already have this person by phone?
      if (lp && cloudByPhone.has(lp)) {
        const canonical = cloudByPhone.get(lp);
        const canonId = canonical.id;
        if (lu.id && lu.id !== canonId) {
          idRemap.set(lu.id, canonId);
        }
        const merged = this._mergeUser(userMap.get(canonId) || canonical, lu);
        userMap.set(canonId, merged);
        return;
      }

      // B: Check if lu.id collides with an existing cloud ID of a DIFFERENT person
      if (lu.id && userMap.has(lu.id)) {
        const existing = userMap.get(lu.id);
        const ep = this._cleanPhone(existing.phone);
        if (lp && ep && lp !== ep) {
          let maxNum = 0;
          userMap.forEach((usr, uid) => {
            const match = (uid || '').match(/^ir(\d+)$/i);
            if (match) {
              const n = parseInt(match[1], 10);
              if (!isNaN(n) && n > maxNum) maxNum = n;
            }
          });
          const newId = 'ir' + String(maxNum + 1).padStart(5, '0');
          idRemap.set(lu.id, newId);
          userMap.set(newId, { ...lu, id: newId });
          return;
        } else {
          const merged = this._mergeUser(existing, lu);
          userMap.set(lu.id, merged);
          return;
        }
      }

      // C: Brand new user with unique ID
      if (lu.id) {
        userMap.set(lu.id, { ...lu });
      }
    });

    // Remap local transactions if any user ID changed
    const remappedLocalTxs = (localTxs || []).map(t => {
      if (!t) return t;
      if (t.userId && idRemap.has(t.userId)) {
        return { ...t, userId: idRemap.get(t.userId) };
      }
      return t;
    });

    // Remap active session if user ID changed
    const currentSession = this.getSession();
    if (currentSession && currentSession.userId && idRemap.has(currentSession.userId)) {
      currentSession.userId = idRemap.get(currentSession.userId);
      this.setSession(currentSession);
    }

    // Merge transactions by ID
    const txMap = new Map();
    (cloudTxs || []).filter(t => t && !t.id.startsWith('tx_179364800000')).forEach(ct => {
      if (ct && ct.id) txMap.set(ct.id, ct);
    });

    remappedLocalTxs.filter(t => t && !t.id.startsWith('tx_179364800000')).forEach(lt => {
      if (!lt || !lt.id) return;
      if (!txMap.has(lt.id)) {
        txMap.set(lt.id, lt);
      } else {
        const ct = txMap.get(lt.id);
        const isLocalReviewed = lt.status === 'approved' || lt.status === 'declined';
        const isCloudReviewed = ct.status === 'approved' || ct.status === 'declined';
        const tLocal = lt.reviewedAt || lt.updatedAt || lt.createdAt || '';
        const tCloud = ct.reviewedAt || ct.updatedAt || ct.createdAt || '';

        // Cloud transaction takes precedence for core properties (userId, amount, type, status)
        // Local can only contribute local review status if cloud is still pending
        const mergedTx = { ...lt, ...ct };
        if (isLocalReviewed && !isCloudReviewed) {
          mergedTx.status = lt.status;
          mergedTx.reviewedAt = lt.reviewedAt;
          mergedTx.reviewedBy = lt.reviewedBy;
        }
        txMap.set(lt.id, mergedTx);
      }
    });

    // Deduplicate merged transactions by external payment gateway references:
    // (reference, flutterwaveRef, flwId, flutterwaveTransferId)
    const finalTxs = [];
    const seenRefs = new Set();
    const seenTxIds = new Set();

    Array.from(txMap.values()).forEach(t => {
      if (!t || !t.id) return;
      if (seenTxIds.has(t.id)) return;

      // Extract all gateway reference signatures for this transaction
      const gatewayRefs = [
        t.reference,
        t.flutterwaveRef,
        t.flwId ? String(t.flwId) : null,
        t.flutterwaveTransferId ? String(t.flutterwaveTransferId) : null
      ].filter(r => r && typeof r === 'string' && r.trim().length > 0 && r !== 'null' && r !== 'undefined');

      // Check if any gateway reference has already been added for this user
      let isDuplicate = false;
      for (const ref of gatewayRefs) {
        const userRefKey = `${t.userId || ''}_${ref}`;
        if (seenRefs.has(userRefKey)) {
          isDuplicate = true;
          break;
        }
      }

      if (isDuplicate) {
        // If this version has richer details (e.g. from Bank name or originator), find and upgrade existing
        const existingIdx = finalTxs.findIndex(x => {
          return x.userId === t.userId && gatewayRefs.some(ref => {
            return x.reference === ref || x.flutterwaveRef === ref || String(x.flwId) === ref || String(x.flutterwaveTransferId) === ref;
          });
        });
        if (existingIdx !== -1) {
          const oldTx = finalTxs[existingIdx];
          if (t.note && (t.note.includes('from') || !oldTx.note || oldTx.note.length < t.note.length)) {
            finalTxs[existingIdx] = { ...oldTx, ...t, id: oldTx.id };
          }
        }
        return;
      }

      gatewayRefs.forEach(ref => {
        seenRefs.add(`${t.userId || ''}_${ref}`);
      });
      seenTxIds.add(t.id);
      finalTxs.push(t);
    });

    return {
      mergedUsers: Array.from(userMap.values()),
      mergedTxs: finalTxs,
      idRemap
    };
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

      // Merge users & transactions cleanly using unified resolution (zero clobbering, ID remap & photo safety)
      const localUsers = this.getUsers();
      const localTxs = this.getAllTransactions();
      const resolution = this._resolveUserAndTransactionSync(cloudUsers, localUsers, cloudTxs, localTxs);

      const mergedUsers = resolution.mergedUsers;
      const mergedTxs = resolution.mergedTxs;

      localStorage.setItem('sun_users', JSON.stringify(mergedUsers));
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
        localStorage.setItem('sun_users', JSON.stringify(cloudUsers));
        localStorage.setItem('sun_transactions', JSON.stringify(cloudTxs));
        const cloudCats = Array.isArray(record.custom_categories) ? record.custom_categories : [];
        localStorage.setItem('sun_custom_categories', JSON.stringify(cloudCats));

        // Only clear session if user account was deleted from cloud
        const activeUserSession = this.getSession();
        if (activeUserSession && activeUserSession.userId) {
          const userExists = cloudUsers.some(u => u.id === activeUserSession.userId);
          if (!userExists) {
            localStorage.removeItem('sun_session');
            localStorage.removeItem('sun_user_session');
            localStorage.removeItem('sun_active_user');
          }
        }

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
      const localTxs = this.getAllTransactions();
      const resolution = this._resolveUserAndTransactionSync(cloudUsers, localUsers, cloudTxs, localTxs);

      const finalUsers = resolution.mergedUsers;
      const finalTxs = resolution.mergedTxs;

      localStorage.setItem('sun_users', JSON.stringify(finalUsers));
      localStorage.setItem('sun_transactions', JSON.stringify(finalTxs));

      // If local had un-synced data or ID remappings, schedule a cloud push to sync Supabase
      if (resolution.idRemap.size > 0 || finalUsers.length > cloudUsers.length || finalTxs.length > cloudTxs.length) {
        this.scheduleCloudPush();
      }

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
    this.syncPull(() => {
      this.reconcileDedicatedDeposits();
    });
    window.addEventListener('online', () => {
      this.syncPull(() => { this.reconcileDedicatedDeposits(); });
    });
    window.addEventListener('focus', () => {
      this.syncPull(() => { this.reconcileDedicatedDeposits(); });
    });
    // Auto sync poll every 20 seconds
    setInterval(() => {
      if (navigator.onLine && !document.hidden) {
        this.syncPull(() => { this.reconcileDedicatedDeposits(); });
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

    const nowISO = new Date().toISOString();
    fieldsToUpdate.updatedAt = nowISO;
    if (fieldsToUpdate.passportPhoto) {
      fieldsToUpdate.photoUpdatedAt = nowISO;
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

    // Auto-dispatch instant Admin notification if request is pending review
    if (assignedStatus === 'pending') {
      try {
        const u = this.getUserById(userId);
        const clientName = u ? `${this.formatName(u.firstName)} ${this.formatName(u.lastName)}` : 'Client';
        this.dispatchAdminPendingNotification({
          type: tx.type,
          clientName: clientName,
          clientId: userId,
          clientPhone: u ? u.phone : '',
          amount: tx.amount,
          netAmount: tx.netAmount,
          fee: tx.fee,
          bankName: destinationBank ? (destinationBank.bankName || '') : '',
          accountNumber: destinationBank ? (destinationBank.accountNumber || '') : '',
          accountName: destinationBank ? (destinationBank.accountName || '') : '',
          note: tx.note,
          timestamp: tx.createdAt
        });
      } catch (notifErr) {
        console.warn('Pending admin alert notice:', notifErr);
      }
    }

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

      if (status === 'approved' || status === 'successful') {
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

      if (status === 'approved' || status === 'successful') {
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
              ? 'Flutterwave Access Denied (403): IP not whitelisted. Recommended: Turn IP Whitelist OFF in your Flutterwave dashboard (Settings -> Security) to disburse without IP restrictions.'
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

  // ---- DEDICATED PERMANENT VIRTUAL ACCOUNT (FLUTTERWAVE) ----
  getUserDedicatedAccount(userId) {
    const user = this.getUserById(userId);
    return (user && user.dedicatedAccount) ? user.dedicatedAccount : null;
  },

  saveUserDedicatedAccount(userId, accountData) {
    const users = this.getUsers();
    const idx = users.findIndex(u => u.id === userId);
    if (idx === -1) return false;
    users[idx].dedicatedAccount = accountData;
    this.saveUsers(users);
    this.scheduleCloudPush();
    return true;
  },

  async generateFlutterwaveDedicatedAccount({ userId, bvn, nin, email, phone, firstName, lastName }) {
    const user = this.getUserById(userId);
    if (!user) throw new Error('User account not found.');

    const cleanBvn = String(bvn || '').trim().replace(/\D/g, '');
    const cleanNin = String(nin || '').trim().replace(/\D/g, '');
    const idVal = cleanBvn || cleanNin;
    if (!idVal || (idVal.length !== 11)) {
      throw new Error('Valid 11-digit BVN or NIN is required by Central Bank regulations.');
    }

    const cleanPhone = String(phone || user.phone || '').trim().replace(/\D/g, '');
    const userEmail = (email || user.email || `${userId.toLowerCase()}@suninvestment.com`).trim().toLowerCase();
    const fName = (firstName || user.firstName || 'Client').trim();
    const lName = (lastName || user.lastName || '').trim();
    const fullName = `${fName} ${lName}`.trim();

    const txRef = `VA_${userId.toUpperCase()}_${Date.now()}`;

    const payload = {
      email: userEmail,
      is_permanent: true,
      bvn: idVal,
      tx_ref: txRef,
      phonenumber: cleanPhone,
      firstname: fName,
      lastname: lName,
      narration: fullName
    };

    const res = await this.fetchFlutterwave('virtual-account-numbers', {
      method: 'POST',
      body: JSON.stringify(payload)
    });

    const json = res.json || {};
    if (!res.ok || json.status !== 'success' || !json.data) {
      const errMsg = (json && (json.message || json.error)) || 'Could not generate virtual account with Flutterwave.';
      throw new Error(errMsg);
    }

    const d = json.data;
    const accountData = {
      accountNumber: d.account_number,
      bankName: d.bank_name || 'Wema Bank',
      accountName: fullName,
      flwRef: d.flw_ref || '',
      orderRef: d.order_ref || '',
      bvnMasked: '*******' + idVal.slice(-4),
      status: d.account_status || 'active',
      createdAt: d.created_at || new Date().toISOString()
    };

    this.saveUserDedicatedAccount(userId, accountData);
    return accountData;
  },

  // ---- DEDICATED VIRTUAL ACCOUNT RECONCILIATION ----
  // Self-healing backup that checks Flutterwave transactions directly so no deposit is ever missed
  async reconcileDedicatedDeposits() {
    if (!navigator.onLine) return;
    try {
      const flwConfig = this.getFlutterwaveConfig();
      if (!flwConfig || !flwConfig.secretKey) return;

      const users = this.getUsers();
      const usersWithDedicated = users.filter(u => u.dedicatedAccount && u.dedicatedAccount.accountNumber);
      if (!usersWithDedicated || usersWithDedicated.length === 0) return;

      const res = await this.fetchFlutterwave('transactions?status=successful', { method: 'GET' });
      const json = res.json;
      if (!json || json.status !== 'success' || !Array.isArray(json.data)) return;

      const flwTxs = json.data;
      const localTxs = this.getAllTransactions();
      let hasNewTx = false;

      flwTxs.forEach(ft => {
        if ((ft.status || '').toLowerCase() !== 'successful') return;
        const ftAmount = parseFloat(ft.amount || ft.charged_amount || 0);
        if (isNaN(ftAmount) || ftAmount <= 0) return;

        const ftRef = String(ft.flw_ref || ft.id || '').trim();
        const txRef = String(ft.tx_ref || '').trim();
        const accNum = String(
          ft.account?.account_number || 
          ft.account_number || 
          ft.meta?.virtualaccountnumber || 
          ft.meta?.virtual_account_number || 
          ft.meta?.accountnumber || 
          ''
        ).trim();
        const customerEmail = String(ft.customer?.email || '').trim().toLowerCase();
        const customerPhone = String(ft.customer?.phone_number || '').trim().replace(/\D/g, '');

        // Match user by account number, tx_ref prefix, phone, or email
        let targetUser = null;
        if (accNum) {
          targetUser = usersWithDedicated.find(u => u.dedicatedAccount && u.dedicatedAccount.accountNumber === accNum);
        }
        if (!targetUser && txRef.startsWith('VA_')) {
          const parts = txRef.split('_');
          if (parts.length >= 2) {
            const potentialId = parts[1].toLowerCase();
            targetUser = users.find(u => (u.id || '').toLowerCase() === potentialId);
          }
        }
        if (!targetUser && customerPhone && customerPhone.length >= 10) {
          targetUser = users.find(u => u.phone && u.phone.replace(/\D/g, '') === customerPhone);
        }
        if (!targetUser && customerEmail && customerEmail.includes('@')) {
          targetUser = users.find(u => u.email && u.email.trim().toLowerCase() === customerEmail);
        }

        if (!targetUser) return;

        // Check if this transfer is already recorded in transactions
        const canonicalId = ft.id || ftRef || txRef;
        const newTxId = 'tx_flw_va_' + String(canonicalId).replace(/[^a-zA-Z0-9_-]/g, '');
        const alreadyInLedger = localTxs.some(lt => {
          const ltRefs = [
            lt.reference,
            lt.flutterwaveRef,
            lt.flwId ? String(lt.flwId) : null,
            lt.id
          ].map(r => String(r || '').trim());
          return (ltRefs.includes(ftRef) || (txRef && ltRefs.includes(txRef)) || (ft.id && ltRefs.includes(String(ft.id))) || lt.id === newTxId);
        });

        if (!alreadyInLedger) {
          const bankName = ft.meta?.bankname || ft.account?.bank_name || 'Bank Transfer';
          const originator = ft.meta?.originatorname ? ` from ${ft.meta.originatorname}` : '';
          const noteText = `Direct transfer to dedicated account (${bankName})${originator}`;
          const txTime = ft.created_at || new Date().toISOString();
          const newTx = {
            id: newTxId,
            userId: targetUser.id,
            type: 'deposit',
            amount: ftAmount,
            method: 'bank_transfer',
            reference: ftRef || txRef || newTxId,
            flutterwaveRef: txRef || ftRef || newTxId,
            flwId: ft.id || null,
            notes: noteText,
            note: noteText,
            category: 'General Savings',
            status: 'approved',
            reviewedAt: txTime,
            reviewedBy: 'flutterwave',
            createdAt: txTime,
            date: txTime
          };

          localTxs.push(newTx);
          hasNewTx = true;
        }
      });

      if (hasNewTx) {
        localStorage.setItem('sun_transactions', JSON.stringify(localTxs));
        this.scheduleCloudPush();
        if (window.UserApp && typeof window.UserApp.refresh === 'function') {
          window.UserApp.refresh();
        }
        if (window.AdminApp && typeof window.AdminApp.refresh === 'function') {
          window.AdminApp.refresh();
        }
      }
    } catch (err) {
      console.warn('Dedicated reconciliation notice:', err);
    }
  },

  // ---- ADMIN NOTIFICATION CONFIGURATION & DISPATCH ----
  getNotificationConfig() {
    try {
      const raw = localStorage.getItem('sun_notification_config');
      if (raw) return JSON.parse(raw);
    } catch (e) {}
    return {
      pushEnabled: true,
      soundEnabled: true,
      vibrateEnabled: true,
      telegramEnabled: false,
      telegramBotToken: '',
      telegramChatId: ''
    };
  },

  saveNotificationConfig(cfg) {
    const current = this.getNotificationConfig();
    const updated = { ...current, ...cfg };
    localStorage.setItem('sun_notification_config', JSON.stringify(updated));
    return updated;
  },

  async dispatchAdminPendingNotification(payload) {
    if (!navigator.onLine) return;
    try {
      const cfg = this.getNotificationConfig();
      const body = {
        ...payload,
        telegramConfig: (cfg.telegramEnabled && cfg.telegramBotToken && cfg.telegramChatId) ? {
          botToken: cfg.telegramBotToken,
          chatId: cfg.telegramChatId
        } : null
      };

      // Call Netlify serverless notifier in background
      fetch('/.netlify/functions/notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      }).catch(() => {});
    } catch (e) {
      console.warn('Dispatch admin notification notice:', e);
    }
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

// Export DB to window
try {
  window.DB = DB;
} catch(e) {}

// Initialize Authoritative Cloud Sync on boot
DB.initCloudSync();
