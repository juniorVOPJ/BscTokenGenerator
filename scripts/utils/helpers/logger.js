// scripts/utils/helpers/logger.js
const fs = require('fs');
const path = require('path');
const moment = require('moment-timezone');
const chalk = require('chalk');

const logger = {
    info: (message) => {
        console.log(chalk.blue(message));
    },
    success: (message) => {
        console.log(chalk.green(message));
    },
    warning: (message) => {
        console.log(chalk.yellow(message));
    },
    error: (message) => {
        console.log(chalk.red(message));
    },
    logOperation: (operation) => {
        console.log(chalk.cyan(`\nOperação: ${operation.type}`));
        console.log(chalk.gray('ID:'), operation.id);
        console.log(chalk.gray('Timestamp:'), operation.timestamp);
        console.log(chalk.gray('Status:'), operation.status);
        if (operation.hash) {
            console.log(chalk.gray('TX Hash:'), operation.hash);
        }
    }
};

module.exports = logger;