using ChatServerMVC.services.DTOs.Room;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;

namespace ChatServerMVC.Controllers
{
    [Route("api/[controller]")]
    public class RoomController : ControllerBase
    {
        [HttpPost("createroom")]

        public IActionResult CreateRoom(CreateRoomRequest request)
        {
            return Ok(new CreateRoomResponse
            {
              
            });
// Create Room

            
        }
    }
}
