using System.Security.Policy;
using ChatServerMVC.Domain.Entities;
using ChatServerMVC.Models;
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

            var allMembers = users.Append(creator).Distinct();

            _db.RoomMembers.AddRange(allMembers.Select(uid => new RoomMemberModel
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

        public async Task<Guid> CreateDM(Guid firstUser, Guid secondUser, List<(Guid, byte[])> encryptionKeys)
        {
            await using var _db = await _dbFactory.CreateDbContextAsync();
            var existing = await _db.Rooms
            .Include(r => r.Users)
            .FirstOrDefaultAsync(r =>
                r.Users.Any(m => m.UserId == firstUser) &&
                r.Users.Any(m => m.UserId == secondUser));

            if (existing != null) return existing.Id;
            var firstMember = new RoomMemberModel { UserId = firstUser };
            var secondMember = new RoomMemberModel() { UserId = secondUser };

            var users = new List<RoomMemberModel>() { firstMember, secondMember };

            var id = Guid.NewGuid();
            users[0].RoomId = id;
            users[1].RoomId = id;
            _db.Rooms.Add(new RoomModel
            {
                Name = "blabla",
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

        public async Task<List<Guid>> GetRooms(Guid User)
    {
            await using var _db = await _dbFactory.CreateDbContextAsync();
            var Rooms = await _db.RoomMembers
            .Where(r => r.UserId == User).Select(r => r.RoomId).ToListAsync();
            return Rooms;

        }
        public async Task<List<Guid>> GetRoomMembers(Guid RoomId)
        {
            await using var _db = await _dbFactory.CreateDbContextAsync();
            var Members = await _db.RoomMembers
            .Where(r => r.RoomId == RoomId).Select(r => r.UserId).ToListAsync();
            return Members;
        }
    }
}
