# Discord OAuth Setup

## Overview
Discord OAuth authentication opens in the user's default browser. After authorization, the user is redirected to https://www.luminakraft.com/ and must manually return to the launcher app.

## Setup Steps

### 1. Add Redirect URL to Supabase

In your Supabase project settings, navigate to:
**Authentication > URL Configuration > Redirect URLs**

Add the LuminaKraft website as redirect URL:
```
https://www.luminakraft.com/
```

### 2. Discord Provider Setup

Ensure Discord OAuth provider is configured in:
**Authentication > Providers > Discord**

- Client ID: Your Discord application Client ID
- Client Secret: Your Discord application Client Secret
- Scopes: `identify guilds guilds.members.read`

### 3. Discord Application Settings

In your Discord Developer Portal (https://discord.com/developers/applications):

1. Go to your application
2. Navigate to **OAuth2 > General**
3. Add the following redirect URI (replace with your Supabase project URL):
   ```
   https://YOUR_SUPABASE_PROJECT_ID.supabase.co/auth/v1/callback
   ```

## How It Works

1. User clicks "Link Discord" in the launcher
2. OAuth URL is generated and opened in user's default browser
3. User authenticates with Discord in the browser
4. Discord redirects to Supabase callback URL
5. Supabase establishes session and redirects to https://www.luminakraft.com/
6. User sees LuminaKraft website and manually returns to the launcher app
7. User opens Settings page in launcher
8. Launcher automatically syncs Discord data from Supabase session
9. Discord account is now linked and roles are synced

## Important Notes

- User must manually return to the launcher after authorization
- Discord data sync happens automatically when user opens Settings
- The browser tab will remain open on luminakraft.com (user can close it manually)
- Session persists in Supabase, so data syncs even after app restart
