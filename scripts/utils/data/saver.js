// scripts/utils/data/saver.js
const moment = require('moment-timezone');
const { loadData, saveData } = require('./loader');

class OperationSaver {
    static async saveOperation(operation) {
        const data = loadData();

        const operationData = {
            id: `op_${Date.now()}`,
            timestamp: moment().tz('America/Sao_Paulo').format(),
            ...operation
        };

        data.operations.push(operationData);

        if (operation.type === 'DEPLOY') {
            data.protocols.push({
                address: operation.protocolAddress,
                deployedAt: operationData.timestamp,
                ...operation.protocolData
            });
        }

        return saveData(data);
    }

    static async saveError(error, context) {
        const data = loadData();

        const errorData = {
            id: `error_${Date.now()}`,
            timestamp: moment().tz('America/Sao_Paulo').format(),
            type: 'ERROR',
            error: error.message,
            stack: error.stack,
            context
        };

        data.operations.push(errorData);
        return saveData(data);
    }

    static async updateOperation(operationId, updates) {
        const data = loadData();

        const operationIndex = data.operations.findIndex(op => op.id === operationId);
        if (operationIndex === -1) return false;

        data.operations[operationIndex] = {
            ...data.operations[operationIndex],
            ...updates,
            updatedAt: moment().tz('America/Sao_Paulo').format()
        };

        return saveData(data);
    }
}

module.exports = OperationSaver;