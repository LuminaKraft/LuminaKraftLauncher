# Development Guide - LuminaKraft Launcher

## Quick Start

```bash
# Install dependencies
npm install

# Development
npm run tauri:dev

# Production build
npm run tauri:build
```

## Project Structure

```
luminakraft-launcher/
├── src/                          # React frontend
│   ├── components/               # UI components
│   │   ├── Modpacks/            # Modpack UI
│   │   └── Settings/            # Settings UI
│   ├── services/                # Services
│   │   ├── supabaseClient.ts    # ⭐ Supabase client
│   │   ├── authService.ts       # ⭐ Hybrid auth
│   │   ├── launcherService.ts   # ⭐ Modpack management (read)
│   │   ├── modpackManagementService.ts # ⭐ Management (write)
│   │   └── curseforgeService.ts # ⭐ CurseForge proxy
│   ├── contexts/                # React contexts
│   ├── types/                   # TypeScript types
│   │   ├── launcher.ts          # Launcher types
│   │   └── supabase.ts          # ⭐ Supabase DB types
│   └── locales/                 # i18n translations
│
└── src-tauri/                   # Rust backend
    ├── src/
    │   ├── main.rs              # Entry point
    │   ├── launcher.rs          # Modpack installation
    │   └── minecraft.rs         # Lyceris integration
    └── Cargo.toml

⭐ = Modified/created files in Supabase migration
```

## Main Services

### 1. Supabase Client (`src/services/supabaseClient.ts`)

Singleton client for all Supabase operations:

```typescript
import { supabase } from './supabaseClient';

// Get current user
const { data: { user } } = await supabase.auth.getUser();

// Query table
const { data, error } = await supabase
  .from('modpacks')
  .select('*')
  .eq('is_active', true);

// Call RPC function
const { data } = await supabase.rpc('modpacks_i18n', {
  p_language: 'en'
});
```

### 2. Auth Service (`src/services/authService.ts`)

Manages hybrid authentication (Microsoft + Supabase):

```typescript
import AuthService from './authService';

const authService = AuthService.getInstance();

// Initialize anonymous session (done automatically on startup)
await authService.initializeAnonymousSession();

// After Microsoft login (done automatically)
await authService.authenticateSupabaseWithMicrosoft(microsoftAccount);

// Sign out
await authService.signOutSupabase();
```

### 3. Launcher Service (`src/services/launcherService.ts`)

Modpack management (read operations):

```typescript
import LauncherService from './launcherService';

const service = LauncherService.getInstance();

// Get modpack list
const modpacks = await service.fetchModpacksData();

// Get full details
const details = await service.fetchModpackDetails(modpackId);

// Tracking
await service.trackDownload(modpackId);
await service.updatePlaytime(modpackId, hours);

// Updates
const updateInfo = await service.checkForModpackUpdate(modpackId);
```

### 4. Modpack Management Service (`src/services/modpackManagementService.ts`)

Modpack management (create/edit):

```typescript
import ModpackManagementService from './modpackManagementService';

const service = ModpackManagementService.getInstance();

// Check permissions
const { canManage, role } = await service.canManageModpacks();

// Create modpack
const { success, modpackId } = await service.createModpack({
  slug: 'my-modpack',
  category: 'community',
  name: { en: 'My Modpack', es: 'Mi Modpack' },
  shortDescription: { en: '...', es: '...' },
  description: { en: '...', es: '...' },
  version: '1.0.0',
  minecraftVersion: '1.20.1',
  modloader: 'forge',
  modloaderVersion: '47.2.0'
});

// Upload file
const result = await service.uploadModpackFile(
  modpackId,
  zipFile,
  (progress) => console.log(`${progress}%`)
);

// Update metadata
await service.updateModpack(modpackId, {
  version: '1.1.0',
  isActive: true
});

// Get user's modpacks
const myModpacks = await service.getUserModpacks();
```

