# Flash Protocol System

Sistema de geração e análise de tokens BSC para investigação de golpes em criptomoedas.

## Descrição

Este sistema foi desenvolvido para auxiliar investigações de golpes sofisticados envolvendo tokens na Binance Smart Chain (BSC). Ele permite:

- Geração de tokens com comportamentos específicos
- Análise de vulnerabilidades
- Documentação de operações suspeitas 
- Monitoramento de transações

## Instalação

1. Clone o repositório:
`git clone <repository-url>`
`cd token-generator`

2. Instale as dependências:
`npm install`

3. Configure as variáveis de ambiente (.env):
```
BSCSCAN_API_KEY=<sua-api-key>
BSC_MAINNET_URL=https://bsc-dataseed.binance.org/
OWNER_PRIVATE_KEY=<sua-private-key>
OWNER_ADDRESS=<seu-endereço>
GAS_LIMIT=3000000
GAS_PRICE=5
```

## Uso

### Comandos Principais

- Iniciar sistema na mainnet:
`npm start`

- Iniciar em ambiente local:
`npm run start:local`

- Iniciar na testnet:
`npm run start:testnet`

- Deploy na mainnet:
`npm run deploy`

- Deploy na testnet:
`npm run deploy:testnet`

- Compilar contratos:
`npm run compile`

- Limpar cache:
`npm run clean`

### Funcionalidades

1. Deploy de novos protocolos
2. Configuração de balanços virtuais
3. Execução de flash loans
4. Monitoramento de operações
5. Exportação de relatórios

## Estrutura do Projeto

```
├── contracts/
│   ├── FlashProtocol.sol
│   └── LendingProtocol.sol
├── scripts/
│   ├── menu.js
│   └── utils/
├── data/
├── test/
└── config/
```

## Dependências Principais

- hardhat: ^2.22.19
- ethers: ^6.13.5
- @openzeppelin/contracts: ^5.2.0
- inquirer: ^8.2.6
- moment-timezone: ^0.5.47
- chalk: ^4.1.2

## Configuração Hardhat

```javascript
module.exports = {
  solidity: {
    version: "0.8.20",
    settings: {
      optimizer: {
        enabled: true,
        runs: 1
      },
      metadata: {
        bytecodeHash: "none"
      },
      viaIR: true
    }
  },
  networks: {
    bsc: {
      url: process.env.BSC_MAINNET_URL,
      chainId: 56,
      accounts: [process.env.OWNER_PRIVATE_KEY]
    },
    bscTestnet: {
      url: "https://data-seed-prebsc-1-s1.binance.org:8545/",
      chainId: 97,
      accounts: [process.env.OWNER_PRIVATE_KEY]
    }
  }
}
```

## Segurança

- Este sistema deve ser usado apenas para fins de investigação legal
- As chaves privadas nunca devem ser compartilhadas
- Recomenda-se usar apenas em ambiente controlado

## Documentação

Para mais detalhes sobre cada módulo e funcionalidade, consulte:

- [Documentação dos Contratos](./docs/contracts.md)
- [Guia de Operações](./docs/operations.md)
- [Análise de Vulnerabilidades](./docs/security.md)

## Licença

MIT License - veja [LICENSE](LICENSE) para mais detalhes.