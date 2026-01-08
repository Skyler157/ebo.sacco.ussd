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

        // First call - show welcome
        if (!input || input === '') {
            const welcomeMenu = await menuService.renderMenu('welcome', session);
            await sessionManager.updateMenuState(msisdn, sessionId, shortcode, 'welcome');
            return this.formatContinueResponse(welcomeMenu.text);
        }

        // Store PIN
        await sessionManager.storeData(msisdn, sessionId, shortcode, 'pin', input);

        try {
            // Call real API
            const authResult = await apiService.authenticateCustomer(
                msisdn,
                sessionId,
                shortcode,
                input
            );

            // Status 000 or 101 means authentication successful
            // (101 = PIN change required, but still authenticated)
            if (authResult.status === '000' || authResult.status === '101') {
                // Set real authentication data from API response
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
            return await this.handlePinAuthentication(session, input);
        }

        // Get current menu
        const currentMenuData = await menuService.renderMenu(currentMenu, session);

        // Handle empty input for menu selection
        if (!input || input === '') {
            // If no input and we're on a menu, show it again
            if (currentMenuData.type === 'menu') {
                return this.formatContinueResponse(currentMenuData.text);
            }
            // If no input and we're expecting input, show error
            return this.formatContinueResponse(`Invalid input. Please try again.\n\n${currentMenuData.text}`);
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

    async handleServiceMenu(menu, session) {
        const { msisdn, sessionId, shortcode } = session;

        try {
            let serviceResult;

            switch (menu.service) {
                case 'validateWallet':
                case 'validateOwnWallet':
                    const walletNumber = menu.service === 'validateOwnWallet' ?
                        msisdn :
                        await sessionManager.getData(msisdn, sessionId, shortcode, 'recipientNumber') || msisdn;
                    const network = menu.id.includes('mtn') ? 'mtn' : 'airtel';

                    serviceResult = await apiService.validateWallet(msisdn, sessionId, shortcode, {
                        customerId: session.customerId,
                        walletNumber,
                        network
                    });
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
                    const withdrawNetwork = menu.id.includes('mtn') ? 'mtn' : 'airtel';

                    serviceResult = await apiService.transferFunds(msisdn, sessionId, shortcode, {
                        customerId: session.customerId,
                        sourceAccount: withdrawSourceAccount,
                        destinationAccount: withdrawRecipientNumber,
                        amount: withdrawAmount,
                        pin: withdrawPin,
                        transferType: 'MOBILE_MONEY',
                        network: withdrawNetwork
                    });
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

                // Format success message
                let successMessage = nextMenuData.text;
                if (serviceResult.data) {
                    successMessage = menuService.formatBalance(serviceResult.data) || successMessage;
                }

                return this.formatContinueResponse(successMessage);
            } else {
                // Service call failed
                const errorMenu = menu.onError ? menu.onError.next : 'error';
                const errorMenuData = await menuService.renderMenu(errorMenu, session);

                await sessionManager.updateMenuState(msisdn, sessionId, shortcode, errorMenu);

                return this.formatContinueResponse(
                    `${serviceResult.message || 'Service failed'}\n\n${errorMenuData.text}`
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
