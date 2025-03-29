document.addEventListener('DOMContentLoaded', function() {
  const copyButton = document.getElementById('copyButton');
  const statusDiv = document.getElementById('status');
  const formatToggle = document.getElementById('formatToggle');
  
  // Load saved toggle state from storage
  chrome.storage.sync.get('includeFormatting', function(data) {
    formatToggle.checked = data.includeFormatting !== undefined ? data.includeFormatting : false;
  });
  
  // Save toggle state when changed
  formatToggle.addEventListener('change', function() {
    chrome.storage.sync.set({
      includeFormatting: formatToggle.checked
    });
  });
  
  // Set status message with optional auto-clear
  function setStatus(message, isError = false, autoClear = true) {
    statusDiv.textContent = message;
    statusDiv.className = isError ? 'error' : 'success';
    
    if (autoClear) {
      setTimeout(() => { 
        statusDiv.textContent = ''; 
        statusDiv.className = '';
      }, 3000);
    }
  }
  
  copyButton.addEventListener('click', async () => {
    // Show loading state
    copyButton.disabled = true;
    setStatus('Copying...', false, false);
    
    try {
      // Get the active tab
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      // Check if we're on a ChatGPT page
      const isChatGPT = tab.url.includes('chat.openai.com') || tab.url.includes('chatgpt.com');
      
      if (!isChatGPT) {
        setStatus('Error: Not on ChatGPT', true);
        copyButton.disabled = false;
        return;
      }
      
      // Make sure the ChatGPT tab is focused to help with clipboard permissions
      await chrome.tabs.update(tab.id, { active: true });
      
      // Inject the content script first to ensure it's available
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['content.js']
        });
        console.log("Content script injected successfully");
      } catch (injectionError) {
        console.error("Failed to inject content script:", injectionError);
        // Continue anyway, as the content script might already be there
      }
      
      // Send message to content script with timeout handling
      const messagePromise = new Promise((resolve, reject) => {
        chrome.tabs.sendMessage(tab.id, { 
          action: 'copyConversation',
          includeFormatting: formatToggle.checked
        }, (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          resolve(response);
        });
        
        // Set a timeout in case the message doesn't get a response
        setTimeout(() => {
          reject(new Error('Timeout waiting for content script response'));
        }, 5000);
      });
      
      messagePromise
        .then(result => {
          if (result && result.success) {
            setStatus('Conversation copied!');
          } else {
            setStatus(result && result.error ? `Error: ${result.error}` : 'Error: No response from page', true);
          }
        })
        .catch(error => {
          console.error('Error:', error);
          setStatus('Error: Could not communicate with page. Try refreshing.', true);
        })
        .finally(() => {
          copyButton.disabled = false;
        });
    } catch (error) {
      console.error('Error:', error);
      setStatus('Error: Could not copy conversation', true);
      copyButton.disabled = false;
    }
  });
});
