/**
 * Модуль для управления пользовательским интерфейсом DeepSeek
 */
import { Config } from './config.js';
import { 
  Logger, 
  safeExecute, 
  safeAsync, 
  withTimeout, 
  DomUtils,
  EventEmitter 
} from './utils.js';

/**
 * Класс для управления UI-элементами DeepSeek
 */
export class UiController extends EventEmitter {
  constructor() {
    super();
    this.loadingIndicator = false;
  }

  /**
   * Поиск кнопки отправки сообщения
   * @returns {Element|null} кнопка отправки или null
   */
  findSendButton() {
    const buttons = DomUtils.findElements(Config.selectors.button);
    
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

  /**
   * Создание нового чата
   * @returns {Promise<void>}
   */
  async createNewChat() {
    Logger.info('Создание нового чата');
    
    return safeAsync(async () => {
      // Показываем индикатор загрузки
      this.showLoading(true);
      
      // Ищем кнопку "New chat" по тексту и SVG-иконке
      const elements = DomUtils.findElements('div');
      const newChatDiv = elements.find(div => 
        div?.firstChild?.tagName === 'svg' && div.textContent === Config.text.newChat
      );

      if (newChatDiv) {
        Logger.info('Найдена кнопка "New chat", нажимаем');
        newChatDiv.click();
      } else {
        Logger.warn('Кнопка "New chat" не найдена');
      }
      
      // В любом случае ждем заданное время
      await new Promise(resolve => setTimeout(resolve, Config.timers.newChatDelay));
      
      // Скрываем индикатор загрузки
      this.showLoading(false);
    }, 'Ошибка при создании нового чата');
  }

  /**
   * Вставка текста в поле ввода
   * @param {string} text - текст для вставки
   * @returns {Promise<boolean>} успешность операции
   */
  async setInputText(text) {
    return safeAsync(async () => {
      const inputElement = DomUtils.findElement(Config.selectors.chatInput);
      
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
      
      Logger.info('Сообщение вставлено в поле ввода');
      return true;
    }, 'Ошибка при вставке текста в поле ввода', 2);
  }

  /**
   * Отправка сообщения
   * @returns {Promise<boolean>} успешность операции
   */
  async sendMessage() {
    return safeAsync(async () => {
      this.showLoading(true);
      const sendButton = this.findSendButton();
      
      if (!sendButton) {
        throw new Error('Кнопка отправки не найдена');
      }
      
      sendButton.click();
      Logger.info('Сообщение отправлено');
      
      // Оповещаем о событии
      this.emit('messageSent');
      
      return true;
    }, 'Ошибка при отправке сообщения');
  }

  /**
   * Управление индикатором загрузки
   * @param {boolean} isLoading - показать/скрыть индикатор
   */
  showLoading(isLoading) {
    this.loadingIndicator = isLoading;
    this.emit('loadingChanged', isLoading);
    
    // Здесь можно реализовать визуальную индикацию процесса
    // Например, добавление/удаление класса к body или другому элементу
    safeExecute(() => {
      const loadingClass = 'ds-helper-loading';
      if (isLoading) {
        document.body.classList.add(loadingClass);
      } else {
        document.body.classList.remove(loadingClass);
      }
    }, 'Ошибка при обновлении индикатора загрузки');
  }

  /**
   * Ожидание и извлечение ответа DeepSeek
   * @returns {Promise<string>} текст ответа
   */
  async waitForResponse() {
    Logger.info('Ожидание ответа DeepSeek...');
    
    // Получаем начальное количество блоков с ответами
    const initialElements = DomUtils.findElements(Config.selectors.responseBlocks);
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
        Logger.info(`Ответ получен (${source})`);
        resolve(responseText);
      };
      
      // Проверяем появление нового ответа с заданным интервалом
      checkInterval = setInterval(() => {
        const currentElements = DomUtils.findElements(Config.selectors.responseBlocks);
        
        if (currentElements.length > initialCount) {
          // Получаем последний элемент с ответом
          const lastElement = currentElements[currentElements.length - 1];
          
          if (lastInitialElement !== lastElement) {
            const currentText = lastElement.textContent;
            
            if (currentText === lastTextContent) {
              // Контент стабилен, увеличиваем счетчик
              stableContentCounter++;
              
              // Если контент не менялся заданное количество проверок, считаем ответ законченным
              if (stableContentCounter >= Config.timers.stableResponseChecks) {
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
      }, Config.timers.responseCheckInterval);
      
      // Таймаут на случай долгого ответа
      setTimeout(() => {
        if (!checkInterval) return; // Уже получили ответ
        
        clearInterval(checkInterval);
        Logger.info(`Тайм-аут ожидания ответа (${Config.timers.responseTimeout / 1000} сек)`);
        
        // Пробуем получить ответ даже после тайм-аута
        const elements = DomUtils.findElements(Config.selectors.responseBlocks);
        if (elements.length > initialCount) {
          const lastElement = elements[elements.length - 1];
          const responseText = extractResponseText(lastElement);
          finishWaiting(responseText, 'timeout');
        } else {
          this.showLoading(false);
          reject(new Error('Не получен ответ после ожидания'));
        }
      }, Config.timers.responseTimeout);
    });
  }
} 