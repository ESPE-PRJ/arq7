// Configuración global para Jest
// Este archivo se ejecuta antes de cada test

// Extender timeout por defecto para pruebas de integración
jest.setTimeout(30000);

// Mock de console para tests más limpios (opcional)
if (process.env.NODE_ENV === 'test') {
  global.console = {
    ...console,
    // Mantener log y error para debugging
    log: jest.fn(console.log),
    error: jest.fn(console.error),
    warn: jest.fn(console.warn),
    // Silenciar info y debug en tests
    info: jest.fn(),
    debug: jest.fn(),
  };
}

// Variables globales para tests
global.TEST_CONFIG = {
  BASE_URL: process.env.TEST_BASE_URL || 'http://localhost:3000',
  API_TIMEOUT: 10000,
  RETRY_ATTEMPTS: 3,
  RETRY_DELAY: 2000
};

// Función helper para reintentos
global.retryOperation = async (operation, attempts = 3, delay = 1000) => {
  for (let i = 0; i < attempts; i++) {
    try {
      return await operation();
    } catch (error) {
      if (i === attempts - 1) throw error;
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
};

// Función helper para esperar condición
global.waitFor = async (condition, timeout = 30000, interval = 1000) => {
  const start = Date.now();
  
  while (Date.now() - start < timeout) {
    try {
      const result = await condition();
      if (result) return result;
    } catch (error) {
      // Continuar intentando
    }
    
    await new Promise(resolve => setTimeout(resolve, interval));
  }
  
  throw new Error(`Timeout waiting for condition after ${timeout}ms`);
};

// Matchers personalizados para Jest
expect.extend({
  toHaveValidTimestamp(received) {
    const pass = typeof received === 'string' && !isNaN(Date.parse(received));
    
    if (pass) {
      return {
        message: () => `expected ${received} not to be a valid timestamp`,
        pass: true
      };
    } else {
      return {
        message: () => `expected ${received} to be a valid timestamp`,
        pass: false
      };
    }
  },
  
  toHaveProperty(received, property, value) {
    const pass = received && 
                  received.hasOwnProperty(property) && 
                  (value === undefined || received[property] === value);
    
    if (pass) {
      return {
        message: () => `expected ${JSON.stringify(received)} not to have property ${property}${value !== undefined ? ` with value ${value}` : ''}`,
        pass: true
      };
    } else {
      return {
        message: () => `expected ${JSON.stringify(received)} to have property ${property}${value !== undefined ? ` with value ${value}` : ''}`,
        pass: false
      };
    }
  }
});

// Configuración de axios para tests
if (typeof require !== 'undefined') {
  const axios = require('axios');
  
  // Configurar defaults para todos los tests
  axios.defaults.timeout = global.TEST_CONFIG.API_TIMEOUT;
  axios.defaults.validateStatus = function (status) {
    return status >= 200 && status < 600; // No rechazar por códigos de error
  };
  
  // Interceptor para logging de requests en modo debug
  if (process.env.DEBUG_REQUESTS === 'true') {
    axios.interceptors.request.use(request => {
      console.log('Starting Request:', request.method?.toUpperCase(), request.url);
      return request;
    });
    
    axios.interceptors.response.use(
      response => {
        console.log('Response:', response.status, response.config.url);
        return response;
      },
      error => {
        console.log('Request Error:', error.message, error.config?.url);
        return Promise.reject(error);
      }
    );
  }
}

// Cleanup después de cada test
afterEach(async () => {
  // Limpiar cualquier timeout o intervalo pendiente
  jest.clearAllTimers();
});

// Setup antes de todos los tests
beforeAll(async () => {
  console.log('🧪 Iniciando suite de pruebas de integración');
  console.log(`📍 URL Base: ${global.TEST_CONFIG.BASE_URL}`);
  console.log(`⏱️  Timeout: ${global.TEST_CONFIG.API_TIMEOUT}ms`);
});

// Cleanup después de todos los tests
afterAll(async () => {
  console.log('✅ Suite de pruebas completada');
  
  // Dar tiempo para que las conexiones se cierren
  await new Promise(resolve => setTimeout(resolve, 1000));
});