// scripts/utils/config/constants.js
const path = require('path');

module.exports = {
    // Diretórios
    DATA_DIR: path.join(__dirname, '../../../data'),

    // Configurações da rede
    NETWORK: {
        BSC: {
            name: 'BSC Mainnet',
            chainId: 56,
            rpc: 'https://bsc-dataseed.binance.org/',
            explorer: 'https://bscscan.com'
        }
    },

    // Tipos de operações
    OPERATION_TYPES: {
        DEPLOY: 'DEPLOY',
        CONFIGURE: 'CONFIGURE',
        EXECUTE: 'EXECUTE',
        FLASH_LOAN: 'FLASH_LOAN',
        VIRTUAL_BALANCE: 'VIRTUAL_BALANCE',
        CHECK: 'CHECK',
        ERROR: 'ERROR'
    },

    // Status das operações
    STATUS: {
        PENDING: 'pending',
        COMPLETED: 'completed',
        FAILED: 'failed'
    },

    // Configurações do protocolo
    PROTOCOL: {
        DEFAULT_DECIMALS: 18,
        DEFAULT_SYMBOL: 'USDT',
        DEFAULT_NAME: 'Tether USD',
        DEFAULT_SUPPLY: '1000000000'
    },

    // Configurações de gas
    GAS: {
        LIMIT: 3000000,
        PRICE: 5
    }
};