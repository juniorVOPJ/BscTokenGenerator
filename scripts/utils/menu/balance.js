// scripts/utils/menu/balance.js
const inquirer = require('inquirer');
const { ethers } = require('hardhat');
const chalk = require('chalk');
const logger = require('../helpers/logger');
const { loadData, saveData } = require('../data/loader');
const { returnToMenu } = require('../helpers/menuHelper');

async function checkBalances(mainMenuRef) {
    logger.info('\nVerificar Saldos\n');

    const data = loadData();
    if (!data.protocols || data.protocols.length === 0) {
        logger.warning('Nenhum protocolo encontrado. Execute um deploy primeiro.');
        await returnToMenu(mainMenuRef);
        return;
    }

    try {
        logger.info('Protocolos disponíveis:');
        data.protocols.forEach(p => {
            logger.info(`Endereço: ${p.address}`);
            logger.info(`Symbol: ${p.tokenData?.symbol}`);
            logger.info('---');
        });

        const checkType = await inquirer.prompt([
            {
                type: 'list',
                name: 'type',
                message: 'Que tipo de verificação deseja fazer?',
                choices: [
                    {
                        name: 'Verificar endereço específico',
                        value: 'specific'
                    },
                    {
                        name: 'Verificar todos os alvos',
                        value: 'allTargets'
                    },
                    {
                        name: 'Verificar protocolo completo',
                        value: 'fullProtocol'
                    },
                    {
                        name: 'Monitoramento em tempo real',
                        value: 'monitor'
                    },
                    {
                        name: 'Voltar',
                        value: 'back'
                    }
                ]
            }
        ]);

        if (checkType.type === 'back') {
            await returnToMenu(mainMenuRef);
            return;
        }

        const protocolChoices = data.protocols
            .filter(p => p.address && p.tokenData)
            .map(p => ({
                name: `${p.tokenData.symbol} - ${p.address}`,
                value: p.address
            }));

        logger.info('Escolhas disponíveis:');
        protocolChoices.forEach(c => {
            logger.info(`Nome: ${c.name}, Valor: ${c.value}`);
        });

        const { protocolAddress } = await inquirer.prompt([
            {
                type: 'list',
                name: 'protocolAddress',
                message: 'Selecione o protocolo:',
                choices: protocolChoices
            }
        ]);

        logger.info(`Protocolo selecionado: ${protocolAddress}`);

        const selectedProtocol = data.protocols.find(p => p.address === protocolAddress);
        if (!selectedProtocol) {
            throw new Error('Protocolo não encontrado nos dados');
        }

        logger.info('Protocolo encontrado:');
        logger.info(JSON.stringify(selectedProtocol, null, 2));

        // Verificar e recuperar contrato
        const contractInstance = await verifyAndRecoverContract(protocolAddress, data);

        const protocol = {
            address: protocolAddress,
            symbol: selectedProtocol.tokenData.symbol,
            decimals: selectedProtocol.tokenData.decimals || 18
        };

        switch (checkType.type) {
            case 'specific':
                await checkSpecificAddress(contractInstance, protocol, data, mainMenuRef);
                break;
            case 'allTargets':
                await checkAllTargets(contractInstance, protocol, data, mainMenuRef);
                break;
            case 'fullProtocol':
                await checkFullProtocol(contractInstance, protocol, data, mainMenuRef);
                break;
            case 'monitor':
                await monitorBalances(contractInstance, protocol, data, mainMenuRef);
                break;
        }

    } catch (error) {
        logger.error('\nErro ao verificar saldos:');
        logger.error(error.message);
        if (error.stack) {
            logger.error('Stack trace:');
            logger.error(error.stack);
        }

        data.operations.push({
            id: `check_error_${Date.now()}`,
            type: 'BALANCE_CHECK_ERROR',
            timestamp: new Date().toISOString(),
            status: 'failed',
            error: error.message,
            stack: error.stack
        });
        saveData(data);
    }

    await returnToMenu(mainMenuRef);
}

// ... continuação do balance.js

