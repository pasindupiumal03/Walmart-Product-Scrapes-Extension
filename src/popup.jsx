import React, { useState, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { validateGoogleSheetsUrl } from "./utils/validators.js";
import "./index.css";

/**
 * Main Popup Component for Walmart Listing Generator
 * Features:
 * - Google Sheets URL input
 * - GAS endpoint configuration
 * - Generate Listings button
 * - Real-time progress display
 * - Row-by-row status log
 */
function Popup() {
  // State management
  const [sheetUrl, setSheetUrl] = useState('');
  const [gasEndpoint, setGasEndpoint] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [currentJobId, setCurrentJobId] = useState(null);
  const [logs, setLogs] = useState([]);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState({ current: 0, total: 0 });

  // Load saved settings on mount
  useEffect(() => {
    loadSettings();
  }, []);

  // Poll job status when generation is active
  useEffect(() => {
    if (isGenerating && currentJobId) {
      startPolling();
    }
  }, [isGenerating, currentJobId]);

  /**
   * Load saved settings from storage
   */
  const loadSettings = async () => {
    try {
      const result = await chrome.storage.local.get(['gasEndpoint', 'sheetUrl']);
      if (result.gasEndpoint) setGasEndpoint(result.gasEndpoint);
      if (result.sheetUrl) setSheetUrl(result.sheetUrl);
    } catch (err) {
      console.error('Error loading settings:', err);
    }
  };

  /**
   * Save settings to storage
   */
  const handleSaveSettings = async () => {
    try {
      await chrome.storage.local.set({
        gasEndpoint,
        sheetUrl
      });
      addLog('Settings saved!', 'success');
      // Pass the endpoint to background for internal use
      chrome.runtime.sendMessage({
        action: 'SAVE_GAS_ENDPOINT',
        data: { gasEndpoint }
      });
    } catch (err) {
      console.error('Error saving settings:', err);
      addLog('Failed to save settings', 'error');
    }
  };

  /**
   * Add log entry to display
   */
  const addLog = (message, type = 'info') => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs((prev) => [...prev, { message, type, timestamp }]);
  };

  /**
   * Validate inputs before starting generation
   */
  const validateInputs = () => {
    setError('');

    // Validate Google Sheets URL
    const sheetValidation = validateGoogleSheetsUrl(sheetUrl);
    if (!sheetValidation.valid) {
      setError(sheetValidation.error);
      return false;
    }

    // Validate GAS endpoint
    if (!gasEndpoint || !gasEndpoint.startsWith('https://script.google.com/')) {
      setError('Invalid Google Apps Script endpoint URL');
      return false;
    }

    return true;
  };

  /**
   * Start listing generation
   */
  const handleGenerate = async () => {
    if (!validateInputs()) {
      return;
    }

    setIsGenerating(true);
    setLogs([]);
    setError('');
    setProgress({ current: 0, total: 0 });

    // Save settings automatically on run
    await handleSaveSettings();

    addLog('Starting listing generation...', 'info');

    try {
      // Send message to background script to start generation
      const response = await chrome.runtime.sendMessage({
        action: 'START_GENERATION',
        data: {
          sheetUrl: sheetUrl,
          gasEndpoint: gasEndpoint,
        },
      });

      if (response.success && response.jobId) {
        setCurrentJobId(response.jobId);
        addLog(`Job started with ID: ${response.jobId}`, 'success');
      } else {
        throw new Error(response.error || 'Failed to start generation');
      }
    } catch (err) {
      console.error('Error starting generation:', err);
      setError(err.message);
      addLog(`Error: ${err.message}`, 'error');
      setIsGenerating(false);
    }
  };

  /**
   * Poll job status every 5 seconds
   */
  /**
   * Status polling is disabled for Client-Side flow.
   * Background script handles the queue and logging to console.
   */
  const startPolling = () => {
    // No-op for now to prevent errors
    return () => { };
  };

  /**
   * Reset form and state
   */
  const handleReset = async () => {
    // Clear State
    setSheetUrl('');
    setGasEndpoint('');
    setIsGenerating(false);
    setCurrentJobId(null);
    setLogs([]);
    setError('');
    setProgress({ current: 0, total: 0 });

    // Clear Storage ('until reset')
    try {
      await chrome.storage.local.remove(['sheetUrl', 'gasEndpoint']);
      addLog('Settings cleared from storage.', 'info');
    } catch (e) {
      console.error('Error clearing storage:', e);
    }
  };

  return (
    <div className="popup-container">
      <div className="popup-header">
        <h1>Walmart Listing Generator</h1>
        <p className="popup-subtitle">Automate product listings with AI</p>
      </div>

      <div className="popup-content">
        {/* GAS Endpoint Input */}
        <div className="input-group">
          <label htmlFor="gas-endpoint">Google Apps Script Endpoint</label>
          <input
            id="gas-endpoint"
            type="text"
            value={gasEndpoint}
            onChange={(e) => setGasEndpoint(e.target.value)}
            placeholder="https://script.google.com/macros/s/.../exec"
            disabled={isGenerating}
            className="input-field"
          />
          <span className="input-hint">Your GAS Web App deployment URL</span>
        </div>

        {/* Google Sheets URL Input */}
        <div className="input-group">
          <label htmlFor="sheet-url">Google Sheets URL</label>
          <input
            id="sheet-url"
            type="text"
            value={sheetUrl}
            onChange={(e) => setSheetUrl(e.target.value)}
            placeholder="https://docs.google.com/spreadsheets/d/..."
            disabled={isGenerating}
            className="input-field"
          />
          <span className="input-hint">Sheet with product URLs in Column A</span>
        </div>

        {/* Error Display */}
        {error && (
          <div className="error-message">
            <span>⚠️ {error}</span>
          </div>
        )}

        {/* Progress Display */}
        {isGenerating && progress.total > 0 && (
          <div className="progress-container">
            <div className="progress-text">
              Processing: {progress.current} / {progress.total}
            </div>
            <div className="progress-bar">
              <div
                className="progress-bar-fill"
                style={{
                  width: `${(progress.current / progress.total) * 100}%`,
                }}
              ></div>
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="button-group">
          <button
            onClick={handleSaveSettings}
            disabled={isGenerating}
            className="btn btn-secondary"
            style={{ marginRight: '8px' }}
          >
            Save Settings
          </button>

          <button
            onClick={handleGenerate}
            disabled={isGenerating || !sheetUrl || !gasEndpoint}
            className="btn btn-primary"
          >
            {isGenerating ? 'Generating...' : 'Generate Listings'}
          </button>

          {!isGenerating && logs.length > 0 && (
            <button onClick={handleReset} className="btn btn-secondary">
              Reset
            </button>
          )}
        </div>

        {/* Status Log */}
        {logs.length > 0 && (
          <div className="log-container">
            <div className="log-header">Status Log</div>
            <div className="log-content">
              {logs.map((log, index) => (
                <div key={index} className={`log-entry log-${log.type}`}>
                  <span className="log-timestamp">{log.timestamp}</span>
                  <span className="log-message">{log.message}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="popup-footer">
        <span className="footer-text">
          Powered by Google Apps Script + OpenAI
        </span>
      </div>
    </div>
  );
}

const root = createRoot(document.getElementById("react-target"));
root.render(<Popup />);
