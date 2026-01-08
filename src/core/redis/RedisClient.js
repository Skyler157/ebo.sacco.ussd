const Redis = require('ioredis');
const config = require('../../../config/default');
const logger = require('../logging/Logger');

class RedisClient {
  constructor() {
    this.client = null;
    this.isCluster = config.redis.cluster;
    this.init();
  }

  init() {
    try {
      if (this.isCluster && config.redis.nodes.length > 1) {
        // Use Redis Cluster
        this.client = new Redis.Cluster(config.redis.nodes, {
          redisOptions: {
            password: config.redis.password,
            connectTimeout: config.redis.options.connectTimeout,
            enableReadyCheck: true,
            scaleReads: 'slave',
            retryDelayOnFailover: 1000,
            maxRetriesPerRequest: 3,
            ...config.redis.options
          }
        });
        logger.info('Redis Cluster initialized');
      } else {
        // Use single Redis instance
        const node = config.redis.nodes[0];
        this.client = new Redis({
          host: node.host,
          port: node.port,
          password: config.redis.password,
          connectTimeout: config.redis.options.connectTimeout,
          retryStrategy: config.redis.options.retryStrategy,
          enableReadyCheck: true,
          ...config.redis.options
        });
        logger.info('Redis single instance initialized');
      }

      this.setupEventListeners();
    } catch (error) {
      logger.error('Failed to initialize Redis client:', error);
      throw error;
    }
  }

  setupEventListeners() {
    this.client.on('connect', () => {
      logger.info('Redis client connected');
    });

    this.client.on('ready', () => {
      logger.info('Redis client ready');
    });

    this.client.on('error', (error) => {
      logger.error('Redis client error:', error);
    });

    this.client.on('close', () => {
      logger.warn('Redis connection closed');
    });

    this.client.on('reconnecting', () => {
      logger.info('Redis client reconnecting...');
    });
  }

  async set(key, value, ttl = null) {
    try {
      if (ttl) {
        await this.client.setex(key, ttl, JSON.stringify(value));
      } else {
        await this.client.set(key, JSON.stringify(value));
      }
      return true;
    } catch (error) {
      logger.error(`Redis set error for key ${key}:`, error);
      throw error;
    }
  }

  async get(key) {
    try {
      const data = await this.client.get(key);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      logger.error(`Redis get error for key ${key}:`, error);
      throw error;
    }
  }

  async del(key) {
    try {
      await this.client.del(key);
      return true;
    } catch (error) {
      logger.error(`Redis delete error for key ${key}:`, error);
      throw error;
    }
  }

  async exists(key) {
    try {
      const result = await this.client.exists(key);
      return result === 1;
    } catch (error) {
      logger.error(`Redis exists error for key ${key}:`, error);
      throw error;
    }
  }

  async expire(key, ttl) {
    try {
      await this.client.expire(key, ttl);
      return true;
    } catch (error) {
      logger.error(`Redis expire error for key ${key}:`, error);
      throw error;
    }
  }

  async keys(pattern) {
    try {
      if (this.isCluster) {
        // For cluster, get keys from all masters
        const masters = this.client.nodes('master');
        const keys = await Promise.all(
          masters.map(node => node.keys(pattern))
        );
        return keys.flat();
      }
      return await this.client.keys(pattern);
    } catch (error) {
      logger.error(`Redis keys error for pattern ${pattern}:`, error);
      throw error;
    }
  }

  async hset(key, field, value) {
    try {
      await this.client.hset(key, field, JSON.stringify(value));
      return true;
    } catch (error) {
      logger.error(`Redis hset error for key ${key}, field ${field}:`, error);
      throw error;
    }
  }

  async hget(key, field) {
    try {
      const data = await this.client.hget(key, field);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      logger.error(`Redis hget error for key ${key}, field ${field}:`, error);
      throw error;
    }
  }

  async hdel(key, field) {
    try {
      await this.client.hdel(key, field);
      return true;
    } catch (error) {
      logger.error(`Redis hdel error for key ${key}, field ${field}:`, error);
      throw error;
    }
  }

  async flushSession(sessionKey) {
    try {
      const pattern = `${sessionKey}:*`;
      const sessionKeys = await this.keys(pattern);
      
      if (sessionKeys.length > 0) {
        if (this.isCluster) {
          // Delete keys in batches for cluster
          const pipeline = this.client.pipeline();
          sessionKeys.forEach(key => pipeline.del(key));
          await pipeline.exec();
        } else {
          await this.client.del(sessionKeys);
        }
      }
      
      return true;
    } catch (error) {
      logger.error(`Redis flush session error for key ${sessionKey}:`, error);
      throw error;
    }
  }

  quit() {
    if (this.client) {
      return this.client.quit();
    }
  }
}

module.exports = new RedisClient();