using ChatServerMVC.services.DTOs.Message;
using Microsoft.AspNetCore.Mvc;

[ApiController]
[Route("api/messages")]
public class MessageController : ControllerBase
{
    [HttpGet]
    public IActionResult GetMessages(
        [FromQuery] string userid,
        [FromQuery] string room_id,
        [FromQuery] string last_message_id = null)
    {
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

