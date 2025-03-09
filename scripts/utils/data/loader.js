// scripts/utils/data/loader.js
const fs = require('fs');
const path = require('path');
const moment = require('moment-timezone');
const { DATA_DIR } = require('../config/constants');

// Estrutura inicial dos dados
const INITIAL_DATA = {
    operations: [],
    protocols: [],
    lastUpdate: moment().tz('America/Sao_Paulo').format(),
    metadata: {
        version: '1.0.0',
        created: moment().tz('America/Sao_Paulo').format()
    }
};

// Garantir que o diretório de dados existe
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DATA_FILE = path.join(DATA_DIR, 'operations.json');

function loadData() {
    try {
        if (!fs.existsSync(DATA_FILE)) {
            saveData(INITIAL_DATA);
            return INITIAL_DATA;
        }

        const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
        return {
            ...INITIAL_DATA,
            ...data,
            lastUpdate: moment().tz('America/Sao_Paulo').format()
        };
    } catch (error) {
        console.error('Erro ao carregar dados:', error);
        return INITIAL_DATA;
    }
}

const saveData = (data) => {
    try {
        // Converter BigInt para string antes de salvar
        const sanitizedData = JSON.parse(JSON.stringify(data, (key, value) =>
            typeof value === 'bigint' ? value.toString() : value
        ));

        sanitizedData.lastUpdate = moment().tz('America/Sao_Paulo').format();
        fs.writeFileSync(DATA_FILE, JSON.stringify(sanitizedData, null, 2));
    } catch (error) {
        console.error('Erro ao salvar dados:', error);
    }
};

function backupData() {
    try {
        const timestamp = moment().tz('America/Sao_Paulo').format('YYYY-MM-DD_HH-mm-ss');
        const backupFile = path.join(DATA_DIR, `backup_${timestamp}.json`);
        const data = loadData();
        fs.writeFileSync(backupFile, JSON.stringify(data, null, 2));
        return backupFile;
    } catch (error) {
        console.error('Erro ao fazer backup:', error);
        return null;
    }
}

module.exports = {
    loadData,
    saveData,
    backupData,
    INITIAL_DATA
};