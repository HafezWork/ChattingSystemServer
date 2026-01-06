using ChatServerMVC.services.DTOs.Message;

namespace ChatServerMVC.services.Interfaces
{
    public interface IMessageService
    {
        Task<Guid> SaveMessage(Guid user, Guid roomId, byte[] cipherText, byte[] nonce, int keyVersion, DateTime TimeStamp);
        Task<List<MessageResponse>> GetMessages(Guid user, Guid roomId, Guid? lastMessageId);
    }
}
