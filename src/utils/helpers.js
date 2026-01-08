const config = require('../../config/default');

class Helpers {
  static formatCurrency(amount, currency = 'UGX') {
    if (!amount || isNaN(amount)) return `${currency} 0`;
    
    const formatted = parseInt(amount).toLocaleString('en-US', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    });
    
    return `${currency} ${formatted}`;
  }

  static maskPhoneNumber(phoneNumber) {
    if (!phoneNumber || phoneNumber.length < 7) return phoneNumber;
    
    const visibleDigits = 3;
    const maskedDigits = phoneNumber.length - (visibleDigits * 2);
    
    return phoneNumber.substring(0, visibleDigits) + 
           '*'.repeat(maskedDigits) + 
           phoneNumber.substring(phoneNumber.length - visibleDigits);
  }

  static maskAccountNumber(accountNumber) {
    if (!accountNumber || accountNumber.length < 5) return accountNumber;
    
    const visibleDigits = 4;
    return '****' + accountNumber.substring(accountNumber.length - visibleDigits);
  }

  static generateTransactionReference() {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 8);
    return `EBO${timestamp}${random}`.toUpperCase();
  }

  static parseUssdInput(input) {
    if (!input) return [];
    
    // Split by asterisk and filter empty strings
    return input.split('*').filter(part => part.trim() !== '');
  }

  static getNetworkFromMsisdn(msisdn) {
    const mtnPrefixes = config.validation.mtnPrefixes;
    const airtelPrefixes = config.validation.airtelPrefixes;
    
    if (mtnPrefixes.some(prefix => msisdn.startsWith(prefix))) {
      return 'mtn';
    } else if (airtelPrefixes.some(prefix => msisdn.startsWith(prefix))) {
      return 'airtel';
    }
    
    return 'unknown';
  }

  static sanitizeInput(input) {
    if (typeof input !== 'string') return input;
    
    // Remove any potentially dangerous characters
    return input.replace(/[<>"'&]/g, '');
  }

  static validateDateFormat(dateStr) {
    const regex = /^\d{4}-\d{2}-\d{2}$/;
    return regex.test(dateStr);
  }

  static calculateSessionTimeout(startTime) {
    const elapsedSeconds = (Date.now() - startTime) / 1000;
    return Math.max(0, config.security.sessionTimeout - elapsedSeconds);
  }

  static formatResponseTime(startTime) {
    const duration = Date.now() - startTime;
    
    if (duration < 1000) {
      return `${duration}ms`;
    } else if (duration < 60000) {
      return `${(duration / 1000).toFixed(2)}s`;
    } else {
      return `${(duration / 60000).toFixed(2)}m`;
    }
  }
}

module.exports = Helpers;