# Discord OAuth Deep Link Setup

## Overview
Discord OAuth authentication now opens in the user's default browser instead of within the app, using a custom protocol handler for the callback.

## Setup Steps

### 1. Host the OAuth Success Page

The file `public/auth-success.html` needs to be hosted on a web server so it can be used as a redirect URL.

**Option A: Using GitHub Pages**
1. Create a new GitHub repository
2. Upload `public/auth-success.html` as `index.html`
3. Enable GitHub Pages in repository settings
4. Your URL will be: `https://yourusername.github.io/your-repo-name/`

**Option B: Using Vercel**
1. Create a new project on Vercel
2. Upload `public/auth-success.html`
3. Deploy and get your URL: `https://your-project.vercel.app/auth-success.html`

**Option C: Use Your Own Domain**
Host the file on your own web server.

### 2. Add Redirect URL to Supabase

In your Supabase project settings, navigate to:
**Authentication > URL Configuration > Redirect URLs**

Add your hosted auth success page URL:
```
https://yourusername.github.io/your-repo-name/
```

Or if using your own domain:
```
https://yourdomain.com/auth-success.html
```

### 3. Update Redirect URL in Code

In `src/services/authService.ts`, update the `linkDiscordAccount()` method to use your hosted URL:

```typescript
redirectTo: 'https://yourusername.github.io/your-repo-name/',
```

### 4. Discord Provider Setup

Ensure Discord OAuth provider is configured in:
**Authentication > Providers > Discord**

- Client ID: Your Discord application Client ID
- Client Secret: Your Discord application Client Secret
- Scopes: `identify guilds guilds.members.read`

### 5. Discord Application Settings

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
6. Supabase redirects to your hosted `auth-success.html` page with tokens in hash
7. The success page:
   - Displays a success message to the user
   - Extracts tokens from URL hash
   - Triggers the deep link `luminakraft://auth/callback#...` with JavaScript
   - Auto-closes after 5 seconds
8. Browser opens the launcher app via deep link
9. App extracts tokens and establishes session
10. App syncs Discord roles from server
11. User is authenticated and redirected to settings page

## Deep Link Protocol

- **Protocol**: `luminakraft://`
- **Callback Path**: `auth/callback`
- **Full URL**: `luminakraft://auth/callback#access_token=...&refresh_token=...&provider_token=...`

## Platform Support

- **Windows**: Deep links registered via MSI installer
- **macOS**: Deep links registered via app bundle Info.plist
- **Linux**: Deep links registered via .desktop file

The deep link registration is handled automatically by Tauri's deep-link plugin during app installation.
