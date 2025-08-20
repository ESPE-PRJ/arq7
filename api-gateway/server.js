const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const winston = require('winston');
const CircuitBreaker = require('express-circuit-breaker');

const app = express();
const PORT = process.env.PORT || 3000;

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'gateway.log' })
  ]
});

app.use(helmet());
app.use(cors());
app.use(express.json());

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP'
});
app.use('/api/', limiter);

const services = {
  user: process.env.USER_SERVICE_URL || 'http://user-service:3001',
  product: process.env.PRODUCT_SERVICE_URL || 'http://product-service:3002',
  order: process.env.ORDER_SERVICE_URL || 'http://order-service:3003',
  notification: process.env.NOTIFICATION_SERVICE_URL || 'http://notification-service:3004'
};

const authMiddleware = (req, res, next) => {
  const token = req.headers.authorization;
  if (!token && req.path.includes('/protected/')) {
    return res.status(401).json({ error: 'Token required' });
  }
  next();
};

const circuitBreakerOptions = {
  timeout: 5000,
  threshold: 5,
  ttl: 30000
};

app.use('/api/users', 
  authMiddleware,
  CircuitBreaker(circuitBreakerOptions),
  createProxyMiddleware({
    target: services.user,
    changeOrigin: true,
    pathRewrite: { '^/api/users': '' },
    onError: (err, req, res) => {
      logger.error('User service error:', err.message);
      res.status(503).json({ error: 'User service unavailable' });
    }
  })
);

app.use('/api/products',
  CircuitBreaker(circuitBreakerOptions),
  createProxyMiddleware({
    target: services.product,
    changeOrigin: true,
    pathRewrite: { '^/api/products': '' },
    onError: (err, req, res) => {
      logger.error('Product service error:', err.message);
      res.status(503).json({ error: 'Product service unavailable' });
    }
  })
);

app.use('/api/orders',
  authMiddleware,
  CircuitBreaker(circuitBreakerOptions),
  createProxyMiddleware({
    target: services.order,
    changeOrigin: true,
    pathRewrite: { '^/api/orders': '' },
    onError: (err, req, res) => {
      logger.error('Order service error:', err.message);
      res.status(503).json({ error: 'Order service unavailable' });
    }
  })
);

app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    services: services
  });
});

app.get('/api/health', async (req, res) => {
  const healthChecks = {};
  
  for (const [name, url] of Object.entries(services)) {
    try {
      const axios = require('axios');
      await axios.get(`${url}/health`, { timeout: 2000 });
      healthChecks[name] = 'UP';
    } catch (error) {
      healthChecks[name] = 'DOWN';
    }
  }
  
  res.json({
    gateway: 'UP',
    services: healthChecks,
    timestamp: new Date().toISOString()
  });
});

app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

app.use((err, req, res, next) => {
  logger.error('Gateway error:', err.message);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  logger.info(`API Gateway running on port ${PORT}`);
  console.log(`API Gateway running on port ${PORT}`);
});

module.exports = app;