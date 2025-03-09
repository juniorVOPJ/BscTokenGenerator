// scripts/menu.js
const inquirer = require('inquirer');
const { ethers } = require('hardhat');
const fs = require('fs');
const moment = require('moment-timezone');
const chalk = require('chalk');
const path = require('path');

// Importar todas as funções dos módulos
const { deployNewProtocol } = require('./utils/menu/deploy');
const { configureProtocol } = require('./utils/menu/configure');
const { executeOperation } = require('./utils/menu/execute');
const { viewOperations } = require('./utils/menu/view');
const { checkBalances } = require('./utils/menu/balance');
const { listDeployedTokens } = require('./utils/menu/listTokens');
const { returnToMenu } = require('./utils/helpers/menuHelper');

// Configuração dos arquivos de dados
const DATA_DIR = path.join(__dirname, '../data');
const DATA_FILE = path.join(DATA_DIR, 'operations.json');

// Estrutura inicial do arquivo de dados
const INITIAL_DATA = {
    operations: [],
    protocols: [],
    lastUpdate: moment().tz('America/Sao_Paulo').format(),
    metadata: {
        version: '1.0.0',
        created: moment().tz('America/Sao_Paulo').format()
    }
};

// Criar diretório e arquivo de dados se não existirem
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(INITIAL_DATA, null, 2));
}

// Funções auxiliares
const loadData = () => {
    try {
        if (!fs.existsSync(DATA_FILE)) {
            return INITIAL_DATA;
        }
        const data = JSON.parse(fs.readFileSync(DATA_FILE));
        return {
            operations: data.operations || [],
            protocols: data.protocols || [],
            lastUpdate: data.lastUpdate || moment().tz('America/Sao_Paulo').format(),
            metadata: data.metadata || INITIAL_DATA.metadata,
            limits: data.limits || []
        };
    } catch (error) {
        console.error('Erro ao carregar dados:', error);
        return INITIAL_DATA;
    }
};

const saveData = (data) => {
    try {
        const dataToSave = {
            operations: data.operations || [],
            protocols: data.protocols || [],
            lastUpdate: moment().tz('America/Sao_Paulo').format(),
            metadata: data.metadata || INITIAL_DATA.metadata,
            limits: data.limits || []
        };
        fs.writeFileSync(DATA_FILE, JSON.stringify(dataToSave, null, 2));
    } catch (error) {
        console.error('Erro ao salvar dados:', error);
    }
};

// Menu principal
async function mainMenu() {
    console.clear();
    console.log(chalk.blue('=== Sistema de Protocolo Flash ===\n'));

    // Carregar e mostrar estatísticas
    const data = loadData();
    console.log(chalk.gray('Última atualização:', data.lastUpdate));
    console.log(chalk.gray('Protocolos ativos:', (data.protocols || []).length));
    console.log(chalk.gray('Operações registradas:', (data.operations || []).length));
    console.log();

    // Menu principal
    const { choice } = await inquirer.prompt([
        {
            type: 'list',
            name: 'choice',
            message: 'Selecione uma operação:',
            choices: [
                'Deploy novo protocolo',
                'Configurar protocolo existente',
                'Executar operação',
                'Visualizar operações',
                'Verificar saldos',
                'Listar Tokens Deployados',
                'Gerenciar Limites',
                'Monitoramento',
                'Exportar Dados',
                'Sair'
            ]
        }
    ]);

    try {
        switch (choice) {
            case 'Deploy novo protocolo':
                await deployNewProtocol(mainMenu);
                break;
            case 'Configurar protocolo existente':
                await configureProtocol(mainMenu);
                break;
            case 'Executar operação':
                await executeOperation(mainMenu);
                break;
            case 'Visualizar operações':
                await viewOperations(mainMenu);
                break;
            case 'Verificar saldos':
                await checkBalances(mainMenu);
                break;
            case 'Listar Tokens Deployados':
                await listDeployedTokens(mainMenu);
                break;
            case 'Gerenciar Limites':
                await manageLimits(mainMenu);
                break;
            case 'Monitoramento':
                await monitoring(mainMenu);
                break;
            case 'Exportar Dados':
                await exportData(mainMenu);
                break;
            case 'Sair':
                console.log(chalk.yellow('\nEncerrando sistema...'));
                process.exit(0);
        }
    } catch (error) {
        console.error(chalk.red('\nErro na operação:'));
        console.error(error.message || error);
        await returnToMenu(mainMenu);
    }
}

