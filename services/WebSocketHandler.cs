using ChatServerMVC.Models;
using Fleck;
using Microsoft.AspNetCore.Connections;
using System.Collections.Concurrent;
using System.Net;
using System.Text.Json;
using static System.Runtime.InteropServices.JavaScript.JSType;
using ChatServerMVC.Controllers;
using ChatServerMVC.services.Interfaces;
using static Microsoft.EntityFrameworkCore.DbLoggerCategory.Database;
using System.IO;
using System.Web;
using SuperSocket.ClientEngine;

namespace ChatServerMVC.services
{

    public class WsClient
    {
        public IWebSocketConnection Socket { get; }
        public Guid UserId { get; }

        public WsClient(IWebSocketConnection socket, Guid userId)
        {
            Socket = socket;
            UserId = userId;
        }



        public Task SendAsync(object payload)
        {
            var json = JsonSerializer.Serialize(payload);
            return Socket.Send(json);
        }
    }

    public class WsEnvelope
    {
        public string Type { get; set; } = null!;
        public Guid Id { get; set; }
        public Guid SenderId { get; set; }
        public Guid RoomId { get; set; }
        public string? Ciphertext { get; set; }
        public string? Nonce { get; set; }
        public int? KeyVersion { get; set; }
        public Guid? AfterMessageId { get; set; }
        public DateTime Timestamp { get; set; }
    }


    public class WebSocketHandler
    {
        private readonly IMessageService _messages;
        private readonly IRoomService _rooms;
        private readonly IConnectionRegistry _connections;
        private readonly IAuthService _auth;

        public WebSocketHandler(
       IMessageService messages,
       IRoomService rooms,
       IConnectionRegistry connections,
       IAuthService auth)
        {
            _messages = messages;
            _rooms = rooms;
            _connections = connections;
            _auth = auth;
        }

        public void Start()
        {
            var wsServer = new WebSocketServer("ws://0.0.0.0:8181")
            {
                RestartAfterListenError = true
            };

            wsServer.Start(socket =>
            {
                WsClient? ctx = null;

                socket.OnOpen = () =>
                {

                    var uri = socket.ConnectionInfo;
                    var query = HttpUtility.ParseQueryString(uri.Path);
                    var client = query.GetValue("/?access_token");
                    if (client == null)
                    {
                        socket.Close();
                        return;
                    }
                    var token = client;
                    try
                    {
                        var userId = _auth.ValidateToken(token);
                        ctx = new WsClient(socket, userId.Result);
                        _connections.Add(userId.Result, ctx);
                    }
                    catch
                    {
                        socket.Close();
                    }
                };

                socket.OnClose = () =>
                {
                    if (ctx != null)
                        _connections.Remove(ctx.UserId);
                };

                socket.OnMessage = async message =>
                {
                    if (ctx == null) return;
                    await Route(ctx, message);
                };
            });
        }
        private async Task Route(WsClient ctx, string message)
        {
            var envelope = JsonSerializer.Deserialize<WsEnvelope>(message);
            if (envelope == null) return;

            switch (envelope.Type)
            {
                case "send":
                    await HandleSendMessage(ctx, envelope);
                    break;

                case "fetch":
                    await HandleFetchMessages(ctx, envelope);
                    break;
            }
        }

        private async Task HandleSendMessage(WsClient sender, WsEnvelope msg)
        {
            await _messages.SaveMessage(
                sender.UserId,
                msg.RoomId,
                Convert.FromBase64String(msg.Ciphertext!),
                Convert.FromBase64String(msg.Nonce!),
                msg.KeyVersion!.Value,
                msg.Timestamp
            );

            var members = await _rooms.GetRoomMembers(msg.RoomId);
            foreach (var userId in members)
            {
                if (userId == msg.SenderId)
                    continue;
                if (_connections.TryGet(userId, out var client))
                {
                    try
                    {
                        await client.SendAsync(msg);
                    }
                    catch
                    {
                        _connections.Remove(userId);
                    }
                }
            }
        }

        private async Task HandleFetchMessages(WsClient client, WsEnvelope msg)
        {
            var messages = await _messages.GetMessages(client.UserId, msg.RoomId, msg.AfterMessageId);

            foreach (var m in messages)
            {
                await client.SendAsync(new WsEnvelope
                {
                    Id = m.MessageId,
                    SenderId = m.SenderId,
                    Type = "send_message",
                    RoomId = msg.RoomId,
                    Ciphertext = m.EncText,
                    Nonce = m.Nonce,
                    KeyVersion = 1,
                    Timestamp = m.Timestamp
                });
            }
        }
    }
}
