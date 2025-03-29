// This script is injected into ChatGPT pages
console.log("ChatGPT Conversation Copier content script loaded!");

// Listen for messages from the popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log("Message received in content script:", request);
  
  if (request.action !== 'copyConversation') {
    sendResponse({ success: false, error: 'Invalid action' });
    return true;
  }

  try {
    console.log("Starting to extract conversation...");
    let formattedText = '';
    let processedMessages = new Set(); // Keep track of processed messages to avoid duplicates
    
    // Different possible selectors based on ChatGPT DOM structure
    // Try to find conversation turns
    
    // Method 1: Modern ChatGPT structure (conversation turns)
    const conversationTurns = document.querySelectorAll('div[data-testid="conversation-turn"], div[data-message-id]');
    console.log("Method 1 found elements:", conversationTurns.length);
    
    if (conversationTurns && conversationTurns.length > 0) {
      console.log("Using method 1 (conversation turns)");
      conversationTurns.forEach((turn, index) => {
        // Use the dedicated function to check if this is a user message
        const isUser = isUserMessage(turn);
        const role = isUser ? 'USER' : 'MODEL';
        
        // Extract message content
        let messageContent = '';

        // Get the direct message container with the data-message-author-role attribute
        const messageElement = turn.querySelector('[data-message-author-role]');
        if (messageElement) {
          // First, try to get a markdown container which holds the formatted content
          const markdownContainer = messageElement.querySelector('.markdown');
          if (markdownContainer) {
            messageContent = extractTextWithFormatting(markdownContainer);
          } else {
            // If no markdown container, extract from the message element itself
            messageContent = extractTextWithFormatting(messageElement);
          }
        } else {
          // Fallback to other content extraction methods
          const contentDiv = turn.querySelector('.markdown') || 
                             turn.querySelector('div[class*="prose"]') || 
                             turn.querySelector('div[class*="whitespace-pre-wrap"]');
          
          if (contentDiv) {
            messageContent = extractTextWithFormatting(contentDiv);
          } else {
            messageContent = extractTextWithFormatting(turn);
          }
        }
        
        // Skip empty or already processed messages
        const messageHash = role + ':' + messageContent.trim();
        if (!messageContent.trim() || processedMessages.has(messageHash)) {
          return;
        }
        
        // Mark as processed to avoid duplicates
        processedMessages.add(messageHash);
        
        // Add to formatted text
        formattedText += '=====================\n';
        formattedText += `${role}:\n`;
        formattedText += `${messageContent.trim()}\n`;
      });
      
      formattedText += '=====================\n';
    } 
    // Method 2: Older ChatGPT structure with flex containers
    else {
      console.log("Trying method 2 (thread containers)");
      // Look for the thread container in various formats
      const threadSelectors = [
        '.flex.flex-col.items-center.text-sm',
        'main .flex-col div.flex-1',
        'div[class*="react-scroll-to-bottom"]',
        'div[class*="conversation-content"]'
      ];
      
      let threadContainer = null;
      for (const selector of threadSelectors) {
        const container = document.querySelector(selector);
        if (container) {
          threadContainer = container;
          console.log("Found thread container with selector:", selector);
          break;
        }
      }
      
      if (!threadContainer) {
        console.log("No thread container found, trying direct message detection");
        // Method 3: Direct messages approach
        const userMessages = document.querySelectorAll('div[class*="dark:bg-gray-800"], div.min-h-[20px].flex.flex-col.items-start.gap-4.whitespace-pre-wrap.break-words');
        const assistantMessages = document.querySelectorAll('div[class*="markdown"], div.min-h-[20px].flex.flex-col.items-start.gap-4.whitespace-pre-wrap');
        
        console.log("Direct detection - User messages:", userMessages.length, "Assistant messages:", assistantMessages.length);
        
        if (userMessages.length > 0 || assistantMessages.length > 0) {
          // Combine all messages in alternating order (assuming they start with user)
          const allMessages = [];
          
          // Find the maximum count of messages
          const maxLength = Math.max(userMessages.length, assistantMessages.length);
          
          // Build an array of messages in the correct order
          for (let i = 0; i < maxLength; i++) {
            if (i < userMessages.length) {
              const content = extractTextWithFormatting(userMessages[i]);
              if (content.trim()) {
                allMessages.push({ role: 'USER', content, node: userMessages[i] });
              }
            }
            
            if (i < assistantMessages.length) {
              const content = extractTextWithFormatting(assistantMessages[i]);
              if (content.trim()) {
                allMessages.push({ role: 'MODEL', content, node: assistantMessages[i] });
              }
            }
          }
          
          // Sort messages based on their position in the DOM for chronological order
          allMessages.sort((a, b) => {
            const aNode = a.node || document.body;
            const bNode = b.node || document.body;
            return aNode.compareDocumentPosition(bNode) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
          });
          
          // Add each unique message to the formatted text
          allMessages.forEach(message => {
            const messageHash = message.role + ':' + message.content.trim();
            if (!processedMessages.has(messageHash)) {
              processedMessages.add(messageHash);
              formattedText += '=====================\n';
              formattedText += `${message.role}:\n`;
              formattedText += `${message.content.trim()}\n`;
            }
          });
          
          formattedText += '=====================\n';
        } else {
          console.log("No messages found with direct detection");
          
          // Method 4: Last resort - try to get any message-like elements
          console.log("Trying method 4 (last resort)");
          
          // Try to find all paragraph elements that might contain messages
          const paragraphs = document.querySelectorAll('p, div[class*="whitespace-pre-wrap"]');
          console.log("Found", paragraphs.length, "potential message paragraphs");
          
          if (paragraphs.length > 0) {
            let isUser = true; // Assume alternating starting with user
            
            paragraphs.forEach((paragraph) => {
              // Skip empty paragraphs
              const content = paragraph.textContent.trim();
              if (!content) return;
              
              const messageHash = (isUser ? 'USER' : 'MODEL') + ':' + content;
              if (!processedMessages.has(messageHash)) {
                processedMessages.add(messageHash);
                formattedText += '=====================\n';
                formattedText += isUser ? 'USER:\n' : 'MODEL:\n';
                formattedText += content + '\n';
              }
              
              isUser = !isUser; // Alternate roles
            });
            
            formattedText += '=====================\n';
          } else {
            // Final fallback: just get all text from the main content area
            const mainContent = document.querySelector('main') || document.body;
            formattedText = 'EXTRACTED CONTENT:\n' + mainContent.textContent.trim();
          }
        }
      } else {
        // Process items in the thread container
        console.log("Processing thread container items");
        
        // Find message groups or individual messages
        const messageGroups = threadContainer.querySelectorAll('div.group, div[class*="message"], div.border-b');
        console.log("Found", messageGroups.length, "message groups");
        
        if (messageGroups.length > 0) {
          messageGroups.forEach((group) => {
            // Try to determine if user or assistant message
            const isUser = isUserMessage(group);
            const role = isUser ? 'USER' : 'MODEL';
            
            // Extract the message content
            let messageContent = '';
            const messageElement = group.querySelector('[data-message-author-role]');
            if (messageElement) {
              // First, try to get a markdown container which holds the formatted content
              const markdownContainer = messageElement.querySelector('.markdown');
              if (markdownContainer) {
                messageContent = extractTextWithFormatting(markdownContainer);
              } else {
                // If no markdown container, extract from the message element itself
                messageContent = extractTextWithFormatting(messageElement);
              }
            } else {
              // Fallback to other content extraction methods
              const contentDiv = group.querySelector('.markdown') || 
                                 group.querySelector('div[class*="prose"]') || 
                                 group.querySelector('div[class*="whitespace-pre-wrap"]');
              
              if (contentDiv) {
                messageContent = extractTextWithFormatting(contentDiv);
              } else {
                messageContent = extractTextWithFormatting(group);
              }
            }
            
            // Skip empty or already processed messages
            const messageHash = role + ':' + messageContent.trim();
            if (!messageContent.trim() || processedMessages.has(messageHash)) {
              return;
            }
            
            // Mark as processed to avoid duplicates
            processedMessages.add(messageHash);
            
            // Add to formatted output
            formattedText += '=====================\n';
            formattedText += `${role}:\n`;
            formattedText += `${messageContent.trim()}\n`;
          });
          
          formattedText += '=====================\n';
        } else {
          sendResponse({ success: false, error: 'No message groups found in thread container' });
          return true;
        }
      }
    }
    
    console.log("Extracted conversation, copying to clipboard...");
    
    // Copy to clipboard using multiple methods for reliability
    copyToClipboard(formattedText)
      .then(() => {
        console.log("Successfully copied to clipboard");
        sendResponse({ success: true });
      })
      .catch((error) => {
        console.error('Failed to copy to clipboard:', error);
        sendResponse({ success: false, error: 'Failed to copy to clipboard: ' + error.message });
      });
    
  } catch (error) {
    console.error('Error extracting conversation:', error);
    sendResponse({ success: false, error: 'Error extracting conversation: ' + error.message });
  }
  
  return true; // Keep the messaging channel open for the async response
});

