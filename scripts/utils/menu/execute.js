const inquirer = require('inquirer');
const { ethers } = require('hardhat');
const chalk = require('chalk');
const logger = require('../helpers/logger');
const { loadData, saveData } = require('../data/loader');
const { returnToMenu } = require('../helpers/menuHelper');

async function executeOperation(mainMenuRef) {
    logger.info('\nExecutar Operação em Protocolo\n');

    const data = loadData();
    if (data.protocols.length === 0) {
        logger.warning('Nenhum protocolo encontrado. Execute um deploy primeiro.');
        await returnToMenu(mainMenuRef);
        return;
    }

    const protocolChoices = data.protocols.map(p => ({
        name: `${p.tokenData.symbol} - ${p.address}`,
        value: {
            address: p.address,
            symbol: p.tokenData.symbol,
            decimals: p.tokenData.decimals
        }
    }));

    try {
        const operationAnswers = await inquirer.prompt([
            {
                type: 'list',
                name: 'protocol',
                message: 'Selecione o protocolo:',
                choices: protocolChoices
            },
            {
                type: 'list',
                name: 'operationType',
                message: 'Tipo de operação:',
                choices: [
                    {
                        name: 'Flash Loan com Balanço Virtual',
                        value: 'FLASH_LOAN_VIRTUAL'
                    },
                    {
                        name: 'Flash Loan Simples',
                        value: 'FLASH_LOAN_SIMPLE'
                    },
                    {
                        name: 'Voltar',
                        value: 'back'
                    }
                ]
            }
        ]);

        if (operationAnswers.operationType === 'back') {
            await returnToMenu(mainMenuRef);
            return;
        }

        const protocol = await ethers.getContractAt('FlashProtocol', operationAnswers.protocol.address);

        if (operationAnswers.operationType === 'FLASH_LOAN_VIRTUAL') {
            await executeVirtualFlashLoan(protocol, operationAnswers.protocol, data, mainMenuRef);
        } else if (operationAnswers.operationType === 'FLASH_LOAN_SIMPLE') {
            await executeSimpleFlashLoan(protocol, operationAnswers.protocol, data, mainMenuRef);
        }

    } catch (error) {
        logger.error('\nErro durante a execução:');
        logger.error(error.message);

        data.operations.push({
            id: `execute_error_${Date.now()}`,
            type: 'EXECUTE_ERROR',
            timestamp: new Date().toISOString(),
            status: 'failed',
            error: error.message
        });
        saveData(data);
        await returnToMenu(mainMenuRef);
    }
}

