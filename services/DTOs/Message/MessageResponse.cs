namespace ChatServerMVC.services.DTOs.Message
{
    public class MessageResponse
    {
        public Guid MessageId { get; set; }
        public Guid SenderId { get; set; }
        public string EncText { get; set; }
        public string Nonce { get; set; }
        public DateTime Timestamp { get; set; }
    }

}
