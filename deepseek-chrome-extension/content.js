/**
 * Основной файл контент-скрипта для работы с DeepSeek
 */

// Префикс для всех логов расширения
const LOG_PREFIX = '[DS Helper]';

// Селекторы и константы из конфигурации
const CHAT_INPUT_SELECTOR = 'textarea#chat-input';
const FILE_INPUT_SELECTOR = 'input[type="file"]';
const RESPONSE_BLOCKS_SELECTOR = '.ds-markdown.ds-markdown--block';
const BUTTON_SELECTOR = 'div[role="button"]';
const UPLOADING_TEXT = 'Uploading';
const NEW_CHAT_TEXT = 'New chat';

// Таймеры и интервалы
const NEW_CHAT_DELAY = 500;
const FILE_UPLOAD_CHECK_INTERVAL = 1000;
const FILE_UPLOAD_TIMEOUT = 30000;
const RESPONSE_CHECK_INTERVAL = 500;
const STABLE_RESPONSE_CHECKS = 5;
const RESPONSE_TIMEOUT = 120000;

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

// Утилиты для безопасного выполнения функций
function safeExecute(fn, errorMsg, defaultValue) {
  try {
    return fn();
  } catch (error) {
    console.error(`${LOG_PREFIX} ${errorMsg}`, error);
    return defaultValue;
  }
}

// Класс для работы с DOM-элементами
class DomUtils {
  static findElement(selector, parent = document) {
    return safeExecute(
      () => parent.querySelector(selector),
      `Ошибка при поиске элемента: ${selector}`,
      null
    );
  }
  
  static findElements(selector, parent = document) {
    return safeExecute(
      () => Array.from(parent.querySelectorAll(selector)),
      `Ошибка при поиске элементов: ${selector}`,
      []
    );
  }
}

// Класс для управления UI элементами DeepSeek
class UiController extends EventEmitter {
  constructor() {
    super();
    this.loadingIndicator = false;
  }

  // Поиск кнопки отправки сообщения
  findSendButton() {
    const buttons = DomUtils.findElements(BUTTON_SELECTOR);
    
    // Находим кнопку отправки (обычно кнопка с пустым текстом или только с SVG)
    return buttons.find(button => {
      // Проверка на пустой текст
      if (button.textContent === '') return true;
      
      // Проверка на SVG без текста
      if (button.firstChild?.tagName === 'svg') {
        return button.textContent.replace(/\s/g, '') === '';
      }
      
      return false;
    });
  }

  // Создание нового чата
  async createNewChat() {
    console.log(`${LOG_PREFIX} Создание нового чата`);
    
    try {
      // Показываем индикатор загрузки
      this.showLoading(true);
      
      // Ищем кнопку "New chat" по тексту и SVG-иконке
      const elements = DomUtils.findElements('div');
      const newChatDiv = elements.find(div => 
        div?.firstChild?.tagName === 'svg' && div.textContent === NEW_CHAT_TEXT
      );

      if (newChatDiv) {
        console.log(`${LOG_PREFIX} Найдена кнопка "New chat", нажимаем`);
        newChatDiv.click();
      } else {
        console.warn(`${LOG_PREFIX} Кнопка "New chat" не найдена`);
      }
      
      // В любом случае ждем заданное время
      await new Promise(resolve => setTimeout(resolve, NEW_CHAT_DELAY));
      
      // Скрываем индикатор загрузки
      this.showLoading(false);
    } catch (error) {
      console.error(`${LOG_PREFIX} Ошибка при создании нового чата`, error);
      this.showLoading(false);
    }
  }

