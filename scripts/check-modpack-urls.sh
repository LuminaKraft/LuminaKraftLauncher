#!/bin/bash

# LuminaKraft Modpack URL Checker v1.0
# Script para verificar qué mods de un modpack de CurseForge tienen URLs vacías
# 
# Uso: ./check-modpack-urls.sh <archivo-modpack.zip>
#
# Este script:
# 1. Extrae y lee el manifest.json del modpack
# 2. Consulta la API de LuminaKraft para obtener información de todos los mods
# 3. Identifica qué mods tienen URLs vacías
# 4. Proporciona enlaces directos para descargar los mods manualmente
# 5. Instruye sobre cómo agregarlos a overrides/

set -e  # Salir en caso de error

# Colores para la salida
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Variables globales
# DEPRECATED: Old API system, should migrate to Supabase Edge Functions
API_BASE="https://api.luminakraft.com/v1/curseforge"
TEMP_DIR=""
MODPACK_ZIP=""
MANIFEST_FILE=""

# Emojis (compatibles con la mayoría de terminales)
EMOJI_SEARCH="🔍"
EMOJI_PACKAGE="📦"
EMOJI_GAME="🎮"
EMOJI_TOOL="🔧"
EMOJI_CHART="📊"
EMOJI_FOLDER="📁"
EMOJI_LOADING="⏳"
EMOJI_NETWORK="🌐"
EMOJI_WARNING="⚠️"
EMOJI_SUCCESS="✅"
EMOJI_ERROR="❌"
EMOJI_INFO="📝"
EMOJI_LINK="🔗"
EMOJI_PARTY="🎉"
EMOJI_SUMMARY="📋"

# Función para mostrar ayuda
show_help() {
    echo -e "${EMOJI_SEARCH} LuminaKraft Modpack URL Checker v1.0"
    echo "======================================"
    echo ""
    echo "Uso: $0 <archivo-modpack.zip>"
    echo ""
    echo "Ejemplo:"
    echo "  $0 mi-modpack-1.0.0.zip"
    echo ""
    echo "Este script verifica qué mods de tu modpack de CurseForge tienen URLs vacías"
    echo "y necesitan ser descargados manualmente para incluirlos en overrides/mods/"
    echo ""
    echo "Requisitos del sistema:"
    echo "• unzip (para extraer archivos ZIP)"
    echo "• curl (para hacer peticiones HTTP)"
    echo "• jq (para procesar JSON)"
    echo ""
}

