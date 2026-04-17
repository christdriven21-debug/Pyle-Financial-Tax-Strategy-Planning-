/* ============================================================
   Wavvest Plan Builder — client-side config.
   These values are public (anon key is safe in-browser by design
   when RLS is set up properly in Supabase). Replace the
   placeholders below with the values from your Supabase project:
     Project Settings -> API -> Project URL + anon/public key
   ============================================================ */
window.__WAVVEST_CONFIG__ = {
  SUPABASE_URL: 'YOUR_SUPABASE_URL',
  SUPABASE_ANON_KEY: 'YOUR_SUPABASE_ANON_KEY',
  TABLE_NAME: 'plans'
};
