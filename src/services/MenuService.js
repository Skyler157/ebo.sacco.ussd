const config = require('../../config/default');
const menus = require('../../config/menus');
const validator = require('../core/validation/Validator');
const logger = require('../core/logging/Logger');

class MenuService {
    constructor() {
        this.menuConfigs = menus;
        this.menuCache = new Map();
    }

    getMenu(menuId) {
        // Check cache first
        if (this.menuCache.has(menuId)) {
            return this.menuCache.get(menuId);
        }

        // Get from config
        const menu = this.menuConfigs[menuId];

        if (!menu) {
            throw new Error(`Menu not found: ${menuId}`);
        }

        // Cache the menu
        this.menuCache.set(menuId, menu);

        return menu;
    }

    async renderMenu(menuId, sessionData = {}) {
        const menu = this.getMenu(menuId);

        if (menu.type === 'service' && menu.service) {
            // Handle dynamic menu generation from service
            return await this.renderServiceMenu(menu, sessionData);
        }

        // Render static menu text
        let text = menu.text;

        // Replace template variables
        text = this.replaceTemplateVariables(text, sessionData);

        // Apply language translation if needed
        if (sessionData.language && sessionData.language !== 'en') {
            text = this.translateText(text, sessionData.language);
        }

        return {
            id: menu.id,
            type: menu.type,
            text: text,
            options: menu.options || null,
            action: menu.action,
            next: menu.next,
            validation: menu.validation,
            inputType: menu.inputType || 'text',
            storeAs: menu.storeAs
        };
    }

    async renderServiceMenu(menu, sessionData) {
        // This would be implemented based on specific service calls
        // For now, return the menu as-is
        return {
            id: menu.id,
            type: menu.type,
            text: menu.text || 'Processing...',
            action: menu.action,
            service: menu.service,
            serviceType: menu.serviceType,
            params: menu.params,
            onSuccess: menu.onSuccess,
            onError: menu.onError
        };
    }

    replaceTemplateVariables(text, data) {
        if (!text || !data) return text;

        return text.replace(/\$\{(\w+)\}/g, (match, key) => {
            return data[key] || match;
        });
    }

    translateText(text, language) {
        // Simple translation - in production, use a proper translation service
        const translations = {
            // Runyankore translations
            'runyankore': {
                'Welcome to EBO SACCO': 'Tushangaire EBO SACCO',
                'Please enter your PIN to continue': 'Nyamwirra PIN yaawe okukomeza',
                'Withdraw': 'Kuzana Sent',
                'Deposit': 'Tweka Sent',
                'Airtime': 'Airtime',
                'Payments': 'Okasasira',
                'Balance': 'Balance',
                'Internal Transfers': 'Okuhinduranya Sent',
                'Mini Statement': 'Mini Statement',
                'Settings': 'Ebyokuhindura',
                'Exit': 'Genda'
            }
        };

        if (language === 'en' || !translations[language]) {
            return text;
        }

        const langDict = translations[language];
        let translated = text;

        Object.keys(langDict).forEach(english => {
            translated = translated.replace(new RegExp(english, 'g'), langDict[english]);
        });

        return translated;
    }

