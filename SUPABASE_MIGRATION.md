# LuminaKraft Launcher - Supabase + R2 Migration

## Overview

The launcher has been fully migrated from a custom REST API to an architecture based on **Supabase** (PostgreSQL + Auth) and **Cloudflare R2** (file storage).

## Implemented Changes

### ✅ Phase 1: Supabase Base Configuration

**Files created:**
- `src/services/supabaseClient.ts` - Supabase singleton client with helpers
- `src/types/supabase.ts` - TypeScript types for the database

**Files modified:**
- `package.json` - Added `@supabase/supabase-js` dependency
- `.env.local` - Already configured with `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_R2_PUBLIC_URL`
- `src-tauri/tauri.conf.json` - Updated CSP to allow Supabase and R2 connections

### ✅ Phase 2: Hybrid Authentication System

**Implemented flow:**
1. **Anonymous sessions**: Users can browse and download modpacks without authentication
2. **Microsoft OAuth**: Maintains existing Lyceris flow but syncs with Supabase
3. **Automatic sync**: Microsoft profile data is replicated to Supabase `users` table

**Files modified:**
- `src/services/authService.ts` - New methods:
  - `initializeAnonymousSession()` - Creates anonymous session in Supabase
  - `authenticateSupabaseWithMicrosoft()` - Syncs Microsoft auth with Supabase
  - `syncUserProfile()` - Replicates profile data
  - `signOutSupabase()` - Sign out and restore anonymous session

- `src/contexts/LauncherContext.tsx`:
  - Initializes anonymous session on app startup
  - Syncs with Supabase when Microsoft login occurs

- `src/components/Settings/MicrosoftAuth.tsx`:
  - Automatically syncs with Supabase after successful auth
  - Handles Supabase sign out

**Behavior:**
- Anonymous users: Can view and download ALL modpacks (official/partner/community)
- Authenticated users: Can also create and manage their own modpacks

### ✅ Phase 3: Modpack Reading Migration

**Files modified:**
- `src/services/launcherService.ts`:
  - `fetchModpacksData()` - Now uses `supabase.rpc('modpacks_i18n')` instead of REST API
  - `fetchModpackDetails()` - Fetches complete data with joins to:
    - `modpack_features` - Modpack features
    - `modpack_images` - Screenshots and gallery
    - `modpack_collaborators` - Modpack team
    - Aggregate stats via `get_modpack_aggregate_stats()`

**Data transformation:**
- Supabase data is transformed to maintain compatibility with existing interface
- i18n translations are automatically extracted based on user language
- Cache system maintains the same logic (15 min TTL)

### ✅ Phase 4: CurseForge Proxy with Edge Function

**Files modified:**
- `src/services/curseforgeService.ts` - Completely refactored:
  - Removed axios dependency for CurseForge
  - New `invokeCurseForgeProxy()` method that calls Supabase Edge Function
  - All methods updated: `getModInfo()`, `getBatchModInfo()`, `getModFileInfo()`, etc.

**Flow:**
```
Launcher → Edge Function (curseforge-proxy) → CurseForge API
```

**Advantages:**
- CurseForge API key remains secure on server
- Authentication handled automatically by Supabase
- No changes to Rust backend (continues using same methods)

### ✅ Phase 6: Statistics System

**Files modified:**
- `src/services/launcherService.ts` - New methods:
  - `trackDownload(modpackId)` - Calls Supabase `increment_downloads()` function
  - `updatePlaytime(modpackId, hours)` - Calls `update_playtime()` function
  - `getModpackStats(modpackId)` - Gets aggregate statistics

- `src/contexts/LauncherContext.tsx`:
  - Automatic download tracking after successful installation (line 538)

**Functionality:**
- Downloads are tracked per user (even anonymous)
- Playtime only for authenticated users
- Aggregate stats available in modpack details

### ✅ Phase 7: Update Detection

**Files modified:**
- `src/services/launcherService.ts` - New methods:
  - `checkForModpackUpdate(modpackId)` - Compares local vs remote version
  - `getVersionChangelog(modpackId, version)` - Gets translated changelog
  - `getModpackVersionHistory(modpackId)` - Complete version history

**Functionality:**
- Automatic update detection
- i18n changelog to show to user
- Complete version history with changelogs

