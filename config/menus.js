module.exports = {
  // Initial authentication flow
  welcome: {
    id: 'welcome',
    type: 'static',
    text: 'Welcome to EBO SACCO. Please enter your PIN to continue',
    action: 'authenticate_pin',
    inputType: 'password',
    maxLength: 4,
    minLength: 4,
    validation: 'numeric'
  },

  // Main menu
  main_menu: {
    id: 'main_menu',
    type: 'menu',
    text: 'EBO SACCO\n1. Withdraw\n2. Deposit\n3. Airtime\n4. Payments\n5. Balance\n6. Internal Transfers\n7. Mini Statement\n8. Settings\n0. Exit',
    options: {
      '1': { next: 'withdraw_menu', action: 'navigate' },
      '2': { next: 'deposit_menu', action: 'navigate' },
      '3': { next: 'airtime_menu', action: 'navigate' },
      '4': { next: 'payments_menu', action: 'navigate' },
      '5': { next: 'balance_menu', action: 'navigate' },
      '6': { next: 'internal_transfers_menu', action: 'navigate' },
      '7': { next: 'mini_statement_menu', action: 'navigate' },
      '8': { next: 'settings_menu', action: 'navigate' },
      '0': { action: 'end_session', text: 'Thank you for using EBO SACCO' }
    },
    validation: 'menu_option'
  },

  // Withdraw menu flow
  withdraw_menu: {
    id: 'withdraw_menu',
    type: 'menu',
    text: 'Withdraw\n1. Send to MTN Money\n2. Send to Airtel Money\n0. Back',
    options: {
      '1': { next: 'mtn_wallet_type', action: 'navigate' },
      '2': { next: 'airtel_wallet_type', action: 'navigate' },
      '0': { next: 'main_menu', action: 'navigate' }
    }
  },

  mtn_wallet_type: {
    id: 'mtn_wallet_type',
    type: 'menu',
    text: 'MTN Money\n1. Send to own number\n2. Send to other number\n0. Back',
    options: {
      '1': { next: 'mtn_own_validate', action: 'navigate' },
      '2': { next: 'mtn_other_number', action: 'navigate' },
      '0': { next: 'withdraw_menu', action: 'navigate' }
    }
  },

  mtn_other_number: {
    id: 'mtn_other_number',
    type: 'input',
    text: 'Enter MTN mobile number:',
    action: 'validate_mtn_number',
    storeAs: 'recipientNumber',
    validation: {
      type: 'phone',
      network: 'mtn',
      required: true
    },
    errorMessage: 'Invalid MTN number. Please enter a valid MTN number starting with 07, 08 or 09',
    next: 'mtn_validate_wallet'
  },

  mtn_validate_wallet: {
    id: 'mtn_validate_wallet',
    type: 'service',
    service: 'validateWallet',
    serviceType: 'validate',
    params: ['recipientNumber', 'network'],
    onSuccess: { next: 'enter_amount', action: 'navigate' },
    onError: { next: 'mtn_other_number', action: 'navigate' }
  },

  mtn_own_validate: {
    id: 'mtn_own_validate',
    type: 'service',
    service: 'validateOwnWallet',
    serviceType: 'validate',
    params: ['msisdn', 'network'],
    onSuccess: { next: 'enter_amount', action: 'navigate' },
    onError: { next: 'error', action: 'navigate' }
  },

  // Common flow components
  enter_amount: {
    id: 'enter_amount',
    type: 'input',
    text: 'Enter amount:',
    action: 'validate_amount',
    storeAs: 'amount',
    validation: {
      type: 'amount',
      min: 100,
      max: 5000000,
      required: true
    },
    errorMessage: 'Invalid amount. Minimum: 100, Maximum: 5,000,000',
    next: 'select_source_account'
  },

  select_source_account: {
    id: 'select_source_account',
    type: 'service',
    service: 'getAccounts',
    serviceType: 'bank',
    action: 'display_accounts',
    storeAs: 'accounts',
    next: 'enter_pin'
  },

  enter_pin: {
    id: 'enter_pin',
    type: 'input',
    text: 'Enter PIN to confirm transaction:',
    action: 'process_transaction',
    inputType: 'password',
    maxLength: 4,
    minLength: 4,
    validation: 'numeric',
    next: 'transaction_result'
  },

  transaction_result: {
    id: 'transaction_result',
    type: 'service',
    service: 'processTransaction',
    serviceType: 'purchase',
    params: ['amount', 'sourceAccount', 'recipientNumber', 'serviceType'],
    onSuccess: { next: 'success', action: 'navigate' },
    onError: { next: 'error', action: 'navigate' }
  },

  // Deposit flow
  deposit_menu: {
    id: 'deposit_menu',
    type: 'input',
    text: 'Enter mobile money number:',
    action: 'validate_mobile_number',
    storeAs: 'depositNumber',
    validation: {
      type: 'phone',
      networks: ['mtn', 'airtel'],
      required: true
    },
    next: 'deposit_amount'
  },

  // Balance flow
  balance_menu: {
    id: 'balance_menu',
    type: 'menu',
    text: 'Balance Inquiry\n1. Savings\n2. Loans\n0. Back',
    options: {
      '1': { next: 'select_savings_account', action: 'navigate' },
      '2': { next: 'loan_balances', action: 'navigate' },
      '0': { next: 'main_menu', action: 'navigate' }
    }
  },

  // Settings flow
  settings_menu: {
    id: 'settings_menu',
    type: 'menu',
    text: 'Settings\n1. Change PIN\n2. Change Language\n0. Back',
    options: {
      '1': { next: 'change_pin_old', action: 'navigate' },
      '2': { next: 'change_language', action: 'navigate' },
      '0': { next: 'main_menu', action: 'navigate' }
    }
  },

  // Success/Error states
  success: {
    id: 'success',
    type: 'static',
    text: 'Transaction successful! Thank you for using EBO SACCO.',
    action: 'end_session'
  },

  error: {
    id: 'error',
    type: 'static',
    text: 'Transaction failed. Please try again later.',
    action: 'end_session'
  }
};