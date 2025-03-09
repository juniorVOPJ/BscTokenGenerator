// scripts/utils/menu/configure.js
const inquirer = require('inquirer');
const { ethers } = require('hardhat');
const chalk = require('chalk');
const logger = require('../helpers/logger');
const { loadData, saveData } = require('../data/loader');
const { returnToMenu } = require('../helpers/menuHelper');

async function configureProtocol(mainMenuRef) {
    logger.info('\nConfigurar Protocolo Existente\n');

    const data = loadData();
    if (data.protocols.length === 0) {
        logger.warning('Nenhum protocolo encontrado. Execute um deploy primeiro.');
        await returnToMenu(mainMenuRef);
        return;
    }

    const protocolChoices = data.protocols.map(p => ({
        name: `${p.tokenData.symbol} - ${p.address}`,
        value: p.address
    }));

    const answers = await inquirer.prompt([
        {
            type: 'list',
            name: 'protocolAddress',
            message: 'Selecione o protocolo:',
            choices: protocolChoices
        },
        {
            type: 'list',
            name: 'action',
            message: 'O que deseja configurar?',
            choices: [
                {
                    name: 'Configurar balanço virtual',
                    value: 'setVirtualBalance'
                },
                {
                    name: 'Configurar alvo',
                    value: 'configureTarget'
                },
                {
                    name: 'Configurar limites',
                    value: 'configureLimits'
                },
                {
                    name: 'Voltar',
                    value: 'back'
                }
            ]
        }
    ]);

    if (answers.action === 'back') {
        await returnToMenu(mainMenuRef);
        return;
    }

    try {
        const protocol = await ethers.getContractAt('FlashProtocol', answers.protocolAddress);

        switch (answers.action) {
            case 'setVirtualBalance':
                await configureVirtualBalance(protocol, answers.protocolAddress, data, mainMenuRef);
                break;
            case 'configureTarget':
                await configureTarget(protocol, answers.protocolAddress, data, mainMenuRef);
                break;
            case 'configureLimits':
                await configureLimits(protocol, answers.protocolAddress, data, mainMenuRef);
                break;
        }

    } catch (error) {
        logger.error('\nErro durante a configuração:');
        logger.error(error.message);

        data.operations.push({
            id: `config_error_${Date.now()}`,
            type: 'CONFIGURE_ERROR',
            timestamp: new Date().toISOString(),
            status: 'failed',
            error: error.message
        });
        saveData(data);
        await returnToMenu(mainMenuRef);
    }
}

async function configureVirtualBalance(protocol, protocolAddress, data, mainMenuRef) {
    const balanceAnswers = await inquirer.prompt([
        {
            type: 'input',
            name: 'targetAddress',
            message: 'Endereço alvo:',
            validate: (input) => ethers.isAddress(input) || 'Endereço inválido'
        },
        {
            type: 'input',
            name: 'amount',
            message: 'Quantidade de tokens:',
            default: '5000'
        }
    ]);

    logger.warning('\nConfigurando balanço virtual...');

    try {
        const amount = ethers.parseUnits(balanceAnswers.amount, 18);
        const tx = await protocol.setVirtualBalance(balanceAnswers.targetAddress, amount);
        const receipt = await tx.wait();

        // Registrar operação
        data.operations.push({
            id: `config_vb_${Date.now()}`,
            type: 'CONFIGURE_VIRTUAL_BALANCE',
            timestamp: new Date().toISOString(),
            status: 'completed',
            protocolAddress,
            targetAddress: balanceAnswers.targetAddress,
            amount: amount.toString(),
            transaction: {
                hash: receipt.hash,
                blockNumber: receipt.blockNumber,
                gasUsed: receipt.gasUsed.toString()
            }
        });
        saveData(data);

        logger.success('\nBalanço virtual configurado com sucesso!');
        logger.info(`TX Hash: ${receipt.hash}`);
    } catch (error) {
        throw error;
    }

    await returnToMenu(mainMenuRef);
}

async function configureTarget(protocol, protocolAddress, data, mainMenuRef) {
    const targetAnswers = await inquirer.prompt([
        {
            type: 'input',
            name: 'targetAddress',
            message: 'Endereço alvo:',
            validate: (input) => ethers.isAddress(input) || 'Endereço inválido'
        },
        {
            type: 'input',
            name: 'description',
            message: 'Descrição do alvo:',
        },
        {
            type: 'confirm',
            name: 'isWhitelisted',
            message: 'Incluir na whitelist?',
            default: true
        }
    ]);

    // Registrar alvo
    const targetData = {
        id: `target_${Date.now()}`,
        address: targetAnswers.targetAddress,
        description: targetAnswers.description,
        isWhitelisted: targetAnswers.isWhitelisted,
        createdAt: new Date().toISOString(),
        protocolAddress
    };

    if (!data.targets) data.targets = [];
    data.targets.push(targetData);
    saveData(data);

    logger.success('\nAlvo configurado com sucesso!');
    logger.info(`Endereço: ${targetAnswers.targetAddress}`);

    await returnToMenu(mainMenuRef);
}

async function configureLimits(protocol, protocolAddress, data, mainMenuRef) {
    const limitAnswers = await inquirer.prompt([
        {
            type: 'input',
            name: 'maxLoanAmount',
            message: 'Valor máximo de empréstimo:',
            default: '10000'
        },
        {
            type: 'input',
            name: 'minLoanAmount',
            message: 'Valor mínimo de empréstimo:',
            default: '100'
        },
        {
            type: 'input',
            name: 'maxVirtualBalance',
            message: 'Balanço virtual máximo:',
            default: '50000'
        }
    ]);

    // Registrar limites
    const limitsData = {
        id: `limits_${Date.now()}`,
        maxLoanAmount: ethers.parseUnits(limitAnswers.maxLoanAmount, 18).toString(),
        minLoanAmount: ethers.parseUnits(limitAnswers.minLoanAmount, 18).toString(),
        maxVirtualBalance: ethers.parseUnits(limitAnswers.maxVirtualBalance, 18).toString(),
        updatedAt: new Date().toISOString(),
        protocolAddress
    };

    if (!data.limits) data.limits = [];
    data.limits.push(limitsData);
    saveData(data);

    logger.success('\nLimites configurados com sucesso!');

    await returnToMenu(mainMenuRef);
}

module.exports = {
    configureProtocol
};