    validateInput(menu, input) {
        if (!menu.validation) {
            return { isValid: true, message: '' };
        }

        const validation = menu.validation;

        if (typeof validation === 'string') {
            return validator.validate(validation, input);
        } else if (typeof validation === 'object') {
            return validator.validate(validation.type, input, validation);
        } else if (typeof validation === 'function') {
            return validation(input);
        }

        return { isValid: true, message: '' };
    }

getNextMenu(currentMenuId, input, sessionData) {
  const currentMenu = this.getMenu(currentMenuId);

  if (currentMenu.type === 'menu' && currentMenu.options) {
    const option = currentMenu.options[input];

    if (option) {
      return {
        next: option.next,
        action: option.action,
        data: option.data || {}
      };
    }
  }

  // If current menu has a next property, use it
  if (currentMenu.next) {
    return {
      next: currentMenu.next,
      action: currentMenu.action,
      data: {}
    };
  }

  // Default navigation for common flows (fallback)
  const defaultNavigation = {
    'welcome': { next: 'main_menu', action: 'navigate' },
    'main_menu': {
      '1': { next: 'withdraw_menu', action: 'navigate' },
      '2': { next: 'deposit_menu', action: 'navigate' },
      '3': { next: 'airtime_menu', action: 'navigate' },
      '4': { next: 'payments_menu', action: 'navigate' },
      '5': { next: 'balance_menu', action: 'navigate' },
      '6': { next: 'internal_transfers_menu', action: 'navigate' },
      '7': { next: 'mini_statement_menu', action: 'navigate' },
      '8': { next: 'settings_menu', action: 'navigate' },
      '0': { next: 'end_session', action: 'end_session' }
    }
  };

  if (defaultNavigation[currentMenuId] && defaultNavigation[currentMenuId][input]) {
    return defaultNavigation[currentMenuId][input];
  }

  return null;
}
    async processMenuAction(menu, input, sessionData) {
        if (!menu.action) {
            return { next: null, data: {} };
        }

        const action = menu.action;
        const actions = {
            authenticate_pin: async () => await this.handlePinAuthentication(input, sessionData),
            validate_mtn_number: () => this.validatePhoneNumber(input, 'mtn'),
            validate_airtel_number: () => this.validatePhoneNumber(input, 'airtel'),
            validate_amount: () => this.validateAmount(input),
            process_transaction: () => ({ success: true }),
            navigate: () => ({ success: true }),
            end_session: () => ({ endSession: true })
        };

        if (actions[action]) {
            return await actions[action]();
        }

        return { success: true };
    }

    async handlePinAuthentication(pin, sessionData) {
        // Basic PIN validation only
        const validation = validator.validate('numeric', pin, {
            exactLength: 4,
            minLength: 4,
            maxLength: 4
        });

        if (!validation.isValid) {
            throw new Error('PIN must be exactly 4 digits');
        }

        // Check PIN attempts from session
        if (sessionData.pinAttempts >= config.security.maxPinAttempts) {
            throw new Error('Maximum PIN attempts exceeded. Please contact support.');
        }

        return { success: true, requirePinChange: false };
    }

    validatePhoneNumber(number, network) {
        return validator.validate('phone', number, { network });
    }

    validateAmount(amount) {
        return validator.validate('amount', amount);
    }

    formatBalance(balanceData) {
        if (!balanceData || !Array.isArray(balanceData)) {
            return 'Unable to retrieve balance';
        }

        const balanceItem = balanceData.find(item =>
            item.controlId === 'BALTEXT' || item.controlId === 'BALANCE'
        );

        if (balanceItem) {
            return `Balance: ${balanceItem.controlValue}`;
        }

        return 'Balance information not available';
    }

    formatAccounts(accountsData) {
        if (!accountsData || !Array.isArray(accountsData)) {
            return 'No accounts found';
        }

        let menuText = 'Select Account:\n';
        accountsData.forEach((account, index) => {
            const displayIndex = index + 1;
            const accountName = account.controlId || `Account ${displayIndex}`;
            const accountNumber = account.controlValue || '';

            menuText += `${displayIndex}. ${accountName} - ${accountNumber}\n`;
        });

        menuText += '0. Back';

        return menuText;
    }

    formatMiniStatement(statementData) {
        if (!statementData || !Array.isArray(statementData)) {
            return 'No transaction history';
        }

        let statementText = 'Recent Transactions:\n';
        statementData.slice(0, 5).forEach((transaction, index) => {
            const description = transaction.controlId || 'Transaction';
            const amount = transaction.controlValue || '';
            const date = transaction.date || '';

            statementText += `${index + 1}. ${description}: ${amount} ${date}\n`;
        });

        return statementText;
    }
}

module.exports = new MenuService();