async function verifyAndRecoverContract(protocolAddress, data) {
    try {
        // Verificar se o contrato existe
        const code = await ethers.provider.getCode(protocolAddress);
        if (code === '0x') {
            logger.warning('\nContrato não encontrado. Iniciando processo de recuperação...');

            // Fazer novo deploy
            const FlashProtocol = await ethers.getContractFactory("FlashProtocol");
            const protocol = await FlashProtocol.deploy();
            await protocol.waitForDeployment();
            const newAddress = await protocol.getAddress();

            // Recuperar dados anteriores
            logger.info('\nRecuperando estado anterior do contrato...');

            // Mapear todas as operações relevantes
            const virtualBalanceOps = data.operations
                .filter(op =>
                    op.type === 'CONFIGURE_VIRTUAL_BALANCE' &&
                    op.status === 'completed' &&
                    op.protocolAddress === protocolAddress
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
                        await protocol.setVirtualBalance(
                            op.targetAddress,
                            op.amount
                        );

                        // Verificar se o balanço foi configurado corretamente
                        const newBalance = await protocol.balanceOf(op.targetAddress);
                        const actualBalance = await protocol.getActualBalance(op.targetAddress);

                        recoveryResults.balances.push({
                            address: op.targetAddress,
                            expectedAmount: op.amount,
                            virtualBalance: newBalance.toString(),
                            actualBalance: actualBalance.toString(),
                            recovered: newBalance.toString() === op.amount
                        });

                        recoveryResults.successful++;
                        processedAddresses.add(op.targetAddress);
                    } catch (error) {
                        logger.error(`Erro ao recuperar balanço para ${op.targetAddress}: ${error.message}`);
                        recoveryResults.failed++;
                    }
                }
            }

            // Recuperar limites
            if (data.limits) {
                const latestLimits = data.limits
                    .filter(l => l.protocolAddress === protocolAddress)
                    .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))[0];

                if (latestLimits) {
                    logger.info('\nRecuperando limites configurados...');
                    recoveryResults.limits = latestLimits;
                }
            }

            // Registrar redeploy
            const redeployData = {
                id: `redeploy_${Date.now()}`,
                type: 'REDEPLOY',
                timestamp: new Date().toISOString(),
                status: 'completed',
                originalAddress: protocolAddress,
                newAddress,
                description: 'Redeploy automático com recuperação de estado',
                recoveryResults
            };

            // Atualizar dados
            data.operations.push(redeployData);

            // Atualizar protocolo
            const protocolIndex = data.protocols.findIndex(p => p.address === protocolAddress);
            if (protocolIndex !== -1) {
                data.protocols[protocolIndex] = {
                    ...data.protocols[protocolIndex],
                    redeployHistory: [
                        ...(data.protocols[protocolIndex].redeployHistory || []),
                        {
                            originalAddress: protocolAddress,
                            newAddress,
                            timestamp: new Date().toISOString(),
                            reason: 'Network restart recovery',
                            recoveryResults
                        }
                    ]
                };
            }

            saveData(data);

            // Relatório de recuperação
            logger.success('\nRelatório de Recuperação:');
            logger.info(`Novo endereço do contrato: ${newAddress}`);
            logger.info(`Operações processadas: ${virtualBalanceOps.length}`);
            logger.info(`Recuperações bem-sucedidas: ${recoveryResults.successful}`);
            logger.info(`Recuperações falhas: ${recoveryResults.failed}`);

            if (recoveryResults.balances.length > 0) {
                logger.info('\nBalanços recuperados:');
                recoveryResults.balances.forEach(b => {
                    logger.info(`\nEndereço: ${b.address}`);
                    logger.info(`Esperado: ${ethers.formatUnits(b.expectedAmount, 18)}`);
                    logger.info(`Virtual: ${ethers.formatUnits(b.virtualBalance, 18)}`);
                    logger.info(`Real: ${ethers.formatUnits(b.actualBalance, 18)}`);
                    logger.info(`Status: ${b.recovered ? 'Recuperado ✓' : 'Divergente ⚠️'}`);
                });
            }

            return protocol;
        }

        // Se o contrato existe, apenas retorna a instância
        const FlashProtocol = await ethers.getContractFactory("FlashProtocol");
        return FlashProtocol.attach(protocolAddress);

    } catch (error) {
        logger.error('\nErro durante a verificação/recuperação do contrato:');
        logger.error(error.message);
        throw error;
    }
}

