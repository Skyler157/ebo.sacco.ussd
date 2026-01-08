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
    text: '1. Withdraw\n2. Deposit\n3. Airtime\n4. Payments\n5. Balance\n6. Internal Transfers\n7. Mini Statement\n8. Settings\n0. Exit',
    options: {
      '1': { next: 'withdraw_menu', action: 'navigate' },
      '2': { next: 'deposit_menu', action: 'navigate' },
      '3': { next: 'airtime_menu', action: 'navigate' },
      '4': { next: 'payments_menu', action: 'navigate' },
      '5': { next: 'balance_menu', action: 'navigate' },
      '6': { next: 'internal_transfers_menu', action: 'navigate' },
      '7': { next: 'mini_statement_menu', action: 'navigate' },
      '8': { next: 'settings_menu', action: 'navigate' },
      '0': { action: 'end_session', text: 'Thank you for using EBO SACCO.' }
    },
    validation: 'menu_option'
  },

  // ================================
  // WITHDRAW MENU FLOW
  // ================================
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

  // MTN Withdraw Flow
  mtn_wallet_type: {
    id: 'mtn_wallet_type',
    type: 'menu',
    text: 'Send to MTN Money\n1. Send to own number\n2. Send to other number\n0. Back',
    options: {
      '1': { next: 'mtn_own_validate', action: 'navigate' },
      '2': { next: 'mtn_other_number', action: 'navigate' },
      '0': { next: 'withdraw_menu', action: 'navigate' }
    }
  },

  mtn_other_number: {
    id: 'mtn_other_number',
    type: 'input',
    text: 'Enter the MTN mobile number',
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
    onSuccess: { next: 'withdraw_enter_amount', action: 'navigate' },
    onError: { next: 'mtn_other_number', action: 'navigate' }
  },

  mtn_own_validate: {
    id: 'mtn_own_validate',
    type: 'service',
    service: 'validateOwnWallet',
    serviceType: 'validate',
    params: ['msisdn', 'network'],
    onSuccess: { next: 'withdraw_enter_amount', action: 'navigate' },
    onError: { next: 'error', action: 'navigate' }
  },

  // Airtel Withdraw Flow
  airtel_wallet_type: {
    id: 'airtel_wallet_type',
    type: 'menu',
    text: 'Send to Airtel Money\n1. Send to own number\n2. Send to other number\n0. Back',
    options: {
      '1': { next: 'airtel_own_validate', action: 'navigate' },
      '2': { next: 'airtel_other_number', action: 'navigate' },
      '0': { next: 'withdraw_menu', action: 'navigate' }
    }
  },

  airtel_other_number: {
    id: 'airtel_other_number',
    type: 'input',
    text: 'Enter the Airtel mobile number',
    action: 'validate_airtel_number',
    storeAs: 'recipientNumber',
    validation: {
      type: 'phone',
      network: 'airtel',
      required: true
    },
    errorMessage: 'Invalid Airtel number. Please enter a valid Airtel number starting with 07, 08 or 09',
    next: 'airtel_validate_wallet'
  },

  airtel_validate_wallet: {
    id: 'airtel_validate_wallet',
    type: 'service',
    service: 'validateWallet',
    serviceType: 'validate',
    params: ['recipientNumber', 'network'],
    onSuccess: { next: 'withdraw_enter_amount', action: 'navigate' },
    onError: { next: 'airtel_other_number', action: 'navigate' }
  },

  airtel_own_validate: {
    id: 'airtel_own_validate',
    type: 'service',
    service: 'validateOwnWallet',
    serviceType: 'validate',
    params: ['msisdn', 'network'],
    onSuccess: { next: 'withdraw_enter_amount', action: 'navigate' },
    onError: { next: 'error', action: 'navigate' }
  },

  // Common withdraw flow
  withdraw_enter_amount: {
    id: 'withdraw_enter_amount',
    type: 'input',
    text: 'Enter Amount',
    action: 'validate_amount',
    storeAs: 'amount',
    validation: {
      type: 'amount',
      min: 100,
      max: 5000000,
      required: true
    },
    errorMessage: 'Invalid amount. Minimum: 100, Maximum: 5,000,000',
    next: 'withdraw_select_account'
  },

  withdraw_select_account: {
    id: 'withdraw_select_account',
    type: 'service',
    service: 'getAccounts',
    serviceType: 'bank',
    action: 'display_accounts',
    storeAs: 'accounts',
    next: 'withdraw_enter_pin'
  },

  withdraw_enter_pin: {
    id: 'withdraw_enter_pin',
    type: 'input',
    text: 'Enter PIN to confirm and complete transaction',
    action: 'process_withdraw_transaction',
    inputType: 'password',
    maxLength: 4,
    minLength: 4,
    validation: 'numeric',
    next: 'withdraw_result'
  },

  withdraw_result: {
    id: 'withdraw_result',
    type: 'service',
    service: 'processWithdrawTransaction',
    serviceType: 'bank',
    params: ['amount', 'sourceAccount', 'recipientNumber', 'network'],
    onSuccess: { next: 'withdraw_success', action: 'navigate' },
    onError: { next: 'withdraw_error', action: 'navigate' }
  },

  withdraw_success: {
    id: 'withdraw_success',
    type: 'static',
    text: 'Transaction successful!\n0. Home\n00. Exit',
    action: 'continue_or_exit',
    options: {
      '0': { next: 'main_menu', action: 'navigate' },
      '00': { action: 'end_session', text: 'Thank you for using EBO SACCO.' }
    }
  },

  withdraw_error: {
    id: 'withdraw_error',
    type: 'static',
    text: 'Transaction failed. Please try again later.\n0. Home\n00. Exit',
    action: 'continue_or_exit',
    options: {
      '0': { next: 'main_menu', action: 'navigate' },
      '00': { action: 'end_session', text: 'Thank you for using EBO SACCO.' }
    }
  },

  // ================================
  // DEPOSIT MENU FLOW
  // ================================
  deposit_menu: {
    id: 'deposit_menu',
    type: 'input',
    text: 'Enter mobile money number',
    action: 'validate_mobile_number',
    storeAs: 'depositNumber',
    validation: {
      type: 'phone',
      networks: ['mtn', 'airtel'],
      required: true
    },
    next: 'deposit_validate_number'
  },

  deposit_validate_number: {
    id: 'deposit_validate_number',
    type: 'service',
    service: 'validateDepositNumber',
    serviceType: 'validate',
    params: ['depositNumber'],
    onSuccess: { next: 'deposit_enter_amount', action: 'navigate' },
    onError: { next: 'deposit_menu', action: 'navigate' }
  },

  deposit_enter_amount: {
    id: 'deposit_enter_amount',
    type: 'input',
    text: 'Enter Amount',
    action: 'validate_amount',
    storeAs: 'amount',
    validation: {
      type: 'amount',
      min: 100,
      max: 5000000,
      required: true
    },
    errorMessage: 'Invalid amount. Minimum: 100, Maximum: 5,000,000',
    next: 'deposit_select_account'
  },

  deposit_select_account: {
    id: 'deposit_select_account',
    type: 'service',
    service: 'getAccounts',
    serviceType: 'bank',
    action: 'display_accounts',
    storeAs: 'accounts',
    next: 'deposit_confirm'
  },

  deposit_confirm: {
    id: 'deposit_confirm',
    type: 'menu',
    text: 'Confirm and complete transaction\n1. Confirm\n2. Cancel',
    options: {
      '1': { next: 'deposit_result', action: 'navigate' },
      '2': { next: 'main_menu', action: 'navigate' }
    }
  },

  deposit_result: {
    id: 'deposit_result',
    type: 'service',
    service: 'processDepositTransaction',
    serviceType: 'bank',
    params: ['amount', 'depositNumber', 'destinationAccount'],
    onSuccess: { next: 'deposit_success', action: 'navigate' },
    onError: { next: 'deposit_error', action: 'navigate' }
  },

  deposit_success: {
    id: 'deposit_success',
    type: 'static',
    text: 'Deposit successful!\n0. Home\n00. Exit',
    action: 'continue_or_exit',
    options: {
      '0': { next: 'main_menu', action: 'navigate' },
      '00': { action: 'end_session', text: 'Thank you for using EBO SACCO.' }
    }
  },

  deposit_error: {
    id: 'deposit_error',
    type: 'static',
    text: 'Deposit failed. Please try again later.\n0. Home\n00. Exit',
    action: 'continue_or_exit',
    options: {
      '0': { next: 'main_menu', action: 'navigate' },
      '00': { action: 'end_session', text: 'Thank you for using EBO SACCO.' }
    }
  },

  // ================================
  // AIRTIME MENU FLOW
  // ================================
  airtime_menu: {
    id: 'airtime_menu',
    type: 'menu',
    text: 'Buy Airtime\n1. MTN\n2. Airtel\n0. Back',
    options: {
      '1': { next: 'mtn_airtime_type', action: 'navigate' },
      '2': { next: 'airtel_airtime_type', action: 'navigate' },
      '0': { next: 'main_menu', action: 'navigate' }
    }
  },

  // MTN Airtime
  mtn_airtime_type: {
    id: 'mtn_airtime_type',
    type: 'menu',
    text: 'Buy MTN Airtime\n1. Buy for own MTN number\n2. Buy for other MTN number\n0. Back',
    options: {
      '1': { next: 'mtn_airtime_own', action: 'navigate' },
      '2': { next: 'mtn_airtime_other_number', action: 'navigate' },
      '0': { next: 'airtime_menu', action: 'navigate' }
    }
  },

  mtn_airtime_other_number: {
    id: 'mtn_airtime_other_number',
    type: 'input',
    text: 'Enter MTN Mobile Number',
    action: 'validate_mtn_number',
    storeAs: 'recipientNumber',
    validation: {
      type: 'phone',
      network: 'mtn',
      required: true
    },
    errorMessage: 'Invalid MTN number',
    next: 'mtn_airtime_amount'
  },

  mtn_airtime_own: {
    id: 'mtn_airtime_own',
    type: 'static',
    text: 'Buy for own MTN number',
    action: 'set_own_number',
    storeAs: 'recipientNumber',
    next: 'mtn_airtime_amount'
  },

  mtn_airtime_amount: {
    id: 'mtn_airtime_amount',
    type: 'input',
    text: 'Enter Amount',
    action: 'validate_amount',
    storeAs: 'amount',
    validation: {
      type: 'amount',
      min: 100,
      max: 5000000,
      required: true
    },
    errorMessage: 'Invalid amount',
    next: 'mtn_airtime_select_account'
  },

  mtn_airtime_select_account: {
    id: 'mtn_airtime_select_account',
    type: 'service',
    service: 'getAccounts',
    serviceType: 'bank',
    action: 'display_accounts',
    storeAs: 'accounts',
    next: 'mtn_airtime_enter_pin'
  },

  mtn_airtime_enter_pin: {
    id: 'mtn_airtime_enter_pin',
    type: 'input',
    text: 'Enter PIN to confirm and complete transaction',
    action: 'process_airtime_transaction',
    inputType: 'password',
    maxLength: 4,
    minLength: 4,
    validation: 'numeric',
    next: 'mtn_airtime_result'
  },

  mtn_airtime_result: {
    id: 'mtn_airtime_result',
    type: 'service',
    service: 'processAirtimeTransaction',
    serviceType: 'purchase',
    params: ['amount', 'sourceAccount', 'recipientNumber', 'network'],
    onSuccess: { next: 'airtime_success', action: 'navigate' },
    onError: { next: 'airtime_error', action: 'navigate' }
  },

  // Airtel Airtime (similar structure)
  airtel_airtime_type: {
    id: 'airtel_airtime_type',
    type: 'menu',
    text: 'Buy Airtel Airtime\n1. Buy for own Airtel number\n2. Buy for other Airtel number\n0. Back',
    options: {
      '1': { next: 'airtel_airtime_own', action: 'navigate' },
      '2': { next: 'airtel_airtime_other_number', action: 'navigate' },
      '0': { next: 'airtime_menu', action: 'navigate' }
    }
  },

  airtel_airtime_other_number: {
    id: 'airtel_airtime_other_number',
    type: 'input',
    text: 'Enter Airtel Mobile Number',
    action: 'validate_airtel_number',
    storeAs: 'recipientNumber',
    validation: {
      type: 'phone',
      network: 'airtel',
      required: true
    },
    errorMessage: 'Invalid Airtel number',
    next: 'airtel_airtime_amount'
  },

  airtel_airtime_own: {
    id: 'airtel_airtime_own',
    type: 'static',
    text: 'Buy for own Airtel number',
    action: 'set_own_number',
    storeAs: 'recipientNumber',
    next: 'airtel_airtime_amount'
  },

  airtel_airtime_amount: {
    id: 'airtel_airtime_amount',
    type: 'input',
    text: 'Enter Amount',
    action: 'validate_amount',
    storeAs: 'amount',
    validation: {
      type: 'amount',
      min: 100,
      max: 5000000,
      required: true
    },
    errorMessage: 'Invalid amount',
    next: 'airtel_airtime_select_account'
  },

  airtel_airtime_select_account: {
    id: 'airtel_airtime_select_account',
    type: 'service',
    service: 'getAccounts',
    serviceType: 'bank',
    action: 'display_accounts',
    storeAs: 'accounts',
    next: 'airtel_airtime_enter_pin'
  },

  airtel_airtime_enter_pin: {
    id: 'airtel_airtime_enter_pin',
    type: 'input',
    text: 'Enter PIN to confirm and complete transaction',
    action: 'process_airtime_transaction',
    inputType: 'password',
    maxLength: 4,
    minLength: 4,
    validation: 'numeric',
    next: 'airtel_airtime_result'
  },

  airtel_airtime_result: {
    id: 'airtel_airtime_result',
    type: 'service',
    service: 'processAirtimeTransaction',
    serviceType: 'purchase',
    params: ['amount', 'sourceAccount', 'recipientNumber', 'network'],
    onSuccess: { next: 'airtime_success', action: 'navigate' },
    onError: { next: 'airtime_error', action: 'navigate' }
  },

  airtime_success: {
    id: 'airtime_success',
    type: 'static',
    text: 'Airtime purchase successful!\n0. Home\n00. Exit',
    action: 'continue_or_exit',
    options: {
      '0': { next: 'main_menu', action: 'navigate' },
      '00': { action: 'end_session', text: 'Thank you for using EBO SACCO.' }
    }
  },

  airtime_error: {
    id: 'airtime_error',
    type: 'static',
    text: 'Airtime purchase failed. Please try again later.\n0. Home\n00. Exit',
    action: 'continue_or_exit',
    options: {
      '0': { next: 'main_menu', action: 'navigate' },
      '00': { action: 'end_session', text: 'Thank you for using EBO SACCO.' }
    }
  },

  // ================================
  // PAYMENTS MENU FLOW
  // ================================
  payments_menu: {
    id: 'payments_menu',
    type: 'menu',
    text: 'Payments\n1. NWSC\n2. Light\n3. Pay TV\n0. Back',
    options: {
      '1': { next: 'nwsc_payment', action: 'navigate' },
      '2': { next: 'light_payment', action: 'navigate' },
      '3': { next: 'pay_tv_menu', action: 'navigate' },
      '0': { next: 'main_menu', action: 'navigate' }
    }
  },

  // NWSC Payment
  nwsc_payment: {
    id: 'nwsc_payment',
    type: 'service',
    service: 'getAreas',
    serviceType: 'other',
    action: 'display_areas',
    storeAs: 'areas',
    next: 'nwsc_select_area'
  },

  nwsc_select_area: {
    id: 'nwsc_select_area',
    type: 'menu',
    text: 'Select Area',
    action: 'display_dynamic_menu',
    dynamic: true,
    next: 'nwsc_enter_account'
  },

  nwsc_enter_account: {
    id: 'nwsc_enter_account',
    type: 'input',
    text: 'Enter NWSC account number',
    action: 'validate_nwsc_account',
    storeAs: 'accountNumber',
    validation: {
      type: 'alphanumeric',
      minLength: 5,
      maxLength: 20,
      required: true
    },
    next: 'nwsc_validate_account'
  },

  nwsc_validate_account: {
    id: 'nwsc_validate_account',
    type: 'service',
    service: 'validateNWSCAccount',
    serviceType: 'validate',
    params: ['accountNumber', 'area'],
    onSuccess: { next: 'nwsc_enter_amount', action: 'navigate' },
    onError: { next: 'nwsc_enter_account', action: 'navigate' }
  },

  nwsc_enter_amount: {
    id: 'nwsc_enter_amount',
    type: 'input',
    text: 'Enter Amount',
    action: 'validate_amount',
    storeAs: 'amount',
    validation: {
      type: 'amount',
      min: 100,
      max: 5000000,
      required: true
    },
    next: 'nwsc_select_account'
  },

  nwsc_select_account: {
    id: 'nwsc_select_account',
    type: 'service',
    service: 'getAccounts',
    serviceType: 'bank',
    action: 'display_accounts',
    storeAs: 'accounts',
    next: 'nwsc_enter_pin'
  },

  nwsc_enter_pin: {
    id: 'nwsc_enter_pin',
    type: 'input',
    text: 'Enter PIN to confirm and complete transaction',
    action: 'process_payment_transaction',
    inputType: 'password',
    maxLength: 4,
    minLength: 4,
    validation: 'numeric',
    next: 'nwsc_result'
  },

  nwsc_result: {
    id: 'nwsc_result',
    type: 'service',
    service: 'processPaymentTransaction',
    serviceType: 'purchase',
    params: ['amount', 'sourceAccount', 'accountNumber', 'billerType'],
    onSuccess: { next: 'payment_success', action: 'navigate' },
    onError: { next: 'payment_error', action: 'navigate' }
  },

  // Light Payment (similar structure)
  light_payment: {
    id: 'light_payment',
    type: 'input',
    text: 'Enter Light account number',
    action: 'validate_light_account',
    storeAs: 'accountNumber',
    validation: {
      type: 'alphanumeric',
      minLength: 5,
      maxLength: 20,
      required: true
    },
    next: 'light_validate_account'
  },

  light_validate_account: {
    id: 'light_validate_account',
    type: 'service',
    service: 'validateLightAccount',
    serviceType: 'validate',
    params: ['accountNumber'],
    onSuccess: { next: 'light_enter_amount', action: 'navigate' },
    onError: { next: 'light_payment', action: 'navigate' }
  },

  light_enter_amount: {
    id: 'light_enter_amount',
    type: 'input',
    text: 'Enter Amount',
    action: 'validate_amount',
    storeAs: 'amount',
    validation: {
      type: 'amount',
      min: 100,
      max: 5000000,
      required: true
    },
    next: 'light_select_account'
  },

  light_select_account: {
    id: 'light_select_account',
    type: 'service',
    service: 'getAccounts',
    serviceType: 'bank',
    action: 'display_accounts',
    storeAs: 'accounts',
    next: 'light_enter_pin'
  },

  light_enter_pin: {
    id: 'light_enter_pin',
    type: 'input',
    text: 'Enter PIN to confirm and complete transaction',
    action: 'process_payment_transaction',
    inputType: 'password',
    maxLength: 4,
    minLength: 4,
    validation: 'numeric',
    next: 'light_result'
  },

  light_result: {
    id: 'light_result',
    type: 'service',
    service: 'processPaymentTransaction',
    serviceType: 'purchase',
    params: ['amount', 'sourceAccount', 'accountNumber', 'billerType'],
    onSuccess: { next: 'payment_success', action: 'navigate' },
    onError: { next: 'payment_error', action: 'navigate' }
  },

  // Pay TV Menu
  pay_tv_menu: {
    id: 'pay_tv_menu',
    type: 'menu',
    text: 'Pay TV\n1. DStv\n2. GOtv\n3. Startimes\n0. Back',
    options: {
      '1': { next: 'dstv_payment', action: 'navigate' },
      '2': { next: 'gotv_payment', action: 'navigate' },
      '3': { next: 'startimes_payment', action: 'navigate' },
      '0': { next: 'payments_menu', action: 'navigate' }
    }
  },

  // DStv Payment
  dstv_payment: {
    id: 'dstv_payment',
    type: 'menu',
    text: 'Select A/C type\n1. Account Number\n2. Smart Card Number',
    options: {
      '1': { next: 'dstv_account_number', action: 'navigate' },
      '2': { next: 'dstv_smart_card', action: 'navigate' }
    }
  },

  dstv_account_number: {
    id: 'dstv_account_number',
    type: 'input',
    text: 'Enter DStv account number',
    action: 'validate_dstv_account',
    storeAs: 'accountNumber',
    validation: {
      type: 'alphanumeric',
      minLength: 5,
      maxLength: 20,
      required: true
    },
    next: 'dstv_validate_account'
  },

  dstv_smart_card: {
    id: 'dstv_smart_card',
    type: 'input',
    text: 'Enter DStv Smart Card Number',
    action: 'validate_dstv_smartcard',
    storeAs: 'accountNumber',
    validation: {
      type: 'numeric',
      minLength: 10,
      maxLength: 12,
      required: true
    },
    next: 'dstv_validate_account'
  },

  dstv_validate_account: {
    id: 'dstv_validate_account',
    type: 'service',
    service: 'validateDSTVAccount',
    serviceType: 'validate',
    params: ['accountNumber', 'accountType'],
    onSuccess: { next: 'dstv_select_package', action: 'navigate' },
    onError: { next: 'dstv_payment', action: 'navigate' }
  },

  dstv_select_package: {
    id: 'dstv_select_package',
    type: 'service',
    service: 'getDSTVPackages',
    serviceType: 'other',
    action: 'display_packages',
    storeAs: 'packages',
    next: 'dstv_select_account'
  },

  dstv_select_account: {
    id: 'dstv_select_account',
    type: 'service',
    service: 'getAccounts',
    serviceType: 'bank',
    action: 'display_accounts',
    storeAs: 'accounts',
    next: 'dstv_enter_pin'
  },

  dstv_enter_pin: {
    id: 'dstv_enter_pin',
    type: 'input',
    text: 'Enter PIN to confirm and complete transaction',
    action: 'process_payment_transaction',
    inputType: 'password',
    maxLength: 4,
    minLength: 4,
    validation: 'numeric',
    next: 'dstv_result'
  },

  dstv_result: {
    id: 'dstv_result',
    type: 'service',
    service: 'processPaymentTransaction',
    serviceType: 'purchase',
    params: ['amount', 'sourceAccount', 'accountNumber', 'billerType'],
    onSuccess: { next: 'payment_success', action: 'navigate' },
    onError: { next: 'payment_error', action: 'navigate' }
  },

  payment_success: {
    id: 'payment_success',
    type: 'static',
    text: 'Payment successful!\n0. Home\n00. Exit',
    action: 'continue_or_exit',
    options: {
      '0': { next: 'main_menu', action: 'navigate' },
      '00': { action: 'end_session', text: 'Thank you for using EBO SACCO.' }
    }
  },

  payment_error: {
    id: 'payment_error',
    type: 'static',
    text: 'Payment failed. Please try again later.\n0. Home\n00. Exit',
    action: 'continue_or_exit',
    options: {
      '0': { next: 'main_menu', action: 'navigate' },
      '00': { action: 'end_session', text: 'Thank you for using EBO SACCO.' }
    }
  },

  // ================================
  // BALANCE MENU FLOW
  // ================================
  balance_menu: {
    id: 'balance_menu',
    type: 'menu',
    text: 'Balance\n1. Savings\n2. Loans\n0. Back',
    options: {
      '1': { next: 'savings_balance_select', action: 'navigate' },
      '2': { next: 'loans_balance', action: 'navigate' },
      '0': { next: 'main_menu', action: 'navigate' }
    }
  },

  savings_balance_select: {
    id: 'savings_balance_select',
    type: 'service',
    service: 'getAccounts',
    serviceType: 'bank',
    action: 'display_accounts',
    storeAs: 'accounts',
    next: 'savings_balance_result'
  },

  savings_balance_result: {
    id: 'savings_balance_result',
    type: 'service',
    service: 'getAccountBalance',
    serviceType: 'bank',
    params: ['selectedAccount'],
    onSuccess: { next: 'balance_display', action: 'navigate' },
    onError: { next: 'balance_error', action: 'navigate' }
  },

  loans_balance: {
    id: 'loans_balance',
    type: 'service',
    service: 'getLoanAccounts',
    serviceType: 'bank',
    action: 'display_loan_accounts',
    storeAs: 'loanAccounts',
    next: 'loans_balance_result'
  },

  loans_balance_result: {
    id: 'loans_balance_result',
    type: 'service',
    service: 'getLoanBalance',
    serviceType: 'bank',
    params: ['selectedLoanAccount'],
    onSuccess: { next: 'balance_display', action: 'navigate' },
    onError: { next: 'balance_error', action: 'navigate' }
  },

  balance_display: {
    id: 'balance_display',
    type: 'static',
    text: 'Balance: {balance}\n0. Home\n00. Exit',
    action: 'continue_or_exit',
    options: {
      '0': { next: 'main_menu', action: 'navigate' },
      '00': { action: 'end_session', text: 'Thank you for using EBO SACCO.' }
    }
  },

  balance_error: {
    id: 'balance_error',
    type: 'static',
    text: 'Unable to retrieve balance. Please try again later.\n0. Home\n00. Exit',
    action: 'continue_or_exit',
    options: {
      '0': { next: 'main_menu', action: 'navigate' },
      '00': { action: 'end_session', text: 'Thank you for using EBO SACCO.' }
    }
  },

  // ================================
  // INTERNAL TRANSFERS MENU FLOW
  // ================================
  internal_transfers_menu: {
    id: 'internal_transfers_menu',
    type: 'menu',
    text: 'Internal Transfers\n1. Transfer to own A/C\n2. Transfer to other A/C\n0. Back',
    options: {
      '1': { next: 'own_account_transfer', action: 'navigate' },
      '2': { next: 'other_account_transfer', action: 'navigate' },
      '0': { next: 'main_menu', action: 'navigate' }
    }
  },

  own_account_transfer: {
    id: 'own_account_transfer',
    type: 'service',
    service: 'getAccounts',
    serviceType: 'bank',
    action: 'display_accounts',
    storeAs: 'accounts',
    next: 'own_transfer_select_destination'
  },

  own_transfer_select_destination: {
    id: 'own_transfer_select_destination',
    type: 'menu',
    text: 'Select account to credit',
    action: 'display_own_accounts_menu',
    next: 'own_transfer_enter_amount'
  },

  own_transfer_enter_amount: {
    id: 'own_transfer_enter_amount',
    type: 'input',
    text: 'Enter Amount',
    action: 'validate_amount',
    storeAs: 'amount',
    validation: {
      type: 'amount',
      min: 100,
      max: 5000000,
      required: true
    },
    next: 'own_transfer_enter_remark'
  },

  own_transfer_enter_remark: {
    id: 'own_transfer_enter_remark',
    type: 'input',
    text: 'Enter remark',
    action: 'validate_remark',
    storeAs: 'remark',
    validation: {
      type: 'text',
      maxLength: 50,
      required: false
    },
    next: 'own_transfer_confirm'
  },

  own_transfer_confirm: {
    id: 'own_transfer_confirm',
    type: 'static',
    text: 'Confirm transfer\nAmount: {amount}\nTo: {destinationAccount}\nRemark: {remark}',
    action: 'confirm_transfer',
    next: 'own_transfer_enter_pin'
  },

  own_transfer_enter_pin: {
    id: 'own_transfer_enter_pin',
    type: 'input',
    text: 'Enter PIN to confirm and complete transaction',
    action: 'process_internal_transfer',
    inputType: 'password',
    maxLength: 4,
    minLength: 4,
    validation: 'numeric',
    next: 'transfer_result'
  },

  other_account_transfer: {
    id: 'other_account_transfer',
    type: 'input',
    text: 'Enter recipient A/C',
    action: 'validate_account_number',
    storeAs: 'recipientAccount',
    validation: {
      type: 'alphanumeric',
      minLength: 5,
      maxLength: 20,
      required: true
    },
    next: 'other_transfer_validate_account'
  },

  other_transfer_validate_account: {
    id: 'other_transfer_validate_account',
    type: 'service',
    service: 'validateAccount',
    serviceType: 'validate',
    params: ['recipientAccount'],
    onSuccess: { next: 'other_transfer_enter_amount', action: 'navigate' },
    onError: { next: 'other_account_transfer', action: 'navigate' }
  },

  other_transfer_enter_amount: {
    id: 'other_transfer_enter_amount',
    type: 'input',
    text: 'Enter Amount',
    action: 'validate_amount',
    storeAs: 'amount',
    validation: {
      type: 'amount',
      min: 100,
      max: 5000000,
      required: true
    },
    next: 'other_transfer_enter_remark'
  },

  other_transfer_enter_remark: {
    id: 'other_transfer_enter_remark',
    type: 'input',
    text: 'Enter remark',
    action: 'validate_remark',
    storeAs: 'remark',
    validation: {
      type: 'text',
      maxLength: 50,
      required: false
    },
    next: 'other_transfer_confirm'
  },

  other_transfer_confirm: {
    id: 'other_transfer_confirm',
    type: 'static',
    text: 'Confirm transfer\nAmount: {amount}\nTo: {recipientName}\nAccount: {recipientAccount}\nRemark: {remark}',
    action: 'confirm_transfer',
    next: 'other_transfer_enter_pin'
  },

  other_transfer_enter_pin: {
    id: 'other_transfer_enter_pin',
    type: 'input',
    text: 'Enter PIN to confirm and complete transaction',
    action: 'process_internal_transfer',
    inputType: 'password',
    maxLength: 4,
    minLength: 4,
    validation: 'numeric',
    next: 'transfer_result'
  },

  transfer_result: {
    id: 'transfer_result',
    type: 'service',
    service: 'processTransferTransaction',
    serviceType: 'bank',
    params: ['amount', 'sourceAccount', 'destinationAccount', 'remark'],
    onSuccess: { next: 'transfer_success', action: 'navigate' },
    onError: { next: 'transfer_error', action: 'navigate' }
  },

  transfer_success: {
    id: 'transfer_success',
    type: 'static',
    text: 'Transfer successful!\n0. Home\n00. Exit',
    action: 'continue_or_exit',
    options: {
      '0': { next: 'main_menu', action: 'navigate' },
      '00': { action: 'end_session', text: 'Thank you for using EBO SACCO.' }
    }
  },

  transfer_error: {
    id: 'transfer_error',
    type: 'static',
    text: 'Transfer failed. Please try again later.\n0. Home\n00. Exit',
    action: 'continue_or_exit',
    options: {
      '0': { next: 'main_menu', action: 'navigate' },
      '00': { action: 'end_session', text: 'Thank you for using EBO SACCO.' }
    }
  },

  // ================================
  // MINI STATEMENT MENU FLOW
  // ================================
  mini_statement_menu: {
    id: 'mini_statement_menu',
    type: 'service',
    service: 'getAccounts',
    serviceType: 'bank',
    action: 'display_accounts',
    storeAs: 'accounts',
    next: 'mini_statement_result'
  },

  mini_statement_result: {
    id: 'mini_statement_result',
    type: 'service',
    service: 'getMiniStatement',
    serviceType: 'bank',
    params: ['selectedAccount'],
    onSuccess: { next: 'mini_statement_display', action: 'navigate' },
    onError: { next: 'mini_statement_error', action: 'navigate' }
  },

  mini_statement_display: {
    id: 'mini_statement_display',
    type: 'static',
    text: 'Mini Statement:\n{statement}\n0. Home\n00. Exit',
    action: 'continue_or_exit',
    options: {
      '0': { next: 'main_menu', action: 'navigate' },
      '00': { action: 'end_session', text: 'Thank you for using EBO SACCO.' }
    }
  },

  mini_statement_error: {
    id: 'mini_statement_error',
    type: 'static',
    text: 'Unable to retrieve statement. Please try again later.\n0. Home\n00. Exit',
    action: 'continue_or_exit',
    options: {
      '0': { next: 'main_menu', action: 'navigate' },
      '00': { action: 'end_session', text: 'Thank you for using EBO SACCO.' }
    }
  },

  // ================================
  // SETTINGS MENU FLOW
  // ================================
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

  change_pin_old: {
    id: 'change_pin_old',
    type: 'input',
    text: 'Enter the old PIN',
    action: 'validate_old_pin',
    inputType: 'password',
    maxLength: 4,
    minLength: 4,
    validation: 'numeric',
    next: 'change_pin_new'
  },

  change_pin_new: {
    id: 'change_pin_new',
    type: 'input',
    text: 'Enter the new PIN',
    action: 'validate_new_pin',
    storeAs: 'newPin',
    inputType: 'password',
    maxLength: 4,
    minLength: 4,
    validation: 'numeric',
    next: 'change_pin_confirm'
  },

  change_pin_confirm: {
    id: 'change_pin_confirm',
    type: 'input',
    text: 'Re-Enter the new PIN',
    action: 'confirm_new_pin',
    inputType: 'password',
    maxLength: 4,
    minLength: 4,
    validation: 'numeric',
    next: 'change_pin_result'
  },

  change_pin_result: {
    id: 'change_pin_result',
    type: 'service',
    service: 'changePIN',
    serviceType: 'authenticate',
    params: ['oldPin', 'newPin'],
    onSuccess: { next: 'pin_change_success', action: 'navigate' },
    onError: { next: 'pin_change_error', action: 'navigate' }
  },

  pin_change_success: {
    id: 'pin_change_success',
    type: 'static',
    text: 'PIN changed successfully!\n0. Home\n00. Exit',
    action: 'continue_or_exit',
    options: {
      '0': { next: 'main_menu', action: 'navigate' },
      '00': { action: 'end_session', text: 'Thank you for using EBO SACCO.' }
    }
  },

  pin_change_error: {
    id: 'pin_change_error',
    type: 'static',
    text: 'PIN change failed. Please try again later.\n0. Home\n00. Exit',
    action: 'continue_or_exit',
    options: {
      '0': { next: 'main_menu', action: 'navigate' },
      '00': { action: 'end_session', text: 'Thank you for using EBO SACCO.' }
    }
  },

  change_language: {
    id: 'change_language',
    type: 'menu',
    text: 'Change Language\n1. Runyankore\n2. English',
    options: {
      '1': { next: 'language_runyankore', action: 'set_language' },
      '2': { next: 'language_english', action: 'set_language' }
    }
  },

  language_runyankore: {
    id: 'language_runyankore',
    type: 'static',
    text: 'Language set to Runyankore\n0. Home\n00. Exit',
    action: 'set_language_runyankore',
    options: {
      '0': { next: 'main_menu', action: 'navigate' },
      '00': { action: 'end_session', text: 'Thank you for using EBO SACCO.' }
    }
  },

  language_english: {
    id: 'language_english',
    type: 'static',
    text: 'Language set to English\n0. Home\n00. Exit',
    action: 'set_language_english',
    options: {
      '0': { next: 'main_menu', action: 'navigate' },
      '00': { action: 'end_session', text: 'Thank you for using EBO SACCO.' }
    }
  },

  // ================================
  // COMMON MENUS
  // ================================
  continue_or_exit: {
    id: 'continue_or_exit',
    type: 'menu',
    text: '0. Home\n00. Exit',
    options: {
      '0': { next: 'main_menu', action: 'navigate' },
      '00': { action: 'end_session', text: 'Thank you for using EBO SACCO.' }
    }
  },

  // Success/Error states
  success: {
    id: 'success',
    type: 'static',
    text: 'Transaction successful!\n0. Home\n00. Exit',
    action: 'continue_or_exit'
  },

  error: {
    id: 'error',
    type: 'static',
    text: 'Transaction failed. Please try again later.\n0. Home\n00. Exit',
    action: 'continue_or_exit'
  }
};
