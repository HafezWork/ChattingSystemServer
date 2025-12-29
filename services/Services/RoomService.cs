using System.Security.Policy;
using ChatServerMVC.Models;
using ChatServerMVC.services.Interfaces;
using Microsoft.EntityFrameworkCore;

namespace ChatServerMVC.services.Services
{
    public class RoomService : IRoomService
    {
        private readonly DataContext _db;


        public RoomService(DataContext db)
        {
            _db = db;
        }
        public Task<Guid> CreateRoom(string name, Guid creator, List<Guid> users, List<(Guid, byte[])> encryptionKeys)
        {
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
            return Task.FromResult(room.Id);
        }

        public Task<Guid> CreateDM(Guid firstUser, Guid secondUser, List<(Guid, byte[])> encryptionKeys)
        {
            var existing = _db.Rooms
            .Include(r => r.Users)
            .FirstOrDefaultAsync(r =>
                r.Users.Any(m => m.UserId == firstUser) &&
                r.Users.Any(m => m.UserId == secondUser));

            if (existing != null) return Task.FromResult(existing.Result.Id);
            var firstMember = new RoomMemberModel { UserId = firstUser };
            var secondMember = new RoomMemberModel() { UserId = secondUser };

            var users = new List<RoomMemberModel>() { firstMember, secondMember };

            var id = Guid.NewGuid();
            users[0].RoomId = id;
            users[1].RoomId = id;
            _db.Rooms.Add(new RoomModel
            {
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
            return Task.FromResult(id);
        }

        public Task<List<Guid>> GetRooms(Guid User)
    {
            var Rooms = _db.RoomMembers
            .Where(r => r.UserId == User).Select(r => r.RoomId).ToList();
            return Task.FromResult(new List<Guid>());

        }
    }
}
