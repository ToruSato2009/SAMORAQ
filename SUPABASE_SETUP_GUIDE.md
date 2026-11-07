# SAMORAQ V2 — Supabase setup

This build uses Supabase Auth (email + password) and stores each student's profile and complete planner state in two RLS-protected tables. The username remains the student's public SAMORAQ identity and is stored in Auth user metadata plus `student_profiles`.

## 1. Configure the Supabase project

1. Open the Supabase project configured in `supabase-config.js`.
2. In **SQL Editor**, run the complete contents of `supabase-setup.sql`.
3. In **Authentication → URL Configuration**, set the Site URL to your eventual HTTPS website URL. Add the local development URL and the production URL to Redirect URLs.
4. In **Authentication → Providers → Email**, keep email/password enabled. Decide whether email confirmation is required; it is recommended for public launch. If enabled, students must confirm their email before they can sign in and complete onboarding.
5. Set the SMTP provider for production email delivery. Supabase's default email service is intended for testing and has sending limits.
6. Set password policy/rate limits appropriate for public users.

## 2. Browser configuration

`supabase-config.js` contains the project URL and browser publishable key. The publishable key is not a secret; RLS is the security boundary. Never add a `service_role` or secret key to any HTML/JS file.

## 3. Current data flow

- Auth: Supabase Auth email/password.
- Username: Auth user metadata and the profile row; username is not a password or login credential.
- Profile: `student_profiles.profile` JSONB.
- Planner: `student_app_state.app_state` JSONB, including subjects, topics, tasks, priorities, XP, daily topic selections, daily plans and history.
- Dashboard loads the cloud state into a local cache before starting the existing planner. Changes to the cache are debounced and upserted to Supabase.
- Logging out calls Supabase Auth signOut.

## 4. Important limitations before public release

- Apply the SQL first. The app intentionally refuses dashboard loading when the tables are unavailable.
- Configure the correct Site URL and SMTP before public sign-up.
- This first integration does not automatically migrate accounts/passwords from the old local demo-account system. Old local data needs a signed-in, per-user import flow before those users can use it in the cloud. Never import old plaintext local passwords.
- Cloud saves are debounced; this initial release does not yet implement a full offline mutation queue or conflict-resolution protocol for simultaneous edits on multiple devices. Test carefully and avoid editing the same account simultaneously on multiple devices until that is added.
- Username uniqueness is enforced by a database unique index, but friendly username availability checks are not exposed publicly.
- Add a production password-reset flow, account deletion flow, privacy policy, terms, support contact, backups and monitoring before public launch.

## 5. Verification checklist

1. Run SQL and verify both tables have RLS enabled.
2. Register a new email and unique username.
3. Confirm email if confirmation is enabled, then log in.
4. Complete onboarding; verify one profile row and one app-state row are created.
5. Create a second account and verify it cannot read or change the first account's rows.
6. Change a task, priority, topic and XP; reload and verify persistence.
7. Log out, log back in and verify correct account restoration.
8. Test on a second browser/device and check cloud state loads.
9. Test email confirmation, expired sessions, network interruption and password recovery.

Do not describe the app as production-ready until these checks pass.
