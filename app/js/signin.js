// As soon as a session exists, go to the app. This fires both when the user is
// already signed in (INITIAL_SESSION) and right after returning from Google
// (SIGNED_IN) — supabase-js exchanges the OAuth code automatically on load.
_supabase.auth.onAuthStateChange((event, session) => {
  if (session) {
    window.location.replace(`/app/${session.user.id}`);
  }
});

document.getElementById('googleSigninBtn').addEventListener('click', async () => {
  const errorEl = document.getElementById('signin-error');
  errorEl.classList.add('hidden');

  const { error } = await _supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.origin + '/signin' }
  });

  if (error) {
    errorEl.textContent = error.message;
    errorEl.classList.remove('hidden');
  }
});
