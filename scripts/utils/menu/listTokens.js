// scripts/utils/menu/listTokens.js
const inquirer = require('inquirer');
const { ethers } = require('hardhat');
const chalk = require('chalk');
const fs = require('fs');
const path = require('path');
const moment = require('moment-timezone');
const logger = require('../helpers/logger');
const { loadData, saveData } = require('../data/loader');
const { returnToMenu } = require('../helpers/menuHelper');
const { DATA_DIR } = require('../config/constants');

async function listDeployedTokens(mainMenuRef) {
    logger.info('\nListando Tokens Deployados\n');

    const data = loadData();
    if (!data.protocols || data.protocols.length === 0) {
        logger.warning('Nenhum token encontrado.');
        await returnToMenu(mainMenuRef);
        return;
    }

    try {
        logger.info(chalk.cyan('=== Tokens Deployados ===\n'));

        let inactiveTokens = [];

        for (const protocol of data.protocols) {
            console.log(chalk.yellow('\n----------------------------------------'));
            logger.info(`Token #${data.protocols.indexOf(protocol) + 1}`);

            try {
                const contract = await ethers.getContractAt("FlashProtocol", protocol.address);
                const code = await ethers.provider.getCode(protocol.address);
                const isDeployed = code !== '0x';

                // Informações do registro
                console.log(chalk.cyan('\nInformações Registradas:'));
                console.log('Nome:', protocol.tokenData.name);
                console.log('Símbolo:', protocol.tokenData.symbol);
                console.log('Decimais:', protocol.tokenData.decimals);
                console.log('Supply Inicial:', protocol.tokenData.initialSupply);
                console.log('Endereço:', protocol.address);
                console.log('Data Deploy:', new Date(protocol.timestamp).toLocaleString());
                console.log('Deployer:', protocol.deployer);

                console.log(chalk.cyan('\nStatus Atual no Blockchain:'));
                console.log('Contrato Ativo:', isDeployed ? chalk.green('Sim') : chalk.red('Não'));

                if (!isDeployed) {
                    inactiveTokens.push(protocol);
                } else {
                    // Obter informações atuais do contrato
                    const [
                        currentSupply,
                        deployerBalance,
                        name,
                        symbol,
                        decimals
                    ] = await Promise.all([
                        contract.totalSupply(),
                        contract.balanceOf(protocol.deployer),
                        contract.name(),
                        contract.symbol(),
                        contract.decimals()
                    ]);

                    console.log('\nInformações Atuais:');
                    console.log('Nome:', name);
                    console.log('Símbolo:', symbol);
                    console.log('Decimais:', decimals);
                    console.log('Supply Total:', ethers.formatUnits(currentSupply, decimals));
                    console.log('Balanço do Deployer:', ethers.formatUnits(deployerBalance, decimals));

                    // Verificar balanços virtuais
                    const virtualBalanceOps = data.operations
                        .filter(op =>
                            op.type === 'CONFIGURE_VIRTUAL_BALANCE' &&
                            op.status === 'completed' &&
                            op.protocolAddress === protocol.address
                        )
                        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

                    if (virtualBalanceOps.length > 0) {
                        console.log(chalk.cyan('\nBalanços Virtuais:'));
                        const processedAddresses = new Set();

                        for (const op of virtualBalanceOps) {
                            if (!processedAddresses.has(op.targetAddress)) {
                                const virtualBalance = await contract.balanceOf(op.targetAddress);
                                const actualBalance = await contract.getActualBalance(op.targetAddress);

                                console.log(`\nAlvo: ${op.targetAddress}`);
                                console.log('Balanço Virtual:', ethers.formatUnits(virtualBalance, decimals));
                                console.log('Balanço Real:', ethers.formatUnits(actualBalance, decimals));

                                processedAddresses.add(op.targetAddress);
                            }
                        }
                    }

                    // Verificar limites
                    const protocolLimits = data.limits?.find(l => l.protocolAddress === protocol.address);
                    if (protocolLimits) {
                        console.log(chalk.cyan('\nLimites Configurados:'));
                        console.log('Máximo Loan:', ethers.formatUnits(protocolLimits.maxLoanAmount, decimals));
                        console.log('Mínimo Loan:', ethers.formatUnits(protocolLimits.minLoanAmount, decimals));
                        console.log('Máximo Virtual:', ethers.formatUnits(protocolLimits.maxVirtualBalance, decimals));
                    }
                }

                // Histórico de redeployments
                if (protocol.redeployHistory?.length > 0) {
                    console.log(chalk.cyan('\nHistórico de Redeployments:'));
                    protocol.redeployHistory.forEach((redeploy, index) => {
                        console.log(`\nRedeploy #${index + 1}:`);
                        console.log('Data:', new Date(redeploy.timestamp).toLocaleString());
                        console.log('Motivo:', redeploy.reason);
                        console.log('Endereço Original:', redeploy.originalAddress);
                        console.log('Novo Endereço:', redeploy.newAddress);
                        if (redeploy.recoveryResults) {
                            console.log('Recuperações Sucesso:', redeploy.recoveryResults.successful);
                            console.log('Recuperações Falhas:', redeploy.recoveryResults.failed);
                        }
                    });
                }

            } catch (error) {
                logger.error(`\nErro ao verificar token ${protocol.address}:`);
                logger.error(error.message);
            }
        }

        // Opções após listar
        const choices = ['Voltar ao menu principal'];

        if (inactiveTokens.length > 0) {
            choices.unshift('Redeploy de tokens inativos');
        }

        choices.push('Exportar relatório', 'Sair');

        const { action } = await inquirer.prompt([
            {
                type: 'list',
                name: 'action',
                message: 'O que deseja fazer?',
                choices
            }
        ]);

        if (action === 'Redeploy de tokens inativos') {
            await redeployInactiveTokens(inactiveTokens, data);
        } else if (action === 'Exportar relatório') {
            await exportTokenReport(data.protocols);
        } else if (action === 'Sair') {
            process.exit(0);
        }

    } catch (error) {
        logger.error('\nErro ao listar tokens:');
        logger.error(error.message);
    }

    await returnToMenu(mainMenuRef);
}

