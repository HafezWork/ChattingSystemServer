using ChatServerMVC.Models;
using ChatServerMVC.services.Interfaces;
using Microsoft.EntityFrameworkCore;

namespace ChatServerMVC.services.Services
{
    public class KeyService : IKeyService
    {
        private readonly IDbContextFactory<DataContext> _dbFactory;

        public KeyService(IDbContextFactory<DataContext> dbFactory)
        {
            _dbFactory = dbFactory;
        }
        public async Task<byte[]> GetKey(Guid UserId, Guid RoomId)
    {
            await using var _db = await _dbFactory.CreateDbContextAsync();
            EncryptionKeyModel key = _db.EncryptionKeys.First(e => e.UserId == UserId && e.RoomId == RoomId);
            return key.Key;
        }
    }
}
