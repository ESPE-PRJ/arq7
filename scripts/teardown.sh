#!/bin/bash

# Script de Limpieza - Sistema E-commerce Microservicios
# Este script detiene y limpia todos los recursos

set -e

echo "🧹 Limpiando Sistema de E-commerce con Microservicios"
echo "===================================================="

# Detener todos los servicios
stop_services() {
    echo "🛑 Deteniendo todos los servicios..."
    
    if docker-compose ps -q | grep -q .; then
        docker-compose down
        echo "✅ Servicios detenidos."
    else
        echo "ℹ️  No hay servicios ejecutándose."
    fi
}

# Limpiar volúmenes (opcional)
clean_volumes() {
    read -p "🗑️  ¿Deseas eliminar los volúmenes de datos? (esto borrará todos los datos) [y/N]: " -n 1 -r
    echo
    
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo "🗑️  Eliminando volúmenes..."
        docker-compose down -v
        echo "✅ Volúmenes eliminados."
    else
        echo "ℹ️  Volúmenes conservados."
    fi
}

# Limpiar imágenes
clean_images() {
    read -p "🗑️  ¿Deseas eliminar las imágenes construidas? [y/N]: " -n 1 -r
    echo
    
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo "🗑️  Eliminando imágenes..."
        
        # Obtener nombres de las imágenes del proyecto
        IMAGES=$(docker images --filter=reference="arq_*" -q)
        
        if [ ! -z "$IMAGES" ]; then
            docker rmi $IMAGES
            echo "✅ Imágenes eliminadas."
        else
            echo "ℹ️  No hay imágenes del proyecto para eliminar."
        fi
    else
        echo "ℹ️  Imágenes conservadas."
    fi
}

# Limpiar red
clean_network() {
    echo "🗑️  Limpiando redes Docker..."
    
    # Eliminar redes huérfanas del proyecto
    NETWORKS=$(docker network ls --filter name=arq --format "{{.ID}}")
    
    if [ ! -z "$NETWORKS" ]; then
        for network in $NETWORKS; do
            docker network rm $network 2>/dev/null || true
        done
        echo "✅ Redes limpiadas."
    else
        echo "ℹ️  No hay redes del proyecto para limpiar."
    fi
}

# Limpiar logs
clean_logs() {
    read -p "🗑️  ¿Deseas eliminar los archivos de logs? [y/N]: " -n 1 -r
    echo
    
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo "🗑️  Eliminando logs..."
        
        if [ -d "logs" ]; then
            rm -rf logs/*
            echo "✅ Logs eliminados."
        else
            echo "ℹ️  No hay directorio de logs."
        fi
        
        # Limpiar logs de servicios individuales
        find . -name "*.log" -type f -delete 2>/dev/null || true
        
    else
        echo "ℹ️  Logs conservados."
    fi
}

# Mostrar estado final
show_cleanup_status() {
    echo ""
    echo "✨ Estado de Limpieza"
    echo "===================="
    echo ""
    
    echo "🐳 Contenedores en ejecución:"
    RUNNING_CONTAINERS=$(docker ps --filter name=arq -q | wc -l)
    echo "   Contenedores del proyecto: $RUNNING_CONTAINERS"
    
    echo ""
    echo "💾 Volúmenes:"
    VOLUMES=$(docker volume ls --filter name=arq -q | wc -l)
    echo "   Volúmenes del proyecto: $VOLUMES"
    
    echo ""
    echo "🖼️  Imágenes:"
    IMAGES=$(docker images --filter=reference="arq_*" -q | wc -l)
    echo "   Imágenes del proyecto: $IMAGES"
    
    echo ""
    echo "🔗 Redes:"
    NETWORKS=$(docker network ls --filter name=arq -q | wc -l)
    echo "   Redes del proyecto: $NETWORKS"
    
    echo ""
    if [ $RUNNING_CONTAINERS -eq 0 ] && [ $VOLUMES -eq 0 ] && [ $IMAGES -eq 0 ] && [ $NETWORKS -eq 0 ]; then
        echo "🎉 ¡Limpieza completa! Todos los recursos han sido eliminados."
    else
        echo "ℹ️  Algunos recursos fueron conservados según tu elección."
    fi
    echo ""
}

# Función principal
main() {
    echo "Este script detendrá y limpiará el sistema de microservicios."
    echo ""
    
    stop_services
    echo ""
    
    clean_volumes
    echo ""
    
    clean_images
    echo ""
    
    clean_network
    echo ""
    
    clean_logs
    echo ""
    
    show_cleanup_status
}

# Ejecutar función principal
main