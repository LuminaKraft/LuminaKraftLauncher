# Discord OAuth Deep Link Setup

## Overview
Discord OAuth authentication now opens in the user's default browser instead of within the app, using a custom protocol handler for the callback.

## Supabase Configuration Required

### 1. Add Redirect URL to Supabase

In your Supabase project settings, navigate to:
**Authentication > URL Configuration > Redirect URLs**

Add the following redirect URL:
```
luminakraft://auth/callback
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
2. OAuth URL is generated with `skipBrowserRedirect: true`
3. URL is opened in user's default browser
4. User authenticates with Discord in the browser
5. Discord redirects to Supabase callback URL
6. Supabase redirects to `luminakraft://auth/callback#access_token=...&refresh_token=...`
7. Browser opens the launcher app via deep link
8. App extracts tokens and establishes session
9. User is authenticated and redirected to settings page
10. **User can manually close the browser tab** (it will remain open showing Discord's authorization page)

## Deep Link Protocol

- **Protocol**: `luminakraft://`
- **Callback Path**: `auth/callback`
- **Full URL**: `luminakraft://auth/callback#access_token=...&refresh_token=...&provider_token=...`

## Platform Support

- **Windows**: Deep links registered via MSI installer
- **macOS**: Deep links registered via app bundle Info.plist
- **Linux**: Deep links registered via .desktop file

The deep link registration is handled automatically by Tauri's deep-link plugin during app installation.
