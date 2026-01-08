const config = require('../../../config/default');
const logger = require('../logging/Logger');

class Validator {
  constructor() {
    this.validations = {
      numeric: this.validateNumeric.bind(this),
      phone: this.validatePhone.bind(this),
      amount: this.validateAmount.bind(this),
      menu_option: this.validateMenuOption.bind(this),
      account: this.validateAccount.bind(this),
      pin: this.validatePIN.bind(this),
      email: this.validateEmail.bind(this)
    };
  }

  validate(type, value, options = {}) {
    if (!this.validations[type]) {
      throw new Error(`Unknown validation type: ${type}`);
    }

    return this.validations[type](value, options);
  }

  validateNumeric(value, options = {}) {
    if (typeof value !== 'string' && typeof value !== 'number') {
      return { isValid: false, message: 'Value must be numeric' };
    }

    const strValue = String(value);
    
    // Check if it's a valid number
    if (!/^\d+$/.test(strValue)) {
      return { isValid: false, message: 'Must contain only digits' };
    }

    // Check min length
    if (options.minLength && strValue.length < options.minLength) {
      return { 
        isValid: false, 
        message: `Must be at least ${options.minLength} digits` 
      };
    }

    // Check max length
    if (options.maxLength && strValue.length > options.maxLength) {
      return { 
        isValid: false, 
        message: `Cannot exceed ${options.maxLength} digits` 
      };
    }

    // Check exact length
    if (options.exactLength && strValue.length !== options.exactLength) {
      return { 
        isValid: false, 
        message: `Must be exactly ${options.exactLength} digits` 
      };
    }

    return { isValid: true, message: '' };
  }

  validatePhone(value, options = {}) {
    const numericValidation = this.validateNumeric(value);
    if (!numericValidation.isValid) {
      return numericValidation;
    }

    const strValue = String(value);
    let normalizedNumber = strValue;

    // Add country code if missing
    if (strValue.startsWith('0')) {
      normalizedNumber = '256' + strValue.substring(1);
    } else if (!strValue.startsWith('256')) {
      normalizedNumber = '256' + strValue;
    }

    // Check length
    if (normalizedNumber.length !== 12) {
      return { 
        isValid: false, 
        message: 'Invalid phone number length' 
      };
    }

    // Network validation
    if (options.network) {
      const network = options.network.toLowerCase();
      const networkPrefixes = config.validation[`${network}Prefixes`] || [];
      
      if (networkPrefixes.length > 0) {
        const isValidNetwork = networkPrefixes.some(prefix => 
          normalizedNumber.startsWith(prefix)
        );
        
        if (!isValidNetwork) {
          return { 
            isValid: false, 
            message: `Must be a valid ${network.toUpperCase()} number` 
          };
        }
      }
    }

    // Multiple networks validation
    if (options.networks && Array.isArray(options.networks)) {
      const isValidNetwork = options.networks.some(network => {
        const networkPrefixes = config.validation[`${network}Prefixes`] || [];
        return networkPrefixes.some(prefix => 
          normalizedNumber.startsWith(prefix)
        );
      });
      
      if (!isValidNetwork) {
        const networksStr = options.networks.map(n => n.toUpperCase()).join('/');
        return { 
          isValid: false, 
          message: `Must be a valid ${networksStr} number` 
        };
      }
    }

    return { 
      isValid: true, 
      message: '',
      normalized: normalizedNumber,
      formatted: `0${normalizedNumber.substring(3)}`
    };
  }

  validateAmount(value, options = {}) {
    const numericValidation = this.validateNumeric(value);
    if (!numericValidation.isValid) {
      return numericValidation;
    }

    const amount = parseInt(value, 10);
    
    // Check minimum amount
    const minAmount = options.min || config.validation.minAmount || 100;
    if (amount < minAmount) {
      return { 
        isValid: false, 
        message: `Minimum amount is ${minAmount}` 
      };
    }

    // Check maximum amount
    const maxAmount = options.max || config.validation.maxAmount || 5000000;
    if (amount > maxAmount) {
      return { 
        isValid: false, 
        message: `Maximum amount is ${maxAmount}` 
      };
    }

    return { isValid: true, message: '' };
  }

  validateMenuOption(value, options = {}) {
    const menuOptions = options.menuOptions || [];
    
    if (!menuOptions.includes(value)) {
      return { 
        isValid: false, 
        message: 'Invalid selection. Please try again.' 
      };
    }

    return { isValid: true, message: '' };
  }

  validateAccount(value, options = {}) {
    const numericValidation = this.validateNumeric(value);
    if (!numericValidation.isValid) {
      return numericValidation;
    }

    // Account number format validation (customize as needed)
    const strValue = String(value);
    
    if (options.minLength && strValue.length < options.minLength) {
      return { 
        isValid: false, 
        message: `Account number too short` 
      };
    }

    if (options.maxLength && strValue.length > options.maxLength) {
      return { 
        isValid: false, 
        message: `Account number too long` 
      };
    }

    // Add checksum validation if required
    if (options.checksum) {
      // Implement checksum validation logic here
    }

    return { isValid: true, message: '' };
  }

  validatePIN(value, options = {}) {
    const numericValidation = this.validateNumeric(value, { exactLength: 4 });
    if (!numericValidation.isValid) {
      return numericValidation;
    }

    return { isValid: true, message: '' };
  }

  validateEmail(value) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    
    if (!emailRegex.test(value)) {
      return { 
        isValid: false, 
        message: 'Invalid email format' 
      };
    }

    return { isValid: true, message: '' };
  }

  isSequentialDigits(str) {
    const digits = str.split('').map(Number);
    
    // Check ascending sequence
    let ascending = true;
    for (let i = 1; i < digits.length; i++) {
      if (digits[i] !== digits[i-1] + 1) {
        ascending = false;
        break;
      }
    }
    
    // Check descending sequence
    let descending = true;
    for (let i = 1; i < digits.length; i++) {
      if (digits[i] !== digits[i-1] - 1) {
        descending = false;
        break;
      }
    }
    
    return ascending || descending;
  }

  // Composite validations for specific business rules
  validateMobileMoneyNumber(value, network) {
    return this.validatePhone(value, { network });
  }

  validateTransactionAmount(value, serviceType) {
    // Service-specific amount limits
    const limits = {
      airtime: { min: 100, max: 100000 },
      deposit: { min: 500, max: 1000000 },
      withdrawal: { min: 1000, max: 5000000 },
      transfer: { min: 100, max: 10000000 }
    };
    
    const serviceLimits = limits[serviceType] || limits.transfer;
    return this.validateAmount(value, serviceLimits);
  }

  validateNWSCAccount(value) {
    // NWSC account validation logic
    const strValue = String(value);
    
    // Example: NWSC accounts are typically 8-10 digits
    if (strValue.length < 8 || strValue.length > 10) {
      return { 
        isValid: false, 
        message: 'Invalid NWSC account number length' 
      };
    }
    
    return { isValid: true, message: '' };
  }

  validateUMEMEAccount(value) {
    // UMEME account validation logic
    const strValue = String(value);
    
    // Example: UMEME accounts follow specific format
    if (!/^[A-Z0-9]{8,12}$/.test(strValue)) {
      return { 
        isValid: false, 
        message: 'Invalid UMEME account number format' 
      };
    }
    
    return { isValid: true, message: '' };
  }
}

module.exports = new Validator();