  // Вставка текста в поле ввода
  async setInputText(text) {
    try {
      const inputElement = DomUtils.findElement(CHAT_INPUT_SELECTOR);
      
      if (!inputElement) {
        throw new Error('Поле ввода не найдено');
      }
      
      // Устанавливаем текст и генерируем события
      inputElement.value = text;
      inputElement.innerText = text;
      
      // Создаем события для имитации ввода пользователем
      inputElement.dispatchEvent(new Event('input', { bubbles: true }));
      inputElement.dispatchEvent(new Event('change', { bubbles: true }));
      
      // Обновляем текст в соседнем div (необходимо для корректного отображения)
      const adjacentDiv = inputElement.nextElementSibling;
      if (adjacentDiv) adjacentDiv.innerText = text;
      
      console.log(`${LOG_PREFIX} Сообщение вставлено в поле ввода`);
      return true;
    } catch (error) {
      console.error(`${LOG_PREFIX} Ошибка при вставке текста в поле ввода`, error);
      return false;
    }
  }

  // Отправка сообщения
  async sendMessage() {
    try {
      this.showLoading(true);
      const sendButton = this.findSendButton();
      
      if (!sendButton) {
        throw new Error('Кнопка отправки не найдена');
      }
      
      sendButton.click();
      console.log(`${LOG_PREFIX} Сообщение отправлено`);
      
      // Оповещаем о событии
      this.emit('messageSent');
      
      return true;
    } catch (error) {
      console.error(`${LOG_PREFIX} Ошибка при отправке сообщения`, error);
      this.showLoading(false);
      return false;
    }
  }

  // Управление индикатором загрузки
  showLoading(isLoading) {
    this.loadingIndicator = isLoading;
    this.emit('loadingChanged', isLoading);
    
    safeExecute(() => {
      const loadingClass = 'ds-helper-loading';
      if (isLoading) {
        document.body.classList.add(loadingClass);
      } else {
        document.body.classList.remove(loadingClass);
      }
    }, 'Ошибка при обновлении индикатора загрузки');
  }

  // Ожидание и извлечение ответа DeepSeek
  async waitForResponse() {
    console.log(`${LOG_PREFIX} Ожидание ответа DeepSeek...`);
    
    // Получаем начальное количество блоков с ответами
    const initialElements = DomUtils.findElements(RESPONSE_BLOCKS_SELECTOR);
    const initialCount = initialElements.length;
    const lastInitialElement = initialCount > 0 ? initialElements[initialCount - 1] : null;
    
    return new Promise((resolve, reject) => {
      let lastTextContent = '';
      let stableContentCounter = 0;
      let checkInterval;
      
      // Функция для извлечения текста из последнего ответа
      const extractResponseText = element => {
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = element.innerHTML;
        
        let responseText = '';
        Array.from(tempDiv.childNodes).forEach(node => {
          if (node.nodeType === Node.TEXT_NODE) {
            responseText += node.textContent;
          } else if (node.nodeType === Node.ELEMENT_NODE) {
            responseText += node.textContent + '\n\n';
          }
        });
        
        return responseText.trim();
      };
      
      // Функция завершения ожидания
      const finishWaiting = (responseText, source = 'normal') => {
        if (checkInterval) {
          clearInterval(checkInterval);
          checkInterval = null;
        }
        
        this.showLoading(false);
        console.log(`${LOG_PREFIX} Ответ получен (${source})`);
        resolve(responseText);
      };
      
      // Проверяем появление нового ответа с заданным интервалом
      checkInterval = setInterval(() => {
        const currentElements = DomUtils.findElements(RESPONSE_BLOCKS_SELECTOR);
        
        if (currentElements.length > initialCount) {
          // Получаем последний элемент с ответом
          const lastElement = currentElements[currentElements.length - 1];
          
          if (lastInitialElement !== lastElement) {
            const currentText = lastElement.textContent;
            
            if (currentText === lastTextContent) {
              // Контент стабилен, увеличиваем счетчик
              stableContentCounter++;
              
              // Если контент не менялся заданное количество проверок, считаем ответ законченным
              if (stableContentCounter >= STABLE_RESPONSE_CHECKS) {
                const responseText = extractResponseText(lastElement);
                finishWaiting(responseText);
              }
            } else {
              // Контент изменился, сбрасываем счетчик
              stableContentCounter = 0;
              lastTextContent = currentText;
            }
          }
        }
      }, RESPONSE_CHECK_INTERVAL);
      
      // Таймаут на случай долгого ответа
      setTimeout(() => {
        if (!checkInterval) return; // Уже получили ответ
        
        clearInterval(checkInterval);
        console.log(`${LOG_PREFIX} Тайм-аут ожидания ответа (${RESPONSE_TIMEOUT / 1000} сек)`);
        
        // Пробуем получить ответ даже после тайм-аута
        const elements = DomUtils.findElements(RESPONSE_BLOCKS_SELECTOR);
        if (elements.length > initialCount) {
          const lastElement = elements[elements.length - 1];
          const responseText = extractResponseText(lastElement);
          finishWaiting(responseText, 'timeout');
        } else {
          this.showLoading(false);
          reject(new Error('Не получен ответ после ожидания'));
        }
      }, RESPONSE_TIMEOUT);
    });
  }
}

