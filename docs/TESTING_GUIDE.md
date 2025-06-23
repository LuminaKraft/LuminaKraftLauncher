# 🧪 Testing Guide for Release Fixes

## Issues Fixed

### ✅ Issue 1: Prerelease Flag Not Working
- **Problem**: `--prerelease` flag wasn't being properly converted to boolean
- **Fix**: Added `Boolean()` wrapper and better debugging
- **Test**: See below

### ✅ Issue 2: 403 Error in Update Service  
- **Problem**: Public releases repository doesn't exist yet
- **Fix**: Added fallback strategy to private repo, better error handling
- **Test**: About page should no longer show 403 errors

### ✅ Issue 3: Slow Workflow
- **Problem**: Full multi-platform build takes too long for testing
- **Fix**: Created fast test workflow that only builds Linux DEB package
- **Test**: Use `test-*` tags to trigger fast workflow

## 🚀 Testing Steps

### Step 1: Clean Local Tags (if needed)
```bash
# Remove any existing v0.0.1 tags
git tag -d v0.0.1 2>/dev/null || true
git push origin :refs/tags/v0.0.1 2>/dev/null || true
```

### Step 2: Test Release Script Locally
```bash
# Test the release script (creates commit + tag, but doesn't push)
npm run test:release
```

This will:
- Create a prerelease v0.0.1 
- Show debugging info about the prerelease flag
- Test that the workflow will correctly detect it as prerelease

### Step 3: Test Fast Workflow
```bash
# Push the tag to trigger the fast test workflow
git push origin main --tags
```

This will trigger the **Fast Release Test** workflow which:
- Only builds Linux DEB package (much faster)
- Tests prerelease detection
- Creates releases in both repositories
- Shows detailed debugging output

### Step 4: Verify Results

1. **Check GitHub Actions**: https://github.com/kristiangarcia/luminakraft-launcher/actions
2. **Check Public Releases**: https://github.com/kristiangarcia/luminakraft-launcher-releases/releases
3. **Check Private Releases**: https://github.com/kristiangarcia/luminakraft-launcher/releases

### Step 5: Test Update Service
1. Run the launcher in development mode
2. Go to About page
3. Click "Check for Updates"
4. Should no longer show 403 error

## 🔍 What to Look For

### In GitHub Actions:
- Fast workflow completes in ~5-10 minutes (vs 30+ minutes for full)
- Debugging output shows prerelease detection working
- Both repositories get releases created

### In Public Repository Release:
- Should be marked as "Pre-release" (yellow tag)
- Release notes should mention it's a pre-release
- Should say "PRE-RELEASE DETECTADO CORRECTAMENTE"

### In Private Repository Release:
- Should also be marked as "Pre-release" 
- Should show debug info about prerelease detection
- Should say "TEST PRE-RELEASE SUCCESSFUL"

### In About Page:
- No more 403 errors when checking for updates
- Should either find the release or gracefully say "no updates found"

## 🎯 Success Criteria

- [ ] Release script sets `isPrerelease: true` in package.json
- [ ] Fast workflow completes successfully
- [ ] Both repositories get prerelease properly marked
- [ ] About page update check works without errors
- [ ] All debugging output shows prerelease detection working

## 🚀 Ready for Real Release

Once testing is successful:

1. **Clean up test tags**:
   ```bash
   git tag -d v0.0.1
   git push origin :refs/tags/v0.0.1
   ```

2. **Create real prerelease**:
   ```bash
   node release.js 0.0.1 --prerelease --push
   ```

3. **This will trigger the full multi-platform workflow** (since tag starts with `v` not `test-`)

## 📝 Notes

- Test workflow uses `test-*` tags (e.g., `test-v0.0.1`)
- Real workflow uses `v*` tags (e.g., `v0.0.1`)  
- Both create releases in public and private repositories
- The fast workflow is perfect for iterating on release system fixes 