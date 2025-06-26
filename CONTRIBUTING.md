# Contributing Guidelines for LuminaKraft Launcher

Thank you for your interest in contributing to LuminaKraft Launcher! To maintain an organized project and consistent codebase, please follow these guidelines.

## Getting Started

### Prerequisites

Before contributing, make sure you have the following installed:

- **Node.js** (v18 or higher) and **npm**
- **Rust** (latest stable version)
- **Tauri Prerequisites** for your operating system:
  - **Linux**: `build-essential`, `curl`, `wget`, `file`, `libssl-dev`, `libgtk-3-dev`, `libayatana-appindicator3-dev`, `librsvg2-dev`
  - **macOS**: Xcode Command Line Tools
  - **Windows**: Microsoft Visual Studio C++ Build Tools

### Project Setup

1. **Clone the repository:**
   ```bash
   git clone https://github.com/luminakraft/luminakraftlauncher.git
   cd luminakraftlauncher
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Run the development environment:**
   ```bash
   npm run tauri:dev
   ```

## Project Structure

LuminaKraft Launcher is built with:
- **Frontend**: React + TypeScript + Tailwind CSS
- **Backend**: Rust + Tauri framework
- **Build Tool**: Vite
- **Package Manager**: npm

```luminakraft-launcher/
├── src/                    # React frontend source code
│   ├── components/         # React components
│   ├── services/          # API and service layers
│   ├── types/             # TypeScript type definitions
│   └── contexts/          # React contexts
├── src-tauri/             # Tauri backend source code
│   ├── src/               # Rust source files
│   ├── Cargo.toml         # Rust dependencies
│   └── tauri.conf.json    # Tauri configuration
├── public/                # Static assets
└── scripts/               # Build and utility scripts
```

## Development Commands

- `npm run dev` - Start Vite development server
- `npm run tauri:dev` - Start Tauri development environment
- `npm run tauri:dev-stable` - Start development with port cleanup
- `npm run build` - Build frontend for production
- `npm run tauri:build` - Build complete Tauri application
- `npm run lint` - Run ESLint for code quality
- `npm run clean` - Clean build artifacts and caches

## Code Style and Formatting

Our project uses different tools and conventions for each part of the stack:

### Frontend (TypeScript / React)

**Tools:**
- **Formatter:** Prettier (auto-formats on save)
- **Linter:** ESLint with TypeScript and React plugins
- **Styling:** Tailwind CSS

**Naming Conventions:**

| Element | Format | Example |
| :--- | :--- | :--- |
| Variables, Functions, Methods | `camelCase` | `const modpackList` `function fetchModpacks()` |
| Components, Types, Interfaces | `PascalCase` | `function ModpackCard()` `interface Modpack` |
| Constants | `SCREAMING_SNAKE_CASE` | `const API_BASE_URL = "https://api.example.com"` |
| CSS Classes | `kebab-case` | `class="modpack-card"` |

**Example TypeScript/React Code:**

```tsx
import React, { useState } from 'react';
import { Download, Play } from 'lucide-react';

interface ModpackCardProps {
  modpack: Modpack;
  onInstall: (id: string) => void;
}

export function ModpackCard({ modpack, onInstall }: ModpackCardProps) {
  const [isInstalling, setIsInstalling] = useState(false);

  const handleInstall = async () => {
    setIsInstalling(true);
    try {
      await onInstall(modpack.id);
    } finally {
      setIsInstalling(false);
    }
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-4">
      <h3 className="text-lg font-semibold">{modpack.name}</h3>
      <p className="text-gray-600 dark:text-gray-300">Version: {modpack.version}</p>
      <button
        onClick={handleInstall}
        disabled={isInstalling}
        className="mt-2 flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded"
      >
        {isInstalling ? <Download className="animate-spin" /> : <Play />}
        {isInstalling ? 'Installing...' : 'Install'}
      </button>
    </div>
  );
}
```

### Backend (Rust / Tauri)

**Tools:**
- **Formatter:** `rustfmt` (run `cargo fmt`)
- **Linter:** `clippy` (run `cargo clippy`)

**Naming Conventions (Rust Standard):**

| Element | Format | Example |
| :--- | :--- | :--- |
| Functions, Variables, Modules | `snake_case` | `fn download_modpack()` `let file_path` |
| Structs, Enums, Traits | `PascalCase` | `struct ModpackInfo` `enum InstallState` |
| Constants | `SCREAMING_SNAKE_CASE` | `const MAX_DOWNLOAD_RETRIES: u32 = 3` |

**Example Rust Code:**

```rust
use serde::{Deserialize, Serialize};
use tauri::State;

#[derive(Debug, Serialize, Deserialize)]
pub struct ModpackInfo {
    pub id: String,
    pub name: String,
    pub version: String,
    pub download_url: String,
}

#[derive(Debug)]
pub enum InstallState {
    NotInstalled,
    Installing,
    Installed,
    Failed(String),
}

#[tauri::command]
pub async fn install_modpack(
    modpack_info: ModpackInfo,
    app_state: State<'_, AppState>,
) -> Result<String, String> {
    println!("Starting installation for modpack: {}", modpack_info.name);
    
    // Installation logic here
    
    Ok(format!("Successfully installed {}", modpack_info.name))
}
```

## Testing

### Frontend Tests
- Component tests should be written using React Testing Library
- Run tests with: `npm test`

### Backend Tests
- Unit tests should be written in Rust using the built-in test framework
- Run tests with: `cargo test` in the `src-tauri` directory

## Building and Releases

### Development Builds
```bash
npm run tauri:build
```

### Release Builds
We use automated release scripts:
```bash
npm run release:patch    # For bug fixes
npm run release:minor    # For new features
npm run release:major    # For breaking changes
```

### Cross-Platform Building
- Use the scripts in the `scripts/` directory for building on different platforms
- Docker builders are available for Linux and Windows cross-compilation

## Internationalization (i18n)

- Translation files are located in `src/locales/`
- Currently supporting English (`en`) and Spanish (`es`)
- Use the `useTranslation` hook from `react-i18next` in components
- Add new translation keys to both language files

## Minecraft Integration

This launcher uses the **Lyceris** library for Minecraft-specific functionality:
- Authentication (Microsoft accounts)
- Modpack installation and management  
- Game launching
- Asset and library management

When working with Minecraft-related features, refer to the Lyceris documentation and existing service files in `src/services/`.

## Pull Request Process

1. **Fork** the repository and create a feature branch
2. **Make your changes** following the code style guidelines
3. **Test your changes** thoroughly
4. **Update documentation** if necessary
5. **Commit your changes** with descriptive commit messages
6. **Sign off your commits** (see below)
7. **Submit a pull request** with a clear description

## Signing Your Work

To ensure compatibility with the project's license, all contributions must be signed off. Add the `-s` flag to your git commit:

```bash
git commit -s -m "Your commit message"
```

Or manually add this line to your commit message:
```
Signed-off-by: Your Name <your.email@example.com>
```

By signing off, you agree to the terms of the Developer's Certificate of Origin 1.1, certifying that you have the right to submit the code under the project's open source license.

## Questions or Issues?

- Check existing [GitHub Issues](https://github.com/LuminaKraft/luminakraft-launcher/issues)
- Join our community discussions
- Review the documentation in the `docs/` directory

Thank you for contributing to LuminaKraft Launcher!