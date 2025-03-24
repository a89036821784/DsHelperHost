using System;
using System.IO;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using System.Runtime.InteropServices;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using Newtonsoft.Json;

class Program
{
    private static bool _isRunning = true;
    private static FileSystemWatcher _watcher;
    private static readonly object _logLock = new object();

    [DllImport("msvcrt.dll", CallingConvention = CallingConvention.Cdecl)]
    private static extern int _setmode(int fd, int mode);

    private const int O_BINARY = 0x8000;
    private const int STDIN_FILENO = 0;
    private const int STDOUT_FILENO = 1;

    static async Task Main()
    {
        // Установка бинарного режима для ввода/вывода
        _setmode(STDIN_FILENO, O_BINARY);
        _setmode(STDOUT_FILENO, O_BINARY);

        Console.OutputEncoding = Encoding.UTF8;
        Console.InputEncoding = Encoding.UTF8;

        try
        {
            LogMessage("[DsHelperHost] Starting...");
            SetupFileWatcher();
            StartInputListening();
            ReadFromExtension();
            LogMessage("[DsHelperHost] Ready");

            while (_isRunning)
            {
                await Task.Delay(1000);
            }
        }
        catch (Exception ex)
        {
            LogMessage($"[DsHelperHost] Critical error: {ex}");
        }
        finally
        {
            _watcher?.Dispose();
            LogMessage("[DsHelperHost] Stopped");
        }
    }

    private static void SetupFileWatcher()
    {
        _watcher = new FileSystemWatcher(@"C:\Temp", "command.txt")
        {
            NotifyFilter = NotifyFilters.LastWrite,
            EnableRaisingEvents = true
        };

        // Добавляем таймер для контроля частоты обработки событий
        var lastProcessTime = DateTime.MinValue;
        var minTimeBetweenEvents = TimeSpan.FromMilliseconds(500);

        _watcher.Changed += (s, e) =>
        {
            try
            {
                // Проверяем, прошло ли достаточно времени с момента последней обработки
                var now = DateTime.Now;
                if (now - lastProcessTime < minTimeBetweenEvents)
                {
                    LogMessage("[DsHelperHost] Пропуск дублирующего события изменения файла");
                    return;
                }
                
                lastProcessTime = now;
                string content = null;
                for (int i = 0; i < 5; i++)
                {
                    try
                    {
                        content = File.ReadAllText(e.FullPath);
                        break;
                    }
                    catch (IOException)
                    {
                        Thread.Sleep(200);
                    }
                }

                if (content == null)
                {
                    LogMessage("[DsHelperHost] Failed to read file");
                    return;
                }

                SendToExtension(content.Trim());
            }
            catch (Exception ex)
            {
                LogMessage($"[DsHelperHost] File error: {ex}");
            }
        };
    }

    private static void StartInputListening()
    {
        new Thread(() =>
        {
            // Вместо того, чтобы активно читать из stdin,
            // просто проверяем, запущено ли приложение, раз в секунду
            while (_isRunning)
            {
                try
                {
                    // Просто проверяем состояние приложения и спим 1 секунду
                    Thread.Sleep(1000);
                }
                catch (Exception ex)
                {
                    LogMessage($"[DsHelperHost] Keep-alive thread error: {ex}");
                    _isRunning = false;
                }
            }
        }).Start();
    }

