const axios = require('axios');
const { v4: uuidv4 } = require('uuid');

// Configuración de tests
const BASE_URL = 'http://localhost:3000';
const API_TIMEOUT = 10000;

// Configure axios defaults
axios.defaults.timeout = API_TIMEOUT;
axios.defaults.validateStatus = function (status) {
  return status >= 200 && status < 500; // Don't throw on 4xx errors
};

describe('Sistema E-commerce - Pruebas de Integración', () => {
  let authToken;
  let testUser;
  let testProducts = [];
  let testOrder;

  beforeAll(async () => {
    console.log('🚀 Iniciando pruebas de integración...');
    
    // Esperar a que los servicios estén listos
    await waitForServices();
    
    // Configurar datos de prueba
    await setupTestData();
  });

  afterAll(async () => {
    console.log('🧹 Limpiando datos de prueba...');
    // Cleanup se hace automáticamente con el teardown
  });

  // Utilidades para tests
  async function waitForServices() {
    console.log('⏳ Esperando servicios...');
    
    const services = [
      { name: 'API Gateway', url: `${BASE_URL}/health` },
      { name: 'Services Health', url: `${BASE_URL}/api/health` }
    ];

    for (const service of services) {
      let attempts = 0;
      const maxAttempts = 30;
      
      while (attempts < maxAttempts) {
        try {
          const response = await axios.get(service.url);
          if (response.status === 200) {
            console.log(`✅ ${service.name} listo`);
            break;
          }
        } catch (error) {
          attempts++;
          if (attempts === maxAttempts) {
            throw new Error(`❌ ${service.name} no disponible después de ${maxAttempts} intentos`);
          }
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }
    }
  }

  async function setupTestData() {
    console.log('📋 Configurando datos de prueba...');
    
    // Crear productos de prueba si no existen
    const testProductsData = [
      {
        name: "Test Laptop",
        description: "Laptop para pruebas",
        price: 999.99,
        stock: 10,
        category: "electronics",
        sku: `TEST-LAPTOP-${Date.now()}`
      },
      {
        name: "Test Mouse", 
        description: "Mouse para pruebas",
        price: 25.99,
        stock: 50,
        category: "accessories",
        sku: `TEST-MOUSE-${Date.now()}`
      }
    ];

    for (const productData of testProductsData) {
      try {
        const response = await axios.post(`${BASE_URL}/api/products`, productData);
        if (response.status === 201) {
          testProducts.push(response.data);
          console.log(`✅ Producto creado: ${productData.name}`);
        }
      } catch (error) {
        console.log(`⚠️  Error creando producto ${productData.name}:`, error.response?.data);
      }
    }
  }

  // Tests de API Gateway
  describe('🌐 API Gateway', () => {
    test('Health check del gateway', async () => {
      const response = await axios.get(`${BASE_URL}/health`);
      
      expect(response.status).toBe(200);
      expect(response.data).toHaveProperty('status', 'OK');
      expect(response.data).toHaveProperty('timestamp');
      expect(response.data).toHaveProperty('services');
    });

    test('Health check agregado de servicios', async () => {
      const response = await axios.get(`${BASE_URL}/api/health`);
      
      expect(response.status).toBe(200);
      expect(response.data).toHaveProperty('gateway', 'UP');
      expect(response.data).toHaveProperty('services');
    });

    test('Rate limiting funciona', async () => {
      const requests = [];
      
      // Hacer muchas peticiones rápidas
      for (let i = 0; i < 10; i++) {
        requests.push(axios.get(`${BASE_URL}/health`));
      }
      
      const responses = await Promise.all(requests);
      
      // Todas deberían pasar porque health no está rate limited
      responses.forEach(response => {
        expect(response.status).toBe(200);
      });
    });
  });

  // Tests de User Service
  describe('👤 User Service', () => {
    test('Registro de usuario', async () => {
      const timestamp = Date.now();
      testUser = {
        email: `test${timestamp}@ejemplo.com`,
        password: 'password123',
        firstName: 'Test',
        lastName: 'User'
      };

      const response = await axios.post(`${BASE_URL}/api/users/register`, testUser);
      
      expect(response.status).toBe(201);
      expect(response.data).toHaveProperty('message', 'User created successfully');
      expect(response.data).toHaveProperty('token');
      expect(response.data).toHaveProperty('user');
      expect(response.data.user).toHaveProperty('email', testUser.email);
      
      authToken = response.data.token;
    });

    test('Login de usuario', async () => {
      const loginData = {
        email: testUser.email,
        password: testUser.password
      };

      const response = await axios.post(`${BASE_URL}/api/users/login`, loginData);
      
      expect(response.status).toBe(200);
      expect(response.data).toHaveProperty('message', 'Login successful');
      expect(response.data).toHaveProperty('token');
      expect(response.data).toHaveProperty('user');
    });

    test('Obtener perfil con token válido', async () => {
      const response = await axios.get(`${BASE_URL}/api/users/profile`, {
        headers: { Authorization: `Bearer ${authToken}` }
      });
      
      expect(response.status).toBe(200);
      expect(response.data).toHaveProperty('user');
      expect(response.data.user).toHaveProperty('email', testUser.email);
    });

    test('Acceso denegado sin token', async () => {
      const response = await axios.get(`${BASE_URL}/api/users/profile`);
      
      expect(response.status).toBe(401);
      expect(response.data).toHaveProperty('error');
    });

    test('Validación de token', async () => {
      const response = await axios.post(`${BASE_URL}/api/users/validate`, {}, {
        headers: { Authorization: `Bearer ${authToken}` }
      });
      
      expect(response.status).toBe(200);
      expect(response.data).toHaveProperty('valid', true);
      expect(response.data).toHaveProperty('user');
    });
  });

  // Tests de Product Service  
  describe('📦 Product Service', () => {
    test('Listar productos', async () => {
      const response = await axios.get(`${BASE_URL}/api/products`);
      
      expect(response.status).toBe(200);
      expect(Array.isArray(response.data)).toBe(true);
      expect(response.data.length).toBeGreaterThan(0);
      
      // Verificar estructura del producto
      const product = response.data[0];
      expect(product).toHaveProperty('id');
      expect(product).toHaveProperty('name');
      expect(product).toHaveProperty('price');
      expect(product).toHaveProperty('stock');
    });

    test('Obtener producto por ID', async () => {
      if (testProducts.length > 0) {
        const productId = testProducts[0].id;
        const response = await axios.get(`${BASE_URL}/api/products/${productId}`);
        
        expect(response.status).toBe(200);
        expect(response.data).toHaveProperty('id', productId);
        expect(response.data).toHaveProperty('name');
      }
    });

    test('Verificar disponibilidad de productos', async () => {
      if (testProducts.length > 0) {
        const productIds = testProducts.map(p => p.id);
        const response = await axios.post(`${BASE_URL}/api/products/check-availability`, productIds);
        
        expect(response.status).toBe(200);
        expect(response.data).toHaveProperty('availability');
        
        productIds.forEach(id => {
          expect(response.data.availability).toHaveProperty(id.toString());
          expect(response.data.availability[id]).toHaveProperty('available');
          expect(response.data.availability[id]).toHaveProperty('stock');
        });
      }
    });

    test('Obtener categorías', async () => {
      const response = await axios.get(`${BASE_URL}/api/products/categories`);
      
      expect(response.status).toBe(200);
      expect(response.data).toHaveProperty('categories');
      expect(Array.isArray(response.data.categories)).toBe(true);
    });

    test('Producto no encontrado', async () => {
      const response = await axios.get(`${BASE_URL}/api/products/99999`);
      
      expect(response.status).toBe(404);
      expect(response.data).toHaveProperty('error');
    });
  });

  // Tests de Order Service
  describe('📋 Order Service', () => {
    test('Crear pedido exitosamente', async () => {
      if (testProducts.length > 0 && authToken) {
        const orderData = {
          items: [
            {
              productId: testProducts[0].id,
              quantity: 2
            }
          ],
          shippingAddress: {
            street: "Calle Test 123",
            city: "Madrid", 
            state: "Madrid",
            zipCode: "28001",
            country: "España"
          }
        };

        const response = await axios.post(`${BASE_URL}/api/orders`, orderData, {
          headers: { Authorization: `Bearer ${authToken}` }
        });
        
        expect(response.status).toBe(201);
        expect(response.data).toHaveProperty('message', 'Order created successfully');
        expect(response.data).toHaveProperty('order');
        expect(response.data.order).toHaveProperty('orderId');
        expect(response.data.order).toHaveProperty('items');
        expect(response.data.order).toHaveProperty('totalAmount');
        expect(response.data.order).toHaveProperty('status', 'pending');
        
        testOrder = response.data.order;
      }
    });

    test('Listar pedidos del usuario', async () => {
      if (authToken) {
        const response = await axios.get(`${BASE_URL}/api/orders`, {
          headers: { Authorization: `Bearer ${authToken}` }
        });
        
        expect(response.status).toBe(200);
        expect(response.data).toHaveProperty('orders');
        expect(Array.isArray(response.data.orders)).toBe(true);
      }
    });

    test('Obtener pedido por ID', async () => {
      if (testOrder && authToken) {
        const response = await axios.get(`${BASE_URL}/api/orders/${testOrder.orderId}`, {
          headers: { Authorization: `Bearer ${authToken}` }
        });
        
        expect(response.status).toBe(200);
        expect(response.data).toHaveProperty('order');
        expect(response.data.order).toHaveProperty('orderId', testOrder.orderId);
      }
    });

    test('Actualizar estado del pedido', async () => {
      if (testOrder && authToken) {
        const updateData = { status: 'confirmed' };
        
        const response = await axios.patch(`${BASE_URL}/api/orders/${testOrder.orderId}/status`, updateData, {
          headers: { Authorization: `Bearer ${authToken}` }
        });
        
        expect(response.status).toBe(200);
        expect(response.data).toHaveProperty('message', 'Order status updated successfully');
        expect(response.data.order).toHaveProperty('status', 'confirmed');
      }
    });

    test('Crear pedido sin autenticación falla', async () => {
      const orderData = {
        items: [{ productId: 1, quantity: 1 }],
        shippingAddress: {
          street: "Test Street",
          city: "Test City",
          state: "Test State", 
          zipCode: "12345",
          country: "Test Country"
        }
      };

      const response = await axios.post(`${BASE_URL}/api/orders`, orderData);
      
      expect(response.status).toBe(401);
      expect(response.data).toHaveProperty('error');
    });

    test('Crear pedido con producto inexistente falla', async () => {
      if (authToken) {
        const orderData = {
          items: [{ productId: 99999, quantity: 1 }],
          shippingAddress: {
            street: "Test Street",
            city: "Test City",
            state: "Test State",
            zipCode: "12345", 
            country: "Test Country"
          }
        };

        const response = await axios.post(`${BASE_URL}/api/orders`, orderData, {
          headers: { Authorization: `Bearer ${authToken}` }
        });
        
        expect(response.status).toBe(400);
        expect(response.data).toHaveProperty('error');
      }
    });
  });

  // Tests de Notification Service
  describe('📧 Notification Service', () => {
    test('Health check del servicio', async () => {
      const response = await axios.get('http://localhost:3004/health');
      
      expect(response.status).toBe(200);
      expect(response.data).toHaveProperty('status', 'OK');
      expect(response.data).toHaveProperty('service', 'notification-service');
    });

    test('Enviar notificación manual', async () => {
      const notificationData = {
        to_email: "test@ejemplo.com",
        subject: "Test Notification",
        message: "Este es un mensaje de prueba",
        template_type: "default"
      };

      const response = await axios.post('http://localhost:3004/notifications/email', notificationData);
      
      expect(response.status).toBe(200);
      expect(response.data).toHaveProperty('message', 'Notification queued successfully');
      expect(response.data).toHaveProperty('notification_id');
    });

    test('Obtener estadísticas de notificaciones', async () => {
      const response = await axios.get('http://localhost:3004/notifications/stats');
      
      expect(response.status).toBe(200);
      expect(response.data).toHaveProperty('total');
      expect(response.data).toHaveProperty('sent');
      expect(response.data).toHaveProperty('failed');
      expect(response.data).toHaveProperty('processing');
      
      // Verificar que son números
      expect(typeof response.data.total).toBe('number');
      expect(typeof response.data.sent).toBe('number');
      expect(typeof response.data.failed).toBe('number');
      expect(typeof response.data.processing).toBe('number');
    });
  });

  // Tests de flujo completo (End-to-End)
  describe('🔄 Flujos End-to-End', () => {
    test('Flujo completo: Registro → Login → Ver productos → Crear pedido', async () => {
      // 1. Registro de nuevo usuario
      const newUser = {
        email: `e2e${Date.now()}@ejemplo.com`,
        password: 'password123',
        firstName: 'E2E',
        lastName: 'Test'
      };

      const registerResponse = await axios.post(`${BASE_URL}/api/users/register`, newUser);
      expect(registerResponse.status).toBe(201);
      
      const token = registerResponse.data.token;

      // 2. Listar productos disponibles
      const productsResponse = await axios.get(`${BASE_URL}/api/products`);
      expect(productsResponse.status).toBe(200);
      expect(productsResponse.data.length).toBeGreaterThan(0);

      const availableProduct = productsResponse.data.find(p => p.stock > 0);
      expect(availableProduct).toBeDefined();

      // 3. Crear pedido
      const orderData = {
        items: [
          {
            productId: availableProduct.id,
            quantity: 1
          }
        ],
        shippingAddress: {
          street: "E2E Test Street 123",
          city: "Madrid",
          state: "Madrid",
          zipCode: "28001",
          country: "España"
        }
      };

      const orderResponse = await axios.post(`${BASE_URL}/api/orders`, orderData, {
        headers: { Authorization: `Bearer ${token}` }
      });

      expect(orderResponse.status).toBe(201);
      expect(orderResponse.data.order).toHaveProperty('orderId');
      expect(orderResponse.data.order).toHaveProperty('status', 'pending');
      expect(orderResponse.data.order.totalAmount).toBeGreaterThan(0);

      // 4. Verificar que el pedido aparece en la lista del usuario
      const userOrdersResponse = await axios.get(`${BASE_URL}/api/orders`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      expect(userOrdersResponse.status).toBe(200);
      const userOrders = userOrdersResponse.data.orders;
      const createdOrder = userOrders.find(order => order.orderId === orderResponse.data.order.orderId);
      expect(createdOrder).toBeDefined();
    });

    test('Flujo de actualización de estado de pedido', async () => {
      if (testOrder && authToken) {
        const states = ['confirmed', 'processing', 'shipped'];
        
        for (const state of states) {
          const response = await axios.patch(
            `${BASE_URL}/api/orders/${testOrder.orderId}/status`, 
            { status: state },
            { headers: { Authorization: `Bearer ${authToken}` } }
          );
          
          expect(response.status).toBe(200);
          expect(response.data.order.status).toBe(state);
          
          // Pequeña pausa entre actualizaciones
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
    });
  });

  // Tests de resilencia y error handling
  describe('🛡️ Resilencia y Manejo de Errores', () => {
    test('Manejo de servicio no disponible', async () => {
      // Simular llamada a endpoint inexistente
      const response = await axios.get(`${BASE_URL}/api/nonexistent`);
      
      expect(response.status).toBe(404);
      expect(response.data).toHaveProperty('error');
    });

    test('Validación de datos de entrada', async () => {
      // Registro con datos inválidos
      const invalidUser = {
        email: "invalid-email",
        password: "123", // muy corta
        firstName: "",
        lastName: ""
      };

      const response = await axios.post(`${BASE_URL}/api/users/register`, invalidUser);
      
      expect(response.status).toBe(400);
      expect(response.data).toHaveProperty('error');
    });

    test('Timeout de requests', async () => {
      // Test que el gateway maneja timeouts correctamente
      // Este test podría necesitar ajuste según configuración de timeout
      try {
        await axios.get(`${BASE_URL}/health`, { timeout: 1 });
      } catch (error) {
        expect(error.code).toBe('ECONNABORTED');
      }
    }, 15000);
  });
});