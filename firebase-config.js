/**
 * tuckzed mods — Firebase Configuration
 *
 * SETUP INSTRUCTIONS
 * ──────────────────────────────────────────────────────────────
 * 1. Go to https://console.firebase.google.com/
 * 2. Click "Add project" → name it (e.g. tuckzed-mods) → Continue
 * 3. Disable Google Analytics if you don't need it → Create project
 * 4. In the project console, click the </> Web icon to register a web app
 * 5. Give it a nickname (e.g. tuckzed-web) → Register app
 * 6. Copy the firebaseConfig object values below into this file
 * 7. In the left sidebar → Build → Authentication → Get started
 * 8. Enable "Email/Password" sign-in provider → Save
 * 9. Go to Authentication → Users → Add user with your admin email.
 *    Do not store the admin password in this file.
 * 10. In Authentication → Settings → Authorized domains,
 *      add tuckzed.com (and lshelbys.github.io if you still use GitHub Pages).
 * ──────────────────────────────────────────────────────────────
 */

const firebaseConfig = {
  apiKey: "AIzaSyAz837f6qqdxCdhvz7oyzol50euDWYkSp4",
  authDomain: "tuckzed-mods.firebaseapp.com",
  projectId: "tuckzed-mods",
  storageBucket: "tuckzed-mods.firebasestorage.app",
  messagingSenderId: "808701107950",
  appId: "1:808701107950:web:71fbec3ad45d0fdd165dff",
};

// The one and only admin email — changing this also requires
// updating the Firebase Authentication user record.
const ADMIN_EMAIL = 'admin@tuckzed.com';

// Initialize Firebase (compat SDK loaded via CDN in each HTML file)
firebase.initializeApp(firebaseConfig);

window.TZ_AUTH = {
  auth: firebase.auth(),
  ADMIN_EMAIL: ADMIN_EMAIL,

  /** Returns the currently signed-in Firebase user, or null */
  currentUser() { return firebase.auth().currentUser; },

  /** True if the current user is the admin */
  isAdmin() {
    const u = this.currentUser();
    return u && u.email.toLowerCase() === ADMIN_EMAIL.toLowerCase();
  },

  /** Sign in with email + password */
  async signIn(email, password) {
    return firebase.auth().signInWithEmailAndPassword(email, password);
  },

  /** Create a new account */
  async signUp(email, password) {
    return firebase.auth().createUserWithEmailAndPassword(email, password);
  },

  /** Sign out */
  async signOut() {
    return firebase.auth().signOut();
  },

  /** Listen for auth state changes */
  onChange(callback) {
    return firebase.auth().onAuthStateChanged(callback);
  },
};
