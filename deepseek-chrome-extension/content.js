// Функция для эмуляции клика на элемент "New chat"
function clickNewChat() {
  return new Promise((resolve) => {
    try {
      // Ищем div, первый дочерний элемент которого содержит текст "New chat" и является svg
      const elements = Array.from(document.querySelectorAll('div'));
      const newChatDiv = elements.find(div => {
        return div && div.firstChild && div.firstChild.tagName === 'svg' && div.textContent && div.textContent == "New chat";
      });

      if (newChatDiv) {
        console.log('[DS Helper] Found "New chat" element, clicking it');
        console.log('[DS Helper] ID of the clicked element:', newChatDiv.classList); // Выводи
        newChatDiv.click();
        console.log('[DS Helper] Clicked on "New chat" element');
      } else {
        console.warn('[DS Helper] Could not find element with "New chat" text');
      }

      // Ждем 500мс в любом случае, даже если элемент не найден
      setTimeout(() => {
        resolve();
      }, 500);
    } catch (error) {
      setTimeout(() => {
        resolve();
      }, 500);
    }
  });
}

// Вспомогательная функция для поиска кнопки отправки
function findSendButton() {
  // Найдем все элементы с role="button"
  const buttons = Array.from(document.querySelectorAll('div[role="button"]'));
  console.log('[DS Helper] Found', buttons.length, 'buttons with role="button"');
  
  // Выведем информацию о всех кнопках
  buttons.forEach((btn, index) => {
    console.log(`[DS Helper] Button #${index}:`, {
      'textContent': btn.textContent,
      'innerHTML': btn.innerHTML.substring(0, 50) + (btn.innerHTML.length > 50 ? '...' : ''),
      'aria-disabled': btn.getAttribute('aria-disabled'),
      'class': btn.className
    });
  });
  
  // Ищем кнопку отправки. Это обычно кнопка с пустым текстом или с SVG иконкой
  const sendButton = buttons.find(button => {
    // Кнопка с пустым текстом
    if (button.textContent === '') {
      return true;
    }
    
    // Кнопка может содержать только SVG иконку
    if (button.firstChild && button.firstChild.tagName === 'svg') {
      // Если текст после удаления пробелов пустой, это вероятно кнопка отправки
      const textWithoutSpaces = button.textContent.replace(/\s/g, '');
      if (textWithoutSpaces === '') {
        return true;
      }
    }
    
    return false;
  });
  
  return sendButton;
}

function handleMessage(msg) {
  console.log('[DS Helper] Received:', msg);

  // Проверка на существование объекта сообщения
  if (!msg || !msg.message) {
    console.error('[DS Helper] Invalid message format:', msg);
    return;
  }

  // Сначала кликаем на "New chat" и ждем 500мс
  clickNewChat().then(() => {
    // Продолжаем обработку сообщения после задержки

    // Проверяем наличие ошибок Intercom
    if (window.Intercom && typeof window.Intercom === 'function') {
      console.log('[DS Helper] Intercom detected on page, continuing...');
    }

    // Всегда вставляем текст сообщения, независимо от наличия файлов
    try {
      const inputElement = document.querySelector('textarea#chat-input');
      if (inputElement) {
        inputElement.value = msg.message;
        inputElement.innerText = msg.message;
        console.log('[DS Helper] Successfully set message to textarea');

        // Создаем и диспатчим события для уведомления страницы об изменении
        const inputEvent = new Event('input', { bubbles: true });
        const changeEvent = new Event('change', { bubbles: true });

        // Отправляем события
        inputElement.dispatchEvent(inputEvent);
        inputElement.dispatchEvent(changeEvent);

        console.log('[DS Helper] Input and change events dispatched for textarea');

        // Добавляем сообщение в innerText рядом с #chat-input
        const adjacentDiv = inputElement.nextElementSibling; // Предполагаем, что div находится рядом
        if (adjacentDiv) {
          adjacentDiv.innerText = msg.message;
          console.log('[DS Helper] Successfully set message to adjacent div');
        } else {
          console.error('[DS Helper] Could not find adjacent div next to textarea#chat-input');
        }
      } else {
        console.error('[DS Helper] Could not find textarea#chat-input on current page');
      }
    } catch (error) {
      console.error('[DS Helper] Error setting message:', error);
    }

    // Обработка файлов, если они есть
    if (msg.fileContents && Array.isArray(msg.fileContents) && msg.fileContents.length > 0) {
      console.log('[DS Helper] Files detected:', msg.fileNames);
      handleFiles(msg.fileContents, msg.fileNames);
    } else {
      // Если файлов нет, сразу кликаем на кнопку отправки
      console.log('[DS Helper] No files, clicking send button directly');
      
      // Находим кнопку отправки и кликаем на нее
      console.log('[DS Helper] Looking for send button...');
      const sendButton = findSendButton();
      
      if (sendButton) {
        console.log('[DS Helper] Found send button, clicking it...');
        console.log('[DS Helper] Send button details:', {
          'aria-disabled': sendButton.getAttribute('aria-disabled'),
          'class': sendButton.className,
          'id': sendButton.id,
          'attributes': Array.from(sendButton.attributes).map(attr => `${attr.name}=${attr.value}`).join(', ')
        });
        sendButton.click();
        console.log('[DS Helper] Send button clicked, will check for response...');
        
        // Запускаем проверку ответа
        checkForResponse();
      } else {
        console.error('[DS Helper] Could not find send button');
      }
    }
  });
}

