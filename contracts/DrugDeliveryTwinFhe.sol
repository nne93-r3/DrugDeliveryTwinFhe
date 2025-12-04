// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { FHE, euint32, ebool } from "@fhevm/solidity/lib/FHE.sol";
import { SepoliaConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

contract DrugDeliveryTwinFhe is SepoliaConfig {
    struct EncryptedPatientModel {
        uint256 patientId;
        address healthcareProvider;
        euint32 biometricData;
        euint32 metabolismRate;
        euint32 organFunction;
        uint256 timestamp;
    }

    struct EncryptedSimulation {
        uint256 simulationId;
        uint256 patientId;
        euint32 drugConcentration;
        euint32 deliveryEfficiency;
        euint32 optimalDosage;
        uint256 timestamp;
    }

    uint256 public patientCount;
    uint256 public simulationCount;
    mapping(uint256 => EncryptedPatientModel) public patientModels;
    mapping(uint256 => EncryptedSimulation) public simulations;
    mapping(address => uint256[]) public providerPatients;
    mapping(address => bool) public authorizedProviders;

    event PatientModelCreated(uint256 indexed patientId, address indexed provider, uint256 timestamp);
    event SimulationRequested(uint256 indexed simulationId, uint256 indexed patientId);
    event SimulationCompleted(uint256 indexed simulationId, uint256 timestamp);

    modifier onlyAuthorizedProvider() {
        require(authorizedProviders[msg.sender], "Unauthorized provider");
        _;
    }

    constructor() {
        authorizedProviders[msg.sender] = true;
    }

    function authorizeProvider(address provider) external onlyAuthorizedProvider {
        authorizedProviders[provider] = true;
    }

    function createPatientModel(
        euint32 encryptedBiometrics,
        euint32 encryptedMetabolism,
        euint32 encryptedOrganFunction
    ) external onlyAuthorizedProvider {
        patientCount++;
        uint256 newId = patientCount;

        patientModels[newId] = EncryptedPatientModel({
            patientId: newId,
            healthcareProvider: msg.sender,
            biometricData: encryptedBiometrics,
            metabolismRate: encryptedMetabolism,
            organFunction: encryptedOrganFunction,
            timestamp: block.timestamp
        });

        providerPatients[msg.sender].push(newId);
        emit PatientModelCreated(newId, msg.sender, block.timestamp);
    }

    function requestDrugSimulation(uint256 patientId) external onlyAuthorizedProvider {
        require(patientModels[patientId].healthcareProvider == msg.sender, "Not patient provider");

        simulationCount++;
        uint256 newId = simulationCount;

        bytes32[] memory ciphertexts = new bytes32[](3);
        ciphertexts[0] = FHE.toBytes32(patientModels[patientId].biometricData);
        ciphertexts[1] = FHE.toBytes32(patientModels[patientId].metabolismRate);
        ciphertexts[2] = FHE.toBytes32(patientModels[patientId].organFunction);

        uint256 reqId = FHE.requestDecryption(ciphertexts, this.runSimulation.selector);
        emit SimulationRequested(newId, patientId);
    }

    function runSimulation(
        uint256 requestId,
        bytes memory cleartexts,
        bytes memory proof
    ) external {
        FHE.checkSignatures(requestId, cleartexts, proof);

        euint32[] memory results = abi.decode(cleartexts, (euint32[]));
        
        simulations[requestId] = EncryptedSimulation({
            simulationId: requestId,
            patientId: requestId, // Using requestId as patientId in this simplified version
            drugConcentration: results[0],
            deliveryEfficiency: results[1],
            optimalDosage: results[2],
            timestamp: block.timestamp
        });

        emit SimulationCompleted(requestId, block.timestamp);
    }

    function getPatientModel(uint256 patientId) external view onlyAuthorizedProvider returns (
        euint32, euint32, euint32
    ) {
        EncryptedPatientModel storage model = patientModels[patientId];
        return (model.biometricData, model.metabolismRate, model.organFunction);
    }

    function getSimulationResult(uint256 simulationId) external view onlyAuthorizedProvider returns (
        euint32, euint32, euint32
    ) {
        EncryptedSimulation storage sim = simulations[simulationId];
        return (sim.drugConcentration, sim.deliveryEfficiency, sim.optimalDosage);
    }

    function getProviderPatients(address provider) external view onlyAuthorizedProvider returns (
        uint256[] memory
    ) {
        return providerPatients[provider];
    }
}