    private static void SendToExtension(string message)
    {
        try
        {
            // Обработка сообщения, чтобы извлечь пути к файлам
            var lines = message.Split(new[] { '\r', '\n' }, StringSplitOptions.RemoveEmptyEntries);
            var filesList = new List<string>();
            var fileContents = new List<string>();
            var fileNames = new List<string>();
            var messageLines = new List<string>();
            
            foreach (var line in lines)
            {
                if (File.Exists(line.Trim()))
                {
                    string filePath = line.Trim();
                    filesList.Add(filePath);
                    
                    try
                    {
                        // Конвертируем файл в base64
                        byte[] fileBytes = File.ReadAllBytes(filePath);
                        string base64Content = Convert.ToBase64String(fileBytes);
                        fileContents.Add(base64Content);
                        
                        // Сохраняем имя файла
                        fileNames.Add(Path.GetFileName(filePath));
                    }
                    catch (Exception ex)
                    {
                        LogMessage($"[DsHelperHost] Error reading file {filePath}: {ex.Message}");
                    }
                }
                else
                {
                    messageLines.Add(line);
                }
            }
            
            // Собираем обработанный текст сообщения
            string messageText = string.Join(Environment.NewLine, messageLines);
            
            // Создаем анонимный объект для сериализации в JSON
            var jsonObject = new
            {
                message = messageText,
                timestamp = DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss"),
                filePaths = filesList.ToArray(),
                fileNames = fileNames.ToArray(),
                fileContents = fileContents.ToArray()
            };
            
            // Сериализуем объект в JSON строку
            string jsonMessage = JsonConvert.SerializeObject(jsonObject);

            var bytes = Encoding.UTF8.GetBytes(jsonMessage);

            if (bytes.Length > 1024 * 1024)
            {
                LogMessage($"[DsHelperHost] Message too long: {bytes.Length} bytes");
                return;
            }

            byte[] lengthBytes = BitConverter.GetBytes(bytes.Length);
            if (!BitConverter.IsLittleEndian)
            {
                Array.Reverse(lengthBytes);
            }

            lock (_logLock)
            {
                using var stdout = Console.OpenStandardOutput();
                stdout.Write(lengthBytes, 0, 4);
                stdout.Write(bytes, 0, bytes.Length);
                stdout.Flush();
            }

            LogMessage($"[DsHelperHost] Sent message with {filesList.Count} files");
        }
        catch (Exception ex)
        {
            LogMessage($"[DsHelperHost] Write error: {ex}");
            _isRunning = false;
        }
    }