// Класс для управления загрузкой файлов
class FileManager {
  constructor(uiController) {
    this.uiController = uiController;
  }

  // Подготовка и загрузка файлов
  async uploadFiles(fileContents, fileNames) {
    if (!fileContents?.length) {
      console.log(`${LOG_PREFIX} Нет файлов для загрузки`);
      return false;
    }
    
    console.log(`${LOG_PREFIX} Подготовка к загрузке ${fileContents.length} файлов`);
    
    try {
      // Показываем индикатор загрузки
      this.uiController.showLoading(true);
      
      const fileInput = DomUtils.findElement(FILE_INPUT_SELECTOR);
      if (!fileInput) {
        throw new Error('Поле загрузки файлов не найдено');
      }

      // Очищаем input перед добавлением новых файлов
      fileInput.value = '';
      if (fileInput.value) {
        fileInput.type = "text";
        fileInput.type = "file";
      }

      // Создаем объект для имитации выбора файлов
      const dataTransfer = new DataTransfer();
      let filesConverted = 0;

      // Конвертируем base64 строки в файлы
      for (let i = 0; i < fileContents.length; i++) {
        try {
          if (!fileContents[i]) continue;
          
          // Декодируем Base64 в бинарные данные
          const byteCharacters = atob(fileContents[i]);
          
          // Преобразуем в Uint8Array
          const byteArray = new Uint8Array(byteCharacters.length);
          for (let j = 0; j < byteCharacters.length; j++) {
            byteArray[j] = byteCharacters.charCodeAt(j);
          }
          
          // Создаем файл
          const fileName = fileNames?.[i] || `file${i+1}.dat`;
          const file = new File(
            [new Blob([byteArray])], 
            fileName, 
            { type: 'application/octet-stream' }
          );
          
          // Добавляем файл
          dataTransfer.items.add(file);
          filesConverted++;
          
        } catch (error) {
          console.error(`${LOG_PREFIX} Ошибка конвертации файла ${i}`, error);
        }
      }

      if (filesConverted === 0) {
        throw new Error('Не удалось подготовить ни один файл');
      }

      // Применяем файлы к input элементу
      fileInput.files = dataTransfer.files;
      console.log(`${LOG_PREFIX} Подготовлено файлов: ${filesConverted}`);
      
      // Генерируем событие изменения
      fileInput.dispatchEvent(new Event('change', { bubbles: true }));
      
      // Ждем завершения загрузки и отправляем сообщение
      return this.waitForUploadAndSend();
    } catch (error) {
      console.error(`${LOG_PREFIX} Ошибка при подготовке файлов`, error);
      this.uiController.showLoading(false);
      return false;
    }
  }

