# LuminaKraft Launcher API - Tauri Updater Implementation

## 🎯 **OBJECTIVE**
Implement Tauri updater endpoints in the LuminaKraft Launcher API to support automatic updates for the desktop launcher application.

## 📋 **REQUIREMENTS OVERVIEW**

The LuminaKraft Launcher desktop app now uses Tauri's built-in updater system for automatic updates. You need to implement the backend API endpoints that serve update manifests and download files according to Tauri's updater specification.

## 🔧 **TECHNICAL SPECIFICATIONS**

### **Current Tauri Configuration**
The launcher is configured with this updater endpoint:
```json
"updater": {
  "active": true,
  "endpoints": [
    "https://api.luminakraft.com/v1/updater/{{current_version}}/{{target}}/{{arch}}"
  ],
  "dialog": false,
  "pubkey": ""
}
```

### **URL Template Variables**
- `{{current_version}}`: Current app version (e.g., "0.3.1")
- `{{target}}`: Target platform (e.g., "windows", "linux", "darwin")
- `{{arch}}`: Architecture (e.g., "x86_64", "aarch64")

### **Example API Calls**
```
GET https://api.luminakraft.com/v1/updater/0.3.1/windows/x86_64
GET https://api.luminakraft.com/v1/updater/0.3.1/linux/x86_64
GET https://api.luminakraft.com/v1/updater/0.3.1/darwin/x86_64
GET https://api.luminakraft.com/v1/updater/0.3.1/darwin/aarch64
```

## 📝 **API ENDPOINT IMPLEMENTATION**

### **Endpoint**: `GET /v1/updater/{current_version}/{target}/{arch}`

### **Response Format**
The endpoint must return a JSON response in Tauri's updater format:

#### **When Update Available**
```json
{
  "version": "0.4.0",
  "notes": "Bug fixes and performance improvements",
  "pub_date": "2024-01-15T10:30:00Z",
  "platforms": {
    "windows-x86_64": {
      "signature": "",
      "url": "https://api.luminakraft.com/v1/releases/0.4.0/LuminaKraft-Launcher_0.4.0_x64_en-US.msi"
    },
    "linux-x86_64": {
      "signature": "",
      "url": "https://api.luminakraft.com/v1/releases/0.4.0/luminakraft-launcher_0.4.0_amd64.AppImage"
    },
    "darwin-x86_64": {
      "signature": "",
      "url": "https://api.luminakraft.com/v1/releases/0.4.0/LuminaKraft-Launcher_0.4.0_x64.dmg"
    },
    "darwin-aarch64": {
      "signature": "",
      "url": "https://api.luminakraft.com/v1/releases/0.4.0/LuminaKraft-Launcher_0.4.0_aarch64.dmg"
    }
  }
}
```

#### **When No Update Available**
Return HTTP 204 (No Content) with empty body, or:
```json
{
  "version": "0.3.1",
  "notes": "You are running the latest version",
  "pub_date": "2024-01-10T10:30:00Z",
  "platforms": {}
}
```

### **Platform Key Mapping**
Map the URL parameters to platform keys:
- `windows` + `x86_64` → `"windows-x86_64"`
- `linux` + `x86_64` → `"linux-x86_64"`
- `darwin` + `x86_64` → `"darwin-x86_64"`
- `darwin` + `aarch64` → `"darwin-aarch64"`

## 🗂️ **DATA STRUCTURE REQUIREMENTS**

### **Version Management**
You need to store and manage:
```json
{
  "releases": [
    {
      "version": "0.4.0",
      "release_date": "2024-01-15T10:30:00Z",
      "changelog": "Bug fixes and performance improvements",
      "files": {
        "windows-x86_64": {
          "filename": "LuminaKraft-Launcher_0.4.0_x64_en-US.msi",
          "url": "https://api.luminakraft.com/v1/releases/0.4.0/LuminaKraft-Launcher_0.4.0_x64_en-US.msi",
          "signature": ""
        },
        "linux-x86_64": {
          "filename": "luminakraft-launcher_0.4.0_amd64.AppImage",
          "url": "https://api.luminakraft.com/v1/releases/0.4.0/luminakraft-launcher_0.4.0_amd64.AppImage",
          "signature": ""
        },
        "darwin-x86_64": {
          "filename": "LuminaKraft-Launcher_0.4.0_x64.dmg",
          "url": "https://api.luminakraft.com/v1/releases/0.4.0/LuminaKraft-Launcher_0.4.0_x64.dmg",
          "signature": ""
        },
        "darwin-aarch64": {
          "filename": "LuminaKraft-Launcher_0.4.0_aarch64.dmg",
          "url": "https://api.luminakraft.com/v1/releases/0.4.0/LuminaKraft-Launcher_0.4.0_aarch64.dmg",
          "signature": ""
        }
      }
    }
  ]
}
```

