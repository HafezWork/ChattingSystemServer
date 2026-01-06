using System.Security.Policy;
using ChatServerMVC.Domain.Entities;
using ChatServerMVC.Models;
using ChatServerMVC.services.DTOs.Room;
using ChatServerMVC.services.Interfaces;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;

namespace ChatServerMVC.services.Services
{
    public class RoomService : IRoomService
    {
        private readonly IDbContextFactory<DataContext> _dbFactory;
        private readonly WebSocketHandler _webSocketHandler;


        public RoomService(IDbContextFactory<DataContext> dbFactory, WebSocketHandler webSocketHandler)
        {
            _dbFactory = dbFactory;
            _webSocketHandler = webSocketHandler;
        }
        public async Task<Guid> CreateRoom(string name, Guid creator, List<Guid> users, List<(Guid, byte[])> encryptionKeys)
        {
            await using var _db = await _dbFactory.CreateDbContextAsync();
            var room = new RoomModel
            {
                Id = Guid.NewGuid(),
                Name = name,
                CreatedBy = creator,
                CreatedAt = DateTime.UtcNow
            };

            _db.Rooms.Add(room);
            List<Guid> userIds = new List<Guid>();
            userIds.Add(creator);
            foreach (var user in users)
            {
                var temp = await _db.Users.FirstOrDefaultAsync(u => u.Id == user);
                if (temp != null)
                {
                    userIds.Add(temp.Id);
                }
            }


            _db.RoomMembers.AddRange(userIds.Select(uid => new RoomMemberModel
            {
                RoomId = room.Id,
                UserId = uid,
            }));

            _db.EncryptionKeys.AddRange(encryptionKeys.Select(uid => new EncryptionKeyModel
            {
                Key = uid.Item2,
                RoomId = room.Id,
                UserId = uid.Item1
            }
            ));
            _db.SaveChanges();
            var notification = new
            {
                Type = "room_created",
                RoomId = room.Id,
                Name = name,
                CreatedBy = creator
            };
            foreach (var userId in userIds)
            {
                await _webSocketHandler.SendToUser(userId, notification);
            }

            return room.Id;
        }

        public async Task<Guid> CreateDM(Guid firstUser, string secondUser, List<(Guid, byte[])> encryptionKeys)
        {
            await using var _db = await _dbFactory.CreateDbContextAsync();

            var secUser = await _db.Users.FirstOrDefaultAsync(u => u.UserName == secondUser);
            if (secUser == null)
                throw new Exception("user is not found!");
            if (secUser.Id == firstUser)
                throw new Exception("you can't create dm with yourself");
            var existing = await _db.Rooms
            .Include(r => r.Users)
            .FirstOrDefaultAsync(r =>
                r.Users.Any(m => m.UserId == firstUser) &&
                r.Users.Any(m => m.User.UserName == secondUser));

            if (existing != null) return existing.Id;
            var firstMember = new RoomMemberModel { UserId = firstUser };
            var secondMember = new RoomMemberModel() { UserId = secUser.Id };

            var users = new List<RoomMemberModel>() { firstMember, secondMember };
            string name = $"{firstUser}-{secUser.Id}";
            var id = Guid.NewGuid();
            users[0].RoomId = id;
            users[1].RoomId = id;
            _db.Rooms.Add(new RoomModel
            {
                Name = name,
                Id = id,
                CreatedAt = DateTime.Now,
                CreatedBy = firstUser,
                Users = users,
            });
            _db.RoomMembers.AddRange(users);

            _db.EncryptionKeys.AddRange(encryptionKeys.Select(uid => new EncryptionKeyModel
            {
                Key = uid.Item2,
                RoomId = id,
                UserId = uid.Item1
            }
            ));
            _db.SaveChanges();
            var notification = new
            {
                Type = "room_created",
                RoomId = id,
                Name = name,
                CreatedBy = firstUser
            };
            await _webSocketHandler.SendToUser(secUser.Id, notification);
            await _webSocketHandler.SendToUser(firstUser, notification);
            return id;
        }

