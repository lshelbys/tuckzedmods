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
 * 9. Go to Authentication → Users → Add user:
 *      Email:    admin@tuckzed.com
 *      Password: Lsk37Ti@
 * 10. In Authentication → Settings → Authorized domains,
 *      add: lshelbys.github.io
 * ──────────────────────────────────────────────────────────────
 */

const firebaseConfig = {
  apiKey:            "REPLACE_WITH_YOUR_API_KEY",
  authDomain:        "REPLACE_WITH_YOUR_PROJECT_ID.firebaseapp.com",
  projectId:         "REPLACE_WITH_YOUR_PROJECT_ID",
  storageBucket:     "REPLACE_WITH_YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "REPLACE_WITH_YOUR_MESSAGING_SENDER_ID",
  appId:             "REPLACE_WITH_YOUR_APP_ID",
};

// The one and only admin email — changing this also requires
// updating the Firebase Authentication user record.
const ADMIN_EMAIL = 'admin@tuckzed.com';

// Initialize Firebase (compat SDK loaded via CDN in each HTML file)
firebase.initializeApp(firebaseConfig);

window.TZ_AUTH = {
  auth:        firebase.auth(),
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
