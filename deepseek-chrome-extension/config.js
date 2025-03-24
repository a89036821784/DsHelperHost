/**
 * Файл конфигурации - содержит все настройки расширения в едином месте
 */

export const Config = {
  // Основные идентификаторы
  native: {
    hostId: 'com.example.ds_helper',
    maxMessageSize: 1024 * 1024,    // 1 МБ
    truncatedMessageSize: 500000    // 500 KB
  },
  
  // Селекторы DOM-элементов DeepSeek
  selectors: {
    chatInput: 'textarea#chat-input',
    fileInput: 'input[type="file"]',
    responseBlocks: '.ds-markdown.ds-markdown--block',
    button: 'div[role="button"]'
  },
  
  // Константы для текстовых меток
  text: {
    uploading: 'Uploading',
    newChat: 'New chat',
    logPrefix: '[DS Helper]'
  },
  
  // Таймеры и интервалы
  timers: {
    newChatDelay: 500,              // 500 мс
    uploadCheckInterval: 1000,      // 1 сек
    uploadTimeout: 30000,           // 30 сек
    responseCheckInterval: 500,     // 500 мс
    stableResponseChecks: 35,        // 5 проверок
    responseTimeout: 120000,        // 2 мин
    retryDelay: 2000,               // 2 сек
    maxRetries: 3                   // 3 попытки
  },
  
  // Настройки для индикации состояний
  badges: {
    active: {
      text: "ON",
      color: "#4CAF50"
    },
    inactive: {
      text: "OFF",
      color: "#F44336"
    },
    error: {
      text: "ERR",
      color: "#F44336"
    },
    loading: {
      text: "⏳",
      color: "#FF9800"
    }
  }
}; 