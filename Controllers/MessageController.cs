using System.Text.Json;
using ChatServerMVC.services;
using Microsoft.AspNetCore.Connections;
using Microsoft.AspNetCore.Mvc;

// For more information on enabling Web API for empty projects, visit https://go.microsoft.com/fwlink/?LinkID=397860

namespace ChatServerMVC.Controllers
{
    public class MessageController
    {
        //private readonly ConnectionRegistry _registry;

        //public MessageController(ConnectionRegistry registry)
        //{
        //    _registry = registry;
        //}

        public static void SendMessage(WsClient sender, WsClient recepient, byte[] payload)
        {
            //var toUser = payload.GetProperty("to").GetString();

            //var receivers = _registry.ByUser(toUser);
            //foreach (var r in receivers)
            //{
                recepient.Socket.Send(JsonSerializer.Serialize(new
                {
                    type = "message.receive",
                    from = sender.user.Id,
                    cipherText = payload
                }));
            //}
        }
    }
}
