// ============================================
// APP.JS - App Router & Initializer
// ============================================

const App = (() => {
  const pages = {
    signup:     'page-signup',
    login:      'page-login',
    user:       'page-user',
    admin:      'page-admin',
    adminLogin: 'page-admin-login',
  };

  let initialized = false;

  function showPage(name) {
    Object.values(pages).forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        el.classList.remove('active');
        el.style.display = 'none';
      }
    });
    const target = document.getElementById(pages[name]);
    if (target) {
      target.classList.add('active');
      target.style.display = 'flex';
    }

    if (name === 'user') {
      try { document.documentElement.classList.add('is-user-logged-in'); } catch(e) {}
    } else {
      try { document.documentElement.classList.remove('is-user-logged-in'); } catch(e) {}
    }

    if (name === 'admin') {
      try { document.documentElement.classList.add('is-admin-logged-in'); } catch(e) {}
    } else {
      try { document.documentElement.classList.remove('is-admin-logged-in'); } catch(e) {}
    }
  }

  function navigate(destination) {
    if (destination === 'admin') {
      const adminSession = DB.getAdminSession();
      if (adminSession) {
        showPage('admin');
        if (window.AdminApp) {
          AdminApp.showView('dashboard');
        }
      } else {
        showPage('adminLogin');
        if (window.AdminApp) {
          AdminApp.showView('login');
        }
      }
      return;
    }

    if (destination === 'adminLogin') {
      showPage('adminLogin');
      if (window.AdminApp) {
        AdminApp.showView('login');
      }
      return;
    }

    showPage(destination);

    if (destination === 'user') {
      const session = DB.getSession();
      if (session && session.userId) {
        UserApp.load(session.userId);
      } else {
        showPage('login');
      }
    }
  }

  function init() {
    if (!initialized) {
      Auth.init();
      UserApp.initOnce();
      if (window.AdminApp) {
        AdminApp.initOnce(true);
      }
      initialized = true;
    }

    // Seed admin account (ensure it exists)
    DB.getAdmin();

    const urlParams = new URLSearchParams(window.location.search);
    const viewParam = urlParams.get('view');
    const adminSession = DB.getAdminSession();
    const userSession  = DB.getSession();

    // 1. Explicit view parameter
    if (viewParam === 'admin') {
      navigate('admin');
      return;
    }

    // 2. Active user session takes priority on root URL
    if (userSession && userSession.userId) {
      const user = DB.getUserById(userSession.userId);
      if (user) {
        navigate('user');
        return;
      } else {
        DB.clearSession();
      }
    }

    // 3. Active admin session on root URL
    if (adminSession && urlParams.get('preview') !== 'user') {
      navigate('admin');
      return;
    }

    navigate('login');
  }

  return { navigate, init, showPage };
})();

// Reliable boot on DOM ready or immediately if already loaded
(() => {
  let booted = false;
  function bootApp() {
    if (booted) return;
    booted = true;
    App.init();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootApp);
  } else {
    bootApp();
  }
})();
