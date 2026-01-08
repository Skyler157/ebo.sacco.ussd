const axios = require('axios');
const config = require('../../config/default');
const encryptionService = require('../core/encryption/ElmaEncryptionService');
const logger = require('../core/logging/Logger');

class ApiService {
  constructor() {
    this.timeout = config.api.timeout;
    this.retries = config.api.retries;
    this.endpoints = config.api.endpoints;
  }

  async callService(serviceType, payload, msisdn = null) {
    const endpoint = this.endpoints[serviceType];
    const requestId = payload.UNIQUEID || 'unknown';

    if (!endpoint) {
      throw new Error(`Unknown service type: ${serviceType}`);
    }

    try {
      // Log API request details
      if (msisdn) {
        logger.logSession(msisdn, `API REQUEST: ${serviceType.toUpperCase()} to ${endpoint}`);
        logger.logSession(msisdn, `API REQUEST PAYLOAD: ${JSON.stringify(payload)}`);
      }

      const encryptedPayload = encryptionService.encryptPayload(payload);

      // Log encrypted payload (for debugging)
      if (msisdn) {
        logger.logSession(msisdn, `API REQUEST ENCRYPTED: k=${encryptedPayload.k.substring(0, 8)}..., r=${encryptedPayload.r.substring(0, 20)}...`);
      }

      const startTime = Date.now();
      const response = await axios.post(endpoint, encryptedPayload, {
        timeout: this.timeout,
        responseType: 'arraybuffer',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': `${config.app.name}/${config.app.version}`
        }
      });
      const duration = Date.now() - startTime;

      const responseBuffer = Buffer.from(response.data);
      const responseString = responseBuffer.toString('utf8').trim();

      // Log encrypted response
      if (msisdn) {
        logger.logSession(msisdn, `API RESPONSE ENCRYPTED: ${responseString.substring(0, 50)}...`);
      }

      const decryptedResponse = encryptionService.decryptApiResponse(
        responseString,
        encryptedPayload.k,
        encryptedPayload.i
      );

      // Log decrypted response
      if (msisdn) {
        logger.logSession(msisdn, `API RESPONSE DECRYPTED: ${JSON.stringify(decryptedResponse)}`);
      }

      const parsedResponse = this.parseResponse(decryptedResponse, serviceType);

      // Log final parsed response
      if (msisdn) {
        logger.logSession(msisdn, `API RESPONSE PARSED: Status=${parsedResponse.status}, Message="${parsedResponse.message}"`);
      }

      return parsedResponse;

    } catch (error) {
      // Log API error details
      if (msisdn) {
        logger.logSession(msisdn, `API ERROR: ${error.message}`);
        if (error.response) {
          logger.logSession(msisdn, `API ERROR RESPONSE: HTTP ${error.response.status} - ${JSON.stringify(error.response.data)}`);
        } else if (error.request) {
          logger.logSession(msisdn, `API ERROR REQUEST: No response received`);
        }
      }
      throw this.handleApiError(error);
    }
  }

  async authenticateCustomer(msisdn, sessionId, shortcode, pin) {
    const payload = {
      TRXSOURCE: "USSD",
      CODEBASE: config.app.codebase,
      APPNAME: config.app.name,
      VERSIONNUMBER: config.app.version,
      CUSTOMERID: "",
      MOBILENUMBER: msisdn,
      SHORTCODE: shortcode,
      FORMID: "GETCUSTOMER",
      SESSIONID: sessionId,
      UNIQUEID: encryptionService.generateTransactionId(),
      COUNTRY: config.app.country,
      BANKID: config.app.bankId,
      MERCHANTID: null,
      GETCUSTOMER: {
        LOGINTYPE: null,
        PINTYPE: null,
        BANKACCOUNTID: null,
        MERCHANTID: null,
        ACCOUNTID: null,
        TRXDESCRIPTION: null,
        AMOUNT: null,
        MOBILENUMBER: null,
        INFOFIELD1: null,
        INFOFIELD2: null,
        INFOFIELD3: null,
        INFOFIELD4: null,
        INFOFIELD5: null,
        INFOFIELD6: null,
        INFOFIELD7: null,
        INFOFIELD8: null,
        INFOFIELD9: null
      },
      ENCRYPTEDFIELDS: {
        OLDPIN: null,
        NEWPIN: null,
        CONFIRMPIN: null,
        PIN: encryptionService.encryptPin(pin)
      }
    };

    return await this.callService('authenticate', payload, msisdn);
  }

  parseResponse(response, serviceType) {
    if (response && typeof response === 'object') {
      // Only throw error for non-000 status codes
      if (response.Status && response.Status !== '000') {
        // For authentication, Status 101 is also acceptable (PIN change required)
        if (serviceType === 'authenticate' && response.Status === '101') {
          // This is handled in parseAuthenticationResponse
        } else {
          throw new Error(response.Message || `Service error: ${response.Status}`);
        }
      }

      switch (serviceType) {
        case 'authenticate':
          return this.parseAuthenticationResponse(response);
        case 'bank':
          return this.parseBankResponse(response);
        case 'purchase':
          return this.parsePurchaseResponse(response);
        case 'validate':
          return this.parseValidationResponse(response);
        case 'other':
          return this.parseOtherResponse(response);
        default:
          return response;
      }
    }

    // If response is not an object, return as-is
    return response;
  }


  parseAuthenticationResponse(response) {
    const result = {
      status: response.Status || '000',
      message: response.Message || '',
      data: {}
    };

    // Status 000 means SUCCESS, even if PIN has expired
    if (response.Status === '000') {
      result.success = true;

      // Check if PIN has expired (warning message)
      if (response.Message &&
        (response.Message.toLowerCase().includes('expired') ||
          response.Message.toLowerCase().includes('change') ||
          response.Message.toLowerCase().includes('changepin'))) {
        result.pinExpired = true;
        result.requirePinChange = true;
      }
    }

    // Status 101 also means PIN change required
    if (response.Status === '101') {
      result.success = true; // Still considered successful for authentication
      result.requirePinChange = true;
      result.pinExpired = true;
    }

    if (response.CustomerDetails && response.CustomerDetails.length > 0) {
      const customer = response.CustomerDetails[0];
      result.data.customerId = customer.CustomerID;
      result.data.customerName = `${customer.FirstName} ${customer.LastName}`;
      result.data.mobileNumber = customer.MobileNumber;
      result.data.email = customer.EmailID;
    }

    if (response.Accounts && Array.isArray(response.Accounts)) {
      result.data.accounts = response.Accounts.map(acc => ({
        accountId: acc.BankAccountID,
        maskedAccount: acc.MaskedAccount,
        aliasName: acc.AliasName,
        currency: acc.CurrencyID,
        accountType: acc.AccountType,
        isDefault: acc.DefaultAccount
      }));
    }

    return result;
  }

  parseBankResponse(response) {
    return {
      status: response.Status,
      message: response.Message,
      data: response.ResultsData || []
    };
  }

  parsePurchaseResponse(response) {
    return {
      status: response.Status,
      message: response.Message,
      transactionId: response.TransactionID,
      reference: response.Reference
    };
  }

  parseValidationResponse(response) {
    return {
      status: response.Status,
      message: response.Message,
      isValid: response.Status === '000'
    };
  }

  parseOtherResponse(response) {
    return {
      status: response.Status,
      message: response.Message,
      data: response.ResultsData || []
    };
  }

  handleApiError(error) {
    if (error.response) {
      const status = error.response.status;
      const message = error.response.data?.Message || error.message;

      switch (status) {
        case 400:
          return new Error(`Bad request: ${message}`);
        case 401:
          return new Error('Authentication failed');
        case 403:
          return new Error('Access denied');
        case 404:
          return new Error('Service not found');
        case 408:
        case 504:
          return new Error('Service timeout. Please try again');
        case 500:
          return new Error('Internal server error');
        default:
          return new Error(`Service error: ${status} - ${message}`);
      }
    } else if (error.request) {
      return new Error('Service unavailable. Please try again later');
    } else {
      return new Error(`Request failed: ${error.message}`);
    }
  }

  async getAccountBalance(msisdn, sessionId, shortcode, accountNumber) {
    const payload = {
      TRXSOURCE: "USSD",
      CODEBASE: config.app.codebase,
      APPNAME: config.app.name,
      VERSIONNUMBER: config.app.version,
      CUSTOMERID: "",
      MOBILENUMBER: msisdn,
      SHORTCODE: shortcode,
      FORMID: "PAYBILL",
      SESSIONID: sessionId,
      UNIQUEID: encryptionService.generateTransactionId(),
      COUNTRY: config.app.country,
      BANKID: config.app.bankId,
      MERCHANTID: "BALANCE",
      PAYBILL: {
        BANKACCOUNTID: accountNumber,
        MERCHANTID: "BALANCE",
        ACCOUNTID: null,
        TRXDESCRIPTION: null,
        AMOUNT: null,
        MOBILENUMBER: null,
        INFOFIELD1: null,
        INFOFIELD2: null,
        INFOFIELD3: null,
        INFOFIELD4: null,
        INFOFIELD5: null,
        INFOFIELD6: null,
        INFOFIELD7: null,
        INFOFIELD8: null,
        INFOFIELD9: null
      },
      ENCRYPTEDFIELDS: {
        PIN: null
      }
    };

    return await this.callService('bank', payload, msisdn);
  }

  async transferFunds(msisdn, sessionId, shortcode, params) {
    const payload = {
      TRXSOURCE: "USSD",
      CODEBASE: config.app.codebase,
      APPNAME: config.app.name,
      VERSIONNUMBER: config.app.version,
      CUSTOMERID: params.customerId,
      MOBILENUMBER: msisdn,
      SHORTCODE: shortcode,
      FORMID: "PAYBILL",
      SESSIONID: sessionId,
      UNIQUEID: encryptionService.generateTransactionId(),
      COUNTRY: config.app.country,
      BANKID: config.app.bankId,
      MERCHANTID: "TRANSFER",
      PAYBILL: {
        BANKACCOUNTID: params.sourceAccount,
        MERCHANTID: "TRANSFER",
        ACCOUNTID: params.destinationAccount,
        TRXDESCRIPTION: null,
        AMOUNT: params.amount,
        MOBILENUMBER: null,
        INFOFIELD1: params.remark || '',
        INFOFIELD2: params.transferType || 'OTHERACCOUNT',
        INFOFIELD3: params.recipientName || '',
        INFOFIELD4: null,
        INFOFIELD5: null,
        INFOFIELD6: null,
        INFOFIELD7: null,
        INFOFIELD8: null,
        INFOFIELD9: null
      },
      ENCRYPTEDFIELDS: {
        PIN: encryptionService.encryptPin(params.pin)
      }
    };

    return await this.callService('bank', payload, msisdn);
  }

  async purchaseAirtime(msisdn, sessionId, shortcode, params) {
    const merchantMapping = {
      'mtn': 'MTNUGAIRTIME',
      'airtel': 'AIRTELUG'
    };

    const payload = {
      TRXSOURCE: "USSD",
      CODEBASE: config.app.codebase,
      APPNAME: config.app.name,
      VERSIONNUMBER: config.app.version,
      CUSTOMERID: params.customerId,
      MOBILENUMBER: msisdn,
      SHORTCODE: shortcode,
      FORMID: "PAYBILL",
      SESSIONID: sessionId,
      UNIQUEID: encryptionService.generateTransactionId(),
      COUNTRY: config.app.country,
      BANKID: config.app.bankId,
      MERCHANTID: merchantMapping[params.network],
      PAYBILL: {
        BANKACCOUNTID: params.sourceAccount,
        MERCHANTID: merchantMapping[params.network],
        ACCOUNTID: params.phoneNumber,
        TRXDESCRIPTION: null,
        AMOUNT: params.amount,
        MOBILENUMBER: null,
        INFOFIELD1: `${params.network.toUpperCase()} AIRTIME`,
        INFOFIELD2: params.network.toUpperCase(),
        INFOFIELD3: null,
        INFOFIELD4: null,
        INFOFIELD5: null,
        INFOFIELD6: null,
        INFOFIELD7: null,
        INFOFIELD8: null,
        INFOFIELD9: null
      },
      ENCRYPTEDFIELDS: {
        PIN: encryptionService.encryptPin(params.pin)
      }
    };

    return await this.callService('purchase', payload, msisdn);
  }

  async validateWallet(msisdn, sessionId, shortcode, params) {
    const payload = {
      TRXSOURCE: "USSD",
      CODEBASE: config.app.codebase,
      APPNAME: config.app.name,
      VERSIONNUMBER: config.app.version,
      CUSTOMERID: params.customerId,
      MOBILENUMBER: msisdn,
      SHORTCODE: shortcode,
      FORMID: "VALIDATE",
      SESSIONID: sessionId,
      UNIQUEID: encryptionService.generateTransactionId(),
      COUNTRY: config.app.country,
      BANKID: config.app.bankId,
      MERCHANTID: null,
      VALIDATE: {
        BANKACCOUNTID: null,
        MERCHANTID: null,
        ACCOUNTID: params.walletNumber,
        TRXDESCRIPTION: null,
        AMOUNT: null,
        MOBILENUMBER: null,
        INFOFIELD1: params.network,
        INFOFIELD2: null,
        INFOFIELD3: null,
        INFOFIELD4: null,
        INFOFIELD5: null,
        INFOFIELD6: null,
        INFOFIELD7: null,
        INFOFIELD8: null,
        INFOFIELD9: null
      },
      ENCRYPTEDFIELDS: {
        PIN: null
      }
    };

    return await this.callService('validate', payload, msisdn);
  }

  async getStaticData(msisdn, sessionId, shortcode, category, parentId = null) {
    const payload = {
      TRXSOURCE: "USSD",
      CODEBASE: config.app.codebase,
      APPNAME: config.app.name,
      VERSIONNUMBER: config.app.version,
      CUSTOMERID: "",
      MOBILENUMBER: msisdn,
      SHORTCODE: shortcode,
      FORMID: "DBCALL",
      SESSIONID: sessionId,
      UNIQUEID: encryptionService.generateTransactionId(),
      COUNTRY: config.app.country,
      BANKID: config.app.bankId,
      MERCHANTID: null,
      DYNAMICFORM: {
        BANKACCOUNTID: null,
        MERCHANTID: null,
        HEADER: "GETUSSDSTATICDATA",
        ACCOUNTID: null,
        TRXDESCRIPTION: null,
        AMOUNT: null,
        MOBILENUMBER: null,
        INFOFIELD1: category,
        INFOFIELD2: parentId,
        INFOFIELD3: null,
        INFOFIELD4: null,
        INFOFIELD5: null,
        INFOFIELD6: null,
        INFOFIELD7: null,
        INFOFIELD8: null,
        INFOFIELD9: null
      },
      ENCRYPTEDFIELDS: {
        PIN: null
      }
    };

    return await this.callService('other', payload, msisdn);
  }

  async validateAccount(msisdn, sessionId, shortcode, params) {
    const payload = {
      TRXSOURCE: "USSD",
      CODEBASE: config.app.codebase,
      APPNAME: config.app.name,
      VERSIONNUMBER: config.app.version,
      CUSTOMERID: params.customerId,
      MOBILENUMBER: msisdn,
      SHORTCODE: shortcode,
      FORMID: "VALIDATE",
      SESSIONID: sessionId,
      UNIQUEID: encryptionService.generateTransactionId(),
      COUNTRY: config.app.country,
      BANKID: config.app.bankId,
      MERCHANTID: null,
      VALIDATE: {
        BANKACCOUNTID: null,
        MERCHANTID: null,
        ACCOUNTID: params.accountNumber,
        TRXDESCRIPTION: null,
        AMOUNT: null,
        MOBILENUMBER: null,
        INFOFIELD1: params.billerType,
        INFOFIELD2: null,
        INFOFIELD3: null,
        INFOFIELD4: null,
        INFOFIELD5: null,
        INFOFIELD6: null,
        INFOFIELD7: null,
        INFOFIELD8: null,
        INFOFIELD9: null
      },
      ENCRYPTEDFIELDS: {
        PIN: null
      }
    };

    return await this.callService('validate', payload, msisdn);
  }

  async getMiniStatement(msisdn, sessionId, shortcode, accountNumber) {
    const payload = {
      TRXSOURCE: "USSD",
      CODEBASE: config.app.codebase,
      APPNAME: config.app.name,
      VERSIONNUMBER: config.app.version,
      CUSTOMERID: "",
      MOBILENUMBER: msisdn,
      SHORTCODE: shortcode,
      FORMID: "PAYBILL",
      SESSIONID: sessionId,
      UNIQUEID: encryptionService.generateTransactionId(),
      COUNTRY: config.app.country,
      BANKID: config.app.bankId,
      MERCHANTID: "STATEMENT",
      PAYBILL: {
        BANKACCOUNTID: accountNumber,
        MERCHANTID: "STATEMENT",
        ACCOUNTID: null,
        TRXDESCRIPTION: null,
        AMOUNT: null,
        MOBILENUMBER: null,
        INFOFIELD1: null,
        INFOFIELD2: null,
        INFOFIELD3: null,
        INFOFIELD4: null,
        INFOFIELD5: null,
        INFOFIELD6: null,
        INFOFIELD7: null,
        INFOFIELD8: null,
        INFOFIELD9: null
      },
      ENCRYPTEDFIELDS: {
        PIN: null
      }
    };

    return await this.callService('bank', payload, msisdn);
  }

  async processPayment(msisdn, sessionId, shortcode, params) {
    const merchantMapping = {
      'NWSC': '007001003',
      'UMEME': '007001012',
      'DSTV': '007001001',
      'GOTV': '007001014',
      'STARTIMES': '007001015'
    };

    const payload = {
      TRXSOURCE: "USSD",
      CODEBASE: config.app.codebase,
      APPNAME: config.app.name,
      VERSIONNUMBER: config.app.version,
      CUSTOMERID: params.customerId,
      MOBILENUMBER: msisdn,
      SHORTCODE: shortcode,
      FORMID: "PAYBILL",
      SESSIONID: sessionId,
      UNIQUEID: encryptionService.generateTransactionId(),
      COUNTRY: config.app.country,
      BANKID: config.app.bankId,
      MERCHANTID: merchantMapping[params.billerType] || 'OTHER',
      PAYBILL: {
        BANKACCOUNTID: params.sourceAccount,
        MERCHANTID: merchantMapping[params.billerType] || 'OTHER',
        ACCOUNTID: params.accountNumber,
        TRXDESCRIPTION: null,
        AMOUNT: params.amount,
        MOBILENUMBER: null,
        INFOFIELD1: params.billerType,
        INFOFIELD2: null,
        INFOFIELD3: null,
        INFOFIELD4: null,
        INFOFIELD5: null,
        INFOFIELD6: null,
        INFOFIELD7: null,
        INFOFIELD8: null,
        INFOFIELD9: null
      },
      ENCRYPTEDFIELDS: {
        PIN: encryptionService.encryptPin(params.pin)
      }
    };

    return await this.callService('purchase', payload, msisdn);
  }

  async changePIN(msisdn, sessionId, shortcode, params) {
    const payload = {
      TRXSOURCE: "USSD",
      CODEBASE: config.app.codebase,
      APPNAME: config.app.name,
      VERSIONNUMBER: config.app.version,
      CUSTOMERID: params.customerId,
      MOBILENUMBER: msisdn,
      SHORTCODE: shortcode,
      FORMID: "CHANGEPIN",
      SESSIONID: sessionId,
      UNIQUEID: encryptionService.generateTransactionId(),
      COUNTRY: config.app.country,
      BANKID: config.app.bankId,
      MERCHANTID: null,
      CHANGEPIN: {
        LOGINTYPE: null,
        PINTYPE: null,
        BANKACCOUNTID: null,
        MERCHANTID: null,
        ACCOUNTID: null,
        TRXDESCRIPTION: null,
        AMOUNT: null,
        MOBILENUMBER: null,
        INFOFIELD1: null,
        INFOFIELD2: null,
        INFOFIELD3: null,
        INFOFIELD4: null,
        INFOFIELD5: null,
        INFOFIELD6: null,
        INFOFIELD7: null,
        INFOFIELD8: null,
        INFOFIELD9: null
      },
      ENCRYPTEDFIELDS: {
        OLDPIN: encryptionService.encryptPin(params.oldPin),
        NEWPIN: encryptionService.encryptPin(params.newPin),
        CONFIRMPIN: encryptionService.encryptPin(params.newPin)
      }
    };

    return await this.callService('authenticate', payload, msisdn);
  }
}

module.exports = new ApiService();