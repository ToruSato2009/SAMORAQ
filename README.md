# SAMORAQ V2

A free, local-first study planner built with HTML, CSS and JavaScript.

## Run on Windows
1. Extract the ZIP folder.
2. Open `SAMORAQ_V1`.
3. Double-click `RUN_SAMORAQ.bat`.
4. Create an account on this device and complete the guided study profile.

The launcher uses the Windows `py` or `python` command when available. If neither exists, it opens the landing page directly in your browser.

## Planner features
- Student-selected board, class, subjects, custom subjects and topics.
- One daily study-time budget distributed across subjects and topics.
- Editable subject priorities and priority-weighted allocations.
- Daily topic entry saved separately for each local calendar date.
- Task additions, removals and duration edits redistribute unfinished task time within the daily budget.
- Completed tasks retain their recorded duration.
- Local-midnight rollover locks the previous day and prepares the next plan on the next app check.
- NEXUS companion, task completion rewards and priority-weighted XP.

## Important account and storage limitation
This package is a **local-first pre-launch build**, not yet a production cloud service. Accounts, profiles, tasks, XP and progress are stored in browser `localStorage` on the current device. The current local account implementation is not suitable for protecting real passwords or sensitive student information. Data does not sync between devices, and clearing browser site data can erase it.

**Before public production launch:** integrate Supabase Auth, move student data into a properly secured database, enable and test Row Level Security (RLS) for every student-owned record, verify account isolation and recovery, configure production hosting/HTTPS, and run end-to-end tests against the deployed site. Do not describe this package as cloud-secure or multi-device until those steps pass.

## Catalogue status
The subject selector includes a broad master catalogue for Classes 9–12. It does not claim every subject is offered by every school or every board. State-specific subject and syllabus verification must be added only against current official curriculum documents. Custom subjects are supported.

## Pages
- `index.html` — public landing page
- `auth.html` — local account and guided onboarding
- `dashboard.html` — daily plan, tasks, subjects, calendar, achievements and reports
- `credits.html` — creator and project credits

## Technologies
HTML · CSS · JavaScript · Browser localStorage

## Visual theme
The shared `theme.css` file controls the SAMORAQ V2 Amber Gold palette.
