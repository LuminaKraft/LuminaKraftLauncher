# Memory Optimization Guide for Cross-Compilation

This guide documents the solutions implemented to fix SIGBUS (memory access violation) errors during cross-compilation of the LuminaKraft Launcher.

## Problem Description

SIGBUS errors were occurring during Rust compilation when cross-compiling for Windows and Linux targets from macOS. These errors manifest as:

```
error: rustc interrupted by SIGBUS, printing backtrace
process didn't exit successfully: (signal: 7, SIGBUS: access to undefined memory)
```

## Root Causes

1. **Memory Pressure**: Docker containers running out of available memory during compilation
2. **Parallel Compilation**: Too many parallel compilation jobs overwhelming system resources
3. **Linker Memory Usage**: GNU linker consuming excessive memory during linking phase
4. **Docker Resource Limits**: Insufficient or improperly configured Docker resource constraints

## Solutions Implemented

### 1. Cargo Configuration Optimizations (`src-tauri/.cargo/config.toml`)

```toml
[build]
codegen-units = 1
jobs = 2  # Limit parallel jobs

[target.x86_64-pc-windows-gnu]
rustflags = [
    "-C", "link-arg=-Wl,--no-gc-sections", 
    "-C", "link-arg=-llzma", 
    "-C", "link-arg=-Wl,--allow-multiple-definition",
    "-C", "link-arg=-Wl,--no-keep-memory",      # Reduce linker memory usage
    "-C", "link-arg=-Wl,--reduce-memory-overheads",  # Further memory optimization
    "-C", "codegen-units=1",
    "-C", "opt-level=1"
]

[profile.release]
lto = "thin"        # Thin LTO for better memory usage
panic = "abort"     # Reduce binary size
```

### 2. Docker Container Optimizations

#### Memory Limits
- **Memory Limit**: Reduced from 8GB to 6GB to prevent overcommitment
- **Memory Swap**: Reduced from 12GB to 8GB
- **SHM Size**: Reduced from 2GB to 1GB
- **CPU Limit**: Set to 2.0 cores to prevent resource contention

#### Docker Run Command
```bash
docker run --rm \
    -m 6g \
    --memory-swap 8g \
    --shm-size=1g \
    --cpus="2.0" \
    --oom-kill-disable=false \
    --memory-swappiness=10 \
    # ... other options
```

### 3. Environment Variables

#### Cargo Environment Variables
```bash
CARGO_BUILD_JOBS=2                    # Limit parallel compilation
CARGO_NET_GIT_FETCH_WITH_CLI=true     # Use CLI for git operations
RUSTC_FORCE_INCREMENTAL=1             # Force incremental compilation
CARGO_HTTP_TIMEOUT=300                # Increase timeout for slow networks
CARGO_HTTP_MULTIPLEXING=false         # Disable HTTP multiplexing
```

#### System Limits
```bash
ulimit -v 6291456  # Limit virtual memory to 6GB
```

### 4. Dockerfile Improvements

#### Base Image and Dependencies
- Use Ubuntu 22.04 for better stability
- Clean up package lists after installation to reduce image size
- Install specific Rust version (1.76.0) for stability

#### Memory Optimization Environment Variables
```dockerfile
ENV CARGO_NET_GIT_FETCH_WITH_CLI=true \
    CARGO_BUILD_JOBS=2 \
    RUSTFLAGS="-C link-arg=-Wl,--no-keep-memory -C link-arg=-Wl,--reduce-memory-overheads"
```

#### System Limits Configuration
```dockerfile
RUN echo "* soft memlock unlimited" >> /etc/security/limits.conf && \
    echo "* hard memlock unlimited" >> /etc/security/limits.conf && \
    echo "* soft nofile 65536" >> /etc/security/limits.conf && \
    echo "* hard nofile 65536" >> /etc/security/limits.conf
```

### 5. Build Process Improvements

#### Sequential Building
- Build platforms sequentially instead of parallel to avoid resource conflicts
- Add 10-second delays between builds to allow memory cleanup
- Clean Docker environment before each cross-compilation build

#### Docker Cleanup Script (`scripts/clean-docker.sh`)
```bash
#!/bin/bash
docker rmi -f windows-builder linux-builder 2>/dev/null || true
docker system prune -f
docker builder prune -f
docker image prune -f
docker volume prune -f
```

## Usage Instructions

### Building Windows Target
```bash
# Clean build (recommended)
bash scripts/clean-docker.sh
bash scripts/build-windows.sh

# Or use the integrated build script
bash scripts/build-all.sh
# Select option 3 for Windows only
```

### Building All Platforms
```bash
# Sequential build with memory optimization
bash scripts/build-all.sh all

# Or interactive menu
bash scripts/build-all.sh
# Select option 1 for all platforms
```

## Monitoring and Troubleshooting

### Check Docker Resource Usage
```bash
# Monitor Docker stats during build
docker stats

# Check Docker system information
docker system df
```

### Memory Usage Monitoring
```bash
# Monitor system memory during build
watch -n 1 'free -h && echo "--- Docker ---" && docker stats --no-stream'
```

### Common Issues and Solutions

#### Issue: Still getting SIGBUS errors
**Solutions:**
1. Reduce memory limits further (try 4GB limit, 6GB swap)
2. Increase system swap space
3. Close other memory-intensive applications
4. Try building one target at a time

#### Issue: Docker build fails with "no space left on device"
**Solutions:**
1. Run `docker system prune -a` to clean up
2. Increase Docker disk space allocation
3. Clean up old Docker images and containers

#### Issue: Build is very slow
**Solutions:**
1. This is expected with memory optimizations
2. Consider increasing memory limits if system allows
3. Use incremental builds when possible

## Performance Impact

The memory optimizations will result in:
- **Slower build times**: 2-3x longer due to reduced parallelism
- **Higher reliability**: Significantly reduced SIGBUS errors
- **Better resource usage**: More predictable memory consumption
- **Improved stability**: Less likely to crash on resource-constrained systems

## System Requirements

### Minimum Requirements
- **RAM**: 8GB system memory
- **Docker Memory**: 6GB allocated to Docker
- **Disk Space**: 10GB free space for Docker builds
- **CPU**: 2+ cores recommended

### Recommended Requirements
- **RAM**: 16GB system memory
- **Docker Memory**: 8GB allocated to Docker
- **Disk Space**: 20GB free space
- **CPU**: 4+ cores for better performance

## Verification

After implementing these fixes, successful builds should:
1. Complete without SIGBUS errors
2. Produce valid executables for target platforms
3. Show controlled memory usage in Docker stats
4. Complete within reasonable time limits (15-30 minutes per platform)

## Additional Resources

- [Docker Memory Management](https://docs.docker.com/config/containers/resource_constraints/)
- [Rust Cargo Configuration](https://doc.rust-lang.org/cargo/reference/config.html)
- [GNU Linker Options](https://sourceware.org/binutils/docs/ld/Options.html)
- [Tauri Cross-Compilation Guide](https://tauri.app/v1/guides/building/cross-platform/) 