// Функция для обработки файлов в формате base64
function handleFiles(fileContents, fileNames) {
  try {
    // Найти input с типом file на странице
    const fileInput = document.querySelector('input[type="file"]');

    if (!fileInput) {
      console.error('[DS Helper] Could not find file input on the page');
      return;
    }

    // Очищаем файлы в input перед добавлением новых
    fileInput.value = ''; // Очищаем input
    if (fileInput.value) {
      fileInput.type = "text";
      fileInput.type = "file";
    }

    // Создаем DataTransfer объект для имитации выбора файлов
    const dataTransfer = new DataTransfer();

    // Конвертируем base64 строки в файлы и добавляем их в DataTransfer
    for (let i = 0; i < fileContents.length; i++) {
      try {
        // Проверяем наличие данных
        if (!fileContents[i]) {
          console.error(`[DS Helper] Empty file content for index ${i}`);
          continue;
        }

        // Декодируем Base64 в бинарные данные безопасным способом
        let byteCharacters;
        try {
          byteCharacters = atob(fileContents[i]);
        } catch (e) {
          console.error(`[DS Helper] Failed to decode base64 for file ${i}:`, e);
          continue;
        }

        // Преобразование строки символов в массив байтов
        const byteNumbers = new Array(byteCharacters.length);
        for (let j = 0; j < byteCharacters.length; j++) {
          byteNumbers[j] = byteCharacters.charCodeAt(j);
        }

        // Создаем Uint8Array из массива байтов
        const byteArray = new Uint8Array(byteNumbers);

        // Создаем Blob из байтов
        const blob = new Blob([byteArray]);

        // Определяем имя файла
        const fileName = fileNames && fileNames[i] ? fileNames[i] : `file${i + 1}.dat`;

        // Создаем File из Blob
        const file = new File([blob], fileName, { type: blob.type || 'application/octet-stream' });

        // Добавляем файл в DataTransfer
        dataTransfer.items.add(file);
        console.log(`[DS Helper] File converted: ${fileName}, size: ${file.size} bytes`);
      } catch (error) {
        console.error(`[DS Helper] Error converting file ${i}:`, error);
      }
    }

    // Проверяем, что у нас есть файлы для добавления
    if (dataTransfer.files.length === 0) {
      console.error('[DS Helper] No files were successfully converted');
      return;
    }

    // Применяем файлы к input элементу
    try {
      fileInput.files = dataTransfer.files;
      console.log('[DS Helper] Files assigned to input element:', dataTransfer.files);

      // Вызываем события для input элемента, чтобы сообщить о изменениях
      const changeEvent = new Event('change', { bubbles: true });
      fileInput.dispatchEvent(changeEvent);
      
      // Запускаем проверку загрузки файлов и клик на кнопку отправки
      checkUploadAndClickSend();
    } catch (error) {
      console.error('[DS Helper] Error assigning files to input:', error);
      // Если программная установка не сработала, покажем уведомление пользователю
      if (fileNames && fileNames.length > 0) {
        alert(`Пожалуйста, загрузите следующие файлы вручную: ${fileNames.join(', ')}`);
      }
    }
  } catch (error) {
    console.error('[DS Helper] Error handling files:', error);
  }
}

// Глобальная переменная для отслеживания активности проверки ответа
let isCheckingResponse = false;

