/**
 * Основной файл фонового скрипта расширения Chrome
 */

// Префикс для всех логов расширения
const LOG_PREFIX = '[DS Helper]';

// Основные идентификаторы
const NATIVE_HOST_ID = 'com.example.ds_helper';
const MAX_MESSAGE_SIZE = 1024 * 1024;
const TRUNCATED_MESSAGE_SIZE = 500000;

// Настройки для индикации состояний
const BADGES = {
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
};

// Базовый класс EventEmitter для реализации паттерна Observer
class EventEmitter {
  constructor() {
    this.events = {};
  }
  
  on(event, listener) {
    if (!this.events[event]) {
      this.events[event] = [];
    }
    this.events[event].push(listener);
  }
  
  off(event, listener) {
    if (!this.events[event]) return;
    this.events[event] = this.events[event].filter(l => l !== listener);
  }
  
  emit(event, data) {
    if (!this.events[event]) return;
    this.events[event].forEach(listener => {
      try {
        listener(data);
      } catch (error) {
        console.error(`${LOG_PREFIX} Ошибка в обработчике события ${event}`, error);
      }
    });
  }
}

// Класс для управления соединением с нативным приложением
class NativeConnection extends EventEmitter {
  constructor() {
    super();
    this.port = null;
    this.isConnected = false;
  }

  // Подключение к нативному приложению
  connect() {
    if (this.isConnected) {
      console.log(`${LOG_PREFIX} Уже подключено к нативному приложению`);
      return true;
    }

    try {
      this.port = chrome.runtime.connectNative(NATIVE_HOST_ID);
      this.isConnected = true;
      
      console.log(`${LOG_PREFIX} Подключено к нативному приложению`);
      
      // Обновляем индикатор состояния
      this.updateBadge(BADGES.active);
      
      // Настраиваем обработчики сообщений
      this.setupMessageHandlers();
      
      // Оповещаем о подключении
      this.emit('connected');
      
      return true;
    } catch (error) {
      console.error(`${LOG_PREFIX} Ошибка подключения к нативному приложению`, error);
      this.isConnected = false;
      this.port = null;
      
      // Обновляем индикатор состояния
      this.updateBadge(BADGES.error);
      
      // Оповещаем об ошибке
      this.emit('error', error);
      
      return false;
    }
  }

  // Отключение от нативного приложения
  disconnect() {
    if (!this.isConnected || !this.port) {
      return;
    }

    try {
      // Отправляем сообщение о завершении работы перед отключением
      try {
        console.log(`${LOG_PREFIX} Отправка сигнала завершения нативному приложению`);
        this.port.postMessage({ type: 'shutdown' });
      } catch (msgError) {
        console.error(`${LOG_PREFIX} Ошибка при отправке сообщения о завершении`, msgError);
      }
      
      // Задержка перед отключением, чтобы сообщение успело дойти
      setTimeout(() => {
        try {
          this.port.disconnect();
        } catch (error) {
          console.error(`${LOG_PREFIX} Ошибка при отключении от нативного приложения`, error);
        } finally {
          this.port = null;
          this.isConnected = false;
          
          // Обновляем индикатор состояния
          this.updateBadge(BADGES.inactive);
          
          // Оповещаем об отключении
          this.emit('disconnected');
          
          console.log(`${LOG_PREFIX} Отключено от нативного приложения`);
        }
      }, 200);
    } catch (error) {
      console.error(`${LOG_PREFIX} Ошибка при отключении от нативного приложения`, error);
      this.port = null;
      this.isConnected = false;
      
      // Обновляем индикатор состояния
      this.updateBadge(BADGES.inactive);
      
      // Оповещаем об отключении
      this.emit('disconnected');
      
      console.log(`${LOG_PREFIX} Отключено от нативного приложения`);
    }
  }

  // Настройка обработчиков сообщений
  setupMessageHandlers() {
    if (!this.port) return;
    
    // Обработка входящих сообщений
    this.port.onMessage.addListener((msg) => {
      if (!msg) {
        console.error(`${LOG_PREFIX} Получено пустое сообщение`);
        return;
      }
      
      try {
        // Обрабатываем сообщение на основе его содержимого
        if (typeof msg === 'object' && msg.message !== undefined) {
          // Логирование информации о файлах
          if (msg.fileContents && Array.isArray(msg.fileContents)) {
            console.log(`${LOG_PREFIX} Содержит ${msg.fileContents.length} файлов`);
          }
          
          // Оповещаем о получении сообщения
          this.emit('message', msg);
        } else {
          console.error(`${LOG_PREFIX} Неверный формат сообщения`);
        }
      } catch (error) {
        console.error(`${LOG_PREFIX} Ошибка при обработке входящего сообщения`, error);
      }
    });

    // Обработка отключения
    this.port.onDisconnect.addListener(() => {
      const error = chrome.runtime.lastError;
      if (error) {
        console.error(`${LOG_PREFIX} Соединение с нативным приложением разорвано с ошибкой`, error);
        this.emit('error', error);
      }
      
      this.port = null;
      this.isConnected = false;
      
      // Обновляем индикатор состояния
      this.updateBadge(BADGES.inactive);
      
      // Оповещаем об отключении
      this.emit('disconnected');
      
      console.log(`${LOG_PREFIX} Соединение с нативным приложением закрыто`);
    });
  }

