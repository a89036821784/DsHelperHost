/**
 * Модуль утилит - содержит вспомогательные функции и обработчики ошибок
 */
import { Config } from './config.js';

/**
 * Класс для логирования
 */
export class Logger {
  /**
   * Логирование информационного сообщения
   * @param {string} message - сообщение для логирования
   * @param {any} data - дополнительные данные (опционально)
   */
  static info(message, data) {
    console.log(`${Config.text.logPrefix} ${message}`, data !== undefined ? data : '');
  }
  
  /**
   * Логирование предупреждения
   * @param {string} message - сообщение для логирования
   * @param {any} data - дополнительные данные (опционально)
   */
  static warn(message, data) {
    console.warn(`${Config.text.logPrefix} ${message}`, data !== undefined ? data : '');
  }
  
  /**
   * Логирование ошибки
   * @param {string} message - сообщение об ошибке
   * @param {Error|any} error - объект ошибки (опционально)
   */
  static error(message, error) {
    console.error(`${Config.text.logPrefix} ${message}`, error !== undefined ? error : '');
  }
}

/**
 * Обертка для безопасного выполнения функций
 * @param {Function} fn - функция для выполнения
 * @param {string} errorMsg - сообщение в случае ошибки
 * @param {any} defaultValue - значение по умолчанию в случае ошибки
 * @returns {any} результат выполнения функции или значение по умолчанию
 */
export function safeExecute(fn, errorMsg, defaultValue) {
  try {
    return fn();
  } catch (error) {
    Logger.error(errorMsg, error);
    return defaultValue;
  }
}

/**
 * Асинхронная обертка с обработкой ошибок и повторными попытками
 * @param {Function} fn - асинхронная функция
 * @param {string} errorMsg - сообщение в случае ошибки
 * @param {number} maxRetries - максимальное число повторов (по умолчанию из конфига)
 * @param {number} delay - задержка между повторами (по умолчанию из конфига)
 * @returns {Promise<any>} результат выполнения функции
 */
export async function safeAsync(fn, errorMsg, maxRetries = Config.timers.maxRetries, delay = Config.timers.retryDelay) {
  let lastError;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      if (attempt > 0) {
        Logger.info(`Повторная попытка ${attempt}/${maxRetries}`);
      }
      return await fn();
    } catch (error) {
      lastError = error;
      Logger.error(`${errorMsg} (попытка ${attempt + 1}/${maxRetries + 1})`, error);
      
      if (attempt < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  throw new Error(`${errorMsg} после ${maxRetries + 1} попыток: ${lastError?.message || 'Неизвестная ошибка'}`);
}

/**
 * Функция для ожидания с таймаутом
 * @param {Promise} promise - исходный промис
 * @param {number} timeout - время таймаута в мс
 * @param {string} timeoutMessage - сообщение при таймауте
 * @returns {Promise} результат промиса или ошибка таймаута
 */
export function withTimeout(promise, timeout, timeoutMessage) {
  return Promise.race([
    promise,
    new Promise((_, reject) => 
      setTimeout(() => reject(new Error(timeoutMessage)), timeout)
    )
  ]);
}

/**
 * Класс для работы с DOM элементами
 */
export class DomUtils {
  /**
   * Безопасный поиск элемента DOM
   * @param {string} selector - CSS селектор
   * @param {Element} parent - родительский элемент (по умолчанию document)
   * @returns {Element|null} найденный элемент или null
   */
  static findElement(selector, parent = document) {
    return safeExecute(
      () => parent.querySelector(selector),
      `Ошибка при поиске элемента: ${selector}`,
      null
    );
  }
  
  /**
   * Безопасный поиск всех элементов DOM
   * @param {string} selector - CSS селектор
   * @param {Element} parent - родительский элемент (по умолчанию document)
   * @returns {Element[]|[]} массив найденных элементов
   */
  static findElements(selector, parent = document) {
    return safeExecute(
      () => Array.from(parent.querySelectorAll(selector)),
      `Ошибка при поиске элементов: ${selector}`,
      []
    );
  }
}

/**
 * Класс для реализации шаблона Observer (наблюдатель)
 */
export class EventEmitter {
  constructor() {
    this.events = {};
  }
  
  /**
   * Подписаться на событие
   * @param {string} event - имя события
   * @param {Function} listener - функция-обработчик
   */
  on(event, listener) {
    if (!this.events[event]) {
      this.events[event] = [];
    }
    this.events[event].push(listener);
  }
  
  /**
   * Отписаться от события
   * @param {string} event - имя события
   * @param {Function} listener - функция-обработчик
   */
  off(event, listener) {
    if (!this.events[event]) return;
    this.events[event] = this.events[event].filter(l => l !== listener);
  }
  
  /**
   * Вызвать событие
   * @param {string} event - имя события
   * @param {any} data - данные события
   */
  emit(event, data) {
    if (!this.events[event]) return;
    this.events[event].forEach(listener => {
      try {
        listener(data);
      } catch (error) {
        Logger.error(`Ошибка в обработчике события ${event}`, error);
      }
    });
  }
} 