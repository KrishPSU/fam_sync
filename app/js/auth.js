// Shared Supabase browser client + session helpers.
// Loaded after /env.js (defines window.__ENV) and the supabase-js UMD bundle,
// and before any other app script. The library global is `supabase`; our client
// instance is `_supabase` to avoid shadowing it.
const _supabase = supabase.createClient(
  window.__ENV.SUPABASE_URL,
  window.__ENV.SUPABASE_ANON_KEY,
  {
    auth: {
      // Stay signed in across launches and server restarts: persist the session
      // to localStorage and keep the access token fresh in the background so it
      // never lapses while the app is open. The app only returns to /signin on
      // an explicit sign-out or a refresh token that's genuinely expired — not
      // on a transient blip. (storageKey left at the default so existing saved
      // sessions keep working.)
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storage: window.localStorage,
    }
  }
);

// The current session (or null). The client auto-refreshes the access token.
async function getSession() {
  const { data: { session } } = await _supabase.auth.getSession();
  return session;
}

// Reject `promise` if it hasn't settled within `ms`. getSession() reads through
// supabase-js's Web Locks guard, which can never settle rather than erroring —
// leaving anything awaiting a token stuck forever with nothing to report. A
// rejection is recoverable; a hang isn't.
function withTimeout(promise, ms, label) {
  let timer;
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms / 1000}s`)), ms);
  });
  return Promise.race([promise, deadline]).finally(() => clearTimeout(timer));
}

// The current access token (JWT) for authenticating sockets / fetch requests.
async function getToken() {
  const session = await withTimeout(getSession(), 10000, 'Reading your session');
  return session ? session.access_token : null;
}
