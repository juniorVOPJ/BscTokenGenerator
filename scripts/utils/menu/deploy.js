const inquirer = require('inquirer');
const { ethers } = require('hardhat');
const chalk = require('chalk');
const logger = require('../helpers/logger');
const { loadData, saveData } = require('../data/loader');
const { returnToMenu } = require('../helpers/menuHelper');
const hre = require("hardhat");

// URL do ícone do USDT da CoinGecko
const USDT_ICON = "https://assets.coingecko.com/coins/images/325/large/Tether.png";

async function deployNewProtocol(mainMenuRef) {
    logger.info('\nDeploy de Novo Protocolo na BSC\n');

    try {
        // Verificar rede
        const network = await ethers.provider.getNetwork();
        logger.info(`Rede: ${network.name}`);
        logger.info(`Chain ID: ${network.chainId}`);

        // Verificar conexão e saldo
        const [deployer] = await ethers.getSigners();
        const balance = await ethers.provider.getBalance(deployer.address);

        logger.info('\nInformações da Conta:');
        logger.info(`Endereço: ${deployer.address}`);
        logger.info(`Saldo: ${ethers.formatEther(balance)} BNB`);
        logger.info(`Provider URL: ${process.env.BSC_MAINNET_URL}`);

        // Coletar informações do token
        const answers = await inquirer.prompt([
            {
                type: 'input',
                name: 'description',
                message: 'Descrição do protocolo:',
                default: 'Flash Protocol'
            },
            {
                type: 'input',
                name: 'tokenName',
                message: 'Nome do token:',
                default: 'Tether USD'
            },
            {
                type: 'input',
                name: 'tokenSymbol',
                message: 'Símbolo do token:',
                default: 'USDT'
            },
            {
                type: 'number',
                name: 'decimals',
                message: 'Número de decimais:',
                default: 18
            },
            {
                type: 'input',
                name: 'initialSupply',
                message: 'Supply inicial (em tokens):',
                default: '5184994501'
            },
            {
                type: 'confirm',
                name: 'isPegged',
                message: 'Token será pareado com USD (@$1.00)?',
                default: true
            },
            {
                type: 'number',
                name: 'pegValue',
                message: 'Valor do peg em USD:',
                default: 1.00,
                when: (answers) => answers.isPegged,
                validate: (value) => {
                    if (value <= 0) return 'Valor deve ser maior que zero';
                    return true;
                }
            },
            {
                type: 'input',
                name: 'targetAddress',
                message: 'Endereço alvo:',
                validate: (input) => ethers.isAddress(input) || 'Endereço inválido'
            }
        ]);

        // Preparar o supply inicial
        const initialSupply = ethers.parseUnits(
            answers.initialSupply.toString(),
            answers.decimals
        );

        // Obter Factory do contrato
        const FlashProtocol = await ethers.getContractFactory("FlashProtocol");

        // Estimar gas usando o método correto
        const gasEstimate = await ethers.provider.estimateGas({
            data: FlashProtocol.bytecode + FlashProtocol.interface.encodeDeploy([
                answers.tokenName,
                answers.tokenSymbol,
                answers.decimals,
                initialSupply,
                USDT_ICON // Adicionado o ícone
            ]).slice(2)
        });

        const gasLimit = Math.floor(Number(gasEstimate) * 1.3);
        const feeData = await ethers.provider.getFeeData();
        const gasPrice = feeData.gasPrice;

        // Confirmação final
        const { confirmDeploy } = await inquirer.prompt([
            {
                type: 'confirm',
                name: 'confirmDeploy',
                message: `\nConfirma o deploy com as seguintes configurações?\n` +
                    `Nome: ${answers.tokenName}\n` +
                    `Símbolo: ${answers.tokenSymbol}${answers.isPegged ? ` (@$${answers.pegValue.toFixed(2)})` : ''}\n` +
                    `Decimais: ${answers.decimals}\n` +
                    `Supply: ${answers.initialSupply}\n` +
                    `Gas Estimado: ${gasLimit}\n` +
                    `Rede: BSC Mainnet (${network.chainId})\n` +
                    `${answers.isPegged ? `Pareado com USD: Sim (@$${answers.pegValue.toFixed(2)})\n` : ''}` +
                    `Ícone: USDT (CoinGecko)\n`,
                default: false
            }
        ]);

        if (!confirmDeploy) {
            logger.warning('Deploy cancelado pelo usuário');
            await returnToMenu(mainMenuRef);
            return;
        }

        // Deploy do contrato
        logger.info('\nIniciando deploy na BSC...');

        const protocol = await FlashProtocol.deploy(
            answers.tokenName,
            answers.tokenSymbol,
            answers.decimals,
            initialSupply,
            USDT_ICON, // Adicionado o ícone
            {
                gasLimit: gasLimit,
                gasPrice: gasPrice
            }
        );

        logger.info('Aguardando confirmações...');
        const deploymentTx = protocol.deploymentTransaction();
        const txHash = deploymentTx.hash;

        await protocol.waitForDeployment();
        const protocolAddress = await protocol.getAddress();

        // Verificar o contrato
        const deployedProtocol = await ethers.getContractAt("FlashProtocol", protocolAddress);
        const tokenName = await deployedProtocol.name();
        const tokenSymbol = await deployedProtocol.symbol();
        const tokenDecimals = await deployedProtocol.decimals();
        const totalSupply = await deployedProtocol.totalSupply();
        const tokenIconURI = await deployedProtocol.getTokenURI();

        // Preparar display symbol com peg se aplicável
        const displaySymbol = answers.isPegged ?
            `${tokenSymbol} (@$${answers.pegValue.toFixed(2)})` :
            tokenSymbol;

        // Registrar operação
        const data = loadData();
        const operationData = {
            id: `deploy_${Date.now()}`,
            type: 'DEPLOY',
            network: {
                name: network.name,
                chainId: network.chainId
            },
            timestamp: new Date().toISOString(),
            status: 'completed',
            description: answers.description,
            deployer: deployer.address,
            protocolAddress,
            tokenData: {
                name: tokenName,
                symbol: tokenSymbol,
                displaySymbol: displaySymbol,
                decimals: tokenDecimals,
                initialSupply: totalSupply.toString(),
                isPegged: answers.isPegged,
                pegValue: answers.isPegged ? answers.pegValue : null,
                iconUrl: tokenIconURI // Adicionado o ícone
            },
            targetAddress: answers.targetAddress,
            deployment: {
                gasLimit: gasLimit.toString(),
                gasPrice: gasPrice.toString(),
                transactionHash: txHash
            }
        };

        if (!data.protocols) data.protocols = [];
        if (!data.operations) data.operations = [];

        data.protocols.push({
            address: protocolAddress,
            ...operationData
        });
        data.operations.push(operationData);

        // Adicionar informações de token pegged se aplicável
        if (answers.isPegged) {
            if (!data.peggedTokens) data.peggedTokens = {};
            data.peggedTokens[protocolAddress] = {
                name: tokenName,
                symbol: displaySymbol,
                decimals: tokenDecimals,
                pegValue: answers.pegValue,
                type: 'Stablecoin',
                deployDate: new Date().toISOString(),
                iconUrl: tokenIconURI // Adicionado o ícone
            };
        }

        saveData(data);

        // Exibir resumo
        logger.success('\nDeploy completado com sucesso na BSC!');
        logger.info('\nResumo da Operação:');
        logger.info(`Endereço do Contrato: ${protocolAddress}`);
        logger.info(`Nome do Token: ${tokenName}`);
        logger.info(`Símbolo: ${displaySymbol}`);
        logger.info(`Decimais: ${tokenDecimals}`);
        logger.info(`Supply Total: ${ethers.formatUnits(totalSupply, tokenDecimals)}`);
        logger.info(`Gas Usado: ${gasLimit}`);
        logger.info(`Hash da Transação: ${txHash}`);
        logger.info(`Ícone: ${tokenIconURI}`);

        // Links úteis
        logger.info('\nLinks Úteis:');
        logger.info(`BscScan Contrato: https://bscscan.com/address/${protocolAddress}`);
        logger.info(`BscScan TX: https://bscscan.com/tx/${txHash}`);

        // Informações para carteira
        logger.info('\nAdicionar Token à Carteira:');
        logger.info(`Endereço: ${protocolAddress}`);
        logger.info(`Símbolo: ${displaySymbol}`);
        logger.info(`Decimais: ${tokenDecimals}`);
        logger.info(`Ícone: ${tokenIconURI}`);
        if (answers.isPegged) {
            logger.info(`Tipo: Stablecoin`);
            logger.info(`Valor Pareado: $${answers.pegValue.toFixed(2)}`);
        }

    } catch (error) {
        logger.error('\nErro durante o deploy:');
        logger.error(error.message);

        const data = loadData();
        if (!data.operations) data.operations = [];

        data.operations.push({
            id: `deploy_error_${Date.now()}`,
            type: 'DEPLOY_ERROR',
            network: 'BSC',
            chainId: 56,
            timestamp: new Date().toISOString(),
            status: 'failed',
            error: error.message
        });
        saveData(data);
    }

    await returnToMenu(mainMenuRef);
}

module.exports = {
    deployNewProtocol
};