/**
 * tuckzed mods — Auth Nav Helper
 * Included on every page. Updates the shared navigation bar to reflect
 * the current Firebase auth state (signed-out / user / admin).
 */

'use strict';

// ── Clean URLs (strip .html from address bar) ───────────────
(function cleanUrl() {
  try {
    var path = window.location.pathname;
    if (path.endsWith('.html')) {
      var clean = path.replace(/\.html$/, '');
      if (clean.endsWith('/index')) clean = clean.slice(0, -6) || '/';
      window.history.replaceState(null, '', clean + window.location.search + window.location.hash);
    }
  } catch (_) {}
})();

(function initAuthNav() {

  /**
   * Called by onAuthStateChanged — updates the nav to reflect auth state.
   * @param {firebase.User|null} user
   */
  function applyNavState(user) {
    const uploadLink  = document.getElementById('nav-upload');
    const uploadLi    = uploadLink ? uploadLink.parentElement : null;
    const signinLink  = document.getElementById('nav-signin');
    const userPill    = document.getElementById('nav-user-pill');
    const userLabel   = document.getElementById('nav-user-label');
    const signoutBtn  = document.getElementById('nav-signout-btn');

    if (!signinLink) return; // nav not present

    if (user) {
      // ── Signed in ─────────────────────────────────────────────
      const isAdmin = user.email.toLowerCase() === window.TZ_AUTH.ADMIN_EMAIL.toLowerCase();

      // Always hide "Upload Mods" when signed in
      if (uploadLi) uploadLi.style.display = 'none';

      // Hide "Sign In" link
      signinLink.style.display = 'none';

      // Show user pill
      if (userPill) userPill.style.display = '';

      if (isAdmin) {
        // Admin: make the label a clickable link back to the admin panel
        if (userLabel) {
          userLabel.textContent  = '⚡ Admin';
          userLabel.style.cursor = 'pointer';
          userLabel.title        = 'Go to Admin Panel';
          userLabel.setAttribute('role', 'button');
          userLabel.setAttribute('tabindex', '0');
          userLabel.onclick = function () {
            window.location.href = 'admin';
          };
          userLabel.onkeydown = function (e) {
            if (e.key === 'Enter' || e.key === ' ') window.location.href = 'admin';
          };
        }
      } else {
        // Regular user: label links to their profile page
        if (userLabel) {
          const name = user.displayName || user.email.split('@')[0];
          const escapedName = window.TZ ? window.TZ.escapeHtml(name) : name;
          let avatarHtml = '';
          if (user.photoURL) {
            const escapedUrl = window.TZ ? window.TZ.escapeHtml(user.photoURL) : user.photoURL;
            avatarHtml = `<img src="${escapedUrl}" style="width:24px;height:24px;border-radius:50%;object-fit:cover;vertical-align:middle;margin-right:6px; display:inline-block;" />`;
          }
          userLabel.innerHTML  = `${avatarHtml}<span style="vertical-align:middle;">${escapedName}</span>`;
          userLabel.style.cursor = 'pointer';
          userLabel.title        = 'My Profile';
          userLabel.setAttribute('role', 'button');
          userLabel.setAttribute('tabindex', '0');
          userLabel.onclick = function () {
            window.location.href = 'profile';
          };
          userLabel.onkeydown = function (e) {
            if (e.key === 'Enter' || e.key === ' ') window.location.href = 'profile';
          };
        }
      }

      // Sign Out handler
      if (signoutBtn) {
        signoutBtn.onclick = async function () {
          if (confirm('Are you sure you want to sign out?')) {
            await window.TZ_AUTH.signOut();
            // Always redirect to homepage on sign-out
            window.location.href = './';
          }
        };
      }

    } else {
      // ── Signed out ────────────────────────────────────────────
      // Show "Upload Mods" and "Sign In" links
      if (uploadLi) uploadLi.style.display = '';
      if (uploadLink) uploadLink.href = 'auth?redirect=upload';
      signinLink.style.display = '';
      if (userPill) userPill.style.display = 'none';
    }

    updateNavHighlight();
  }

  /**
   * Highlights the nav button corresponding to the current page
   */
  function updateNavHighlight() {
    var rawPath = window.location.pathname.replace(/^\/+|\/+$/g, '').replace(/\.html$/, '');
    var search  = window.location.search || '';
    var hash    = window.location.hash || '';
    var isUpload = search.indexOf('redirect=upload') !== -1;

    var browseLink = document.getElementById('nav-browse');
    var uploadLink = document.getElementById('nav-upload');
    var signinLink = document.getElementById('nav-signin');
    var userLabel  = document.getElementById('nav-user-label');

    // Clear all active states first
    if (browseLink) browseLink.classList.remove('active');
    if (uploadLink) uploadLink.classList.remove('active');
    if (signinLink) signinLink.classList.remove('active');
    if (userLabel)  userLabel.classList.remove('active');

    if (rawPath === 'admin') {
      if (userLabel)  userLabel.classList.add('active');
      if (uploadLink) uploadLink.classList.add('active');
    } else if (isUpload) {
      if (uploadLink) uploadLink.classList.add('active');
    } else if (rawPath === 'auth' || rawPath === 'login') {
      if (signinLink) signinLink.classList.add('active');
    } else if (rawPath === 'profile') {
      if (userLabel)  userLabel.classList.add('active');
    } else if (!rawPath || rawPath === 'index') {
      if (hash === '#mods') {
        if (browseLink) browseLink.classList.add('active');
      }
    }
  }

  // Listen for hash changes (e.g. clicking Browse)
  window.addEventListener('hashchange', updateNavHighlight);

  // Wait for Firebase to load, then attach the listener
  function attachListener() {
    updateNavHighlight();
    if (window.TZ_AUTH && window.TZ_AUTH.onChange) {
      window.TZ_AUTH.onChange(applyNavState);
    } else {
      setTimeout(attachListener, 50);
    }
  }

  // ── Inject Dark Mode Toggle ───────────────────────────────
  function initThemeToggle() {
    const navLinks = document.querySelector('.nav__links');
    if (!navLinks) return;
    const li = document.createElement('li');
    const btn = document.createElement('button');
    btn.className = 'btn btn--sm';
    btn.style.cssText = 'padding:4px 8px; font-size:1.2rem; background:transparent; border:none; box-shadow:none; cursor:pointer; margin-left: 8px;';
    
    function updateIcon() {
      btn.textContent = document.documentElement.getAttribute('data-theme') === 'dark' ? '☀️' : '🌙';
    }
    updateIcon();
    
    btn.onclick = () => {
      const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
      if (isDark) {
        document.documentElement.removeAttribute('data-theme');
        localStorage.setItem('theme', 'light');
      } else {
        document.documentElement.setAttribute('data-theme', 'dark');
        localStorage.setItem('theme', 'dark');
      }
      updateIcon();
    };
    
    li.appendChild(btn);
    navLinks.appendChild(li);
  }
  
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { attachListener(); initThemeToggle(); });
  } else {
    attachListener();
    initThemeToggle();
  }

  // Expose so profile page can force an update
  if (window.TZ_AUTH) {
    window.TZ_AUTH.applyNavState = applyNavState;
  } else {
    setTimeout(() => { if (window.TZ_AUTH) window.TZ_AUTH.applyNavState = applyNavState; }, 500);
  }

})();
