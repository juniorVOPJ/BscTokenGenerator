// scripts/utils/helpers/menuHelper.js
const inquirer = require('inquirer');
const chalk = require('chalk');

async function returnToMenu(mainMenuRef) {
    const { action } = await inquirer.prompt([
        {
            type: 'list',
            name: 'action',
            message: 'O que deseja fazer?',
            choices: [
                'Voltar ao menu principal',
                'Sair'
            ]
        }
    ]);

    if (action === 'Voltar ao menu principal') {
        if (typeof mainMenuRef === 'function') {
            await mainMenuRef();
        } else {
            console.error(chalk.red('Erro: Menu principal não disponível'));
            process.exit(1);
        }
    } else {
        console.log(chalk.yellow('\nEncerrando sistema...'));
        process.exit(0);
    }
}

module.exports = {
    returnToMenu
};