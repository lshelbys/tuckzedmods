/**
 * tuckzed mods — Auth Nav Helper
 * Included on every page. Updates the shared navigation bar to reflect
 * the current Firebase auth state (signed-out / user / admin).
 */

'use strict';

(function initAuthNav() {
  const DISCORD_URL = 'https://discord.gg/5nE69arMNP';

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
    const footerAdmin = document.getElementById('footer-admin');
    const heroUpload  = document.getElementById('hero-admin-btn');

    if (!signinLink) return; // nav not present

    if (user) {
      const isAdmin = !!(user.email && window.TZ_AUTH && window.TZ_AUTH.ADMIN_EMAIL
        && user.email.toLowerCase() === window.TZ_AUTH.ADMIN_EMAIL.toLowerCase());

      // Finish pending email migrations after the user clicks the verification link
      try {
        const raw = localStorage.getItem('tz_pending_email_migrate');
        if (raw && window.TZ && window.TZ.Store && window.TZ.Store.migrateUserEmail) {
          const pending = JSON.parse(raw);
          if (pending && pending.to && user.email && user.email.toLowerCase() === String(pending.to).toLowerCase()) {
            window.TZ.Store.migrateUserEmail(pending.from, pending.to).then(ok => {
              if (ok) localStorage.removeItem('tz_pending_email_migrate');
            });
          }
        }
      } catch (_) {}

      if (isAdmin) {
        if (uploadLi) uploadLi.style.display = '';
        if (uploadLink) {
          uploadLink.href = 'admin.html';
          uploadLink.textContent = 'Upload Mods';
          uploadLink.removeAttribute('target');
          uploadLink.removeAttribute('rel');
        }
        if (heroUpload) {
          heroUpload.href = 'admin.html';
          heroUpload.textContent = 'Upload Mods';
          heroUpload.removeAttribute('target');
          heroUpload.removeAttribute('rel');
        }
        if (footerAdmin) footerAdmin.style.display = '';
      } else {
        if (uploadLi) uploadLi.style.display = 'none';
        if (heroUpload) {
          heroUpload.href = DISCORD_URL;
          heroUpload.target = '_blank';
          heroUpload.rel = 'noopener noreferrer';
          heroUpload.textContent = 'Submit a Mod';
        }
        if (footerAdmin) footerAdmin.style.display = 'none';
      }

      signinLink.style.display = 'none';
      if (userPill) userPill.style.display = '';

      if (isAdmin) {
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

      if (signoutBtn) {
        signoutBtn.onclick = async function () {
          const ok = window.TZ && window.TZ.confirmDialog
            ? await window.TZ.confirmDialog('You will be signed out of your account on this device.', { title: 'Sign out?', confirmText: 'Sign Out' })
            : confirm('Are you sure you want to sign out?');
          if (ok) {
            await window.TZ_AUTH.signOut();
            window.location.href = './';
          }
        };
      }

    } else {
      // Guests: point "Upload" at Discord — uploads are admin-curated
      if (uploadLi) uploadLi.style.display = '';
      if (uploadLink) {
        uploadLink.href = DISCORD_URL;
        uploadLink.target = '_blank';
        uploadLink.rel = 'noopener noreferrer';
        uploadLink.textContent = 'Submit a Mod';
      }
      if (heroUpload) {
        heroUpload.href = DISCORD_URL;
        heroUpload.target = '_blank';
        heroUpload.rel = 'noopener noreferrer';
        heroUpload.textContent = 'Submit a Mod';
      }
      if (signinLink) {
        // Preserve return URL when opening Sign In from a deep page
        const path = window.location.pathname.replace(/^\/+|\/+$/g, '');
        const isAuth = path === 'auth' || path === 'login';
        if (!isAuth && window.TZ && window.TZ.authRedirectUrl) {
          signinLink.href = window.TZ.authRedirectUrl();
        } else if (!isAuth) {
          const file = (path.split('/').pop() || '') || 'index';
          if (file && file !== 'index') {
            const page = file.endsWith('.html') ? file : file + '.html';
            signinLink.href = 'auth.html?redirect=' + encodeURIComponent(page + (window.location.search || ''));
          }
        }
      }
      signinLink.style.display = '';
      if (userPill) userPill.style.display = 'none';
      if (footerAdmin) footerAdmin.style.display = 'none';
    }

    updateNavHighlight();
  }

  function updateNavHighlight() {
    var rawPath = window.location.pathname.replace(/^\/+|\/+$/g, '').replace(/\.html$/, '');
    var hash    = window.location.hash || '';

    var browseLink = document.getElementById('nav-browse');
    var uploadLink = document.getElementById('nav-upload');
    var signinLink = document.getElementById('nav-signin');
    var userLabel  = document.getElementById('nav-user-label');

    if (browseLink) browseLink.classList.remove('active');
    if (uploadLink) uploadLink.classList.remove('active');
    if (signinLink) signinLink.classList.remove('active');
    if (userLabel)  userLabel.classList.remove('active');

    if (rawPath === 'admin') {
      if (userLabel)  userLabel.classList.add('active');
      if (uploadLink) uploadLink.classList.add('active');
    } else if (rawPath === 'auth' || rawPath === 'login') {
      if (signinLink) signinLink.classList.add('active');
    } else if (rawPath === 'profile') {
      if (userLabel)  userLabel.classList.add('active');
    } else if (!rawPath || rawPath === 'index') {
      if (hash === '#mods' || hash === '#games') {
        if (browseLink) browseLink.classList.add('active');
      }
    }
  }

  window.addEventListener('hashchange', updateNavHighlight);

  function attachListener() {
    updateNavHighlight();
    if (window.TZ_AUTH && window.TZ_AUTH.onChange) {
      window.TZ_AUTH.onChange(applyNavState);
    } else {
      setTimeout(attachListener, 50);
    }
  }

  function initThemeToggle() {
    if (document.getElementById('theme-toggle-btn')) return;
    const navLinks = document.querySelector('.nav__links');
    if (!navLinks) return;
    const li = document.createElement('li');
    const btn = document.createElement('button');
    btn.id = 'theme-toggle-btn';
    btn.type = 'button';
    btn.className = 'theme-toggle';

    function syncThemeColor() {
      const meta = document.querySelector('meta[name="theme-color"]');
      if (!meta) return;
      const dark = document.documentElement.getAttribute('data-theme') === 'dark';
      meta.setAttribute('content', dark ? '#111111' : '#000000');
    }

    function updateIcon() {
      const dark = document.documentElement.getAttribute('data-theme') === 'dark';
      btn.textContent = dark ? '☀️' : '🌙';
      btn.setAttribute('aria-label', dark ? 'Switch to light mode' : 'Switch to dark mode');
      btn.title = dark ? 'Switch to light mode' : 'Switch to dark mode';
      syncThemeColor();
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

  function initMobileNav() {
    const nav = document.querySelector('.nav');
    const inner = document.querySelector('.nav__inner');
    const links = document.querySelector('.nav__links');
    if (!nav || !inner || !links || document.getElementById('nav-menu-btn')) return;

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.id = 'nav-menu-btn';
    btn.className = 'nav__menu-btn';
    btn.setAttribute('aria-expanded', 'false');
    btn.setAttribute('aria-controls', 'nav-links');
    btn.setAttribute('aria-label', 'Open menu');
    btn.innerHTML = '<span class="nav__menu-icon" aria-hidden="true"></span>';

    if (!links.id) links.id = 'nav-links';
    inner.insertBefore(btn, links);

    function setOpen(open) {
      nav.classList.toggle('nav--open', open);
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
      btn.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
      document.body.classList.toggle('nav-open', open);
    }

    btn.addEventListener('click', () => setOpen(!nav.classList.contains('nav--open')));

    links.addEventListener('click', e => {
      if (e.target.closest('a, button')) setOpen(false);
    });

    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && nav.classList.contains('nav--open')) setOpen(false);
    });

    window.addEventListener('resize', () => {
      if (window.innerWidth > 768 && nav.classList.contains('nav--open')) setOpen(false);
    });
  }

  function initNavScroll() {
    const nav = document.querySelector('.nav');
    if (!nav) return;
    let ticking = false;
    function update() {
      ticking = false;
      nav.classList.toggle('nav--scrolled', window.scrollY > 8);
    }
    window.addEventListener('scroll', () => {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(update);
      }
    }, { passive: true });
    update();
  }

  function fillYear() {
    document.querySelectorAll('[data-year]').forEach(el => { el.textContent = new Date().getFullYear(); });
  }

  function markPageReady() {
    document.body.classList.add('is-ready');
  }

  function boot() {
    attachListener();
    initThemeToggle();
    initMobileNav();
    initNavScroll();
    fillYear();
    markPageReady();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  if (window.TZ_AUTH) {
    window.TZ_AUTH.applyNavState = applyNavState;
  } else {
    setTimeout(() => { if (window.TZ_AUTH) window.TZ_AUTH.applyNavState = applyNavState; }, 500);
  }

})();
