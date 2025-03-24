let nativePort = null;
let isConnected = false;

// Обработка сообщений от content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type !== 'response_text' || !message.text) return true;
  
  console.log('[DS Helper] Получен ответ от DeepSeek, длина:', message.text.length);
  
  if (!nativePort || !isConnected) {
    console.error('[DS Helper] Не удалось отправить ответ: нет соединения с приложением');
    return true;
  }
  
  try {
    const responseObj = {
      type: 'response_text',
      text: message.text,
      timestamp: new Date().toISOString()
    };
    
    // Проверка размера сообщения и отправка
    const messageStr = JSON.stringify(responseObj);
    const messageSize = new TextEncoder().encode(messageStr).length;
    
    if (messageSize > 1024 * 1024) {
      // Обрезаем сообщение, если оно больше 1MB
      const shortened = {
        ...responseObj,
        text: responseObj.text.substring(0, 500000), // ~500KB
        truncated: true
      };
      
      console.log('[DS Helper] Сообщение обрезано из-за большого размера (>1MB)');
      nativePort.postMessage(shortened);
    } else {
      nativePort.postMessage(responseObj);
      console.log('[DS Helper] Ответ отправлен в нативное приложение');
    }
  } catch (error) {
    console.error('[DS Helper] Ошибка отправки:', error);
  }
  
  return true; // Для асинхронного ответа
});

// Обработка клика по иконке расширения
chrome.action.onClicked.addListener(async () => {
  if (!isConnected) {
    // Подключение к нативному приложению
    try {
      nativePort = chrome.runtime.connectNative('com.example.ds_helper');
      isConnected = true;
      
      // Обновление иконки
      chrome.action.setBadgeText({ text: "ON" });
      chrome.action.setBadgeBackgroundColor({ color: "#4CAF50" });
      console.log('[DS Helper] Подключено к нативному приложению');

      // Обработка входящих сообщений
      nativePort.onMessage.addListener((msg) => {
        if (!msg) {
          console.error('[DS Helper] Получено пустое сообщение');
          return;
        }
        
        if (typeof msg === 'object' && msg.message !== undefined) {
          // Логирование информации о файлах
          if (msg.fileContents && Array.isArray(msg.fileContents)) {
            console.log(`[DS Helper] Содержит ${msg.fileContents.length} файлов`);
          }
          
          // Пересылка сообщения в активную вкладку
          chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
            if (tabs.length > 0) {
              chrome.tabs.sendMessage(tabs[0].id, msg);
            } else {
              console.error('[DS Helper] Активная вкладка не найдена');
            }
          });
        } else {
          console.error('[DS Helper] Неверный формат сообщения');
        }
      });

      // Обработка отключения
      nativePort.onDisconnect.addListener(() => {
        nativePort = null;
        isConnected = false;
        chrome.action.setBadgeText({ text: "OFF" });
        chrome.action.setBadgeBackgroundColor({ color: "#F44336" });
        console.log('[DS Helper] Соединение закрыто');
      });

    } catch (error) {
      console.error('[DS Helper] Ошибка подключения:', error);
      chrome.action.setBadgeText({ text: "ERR" });
      chrome.action.setBadgeBackgroundColor({ color: "#F44336" });
      isConnected = false;
    }
  } else {
    // Отключение от нативного приложения
    if (nativePort) {
      nativePort.disconnect();
      nativePort = null;
    }
    isConnected = false;
    chrome.action.setBadgeText({ text: "OFF" });
    chrome.action.setBadgeBackgroundColor({ color: "#F44336" });
    console.log('[DS Helper] Отключено');
  }
}); 