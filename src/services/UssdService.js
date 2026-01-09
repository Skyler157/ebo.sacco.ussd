const sessionManager = require('../core/redis/SessionManager');
const menuService = require('./MenuService');
const apiService = require('./ApiService');
const logger = require('../core/logging/Logger');

class UssdService {
    constructor() {
        this.sessionTimeout = 1800; // 30 minutes
    }

  async handleUssdRequest(request) {
        const { msisdn, sessionId, shortcode, input } = request;

        // Log the request
        logger.logUssdRequest(msisdn, sessionId, shortcode, input);

        try {
            // Get or create session
            let session = await sessionManager.getSession(msisdn, sessionId, shortcode);

            if (!session) {
                // New session
                session = await sessionManager.createSession(msisdn, sessionId, shortcode);
                return await this.handleNewSession(session, input);
            }

            // Existing session
            return await this.handleExistingSession(session, input);
        } catch (error) {
            logger.logError(msisdn, error, { context: 'ussd_request' });
            return this.formatErrorResponse(error.message);
        }
    }

    async handleNewSession(session, input) {
        const { msisdn, sessionId, shortcode } = session;

        // First call - get customer info and show personalized welcome (like PHP)
        if (!input || input === '') {
            try {
                // Call GETCUSTOMER API first (like PHP system)
                const getCustomerResult = await apiService.getCustomerInfo(msisdn, sessionId, shortcode);

                if (getCustomerResult.status === '000' && getCustomerResult.data) {
                    // Store customer data in session (like PHP)
                    const customerData = {
                        customerId: getCustomerResult.data.customerId || getCustomerResult.data.CustomerID,
                        customerName: getCustomerResult.data.customerName ||
                                    `${getCustomerResult.data.FirstName || ''} ${getCustomerResult.data.LastName || ''}`.trim() ||
                                    getCustomerResult.data.CustomerName,
                        firstName: getCustomerResult.data.FirstName,
                        lastName: getCustomerResult.data.LastName,
                        email: getCustomerResult.data.EmailID || getCustomerResult.data.email,
                        mobileNumber: getCustomerResult.data.MobileNumber || msisdn,
                        language: getCustomerResult.data.LanguageID || 'en'
                    };

                    // Store customer data in session
                    await sessionManager.storeData(msisdn, sessionId, shortcode, 'customer', customerData);

                    // Show personalized welcome message (like PHP)
                    const welcomeMenu = await menuService.renderMenu('welcome', { ...session, customer: customerData });
                    await sessionManager.updateMenuState(msisdn, sessionId, shortcode, 'welcome');
                    return this.formatContinueResponse(welcomeMenu.text);
                } else {
                    // Customer not found - show generic welcome
                    const welcomeMenu = await menuService.renderMenu('welcome', session);
                    await sessionManager.updateMenuState(msisdn, sessionId, shortcode, 'welcome');
                    return this.formatContinueResponse(welcomeMenu.text);
                }
            } catch (error) {
                logger.logError(msisdn, error, { context: 'getcustomer' });
                // Show generic welcome on error
                const welcomeMenu = await menuService.renderMenu('welcome', session);
                await sessionManager.updateMenuState(msisdn, sessionId, shortcode, 'welcome');
                return this.formatContinueResponse(welcomeMenu.text);
            }
        }

        // PIN entry - authenticate with stored customer data
        const customerData = await sessionManager.getData(msisdn, sessionId, shortcode, 'customer');

        try {
            // Call LOGIN API with PIN (like PHP system)
            const authResult = await apiService.authenticateCustomer(
                msisdn,
                sessionId,
                shortcode,
                input,
                customerData?.customerId
            );

            // Handle different authentication statuses according to PHP implementation
            if (authResult.status === '000') {
                // Status 000 - authentication successful
                // Customer data comes from GETCUSTOMER, LOGIN provides accounts/modules
                if (!customerData || !customerData.customerId) {
                    logger.logError(msisdn, new Error('Authentication succeeded but no customer data from GETCUSTOMER'), {
                        customerData,
                        authResult
                    });
                    await sessionManager.endSession(msisdn, sessionId, shortcode);
                    return this.formatEndResponse('Authentication failed. Customer data not available.');
                }

                // Merge LOGIN response data with existing customer data (like PHP customer() method)
                const updatedCustomerData = {
                    ...customerData,
                    accounts: authResult.data.accounts || [],
                    idNumber: authResult.data.idNumber || authResult.data.IDNumber,
                    menustohide: authResult.data.menustohide || authResult.data.ModulesToHide || []
                };

                await sessionManager.setAuthentication(msisdn, sessionId, shortcode, {
                    customerId: customerData.customerId,
                    customerName: customerData.customerName,
                    accounts: authResult.data.accounts || []
                });

                await sessionManager.resetPinAttempts(msisdn, sessionId, shortcode);

                // Show main menu with customer data
                const updatedSession = await sessionManager.getSession(msisdn, sessionId, shortcode);
                const mainMenu = await menuService.renderMenu('main_menu', updatedSession);
                await sessionManager.updateMenuState(msisdn, sessionId, shortcode, 'main_menu');

                return this.formatContinueResponse(mainMenu.text);

            } else if (authResult.status === '101') {
                // Status 101 - PIN change required
                if (!customerData || !customerData.customerId) {
                    logger.logError(msisdn, new Error('PIN change required but no customer data from GETCUSTOMER'), {
                        customerData,
                        authResult
                    });
                    await sessionManager.endSession(msisdn, sessionId, shortcode);
                    return this.formatEndResponse('Authentication failed. Customer data not available.');
                }

                // Store PIN for change requirement
                await sessionManager.storeData(msisdn, sessionId, shortcode, 'pinExpired', true);

                // Update session with authentication data
                await sessionManager.setAuthentication(msisdn, sessionId, shortcode, {
                    customerId: customerData.customerId,
                    customerName: customerData.customerName,
                    accounts: authResult.data.accounts || []
                });

                await sessionManager.resetPinAttempts(msisdn, sessionId, shortcode);

                // Show PIN change menu
                const updatedSession = await sessionManager.getSession(msisdn, sessionId, shortcode);
                const pinChangeMenu = await menuService.renderMenu('change_pin_old', updatedSession);
                await sessionManager.updateMenuState(msisdn, sessionId, shortcode, 'change_pin_old');

                return this.formatContinueResponse(pinChangeMenu.text);

            } else if (authResult.status === '091') {
                // Status 091 - Wrong PIN
                logger.logError(msisdn, new Error('Wrong PIN entered'), {
                    status: authResult.status,
                    message: authResult.message,
                    remainingTrials: authResult.remainingTrials
                });

                // Check if account is locked
                if (authResult.accountLocked || (authResult.message && authResult.message.toLowerCase().includes('0 trials'))) {
                    await sessionManager.endSession(msisdn, sessionId, shortcode);
                    return this.formatEndResponse(authResult.message || 'Account locked due to multiple wrong PIN attempts.');
                } else {
                    // Wrong PIN but trials remaining - increment attempts and show error on same screen (like PHP)
                    await sessionManager.incrementPinAttempts(msisdn, sessionId, shortcode);

                    // Stay on welcome menu and show error message (like PHP)
                    const welcomeMenu = await menuService.renderMenu('welcome', { ...session, customer: customerData });
                    const errorMessage = `${authResult.message}\n\n${welcomeMenu.text}`;
                    return this.formatContinueResponse(errorMessage);
                }

            } else {
                // Other authentication failures
                logger.logError(msisdn, new Error(`Authentication failed with status: ${authResult.status}`), {
                    status: authResult.status,
                    message: authResult.message
                });

                // Increment PIN attempts
                try {
                    await sessionManager.incrementPinAttempts(msisdn, sessionId, shortcode);
                } catch (error) {
                    return this.formatEndResponse('Maximum PIN attempts exceeded. Please contact support.');
                }

                await sessionManager.endSession(msisdn, sessionId, shortcode);
                return this.formatEndResponse('Authentication failed. Please try again.');
            }
        } catch (error) {
            // Any error means authentication failed
            logger.logError(msisdn, error, { context: 'authentication' });
            await sessionManager.endSession(msisdn, sessionId, shortcode);
            return this.formatEndResponse('Authentication failed. Please try again later.');
        }
    }


