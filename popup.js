document.addEventListener('DOMContentLoaded', function() {
  const copyButton = document.getElementById('copyButton');
  const statusDiv = document.getElementById('status');
  const previewDiv = document.getElementById('preview');
  const formatToggle = document.getElementById('formatToggle');
  const frameToggle = document.getElementById('frameToggle');
  const userToggle = document.getElementById('userToggle');
  const modelToggle = document.getElementById('modelToggle');
  
  // Function to update preview
  async function updatePreview() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      // Check if we're on a ChatGPT page
      const isChatGPT = tab.url.includes('chat.openai.com') || tab.url.includes('chatgpt.com');
      
      if (!isChatGPT) {
        previewDiv.textContent = 'Not on ChatGPT';
        return;
      }
      
      // Try to get preview
      chrome.tabs.sendMessage(tab.id, { 
        action: 'previewConversation',
        includeFormatting: formatToggle.checked,
        useSeparatorFrames: frameToggle.checked,
        includeUserMessages: userToggle.checked,
        includeModelMessages: modelToggle.checked
      }, (response) => {
        if (chrome.runtime.lastError || !response || !response.success) {
          previewDiv.textContent = '';
          return;
        }
        
        if (response.lineCount === 0) {
          previewDiv.textContent = 'No messages to copy';
        } else {
          previewDiv.textContent = `${response.lineCount} lines, ${response.wordCount} words`;
        }
      });
    } catch (error) {
      previewDiv.textContent = '';
    }
  }
  
  // Load saved toggle states from storage
  chrome.storage.sync.get(['includeFormatting', 'useSeparatorFrames', 'includeUserMessages', 'includeModelMessages'], function(data) {
    formatToggle.checked = data.includeFormatting !== undefined ? data.includeFormatting : false;
    frameToggle.checked = data.useSeparatorFrames !== undefined ? data.useSeparatorFrames : true;
    userToggle.checked = data.includeUserMessages !== undefined ? data.includeUserMessages : true;
    modelToggle.checked = data.includeModelMessages !== undefined ? data.includeModelMessages : true;
    
    // Update preview after loading settings
    updatePreview();
  });
  
  // Save toggle states when changed
  formatToggle.addEventListener('change', function() {
    chrome.storage.sync.set({
      includeFormatting: formatToggle.checked
    });
    updatePreview();
  });
  
  frameToggle.addEventListener('change', function() {
    chrome.storage.sync.set({
      useSeparatorFrames: frameToggle.checked
    });
    updatePreview();
  });
  
  userToggle.addEventListener('change', function() {
    chrome.storage.sync.set({
      includeUserMessages: userToggle.checked
    });
    updatePreview();
  });
  
  modelToggle.addEventListener('change', function() {
    chrome.storage.sync.set({
      includeModelMessages: modelToggle.checked
    });
    updatePreview();
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
          includeFormatting: formatToggle.checked,
          useSeparatorFrames: frameToggle.checked,
          includeUserMessages: userToggle.checked,
          includeModelMessages: modelToggle.checked
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
            // Create a descriptive message with counts
            let message = 'Conversation copied!';
            if (result.lineCount !== undefined && result.wordCount !== undefined) {
              message = `Copied ${result.lineCount} lines (${result.wordCount} words)`;
            }
            setStatus(message);
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
