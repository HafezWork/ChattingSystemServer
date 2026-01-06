namespace ChatServerMVC.services.DTOs.Room
{
    public class GetRoomInfoResponse
    {
        public Guid Id { get; set; }
        public string Name { get; set; } = string.Empty;
        public Guid CreatedBy { get; set; }
        public DateTime CreatedAt { get; set; }
        public List<RoomUserInfo> Users { get; set; } = new();
    }

    public class RoomUserInfo
    {
        public Guid UserId { get; set; }
        public string Username { get; set; } = string.Empty;
    }
}
