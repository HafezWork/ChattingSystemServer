using System.Security.Claims;
using ChatServerMVC.services.DTOs.Message;
using ChatServerMVC.services.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

[ApiController]
[Authorize]
[Route("api/messages")]
public class MessageController : ControllerBase
{
    private readonly IMessageService _message;

    public MessageController(IMessageService message)
    {
        _message = message;
    }
    [HttpGet("{room_id}")]
    public async Task<IActionResult> GetMessages(
        Guid room_id,
        [FromQuery] Guid? last_message_id)
    {
        var userId = Guid.Parse(User.FindFirst(ClaimTypes.NameIdentifier)!.Value);
        var response = await _message.GetMessages(userId, room_id, last_message_id);
        return Ok(new[]
        {
            new MessageResponse
            {
                
            }
        });
    }
}

//private readonly ConnectionRegistry _registry;

//public MessageController(ConnectionRegistry registry)
//{
//    _registry = registry;
//}

//public static void SendMessage(WsClient sender, WsClient recepient, byte[] payload)
//{
//    //var toUser = payload.GetProperty("to").GetString();

//    //var receivers = _registry.ByUser(toUser);
//    //foreach (var r in receivers)
//    //{
//        recepient.Socket.Send(JsonSerializer.Serialize(new
//        {
//            type = "message.receive",
//            from = sender.user.Id,
//            cipherText = payload
//        }));
//    //}
//}

