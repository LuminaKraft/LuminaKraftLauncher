#!/bin/bash
set -e
cd /app
npm install
npm run tauri build -- --target x86_64-pc-windows-gnu
