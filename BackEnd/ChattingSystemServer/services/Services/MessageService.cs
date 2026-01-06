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
        public async Task<Guid> SaveMessage(Guid user, Guid roomId, byte[] cipherText, byte[] nonce, int keyVersion, DateTime TimeStamp)
        {

            await using var _db = await _dbFactory.CreateDbContextAsync();
            var messageId = Guid.NewGuid();
            _db.Messages.Add(new MessageModel
            {
                MessageId = messageId,
                RoomId = roomId,
                CipherText = cipherText,
                Nonce = nonce,
                KeyVersion = keyVersion,
                From = user,
                CreatedAt = TimeStamp
            });
            _db.SaveChanges();
            return messageId;
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
            var last = await _db.Messages.FindAsync(lastMessageId.Value);
            if (last != null)
            {
                var lastMessage = last.CreatedAt;
                query = (IOrderedQueryable<MessageModel>)query.Where(m => m.CreatedAt > lastMessage);
            }
            

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


    }
}