    private static void ReadFromExtension()
    {
        new Thread(() =>
        {
            while (_isRunning)
            {
                try
                {
                    var stdin = Console.OpenStandardInput();
                    var lengthBytes = new byte[4];

                    int bytesRead = 0;
                    while (bytesRead < 4 && _isRunning)
                    {
                        int read = stdin.Read(lengthBytes, bytesRead, 4 - bytesRead);
                        if (read == 0) break;
                        bytesRead += read;
                    }

                    if (!_isRunning) break;

                    // Логирование байтов длины для диагностики
                    LogMessage($"[DsHelperHost] Raw length bytes: {BitConverter.ToString(lengthBytes)}");
                    
                    // Проверка на начало JSON (если первый байт - '{')
                    if (lengthBytes[0] == '{')
                    {
                        LogMessage("[DsHelperHost] Detected direct JSON message without length prefix");
                        
                        // Создаем новый буфер для хранения полного сообщения
                        const int maxMsgLength = 1024 * 1024; // 1 МБ максимум
                        var fullMessageBuffer = new byte[maxMsgLength];
                        
                        // Копируем первые 4 байта в начало буфера
                        Array.Copy(lengthBytes, 0, fullMessageBuffer, 0, 4);
                        
                        // Считываем остаток сообщения
                        int totalBytesRead = 4;
                        bool endOfJsonFound = false;
                        int braceCount = 1; // Счетчик открытых фигурных скобок
                        
                        while (totalBytesRead < maxMsgLength && !endOfJsonFound)
                        {
                            int bytesReadNow = stdin.Read(fullMessageBuffer, totalBytesRead, 1);
                            if (bytesReadNow == 0) break;
                            
                            // Учитываем вложенные структуры JSON
                            if (fullMessageBuffer[totalBytesRead] == '{')
                            {
                                braceCount++;
                            }
                            else if (fullMessageBuffer[totalBytesRead] == '}')
                            {
                                braceCount--;
                                // Когда закрывающих скобок столько же, сколько и открывающих - конец JSON
                                if (braceCount == 0)
                                {
                                    endOfJsonFound = true;
                                    totalBytesRead++; // Включаем закрывающую скобку
                                    break;
                                }
                            }
                            
                            totalBytesRead++;
                        }
                        
                        LogMessage($"[DsHelperHost] Read direct JSON message of {totalBytesRead} bytes");
                        
                        // Создаем массив нужного размера и копируем данные
                        var bytes = new byte[totalBytesRead];
                        Array.Copy(fullMessageBuffer, 0, bytes, 0, totalBytesRead);
                        
                        var message2 = Encoding.UTF8.GetString(bytes);
                        LogMessage($"[DsHelperHost] Received direct JSON: {message2.Substring(0, Math.Min(message2.Length, 100))}...");
                        
                        // Теперь обрабатываем сообщение как обычно
                        try {
                            // Десериализуем JSON
                            var messageObj = JsonConvert.DeserializeObject<dynamic>(message2);
                            
                            // Проверяем тип сообщения
                            if (messageObj != null && messageObj.type != null && messageObj.type.ToString() == "response_text") {
                                LogMessage("[DsHelperHost] Received response_text message");
                                
                                string responseText = messageObj.text.ToString();
                                LogMessage($"[DsHelperHost] Response text length: {responseText.Length}");
                                
                                // Создаем директорию C:\Temp, если она не существует
                                string outputDir = @"C:\Temp";
                                if (!Directory.Exists(outputDir)) {
                                    LogMessage($"[DsHelperHost] Creating directory: {outputDir}");
                                    Directory.CreateDirectory(outputDir);
                                }
                                
                                // Сохраняем текст в файл
                                string outputPath = Path.Combine(outputDir, "output.txt");
                                LogMessage($"[DsHelperHost] Writing to file: {outputPath}");
                                
                                try {
                                    File.WriteAllText(outputPath, responseText);
                                    LogMessage($"[DsHelperHost] Successfully saved response text to {outputPath} ({responseText.Length} chars)");
                                } catch (Exception fileEx) {
                                    LogMessage($"[DsHelperHost] Error writing to file {outputPath}: {fileEx.Message}");
                                    
                                    // Попытка альтернативного сохранения
                                    try {
                                        string desktopPath = Environment.GetFolderPath(Environment.SpecialFolder.Desktop);
                                        string alternatePath = Path.Combine(desktopPath, "deepseek_output.txt");
                                        LogMessage($"[DsHelperHost] Trying alternative location: {alternatePath}");
                                        
                                        File.WriteAllText(alternatePath, responseText);
                                        LogMessage($"[DsHelperHost] Successfully saved to alternative location: {alternatePath}");
                                    } catch (Exception altEx) {
                                        LogMessage($"[DsHelperHost] Failed to save to alternative location: {altEx.Message}");
                                    }
                                }
                            } else {
                                LogMessage($"[DsHelperHost] Received non-response message type: {(messageObj?.type ?? "null")}");
                            }
                        } catch (Exception ex) {
                            LogMessage($"[DsHelperHost] Error processing direct JSON response: {ex.Message}");
                            LogMessage($"[DsHelperHost] Stack trace: {ex.StackTrace}");
                        }
                        
                        continue; // Продолжаем цикл чтения
                    }
                    
                    // Проверяем порядок байтов - если система не little-endian, меняем порядок
                    if (!BitConverter.IsLittleEndian)
                    {
                        Array.Reverse(lengthBytes);
                        LogMessage("[DsHelperHost] Reversed bytes due to big-endian system");
                    }

                    int length = BitConverter.ToInt32(lengthBytes, 0);
                    LogMessage($"[DsHelperHost] Calculated message length: {length}");
                    
                    if (length < 0 || length > 1024 * 1024)
                    {
                        LogMessage($"[DsHelperHost] Invalid message length: {length}");
                        _isRunning = false;
                        break;
                    }

                    var messageBytes = new byte[length];
                    bytesRead = 0;
                    while (bytesRead < length && _isRunning)
                    {
                        int read = stdin.Read(messageBytes, bytesRead, length - bytesRead);
                        if (read == 0) break;
                        bytesRead += read;
                    }

                    if (!_isRunning) break;

                    // Добавляем логирование полной длины прочитанных данных
                    LogMessage($"[DsHelperHost] Actually read {bytesRead} bytes");
                    
                    var message = Encoding.UTF8.GetString(messageBytes);
                    LogMessage($"[DsHelperHost] Received: {message.Substring(0, Math.Min(message.Length, 100))}...");
                    
                    // Обработка ответа от расширения
                    try {
                        // Проверка на корректность JSON
                        if (string.IsNullOrWhiteSpace(message))
                        {
                            LogMessage("[DsHelperHost] Error: Received empty message");
                            continue;
                        }
                        
                        // Проверка на валидность JSON перед десериализацией
                        try
                        {
                            // Простая проверка синтаксиса JSON
                            if (!message.TrimStart().StartsWith("{") || !message.TrimEnd().EndsWith("}"))
                            {
                                LogMessage("[DsHelperHost] Error: Message is not valid JSON");
                                continue;
                            }
                        }
                        catch (Exception jsonEx)
                        {
                            LogMessage($"[DsHelperHost] Error checking JSON format: {jsonEx.Message}");
                        }
                        
                        // Десериализуем JSON
                        var messageObj = JsonConvert.DeserializeObject<dynamic>(message);
                        
                        // Проверяем тип сообщения
                        if (messageObj != null && messageObj.type != null && messageObj.type.ToString() == "response_text") {
                            LogMessage("[DsHelperHost] Received response_text message");
                            
                            string responseText = messageObj.text.ToString();
                            LogMessage($"[DsHelperHost] Response text length: {responseText.Length}");
                            
                            // Создаем директорию C:\Temp, если она не существует
                            string outputDir = @"C:\Temp";
                            if (!Directory.Exists(outputDir)) {
                                LogMessage($"[DsHelperHost] Creating directory: {outputDir}");
                                Directory.CreateDirectory(outputDir);
                            }
                            
                            // Сохраняем текст в файл
                            string outputPath = Path.Combine(outputDir, "output.txt");
                            LogMessage($"[DsHelperHost] Writing to file: {outputPath}");
                            
                            try {
                                File.WriteAllText(outputPath, responseText);
                                LogMessage($"[DsHelperHost] Successfully saved response text to {outputPath} ({responseText.Length} chars)");
                            } catch (Exception fileEx) {
                                LogMessage($"[DsHelperHost] Error writing to file {outputPath}: {fileEx.Message}");
                                
                                // Попытка альтернативного сохранения
                                try {
                                    string desktopPath = Environment.GetFolderPath(Environment.SpecialFolder.Desktop);
                                    string alternatePath = Path.Combine(desktopPath, "deepseek_output.txt");
                                    LogMessage($"[DsHelperHost] Trying alternative location: {alternatePath}");
                                    
                                    File.WriteAllText(alternatePath, responseText);
                                    LogMessage($"[DsHelperHost] Successfully saved to alternative location: {alternatePath}");
                                } catch (Exception altEx) {
                                    LogMessage($"[DsHelperHost] Failed to save to alternative location: {altEx.Message}");
                                }
                            }
                        } else {
                            LogMessage($"[DsHelperHost] Received non-response message type: {(messageObj?.type ?? "null")}");
                        }
                    } catch (Exception ex) {
                        LogMessage($"[DsHelperHost] Error processing response: {ex.Message}");
                        LogMessage($"[DsHelperHost] Stack trace: {ex.StackTrace}");
                    }
                }
                catch (Exception ex)
                {
                    LogMessage($"[DsHelperHost] Read error: {ex}");
                    _isRunning = false;
                }
            }
        }).Start();
    }

    private static void LogMessage(string message)
    {
        lock (_logLock)
        {
            File.AppendAllText("error.log",
                $"{DateTime.Now:yyyy-MM-dd HH:mm:ss.fff} - {message}{Environment.NewLine}");
        }
    }
}