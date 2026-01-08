require('dotenv').config();
const ApiService = require('./src/services/ApiService');

// Mock the actual API call to test parsing
async function testParsing() {
  console.log('Testing authentication response parsing...\n');
  
  // Simulate the response we're getting from ELMA
  const mockResponse = {
    "Status": "000",
    "Message": "Dear Customer, Your PIN has expired please change it to continue to have access to mobile banking.",
    "FormID": "CHANGEPIN",
    "LanguageID": "ENG",
    "NextFormSequence": 1,
    "ChangePINAtNextLogin": false,
    "PINCount": 0,
    "CustomerKey": "256700146817-1794246760-23-UGANDATEST",
    "LParam": "EF2A5CC9C69220DC060FE60E37D621867E407544D3CFEAB0396CAC6B8C59532C",
    "TParam": "EF2A5CC9C69220DC060FE60E37D621867E407544D3CFEAB0396CAC6B8C59532C",
    "CustomerDetails": [
      {
        "MobileNumber": "256700146817",
        "EmailID": "shafiqkabali@gmail.com",
        "FirstName": "Shafiq",
        "LastName": "Kabali",
        "CustomerID": "1794246760",
        "Country": "UGANDATEST"
      }
    ],
    "BankDetails": [
      {
        "BankID": "23",
        "BankName": "Housing finance Bank",
        "BankAccountsURL": "",
        "BankContacts": "",
        "BankSMSHeader": "",
        "BankEMailHeader": "",
        "BankSupportEmail": ""
      }
    ],
    "Accounts": [
      {
        "BankAccountID": "1100006393",
        "MaskedAccount": "*****6393",
        "AliasName": "Tendo",
        "CurrencyID": "UGX",
        "AccountType": "Bank",
        "GroupAccount": false,
        "DefaultAccount": true
      }
    ]
  };
  
  try {
    const parsed = ApiService.parseAuthenticationResponse(mockResponse);
    console.log('Parsed result:');
    console.log(JSON.stringify(parsed, null, 2));
    
    console.log('\nStatus:', parsed.status);
    console.log('PIN Expired?', parsed.pinExpired);
    console.log('Customer Name:', parsed.data.customerName);
    console.log('Accounts:', parsed.data.accounts.length);
    
    if (parsed.status === '000') {
      console.log('\n✅ Authentication would be successful!');
    }
  } catch (error) {
    console.error('❌ Error parsing:', error.message);
  }
}

testParsing();