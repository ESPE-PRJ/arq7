#!/bin/bash

# Script para ejecutar pruebas de integración
# Este script asegura que el sistema esté listo antes de ejecutar los tests

set -e

echo "🧪 Ejecutando Pruebas de Integración del Sistema E-commerce"
echo "=========================================================="

# Colores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Función para verificar que los servicios estén listos
check_services() {
    echo -e "${BLUE}📋 Verificando servicios...${NC}"
    
    local services=(
        "http://localhost:3000/health:API Gateway"
        "http://localhost:3000/api/health:Services Health"
        "http://localhost:3004/health:Notification Service"
    )
    
    for service_info in "${services[@]}"; do
        local url=$(echo $service_info | cut -d: -f1)
        local name=$(echo $service_info | cut -d: -f2)
        
        local max_attempts=30
        local attempt=0
        
        echo -e "   🔍 Verificando $name..."
        
        while [ $attempt -lt $max_attempts ]; do
            if curl -s -f "$url" > /dev/null 2>&1; then
                echo -e "   ${GREEN}✅ $name listo${NC}"
                break
            fi
            
            attempt=$((attempt + 1))
            if [ $attempt -eq $max_attempts ]; then
                echo -e "   ${RED}❌ $name no disponible después de $max_attempts intentos${NC}"
                return 1
            fi
            
            sleep 2
        done
    done
    
    echo -e "${GREEN}✅ Todos los servicios están listos${NC}"
}

# Función para instalar dependencias
install_dependencies() {
    echo -e "${BLUE}📦 Instalando dependencias de tests...${NC}"
    
    if [ ! -f package.json ]; then
        echo -e "${RED}❌ package.json no encontrado en directorio tests${NC}"
        exit 1
    fi
    
    npm install
    echo -e "${GREEN}✅ Dependencias instaladas${NC}"
}

# Función para ejecutar tests
run_tests() {
    local test_type=${1:-"all"}
    
    echo -e "${BLUE}🚀 Ejecutando pruebas de integración...${NC}"
    
    case $test_type in
        "all")
            echo -e "${YELLOW}   Ejecutando todas las pruebas...${NC}"
            npm test
            ;;
        "integration")
            echo -e "${YELLOW}   Ejecutando solo pruebas de integración...${NC}"
            npm run test:integration
            ;;
        "coverage")
            echo -e "${YELLOW}   Ejecutando pruebas con reporte de coverage...${NC}"
            npm run test:coverage
            ;;
        "watch")
            echo -e "${YELLOW}   Ejecutando en modo watch...${NC}"
            npm run test:watch
            ;;
        "ci")
            echo -e "${YELLOW}   Ejecutando en modo CI...${NC}"
            npm run test:ci
            ;;
        *)
            echo -e "${RED}❌ Tipo de test desconocido: $test_type${NC}"
            echo "Tipos disponibles: all, integration, coverage, watch, ci"
            exit 1
            ;;
    esac
}

# Función para generar reporte
generate_report() {
    echo -e "${BLUE}📊 Generando reporte de pruebas...${NC}"
    
    if [ -d coverage ]; then
        echo -e "${GREEN}✅ Reporte de coverage disponible en: ./coverage/lcov-report/index.html${NC}"
    fi
    
    if [ -f test-results.xml ]; then
        echo -e "${GREEN}✅ Resultados XML disponibles en: ./test-results.xml${NC}"
    fi
}

# Función para limpiar después de tests
cleanup() {
    echo -e "${BLUE}🧹 Limpieza post-tests...${NC}"
    
    # Opcional: limpiar datos de test de la base de datos
    # docker exec mongodb mongosh --eval "db.users.deleteMany({email: /test.*@ejemplo\.com/})"
    # docker exec mongodb mongosh --eval "db.orders.deleteMany({userEmail: /test.*@ejemplo\.com/})"
    
    echo -e "${GREEN}✅ Limpieza completada${NC}"
}

# Mostrar ayuda
show_help() {
    echo -e "${BLUE}🛠️  Script de Pruebas de Integración${NC}"
    echo "=================================="
    echo ""
    echo "Uso: $0 [tipo_de_test] [opciones]"
    echo ""
    echo "Tipos de test disponibles:"
    echo "  all         - Ejecutar todas las pruebas (default)"
    echo "  integration - Solo pruebas de integración"
    echo "  coverage    - Pruebas con reporte de coverage"
    echo "  watch       - Modo watch para desarrollo"
    echo "  ci          - Modo CI/CD"
    echo ""
    echo "Opciones:"
    echo "  --skip-check    - Omitir verificación de servicios"
    echo "  --no-cleanup    - No ejecutar limpieza post-tests"
    echo "  --help          - Mostrar esta ayuda"
    echo ""
    echo "Ejemplos:"
    echo "  $0 all"
    echo "  $0 coverage"
    echo "  $0 integration --skip-check"
    echo ""
}

# Verificar si Docker Compose está disponible
check_docker() {
    if ! command -v docker-compose &> /dev/null; then
        echo -e "${RED}❌ Docker Compose no está disponible${NC}"
        exit 1
    fi
    
    if ! docker-compose ps > /dev/null 2>&1; then
        echo -e "${RED}❌ No hay servicios de Docker Compose ejecutándose${NC}"
        echo -e "${YELLOW}💡 Ejecuta 'make start' o './scripts/setup.sh' primero${NC}"
        exit 1
    fi
}

# Función principal
main() {
    local test_type=${1:-"all"}
    local skip_check=false
    local no_cleanup=false
    
    # Procesar argumentos
    for arg in "$@"; do
        case $arg in
            --skip-check)
                skip_check=true
                shift
                ;;
            --no-cleanup)
                no_cleanup=true
                shift
                ;;
            --help)
                show_help
                exit 0
                ;;
        esac
    done
    
    echo -e "${GREEN}🚀 Iniciando ejecución de pruebas${NC}"
    echo "================================"
    echo ""
    
    # Verificar Docker
    check_docker
    
    # Verificar servicios (a menos que se omita)
    if [ "$skip_check" = false ]; then
        check_services
        echo ""
    fi
    
    # Instalar dependencias
    install_dependencies
    echo ""
    
    # Ejecutar tests
    run_tests "$test_type"
    local test_exit_code=$?
    echo ""
    
    # Generar reporte si los tests fueron exitosos
    if [ $test_exit_code -eq 0 ]; then
        generate_report
        echo ""
        echo -e "${GREEN}🎉 ¡Todas las pruebas pasaron exitosamente!${NC}"
    else
        echo -e "${RED}❌ Algunas pruebas fallaron${NC}"
    fi
    
    # Limpieza (a menos que se omita)
    if [ "$no_cleanup" = false ]; then
        cleanup
    fi
    
    exit $test_exit_code
}

# Cambiar al directorio de tests
cd "$(dirname "$0")"

# Ejecutar función principal con todos los argumentos
main "$@"