module.exports = {
  app: {
    name: process.env.APP_NAME || 'EBOSACCO',
    version: process.env.APP_VERSION || '2.0.0',
    bankId: process.env.BANK_ID || 'EBO_SACCO_BANK_ID',
    country: process.env.COUNTRY || 'UGANDA',
    codebase: 'EBOSACCOUSSD'
  },

  redis: {
    cluster: process.env.REDIS_CLUSTER_ENABLED === 'true',
    nodes: process.env.REDIS_NODES 
      ? process.env.REDIS_NODES.split(',').map(node => {
          const [host, port] = node.split(':');
          return { host, port: parseInt(port) };
        })
      : [{ host: '172.17.40.25', port: 6379 }],
    password: process.env.REDIS_PASSWORD,
    options: {
      connectTimeout: parseInt(process.env.REDIS_CONNECT_TIMEOUT) || 10000,
      syncTimeout: parseInt(process.env.REDIS_SYNC_TIMEOUT) || 10000,
      abortConnect: process.env.REDIS_ABORT_CONNECT === 'true',
      retryStrategy: (times) => Math.min(times * 100, 3000)
    },
    sessionTTL: parseInt(process.env.REDIS_SESSION_TTL) || 1800
  },

  encryption: {
    key: process.env.ENCRYPTION_KEY,
    iv: process.env.ENCRYPTION_IV,
    algorithm: 'aes-256-cbc',
    hashAlgorithm: 'sha256',
    iterations: 1
  },

  api: {
    endpoints: {
      authenticate: process.env.AUTHENTICATE_URL,
      bank: process.env.BANK_URL,
      other: process.env.OTHER_URL,
      purchase: process.env.PURCHASE_URL,
      validate: process.env.VALIDATE_URL
    },
    timeout: 30000,
    retries: 3
  },

  security: {
    maxPinAttempts: parseInt(process.env.MAX_PIN_ATTEMPTS) || 3,
    sessionTimeout: parseInt(process.env.SESSION_TIMEOUT_MINUTES) * 60 || 1800,
    rateLimitWindow: parseInt(process.env.RATE_LIMIT_WINDOW) || 60,
    rateLimitMax: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 30
  },

  validation: {
    mtnPrefixes: ['25631', '25639', '25678', '25677', '25676', '25679'],
    airtelPrefixes: ['25620', '25670', '25675', '25674'],
    minAmount: 100,
    maxAmount: 5000000
  },

  logging: {
    level: process.env.LOG_LEVEL || 'info',
    directory: process.env.LOG_DIR || 'logs',
    format: process.env.LOG_FORMAT || 'json',
    retentionDays: 30
  }
};