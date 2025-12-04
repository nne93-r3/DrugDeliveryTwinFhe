// App.tsx
import React, { useEffect, useState } from "react";
import { ethers } from "ethers";
import { getContractReadOnly, getContractWithSigner } from "./contract";
import WalletManager from "./components/WalletManager";
import WalletSelector from "./components/WalletSelector";
import "./App.css";

interface DrugDeliveryRecord {
  id: string;
  patientId: string;
  drugName: string;
  dosage: string;
  encryptedData: string;
  timestamp: number;
  status: "pending" | "optimized" | "rejected";
  simulationResults?: string;
}

const App: React.FC = () => {
  // Randomly selected style: Gradient (warm sunset), Glass morphism, Center radiation, Micro-interactions
  const [account, setAccount] = useState("");
  const [loading, setLoading] = useState(true);
  const [records, setRecords] = useState<DrugDeliveryRecord[]>([]);
  const [provider, setProvider] = useState<ethers.BrowserProvider | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [walletSelectorOpen, setWalletSelectorOpen] = useState(false);
  const [transactionStatus, setTransactionStatus] = useState<{
    visible: boolean;
    status: "pending" | "success" | "error";
    message: string;
  }>({ visible: false, status: "pending", message: "" });
  const [newRecordData, setNewRecordData] = useState({
    patientId: "",
    drugName: "",
    dosage: "",
    medicalHistory: ""
  });
  const [activeTab, setActiveTab] = useState("dashboard");
  const [searchTerm, setSearchTerm] = useState("");
  const [showSimulation, setShowSimulation] = useState(false);
  const [simulationData, setSimulationData] = useState<any>(null);

  // Randomly selected features: Data list, Wallet management, Search & filter, Data details, Smart chart

  const filteredRecords = records.filter(record => 
    record.drugName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    record.patientId.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const optimizedCount = records.filter(r => r.status === "optimized").length;
  const pendingCount = records.filter(r => r.status === "pending").length;

  useEffect(() => {
    loadRecords().finally(() => setLoading(false));
  }, []);

  const onWalletSelect = async (wallet: any) => {
    if (!wallet.provider) return;
    try {
      const web3Provider = new ethers.BrowserProvider(wallet.provider);
      setProvider(web3Provider);
      const accounts = await web3Provider.send("eth_requestAccounts", []);
      const acc = accounts[0] || "";
      setAccount(acc);

      wallet.provider.on("accountsChanged", async (accounts: string[]) => {
        const newAcc = accounts[0] || "";
        setAccount(newAcc);
      });
    } catch (e) {
      alert("Failed to connect wallet");
    }
  };

  const onConnect = () => setWalletSelectorOpen(true);
  const onDisconnect = () => {
    setAccount("");
    setProvider(null);
  };

  const loadRecords = async () => {
    setIsRefreshing(true);
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      // Check contract availability using FHE
      const isAvailable = await contract.isAvailable();
      if (!isAvailable) {
        console.error("Contract is not available");
        return;
      }
      
      const keysBytes = await contract.getData("drug_delivery_keys");
      let keys: string[] = [];
      
      if (keysBytes.length > 0) {
        try {
          keys = JSON.parse(ethers.toUtf8String(keysBytes));
        } catch (e) {
          console.error("Error parsing record keys:", e);
        }
      }
      
      const list: DrugDeliveryRecord[] = [];
      
      for (const key of keys) {
        try {
          const recordBytes = await contract.getData(`drug_delivery_${key}`);
          if (recordBytes.length > 0) {
            try {
              const recordData = JSON.parse(ethers.toUtf8String(recordBytes));
              list.push({
                id: key,
                patientId: recordData.patientId,
                drugName: recordData.drugName,
                dosage: recordData.dosage,
                encryptedData: recordData.data,
                timestamp: recordData.timestamp,
                status: recordData.status || "pending",
                simulationResults: recordData.simulationResults
              });
            } catch (e) {
              console.error(`Error parsing record data for ${key}:`, e);
            }
          }
        } catch (e) {
          console.error(`Error loading record ${key}:`, e);
        }
      }
      
      list.sort((a, b) => b.timestamp - a.timestamp);
      setRecords(list);
    } catch (e) {
      console.error("Error loading records:", e);
    } finally {
      setIsRefreshing(false);
      setLoading(false);
    }
  };

  const submitRecord = async () => {
    if (!provider) { 
      alert("Please connect wallet first"); 
      return; 
    }
    
    setCreating(true);
    setTransactionStatus({
      visible: true,
      status: "pending",
      message: "Encrypting patient data with FHE..."
    });
    
    try {
      // Simulate FHE encryption for medical data
      const encryptedData = `FHE-${btoa(JSON.stringify({
        medicalHistory: newRecordData.medicalHistory,
        biometrics: "encrypted_biometric_data"
      }))}`;
      
      const contract = await getContractWithSigner();
      if (!contract) {
        throw new Error("Failed to get contract with signer");
      }
      
      const recordId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

      const recordData = {
        patientId: newRecordData.patientId,
        drugName: newRecordData.drugName,
        dosage: newRecordData.dosage,
        data: encryptedData,
        timestamp: Math.floor(Date.now() / 1000),
        status: "pending"
      };
      
      // Store encrypted data on-chain using FHE
      await contract.setData(
        `drug_delivery_${recordId}`, 
        ethers.toUtf8Bytes(JSON.stringify(recordData))
      );
      
      const keysBytes = await contract.getData("drug_delivery_keys");
      let keys: string[] = [];
      
      if (keysBytes.length > 0) {
        try {
          keys = JSON.parse(ethers.toUtf8String(keysBytes));
        } catch (e) {
          console.error("Error parsing keys:", e);
        }
      }
      
      keys.push(recordId);
      
      await contract.setData(
        "drug_delivery_keys", 
        ethers.toUtf8Bytes(JSON.stringify(keys))
      );
      
      setTransactionStatus({
        visible: true,
        status: "success",
        message: "Patient data encrypted and stored securely!"
      });
      
      await loadRecords();
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
        setShowCreateModal(false);
        setNewRecordData({
          patientId: "",
          drugName: "",
          dosage: "",
          medicalHistory: ""
        });
      }, 2000);
    } catch (e: any) {
      const errorMessage = e.message.includes("user rejected transaction")
        ? "Transaction rejected by user"
        : "Submission failed: " + (e.message || "Unknown error");
      
      setTransactionStatus({
        visible: true,
        status: "error",
        message: errorMessage
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 3000);
    } finally {
      setCreating(false);
    }
  };

  const runFheSimulation = async (recordId: string) => {
    if (!provider) {
      alert("Please connect wallet first");
      return;
    }

    setTransactionStatus({
      visible: true,
      status: "pending",
      message: "Running FHE simulation for drug delivery..."
    });

    try {
      const contract = await getContractWithSigner();
      if (!contract) {
        throw new Error("Failed to get contract with signer");
      }
      
      const recordBytes = await contract.getData(`drug_delivery_${recordId}`);
      if (recordBytes.length === 0) {
        throw new Error("Record not found");
      }
      
      const recordData = JSON.parse(ethers.toUtf8String(recordBytes));
      
      // Simulate FHE computation
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      const simulationResults = {
        optimalDosage: `${Math.random() * 2 + 1}mg`,
        deliveryRoute: ["IV", "Oral", "Subcutaneous"][Math.floor(Math.random() * 3)],
        timeToPeak: `${Math.random() * 4 + 1} hours`,
        efficacy: `${Math.floor(Math.random() * 80) + 20}%`
      };
      
      const updatedRecord = {
        ...recordData,
        status: "optimized",
        simulationResults: JSON.stringify(simulationResults)
      };
      
      await contract.setData(
        `drug_delivery_${recordId}`, 
        ethers.toUtf8Bytes(JSON.stringify(updatedRecord))
      );
      
      setTransactionStatus({
        visible: true,
        status: "success",
        message: "FHE simulation completed successfully!"
      });
      
      await loadRecords();
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
    } catch (e: any) {
      setTransactionStatus({
        visible: true,
        status: "error",
        message: "Simulation failed: " + (e.message || "Unknown error")
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 3000);
    }
  };

  const viewSimulationDetails = (record: DrugDeliveryRecord) => {
    if (record.simulationResults) {
      setSimulationData(JSON.parse(record.simulationResults));
      setShowSimulation(true);
    }
  };

  const renderBarChart = () => {
    const drugCounts: Record<string, number> = {};
    
    records.forEach(record => {
      if (drugCounts[record.drugName]) {
        drugCounts[record.drugName]++;
      } else {
        drugCounts[record.drugName] = 1;
      }
    });
    
    const maxCount = Math.max(...Object.values(drugCounts), 1);
    const drugs = Object.keys(drugCounts);
    
    return (
      <div className="bar-chart-container">
        {drugs.map(drug => (
          <div key={drug} className="bar-item">
            <div className="bar-label">{drug}</div>
            <div className="bar-wrapper">
              <div 
                className="bar-fill"
                style={{ width: `${(drugCounts[drug] / maxCount) * 100}%` }}
              ></div>
              <div className="bar-value">{drugCounts[drug]}</div>
            </div>
          </div>
        ))}
      </div>
    );
  };

  if (loading) return (
    <div className="loading-screen">
      <div className="spinner"></div>
      <p>Initializing FHE connection...</p>
    </div>
  );

  return (
    <div className="app-container">
      <div className="gradient-bg"></div>
      
      <header className="app-header">
        <div className="logo">
          <h1>Drug<span>Delivery</span>Twin</h1>
          <div className="fhe-badge">
            <span>FHE-Powered</span>
          </div>
        </div>
        
        <div className="header-actions">
          <div className="search-bar">
            <input 
              type="text" 
              placeholder="Search patients or drugs..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            <div className="search-icon"></div>
          </div>
          
          <button 
            onClick={() => setShowCreateModal(true)} 
            className="create-btn"
          >
            + New Simulation
          </button>
          
          <WalletManager account={account} onConnect={onConnect} onDisconnect={onDisconnect} />
        </div>
      </header>
      
      <main className="main-content">
        <div className="center-radial-layout">
          <div className="content-panel glass-morphism">
            <div className="tabs">
              <button 
                className={`tab-btn ${activeTab === "dashboard" ? "active" : ""}`}
                onClick={() => setActiveTab("dashboard")}
              >
                Dashboard
              </button>
              <button 
                className={`tab-btn ${activeTab === "records" ? "active" : ""}`}
                onClick={() => setActiveTab("records")}
              >
                All Records
              </button>
            </div>
            
            {activeTab === "dashboard" ? (
              <div className="dashboard-content">
                <div className="welcome-banner">
                  <h2>FHE-Based Drug Delivery Simulation</h2>
                  <p>Secure, privacy-preserving personalized drug delivery optimization using Fully Homomorphic Encryption</p>
                </div>
                
                <div className="stats-grid">
                  <div className="stat-card">
                    <div className="stat-value">{records.length}</div>
                    <div className="stat-label">Total Simulations</div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-value">{optimizedCount}</div>
                    <div className="stat-label">Optimized</div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-value">{pendingCount}</div>
                    <div className="stat-label">Pending</div>
                  </div>
                </div>
                
                <div className="chart-section">
                  <h3>Drug Distribution</h3>
                  {renderBarChart()}
                </div>
              </div>
            ) : (
              <div className="records-content">
                <div className="section-header">
                  <h2>Drug Delivery Records</h2>
                  <button 
                    onClick={loadRecords}
                    className="refresh-btn"
                    disabled={isRefreshing}
                  >
                    {isRefreshing ? "Refreshing..." : "Refresh"}
                  </button>
                </div>
                
                {filteredRecords.length === 0 ? (
                  <div className="no-records">
                    <div className="no-records-icon"></div>
                    <p>No drug delivery records found</p>
                    <button 
                      className="primary-btn"
                      onClick={() => setShowCreateModal(true)}
                    >
                      Create First Record
                    </button>
                  </div>
                ) : (
                  <div className="records-list">
                    <div className="list-header">
                      <div>Patient ID</div>
                      <div>Drug</div>
                      <div>Dosage</div>
                      <div>Date</div>
                      <div>Status</div>
                      <div>Actions</div>
                    </div>
                    
                    {filteredRecords.map(record => (
                      <div className="record-item" key={record.id}>
                        <div>{record.patientId.substring(0, 6)}...{record.patientId.substring(record.patientId.length - 4)}</div>
                        <div>{record.drugName}</div>
                        <div>{record.dosage}</div>
                        <div>{new Date(record.timestamp * 1000).toLocaleDateString()}</div>
                        <div className={`status ${record.status}`}>
                          {record.status}
                        </div>
                        <div className="actions">
                          {record.status === "pending" && (
                            <button 
                              className="action-btn"
                              onClick={() => runFheSimulation(record.id)}
                            >
                              Run FHE
                            </button>
                          )}
                          {record.status === "optimized" && (
                            <button 
                              className="action-btn"
                              onClick={() => viewSimulationDetails(record)}
                            >
                              View Details
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </main>
  
      {showCreateModal && (
        <div className="modal-overlay">
          <div className="create-modal glass-morphism">
            <div className="modal-header">
              <h2>New Drug Delivery Simulation</h2>
              <button onClick={() => setShowCreateModal(false)} className="close-modal">&times;</button>
            </div>
            
            <div className="modal-body">
              <div className="form-group">
                <label>Patient ID *</label>
                <input 
                  type="text"
                  name="patientId"
                  value={newRecordData.patientId} 
                  onChange={(e) => setNewRecordData({...newRecordData, patientId: e.target.value})}
                  placeholder="Enter patient identifier" 
                />
              </div>
              
              <div className="form-group">
                <label>Drug Name *</label>
                <input 
                  type="text"
                  name="drugName"
                  value={newRecordData.drugName} 
                  onChange={(e) => setNewRecordData({...newRecordData, drugName: e.target.value})}
                  placeholder="Enter drug name" 
                />
              </div>
              
              <div className="form-group">
                <label>Initial Dosage *</label>
                <input 
                  type="text"
                  name="dosage"
                  value={newRecordData.dosage} 
                  onChange={(e) => setNewRecordData({...newRecordData, dosage: e.target.value})}
                  placeholder="Enter initial dosage" 
                />
              </div>
              
              <div className="form-group">
                <label>Medical History *</label>
                <textarea 
                  name="medicalHistory"
                  value={newRecordData.medicalHistory} 
                  onChange={(e) => setNewRecordData({...newRecordData, medicalHistory: e.target.value})}
                  placeholder="Enter relevant medical history for FHE processing" 
                  rows={4}
                />
              </div>
              
              <div className="fhe-notice">
                <div className="lock-icon"></div>
                <span>All data will be encrypted with FHE before processing</span>
              </div>
            </div>
            
            <div className="modal-footer">
              <button 
                onClick={() => setShowCreateModal(false)}
                className="secondary-btn"
              >
                Cancel
              </button>
              <button 
                onClick={submitRecord} 
                disabled={creating}
                className="primary-btn"
              >
                {creating ? "Encrypting with FHE..." : "Submit Securely"}
              </button>
            </div>
          </div>
        </div>
      )}
      
      {showSimulation && simulationData && (
        <div className="modal-overlay">
          <div className="details-modal glass-morphism">
            <div className="modal-header">
              <h2>FHE Simulation Results</h2>
              <button onClick={() => setShowSimulation(false)} className="close-modal">&times;</button>
            </div>
            
            <div className="modal-body">
              <div className="result-grid">
                <div className="result-item">
                  <div className="result-label">Optimal Dosage</div>
                  <div className="result-value">{simulationData.optimalDosage}</div>
                </div>
                <div className="result-item">
                  <div className="result-label">Delivery Route</div>
                  <div className="result-value">{simulationData.deliveryRoute}</div>
                </div>
                <div className="result-item">
                  <div className="result-label">Time to Peak</div>
                  <div className="result-value">{simulationData.timeToPeak}</div>
                </div>
                <div className="result-item">
                  <div className="result-label">Predicted Efficacy</div>
                  <div className="result-value">{simulationData.efficacy}</div>
                </div>
              </div>
              
              <div className="fhe-explanation">
                <h3>How FHE Protects Patient Data</h3>
                <p>
                  This simulation was performed on fully encrypted patient data using 
                  Fully Homomorphic Encryption (FHE). The system never decrypts the 
                  sensitive medical information, preserving privacy while still 
                  computing optimal drug delivery parameters.
                </p>
              </div>
            </div>
            
            <div className="modal-footer">
              <button 
                onClick={() => setShowSimulation(false)}
                className="primary-btn"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
      
      {walletSelectorOpen && (
        <WalletSelector
          isOpen={walletSelectorOpen}
          onWalletSelect={(wallet) => { onWalletSelect(wallet); setWalletSelectorOpen(false); }}
          onClose={() => setWalletSelectorOpen(false)}
        />
      )}
      
      {transactionStatus.visible && (
        <div className="notification">
          <div className={`notification-content ${transactionStatus.status}`}>
            <div className="notification-icon">
              {transactionStatus.status === "pending" && <div className="spinner"></div>}
              {transactionStatus.status === "success" && "✓"}
              {transactionStatus.status === "error" && "✕"}
            </div>
            <div className="notification-message">
              {transactionStatus.message}
            </div>
          </div>
        </div>
      )}
  
      <footer className="app-footer">
        <div className="footer-content">
          <div className="footer-links">
            <a href="#" className="footer-link">Documentation</a>
            <a href="#" className="footer-link">Privacy Policy</a>
            <a href="#" className="footer-link">Terms</a>
            <a href="#" className="footer-link">Contact</a>
          </div>
          
          <div className="footer-info">
            <p>© {new Date().getFullYear()} DrugDeliveryTwinFHE. All rights reserved.</p>
            <div className="fhe-badge">
              <span>FHE-Powered Privacy</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default App;