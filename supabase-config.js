/**
 * tuckzed mods — Supabase Configuration & Client
 */

'use strict';

const SUPABASE_URL = 'https://efaopxcoqhmszgzxgiom.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVmYW9weGNvcWhtc3pnenhnaW9tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg2MjIwMTcsImV4cCI6MjEwNDE5ODAxN30.ScPWO57Sef7EQJWmZIQPnPTquy-73l3eg8C0Gg66r6w';

// Initialize the Supabase client
let supabaseClient = null;
if (typeof supabase !== 'undefined' && supabase.createClient) {
  supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

window.TZ_SUPABASE = {
  url: SUPABASE_URL,
  key: SUPABASE_ANON_KEY,
  client: supabaseClient,
  isConfigured: function () {
    return !!(supabaseClient || (typeof supabase !== 'undefined' && supabase.createClient));
  },
  getClient: function () {
    if (!supabaseClient && typeof supabase !== 'undefined' && supabase.createClient) {
      supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
      this.client = supabaseClient;
    }
    return supabaseClient;
  }
};
