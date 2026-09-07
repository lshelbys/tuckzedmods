/**
 * tuckzed mods — Profile page
 * Avatar / display name, email change and password change for regular users.
 */

'use strict';

document.addEventListener('DOMContentLoaded', function () {

  var auth = window.TZ_AUTH;
  var avatarFile = null;
  var avatarPreviewUrl = null;

  // ── Auth guard: must be a signed-in, non-admin user ────────
  auth.onChange(function (user) {
    if (!user) {
      window.location.href = 'auth.html?redirect=profile.html';
      return;
    }
    if (user.email.toLowerCase() === auth.ADMIN_EMAIL.toLowerCase()) {
      window.location.href = 'admin.html';
      return;
    }
    document.getElementById('profile-loading').style.display = 'none';
    var page = document.querySelector('.profile-page');
    if (page) page.style.display = '';
    populateSidebar(user);
    prefillForms(user);
    loadLikedMods(user.email);
    maybeMigrateEmail(user);
  });

  async function maybeMigrateEmail(user) {
    try {
      var raw = localStorage.getItem('tz_pending_email_migrate');
      if (!raw || !window.TZ.Store.migrateUserEmail) return;
      var pending = JSON.parse(raw);
      if (!pending || !pending.from || !pending.to) return;
      if ((user.email || '').toLowerCase() !== String(pending.to).toLowerCase()) return;
      await window.TZ.Store.migrateUserEmail(pending.from, pending.to);
      localStorage.removeItem('tz_pending_email_migrate');
      window.TZ.showToast('Your likes and profile were moved to the new email.');
    } catch (_) {}
  }

  async function loadLikedMods(email) {
    var wrap = document.getElementById('liked-mods-list');
    if (!wrap || !window.TZ.Store.getLikedMods) return;
    wrap.innerHTML = '<p class="form-hint">Loading liked mods…</p>';
    var mods = await window.TZ.Store.getLikedMods(email);
    if (!mods.length) {
      wrap.innerHTML = '<p class="form-hint">You haven’t liked any mods yet. Heart one on a mod page and it’ll show up here.</p>';
      return;
    }
    var escapeHtml = window.TZ.escapeHtml;
    wrap.innerHTML = '<ul class="liked-mods">' + mods.map(function (m) {
      return '<li class="liked-mods__item"><a class="liked-mods__link" href="mod.html?id=' + encodeURIComponent(m.id) + '">' +
        '<span class="liked-mods__title">' + escapeHtml(m.title) + '</span>' +
        '<span class="liked-mods__meta">' + escapeHtml(m.category) + ' · v' + escapeHtml(m.version) + '</span>' +
        '</a></li>';
    }).join('') + '</ul>';
  }

  // ── Sidebar ────────────────────────────────────────────────
  function populateSidebar(user) {
    var name   = user.displayName || user.email.split('@')[0];
    var avatarEl = document.getElementById('profile-avatar');

    if (user.photoURL) {
      avatarEl.innerHTML = '<img src="' + window.TZ.escapeHtml(user.photoURL) + '" alt="" />';
    } else {
      avatarEl.textContent = name.charAt(0).toUpperCase();
    }

    document.getElementById('sidebar-name').textContent  = name;
    document.getElementById('sidebar-email').textContent = user.email;

    var created = user.metadata && user.metadata.creationTime ? window.TZ.formatDate(user.metadata.creationTime) : '';
    document.getElementById('sidebar-joined').textContent = created ? 'Member since ' + created : '';
  }

  function prefillForms(user) {
    document.getElementById('f-username').value  = user.displayName || user.email.split('@')[0] || '';
    document.getElementById('f-new-email').value = user.email || '';
    if (user.photoURL) {
      var img = document.getElementById('avatar-preview');
      img.src = user.photoURL;
      img.style.display = 'block';
      document.getElementById('avatar-placeholder').style.display = 'none';
    } else {
      document.getElementById('avatar-placeholder').textContent = (user.displayName || user.email).charAt(0).toUpperCase();
    }
  }

  // ── Password toggles ───────────────────────────────────────
  function bindToggle(inputId, btnId) {
    var btn = document.getElementById(btnId);
    var inp = document.getElementById(inputId);
    btn.addEventListener('click', function () {
      var reveal = inp.type === 'password';
      inp.type = reveal ? 'text' : 'password';
      btn.textContent = reveal ? '🙈' : '👁';
      btn.setAttribute('aria-label', reveal ? 'Hide password' : 'Show password');
    });
  }
  bindToggle('f-email-pass', 'tog-email-pass');
  bindToggle('f-cur-pass',   'tog-cur-pass');
  bindToggle('f-new-pass',   'tog-new-pass');
  bindToggle('f-conf-pass',  'tog-conf-pass');

  // ── Helpers ────────────────────────────────────────────────
  function setErr(id)  { document.getElementById(id).classList.add('error'); }
  function clrErr(id)  { document.getElementById(id).classList.remove('error'); }
  function isEmail(s)  { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s); }

  function showStatus(id, msg, type) {
    var el = document.getElementById(id);
    el.textContent = msg;
    el.className   = 'profile-status show profile-status--' + type;
    clearTimeout(el._hideTimer);
    el._hideTimer = setTimeout(function () { el.classList.remove('show'); }, 5000);
  }

  function setLoading(btnId, loading, label) {
    var btn = document.getElementById(btnId);
    btn.disabled    = loading;
    btn.textContent = loading ? 'Saving…' : label;
  }

  function friendlyErr(code) {
    var map = {
      'auth/wrong-password':          'Current password is incorrect.',
      'auth/invalid-credential':      'Current password is incorrect.',
      'auth/email-already-in-use':    'That email is already in use.',
      'auth/invalid-email':           'Please enter a valid email.',
      'auth/requires-recent-login':   'Please sign out and sign back in, then try again.',
      'auth/weak-password':           'Password must be at least 6 characters.',
      'auth/too-many-requests':       'Too many attempts. Please try again later.',
      'auth/network-request-failed':  'Network error. Check your connection.',
      'auth/operation-not-allowed':   'This action is not enabled for your account.',
    };
    return map[code] || 'Something went wrong. Please try again.';
  }

  function reauth(currentPassword) {
    var user       = firebase.auth().currentUser;
    var credential = firebase.auth.EmailAuthProvider.credential(user.email, currentPassword);
    return user.reauthenticateWithCredential(credential);
  }

  // ── Avatar preview & compression ───────────────────────────
  document.getElementById('f-avatar').addEventListener('change', function (e) {
    var file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    if (!String(file.type || '').startsWith('image/')) {
      window.TZ.showToast('Please pick an image file for your avatar.');
      return;
    }

    var img = new Image();
    var objUrl = URL.createObjectURL(file);
    img.onerror = function () {
      URL.revokeObjectURL(objUrl);
      window.TZ.showToast('That file could not be used as an avatar. Please pick an image.');
    };
    img.onload = function () {
      var SIZE = 256;
      var canvas = document.createElement('canvas');
      canvas.width = SIZE;
      canvas.height = SIZE;
      var ctx = canvas.getContext('2d');
      // Centre-crop to a square so the avatar never looks squashed
      var side = Math.min(img.width, img.height);
      var sx = (img.width - side) / 2;
      var sy = (img.height - side) / 2;
      ctx.drawImage(img, sx, sy, side, side, 0, 0, SIZE, SIZE);
      canvas.toBlob(function (blob) {
        URL.revokeObjectURL(objUrl);
        avatarFile = blob
          ? new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' })
          : file;
        if (avatarPreviewUrl) URL.revokeObjectURL(avatarPreviewUrl);
        avatarPreviewUrl = URL.createObjectURL(avatarFile);
        var imgEl = document.getElementById('avatar-preview');
        imgEl.src = avatarPreviewUrl;
        imgEl.style.display = 'block';
        document.getElementById('avatar-placeholder').style.display = 'none';
        window.TZ.showToast('Avatar ready — click "Save Profile" to apply it.');
      }, 'image/jpeg', 0.85);
    };
    img.src = objUrl;
  });

  // ── 1. Profile form ────────────────────────────────────────
  document.getElementById('form-profile').addEventListener('submit', async function (e) {
    e.preventDefault();
    var user = firebase.auth().currentUser;
    if (!user) return;
    var username = document.getElementById('f-username').value.trim();
    if (username.length < 3) {
      setErr('field-username');
      return;
    }
    clrErr('field-username');

    setLoading('btn-profile', true, 'Save Profile');
    try {
      var avatarUrl = null;
      if (avatarFile) avatarUrl = await window.TZ.Store.uploadAvatar(avatarFile, user.photoURL || '');
      var newPhotoURL = avatarUrl || user.photoURL || null;

      await user.updateProfile({ displayName: username, photoURL: newPhotoURL });
      if (window.TZ.Store.updateProfile) {
        await window.TZ.Store.updateProfile({ email: user.email, display_name: username, avatar_url: newPhotoURL || '' });
      }

      avatarFile = null;
      showStatus('status-profile', '✓ Profile updated!', 'success');
      window.TZ.showToast('Profile updated!');
      populateSidebar(user);
      if (auth.applyNavState) auth.applyNavState(user);
    } catch (err) {
      console.error(err);
      showStatus('status-profile', 'Failed to update profile: ' + (err.message || 'unknown error'), 'error');
    }
    setLoading('btn-profile', false, 'Save Profile');
  });

  // ── 2. Email form ──────────────────────────────────────────
  document.getElementById('form-email').addEventListener('submit', function (e) {
    e.preventDefault();
    var user     = firebase.auth().currentUser;
    var newEmail = document.getElementById('f-new-email').value.trim();
    var curPass  = document.getElementById('f-email-pass').value;
    var valid    = true;

    if (!newEmail || !isEmail(newEmail)) { setErr('field-new-email'); valid = false; } else clrErr('field-new-email');
    if (!curPass) { setErr('field-email-pass'); valid = false; } else clrErr('field-email-pass');
    if (!valid) return;

    if (user && newEmail.toLowerCase() === (user.email || '').toLowerCase()) {
      showStatus('status-email', 'That is already your email address.', 'error');
      return;
    }

    setLoading('btn-email', true, 'Update Email');

    reauth(curPass)
      .then(function () {
        var u = firebase.auth().currentUser;
        if (typeof u.verifyBeforeUpdateEmail === 'function') return u.verifyBeforeUpdateEmail(newEmail);
        return u.updateEmail(newEmail);
      })
      .then(function () {
        try {
          localStorage.setItem('tz_pending_email_migrate', JSON.stringify({
            from: user.email,
            to: newEmail
          }));
        } catch (_) {}
        showStatus('status-email', '✓ Verification link sent to ' + newEmail, 'success');
        window.TZ.showToast('Check ' + newEmail + ' and click the link to finish changing your email.');
        document.getElementById('f-email-pass').value = '';
        var note = document.getElementById('email-pending-note');
        if (note) {
          note.textContent = 'Your email will change to ' + newEmail + ' once you click the verification link we just sent. Until then you can keep signing in with your current email.';
          note.style.display = '';
        }
      })
      .catch(function (err) {
        showStatus('status-email', friendlyErr(err.code), 'error');
      })
      .finally(function () {
        setLoading('btn-email', false, 'Update Email');
      });
  });

  // ── 3. Password form ───────────────────────────────────────
  document.getElementById('form-password').addEventListener('submit', function (e) {
    e.preventDefault();
    var curPass  = document.getElementById('f-cur-pass').value;
    var newPass  = document.getElementById('f-new-pass').value;
    var confPass = document.getElementById('f-conf-pass').value;
    var valid    = true;

    if (!curPass) { setErr('field-cur-pass'); valid = false; } else clrErr('field-cur-pass');
    if (!newPass || newPass.length < 6) { setErr('field-new-pass'); valid = false; } else clrErr('field-new-pass');
    if (newPass !== confPass) { setErr('field-conf-pass'); valid = false; } else clrErr('field-conf-pass');
    if (!valid) return;

    if (curPass === newPass) {
      showStatus('status-password', 'New password must be different from the current one.', 'error');
      return;
    }

    setLoading('btn-password', true, 'Change Password');

    reauth(curPass)
      .then(function () { return firebase.auth().currentUser.updatePassword(newPass); })
      .then(function () {
        showStatus('status-password', '✓ Password changed!', 'success');
        window.TZ.showToast('Password changed successfully!');
        document.getElementById('form-password').reset();
      })
      .catch(function (err) {
        showStatus('status-password', friendlyErr(err.code), 'error');
      })
      .finally(function () {
        setLoading('btn-password', false, 'Change Password');
      });
  });

  // ── 4. Delete account ──────────────────────────────────────
  var deleteBtn = document.getElementById('btn-delete-account');
  if (deleteBtn) {
    deleteBtn.addEventListener('click', async function () {
      var password = await window.TZ.promptDialog('This permanently deletes your tuckzed mods account. Enter your password to confirm.', {
        title: 'Delete account?',
        placeholder: 'Your current password',
        confirmText: 'Delete My Account',
        type: 'password'
      });
      if (!password) return;
      var typed = await window.TZ.confirmDialog('Are you absolutely sure? This cannot be undone.', { title: 'Last chance', confirmText: 'Yes, delete it', danger: true });
      if (!typed) return;

      deleteBtn.disabled = true;
      try {
        await reauth(password);
        var email = firebase.auth().currentUser.email;
        if (window.TZ.Store.deleteAccountData) {
          await window.TZ.Store.deleteAccountData(email);
        }
        await firebase.auth().currentUser.delete();
        window.TZ.showToast('Your account has been deleted.');
        window.location.href = './';
      } catch (err) {
        deleteBtn.disabled = false;
        showStatus('status-delete', friendlyErr(err.code), 'error');
      }
    });
  }

});
