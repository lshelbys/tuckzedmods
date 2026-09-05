/**
 * tuckzed mods — Supabase Configuration & Client
 * 
 * Replace the SUPABASE_URL and SUPABASE_ANON_KEY below with
 * your project credentials from https://supabase.com/dashboard/project/_/settings/api
 */

'use strict';

const SUPABASE_URL = 'https://YOUR_PROJECT_ID.supabase.co';
const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY';

// Initialize the Supabase client (using the @supabase/supabase-js CDN SDK)
let supabaseClient = null;
if (typeof supabase !== 'undefined' && SUPABASE_URL && !SUPABASE_URL.includes('YOUR_PROJECT_ID')) {
  supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

window.TZ_SUPABASE = {
  url: SUPABASE_URL,
  key: SUPABASE_ANON_KEY,
  client: supabaseClient,
  isConfigured: function () {
    return !!supabaseClient;
  }
};
