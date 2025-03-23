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

        _watcher.Changed += (s, e) =>
        {
            try
            {
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
            var buffer = new byte[4];
            while (_isRunning)
            {
                try
                {
                    if (Console.OpenStandardInput().Read(buffer, 0, 4) == 0)
                    {
                        LogMessage("[DsHelperHost] Extension disconnected");
                        _isRunning = false;
                    }
                }
                catch (Exception ex)
                {
                    LogMessage($"[DsHelperHost] Input error: {ex}");
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

                    int length = BitConverter.ToInt32(lengthBytes, 0);
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

                    var message = Encoding.UTF8.GetString(messageBytes);
                    LogMessage($"[DsHelperHost] Received: {message}");
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