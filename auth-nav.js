/**
 * tuckzed mods — Auth Nav Helper
 * Included on every page. Updates the shared navigation bar to reflect
 * the current Firebase auth state (signed-out / user / admin).
 */

'use strict';

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
      const isAdmin = !!(user.email && window.TZ_AUTH && window.TZ_AUTH.ADMIN_EMAIL
        && user.email.toLowerCase() === window.TZ_AUTH.ADMIN_EMAIL.toLowerCase());

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
            window.location.href = 'admin.html';
          };
          userLabel.onkeydown = function (e) {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              window.location.href = 'admin.html';
            }
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
            avatarHtml = `<img src="${escapedUrl}" alt="" class="nav__avatar" />`;
          }
          userLabel.innerHTML  = `${avatarHtml}<span class="nav__user-name">${escapedName}</span>`;
          userLabel.style.cursor = 'pointer';
          userLabel.title        = 'My Profile';
          userLabel.setAttribute('role', 'button');
          userLabel.setAttribute('tabindex', '0');
          userLabel.onclick = function () {
            window.location.href = 'profile.html';
          };
          userLabel.onkeydown = function (e) {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              window.location.href = 'profile.html';
            }
          };
        }
      }

      // Sign Out handler
      if (signoutBtn) {
        signoutBtn.onclick = async function () {
          const ok = window.TZ && window.TZ.confirmDialog
            ? await window.TZ.confirmDialog('You will be signed out of your account on this device.', { title: 'Sign out?', confirmText: 'Sign Out' })
            : confirm('Are you sure you want to sign out?');
          if (ok) {
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
      if (uploadLink) uploadLink.href = 'auth.html?redirect=upload';
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
    if (document.getElementById('theme-toggle-btn')) return;
    const navLinks = document.querySelector('.nav__links');
    if (!navLinks) return;
    const li = document.createElement('li');
    const btn = document.createElement('button');
    btn.id = 'theme-toggle-btn';
    btn.type = 'button';
    btn.className = 'theme-toggle';

    function updateIcon() {
      const dark = document.documentElement.getAttribute('data-theme') === 'dark';
      btn.textContent = dark ? '☀️' : '🌙';
      btn.setAttribute('aria-label', dark ? 'Switch to light mode' : 'Switch to dark mode');
      btn.title = dark ? 'Switch to light mode' : 'Switch to dark mode';
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
  
  // Keep the footer copyright year current without editing every page
  function fillYear() {
    document.querySelectorAll('[data-year]').forEach(el => { el.textContent = new Date().getFullYear(); });
  }

  function boot() {
    attachListener();
    initThemeToggle();
    fillYear();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  // Expose so profile page can force an update
  if (window.TZ_AUTH) {
    window.TZ_AUTH.applyNavState = applyNavState;
  } else {
    setTimeout(() => { if (window.TZ_AUTH) window.TZ_AUTH.applyNavState = applyNavState; }, 500);
  }

})();
