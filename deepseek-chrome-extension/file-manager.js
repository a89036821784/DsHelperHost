/**
 * Модуль для работы с файлами и их загрузкой в DeepSeek
 */
import { Config } from './config.js';
import { 
  Logger, 
  safeExecute, 
  safeAsync, 
  withTimeout, 
  DomUtils 
} from './utils.js';

/**
 * Класс для управления загрузкой файлов
 */
export class FileManager {
  constructor(uiController) {
    this.uiController = uiController;
  }

  /**
   * Подготовка и загрузка файлов
   * @param {string[]} fileContents - содержимое файлов в формате base64
   * @param {string[]} fileNames - имена файлов
   * @returns {Promise<boolean>} успешность загрузки
   */
  async uploadFiles(fileContents, fileNames) {
    if (!fileContents?.length) {
      Logger.info('Нет файлов для загрузки');
      return false;
    }
    
    Logger.info(`Подготовка к загрузке ${fileContents.length} файлов`);
    
    return safeAsync(async () => {
      // Показываем индикатор загрузки
      this.uiController.showLoading(true);
      
      const fileInput = DomUtils.findElement(Config.selectors.fileInput);
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
          Logger.error(`Ошибка конвертации файла ${i}`, error);
        }
      }

      if (filesConverted === 0) {
        throw new Error('Не удалось подготовить ни один файл');
      }

      // Применяем файлы к input элементу
      fileInput.files = dataTransfer.files;
      Logger.info(`Подготовлено файлов: ${filesConverted}`);
      
      // Генерируем событие изменения
      fileInput.dispatchEvent(new Event('change', { bubbles: true }));
      
      // Ждем завершения загрузки и отправляем сообщение
      return this.waitForUploadAndSend();
    }, 'Ошибка при подготовке файлов');
  }

  /**
   * Ожидание завершения загрузки файлов и отправка сообщения
   * @returns {Promise<boolean>} успешность операции
   */
  async waitForUploadAndSend() {
    Logger.info('Ожидание завершения загрузки файлов...');
    
    const waitUpload = () => new Promise((resolve, reject) => {
      const checkInterval = setInterval(() => {
        try {
          // Если текст "Uploading" отсутствует, загрузка завершена
          if (!document.body.textContent.includes(Config.text.uploading)) {
            clearInterval(checkInterval);
            resolve(true);
          }
        } catch (error) {
          clearInterval(checkInterval);
          reject(error);
        }
      }, Config.timers.uploadCheckInterval);
      
      // Таймаут на случай зависания загрузки
      setTimeout(() => {
        clearInterval(checkInterval);
        reject(new Error('Тайм-аут ожидания загрузки файлов'));
      }, Config.timers.uploadTimeout);
    });
    
    try {
      // Ждем завершения загрузки с таймаутом
      await withTimeout(
        waitUpload(),
        Config.timers.uploadTimeout,
        `Тайм-аут ожидания загрузки файлов (${Config.timers.uploadTimeout / 1000} сек)`
      );
      
      // Отправляем сообщение
      return await this.uiController.sendMessage();
    } catch (error) {
      Logger.error('Ошибка при ожидании загрузки файлов', error);
      // Всё равно пробуем отправить сообщение
      return await this.uiController.sendMessage();
    }
  }
} 