namespace ChatServerMVC.services.DTOs.Message
{
    public class MessageResponse
    {
        public string MessageId { get; set; }
        public string SenderId { get; set; }
        public string EncText { get; set; }
        public string Nonce { get; set; }
        public DateTime Timestamp { get; set; }
    }

}
