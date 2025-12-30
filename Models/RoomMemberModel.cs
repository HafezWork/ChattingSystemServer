using System.ComponentModel.DataAnnotations.Schema;

namespace ChatServerMVC.Models
{
    [Table("RoomMembers")]
    public class RoomMemberModel
    {
        public Guid Id { get; set; }
        public Guid RoomId { get; set; }
        public RoomModel Room { get; set; }
        public Guid UserId { get; set; }
        public UserModel User { get; set; }
        public DateTime Timestamp { get; set; } = DateTime.UtcNow;
    }
}