// Function to identify if an element is a user message by focusing on data-message-author-role
function isUserMessage(element) {
  // First and most reliable method: Check for data-message-author-role directly
  const messageElement = element.querySelector('[data-message-author-role]');
  if (messageElement) {
    const role = messageElement.getAttribute('data-message-author-role');
    return role === 'user';
  }
  
  // Check if the element itself has the role attribute
  if (element.hasAttribute('data-message-author-role')) {
    return element.getAttribute('data-message-author-role') === 'user';
  }
  
  // Fallback to data-testid for conversation turns
  if (element.getAttribute('data-testid') === 'conversation-turn-user') {
    return true;
  }
  
  return false;
}

// Helper function to extract text while preserving formatting
function extractTextWithFormatting(element) {
  let result = '';
  
  try {
    // Special case for markdown containers - directly process their paragraph children
    if (element.classList.contains('markdown') || element.querySelector('.markdown')) {
      const markdownElement = element.classList.contains('markdown') ? element : element.querySelector('.markdown');
      const paragraphs = markdownElement.querySelectorAll('p');
      
      if (paragraphs && paragraphs.length > 0) {
        paragraphs.forEach(p => {
          if (p.textContent.trim()) {
            result += p.textContent.trim() + '\n\n';
          }
        });
        return result.trim();
      }
    }
    
    // Handle code blocks, paragraphs, lists, etc.
    // Only process direct children to avoid processing the same content multiple times
    const childElements = element.children;
    const processedNodes = new Set(); // Track processed nodes to avoid duplication
    
    if (childElements && childElements.length > 0) {
      Array.from(childElements).forEach(child => {
        // Skip if we've already processed this node
        if (processedNodes.has(child)) return;
        processedNodes.add(child);
        
        // Skip empty elements
        if (!child.textContent.trim()) return;
        
        // Check if this is a container that we should process recursively
        if (child.children.length > 0 && 
           (child.tagName.toLowerCase() !== 'pre' && 
            child.tagName.toLowerCase() !== 'code' && 
            child.tagName.toLowerCase() !== 'ul' && 
            child.tagName.toLowerCase() !== 'ol')) {
          // Process container recursively, but avoid markdown containers which we handle specially
          if (!child.classList.contains('markdown') && !child.querySelector('.markdown')) {
            result += extractTextWithFormatting(child);
          } else {
            // For markdown containers, use the special handling
            const markdownElement = child.classList.contains('markdown') ? child : child.querySelector('.markdown');
            result += extractTextWithFormatting(markdownElement);
          }
        } else {
          // For code blocks
          if (child.tagName.toLowerCase() === 'pre' || child.tagName.toLowerCase() === 'code') {
            result += '```\n' + child.textContent.trim() + '\n```\n\n';
          }
          // For lists
          else if (child.tagName.toLowerCase() === 'ul' || child.tagName.toLowerCase() === 'ol') {
            // Process list items
            const listItems = child.querySelectorAll('li');
            listItems.forEach(li => {
              processedNodes.add(li); // Mark as processed
              result += '- ' + li.textContent.trim() + '\n';
            });
            result += '\n';
          }
          // For list items
          else if (child.tagName.toLowerCase() === 'li') {
            result += '- ' + child.textContent.trim() + '\n';
          }
          // For headings
          else if (['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(child.tagName.toLowerCase())) {
            const headingLevel = child.tagName.toLowerCase().charAt(1);
            const headingPrefix = '#'.repeat(parseInt(headingLevel));
            result += headingPrefix + ' ' + child.textContent.trim() + '\n\n';
          }
          // For paragraphs and other elements
          else {
            result += child.textContent.trim() + '\n\n';
          }
        }
      });
    } else {
      // If no children, just get the text content
      result = element.textContent.trim();
    }
  } catch (error) {
    console.error('Error extracting text:', error);
    // Fallback
    result = element.textContent || '';
  }
  
  return result.trim();
}

// Helper function to copy text to clipboard with fallbacks
function copyToClipboard(text) {
  return new Promise((resolve, reject) => {
    // Try the modern Clipboard API first
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text)
        .then(resolve)
        .catch((err) => {
          console.warn("Clipboard API failed, trying fallback method", err);
          // Try fallback method
          try {
            fallbackCopyToClipboard(text);
            resolve();
          } catch (fallbackErr) {
            reject(fallbackErr);
          }
        });
    } else {
      // If Clipboard API not available, try fallback
      try {
        fallbackCopyToClipboard(text);
        resolve();
      } catch (err) {
        reject(err);
      }
    }
  });
}

// Fallback method using execCommand
function fallbackCopyToClipboard(text) {
  // Create a temporary textarea element
  const textArea = document.createElement("textarea");
  textArea.value = text;
  
  // Make the textarea out of viewport
  textArea.style.position = "fixed";
  textArea.style.left = "-999999px";
  textArea.style.top = "-999999px";
  
  document.body.appendChild(textArea);
  textArea.focus();
  textArea.select();
  
  let success = false;
  try {
    // Execute the copy command
    success = document.execCommand('copy');
    if (!success) {
      throw new Error('Copy command failed');
    }
  } catch (err) {
    console.error("fallbackCopyToClipboard failed", err);
    throw err;
  } finally {
    // Cleanup
    document.body.removeChild(textArea);
  }
}
