// contracts/LendingProtocol.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract LendingProtocol {
    mapping(address => uint256) public balances;
    address public owner;
    
    event LoanExecution(address indexed operator, uint256 amount);
    event LoanSettlement(address indexed operator, uint256 amount);
    
    constructor() {
        owner = msg.sender;
        balances[msg.sender] = 1000000 * 10**18;
    }
    
    modifier onlyOwner() {
        require(msg.sender == owner, "Not authorized");
        _;
    }
    
    function executeLoan(uint256 amount) external {
        require(amount > 0, "Amount must be > 0");
        require(amount <= balances[owner], "Insufficient liquidity");
        
        uint256 balanceBefore = balances[owner];
        
        balances[msg.sender] += amount;
        emit LoanExecution(msg.sender, amount);
        
        require(
            balances[msg.sender] >= amount,
            "Insufficient balance for settlement"
        );
        
        balances[msg.sender] -= amount;
        balances[owner] += amount;
        
        emit LoanSettlement(msg.sender, amount);
        
        require(
            balances[owner] >= balanceBefore,
            "Loan settlement incomplete"
        );
    }
    
    function getBalance(address account) external view returns (uint256) {
        return balances[account];
    }
}