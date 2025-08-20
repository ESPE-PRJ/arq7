# Documentación de APIs - Sistema E-commerce

## Arquitectura de Endpoints

### API Gateway (Puerto 3000)
Punto de entrada único para todos los servicios.

**Base URL**: `http://localhost:3000`

#### Health Check
```http
GET /health
```

**Respuesta**:
```json
{
  "status": "OK",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "services": {
    "user": "http://user-service:3001",
    "product": "http://product-service:3002", 
    "order": "http://order-service:3003",
    "notification": "http://notification-service:3004"
  }
}
```

#### Health Check de Servicios
```http
GET /api/health
```

---

## User Service (Puerto 3001)

### Autenticación

#### Registro de Usuario
```http
POST /api/users/register
Content-Type: application/json

{
  "email": "usuario@ejemplo.com",
  "password": "password123",
  "firstName": "Juan",
  "lastName": "Pérez"
}
```

**Respuesta**:
```json
{
  "message": "User created successfully",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "65a1b2c3d4e5f6789012345",
    "email": "usuario@ejemplo.com",
    "firstName": "Juan",
    "lastName": "Pérez",
    "role": "user"
  }
}
```

#### Login
```http
POST /api/users/login
Content-Type: application/json

{
  "email": "usuario@ejemplo.com",
  "password": "password123"
}
```

#### Obtener Perfil
```http
GET /api/users/profile
Authorization: Bearer <token>
```

#### Validar Token
```http
POST /api/users/validate
Authorization: Bearer <token>
```

---

## Product Service (Puerto 3002)

### Gestión de Productos

#### Listar Productos
```http
GET /api/products?skip=0&limit=100&category=electronics&active_only=true
```

**Respuesta**:
```json
[
  {
    "id": 1,
    "name": "Laptop HP",
    "description": "Laptop para trabajo",
    "price": 799.99,
    "stock": 15,
    "category": "electronics",
    "sku": "LP-HP-001",
    "is_active": true,
    "created_at": "2024-01-15T10:30:00.000Z",
    "updated_at": "2024-01-15T10:30:00.000Z"
  }
]
```

#### Obtener Producto por ID
```http
GET /api/products/{product_id}
```

#### Crear Producto
```http
POST /api/products
Content-Type: application/json

{
  "name": "Smartphone Samsung",
  "description": "Smartphone última generación",
  "price": 599.99,
  "stock": 25,
  "category": "electronics",
  "sku": "SP-SAM-001",
  "is_active": true
}
```

#### Actualizar Producto
```http
PUT /api/products/{product_id}
Content-Type: application/json

{
  "name": "Smartphone Samsung Galaxy",
  "price": 649.99,
  "stock": 30
}
```

#### Actualizar Stock
```http
POST /api/products/{product_id}/stock
Content-Type: application/json

{
  "quantity": -5  // Negativo para reducir, positivo para aumentar
}
```

#### Verificar Disponibilidad
```http
POST /api/products/check-availability
Content-Type: application/json

[1, 2, 3, 4]  // Array de IDs de productos
```

**Respuesta**:
```json
{
  "availability": {
    "1": {
      "available": true,
      "stock": 15,
      "name": "Laptop HP",
      "price": 799.99
    },
    "2": {
      "available": false,
      "stock": 0,
      "name": "Mouse Logitech",
      "price": 29.99
    }
  }
}
```

#### Obtener Categorías
```http
GET /api/products/categories
```

---

## Order Service (Puerto 3003)

### Gestión de Pedidos

#### Crear Pedido
```http
POST /api/orders
Authorization: Bearer <token>
Content-Type: application/json

{
  "items": [
    {
      "productId": 1,
      "quantity": 2
    },
    {
      "productId": 3,
      "quantity": 1
    }
  ],
  "shippingAddress": {
    "street": "Calle Principal 123",
    "city": "Madrid",
    "state": "Madrid",
    "zipCode": "28001",
    "country": "España"
  }
}
```

