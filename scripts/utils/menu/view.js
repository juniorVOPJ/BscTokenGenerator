// scripts/utils/menu/view.js
const inquirer = require('inquirer');
const { ethers } = require('hardhat');
const moment = require('moment-timezone');
const chalk = require('chalk');
const path = require('path');
const fs = require('fs');
const logger = require('../helpers/logger');
const { loadData } = require('../data/loader');
const { returnToMenu } = require('../helpers/menuHelper');
const { DATA_DIR } = require('../config/constants');

async function viewOperations(mainMenuRef) {
    logger.info('\nVisualizar Operações\n');

    const data = loadData();
    if (data.operations.length === 0) {
        logger.warning('Nenhuma operação registrada.');
        await returnToMenu(mainMenuRef);
        return;
    }

    const viewChoice = await inquirer.prompt([
        {
            type: 'list',
            name: 'viewType',
            message: 'Como deseja visualizar as operações?',
            choices: [
                {
                    name: 'Todas as operações',
                    value: 'all'
                },
                {
                    name: 'Por protocolo',
                    value: 'byProtocol'
                },
                {
                    name: 'Por tipo de operação',
                    value: 'byType'
                },
                {
                    name: 'Por status',
                    value: 'byStatus'
                },
                {
                    name: 'Últimas 24 horas',
                    value: 'recent'
                },
                {
                    name: 'Exportar operações',
                    value: 'export'
                },
                {
                    name: 'Voltar',
                    value: 'back'
                }
            ]
        }
    ]);

    if (viewChoice.viewType === 'back') {
        await returnToMenu(mainMenuRef);
        return;
    }

    let operationsToShow = [];
    let filterInfo = '';

    try {
        switch (viewChoice.viewType) {
            case 'all':
                operationsToShow = data.operations;
                break;

            case 'byProtocol':
                const protocol = await selectProtocol(data);
                if (!protocol) {
                    await returnToMenu(mainMenuRef);
                    return;
                }
                operationsToShow = data.operations.filter(op => op.protocolAddress === protocol);
                filterInfo = `Protocolo: ${protocol}`;
                break;

            case 'byType':
                const type = await selectOperationType(data);
                if (!type) {
                    await returnToMenu(mainMenuRef);
                    return;
                }
                operationsToShow = data.operations.filter(op => op.type === type);
                filterInfo = `Tipo: ${type}`;
                break;

            case 'byStatus':
                const status = await selectStatus();
                if (!status) {
                    await returnToMenu(mainMenuRef);
                    return;
                }
                operationsToShow = data.operations.filter(op => op.status === status);
                filterInfo = `Status: ${status}`;
                break;

            case 'recent':
                const yesterday = moment().subtract(24, 'hours');
                operationsToShow = data.operations.filter(op =>
                    moment(op.timestamp).isAfter(yesterday)
                );
                filterInfo = 'Últimas 24 horas';
                break;

            case 'export':
                await exportOperations(data.operations, mainMenuRef);
                return;
        }

        displayOperations(operationsToShow, filterInfo);
        await returnToMenu(mainMenuRef);

    } catch (error) {
        logger.error('\nErro ao visualizar operações:');
        logger.error(error.message);
        await returnToMenu(mainMenuRef);
    }
}

async function selectProtocol(data) {
    const protocols = [...new Set(data.operations.map(op => op.protocolAddress))];
    const { protocol } = await inquirer.prompt([
        {
            type: 'list',
            name: 'protocol',
            message: 'Selecione o protocolo:',
            choices: protocols
        }
    ]);
    return protocol;
}

async function selectOperationType(data) {
    const types = [...new Set(data.operations.map(op => op.type))];
    const { type } = await inquirer.prompt([
        {
            type: 'list',
            name: 'type',
            message: 'Selecione o tipo de operação:',
            choices: types
        }
    ]);
    return type;
}

async function selectStatus() {
    const { status } = await inquirer.prompt([
        {
            type: 'list',
            name: 'status',
            message: 'Selecione o status:',
            choices: ['completed', 'pending', 'failed']
        }
    ]);
    return status;
}

function displayOperations(operations, filterInfo = '') {
    logger.info(`\nMostrando ${operations.length} operações ${filterInfo ? `(${filterInfo})` : ''}\n`);

    operations.forEach((op, index) => {
        console.log(chalk.cyan(`Operação #${index + 1}`));
        console.log(chalk.gray('ID:'), op.id);
        console.log(chalk.gray('Timestamp:'), moment(op.timestamp).format('DD/MM/YYYY HH:mm:ss'));
        console.log(chalk.gray('Tipo:'), op.type);
        console.log(chalk.gray('Status:'), getStatusColor(op.status)(op.status));

        if (op.protocolAddress) {
            console.log(chalk.gray('Protocolo:'), op.protocolAddress);
        }

        if (op.targetAddress) {
            console.log(chalk.gray('Alvo:'), op.targetAddress);
        }

        if (op.amount) {
            console.log(chalk.gray('Quantidade:'),
                ethers.formatUnits(op.amount, op.decimals || 18));
        }

        if (op.transaction?.hash) {
            console.log(chalk.gray('TX Hash:'), op.transaction.hash);
        }

        if (op.error) {
            console.log(chalk.red('Erro:'), op.error);
        }

        console.log(chalk.gray('------------------------\n'));
    });
}

async function exportOperations(operations, mainMenuRef) {
    const timestamp = moment().format('YYYY-MM-DD_HH-mm-ss');
    const exportPath = path.join(DATA_DIR, `operations_export_${timestamp}.json`);

    fs.writeFileSync(exportPath, JSON.stringify(operations, null, 2));
    logger.success(`\nOperações exportadas para: ${exportPath}`);

    await returnToMenu(mainMenuRef);
}

function getStatusColor(status) {
    switch (status) {
        case 'completed':
            return chalk.green;
        case 'pending':
            return chalk.yellow;
        case 'failed':
            return chalk.red;
        default:
            return chalk.white;
    }
}

module.exports = {
    viewOperations
};