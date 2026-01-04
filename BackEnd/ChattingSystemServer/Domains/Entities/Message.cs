using System;

namespace ChatServerMVC.Domain.Entities
{
    public class Message
    {
        public string MessageId { get; set; } = Guid.NewGuid().ToString();
        public Guid RoomId { get; set; }
        public Guid SenderUid { get; set; }
        public string CipherText { get; set; } = "DUMMY_ENCRYPTED_MESSAGE";
        public string Iv { get; set; } = "DUMMY_IV";
        public string AuthTag { get; set; } = "DUMMY_TAG";
        public DateTime Timestamp { get; set; } = DateTime.UtcNow;

        public Message(Guid roomId, Guid senderUid)
        {
            RoomId = roomId;
            SenderUid = senderUid;
        }
    }
}
