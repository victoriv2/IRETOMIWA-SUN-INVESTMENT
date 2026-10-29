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

  const hashToDestination = {
    '#admin':       'admin',
    '#admin-login': 'adminLogin',
    '#user':        'user',
    '#login':       'login',
    '#signup':      'signup',
  };

  const destinationToHash = {
    'admin':      '#admin',
    'adminLogin': '#admin-login',
    'user':       '#user',
    'login':      '#login',
    'signup':     '#signup',
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

    try {
      const htmlEl = document.documentElement;
      htmlEl.classList.remove('is-user-logged-in', 'is-admin-logged-in', 'is-admin-login', 'is-user-login');

      if (name === 'user') {
        htmlEl.classList.add('is-user-logged-in');
      } else if (name === 'admin') {
        htmlEl.classList.add('is-admin-logged-in');
      } else if (name === 'adminLogin') {
        htmlEl.classList.add('is-admin-login');
      } else {
        htmlEl.classList.add('is-user-login');
      }
    } catch(e) {}
  }

  function updateUrlState(destination) {
    const targetHash = destinationToHash[destination] || '#login';
    const activePortal = (destination === 'admin' || destination === 'adminLogin') ? 'admin' : 'user';

    try {
      localStorage.setItem('sun_active_portal', activePortal);
    } catch(e) {}

    try {
      if (window.history && window.history.replaceState) {
        // Strip out any stale ?view=admin query params and set clean hash
        window.history.replaceState(null, '', window.location.pathname + targetHash);
      } else {
        window.location.hash = targetHash;
      }
    } catch(e) {}
  }

  function navigate(destination) {
    if (destination === 'admin') {
      const adminSession = DB.getAdminSession();
      if (adminSession) {
        updateUrlState('admin');
        showPage('admin');
        if (window.AdminApp) {
          AdminApp.showView('dashboard');
        }
      } else {
        updateUrlState('adminLogin');
        showPage('adminLogin');
        if (window.AdminApp) {
          AdminApp.showView('login');
        }
      }
      return;
    }

    if (destination === 'adminLogin') {
      updateUrlState('adminLogin');
      showPage('adminLogin');
      if (window.AdminApp) {
        AdminApp.showView('login');
      }
      return;
    }

    if (destination === 'user') {
      const session = DB.getSession();
      if (session && session.userId) {
        const user = DB.getUserById(session.userId);
        if (user) {
          updateUrlState('user');
          showPage('user');
          UserApp.load(session.userId);
          return;
        } else {
          DB.clearSession();
        }
      }
      // If user session is not found or invalid, route to login
      updateUrlState('login');
      showPage('login');
      return;
    }

    updateUrlState(destination);
    showPage(destination);
  }

  function init() {
    if (!initialized) {
      Auth.init();
      UserApp.initOnce();
      if (window.AdminApp) {
        AdminApp.initOnce(true);
      }

      // Listen for browser back/forward buttons
      window.addEventListener('hashchange', () => {
        const currentHash = window.location.hash;
        const target = hashToDestination[currentHash];
        if (target) {
          navigate(target);
        }
      });

      initialized = true;
    }

    // Seed admin account (ensure it exists)
    DB.getAdmin();

    const currentHash  = window.location.hash;
    const urlParams    = new URLSearchParams(window.location.search);
    const viewParam    = urlParams.get('view');
    const adminSession = DB.getAdminSession();
    const userSession  = DB.getSession();
    let savedPortal    = null;

    try {
      savedPortal = localStorage.getItem('sun_active_portal');
    } catch(e) {}

    // 1. Explicit URL Hash priority
    if (currentHash === '#admin') {
      if (adminSession) { navigate('admin'); return; }
      else { navigate('adminLogin'); return; }
    }
    if (currentHash === '#admin-login') {
      navigate('adminLogin');
      return;
    }
    if (currentHash === '#user') {
      if (userSession && userSession.userId && DB.getUserById(userSession.userId)) {
        navigate('user');
        return;
      } else {
        navigate('login');
        return;
      }
    }
    if (currentHash === '#signup') {
      navigate('signup');
      return;
    }
    if (currentHash === '#login') {
      navigate('login');
      return;
    }

    // 2. Explicit query param priority (e.g. from admin/index.html forwarding)
    if (viewParam === 'admin') {
      if (adminSession) { navigate('admin'); return; }
      else { navigate('adminLogin'); return; }
    }
    if (viewParam === 'user') {
      if (userSession && userSession.userId && DB.getUserById(userSession.userId)) {
        navigate('user');
        return;
      } else {
        navigate('login');
        return;
      }
    }

    // 3. Root URL (https://iretomiwa-sun-investment.netlify.app/)
    // ALWAYS targets the User Portal by default!
    if (userSession && userSession.userId && DB.getUserById(userSession.userId)) {
      navigate('user');
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
