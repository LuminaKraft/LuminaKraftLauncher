# LuminaKraft Launcher

Tauri 2 + React 19 desktop launcher for Minecraft modpacks. Manages installation, updates, integrity verification, and launching of CurseForge/Modrinth modpacks. Auth via Microsoft (Minecraft) + Discord (community). Backend in Rust, frontend in TypeScript/React, cloud via Supabase + Cloudflare R2.

## Tech Stack

- **Frontend**: React 19, TypeScript 6, Vite 8, Tailwind CSS 3, React Router 7
- **Desktop**: Tauri 2 (Rust backend + WebView frontend)
- **Auth/DB**: Supabase (auth, PostgreSQL, edge functions via Deno)
- **Storage**: Cloudflare R2 (modpack ZIPs, images)
- **Integrations**: CurseForge API, Modrinth, Discord OAuth, Microsoft OAuth
- **Testing**: Vitest 4 (jsdom), ESLint 9 + TypeScript

## Commands

```bash
npm run dev              # Vite dev server only (:1420)
npm run tauri:dev-stable # Kill port + launch Tauri dev (recommended)
npm run tauri:dev-watch  # Tauri dev with hot reload
npm run tauri:build      # Production build (syncs versions)
npm run lint             # ESLint
npm run test             # Vitest single run
npm run test:watch       # Vitest watch
cargo build              # From src-tauri/ — compile Rust only
```

## Release Process

**IMPORTANT: Version must be in sync across 4 files. Never edit them manually — use `release.js`.**

```bash
# 1. Update CHANGELOG.md manually (add new version section above previous)
# 2. Run release script (bumps version in all 4 files + commits + tags)
npm run release:patch        # 0.1.9 → 0.1.10
npm run release:minor        # 0.1.9 → 0.2.0
npm run release:major        # 0.1.9 → 1.0.0
npm run release:patch-push   # Same + push (triggers GitHub Actions)

# 3. If script didn't push: push manually
git push && git push --tags

# 4. GitHub Actions auto-builds Windows/macOS/Linux and creates GitHub Release
```

**Files synced by `release.js`:**
- `package.json` — `version` + `isPrerelease`
- `src-tauri/Cargo.toml` — `version`
- `src-tauri/tauri.conf.json` — `version`
- `src/components/Layout/Sidebar.tsx` — `currentVersion`

**CHANGELOG.md format** (Keep a Changelog):
```markdown
## [0.1.10] - 2026-05-11
### ✨ New Features
- Description of feature

### 🐛 Bug Fixes
- Description of fix
```

**CI/CD**: `.github/workflows/build-and-release.yml` triggers on `v*` tags. Builds all platforms, generates `latest.json` for auto-updater, creates GitHub Release.

## Architecture

```
src/
├── contexts/LauncherContext.tsx   # Global state (modpacks, user, settings)
├── services/
│   ├── authService.ts             # Microsoft + Discord + Supabase auth
│   ├── launcherService.ts         # Install / update / launch modpacks
│   ├── modpackManagementService.ts# CRUD for published modpacks
│   └── supabaseClient.ts          # Supabase client + role helpers
├── components/
│   ├── Layout/Sidebar.tsx         # Nav + hardcoded currentVersion
│   └── Modpacks/                  # Modpack pages and forms
└── types/supabase.ts              # Auto-generated DB types

src-tauri/src/
├── main.rs                        # ~30 Tauri command handlers
├── launcher.rs                    # Minecraft launch + integrity flow
├── filesystem.rs                  # Instance metadata I/O
├── modpack/
│   ├── curseforge/processor.rs    # CurseForge ZIP processing
│   ├── modrinth/processor.rs      # .mrpack processing
│   └── integrity.rs               # SHA256 + HMAC integrity system
└── oauth.rs                       # Microsoft / Discord OAuth
```

## Code Conventions

- **Imports**: ES modules only. `import { invoke } from '@tauri-apps/api/core'`
- **Services**: Singleton pattern — `AuthService.getInstance()`
- **Tauri commands**: `#[tauri::command]` in Rust → `invoke<T>('command_name', payload)` in TS
- **Unused vars**: prefix with `_` to satisfy ESLint (`_param`, `_result`)
- **Async**: Tokio in Rust, async/await in TS. Never block the Tauri main thread.
- **i18n**: All UI strings via `useTranslation()` / `t('key')`. Locales in `/locales/`.

## Gotchas

- **Version sync**: Mismatch between the 4 version files breaks auto-updates silently.
- **Integrity v2**: Tracks only `mods/*.jar` + `resourcepacks/*.zip` + custom protected paths. Configs are intentionally excluded (they change naturally).
- **Cache TTLs**: AuthService 5min, modpack data 15min. On stale data: clear cache or reload.
- **Discord sync**: `syncDiscordRoles()` runs on login + app launch if >6h since last sync. Changing Discord avatar only reflects after next sync.
- **Protected paths**: `custom_protected_paths` in modpack metadata — files there are hashed at install and verified at every launch.
- **R2 uploads**: Frontend gets presigned URL from `get-r2-presigned-url` edge function, uploads directly to R2, then registers the modpack via `register-modpack-upload`.

## Supabase

Client configured via `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` env vars. Auth uses Supabase sessions stored under key `'luminakraft-auth'` in localStorage.

Tables: `users`, `modpacks`, `modpack_versions`, `modpack_images`, `partners`, `modpack_features`, `modpack_collaborators`, `modpack_stats`, `modpack_reviews`, `download_logs`.

## Pre-commit checklist

**Always run BEFORE committing** (CI runs same on push, but local saves time):

1. `npm run lint` — must pass with 0 warnings
2. `npm run test` — all vitest tests pass
3. `cd src-tauri && cargo check && cargo clippy -- -D warnings && cargo test` — all Rust checks + tests pass
4. If touching launch/install flow: smoke test manually (`npm run tauri:dev-stable`)
5. If touching DB schema or RLS: apply migration to a Supabase branch first, smoke test, then merge to main

If any of these fail, fix the root cause — do not skip hooks or use `--no-verify`.

## Commit conventions

- Conventional Commits format: `fix:`, `perf:`, `feat:`, `chore:`, `refactor:`, `docs:`
- Subject ≤ 72 chars
- Body explains WHY (not WHAT — diff already shows what)
- **Never** add `Co-Authored-By` or AI/assistant attribution
- One logical change per commit when possible