  // Ожидание завершения загрузки файлов и отправка сообщения
  async waitForUploadAndSend() {
    console.log(`${LOG_PREFIX} Ожидание завершения загрузки файлов...`);
    
    const waitUpload = () => new Promise((resolve, reject) => {
      const checkInterval = setInterval(() => {
        try {
          // Если текст "Uploading" отсутствует, загрузка завершена
          if (!document.body.textContent.includes(UPLOADING_TEXT)) {
            clearInterval(checkInterval);
            resolve(true);
          }
        } catch (error) {
          clearInterval(checkInterval);
          reject(error);
        }
      }, FILE_UPLOAD_CHECK_INTERVAL);
      
      // Таймаут на случай зависания загрузки
      setTimeout(() => {
        clearInterval(checkInterval);
        reject(new Error('Тайм-аут ожидания загрузки файлов'));
      }, FILE_UPLOAD_TIMEOUT);
    });
    
    try {
      // Ждем завершения загрузки с таймаутом
      const promise = waitUpload();
      const timeout = new Promise((_, reject) => 
        setTimeout(() => reject(new Error(`Тайм-аут ожидания загрузки файлов (${FILE_UPLOAD_TIMEOUT / 1000} сек)`)), 
        FILE_UPLOAD_TIMEOUT)
      );
      
      await Promise.race([promise, timeout]);
      
      // Отправляем сообщение
      return await this.uiController.sendMessage();
    } catch (error) {
      console.error(`${LOG_PREFIX} Ошибка при ожидании загрузки файлов`, error);
      // Всё равно пробуем отправить сообщение
      return await this.uiController.sendMessage();
    }
  }
}

// Основной класс приложения для контент-скрипта
class ContentApp extends EventEmitter {
  constructor() {
    super();
    
    // Инициализация компонентов
    this.uiController = new UiController();
    this.fileManager = new FileManager(this.uiController);
    
    // Состояние проверки ответа
    this.isCheckingResponse = false;
    
    // Настройка обработчиков событий
    this.setupEventListeners();
  }
  
  /**
   * Настройка обработчиков событий
   */
  setupEventListeners() {
    // Слушаем события от UI контроллера
    this.uiController.on('messageSent', () => {
      this.checkForResponse();
    });
    
    // Слушаем сообщения от background-скрипта
    chrome.runtime.onMessage.addListener(this.handleBackgroundMessage.bind(this));
    
    console.log(`${LOG_PREFIX} ContentApp: обработчики событий настроены`);
  }

  /**
   * Обработка сообщений от background-скрипта
   * @param {Object} msg - сообщение
   */
  handleBackgroundMessage(msg) {
    if (!msg || !msg.message) {
      console.error(`${LOG_PREFIX} Некорректный формат сообщения`);
      return;
    }

    console.log(`${LOG_PREFIX} Получено сообщение от background-скрипта`);
    
    // Создаем новый чат и обрабатываем сообщение
    this.processMessage(msg);
  }
  
  /**
   * Обработка сообщения и его содержимого
   * @param {Object} msg - сообщение для обработки
   */
  async processMessage(msg) {
    try {
      // Создаем новый чат и вставляем сообщение
      await this.uiController.createNewChat();
      await this.uiController.setInputText(msg.message);
      
      // Обработка файлов или отправка сообщения
      if (msg.fileContents?.length > 0) {
        console.log(`${LOG_PREFIX} Обнаружены файлы (${msg.fileContents.length}), загружаем их`);
        await this.fileManager.uploadFiles(msg.fileContents, msg.fileNames);
      } else {
        console.log(`${LOG_PREFIX} Файлов нет, отправляем сообщение`);
        await this.uiController.sendMessage();
      }
    } catch (error) {
      console.error(`${LOG_PREFIX} Ошибка при обработке сообщения`, error);
    }
  }

  /**
   * Запуск проверки ответа
   */
  async checkForResponse() {
    if (this.isCheckingResponse) return;
    
    this.isCheckingResponse = true;
    
    try {
      // Ожидаем ответ от DeepSeek
      const responseText = await this.uiController.waitForResponse();
      
      // Отправляем ответ в background
      chrome.runtime.sendMessage({
        type: 'response_text',
        text: responseText
      });
      
      console.log(`${LOG_PREFIX} Ответ отправлен в background-скрипт`);
    } catch (error) {
      console.error(`${LOG_PREFIX} Ошибка при получении ответа`, error);
    } finally {
      this.isCheckingResponse = false;
    }
  }
}

// Создаем и инициализируем приложение
const app = new ContentApp();
console.log(`${LOG_PREFIX} ContentApp: инициализировано`); 