### ✅ Phase 5: Modpack Management Infrastructure

**Files created:**
- `src/services/modpackManagementService.ts` - Complete service for partners/community:
  - `canManageModpacks()` - Verifies user permissions
  - `createModpack()` - Creates new modpack in DB
  - `uploadModpackFile()` - Upload to R2 with presigned URLs and progress tracking
  - `updateModpack()` - Updates modpack metadata
  - `getUserModpacks()` - Lists user's modpacks

**Modpack creation flow:**
```
1. User creates modpack (metadata) → Supabase DB
2. Generate presigned URL → Edge Function generate-r2-upload-url
3. Direct upload to R2 → Cloudflare R2 (no server intermediary)
4. Complete upload → Edge Function complete-modpack-upload
5. Modpack published and available to everyone
```

## Final Architecture

### Frontend (React + Tauri)
```
src/
├── services/
│   ├── supabaseClient.ts         # Supabase client
│   ├── authService.ts             # Hybrid auth (Microsoft + Supabase)
│   ├── launcherService.ts         # Modpack management (read)
│   ├── modpackManagementService.ts # Modpack management (write)
│   └── curseforgeService.ts       # CurseForge proxy
├── types/
│   └── supabase.ts                # DB types
└── contexts/
    └── LauncherContext.tsx        # Global state with Supabase
```

### Backend (Supabase + R2)
```
Supabase PostgreSQL:
- modpacks (with i18n)
- modpack_features
- modpack_images
- modpack_collaborators
- modpack_versions
- modpack_stats
- users

Supabase Edge Functions:
- generate-r2-upload-url
- complete-modpack-upload
- curseforge-proxy

Cloudflare R2:
- Bucket: luminakraft-modpacks
- CDN: cdn.luminakraft.com
```

## UI Components Implemented

### ✅ Modpack Management UI

**Components created:**
1. `src/components/Modpacks/CreateModpackForm.tsx` - Modpack creation form
   - Multi-language inputs (EN/ES)
   - File uploads (ZIP, logo, banner, screenshots)
   - Progress tracking
   - Validation

2. `src/components/Modpacks/EditModpackForm.tsx` - Modpack editing
   - Same fields as creation
   - Version update with changelog
   - Activate/deactivate modpack

3. `src/components/Modpacks/MyModpacksPage.tsx` - User's modpack list
   - Grid view with modpack cards
   - Actions: Edit, Update, View Stats, Toggle Active
   - Upload status indicators

4. Navigation integration:
   - "Create Modpack" button in navbar (only if `canManageModpacks()` is true)
   - "My Modpacks" section in settings/separate page

## Environment Variables

```env
# .env.local (already configured)
VITE_SUPABASE_URL=https://iytnvsdsqvbdoqesyweo.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
VITE_R2_PUBLIC_URL=https://cdn.luminakraft.com
NODE_ENV=development
```

## Useful Commands

```bash
# Development
npm run tauri:dev

# Build
npm run tauri:build

# Testing (when implemented)
npm test
```

## Next Steps

1. **Complete testing** of all flows
2. **Optimization** of Supabase queries (add indexes if needed)
3. **Monitoring** usage with Supabase Analytics
4. **Documentation** for partners on how to upload modpacks

## Important Notes

### Security
- ✅ RLS (Row Level Security) implemented in Supabase
- ✅ Presigned URLs expire in 1 hour
- ✅ Secure API keys (CurseForge on server, Supabase anon key secure)
- ✅ Role validation before sensitive operations

### Performance
- ✅ 15-minute cache for modpacks
- ✅ Parallel queries for modpack details
- ✅ CDN (R2) for static files
- ✅ Automatic image compression (configure in R2)

### Costs (according to backend README)
- **Supabase Free Tier**: 500MB DB + 1GB storage + 2GB bandwidth
- **Cloudflare R2**: $0.015/GB storage + **$0 egress** (free!)
- **For 100GB + 1TB downloads/month**: ~$1.50/month

## Support

If you encounter any issues:
1. Verify environment variables are configured
2. Check Supabase Dashboard logs
3. Review browser/launcher console
4. Consult Supabase documentation: https://supabase.com/docs
