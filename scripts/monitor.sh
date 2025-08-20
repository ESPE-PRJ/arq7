#!/bin/bash

# Script de Monitoreo - Sistema E-commerce Microservicios
# Este script proporciona comandos útiles para monitorear el sistema

set -e

# Colores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Mostrar estado de servicios
show_services_status() {
    echo -e "${BLUE}📊 Estado de Servicios${NC}"
    echo "====================="
    echo ""
    
    # Verificar estado de contenedores
    if ! docker-compose ps > /dev/null 2>&1; then
        echo -e "${RED}❌ Docker Compose no está disponible o no hay servicios configurados${NC}"
        return 1
    fi
    
    echo -e "${YELLOW}🐳 Contenedores:${NC}"
    docker-compose ps
    echo ""
    
    # Verificar salud de servicios
    echo -e "${YELLOW}🏥 Health Checks:${NC}"
    
    services=("api-gateway:3000" "user-service:3001" "product-service:3002" "order-service:3003" "notification-service:3004")
    
    for service in "${services[@]}"; do
        name=$(echo $service | cut -d: -f1)
        port=$(echo $service | cut -d: -f2)
        
        if curl -s -f "http://localhost:${port}/health" > /dev/null 2>&1; then
            echo -e "   ${GREEN}✅ ${name}${NC}"
        else
            echo -e "   ${RED}❌ ${name}${NC}"
        fi
    done
    echo ""
}

# Mostrar logs en tiempo real
show_logs() {
    local service=$1
    
    if [ -z "$service" ]; then
        echo -e "${YELLOW}📋 Logs de todos los servicios:${NC}"
        docker-compose logs -f --tail=50
    else
        echo -e "${YELLOW}📋 Logs de ${service}:${NC}"
        docker-compose logs -f --tail=50 "$service"
    fi
}

# Mostrar métricas de recursos
show_resource_metrics() {
    echo -e "${BLUE}📈 Métricas de Recursos${NC}"
    echo "======================="
    echo ""
    
    echo -e "${YELLOW}💾 Uso de Memoria por Contenedor:${NC}"
    docker stats --no-stream --format "table {{.Container}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.MemPerc}}" \
        $(docker-compose ps -q) 2>/dev/null || echo "No hay contenedores ejecutándose"
    echo ""
    
    echo -e "${YELLOW}💿 Uso de Volúmenes:${NC}"
    docker system df -v | grep -A 10 "Local Volumes:"
    echo ""
}

# Probar conectividad entre servicios
test_connectivity() {
    echo -e "${BLUE}🔍 Pruebas de Conectividad${NC}"
    echo "=========================="
    echo ""
    
    # Test API Gateway health
    echo -e "${YELLOW}🌐 Probando API Gateway:${NC}"
    if curl -s -f http://localhost:3000/health > /dev/null; then
        echo -e "   ${GREEN}✅ API Gateway OK${NC}"
        
        # Test service health through gateway
        echo -e "${YELLOW}🔗 Probando servicios a través del Gateway:${NC}"
        if curl -s -f http://localhost:3000/api/health > /dev/null; then
            echo -e "   ${GREEN}✅ Health check agregado OK${NC}"
        else
            echo -e "   ${RED}❌ Health check agregado FALLO${NC}"
        fi
    else
        echo -e "   ${RED}❌ API Gateway no disponible${NC}"
    fi
    echo ""
    
    # Test individual services
    echo -e "${YELLOW}🔍 Probando servicios individuales:${NC}"
    
    # Test products
    if curl -s -f http://localhost:3000/api/products > /dev/null; then
        echo -e "   ${GREEN}✅ Product Service accesible${NC}"
    else
        echo -e "   ${RED}❌ Product Service no accesible${NC}"
    fi
    
    echo ""
}

