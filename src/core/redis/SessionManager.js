const crypto = require('crypto');
const config = require('../../../config/default');
const redisClient = require('./RedisClient');
const logger = require('../logging/Logger');

class SessionManager {
  constructor() {
    this.sessionTTL = config.redis.sessionTTL;
  }

  generateSessionId() {
    return crypto.randomBytes(16).toString('hex');
  }

  generateSessionKey(msisdn, sessionId, shortcode) {
    return `ussd:session:${msisdn}:${sessionId}:${shortcode}`;
  }

  async createSession(msisdn, sessionId, shortcode, initialData = {}) {
    const sessionKey = this.generateSessionKey(msisdn, sessionId, shortcode);
    
    const sessionData = {
      msisdn,
      sessionId,
      shortcode,
      createdAt: Date.now(),
      lastActivity: Date.now(),
      currentMenu: 'welcome',
      data: initialData,
      pinAttempts: 0,
      isAuthenticated: false,
      language: 'en'
    };

    try {
      await redisClient.set(sessionKey, sessionData, this.sessionTTL);
      logger.info(`Session created: ${sessionKey}`);
      return sessionData;
    } catch (error) {
      logger.error(`Failed to create session: ${sessionKey}`, error);
      throw error;
    }
  }

  async getSession(msisdn, sessionId, shortcode) {
    const sessionKey = this.generateSessionKey(msisdn, sessionId, shortcode);
    
    try {
      const session = await redisClient.get(sessionKey);
      
      if (session) {
        // Update last activity and extend TTL
        session.lastActivity = Date.now();
        await redisClient.set(sessionKey, session, this.sessionTTL);
      }
      
      return session;
    } catch (error) {
      logger.error(`Failed to get session: ${sessionKey}`, error);
      throw error;
    }
  }

  async updateSession(msisdn, sessionId, shortcode, updates) {
    const sessionKey = this.generateSessionKey(msisdn, sessionId, shortcode);
    
    try {
      const session = await this.getSession(msisdn, sessionId, shortcode);
      
      if (!session) {
        throw new Error('Session not found');
      }

      // Merge updates
      Object.assign(session, updates);
      session.lastActivity = Date.now();

      await redisClient.set(sessionKey, session, this.sessionTTL);
      return session;
    } catch (error) {
      logger.error(`Failed to update session: ${sessionKey}`, error);
      throw error;
    }
  }

  async updateMenuState(msisdn, sessionId, shortcode, menuId, input = null) {
    const session = await this.getSession(msisdn, sessionId, shortcode);
    
    if (!session) {
      throw new Error('Session not found');
    }

    const updates = {
      currentMenu: menuId,
      lastActivity: Date.now()
    };

    if (input !== null) {
      if (!session.inputHistory) {
        session.inputHistory = [];
      }
      session.inputHistory.push({
        menuId,
        input,
        timestamp: Date.now()
      });
      updates.inputHistory = session.inputHistory;
    }

    return await this.updateSession(msisdn, sessionId, shortcode, updates);
  }

  async storeData(msisdn, sessionId, shortcode, key, value) {
    const session = await this.getSession(msisdn, sessionId, shortcode);
    
    if (!session) {
      throw new Error('Session not found');
    }

    session.data = session.data || {};
    session.data[key] = value;
    session.lastActivity = Date.now();

    return await this.updateSession(msisdn, sessionId, shortcode, session);
  }

  async getData(msisdn, sessionId, shortcode, key) {
    const session = await this.getSession(msisdn, sessionId, shortcode);
    
    if (!session || !session.data) {
      return null;
    }

    return session.data[key];
  }

  async clearData(msisdn, sessionId, shortcode, key) {
    const session = await this.getSession(msisdn, sessionId, shortcode);
    
    if (!session || !session.data) {
      return;
    }

    delete session.data[key];
    session.lastActivity = Date.now();

    await this.updateSession(msisdn, sessionId, shortcode, session);
  }

  async incrementPinAttempts(msisdn, sessionId, shortcode) {
    const session = await this.getSession(msisdn, sessionId, shortcode);
    
    if (!session) {
      throw new Error('Session not found');
    }

    session.pinAttempts = (session.pinAttempts || 0) + 1;
    session.lastActivity = Date.now();

    if (session.pinAttempts >= config.security.maxPinAttempts) {
      await this.endSession(msisdn, sessionId, shortcode);
      throw new Error('Maximum PIN attempts exceeded');
    }

    return await this.updateSession(msisdn, sessionId, shortcode, session);
  }

  async resetPinAttempts(msisdn, sessionId, shortcode) {
    return await this.updateSession(msisdn, sessionId, shortcode, {
      pinAttempts: 0,
      lastActivity: Date.now()
    });
  }

  async setAuthentication(msisdn, sessionId, shortcode, customerData) {
    return await this.updateSession(msisdn, sessionId, shortcode, {
      isAuthenticated: true,
      customerId: customerData.customerId,
      customerName: customerData.customerName,
      accounts: customerData.accounts,
      pinAttempts: 0,
      lastActivity: Date.now()
    });
  }

  async endSession(msisdn, sessionId, shortcode) {
    const sessionKey = this.generateSessionKey(msisdn, sessionId, shortcode);
    
    try {
      // Clean up all related keys
      await redisClient.flushSession(sessionKey);
      logger.info(`Session ended: ${sessionKey}`);
      return true;
    } catch (error) {
      logger.error(`Failed to end session: ${sessionKey}`, error);
      throw error;
    }
  }

  async cleanupExpiredSessions() {
    try {
      // Redis handles expiration automatically, but we can add manual cleanup logic here
      logger.info('Session cleanup completed');
    } catch (error) {
      logger.error('Failed to cleanup sessions:', error);
    }
  }
}

module.exports = new SessionManager();