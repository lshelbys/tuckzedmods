/**
 * tuckzed mods — Sign In / Create Account page
 */

'use strict';

document.addEventListener('DOMContentLoaded', function () {

  var urlParams = new URLSearchParams(window.location.search);
  var isUpload  = urlParams.get('redirect') === 'upload';
  var redirect  = urlParams.get('redirect');

  /** Only allow same-site relative redirects (e.g. "mod.html?id=...") */
  function safeRedirectTarget() {
    if (!redirect || redirect === 'upload') return './';
    if (/^[a-z0-9_-]+\.html(\?[^#]*)?(#.*)?$/i.test(redirect)) return redirect;
    return './';
  }

  function isAdminEmail(email) {
    return !!email && email.toLowerCase() === window.TZ_AUTH.ADMIN_EMAIL.toLowerCase();
  }

  // Set while an account is being created so the auth listener does not
  // redirect before the display name has been saved.
  var registering = false;

  // ── Redirect if already signed in ──────────────────────────
  window.TZ_AUTH.onChange(function (user) {
    if (!user || registering) return;
    if (isAdminEmail(user.email)) {
      window.location.href = 'admin.html';
    } else if (isUpload) {
      window.TZ_AUTH.signOut().then(function () {
        showAuthError('signin-error', 'Access denied. Only the site admin can access the upload panel.');
      });
    } else {
      window.location.href = safeRedirectTarget();
    }
  });

  // ── Admin-only mode (no Create Account) ────────────────────
  if (isUpload) {
    document.getElementById('auth-tabs').style.display = 'none';
    document.getElementById('create-account-switch').style.display = 'none';
    document.getElementById('signin-title').textContent = 'Admin Sign In';
    document.getElementById('signin-sub').textContent   = 'Sign in with your admin credentials to access the upload panel.';
    document.getElementById('nav-signin')?.classList.remove('active');
    document.getElementById('nav-upload')?.classList.add('active');
  } else if (urlParams.get('mode') === 'register') {
    switchTab('register');
  }

  // ── Tab switching ───────────────────────────────────────────
  function switchTab(tab) {
    var isSignIn = tab === 'signin';
    document.getElementById('form-signin').classList.toggle('active', isSignIn);
    document.getElementById('form-register').classList.toggle('active', !isSignIn);
    document.getElementById('tab-signin').classList.toggle('active', isSignIn);
    document.getElementById('tab-register').classList.toggle('active', !isSignIn);
    document.getElementById('tab-signin').setAttribute('aria-selected', isSignIn);
    document.getElementById('tab-register').setAttribute('aria-selected', !isSignIn);
    clearAllErrors();
    var firstInput = document.getElementById(isSignIn ? 'si-email' : 'reg-username');
    if (firstInput) firstInput.focus();
  }

  document.getElementById('tab-signin').addEventListener('click',     function () { switchTab('signin'); });
  document.getElementById('tab-register').addEventListener('click',   function () { switchTab('register'); });
  document.getElementById('go-to-register').addEventListener('click', function () { switchTab('register'); });
  document.getElementById('go-to-signin').addEventListener('click',   function () { switchTab('signin'); });

  // ── Password toggles ────────────────────────────────────────
  function bindToggle(inputId, btnId) {
    var btn   = document.getElementById(btnId);
    var input = document.getElementById(inputId);
    btn.addEventListener('click', function () {
      var reveal = input.type === 'password';
      input.type = reveal ? 'text' : 'password';
      btn.textContent = reveal ? '🙈' : '👁';
      btn.setAttribute('aria-label', reveal ? 'Hide password' : 'Show password');
    });
  }
  bindToggle('si-password',  'si-pw-toggle');
  bindToggle('reg-password', 'reg-pw-toggle');
  bindToggle('reg-confirm',  'reg-confirm-toggle');

  // ── Error / field helpers ───────────────────────────────────
  function showAuthError(id, msg) {
    var el = document.getElementById(id);
    el.textContent = msg;
    el.classList.add('show');
  }
  function hideAuthError(id) { document.getElementById(id).classList.remove('show'); }
  function setFieldErr(id)   { var el = document.getElementById(id); if (el) el.classList.add('error'); }
  function clrFieldErr(id)   { var el = document.getElementById(id); if (el) el.classList.remove('error'); }

  function clearAllErrors() {
    ['signin-error', 'register-error'].forEach(hideAuthError);
    ['si-field-email', 'si-field-password',
     'reg-field-username', 'reg-field-email', 'reg-field-password', 'reg-field-confirm']
      .forEach(clrFieldErr);
  }

  // ── Firebase error → friendly message ──────────────────────
  function friendlyError(code) {
    var map = {
      'auth/user-not-found':          'No account found with that email.',
      'auth/wrong-password':          'Incorrect password. Please try again.',
      'auth/invalid-email':           'That email address is not valid.',
      'auth/invalid-credential':      'Incorrect email or password.',
      'auth/email-already-in-use':    'An account with this email already exists.',
      'auth/weak-password':           'Password must be at least 6 characters.',
      'auth/too-many-requests':       'Too many attempts. Please try again later.',
      'auth/network-request-failed':  'Network error. Check your connection.',
      'auth/user-disabled':           'This account has been disabled.',
      'auth/configuration-not-found': 'Firebase is not configured yet.',
    };
    return map[code] || ('Error: ' + (code || 'Something went wrong.'));
  }

  function setLoading(btnId, loading, text) {
    var btn = document.getElementById(btnId);
    btn.disabled = loading;
    btn.textContent = loading ? 'Please wait…' : text;
  }

  function isEmail(str) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(str);
  }

  // ── Forgot password ─────────────────────────────────────────
  var forgotBtn = document.getElementById('forgot-password-btn');
  if (forgotBtn) {
    forgotBtn.addEventListener('click', async function () {
      hideAuthError('signin-error');
      var current = document.getElementById('si-email').value.trim();
      var email = await window.TZ.promptDialog('Enter the email address of your account and we will send you a reset link.', {
        title: 'Reset password',
        placeholder: 'you@example.com',
        defaultValue: current,
        confirmText: 'Send Reset Link'
      });
      if (!email) return;
      if (!isEmail(email)) {
        showAuthError('signin-error', 'Please enter a valid email address.');
        return;
      }
      try {
        await firebase.auth().sendPasswordResetEmail(email.trim());
        window.TZ.showToast('📧 Reset link sent. Check your inbox.');
      } catch (err) {
        showAuthError('signin-error', friendlyError(err.code));
      }
    });
  }

  // ── SIGN IN ─────────────────────────────────────────────────
  document.getElementById('signin-form').addEventListener('submit', function (e) {
    e.preventDefault();
    hideAuthError('signin-error');
    var valid = true;

    var email = document.getElementById('si-email').value.trim();
    var pass  = document.getElementById('si-password').value;

    if (!email || !isEmail(email)) { setFieldErr('si-field-email'); valid = false; } else clrFieldErr('si-field-email');
    if (!pass) { setFieldErr('si-field-password'); valid = false; } else clrFieldErr('si-field-password');
    if (!valid) return;

    if (isUpload && !isAdminEmail(email)) {
      showAuthError('signin-error', 'Access denied. Only the site admin can sign in to the upload panel.');
      return;
    }

    setLoading('signin-submit-btn', true, 'Sign In');

    window.TZ_AUTH.signIn(email, pass)
      .then(function (cred) {
        if (isUpload && !isAdminEmail(cred.user.email)) {
          return window.TZ_AUTH.signOut().then(function () {
            showAuthError('signin-error', 'Access denied. Only the site admin can sign in to the upload panel.');
            setLoading('signin-submit-btn', false, 'Sign In');
          });
        }
        // onAuthStateChanged handles the redirect
      })
      .catch(function (err) {
        showAuthError('signin-error', friendlyError(err.code));
        setLoading('signin-submit-btn', false, 'Sign In');
      });
  });

  // ── REGISTER ────────────────────────────────────────────────
  document.getElementById('register-form').addEventListener('submit', function (e) {
    e.preventDefault();
    hideAuthError('register-error');
    document.getElementById('register-success').classList.remove('show');
    var valid = true;

    var username = document.getElementById('reg-username').value.trim();
    var email    = document.getElementById('reg-email').value.trim();
    var pass     = document.getElementById('reg-password').value;
    var confirm  = document.getElementById('reg-confirm').value;

    if (!username || username.length < 3) { setFieldErr('reg-field-username'); valid = false; } else clrFieldErr('reg-field-username');
    if (!email || !isEmail(email))        { setFieldErr('reg-field-email');    valid = false; } else clrFieldErr('reg-field-email');
    if (!pass || pass.length < 6)         { setFieldErr('reg-field-password'); valid = false; } else clrFieldErr('reg-field-password');
    if (!pass || pass !== confirm)        { setFieldErr('reg-field-confirm');  valid = false; } else clrFieldErr('reg-field-confirm');
    if (!valid) return;

    if (isAdminEmail(email)) {
      showAuthError('register-error', 'That email address is reserved.');
      return;
    }

    setLoading('register-submit-btn', true, 'Create Account');
    registering = true;

    window.TZ_AUTH.signUp(email, pass)
      .then(function (cred) {
        return cred.user.updateProfile({ displayName: username });
      })
      .then(function () {
        // Keep the public profile table in sync so comments show the chosen name
        if (window.TZ && window.TZ.Store && window.TZ.Store.updateProfile) {
          return window.TZ.Store.updateProfile({ email: email, display_name: username, avatar_url: '' }).catch(function () {});
        }
      })
      .then(function () {
        window.TZ.showToast('🎉 Welcome to tuckzed mods, ' + username + '!');
        window.location.href = safeRedirectTarget();
      })
      .catch(function (err) {
        registering = false;
        showAuthError('register-error', friendlyError(err.code));
        setLoading('register-submit-btn', false, 'Create Account');
      });
  });

});
