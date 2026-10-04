# Email templates

Supabase sends these emails itself; the text is configured in the dashboard, not in the app.

## Confirm signup
1. Supabase → Authentication → Emails → Templates → **Confirm signup**
2. **Subject:** `Confirm your email for Competitors Analysis`
3. **Message (HTML):** paste the whole of `confirm-signup.html`
4. Save. Keep the `{{ .ConfirmationURL }}` and `{{ .Email }}` placeholders exactly as written.

The link only works if `https://<your-site>/auth/callback` is in Authentication → URL Configuration → Redirect URLs.