// Função para gerenciar limites
async function manageLimits(mainMenuRef) {
    const data = loadData();
    if (!data.protocols || data.protocols.length === 0) {
        console.log(chalk.yellow('\nNenhum protocolo encontrado para configurar limites.'));
        await returnToMenu(mainMenuRef);
        return;
    }

    const { protocol } = await inquirer.prompt([
        {
            type: 'list',
            name: 'protocol',
            message: 'Selecione o protocolo:',
            choices: data.protocols.map(p => ({
                name: `${p.tokenData.symbol} - ${p.address}`,
                value: p.address
            }))
        }
    ]);

    const limits = await inquirer.prompt([
        {
            type: 'input',
            name: 'maxLoan',
            message: 'Limite máximo de empréstimo:',
            default: '10000'
        },
        {
            type: 'input',
            name: 'minLoan',
            message: 'Limite mínimo de empréstimo:',
            default: '100'
        },
        {
            type: 'input',
            name: 'maxVirtual',
            message: 'Limite máximo de balanço virtual:',
            default: '50000'
        }
    ]);

    // Salvar limites
    if (!data.limits) data.limits = [];
    data.limits.push({
        id: `limits_${Date.now()}`,
        protocolAddress: protocol,
        maxLoanAmount: ethers.parseUnits(limits.maxLoan.toString(), 18).toString(),
        minLoanAmount: ethers.parseUnits(limits.minLoan.toString(), 18).toString(),
        maxVirtualBalance: ethers.parseUnits(limits.maxVirtual.toString(), 18).toString(),
        updatedAt: new Date().toISOString()
    });

    saveData(data);
    console.log(chalk.green('\nLimites configurados com sucesso!'));
    await returnToMenu(mainMenuRef);
}

// Função para monitoramento
async function monitoring(mainMenuRef) {
    console.log(chalk.yellow('\nIniciando monitoramento...'));
    console.log('Pressione Ctrl+C para parar');

    const data = loadData();
    const protocols = data.protocols || [];

    for (const protocol of protocols) {
        const contract = await ethers.getContractAt('FlashProtocol', protocol.address);

        contract.on('Transfer', (from, to, value) => {
            console.log(chalk.cyan('\nTransferência detectada:'));
            console.log('De:', from);
            console.log('Para:', to);
            console.log('Valor:', ethers.formatUnits(value, 18));
        });

        contract.on('LoanExecution', (operator, amount) => {
            console.log(chalk.yellow('\nEmpréstimo executado:'));
            console.log('Operador:', operator);
            console.log('Valor:', ethers.formatUnits(amount, 18));
        });
    }

    // Manter processo ativo
    await new Promise((resolve) => {
        process.on('SIGINT', () => {
            console.log(chalk.yellow('\nMonitoramento encerrado'));
            resolve();
        });
    });

    await returnToMenu(mainMenuRef);
}

// Função para exportar dados
async function exportData(mainMenuRef) {
    const data = loadData();
    const timestamp = moment().format('YYYY-MM-DD_HH-mm-ss');
    const exportPath = path.join(DATA_DIR, `export_${timestamp}.json`);

    fs.writeFileSync(exportPath, JSON.stringify(data, null, 2));
    console.log(chalk.green(`\nDados exportados para: ${exportPath}`));

    await returnToMenu(mainMenuRef);
}

// Tratamento de erros global
process.on('unhandledRejection', (error) => {
    console.error(chalk.red('\nErro não tratado:'));
    console.error(error.message || error);

    const data = loadData();
    data.operations.push({
        id: `error_${Date.now()}`,
        type: 'SYSTEM_ERROR',
        timestamp: moment().tz('America/Sao_Paulo').format(),
        status: 'failed',
        error: error.message || 'Unknown error',
        stack: error.stack
    });
    saveData(data);
});

// Inicializar sistema
console.clear();
mainMenu().catch((error) => {
    console.error(chalk.red('\nErro fatal:'));
    console.error(error);
    process.exit(1);
});

module.exports = {
    mainMenu
};