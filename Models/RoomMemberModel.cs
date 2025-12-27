namespace ChatServerMVC.Models
{
    public class RoomMemberModel
    {
        public Guid RoomId { get; set; }
        public RoomModel Room { get; set; }
        public Guid UserId { get; set; }
        public UserModel User { get; set; }
        public DateTime Timestamp { get; set; }
    }
}