        public async Task<List<GetRoomsResponse>> GetRooms(Guid User)
        {
            await using var _db = await _dbFactory.CreateDbContextAsync();
            var rooms = await _db.Rooms
                    .Include(r => r.Users)
                    .Include(r => r.Messages.OrderByDescending(m => m.CreatedAt).Take(1))
                    .Where(r => r.Users.Any(u => u.UserId == User))
                    .OrderByDescending(r => r.Messages.Max(m => (DateTime?)m.CreatedAt) ?? r.CreatedAt)
                    .ToListAsync();

            return rooms.Select(room => new GetRoomsResponse
            {
                Id = room.Id,
                Name = room.Name,
                CreatedBy = room.CreatedBy,
                CreatedAt = room.CreatedAt,
                ParticipantCount = room.Users.Count,
                IsGroupChat = room.Users.Count > 2,
                LastMessage = room.Messages
                    .OrderByDescending(m => m.CreatedAt)
                    .FirstOrDefault()?.CipherText.ToString() ?? "",
                LastMessageTime = room.Messages
                    .OrderByDescending(m => m.CreatedAt)
                    .FirstOrDefault()?.CreatedAt,
                UnreadCount = 0
            }).ToList();

        }
        public async Task<List<Guid>> GetRoomMembers(Guid RoomId)
        {
            await using var _db = await _dbFactory.CreateDbContextAsync();
            var Members = await _db.RoomMembers
            .Where(r => r.RoomId == RoomId).Select(r => r.UserId).ToListAsync();
            return Members;
        }
        public async Task<GetRoomInfoResponse?> GetRoomById(Guid RoomId, Guid UserId)
        {
            await using var _db = await _dbFactory.CreateDbContextAsync();
            var room = await _db.Rooms
                .Include(r => r.Users)
                    .ThenInclude(rm => rm.User)
                .Where(r => r.Id == RoomId && r.Users.Any(u => u.UserId == UserId))
                .FirstOrDefaultAsync();

            if (room == null)
                return null;

            return new GetRoomInfoResponse
            {
                Id = room.Id,
                Name = room.Name,
                CreatedBy = room.CreatedBy,
                CreatedAt = room.CreatedAt,
                Users = room.Users.Select(u => new RoomUserInfo
                {
                    UserId = u.UserId,
                    Username = u.User.UserName
                }).ToList()
            };
        }
        public async Task AddtoRoom(Guid creator, Guid roomId, List<Guid> users, List<(Guid, byte[])> encryptionKeys)
        {
            await using var _db = await _dbFactory.CreateDbContextAsync();

            var found = await _db.Rooms.AnyAsync(r => r.Id == roomId);
            if (!found)
                throw new Exception("Room not found");
            var room = await _db.Rooms.FirstOrDefaultAsync(r => r.Id == roomId);

            var authorized = await _db.Rooms.AnyAsync(r => r.Id == roomId && r.CreatedBy == creator);
            if (!authorized)
                throw new Exception("You are not authorized to add users to this room");

            List<Guid> userIds = new List<Guid>();
            foreach (var user in users)
            {
                var temp = await _db.Users.FirstOrDefaultAsync(u => u.Id == user);
                if (temp != null)
                {
                    userIds.Add(temp.Id);
                }
            }


            _db.RoomMembers.AddRange(userIds.Select(uid => new RoomMemberModel
            {
                RoomId = roomId,
                UserId = uid,
            }));

            _db.EncryptionKeys.AddRange(encryptionKeys.Select(uid => new EncryptionKeyModel
            {
                Key = uid.Item2,
                RoomId = roomId,
                UserId = uid.Item1
            }
            ));
            _db.SaveChanges();
            var notification = new
            {
                Type = "room_created",
                RoomId = roomId,
                Name = room.Name,
                CreatedBy = creator
            };
            foreach (var userId in userIds)
            {
                await _webSocketHandler.SendToUser(userId, notification);
            }
            return;
        }
    }
}

