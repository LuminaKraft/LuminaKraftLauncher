# Discord OAuth Setup

## Overview
Discord OAuth authentication opens in the user's default browser. After authorization, the user is redirected to https://luminakraft.com/auth-callback which automatically triggers the launcher to open via deep link.

## Setup Steps

### 1. Add Redirect URL to Supabase

In your Supabase project settings, navigate to:
**Authentication > URL Configuration > Redirect URLs**

Add the auth callback page as redirect URL:
```
https://luminakraft.com/auth-callback
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
5. Supabase establishes session and redirects to https://luminakraft.com/auth-callback
6. The auth-callback page:
   - Shows a success message to the user
   - Extracts OAuth tokens from URL hash
   - Triggers deep link `luminakraft://auth/callback#tokens...`
   - Browser attempts to open the launcher automatically
7. Launcher receives deep link and syncs Discord data
8. Success toast is shown and user is redirected to Settings page
9. Discord account is now linked and roles are synced

## Important Notes

- The launcher opens automatically via deep link
- User can close the browser tab showing the success message
- Session persists in Supabase
- Deep link is only registered when the app is built and installed (not in dev mode)
