using System;

public class ConnectionManager
{
    private bool isConnected = false;

    public void Connect()
    {
        if (!isConnected)
        {
            // Логика подключения
            Console.WriteLine("Connecting...");
            isConnected = true;
        }
    }

    public void Disconnect()
    {
        if (isConnected)
        {
            // Логика отключения
            Console.WriteLine("Disconnecting...");
            isConnected = false;
        }
    }
} 