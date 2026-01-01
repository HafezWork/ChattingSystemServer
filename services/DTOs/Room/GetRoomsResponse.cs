namespace ChatServerMVC.services.DTOs.Room
{
    public class GetRoomsResponse
    {
        public Guid Id { get; set; }
        public string Name { get; set; }
        public Guid CreatedBy { get; set; }
        public DateTime CreatedAt { get; set; }
        public int ParticipantCount { get; set; }
        public bool IsGroupChat { get; set; }
        public string LastMessage { get; set; }
        public DateTime? LastMessageTime { get; set; }
        public int UnreadCount { get; set; }
    }
}