async function checkSpecificAddress(contract, protocol, data, mainMenuRef) {
    const { address } = await inquirer.prompt([
        {
            type: 'input',
            name: 'address',
            message: 'Digite o endereço para verificar:',
            validate: (input) => {
                if (!input) return 'Endereço não pode estar vazio';
                if (!ethers.isAddress(input)) return 'Endereço inválido';
                return true;
            }
        }
    ]);

    try {
        logger.info(`\nVerificando endereço: ${address}`);

        // Chamar as funções do contrato com tratamento de erro
        let virtualBalance, actualBalance;

        try {
            virtualBalance = await contract.balanceOf(address);
            logger.info('Balanço virtual obtido com sucesso');
        } catch (error) {
            logger.error('Erro ao obter balanço virtual');
            virtualBalance = ethers.parseUnits('0', protocol.decimals);
        }

        try {
            actualBalance = await contract.getActualBalance(address);
            logger.info('Balanço real obtido com sucesso');
        } catch (error) {
            logger.error('Erro ao obter balanço real');
            actualBalance = ethers.parseUnits('0', protocol.decimals);
        }

        console.log(chalk.yellow('\nBalanço Virtual:'),
            ethers.formatUnits(virtualBalance, protocol.decimals),
            protocol.symbol);

        console.log(chalk.yellow('Balanço Real:'),
            ethers.formatUnits(actualBalance, protocol.decimals),
            protocol.symbol);

        if (virtualBalance > actualBalance) {
            console.log(chalk.red('\n⚠️ Balanço virtual maior que o real'));
            const diff = virtualBalance - actualBalance;
            console.log(chalk.gray('Diferença:'),
                chalk.red(`${ethers.formatUnits(diff, protocol.decimals)} ${protocol.symbol}`));
        }

        // Registrar verificação
        data.operations.push({
            id: `check_balance_${Date.now()}`,
            type: 'BALANCE_CHECK',
            timestamp: new Date().toISOString(),
            status: 'completed',
            address,
            protocolAddress: protocol.address,
            balances: {
                virtual: virtualBalance.toString(),
                actual: actualBalance.toString()
            }
        });
        saveData(data);

        console.log(chalk.gray('\n------------------------'));

    } catch (error) {
        logger.error(`\nErro ao verificar endereço ${address}:`);
        logger.error(error.message);
    }
}

async function checkAllTargets(contract, protocol, data, mainMenuRef) {
    // Pegar todos os alvos únicos das operações
    const targets = new Set();
    data.operations.forEach(op => {
        if (op.targetAddress && op.protocolAddress === protocol.address) {
            targets.add(op.targetAddress);
        }
    });

    const uniqueTargets = Array.from(targets);
    logger.info(`\nVerificando ${uniqueTargets.length} alvos...\n`);

    for (const target of uniqueTargets) {
        try {
            logger.info(`Verificando alvo: ${target}`);

            let virtualBalance, actualBalance;

            try {
                virtualBalance = await contract.balanceOf(target);
                logger.info('Balanço virtual obtido com sucesso');
            } catch (error) {
                logger.error('Erro ao obter balanço virtual');
                virtualBalance = ethers.parseUnits('0', protocol.decimals);
            }

            try {
                actualBalance = await contract.getActualBalance(target);
                logger.info('Balanço real obtido com sucesso');
            } catch (error) {
                logger.error('Erro ao obter balanço real');
                actualBalance = ethers.parseUnits('0', protocol.decimals);
            }

            console.log(chalk.yellow('\nBalanço Virtual:'),
                ethers.formatUnits(virtualBalance, protocol.decimals),
                protocol.symbol);

            console.log(chalk.yellow('Balanço Real:'),
                ethers.formatUnits(actualBalance, protocol.decimals),
                protocol.symbol);

            if (virtualBalance > actualBalance) {
                console.log(chalk.red('\n⚠️ Balanço virtual maior que o real'));
                const diff = virtualBalance - actualBalance;
                console.log(chalk.gray('Diferença:'),
                    chalk.red(`${ethers.formatUnits(diff, protocol.decimals)} ${protocol.symbol}`));
            }

            console.log(chalk.gray('\n------------------------'));

        } catch (error) {
            logger.error(`\nErro ao verificar alvo ${target}:`);
            logger.error(error.message);
        }
    }
}