  // Отправка сообщения в нативное приложение
  sendMessage(message) {
    if (!this.isConnected || !this.port) {
      console.error(`${LOG_PREFIX} Не удалось отправить сообщение: нет соединения с приложением`);
      return false;
    }
    
    try {
      // Проверка размера сообщения и отправка
      const messageStr = JSON.stringify(message);
      const messageSize = new TextEncoder().encode(messageStr).length;
      
      if (messageSize > MAX_MESSAGE_SIZE) {
        // Обрезаем сообщение, если оно больше максимально допустимого размера
        console.warn(`${LOG_PREFIX} Сообщение обрезано из-за большого размера (>1MB)`);
        
        if (message.text) {
          const shortened = {
            ...message,
            text: message.text.substring(0, TRUNCATED_MESSAGE_SIZE),
            truncated: true
          };
          
          this.port.postMessage(shortened);
        } else {
          console.error(`${LOG_PREFIX} Невозможно обрезать сообщение - нет текстового поля`);
          return false;
        }
      } else {
        this.port.postMessage(message);
      }
      
      console.log(`${LOG_PREFIX} Сообщение отправлено в нативное приложение`);
      return true;
    } catch (error) {
      console.error(`${LOG_PREFIX} Ошибка отправки сообщения в нативное приложение`, error);
      return false;
    }
  }

  // Обновление индикатора состояния расширения
  updateBadge(badge) {
    try {
      chrome.action.setBadgeText({ text: badge.text });
      chrome.action.setBadgeBackgroundColor({ color: badge.color });
    } catch (error) {
      console.error(`${LOG_PREFIX} Ошибка при обновлении значка расширения`, error);
    }
  }
}

// Класс для управления фоновым скриптом расширения
class BackgroundApp {
  constructor() {
    // Создаем подключение к нативному приложению
    this.nativeConnection = new NativeConnection();
    
    // Настраиваем обработчики событий
    this.setupEventListeners();
    
    // Первоначальная установка статуса (отключено)
    this.nativeConnection.updateBadge(BADGES.inactive);
    
    console.log(`${LOG_PREFIX} BackgroundApp: инициализировано`);
  }
  
  /**
   * Настройка обработчиков событий расширения
   */
  setupEventListeners() {
    // Обработка клика по иконке расширения
    chrome.action.onClicked.addListener(this.handleActionClick.bind(this));
    
    // Обработка сообщений от content script
    chrome.runtime.onMessage.addListener(this.handleContentMessage.bind(this));
    
    // Обработка событий от NativeConnection
    this.nativeConnection.on('message', this.handleNativeMessage.bind(this));
    
    console.log(`${LOG_PREFIX} BackgroundApp: обработчики событий настроены`);
  }
  
  /**
   * Обработка клика по иконке расширения
   */
  handleActionClick() {
    if (!this.nativeConnection.isConnected) {
      // Подключение к нативному приложению
      this.nativeConnection.connect();
    } else {
      // Отключение от нативного приложения
      this.nativeConnection.disconnect();
    }
  }
  
  /**
   * Обработка сообщений от content-скрипта
   * @param {Object} message - сообщение
   * @param {Object} sender - отправитель
   * @param {Function} sendResponse - функция для отправки ответа
   * @returns {boolean} индикатор асинхронной обработки
   */
  handleContentMessage(message, sender, sendResponse) {
    if (message.type !== 'response_text' || !message.text) return true;
    
    console.log(`${LOG_PREFIX} Получен ответ от DeepSeek`, { length: message.text.length });
    
    if (!this.nativeConnection.isConnected) {
      console.error(`${LOG_PREFIX} Не удалось отправить ответ: нет соединения с приложением`);
      return true;
    }
    
    // Формируем объект с ответом
    const responseObj = {
      type: 'response_text',
      text: message.text,
      timestamp: new Date().toISOString()
    };
    
    // Отправляем в нативное приложение
    this.nativeConnection.sendMessage(responseObj);
    
    return true; // Для асинхронного ответа
  }
  
  /**
   * Обработка сообщений от нативного приложения
   * @param {Object} message - сообщение от нативного приложения
   */
  handleNativeMessage(message) {
    // Пересылка сообщения в активную вкладку
    chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
      if (tabs.length > 0) {
        // Показываем индикатор загрузки
        this.nativeConnection.updateBadge(BADGES.loading);
        
        // Отправляем сообщение в контент-скрипт
        chrome.tabs.sendMessage(tabs[0].id, message)
          .then(() => {
            // Восстанавливаем индикатор после отправки
            this.nativeConnection.updateBadge(BADGES.active);
          })
          .catch(error => {
            console.error(`${LOG_PREFIX} Ошибка при отправке сообщения в контент-скрипт`, error);
            this.nativeConnection.updateBadge(BADGES.error);
            
            // Восстанавливаем индикатор через некоторое время
            setTimeout(() => {
              if (this.nativeConnection.isConnected) {
                this.nativeConnection.updateBadge(BADGES.active);
              }
            }, 2000);
          });
      } else {
        console.error(`${LOG_PREFIX} Активная вкладка не найдена`);
      }
    });
  }
}

// Создаем и инициализируем приложение
const app = new BackgroundApp(); 