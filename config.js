/* ============================================================
   Pyle Plan Builder — client-side config.
   These values are public (anon key is safe in-browser by design
   when RLS is set up properly in Supabase). Replace the
   placeholders below with the values from your Supabase project:
     Project Settings -> API -> Project URL + anon/public key
   ============================================================ */
window.__PYLE_CONFIG__ = {
  SUPABASE_URL: 'https://ecrgcajxolritivqixkg.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable_EuRJ-7Ju0TbJnidVeyJB3A_yd4tHzFo',
  TABLE_NAME: 'plans',
  // Anyone with an email on this domain is treated as Team (full access).
  // Everyone else who signs in is treated as Client (read/edit own plan only).
  TEAM_DOMAIN: 'pfs4u.com'
};
