let nativePort = null;
let isConnected = false;

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