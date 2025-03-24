using System;
using System.IO;
using System.Text.RegularExpressions;
using System.Collections.Generic;

class Program
{
    private const string SourceFile = @"C:\Book\command_source.txt";
    private const string DestinationFile = @"C:\Book\command.txt";
    private const string AttachmentFile = @"C:\Book\attach.txt";
    private const string SuccessMessage = "Изменения успешно перенесены из {0} в {1}.";
    private const string ErrorMessage = "Произошла ошибка: {0}";
    private static int commandIncrement = 1; // Инкремент тестовой команды

    static void Main(string[] args)
    {
        try
        {
            // Проверка существования файла command_source.txt
            if (!File.Exists(SourceFile))
            {
                // Создание файла и запись тестовой команды
                File.WriteAllText(SourceFile, $"Тестовая команда {commandIncrement}");
                commandIncrement++; // Увеличение инкремента
            }

            // Чтение содержимого из command_source.txt
            string content = File.ReadAllText(SourceFile);

            // Проверка наличия ссылок на файлы в начале текста
            List<string> fileLinks = new List<string>();
            string processedContent = ProcessFileLinks(content, fileLinks);

            if (fileLinks.Count == 0)
            {
                fileLinks.Add(AttachmentFile);
            }

            // Добавление ссылки на файл attach.txt в начало сообщения
            if (!File.Exists(AttachmentFile))
            {
                File.WriteAllText(AttachmentFile, "файл аттача");
            }

            foreach (string link in fileLinks)
            {
                // Добавляем путь к файлу в начало сообщения
                processedContent = link + "\n" + processedContent;
            }

            // Запись обработанного содержимого в command.txt
            File.WriteAllText(DestinationFile, processedContent);

            Console.WriteLine(string.Format(SuccessMessage, Path.GetFileName(SourceFile), Path.GetFileName(DestinationFile)));
        }
        catch (Exception ex)
        {
            Console.WriteLine(string.Format(ErrorMessage, ex.Message));
        }
    }

    // Метод для обработки ссылок на файлы в начале текста
    private static string ProcessFileLinks(string content, List<string> fileLinks)
    {
        // Регулярное выражение для поиска путей к файлам в начале текста
        // Предполагается, что каждый путь находится на отдельной строке
        var regex = new Regex(@"^((?:[a-zA-Z]:)?(?:[\\/][^\\/:*?""<>|\r\n]+)+\.?\w*)", RegexOptions.Multiline);
        var matches = regex.Matches(content);

        // Если пути найдены, добавляем их в список и удаляем из исходного сообщения
        if (matches.Count > 0)
        {
            foreach (Match match in matches)
            {
                string filePath = match.Groups[1].Value;
                if (File.Exists(filePath))
                {
                    fileLinks.Add(filePath);
                }
            }

            // Удаляем пути к файлам из сообщения
            content = regex.Replace(content, "");

            // Убираем лишние пустые строки в начале
            content = content.TrimStart('\r', '\n');
        }

        return content;
    }
}