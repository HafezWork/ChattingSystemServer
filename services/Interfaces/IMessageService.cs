using ChatServerMVC.services.DTOs.Message;

namespace ChatServerMVC.services.Interfaces
{
    public interface IMessageService
    {
        Task SaveMessage(Guid user, Guid roomId, byte[] cipherText, byte[] nonce, int keyVersion);
        Task<List<MessageResponse>> GetMessages(Guid user, Guid roomId, Guid? lastMessageId);
    }
}
