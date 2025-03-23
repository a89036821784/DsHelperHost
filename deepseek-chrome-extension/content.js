function handleMessage(msg) {
  console.log('[DS Helper] Received:', msg);
  
  // Проверка на существование объекта сообщения
  if (!msg || !msg.message) {
    console.error('[DS Helper] Invalid message format:', msg);
    return;
  }
  
  // Проверяем наличие ошибок Intercom
  if (window.Intercom && typeof window.Intercom === 'function') {
    console.log('[DS Helper] Intercom detected on page, continuing...');
  }
  
  // Обработка файлов, если они есть
  if (msg.fileContents && Array.isArray(msg.fileContents) && msg.fileContents.length > 0) {
    console.log('[DS Helper] Files detected:', msg.fileNames);
    handleFiles(msg.fileContents, msg.fileNames);
  }
  
  // В контент-скрипте нет прямого доступа к chrome.tabs API
  // Вместо прямого вызова chrome.tabs.query, работаем с DOM текущей страницы
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

// Добавим обработчик сообщений напрямую
chrome.runtime.onMessage.addListener(handleMessage); 