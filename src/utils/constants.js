module.exports = {
  // Response status codes
  RESPONSE_STATUS: {
    SUCCESS: '000',
    INVALID_PIN: '001',
    INSUFFICIENT_FUNDS: '002',
    ACCOUNT_NOT_FOUND: '003',
    SERVICE_UNAVAILABLE: '004',
    INVALID_AMOUNT: '005',
    SESSION_EXPIRED: '006',
    MAX_ATTEMPTS_EXCEEDED: '007',
    DUPLICATE_TRANSACTION: '008',
    LIMIT_EXCEEDED: '009',
    PENDING: '010',
    REQUIRE_PIN_CHANGE: '101'
  },

  // Service types
  SERVICE_TYPES: {
    AUTHENTICATE: 'authenticate',
    BANK: 'bank',
    OTHER: 'other',
    PURCHASE: 'purchase',
    VALIDATE: 'validate'
  },

  // Merchant IDs
  MERCHANT_IDS: {
    BALANCE: 'BALANCE',
    TRANSFER: 'TRANSFER',
    MTN_AIRTIME: 'MTNUGAIRTIME',
    AIRTEL_AIRTIME: 'AIRTELUG',
    MTN_MONEY: '007001017',
    AIRTEL_MONEY: '007001016',
    NWSC: 'NWSC',
    UMEME: 'UMEME',
    DSTV: '007001001',
    GOTV: '007001014'
  },

  // Menu types
  MENU_TYPES: {
    STATIC: 'static',
    MENU: 'menu',
    INPUT: 'input',
    SERVICE: 'service'
  },

  // Input types
  INPUT_TYPES: {
    TEXT: 'text',
    PASSWORD: 'password',
    NUMBER: 'number',
    PHONE: 'phone'
  },

  // Validation types
  VALIDATION_TYPES: {
    NUMERIC: 'numeric',
    PHONE: 'phone',
    AMOUNT: 'amount',
    MENU_OPTION: 'menu_option',
    ACCOUNT: 'account',
    PIN: 'pin',
    EMAIL: 'email'
  },

  // Network types
  NETWORK_TYPES: {
    MTN: 'mtn',
    AIRTEL: 'airtel',
    UNKNOWN: 'unknown'
  },

  // Transaction types
  TRANSACTION_TYPES: {
    WITHDRAWAL: 'withdrawal',
    DEPOSIT: 'deposit',
    AIRTIME: 'airtime',
    PAYMENT: 'payment',
    TRANSFER: 'transfer',
    BALANCE: 'balance',
    STATEMENT: 'statement'
  },

  // Error messages
  ERROR_MESSAGES: {
    INVALID_SESSION: 'Invalid or expired session',
    SERVICE_UNAVAILABLE: 'Service temporarily unavailable',
    INVALID_INPUT: 'Invalid input provided',
    TRANSACTION_FAILED: 'Transaction failed. Please try again',
    NETWORK_ERROR: 'Network error. Please try again',
    UNAUTHORIZED: 'Unauthorized access',
    RATE_LIMITED: 'Too many requests. Please try again later'
  }
};