### User Roles and Permissions

The launcher supports three user roles with different modpack creation permissions:

| Role | Can Create | Category | Badge Color |
|------|-----------|----------|-------------|
| `admin` | Official modpacks | `official` | Purple |
| `partner` | Partner modpacks | `partner` | Blue |
| `community` | Community modpacks | `community` | Green |
| anonymous/user | Cannot create | - | - |

**How to get permissions:**
1. **Admin role**: Requires database access to manually set `role = 'admin'` in the `users` table
2. **Partner role**: Contact LuminaKraft team to request partner status
3. **Community role**: Granted automatically to authenticated users via RLS policies

**Category badges** are displayed on all modpack cards in the Home page to help users distinguish official, partner, and community content.

## UI Components

### CreateModpackForm Component

Location: `src/components/Modpacks/CreateModpackForm.tsx`

Features:
- Multi-language inputs (EN/ES)
- Version and Minecraft version fields
- Modloader selection
- File upload for modpack ZIP
- Progress tracking during upload
- Validation and error handling

### EditModpackForm Component

Location: `src/components/Modpacks/EditModpackForm.tsx`

Features:
- Load existing modpack data
- Update metadata
- Create new versions with changelog
- Upload new modpack file
- Activate/deactivate modpack

### MyModpacksPage Component

Location: `src/components/Modpacks/MyModpacksPage.tsx`

Features:
- Grid view of user's modpacks
- Upload status indicators
- Action buttons (Edit, Update, View Stats)
- Filter by status (active, pending, failed)

## Testing

### Manual Testing

```bash
# 1. Start launcher
npm run tauri:dev

# 2. Verify anonymous session
# - App should start without requiring login
# - You should see modpacks

# 3. Microsoft login
# - Click Settings → Microsoft Auth → Sign In
# - Verify in Supabase Dashboard that user was created

# 4. Install modpack
# - Verify in Supabase that downloads incremented in modpack_stats

# 5. Create modpack (if UI implemented)
# - Verify it's created in modpacks table
# - Verify file uploaded to R2
```

### Automated Tests (future)

```typescript
// tests/auth.test.ts
import { supabase } from '../src/services/supabaseClient';

test('anonymous session is created', async () => {
  const { data, error } = await supabase.auth.signInAnonymously();
  expect(error).toBeNull();
  expect(data.user?.is_anonymous).toBe(true);
});
```

## Debugging

### View Supabase Logs

```bash
# Browser console
console.log('Supabase URL:', import.meta.env.VITE_SUPABASE_URL);

// View current user
const { data: { user } } = await supabase.auth.getUser();
console.log('Current user:', user);
```

### Verify Queries in Supabase Dashboard

1. Go to https://supabase.com/dashboard
2. Select your project
3. Go to "SQL Editor"
4. Execute queries manually:

```sql
-- View all modpacks
SELECT * FROM modpacks WHERE is_active = true;

-- View stats
SELECT * FROM modpack_stats;

-- View users
SELECT id, email, role FROM users;
```

## Resources

- **Supabase Docs**: https://supabase.com/docs
- **Supabase JS Client**: https://supabase.com/docs/reference/javascript
- **Tauri Docs**: https://tauri.app/
- **Backend Repo**: `../LuminaKraftLauncher-Backend`

## Troubleshooting

### Error: "Missing Supabase environment variables"

Verify that `.env.local` exists and has:
```env
VITE_SUPABASE_URL=https://...
VITE_SUPABASE_ANON_KEY=eyJ...
```

### Error: "Failed to fetch modpacks"

1. Verify Supabase is active
2. Check that `modpacks_i18n` function exists in DB
3. Review RLS policies in Supabase Dashboard

### Error uploading file to R2

1. Verify Edge Function `generate-r2-upload-url` is deployed
2. Check you have permissions (not anonymous)
3. Review CORS in R2 (must include `tauri://localhost`)
