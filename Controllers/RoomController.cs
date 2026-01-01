using System.Security.Claims;
using ChatServerMVC.services.DTOs.Room;
using ChatServerMVC.services.Interfaces;
using ChatServerMVC.services.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

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
            var roomId = await _rooms.CreateRoom(
                request.Name,
                userId,
                request.Users,
                request.EncryptionKeys.Select(k =>
                (k.UserId, k.Key)
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
                (k.UserId, k.Key)
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

        //    [HttpGet("{roomId}")]
        //    [Authorize]
        //    public async Task<IActionResult> GetRoomById(Guid roomId)
        //    {
        //        var userId = Guid.Parse(User.FindFirst(ClaimTypes.NameIdentifier)!.Value);

        //        var room = await _rooms.GetRoomById(roomId, userId);

        //        if (room == null)
        //        {
        //            return NotFound(new { message = "Room not found" });
        //        }

        //        // Map to DTO
        //        var roomDto = new RoomDto
        //        {
        //            Id = room.Id,
        //            Name = room.Name,
        //            CreatedBy = room.CreatedBy,
        //            CreatedAt = room.CreatedAt,
        //            Users = room.Users.Select(u => u.UserId).ToList(),
        //            Messages = room.Messages.OrderByDescending(m => m.CreatedAt).Take(10).Select(m => new MessageDto
        //            {
        //                Content = m.Content,
        //                EncText = m.EncText,
        //                Nonce = m.Nonce,
        //                CreatedAt = m.CreatedAt,
        //                SenderId = m.SenderId
        //            }).ToList()
        //        };

        //        return Ok(roomDto);
        //    }
        //}
    }
}
