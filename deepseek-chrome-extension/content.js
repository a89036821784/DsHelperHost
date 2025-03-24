// Функция для создания нового чата
function clickNewChat() {
  return new Promise((resolve) => {
    try {
      // Ищем кнопку "New chat" по тексту и SVG-иконке
      const elements = Array.from(document.querySelectorAll('div'));
      const newChatDiv = elements.find(div => 
        div?.firstChild?.tagName === 'svg' && div.textContent === "New chat"
      );

      if (newChatDiv) {
        console.log('[DS Helper] Нажатие на кнопку "New chat"');
        newChatDiv.click();
      } else {
        console.warn('[DS Helper] Кнопка "New chat" не найдена');
      }
    } catch (error) {
      console.error('[DS Helper] Ошибка при создании нового чата:', error);
    } finally {
      // В любом случае завершаем Promise через 500мс
      setTimeout(resolve, 500);
    }
  });
}

// Поиск кнопки отправки
function findSendButton() {
  const buttons = Array.from(document.querySelectorAll('div[role="button"]'));
  
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
    console.error('[DS Helper] Некорректный формат сообщения');
    return;
  }

  // Создаем новый чат перед вставкой сообщения
  clickNewChat().then(() => {
    // Вставляем текст сообщения в поле ввода
    try {
      const inputElement = document.querySelector('textarea#chat-input');
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
        
        console.log('[DS Helper] Сообщение вставлено в поле ввода');
      } else {
        console.error('[DS Helper] Поле ввода не найдено');
      }
    } catch (error) {
      console.error('[DS Helper] Ошибка при вставке сообщения:', error);
    }

    // Обработка файлов или отправка сообщения
    if (msg.fileContents?.length > 0) {
      console.log('[DS Helper] Обнаружены файлы, загружаем их');
      handleFiles(msg.fileContents, msg.fileNames);
    } else {
      console.log('[DS Helper] Файлов нет, отправляем сообщение');
      
      const sendButton = findSendButton();
      if (sendButton) {
        sendButton.click();
        console.log('[DS Helper] Сообщение отправлено');
        checkForResponse();
      } else {
        console.error('[DS Helper] Кнопка отправки не найдена');
      }
    }
  });
}

// Обработка файлов в формате base64
function handleFiles(fileContents, fileNames) {
  try {
    const fileInput = document.querySelector('input[type="file"]');
    if (!fileInput) {
      console.error('[DS Helper] Поле загрузки файлов не найдено');
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
        console.error(`[DS Helper] Ошибка конвертации файла ${i}:`, error);
      }
    }

    if (filesConverted === 0) {
      console.error('[DS Helper] Не удалось подготовить ни один файл');
      return;
    }

    // Применяем файлы к input элементу
    try {
      fileInput.files = dataTransfer.files;
      console.log(`[DS Helper] Загружено файлов: ${filesConverted}`);
      
      // Генерируем событие изменения
      fileInput.dispatchEvent(new Event('change', { bubbles: true }));
      
      // Ждем завершения загрузки и нажимаем кнопку отправки
      checkUploadAndClickSend();
    } catch (error) {
      console.error('[DS Helper] Ошибка при установке файлов:', error);
      if (fileNames?.length > 0) {
        alert(`Пожалуйста, загрузите файлы вручную: ${fileNames.join(', ')}`);
      }
    }
  } catch (error) {
    console.error('[DS Helper] Ошибка обработки файлов:', error);
  }
}

// Флаг для отслеживания проверки ответа
let isCheckingResponse = false;

// Ожидание и извлечение ответа DeepSeek
function waitForButtonEnabledAndGetResponse() {
  if (isCheckingResponse) return;
  
  isCheckingResponse = true;
  console.log('[DS Helper] Ожидание ответа DeepSeek...');
  
  // Находим начальное количество блоков с ответами
  const initialElements = document.querySelectorAll('.ds-markdown.ds-markdown--block');
  const initialCount = initialElements.length;
  const lastInitialElement = initialCount > 0 ? initialElements[initialCount - 1] : null;
  
  let lastTextContent = '';
  let stableContentCounter = 0;
  
  // Проверяем появление нового ответа каждые 500мс
  const checkInterval = setInterval(() => {
    const currentElements = document.querySelectorAll('.ds-markdown.ds-markdown--block');
    
    if (currentElements.length > initialCount) {
      // Получаем последний элемент с ответом
      const lastElement = currentElements[currentElements.length - 1];
      
      if (lastInitialElement !== lastElement) {
        const currentText = lastElement.textContent;
        
        if (currentText === lastTextContent) {
          // Контент стабилен, увеличиваем счетчик
          stableContentCounter++;
          
          // Если контент не менялся 2.5 секунды (5 проверок), считаем ответ законченным
          if (stableContentCounter >= 5) {
            console.log('[DS Helper] Ответ получен (стабилен 2.5с)');
            
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
  }, 500);
  
  // Таймаут на случай долгого ответа
  setTimeout(() => {
    if (!isCheckingResponse) return;
    
    clearInterval(checkInterval);
    console.log('[DS Helper] Тайм-аут ожидания ответа (2 мин)');
    
    // Пробуем получить ответ даже после тайм-аута
    const elements = document.querySelectorAll('.ds-markdown.ds-markdown--block');
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
  }, 120000); // 2 минуты
}

// Запуск проверки ответа
function checkForResponse() {
  waitForButtonEnabledAndGetResponse();
}

// Проверка завершения загрузки файлов и отправка сообщения
function checkUploadAndClickSend() {
  console.log('[DS Helper] Проверка загрузки файлов...');
  
  const checkInterval = setInterval(() => {
    try {
      // Если текст "Uploading" отсутствует, значит загрузка завершена
      if (!document.body.textContent.includes("Uploading")) {
        const sendButton = findSendButton();
        
        if (sendButton) {
          sendButton.click();
          console.log('[DS Helper] Сообщение с файлами отправлено');
          checkForResponse();
        } else {
          console.error('[DS Helper] Кнопка отправки не найдена');
        }
        
        clearInterval(checkInterval);
      }
    } catch (error) {
      console.error('[DS Helper] Ошибка при проверке загрузки:', error);
      clearInterval(checkInterval);
    }
  }, 1000);
  
  // Прекращаем проверку через 30 секунд
  setTimeout(() => {
    if (checkInterval) {
      clearInterval(checkInterval);
    }
  }, 30000);
}

// Регистрируем обработчик сообщений
chrome.runtime.onMessage.addListener(handleMessage); 