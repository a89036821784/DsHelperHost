/**
 * Константы для работы с нативным приложением
 */
// Идентификатор нативного приложения для подключения
const NATIVE_HOST_ID = 'com.example.ds_helper';

// Максимальный размер сообщения в байтах (1 МБ)
const MAX_MESSAGE_SIZE = 1024 * 1024;

// Размер для обрезки слишком больших сообщений (500 КБ)
const TRUNCATED_MESSAGE_SIZE = 500000;

/**
 * Константы для визуальной индикации состояний расширения
 */
// Текст и цвет бейджа при активном состоянии
const BADGE_ACTIVE = {
  text: "ON",
  color: "#4CAF50" // Зеленый цвет
};

// Текст и цвет бейджа при неактивном состоянии
const BADGE_INACTIVE = {
  text: "OFF",
  color: "#F44336" // Красный цвет
};

// Текст и цвет бейджа при ошибке
const BADGE_ERROR = {
  text: "ERR",
  color: "#F44336" // Красный цвет
};

// Префикс для всех логов расширения
const LOG_PREFIX = '[DS Helper]';

// Состояние подключения
let nativePort = null;
let isConnected = false;

// Обработка сообщений от content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type !== 'response_text' || !message.text) return true;
  
  console.log(`${LOG_PREFIX} Получен ответ от DeepSeek, длина:`, message.text.length);
  
  if (!nativePort || !isConnected) {
    console.error(`${LOG_PREFIX} Не удалось отправить ответ: нет соединения с приложением`);
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
    
    if (messageSize > MAX_MESSAGE_SIZE) {
      // Обрезаем сообщение, если оно больше максимально допустимого размера
      const shortened = {
        ...responseObj,
        text: responseObj.text.substring(0, TRUNCATED_MESSAGE_SIZE),
        truncated: true
      };
      
      console.log(`${LOG_PREFIX} Сообщение обрезано из-за большого размера (>1MB)`);
      nativePort.postMessage(shortened);
    } else {
      nativePort.postMessage(responseObj);
      console.log(`${LOG_PREFIX} Ответ отправлен в нативное приложение`);
    }
  } catch (error) {
    console.error(`${LOG_PREFIX} Ошибка отправки:`, error);
  }
  
  return true; // Для асинхронного ответа
});

// Обработка клика по иконке расширения
chrome.action.onClicked.addListener(async () => {
  if (!isConnected) {
    // Подключение к нативному приложению
    try {
      nativePort = chrome.runtime.connectNative(NATIVE_HOST_ID);
      isConnected = true;
      
      // Обновление иконки
      chrome.action.setBadgeText({ text: BADGE_ACTIVE.text });
      chrome.action.setBadgeBackgroundColor({ color: BADGE_ACTIVE.color });
      console.log(`${LOG_PREFIX} Подключено к нативному приложению`);

      // Обработка входящих сообщений
      nativePort.onMessage.addListener((msg) => {
        if (!msg) {
          console.error(`${LOG_PREFIX} Получено пустое сообщение`);
          return;
        }
        
        if (typeof msg === 'object' && msg.message !== undefined) {
          // Логирование информации о файлах
          if (msg.fileContents && Array.isArray(msg.fileContents)) {
            console.log(`${LOG_PREFIX} Содержит ${msg.fileContents.length} файлов`);
          }
          
          // Пересылка сообщения в активную вкладку
          chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
            if (tabs.length > 0) {
              chrome.tabs.sendMessage(tabs[0].id, msg);
            } else {
              console.error(`${LOG_PREFIX} Активная вкладка не найдена`);
            }
          });
        } else {
          console.error(`${LOG_PREFIX} Неверный формат сообщения`);
        }
      });

      // Обработка отключения
      nativePort.onDisconnect.addListener(() => {
        nativePort = null;
        isConnected = false;
        chrome.action.setBadgeText({ text: BADGE_INACTIVE.text });
        chrome.action.setBadgeBackgroundColor({ color: BADGE_INACTIVE.color });
        console.log(`${LOG_PREFIX} Соединение закрыто`);
      });

    } catch (error) {
      console.error(`${LOG_PREFIX} Ошибка подключения:`, error);
      chrome.action.setBadgeText({ text: BADGE_ERROR.text });
      chrome.action.setBadgeBackgroundColor({ color: BADGE_ERROR.color });
      isConnected = false;
    }
  } else {
    // Отключение от нативного приложения
    if (nativePort) {
      nativePort.disconnect();
      nativePort = null;
    }
    isConnected = false;
    chrome.action.setBadgeText({ text: BADGE_INACTIVE.text });
    chrome.action.setBadgeBackgroundColor({ color: BADGE_INACTIVE.color });
    console.log(`${LOG_PREFIX} Отключено`);
  }
}); 