using ChatServerMVC.Models;
using ChatServerMVC.services.Interfaces;

namespace ChatServerMVC.services.Services
{
    public class KeyService : IKeyService
    {
        private readonly DataContext _db;


        public KeyService(DataContext db)
        {
            _db = db;
        }
        public Task<byte[]> GetKey(Guid UserId, Guid RoomId)
    {
            EncryptionKeyModel key = _db.EncryptionKeys.First(e => e.UserId == UserId && e.RoomId == RoomId);
            return Task.FromResult(key.Key);
        }
    }
}