// Функция для ожидания ответа и получения текста из него
function waitForButtonEnabledAndGetResponse() {
  // Проверяем, не запущена ли уже проверка ответа
  if (isCheckingResponse) {
    console.log('[DS Helper] Already checking response, ignoring duplicate call');
    return;
  }
  
  isCheckingResponse = true;
  console.log('[DS Helper] Waiting for response...');
  
  // Найдем все элементы markdown на странице в начале
  const initialMarkdownElements = document.querySelectorAll('.ds-markdown.ds-markdown--block');
  const initialCount = initialMarkdownElements.length;
  console.log(`[DS Helper] Initial markdown elements count: ${initialCount}`);
  
  // Запоминаем последний элемент, чтобы потом найти новый
  const lastInitialElement = initialCount > 0 ? initialMarkdownElements[initialCount - 1] : null;
  console.log('[DS Helper] Last initial element:', lastInitialElement);
  
  // Переменная для хранения последнего текста
  let lastTextContent = '';
  let stableContentCounter = 0;
  
  // Начинаем проверять появление нового элемента каждые 500мс
  let checkInterval = setInterval(() => {
    // Получаем текущие элементы
    const currentMarkdownElements = document.querySelectorAll('.ds-markdown.ds-markdown--block');
    console.log(`[DS Helper] Current markdown elements count: ${currentMarkdownElements.length}, was: ${initialCount}`);
    
    // Если количество элементов увеличилось, или появился новый последний элемент
    if (currentMarkdownElements.length > initialCount) {
      console.log('[DS Helper] New markdown elements detected');
      
      // Получаем последний элемент
      const lastMarkdownElement = currentMarkdownElements[currentMarkdownElements.length - 1];
      
      // Проверяем, что это новый элемент
      if (lastInitialElement !== lastMarkdownElement) {
        // Получаем текущее содержимое
        const currentTextContent = lastMarkdownElement.textContent;
        const currentLength = currentTextContent.length;
        
        console.log(`[DS Helper] Current text length: ${currentLength}`);
        
        if (currentTextContent === lastTextContent) {
          // Контент не изменился, увеличиваем счетчик стабильности
          stableContentCounter++;
          console.log(`[DS Helper] Content stable for ${stableContentCounter} checks`);
          
          // Если контент стабилен в течение 5 проверок (2.5 секунды), считаем, что сообщение закончено
          if (stableContentCounter >= 5) {
            console.log('[DS Helper] Content appears to be complete (stable for 2.5s)');
            
            // Получаем HTML содержимое
            const htmlContent = lastMarkdownElement.innerHTML;
            console.log('[DS Helper] Raw HTML content (first 100 chars):', htmlContent.substring(0, 100) + '...');
            
            // Преобразуем HTML в текст, сохраняя параграфы
            // Создаем временный div для преобразования HTML в текст
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = htmlContent;
            
            // Получаем текст, заменяя теги <p> и <br> на переносы строк
            let responseText = '';
            Array.from(tempDiv.childNodes).forEach(node => {
              if (node.nodeType === Node.TEXT_NODE) {
                responseText += node.textContent;
              } else if (node.nodeType === Node.ELEMENT_NODE) {
                responseText += node.textContent + '\n\n';
              }
            });
            
            // Отправляем текст обратно в хост
            console.log('[DS Helper] Final response length:', responseText.length);
            console.log('[DS Helper] Extracted text (first 100 chars):', responseText.substring(0, 100) + '...');
            console.log('[DS Helper] Sending response back to host...');
            chrome.runtime.sendMessage({
              type: 'response_text',
              text: responseText.trim()
            }, function(response) {
              if (chrome.runtime.lastError) {
                console.error('[DS Helper] Error sending message:', chrome.runtime.lastError);
              } else {
                console.log('[DS Helper] Message successfully sent, response:', response);
              }
            });
            
            // Очищаем интервал и сбрасываем флаг проверки
            clearInterval(checkInterval);
            isCheckingResponse = false;
          }
        } else {
          // Контент изменился, сбрасываем счетчик стабильности
          console.log('[DS Helper] Content changed, resetting stability counter');
          stableContentCounter = 0;
          lastTextContent = currentTextContent;
        }
      } else {
        console.log('[DS Helper] Found the same last element as before, continuing to wait...');
      }
    } else {
      // Если количество элементов не изменилось
      console.log('[DS Helper] Waiting for new markdown elements to appear...');
      
      // Находим кнопку и логируем ее состояние для отладки
      const sendButton = findSendButton();
      if (sendButton) {
        console.log('[DS Helper] Button state during wait:', {
          'aria-disabled': sendButton.getAttribute('aria-disabled'),
          'class': sendButton.className
        });
      }
    }
  }, 500);
  
  // Устанавливаем таймаут через 120 секунд
  setTimeout(() => {
    if (!isCheckingResponse) {
      console.log('[DS Helper] Response check already completed, ignoring timeout');
      return;
    }
    
    clearInterval(checkInterval);
    console.error('[DS Helper] Timeout waiting for response after 120 seconds');
    
    // Попробуем все равно найти и извлечь содержимое
    const markdownElements = document.querySelectorAll('.ds-markdown.ds-markdown--block');
    if (markdownElements.length > initialCount) {
      console.log('[DS Helper] Found markdown elements after timeout, trying to extract content');
      const lastMarkdownElement = markdownElements[markdownElements.length - 1];
      
      // Получаем HTML содержимое
      const htmlContent = lastMarkdownElement.innerHTML;
      
      // Преобразуем HTML в текст, сохраняя параграфы
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = htmlContent;
      
      // Получаем текст, заменяя теги <p> и <br> на переносы строк
      let responseText = '';
      Array.from(tempDiv.childNodes).forEach(node => {
        if (node.nodeType === Node.TEXT_NODE) {
          responseText += node.textContent;
        } else if (node.nodeType === Node.ELEMENT_NODE) {
          responseText += node.textContent + '\n\n';
        }
      });
      
      // Отправляем текст обратно в хост
      console.log('[DS Helper] Timeout response length:', responseText.length);
      console.log('[DS Helper] Extracted text after timeout (first 100 chars):', responseText.substring(0, 100) + '...');
      chrome.runtime.sendMessage({
        type: 'response_text',
        text: responseText.trim()
      }, function(response) {
        if (chrome.runtime.lastError) {
          console.error('[DS Helper] Error sending message:', chrome.runtime.lastError);
        } else {
          console.log('[DS Helper] Message successfully sent, response:', response);
        }
      });
    }
    
    // Сбрасываем флаг проверки
    isCheckingResponse = false;
  }, 120000); // Увеличили таймаут до 2 минут для длинных ответов
}