**Respuesta**:
```json
{
  "message": "Order created successfully",
  "order": {
    "orderId": "550e8400-e29b-41d4-a716-446655440000",
    "items": [
      {
        "productId": 1,
        "productName": "Laptop HP",
        "quantity": 2,
        "unitPrice": 799.99,
        "totalPrice": 1599.98
      }
    ],
    "totalAmount": 1629.97,
    "status": "pending",
    "createdAt": "2024-01-15T10:30:00.000Z"
  }
}
```

#### Listar Pedidos del Usuario
```http
GET /api/orders
Authorization: Bearer <token>
```

#### Obtener Pedido por ID
```http
GET /api/orders/{orderId}
Authorization: Bearer <token>
```

#### Actualizar Estado del Pedido
```http
PATCH /api/orders/{orderId}/status
Authorization: Bearer <token>
Content-Type: application/json

{
  "status": "shipped"  // pending, confirmed, processing, shipped, delivered, cancelled
}
```

---

## Notification Service (Puerto 3004)

### Gestión de Notificaciones

#### Enviar Notificación Manual
```http
POST /notifications/email
Content-Type: application/json

{
  "to_email": "usuario@ejemplo.com",
  "subject": "Notificación Manual",
  "message": "Este es el contenido del mensaje",
  "template_type": "default"  // default, order_confirmation, order_status
}
```

#### Obtener Estado de Notificación
```http
GET /notifications/{notification_id}/status
```

**Respuesta**:
```json
{
  "id": "manual_1705312200.123",
  "status": "sent",  // processing, sent, failed
  "created_at": "2024-01-15T10:30:00.000Z",
  "sent_at": "2024-01-15T10:30:15.000Z",
  "error_message": null
}
```

#### Estadísticas de Notificaciones
```http
GET /notifications/stats
```

**Respuesta**:
```json
{
  "total": 150,
  "sent": 142,
  "failed": 3,
  "processing": 5
}
```

---

## Códigos de Estado HTTP

| Código | Descripción |
|--------|-------------|
| 200 | OK - Operación exitosa |
| 201 | Created - Recurso creado exitosamente |
| 400 | Bad Request - Error en los datos enviados |
| 401 | Unauthorized - Token no válido o faltante |
| 404 | Not Found - Recurso no encontrado |
| 500 | Internal Server Error - Error interno del servidor |
| 503 | Service Unavailable - Servicio no disponible |

---

## Autenticación

### Obtener Token
1. Registrarse o hacer login en `/api/users/register` o `/api/users/login`
2. Usar el token devuelto en el header `Authorization: Bearer <token>`

### Ejemplo de Uso con cURL
```bash
# 1. Registrar usuario
curl -X POST http://localhost:3000/api/users/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@ejemplo.com","password":"password123","firstName":"Test","lastName":"User"}'

# 2. Usar token en peticiones protegidas
curl -X GET http://localhost:3000/api/orders \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."

# 3. Crear pedido
curl -X POST http://localhost:3000/api/orders \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{"items":[{"productId":1,"quantity":2}],"shippingAddress":{"street":"Calle 123","city":"Madrid","state":"Madrid","zipCode":"28001","country":"España"}}'
```

---

## Eventos de Mensajería (RabbitMQ)

### Colas de Eventos

#### Queue: `order_events`
- **ORDER_CREATED**: Se publica cuando se crea un pedido
- **ORDER_STATUS_UPDATED**: Se publica cuando cambia el estado de un pedido

#### Queue: `notification_events`  
- **ORDER_CONFIRMATION**: Evento para enviar email de confirmación
- **ORDER_STATUS_UPDATED**: Evento para notificar cambio de estado

### Estructura de Eventos
```json
{
  "type": "ORDER_CREATED",
  "orderId": "550e8400-e29b-41d4-a716-446655440000",
  "userId": "65a1b2c3d4e5f6789012345",
  "userEmail": "usuario@ejemplo.com",
  "totalAmount": 1599.98,
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```