    async handleExistingSession(session, input) {
        const { msisdn, sessionId, shortcode, currentMenu } = session;

        // Check if session is authenticated
        if (!session.isAuthenticated && currentMenu !== 'welcome') {
            await sessionManager.endSession(msisdn, sessionId, shortcode);
            return this.formatEndResponse('Session expired. Please start again.');
        }

        // Special handling for PIN authentication on welcome screen
        if (!session.isAuthenticated && currentMenu === 'welcome' && input && input !== '') {
            // Get stored customer data from GETCUSTOMER call
            const customerData = await sessionManager.getData(msisdn, sessionId, shortcode, 'customer');

            try {
                // Call LOGIN API with PIN (like PHP system)
                const authResult = await apiService.authenticateCustomer(
                    msisdn,
                    sessionId,
                    shortcode,
                    input,
                    customerData?.customerId
                );

                // Handle different authentication statuses according to PHP implementation
                if (authResult.status === '000') {
                    // Status 000 - authentication successful
                    // Customer data comes from GETCUSTOMER, LOGIN provides accounts/modules
                    if (!customerData || !customerData.customerId) {
                        logger.logError(msisdn, new Error('Authentication succeeded but no customer data from GETCUSTOMER'), {
                            customerData,
                            authResult
                        });
                        await sessionManager.endSession(msisdn, sessionId, shortcode);
                        return this.formatEndResponse('Authentication failed. Customer data not available.');
                    }

                    // Merge LOGIN response data with existing customer data (like PHP customer() method)
                    const updatedCustomerData = {
                        ...customerData,
                        accounts: authResult.data.accounts || [],
                        idNumber: authResult.data.idNumber || authResult.data.IDNumber,
                        menustohide: authResult.data.menustohide || authResult.data.ModulesToHide || []
                    };

                    await sessionManager.setAuthentication(msisdn, sessionId, shortcode, {
                        customerId: customerData.customerId,
                        customerName: customerData.customerName,
                        accounts: authResult.data.accounts || []
                    });

                    await sessionManager.resetPinAttempts(msisdn, sessionId, shortcode);

                    // Show main menu with customer data
                    const updatedSession = await sessionManager.getSession(msisdn, sessionId, shortcode);
                    const mainMenu = await menuService.renderMenu('main_menu', updatedSession);
                    await sessionManager.updateMenuState(msisdn, sessionId, shortcode, 'main_menu');

                    return this.formatContinueResponse(mainMenu.text);

                } else if (authResult.status === '101') {
                    // Status 101 - PIN change required
                    if (!customerData || !customerData.customerId) {
                        logger.logError(msisdn, new Error('PIN change required but no customer data from GETCUSTOMER'), {
                            customerData,
                            authResult
                        });
                        await sessionManager.endSession(msisdn, sessionId, shortcode);
                        return this.formatEndResponse('Authentication failed. Customer data not available.');
                    }

                    // Store PIN for change requirement
                    await sessionManager.storeData(msisdn, sessionId, shortcode, 'pinExpired', true);

                    // Update session with authentication data
                    await sessionManager.setAuthentication(msisdn, sessionId, shortcode, {
                        customerId: customerData.customerId,
                        customerName: customerData.customerName,
                        accounts: authResult.data.accounts || []
                    });

                    await sessionManager.resetPinAttempts(msisdn, sessionId, shortcode);

                    // Show PIN change menu
                    const updatedSession = await sessionManager.getSession(msisdn, sessionId, shortcode);
                    const pinChangeMenu = await menuService.renderMenu('change_pin_old', updatedSession);
                    await sessionManager.updateMenuState(msisdn, sessionId, shortcode, 'change_pin_old');

                    return this.formatContinueResponse(pinChangeMenu.text);

                } else if (authResult.status === '091') {
                    // Status 091 - Wrong PIN
                    logger.logError(msisdn, new Error('Wrong PIN entered'), {
                        status: authResult.status,
                        message: authResult.message,
                        remainingTrials: authResult.remainingTrials
                    });

                    // Check if account is locked
                    if (authResult.accountLocked || (authResult.message && authResult.message.toLowerCase().includes('0 trials'))) {
                        await sessionManager.endSession(msisdn, sessionId, shortcode);
                        return this.formatEndResponse(authResult.message || 'Account locked due to multiple wrong PIN attempts.');
                    } else {
                        // Wrong PIN but trials remaining - increment attempts and show error on same screen (like PHP)
                        await sessionManager.incrementPinAttempts(msisdn, sessionId, shortcode);

                        // Stay on welcome menu and show error message (like PHP)
                        const welcomeMenu = await menuService.renderMenu('welcome', { ...session, customer: customerData });
                        const errorMessage = `${authResult.message}\n\n${welcomeMenu.text}`;
                        return this.formatContinueResponse(errorMessage);
                    }

                } else {
                    // Other authentication failures
                    logger.logError(msisdn, new Error(`Authentication failed with status: ${authResult.status}`), {
                        status: authResult.status,
                        message: authResult.message
                    });

                    // Increment PIN attempts
                    try {
                        await sessionManager.incrementPinAttempts(msisdn, sessionId, shortcode);
                    } catch (error) {
                        return this.formatEndResponse('Maximum PIN attempts exceeded. Please contact support.');
                    }

                    await sessionManager.endSession(msisdn, sessionId, shortcode);
                    return this.formatEndResponse('Authentication failed. Please try again.');
                }
            } catch (error) {
                // Any error means authentication failed
                logger.logError(msisdn, error, { context: 'authentication' });
                await sessionManager.endSession(msisdn, sessionId, shortcode);
                return this.formatEndResponse('Authentication failed. Please try again later.');
            }
        }

        // Get current menu - include stored session data for template replacement
        const recipientName = await sessionManager.getData(msisdn, sessionId, shortcode, 'recipientName');
        const recipientNumber = await sessionManager.getData(msisdn, sessionId, shortcode, 'recipientNumber');
        const network = await sessionManager.getData(msisdn, sessionId, shortcode, 'network');
        const amount = await sessionManager.getData(msisdn, sessionId, shortcode, 'amount');
        const sourceAccount = await sessionManager.getData(msisdn, sessionId, shortcode, 'sourceAccount');

        const enrichedSession = {
            ...session,
            recipientName: recipientName || session.recipientName,
            recipientNumber: recipientNumber || session.recipientNumber,
            network: network || session.network,
            amount: amount || session.amount,
            sourceAccount: sourceAccount || session.sourceAccount
        };

        const currentMenuData = await menuService.renderMenu(currentMenu, enrichedSession);

        // Handle empty input for menu selection
        if (!input || input === '') {
            // If no input and we're on a menu, show it again
            if (currentMenuData.type === 'menu') {
                return this.formatContinueResponse(currentMenuData.text);
            }
            // If no input and we're expecting input, show error
            return this.formatContinueResponse(`Invalid input. Please try again.\n\n${currentMenuData.text}`);
        }

        // Handle navigation commands before processing as menu selections
        if (input === '0' || input === '00' || input === '000') {
            let nextMenuId;

            if (input === '000') {
                // Exit - end session
                await sessionManager.endSession(msisdn, sessionId, shortcode);
                return this.formatEndResponse('Thank you for using EBO SACCO.');
            } else if (input === '00') {
                // Go to home/main menu
                nextMenuId = 'main_menu';
            } else if (input === '0') {
                // Go back - determine appropriate back menu based on current menu
                const backMenuMap = {
                    'withdraw_menu': 'main_menu',
                    'withdraw_mtn_options': 'withdraw_menu',
                    'withdraw_airtel_options': 'withdraw_menu',
                    'withdraw_mtn_other': 'withdraw_mtn_options',
                    'withdraw_airtel_other': 'withdraw_airtel_options',
                    'withdraw_mtn_confirm': 'withdraw_mtn_options',
                    'withdraw_airtel_confirm': 'withdraw_airtel_options',
                    'withdraw_amount': currentMenu.includes('mtn') ? 'withdraw_mtn_confirm' : 'withdraw_airtel_confirm',
                    'withdraw_select_account': 'withdraw_amount',
                    'withdraw_confirm': 'withdraw_select_account',
                    'withdraw_validation_error': 'withdraw_menu',
                    'withdraw_error': 'withdraw_menu',
                    'withdraw_success': 'main_menu'
                };

                nextMenuId = backMenuMap[currentMenu] || 'main_menu';
            }

            if (nextMenuId) {
                await sessionManager.updateMenuState(msisdn, sessionId, shortcode, nextMenuId);
                const nextMenuData = await menuService.renderMenu(nextMenuId, session);

                if (nextMenuData.type === 'service') {
                    return await this.handleServiceMenu(nextMenuData, session);
                }

                return this.formatContinueResponse(nextMenuData.text);
            }
        }

        // Validate input if required
        if (input && currentMenuData.validation) {
            const validation = menuService.validateInput(currentMenuData, input);

            if (!validation.isValid) {
                return this.formatContinueResponse(
                    `${validation.message}\n\n${currentMenuData.text}`
                );
            }

            // Store validated data
            if (currentMenuData.storeAs && validation.isValid) {
                const valueToStore = validation.normalized || input;
                await sessionManager.storeData(msisdn, sessionId, shortcode, currentMenuData.storeAs, valueToStore);
            }
        }

        // Process menu action
        const actionResult = await menuService.processMenuAction(currentMenuData, input, session);

        if (actionResult.endSession) {
            await sessionManager.endSession(msisdn, sessionId, shortcode);
            return this.formatEndResponse('Thank you for using EBO SACCO.');
        }

        // Get next menu based on input
        const nextMenuInfo = menuService.getNextMenu(currentMenu, input, session);

        if (!nextMenuInfo) {
            // If no next menu found, show invalid selection error
            return this.formatContinueResponse(
                `Invalid selection. Please try again.\n\n${currentMenuData.text}`
            );
        }

        // Update session state
        await sessionManager.updateMenuState(msisdn, sessionId, shortcode, nextMenuInfo.next, input);

        // Handle service calls
        const nextMenu = await menuService.renderMenu(nextMenuInfo.next, session);

        if (nextMenu.type === 'service') {
            return await this.handleServiceMenu(nextMenu, session);
        }

        return this.formatContinueResponse(nextMenu.text);
    }

