using System.Security.Claims;
using ChatServerMVC.Domain.Entities;
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

        [HttpGet("{roomId}")]
        public async Task<IActionResult> GetRoomById(Guid roomId)
        {
            var userId = Guid.Parse(User.FindFirst(ClaimTypes.NameIdentifier)!.Value);

            var room = await _rooms.GetRoomById(roomId, userId);

            if (room == null)
            {
                return NotFound(new { message = "Room not found or you are not a member" });
            }

            return Ok(room);
        }

        [HttpPost("{roomId}/members")]
        public async Task<IActionResult> AddMember(Guid roomId, [FromBody] AddMemberRequest request)
        {
            var userId = Guid.Parse(User.FindFirst(ClaimTypes.NameIdentifier)!.Value);
            await _rooms.AddtoRoom(
                userId,
                roomId,
                request.Users,
                request.EncryptionKeys.Select(k =>
                (k.UserId, k.Key)
                ).ToList()
            );
            return Ok(new { message = "Members added successfully", roomId });
        }
    }
}
