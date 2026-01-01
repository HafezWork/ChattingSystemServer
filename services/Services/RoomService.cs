using System.Security.Policy;
using ChatServerMVC.Domain.Entities;
using ChatServerMVC.Models;
using ChatServerMVC.services.DTOs.Room;
using ChatServerMVC.services.Interfaces;
using Microsoft.EntityFrameworkCore;

namespace ChatServerMVC.services.Services
{
    public class RoomService : IRoomService
    {
        private readonly IDbContextFactory<DataContext> _dbFactory;


        public RoomService(IDbContextFactory<DataContext> dbFactory)
        {
            _dbFactory = dbFactory;
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

            var id = Guid.NewGuid();
            users[0].RoomId = id;
            users[1].RoomId = id;
            _db.Rooms.Add(new RoomModel
            {
                Name = secondUser,
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
        public async Task<RoomModel> GetRoomById(Guid RoomId, Guid UserId)
        {
            await using var _db = await _dbFactory.CreateDbContextAsync();
            var Room = await _db.Rooms
            .Where(r => r.Id == RoomId).FirstAsync();
            if (Room == null)
                return new RoomModel { }; 
            return Room;
        }
    }
}
