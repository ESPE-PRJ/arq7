#!/bin/bash

# Script de Configuración Inicial - Sistema E-commerce Microservicios
# Este script configura el entorno y despliega los servicios

set -e

echo "🚀 Configurando Sistema de E-commerce con Microservicios"
echo "======================================================="

# Verificar que Docker y Docker Compose están instalados
check_dependencies() {
    echo "📋 Verificando dependencias..."
    
    if ! command -v docker &> /dev/null; then
        echo "❌ Docker no está instalado. Por favor instalar Docker primero."
        exit 1
    fi
    
    if ! command -v docker-compose &> /dev/null; then
        echo "❌ Docker Compose no está instalado. Por favor instalar Docker Compose primero."
        exit 1
    fi
    
    echo "✅ Docker y Docker Compose están instalados."
}

# Crear archivo .env si no existe
setup_environment() {
    echo "🔧 Configurando variables de entorno..."
    
    if [ ! -f .env ]; then
        echo "📝 Creando archivo .env desde .env.example..."
        cp .env.example .env
        echo "⚠️  Por favor editar el archivo .env con tus configuraciones específicas"
    else
        echo "✅ Archivo .env ya existe."
    fi
}

# Crear directorios necesarios
create_directories() {
    echo "📁 Creando directorios necesarios..."
    
    mkdir -p monitoring/grafana
    mkdir -p nginx/conf.d
    mkdir -p logs
    
    echo "✅ Directorios creados."
}

# Construir imágenes Docker
build_images() {
    echo "🏗️  Construyendo imágenes Docker..."
    
    echo "   - API Gateway"
    docker-compose build api-gateway
    
    echo "   - User Service"
    docker-compose build user-service
    
    echo "   - Product Service"
    docker-compose build product-service
    
    echo "   - Order Service" 
    docker-compose build order-service
    
    echo "   - Notification Service"
    docker-compose build notification-service
    
    echo "✅ Todas las imágenes construidas exitosamente."
}

# Inicializar servicios de infraestructura
start_infrastructure() {
    echo "🔄 Iniciando servicios de infraestructura..."
    
    # Iniciar servicios de base de datos y mensajería primero
    docker-compose up -d mongodb postgres redis rabbitmq
    
    echo "⏳ Esperando a que los servicios de infraestructura estén listos..."
    sleep 30
    
    # Verificar que los servicios están healthy
    echo "🏥 Verificando salud de servicios de infraestructura..."
    
    max_attempts=30
    attempt=0
    
    while [ $attempt -lt $max_attempts ]; do
        if docker-compose ps | grep -E "(mongodb|postgres|redis|rabbitmq)" | grep -q "healthy"; then
            echo "✅ Servicios de infraestructura están listos."
            break
        fi
        
        echo "⏳ Esperando servicios... (intento $((attempt + 1))/$max_attempts)"
        sleep 10
        attempt=$((attempt + 1))
    done
    
    if [ $attempt -eq $max_attempts ]; then
        echo "❌ Timeout esperando servicios de infraestructura."
        exit 1
    fi
}

# Inicializar datos de prueba
seed_data() {
    echo "🌱 Inicializando datos de prueba..."
    
    # Esperar a que los servicios de aplicación estén listos
    sleep 15
    
    # Crear productos de prueba
    echo "   - Creando productos de prueba..."
    
    curl -X POST http://localhost:3000/api/products \
        -H "Content-Type: application/json" \
        -d '{
            "name": "Laptop HP Pavilion",
            "description": "Laptop para trabajo y estudio",
            "price": 799.99,
            "stock": 15,
            "category": "electronics",
            "sku": "LP-HP-PAV-001"
        }' > /dev/null 2>&1
    
    curl -X POST http://localhost:3000/api/products \
        -H "Content-Type: application/json" \
        -d '{
            "name": "Mouse Logitech M100",
            "description": "Mouse óptico USB",
            "price": 29.99,
            "stock": 50,
            "category": "accessories",
            "sku": "MS-LOG-M100-001"
        }' > /dev/null 2>&1
    
    curl -X POST http://localhost:3000/api/products \
        -H "Content-Type: application/json" \
        -d '{
            "name": "Smartphone Samsung Galaxy",
            "description": "Smartphone Android última generación",
            "price": 649.99,
            "stock": 25,
            "category": "electronics",
            "sku": "SP-SAM-GAL-001"
        }' > /dev/null 2>&1
    
    echo "✅ Datos de prueba inicializados."
}

# Iniciar todos los servicios
start_all_services() {
    echo "🚀 Iniciando todos los servicios..."
    
    docker-compose up -d
    
    echo "⏳ Esperando a que todos los servicios estén listos..."
    sleep 30
    
    echo "✅ Todos los servicios iniciados."
}

# Mostrar información de despliegue
show_deployment_info() {
    echo ""
    echo "🎉 ¡Despliegue Completado Exitosamente!"
    echo "======================================"
    echo ""
    echo "📋 Servicios Disponibles:"
    echo "   🌐 API Gateway:           http://localhost:3000"
    echo "   👤 User Service:          http://localhost:3000/api/users"
    echo "   📦 Product Service:       http://localhost:3000/api/products"
    echo "   📋 Order Service:         http://localhost:3000/api/orders"
    echo "   📧 Notification Service:  http://localhost:3004"
    echo ""
    echo "🛠️  Herramientas de Administración:"
    echo "   🐰 RabbitMQ Management:   http://localhost:15672 (admin/password123)"
    echo "   🍃 MongoDB:               mongodb://localhost:27017 (admin/password123)"
    echo "   🐘 PostgreSQL:            localhost:5432 (postgres/password)"
    echo "   🔴 Redis:                 localhost:6379"
    echo ""
    echo "📚 Documentación:"
    echo "   📖 API Docs:              ./API-DOCUMENTATION.md"
    echo "   🏗️  Arquitectura:          ./architecture-diagrams.md"
    echo ""
    echo "🔧 Comandos Útiles:"
    echo "   📊 Estado servicios:      docker-compose ps"
    echo "   📋 Logs de servicios:     docker-compose logs -f [servicio]"
    echo "   🛑 Detener servicios:     docker-compose down"
    echo "   🔄 Reiniciar servicios:   docker-compose restart"
    echo ""
    echo "🧪 Test de Funcionamiento:"
    echo "   curl http://localhost:3000/health"
    echo "   curl http://localhost:3000/api/health"
    echo ""
}

# Función principal
main() {
    check_dependencies
    setup_environment
    create_directories
    build_images
    start_infrastructure
    start_all_services
    seed_data
    show_deployment_info
}

# Ejecutar función principal
main