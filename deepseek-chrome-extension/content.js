/**
 * Константы для селекторов элементов DeepSeek
 */
// Селектор для textarea ввода сообщения
const CHAT_INPUT_SELECTOR = 'textarea#chat-input';

// Селектор для поля загрузки файлов
const FILE_INPUT_SELECTOR = 'input[type="file"]';

// Селектор для блоков ответов DeepSeek
const RESPONSE_BLOCKS_SELECTOR = '.ds-markdown.ds-markdown--block';

// Селектор для поиска кнопок (в том числе кнопки отправки)
const BUTTON_SELECTOR = 'div[role="button"]';

/**
 * Константы для текстовых меток и поиска элементов
 */
// Текст для определения наличия процесса загрузки файла
const UPLOADING_TEXT = 'Uploading';

// Текст для кнопки создания нового чата
const NEW_CHAT_TEXT = 'New chat';

/**
 * Константы для интервалов и таймаутов
 */
// Задержка после клика на кнопку "New Chat" (мс)
const NEW_CHAT_DELAY = 500;

// Интервал проверки загрузки файлов (мс)
const FILE_UPLOAD_CHECK_INTERVAL = 1000;

// Таймаут ожидания загрузки файлов (мс)
const FILE_UPLOAD_TIMEOUT = 30000; // 30 секунд

// Интервал проверки стабильности ответа (мс)
const RESPONSE_CHECK_INTERVAL = 500;

// Количество проверок для определения стабильности ответа
const STABLE_RESPONSE_CHECKS = 5;

// Таймаут ожидания ответа (мс)
const RESPONSE_TIMEOUT = 120000; // 2 минуты

/**
 * Другие константы
 */
// Префикс для всех логов расширения
const LOG_PREFIX = '[DS Helper]';

// Флаг для отслеживания проверки ответа
let isCheckingResponse = false;

// Функция для создания нового чата
function clickNewChat() {
  return new Promise((resolve) => {
    try {
      // Ищем кнопку "New chat" по тексту и SVG-иконке
      const elements = Array.from(document.querySelectorAll('div'));
      const newChatDiv = elements.find(div => 
        div?.firstChild?.tagName === 'svg' && div.textContent === NEW_CHAT_TEXT
      );

      if (newChatDiv) {
        console.log(`${LOG_PREFIX} Нажатие на кнопку "New chat"`);
        newChatDiv.click();
      } else {
        console.warn(`${LOG_PREFIX} Кнопка "New chat" не найдена`);
      }
    } catch (error) {
      console.error(`${LOG_PREFIX} Ошибка при создании нового чата:`, error);
    } finally {
      // В любом случае завершаем Promise через установленную задержку
      setTimeout(resolve, NEW_CHAT_DELAY);
    }
  });
}

// Поиск кнопки отправки
function findSendButton() {
  const buttons = Array.from(document.querySelectorAll(BUTTON_SELECTOR));
  
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

// Обработка сообщений от background script
function handleMessage(msg) {
  if (!msg || !msg.message) {
    console.error(`${LOG_PREFIX} Некорректный формат сообщения`);
    return;
  }

  // Создаем новый чат перед вставкой сообщения
  clickNewChat().then(() => {
    // Вставляем текст сообщения в поле ввода
    try {
      const inputElement = document.querySelector(CHAT_INPUT_SELECTOR);
      if (inputElement) {
        // Устанавливаем текст и генерируем события
        inputElement.value = msg.message;
        inputElement.innerText = msg.message;
        
        // Создаем события для имитации ввода пользователем
        inputElement.dispatchEvent(new Event('input', { bubbles: true }));
        inputElement.dispatchEvent(new Event('change', { bubbles: true }));
        
        // Обновляем текст в соседнем div (необходимо для корректного отображения)
        const adjacentDiv = inputElement.nextElementSibling;
        if (adjacentDiv) adjacentDiv.innerText = msg.message;
        
        console.log(`${LOG_PREFIX} Сообщение вставлено в поле ввода`);
      } else {
        console.error(`${LOG_PREFIX} Поле ввода не найдено`);
      }
    } catch (error) {
      console.error(`${LOG_PREFIX} Ошибка при вставке сообщения:`, error);
    }

    // Обработка файлов или отправка сообщения
    if (msg.fileContents?.length > 0) {
      console.log(`${LOG_PREFIX} Обнаружены файлы, загружаем их`);
      handleFiles(msg.fileContents, msg.fileNames);
    } else {
      console.log(`${LOG_PREFIX} Файлов нет, отправляем сообщение`);
      
      const sendButton = findSendButton();
      if (sendButton) {
        sendButton.click();
        console.log(`${LOG_PREFIX} Сообщение отправлено`);
        checkForResponse();
      } else {
        console.error(`${LOG_PREFIX} Кнопка отправки не найдена`);
      }
    }
  });
}

// Обработка файлов в формате base64
function handleFiles(fileContents, fileNames) {
  try {
    const fileInput = document.querySelector(FILE_INPUT_SELECTOR);
    if (!fileInput) {
      console.error(`${LOG_PREFIX} Поле загрузки файлов не найдено`);
      return;
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
        console.error(`${LOG_PREFIX} Ошибка конвертации файла ${i}:`, error);
      }
    }

    if (filesConverted === 0) {
      console.error(`${LOG_PREFIX} Не удалось подготовить ни один файл`);
      return;
    }

    // Применяем файлы к input элементу
    try {
      fileInput.files = dataTransfer.files;
      console.log(`${LOG_PREFIX} Загружено файлов: ${filesConverted}`);
      
      // Генерируем событие изменения
      fileInput.dispatchEvent(new Event('change', { bubbles: true }));
      
      // Ждем завершения загрузки и нажимаем кнопку отправки
      checkUploadAndClickSend();
    } catch (error) {
      console.error(`${LOG_PREFIX} Ошибка при установке файлов:`, error);
      if (fileNames?.length > 0) {
        alert(`Пожалуйста, загрузите файлы вручную: ${fileNames.join(', ')}`);
      }
    }
  } catch (error) {
    console.error(`${LOG_PREFIX} Ошибка обработки файлов:`, error);
  }
}

