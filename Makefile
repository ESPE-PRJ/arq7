# Makefile para Sistema E-commerce Microservicios
# Comandos simplificados para gestión del sistema

.PHONY: help setup build start stop restart clean logs status test monitor

# Configuración por defecto
DOCKER_COMPOSE = docker-compose
SERVICES = api-gateway user-service product-service order-service notification-service

help: ## Mostrar ayuda
	@echo "🛠️  Sistema E-commerce Microservicios"
	@echo "===================================="
	@echo ""
	@echo "Comandos disponibles:"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  %-15s %s\n", $$1, $$2}'
	@echo ""
	@echo "Ejemplos:"
	@echo "  make setup    # Configuración inicial completa"
	@echo "  make start    # Iniciar todos los servicios"
	@echo "  make status   # Ver estado de servicios"
	@echo "  make logs     # Ver logs de todos los servicios"

setup: ## Configuración inicial completa del sistema
	@echo "🚀 Iniciando configuración completa..."
	@chmod +x scripts/*.sh
	@./scripts/setup.sh

build: ## Construir todas las imágenes Docker
	@echo "🏗️  Construyendo imágenes..."
	@$(DOCKER_COMPOSE) build

start: ## Iniciar todos los servicios
	@echo "▶️  Iniciando servicios..."
	@$(DOCKER_COMPOSE) up -d

stop: ## Detener todos los servicios
	@echo "⏹️  Deteniendo servicios..."
	@$(DOCKER_COMPOSE) down

restart: stop start ## Reiniciar todos los servicios

clean: ## Limpiar sistema completo
	@chmod +x scripts/teardown.sh
	@./scripts/teardown.sh

logs: ## Mostrar logs de todos los servicios
	@$(DOCKER_COMPOSE) logs -f --tail=50

logs-service: ## Mostrar logs de un servicio específico (usar: make logs-service SERVICE=nombre)
	@$(DOCKER_COMPOSE) logs -f --tail=50 $(SERVICE)

status: ## Mostrar estado de servicios
	@chmod +x scripts/monitor.sh
	@./scripts/monitor.sh status

test: ## Ejecutar pruebas de conectividad
	@chmod +x scripts/monitor.sh
	@./scripts/monitor.sh test

monitor: ## Ejecutar monitor completo
	@chmod +x scripts/monitor.sh
	@./scripts/monitor.sh

api-test: ## Ejecutar pruebas de API
	@chmod +x scripts/monitor.sh
	@./scripts/monitor.sh api-test

# Comandos específicos por servicio
start-infra: ## Iniciar solo servicios de infraestructura
	@echo "🏗️  Iniciando infraestructura..."
	@$(DOCKER_COMPOSE) up -d mongodb postgres redis rabbitmq

start-apps: ## Iniciar solo servicios de aplicación
	@echo "🚀 Iniciando aplicaciones..."
	@$(DOCKER_COMPOSE) up -d $(SERVICES)

# Comandos de desarrollo
dev-api-gateway: ## Modo desarrollo para API Gateway
	@echo "👨‍💻 Iniciando API Gateway en modo desarrollo..."
	@cd api-gateway && npm run dev

dev-user-service: ## Modo desarrollo para User Service
	@echo "👨‍💻 Iniciando User Service en modo desarrollo..."
	@cd user-service && npm run dev

dev-product-service: ## Modo desarrollo para Product Service
	@echo "👨‍💻 Iniciando Product Service en modo desarrollo..."
	@cd product-service && python -m uvicorn main:app --reload --host 0.0.0.0 --port 3002

dev-order-service: ## Modo desarrollo para Order Service
	@echo "👨‍💻 Iniciando Order Service en modo desarrollo..."
	@cd order-service && npm run dev

dev-notification-service: ## Modo desarrollo para Notification Service
	@echo "👨‍💻 Iniciando Notification Service en modo desarrollo..."
	@cd notification-service && python -m uvicorn main:app --reload --host 0.0.0.0 --port 3004

# Comandos de utilidad
shell-mongo: ## Acceder a shell de MongoDB
	@docker exec -it mongodb mongosh -u admin -p password123 --authenticationDatabase admin

shell-postgres: ## Acceder a shell de PostgreSQL  
	@docker exec -it postgres psql -U postgres -d products

shell-redis: ## Acceder a shell de Redis
	@docker exec -it redis redis-cli

# Backup y restore
backup: ## Crear backup de datos
	@echo "💾 Creando backup..."
	@mkdir -p backups
	@docker exec mongodb mongodump --uri="mongodb://admin:password123@localhost:27017/?authSource=admin" --out /tmp/backup
	@docker cp mongodb:/tmp/backup ./backups/mongodb-$(shell date +%Y%m%d-%H%M%S)
	@docker exec postgres pg_dump -U postgres products > backups/postgres-$(shell date +%Y%m%d-%H%M%S).sql
	@echo "✅ Backup completado en ./backups/"

# Comandos de limpieza específicos
clean-images: ## Limpiar solo imágenes Docker
	@docker rmi $(shell docker images -q --filter=reference="arq_*") 2>/dev/null || true

clean-volumes: ## Limpiar solo volúmenes
	@$(DOCKER_COMPOSE) down -v

clean-logs: ## Limpiar archivos de log
	@find . -name "*.log" -type f -delete 2>/dev/null || true
	@rm -rf logs/* 2>/dev/null || true

# Comandos de monitoreo específicos
ps: ## Mostrar contenedores en ejecución
	@$(DOCKER_COMPOSE) ps

top: ## Mostrar procesos en contenedores
	@$(DOCKER_COMPOSE) top

stats: ## Mostrar estadísticas de recursos
	@docker stats --no-stream $(shell $(DOCKER_COMPOSE) ps -q)

# Configuración de entorno
install-deps: ## Instalar dependencias locales para desarrollo
	@echo "📦 Instalando dependencias..."
	@cd api-gateway && npm install
	@cd user-service && npm install
	@cd order-service && npm install
	@cd product-service && pip install -r requirements.txt
	@cd notification-service && pip install -r requirements.txt

# Comandos de testing
unit-test: ## Ejecutar tests unitarios
	@echo "🧪 Ejecutando tests unitarios..."
	@cd api-gateway && npm test || true
	@cd user-service && npm test || true
	@cd order-service && npm test || true

# Información del sistema
info: ## Mostrar información del sistema
	@echo "ℹ️  Información del Sistema"
	@echo "=========================="
	@echo "Docker version: $(shell docker --version)"
	@echo "Docker Compose version: $(shell docker-compose --version)"
	@echo "Servicios configurados: $(SERVICES)"
	@echo "Puerto API Gateway: 3000"
	@echo "Puerto RabbitMQ Management: 15672"