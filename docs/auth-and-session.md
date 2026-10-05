# Authentication & Session Architecture

This document describes the authentication lifecycle, session persistence, profile hydration, and onboarding mechanisms in Sanchay.

---

## 1. Core Principles & ID Convention

### Profile ID = User ID
- In Supabase, `profiles.id` is a primary key that has a foreign key constraint referencing `auth.users(id)`.
- **Convention:** In client code and local Dexie storage, a profile row **must always** have `id === userId`.
- Never generate a random UUID (such as UUIDv7) for a profile's `id`.
- The repository layer (`profileRepo`) strictly enforces this:
  ```ts
  // profileRepo.ts
  const profile: Profile = {
    ...data,
    id: data.userId, // Mandatory: id must match auth userId
    userId: data.userId,
    // ...
  }
  ```
- Any legacy profile row where `id !== userId` is normalized by Dexie Version 2 migration and rejected by Supabase `sync_push` if mismatched.

---

## 2. Sign-In & Auth State Initialization

### Idempotent Initialization
The auth store (`authStore.ts`) provides an idempotent `initialize()` function guarded by module-level tracking to prevent duplicate subscription listeners during React StrictMode double-mounting or Vite HMR:
- Checks if URL contains auth callback tokens or error codes (`code`, `access_token`, `refresh_token`, etc.). If detected, it guarantees Supabase Auth client initialization runs immediately so OAuth and Magic Link exchanges succeed without delay.
- Subscribes to `supabase.auth.onAuthStateChange` to continuously synchronize session state across tabs.
- On `SIGNED_IN` or `TOKEN_REFRESHED`, it sets the session, hydrates the profile, and triggers an immediate sync via `syncEngine.triggerSync(true)`.

### Typed Error Classification
`signInWithEmail` returns a strongly typed result:
```ts
export type AuthErrorCode =
  | 'invalid_credentials'
  | 'email_not_confirmed'
  | 'network'
  | 'rate_limited'
  | 'unknown'
```
The UI (`SignInScreen.tsx`) maps these error codes directly to localized strings (`auth.errors.*`), offering a resend confirmation link with a 30-second cooldown when an unverified email is detected.

---

## 3. Profile Hydration Flow

When a user signs in, the app initiates `hydrateProfile(userId)`:

```
                  ┌──────────────────────┐
                  │ hydrateProfile(user) │
                  └──────────┬───────────┘
                             │
            Does Dexie have local profile?
                    /                 \
                 YES                   NO
                 /                       \
    Set profile in store;            Is device online?
    Mark hydration 'ready'           /               \
                                   YES                NO
                                   /                    \
                     Single-row fetch from      Create local stub profile;
                     Supabase `profiles`        Mark hydration 'ready'
                         /           \
                      FOUND        NOT FOUND
                      /                 \
           Save to Dexie;          Run pullOnce()
           Mark 'ready'              /          \
                                  FOUND       NOT FOUND (New User)
                                  /                \
                       Save to Dexie;         Create starter profile
                       Mark 'ready'           with onboardedAt: null;
                                              Mark 'ready'
```

- While `hydrationStatus === 'loading'`, route guards (`RequireAuth`, `RequireOnboarded`) display a smooth loading skeleton rather than falsely bouncing the user to `/onboarding`.
- A Dexie `liveQuery` subscription automatically updates `authStore.profile` whenever the local profile record changes.

---

## 4. Onboarding Guard & Hints

To prevent onboarding flashes on cold starts:
1. **Per-user localStorage hint:** Upon onboarding completion, `localStorage.setItem('sanchay_onboarded_' + userId, '1')` is recorded.
2. **`RequireOnboarded` Guard:**
   - If profile exists and `profile.onboardedAt` is set, user enters the app.
   - If profile is still hydrating but `sanchay_onboarded_<userId>` exists in localStorage, the guard allows entry while hydration completes in the background.
3. **`RequireNotOnboarded` Guard:**
   - Prevents already onboarded users from navigating back into `/onboarding`.
4. **Idempotent Category Seeding:**
   - `OnboardingScreen` only seeds default categories if none already exist for that user (e.g. if sync pulled existing categories).

---

## 5. Sign-Out Safety

Before signing out, the application checks `db.outbox`:
- If pending, failed, or blocked outbox entries exist, a confirmation dialog warns the user that unsynced changes will remain locally and may be overwritten or delayed.
- Upon confirmed sign-out:
  - `sanchay_offline_session` is cleared.
  - Active session is invalidated via `supabase.auth.signOut()`.
  - Local Dexie data is preserved (offline-first design principle: never wipe local user data without explicit user request).