// Ожидание и извлечение ответа DeepSeek
function waitForButtonEnabledAndGetResponse() {
  if (isCheckingResponse) return;
  
  isCheckingResponse = true;
  console.log(`${LOG_PREFIX} Ожидание ответа DeepSeek...`);
  
  // Находим начальное количество блоков с ответами
  const initialElements = document.querySelectorAll(RESPONSE_BLOCKS_SELECTOR);
  const initialCount = initialElements.length;
  const lastInitialElement = initialCount > 0 ? initialElements[initialCount - 1] : null;
  
  let lastTextContent = '';
  let stableContentCounter = 0;
  
  // Проверяем появление нового ответа с заданным интервалом
  const checkInterval = setInterval(() => {
    const currentElements = document.querySelectorAll(RESPONSE_BLOCKS_SELECTOR);
    
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
            console.log(`${LOG_PREFIX} Ответ получен (стабилен ${(STABLE_RESPONSE_CHECKS * RESPONSE_CHECK_INTERVAL) / 1000}с)`);
            
            // Извлекаем текст с сохранением форматирования
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = lastElement.innerHTML;
            
            let responseText = '';
            Array.from(tempDiv.childNodes).forEach(node => {
              if (node.nodeType === Node.TEXT_NODE) {
                responseText += node.textContent;
              } else if (node.nodeType === Node.ELEMENT_NODE) {
                responseText += node.textContent + '\n\n';
              }
            });
            
            // Отправляем текст обратно в расширение
            chrome.runtime.sendMessage({
              type: 'response_text',
              text: responseText.trim()
            });
            
            clearInterval(checkInterval);
            isCheckingResponse = false;
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
    if (!isCheckingResponse) return;
    
    clearInterval(checkInterval);
    console.log(`${LOG_PREFIX} Тайм-аут ожидания ответа (${RESPONSE_TIMEOUT / 1000} сек)`);
    
    // Пробуем получить ответ даже после тайм-аута
    const elements = document.querySelectorAll(RESPONSE_BLOCKS_SELECTOR);
    if (elements.length > initialCount) {
      const lastElement = elements[elements.length - 1];
      
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = lastElement.innerHTML;
      
      let responseText = '';
      Array.from(tempDiv.childNodes).forEach(node => {
        if (node.nodeType === Node.TEXT_NODE) {
          responseText += node.textContent;
        } else if (node.nodeType === Node.ELEMENT_NODE) {
          responseText += node.textContent + '\n\n';
        }
      });
      
      chrome.runtime.sendMessage({
        type: 'response_text',
        text: responseText.trim()
      });
    }
    
    isCheckingResponse = false;
  }, RESPONSE_TIMEOUT);
}

// Запуск проверки ответа
function checkForResponse() {
  waitForButtonEnabledAndGetResponse();
}

// Проверка завершения загрузки файлов и отправка сообщения
function checkUploadAndClickSend() {
  console.log(`${LOG_PREFIX} Проверка загрузки файлов...`);
  
  const checkInterval = setInterval(() => {
    try {
      // Если текст "Uploading" отсутствует, значит загрузка завершена
      if (!document.body.textContent.includes(UPLOADING_TEXT)) {
        const sendButton = findSendButton();
        
        if (sendButton) {
          sendButton.click();
          console.log(`${LOG_PREFIX} Сообщение с файлами отправлено`);
          checkForResponse();
        } else {
          console.error(`${LOG_PREFIX} Кнопка отправки не найдена`);
        }
        
        clearInterval(checkInterval);
      }
    } catch (error) {
      console.error(`${LOG_PREFIX} Ошибка при проверке загрузки:`, error);
      clearInterval(checkInterval);
    }
  }, FILE_UPLOAD_CHECK_INTERVAL);
  
  // Прекращаем проверку через заданный таймаут
  setTimeout(() => {
    if (checkInterval) {
      clearInterval(checkInterval);
    }
  }, FILE_UPLOAD_TIMEOUT);
}

// Регистрируем обработчик сообщений
chrome.runtime.onMessage.addListener(handleMessage); 