// Функция для запуска проверки после отправки сообщения
function checkForResponse() {
  console.log('[DS Helper] Starting response check...');
  waitForButtonEnabledAndGetResponse();
}

// Модифицируем функцию проверки загрузки файлов, чтобы она запускала проверку ответа
function checkUploadAndClickSend() {
  console.log('[DS Helper] Starting upload check...');
  
  const checkInterval = setInterval(() => {
    try {
      // Проверяем, что текст "Uploading" отсутствует на странице
      if (!document.body.textContent.includes("Uploading")) {
        console.log('[DS Helper] Upload completed, finding send button...');
        
        // Находим кнопку отправки
        const sendButton = findSendButton();
        
        if (sendButton) {
          console.log('[DS Helper] Found send button with empty text, clicking it...');
          console.log('[DS Helper] Send button details:', {
            'aria-disabled': sendButton.getAttribute('aria-disabled'),
            'class': sendButton.className,
            'id': sendButton.id,
            'attributes': Array.from(sendButton.attributes).map(attr => `${attr.name}=${attr.value}`).join(', ')
          });
          sendButton.click();
          console.log('[DS Helper] Send button clicked');
          
          // Запускаем проверку ответа
          checkForResponse();
        } else {
          console.error('[DS Helper] Could not find send button (div[role="button"] with empty text)');
        }
        
        // Останавливаем интервал проверки
        clearInterval(checkInterval);
      } else {
        console.log('[DS Helper] Files are still uploading, waiting...');
      }
    } catch (error) {
      console.error('[DS Helper] Error in upload check:', error);
      clearInterval(checkInterval);
    }
  }, 1000); // Проверка каждую секунду
  
  // Останавливаем проверку после 30 секунд, чтобы избежать бесконечного цикла
  setTimeout(() => {
    if (checkInterval) {
      console.log('[DS Helper] Upload check timeout after 30 seconds');
      clearInterval(checkInterval);
    }
  }, 30000);
}

// Добавим обработчик сообщений напрямую
chrome.runtime.onMessage.addListener(handleMessage); 