async function redeployInactiveTokens(inactiveTokens, data) {
    logger.info('\nIniciando redeploy de tokens inativos...');

    for (const protocol of inactiveTokens) {
        try {
            logger.info(`\nRedeployando ${protocol.tokenData.symbol} (${protocol.address})`);

            // Deploy do novo contrato
            const FlashProtocol = await ethers.getContractFactory("FlashProtocol");
            const newContract = await FlashProtocol.deploy();
            await newContract.waitForDeployment();
            const newAddress = await newContract.getAddress();

            logger.success(`Novo contrato deployado em: ${newAddress}`);

            // Recuperar configurações anteriores
            const virtualBalanceOps = data.operations
                .filter(op =>
                    op.type === 'CONFIGURE_VIRTUAL_BALANCE' &&
                    op.status === 'completed' &&
                    op.protocolAddress === protocol.address
                )
                .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

            // Recuperar estado
            const processedAddresses = new Set();
            const recoveryResults = {
                successful: 0,
                failed: 0,
                balances: []
            };

            for (const op of virtualBalanceOps) {
                if (!processedAddresses.has(op.targetAddress)) {
                    try {
                        logger.info(`Recuperando balanço virtual para ${op.targetAddress}`);
                        await newContract.setVirtualBalance(
                            op.targetAddress,
                            op.amount
                        );

                        const virtualBalance = await newContract.balanceOf(op.targetAddress);
                        const actualBalance = await newContract.getActualBalance(op.targetAddress);

                        recoveryResults.balances.push({
                            address: op.targetAddress,
                            expectedAmount: op.amount,
                            virtualBalance: virtualBalance.toString(),
                            actualBalance: actualBalance.toString(),
                            recovered: virtualBalance.toString() === op.amount
                        });

                        recoveryResults.successful++;
                        processedAddresses.add(op.targetAddress);
                    } catch (error) {
                        logger.error(`Erro ao recuperar balanço para ${op.targetAddress}: ${error.message}`);
                        recoveryResults.failed++;
                    }
                }
            }

            // Registrar redeploy
            const redeployData = {
                id: `redeploy_${Date.now()}`,
                type: 'REDEPLOY',
                timestamp: new Date().toISOString(),
                status: 'completed',
                originalAddress: protocol.address,
                newAddress,
                description: 'Redeploy automático após inatividade',
                recoveryResults
            };

            data.operations.push(redeployData);

            // Atualizar protocolo
            const protocolIndex = data.protocols.findIndex(p => p.address === protocol.address);
            if (protocolIndex !== -1) {
                data.protocols[protocolIndex] = {
                    ...data.protocols[protocolIndex],
                    address: newAddress,
                    redeployHistory: [
                        ...(data.protocols[protocolIndex].redeployHistory || []),
                        {
                            originalAddress: protocol.address,
                            newAddress,
                            timestamp: new Date().toISOString(),
                            reason: 'Network restart recovery',
                            recoveryResults
                        }
                    ]
                };
            }

            saveData(data);
            logger.success(`Token ${protocol.tokenData.symbol} redeployado com sucesso!`);

        } catch (error) {
            logger.error(`\nErro ao redeployar ${protocol.tokenData.symbol}:`);
            logger.error(error.message);
        }
    }
}

async function exportTokenReport(protocols) {
    const timestamp = moment().format('YYYY-MM-DD_HH-mm-ss');
    const reportPath = path.join(DATA_DIR, `tokens_report_${timestamp}.json`);

    const report = {
        timestamp: new Date().toISOString(),
        totalTokens: protocols.length,
        tokens: await Promise.all(protocols.map(async (p) => {
            try {
                const contract = await ethers.getContractAt("FlashProtocol", p.address);
                const code = await ethers.provider.getCode(p.address);
                const isDeployed = code !== '0x';

                let currentData = {
                    registered: p.tokenData,
                    isDeployed,
                    address: p.address,
                    deployDate: p.timestamp
                };

                if (isDeployed) {
                    const [supply, name, symbol, decimals] = await Promise.all([
                        contract.totalSupply(),
                        contract.name(),
                        contract.symbol(),
                        contract.decimals()
                    ]);

                    currentData.current = {
                        name,
                        symbol,
                        decimals: decimals.toString(),
                        totalSupply: supply.toString()
                    };
                }

                return currentData;
            } catch (error) {
                return {
                    address: p.address,
                    error: error.message
                };
            }
        }))
    };

    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    logger.success(`\nRelatório exportado para: ${reportPath}`);
}

module.exports = {
    listDeployedTokens
};