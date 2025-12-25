using ChatServerMVC.Models;
using Fleck;
using Microsoft.AspNetCore.Connections;
using System.Collections.Concurrent;
using System.Net;
using Newtonsoft.Json;
using static System.Runtime.InteropServices.JavaScript.JSType;
using ChatServerMVC.Controllers;

namespace ChatServerMVC.services
{

    public class WsClient(IWebSocketConnection socket)
    {
        public IWebSocketConnection Socket { get; set; } = socket;
        public ChatServerMVC.Models.UserModel user { get; set; }
        public DateTime LastSeen { get; set; } = DateTime.UtcNow;
    }

    public class WebSocketHandler
    {
        private static ConcurrentDictionary<IWebSocketConnection, WsClient> clients = new();
        private static ConcurrentDictionary<Guid, IWebSocketConnection> sockets = new();
        public static WsClient GetClient(IWebSocketConnection socket)
        {
            return clients[socket];
        }
        public static WsClient[] GetClients()
        {
            return clients.Values.ToArray();
        }
        public static void AddClient(IWebSocketConnection socket, WsClient client)
        {
            clients.TryAdd(socket, client);
        }

        public static void RemoveClient(IWebSocketConnection socket, WsClient client)
        {
            clients.TryRemove(socket, out client);
        }

        async public static void Route(WsClient ctx, string rawMessage)
        {
            MessageModel envelope;

            try
            {
                envelope = JsonConvert.DeserializeObject<MessageModel>(rawMessage);
                
            }
            catch
            {
                await ctx.Socket.Send(JsonConvert.SerializeObject(new
                {
                    type = "error",
                    message = "invalid_json"
                }));
                return;
            }

            switch (envelope.Type)
            {
                case "auth":
                    sockets.TryAdd(envelope.From, ctx.Socket);
                    break;

                case "ping":
                    ctx.LastSeen = DateTime.UtcNow;
                    ctx.Socket.Send("{\"type\":\"pong\"}");
                    break;

                //case "message.send":
                //    RequireAuth(ctx, () => _chat.SendMessage(ctx, envelope.Payload));
                //    break;
                case "send":
                    var RecepientSocket =  sockets[envelope.To];
                    var SenderSocket = sockets[envelope.From];
                    WsClient WsRecepient = new WsClient(RecepientSocket);
                    WsRecepient.user = new UserModel(){ Id=envelope.From,UserName="Recepient"};
                    WsClient WsSender = new WsClient(SenderSocket);
                    WsSender.user = new UserModel() { Id = envelope.To, UserName = "Sender" };

                    MessageController.SendMessage(WsSender, WsRecepient, envelope.CipherText);
                    break;

                //case "typing.start":
                //case "typing.stop":
                //    RequireAuth(ctx, () => _presence.Typing(ctx, envelope.Type, envelope.Payload));
                //    break;

                default:
                    ctx.Socket.Send("{\"type\":\"error\",\"message\":\"unknown_type\"}");
                    break;
            }
        }
    }
}
