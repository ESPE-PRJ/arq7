const express = require('express');
const mongoose = require('mongoose');
const axios = require('axios');
const amqp = require('amqplib');
const Joi = require('joi');
const cors = require('cors');
const helmet = require('helmet');
const winston = require('winston');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3003;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://mongodb:27017/orders';
const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://rabbitmq:5672';
const USER_SERVICE_URL = process.env.USER_SERVICE_URL || 'http://user-service:3001';
const PRODUCT_SERVICE_URL = process.env.PRODUCT_SERVICE_URL || 'http://product-service:3002';

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'order-service.log' })
  ]
});

app.use(helmet());
app.use(cors());
app.use(express.json());

const orderItemSchema = new mongoose.Schema({
  productId: { type: Number, required: true },
  productName: { type: String, required: true },
  quantity: { type: Number, required: true, min: 1 },
  unitPrice: { type: Number, required: true, min: 0 },
  totalPrice: { type: Number, required: true, min: 0 }
});

const orderSchema = new mongoose.Schema({
  orderId: { type: String, required: true, unique: true, default: uuidv4 },
  userId: { type: String, required: true },
  userEmail: { type: String, required: true },
  items: [orderItemSchema],
  totalAmount: { type: Number, required: true, min: 0 },
  status: {
    type: String,
    enum: ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled'],
    default: 'pending'
  },
  shippingAddress: {
    street: String,
    city: String,
    state: String,
    zipCode: String,
    country: String
  },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

const Order = mongoose.model('Order', orderSchema);

const createOrderSchema = Joi.object({
  items: Joi.array().items(
    Joi.object({
      productId: Joi.number().required(),
      quantity: Joi.number().min(1).required()
    })
  ).min(1).required(),
  shippingAddress: Joi.object({
    street: Joi.string().required(),
    city: Joi.string().required(),
    state: Joi.string().required(),
    zipCode: Joi.string().required(),
    country: Joi.string().required()
  }).required()
});

let rabbitmqChannel = null;

async function connectRabbitMQ() {
  try {
    const connection = await amqp.connect(RABBITMQ_URL);
    rabbitmqChannel = await connection.createChannel();
    
    await rabbitmqChannel.assertQueue('order_events', { durable: true });
    await rabbitmqChannel.assertQueue('notification_events', { durable: true });
    
    logger.info('Connected to RabbitMQ');
  } catch (error) {
    logger.error('RabbitMQ connection error:', error.message);
    setTimeout(connectRabbitMQ, 5000);
  }
}

async function publishEvent(queue, event) {
  if (!rabbitmqChannel) {
    logger.error('RabbitMQ channel not available');
    return;
  }
  
  try {
    await rabbitmqChannel.sendToQueue(
      queue,
      Buffer.from(JSON.stringify(event)),
      { persistent: true }
    );
    logger.info(`Event published to ${queue}:`, event.type);
  } catch (error) {
    logger.error('Error publishing event:', error.message);
  }
}

const authMiddleware = async (req, res, next) => {
  const token = req.header('Authorization')?.replace('Bearer ', '');
  if (!token) {
    return res.status(401).json({ error: 'Access denied. No token provided.' });
  }

  try {
    const response = await axios.post(`${USER_SERVICE_URL}/validate`, {}, {
      headers: { Authorization: `Bearer ${token}` }
    });
    
    req.user = response.data.user;
    next();
  } catch (error) {
    logger.error('Auth validation error:', error.message);
    res.status(401).json({ error: 'Invalid token' });
  }
};

app.post('/orders', authMiddleware, async (req, res) => {
  try {
    const { error, value } = createOrderSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    const productIds = value.items.map(item => item.productId);
    
    const availabilityResponse = await axios.post(
      `${PRODUCT_SERVICE_URL}/products/check-availability`,
      productIds
    );
    
    const availability = availabilityResponse.data.availability;
    
    const orderItems = [];
    let totalAmount = 0;
    
    for (const item of value.items) {
      const productAvailability = availability[item.productId];
      
      if (!productAvailability || !productAvailability.available) {
        return res.status(400).json({
          error: `Product ${item.productId} is not available`
        });
      }
      
      if (productAvailability.stock < item.quantity) {
        return res.status(400).json({
          error: `Insufficient stock for product ${item.productId}. Available: ${productAvailability.stock}, Requested: ${item.quantity}`
        });
      }
      
      const itemTotal = productAvailability.price * item.quantity;
      totalAmount += itemTotal;
      
      orderItems.push({
        productId: item.productId,
        productName: productAvailability.name,
        quantity: item.quantity,
        unitPrice: productAvailability.price,
        totalPrice: itemTotal
      });
    }
    
    const order = new Order({
      orderId: uuidv4(),
      userId: req.user.id,
      userEmail: req.user.email,
      items: orderItems,
      totalAmount,
      shippingAddress: value.shippingAddress,
      status: 'pending'
    });

    await order.save();
    
    for (const item of orderItems) {
      await axios.post(`${PRODUCT_SERVICE_URL}/products/${item.productId}/stock`, {
        quantity: -item.quantity
      });
    }

    await publishEvent('order_events', {
      type: 'ORDER_CREATED',
      orderId: order.orderId,
      userId: order.userId,
      userEmail: order.userEmail,
      totalAmount: order.totalAmount,
      timestamp: new Date().toISOString()
    });

    await publishEvent('notification_events', {
      type: 'ORDER_CONFIRMATION',
      orderId: order.orderId,
      userEmail: order.userEmail,
      totalAmount: order.totalAmount,
      timestamp: new Date().toISOString()
    });

    logger.info(`Order created: ${order.orderId} for user ${req.user.email}`);

    res.status(201).json({
      message: 'Order created successfully',
      order: {
        orderId: order.orderId,
        items: order.items,
        totalAmount: order.totalAmount,
        status: order.status,
        createdAt: order.createdAt
      }
    });
  } catch (error) {
    logger.error('Create order error:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/orders', authMiddleware, async (req, res) => {
  try {
    const orders = await Order.find({ userId: req.user.id })
      .sort({ createdAt: -1 });

    res.json({
      orders: orders.map(order => ({
        orderId: order.orderId,
        items: order.items,
        totalAmount: order.totalAmount,
        status: order.status,
        shippingAddress: order.shippingAddress,
        createdAt: order.createdAt,
        updatedAt: order.updatedAt
      }))
    });
  } catch (error) {
    logger.error('Get orders error:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/orders/:orderId', authMiddleware, async (req, res) => {
  try {
    const order = await Order.findOne({
      orderId: req.params.orderId,
      userId: req.user.id
    });

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    res.json({
      order: {
        orderId: order.orderId,
        items: order.items,
        totalAmount: order.totalAmount,
        status: order.status,
        shippingAddress: order.shippingAddress,
        createdAt: order.createdAt,
        updatedAt: order.updatedAt
      }
    });
  } catch (error) {
    logger.error('Get order error:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.patch('/orders/:orderId/status', authMiddleware, async (req, res) => {
  try {
    const { status } = req.body;
    
    if (!['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const order = await Order.findOneAndUpdate(
      { orderId: req.params.orderId, userId: req.user.id },
      { status, updatedAt: new Date() },
      { new: true }
    );

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    await publishEvent('order_events', {
      type: 'ORDER_STATUS_UPDATED',
      orderId: order.orderId,
      userId: order.userId,
      userEmail: order.userEmail,
      newStatus: status,
      timestamp: new Date().toISOString()
    });

    logger.info(`Order ${order.orderId} status updated to ${status}`);

    res.json({
      message: 'Order status updated successfully',
      order: {
        orderId: order.orderId,
        status: order.status,
        updatedAt: order.updatedAt
      }
    });
  } catch (error) {
    logger.error('Update order status error:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    service: 'order-service'
  });
});

app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

app.use((err, req, res, next) => {
  logger.error('Order service error:', err.message);
  res.status(500).json({ error: 'Internal server error' });
});

mongoose.connect(MONGODB_URI)
  .then(() => {
    logger.info('Connected to MongoDB');
    connectRabbitMQ();
    
    app.listen(PORT, () => {
      logger.info(`Order service running on port ${PORT}`);
      console.log(`Order service running on port ${PORT}`);
    });
  })
  .catch(err => {
    logger.error('MongoDB connection error:', err.message);
    process.exit(1);
  });

module.exports = app;