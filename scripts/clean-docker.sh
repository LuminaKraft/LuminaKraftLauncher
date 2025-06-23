#!/bin/bash
set -e

echo "--- Cleaning Docker Environment ---"

# Remove existing builder images
echo "Removing existing builder images..."
docker rmi -f windows-builder 2>/dev/null || echo "No windows-builder image found"
docker rmi -f linux-builder 2>/dev/null || echo "No linux-builder image found"
docker rmi -f luminakraft-windows-builder 2>/dev/null || echo "No luminakraft-windows-builder image found"
docker rmi -f luminakraft-linux-builder 2>/dev/null || echo "No luminakraft-linux-builder image found"

# Clean up Docker system
echo "Cleaning Docker system..."
docker system prune -f

# Clean up build cache
echo "Cleaning Docker build cache..."
docker builder prune -f

# Remove dangling images
echo "Removing dangling images..."
docker image prune -f

# Clean up volumes
echo "Cleaning up volumes..."
docker volume prune -f

echo "Docker environment cleaned successfully!"
echo "Next build will use fresh Docker images." 