namespace ChatServerMVC.Models
{
    public class MessageModel
    {
        public Guid Id { get; set; }
        public Guid From { get; set; }
        public Guid To { get; set; }
        public string Type { get; set; }
        public byte[] CipherText { get; set; }
        public DateTime Timestamp { get; set; }
    }
}
