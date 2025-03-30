// This script is injected into ChatGPT pages
console.log("ChatGPT Conversation Copier content script loaded!");

// Listen for messages from the popup
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  if (request.action === 'copyConversation') {
    try {
      // Extract the conversation based on toggle states
      const formattedText = extractConversation(request.includeFormatting, request.useSeparatorFrames);
      
      // Copy to clipboard
      const textArea = document.createElement('textarea');
      textArea.value = formattedText;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      
      sendResponse({success: true});
    } catch (error) {
      console.error('Error copying conversation:', error);
      sendResponse({success: false, error: error.message});
    }
  }
  return true; // Keep the messaging channel open for the async response
});

// Function to identify if an element is a user message
function isUserMessage(element) {
  // Check for message element with data-message-author-role attribute
  const messageElement = element.querySelector('[data-message-author-role="user"]');
  if (messageElement) {
    return true;
  }
  
  // Check if the element itself has the role attribute
  if (element.getAttribute('data-message-author-role') === 'user') {
    return true;
  }
  
  // Fallback to data-testid
  if (element.getAttribute('data-testid') === 'conversation-turn-user') {
    return true;
  }
  
  return false;
}

// Extract text with or without formatting based on the toggle state
function extractTextWithFormatting(element, preserveFormatting = false) {
  if (!element) return '';
  
  // If we don't want to preserve formatting, just get the text content
  if (!preserveFormatting) {
    return element.textContent.trim();
  }
  
  // Otherwise, convert the HTML content to Markdown-like text
  let result = '';
  
  // Process child nodes to maintain formatting
  for (const node of element.childNodes) {
    if (node.nodeType === Node.TEXT_NODE) {
      result += node.textContent;
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const tagName = node.tagName.toLowerCase();
      
      // Handle different formatting tags
      if (tagName === 'p') {
        const innerText = extractTextWithFormatting(node, true);
        result += innerText + '\n\n';
      } else if (tagName === 'br') {
        result += '\n';
      } else if (tagName === 'strong' || tagName === 'b') {
        result += '**' + extractTextWithFormatting(node, true) + '**';
      } else if (tagName === 'em' || tagName === 'i') {
        result += '_' + extractTextWithFormatting(node, true) + '_';
      } else if (tagName === 'code') {
        // Inline code
        if (node.parentElement && node.parentElement.tagName.toLowerCase() !== 'pre') {
          result += '`' + node.textContent + '`';
        } else {
          result += node.textContent;
        }
      } else if (tagName === 'pre') {
        // Code block
        result += '```\n' + node.textContent + '\n```\n\n';
      } else if (tagName === 'ul') {
        const items = Array.from(node.querySelectorAll('li')).map(li => 
          '- ' + extractTextWithFormatting(li, true)
        ).join('\n');
        result += items + '\n\n';
      } else if (tagName === 'ol') {
        const items = Array.from(node.querySelectorAll('li')).map((li, index) => 
          (index + 1) + '. ' + extractTextWithFormatting(li, true)
        ).join('\n');
        result += items + '\n\n';
      } else if (tagName === 'a') {
        const url = node.getAttribute('href');
        result += '[' + node.textContent + '](' + url + ')';
      } else if (tagName === 'h1') {
        result += '# ' + extractTextWithFormatting(node, true) + '\n\n';
      } else if (tagName === 'h2') {
        result += '## ' + extractTextWithFormatting(node, true) + '\n\n';
      } else if (tagName === 'h3') {
        result += '### ' + extractTextWithFormatting(node, true) + '\n\n';
      } else if (tagName === 'blockquote') {
        const lines = extractTextWithFormatting(node, true).split('\n');
        result += lines.map(line => '> ' + line).join('\n') + '\n\n';
      } else if (tagName === 'hr') {
        result += '---\n\n';
      } else {
        // For other elements, just get their text content
        result += extractTextWithFormatting(node, true);
      }
    }
  }
  
  return result.trim();
}

// Define separator template
const SEPARATOR_LINE = "================================";

