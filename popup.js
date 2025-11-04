document.addEventListener('DOMContentLoaded', async () => {
  const translateToggle = document.getElementById('translateToggle');

  // Load saved toggle state
  const result = await chrome.storage.sync.get(['toggleState']);
  if (result.toggleState) {
    translateToggle.checked = true;
  }

  translateToggle.addEventListener('change', async () => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

      if (translateToggle.checked) {
        // Toggle ON: Start translation
        await chrome.storage.sync.set({ toggleState: true });

        const lang = document.getElementById('lang').value;
        await chrome.storage.sync.set({ lang });
        console.log('Language set to:', lang);

        // Inject content script and send translation message
        try {
          const response = await chrome.tabs.sendMessage(tab.id, {
            method: 'translate',
            lang: lang
          });

          if (response?.method === 'translate') {
            console.log('Translation started');
          }
        } catch (err) {
          if (err.message.includes('Receiving end does not exist')) {
            await chrome.scripting.executeScript({
              target: { tabId: tab.id },
              files: ['content.js']
            });
            
            const response = await chrome.tabs.sendMessage(tab.id, {
              method: 'translate',
              lang: lang
            });
            
            if (response?.method === 'translate') {
              console.log('Translation started after injection');
            }
          } else {
            throw err;
          }
        }
      } else {
        // Toggle OFF: Switch back to English
        await chrome.storage.sync.set({ toggleState: false });
        
        // Send message to content script to restore English
        try {
          await chrome.tabs.sendMessage(tab.id, {
            method: 'restoreEnglish'
          });
          console.log('Restored to English');
        } catch (err) {
          console.error('Error restoring English:', err);
        }
      }
    } catch (error) {
      console.error('Error during toggle operation:', error);
    }
  });
});