# Mostrar información de infraestructura
show_infrastructure() {
    echo -e "${BLUE}🏗️  Estado de Infraestructura${NC}"
    echo "============================="
    echo ""
    
    echo -e "${YELLOW}🐰 RabbitMQ:${NC}"
    if curl -s -f http://localhost:15672 > /dev/null; then
        echo -e "   ${GREEN}✅ Management UI disponible en http://localhost:15672${NC}"
    else
        echo -e "   ${RED}❌ RabbitMQ no disponible${NC}"
    fi
    
    echo -e "${YELLOW}🍃 MongoDB:${NC}"
    if docker exec mongodb mongosh --eval "db.adminCommand('ping')" > /dev/null 2>&1; then
        echo -e "   ${GREEN}✅ MongoDB disponible${NC}"
    else
        echo -e "   ${RED}❌ MongoDB no disponible${NC}"
    fi
    
    echo -e "${YELLOW}🐘 PostgreSQL:${NC}"
    if docker exec postgres pg_isready > /dev/null 2>&1; then
        echo -e "   ${GREEN}✅ PostgreSQL disponible${NC}"
    else
        echo -e "   ${RED}❌ PostgreSQL no disponible${NC}"
    fi
    
    echo -e "${YELLOW}🔴 Redis:${NC}"
    if docker exec redis redis-cli ping > /dev/null 2>&1; then
        echo -e "   ${GREEN}✅ Redis disponible${NC}"
    else
        echo -e "   ${RED}❌ Redis no disponible${NC}"
    fi
    
    echo ""
}

# Ejecutar pruebas de API
run_api_tests() {
    echo -e "${BLUE}🧪 Pruebas de API${NC}"
    echo "================="
    echo ""
    
    # Test registration
    echo -e "${YELLOW}👤 Probando registro de usuario...${NC}"
    REGISTER_RESPONSE=$(curl -s -X POST http://localhost:3000/api/users/register \
        -H "Content-Type: application/json" \
        -d '{
            "email": "test'$(date +%s)'@ejemplo.com",
            "password": "password123",
            "firstName": "Test",
            "lastName": "User"
        }')
    
    if echo "$REGISTER_RESPONSE" | grep -q "token"; then
        echo -e "   ${GREEN}✅ Registro exitoso${NC}"
        TOKEN=$(echo "$REGISTER_RESPONSE" | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
    else
        echo -e "   ${RED}❌ Fallo en registro${NC}"
        return 1
    fi
    
    # Test product listing
    echo -e "${YELLOW}📦 Probando listado de productos...${NC}"
    if curl -s -f http://localhost:3000/api/products > /dev/null; then
        echo -e "   ${GREEN}✅ Listado de productos OK${NC}"
    else
        echo -e "   ${RED}❌ Fallo en listado de productos${NC}"
    fi
    
    # Test order creation (requires auth)
    echo -e "${YELLOW}📋 Probando creación de pedido...${NC}"
    ORDER_RESPONSE=$(curl -s -X POST http://localhost:3000/api/orders \
        -H "Content-Type: application/json" \
        -H "Authorization: Bearer $TOKEN" \
        -d '{
            "items": [{"productId": 1, "quantity": 1}],
            "shippingAddress": {
                "street": "Calle Test 123",
                "city": "Madrid",
                "state": "Madrid", 
                "zipCode": "28001",
                "country": "España"
            }
        }')
    
    if echo "$ORDER_RESPONSE" | grep -q "orderId"; then
        echo -e "   ${GREEN}✅ Creación de pedido OK${NC}"
    else
        echo -e "   ${RED}❌ Fallo en creación de pedido${NC}"
    fi
    
    echo ""
}

# Mostrar ayuda
show_help() {
    echo -e "${BLUE}🛠️  Monitor de Sistema E-commerce${NC}"
    echo "================================="
    echo ""
    echo "Uso: $0 [comando]"
    echo ""
    echo "Comandos disponibles:"
    echo "  status      - Mostrar estado de servicios"
    echo "  logs [servicio] - Mostrar logs (opcional: servicio específico)"
    echo "  metrics     - Mostrar métricas de recursos"
    echo "  test        - Probar conectividad de servicios"
    echo "  infra       - Mostrar estado de infraestructura"
    echo "  api-test    - Ejecutar pruebas de API"
    echo "  help        - Mostrar esta ayuda"
    echo ""
    echo "Ejemplos:"
    echo "  $0 status"
    echo "  $0 logs api-gateway"
    echo "  $0 test"
    echo ""
}

# Función principal
main() {
    case ${1:-status} in
        "status")
            show_services_status
            ;;
        "logs")
            show_logs $2
            ;;
        "metrics")
            show_resource_metrics
            ;;
        "test")
            test_connectivity
            ;;
        "infra")
            show_infrastructure
            ;;
        "api-test")
            run_api_tests
            ;;
        "help")
            show_help
            ;;
        *)
            echo -e "${RED}❌ Comando desconocido: $1${NC}"
            echo ""
            show_help
            exit 1
            ;;
    esac
}

# Ejecutar función principal
main "$@"