# Función para verificar dependencias
check_dependencies() {
    local missing_deps=()
    
    if ! command -v unzip &> /dev/null; then
        missing_deps+=("unzip")
    fi
    
    if ! command -v curl &> /dev/null; then
        missing_deps+=("curl")
    fi
    
    if ! command -v jq &> /dev/null; then
        missing_deps+=("jq")
    fi
    
    if [ ${#missing_deps[@]} -ne 0 ]; then
        echo -e "${EMOJI_ERROR} Faltan dependencias requeridas: ${missing_deps[*]}"
        echo ""
        echo "Para instalar en Ubuntu/Debian:"
        echo "  sudo apt update && sudo apt install unzip curl jq"
        echo ""
        echo "Para instalar en macOS (con Homebrew):"
        echo "  brew install jq"
        echo ""
        echo "Para instalar en CentOS/RHEL/Fedora:"
        echo "  sudo yum install unzip curl jq"
        echo ""
        exit 1
    fi
}

# Función para validar argumentos
validate_args() {
    if [ $# -eq 0 ] || [ "$1" = "-h" ] || [ "$1" = "--help" ]; then
        show_help
        exit 0
    fi
    
    if [ $# -ne 1 ]; then
        echo -e "${EMOJI_ERROR} Error: Debes proporcionar exactamente un archivo ZIP"
        echo ""
        show_help
        exit 1
    fi
    
    MODPACK_ZIP="$1"
    
    if [ ! -f "$MODPACK_ZIP" ]; then
        echo -e "${EMOJI_ERROR} Error: El archivo '$MODPACK_ZIP' no existe"
        exit 1
    fi
    
    if [[ ! "$MODPACK_ZIP" =~ \.zip$ ]]; then
        echo -e "${EMOJI_ERROR} Error: El archivo debe tener extensión .zip"
        exit 1
    fi
}

# Función para crear directorio temporal
setup_temp_dir() {
    TEMP_DIR=$(mktemp -d)
    echo -e "${EMOJI_INFO} Directorio temporal: $TEMP_DIR"
    
    # Limpiar al salir
    trap cleanup EXIT
}

# Función de limpieza
cleanup() {
    if [ -n "$TEMP_DIR" ] && [ -d "$TEMP_DIR" ]; then
        rm -rf "$TEMP_DIR"
    fi
}

# Función para extraer manifest.json
extract_manifest() {
    echo -e "${EMOJI_LOADING} Extrayendo manifest.json..."
    
    # Extraer solo el manifest.json al directorio temporal
    if ! unzip -q "$MODPACK_ZIP" "manifest.json" -d "$TEMP_DIR"; then
        echo -e "${EMOJI_ERROR} Error: No se pudo extraer manifest.json del modpack"
        echo "Verifica que el archivo sea un modpack válido de CurseForge"
        exit 1
    fi
    
    MANIFEST_FILE="$TEMP_DIR/manifest.json"
    
    if [ ! -f "$MANIFEST_FILE" ]; then
        echo -e "${EMOJI_ERROR} Error: No se encontró manifest.json en el modpack"
        exit 1
    fi
    
    echo -e "${EMOJI_SUCCESS} Manifest extraído correctamente"
}

# Función para mostrar información del modpack
show_modpack_info() {
    local name=$(jq -r '.name' "$MANIFEST_FILE")
    local version=$(jq -r '.version' "$MANIFEST_FILE")
    local mc_version=$(jq -r '.minecraft.version' "$MANIFEST_FILE")
    local modloader=$(jq -r '.minecraft.modLoaders[0].id // "Unknown"' "$MANIFEST_FILE")
    local mod_count=$(jq '.files | length' "$MANIFEST_FILE")
    
    echo ""
    echo -e "${EMOJI_PACKAGE} Modpack: $name v$version"
    echo -e "${EMOJI_GAME} Minecraft: $mc_version"
    echo -e "${EMOJI_TOOL} ModLoader: $modloader"
    echo -e "${EMOJI_CHART} Total de mods: $mod_count"
    echo ""
}

# Función para hacer peticiones a la API en batches
fetch_mods_info() {
    echo -e "${EMOJI_NETWORK} Consultando API de LuminaKraft..."
    
    # Extraer file IDs del manifest
    local file_ids=($(jq -r '.files[].fileID' "$MANIFEST_FILE"))
    local total_mods=${#file_ids[@]}
    local batch_size=50
    local all_mods_file="$TEMP_DIR/all_mods.json"
    
    echo "[]" > "$all_mods_file"
    
    echo -e "📡 Consultando $total_mods mods en batches de $batch_size..."
    
    for ((i=0; i<$total_mods; i+=batch_size)); do
        local batch_end=$((i + batch_size - 1))
        if [ $batch_end -ge $total_mods ]; then
            batch_end=$((total_mods - 1))
        fi
        
        local batch_num=$(((i / batch_size) + 1))
        local total_batches=$(((total_mods + batch_size - 1) / batch_size))
        local batch_count=$((batch_end - i + 1))
        
        echo "   📦 Batch $batch_num/$total_batches ($batch_count mods)"
        
        # Crear array JSON con los file IDs del batch
        local batch_ids=""
        for ((j=i; j<=batch_end; j++)); do
            if [ $j -eq $i ]; then
                batch_ids="${file_ids[j]}"
            else
                batch_ids="$batch_ids,${file_ids[j]}"
            fi
        done
        
        # Hacer petición HTTP
        local request_body="{\"fileIds\": [$batch_ids]}"
        local response_file="$TEMP_DIR/batch_response_$batch_num.json"
        
        if curl -s -X POST \
            -H "Content-Type: application/json" \
            -H "User-Agent: LuminaKraft-ModpackChecker/1.0" \
            -d "$request_body" \
            "$API_BASE/mods/files" \
            -o "$response_file"; then
            
            # Verificar si la respuesta es válida
            if jq -e '.data' "$response_file" > /dev/null 2>&1; then
                # Combinar con resultados anteriores
                jq -s '.[0] + .[1].data' "$all_mods_file" "$response_file" > "$TEMP_DIR/temp_combined.json"
                mv "$TEMP_DIR/temp_combined.json" "$all_mods_file"
            else
                echo "      ⚠️  Warning: Respuesta inválida en batch $batch_num"
            fi
        else
            echo "      ⚠️  Warning: Error de red en batch $batch_num"
        fi
        
        # Delay entre batches para evitar rate limiting
        if [ $((i + batch_size)) -lt $total_mods ]; then
            sleep 0.5
        fi
    done
    
    local fetched_count=$(jq 'length' "$all_mods_file")
    echo -e "${EMOJI_SUCCESS} Obtenida información de $fetched_count/$total_mods mods"
    echo ""
}

# Función para analizar URLs de mods
analyze_mod_urls() {
    echo -e "${EMOJI_SEARCH} Analizando URLs de descarga..."
    
    local manifest_file="$MANIFEST_FILE"
    local mods_file="$TEMP_DIR/all_mods.json"
    local results_file="$TEMP_DIR/analysis_results.json"
    
    # Crear análisis usando jq
    jq --slurpfile mods "$mods_file" '
    {
        manifest_files: .files,
        api_mods: $mods[0]
    } |
    .manifest_files as $manifest |
    .api_mods as $api |
    
    # Crear mapeo de fileID a manifest
    ($manifest | map({(.fileID | tostring): .}) | add) as $manifest_map |
    
    # Procesar cada mod de la API
    ($api | map(
        . as $mod |
        $manifest_map[($mod.id | tostring)] as $manifest_entry |
        if $manifest_entry then
            {
                projectId: $manifest_entry.projectID,
                fileId: $mod.id,
                fileName: $mod.fileName,
                displayName: $mod.displayName,
                downloadUrl: $mod.downloadUrl,
                isAvailable: $mod.isAvailable,
                fileStatus: $mod.fileStatus,
                curseforgeUrl: "https://www.curseforge.com/minecraft/mc-mods/project-\($manifest_entry.projectID)/files/\($mod.id)",
                hasUrl: (($mod.downloadUrl // "") != "")
            }
        else
            empty
        end
    )) as $processed_mods |
    
    # Encontrar mods no encontrados en la API
    ($manifest | map(select(.fileID as $fid | ($api | map(.id) | contains([$fid]) | not))) | map({
        projectId: .projectID,
        fileId: .fileID,
        curseforgeUrl: "https://www.curseforge.com/minecraft/mc-mods/project-\(.projectID)/files/\(.fileID)"
    })) as $not_found |
    
    {
        total: ($manifest | length),
        with_urls: ($processed_mods | map(select(.hasUrl))),
        empty_urls: ($processed_mods | map(select(.hasUrl | not))),
        not_found: $not_found,
        api_errors: (($manifest | length) - ($api | length))
    }
    ' "$manifest_file" > "$results_file"
    
    echo -e "${EMOJI_SUCCESS} Análisis completado"
    echo ""
}

# Función para obtener texto del estado del archivo
get_file_status_text() {
    case $1 in
        1) echo "Processing" ;;
        2) echo "ChangesRequired" ;;
        3) echo "UnderReview" ;;
        4) echo "Approved" ;;
        5) echo "Rejected" ;;
        6) echo "MalwareDetected" ;;
        7) echo "Deleted" ;;
        8) echo "Archived" ;;
        9) echo "Testing" ;;
        10) echo "Released" ;;
        11) echo "ReadyForReview" ;;
        12) echo "Deprecated" ;;
        13) echo "Baking" ;;
        14) echo "AwaitingPublishing" ;;
        15) echo "FailedPublishing" ;;
        *) echo "Unknown" ;;
    esac
}

