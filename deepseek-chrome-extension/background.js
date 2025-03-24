let nativePort = null;
let isConnected = false;

// Добавляем обработчик сообщений от content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[DS Helper] Received message:', message);
  if (message.type === 'response_text' && message.text) {
    console.log('[DS Helper] Received response text from content script');
    console.log('[DS Helper] Response text length:', message.text.length);
    console.log('[DS Helper] Response text sample:', message.text.substring(0, 100) + '...');
    
    if (nativePort && isConnected) {
      // Отправляем текст в нативное приложение
      try {
        const responseObj = {
          type: 'response_text',
          text: message.text,
          timestamp: new Date().toISOString()
        };
        
        console.log('[DS Helper] Response object:', responseObj);
        console.log('[DS Helper] Sending response to native app...');
        
        try {
          // Проверка размера сообщения перед отправкой
          const messageStr = JSON.stringify(responseObj);
          console.log('[DS Helper] Message size in bytes:', new TextEncoder().encode(messageStr).length);
          
          if (new TextEncoder().encode(messageStr).length > 1024 * 1024) {
            console.error('[DS Helper] Message too large (> 1MB), truncating text...');
            // Если сообщение слишком большое, обрезаем текст
            const shortened = {
              type: 'response_text',
              text: responseObj.text.substring(0, 500000), // Примерно 500 КБ текста
              timestamp: responseObj.timestamp,
              truncated: true
            };
            
            console.log('[DS Helper] Sending truncated message with proper protocol');
            // Chrome автоматически добавляет длину сообщения, если используется нативный порт
            // Предположительно нам не нужно ничего делать, так как Chrome runtime API
            // правильно форматирует сообщения для native messaging
            nativePort.postMessage(shortened);
            
            console.log('[DS Helper] Truncated response sent to native app');
          } else {
            console.log('[DS Helper] Sending message with proper protocol');
            // Chrome автоматически добавляет длину сообщения, если используется нативный порт
            nativePort.postMessage(responseObj);
            console.log('[DS Helper] Response text sent to native app');
          }
        } catch (error) {
          console.error('[DS Helper] Error sending response to native app:', error);
        }
      } catch (error) {
        console.error('[DS Helper] Error sending response to native app:', error);
      }
    } else {
      console.error('[DS Helper] Cannot send response: not connected to native app (connected:', isConnected, ', port:', nativePort !== null, ')');
    }
  }
  
  return true; // Необходимо для асинхронного ответа
});

chrome.action.onClicked.addListener(async () => {
  if (!isConnected) {
    try {
      console.log('[DS Helper] Starting connection...');
      nativePort = chrome.runtime.connectNative('com.example.ds_helper');
      isConnected = true;
      console.log('[DS Helper] Connected');
      
      // Показываем уведомление о подключении
      chrome.action.setBadgeText({ text: "ON" });
      chrome.action.setBadgeBackgroundColor({ color: "#4CAF50" });

      nativePort.onMessage.addListener((msg) => {
        try {
          console.log('[DS Helper] Received message from native host');
          
          // Валидация сообщения
          if (!msg) {
            console.error('[DS Helper] Received null or undefined message');
            return;
          }
          
          // Проверяем, имеет ли сообщение правильный формат
          if (typeof msg === 'object' && msg.message !== undefined) {
            // Логирование информации о сообщении
            console.log(`[DS Helper] Message length: ${JSON.stringify(msg).length} bytes`);
            console.log(`[DS Helper] Message fields: ${Object.keys(msg).join(', ')}`);
            
            // Логируем количество файлов (если они есть)
            if (msg.fileContents && Array.isArray(msg.fileContents)) {
              console.log(`[DS Helper] Message contains ${msg.fileContents.length} files`);
              
              // Проверка каждого файла
              msg.fileContents.forEach((content, index) => {
                const fileName = msg.fileNames && msg.fileNames[index] ? msg.fileNames[index] : `file${index + 1}`;
                console.log(`[DS Helper] File ${index + 1}: ${fileName}, content length: ${content ? content.length : 0} chars`);
              });
            }
            
            // Передаем сообщение в активную вкладку
            chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
              if (tabs.length > 0) {
                console.log(`[DS Helper] Sending message to tab ${tabs[0].id}`);
                chrome.tabs.sendMessage(tabs[0].id, msg);
              } else {
                console.error('[DS Helper] No active tab found');
              }
            });
          } else {
            console.error('[DS Helper] Received malformed message:', typeof msg, msg ? Object.keys(msg) : 'null');
          }
        } catch (error) {
          console.error('[DS Helper] Error processing message:', error);
        }
      });

      nativePort.onDisconnect.addListener(() => {
        console.log('[DS Helper] Connection terminated');
        nativePort = null;
        isConnected = false;
        chrome.action.setBadgeText({ text: "OFF" });
        chrome.action.setBadgeBackgroundColor({ color: "#F44336" });
      });

    } catch (error) {
      console.error('[DS Helper] Connection failed:', error);
      chrome.action.setBadgeText({ text: "ERR" });
      chrome.action.setBadgeBackgroundColor({ color: "#F44336" });
      isConnected = false;
    }
  } else {
    console.log('[DS Helper] Initiating shutdown...');
    if (nativePort) {
      nativePort.disconnect();
      nativePort = null;
    }
    isConnected = false;
    chrome.action.setBadgeText({ text: "OFF" });
    chrome.action.setBadgeBackgroundColor({ color: "#F44336" });
  }
}); 