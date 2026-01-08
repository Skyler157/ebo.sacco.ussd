const crypto = require('crypto');

class ElmaEncryptionService {
  constructor() {
    this.phpKey = 'KBSB&er3bflx9%';
    this.phpIv = '84jfkfndl3ybdfkf';
  }

  phpEncrypt(text, key, iv) {
    const hashedKey = crypto.createHash('sha256')
      .update(key)
      .digest('hex')
      .substring(0, 32);
    
    const cipher = crypto.createCipheriv('aes-256-cbc', 
      Buffer.from(hashedKey, 'utf8'),
      Buffer.from(iv, 'utf8')
    );
    
    let encrypted = cipher.update(text, 'utf8', 'binary');
    encrypted += cipher.final('binary');
    
    return Buffer.from(encrypted, 'binary').toString('base64');
  }

  phpDecrypt(encryptedText, key, iv) {
    const hashedKey = crypto.createHash('sha256')
      .update(key)
      .digest('hex')
      .substring(0, 32);
    
    const encryptedBuffer = Buffer.from(encryptedText, 'base64');
    
    const decipher = crypto.createDecipheriv('aes-256-cbc',
      Buffer.from(hashedKey, 'utf8'),
      Buffer.from(iv, 'utf8')
    );
    
    let decrypted = decipher.update(encryptedBuffer, 'binary', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  }

  encryptPin(pin) {
    return this.phpEncrypt(pin, this.phpKey, this.phpIv);
  }

  generateRandomKey() {
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < 64; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  generateRandomIV() {
    const allowedChars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_';
    let result = '';
    for (let i = 0; i < 16; i++) {
      result += allowedChars.charAt(Math.floor(Math.random() * allowedChars.length));
    }
    return result;
  }

  encryptPayload(payload) {
    const key = this.generateRandomKey();
    const iv = this.generateRandomIV();
    
    const encryptedData = this.phpEncrypt(JSON.stringify(payload), key, iv);
    
    return {
      k: key,
      i: iv,
      r: encryptedData
    };
  }

  decryptApiResponse(responseData, requestKey, requestIv) {
    let responseString;
    if (Buffer.isBuffer(responseData)) {
      responseString = responseData.toString('utf8').trim();
    } else {
      responseString = String(responseData).trim();
    }
    
    const decrypted = this.phpDecrypt(responseString, requestKey, requestIv);
    
    if (decrypted.startsWith('eyJ')) {
      try {
        const jsonString = Buffer.from(decrypted, 'base64').toString('utf8');
        return JSON.parse(jsonString);
      } catch (error) {
        return jsonString;
      }
    }
    
    try {
      return JSON.parse(decrypted);
    } catch (error) {
      return decrypted;
    }
  }

  generateTransactionId() {
    return Math.random().toString(36).substr(2, 8).toUpperCase();
  }
}

module.exports = new ElmaEncryptionService();