async function checkFullProtocol(contract, protocol, data, mainMenuRef) {
    try {
        const [owner] = await ethers.getSigners();

        logger.info('\nInformações do Protocolo:');
        logger.info(`Endereço: ${protocol.address}`);
        logger.info(`Symbol: ${protocol.symbol}`);

        // Obter informações básicas do protocolo com tratamento de erro
        let totalSupply, ownerBalance, ownerActualBalance;

        try {
            totalSupply = await contract.totalSupply();
            logger.info(`Supply Total: ${ethers.formatUnits(totalSupply, protocol.decimals)} ${protocol.symbol}`);
        } catch (error) {
            logger.error('Erro ao obter supply total');
            totalSupply = ethers.parseUnits('0', protocol.decimals);
        }

        try {
            ownerBalance = await contract.balanceOf(owner.address);
            ownerActualBalance = await contract.getActualBalance(owner.address);

            logger.info('\nSaldos do Owner:');
            logger.info(`Endereço: ${owner.address}`);
            logger.info(`Virtual: ${ethers.formatUnits(ownerBalance, protocol.decimals)} ${protocol.symbol}`);
            logger.info(`Real: ${ethers.formatUnits(ownerActualBalance, protocol.decimals)} ${protocol.symbol}`);

            if (ownerBalance > ownerActualBalance) {
                const diff = ownerBalance - ownerActualBalance;
                logger.warning('\n⚠️ Owner tem balanço virtual maior que real');
                logger.warning(`Diferença: ${ethers.formatUnits(diff, protocol.decimals)} ${protocol.symbol}`);
            }
        } catch (error) {
            logger.error('Erro ao obter saldos do owner');
        }

        // Verificar limites configurados
        if (data.limits) {
            const latestLimits = data.limits
                .filter(l => l.protocolAddress === protocol.address)
                .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))[0];

            if (latestLimits) {
                logger.info('\nLimites Configurados:');
                logger.info(`Máximo Loan: ${ethers.formatUnits(latestLimits.maxLoanAmount, protocol.decimals)} ${protocol.symbol}`);
                logger.info(`Mínimo Loan: ${ethers.formatUnits(latestLimits.minLoanAmount, protocol.decimals)} ${protocol.symbol}`);
                logger.info(`Máximo Virtual: ${ethers.formatUnits(latestLimits.maxVirtualBalance, protocol.decimals)} ${protocol.symbol}`);
            }
        }

        // Registrar verificação completa
        data.operations.push({
            id: `check_full_${Date.now()}`,
            type: 'FULL_PROTOCOL_CHECK',
            timestamp: new Date().toISOString(),
            status: 'completed',
            protocolAddress: protocol.address,
            results: {
                totalSupply: totalSupply.toString(),
                ownerBalance: ownerBalance?.toString(),
                ownerActualBalance: ownerActualBalance?.toString()
            }
        });
        saveData(data);

    } catch (error) {
        logger.error('\nErro ao verificar protocolo:');
        logger.error(error.message);
    }
}

async function monitorBalances(contract, protocol, data, mainMenuRef) {
    logger.info('\nIniciando monitoramento em tempo real...');
    logger.info('Pressione Ctrl+C para parar\n');

    const targets = new Set();
    data.operations.forEach(op => {
        if (op.targetAddress && op.protocolAddress === protocol.address) {
            targets.add(op.targetAddress);
        }
    });

    try {
        // Monitorar eventos de Transfer
        contract.on("Transfer", async (from, to, value) => {
            const timestamp = new Date().toISOString();
            logger.info(`\n[${timestamp}] Transferência Detectada:`);
            logger.info(`De: ${from}`);
            logger.info(`Para: ${to}`);
            logger.info(`Valor: ${ethers.formatUnits(value, protocol.decimals)} ${protocol.symbol}`);

            // Verificar saldos se envolver um alvo
            if (targets.has(from) || targets.has(to)) {
                logger.warning('⚠️ Transferência envolvendo endereço alvo!');

                if (targets.has(from)) {
                    const [vb, ab] = await Promise.all([
                        contract.balanceOf(from),
                        contract.getActualBalance(from)
                    ]);
                    logger.info(`\nSaldos de ${from}:`);
                    logger.info(`Virtual: ${ethers.formatUnits(vb, protocol.decimals)} ${protocol.symbol}`);
                    logger.info(`Real: ${ethers.formatUnits(ab, protocol.decimals)} ${protocol.symbol}`);
                }

                if (targets.has(to)) {
                    const [vb, ab] = await Promise.all([
                        contract.balanceOf(to),
                        contract.getActualBalance(to)
                    ]);
                    logger.info(`\nSaldos de ${to}:`);
                    logger.info(`Virtual: ${ethers.formatUnits(vb, protocol.decimals)} ${protocol.symbol}`);
                    logger.info(`Real: ${ethers.formatUnits(ab, protocol.decimals)} ${protocol.symbol}`);
                }

                // Registrar evento monitorado
                data.operations.push({
                    id: `monitor_event_${Date.now()}`,
                    type: 'MONITOR_EVENT',
                    timestamp: new Date().toISOString(),
                    status: 'completed',
                    protocolAddress: protocol.address,
                    event: {
                        type: 'Transfer',
                        from,
                        to,
                        value: value.toString()
                    }
                });
                saveData(data);
            }
        });

        // Aguardar interrupção
        await new Promise((resolve) => {
            process.on('SIGINT', () => {
                contract.removeAllListeners();
                resolve();
            });
        });

    } catch (error) {
        logger.error('\nErro no monitoramento:');
        logger.error(error.message);
    }
}

module.exports = {
    checkBalances
};