// Extract the conversation with or without formatting
function extractConversation(preserveFormatting = false, useSeparatorFrames = true) {
  let conversation = '';
  
  // Find all conversation turns/articles
  const conversationTurns = document.querySelectorAll('article[data-testid^="conversation-turn"]');
  
  if (conversationTurns.length > 0) {
    for (const turn of conversationTurns) {
      // Determine the role based on the article or contained message elements
      let role;
      
      if (turn.getAttribute('data-testid') === 'conversation-turn-user') {
        role = 'USER';
      } else {
        // Look for a message element with role attribute
        const messageElement = turn.querySelector('[data-message-author-role]');
        if (messageElement) {
          const authorRole = messageElement.getAttribute('data-message-author-role');
          role = authorRole === 'user' ? 'USER' : 'MODEL';
        } else {
          // Default to MODEL if we can't determine
          role = 'MODEL';
        }
      }
      
      // Extract message content
      let messageContent = '';
      
      // First try to find the message element
      const messageElement = turn.querySelector('[data-message-author-role]');
      
      if (messageElement) {
        // Try to find the markdown container for formatted content
        const markdownDiv = messageElement.querySelector('.markdown');
        if (markdownDiv) {
          messageContent = extractTextWithFormatting(markdownDiv, preserveFormatting);
        } else {
          // Look for other content containers
          const contentDiv = messageElement.querySelector('div.whitespace-pre-wrap') || 
                            messageElement.querySelector('div[class*="prose"]');
          
          if (contentDiv) {
            messageContent = extractTextWithFormatting(contentDiv, preserveFormatting);
          } else {
            // Get content directly from the message element
            messageContent = extractTextWithFormatting(messageElement, preserveFormatting);
          }
        }
      } else {
        // Fallback to look for text content in common containers
        const textContainer = turn.querySelector('.whitespace-pre-wrap') || 
                             turn.querySelector('.markdown') || 
                             turn.querySelector('div[class*="prose"]');
        
        if (textContainer) {
          messageContent = extractTextWithFormatting(textContainer, preserveFormatting);
        } else {
          // Last resort, get all text from the turn
          messageContent = extractTextWithFormatting(turn, preserveFormatting);
        }
      }
      
      // Only add non-empty messages
      if (messageContent.trim()) {
        if (useSeparatorFrames) {
          // Add with separator frames
          conversation += `${SEPARATOR_LINE}\n${role}:\n${messageContent}\n`;
        } else {
          // Add with inline role (no frames)
          conversation += `${role}: ${messageContent}\n\n`;
        }
      }
    }
    
    // Add final separator if using frames
    if (useSeparatorFrames && conversation.trim()) {
      conversation += SEPARATOR_LINE;
    }
  } else {
    // Fallback method: look for message elements directly
    const messageElements = document.querySelectorAll('[data-message-author-role]');
    
    for (const element of messageElements) {
      const role = element.getAttribute('data-message-author-role') === 'user' ? 'USER' : 'MODEL';
      
      // Look for content in markdown container first
      const markdownDiv = element.querySelector('.markdown');
      let messageContent = '';
      
      if (markdownDiv) {
        messageContent = extractTextWithFormatting(markdownDiv, preserveFormatting);
      } else {
        // Try other content elements
        const contentDiv = element.querySelector('.whitespace-pre-wrap') || 
                          element.querySelector('div[class*="prose"]');
        
        if (contentDiv) {
          messageContent = extractTextWithFormatting(contentDiv, preserveFormatting);
        } else {
          // Get content from the message element directly
          messageContent = extractTextWithFormatting(element, preserveFormatting);
        }
      }
      
      // Only add non-empty messages
      if (messageContent.trim()) {
        if (useSeparatorFrames) {
          // Add with separator frames
          conversation += `${SEPARATOR_LINE}\n${role}:\n${messageContent}\n`;
        } else {
          // Add with inline role (no frames)
          conversation += `${role}: ${messageContent}\n\n`;
        }
      }
    }
    
    // Add final separator if using frames
    if (useSeparatorFrames && conversation.trim()) {
      conversation += SEPARATOR_LINE;
    }
  }
  
  return conversation.trim();
}

// Helper function to copy text to clipboard with fallbacks
function copyToClipboard(text) {
  // Try using the Clipboard API first
  if (navigator.clipboard && navigator.clipboard.writeText) {
    return navigator.clipboard.writeText(text)
      .catch(err => {
        console.error('Failed to copy with Clipboard API:', err);
        return fallbackCopyToClipboard(text);
      });
  } else {
    // Fall back to execCommand
    return fallbackCopyToClipboard(text);
  }
}

// Fallback method using execCommand
function fallbackCopyToClipboard(text) {
  return new Promise((resolve, reject) => {
    try {
      const textArea = document.createElement('textarea');
      textArea.value = text;
      
      // Make the textarea invisible
      textArea.style.position = 'fixed';
      textArea.style.left = '-999999px';
      textArea.style.top = '-999999px';
      document.body.appendChild(textArea);
      
      // Select and copy
      textArea.focus();
      textArea.select();
      const succeeded = document.execCommand('copy');
      document.body.removeChild(textArea);
      
      if (succeeded) {
        resolve();
      } else {
        reject(new Error('execCommand returned false'));
      }
    } catch (err) {
      reject(err);
    }
  });
}
