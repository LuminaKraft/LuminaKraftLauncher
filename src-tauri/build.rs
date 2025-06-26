fn main() {
    // Check if we're cross-compiling for Windows
    if std::env::var("CARGO_CFG_TARGET_OS").unwrap_or_default() == "windows" {
        // Try to link statically first, fallback to dynamic
        println!("cargo:rustc-link-lib=static=lzma");
        println!("cargo:rustc-link-search=native=/usr/x86_64-w64-mingw32/lib");
        println!("cargo:rustc-link-arg=-Wl,--allow-multiple-definition");
        
        // Ensure static linking for compression libraries when possible
        println!("cargo:rustc-env=LZMA_API_STATIC=1");
        println!("cargo:rustc-env=XZ_STATIC=1");
    }

    tauri_build::build()
}