    async handlePinAuthentication(session, pin) {
        const { msisdn, sessionId, shortcode } = session;

        // Store PIN
        await sessionManager.storeData(msisdn, sessionId, shortcode, 'pin', pin);

        try {
            // Call real API
            const authResult = await apiService.authenticateCustomer(
                msisdn,
                sessionId,
                shortcode,
                pin
            );

            // Status 000 or 101 means authentication successful
            // (101 = PIN change required, but still authenticated)
            if (authResult.status === '000' || authResult.status === '101') {
                // Set authentication data from API response only
                if (!authResult.data.customerId || !authResult.data.customerName) {
                    logger.logError(msisdn, new Error('Invalid authentication response - missing customer data'), {
                        context: 'authentication',
                        authResult
                    });
                    await sessionManager.endSession(msisdn, sessionId, shortcode);
                    return this.formatEndResponse('Authentication failed. Customer data not available.');
                }

                await sessionManager.setAuthentication(msisdn, sessionId, shortcode, {
                    customerId: authResult.data.customerId,
                    customerName: authResult.data.customerName,
                    accounts: authResult.data.accounts || []
                });

                await sessionManager.resetPinAttempts(msisdn, sessionId, shortcode);

                // Store PIN expired flag if needed
                if (authResult.pinExpired) {
                    await sessionManager.storeData(msisdn, sessionId, shortcode, 'pinExpired', true);
                }

                // Show main menu
                const mainMenu = await menuService.renderMenu('main_menu', session);
                await sessionManager.updateMenuState(msisdn, sessionId, shortcode, 'main_menu');

                return this.formatContinueResponse(mainMenu.text);
            } else {
                // Authentication failed (not 000 or 101)
                await sessionManager.endSession(msisdn, sessionId, shortcode);
                return this.formatEndResponse('Invalid PIN. Please try again.');
            }
        } catch (error) {
            // Log authentication error and end session
            logger.logError(msisdn, error, { context: 'authentication' });
            await sessionManager.endSession(msisdn, sessionId, shortcode);
            return this.formatEndResponse('Authentication failed. Please try again later.');
        }
    }

