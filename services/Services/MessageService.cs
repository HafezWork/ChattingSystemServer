using System.Diagnostics.Metrics;
using ChatServerMVC.Models;
using ChatServerMVC.services.Interfaces;
using Microsoft.EntityFrameworkCore;

namespace ChatServerMVC.services.Services
{
    public class MessageService : IMessageService
    {
        private readonly DataContext _db;


        public MessageService(DataContext db)
        {
            _db = db;
        }
        public Task SaveMessage(Guid user, Guid roomId, byte[] cipherText, byte[] nonce, int keyVersion)
        {
            _db.Messages.Add(new MessageModel
            {
                MessageId = Guid.NewGuid(),
                RoomId = roomId,
                CipherText = cipherText,
                Nonce = nonce,
                KeyVersion = keyVersion,
                From = user
            });
            _db.SaveChanges();
            return Task.CompletedTask;
        }

        public Task<List<object>> GetMessages(Guid user, Guid roomId, Guid? lastMessageId)
        {
            if (!_db.Messages.Any(m => m.From == user && m.RoomId == roomId))
            {
                throw new Exception("user is not enrolled in room!");
            }
            var query = _db.Messages.Where(m => m.RoomId == roomId).OrderBy(m => m.CreatedAt);
            if (query.Count() == 0)
            {
                return Task.FromResult(new List<object>());
            }
            if (lastMessageId == null)
            {
                return query.Select(m => new
                {
                    m.MessageId,
                    m.From,
                    ciphertext = Convert.ToBase64String(m.CipherText),
                    nonce = Convert.ToBase64String(m.Nonce),
                    m.KeyVersion,
                    m.CreatedAt
                }).Cast<object>().ToListAsync();
            }
            var last = _db.Messages.FindAsync(lastMessageId.Value);
            var lastMessage = last.Result.CreatedAt;
            var queryLast = query.Where(m => m.CreatedAt > lastMessage);

            return queryLast.Select(m => new
            {
                m.MessageId,
                m.From,
                ciphertext = Convert.ToBase64String(m.CipherText),
                nonce = Convert.ToBase64String(m.Nonce),
                m.KeyVersion,
                m.CreatedAt
            }).Cast<object>().ToListAsync();
        }


    }
}
