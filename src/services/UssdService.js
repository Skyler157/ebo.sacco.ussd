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

                // Add warning message if PIN expired
                let responseText = mainMenu.text;
                if (authResult.pinExpired) {
                    responseText = "Note: Your PIN has expired. Please visit a branch to change it.\n\n" + responseText;
                }

                return this.formatContinueResponse(responseText);
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
            // If no next menu found, check if it's a valid option for current menu
            if (currentMenuData.type === 'menu' && currentMenuData.options) {
                if (!currentMenuData.options[input]) {
                    return this.formatContinueResponse(
                        `Invalid selection. Please try again.\n\n${currentMenuData.text}`
                    );
                }
            }

            await sessionManager.endSession(msisdn, sessionId, shortcode);
            return this.formatEndResponse('Invalid selection. Session ended.');
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

    async handleServiceMenu(menu, session) {
        const { msisdn, sessionId, shortcode } = session;

        try {
            let serviceResult;

            switch (menu.service) {
                case 'validateWallet':
                    const walletNumber = await sessionManager.getData(msisdn, sessionId, shortcode, 'recipientNumber') || msisdn;
                    const network = menu.params.includes('mtn') ? 'mtn' : 'airtel';

                    serviceResult = await apiService.validateWallet(msisdn, sessionId, shortcode, {
                        customerId: session.customerId,
                        walletNumber,
                        network
                    });
                    break;

                case 'getAccounts':
                    // This would typically come from session data after authentication
                    const accounts = session.accounts || [];
                    serviceResult = { status: '000', data: accounts };
                    break;

                case 'processTransaction':
                    const amount = await sessionManager.getData(msisdn, sessionId, shortcode, 'amount');
                    const sourceAccount = await sessionManager.getData(msisdn, sessionId, shortcode, 'sourceAccount');
                    const recipientNumber = await sessionManager.getData(msisdn, sessionId, shortcode, 'recipientNumber');
                    const pin = await sessionManager.getData(msisdn, sessionId, shortcode, 'pin');

                    serviceResult = await apiService.purchaseAirtime(msisdn, sessionId, shortcode, {
                        customerId: session.customerId,
                        sourceAccount,
                        phoneNumber: recipientNumber || msisdn,
                        amount,
                        network: 'mtn', // Determine from context
                        pin
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