    // Network detection utility based on PHP prefix() method
    detectNetwork(phoneNumber) {
        // Remove any leading 0 and add 256 prefix
        const normalizedNumber = phoneNumber.startsWith('0') ? '256' + phoneNumber.substring(1) : phoneNumber;

        // MTN prefixes
        if (normalizedNumber.match(/^256(31|39|78|77|76|79)/)) {
            return {
                network: 'MTN',
                mno: 'MTN',
                b2cvalidation: 'MTNMONEYVALIDATION',
                b2c: '007001017',
                c2b: 'UGANDAMTNC2B'
            };
        }

        // Airtel prefixes
        if (normalizedNumber.match(/^256(20|70|75|74)/)) {
            return {
                network: 'AIRTEL',
                mno: 'AIRTEL',
                b2cvalidation: 'AIRTELMMONEYVALIDATION',
                b2c: '007001016',
                c2b: 'AIRTELC2B'
            };
        }

        return false;
    }

    async handleServiceMenu(menu, session) {
        const { msisdn, sessionId, shortcode } = session;

        try {
            let serviceResult;

            switch (menu.service) {
                case 'validateOwnWallet':
                    // For own wallet, use customer's own number - determine network from menu ID
                    const network = menu.id.includes('mtn') ? 'mtn' : 'airtel';
                    const ownNumber = '0' + msisdn.substring(3); // Convert 256XXXXXXXXX to 0XXXXXXXXX
                    const ownNetworkInfo = this.detectNetwork(ownNumber);

                    if (!ownNetworkInfo) {
                        serviceResult = { status: '001', message: 'Invalid network for your number' };
                    } else if (ownNetworkInfo.network.toLowerCase() !== network) {
                        // Check if customer's number matches the selected network
                        serviceResult = { status: '001', message: `Your number is not a valid ${network.toUpperCase()} number` };
                    } else {
                        // Validate wallet using customer's own number
                        serviceResult = await apiService.validateWallet(msisdn, sessionId, shortcode, {
                            customerId: session.customerId,
                            walletNumber: '256' + ownNumber.substring(1),
                            network: network
                        });

                        if (serviceResult.status === '000') {
                            // Store wallet details for confirmation
                            await sessionManager.storeData(msisdn, sessionId, shortcode, 'recipientNumber', '256' + ownNumber.substring(1));
                            await sessionManager.storeData(msisdn, sessionId, shortcode, 'recipientName', session.customerName || 'Self');
                            await sessionManager.storeData(msisdn, sessionId, shortcode, 'network', ownNetworkInfo.network);
                        }
                    }
                    break;

                case 'validateWallet':
                    const recipientNumber = await sessionManager.getData(msisdn, sessionId, shortcode, 'recipientNumber');
                    const walletNetwork = menu.id.includes('mtn') ? 'mtn' : 'airtel';

                    serviceResult = await apiService.validateWallet(msisdn, sessionId, shortcode, {
                        customerId: session.customerId,
                        walletNumber: recipientNumber,
                        network: walletNetwork
                    });

                    if (serviceResult.status === '000') {
                        // Store validation result
                        await sessionManager.storeData(msisdn, sessionId, shortcode, 'recipientName', serviceResult.data?.accountName || 'Unknown');
                        await sessionManager.storeData(msisdn, sessionId, shortcode, 'network', walletNetwork.toUpperCase());
                    }
                    break;

                case 'validateDepositNumber':
                    const depositWalletNumber = await sessionManager.getData(msisdn, sessionId, shortcode, 'depositNumber');
                    serviceResult = await apiService.validateWallet(msisdn, sessionId, shortcode, {
                        customerId: session.customerId,
                        walletNumber: depositWalletNumber,
                        network: 'any' // Accept both networks for deposits
                    });
                    break;

                case 'getAccounts':
                    const accounts = session.accounts || [];
                    serviceResult = { status: '000', data: accounts };
                    break;

                case 'getAreas':
                    // Fetch areas from API
                    serviceResult = await apiService.getStaticData(msisdn, sessionId, shortcode, 'AREAS');
                    break;

                case 'validateNWSCAccount':
                case 'validateLightAccount':
                case 'validateDSTVAccount':
                    const accountNumber = await sessionManager.getData(msisdn, sessionId, shortcode, 'accountNumber');
                    const billerType = menu.service.replace('validate', '').replace('Account', '');
                    serviceResult = await apiService.validateAccount(msisdn, sessionId, shortcode, {
                        customerId: session.customerId,
                        accountNumber,
                        billerType
                    });
                    break;

                case 'validateAccount':
                    const recipientAccount = await sessionManager.getData(msisdn, sessionId, shortcode, 'recipientAccount');
                    serviceResult = await apiService.validateAccount(msisdn, sessionId, shortcode, {
                        customerId: session.customerId,
                        accountNumber: recipientAccount,
                        billerType: 'INTERNAL'
                    });
                    break;

                case 'getAccountBalance':
                    const selectedAccount = await sessionManager.getData(msisdn, sessionId, shortcode, 'selectedAccount') ||
                                           session.accounts[0]?.accountId;
                    serviceResult = await apiService.getAccountBalance(msisdn, sessionId, shortcode, selectedAccount);
                    break;

                case 'getLoanAccounts':
                    // Get loan accounts from customer session data or API call
                    const allAccounts = session.accounts || [];
                    const loanAccounts = allAccounts.filter(account =>
                        account.accountType?.toLowerCase().includes('loan') ||
                        account.accountType?.toLowerCase().includes('credit')
                    );
                    serviceResult = { status: '000', data: loanAccounts };
                    break;

                case 'getLoanBalance':
                    // Get loan balance from API
                    const selectedLoanAccount = await sessionManager.getData(msisdn, sessionId, shortcode, 'selectedLoanAccount') ||
                                               (session.accounts || []).find(acc =>
                                                   acc.accountType?.toLowerCase().includes('loan')
                                               )?.accountId;

                    if (selectedLoanAccount) {
                        serviceResult = await apiService.getAccountBalance(msisdn, sessionId, shortcode, selectedLoanAccount);
                    } else {
                        serviceResult = { status: '001', message: 'No loan accounts found' };
                    }
                    break;

                case 'getMiniStatement':
                    const statementAccount = await sessionManager.getData(msisdn, sessionId, shortcode, 'selectedAccount') ||
                                            session.accounts[0]?.accountId;
                    serviceResult = await apiService.getMiniStatement(msisdn, sessionId, shortcode, statementAccount);
                    break;

                case 'processWithdrawTransaction':
                    const withdrawAmount = await sessionManager.getData(msisdn, sessionId, shortcode, 'amount');
                    const withdrawSourceAccount = await sessionManager.getData(msisdn, sessionId, shortcode, 'sourceAccount');
                    const withdrawRecipientNumber = await sessionManager.getData(msisdn, sessionId, shortcode, 'recipientNumber');
                    const withdrawPin = await sessionManager.getData(msisdn, sessionId, shortcode, 'pin');
                    const withdrawRecipientName = await sessionManager.getData(msisdn, sessionId, shortcode, 'recipientName') || 'Unknown';

                    // Detect network and get merchant ID for transfer
                    const networkInfo = this.detectNetwork('0' + withdrawRecipientNumber.substring(3));
                    const merchantId = networkInfo ? networkInfo.b2c : '007001017'; // Default to MTN
                    const networkName = networkInfo ? networkInfo.network : 'MTN';

                    // Use PAYBILL service with mobile money transfer payload (matching PHP)
                    const payload = {
                        TRXSOURCE: "USSD",
                        CODEBASE: config.app.codebase,
                        APPNAME: config.app.name,
                        VERSIONNUMBER: config.app.version,
                        CUSTOMERID: session.customerId,
                        MOBILENUMBER: msisdn,
                        SHORTCODE: shortcode,
                        FORMID: "PAYBILL",
                        SESSIONID: sessionId,
                        UNIQUEID: require('../core/encryption/ElmaEncryptionService').generateTransactionId(),
                        COUNTRY: config.app.country,
                        BANKID: config.app.bankId,
                        MERCHANTID: merchantId,
                        PAYBILL: {
                            BANKACCOUNTID: withdrawSourceAccount,
                            MERCHANTID: merchantId,
                            ACCOUNTID: withdrawRecipientNumber,
                            TRXDESCRIPTION: null,
                            AMOUNT: withdrawAmount,
                            MOBILENUMBER: null,
                            INFOFIELD1: `${networkName} MONEY`,
                            INFOFIELD2: networkName,
                            INFOFIELD3: withdrawRecipientName,
                            INFOFIELD4: null,
                            INFOFIELD5: null,
                            INFOFIELD6: null,
                            INFOFIELD7: null,
                            INFOFIELD8: null,
                            INFOFIELD9: null
                        },
                        ENCRYPTEDFIELDS: {
                            PIN: withdrawPin // Already encrypted
                        }
                    };

                    serviceResult = await apiService.callService('bank', payload, msisdn);
                    break;

                case 'processDepositTransaction':
                    const depositAmount = await sessionManager.getData(msisdn, sessionId, shortcode, 'amount');
                    const depositNumber = await sessionManager.getData(msisdn, sessionId, shortcode, 'depositNumber');
                    const depositDestinationAccount = await sessionManager.getData(msisdn, sessionId, shortcode, 'destinationAccount');
                    const depositPin = await sessionManager.getData(msisdn, sessionId, shortcode, 'pin');

                    serviceResult = await apiService.transferFunds(msisdn, sessionId, shortcode, {
                        customerId: session.customerId,
                        sourceAccount: depositNumber, // Mobile money as source
                        destinationAccount: depositDestinationAccount,
                        amount: depositAmount,
                        pin: depositPin,
                        transferType: 'DEPOSIT'
                    });
                    break;

                case 'processAirtimeTransaction':
                    const airtimeAmount = await sessionManager.getData(msisdn, sessionId, shortcode, 'amount');
                    const airtimeSourceAccount = await sessionManager.getData(msisdn, sessionId, shortcode, 'sourceAccount');
                    const airtimeRecipientNumber = await sessionManager.getData(msisdn, sessionId, shortcode, 'recipientNumber');
                    const airtimePin = await sessionManager.getData(msisdn, sessionId, shortcode, 'pin');
                    const airtimeNetwork = menu.id.includes('mtn') ? 'mtn' : 'airtel';

                    serviceResult = await apiService.purchaseAirtime(msisdn, sessionId, shortcode, {
                        customerId: session.customerId,
                        sourceAccount: airtimeSourceAccount,
                        phoneNumber: airtimeRecipientNumber || msisdn,
                        amount: airtimeAmount,
                        network: airtimeNetwork,
                        pin: airtimePin
                    });
                    break;

                case 'processPaymentTransaction':
                    const paymentAmount = await sessionManager.getData(msisdn, sessionId, shortcode, 'amount');
                    const paymentSourceAccount = await sessionManager.getData(msisdn, sessionId, shortcode, 'sourceAccount');
                    const paymentAccountNumber = await sessionManager.getData(msisdn, sessionId, shortcode, 'accountNumber');
                    const paymentPin = await sessionManager.getData(msisdn, sessionId, shortcode, 'pin');
                    const paymentBillerType = menu.id.includes('nwsc') ? 'NWSC' :
                                            menu.id.includes('light') ? 'UMEME' :
                                            menu.id.includes('dstv') ? 'DSTV' : 'OTHER';

                    serviceResult = await apiService.processPayment(msisdn, sessionId, shortcode, {
                        customerId: session.customerId,
                        sourceAccount: paymentSourceAccount,
                        accountNumber: paymentAccountNumber,
                        amount: paymentAmount,
                        billerType: paymentBillerType,
                        pin: paymentPin
                    });
                    break;

                case 'processTransferTransaction':
                    const transferAmount = await sessionManager.getData(msisdn, sessionId, shortcode, 'amount');
                    const transferSourceAccount = await sessionManager.getData(msisdn, sessionId, shortcode, 'sourceAccount');
                    const transferDestinationAccount = await sessionManager.getData(msisdn, sessionId, shortcode, 'destinationAccount');
                    const transferRemark = await sessionManager.getData(msisdn, sessionId, shortcode, 'remark') || '';
                    const transferPin = await sessionManager.getData(msisdn, sessionId, shortcode, 'pin');

                    serviceResult = await apiService.transferFunds(msisdn, sessionId, shortcode, {
                        customerId: session.customerId,
                        sourceAccount: transferSourceAccount,
                        destinationAccount: transferDestinationAccount,
                        amount: transferAmount,
                        remark: transferRemark,
                        pin: transferPin,
                        transferType: 'INTERNAL'
                    });
                    break;

                case 'changePIN':
                    const oldPin = await sessionManager.getData(msisdn, sessionId, shortcode, 'oldPin');
                    const newPin = await sessionManager.getData(msisdn, sessionId, shortcode, 'newPin');

                    serviceResult = await apiService.changePIN(msisdn, sessionId, shortcode, {
                        customerId: session.customerId,
                        oldPin,
                        newPin
                    });
                    break;

                default:
                    throw new Error(`Unknown service: ${menu.service}`);
            }

            if (serviceResult.status === '000') {
                // Service call successful
                const nextMenu = menu.onSuccess ? menu.onSuccess.next : 'success';
                const nextMenuData = await menuService.renderMenu(nextMenu, session);

                // Update session with service result if needed
                if (menu.storeAs) {
                    await sessionManager.storeData(msisdn, sessionId, shortcode, menu.storeAs, serviceResult);
                }

                await sessionManager.updateMenuState(msisdn, sessionId, shortcode, nextMenu);

                // For validation services, just proceed to next menu without displaying result
                if (menu.service === 'validateOwnWallet' || menu.service === 'validateWallet') {
                    return this.formatContinueResponse(nextMenuData.text);
                }

                // Format success message for other services
                let successMessage = nextMenuData.text;
                if (serviceResult.data) {
                    successMessage = menuService.formatBalance(serviceResult.data) || successMessage;
                }

                return this.formatContinueResponse(successMessage);
            } else {
                // Service call failed - check for specific error types
                let errorMessage = serviceResult.message || 'Service failed';

                // Handle PIN validation errors specifically for transactions
                if (serviceResult.message &&
                    (serviceResult.message.toLowerCase().includes('invalid user name or password') ||
                     serviceResult.message.toLowerCase().includes('invalid pin') ||
                     serviceResult.message.toLowerCase().includes('wrong pin'))) {
                    // Wrong PIN for transaction - show specific message and allow retry
                    errorMessage = `Dear ${session.customerName}, your transaction failed. You entered an invalid PIN`;
                } else if (!serviceResult.message || serviceResult.message.trim() === '') {
                    // Generic error
                    errorMessage = `Dear ${session.customerName}, sorry this service is temporarily unavailable. Please try again later`;
                }

                const errorMenu = menu.onError ? menu.onError.next : 'error';
                const errorMenuData = await menuService.renderMenu(errorMenu, session);

                await sessionManager.updateMenuState(msisdn, sessionId, shortcode, errorMenu);

                return this.formatContinueResponse(
                    `${errorMessage}\n\n${errorMenuData.text}`
                );
            }
        } catch (error) {
            logger.logError(msisdn, error, { context: 'service_menu', service: menu.service });

            const errorMenu = menu.onError ? menu.onError.next : 'error';
            const errorMenuData = await menuService.renderMenu(errorMenu, session);

            await sessionManager.updateMenuState(msisdn, sessionId, shortcode, errorMenu);

            return this.formatContinueResponse(
                `Service error: ${error.message}\n\n${errorMenuData.text}`
            );
        }
    }

    formatContinueResponse(message) {
        const response = `CON ${message}`;
        logger.logUssdResponse('system', 'CON', message, Buffer.byteLength(response));
        return response;
    }

    formatEndResponse(message) {
        const response = `END ${message}`;
        logger.logUssdResponse('system', 'END', message, Buffer.byteLength(response));
        return response;
    }

    formatErrorResponse(errorMessage) {
        const safeMessage = 'An error occurred. Please try again later.';
        const response = `END ${safeMessage}`;
        logger.logUssdResponse('system', 'ERROR', errorMessage, Buffer.byteLength(response));
        return response;
    }

    async cleanupExpiredSessions() {
        try {
            await sessionManager.cleanupExpiredSessions();
            logger.info('Expired sessions cleanup completed');
        } catch (error) {
            logger.error('Failed to cleanup expired sessions:', error);
        }
    }
}

module.exports = new UssdService();