# Función para mostrar resultados
display_results() {
    local results_file="$TEMP_DIR/analysis_results.json"
    
    echo -e "${EMOJI_CHART} RESULTADO DEL ANÁLISIS"
    echo "========================="
    echo ""
    
    # Estadísticas generales
    local total=$(jq '.total' "$results_file")
    local with_urls_count=$(jq '.with_urls | length' "$results_file")
    local empty_urls_count=$(jq '.empty_urls | length' "$results_file")
    local not_found_count=$(jq '.not_found | length' "$results_file")
    local api_errors=$(jq '.api_errors' "$results_file")
    
    local with_urls_pct=$((with_urls_count * 100 / total))
    local empty_urls_pct=$((empty_urls_count * 100 / total))
    
    echo -e "📈 Estadísticas:"
    echo "   • Total de mods: $total"
    echo "   • Con URL válida: $with_urls_count ($with_urls_pct%)"
    echo "   • URL vacía: $empty_urls_count ($empty_urls_pct%)"
    echo "   • No encontrados: $not_found_count"
    if [ "$api_errors" -gt 0 ]; then
        echo "   • Errores de API: $api_errors"
    fi
    echo ""
    
    # Mods con URLs vacías
    if [ "$empty_urls_count" -gt 0 ]; then
        echo -e "${EMOJI_WARNING} MODS CON URL VACÍA - REQUIEREN DESCARGA MANUAL"
        echo "===================================================="
        echo ""
        echo "Los siguientes mods necesitan ser descargados manualmente y agregados a overrides/mods/:"
        echo ""
        
        # Mostrar cada mod con URL vacía
        jq -r '.empty_urls[] | 
            "• 📄 " + (.displayName // .fileName // "Nombre desconocido") + "\n" +
            "  Archivo: " + (.fileName // "N/A") + "\n" +
            "  Project ID: " + (.projectId | tostring) + "\n" +
            "  File ID: " + (.fileId | tostring) + "\n" +
            "  Estado: " + (.fileStatus | tostring) + "\n" +
            "  Disponible: " + (if .isAvailable then "Sí" else "No" end) + "\n" +
            "  🔗 Descargar desde: " + .curseforgeUrl + "\n"
        ' "$results_file" | while IFS= read -r line; do
            # Procesar estado del archivo
            if [[ $line =~ Estado:\ ([0-9]+) ]]; then
                local status="${BASH_REMATCH[1]}"
                local status_text=$(get_file_status_text "$status")
                line=$(echo "$line" | sed "s/Estado: $status/Estado: $status_text ($status)/")
            fi
            echo "$line"
        done
        
        echo -e "${EMOJI_INFO} INSTRUCCIONES:"
        echo "=================="
        echo "1. Visita cada enlace de arriba"
        echo "2. Descarga el archivo del mod"
        echo "3. Crea la carpeta overrides/mods/ en tu modpack si no existe"
        echo "4. Coloca los archivos .jar descargados en overrides/mods/"
        echo "5. Reempaqueta tu modpack con los overrides incluidos"
        echo ""
    else
        echo -e "${EMOJI_SUCCESS} ¡EXCELENTE! Todos los mods tienen URLs válidas"
        echo "=============================================="
        echo "No necesitas descargar ningún mod manualmente."
        echo ""
    fi
    
    # Mods no encontrados
    if [ "$not_found_count" -gt 0 ]; then
        echo -e "${EMOJI_SEARCH} MODS NO ENCONTRADOS EN LA API"
        echo "================================="
        echo "Los siguientes mods no se pudieron consultar (posiblemente eliminados):"
        echo ""
        
        jq -r '.not_found[] | 
            "• Project ID: " + (.projectId | tostring) + ", File ID: " + (.fileId | tostring) + "\n" +
            "  🔗 Verificar en: " + .curseforgeUrl + "\n"
        ' "$results_file"
    fi
    
    # Resumen final
    if [ "$empty_urls_count" -eq 0 ] && [ "$not_found_count" -eq 0 ]; then
        echo -e "${EMOJI_PARTY} TU MODPACK ESTÁ LISTO PARA SUBIR!"
        echo "===================================="
        echo "Todos los mods pueden descargarse automáticamente."
    else
        echo -e "${EMOJI_SUMMARY} RESUMEN DE ACCIONES NECESARIAS:"
        echo "=================================="
        if [ "$empty_urls_count" -gt 0 ]; then
            echo "• Descargar manualmente $empty_urls_count mod(s) y agregarlos a overrides/mods/"
        fi
        if [ "$not_found_count" -gt 0 ]; then
            echo "• Verificar $not_found_count mod(s) no encontrados"
        fi
    fi
    
    echo ""
    echo -e "${EMOJI_TOOL} Script completado."
}

# Función principal
main() {
    echo -e "${EMOJI_SEARCH} LuminaKraft Modpack URL Checker v1.0"
    echo "====================================="
    echo ""
    
    # Validar argumentos
    validate_args "$@"
    
    # Verificar dependencias
    check_dependencies
    
    echo -e "${EMOJI_FOLDER} Procesando modpack: $(basename "$MODPACK_ZIP")"
    
    # Configurar directorio temporal
    setup_temp_dir
    
    # Extraer manifest
    extract_manifest
    
    # Mostrar información del modpack
    show_modpack_info
    
    # Obtener información de mods
    fetch_mods_info
    
    # Analizar URLs
    analyze_mod_urls
    
    # Mostrar resultados
    display_results
}

# Ejecutar función principal con todos los argumentos
main "$@" 