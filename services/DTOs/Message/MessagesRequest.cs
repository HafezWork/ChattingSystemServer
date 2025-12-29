namespace ChatServerMVC.services.DTOs.Message
{
    public class GetMessagesRequest
    {
        public string UserId { get; set; }
        public string RoomId { get; set; }
        public string LastMessageId { get; set; }
    }

}
