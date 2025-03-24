/**
 * Модуль для работы с нативным приложением
 */
import { Config } from './config.js';
import { Logger, EventEmitter } from './utils.js';

/**
 * Класс для управления соединением с нативным приложением
 */
export class NativeConnection extends EventEmitter {
  constructor() {
    super();
    this.port = null;
    this.isConnected = false;
  }

  /**
   * Подключение к нативному приложению
   * @returns {boolean} успешность подключения
   */
  connect() {
    if (this.isConnected) {
      Logger.info('Уже подключено к нативному приложению');
      return true;
    }

    try {
      this.port = chrome.runtime.connectNative(Config.native.hostId);
      this.isConnected = true;
      
      Logger.info('Подключено к нативному приложению');
      
      // Обновляем индикатор состояния
      this.updateBadge(Config.badges.active);
      
      // Настраиваем обработчики сообщений
      this.setupMessageHandlers();
      
      // Оповещаем о подключении
      this.emit('connected');
      
      return true;
    } catch (error) {
      Logger.error('Ошибка подключения к нативному приложению', error);
      this.isConnected = false;
      this.port = null;
      
      // Обновляем индикатор состояния
      this.updateBadge(Config.badges.error);
      
      // Оповещаем об ошибке
      this.emit('error', error);
      
      return false;
    }
  }

  /**
   * Отключение от нативного приложения
   */
  disconnect() {
    if (!this.isConnected || !this.port) {
      return;
    }

    try {
      // Отправляем сообщение о завершении работы перед отключением
      try {
        Logger.info('Отправка сигнала завершения нативному приложению');
        this.port.postMessage({ type: 'shutdown' });
      } catch (msgError) {
        Logger.error('Ошибка при отправке сообщения о завершении', msgError);
      }
      
      // Задержка перед отключением, чтобы сообщение успело дойти
      setTimeout(() => {
        try {
          this.port.disconnect();
        } catch (error) {
          Logger.error('Ошибка при отключении от нативного приложения', error);
        } finally {
          this.port = null;
          this.isConnected = false;
          
          // Обновляем индикатор состояния
          this.updateBadge(Config.badges.inactive);
          
          // Оповещаем об отключении
          this.emit('disconnected');
          
          Logger.info('Отключено от нативного приложения');
        }
      }, 100);
    } catch (error) {
      Logger.error('Ошибка при отключении от нативного приложения', error);
      this.port = null;
      this.isConnected = false;
      
      // Обновляем индикатор состояния
      this.updateBadge(Config.badges.inactive);
      
      // Оповещаем об отключении
      this.emit('disconnected');
      
      Logger.info('Отключено от нативного приложения');
    }
  }

  /**
   * Настройка обработчиков сообщений
   */
  setupMessageHandlers() {
    if (!this.port) return;
    
    // Обработка входящих сообщений
    this.port.onMessage.addListener((msg) => {
      if (!msg) {
        Logger.error('Получено пустое сообщение');
        return;
      }
      
      try {
        // Обрабатываем сообщение на основе его содержимого
        if (typeof msg === 'object' && msg.message !== undefined) {
          // Логирование информации о файлах
          if (msg.fileContents && Array.isArray(msg.fileContents)) {
            Logger.info(`Содержит ${msg.fileContents.length} файлов`);
          }
          
          // Оповещаем о получении сообщения
          this.emit('message', msg);
        } else {
          Logger.error('Неверный формат сообщения');
        }
      } catch (error) {
        Logger.error('Ошибка при обработке входящего сообщения', error);
      }
    });

    // Обработка отключения
    this.port.onDisconnect.addListener(() => {
      const error = chrome.runtime.lastError;
      if (error) {
        Logger.error('Соединение с нативным приложением разорвано с ошибкой', error);
        this.emit('error', error);
      }
      
      this.port = null;
      this.isConnected = false;
      
      // Обновляем индикатор состояния
      this.updateBadge(Config.badges.inactive);
      
      // Оповещаем об отключении
      this.emit('disconnected');
      
      Logger.info('Соединение с нативным приложением закрыто');
    });
  }

  /**
   * Отправка сообщения в нативное приложение
   * @param {Object} message - сообщение для отправки
   * @returns {boolean} успешность отправки
   */
  sendMessage(message) {
    if (!this.isConnected || !this.port) {
      Logger.error('Не удалось отправить сообщение: нет соединения с приложением');
      return false;
    }
    
    try {
      // Проверка размера сообщения и отправка
      const messageStr = JSON.stringify(message);
      const messageSize = new TextEncoder().encode(messageStr).length;
      
      if (messageSize > Config.native.maxMessageSize) {
        // Обрезаем сообщение, если оно больше максимально допустимого размера
        Logger.warn('Сообщение обрезано из-за большого размера (>1MB)');
        
        if (message.text) {
          const shortened = {
            ...message,
            text: message.text.substring(0, Config.native.truncatedMessageSize),
            truncated: true
          };
          
          this.port.postMessage(shortened);
        } else {
          Logger.error('Невозможно обрезать сообщение - нет текстового поля');
          return false;
        }
      } else {
        this.port.postMessage(message);
      }
      
      Logger.info('Сообщение отправлено в нативное приложение');
      return true;
    } catch (error) {
      Logger.error('Ошибка отправки сообщения в нативное приложение', error);
      return false;
    }
  }

  /**
   * Обновление индикатора состояния расширения
   * @param {Object} badge - параметры индикатора
   */
  updateBadge(badge) {
    try {
      chrome.action.setBadgeText({ text: badge.text });
      chrome.action.setBadgeBackgroundColor({ color: badge.color });
    } catch (error) {
      Logger.error('Ошибка при обновлении значка расширения', error);
    }
  }
} 