async function executeVirtualFlashLoan(protocol, protocolInfo, data, mainMenuRef) {
    logger.info('\nInformações do Token:');
    logger.info(`Símbolo: ${protocolInfo.symbol}`);
    logger.info(`Decimais: ${protocolInfo.decimals}`);

    const answers = await inquirer.prompt([
        {
            type: 'input',
            name: 'targetAddress',
            message: 'Endereço alvo:',
            validate: (input) => ethers.isAddress(input) || 'Endereço inválido'
        },
        {
            type: 'input',
            name: 'virtualBalance',
            message: 'Balanço virtual (em tokens):',
            default: '5000',
            validate: (input) => {
                if (isNaN(input)) return 'Deve ser um número';
                if (parseFloat(input) <= 0) return 'Deve ser maior que zero';
                return true;
            }
        },
        {
            type: 'input',
            name: 'loanAmount',
            message: 'Quantidade do empréstimo (em tokens):',
            default: '1000',
            validate: (input) => {
                if (isNaN(input)) return 'Deve ser um número';
                if (parseFloat(input) <= 0) return 'Deve ser maior que zero';
                return true;
            }
        }
    ]);

    logger.warning('\nExecutando operação...');

    try {
        // Converter valores usando o número correto de decimais
        const virtualAmount = ethers.parseUnits(
            answers.virtualBalance.toString(),
            Number(protocolInfo.decimals)
        );

        logger.info(`\nConfigurando balanço virtual:`);
        logger.info(`Valor (raw): ${answers.virtualBalance} ${protocolInfo.symbol}`);
        logger.info(`Valor (wei): ${virtualAmount.toString()}`);
        logger.info(`Endereço: ${answers.targetAddress}`);

        // Configurar balanço virtual
        const virtualTx = await protocol.setVirtualBalance(answers.targetAddress, virtualAmount);
        logger.info(`TX Hash: ${virtualTx.hash}`);
        const virtualReceipt = await virtualTx.wait();
        logger.success('Balanço virtual configurado com sucesso!');

        // Converter valor do empréstimo
        const loanAmount = ethers.parseUnits(
            answers.loanAmount.toString(),
            Number(protocolInfo.decimals)
        );

        logger.info(`\nExecutando Flash Loan:`);
        logger.info(`Valor (raw): ${answers.loanAmount} ${protocolInfo.symbol}`);
        logger.info(`Valor (wei): ${loanAmount.toString()}`);

        // Executar Flash Loan
        const loanTx = await protocol.executeLoan(loanAmount);
        logger.info(`TX Hash: ${loanTx.hash}`);
        const loanReceipt = await loanTx.wait();
        logger.success('Flash Loan executado com sucesso!');

        // Registrar operação
        data.operations.push({
            id: `flash_loan_virtual_${Date.now()}`,
            type: 'FLASH_LOAN_VIRTUAL',
            timestamp: new Date().toISOString(),
            status: 'completed',
            protocolAddress: protocolInfo.address,
            tokenSymbol: protocolInfo.symbol,
            targetAddress: answers.targetAddress,
            virtualBalance: {
                raw: answers.virtualBalance,
                wei: virtualAmount.toString(),
                decimals: protocolInfo.decimals
            },
            loanAmount: {
                raw: answers.loanAmount,
                wei: loanAmount.toString(),
                decimals: protocolInfo.decimals
            },
            transactions: {
                virtualBalance: {
                    hash: virtualReceipt.hash,
                    blockNumber: virtualReceipt.blockNumber,
                    gasUsed: virtualReceipt.gasUsed.toString()
                },
                flashLoan: {
                    hash: loanReceipt.hash,
                    blockNumber: loanReceipt.blockNumber,
                    gasUsed: loanReceipt.gasUsed.toString()
                }
            }
        });
        saveData(data);

        logger.success('\nOperação completada com sucesso!');
        logger.info('\nDetalhes das Transações:');
        logger.info(`1. Virtual Balance:`);
        logger.info(`   Hash: ${virtualReceipt.hash}`);
        logger.info(`   Block: ${virtualReceipt.blockNumber}`);
        logger.info(`   Gas: ${virtualReceipt.gasUsed.toString()}`);
        logger.info(`\n2. Flash Loan:`);
        logger.info(`   Hash: ${loanReceipt.hash}`);
        logger.info(`   Block: ${loanReceipt.blockNumber}`);
        logger.info(`   Gas: ${loanReceipt.gasUsed.toString()}`);

        logger.info('\nLinks:');
        logger.info(`Virtual Balance TX: https://bscscan.com/tx/${virtualReceipt.hash}`);
        logger.info(`Flash Loan TX: https://bscscan.com/tx/${loanReceipt.hash}`);

        await returnToMenu(mainMenuRef);
    } catch (error) {
        logger.error('\nErro detalhado:');
        logger.error(`Mensagem: ${error.message}`);
        logger.error(`Token: ${protocolInfo.symbol}`);
        logger.error(`Decimais: ${protocolInfo.decimals}`);
        logger.error(`Valores tentados:`);
        logger.error(`- Virtual Balance: ${answers.virtualBalance}`);
        logger.error(`- Loan Amount: ${answers.loanAmount}`);
        throw error;
    }
}

async function executeSimpleFlashLoan(protocol, protocolInfo, data, mainMenuRef) {
    const answers = await inquirer.prompt([
        {
            type: 'input',
            name: 'amount',
            message: 'Quantidade do empréstimo (em tokens):',
            default: '1000',
            validate: (input) => {
                if (isNaN(input)) return 'Deve ser um número';
                if (parseFloat(input) <= 0) return 'Deve ser maior que zero';
                return true;
            }
        }
    ]);

    logger.warning('\nExecutando Flash Loan...');

    try {
        const amount = ethers.parseUnits(
            answers.amount.toString(),
            Number(protocolInfo.decimals)
        );

        logger.info(`\nDetalhes da operação:`);
        logger.info(`Token: ${protocolInfo.symbol}`);
        logger.info(`Valor (raw): ${answers.amount}`);
        logger.info(`Valor (wei): ${amount.toString()}`);

        const tx = await protocol.executeLoan(amount);
        logger.info(`TX Hash: ${tx.hash}`);
        const receipt = await tx.wait();

        // Registrar operação
        data.operations.push({
            id: `flash_loan_simple_${Date.now()}`,
            type: 'FLASH_LOAN_SIMPLE',
            timestamp: new Date().toISOString(),
            status: 'completed',
            protocolAddress: protocolInfo.address,
            tokenSymbol: protocolInfo.symbol,
            amount: {
                raw: answers.amount,
                wei: amount.toString(),
                decimals: protocolInfo.decimals
            },
            transaction: {
                hash: receipt.hash,
                blockNumber: receipt.blockNumber,
                gasUsed: receipt.gasUsed.toString()
            }
        });
        saveData(data);

        logger.success('\nFlash Loan executado com sucesso!');
        logger.info('\nDetalhes da Transação:');
        logger.info(`Hash: ${receipt.hash}`);
        logger.info(`Block: ${receipt.blockNumber}`);
        logger.info(`Gas: ${receipt.gasUsed.toString()}`);
        logger.info(`\nBscScan: https://bscscan.com/tx/${receipt.hash}`);

        await returnToMenu(mainMenuRef);
    } catch (error) {
        logger.error('\nErro detalhado:');
        logger.error(`Mensagem: ${error.message}`);
        logger.error(`Token: ${protocolInfo.symbol}`);
        logger.error(`Decimais: ${protocolInfo.decimals}`);
        logger.error(`Valor tentado: ${answers.amount}`);
        throw error;
    }
}

module.exports = {
    executeOperation
};