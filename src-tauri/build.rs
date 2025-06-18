fn main() {
    // Check if we're cross-compiling for Windows
    if std::env::var("CARGO_CFG_TARGET_OS").unwrap_or_default() == "windows" {
        // Link against liblzma
        println!("cargo:rustc-link-lib=lzma");
        println!("cargo:rustc-link-search=native=/usr/x86_64-w64-mingw32/lib");
        println!("cargo:rustc-link-arg=-Wl,--allow-multiple-definition");
    }

    tauri_build::build()
}
