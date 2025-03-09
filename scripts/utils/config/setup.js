// scripts/utils/config/setup.js
const { ethers } = require('hardhat');
const chalk = require('chalk');
const { NETWORKS } = require('./constants');
const { loadData } = require('../data/loader');

async function initializeSystem() {
    console.clear();
    console.log(chalk.blue('====================================='));
    console.log(chalk.blue('    Sistema de Protocolo Flash      '));
    console.log(chalk.blue('====================================='));

    try {
        const network = await ethers.provider.getNetwork();
        const [signer] = await ethers.getSigners();
        const balance = await ethers.provider.getBalance(signer.address);

        console.log(chalk.gray('\nAmbiente:'));
        console.log('Rede:', chalk.cyan(network.name));
        console.log('Conta:', chalk.cyan(signer.address));
        console.log('Saldo:', chalk.cyan(ethers.formatEther(balance)), 'BNB');

        return {
            network,
            signer,
            balance
        };
    } catch (error) {
        throw new Error(`Erro na inicialização: ${error.message}`);
    }
}

module.exports = {
    initializeSystem
};