## 🔄 **VERSION COMPARISON LOGIC**

### **Semantic Version Comparison**
Implement semantic version comparison to determine if an update is available:
```
Current: 0.3.1
Latest:  0.4.0
Result:  Update available

Current: 0.4.0
Latest:  0.4.0
Result:  No update

Current: 0.4.1
Latest:  0.4.0
Result:  No update (current is newer)
```

### **Algorithm**
```python
def has_update(current_version, latest_version):
    current_parts = [int(x) for x in current_version.split('.')]
    latest_parts = [int(x) for x in latest_version.split('.')]
    
    # Pad with zeros if needed
    max_len = max(len(current_parts), len(latest_parts))
    current_parts += [0] * (max_len - len(current_parts))
    latest_parts += [0] * (max_len - len(latest_parts))
    
    return latest_parts > current_parts
```

## 📁 **FILE SERVING REQUIREMENTS**

### **Release File Endpoint**: `GET /v1/releases/{version}/{filename}`

This endpoint should serve the actual installer files:
```
GET https://api.luminakraft.com/v1/releases/0.4.0/LuminaKraft-Launcher_0.4.0_x64_en-US.msi
GET https://api.luminakraft.com/v1/releases/0.4.0/luminakraft-launcher_0.4.0_amd64.AppImage
GET https://api.luminakraft.com/v1/releases/0.4.0/LuminaKraft-Launcher_0.4.0_x64.dmg
GET https://api.luminakraft.com/v1/releases/0.4.0/LuminaKraft-Launcher_0.4.0_aarch64.dmg
```

### **File Storage**
- Store release files in a secure location
- Serve with appropriate MIME types
- Support range requests for large files
- Implement download resumption

## 🔒 **SECURITY CONSIDERATIONS**

### **File Signatures** (Optional but Recommended)
- Generate cryptographic signatures for release files
- Include signatures in the update manifest
- Tauri will verify signatures before installation

### **Access Control**
- Ensure update endpoints are publicly accessible
- Rate limit to prevent abuse
- Log update checks for analytics

## 🧪 **TESTING REQUIREMENTS**

### **Test Cases**
1. **Update Available**: Current 0.3.1 → Latest 0.4.0
2. **No Update**: Current 0.4.0 → Latest 0.4.0
3. **Current Newer**: Current 0.4.1 → Latest 0.4.0
4. **Invalid Version**: Current "invalid" → Handle gracefully
5. **Missing Platform**: Request for unsupported platform
6. **File Download**: Verify file serving works correctly

### **Test Endpoints**
```bash
# Test update check
curl "https://api.luminakraft.com/v1/updater/0.3.1/windows/x86_64"

# Test file download
curl -I "https://api.luminakraft.com/v1/releases/0.4.0/LuminaKraft-Launcher_0.4.0_x64_en-US.msi"
```

## 📊 **BACKWARD COMPATIBILITY**

### **Existing Endpoint**
Keep the existing endpoint working for fallback:
```
GET https://api.luminakraft.com/v1/launcher_data.json
```

This should continue to return:
```json
{
  "launcherVersion": "0.4.0",
  "launcherDownloadUrls": {
    "windows": "https://api.luminakraft.com/v1/releases/0.4.0/LuminaKraft-Launcher_0.4.0_x64_en-US.msi",
    "macos": "https://api.luminakraft.com/v1/releases/0.4.0/LuminaKraft-Launcher_0.4.0_x64.dmg",
    "linux": "https://api.luminakraft.com/v1/releases/0.4.0/luminakraft-launcher_0.4.0_amd64.AppImage"
  }
}
```

## 🚀 **IMPLEMENTATION STEPS**

1. **Create Database Schema** for storing release information
2. **Implement Version Comparison** logic
3. **Create Updater Endpoint** `/v1/updater/{version}/{target}/{arch}`
4. **Create File Serving Endpoint** `/v1/releases/{version}/{filename}`
5. **Update Existing Endpoint** to use new version data
6. **Add Admin Interface** for managing releases
7. **Test All Endpoints** thoroughly
8. **Deploy and Monitor**

## ✅ **SUCCESS CRITERIA**

- [ ] Updater endpoint returns correct JSON format
- [ ] Version comparison works correctly
- [ ] File downloads work reliably
- [ ] Backward compatibility maintained
- [ ] Error handling implemented
- [ ] Security measures in place
- [ ] Performance is acceptable
- [ ] Monitoring and logging active

## 📞 **SUPPORT INFORMATION**

The LuminaKraft Launcher desktop app will:
- Check for updates on startup
- Show update dialog when available
- Download and install automatically
- Restart the app after update

The API must support this flow seamlessly for the best user experience.

---

**This implementation will enable fully automatic updates for the LuminaKraft Launcher desktop application!** 