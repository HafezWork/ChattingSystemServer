namespace ChatServerMVC.Models
{
    public class MessageModel
    {
        public Guid MessageId { get; set; }
        public Guid From { get; set; }
        public UserModel User { get; set; }
        public RoomModel To { get; set; }
        public Guid RoomId { get; set; }

// public string Type { get; set; }
        public byte[] CipherText { get; set; }
        public byte[] Nonce { get; set; }
        public int KeyVersion { get; set; }
        public DateTime CreatedAt { get; set; }

    }
}
