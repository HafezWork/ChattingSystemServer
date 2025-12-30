using System.Security.Claims;
using ChatServerMVC.services.DTOs.Room;
using ChatServerMVC.services.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;

namespace ChatServerMVC.Controllers
{
    [ApiController]
    [Authorize]
    [Route("api/rooms")]
    public class RoomController : ControllerBase
    {
        private readonly IRoomService _rooms;

        public RoomController(IRoomService rooms)
        {
            _rooms = rooms;
        }

        [HttpPost("room")]

        public async Task<IActionResult> CreateRoom(CreateRoomRequest request)
        {
            var userId = Guid.Parse(User.FindFirst(ClaimTypes.NameIdentifier)!.Value);
            var roomId =  await _rooms.CreateRoom(
                request.Name,
                userId,
                request.Users,
                request.EncryptionKeys.Select(k =>
                (k.Item1, k.Item2)
                ).ToList()
);
            return Ok(new CreateRoomResponse
            {
                RoomID = roomId
            }); 
        }

        [HttpPost("directMessage")]
        public async Task<IActionResult> CreateDM([FromBody] CreateDMRequest request)
        {
            var userId = Guid.Parse(User.FindFirst(ClaimTypes.NameIdentifier)!.Value);
            var roomId = await _rooms.CreateDM(
                userId,
                request.SecondUser,
                request.Keys.Select(k =>
                (k.Item1, k.Item2)
                ).ToList()
);
            return Ok(new CreateDMResponse
            {
                DMId = roomId
            });
        }

        [HttpGet]
        public async Task<IActionResult> GetRooms()
        {
            var userId = Guid.Parse(User.FindFirst(ClaimTypes.NameIdentifier)!.Value);
            var rooms = await _rooms.GetRooms(userId);
            return Ok(rooms);
        }
    }
}
