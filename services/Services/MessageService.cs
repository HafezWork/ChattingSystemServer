using System.Diagnostics.Metrics;
using ChatServerMVC.Models;
using ChatServerMVC.services.DTOs.Message;
using ChatServerMVC.services.Interfaces;
using Microsoft.EntityFrameworkCore;

namespace ChatServerMVC.services.Services
{
    public class MessageService : IMessageService
    {
        private readonly IDbContextFactory<DataContext> _dbFactory;


        public MessageService(IDbContextFactory<DataContext> dbFactory)
        {
            _dbFactory = dbFactory;
        }
        public async Task SaveMessage(Guid user, Guid roomId, byte[] cipherText, byte[] nonce, int keyVersion)
        {

            await using var _db = await _dbFactory.CreateDbContextAsync();
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
            return;
        }

        public async Task<List<MessageResponse>> GetMessages(Guid user, Guid roomId, Guid? lastMessageId)
        {
            await using var _db = await _dbFactory.CreateDbContextAsync();
            if (!_db.RoomMembers.Any(m => m.UserId == user && m.RoomId == roomId))
            {
                return new List<MessageResponse>();
            }
            var query = _db.Messages.Where(m => m.RoomId == roomId).OrderBy(m => m.CreatedAt);
            if (query.Count() == 0)
            {
                return new List<MessageResponse>();
            }
            if (lastMessageId == null)
            {
                return await query.Select(m => new MessageResponse
                {   
                    MessageId = m.MessageId,
                    SenderId = m.From,
                    EncText = Convert.ToBase64String(m.CipherText),
                    Nonce = Convert.ToBase64String(m.Nonce),
                    //m.KeyVersion,
                    Timestamp = m.CreatedAt
                }).ToListAsync();
            }
            var last = _db.Messages.FindAsync(lastMessageId.Value);
            var lastMessage = last.Result.CreatedAt;
            var queryLast = query.Where(m => m.CreatedAt > lastMessage);

            return await queryLast.Select(m => new MessageResponse
            {
                MessageId = m.MessageId,
                SenderId = m.From,
                EncText = Convert.ToBase64String(m.CipherText),
                Nonce = Convert.ToBase64String(m.Nonce),
                //m.KeyVersion,
                Timestamp = m.CreatedAt
            }).ToListAsync();
        }


    }
}
